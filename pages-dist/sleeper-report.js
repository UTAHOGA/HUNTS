/**
 * Build a "sleeper units" report from the canonical hunt master.
 *
 * Goal:
 * - Focus Elk + Deer (mule deer) for now
 * - Use 2025 observed harvest metrics (success, days, satisfaction)
 * - Surface hunts that look "better than expected" on a simple composite
 *
 * Notes:
 * - "Trophy" (score) isn't available; this is a performance/experience sleeper list.
 * - True "average harvest age" is not present in our current canonical files.
 *
 * Usage:
 *   node sleeper-report.js
 *
 * Outputs:
 *   processed_data/sleeper-report-elk-deer-2025.csv
 *   processed_data/sleeper-report-elk-deer-2025.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'hunt_master_canonical_2026_built.csv');
const OUT_DIR = path.join(ROOT, 'processed_data');
const OUT_CSV = path.join(OUT_DIR, 'sleeper-report-elk-deer-2025.csv');
const OUT_JSON = path.join(OUT_DIR, 'sleeper-report-elk-deer-2025.json');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (!inQ && ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function toNum(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function clamp01(x) {
  if (x == null) return null;
  return Math.max(0, Math.min(1, x));
}

function percentileRank(sorted, value) {
  // returns 0..1
  if (!sorted.length) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
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

function normalizeSpecies(species) {
  const s = String(species || '').toLowerCase().trim();
  if (s === 'elk') return 'Elk';
  if (s === 'deer') return 'Deer';
  return null;
}

function computeComposite(row, dist) {
  // dist contains sorted arrays for success/days/satisfaction within the species bucket.
  // Higher success + higher satisfaction + lower days => higher composite.
  const success = row.success_percent_2025;
  const sat = row.satisfaction_2025;
  const days = row.avg_days_2025;

  if (success == null || sat == null || days == null) return null;

  const pSuccess = percentileRank(dist.success, success);      // higher better
  const pSat = percentileRank(dist.sat, sat);                  // higher better
  const pDays = 1 - percentileRank(dist.days, days);           // lower better

  // Weighted (success leads).
  return clamp01((0.55 * pSuccess) + (0.30 * pSat) + (0.15 * pDays));
}

function main() {
  if (!fs.existsSync(MASTER)) {
    console.error(`Missing: ${MASTER}`);
    process.exit(2);
  }
  ensureDir(OUT_DIR);

  const lines = fs.readFileSync(MASTER, 'utf8').trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const needed = [
    'hunt_code',
    'species',
    'hunt_name',
    'hunt_type',
    'weapon',
    'hunt_class',
    'access_type',
    'permits_2026_total',
    'hunters_2025',
    'harvest_2025',
    'success_percent_2025',
    'avg_days_2025',
    'satisfaction_2025',
    'has_harvest'
  ];
  const missing = needed.filter((k) => idx[k] == null);
  if (missing.length) {
    console.error(`Missing expected columns in master: ${missing.join(', ')}`);
    process.exit(2);
  }

  const raw = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = parseCsvLine(lines[i]);
    if (!parts.length || !parts[idx.hunt_code]) continue;
    const species = normalizeSpecies(parts[idx.species]);
    if (!species) continue;
    if (species !== 'Elk' && species !== 'Deer') continue;

    // Only rows that actually have 2025 harvest metrics.
    const hasHarvest = String(parts[idx.has_harvest]).toLowerCase() === 'true';
    if (!hasHarvest) continue;

    raw.push({
      hunt_code: parts[idx.hunt_code],
      species,
      hunt_name: parts[idx.hunt_name],
      hunt_type: parts[idx.hunt_type],
      weapon: parts[idx.weapon],
      hunt_class: parts[idx.hunt_class],
      access_type: parts[idx.access_type],
      permits_2026_total: toNum(parts[idx.permits_2026_total]),
      hunters_2025: toNum(parts[idx.hunters_2025]),
      harvest_2025: toNum(parts[idx.harvest_2025]),
      success_percent_2025: toNum(parts[idx.success_percent_2025]),
      avg_days_2025: toNum(parts[idx.avg_days_2025]),
      satisfaction_2025: toNum(parts[idx.satisfaction_2025])
    });
  }

  const distBySpecies = {};
  ['Elk', 'Deer'].forEach((s) => {
    const rows = raw.filter((r) => r.species === s);
    distBySpecies[s] = {
      success: rows.map((r) => r.success_percent_2025).filter((v) => v != null).sort((a, b) => a - b),
      sat: rows.map((r) => r.satisfaction_2025).filter((v) => v != null).sort((a, b) => a - b),
      days: rows.map((r) => r.avg_days_2025).filter((v) => v != null).sort((a, b) => a - b)
    };
  });

  const scored = raw
    .map((r) => {
      const composite = computeComposite(r, distBySpecies[r.species]);
      const unsuccessful_2025 = (r.hunters_2025 != null && r.harvest_2025 != null) ? (r.hunters_2025 - r.harvest_2025) : null;
      return {
        ...r,
        unsuccessful_2025,
        composite_score: composite == null ? null : Number(composite.toFixed(4))
      };
    })
    .filter((r) => r.composite_score != null)
    .sort((a, b) => (b.composite_score - a.composite_score));

  // Keep a tight list so it's readable in the UI and export.
  const top = scored.slice(0, 200);

  fs.writeFileSync(OUT_CSV, csvString(top));
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: path.relative(ROOT, MASTER),
        notes: {
          meaning: 'Composite score uses within-species percentiles: success (55%), satisfaction (30%), low days (15%).',
          trophyNote: 'This does not include trophy score/age; it is a performance/experience sleeper list.'
        },
        rows: top
      },
      null,
      2
    )
  );

  console.log(`Source: ${MASTER}`);
  console.log(`Rows (elk+deer with 2025 harvest metrics): ${raw.length}`);
  console.log(`Top rows exported: ${top.length}`);
  console.log(`Saved: ${OUT_CSV}`);
  console.log(`Saved: ${OUT_JSON}`);
}

main();

