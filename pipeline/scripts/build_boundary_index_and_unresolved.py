#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, List, Optional


REPO = Path(__file__).resolve().parents[2]
CANON_CANDIDATES = [
    REPO / "processed_data" / "hunt_master_canonical_2026_priority_ordered_SOURCE_OF_TRUTH_APPLIED.csv",
    REPO / "processed_data" / "hunt_master_canonical_2026_SOURCE_OF_TRUTH_FINAL_COMPLETE_NO_PARTIALS.csv",
]
GEOJSON_CANDIDATES = [
    REPO / "data" / "hunt_boundaries_finalized_2026.geojson",
    REPO / "data" / "hunt_boundaries.geojson",
    REPO / "data" / "hunt-boundaries-lite.geojson",
]
DEFAULT_MANIFEST = REPO / "processed_data" / "display-boundary-index-2026.json"
OUT_UNRESOLVED = REPO / "processed_data" / "unresolved_hunt_boundaries_2026.csv"
OUT_SUMMARY = REPO / "processed_data" / "boundary_mapping_status_2026.json"
OUT_INDEX = REPO / "processed_data" / "boundary_geometry_index_2026.json"


def pick(cols: List[str], cands: List[str]) -> Optional[str]:
    low = {c.lower(): c for c in cols}
    for cand in cands:
        key = cand.lower()
        if key in low:
            return low[key]
    return None


def norm_hunt_code(v: object) -> str:
    text = str(v or "").strip().upper()
    if not text:
        return ""
    return "".join(ch for ch in text if ch.isalnum())


def norm_boundary_id(v: object) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    if not s:
        return ""
    if s.replace(".", "", 1).isdigit():
        return str(int(float(s)))
    return s


def parse_member_ids(v: object) -> List[str]:
    if v is None:
        return []
    if isinstance(v, list):
        out: List[str] = []
        for item in v:
            out.extend(parse_member_ids(item))
        return sorted(set(x for x in out if x))
    text = str(v).strip()
    if not text:
        return []
    if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
        try:
            return parse_member_ids(json.loads(text))
        except Exception:
            pass
    if any(sep in text for sep in [",", "|", ";", "/"]):
        parts = [norm_boundary_id(p) for p in __import__("re").split(r"[,|;/]", text)]
        return sorted(set(x for x in parts if x))
    single = norm_boundary_id(text)
    return [single] if single else []


def first_existing(candidates: List[Path]) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"No candidate path exists: {[str(c) for c in candidates]}")


def load_boundary_geojson_ids(path: Path) -> Dict[str, dict]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    feats = doc.get("features", [])
    ids: Dict[str, dict] = {}
    for feature in feats:
        props = feature.get("properties", {}) or {}
        for raw in (
            props.get("BoundaryID"),
            props.get("BOUNDARYID"),
            props.get("Boundary_Id"),
            props.get("boundary_id"),
        ):
            bid = norm_boundary_id(raw)
            if bid and bid != "0":
                ids[bid] = feature
    return ids


def load_manifest(path: Path) -> Dict[str, dict]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("rows") or payload.get("records") or payload.get("items") or []
    else:
        rows = []
    out: Dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        code = norm_hunt_code(row.get("hunt_code") or row.get("huntCode") or row.get("HUNT_CODE"))
        if not code:
            continue
        out[code] = row
    return out


def manifest_geojson_path(row: dict) -> str:
    return str(
        row.get("boundary_geojson_path")
        or row.get("boundaryGeojsonPath")
        or ""
    ).strip()


def manifest_member_ids(row: dict) -> List[str]:
    return parse_member_ids(
        row.get("dwr_member_boundary_ids")
        or row.get("member_boundary_ids")
        or row.get("memberBoundaryIds")
        or []
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build boundary index and unresolved report with merged-manifest awareness.")
    parser.add_argument("--canonical", type=Path, default=None)
    parser.add_argument("--geojson", type=Path, default=None)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()

    canonical_path = args.canonical.resolve() if args.canonical else first_existing(CANON_CANDIDATES)
    geojson_path = args.geojson.resolve() if args.geojson else first_existing(GEOJSON_CANDIDATES)
    manifest_path = args.manifest.resolve()

    boundary_index = load_boundary_geojson_ids(geojson_path)
    manifest_by_hunt = load_manifest(manifest_path)

    OUT_INDEX.write_text(
        json.dumps(
            {
                "count": len(boundary_index),
                "keys_sample": list(boundary_index.keys())[:20],
                "geojson_path": str(geojson_path),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    with canonical_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    cols = list(rows[0].keys()) if rows else []
    code_col = pick(cols, ["hunt_code", "hunt code", "hunt_number", "huntnumber"])
    bid_col = pick(cols, ["boundary_id", "boundaryid", "boundary id"])
    name_col = pick(cols, ["hunt_name", "hunt name"])
    species_col = pick(cols, ["species"])
    weapon_col = pick(cols, ["weapon"])
    class_col = pick(cols, ["hunt_type", "hunt class", "hunt_class"])

    unresolved: List[dict] = []
    rows_with_hunt_code = 0
    mapped_by_merged_manifest = 0
    mapped_by_single_boundary_id = 0
    mapped_by_member_boundary_fallback = 0

    for row in rows:
        code = norm_hunt_code(row.get(code_col, "") if code_col else "")
        if not code:
            unresolved.append(
                {
                    "hunt_code": "",
                    "hunt_name": (row.get(name_col, "") if name_col else "").strip(),
                    "species": (row.get(species_col, "") if species_col else "").strip(),
                    "weapon": (row.get(weapon_col, "") if weapon_col else "").strip(),
                    "hunt_class": (row.get(class_col, "") if class_col else "").strip(),
                    "boundary_id": "",
                    "reason": "no_hunt_code",
                }
            )
            continue
        rows_with_hunt_code += 1
        boundary_id = norm_boundary_id(row.get(bid_col, "") if bid_col else "")
        manifest_row = manifest_by_hunt.get(code)

        if manifest_row:
            manifest_dwr_boundary_id = norm_boundary_id(
                manifest_row.get("dwr_boundary_id")
                or manifest_row.get("boundary_id")
                or ""
            )
            if manifest_dwr_boundary_id:
                boundary_id = manifest_dwr_boundary_id

            geojson_rel = manifest_geojson_path(manifest_row)
            if geojson_rel:
                geojson_abs = (REPO / geojson_rel).resolve()
                if geojson_abs.exists():
                    mapped_by_merged_manifest += 1
                    continue
                unresolved.append(
                    {
                        "hunt_code": code,
                        "hunt_name": (row.get(name_col, "") if name_col else "").strip(),
                        "species": (row.get(species_col, "") if species_col else "").strip(),
                        "weapon": (row.get(weapon_col, "") if weapon_col else "").strip(),
                        "hunt_class": (row.get(class_col, "") if class_col else "").strip(),
                        "boundary_id": boundary_id,
                        "reason": "manifest_geojson_missing_file",
                    }
                )
                continue

            members = manifest_member_ids(manifest_row)
            if members:
                matched_members = [m for m in members if m in boundary_index]
                if matched_members:
                    mapped_by_member_boundary_fallback += 1
                    continue
                unresolved.append(
                    {
                        "hunt_code": code,
                        "hunt_name": (row.get(name_col, "") if name_col else "").strip(),
                        "species": (row.get(species_col, "") if species_col else "").strip(),
                        "weapon": (row.get(weapon_col, "") if weapon_col else "").strip(),
                        "hunt_class": (row.get(class_col, "") if class_col else "").strip(),
                        "boundary_id": boundary_id,
                        "reason": "member_boundary_ids_not_in_geojson",
                    }
                )
                continue

        if boundary_id:
            if boundary_id in boundary_index:
                mapped_by_single_boundary_id += 1
                continue
            unresolved.append(
                {
                    "hunt_code": code,
                    "hunt_name": (row.get(name_col, "") if name_col else "").strip(),
                    "species": (row.get(species_col, "") if species_col else "").strip(),
                    "weapon": (row.get(weapon_col, "") if weapon_col else "").strip(),
                    "hunt_class": (row.get(class_col, "") if class_col else "").strip(),
                    "boundary_id": boundary_id,
                    "reason": "boundary_id_not_in_geojson",
                }
            )
            continue

        unresolved.append(
            {
                "hunt_code": code,
                "hunt_name": (row.get(name_col, "") if name_col else "").strip(),
                "species": (row.get(species_col, "") if species_col else "").strip(),
                "weapon": (row.get(weapon_col, "") if weapon_col else "").strip(),
                "hunt_class": (row.get(class_col, "") if class_col else "").strip(),
                "boundary_id": "",
                "reason": "missing_boundary_id_and_no_manifest",
            }
        )

    with OUT_UNRESOLVED.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["hunt_code", "hunt_name", "species", "weapon", "hunt_class", "boundary_id", "reason"],
        )
        writer.writeheader()
        writer.writerows(unresolved)

    summary = {
        "canonical_file": str(canonical_path),
        "boundary_geojson": str(geojson_path),
        "boundary_manifest": str(manifest_path),
        "canonical_rows": len(rows),
        "rows_with_hunt_code": rows_with_hunt_code,
        "mapped_by_merged_manifest": mapped_by_merged_manifest,
        "mapped_by_single_boundary_id": mapped_by_single_boundary_id,
        "mapped_by_member_boundary_fallback": mapped_by_member_boundary_fallback,
        "unresolved_rows": len(unresolved),
        "unresolved_csv": str(OUT_UNRESOLVED),
        "boundary_index_count": len(boundary_index),
        "manifest_hunt_count": len(manifest_by_hunt),
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

