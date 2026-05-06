from __future__ import annotations

from engine.utah.calibration import calibration_band_summary


def test_calibration_band_summary():
    bands = calibration_band_summary([(0.95, True), (0.95, False), (0.20, False)])
    assert any(b.label == "0.90-0.99" for b in bands)
    assert any(b.label == "0.10-0.25" for b in bands)

