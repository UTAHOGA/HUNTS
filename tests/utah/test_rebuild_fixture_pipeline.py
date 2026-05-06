from __future__ import annotations

import csv
import subprocess
import sys
from hashlib import sha256
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def _digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _run_materialize(output_dir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "engine.utah.materialize",
            "--input-dir",
            "data/utah/fixtures",
            "--output-dir",
            str(output_dir),
            "--draw-year",
            "2026",
            "--iterations",
            "10000",
            "--seed",
            "2026",
            "--model-version",
            "hybrid_ml_v1.0.0",
            "--rule-version",
            "utah_draw_model_v1.0.0",
            "--quota-source",
            "fixture",
            "--applicant-pool-source",
            "fixture",
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )


def test_materialize_cli_rebuild_is_reproducible(tmp_path: Path):
    first_root = tmp_path / "first"
    second_root = tmp_path / "second"

    first_result = _run_materialize(first_root)
    second_result = _run_materialize(second_root)

    assert "draw_reality_engine.csv" in first_result.stdout
    assert "point_ladder_view.csv" in first_result.stdout
    assert "hunt_master_enriched.csv" in first_result.stdout
    assert "hunt_unit_reference_linked.csv" in first_result.stdout

    for name in ("draw_reality_engine.csv", "point_ladder_view.csv", "hunt_master_enriched.csv", "hunt_unit_reference_linked.csv"):
        first_path = first_root / name
        second_path = second_root / name
        assert first_path.exists()
        assert second_path.exists()
        assert _digest(first_path) == _digest(second_path)


def test_materialize_cli_preserves_row_key_and_modeled_fields(tmp_path: Path):
    output_root = tmp_path / "processed_data"
    _run_materialize(output_root)

    draw_rows = list(csv.DictReader((output_root / "draw_reality_engine.csv").open(encoding="utf-8")))
    row = next(r for r in draw_rows if r["hunt_code"] == "DB1002" and r["residency"] == "Resident" and r["points"] == "7")
    assert row["status"] == "MAX POOL"
    assert row["p_draw_mean"] == "0.420"
    assert row["display_odds_pct"] == "42.000"

    ladder_rows = list(csv.DictReader((output_root / "point_ladder_view.csv").open(encoding="utf-8")))
    assert any(r["hunt_code"] == "DB1002" and r["residency"] == "Resident" and r["points"] == "7" for r in ladder_rows)

    master_rows = list(csv.DictReader((output_root / "hunt_master_enriched.csv").open(encoding="utf-8")))
    assert any(r["hunt_code"] == "DB1002" and r["residency"] == "Resident" for r in master_rows)

    reference_rows = list(csv.DictReader((output_root / "hunt_unit_reference_linked.csv").open(encoding="utf-8")))
    assert any(r["hunt_code"] == "DB1002" and r["residency"] == "Resident" for r in reference_rows)
