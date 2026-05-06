from engine.utah.models import DrawSystem
from engine.utah.rules import classify_utah_draw_rule


def test_classify_bonus_rule():
    row = {"hunt_type": "limited entry", "point_type": "bonus"}
    assert classify_utah_draw_rule(row) == DrawSystem.BONUS


def test_classify_preference_rule():
    row = {"hunt_name": "General Season Buck Deer", "point_type": "preference"}
    assert classify_utah_draw_rule(row) == DrawSystem.PREFERENCE


def test_classify_unknown_rule():
    row = {"hunt_name": "Custom Unit X", "point_type": ""}
    assert classify_utah_draw_rule(row) == DrawSystem.UNKNOWN
