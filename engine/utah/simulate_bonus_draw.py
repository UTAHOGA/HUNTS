"""Bonus draw probability simulator primitives for Utah engine V1."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional

from .schema import BonusDrawInput, to_float


def _cap01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


@dataclass(frozen=True)
class BonusDrawProbability:
    hunt_code: str
    year: Optional[int]
    residency: str
    points: Optional[int]
    eligible_applicants: Optional[int]
    total_drawn: Optional[int]
    observed_probability: Optional[float]
    smoothed_probability: Optional[float]
    p_draw: Optional[float]
    max_pool_flag: bool


def compute_bonus_draw_probability(draw_input: BonusDrawInput) -> BonusDrawProbability:
    eligible = draw_input.eligible_applicants
    total_drawn = draw_input.total_drawn

    if total_drawn is None:
        permits = [v for v in (draw_input.bonus_permits, draw_input.regular_permits, draw_input.total_permits) if v is not None]
        total_drawn = max(permits) if permits else None

    max_pool_flag = str(draw_input.status or "").strip().upper() == "MAX POOL"

    observed = None
    smoothed = None
    p_draw = None

    if eligible is not None and eligible > 0 and total_drawn is not None and total_drawn >= 0:
        observed = _cap01(total_drawn / eligible)
        smoothed = _cap01((total_drawn + 0.5) / (eligible + 1.0))

        # Never auto-force MAX POOL to 1.0. Only allow 1.0 when drawn >= eligible.
        if total_drawn >= eligible:
            p_draw = 1.0
        else:
            p_draw = smoothed

    return BonusDrawProbability(
        hunt_code=draw_input.hunt_code,
        year=draw_input.year,
        residency=draw_input.residency,
        points=draw_input.points,
        eligible_applicants=eligible,
        total_drawn=total_drawn,
        observed_probability=observed,
        smoothed_probability=smoothed,
        p_draw=p_draw,
        max_pool_flag=max_pool_flag,
    )


def compute_bonus_draw_probability_from_row(row: Mapping[str, object]) -> BonusDrawProbability:
    return compute_bonus_draw_probability(BonusDrawInput.from_row(row))


def odds_percent(probability: Optional[float]) -> Optional[float]:
    if probability is None:
        return None
    return round(_cap01(float(probability)) * 100.0, 3)


def percent_to_probability(value: object) -> Optional[float]:
    val = to_float(value)
    if val is None:
        return None
    return _cap01(val / 100.0 if val > 1.0 else val)
