from __future__ import annotations

from engine.utah.models import Application, DrawState, Hunt, Quota, UtahRuleConfig
from engine.utah.simulator import build_application_units, run_monte_carlo, run_simulation_once

from .conftest import make_bonus_state


def test_bonus_random_ticket_count_one_plus_points():
    application = Application(2026, "big_game", "app_1", None, "cust_1", "mule deer", "Resident", False, ("DB1001",), 4, "bonus")
    unit = build_application_units([application])[0]
    assert unit.random_ticket_count == 5


def test_bonus_reserved_split():
    state = make_bonus_state()
    aggregates = run_monte_carlo(state, iterations=200, seed=42)
    assert len(aggregates) == 1
    assert aggregates[0].p_draw_mean == 0.5
    assert aggregates[0].guaranteed_probability == 0.0


def test_bonus_reserved_rolls_to_random():
    application = Application(2026, "big_game", "app_1", None, "cust_1", "mule deer", "Resident", False, ("DB1001",), 3, "bonus")
    state = DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB1001", species="mule deer", hunt_type="limited_entry", rule_system="bonus"),
        quota=Quota(draw_year=2026, hunt_code="DB1001", species="mule deer", total_public_permits=1, reserved_quota=0, random_quota=1, quota_source="fixture"),
        application_units=tuple(build_application_units([application])),
        rule_config=UtahRuleConfig.default(),
    )
    result = run_simulation_once(state, seed=7)
    assert result.results[0].draw_stage == "random_bonus"
    assert result.results[0].drawn_flag is True

