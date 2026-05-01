#!/usr/bin/env python3
"""
Build model-ready features from normalized hunt data.

Usage:
  python scripts/build_model_features.py \
    --input processed_data/normalized/hunts_normalized.csv \
    --output modeling/features/hunt_features.csv
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime
from pathlib import Path
from typing import Dict, List


FEATURE_COLUMNS = [
    "hunt_code",
    "species",
    "sex_type",
    "hunt_type",
    "weapon",
    "season_start_month",
    "season_duration_days",
    "is_youth",
    "access_type",
]


def parse_season(value: str) -> tuple[str, str]:
    text = (value or "").strip()
    if " to " in text:
        left, right = text.split(" to ", 1)
        return left.strip(), right.strip()
    return "", ""


def parse_iso_date(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None


def build_feature_row(row: Dict[str, str]) -> Dict[str, str]:
    start_raw, end_raw = parse_season(row.get("season", ""))
    start_dt = parse_iso_date(start_raw)
    end_dt = parse_iso_date(end_raw)

    month = str(start_dt.month) if start_dt else ""
    duration = ""
    if start_dt and end_dt and end_dt >= start_dt:
        duration = str((end_dt - start_dt).days + 1)

    youth_flag = (row.get("youth_flag", "") or "").strip().lower() in {"true", "1", "yes", "y"}

    return {
        "hunt_code": (row.get("hunt_code", "") or "").strip().upper(),
        "species": (row.get("species", "") or "").strip(),
        "sex_type": (row.get("sex_type", "") or "").strip(),
        "hunt_type": (row.get("hunt_type", "") or "").strip(),
        "weapon": (row.get("weapon", "") or "").strip(),
        "season_start_month": month,
        "season_duration_days": duration,
        "is_youth": "1" if youth_flag else "0",
        "access_type": (row.get("access_type", "") or "").strip(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Normalized hunt CSV")
    parser.add_argument("--output", required=True, help="Output features CSV")
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rows: List[Dict[str, str]] = []
    with in_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            features = build_feature_row(row)
            if features["hunt_code"]:
                rows.append(features)

    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FEATURE_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} feature rows -> {out_path}")


if __name__ == "__main__":
    main()

