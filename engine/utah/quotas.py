"""Quota resolution helpers for the Utah engine."""

from __future__ import annotations

from dataclasses import dataclass

from .models import Hunt, Quota, UtahRuleConfig
from .rules import derive_quota


@dataclass(frozen=True)
class QuotaResolver:
    """Thin wrapper around quota derivation for future expansion."""

    config: UtahRuleConfig

    def resolve(self, quota: Quota, hunt: Hunt) -> Quota:
        return derive_quota(quota, hunt, self.config)

