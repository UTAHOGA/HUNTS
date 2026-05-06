from __future__ import annotations

from engine.utah.models import Hunt, Quota, UtahRuleConfig
from engine.utah.quota_forecast import forecast_quota
from engine.utah.rules import derive_quota


def test_quota_approved_overrides_forecast():
    forecast = forecast_quota(10, approved_quota=12, proposed_quota=8, trend_pct=0.25)
    assert forecast.quota_mean == 12.0
    assert forecast.quota_source == "approved"


def test_derived_bonus_quota_uses_total_when_missing():
    hunt = Hunt(hunt_code="DB1001", species="mule deer", hunt_type="limited_entry", rule_system="bonus")
    quota = Quota(draw_year=2026, hunt_code="DB1001", species="mule deer", total_public_permits=10, quota_source="forecast")
    resolved = derive_quota(quota, hunt, UtahRuleConfig.default())
    assert resolved.reserved_quota == 5
    assert resolved.random_quota == 5
