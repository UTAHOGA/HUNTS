#!/usr/bin/env python3
"""
Execute high-confidence file moves from required_move_screen_required_only.csv.

Safety:
- Only processes rows where needs_move=yes and confidence=high.
- Only allows source/destination paths inside pipeline/RAW/hunt_unit_database.
- Never overwrites a different existing destination file.
- Writes a full execution log.
"""

from __future__ import annotations

import csv
import hashlib
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


REPO = Path(__file__).resolve().parents[3]
RAW_ROOT = (REPO / "pipeline" / "RAW" / "hunt_unit_database").resolve()
PLAN_PATH = REPO / "processed_data" / "required_move_screen_required_only.csv"
LOG_PATH = REPO / "processed_data" / "required_move_execution_log.csv"


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


def run() -> None:
    if not PLAN_PATH.exists():
        raise FileNotFoundError(f"Plan not found: {PLAN_PATH}")

    with PLAN_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    plan_rows = [
        r
        for r in rows
        if (r.get("needs_move") or "").strip().lower() == "yes"
        and (r.get("confidence") or "").strip().lower() == "high"
    ]

    results: List[Dict[str, str]] = []
    moved = 0
    removed_duplicate = 0
    missing_source = 0
    already_in_place = 0
    blocked_outside_root = 0
    conflict_renamed = 0
    skipped_invalid = 0

    for row in plan_rows:
        src_text = (row.get("current_path") or "").strip()
        dst_text = (row.get("recommended_path") or "").strip()
        filename = row.get("filename", "")

        action = "unknown"
        note = ""
        final_path = ""

        if not src_text or not dst_text:
            skipped_invalid += 1
            action = "skipped_invalid_row"
            note = "missing current_path or recommended_path"
            results.append(
                {
                    **row,
                    "action": action,
                    "note": note,
                    "final_path": final_path,
                }
            )
            continue

        src = Path(src_text)
        dst = Path(dst_text)

        if not inside_root(src, RAW_ROOT) or not inside_root(dst, RAW_ROOT):
            blocked_outside_root += 1
            action = "blocked_outside_root"
            note = f"src_inside={inside_root(src, RAW_ROOT)} dst_inside={inside_root(dst, RAW_ROOT)}"
            results.append(
                {
                    **row,
                    "action": action,
                    "note": note,
                    "final_path": final_path,
                }
            )
            continue

        if not src.exists():
            missing_source += 1
            action = "missing_source"
            note = "source file not found (possibly already moved)"
            final_path = str(dst)
            results.append(
                {
                    **row,
                    "action": action,
                    "note": note,
                    "final_path": final_path,
                }
            )
            continue

        src_res = src.resolve()
        dst_res = dst.resolve() if dst.exists() else dst
        if dst.exists() and src_res == dst_res:
            already_in_place += 1
            action = "already_in_place"
            final_path = str(dst_res)
            results.append(
                {
                    **row,
                    "action": action,
                    "note": note,
                    "final_path": final_path,
                }
            )
            continue

        dst.parent.mkdir(parents=True, exist_ok=True)

        if dst.exists():
            try:
                if sha1(src) == sha1(dst):
                    src.unlink()
                    removed_duplicate += 1
                    action = "removed_duplicate_source"
                    note = "destination existed with identical content"
                    final_path = str(dst.resolve())
                else:
                    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
                    alt = dst.with_name(f"{dst.stem}__moveconflict_{stamp}{dst.suffix}")
                    shutil.move(str(src), str(alt))
                    conflict_renamed += 1
                    action = "moved_renamed_conflict"
                    note = f"destination existed with different content; moved to {alt.name}"
                    final_path = str(alt.resolve())
            except Exception as exc:
                action = "error"
                note = str(exc)
                final_path = ""
        else:
            try:
                shutil.move(str(src), str(dst))
                moved += 1
                action = "moved"
                final_path = str(dst.resolve())
            except Exception as exc:
                action = "error"
                note = str(exc)
                final_path = ""

        results.append(
            {
                **row,
                "action": action,
                "note": note,
                "final_path": final_path,
                "filename_checked": filename,
            }
        )

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if results:
        fieldnames = list(results[0].keys())
        with LOG_PATH.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)
    else:
        with LOG_PATH.open("w", encoding="utf-8", newline="") as f:
            f.write("no_rows\n")

    print(f"PLAN_ROWS={len(plan_rows)}")
    print(f"MOVED={moved}")
    print(f"REMOVED_DUPLICATE_SOURCE={removed_duplicate}")
    print(f"CONFLICT_RENAMED={conflict_renamed}")
    print(f"ALREADY_IN_PLACE={already_in_place}")
    print(f"MISSING_SOURCE={missing_source}")
    print(f"SKIPPED_INVALID={skipped_invalid}")
    print(f"BLOCKED_OUTSIDE_ROOT={blocked_outside_root}")
    print(f"LOG={LOG_PATH}")


if __name__ == "__main__":
    run()
