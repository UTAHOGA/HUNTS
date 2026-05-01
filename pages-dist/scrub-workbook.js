/**
 * Scrub an .xlsx workbook for hunting metrics and table-like data.
 *
 * We scan each sheet, try to detect the best header row, and report which columns
 * contain key metrics:
 * - avg harvest age
 * - success % / hunters / harvest
 * - days hunted
 * - satisfaction
 *
 * Usage:
 *   node scrub-workbook.js "C:\\path\\to\\file.xlsx"
 *
 * Output:
 *   - Prints a human-readable summary to stdout
 *   - Writes _exports/workbook-scrub.json for later use
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const OUT_DIR = path.join(__dirname, '_exports');
const OUT_JSON = path.join(OUT_DIR, 'workbook-scrub.json');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safe(s) {
  return String(s || '').trim();
}

function norm(s) {
  return safe(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

const KEYWORDS = {
  avg_age: ['avg age', 'average age', 'mean age', 'harvest age', 'age (avg)', 'age avg', 'avg. age', 'average harvest age'],
  success_pct: ['success', 'success %', 'success percent', '% success', 'percent success'],
  hunters: ['hunters', 'hunters afield', '# hunters', 'hunter count'],
  harvest: ['harvest', 'harvested', '# harvest', 'animals harvested'],
  days: ['avg days', 'average days', 'days hunted', 'avg days hunted', 'average days hunted'],
  satisfaction: ['satisfaction', 'satisfied', 'hunt satisfaction'],
  permits: ['permits', 'permit', 'tags', 'tag', 'quota'],
  unit: ['unit', 'unit name', 'hunt unit', 'unitname'],
  hunt: ['hunt', 'hunt code', 'hunt number', 'hunt_no', 'hunt id', 'hunt name']
};

function keywordScore(text) {
  const t = norm(text);
  let score = 0;
  for (const list of Object.values(KEYWORDS)) {
    for (const k of list) {
      if (t.includes(k)) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

function detectColumns(headers) {
  const found = {};
  for (const [key, list] of Object.entries(KEYWORDS)) {
    found[key] = [];
    headers.forEach((h, idx) => {
      const t = norm(h);
      if (!t) return;
      if (list.some((k) => t.includes(k))) found[key].push({ col: idx, header: h });
    });
  }
  return found;
}

function summarizeFound(found) {
  const out = {};
  Object.entries(found).forEach(([k, v]) => {
    out[k] = v.length ? v.map((x) => x.header) : [];
  });
  return out;
}

function scanSheet(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const maxRow = Math.min(range.e.r + 1, 120); // scan first 120 rows
  const maxCol = Math.min(range.e.c + 1, 80);  // scan first 80 cols

  // Pull a dense array, including blanks, so we can inspect header rows.
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false, defval: '' });

  let best = { rowIndex: -1, score: -1, headers: [] };

  for (let r = 0; r < Math.min(rows.length, maxRow); r += 1) {
    const row = rows[r] || [];
    const headers = row.slice(0, maxCol).map(safe);
    const nonEmpty = headers.filter((h) => h).length;
    if (nonEmpty < 4) continue;

    const joined = headers.join(' | ');
    const score = keywordScore(joined);

    // Favor rows that look like a real header: more non-empty + more keyword hits.
    const composite = score * 10 + Math.min(20, nonEmpty);
    if (composite > best.score) best = { rowIndex: r, score: composite, headers };
  }

  const headerRow = best.rowIndex >= 0 ? best.headers : [];
  const found = detectColumns(headerRow);

  // Determine if this sheet likely contains the hunter-value metrics we want.
  const hasCore =
    (found.success_pct.length || found.harvest.length) &&
    (found.days.length || found.satisfaction.length || found.hunters.length || found.permits.length);

  const hasAge = found.avg_age.length > 0;

  return {
    usedRef: ws['!ref'] || '',
    headerRowIndex: best.rowIndex >= 0 ? best.rowIndex + 1 : null, // 1-based
    headerCompositeScore: best.score,
    headerSample: headerRow.filter(Boolean).slice(0, 18),
    columns: summarizeFound(found),
    signals: {
      hasCoreMetrics: !!hasCore,
      hasAgeMetrics: !!hasAge,
      hasSuccess: !!(found.success_pct.length),
      hasHarvest: !!(found.harvest.length),
      hasHunters: !!(found.hunters.length),
      hasDays: !!(found.days.length),
      hasSatisfaction: !!(found.satisfaction.length),
      hasPermits: !!(found.permits.length)
    }
  };
}

function main() {
  const filePath = process.argv.slice(2).join(' ').trim().replace(/^\"|\"$/g, '');
  if (!filePath) {
    console.error('Usage: node scrub-workbook.js \"C:\\\\path\\\\file.xlsx\"');
    process.exit(2);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(2);
  }

  ensureDir(OUT_DIR);

  const wb = XLSX.readFile(filePath, { cellText: true, cellDates: true, cellNF: false });
  const sheets = wb.SheetNames || [];

  const report = {
    source: filePath,
    generatedAt: new Date().toISOString(),
    sheets: []
  };

  sheets.forEach((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return;
    report.sheets.push({ name, ...scanSheet(ws) });
  });

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const coreSheets = report.sheets.filter((s) => s.signals.hasCoreMetrics);
  const ageSheets = report.sheets.filter((s) => s.signals.hasAgeMetrics);

  console.log(`Workbook: ${filePath}`);
  console.log(`Sheets: ${report.sheets.length}`);
  console.log(`Core metric sheets (success/harvest + effort/satisfaction/etc): ${coreSheets.length}`);
  console.log(`Age metric sheets (avg harvest age): ${ageSheets.length}`);
  console.log('');

  function printSheet(s) {
    console.log(`- ${s.name}  [ref ${s.usedRef || '?'}]`);
    console.log(`  header row: ${s.headerRowIndex || 'none'}  score: ${s.headerCompositeScore}`);
    console.log(`  cols: age=${(s.columns.avg_age || []).length} success=${(s.columns.success_pct || []).length} harvest=${(s.columns.harvest || []).length} hunters=${(s.columns.hunters || []).length} days=${(s.columns.days || []).length} satisfaction=${(s.columns.satisfaction || []).length}`);
    if (s.headerSample && s.headerSample.length) console.log(`  header sample: ${s.headerSample.join(' | ')}`);
  }

  if (ageSheets.length) {
    console.log('Sheets with AGE signals:');
    ageSheets.slice(0, 18).forEach(printSheet);
    if (ageSheets.length > 18) console.log(`  (+${ageSheets.length - 18} more)`);
    console.log('');
  }

  if (coreSheets.length) {
    console.log('Sheets with CORE hunt metrics:');
    coreSheets.slice(0, 18).forEach(printSheet);
    if (coreSheets.length > 18) console.log(`  (+${coreSheets.length - 18} more)`);
    console.log('');
  }

  // If nothing obvious, still print the top scored sheets so we can iterate.
  if (!ageSheets.length && !coreSheets.length) {
    console.log('No strong metric sheets detected in scan; showing top 12 scored sheets:');
    report.sheets
      .slice()
      .sort((a, b) => (b.headerCompositeScore || 0) - (a.headerCompositeScore || 0))
      .slice(0, 12)
      .forEach(printSheet);
    console.log('');
  }

  console.log(`Saved: ${OUT_JSON}`);
}

main();

