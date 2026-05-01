/* eslint-disable no-console */
/**
 * Build a coverage matrix so we can see, by hunt code, which metrics exist:
 * - canonical hunt master present
 * - research model row present
 * - draw engine row present
 * - point ladder rows present
 * - harvest history row present
 *
 * Outputs:
 * - processed_data/coverage-matrix.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_PATH = path.join(ROOT, 'processed_data', 'coverage-matrix.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readCsvFirstColumnSet(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const out = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(',');
    if (idx === -1) continue;
    const v = line.slice(0, idx).trim();
    if (v) out.add(v);
  }
  return out;
}

function readCsvColumnSet(p, colName) {
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  const idx = header.indexOf(colName);
  if (idx === -1) return new Set();
  const out = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    const v = (parts[idx] || '').trim();
    if (v) out.add(v);
  }
  return out;
}

function normalize(str) {
  return String(str || '').trim();
}

function classifyBucket(huntType, huntCategory) {
  const t = normalize(huntType).toLowerCase();
  const c = normalize(huntCategory).toLowerCase();

  if (t.includes('once-in-a-lifetime')) return 'O.I.L.';
  if (t.includes('premium limited entry')) return 'P.L.E.';
  if (t === 'limited entry') return 'L.E.';
  if (t === 'general') return 'General';
  if (t === 'cwmu' || t.includes('private lands')) return 'Private Lands';

  // Some special hunt types we still want tracked.
  if (t.includes('antlerless')) return 'Antlerless';
  if (t.includes('conservation')) return 'Conservation';
  if (t.includes('tribal')) return 'Tribal';
  if (t.includes('youth')) return 'Youth';
  if (t.includes('management')) return 'Management';

  // Fallback: try to infer from category text.
  if (c.includes('premium')) return 'P.L.E.';
  if (c.includes('limited entry')) return 'L.E.';

  return huntType ? huntType : 'Unknown';
}

function bucketPriorityRank(bucket) {
  // User priority: OIL, PLE, LE, General season, OTC, private lands, all species.
  // OTC is not always explicit in the canonical list; most OTC lives under General.
  const order = [
    'O.I.L.',
    'P.L.E.',
    'L.E.',
    'General',
    'OTC',
    'Private Lands',
    'Management',
    'Conservation',
    'Antlerless',
    'Tribal',
    'Youth',
    'Unknown'
  ];
  const i = order.indexOf(bucket);
  return i === -1 ? order.length : i;
}

function build() {
  const canonicalPath = path.join(ROOT, 'processed_data', 'hunt-master-canonical.json');
  const researchPath = path.join(ROOT, 'processed_data', 'hunt_research_2026.json');
  const enginePath = path.join(ROOT, 'processed_data', 'draw_reality_engine.csv');
  const ladderPath = path.join(ROOT, 'processed_data', 'point_ladder_view.csv');
  const historyPath = path.join(ROOT, 'hunt_history_2025_2026_dwr_aligned.csv');

  const canonical = readJson(canonicalPath);
  const research = readJson(researchPath);

  const researchCodes = new Set(research.map((row) => row.hunt_code).filter(Boolean));
  const engineCodes = readCsvFirstColumnSet(enginePath);
  const ladderCodes = readCsvFirstColumnSet(ladderPath);
  const historyCodes = readCsvColumnSet(historyPath, 'hunt_number');

  const rows = canonical.map((h) => {
    const huntCode = normalize(h.huntCode);
    const huntType = normalize(h.huntType);
    const huntCategory = normalize(h.huntCategory);
    const bucket = classifyBucket(huntType, huntCategory);

    return {
      huntCode,
      year: h.year ?? null,
      species: normalize(h.species),
      title: normalize(h.title),
      unitName: normalize(h.unitName),
      unitCode: normalize(h.unitCode),
      huntType,
      huntCategory,
      bucket,
      bucketRank: bucketPriorityRank(bucket),
      geometryStatus: normalize(h.geometryStatus),
      boundaryLink: normalize(h.boundaryLink),

      hasCanonical: true,
      hasResearchRow: researchCodes.has(huntCode),
      hasEngineRow: engineCodes.has(huntCode),
      hasLadderRow: ladderCodes.has(huntCode),
      hasHarvestHistoryRow: historyCodes.has(huntCode),

      // Age metrics are the next milestone; leave explicit false so we can track progress.
      hasAgeMetrics: false
    };
  });

  const byBucket = {};
  rows.forEach((r) => {
    const key = r.bucket || 'Unknown';
    if (!byBucket[key]) {
      byBucket[key] = {
        bucket: key,
        bucketRank: r.bucketRank,
        total: 0,
        research: 0,
        engine: 0,
        ladder: 0,
        harvest: 0
      };
    }
    byBucket[key].total += 1;
    if (r.hasResearchRow) byBucket[key].research += 1;
    if (r.hasEngineRow) byBucket[key].engine += 1;
    if (r.hasLadderRow) byBucket[key].ladder += 1;
    if (r.hasHarvestHistoryRow) byBucket[key].harvest += 1;
  });

  const buckets = Object.values(byBucket).sort((a, b) => a.bucketRank - b.bucketRank || a.bucket.localeCompare(b.bucket));

  const totals = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.hasResearchRow) acc.research += 1;
      if (r.hasEngineRow) acc.engine += 1;
      if (r.hasLadderRow) acc.ladder += 1;
      if (r.hasHarvestHistoryRow) acc.harvest += 1;
      return acc;
    },
    { total: 0, research: 0, engine: 0, ladder: 0, harvest: 0 }
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      canonical: 'processed_data/hunt-master-canonical.json',
      research: 'processed_data/hunt_research_2026.json',
      engine: 'processed_data/draw_reality_engine.csv',
      ladder: 'processed_data/point_ladder_view.csv',
      history: 'hunt_history_2025_2026_dwr_aligned.csv'
    },
    totals,
    buckets,
    rows
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_PATH} (${rows.length} rows).`);
}

build();

