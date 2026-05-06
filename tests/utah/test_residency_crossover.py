from __future__ import annotations

from engine.utah.models import Application, ApplicationUnit, DrawState, Hunt, Quota, UtahRuleConfig
from engine.utah.simulator import run_simulation_once


def test_residency_quota_crossover():
    state = DrawState(
        draw_year=2026,
        hunt=Hunt(hunt_code="DB2001", species="mule deer", hunt_type="limited_entry", rule_system="bonus"),
        quota=Quota(
            draw_year=2026,
            hunt_code="DB2001",
            species="mule deer",
            total_public_permits=1,
            resident_quota=0,
            nonresident_quota=1,
            crossover_allowed=True,
            reserved_quota=1,
            random_quota=0,
            quota_source="fixture",
        ),
        application_units=(
            ApplicationUnit(
                application_unit_id="a1",
                member_application_ids=("a1",),
                member_customer_ids_hashed=("cust_1",),
                group_id=None,
                group_size=1,
                residency="Resident",
                species="mule deer",
                hunt_choices=("DB2001",),
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
    result = run_simulation_once(state, seed=2)
    assert any(item.drawn_flag for item in result.results)

