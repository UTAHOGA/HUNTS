#!/usr/bin/env python3
import csv
import json
from pathlib import Path


REPO = Path(r"D:\DOCUMENTS\GitHub\HUNTS")
CANON = REPO / "processed_data" / "hunt_master_canonical_2026_priority_ordered_SOURCE_OF_TRUTH_APPLIED.csv"
GEOJSON = REPO / "data" / "hunt_boundaries_finalized_2026.geojson"
OUT_UNRESOLVED = REPO / "processed_data" / "unresolved_hunt_boundaries_2026.csv"
OUT_SUMMARY = REPO / "processed_data" / "boundary_mapping_status_2026.json"
OUT_INDEX = REPO / "processed_data" / "boundary_geometry_index_2026.json"


def pick(cols, cands):
    low = {c.lower(): c for c in cols}
    for cand in cands:
        if cand in low:
            return low[cand]
    return None


def norm_boundary_id(v):
    if v is None:
        return ""
    s = str(v).strip()
    if not s:
        return ""
    if s in {"0", "0.0"}:
        return "0"
    if s.replace(".", "", 1).isdigit():
        return str(int(float(s)))
    return s


def main():
    jd = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = jd.get("features", [])

    boundary_geom = {}
    for f in feats:
        p = f.get("properties", {}) or {}
        bid = norm_boundary_id(p.get("boundary_id", p.get("BoundaryID")))
        if bid and bid != "0":
            boundary_geom[bid] = f.get("geometry")

    OUT_INDEX.write_text(
        json.dumps(
            {"count": len(boundary_geom), "keys_sample": list(boundary_geom.keys())[:20]},
            indent=2,
        ),
        encoding="utf-8",
    )

    with CANON.open("r", encoding="utf-8-sig", newline="") as f:
        rr = csv.DictReader(f)
        rows = list(rr)

    cols = list(rows[0].keys()) if rows else []
    bid_col = pick(cols, ["boundary_id", "boundaryid", "boundary id"])
    code_col = pick(cols, ["hunt_code", "hunt code", "hunt_number"])
    name_col = pick(cols, ["hunt_name", "hunt name"])
    species_col = pick(cols, ["species"])
    weapon_col = pick(cols, ["weapon"])
    class_col = pick(cols, ["hunt_type", "hunt class", "hunt_class"])

    unresolved = []
    with_bid = 0
    mapped = 0
    rows_with_code = 0

    for r in rows:
        code = (r.get(code_col, "") if code_col else "").strip()
        if not code:
            continue
        rows_with_code += 1

        bid = norm_boundary_id(r.get(bid_col, "") if bid_col else "")
        if bid and bid != "0":
            with_bid += 1
            if bid in boundary_geom:
                mapped += 1
            else:
                unresolved.append(
                    {
                        "hunt_code": code,
                        "hunt_name": (r.get(name_col, "") if name_col else "").strip(),
                        "species": (r.get(species_col, "") if species_col else "").strip(),
                        "weapon": (r.get(weapon_col, "") if weapon_col else "").strip(),
                        "hunt_class": (r.get(class_col, "") if class_col else "").strip(),
                        "boundary_id": bid,
                        "reason": "boundary_id_not_in_geojson",
                    }
                )
        else:
            unresolved.append(
                {
                    "hunt_code": code,
                    "hunt_name": (r.get(name_col, "") if name_col else "").strip(),
                    "species": (r.get(species_col, "") if species_col else "").strip(),
                    "weapon": (r.get(weapon_col, "") if weapon_col else "").strip(),
                    "hunt_class": (r.get(class_col, "") if class_col else "").strip(),
                    "boundary_id": bid,
                    "reason": "missing_boundary_id",
                }
            )

    with OUT_UNRESOLVED.open("w", encoding="utf-8", newline="") as f:
        fields = ["hunt_code", "hunt_name", "species", "weapon", "hunt_class", "boundary_id", "reason"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(unresolved)

    summary = {
        "canonical_file": str(CANON),
        "boundary_geojson": str(GEOJSON),
        "canonical_rows": len(rows),
        "rows_with_hunt_code": rows_with_code,
        "rows_with_boundary_id": with_bid,
        "rows_with_boundary_id_and_geometry": mapped,
        "unresolved_rows": len(unresolved),
        "unresolved_csv": str(OUT_UNRESOLVED),
        "boundary_index_count": len(boundary_geom),
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

