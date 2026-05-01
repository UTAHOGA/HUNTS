/**
 * Rebuild (and overlay) engine + ladder artifacts from authoritative sources.
 *
 * Why:
 * - We want a reproducible pipeline for the Hunt Research engine outputs.
 * - The "NORMALIZED STAGING" directory is useful, but many rows are still blob-style.
 * - The site already has structured, authoritative artifacts:
 *   - processed_data/projected_bonus_draw_2026_simulated.csv  (2026 model)
 *   - processed_data/historical_trend_2025.csv                (2025 base)
 *
 * This script:
 * 1) Builds new rows for any hunt/residency present in the 2026 projection file.
 * 2) Overlays those rows onto the existing production files so coverage does not regress:
 *    - processed_data/draw_reality_engine.csv
 *    - processed_data/point_ladder_view.csv
 *
 * Writes:
 * - processed_data/draw_reality_engine.rebuilt.csv
 * - processed_data/point_ladder_view.rebuilt.csv
 *
 * Usage:
 *   node rebuild-engine-from-projection.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const INPUT_ENGINE = path.join(ROOT, 'processed_data', 'draw_reality_engine.csv');
const INPUT_LADDER = path.join(ROOT, 'processed_data', 'point_ladder_view.csv');
const INPUT_HISTORY = path.join(ROOT, 'processed_data', 'historical_trend_2025.csv');
const INPUT_PROJECTION = path.join(ROOT, 'processed_data', 'projected_bonus_draw_2026_simulated.csv');

const OUT_ENGINE = path.join(ROOT, 'processed_data', 'draw_reality_engine.rebuilt.csv');
const OUT_LADDER = path.join(ROOT, 'processed_data', 'point_ladder_view.rebuilt.csv');

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  const lines = text ? text.split(/\r?\n/) : [];
  const header = lines.length ? parseCsvLine(lines[0]) : [];
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < header.length; c += 1) row[header[c]] = parts[c] ?? '';
    rows.push(row);
  }
  return { header, rows };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  const s = String(line ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '"') {
      if (inQ && s[i + 1] === '"') {
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

function writeCsv(filePath, header, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[\",\r\n]/.test(s)) return `"${s.replace(/\"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  rows.forEach((r) => lines.push(header.map((h) => esc(r[h] ?? '')).join(',')));
  fs.writeFileSync(filePath, lines.join('\r\n') + '\r\n');
}

function normKey(huntCode, residency) {
  const code = String(huntCode || '').trim().toUpperCase();
  const res = String(residency || '').trim().toLowerCase() === 'nonresident' ? 'Nonresident' : 'Resident';
  return `${code}__${res}`;
}

function toNum(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function fmt3(v) {
  const n = toNum(v);
  return n == null ? '' : n.toFixed(3);
}

function trendFromDeltaGap(deltaGap) {
  const n = toNum(deltaGap);
  if (n == null) return 'YELLOW';
  if (n <= -1) return 'GREEN';
  if (n === 0) return 'YELLOW';
  return 'RED';
}

function outlook(status, deltaGap, gap) {
  if (status === 'MAX POOL') return 'GREEN LIGHT';
  const dg = toNum(deltaGap);
  if (dg != null && dg >= 1) return 'POINT CREEP DEFEAT';
  if (Number(gap) === 1) return 'MAY DRAW IN 5-10 YEARS';
  return 'LONG ODDS';
}

function buildHistoryLookup(historyRows) {
  const byGroup = new Map();
  historyRows.forEach((r) => {
    const k = normKey(r.hunt_code, r.residency);
    if (!byGroup.has(k)) {
      byGroup.set(k, {
        public_permits_2025: toNum(r.public_permits_2025) ?? 0,
        max_point_permits_2025: toNum(r.max_point_permits_2025) ?? 0,
        random_permits_2025: toNum(r.random_permits_2025) ?? 0,
        guaranteed_at_2025: toNum(r.guaranteed_at_2025) ?? 0,
        odds_2025_by_points: new Map(),
        applicants_2025_by_points: new Map()
      });
    }
    const g = byGroup.get(k);
    const pts = toNum(r.points);
    if (pts == null) return;
    g.odds_2025_by_points.set(pts, String(r.odds_2025_actual || 'N/A'));
    g.applicants_2025_by_points.set(pts, toNum(r.applicants_2025) ?? 0);
  });
  return byGroup;
}

function buildProjectionGroups(projectionRows) {
  const groups = new Map();
  projectionRows.forEach((r) => {
    if (String(r.projection_year || '') !== '2026') return;
    const k = normKey(r.hunt_code, r.residency);
    if (!groups.has(k)) {
      groups.set(k, {
        hunt_code: String(r.hunt_code || '').trim().toUpperCase(),
        residency: String(r.residency || '').trim().toLowerCase() === 'nonresident' ? 'Nonresident' : 'Resident',
        // We keep permits + sources authoritative from the *site* master/history, not the simulation metadata,
        // because the simulation file carries verbose strings and can differ in prior-year totals.
        public_permits_2026_hint: toNum(r.current_recommended_permits) ?? 0,
        bonus_cutoff_point: toNum(r.projected_bonus_cutoff_point),
        applicants_by_points: new Map(),
        random_prob_by_points: new Map(),
        total_prob_by_points: new Map()
      });
    }
    const g = groups.get(k);
    const pts = toNum(r.apply_with_points);
    if (pts == null) return;
    g.applicants_by_points.set(pts, toNum(r.projected_total_applicants_at_point) ?? 0);
    g.random_prob_by_points.set(pts, toNum(r.projected_random_probability_pct));
    g.total_prob_by_points.set(pts, toNum(r.projected_total_probability_pct));
    // Keep group-level cutoff if present; sometimes it repeats.
    if (g.bonus_cutoff_point == null && toNum(r.projected_bonus_cutoff_point) != null) g.bonus_cutoff_point = toNum(r.projected_bonus_cutoff_point);
  });
  return groups;
}

function buildEngineGroupMeta(existingEngineRows) {
  const metaByGroup = new Map();
  existingEngineRows.forEach((r) => {
    const gk = normKey(r.hunt_code, r.residency);
    if (!metaByGroup.has(gk)) metaByGroup.set(gk, r);
  });
  return metaByGroup;
}

function overlayEngine(existingEngine, historyByGroup, projGroups) {
  const header = existingEngine.header;
  const baseRows = existingEngine.rows;

  const byKey = new Map();
  const baseOrder = [];
  baseRows.forEach((r) => {
    const k = `${normKey(r.hunt_code, r.residency)}__${String(r.points ?? '').trim()}`;
    byKey.set(k, r);
    baseOrder.push(k);
  });

  const groupMeta = buildEngineGroupMeta(baseRows);
  const replaced = { rows: 0, groups: 0 };

  for (const [gk, g] of projGroups.entries()) {
    const hist = historyByGroup.get(gk);
    const meta = groupMeta.get(gk);

    // Precompute above sums for speed.
    const ptsList = Array.from(g.applicants_by_points.keys()).sort((a, b) => a - b);
    const aboveSum = new Map();
    let running = 0;
    for (let i = ptsList.length - 1; i >= 0; i -= 1) {
      aboveSum.set(ptsList[i], running);
      running += g.applicants_by_points.get(ptsList[i]) || 0;
    }

    replaced.groups += 1;

    ptsList.forEach((pts) => {
      const applicantsAt = g.applicants_by_points.get(pts) || 0;
      const applicantsAbove = aboveSum.get(pts) || 0;

      const base = byKey.get(`${gk}__${pts}`);

      // Default to the existing engine row for everything except projection-derived columns.
      // This preserves the authoritative permit splits + status/trend/outlook logic used by the live site.
      const row = base ? { ...base } : {
        hunt_code: g.hunt_code,
        residency: g.residency,
        points: String(pts),
        public_permits_2025: meta?.public_permits_2025 ?? String(hist ? hist.public_permits_2025 : ''),
        public_permits_2026: meta?.public_permits_2026 ?? String(g.public_permits_2026_hint || 0),
        public_permits_2026_source: meta?.public_permits_2026_source ?? 'projection_hint_2026',
        max_point_permits_2025: meta?.max_point_permits_2025 ?? String(hist ? hist.max_point_permits_2025 : ''),
        max_point_permits_2026: meta?.max_point_permits_2026 ?? '',
        random_permits_2025: meta?.random_permits_2025 ?? String(hist ? hist.random_permits_2025 : ''),
        random_permits_2026: meta?.random_permits_2026 ?? '',
        guaranteed_at_2025: meta?.guaranteed_at_2025 ?? String(hist ? hist.guaranteed_at_2025 : ''),
        guaranteed_at_2026: meta?.guaranteed_at_2026 ?? '',
        permit_delta_2025_to_2026: meta?.permit_delta_2025_to_2026 ?? '',
        gap: meta?.gap ?? '',
        delta_gap: meta?.delta_gap ?? '',
        status: meta?.status ?? '',
        trend: meta?.trend ?? '',
        draw_outlook: meta?.draw_outlook ?? ''
      };

      row.hunt_code = g.hunt_code;
      row.residency = g.residency;
      row.points = String(pts);

      row.projected_applicants_2026_source = 'projected_2026';
      row.applicants_above = String(applicantsAbove);
      row.applicants_at_level = String(applicantsAt);
      row.random_draw_odds_2026 = (() => {
        const v = g.random_prob_by_points.get(pts);
        const n = toNum(v);
        return n == null ? '' : n.toFixed(3);
      })();

      // Ensure full header coverage: if header contains keys that aren't in row, keep blanks.
      const out = {};
      header.forEach((col) => {
        out[col] = row[col] ?? '';
      });

      byKey.set(`${gk}__${pts}`, out);
      replaced.rows += 1;
    });
  }

  // Preserve the original file ordering first, then append any new rows (rare) deterministically.
  const outRows = [];
  const seen = new Set();
  baseOrder.forEach((k) => {
    const r = byKey.get(k);
    if (!r) return;
    outRows.push(r);
    seen.add(k);
  });

  const extras = [];
  for (const [k, r] of byKey.entries()) {
    if (!seen.has(k)) extras.push([k, r]);
  }
  extras.sort((a, b) => {
    const ak = a[0].split('__').slice(0, 2).join('__');
    const bk = b[0].split('__').slice(0, 2).join('__');
    if (ak !== bk) return ak.localeCompare(bk);
    const ap = toNum(a[1]?.points) ?? 0;
    const bp = toNum(b[1]?.points) ?? 0;
    return ap - bp;
  });
  extras.forEach(([, r]) => outRows.push(r));

  return { header, rows: outRows, replaced };
}

function overlayLadder(existingLadder, historyByGroup, projGroups) {
  const header = existingLadder.header;
  const baseRows = existingLadder.rows;

  const byKey = new Map();
  const baseOrder = [];
  baseRows.forEach((r) => {
    const k = `${normKey(r.hunt_code, r.residency)}__${String(r.points ?? '').trim()}`;
    byKey.set(k, r);
    baseOrder.push(k);
  });

  let replaced = 0;

  for (const [gk, g] of projGroups.entries()) {
    const hist = historyByGroup.get(gk);
    const cutoff = g.bonus_cutoff_point;
    const g2026 = cutoff == null ? 0 : (cutoff + 1);

    const ptsList = Array.from(g.applicants_by_points.keys()).sort((a, b) => a - b);
    ptsList.forEach((pts) => {
      const odds25 = hist ? (hist.odds_2025_by_points.get(pts) || 'N/A') : 'N/A';
      const odds26 = g.total_prob_by_points.get(pts);

      const base = byKey.get(`${gk}__${pts}`);
      const row = base ? { ...base } : {
        hunt_code: g.hunt_code,
        residency: g.residency,
        points: String(pts),
        guaranteed_marker: pts === g2026 ? 'TRUE' : 'FALSE',
        user_point_marker: 'FALSE'
      };

      row.hunt_code = g.hunt_code;
      row.residency = g.residency;
      row.points = String(pts);
      row.odds_2025_actual = String(odds25 || 'N/A');
      row.odds_2026_projected = odds26 == null ? '' : fmt3(odds26);

      const out = {};
      header.forEach((col) => {
        out[col] = row[col] ?? '';
      });

      byKey.set(`${gk}__${pts}`, out);
      replaced += 1;
    });
  }

  const outRows = [];
  const seen = new Set();
  baseOrder.forEach((k) => {
    const r = byKey.get(k);
    if (!r) return;
    outRows.push(r);
    seen.add(k);
  });

  const extras = [];
  for (const [k, r] of byKey.entries()) {
    if (!seen.has(k)) extras.push([k, r]);
  }
  extras.sort((a, b) => {
    const ak = a[0].split('__').slice(0, 2).join('__');
    const bk = b[0].split('__').slice(0, 2).join('__');
    if (ak !== bk) return ak.localeCompare(bk);
    const ap = toNum(a[1]?.points) ?? 0;
    const bp = toNum(b[1]?.points) ?? 0;
    return ap - bp;
  });
  extras.forEach(([, r]) => outRows.push(r));

  return { header, rows: outRows, replaced };
}

function main() {
  [INPUT_ENGINE, INPUT_LADDER, INPUT_HISTORY, INPUT_PROJECTION].forEach((p) => {
    if (!fs.existsSync(p)) {
      console.error(`Missing: ${p}`);
      process.exit(2);
    }
  });

  const engine = readCsv(INPUT_ENGINE);
  const ladder = readCsv(INPUT_LADDER);
  const history = readCsv(INPUT_HISTORY);
  const projection = readCsv(INPUT_PROJECTION);

  const historyByGroup = buildHistoryLookup(history.rows);
  const projGroups = buildProjectionGroups(projection.rows);

  const engineOut = overlayEngine(engine, historyByGroup, projGroups);
  const ladderOut = overlayLadder(ladder, historyByGroup, projGroups);

  writeCsv(OUT_ENGINE, engineOut.header, engineOut.rows);
  writeCsv(OUT_LADDER, ladderOut.header, ladderOut.rows);

  console.log('Rebuild complete.');
  console.log(`Projection groups: ${projGroups.size}`);
  console.log(`Engine rows replaced: ${engineOut.replaced.rows} (groups: ${engineOut.replaced.groups})`);
  console.log(`Ladder rows replaced: ${ladderOut.replaced}`);
  console.log(`Saved: ${OUT_ENGINE}`);
  console.log(`Saved: ${OUT_LADDER}`);
}

main();
