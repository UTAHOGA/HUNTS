from __future__ import annotations

from pathlib import Path

from engine.utah.backtest import count_false_guarantees
from engine.utah.constants import LEGACY_OUTPUT_FIELDS, REQUIRED_MODELED_FIELDS
from engine.utah.materialize import materialize_row, materialize_rows, write_materialized_csv
from engine.utah.models import PredictionAggregate


def test_materializer_outputs_modeled_columns():
    row = materialize_row(
        PredictionAggregate(
            draw_year=2026,
            hunt_code="db1001",
            residency="Resident",
            points=4,
            p_draw_mean=0.6,
            p_draw_p10=0.4,
            p_draw_p50=0.6,
            p_draw_p90=0.8,
            p_reserved_mean=0.2,
            p_random_mean=0.4,
            p_preference_mean=0.0,
            p_youth_mean=0.0,
            expected_cutoff_points=4.0,
            cutoff_bucket_probability=0.6,
            guaranteed_probability=0.0,
            reason_codes=("FIRST_CHOICE_ONLY_PUBLIC_DATA",),
            display_odds_pct=60.0,
        )
    )
    for field in REQUIRED_MODELED_FIELDS:
        assert field in row


def test_materializer_outputs_legacy_columns(tmp_path: Path):
    rows = materialize_rows(
        [
            PredictionAggregate(
                draw_year=2026,
                hunt_code="db1001",
                residency="Resident",
                points=4,
                p_draw_mean=0.6,
                p_draw_p10=0.4,
                p_draw_p50=0.6,
                p_draw_p90=0.8,
                p_reserved_mean=0.2,
                p_random_mean=0.4,
                p_preference_mean=0.0,
                p_youth_mean=0.0,
                expected_cutoff_points=4.0,
                cutoff_bucket_probability=0.6,
                guaranteed_probability=0.0,
                reason_codes=("FIRST_CHOICE_ONLY_PUBLIC_DATA",),
                display_odds_pct=60.0,
            )
        ]
    )
    output_path = tmp_path / "draw_reality_engine.csv"
    write_materialized_csv(output_path, rows)
    text = output_path.read_text(encoding="utf-8").splitlines()[0]
    for field in ["hunt_code", "residency", "points", *LEGACY_OUTPUT_FIELDS]:
        assert field in text


def test_materializer_preserves_explicit_status():
    row = materialize_row(
        {
            "draw_year": 2026,
            "hunt_code": "db1002",
            "residency": "Resident",
            "points": 7,
            "p_draw_mean": 0.42,
            "p_draw_p10": 0.18,
            "p_draw_p50": 0.42,
            "p_draw_p90": 0.65,
            "p_reserved_mean": 0.0,
            "p_random_mean": 0.42,
            "p_preference_mean": 0.0,
            "p_youth_mean": 0.0,
            "expected_cutoff_points": 7.0,
            "cutoff_bucket_probability": 0.42,
            "guaranteed_probability": 0.0,
            "reason_codes": ("FIRST_CHOICE_ONLY_PUBLIC_DATA",),
            "display_odds_pct": 42.0,
            "status": "MAX POOL",
            "trend": "YELLOW",
            "draw_outlook": "MAY DRAW IN 5-10 YEARS",
        }
    )
    assert row["status"] == "MAX POOL"
    assert row["draw_outlook"] == "MAY DRAW IN 5-10 YEARS"
    assert row["trend"] == "YELLOW"


def test_backtest_false_guaranteed_count():
    predictions = [
        {"hunt_code": "DB1", "residency": "Resident", "points": 5, "guaranteed_probability": 0.999},
        {"hunt_code": "DB2", "residency": "Resident", "points": 5, "guaranteed_probability": 0.5},
    ]
    actual = {("DB1", "Resident", 5): False, ("DB2", "Resident", 5): True}
    assert count_false_guarantees(predictions, actual) == 1
