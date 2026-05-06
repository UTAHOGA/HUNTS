#!/usr/bin/env python3
"""
Text-check manual-review files and narrow to safe-to-move candidates.

Inputs:
  processed_data/required_move_screen_manual_review.csv

Outputs:
  processed_data/manual_review_textcheck_all.csv
  processed_data/safe_to_move_after_text_check.csv
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None


REPO = Path(__file__).resolve().parents[3]
INPUT_CSV = REPO / "processed_data" / "required_move_screen_manual_review.csv"
ALL_OUT = REPO / "processed_data" / "manual_review_textcheck_all.csv"
SAFE_OUT = REPO / "processed_data" / "safe_to_move_after_text_check.csv"


def normalize_two_digit_year(yy: int) -> int:
    if 0 <= yy <= 40:
        return 2000 + yy
    return 1900 + yy


def model_target_year(publish_year: str, reported_year: str, doc_type: str) -> str:
    if doc_type in {"draw_results", "harvest_report"}:
        if reported_year.isdigit():
            return str(int(reported_year) + 1)
        if publish_year.isdigit():
            return publish_year
        return "unknown"
    if doc_type == "regulation":
        return publish_year if publish_year.isdigit() else "unknown"
    return publish_year if publish_year.isdigit() else "unknown"


def infer_from_filename(name: str) -> Tuple[Optional[int], str]:
    lower = name.lower()

    # 2020-21 / 2020_21 style: take first year as reported season year.
    m4range = re.search(r"(?<!\d)(20\d{2})\s*[-_–]\s*(20\d{2}|\d{2})(?!\d)", lower)
    if m4range:
        return int(m4range.group(1)), "filename_range_4digit"

    # 20-21 style leading token
    m2range = re.search(r"(?<!\d)(\d{2})\s*[-_–]\s*(\d{2})(?!\d)", lower)
    if m2range:
        return normalize_two_digit_year(int(m2range.group(1))), "filename_range_2digit"

    # Any standalone 4-digit year
    m4 = re.search(r"(?<!\d)(20\d{2})(?!\d)", lower)
    if m4:
        return int(m4.group(1)), "filename_year_4digit"

    return None, "no_filename_year"


def extract_pdf_text(path: Path, max_pages: int = 3) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(str(path), strict=False)
        chunks: List[str] = []
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                continue
        return " ".join(chunks)
    except Exception:
        return ""


def infer_from_text(text: str) -> Tuple[Optional[int], str]:
    if not text:
        return None, "no_text"

    t = re.sub(r"\s+", " ", text).lower()

    # Explicit year near draw/harvest context
    m_context = re.search(r"(20\d{2})\s*(draw|harvest|hunting season|season)", t)
    if m_context:
        return int(m_context.group(1)), "text_context_year"

    # Season ranges like 2020-21 or 2020-2021
    m_range = re.search(r"(20\d{2})\s*[-–]\s*(20\d{2}|\d{2})", t)
    if m_range:
        return int(m_range.group(1)), "text_year_range"

    # Generic 4-digit year fallback
    m_any = re.search(r"(?<!\d)(20\d{2})(?!\d)", t)
    if m_any:
        return int(m_any.group(1)), "text_any_year"

    return None, "no_text_year"


def choose_year(
    doc_type: str,
    file_year: Optional[int],
    file_method: str,
    text_year: Optional[int],
    text_method: str,
) -> Tuple[str, str, str]:
    # Prefer text context for draw/harvest, then filename range/year.
    if doc_type in {"draw_results", "harvest_report"}:
        if text_year is not None:
            conf = "high" if text_method in {"text_context_year", "text_year_range"} else "medium"
            return str(text_year), text_method, conf
        if file_year is not None:
            conf = "medium" if "range" in file_method else "low"
            return str(file_year), file_method, conf
        return "unknown", "no_year_signal", "manual_review"

    # For regulation/other_hunt, use explicit text year if available, else filename.
    if text_year is not None:
        conf = "medium" if text_method != "text_any_year" else "low"
        return str(text_year), text_method, conf
    if file_year is not None:
        conf = "low"
        return str(file_year), file_method, conf
    return "unknown", "no_year_signal", "manual_review"


def recommended_path(current_path: str, target_year: str) -> str:
    if not target_year.isdigit():
        return ""
    p = Path(current_path)
    parts = list(p.parts)
    try:
        i = [x.lower() for x in parts].index("hunt_unit_database")
        if i + 1 < len(parts):
            parts[i + 1] = target_year
            return str(Path(*parts))
    except Exception:
        pass
    return ""


def run() -> None:
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Missing input: {INPUT_CSV}")

    with INPUT_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    out_rows: List[Dict[str, str]] = []

    for row in rows:
        current_path = row["current_path"]
        path = Path(current_path)
        doc_type = row["doc_type"]
        ext = row["extension"].lower()
        publish = row["publish_year_folder"]

        file_year, file_method = infer_from_filename(path.name)
        text = extract_pdf_text(path) if ext == ".pdf" else ""
        text_year, text_method = infer_from_text(text)

        inferred, infer_method, infer_conf = choose_year(
            doc_type, file_year, file_method, text_year, text_method
        )
        target = model_target_year(publish, inferred, doc_type)

        safe_move = (
            infer_conf in {"high", "medium"}
            and publish.isdigit()
            and target.isdigit()
            and int(publish) != int(target)
        )

        out_rows.append(
            {
                "filename": row["filename"],
                "extension": ext,
                "doc_type": doc_type,
                "publish_year_folder": publish,
                "inferred_reported_hunt_year": inferred,
                "inference_method": infer_method,
                "inference_confidence": infer_conf,
                "model_target_year_after_text_check": target,
                "safe_to_move_after_text_check": "yes" if safe_move else "no",
                "current_path": current_path,
                "recommended_path_after_text_check": recommended_path(current_path, target),
            }
        )

    out_rows.sort(key=lambda r: (r["safe_to_move_after_text_check"] != "yes", r["current_path"]))
    safe_rows = [r for r in out_rows if r["safe_to_move_after_text_check"] == "yes"]

    fieldnames = list(out_rows[0].keys()) if out_rows else [
        "filename",
        "extension",
        "doc_type",
        "publish_year_folder",
        "inferred_reported_hunt_year",
        "inference_method",
        "inference_confidence",
        "model_target_year_after_text_check",
        "safe_to_move_after_text_check",
        "current_path",
        "recommended_path_after_text_check",
    ]

    ALL_OUT.parent.mkdir(parents=True, exist_ok=True)
    with ALL_OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    with SAFE_OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(safe_rows)

    print(f"INPUT_ROWS={len(rows)}")
    print(f"TEXTCHECK_ROWS={len(out_rows)} -> {ALL_OUT}")
    print(f"SAFE_MOVE_ROWS={len(safe_rows)} -> {SAFE_OUT}")


if __name__ == "__main__":
    run()
