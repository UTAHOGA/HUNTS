"""Calibration helpers for Utah probabilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Mapping, Sequence


@dataclass(frozen=True)
class CalibrationBand:
    label: str
    predicted_mean: float
    actual_rate: float
    count: int


def calibration_band_summary(pairs: Sequence[tuple[float, bool]]) -> List[CalibrationBand]:
    bands = [
        (0.00, 0.01, "0.00-0.01"),
        (0.01, 0.05, "0.01-0.05"),
        (0.05, 0.10, "0.05-0.10"),
        (0.10, 0.25, "0.10-0.25"),
        (0.25, 0.50, "0.25-0.50"),
        (0.50, 0.75, "0.50-0.75"),
        (0.75, 0.90, "0.75-0.90"),
        (0.90, 0.99, "0.90-0.99"),
        (0.99, 1.01, "0.99-1.00"),
    ]
    out: List[CalibrationBand] = []
    for lo, hi, label in bands:
        selected = [(p, actual) for p, actual in pairs if lo <= p < hi]
        if not selected:
            continue
        predicted = sum(p for p, _ in selected) / len(selected)
        actual_rate = sum(1.0 if actual else 0.0 for _, actual in selected) / len(selected)
        out.append(CalibrationBand(label, predicted, actual_rate, len(selected)))
    return out

