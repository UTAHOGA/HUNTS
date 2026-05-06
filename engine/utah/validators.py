"""Validation helpers for Utah feed tables."""

from __future__ import annotations

from typing import Iterable, Mapping, Sequence


def require_columns(rows: Sequence[Mapping[str, object]], required: Iterable[str]) -> None:
    required = tuple(required)
    if not rows:
        return
    missing = [name for name in required if name not in rows[0]]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

