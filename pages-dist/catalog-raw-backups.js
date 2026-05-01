/**
 * Catalog the uoga_project_backup raw data folders (2024/2025/2026).
 *
 * This does NOT copy large files into the repo. It produces a small index so we
 * can see what's available and what extractions we should run next.
 *
 * Usage:
 *   node catalog-raw-backups.js
 *
 * Writes:
 *   processed_data/raw-backup-catalog.csv
 *   processed_data/raw-backup-catalog.json
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'processed_data');
const OUT_CSV = path.join(OUT_DIR, 'raw-backup-catalog.csv');
const OUT_JSON = path.join(OUT_DIR, 'raw-backup-catalog.json');

const RAW_DIRS = [
  'C:\\UOGA HUNTS\\uoga_project_backup\\raw_data_2024',
  'C:\\UOGA HUNTS\\uoga_project_backup\\raw_data 2025',
  'C:\\UOGA HUNTS\\uoga_project_backup\\raw_data_2026'
];

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function csvString(rows) {
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

function guessYear(name) {
  const m = String(name || '').match(/\b(2024|2025|2026)\b/);
  return m ? m[1] : '';
}

function guessCategory(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('preliminary') && n.includes('harvest')) return 'harvest_report';
  if (n.includes('harvest')) return 'harvest_report';
  if (n.includes('rac') && n.includes('packet')) return 'rac_packet';
  if (n.includes('rac') && n.includes('agenda')) return 'rac_agenda';
  if (n.includes('odds')) return 'draw_odds';
  if (n.includes('antlerless')) return 'antlerless';
  if (n.includes('bg-odds') || n.includes('bg_odds') || n.includes('bg-odds')) return 'draw_odds';
  if (n.includes('bg_report') || n.includes('bg report')) return 'harvest_report';
  return '';
}

function keywordSignals(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  const has = (s) => t.includes(s);
  return {
    has_hunt_code_tokens: /\b[A-Z]{2}\d{4}\b/.test(text || ''),
    has_harvest_table_headers: has('hunt #') && has('permits') && has('hunters') && has('harvest'),
    has_success: has('percent') && has('success'),
    has_avg_days: has('average') && has('days'),
    has_satisfaction: has('satisfaction'),
    has_average_age: has('average age') || has('avg age') || has('harvest age')
  };
}

async function scanPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  let sampleText = '';
  let pages = 0;
  await pdfParse(buf, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((tc) => {
        pages += 1;
        if (pages <= 3) {
          sampleText += ' ' + tc.items.map((it) => it.str).join(' ');
        }
        return ''; // reduce memory use
      })
  });
  const sig = keywordSignals(sampleText);
  return { pages, ...sig };
}

function scanWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellText: true, cellDates: true, cellNF: false });
  const names = wb.SheetNames || [];
  let hasAge = false;
  let hasSuccess = false;
  let hasDays = false;
  let hasSatisfaction = false;
  let hasHuntCode = false;
  let sheetCount = 0;
  names.slice(0, 6).forEach((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return;
    sheetCount += 1;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    for (let r = 0; r < Math.min(40, rows.length); r += 1) {
      const line = (rows[r] || []).join(' ');
      const s = keywordSignals(line);
      hasAge = hasAge || s.has_average_age;
      hasSuccess = hasSuccess || s.has_success;
      hasDays = hasDays || s.has_avg_days;
      hasSatisfaction = hasSatisfaction || s.has_satisfaction;
      hasHuntCode = hasHuntCode || s.has_hunt_code_tokens;
    }
  });
  return { sheets_scanned: sheetCount, has_average_age: hasAge, has_success: hasSuccess, has_avg_days: hasDays, has_satisfaction: hasSatisfaction, has_hunt_code_tokens: hasHuntCode };
}

async function main() {
  ensureDir(OUT_DIR);
  const rows = [];

  for (const dir of RAW_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).map((n) => path.join(dir, n));
    for (const filePath of files) {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      const name = path.basename(filePath);
      const ext = path.extname(name).toLowerCase().replace('.', '');
      const base = {
        source_dir: dir,
        name,
        ext,
        bytes: stat.size,
        year_guess: guessYear(name),
        category_guess: guessCategory(name)
      };

      try {
        if (ext === 'pdf') {
          const pdfInfo = await scanPdf(filePath);
          rows.push({ ...base, ...pdfInfo });
        } else if (ext === 'xlsx') {
          const wbInfo = scanWorkbook(filePath);
          rows.push({ ...base, ...wbInfo });
        } else if (ext === 'csv') {
          const header = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[0] || '';
          const sig = keywordSignals(header);
          rows.push({ ...base, csv_header: header.slice(0, 220), ...sig });
        } else {
          rows.push({ ...base });
        }
      } catch (err) {
        rows.push({ ...base, scan_error: String(err && err.message ? err.message : err) });
      }
    }
  }

  rows.sort((a, b) => (a.source_dir + a.name).localeCompare(b.source_dir + b.name));
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), roots: RAW_DIRS, rows }, null, 2));
  fs.writeFileSync(OUT_CSV, csvString(rows));

  console.log(`Catalog rows: ${rows.length}`);
  console.log(`Saved: ${OUT_CSV}`);
  console.log(`Saved: ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
