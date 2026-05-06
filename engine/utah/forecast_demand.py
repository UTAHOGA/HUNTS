"""Demand forecasting helpers for Utah engine V1."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, Mapping, Optional

from .schema import normalize_hunt_code, to_int


@dataclass(frozen=True)
class DemandForecast:
    hunt_code: str
    residency: str
    points: Optional[int]
    forecast_applicants: Optional[int]
    source_rows: int


def _row_key(row: Mapping[str, object]) -> tuple[str, str, Optional[int]]:
    return (
        normalize_hunt_code(row.get("hunt_code") or row.get("huntCode")),
        str(row.get("residency") or "Resident").strip() or "Resident",
        to_int(row.get("points") or row.get("apply_with_points")),
    )


def _row_year(row: Mapping[str, object]) -> Optional[int]:
    return to_int(row.get("source_year") or row.get("year") or row.get("draw_year") or row.get("projection_year"))


def _row_applicants(row: Mapping[str, object]) -> Optional[int]:
    return to_int(
        row.get("eligible_applicants")
        or row.get("projected_total_applicants_at_point")
        or row.get("applicants_at_level")
        or row.get("applicants_2025")
    )


def forecast_demand(rows: Iterable[Mapping[str, object]]) -> dict[tuple[str, str, Optional[int]], DemandForecast]:
    grouped: dict[tuple[str, str, Optional[int]], list[tuple[Optional[int], int]]] = defaultdict(list)
    for row in rows:
        key = _row_key(row)
        applicants = _row_applicants(row)
        if not key[0] or applicants is None or applicants < 0:
            continue
        grouped[key].append((_row_year(row), applicants))

    result: dict[tuple[str, str, Optional[int]], DemandForecast] = {}
    for key, values in grouped.items():
        ordered = sorted(values, key=lambda x: (x[0] is None, x[0]), reverse=True)
        recent = ordered[0][1] if len(ordered) > 0 else None
        prev = ordered[1][1] if len(ordered) > 1 else recent
        older_vals = [v for _, v in ordered[2:]]
        older = int(round(sum(older_vals) / len(older_vals))) if older_vals else prev

        if recent is None:
            forecast = None
        else:
            r = float(recent)
            p = float(prev if prev is not None else recent)
            o = float(older if older is not None else p)
            forecast = int(round((0.60 * r) + (0.30 * p) + (0.10 * o)))
            forecast = max(forecast, 0)

        result[key] = DemandForecast(
            hunt_code=key[0],
            residency=key[1],
            points=key[2],
            forecast_applicants=forecast,
            source_rows=len(values),
        )
    return result
