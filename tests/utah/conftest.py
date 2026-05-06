from __future__ import annotations

from engine.utah.models import Application, DrawState, Group, Hunt, Quota, UtahRuleConfig
from engine.utah.simulator import build_application_units


def make_bonus_state() -> DrawState:
    applications = [
        Application(2026, "big_game", "app_1", None, "cust_1", "mule deer", "Resident", False, ("DB1001",), 5, "bonus"),
        Application(2026, "big_game", "app_2", None, "cust_2", "mule deer", "Resident", False, ("DB1001",), 5, "bonus"),
    ]
    return DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB1001", species="mule deer", hunt_type="limited_entry", rule_system="bonus"),
        quota=Quota(draw_year=2026, hunt_code="DB1001", species="mule deer", total_public_permits=1, reserved_quota=1, random_quota=0, quota_source="fixture"),
        application_units=tuple(build_application_units(applications)),
        rule_config=UtahRuleConfig.default(),
        applicant_pool_source="fixture",
        quota_source="fixture",
        data_cutoff_date="2026-05-05",
        data_quality_grade="F",
    )


def make_preference_state() -> DrawState:
    applications = [
        Application(2026, "big_game", "app_1", None, "cust_1", "mule deer", "Resident", False, ("DB2001",), 5, "preference"),
        Application(2026, "big_game", "app_2", None, "cust_2", "mule deer", "Resident", False, ("DB2001",), 5, "preference"),
    ]
    return DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB2001", species="mule deer", hunt_type="general_season", rule_system="preference"),
        quota=Quota(draw_year=2026, hunt_code="DB2001", species="mule deer", total_public_permits=1, preference_quota=1, quota_source="fixture"),
        application_units=tuple(build_application_units(applications)),
        rule_config=UtahRuleConfig.default(),
        applicant_pool_source="fixture",
        quota_source="fixture",
        data_cutoff_date="2026-05-05",
        data_quality_grade="F",
    )

