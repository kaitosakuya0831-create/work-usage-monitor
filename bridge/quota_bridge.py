"""Local-only bridge between Chrome Usage UI observer and safe recovery hook.

Requires Python 3.10+ and only the standard library. No ChatGPT login, APIs,
or browser automation. Defaults to event logging only (no hook execution).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hmac
import json
import re
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOME = Path(os.getenv("LOCALAPPDATA") or Path.home()) / "ChariLabQuotaBridge"
PORT = 8765
GUARD = threading.Lock()
JST = dt.timezone(dt.timedelta(hours=9))


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def is_number(value) -> bool:
    return type(value) is int


def validate_snapshot(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("root must be object")
    output = {}
    for key in ("five_hour", "weekly"):
        window = payload.get(key)
        if not isinstance(window, dict):
            raise ValueError("missing " + key)
        percent, minutes = window.get("remaining_percent"), window.get("reset_minutes")
        if not is_number(percent) or not 0 <= percent <= 100:
            raise ValueError("invalid percentage")
        if not is_number(minutes) or not 0 <= minutes <= 12 * 24 * 60:
            raise ValueError("invalid countdown")
        output[key] = {"remaining_percent": percent, "reset_minutes": minutes}
    return output


def parse_timestamp(value):
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError, AttributeError):
        return None


def recovery_detected(previous: dict | None, new: dict, observed_at: dt.datetime) -> tuple[bool, str]:
    """Conservative evidence check: must have an observed *new* high allowance.

    A clock passing an estimated reset time does NOT count as observed recovery.
    """
    if not previous:
        return False, "NO_BASELINE"
    old = previous.get("five_hour", {})
    fresh = new["five_hour"]
    if new["weekly"]["remaining_percent"] < 20:
        return False, "WEEKLY_LOW"
    age = observed_at - (parse_timestamp(previous.get("observed_at")) or observed_at)
    if age < dt.timedelta(seconds=0) or age > dt.timedelta(hours=10):
        return False, "PREVIOUS_STALE"
    if fresh["remaining_percent"] < 70 or fresh["reset_minutes"] < 90:
        return False, "NOT_RECOVERED"
    if old.get("remaining_percent", 101) > 25:
        return False, "PREVIOUS_NOT_LOW"
    if fresh["remaining_percent"] - old.get("remaining_percent", 100) < 40:
        return False, "NO_MEANINGFUL_INCREASE"
    old_reset = parse_timestamp(previous.get("reset_at"))
    new_reset = observed_at + dt.timedelta(minutes=fresh["reset_minutes"])
    if not old_reset or new_reset - old_reset < dt.timedelta(minutes=90):
        return False, "RESET_NOT_ADVANCED"
    if observed_at < old_reset - dt.timedelta(minutes=10):
        return False, "OLD_RESET_NOT_REACHED"
    return True, "RECOVERED_OBSERVED"


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".quota-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def log_event(record: dict) -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    with (HOME / "events.jsonl").open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(record, ensure_ascii=False) + "\n")


def ensure_token() -> str:
    HOME.mkdir(parents=True, exist_ok=True)
    path = HOME / "bridge.token"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(32), encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


def process_snapshot(payload: dict, when: dt.datetime, enable_hook: bool = False) -> dict:
    validated = validate_snapshot(payload)
    with GUARD:
        state_path = HOME / "state.json"
        prior = load_json(state_path)
        current = {**validated, "observed_at": when.isoformat(),
                   "reset_at": (when + dt.timedelta(minutes=validated["five_hour"]["reset_minutes"])).isoformat()}
        recovered, reason = recovery_detected(prior, current, when)
        prev_event = parse_timestamp((prior or {}).get("last_event_at"))
        if recovered and prev_event and when - prev_event < dt.timedelta(hours=2):
            recovered, reason = False, "COOLDOWN"
        if recovered:
            current["last_event_at"] = when.isoformat()
        elif prior and prior.get("last_event_at"):
            current["last_event_at"] = prior["last_event_at"]
        atomic_json(state_path, current)
        if recovered:
            log_event({"type": "RECOVERY_OBSERVED", "timestamp_jst": when.astimezone(JST).isoformat(),
                       "five_hour_pct": validated["five_hour"]["remaining_percent"],
                       "weekly_pct": validated["weekly"]["remaining_percent"],
                       "hook_enabled": enable_hook})
            if enable_hook:
                hook = Path(__file__).with_name("on_recovered.ps1")
                try:
                    # Fixed local file ONLY; does not launch or automate ChatGPT Work.
                    subprocess.Popen(["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(hook)],
                                     cwd=hook.parent, close_fds=True)
                except Exception as exc:
                    log_event({"type": "HOOK_FAILED", "reason": str(exc), "timestamp": when.isoformat()})
        return {"ok": True, "recovered": recovered, "reason": reason,
                "observed_jst": when.astimezone(JST).isoformat()}


def make_handler(token: str, enable_hook: bool):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            return  # avoid logging tokens or user data

        def respond(self, status: int, data: dict):
            raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path == "/health":
                return self.respond(200, {"ok": True, "local_only": True})
            if self.path == "/extension-version":
                # No authentication material; read-only local update signal.
                v = load_json(HOME / "installed_extension_version.json")
                version = v.get("version") if isinstance(v, dict) else None
                if not isinstance(version, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
                    return self.respond(200, {"version": None})
                return self.respond(200, {"version": version})
            return self.respond(404, {"ok": False})

        def do_POST(self):
            if self.path != "/snapshot":
                return self.respond(404, {"ok": False})
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                return self.respond(401, {"error": "unauthorized"})
            try:
                n = int(self.headers.get("Content-Length", "0"))
                if not 1 <= n <= 4096:
                    return self.respond(413, {"error": "payload_size"})
                payload = json.loads(self.rfile.read(n))
                result = process_snapshot(payload, now_utc(), enable_hook)
            except (ValueError, json.JSONDecodeError) as err:
                return self.respond(400, {"error": str(err)})
            except Exception:
                return self.respond(500, {"error": "internal_error"})
            return self.respond(200, result)
    return Handler


def main():
    parser = argparse.ArgumentParser(description="ChariLab local usage monitor (no Work automation)")
    parser.add_argument("--setup", action="store_true", help="Create and show local storage paths")
    parser.add_argument("--show-token", action="store_true", help="Print local auth token in current terminal")
    parser.add_argument("--serve", action="store_true", help="Start loopback-only server")
    parser.add_argument("--enable-hook", action="store_true", help="Run fixed on_recovered.ps1 on observed recovery")
    args = parser.parse_args()
    token = ensure_token()
    if args.setup:
        print("Storage:", HOME)
        print("Token file:", HOME / "bridge.token")
        print("Default behavior: record only. Local hook is disabled unless --enable-hook is used.")
    if args.show_token:
        print(token)
    if args.serve:
        print(f"[ChariLab] listening on http://127.0.0.1:{PORT} (local-only)")
        print(f"[ChariLab] hook enabled: {args.enable_hook}; no Work auto-start is supported")
        with ThreadingHTTPServer(("127.0.0.1", PORT), make_handler(token, args.enable_hook)) as server:
            try:
                server.serve_forever(poll_interval=0.5)
            except KeyboardInterrupt:
                print("Stopped")
    if not (args.setup or args.show_token or args.serve):
        parser.print_help()

if __name__ == "__main__":
    main()
