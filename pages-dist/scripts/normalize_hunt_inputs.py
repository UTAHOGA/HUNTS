#!/usr/bin/env python3
"""
Normalize heterogeneous hunt input files into a canonical tabular shape.

Usage:
  python scripts/normalize_hunt_inputs.py --input data/incoming --output processed_data/normalized/hunts_normalized.csv
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, Iterable, List


CANONICAL_COLUMNS = [
    "hunt_code",
    "species",
    "sex_type",
    "hunt_type",
    "weapon",
    "hunt_name",
    "season",
    "access_type",
    "eligibility_class",
    "draw_family",
    "youth_flag",
    "source_file",
]


COLUMN_ALIASES = {
    "hunt_number": "hunt_code",
    "Hunt Number": "hunt_code",
    "hunt_code": "hunt_code",
    "species": "species",
    "Species": "species",
    "sex_type": "sex_type",
    "Sex": "sex_type",
    "sex": "sex_type",
    "hunt_type": "hunt_type",
    "Hunt Type": "hunt_type",
    "Weapon": "weapon",
    "weapon": "weapon",
    "hunt_name": "hunt_name",
    "Hunt Unit": "hunt_name",
    "unit_name": "hunt_name",
    "season_dates": "season",
    "Season Dates": "season",
    "season": "season",
}


def clean_text(value: str) -> str:
    return str(value or "").strip()


def normalize_row(row: Dict[str, str], source_file: Path) -> Dict[str, str]:
    out = {k: "" for k in CANONICAL_COLUMNS}
    out["access_type"] = "Public"
    out["eligibility_class"] = "any"
    out["draw_family"] = ""
    out["youth_flag"] = "false"
    out["source_file"] = source_file.name

    for key, value in row.items():
        if key not in COLUMN_ALIASES:
            continue
        canonical = COLUMN_ALIASES[key]
        out[canonical] = clean_text(value)

    out["hunt_code"] = out["hunt_code"].upper()
    out["species"] = out["species"].title()
    out["sex_type"] = out["sex_type"].title()
    out["hunt_type"] = out["hunt_type"].title()
    out["weapon"] = out["weapon"].title()
    return out


def read_csv(path: Path) -> Iterable[Dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield row


def read_json(path: Path) -> Iterable[Dict[str, str]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("rows", [])
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict)]


def collect_input_files(root: Path) -> List[Path]:
    supported = {".csv", ".json"}
    return [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in supported]


def build_manifest(records: List[Dict[str, str]], manifest_path: Path) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    by_source: Dict[str, int] = {}
    for r in records:
        by_source[r["source_file"]] = by_source.get(r["source_file"], 0) + 1
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "total_rows": len(records),
                "source_counts": by_source,
            },
            f,
            indent=2,
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input directory with CSV/JSON files")
    parser.add_argument("--output", required=True, help="Normalized output CSV path")
    parser.add_argument("--manifest", default="", help="Optional manifest JSON path")
    args = parser.parse_args()

    input_root = Path(args.input)
    output_csv = Path(args.output)
    output_csv.parent.mkdir(parents=True, exist_ok=True)

    records: List[Dict[str, str]] = []
    for file_path in collect_input_files(input_root):
        if file_path.suffix.lower() == ".csv":
            rows = read_csv(file_path)
        else:
            rows = read_json(file_path)
        for row in rows:
            normalized = normalize_row(row, file_path)
            if not normalized["hunt_code"]:
                continue
            records.append(normalized)

    # Keep last copy of each hunt_code to allow overlays from newer files.
    dedup: Dict[str, Dict[str, str]] = {}
    for r in records:
        dedup[r["hunt_code"]] = r
    final_rows = list(dedup.values())

    with output_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CANONICAL_COLUMNS)
        writer.writeheader()
        writer.writerows(final_rows)

    if args.manifest:
        build_manifest(records, Path(args.manifest))

    print(f"Normalized {len(records)} rows into {len(final_rows)} unique hunts -> {output_csv}")


if __name__ == "__main__":
    main()

