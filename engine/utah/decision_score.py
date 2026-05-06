"""Decision scoring and labels for Utah engine V1."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


def _clamp100(value: float) -> float:
    return max(0.0, min(100.0, value))


@dataclass(frozen=True)
class DecisionScore:
    application_value_score: float
    decision_label: str
    modeled_draw_probability_score: float
    hunt_quality_score: float
    point_value_score: float
    demand_opportunity_score: float
    permit_stability_score: float


def _label_from_components(
    p_draw: Optional[float],
    app_score: float,
    quality_score: float,
    demand_opp_score: float,
    point_creep_1yr: float,
) -> str:
    if p_draw is None:
        return "INSUFFICIENT DATA"
    if app_score >= 75 and p_draw >= 0.60:
        return "STRONG APPLY"
    if app_score >= 60 and p_draw >= 0.35:
        return "GOOD VALUE"
    if p_draw >= 0.20 and demand_opp_score >= 55:
        return "SLEEPER"
    if quality_score >= 70 and p_draw < 0.20:
        return "HIGH QUALITY / BAD ODDS"
    if point_creep_1yr >= 1.0:
        return "POINT CREEP WARNING"
    if p_draw < 0.08 and app_score < 35:
        return "DO NOT BURN POINTS"
    if app_score < 45:
        return "LOW VALUE"
    return "GOOD VALUE"


def score_application_value(
    p_draw: Optional[float],
    hunt_quality_score: float,
    point_value_score: float,
    demand_opportunity_score: float,
    permit_stability_score: float,
    point_creep_1yr: float = 0.0,
) -> DecisionScore:
    modeled_draw_probability_score = 0.0 if p_draw is None else _clamp100(float(p_draw) * 100.0)
    hunt_quality_score = _clamp100(hunt_quality_score)
    point_value_score = _clamp100(point_value_score)
    demand_opportunity_score = _clamp100(demand_opportunity_score)
    permit_stability_score = _clamp100(permit_stability_score)

    application_value_score = (
        (0.35 * modeled_draw_probability_score)
        + (0.25 * hunt_quality_score)
        + (0.15 * point_value_score)
        + (0.15 * demand_opportunity_score)
        + (0.10 * permit_stability_score)
    )
    application_value_score = round(_clamp100(application_value_score), 3)

    decision_label = _label_from_components(
        p_draw=p_draw,
        app_score=application_value_score,
        quality_score=hunt_quality_score,
        demand_opp_score=demand_opportunity_score,
        point_creep_1yr=point_creep_1yr,
    )

    return DecisionScore(
        application_value_score=application_value_score,
        decision_label=decision_label,
        modeled_draw_probability_score=round(modeled_draw_probability_score, 3),
        hunt_quality_score=round(hunt_quality_score, 3),
        point_value_score=round(point_value_score, 3),
        demand_opportunity_score=round(demand_opportunity_score, 3),
        permit_stability_score=round(permit_stability_score, 3),
    )
