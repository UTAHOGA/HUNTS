#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Dict, List


REPO = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO / "processed_data" / "display-boundary-index-2026.json"
OUT_JSON = REPO / "processed_data" / "boundary_manifest_validation_report.json"
OUT_CSV = REPO / "processed_data" / "boundary_manifest_validation_report.csv"


def safe_text(value: object) -> str:
    return str(value or "").strip()


def norm_hunt_code(value: object) -> str:
    raw = safe_text(value).upper()
    return "".join(ch for ch in raw if ch.isalnum())


def norm_boundary_id(value: object) -> str:
    raw = safe_text(value)
    if not raw:
        return ""
    if raw.replace(".", "", 1).isdigit():
        return str(int(float(raw)))
    return raw


def parse_member_ids(value: object) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            out.extend(parse_member_ids(item))
        return sorted(set(x for x in out if x))
    text = safe_text(value)
    if not text:
        return []
    if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
        try:
            return parse_member_ids(json.loads(text))
        except Exception:
            pass
    if any(sep in text for sep in [",", "|", ";", "/"]):
        import re

        parts = [norm_boundary_id(p) for p in re.split(r"[,|;/]", text)]
        return sorted(set(x for x in parts if x))
    one = norm_boundary_id(text)
    return [one] if one else []


def file_sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Missing manifest: {MANIFEST_PATH}")

    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("rows") or payload.get("records") or payload.get("items") or []
    else:
        rows = []
    if not isinstance(rows, list):
        raise ValueError("Manifest JSON must be a list or {rows:[...]} structure")

    report_rows: List[Dict[str, str]] = []
    kmz_hash_groups: Dict[str, List[str]] = {}

    errors = 0
    warnings = 0
    valid_rows = 0

    for raw in rows:
        if not isinstance(raw, dict):
            warnings += 1
            continue

        hunt_code = norm_hunt_code(raw.get("hunt_code") or raw.get("huntCode") or raw.get("HUNT_CODE"))
        display_boundary_id = safe_text(raw.get("display_boundary_id") or raw.get("displayBoundaryId"))
        boundary_id = norm_boundary_id(
            raw.get("dwr_boundary_id")
            or raw.get("boundary_id")
            or raw.get("boundaryId")
            or raw.get("BoundaryID")
        )
        merged_boundary_id = safe_text(raw.get("merged_boundary_id") or raw.get("mergedBoundaryId"))
        geometry_type = safe_text(raw.get("boundary_geometry_type") or raw.get("boundaryGeometryType")).lower()
        member_ids = parse_member_ids(
            raw.get("dwr_member_boundary_ids")
            or raw.get("member_boundary_ids")
            or raw.get("memberBoundaryIds")
        )
        geojson_rel = safe_text(raw.get("boundary_geojson_path") or raw.get("boundaryGeojsonPath"))
        kmz_rel = safe_text(raw.get("boundary_kmz_path") or raw.get("boundaryKmzPath"))

        geojson_exists = (REPO / geojson_rel).exists() if geojson_rel else False
        kmz_exists = (REPO / kmz_rel).exists() if kmz_rel else False

        is_composite = (
            "merged" in geometry_type
            or bool(merged_boundary_id)
            or len(member_ids) > 1
        )
        is_numeric_boundary = boundary_id.isdigit()

        row_errors: List[str] = []
        row_warnings: List[str] = []

        if not hunt_code:
            row_errors.append("missing_hunt_code")
        if not display_boundary_id:
            row_errors.append("missing_display_boundary_id")

        if geojson_rel and not geojson_exists:
            row_errors.append("boundary_geojson_missing_file")
        if kmz_rel and not kmz_exists:
            row_errors.append("boundary_kmz_missing_file")

        if is_composite:
            if not merged_boundary_id and not display_boundary_id.startswith("UOGA_"):
                row_errors.append("composite_missing_merged_boundary_id")
            if not member_ids:
                row_errors.append("composite_missing_member_boundary_ids")
            if is_numeric_boundary:
                row_errors.append("composite_has_numeric_boundary_id")
        else:
            if boundary_id and not is_numeric_boundary:
                row_errors.append("single_boundary_id_not_numeric")
            if not boundary_id:
                row_warnings.append("single_boundary_id_blank")

        if kmz_exists:
            try:
                digest = file_sha1((REPO / kmz_rel).resolve())
                kmz_hash_groups.setdefault(digest, []).append(hunt_code or kmz_rel)
            except Exception:
                row_warnings.append("kmz_hash_failed")

        if row_errors:
            errors += 1
            status = "error"
        elif row_warnings:
            warnings += 1
            status = "warning"
            valid_rows += 1
        else:
            status = "ok"
            valid_rows += 1

        report_rows.append(
            {
                "hunt_code": hunt_code,
                "display_boundary_id": display_boundary_id,
                "boundary_id": boundary_id,
                "merged_boundary_id": merged_boundary_id,
                "boundary_geometry_type": geometry_type,
                "member_boundary_count": str(len(member_ids)),
                "boundary_geojson_path": geojson_rel,
                "boundary_geojson_exists": "yes" if geojson_exists else "no",
                "boundary_kmz_path": kmz_rel,
                "boundary_kmz_exists": "yes" if kmz_exists else "no",
                "status": status,
                "errors": "|".join(row_errors),
                "warnings": "|".join(row_warnings),
            }
        )

    duplicate_geometry_groups = [
        {"sha1": digest, "count": len(codes), "hunt_codes_or_paths": codes}
        for digest, codes in kmz_hash_groups.items()
        if len(codes) > 1
    ]

    summary = {
        "manifest_path": str(MANIFEST_PATH),
        "rows_total": len(rows),
        "rows_valid_or_warning": valid_rows,
        "rows_error": errors,
        "rows_warning": warnings,
        "duplicate_geometry_groups": len(duplicate_geometry_groups),
        "duplicate_geometry_details": duplicate_geometry_groups,
        "output_csv": str(OUT_CSV),
    }

    OUT_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        fields = [
            "hunt_code",
            "display_boundary_id",
            "boundary_id",
            "merged_boundary_id",
            "boundary_geometry_type",
            "member_boundary_count",
            "boundary_geojson_path",
            "boundary_geojson_exists",
            "boundary_kmz_path",
            "boundary_kmz_exists",
            "status",
            "errors",
            "warnings",
        ]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(report_rows)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
