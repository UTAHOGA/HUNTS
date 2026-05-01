/**
 * Audit "NORMALIZED STAGING" CSVs so we can see:
 * - which files are truly structured (hunt_code/points/applicants/permits)
 * - which are still blob-style (block_text only)
 * - how much matches the canonical hunt master
 *
 * Usage:
 *   node audit-normalized-staging.js "C:\\UOGA HUNTS\\PROJECT CORE\\NORMALIZED STAGING"
 *
 * Writes:
 *   processed_data/normalized-staging-audit.json
 *   processed_data/normalized-staging-audit.csv
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CANON_MASTER = path.join(ROOT, 'hunt_master_canonical_2026_built.csv');
const OUT_DIR = path.join(ROOT, 'processed_data');
const OUT_JSON = path.join(OUT_DIR, 'normalized-staging-audit.json');
const OUT_CSV = path.join(OUT_DIR, 'normalized-staging-audit.csv');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readFirstLine(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.allocUnsafe(64 * 1024);
  const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const text = buf.subarray(0, bytes).toString('utf8');
  const first = text.split(/\r?\n/)[0] || '';
  return first.replace(/\ufeff/g, '').trim();
}

function countLines(filePath, max = 2_000_000) {
  // Simple newline counter; bounded for safety.
  const stat = fs.statSync(filePath);
  const cap = Math.min(stat.size, max);
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.allocUnsafe(cap);
  const bytes = fs.readSync(fd, buf, 0, cap, 0);
  fs.closeSync(fd);
  const text = buf.subarray(0, bytes).toString('utf8');
  const lines = text.split(/\r?\n/).length - 1;
  return stat.size > cap ? `${lines}+` : `${lines}`;
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

function loadCanonCodes() {
  if (!fs.existsSync(CANON_MASTER)) return new Set();
  const lines = fs.readFileSync(CANON_MASTER, 'utf8').trim().split(/\r?\n/);
  const set = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const code = (lines[i].split(',')[0] || '').trim().toUpperCase();
    if (code) set.add(code);
  }
  return set;
}

function sampleHuntCodes(filePath, header, limit = 2000) {
  const cols = header.split(',');
  const huntIdx = cols.findIndex((c) => c.trim() === 'hunt_code');
  if (huntIdx < 0) return { present: false, sampled: 0, matched: 0, unmatched: 0 };

  const text = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let sampled = 0;
  const set = new Set();
  for (let i = 1; i < text.length && set.size < limit; i += 1) {
    const line = text[i];
    if (!line) continue;
    const parts = line.split(',');
    const code = (parts[huntIdx] || '').trim().toUpperCase();
    if (code) set.add(code);
  }
  sampled = set.size;
  return { present: true, codes: set, sampled };
}

function sampleValuePresence(filePath, header, maxRows = 4000) {
  const cols = header.split(',').map((c) => c.trim());
  const idx = {
    points: cols.indexOf('points') >= 0 ? cols.indexOf('points') : cols.indexOf('point_level'),
    applicants: cols.indexOf('applicants'),
    permits: cols.indexOf('permits') >= 0 ? cols.indexOf('permits') : (cols.indexOf('total_permits') >= 0 ? cols.indexOf('total_permits') : cols.indexOf('permits_total'))
  };

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let scanned = 0;
  let withPoints = 0;
  let withApplicants = 0;
  let withPermits = 0;
  for (let i = 1; i < lines.length && scanned < maxRows; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    scanned += 1;
    if (idx.points >= 0 && parts[idx.points] && String(parts[idx.points]).trim()) withPoints += 1;
    if (idx.applicants >= 0 && parts[idx.applicants] && String(parts[idx.applicants]).trim()) withApplicants += 1;
    if (idx.permits >= 0 && parts[idx.permits] && String(parts[idx.permits]).trim()) withPermits += 1;
  }
  return { scanned, withPoints, withApplicants, withPermits };
}

function main() {
  const dir = process.argv.slice(2).join(' ').trim().replace(/^\"|\"$/g, '');
  if (!dir) {
    console.error('Usage: node audit-normalized-staging.js \"C:\\\\path\\\\to\\\\NORMALIZED STAGING\"');
    process.exit(2);
  }
  if (!fs.existsSync(dir)) {
    console.error(`Not found: ${dir}`);
    process.exit(2);
  }

  ensureDir(OUT_DIR);
  const canon = loadCanonCodes();

  const files = fs
    .readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.csv'))
    .map((n) => path.join(dir, n));

  const audit = [];

  files.forEach((filePath) => {
    const header = readFirstLine(filePath);
    const cols = header.split(',').map((c) => c.trim());
    const colSet = new Set(cols);

    const has = (name) => colSet.has(name);
    const structured =
      has('hunt_code') &&
      has('residency') &&
      (has('points') || has('point_level')) &&
      has('applicants') &&
      (has('permits') || has('total_permits') || has('permits_total'));

    const blob = has('block_text') || has('raw_block_text');

    const sample = sampleHuntCodes(filePath, header);
    const valuePresence = sampleValuePresence(filePath, header);
    let matched = 0;
    let unmatched = 0;
    if (sample.present && sample.codes) {
      for (const code of sample.codes.values()) {
        if (canon.has(code)) matched += 1;
        else unmatched += 1;
      }
    }

    audit.push({
      file: path.basename(filePath),
      bytes: fs.statSync(filePath).size,
      approx_rows: countLines(filePath),
      structured: structured ? 'YES' : 'NO',
      blob_style: blob ? 'YES' : 'NO',
      has_hunt_code: has('hunt_code') ? 'YES' : 'NO',
      has_points: has('points') || has('point_level') ? 'YES' : 'NO',
      has_applicants: has('applicants') ? 'YES' : 'NO',
      has_permits: has('permits') || has('total_permits') || has('permits_total') ? 'YES' : 'NO',
      sample_rows_scanned_for_values: valuePresence.scanned,
      sample_rows_with_points_value: valuePresence.withPoints,
      sample_rows_with_applicants_value: valuePresence.withApplicants,
      sample_rows_with_permits_value: valuePresence.withPermits,
      sample_unique_hunt_codes: sample.present ? sample.sampled : 0,
      sample_codes_in_canonical: matched,
      sample_codes_not_in_canonical: unmatched
    });
  });

  audit.sort((a, b) => a.file.localeCompare(b.file));

  const report = {
    sourceDir: dir,
    generatedAt: new Date().toISOString(),
    canonical: path.relative(ROOT, CANON_MASTER),
    totals: {
      files: audit.length,
      structured: audit.filter((r) => r.structured === 'YES').length,
      blobStyle: audit.filter((r) => r.blob_style === 'YES').length
    },
    files: audit
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_CSV, csvString(audit));

  console.log(`Audited: ${dir}`);
  console.log(`Files: ${audit.length}`);
  console.log(`Structured: ${report.totals.structured}`);
  console.log(`Blob-style: ${report.totals.blobStyle}`);
  console.log(`Saved: ${OUT_CSV}`);
  console.log(`Saved: ${OUT_JSON}`);
}

main();
