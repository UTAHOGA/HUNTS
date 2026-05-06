"""Feature helpers for the Utah draw engine."""

from __future__ import annotations

from typing import Dict, Mapping

from .models import DrawSystem


def _text(value: object) -> str:
    return str(value or "").strip().lower()


def classify_draw_system(row: Mapping[str, object]) -> str:
    """Classify a raw record into a Utah draw system bucket.

    Priority:
    1) Explicit fields (`draw_system`, `rule_system`, `point_type`)
    2) Hunt-type / class hints
    3) Fallback to unknown
    """

    explicit = " ".join(
        _text(row.get(key))
        for key in (
            "draw_system",
            "rule_system",
            "point_type",
            "points_system",
        )
    )
    if any(token in explicit for token in ("bonus", "limited entry", "once in a lifetime", "once-in-a-lifetime", "oial")):
        return DrawSystem.BONUS
    if any(token in explicit for token in ("preference", "pref")):
        return DrawSystem.PREFERENCE
    if any(token in explicit for token in ("harvest objective", "harvest_objective", "management objective")):
        return DrawSystem.HARVEST_OBJECTIVE
    if any(token in explicit for token in ("general", "otc", "over the counter")):
        return DrawSystem.GENERAL

    hunt_hint = " ".join(
        _text(row.get(key))
        for key in (
            "hunt_type",
            "hunt_class",
            "permit_type",
            "hunt_name",
            "unit_name",
        )
    )
    if any(token in hunt_hint for token in ("limited entry", "once in a lifetime", "once-in-a-lifetime", "oial", "premium limited")):
        return DrawSystem.BONUS
    if any(token in hunt_hint for token in ("antlerless", "dedicated hunter", "general-season buck deer", "general season buck deer", "preference")):
        return DrawSystem.PREFERENCE
    if "harvest objective" in hunt_hint:
        return DrawSystem.HARVEST_OBJECTIVE
    if "general" in hunt_hint:
        return DrawSystem.GENERAL

    return DrawSystem.UNKNOWN


def build_feature_row(raw_row: Mapping[str, object]) -> Dict[str, object]:
    row = dict(raw_row)
    row.setdefault("draw_system", classify_draw_system(raw_row))
    return row

