"""Baseline demand model helpers."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Mapping, MutableMapping, Sequence, Tuple


Bucket = Tuple[str, str, int]


def remove_drawn_applicants(prior_count: int, drawn_count: int) -> int:
    return max(int(prior_count) - int(drawn_count), 0)


def advance_unsuccessful_applicants(bucket_counts: Mapping[int, int], retention_rate: float = 0.75) -> Dict[int, int]:
    advanced: Dict[int, int] = defaultdict(int)
    for points, count in bucket_counts.items():
        next_bucket = max(points + 1, 0)
        advanced[next_bucket] += int(round(count * retention_rate))
    return dict(advanced)


def add_new_entrants(bucket_counts: Mapping[int, int], new_entrant_count: int) -> Dict[int, int]:
    updated = dict(bucket_counts)
    updated[0] = updated.get(0, 0) + max(int(new_entrant_count), 0)
    return updated


def smooth_series(history: Sequence[int], alpha: float = 0.6) -> float:
    if not history:
        return 0.0
    estimate = float(history[0])
    for value in history[1:]:
        estimate = alpha * float(value) + (1.0 - alpha) * estimate
    return estimate


def forecast_bucket_counts(
    history: Mapping[Bucket, Sequence[int]],
    alpha: float = 0.6,
    retention_rate: float = 0.75,
    new_entrants: Mapping[Bucket, int] | None = None,
) -> Dict[Bucket, float]:
    new_entrants = new_entrants or {}
    forecast: Dict[Bucket, float] = {}
    for bucket, series in history.items():
        smoothed = smooth_series(series, alpha=alpha)
        forecast[bucket] = smoothed
        hunt_code, residency, points = bucket
        if points > 0:
            carry_key = (hunt_code, residency, points - 1)
            prior = forecast.get(carry_key, 0.0)
            forecast[bucket] = max(smoothed, prior * retention_rate)
        if bucket in new_entrants:
            forecast[bucket] += float(new_entrants[bucket])
    return forecast


def hierarchical_smoothing(
    exact_bucket_history: Sequence[int],
    unit_history: Sequence[int] | None = None,
    species_history: Sequence[int] | None = None,
    statewide_history: Sequence[int] | None = None,
) -> Tuple[float, str]:
    if exact_bucket_history:
        return smooth_series(exact_bucket_history), "EXACT_BUCKET_HISTORY_USED"
    if unit_history:
        return smooth_series(unit_history), "UNIT_LEVEL_SMOOTHING_USED"
    if species_history:
        return smooth_series(species_history), "SPECIES_LEVEL_SMOOTHING_USED"
    if statewide_history:
        return smooth_series(statewide_history), "STATEWIDE_SMOOTHING_USED"
    return 0.0, "SPARSE_HISTORY"

