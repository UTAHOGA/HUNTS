from __future__ import annotations

from engine.utah.demand import add_new_entrants, advance_unsuccessful_applicants, hierarchical_smoothing, remove_drawn_applicants


def test_demand_baseline_removes_drawn_applicants():
    assert remove_drawn_applicants(10, 3) == 7


def test_demand_baseline_advances_unsuccessful_applicants():
    assert advance_unsuccessful_applicants({0: 10, 1: 4}, retention_rate=0.5) == {1: 5, 2: 2}


def test_demand_baseline_adds_new_entrants():
    assert add_new_entrants({0: 1, 1: 2}, 3)[0] == 4


def test_sparse_bucket_uses_hierarchical_smoothing():
    value, reason = hierarchical_smoothing([], unit_history=[2, 4, 6])
    assert value > 4
    assert reason == "UNIT_LEVEL_SMOOTHING_USED"
