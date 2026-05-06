"""Feature helpers for the Utah draw engine."""

from __future__ import annotations

from typing import Dict, Iterable, Mapping, Tuple


def build_feature_row(raw_row: Mapping[str, object]) -> Dict[str, object]:
    return dict(raw_row)

