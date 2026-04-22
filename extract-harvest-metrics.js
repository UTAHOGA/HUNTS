/**
 * Extract per-hunt metrics from the "Utah Big Game Harvest" PDF tables.
 *
 * Target output (by hunt code):
 * - permits
 * - hunters
 * - harvest
 * - percent success
 * - average days
 * - average satisfaction
 *
 * We intentionally avoid parsing "hunt name / weapon / sex type" from the PDF:
 * we can join metrics back to the canonical hunt master by hunt code.
 *
 * Usage:
 *   node extract-harvest-metrics.js "C:\\path\\to\\harvest.pdf"
 *
 * Writes:
 *   processed_data/harvest-metrics-extract.json
 *   processed_data/harvest-metrics-extract.csv
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const OUT_DIR = path.join(__dirname, 'processed_data');
const OUT_JSON = path.join(OUT_DIR, 'harvest-metrics-extract.json');
const OUT_CSV = path.join(OUT_DIR, 'harvest-metrics-extract.csv');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function collapseWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[\",\r\n]/.test(s)) return `"${s.replace(/\"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  rows.forEach((r) => lines.push(headers.map((h) => esc(r[h])).join(',')));
  return lines.join('\r\n') + '\r\n';
}

async function readPages(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const pageTexts = [];
  await pdfParse(buf, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((tc) => {
        // Join using spaces (not newlines) because the table comes out flattened anyway.
        const text = tc.items.map((it) => it.str).join(' ');
        pageTexts.push(text);
        return text;
      })
  });
  return pageTexts;
}

function extractRowsFromText(text) {
  const t = collapseWs(text);
  const codeRe = /\b[A-Z]{2}\d{4}\b/g;
  const matches = [...t.matchAll(codeRe)];
  const chunks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : t.length;
    if (start == null || end == null) continue;
    chunks.push(t.slice(start, end).trim());
  }
  return chunks;
}

function parseChunk(chunk) {
  // Example:
  // BI0001 Bison Antelope Island OIAL Any Legal Weapon Hunter's Choice 7 7 7 100.0 1.0 4.8
  const c = collapseWs(chunk);
  const code = (c.match(/^[A-Z]{2}\d{4}\b/) || [])[0];
  if (!code) return { ok: false, reason: 'no_code', raw: c };

  // Grab trailing numeric metrics.
  const m = c.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);
  if (!m) return { ok: false, reason: 'no_tail_metrics', code, raw: c };

  const permits = Number(m[1]);
  const hunters = Number(m[2]);
  const harvest = Number(m[3]);
  const percentSuccess = Number(m[4]);
  const avgDays = Number(m[5]);
  const avgSatisfaction = Number(m[6]);

  return {
    ok: true,
    row: {
      huntCode: code,
      permits,
      hunters,
      harvest,
      percentSuccess,
      avgDays,
      avgSatisfaction
    }
  };
}

async function main() {
  const pdfPath = process.argv.slice(2).join(' ').trim().replace(/^\"|\"$/g, '');
  if (!pdfPath) {
    console.error('Usage: node extract-harvest-metrics.js \"C:\\\\path\\\\harvest.pdf\"');
    process.exit(2);
  }
  if (!fs.existsSync(pdfPath)) {
    console.error(`File not found: ${pdfPath}`);
    process.exit(2);
  }

  ensureDir(OUT_DIR);

  const pages = await readPages(pdfPath);
  const allChunks = pages.flatMap(extractRowsFromText);

  const rows = [];
  const rejects = [];
  allChunks.forEach((chunk) => {
    const r = parseChunk(chunk);
    if (r.ok) rows.push(r.row);
    else rejects.push(r);
  });

  // Dedupe by hunt code (PDF sometimes repeats headers / partial rows).
  const deduped = new Map();
  rows.forEach((r) => {
    if (!deduped.has(r.huntCode)) deduped.set(r.huntCode, r);
  });

  const finalRows = Array.from(deduped.values()).sort((a, b) => a.huntCode.localeCompare(b.huntCode));

  const report = {
    source: pdfPath,
    generatedAt: new Date().toISOString(),
    pages: pages.length,
    chunksDetected: allChunks.length,
    rowsParsed: rows.length,
    rowsUnique: finalRows.length,
    rejects: rejects.slice(0, 80)
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify({ report, rows: finalRows }, null, 2));
  fs.writeFileSync(OUT_CSV, toCsv(finalRows));

  console.log(`PDF: ${pdfPath}`);
  console.log(`Pages: ${pages.length}`);
  console.log(`Row chunks detected: ${allChunks.length}`);
  console.log(`Rows parsed: ${rows.length}`);
  console.log(`Unique rows (by huntCode): ${finalRows.length}`);
  console.log(`Saved: ${OUT_CSV}`);
  console.log(`Saved: ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

