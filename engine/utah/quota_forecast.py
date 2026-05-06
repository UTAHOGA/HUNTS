"""Simple quota forecast helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class QuotaForecast:
    quota_mean: float
    quota_p10: float
    quota_p50: float
    quota_p90: float
    quota_source: str
    quota_reason_code: str


def forecast_quota(
    prior_year_total: int,
    approved_quota: Optional[int] = None,
    proposed_quota: Optional[int] = None,
    trend_pct: float = 0.0,
) -> QuotaForecast:
    if approved_quota is not None:
        value = float(approved_quota)
        return QuotaForecast(value, value, value, value, "approved", "APPROVED_QUOTA_USED")
    if proposed_quota is not None:
        value = float(proposed_quota)
        return QuotaForecast(value, value, value, value, "proposed", "PROPOSED_QUOTA_USED")
    mean = max(float(prior_year_total) * (1.0 + float(trend_pct)), 0.0)
    return QuotaForecast(mean, mean * 0.9, mean, mean * 1.1, "forecast", "FORECAST_QUOTA_USED")

