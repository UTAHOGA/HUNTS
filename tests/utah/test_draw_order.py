from __future__ import annotations

from engine.utah.rules import get_draw_order


def test_draw_order_conflict_resolution():
    order = get_draw_order("limited_entry")
    assert order[0] == "limited_entry"
    assert "once_in_lifetime" in order

