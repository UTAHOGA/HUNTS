"""Shared constants for the Utah draw engine."""

MODEL_VERSION = "hybrid_ml_v1.0.0"
RULE_VERSION = "utah_draw_model_v1.0.0"
DEFAULT_PREDICTION_YEAR = 2026

REQUIRED_MODELED_FIELDS = [
    "prediction_year",
    "hunt_code",
    "residency",
    "points",
    "p_draw_mean",
    "p_draw_p10",
    "p_draw_p50",
    "p_draw_p90",
    "p_reserved_mean",
    "p_random_mean",
    "p_preference_mean",
    "p_youth_mean",
    "expected_cutoff_points",
    "cutoff_bucket_probability",
    "guaranteed_probability",
    "point_creep_1yr",
    "point_creep_3yr",
    "quota_source",
    "applicant_pool_source",
    "model_version",
    "rule_version",
    "data_cutoff_date",
    "data_quality_grade",
    "reason_codes",
    "display_odds_pct",
]

LEGACY_OUTPUT_FIELDS = [
    "odds_2026_projected",
    "max_pool_projection_2026",
    "random_draw_odds_2026",
    "random_draw_projection_2026",
    "draw_outlook",
    "trend",
    "status",
]

