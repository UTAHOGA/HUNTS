#!/usr/bin/env python3
"""
Build a canonical Utah hunt mapping artifact bundle from local source-of-truth files.

Outputs:
  - CSV
  - XLSX
  - GeoJSON
  - KML
  - KMZ
  - SQLite
  - Manifest JSON
"""

from __future__ import annotations

import csv
import json
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Sequence
from xml.sax.saxutils import escape

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_CSV = ROOT / "processed_data" / "hunt_master_canonical_2026_SOURCE_OF_TRUTH_FINAL_COMPLETE_NO_PARTIALS.csv"
CANONICAL_GEOJSON = ROOT / "processed_data" / "statewide_composite_boundaries_2026_FINAL_LOCKED.geojson"
OUT_DIR = ROOT / "data" / "utah" / "foundation_bundle_2026"

OUT_CSV = OUT_DIR / "utah_hunt_codes_canonical_2026.csv"
OUT_XLSX = OUT_DIR / "utah_hunt_codes_canonical_2026.xlsx"
OUT_GEOJSON = OUT_DIR / "utah_boundaries_canonical_2026.geojson"
OUT_KML = OUT_DIR / "utah_boundaries_canonical_2026.kml"
OUT_KMZ = OUT_DIR / "utah_boundaries_canonical_2026.kmz"
OUT_SQLITE = OUT_DIR / "utah_hunt_foundation_2026.sqlite"
OUT_MANIFEST = OUT_DIR / "manifest.json"


def _norm(v: object) -> str:
    return str(v or "").strip()


def _to_float(v: object) -> float | None:
    s = _norm(v)
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _ring_to_kml_coords(ring: Sequence[Sequence[float]]) -> str:
    out: List[str] = []
    for pt in ring:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            continue
        lon = pt[0]
        lat = pt[1]
        out.append(f"{lon},{lat},0")
    return " ".join(out)


def _iter_polygons(geometry: dict) -> Iterable[Sequence[Sequence[Sequence[float]]]]:
    if not isinstance(geometry, dict):
        return
    gtype = _norm(geometry.get("type"))
    coords = geometry.get("coordinates")
    if gtype == "Polygon" and isinstance(coords, list):
        yield coords
    elif gtype == "MultiPolygon" and isinstance(coords, list):
        for poly in coords:
            if isinstance(poly, list):
                yield poly


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = [dict(r) for r in reader]
        headers = list(reader.fieldnames or [])
    return headers, rows


def copy_csv(headers: list[str], rows: list[dict[str, str]], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def write_xlsx(headers: list[str], rows: list[dict[str, str]], out_path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "hunt_codes"
    ws.append(headers)
    for row in rows:
        ws.append([row.get(h, "") for h in headers])
    wb.save(out_path)


def write_kml(geojson_obj: dict, out_path: Path) -> int:
    features = geojson_obj.get("features")
    if not isinstance(features, list):
        features = []

    lines: List[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        "<Document>",
        "<name>Utah Hunt Boundaries 2026 Canonical</name>",
    ]
    placemark_count = 0

    for idx, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue
        props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}

        boundary_id = _norm(props.get("boundary_id") or props.get("BoundaryID") or props.get("id"))
        boundary_name = _norm(props.get("boundary_name") or props.get("Boundary_Name") or f"Boundary {idx+1}")
        description = _norm(props.get("description") or props.get("Description"))

        polygon_blocks: List[str] = []
        for polygon in _iter_polygons(geometry):
            if not polygon:
                continue
            outer = polygon[0] if len(polygon) > 0 else []
            outer_coords = _ring_to_kml_coords(outer)
            if not outer_coords:
                continue

            block = [
                "<Polygon>",
                "<outerBoundaryIs><LinearRing><coordinates>",
                escape(outer_coords),
                "</coordinates></LinearRing></outerBoundaryIs>",
            ]
            for hole in polygon[1:]:
                hole_coords = _ring_to_kml_coords(hole)
                if not hole_coords:
                    continue
                block.extend(
                    [
                        "<innerBoundaryIs><LinearRing><coordinates>",
                        escape(hole_coords),
                        "</coordinates></LinearRing></innerBoundaryIs>",
                    ]
                )
            block.append("</Polygon>")
            polygon_blocks.append("".join(block))

        if not polygon_blocks:
            continue

        placemark_count += 1
        lines.extend(
            [
                "<Placemark>",
                f"<name>{escape(boundary_name)} ({escape(boundary_id)})</name>" if boundary_id else f"<name>{escape(boundary_name)}</name>",
                f"<description>{escape(description)}</description>" if description else "<description/>",
                "<MultiGeometry>",
                *polygon_blocks,
                "</MultiGeometry>",
                "</Placemark>",
            ]
        )

    lines.extend(["</Document>", "</kml>"])
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return placemark_count


def write_kmz(kml_path: Path, kmz_path: Path) -> None:
    with zipfile.ZipFile(kmz_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(kml_path, arcname=kml_path.name)


def write_sqlite(
    db_path: Path,
    rows: list[dict[str, str]],
    geojson_obj: dict,
) -> tuple[int, int]:
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE hunts (
              hunt_code TEXT PRIMARY KEY,
              boundary_id TEXT,
              hunt_name TEXT,
              species TEXT,
              weapon TEXT,
              hunt_type TEXT,
              residency TEXT,
              source_row_json TEXT NOT NULL
            );

            CREATE TABLE boundaries (
              boundary_id TEXT PRIMARY KEY,
              boundary_name TEXT,
              member_boundary_ids TEXT,
              source_feature_json TEXT NOT NULL
            );

            CREATE INDEX idx_hunts_boundary_id ON hunts(boundary_id);
            """
        )

        hunt_count = 0
        for row in rows:
            hunt_code = _norm(row.get("hunt_code") or row.get("HuntCode") or row.get("code"))
            if not hunt_code:
                continue
            boundary_id = _norm(row.get("boundary_id") or row.get("BoundaryID"))
            hunt_name = _norm(row.get("hunt_name") or row.get("unit") or row.get("title") or row.get("hunt"))
            species = _norm(row.get("species"))
            weapon = _norm(row.get("weapon"))
            hunt_type = _norm(row.get("hunt_type") or row.get("type"))
            residency = _norm(row.get("residency"))
            cur.execute(
                """
                INSERT OR REPLACE INTO hunts(
                  hunt_code, boundary_id, hunt_name, species, weapon, hunt_type, residency, source_row_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    hunt_code,
                    boundary_id,
                    hunt_name,
                    species,
                    weapon,
                    hunt_type,
                    residency,
                    json.dumps(row, ensure_ascii=False),
                ),
            )
            hunt_count += 1

        boundary_count = 0
        features = geojson_obj.get("features")
        if isinstance(features, list):
            for feature in features:
                if not isinstance(feature, dict):
                    continue
                props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
                boundary_id = _norm(props.get("boundary_id") or props.get("BoundaryID") or props.get("id"))
                if not boundary_id:
                    continue
                boundary_name = _norm(props.get("boundary_name") or props.get("Boundary_Name"))
                members = props.get("member_boundary_ids")
                if isinstance(members, list):
                    member_boundary_ids = ",".join(_norm(x) for x in members if _norm(x))
                else:
                    member_boundary_ids = _norm(members)
                cur.execute(
                    """
                    INSERT OR REPLACE INTO boundaries(
                      boundary_id, boundary_name, member_boundary_ids, source_feature_json
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (
                        boundary_id,
                        boundary_name,
                        member_boundary_ids,
                        json.dumps(feature, ensure_ascii=False),
                    ),
                )
                boundary_count += 1

        conn.commit()
        return hunt_count, boundary_count
    finally:
        conn.close()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    headers, rows = read_csv_rows(CANONICAL_CSV)
    copy_csv(headers, rows, OUT_CSV)
    write_xlsx(headers, rows, OUT_XLSX)

    geojson_obj = json.loads(CANONICAL_GEOJSON.read_text(encoding="utf-8"))
    OUT_GEOJSON.write_text(json.dumps(geojson_obj, ensure_ascii=False), encoding="utf-8")

    placemark_count = write_kml(geojson_obj, OUT_KML)
    write_kmz(OUT_KML, OUT_KMZ)
    hunt_count, boundary_count = write_sqlite(OUT_SQLITE, rows, geojson_obj)

    unique_hunt_codes = len({(_norm(r.get("hunt_code") or r.get("HuntCode") or r.get("code"))) for r in rows if _norm(r.get("hunt_code") or r.get("HuntCode") or r.get("code"))})
    unique_boundary_ids = len({(_norm(r.get("boundary_id") or r.get("BoundaryID"))) for r in rows if _norm(r.get("boundary_id") or r.get("BoundaryID"))})
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    manifest = {
        "generated_at_utc": timestamp,
        "source": {
            "canonical_csv": str(CANONICAL_CSV.relative_to(ROOT)).replace("\\", "/"),
            "canonical_geojson": str(CANONICAL_GEOJSON.relative_to(ROOT)).replace("\\", "/"),
        },
        "outputs": {
            "csv": str(OUT_CSV.relative_to(ROOT)).replace("\\", "/"),
            "xlsx": str(OUT_XLSX.relative_to(ROOT)).replace("\\", "/"),
            "geojson": str(OUT_GEOJSON.relative_to(ROOT)).replace("\\", "/"),
            "kml": str(OUT_KML.relative_to(ROOT)).replace("\\", "/"),
            "kmz": str(OUT_KMZ.relative_to(ROOT)).replace("\\", "/"),
            "sqlite": str(OUT_SQLITE.relative_to(ROOT)).replace("\\", "/"),
        },
        "counts": {
            "hunt_rows": len(rows),
            "unique_hunt_codes": unique_hunt_codes,
            "unique_boundary_ids_in_hunt_rows": unique_boundary_ids,
            "kml_placemarks": placemark_count,
            "sqlite_hunts": hunt_count,
            "sqlite_boundaries": boundary_count,
        },
        "notes": [
            "This bundle is built from local canonical files and is reproducible.",
            "KML/KMZ geometries come from the canonical GeoJSON.",
            "SQLite stores full source JSON for each hunt row and boundary feature.",
        ],
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
