"""Typed models for the Utah draw engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from math import floor
from typing import Iterable, List, Optional, Sequence, Tuple


def normalize_residency(value: object) -> str:
    text = str(value or "").strip().lower()
    if text in {"nonresident", "non-resident", "nr"}:
        return "Nonresident"
    return "Resident"


def normalize_choices(choices: Iterable[object]) -> List[str]:
    normalized: List[str] = []
    for choice in choices:
        text = str(choice or "").strip().upper()
        if text:
            normalized.append(text)
    return normalized


@dataclass(frozen=True)
class Applicant:
    hashed_customer_id: str
    residency: str
    youth_flag: bool = False
    lifetime_license_flag: bool = False
    dedicated_hunter_flag: bool = False
    waiting_period_status: Optional[str] = None
    license_valid_flag: bool = True
    eligible_species: Tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Application:
    draw_year: int
    draw_type: str
    application_id: str
    group_id: Optional[str]
    hashed_customer_id: str
    species: str
    residency: str
    youth_flag: bool
    hunt_choices: Tuple[str, ...]
    points_before_draw: int
    point_type: str
    valid_flag: bool = True
    eligible_flag: bool = True

    def normalized_choices(self) -> Tuple[str, ...]:
        return tuple(normalize_choices(self.hunt_choices))


@dataclass(frozen=True)
class Group:
    group_id: str
    member_ids_hashed: Tuple[str, ...]
    group_size: int
    effective_points: int
    same_choices_flag: bool
    youth_only_flag: bool
    residency_mix: str


@dataclass(frozen=True)
class Quota:
    draw_year: int
    hunt_code: str
    species: str
    total_public_permits: int
    resident_quota: Optional[int] = None
    nonresident_quota: Optional[int] = None
    youth_reserved_quota: Optional[int] = None
    reserved_quota: Optional[int] = None
    random_quota: Optional[int] = None
    preference_quota: Optional[int] = None
    quota_source: str = "fixture"
    crossover_allowed: bool = False


@dataclass(frozen=True)
class Hunt:
    hunt_code: str
    unit_id: str = ""
    unit_name: str = ""
    species: str = ""
    hunt_type: str = "other"
    weapon: Optional[str] = None
    season_dates: Optional[str] = None
    rule_system: str = "none"
    active_flag: bool = True


@dataclass(frozen=True)
class ApplicationUnit:
    application_unit_id: str
    member_application_ids: Tuple[str, ...]
    member_customer_ids_hashed: Tuple[str, ...]
    group_id: Optional[str]
    group_size: int
    residency: str
    species: str
    hunt_choices: Tuple[str, ...]
    effective_points: int
    point_type: str
    youth_only_flag: bool
    valid_flag: bool
    eligible_flag: bool
    random_ticket_count: int
    reason_codes: Tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class DrawResult:
    application_unit_id: str
    member_application_ids: Tuple[str, ...]
    hunt_code: Optional[str]
    drawn_flag: bool
    draw_stage: str
    choice_rank_drawn: Optional[int]
    permits_consumed: int
    points_forfeited_flag: bool
    reason_codes: Tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class PredictionAggregate:
    draw_year: int
    hunt_code: str
    residency: str
    points: int
    p_draw_mean: float
    p_draw_p10: float
    p_draw_p50: float
    p_draw_p90: float
    p_reserved_mean: float
    p_random_mean: float
    p_preference_mean: float
    p_youth_mean: float
    expected_cutoff_points: Optional[float]
    cutoff_bucket_probability: Optional[float]
    guaranteed_probability: float
    point_creep_1yr: float = 0.0
    point_creep_3yr: float = 0.0
    quota_source: str = "fixture"
    applicant_pool_source: str = "fixture"
    model_version: str = "hybrid_ml_v1.0.0"
    rule_version: str = "utah_draw_model_v1.0.0"
    data_cutoff_date: str = ""
    data_quality_grade: str = "F"
    reason_codes: Tuple[str, ...] = field(default_factory=tuple)
    display_odds_pct: float = 0.0


@dataclass(frozen=True)
class UtahRuleConfig:
    rule_version: str = "utah_draw_model_v1.0.0"
    bonus_reserved_fraction: float = 0.50
    bonus_ticket_formula: str = "one_plus_points"
    group_points_rounding: str = "floor_average"
    once_in_lifetime_groups_allowed: bool = False
    nonresident_cmwu_big_game_allowed: bool = False
    resident_nonresident_crossover_enabled_when_allowed: bool = True
    general_deer_youth_reserved_fraction: float = 0.20
    antlerless_youth_reserved_fraction: float = 0.20
    max_group_size_default: int = 4
    max_group_size_limited_entry: int = 4
    max_group_size_general_deer: int = 4
    max_group_size_youth_general_deer: int = 4
    max_group_size_youth_general_any_bull_elk: int = 4
    max_group_size_antlerless_deer_elk_doe_pronghorn: int = 4
    random_seed: int = 0

    @classmethod
    def default(cls) -> "UtahRuleConfig":
        return cls()


@dataclass(frozen=True)
class DrawState:
    draw_year: int
    hunt: Hunt
    quota: Quota
    application_units: Tuple[ApplicationUnit, ...]
    rule_config: UtahRuleConfig = field(default_factory=UtahRuleConfig.default)
    applicant_pool_source: str = "fixture"
    quota_source: str = "fixture"
    data_cutoff_date: str = ""
    data_quality_grade: str = "F"


@dataclass(frozen=True)
class SimulationResult:
    draw_state: DrawState
    results: Tuple[DrawResult, ...]
    reason_codes: Tuple[str, ...]


def floor_average(values: Sequence[int]) -> int:
    if not values:
        return 0
    return floor(sum(values) / len(values))

