#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PROCESSED = REPO / "processed_data"
BOUNDARY_DIR = PROCESSED / "boundaries"
SPLIT_DIR = PROCESSED / "hunt_research_2026_split"

DISCONTINUED_CODES = {"DB1345", "EB3617", "LO0010"}
CODE_COLUMNS = ("hunt_code", "huntCode", "code", "huntCodeNormalized")


def extract_code(record: dict) -> str:
    for key in CODE_COLUMNS:
        value = record.get(key)
        if value is None:
            continue
        code = str(value).strip().upper()
        if code:
            return code
    return ""


def filter_csv(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return 0
        rows = list(reader)
        present = {name.lower() for name in reader.fieldnames}
        if not any(col.lower() in present for col in CODE_COLUMNS):
            return 0

    kept = []
    removed = 0
    for row in rows:
        code = extract_code(row)
        if code in DISCONTINUED_CODES:
            removed += 1
        else:
            kept.append(row)

    if removed:
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
            writer.writeheader()
            writer.writerows(kept)
    return removed


def filter_list_records(records: list) -> tuple[list, int]:
    kept = []
    removed = 0
    for item in records:
        if not isinstance(item, dict):
            kept.append(item)
            continue
        code = extract_code(item)
        if code in DISCONTINUED_CODES:
            removed += 1
        else:
            kept.append(item)
    return kept, removed


def filter_json(path: Path) -> int:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0

    removed = 0
    changed = False

    if isinstance(payload, list):
        filtered, removed = filter_list_records(payload)
        if removed:
            payload = filtered
            changed = True
    elif isinstance(payload, dict):
        for key in ("records", "rows", "items", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                filtered, key_removed = filter_list_records(value)
                if key_removed:
                    payload[key] = filtered
                    removed += key_removed
                    changed = True
        # JSON map keyed by hunt code
        removable_keys = [k for k in payload.keys() if str(k).strip().upper() in DISCONTINUED_CODES]
        if removable_keys:
            for k in removable_keys:
                payload.pop(k, None)
            removed += len(removable_keys)
            changed = True

    if changed and removed:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return removed


def remove_boundary_files() -> list[str]:
    deleted = []
    for code in DISCONTINUED_CODES:
        path = BOUNDARY_DIR / f"{code}.geojson"
        if path.exists():
            path.unlink()
            deleted.append(path.name)
    return deleted


def remove_split_files() -> list[str]:
    deleted = []
    hunts_dir = SPLIT_DIR / "hunts"
    for code in DISCONTINUED_CODES:
        path = hunts_dir / f"{code}.json"
        if path.exists():
            path.unlink()
            deleted.append(path.name)
    return deleted


def main() -> int:
    csv_removed = {}
    json_removed = {}

    for path in sorted(PROCESSED.glob("*.csv")):
        removed = filter_csv(path)
        if removed:
            csv_removed[path.name] = removed

    for path in sorted(PROCESSED.glob("*.json")):
        removed = filter_json(path)
        if removed:
            json_removed[path.name] = removed

    # Split metadata/index files
    for path in sorted(SPLIT_DIR.glob("*.json")):
        removed = filter_json(path)
        if removed:
            json_removed[str(path.relative_to(PROCESSED))] = removed

    deleted_boundaries = remove_boundary_files()
    deleted_split = remove_split_files()

    print("CSV rows removed:")
    if csv_removed:
        for name, count in csv_removed.items():
            print(f"  {name}: {count}")
    else:
        print("  none")

    print("JSON records removed:")
    if json_removed:
        for name, count in json_removed.items():
            print(f"  {name}: {count}")
    else:
        print("  none")

    print("Boundary files deleted:")
    if deleted_boundaries:
        for name in deleted_boundaries:
            print(f"  {name}")
    else:
        print("  none")

    print("Split hunt files deleted:")
    if deleted_split:
        for name in deleted_split:
            print(f"  {name}")
    else:
        print("  none")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

