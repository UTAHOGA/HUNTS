#!/usr/bin/env python3
import argparse
import json
import sqlite3
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def detect_records(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("records"), list):
        return payload["records"]
    raise ValueError("Canonical payload must be a list or { records: [...] }")


def first_non_empty(record, keys):
    for key in keys:
        value = record.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def norm_text(value):
    if value is None:
        return ""
    return str(value).strip()


def parse_id_list(value):
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(parse_id_list(item))
        return [v for v in [norm_text(v) for v in out] if v]

    text = norm_text(value)
    if not text:
        return []

    if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
        try:
            return parse_id_list(json.loads(text))
        except Exception:
            pass

    for delim in [",", "|", ";", "/"]:
        if delim in text:
            return [v for v in [norm_text(v) for v in text.split(delim)] if v]

    return [text]


def build_db(canonical_records, boundary_geojson, output_db: Path):
    if output_db.exists():
        output_db.unlink()

    con = sqlite3.connect(str(output_db))
    cur = con.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")

    cur.execute(
        """
        CREATE TABLE hunts (
          row_id INTEGER PRIMARY KEY,
          hunt_code TEXT NOT NULL,
          boundary_id TEXT,
          unit_name TEXT,
          species TEXT,
          weapon TEXT,
          sex TEXT,
          hunt_type TEXT,
          raw_json TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE boundary_features (
          feature_id INTEGER PRIMARY KEY,
          boundary_id TEXT,
          boundary_name TEXT,
          member_boundary_ids_json TEXT,
          member_count INTEGER,
          geometry_json TEXT NOT NULL,
          properties_json TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE boundary_feature_member_ids (
          feature_id INTEGER NOT NULL,
          member_boundary_id TEXT NOT NULL,
          PRIMARY KEY (feature_id, member_boundary_id),
          FOREIGN KEY (feature_id) REFERENCES boundary_features(feature_id)
        )
        """
    )

    hunt_rows = []
    for record in canonical_records:
        hunt_rows.append(
            (
                first_non_empty(record, ["huntCode", "HuntCode", "hunt_code", "code"]),
                first_non_empty(record, ["boundaryId", "BoundaryID", "boundary_id", "originalBoundaryId"]),
                first_non_empty(record, ["unitName", "UnitName", "unit_name", "dwr_unit_name"]),
                first_non_empty(record, ["species", "Species"]),
                first_non_empty(record, ["weapon", "Weapon"]),
                first_non_empty(record, ["sex", "Sex", "sexType", "sex_type"]),
                first_non_empty(record, ["huntType", "HuntType", "hunt_type", "type"]),
                json.dumps(record, ensure_ascii=False, separators=(",", ":")),
            )
        )

    cur.executemany(
        """
        INSERT INTO hunts (
          hunt_code, boundary_id, unit_name, species, weapon, sex, hunt_type, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        hunt_rows,
    )

    features = boundary_geojson.get("features", []) if isinstance(boundary_geojson, dict) else []
    feature_rows = []
    member_rows = []

    for idx, feature in enumerate(features, start=1):
        props = feature.get("properties") or {}
        geom = feature.get("geometry")
        boundary_id = first_non_empty(props, ["BoundaryID", "boundary_id", "Boundary_Id", "BOUNDARYID"])
        boundary_name = first_non_empty(props, ["Boundary_Name", "boundary_name", "NAME", "Name"])
        member_ids = parse_id_list(props.get("member_boundary_ids", props.get("memberBoundaryIds")))

        feature_rows.append(
            (
                idx,
                boundary_id,
                boundary_name,
                json.dumps(member_ids, ensure_ascii=False),
                len(member_ids),
                json.dumps(geom, ensure_ascii=False, separators=(",", ":")),
                json.dumps(props, ensure_ascii=False, separators=(",", ":")),
            )
        )
        for member_id in sorted(set(member_ids)):
            member_rows.append((idx, member_id))

    cur.executemany(
        """
        INSERT INTO boundary_features (
          feature_id, boundary_id, boundary_name, member_boundary_ids_json, member_count, geometry_json, properties_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        feature_rows,
    )

    if member_rows:
        cur.executemany(
            "INSERT INTO boundary_feature_member_ids (feature_id, member_boundary_id) VALUES (?, ?)",
            member_rows,
        )

    cur.execute("CREATE INDEX idx_hunts_hunt_code ON hunts(hunt_code)")
    cur.execute("CREATE INDEX idx_hunts_boundary_id ON hunts(boundary_id)")
    cur.execute("CREATE INDEX idx_boundary_features_boundary_id ON boundary_features(boundary_id)")
    cur.execute("CREATE INDEX idx_boundary_member_ids_member_id ON boundary_feature_member_ids(member_boundary_id)")

    con.commit()
    con.close()

    return {
        "hunt_rows": len(hunt_rows),
        "boundary_features": len(feature_rows),
        "boundary_member_rows": len(member_rows),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Build a synchronized SQLite from canonical hunt JSON and boundary GeoJSON."
    )
    parser.add_argument("--canonical-json", type=Path, default=Path("data/hunt-master-canonical.json"))
    parser.add_argument("--boundary-geojson", type=Path, default=Path("data/hunt_boundaries.geojson"))
    parser.add_argument("--output-db", type=Path, default=Path("processed_data/hunt_truth_from_json.sqlite"))
    args = parser.parse_args()

    canonical_payload = load_json(args.canonical_json)
    canonical_records = detect_records(canonical_payload)
    boundary_geojson = load_json(args.boundary_geojson)

    result = build_db(canonical_records, boundary_geojson, args.output_db)

    print(
        json.dumps(
            {
                "canonical_json": str(args.canonical_json),
                "boundary_geojson": str(args.boundary_geojson),
                "output_db": str(args.output_db),
                **result,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
