/**
 * Sync "latest" upstream PDFs from the Utah DWR website into a local cache,
 * then (optionally) run our extractors to produce CSV/JSON artifacts the site uses.
 *
 * Design goals:
 * - Treat the WEBSITE as the authoritative source of truth for "latest"
 * - Keep large PDFs OUT of git (we store them under `_exports/upstream/`)
 * - Check in only the extracted, small CSV/JSON artifacts under `processed_data/`
 *
 * Usage:
 *   node sync-upstream.js
 *
 * Optional:
 *   node sync-upstream.js --extract
 *
 * Outputs:
 *   _exports/upstream/*.pdf
 *   processed_data/harvest-metrics-*.csv (when --extract)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const OUT_DIR = path.join(__dirname, '_exports', 'upstream');

// Keep URLs centralized; update here when DWR posts a new packet/report.
const SOURCES = [
  {
    id: 'rac-packet-2026-04',
    url: 'https://wildlife.utah.gov/public_meetings/rac/2026-04-rac-packet.pdf',
    filename: '2026-04-rac-packet.pdf'
  },
  {
    id: 'harvest-2025-prelim',
    // NOTE: DWR moved this PDF off the RAC packet folder; use the canonical "Harvest & survey data" location.
    // Source page: https://wildlife.utah.gov/index.php?catid=14&id=110&option=com_content&view=article
    url: 'https://wildlife.utah.gov/pdf/bg/2025/2026-03-06-2025-preliminary-bg-harvest.pdf',
    filename: '2026-03-06-2025-preliminary-bg-harvest.pdf'
  }
];

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function syncOne(src) {
  const target = path.join(OUT_DIR, src.filename);
  const buf = await download(src.url);
  const incomingHash = sha256(buf);

  let existingHash = null;
  if (fs.existsSync(target)) {
    existingHash = sha256(fs.readFileSync(target));
  }

  const changed = existingHash !== incomingHash;
  if (changed) fs.writeFileSync(target, buf);

  return {
    id: src.id,
    filename: src.filename,
    url: src.url,
    bytes: buf.length,
    sha256: incomingHash,
    changed
  };
}

function runExtractor(pdfPath, id) {
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, 'extract-harvest-metrics.js'), pdfPath, '--id', id],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) throw new Error(`extract-harvest-metrics failed for ${id}`);
}

async function main() {
  const doExtract = process.argv.includes('--extract');
  ensureDir(OUT_DIR);

  const results = [];
  for (const src of SOURCES) {
    process.stdout.write(`[sync] ${src.id} ... `);
    const r = await syncOne(src);
    results.push(r);
    process.stdout.write(r.changed ? 'updated\n' : 'ok\n');
  }

  fs.writeFileSync(path.join(OUT_DIR, 'sync-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

  if (doExtract) {
    // Harvest extract from the synced upstream PDF.
    const harvest = results.find((r) => r.id === 'harvest-2025-prelim');
    if (harvest) {
      runExtractor(path.join(OUT_DIR, harvest.filename), '2025-prelim');
    }
  }

  console.log(`Saved: ${path.join(OUT_DIR, 'sync-report.json')}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
