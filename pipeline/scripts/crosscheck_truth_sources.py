#!/usr/bin/env python3
import argparse
import json
import re
import sqlite3
from pathlib import Path


SYSTEM_TABLE_PREFIXES = ("sqlite_", "gpkg", "rtree_", "idx_")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def get_records(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("records"), list):
        return payload["records"]
    return []


def first_non_empty(record, keys):
    for key in keys:
        value = record.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def normalize_boundary_id(value):
    text = str(value).strip() if value is not None else ""
    if not text:
        return ""
    if re.fullmatch(r"\d+(\.0+)?", text):
        return str(int(float(text)))
    return text


def parse_id_list(value):
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(parse_id_list(item))
        return [v for v in [normalize_boundary_id(v) for v in out] if v]

    text = str(value).strip() if value is not None else ""
    if not text:
        return []

    if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
        try:
            return parse_id_list(json.loads(text))
        except Exception:
            pass

    for delim in [",", "|", ";", "/"]:
        if delim in text:
            return [v for v in [normalize_boundary_id(v) for v in text.split(delim)] if v]

    return [normalize_boundary_id(text)]


def canonical_sets(records):
    hunt_codes = set()
    boundary_ids = set()
    for record in records:
        hunt_code = first_non_empty(record, ["huntCode", "HuntCode", "hunt_code", "code"]).upper()
        if hunt_code:
            hunt_codes.add(hunt_code)
        bid = normalize_boundary_id(first_non_empty(record, ["boundaryId", "BoundaryID", "boundary_id", "originalBoundaryId"]))
        if bid:
            boundary_ids.add(bid)
    return hunt_codes, boundary_ids


def geojson_sets(geojson):
    features = geojson.get("features", []) if isinstance(geojson, dict) else []
    primary_ids = set()
    member_ids = set()
    union_ids = set()
    for feature in features:
        props = feature.get("properties") or {}
        for bid in parse_id_list(
            props.get("BoundaryID", props.get("Boundary_Id", props.get("BOUNDARYID", props.get("boundary_id"))))
        ):
            primary_ids.add(bid)
            union_ids.add(bid)
        for bid in parse_id_list(props.get("member_boundary_ids", props.get("memberBoundaryIds"))):
            member_ids.add(bid)
            union_ids.add(bid)
    return len(features), primary_ids, member_ids, union_ids


def list_user_tables(conn):
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    out = []
    for (name,) in rows:
        if name.startswith(SYSTEM_TABLE_PREFIXES):
            continue
        out.append(name)
    return out


def scan_reference_db(reference_db: Path):
    if not reference_db.exists():
        return {"tables_scanned": 0, "boundary_ids": set(), "hunt_codes": set(), "matched_columns": []}

    conn = sqlite3.connect(str(reference_db))
    tables = list_user_tables(conn)
    boundary_ids = set()
    hunt_codes = set()
    matched_columns = []

    boundary_patterns = {"boundaryid", "boundary_id", "boundary id"}
    hunt_patterns = {"hunt_number", "huntnumber", "hunt_code", "huntcode", "code"}

    for table in tables:
        cols = conn.execute(f'PRAGMA table_info("{table.replace("\"", "\"\"")}")').fetchall()
        for _, col_name, *_ in cols:
            key = str(col_name).strip().lower()
            if key not in boundary_patterns and key not in hunt_patterns:
                continue
            matched_columns.append({"table": table, "column": col_name})
            q = f'SELECT "{str(col_name).replace("\"", "\"\"")}" FROM "{table.replace("\"", "\"\"")}"'
            try:
                for (value,) in conn.execute(q):
                    if value is None:
                        continue
                    text = str(value).strip()
                    if not text:
                        continue
                    if key in boundary_patterns:
                        boundary_ids.add(normalize_boundary_id(text))
                    if key in hunt_patterns:
                        hunt_codes.add(text.upper())
            except sqlite3.OperationalError:
                continue

    conn.close()
    return {
        "tables_scanned": len(tables),
        "boundary_ids": boundary_ids,
        "hunt_codes": hunt_codes,
        "matched_columns": matched_columns,
    }


def pct(hit, total):
    if total <= 0:
        return 0.0
    return round((hit / total) * 100, 2)


def main():
    parser = argparse.ArgumentParser(description="Cross-check canonical, GeoJSON, and optional downloaded geodatabase-derived SQLite.")
    parser.add_argument("--canonical-json", type=Path, default=Path("data/hunt-master-canonical.json"))
    parser.add_argument("--full-geojson", type=Path, default=Path("data/hunt_boundaries.geojson"))
    parser.add_argument("--lite-geojson", type=Path, default=Path("data/hunt-boundaries-lite.geojson"))
    parser.add_argument("--reference-db", type=Path, default=Path("processed_data/truth_downloads_comprehensive.sqlite"))
    parser.add_argument("--report-md", type=Path, default=Path("processed_data/truth_crosscheck_report.md"))
    parser.add_argument("--report-json", type=Path, default=Path("processed_data/truth_crosscheck_report.json"))
    args = parser.parse_args()

    canonical_payload = read_json(args.canonical_json)
    records = get_records(canonical_payload)
    canonical_hunt_codes, canonical_boundary_ids = canonical_sets(records)

    full_features, full_primary, full_member, full_union = geojson_sets(read_json(args.full_geojson))
    lite_features, lite_primary, lite_member, lite_union = geojson_sets(read_json(args.lite_geojson))

    ref_scan = scan_reference_db(args.reference_db)
    ref_boundary_ids = ref_scan["boundary_ids"]
    ref_hunt_codes = ref_scan["hunt_codes"]

    full_hit = len(canonical_boundary_ids & full_union)
    lite_hit = len(canonical_boundary_ids & lite_union)
    ref_hit = len(canonical_boundary_ids & ref_boundary_ids) if ref_boundary_ids else 0
    ref_hunt_hit = len(canonical_hunt_codes & ref_hunt_codes) if ref_hunt_codes else 0

    only_in_full = sorted(full_union - lite_union)
    only_in_lite = sorted(lite_union - full_union)

    summary = {
        "canonical": {
            "records": len(records),
            "hunt_codes": len(canonical_hunt_codes),
            "boundary_ids": len(canonical_boundary_ids),
        },
        "full_geojson": {
            "path": str(args.full_geojson),
            "features": full_features,
            "primary_ids": len(full_primary),
            "member_ids": len(full_member),
            "union_ids": len(full_union),
            "canonical_boundary_hits": full_hit,
            "canonical_boundary_coverage_pct": pct(full_hit, len(canonical_boundary_ids)),
        },
        "lite_geojson": {
            "path": str(args.lite_geojson),
            "features": lite_features,
            "primary_ids": len(lite_primary),
            "member_ids": len(lite_member),
            "union_ids": len(lite_union),
            "canonical_boundary_hits": lite_hit,
            "canonical_boundary_coverage_pct": pct(lite_hit, len(canonical_boundary_ids)),
        },
        "full_vs_lite_union_diff": {
            "only_in_full_count": len(only_in_full),
            "only_in_lite_count": len(only_in_lite),
            "only_in_full_sample": only_in_full[:20],
            "only_in_lite_sample": only_in_lite[:20],
        },
        "reference_download_db": {
            "path": str(args.reference_db),
            "tables_scanned": ref_scan["tables_scanned"],
            "matched_columns": len(ref_scan["matched_columns"]),
            "boundary_ids_found": len(ref_boundary_ids),
            "hunt_codes_found": len(ref_hunt_codes),
            "canonical_boundary_hits": ref_hit,
            "canonical_boundary_coverage_pct": pct(ref_hit, len(canonical_boundary_ids)),
            "canonical_hunt_code_hits": ref_hunt_hit,
            "canonical_hunt_code_coverage_pct": pct(ref_hunt_hit, len(canonical_hunt_codes)),
        },
    }

    lines = []
    lines.append("# Truth Source Cross-Check Report")
    lines.append("")
    lines.append(f"- Canonical JSON: `{args.canonical_json}`")
    lines.append(f"- Full GeoJSON: `{args.full_geojson}`")
    lines.append(f"- Lite GeoJSON: `{args.lite_geojson}`")
    lines.append(f"- Reference DB (truth downloads): `{args.reference_db}`")
    lines.append("")
    lines.append("## Canonical")
    lines.append(f"- Records: {summary['canonical']['records']}")
    lines.append(f"- Unique hunt codes: {summary['canonical']['hunt_codes']}")
    lines.append(f"- Unique boundary IDs: {summary['canonical']['boundary_ids']}")
    lines.append("")
    lines.append("## Full GeoJSON coverage")
    lines.append(f"- Features: {summary['full_geojson']['features']}")
    lines.append(f"- Primary IDs: {summary['full_geojson']['primary_ids']}")
    lines.append(f"- Member IDs: {summary['full_geojson']['member_ids']}")
    lines.append(f"- Union IDs: {summary['full_geojson']['union_ids']}")
    lines.append(
        f"- Canonical boundary coverage: {summary['full_geojson']['canonical_boundary_hits']} / {summary['canonical']['boundary_ids']} ({summary['full_geojson']['canonical_boundary_coverage_pct']}%)"
    )
    lines.append("")
    lines.append("## Lite GeoJSON coverage")
    lines.append(f"- Features: {summary['lite_geojson']['features']}")
    lines.append(f"- Primary IDs: {summary['lite_geojson']['primary_ids']}")
    lines.append(f"- Member IDs: {summary['lite_geojson']['member_ids']}")
    lines.append(f"- Union IDs: {summary['lite_geojson']['union_ids']}")
    lines.append(
        f"- Canonical boundary coverage: {summary['lite_geojson']['canonical_boundary_hits']} / {summary['canonical']['boundary_ids']} ({summary['lite_geojson']['canonical_boundary_coverage_pct']}%)"
    )
    lines.append("")
    lines.append("## Full vs Lite union diff")
    lines.append(f"- Only in full count: {summary['full_vs_lite_union_diff']['only_in_full_count']}")
    lines.append(f"- Only in lite count: {summary['full_vs_lite_union_diff']['only_in_lite_count']}")
    lines.append("")
    lines.append("## Truth downloads DB scan")
    lines.append(f"- Tables scanned: {summary['reference_download_db']['tables_scanned']}")
    lines.append(f"- Matched boundary/hunt columns: {summary['reference_download_db']['matched_columns']}")
    lines.append(f"- Boundary IDs found: {summary['reference_download_db']['boundary_ids_found']}")
    lines.append(f"- Hunt codes found: {summary['reference_download_db']['hunt_codes_found']}")
    lines.append(
        f"- Canonical boundary coverage from downloads DB: {summary['reference_download_db']['canonical_boundary_hits']} / {summary['canonical']['boundary_ids']} ({summary['reference_download_db']['canonical_boundary_coverage_pct']}%)"
    )
    lines.append(
        f"- Canonical hunt code coverage from downloads DB: {summary['reference_download_db']['canonical_hunt_code_hits']} / {summary['canonical']['hunt_codes']} ({summary['reference_download_db']['canonical_hunt_code_coverage_pct']}%)"
    )
    lines.append("")
    lines.append("## Interpretation")
    lines.append("- Use canonical JSON + full GeoJSON as publish truth.")
    lines.append("- Use lite GeoJSON as fast runtime first load when its union coverage matches full.")
    lines.append("- Use downloads DB scan as an independent cross-check signal, not direct runtime source.")
    lines.append("")

    args.report_md.write_text("\n".join(lines), encoding="utf-8")
    args.report_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(json.dumps({"report_md": str(args.report_md), "report_json": str(args.report_json), **summary}, indent=2))


if __name__ == "__main__":
    main()
