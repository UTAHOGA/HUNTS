"""Schema and parsing helpers for Utah predictive engine V1."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional


def normalize_hunt_code(value: object) -> str:
    return str(value or "").strip().upper()


def to_int(value: object) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(round(float(text)))
    except (TypeError, ValueError):
        return None


def to_float(value: object) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class BonusDrawInput:
    hunt_code: str
    year: Optional[int]
    residency: str
    points: Optional[int]
    eligible_applicants: Optional[int]
    bonus_permits: Optional[int]
    regular_permits: Optional[int]
    total_permits: Optional[int]
    total_drawn: Optional[int]
    status: str = ""

    @classmethod
    def from_row(cls, row: Mapping[str, object]) -> "BonusDrawInput":
        hunt_code = normalize_hunt_code(row.get("hunt_code") or row.get("HUNT_CODE") or row.get("huntCode"))
        residency = str(row.get("residency") or row.get("RESIDENCY") or "Resident").strip() or "Resident"
        return cls(
            hunt_code=hunt_code,
            year=to_int(row.get("year") or row.get("draw_year") or row.get("projection_year") or row.get("source_year")),
            residency=residency,
            points=to_int(row.get("points") or row.get("apply_with_points")),
            eligible_applicants=to_int(
                row.get("eligible_applicants")
                or row.get("projected_total_applicants_at_point")
                or row.get("applicants_at_level")
                or row.get("applicants_2025")
            ),
            bonus_permits=to_int(row.get("bonus_permits") or row.get("projected_bonus_pool_permits") or row.get("max_point_permits_2026")),
            regular_permits=to_int(row.get("regular_permits") or row.get("projected_random_pool_permits") or row.get("random_permits_2026")),
            total_permits=to_int(row.get("total_permits") or row.get("current_recommended_permits") or row.get("public_permits_2026")),
            total_drawn=to_int(
                row.get("total_drawn")
                or row.get("projected_guaranteed_draws_at_point")
                or row.get("winners")
            ),
            status=str(row.get("status") or "").strip(),
        )
