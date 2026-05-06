#!/usr/bin/env python3
"""
Execute safe-to-move rows from text-check output CSV.

Default input:
  processed_data/safe_to_move_after_text_check_high_only.csv

Safety:
- Only moves rows marked safe_to_move_after_text_check=yes.
- Enforces source and destination under pipeline/RAW/hunt_unit_database.
- Uses full path (including extension), so same basename across .csv/.xlsx is not a collision.
- Never overwrites different content; conflict is moved with suffix.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


REPO = Path(__file__).resolve().parents[3]
RAW_ROOT = (REPO / "pipeline" / "RAW" / "hunt_unit_database").resolve()
DEFAULT_INPUT = REPO / "processed_data" / "safe_to_move_after_text_check_high_only.csv"
DEFAULT_LOG = REPO / "processed_data" / "safe_to_move_after_text_check_execution_log.csv"


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inside_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root)
        return True
    except Exception:
        return False


def execute(input_csv: Path, log_csv: Path) -> None:
    if not input_csv.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_csv}")

    with input_csv.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    plan_rows = [
        r for r in rows if (r.get("safe_to_move_after_text_check", "").strip().lower() == "yes")
    ]

    results: List[Dict[str, str]] = []
    counts = {
        "moved": 0,
        "removed_duplicate_source": 0,
        "moved_renamed_conflict": 0,
        "missing_source": 0,
        "blocked_outside_root": 0,
        "skipped_invalid_row": 0,
        "already_in_place": 0,
        "error": 0,
    }

    for row in plan_rows:
        src_text = (row.get("current_path") or "").strip()
        dst_text = (row.get("recommended_path_after_text_check") or "").strip()

        action = "unknown"
        note = ""
        final_path = ""

        if not src_text or not dst_text:
            action = "skipped_invalid_row"
            note = "missing path values"
            counts[action] += 1
            results.append({**row, "action": action, "note": note, "final_path": final_path})
            continue

        src = Path(src_text)
        dst = Path(dst_text)

        if not inside_root(src, RAW_ROOT) or not inside_root(dst, RAW_ROOT):
            action = "blocked_outside_root"
            note = "source/destination not under hunt_unit_database root"
            counts[action] += 1
            results.append({**row, "action": action, "note": note, "final_path": final_path})
            continue

        if not src.exists():
            action = "missing_source"
            note = "source not found"
            final_path = str(dst)
            counts[action] += 1
            results.append({**row, "action": action, "note": note, "final_path": final_path})
            continue

        if dst.exists() and src.resolve() == dst.resolve():
            action = "already_in_place"
            final_path = str(dst.resolve())
            counts[action] += 1
            results.append({**row, "action": action, "note": note, "final_path": final_path})
            continue

        dst.parent.mkdir(parents=True, exist_ok=True)

        try:
            if dst.exists():
                if sha1(src) == sha1(dst):
                    src.unlink()
                    action = "removed_duplicate_source"
                    note = "destination had same hash"
                    final_path = str(dst.resolve())
                else:
                    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
                    alt = dst.with_name(f"{dst.stem}__moveconflict_{stamp}{dst.suffix}")
                    shutil.move(str(src), str(alt))
                    action = "moved_renamed_conflict"
                    note = f"destination differed; moved as {alt.name}"
                    final_path = str(alt.resolve())
            else:
                shutil.move(str(src), str(dst))
                action = "moved"
                final_path = str(dst.resolve())
        except Exception as exc:
            action = "error"
            note = str(exc)
            final_path = ""

        counts[action] += 1
        results.append({**row, "action": action, "note": note, "final_path": final_path})

    log_csv.parent.mkdir(parents=True, exist_ok=True)
    if results:
        fieldnames = list(results[0].keys())
        with log_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)
    else:
        with log_csv.open("w", encoding="utf-8", newline="") as f:
            f.write("no_rows\n")

    print(f"INPUT={input_csv}")
    print(f"PLAN_ROWS={len(plan_rows)}")
    for k in [
        "moved",
        "removed_duplicate_source",
        "moved_renamed_conflict",
        "already_in_place",
        "missing_source",
        "blocked_outside_root",
        "skipped_invalid_row",
        "error",
    ]:
        print(f"{k.upper()}={counts[k]}")
    print(f"LOG={log_csv}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Execute safe-to-move rows from text-check CSV")
    parser.add_argument("--input-csv", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--log-csv", type=Path, default=DEFAULT_LOG)
    args = parser.parse_args()
    execute(args.input_csv, args.log_csv)


if __name__ == "__main__":
    main()
