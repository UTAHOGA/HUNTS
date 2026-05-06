from __future__ import annotations

from engine.utah.models import Application, DrawState, Hunt, Quota, UtahRuleConfig
from engine.utah.simulator import build_application_units, run_simulation_once


def test_youth_reserved_pool_then_general_pool():
    applications = [
        Application(2026, "big_game", "app_youth", None, "cust_y", "mule deer", "Resident", True, ("DB1001",), 3, "preference"),
        Application(2026, "big_game", "app_adult", None, "cust_a", "mule deer", "Resident", False, ("DB1001",), 3, "preference"),
    ]
    state = DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB1001", species="mule deer", hunt_type="general_season", rule_system="preference"),
        quota=Quota(draw_year=2026, hunt_code="DB1001", species="mule deer", total_public_permits=2, youth_reserved_quota=1, preference_quota=2, quota_source="fixture"),
        application_units=tuple(build_application_units(applications)),
        rule_config=UtahRuleConfig.default(),
    )
    result = run_simulation_once(state, seed=3)
    assert any(item.draw_stage == "youth_reserved" for item in result.results)
    assert sum(1 for item in result.results if item.drawn_flag) == 2


def test_adult_youth_mixed_group_not_youth_only():
    applications = [
        Application(2026, "big_game", "app_youth", "G1", "cust_y", "mule deer", "Resident", True, ("DB1001",), 3, "preference"),
        Application(2026, "big_game", "app_adult", "G1", "cust_a", "mule deer", "Resident", False, ("DB1001",), 3, "preference"),
    ]
    state = DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB1001", species="mule deer", hunt_type="general_season", rule_system="preference"),
        quota=Quota(draw_year=2026, hunt_code="DB1001", species="mule deer", total_public_permits=2, youth_reserved_quota=1, preference_quota=2, quota_source="fixture"),
        application_units=tuple(build_application_units(applications)),
        rule_config=UtahRuleConfig.default(),
    )
    result = run_simulation_once(state, seed=3)
    assert any(item.draw_stage == "youth_reserved" for item in result.results)
