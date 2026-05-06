"""Permit forecasting helpers for Utah engine V1."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Optional

from .schema import normalize_hunt_code, to_int


@dataclass(frozen=True)
class PermitForecast:
    hunt_code: str
    forecast_total_permits: Optional[int]
    source: str


def _permit_from_recommended(row: Mapping[str, object]) -> Optional[int]:
    return to_int(row.get("total_permits") or row.get("total_permits_raw") or row.get("current_recommended_permits"))


def _permit_from_fallback(row: Mapping[str, object]) -> Optional[int]:
    return to_int(row.get("public_permits_2026") or row.get("public_permits_2025") or row.get("total_permits"))


def forecast_permits(
    recommended_permits_rows: Iterable[Mapping[str, object]] | None,
    fallback_rows: Iterable[Mapping[str, object]],
) -> dict[str, PermitForecast]:
    result: dict[str, PermitForecast] = {}

    if recommended_permits_rows:
        for row in recommended_permits_rows:
            hunt_code = normalize_hunt_code(row.get("hunt_code"))
            if not hunt_code:
                continue
            permits = _permit_from_recommended(row)
            if permits is None:
                continue
            result[hunt_code] = PermitForecast(
                hunt_code=hunt_code,
                forecast_total_permits=max(permits, 0),
                source="recommended_permits_2026.csv",
            )

    for row in fallback_rows:
        hunt_code = normalize_hunt_code(row.get("hunt_code") or row.get("huntCode"))
        if not hunt_code or hunt_code in result:
            continue
        permits = _permit_from_fallback(row)
        if permits is None:
            continue
        result[hunt_code] = PermitForecast(
            hunt_code=hunt_code,
            forecast_total_permits=max(permits, 0),
            source="fallback",
        )

    return result
