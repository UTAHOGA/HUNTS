from engine.utah.features import classify_draw_system
from engine.utah.models import DrawSystem


def test_classify_draw_system_bonus_from_point_type():
    row = {"point_type": "bonus", "hunt_type": "limited_entry"}
    assert classify_draw_system(row) == DrawSystem.BONUS


def test_classify_draw_system_preference_from_hunt_type():
    row = {"hunt_type": "antlerless deer", "point_type": ""}
    assert classify_draw_system(row) == DrawSystem.PREFERENCE


def test_classify_draw_system_harvest_objective():
    row = {"hunt_name": "Elk Harvest Objective Area", "point_type": ""}
    assert classify_draw_system(row) == DrawSystem.HARVEST_OBJECTIVE


def test_classify_draw_system_general():
    row = {"hunt_name": "General Season Any Bull Elk", "point_type": ""}
    assert classify_draw_system(row) == DrawSystem.GENERAL


def test_classify_draw_system_unknown():
    row = {"hunt_name": "Custom Experimental Unit", "point_type": ""}
    assert classify_draw_system(row) == DrawSystem.UNKNOWN
