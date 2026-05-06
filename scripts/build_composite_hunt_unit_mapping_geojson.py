#!/usr/bin/env python3
"""
Build a canonical composite-hunt-unit mapping GeoJSON from local Utah sources.

Primary inputs:
  - processed_data/hunt_master_canonical_2026_SOURCE_OF_TRUTH_FINAL_COMPLETE_NO_PARTIALS.csv
  - processed_data/statewide_composite_boundaries_2026_FINAL_LOCKED.geojson
  - pipeline/RAW/hunt_unit_mapping/geojson/*.geojson
  - pipeline/RAW/hunt_unit_database/2026/kmz/*.kml (optional, used for special hunts)
"""

from __future__ import annotations

import csv
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_CSV = ROOT / "processed_data" / "hunt_master_canonical_2026_SOURCE_OF_TRUTH_FINAL_COMPLETE_NO_PARTIALS.csv"
LOCKED_GEOJSON = ROOT / "processed_data" / "statewide_composite_boundaries_2026_FINAL_LOCKED.geojson"
RAW_GEO_DIR = ROOT / "pipeline" / "RAW" / "hunt_unit_mapping" / "geojson"
RAW_KML_DIR = ROOT / "pipeline" / "RAW" / "hunt_unit_database" / "2026" / "kmz"

OUT_GEOJSON = ROOT / "processed_data" / "composite_hunt_unit_mapping_2026.geojson"
OUT_REPORT = ROOT / "processed_data" / "composite_hunt_unit_mapping_2026_report.json"

SPECIAL_TOKEN_HUNTCODE = {
    "DB0008_EXT_ARCH_2026": "DB0008",
    "EA2000_CONTROL_2026": "EA2000",
    "EX1000_EXT_ARCH_2026": "EX1000",
    "EB1005_SPECIAL_2026": "EB1005",
    "EB1011_SPECIAL_2026": "EB1011",
}

# Direct token->KML sources for composites that are not keyed by hunt code in filenames.
TOKEN_DIRECT_KML_SOURCES = {
    "SW_BLACK_BEAR_2026": [
        ROOT / "pipeline" / "RAW" / "hunt_unit_database" / "2026" / "kmz" / "extracted_black_bear_pursuit" / "doc.kml",
        ROOT / "pipeline" / "RAW" / "hunt_unit_mapping" / "kml" / "br1007.kmz",
    ],
    "SW_COUGAR_2026": [
        ROOT / "pipeline" / "RAW" / "hunt_unit_mapping" / "kml" / "cg9999  cougar.kmz",
        ROOT / "pipeline" / "RAW" / "hunt_unit_mapping" / "kml" / "UtahCougarManagementUnits.kml",
    ],
    "SW_DEER_2026": [
        ROOT / "pipeline" / "RAW" / "hunt_unit_mapping" / "kml" / "db0007.kmz",
    ],
}

# Thematic fallback mapping (used when direct lookup rows are not present).
THEMATIC_TOKEN_HINTS = {
    "SW_BISON_2026": "2026BisonOnce_in_a_Lifetime2_",
    "SW_RM_BIGHORN_2026": "2026RockyMountainBighornSheepOnce_in_a_Lifetime2_",
    "SW_MOUNTAIN_GOAT_2026": "2026MountainGoatOnce_in_a_Lifetime2_",
    "SW_PRONGHORN_2026": "2026PronghornLimitedEntry_",
    "SW_ELK_ANYBULL_2026": "2026ElkBullGeneralSeasonAnyBull2_",
    "SW_ELK_SPIKE_2026": "2026ElkBullGeneralSeasonSpikeOnly1_",
    "SW_ELK_2026": "2026ElkBullLimitedEntry2_",
    "SW_DEER_2026": "2026MuleDeerGeneralSeason2_",
    "SW_MOOSE_2026": "2026MooseOnce_in_a_Lifetime2_",
    "SW_BLACK_BEAR_2026": "black bear pursuit",
    "SW_COUGAR_2026": "Utah_Cougar_Management_Units",
    "SW_TURKEY_MGMT_2026": "Fall_Turkey_Hunt_Boundaries_",
}

# Name aliases for thematic name->boundary id matching.
NAME_ALIASES = {
    "nebo, moroni hills": ["nebo", "moroni hills"],
    "la sal mtns": ["la sal, la sal mtns"],
    "dolores triangle": ["la sal, dolores triangle"],
}


def norm(v: object) -> str:
    return str(v or "").strip()


def norm_lower(v: object) -> str:
    s = norm(v).lower()
    s = re.sub(r"\s+", " ", s)
    return s


def is_numeric_boundary_id(value: str) -> bool:
    return bool(re.fullmatch(r"\d+", value))


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def geometry_to_multipolygon_parts(geometry: dict) -> List[list]:
    if not isinstance(geometry, dict):
        return []
    gtype = norm(geometry.get("type"))
    coords = geometry.get("coordinates")
    if gtype == "Polygon" and isinstance(coords, list):
        return [coords]
    if gtype == "MultiPolygon" and isinstance(coords, list):
        return [poly for poly in coords if isinstance(poly, list)]
    return []


def geometry_from_member_ids(member_ids: Sequence[str], geometry_by_boundary_id: Dict[str, dict]) -> Optional[dict]:
    mp: List[list] = []
    for bid in member_ids:
        geom = geometry_by_boundary_id.get(bid)
        if not geom:
            continue
        mp.extend(geometry_to_multipolygon_parts(geom))
    if not mp:
        return None
    return {"type": "MultiPolygon", "coordinates": mp}


def parse_boundary_ids_from_kml_text(text: str) -> Set[str]:
    return set(re.findall(r"<td>BoundaryID</td><td>(\d+)</td>", text))


def parse_boundary_ids_from_kmz(path: Path) -> Set[str]:
    ids: Set[str] = set()
    try:
        with zipfile.ZipFile(path, "r") as zf:
            kml_names = [n for n in zf.namelist() if n.lower().endswith(".kml")]
            for kml_name in kml_names:
                txt = zf.read(kml_name).decode("utf-8", errors="ignore")
                ids |= parse_boundary_ids_from_kml_text(txt)
    except Exception:
        return set()
    return ids


def find_kml_members_for_hunt_code(hunt_code: str) -> Tuple[Set[str], List[str]]:
    hunt_code_l = hunt_code.lower()
    ids: Set[str] = set()
    files_used: List[str] = []
    if not RAW_KML_DIR.exists():
        return ids, files_used

    candidates: List[Path] = []
    for p in RAW_KML_DIR.glob("*.kml"):
        if hunt_code_l in p.name.lower():
            candidates.append(p)
    for p in RAW_KML_DIR.glob("*.kmz"):
        if hunt_code_l in p.name.lower():
            candidates.append(p)
    # Also include common special aliases.
    if hunt_code_l == "db0008":
        alias = RAW_KML_DIR / "db0008_extended_archery_deer_doc.kml"
        if alias.exists():
            candidates.append(alias)
    if hunt_code_l == "ex1000":
        alias = RAW_KML_DIR / "ex1000_extended_archery_elk_doc.kml"
        if alias.exists():
            candidates.append(alias)

    seen_paths = set()
    unique_candidates: List[Path] = []
    for c in candidates:
        if c in seen_paths:
            continue
        seen_paths.add(c)
        unique_candidates.append(c)

    for p in unique_candidates:
        if p.suffix.lower() == ".kml":
            txt = p.read_text(encoding="utf-8", errors="ignore")
            found = parse_boundary_ids_from_kml_text(txt)
            if found:
                ids.update(found)
                files_used.append(str(p.relative_to(ROOT)).replace("\\", "/"))
        elif p.suffix.lower() == ".kmz":
            found = parse_boundary_ids_from_kmz(p)
            if found:
                ids.update(found)
            files_used.append(str(p.relative_to(ROOT)).replace("\\", "/"))
    return ids, files_used


def find_kml_members_for_token(token: str) -> Tuple[Set[str], List[str]]:
    ids: Set[str] = set()
    files_used: List[str] = []
    for path in TOKEN_DIRECT_KML_SOURCES.get(token, []):
        if not path.exists():
            continue
        if path.suffix.lower() == ".kml":
            txt = path.read_text(encoding="utf-8", errors="ignore")
            found = parse_boundary_ids_from_kml_text(txt)
            if found:
                ids |= found
                files_used.append(str(path.relative_to(ROOT)).replace("\\", "/"))
        elif path.suffix.lower() == ".kmz":
            found = parse_boundary_ids_from_kmz(path)
            if found:
                ids |= found
            files_used.append(str(path.relative_to(ROOT)).replace("\\", "/"))
    return ids, files_used


def collect_raw_geojson_features() -> List[Tuple[Path, dict]]:
    out: List[Tuple[Path, dict]] = []
    if not RAW_GEO_DIR.exists():
        return out
    for path in sorted(RAW_GEO_DIR.glob("*.geojson")):
        try:
            data = load_json(path)
        except Exception:
            continue
        features = data.get("features")
        if not isinstance(features, list):
            continue
        for ft in features:
            if isinstance(ft, dict):
                out.append((path, ft))
    return out


def extract_boundary_id(props: dict) -> str:
    for k in ("BoundaryID", "boundary_id", "BOUNDARY_ID", "boundaryId"):
        v = norm(props.get(k))
        if is_numeric_boundary_id(v):
            return v
    return ""


def extract_boundary_name(props: dict) -> str:
    for k in ("Boundary_Name", "boundary_name", "BOUNDARY_NAME", "Boundary_N", "boundaryName"):
        v = norm(props.get(k))
        if v:
            return v
    return ""


def canonicalize_member_ids(values: Iterable[str]) -> List[str]:
    nums = [v for v in values if is_numeric_boundary_id(v)]
    return sorted(set(nums), key=lambda s: int(s))


def ids_from_thematic_layer(
    token: str,
    raw_features: List[Tuple[Path, dict]],
    name_to_ids: Dict[str, Set[str]],
) -> Tuple[Set[str], List[str], List[str]]:
    hint = THEMATIC_TOKEN_HINTS.get(token, "")
    if not hint:
        return set(), [], []

    matched_features: List[Tuple[Path, dict]] = [
        (p, ft) for (p, ft) in raw_features if hint.lower() in p.name.lower()
    ]
    if not matched_features:
        return set(), [], []

    ids: Set[str] = set()
    unresolved_names: List[str] = []
    files = sorted(
        {str(p.relative_to(ROOT)).replace("\\", "/") for (p, _) in matched_features}
    )

    for _, ft in matched_features:
        props = ft.get("properties") if isinstance(ft.get("properties"), dict) else {}
        direct_id = extract_boundary_id(props)
        if direct_id:
            ids.add(direct_id)
            continue

        bname = norm_lower(extract_boundary_name(props))
        if not bname:
            continue
        candidates = name_to_ids.get(bname, set())
        if not candidates and bname in NAME_ALIASES:
            for alias in NAME_ALIASES[bname]:
                candidates |= name_to_ids.get(norm_lower(alias), set())
        if candidates:
            ids |= candidates
        else:
            unresolved_names.append(bname)

    return ids, files, sorted(set(unresolved_names))


def main() -> None:
    if not CANONICAL_CSV.exists():
        raise FileNotFoundError(f"Missing canonical CSV: {CANONICAL_CSV}")
    if not LOCKED_GEOJSON.exists():
        raise FileNotFoundError(f"Missing locked geojson: {LOCKED_GEOJSON}")

    # Load canonical hunt rows.
    hunt_rows: List[dict] = []
    with CANONICAL_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            hunt_rows.append(dict(row))

    # Collect composite tokens from canonical csv (non-numeric boundary ids).
    token_to_hunt_codes: Dict[str, Set[str]] = {}
    for row in hunt_rows:
        hunt_code = norm(row.get("hunt_code")).upper()
        token = norm(row.get("boundary_id"))
        if hunt_code and token and not is_numeric_boundary_id(token):
            token_to_hunt_codes.setdefault(token, set()).add(hunt_code)

    raw_features = collect_raw_geojson_features()

    # Build boundary geometry and name lookup from all raw geojsons with numeric boundary ids.
    geometry_by_boundary_id: Dict[str, dict] = {}
    name_to_ids: Dict[str, Set[str]] = {}
    huntnbr_to_ids: Dict[str, Set[str]] = {}
    source_files_with_boundary_ids: Set[str] = set()

    for path, ft in raw_features:
        props = ft.get("properties") if isinstance(ft.get("properties"), dict) else {}
        geom = ft.get("geometry") if isinstance(ft.get("geometry"), dict) else None
        bid = extract_boundary_id(props)
        if bid:
            if geom and bid not in geometry_by_boundary_id:
                geometry_by_boundary_id[bid] = geom
            bname = norm_lower(extract_boundary_name(props))
            if bname:
                name_to_ids.setdefault(bname, set()).add(bid)
            source_files_with_boundary_ids.add(str(path.relative_to(ROOT)).replace("\\", "/"))

        hunt_nbr = norm(props.get("HUNT_NBR")).upper()
        bound_id_from_hunt = norm(props.get("BOUNDARY_ID"))
        if hunt_nbr and is_numeric_boundary_id(bound_id_from_hunt):
            huntnbr_to_ids.setdefault(hunt_nbr, set()).add(bound_id_from_hunt)

    # Also include locked geojson geometries.
    locked = load_json(LOCKED_GEOJSON)
    locked_features = locked.get("features", [])
    locked_props_by_token: Dict[str, dict] = {}
    if isinstance(locked_features, list):
        for ft in locked_features:
            if not isinstance(ft, dict):
                continue
            props = ft.get("properties") if isinstance(ft.get("properties"), dict) else {}
            token = norm(props.get("boundary_id"))
            if token:
                locked_props_by_token[token] = props
            bid = extract_boundary_id(props)
            geom = ft.get("geometry") if isinstance(ft.get("geometry"), dict) else None
            if bid and geom and bid not in geometry_by_boundary_id:
                geometry_by_boundary_id[bid] = geom
            bname = norm_lower(extract_boundary_name(props))
            if bname and bid:
                name_to_ids.setdefault(bname, set()).add(bid)

    features_out: List[dict] = []
    resolution_report: List[dict] = []
    next_assigned_id = 900001

    for token in sorted(token_to_hunt_codes.keys()):
        hunt_codes = sorted(token_to_hunt_codes[token])
        sources_used: List[str] = []
        unresolved_names: List[str] = []
        member_ids: Set[str] = set()
        methods: List[str] = []

        # 0) Token-direct KML/KMZ sources (highest priority when present).
        token_kml_ids, token_kml_files = find_kml_members_for_token(token)
        if token_kml_ids:
            member_ids |= token_kml_ids
            methods.append("token_kml_boundaryid_extract")
            sources_used.extend(token_kml_files)

        # 1) Locked composite members
        locked_props = locked_props_by_token.get(token, {})
        members_locked = locked_props.get("member_boundary_ids")
        if not member_ids and isinstance(members_locked, list) and members_locked:
            member_ids |= {norm(x) for x in members_locked if is_numeric_boundary_id(norm(x))}
            methods.append("locked_composite_members")
            sources_used.append(str(LOCKED_GEOJSON.relative_to(ROOT)).replace("\\", "/"))

        # 2) HUNT_NBR direct mapping table (for hunt codes like EB1005, EB1011, etc.)
        for hunt_code in hunt_codes:
            if hunt_code in huntnbr_to_ids:
                member_ids |= huntnbr_to_ids[hunt_code]
                methods.append("raw_hunt_nbr_boundary_lookup")
                sources_used.append("pipeline/RAW/hunt_unit_mapping/geojson/Utah_Big_Game_Hunt_Boundaries_2025_6436098792055257511.geojson")

        # 3) KML/KMZ special docs keyed by hunt code.
        special_hunt = SPECIAL_TOKEN_HUNTCODE.get(token)
        if special_hunt:
            ids_from_kml, files = find_kml_members_for_hunt_code(special_hunt)
            if ids_from_kml:
                member_ids |= ids_from_kml
                methods.append("special_kml_boundaryid_extract")
            sources_used.extend(files)

        # 4) Thematic layer fallback by boundary name matching.
        if not member_ids:
            thematic_ids, thematic_files, unresolved = ids_from_thematic_layer(token, raw_features, name_to_ids)
            if thematic_ids:
                member_ids |= thematic_ids
                methods.append("thematic_layer_name_match")
                sources_used.extend(thematic_files)
            if unresolved:
                unresolved_names.extend(unresolved)

        member_ids_sorted = canonicalize_member_ids(member_ids)
        geometry = geometry_from_member_ids(member_ids_sorted, geometry_by_boundary_id)
        assigned_boundary_id = str(next_assigned_id)
        next_assigned_id += 1

        feature = {
            "type": "Feature",
            "properties": {
                "boundary_id": token,
                "assigned_boundary_id": assigned_boundary_id,
                "hunt_codes": hunt_codes,
                "member_boundary_ids": member_ids_sorted,
                "member_count": len(member_ids_sorted),
                "resolution_methods": sorted(set(methods)),
                "sources_used": sorted(set(sources_used)),
                "unresolved_member_names": sorted(set(unresolved_names)),
            },
            "geometry": geometry,
        }
        features_out.append(feature)

        resolution_report.append(
            {
                "boundary_id": token,
                "hunt_codes": hunt_codes,
                "member_count": len(member_ids_sorted),
                "member_boundary_ids": member_ids_sorted,
                "resolution_methods": sorted(set(methods)),
                "sources_used": sorted(set(sources_used)),
                "unresolved_member_names": sorted(set(unresolved_names)),
                "has_geometry": geometry is not None,
            }
        )

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out_fc = {
        "type": "FeatureCollection",
        "metadata": {
            "generated_at_utc": generated_at,
            "source_canonical_csv": str(CANONICAL_CSV.relative_to(ROOT)).replace("\\", "/"),
            "source_locked_geojson": str(LOCKED_GEOJSON.relative_to(ROOT)).replace("\\", "/"),
            "source_raw_geojson_dir": str(RAW_GEO_DIR.relative_to(ROOT)).replace("\\", "/"),
            "source_raw_kml_dir": str(RAW_KML_DIR.relative_to(ROOT)).replace("\\", "/"),
            "feature_count": len(features_out),
            "notes": [
                "This file maps canonical composite boundary tokens to explicit numeric member boundary IDs.",
                "Assigned boundary IDs are synthetic stable IDs for composite tokens in this build run.",
                "Geometry is assembled from member boundary polygons where available.",
            ],
        },
        "features": features_out,
    }

    OUT_GEOJSON.write_text(json.dumps(out_fc, ensure_ascii=False), encoding="utf-8")

    report = {
        "generated_at_utc": generated_at,
        "feature_count": len(features_out),
        "composites_with_members": sum(1 for r in resolution_report if r["member_count"] > 0),
        "composites_missing_members": [r["boundary_id"] for r in resolution_report if r["member_count"] == 0],
        "composites_missing_geometry": [r["boundary_id"] for r in resolution_report if not r["has_geometry"]],
        "source_files_with_boundary_ids_count": len(source_files_with_boundary_ids),
        "resolution": resolution_report,
    }
    OUT_REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps({
        "out_geojson": str(OUT_GEOJSON.relative_to(ROOT)).replace("\\", "/"),
        "out_report": str(OUT_REPORT.relative_to(ROOT)).replace("\\", "/"),
        "feature_count": len(features_out),
        "composites_with_members": report["composites_with_members"],
        "missing_members": report["composites_missing_members"],
    }, indent=2))


if __name__ == "__main__":
    main()
