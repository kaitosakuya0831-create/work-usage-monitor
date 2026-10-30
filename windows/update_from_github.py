"""Public GitHub Release -> verified, rollback-capable unpacked Chrome extension update.

Python 3.10+, stdlib only. Does NOT run GitHub code on the host, except that
Chrome later loads the updated JavaScript as an extension. Trust releases from
YOUR OWN GitHub account only. Does not start ChatGPT Work.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile

DEFAULT_REPO = "kaitosakuya0831-create/work-usage-monitor"
ZIP_NAME = "work-ring-extension.zip"
SUMS_NAME = "SHA256SUMS.txt"
MAX_BYTES = 20 * 1024 * 1024
VALID_REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
VALID_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
VALID_PART = re.compile(r"^[A-Za-z0-9_.-]+$")
ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = ROOT / "extension"
APPDATA = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "ChariLabQuotaBridge"


def version_of(value: str) -> tuple[int,int,int] | None:
    m = VALID_TAG.fullmatch(value)
    return tuple(map(int, m.groups())) if m else None


def fetch(url: str) -> bytes:
    req=urllib.request.Request(url, headers={"User-Agent": "work-usage-monitor-updater/1.4.0", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=20) as res:
        payload=res.read(MAX_BYTES+1)
    if len(payload)>MAX_BYTES:
        raise ValueError("Download too large")
    return payload


def repo_release(repo: str, fetcher=fetch) -> tuple[str, dict]:
    if not VALID_REPO.fullmatch(repo):
        raise ValueError("Invalid GitHub repository")
    url=f"https://api.github.com/repos/{repo}/releases/latest"
    data=json.loads(fetcher(url))
    tag=data.get("tag_name", "")
    if not version_of(tag) or data.get("draft") or data.get("prerelease"):
        raise ValueError("Stable semantic release required")
    assets={i.get("name"):i.get("browser_download_url") for i in data.get("assets", [])}
    for name in (ZIP_NAME,SUMS_NAME):
        expected=f"https://github.com/{repo}/releases/download/{tag}/{name}"
        if assets.get(name)!=expected:
            raise ValueError("Release asset missing or unexpected URL: " + name)
    return tag, assets


def verify_checksums(zipbytes: bytes, sumsbytes: bytes) -> None:
    if len(sumsbytes)>100_000: raise ValueError("Unexpected SHA256SUMS size")
    match=re.search(r"^([0-9a-fA-F]{64})\s+\*?work-ring-extension\.zip\s*$",sumsbytes.decode('ascii'),re.M)
    if not match: raise ValueError("SHA256SUMS lacks extension archive")
    actual=hashlib.sha256(zipbytes).hexdigest()
    if match.group(1).lower()!=actual: raise ValueError("SHA256 mismatch")


def validate_archive(archive: Path, expected: str, target: Path) -> None:
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if not 1<=len(names)<=100 or len(set(names))!=len(names): raise ValueError("Unexpected archive layout")
        if sum(i.file_size for i in z.infolist())>MAX_BYTES: raise ValueError("Expanded size too large")
        for info in z.infolist():
            name=info.filename
            if name.startswith('/') or '\\' in name or any(x in ('','.','..') or not VALID_PART.fullmatch(x) for x in name.rstrip('/').split('/')):
                raise ValueError("Unsafe ZIP path")
            # ZIP symlinks are not allowed (Unix file mode in upper bits).
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("ZIP symlinks forbidden")
            if not name.endswith('/') and not name.lower().endswith(('.js','.json','.html','.css','.png','.md','.txt')):
                raise ValueError("Unexpected file type")
        if 'manifest.json' not in names: raise ValueError("Missing manifest")
        data=json.loads(z.read('manifest.json'))
        if data.get('version')!=expected or data.get('manifest_version')!=3:
            raise ValueError("Manifest version mismatch")
        z.extractall(target)


def installed_version(folder: Path) -> tuple[int,int,int]:
    try:
        data=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
        return version_of('v'+data['version']) or (0,0,0)
    except (OSError,KeyError,ValueError,TypeError):
        return (0,0,0)


def safe_replace(stage: Path, live: Path) -> Path | None:
    """Same-volume rename+rollback. Caller creates stage as sibling of live."""
    backup=None
    if live.exists():
        backup=live.parent/f'work-ring-backup-{dt.datetime.now().strftime("%Y%m%d-%H%M%S")}-{uuid.uuid4().hex[:6]}'
        live.rename(backup)
    try:
        stage.rename(live)
    except Exception:
        if backup and backup.exists() and not live.exists():
            backup.rename(live)
        raise
    return backup


def atomic_version_marker(version: str):
    APPDATA.mkdir(parents=True, exist_ok=True)
    path=APPDATA/'installed_extension_version.json'
    tmp=APPDATA/f'.installed-version-{uuid.uuid4().hex}.tmp'
    tmp.write_text(json.dumps({'version':version,'written_at':dt.datetime.now(dt.timezone.utc).isoformat()}),encoding='utf-8')
    os.replace(tmp,path)


def run(repo: str, apply: bool, root: Path=ROOT, fetcher=fetch) -> str:
    tag, assets=repo_release(repo, fetcher=fetcher)
    target=version_of(tag)
    live=root/'extension'
    local=installed_version(live)
    if target<=local:
        return f"Already up to date: installed={local}, released={target}"
    if not apply:
        return f"Available update: installed={local}, released={target}. Run with --apply to install."
    lock=root/'.work-ring-update.lock'
    try:
        fd=os.open(str(lock),os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        os.close(fd)
    except FileExistsError:
        raise RuntimeError('Updater already running (remove stale .work-ring-update.lock only after checking)')
    stage=root/f'work-ring-update-tmp-{uuid.uuid4().hex[:10]}'
    try:
        zipbytes=fetcher(assets[ZIP_NAME])
        sumsbytes=fetcher(assets[SUMS_NAME])
        verify_checksums(zipbytes,sumsbytes)
        stage.mkdir()
        archive=stage.parent/(stage.name+'.zip')
        try:
            archive.write_bytes(zipbytes)
            validate_archive(archive,tag.removeprefix('v'),stage)
        finally:
            archive.unlink(missing_ok=True)
        backup=safe_replace(stage,live)
        # Signal only after deployment; if writing the marker fails, restore old files.
        try:
            atomic_version_marker(tag.removeprefix('v'))
        except Exception:
            broken = root / f'work-ring-update-tmp-failed-{uuid.uuid4().hex[:8]}'
            live.rename(broken)
            if backup:
                backup.rename(live)
            shutil.rmtree(broken, ignore_errors=True)
            raise
        # The backup intentionally remains on disk until user chooses to delete it.
        return f"Installed {tag} ({'backup: '+str(backup) if backup else 'fresh install'}). Chrome extension reload within ~3 minutes IF bridge is running; refresh the ChatGPT tab to update its existing content script."
    finally:
        if stage.exists(): shutil.rmtree(stage)
        lock.unlink(missing_ok=True)


def main():
    p=argparse.ArgumentParser(description='Read-only check or safe install from OWN GitHub Release')
    p.add_argument('--repo',default=DEFAULT_REPO,help='Exact owner/name of your PUBLIC GitHub release repo')
    g=p.add_mutually_exclusive_group(required=True)
    g.add_argument('--check',action='store_true',help='Check only, no change')
    g.add_argument('--apply',action='store_true',help='Download verified update and install')
    args=p.parse_args()
    try:
        print(run(args.repo,args.apply))
    except urllib.error.HTTPError as e:
        print('GitHub release not accessible: HTTP', e.code, file=sys.stderr);sys.exit(2)
    except Exception as e:
        print('Update failed without intentional Chrome/Work action:',e,file=sys.stderr);sys.exit(1)

if __name__=='__main__': main()
