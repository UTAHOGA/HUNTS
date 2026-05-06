#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
from copy import deepcopy
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
BOUNDARY_DIR = REPO / "processed_data" / "boundaries"
DISPLAY_INDEX_JSON = REPO / "processed_data" / "display-boundary-index-2026.json"
DISPLAY_INDEX_CSV = REPO / "processed_data" / "display-boundary-index-2026.csv"
HUNT_BOUNDARIES = REPO / "data" / "hunt_boundaries.geojson"
RAW_GEO = REPO / "pipeline" / "RAW" / "hunt_unit_mapping" / "geojson"


SINGLE_BOUNDARY_IDS = {
    "DB1320": ["686"],
    "DB1324": ["828"],
    "DB1343": ["907"],
    "DB1344": ["906"],
    "DB1345": ["206"],   # Diamond Mountain best-available geometry in local truth set.
    "DB1348": ["922"],
    "DS1000": ["454"],
    "EA2042": ["175"],
    "EB3561": ["521"],
    "EB3609": ["828"],
    "EB3617": ["206"],   # Diamond Mountain best-available geometry in local truth set.
    "LO0010": ["206"],
    "MB6200": ["575"],
    "MB6207": ["567"],
    "MB6209": ["522"],
    "MB6217": ["490"],
    "MB6220": ["491"],
    "MB6223": ["553"],
    "MB6224": ["521"],
    "MB6225": ["586"],
    "MB6240": ["732"],
    "MB6254": ["576"],
    "MB6257": ["493"],
    "MB6259": ["828"],
    "PB5343": ["919"],
    "PD1016": ["537"],
    "PD1025": ["824"],
    "PD1026": ["826"],
    "PD1041": ["201"],
}

COMPOSITE_BOUNDARY_IDS = {
    "DB0008": ["101", "106", "109", "218", "280", "282", "311", "313"],
    "DB1774": ["93", "610"],
}


def load_geojson(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_boundary_id(value) -> str:
    return str(value).strip() if value is not None else ""


def index_features_by_boundary_id(features: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for feature in features:
        props = feature.get("properties") or {}
        bid = normalize_boundary_id(
            props.get("BoundaryID")
            or props.get("boundary_id")
            or props.get("BOUNDARYID")
            or props.get("Boundary_Id")
        )
        if not bid:
            continue
        out.setdefault(bid, []).append(feature)
    return out


def unique_boundary_ids_from_features(features: list[dict]) -> list[str]:
    seen = set()
    out = []
    for feature in features:
        props = feature.get("properties") or {}
        bid = normalize_boundary_id(
            props.get("BoundaryID")
            or props.get("boundary_id")
            or props.get("BOUNDARYID")
            or props.get("Boundary_Id")
        )
        if bid and bid not in seen:
            seen.add(bid)
            out.append(bid)
    return out


def write_feature_collection(code: str, features: list[dict]) -> None:
    payload = {"type": "FeatureCollection", "features": features}
    (BOUNDARY_DIR / f"{code}.geojson").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def refresh_display_index(rows: list[dict], code: str, member_ids: list[str]) -> None:
    row = next((r for r in rows if str(r.get("hunt_code", "")).upper() == code), None)
    if row is None:
        row = {
            "hunt_code": code,
            "display_boundary_id": None,
            "dwr_boundary_id": None,
            "dwr_member_boundary_ids": [],
            "merged_boundary_id": None,
            "boundary_geometry_type": None,
            "geometry_status": None,
            "boundary_geojson_path": None,
            "boundary_kmz_path": None,
            "boundary_kml_path": None,
            "dwr_boundary_link": None,
            "member_boundary_count": 0,
        }
        rows.append(row)

    is_composite = len(member_ids) > 1
    row["hunt_code"] = code
    row["boundary_geojson_path"] = f"processed_data/boundaries/{code}.geojson"
    row["geometry_status"] = "mapped"
    row["boundary_kmz_path"] = row.get("boundary_kmz_path") or None
    row["boundary_kml_path"] = row.get("boundary_kml_path") or None

    if is_composite:
        row["display_boundary_id"] = f"UOGA_{code}_2026"
        row["dwr_boundary_id"] = None
        row["dwr_member_boundary_ids"] = member_ids
        row["merged_boundary_id"] = f"{code}_MERGED_2026"
        row["boundary_geometry_type"] = "merged_kmz"
        row["member_boundary_count"] = len(member_ids)
    else:
        only_id = member_ids[0] if member_ids else None
        row["display_boundary_id"] = f"DWR_{only_id}" if only_id else f"UOGA_{code}_2026"
        row["dwr_boundary_id"] = only_id
        row["dwr_member_boundary_ids"] = []
        row["merged_boundary_id"] = None
        row["boundary_geometry_type"] = "single_kmz"
        row["member_boundary_count"] = 0


def main() -> int:
    BOUNDARY_DIR.mkdir(parents=True, exist_ok=True)

    hb = load_geojson(HUNT_BOUNDARIES)
    hb_features = hb.get("features") or []
    hb_by_id = index_features_by_boundary_id(hb_features)

    with DISPLAY_INDEX_JSON.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("records") or payload.get("rows") or []
        if not isinstance(rows, list):
            raise RuntimeError("display-boundary-index-2026.json has unsupported object shape")
    else:
        raise RuntimeError("display-boundary-index-2026.json has unsupported root type")

    repaired = []
    failed = []

    # Standard single-ID and small composite repairs from hunt_boundaries truth layer.
    for code, ids in {**SINGLE_BOUNDARY_IDS, **COMPOSITE_BOUNDARY_IDS}.items():
        features: list[dict] = []
        for boundary_id in ids:
            for feature in hb_by_id.get(boundary_id, []):
                features.append(deepcopy(feature))
        if not features:
            failed.append((code, f"no features for IDs {ids}"))
            continue
        write_feature_collection(code, features)
        member_ids = unique_boundary_ids_from_features(features)
        refresh_display_index(rows, code, member_ids)
        repaired.append((code, len(features), member_ids))

    # EB1001: use the existing any-bull unit geometry set as source truth.
    eb1002_path = BOUNDARY_DIR / "EB1002.geojson"
    if eb1002_path.exists():
        eb1002_fc = load_geojson(eb1002_path)
        eb1002_features = [deepcopy(f) for f in (eb1002_fc.get("features") or [])]
        if eb1002_features:
            write_feature_collection("EB1001", eb1002_features)
            refresh_display_index(rows, "EB1001", unique_boundary_ids_from_features(eb1002_features))
            repaired.append(("EB1001", len(eb1002_features), unique_boundary_ids_from_features(eb1002_features)))
        else:
            failed.append(("EB1001", "EB1002 source file exists but has no features"))
    else:
        failed.append(("EB1001", "missing EB1002 source file"))

    # Sort rows by hunt_code for deterministic diffs.
    rows.sort(key=lambda r: str(r.get("hunt_code", "")).upper())

    DISPLAY_INDEX_JSON.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    field_order = [
        "hunt_code",
        "display_boundary_id",
        "dwr_boundary_id",
        "dwr_member_boundary_ids",
        "merged_boundary_id",
        "boundary_geometry_type",
        "geometry_status",
        "boundary_geojson_path",
        "boundary_kmz_path",
        "boundary_kml_path",
        "dwr_boundary_link",
        "member_boundary_count",
    ]
    with DISPLAY_INDEX_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=field_order)
        writer.writeheader()
        for row in rows:
            out = {k: row.get(k) for k in field_order}
            ids = out.get("dwr_member_boundary_ids")
            out["dwr_member_boundary_ids"] = ";".join(ids) if isinstance(ids, list) else (ids or "")
            writer.writerow(out)

    print(f"Repaired boundary files: {len(repaired)}")
    for code, count, ids in repaired:
        print(f"  {code}: features={count}, ids={','.join(ids)}")
    if failed:
        print(f"Failed repairs: {len(failed)}")
        for code, reason in failed:
            print(f"  {code}: {reason}")

    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
