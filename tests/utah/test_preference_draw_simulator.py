from __future__ import annotations

from engine.utah.models import Application, DrawState, Hunt, Quota, UtahRuleConfig
from engine.utah.simulator import build_application_units, run_monte_carlo, run_simulation_once

from .conftest import make_preference_state


def test_preference_cutoff_bucket_split():
    state = make_preference_state()
    aggregates = run_monte_carlo(state, iterations=200, seed=11)
    assert len(aggregates) == 1
    assert aggregates[0].p_draw_mean == 0.5
    assert aggregates[0].expected_cutoff_points == 5.0


def test_preference_higher_points_clear_first():
    applications = (
        Application(2026, "big_game", "high", None, "cust_1", "mule deer", "Resident", False, ("DB2001",), 6, "preference"),
        Application(2026, "big_game", "low", None, "cust_2", "mule deer", "Resident", False, ("DB2001",), 4, "preference"),
    )
    state = DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB2001", species="mule deer", hunt_type="general_season", rule_system="preference"),
        quota=Quota(draw_year=2026, hunt_code="DB2001", species="mule deer", total_public_permits=1, preference_quota=1, quota_source="fixture"),
        application_units=tuple(build_application_units(applications)),
        rule_config=UtahRuleConfig.default(),
    )
    result = run_simulation_once(state, seed=7)
    assert result.results[0].application_unit_id == "high"
    assert result.results[0].drawn_flag is True
