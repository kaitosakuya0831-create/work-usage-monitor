import datetime as dt
import tempfile
import unittest
from pathlib import Path
import sys
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parents[1] / "bridge"))
import quota_bridge as b

TZ = dt.timezone.utc
T = dt.datetime(2026, 10, 29, 10, 0, tzinfo=TZ)


def sample(f=16, m=10, w=87):
    return {"five_hour": {"remaining_percent": f, "reset_minutes": m},
            "weekly": {"remaining_percent": w, "reset_minutes": 9000}}


class TestQuota(unittest.TestCase):
    def test_validate(self):
        self.assertEqual(b.validate_snapshot(sample())["five_hour"]["remaining_percent"], 16)
        with self.assertRaises(ValueError):
            b.validate_snapshot(sample(f=200))
        with self.assertRaises(ValueError):
            b.validate_snapshot(sample(f=True))

    def test_reset_only_after_fresh_ui_observation(self):
        old = {**sample(), "observed_at": (T - dt.timedelta(minutes=8)).isoformat(),
               "reset_at": (T - dt.timedelta(minutes=1)).isoformat()}
        ok, code = b.recovery_detected(old, sample(100, 290), T)
        self.assertTrue(ok, code)
        ok, code = b.recovery_detected(old, sample(16, 1), T)
        self.assertFalse(ok)

    def test_weekly_depleted_blocks(self):
        old = {**sample(), "observed_at": (T - dt.timedelta(minutes=8)).isoformat(),
               "reset_at": (T - dt.timedelta(minutes=1)).isoformat()}
        ok, code = b.recovery_detected(old, sample(100, 290, w=10), T)
        self.assertEqual((ok, code), (False, "WEEKLY_LOW"))

    def test_no_recovery_if_old_reset_not_due(self):
        old = {**sample(m=140), "observed_at": (T - dt.timedelta(minutes=1)).isoformat(),
               "reset_at": (T + dt.timedelta(minutes=139)).isoformat()}
        self.assertFalse(b.recovery_detected(old, sample(100, 290), T)[0])

    def test_no_multiple_fires(self):
        with tempfile.TemporaryDirectory() as d, patch.object(b, "HOME", Path(d)):
            old_time = T - dt.timedelta(minutes=8)
            b.process_snapshot(sample(m=8), old_time)
            out = b.process_snapshot(sample(100, 290), T)
            self.assertTrue(out["recovered"], out)
            again = b.process_snapshot(sample(100, 289), T + dt.timedelta(minutes=1))
            self.assertFalse(again["recovered"])
            events = (Path(d) / "events.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(events), 1)

if __name__ == '__main__':
    unittest.main()
