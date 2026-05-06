from __future__ import annotations

from engine.utah.models import Application, ApplicationUnit, DrawState, Group, Hunt, Quota, UtahRuleConfig
from engine.utah.rules import calculate_effective_group_points, can_group_fit_quota, validate_group_choices, validate_group_size, validate_youth_group
from engine.utah.simulator import run_simulation_once


def test_group_points_average_floor():
    assert calculate_effective_group_points([5, 4]) == 4


def test_group_quota_too_small_skips_group():
    assert can_group_fit_quota(3, 2) is False


def test_group_application_consumes_group_size_permits():
    state = DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB1001", species="mule deer", hunt_type="limited_entry", rule_system="bonus"),
        quota=Quota(draw_year=2026, hunt_code="DB1001", species="mule deer", total_public_permits=2, reserved_quota=2, random_quota=0, quota_source="fixture"),
        application_units=(
            ApplicationUnit(
                application_unit_id="group_1",
                member_application_ids=("a1", "a2"),
                member_customer_ids_hashed=("cust_1", "cust_2"),
                group_id="G1",
                group_size=2,
                residency="Resident",
                species="mule deer",
                hunt_choices=("DB1001",),
                effective_points=4,
                point_type="bonus",
                youth_only_flag=False,
                valid_flag=True,
                eligible_flag=True,
                random_ticket_count=5,
            ),
        ),
        rule_config=UtahRuleConfig.default(),
    )
    result = run_simulation_once(state, seed=1)
    assert result.results[0].permits_consumed == 2


def test_group_consumes_group_size_permits():
    state = DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB1001", species="mule deer", hunt_type="limited_entry", rule_system="bonus"),
        quota=Quota(draw_year=2026, hunt_code="DB1001", species="mule deer", total_public_permits=2, reserved_quota=2, random_quota=0, quota_source="fixture"),
        application_units=(
            ApplicationUnit(
                application_unit_id="group_1",
                member_application_ids=("a1", "a2"),
                member_customer_ids_hashed=("cust_1", "cust_2"),
                group_id="G1",
                group_size=2,
                residency="Resident",
                species="mule deer",
                hunt_choices=("DB1001",),
                effective_points=4,
                point_type="bonus",
                youth_only_flag=False,
                valid_flag=True,
                eligible_flag=True,
                random_ticket_count=5,
            ),
        ),
        rule_config=UtahRuleConfig.default(),
    )
    result = run_simulation_once(state, seed=1)
    assert result.results[0].permits_consumed == 2


def test_group_choices_must_match():
    a1 = Application(2026, "big_game", "a1", "G1", "cust_1", "mule deer", "Resident", False, ("DB1", "DB2"), 5, "bonus")
    a2 = Application(2026, "big_game", "a2", "G1", "cust_2", "mule deer", "Resident", False, ("DB1", "DB3"), 5, "bonus")
    assert validate_group_choices([a1, a2]) is False


def test_mixed_youth_adult_group_not_youth_only():
    group = Group("G1", ("cust_1", "cust_2"), 2, 4, True, True, "Mixed")
    applications = [
        Application(2026, "big_game", "a1", "G1", "cust_1", "mule deer", "Resident", True, ("DB1",), 5, "preference"),
        Application(2026, "big_game", "a2", "G1", "cust_2", "mule deer", "Resident", False, ("DB1",), 4, "preference"),
    ]
    assert validate_youth_group(group, applications) is False


def test_adult_youth_mixed_group_not_youth_only():
    group = Group("G1", ("cust_1", "cust_2"), 2, 4, True, True, "Mixed")
    applications = [
        Application(2026, "big_game", "a1", "G1", "cust_1", "mule deer", "Resident", True, ("DB1",), 5, "preference"),
        Application(2026, "big_game", "a2", "G1", "cust_2", "mule deer", "Resident", False, ("DB1",), 4, "preference"),
    ]
    assert validate_youth_group(group, applications) is False


def test_once_in_lifetime_group_rejected():
    group = Group("G1", ("cust_1", "cust_2"), 2, 4, True, False, "ResidentOnly")
    config = UtahRuleConfig.default()
    assert validate_group_size(group, "once_in_lifetime", config) is False
