from __future__ import annotations

import csv
from pathlib import Path


def test_max_pool_not_automatic_100():
    text = Path("hunt-research.js").read_text(encoding="utf-8")
    assert "if (row.status === 'MAX POOL') return 100;" not in text
    assert "status === 'MAX POOL' && !hasModeledProbabilityFields(row)" in text


def test_frontend_uses_modeled_probability_before_legacy_max_pool():
    text = Path("hunt-research.js").read_text(encoding="utf-8")
    start = text.index("function getDisplayedOdds(row)")
    end = text.index("function isPreferenceAntlerless(meta)")
    block = text[start:end]
    assert "display_odds_pct" in block
    assert "p_draw_mean" in block
    assert block.index("display_odds_pct") < block.index("odds_2026_projected")


def test_fixture_row_with_max_pool_and_modeled_probability_exists():
    rows = list(csv.DictReader(Path("data/utah/fixtures/draw_reality_engine.csv").open(encoding="utf-8")))
    row = next(r for r in rows if r["status"] == "MAX POOL")
    assert row["p_draw_mean"] == "0.420"
    assert row["guaranteed_probability"] == "0.000"
    assert row["display_odds_pct"] == "42.000"

