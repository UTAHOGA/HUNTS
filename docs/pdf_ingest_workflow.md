# PDF ingest workflow

This repo can ingest a hunt-related PDF **or a folder full of PDFs**, extract hunt-code rows, validate them against the canonical hunt engine data, and create cleaned review outputs.

## 1. Put the PDF in a local inbox

Keep large/source PDFs out of Git. A safe local-only folder is:

```text
_pdf_inbox/
```

Example:

```bash
mkdir -p _pdf_inbox
cp ~/Downloads/2026-harvest.pdf _pdf_inbox/2026-harvest.pdf
```

## 2. Run the ingest command

For one PDF:

```bash
npm run ingest:pdf -- _pdf_inbox/2026-harvest.pdf --id 2026-harvest --type harvest
```

For your 2025 harvest-report folder, run this from the repo root:

```bash
npm run ingest:pdf -- "C:/Users/tyler/Desktop/GitHub/HUNTS/pipeline/RAW/hunt_unit_database/2025/pdf/harvest_report" --id harvest-report-2025 --type harvest
```

For your 2025 draw-odds big-file folder, run this from the repo root:

```bash
npm run ingest:pdf -- "C:/Users/tyler/Desktop/GitHub/HUNTS/pipeline/RAW/hunt_unit_database/2025/pdf/draw_odds/big file" --id draw-odds-2025 --type draw-odds
```

If you run the repo from WSL/Linux, the script also understands the mounted form of those same paths when the drive is available:

```bash
npm run ingest:pdf -- /mnt/c/Users/tyler/Desktop/GitHub/HUNTS/pipeline/RAW/hunt_unit_database/2025/pdf/harvest_report --id harvest-report-2025 --type harvest
npm run ingest:pdf -- "/mnt/c/Users/tyler/Desktop/GitHub/HUNTS/pipeline/RAW/hunt_unit_database/2025/pdf/draw_odds/big file" --id draw-odds-2025 --type draw-odds
```

Supported parser types:

- `harvest` — extracts Utah-style harvest table rows with hunt code plus trailing metrics.
- `draw-odds` — extracts Utah-style bonus/draw-odds rows by hunt code, residency, point level, applicants, permit columns, and success ratio.
- `auto` — currently uses the harvest parser unless you explicitly choose `draw-odds`.

## 3. Review outputs

A one-PDF run writes a review package to:

```text
processed_data/pdf_ingest/<id>/
```

A folder run writes one child package per PDF plus batch-level files:

```text
processed_data/pdf_ingest/<batch-id>/batch-manifest.json
processed_data/pdf_ingest/<batch-id>/batch-summary.csv
processed_data/pdf_ingest/<batch-id>/<pdf-id>/sectioned-report.pdf
```

The important per-PDF files are:

- `manifest.json` — output index and summary.
- `source-metadata.json` — source path, hash, timestamp, and parser metadata.
- `pages.json` — text extracted from each PDF page.
- `sections.json` — detected species/topic sections by page.
- `extracted-rows.raw.json` — rows before canonical validation.
- `extracted-rows.cleaned.json` — normalized rows with canonical match flags and warnings.
- `extracted-rows.cleaned.csv` — spreadsheet-friendly cleaned rows. For `draw-odds`, this includes residency, points, applicants, bonus permits, regular permits, total permits, success ratio, and calculated draw-odds percent when the ratio is parseable.
- `rejects.json` — hunt-code chunks that could not be parsed cleanly.
- `validation-report.json` — canonical match counts, warning counts, and import recommendation.
- `sectioned-report.pdf` — readable report split by detected section plus rejects.

## 4. Only merge after validation

The ingest command intentionally does **not** overwrite canonical hunt-engine data. Treat the cleaned CSV/JSON and the sectioned PDF as a review package first.

Before importing rows into canonical engine files, check:

- `validation-report.json` has acceptable canonical matches.
- `rejects.json` does not contain important missing rows.
- `extracted-rows.cleaned.csv` has the expected hunt codes and metrics.
- `sectioned-report.pdf` reads cleanly enough for a non-technical review.

## 5. Optional PDF scrub/index command

For a quick page-hit index before full ingestion, run:

```bash
npm run scrub:pdf -- _pdf_inbox/2026-harvest.pdf
```

That writes `_exports/pdf-scrub.json` and prints metric/topic page hits.

## 6. Generated output is local by default

`processed_data/pdf_ingest/` is ignored by Git. Copy selected cleaned CSVs or sectioned PDFs somewhere permanent only after you have reviewed them.
