from engine.utah.schema import BonusDrawInput
from engine.utah.simulate_bonus_draw import compute_bonus_draw_probability


def test_max_pool_not_automatic_100_percent():
    draw_input = BonusDrawInput(
        hunt_code="DB1000",
        year=2026,
        residency="Resident",
        points=15,
        eligible_applicants=10,
        bonus_permits=3,
        regular_permits=1,
        total_permits=4,
        total_drawn=4,
        status="MAX POOL",
    )
    out = compute_bonus_draw_probability(draw_input)
    assert out.max_pool_flag is True
    assert out.p_draw is not None
    assert out.p_draw < 1.0


def test_p_draw_null_when_applicants_zero():
    draw_input = BonusDrawInput(
        hunt_code="DB1001",
        year=2026,
        residency="Resident",
        points=2,
        eligible_applicants=0,
        bonus_permits=1,
        regular_permits=0,
        total_permits=1,
        total_drawn=1,
        status="",
    )
    out = compute_bonus_draw_probability(draw_input)
    assert out.p_draw is None


def test_p_draw_one_only_when_drawn_gte_applicants():
    a = BonusDrawInput(
        hunt_code="DB1002",
        year=2026,
        residency="Resident",
        points=5,
        eligible_applicants=3,
        bonus_permits=3,
        regular_permits=0,
        total_permits=3,
        total_drawn=3,
        status="",
    )
    b = BonusDrawInput(
        hunt_code="DB1002",
        year=2026,
        residency="Resident",
        points=5,
        eligible_applicants=3,
        bonus_permits=2,
        regular_permits=0,
        total_permits=2,
        total_drawn=2,
        status="",
    )
    assert compute_bonus_draw_probability(a).p_draw == 1.0
    assert compute_bonus_draw_probability(b).p_draw is not None
    assert compute_bonus_draw_probability(b).p_draw < 1.0
