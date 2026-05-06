"""Backtesting helpers for Utah draw forecasts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True)
class BacktestMetrics:
    false_guaranteed_count: int
    mean_absolute_error_probability: float
    brier_score: float


def count_false_guarantees(predictions: Sequence[Mapping[str, object]], actual_results: Mapping[tuple, bool]) -> int:
    false_guarantees = 0
    for row in predictions:
        key = (row.get("hunt_code"), row.get("residency"), row.get("points"))
        predicted = float(row.get("guaranteed_probability") or 0.0)
        if predicted >= 0.999 and not bool(actual_results.get(key, False)):
            false_guarantees += 1
    return false_guarantees


def summarize_backtest(predictions: Sequence[Mapping[str, object]], actual_results: Mapping[tuple, bool]) -> BacktestMetrics:
    errors = []
    binary = []
    for row in predictions:
        key = (row.get("hunt_code"), row.get("residency"), row.get("points"))
        p = float(row.get("p_draw_mean") or 0.0)
        actual = 1.0 if bool(actual_results.get(key, False)) else 0.0
        errors.append(abs(p - actual))
        binary.append((p, bool(actual)))
    false_guarantees = count_false_guarantees(predictions, actual_results)
    mae = sum(errors) / len(errors) if errors else 0.0
    brier = sum((p - (1.0 if actual else 0.0)) ** 2 for p, actual in binary) / len(binary) if binary else 0.0
    return BacktestMetrics(false_guarantees, mae, brier)

