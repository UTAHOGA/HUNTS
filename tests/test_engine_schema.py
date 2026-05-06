import csv
import json
from pathlib import Path

from engine.utah.materialize_engine import materialize_engine


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def test_materializer_missing_optional_files_does_not_crash(tmp_path: Path):
    input_dir = tmp_path / "in"
    output_dir = tmp_path / "out"
    input_dir.mkdir(parents=True, exist_ok=True)

    _write_csv(
        input_dir / "draw_reality_engine.csv",
        ["hunt_code", "residency", "points", "applicants_at_level", "status", "trend"],
        [{"hunt_code": "DB1000", "residency": "Resident", "points": 5, "applicants_at_level": 10, "status": "MAX POOL", "trend": "GREEN"}],
    )
    _write_csv(
        input_dir / "hunt_master_enriched.csv",
        ["hunt_code", "species", "hunt_name"],
        [{"hunt_code": "DB1000", "species": "Deer", "hunt_name": "Demo Hunt"}],
    )

    report = materialize_engine(input_dir, output_dir)
    assert (output_dir / "draw_prediction_engine_v1.csv").exists()
    assert (output_dir / "hunt_decision_scores_v1.csv").exists()
    assert (output_dir / "point_creep_forecast_v1.csv").exists()
    assert (output_dir / "model_run_report_v1.json").exists()
    assert len(report["warnings"]) > 0


def test_hunt_code_preserved_and_not_invented(tmp_path: Path):
    input_dir = tmp_path / "in"
    output_dir = tmp_path / "out"
    input_dir.mkdir(parents=True, exist_ok=True)

    source_codes = ["DB1000", "EB2000"]
    _write_csv(
        input_dir / "draw_reality_engine.csv",
        ["hunt_code", "residency", "points", "applicants_at_level", "projected_guaranteed_draws_at_point", "status", "trend"],
        [
            {"hunt_code": "DB1000", "residency": "Resident", "points": 4, "applicants_at_level": 8, "projected_guaranteed_draws_at_point": 2, "status": "OPEN", "trend": "YELLOW"},
            {"hunt_code": "EB2000", "residency": "Resident", "points": 7, "applicants_at_level": 6, "projected_guaranteed_draws_at_point": 1, "status": "OPEN", "trend": "GREEN"},
        ],
    )
    _write_csv(
        input_dir / "hunt_master_enriched.csv",
        ["hunt_code", "species", "hunt_name"],
        [
            {"hunt_code": "DB1000", "species": "Deer", "hunt_name": "Demo Hunt A"},
            {"hunt_code": "EB2000", "species": "Elk", "hunt_name": "Demo Hunt B"},
        ],
    )

    materialize_engine(input_dir, output_dir)

    with (output_dir / "draw_prediction_engine_v1.csv").open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    out_codes = {row["hunt_code"] for row in rows}
    assert out_codes.issubset(set(source_codes))
    assert "DB1000" in out_codes

    report = json.loads((output_dir / "model_run_report_v1.json").read_text(encoding="utf-8"))
    assert report["validations"]["draw_codes_ok"] is True
