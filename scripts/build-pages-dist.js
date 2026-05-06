const fs = require('fs/promises');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'pages-dist');

const rootFiles = [
  'index.html',
  'research.html',
  'hunt-research.html',
  'verify.html',
  'hard-copy.html',
  'hard-data.html',
  'coverage.html',
  'builder.html',
  'staging-audit.html',
  'vetting.html',
  'app.js',
  'config.js',
  'data.js',
  'embed-mode.js',
  'event-handlers.js',
  'google-basemap.js',
  'header-layout.js',
  'hunt-research.js',
  'map-engine.js',
  'ownership-dock.js',
  'sentry-browser-init.js',
  'style.css',
  'ui.js',
  'uoga-analytics.js',
  'coverage.js',
  'manifest.json',
  'favicon.ico',
  'CNAME',
  '.nojekyll',
];

const dataFiles = [
  'data/hunt-boundaries-lite.geojson',
  'data/hunt_boundaries.geojson',
  'data/hunt-master-canonical.json',
  'data/utah-hunt-planner-master-all.json',
  'data/elk_hunt_table_official.json',
  'data/elk_antlerless_hunt_table_official.json',
  'data/pronghorn_hunt_table_official.json',
  'data/moose_hunt_table_official.json',
  'data/mountain_goat_hunt_table_official.json',
  'data/bison_hunt_table_official.json',
  'data/bighorn_sheep_hunt_table_official.json',
  'data/black_bear_hunt_table_official.json',
  'data/cougar_hunt_table_official.json',
  'data/turkey_hunt_table_official.json',
  'data/conservation-permit-areas.json',
  'data/conservation-permit-hunt-table-2025-27.json',
  'data/outfitters-public.json',
  'data/outfitters.json',
  'data/cwmu-boundaries.geojson',
  'data/dwr-GetCWMUBoundaries.json',
];

const processedFiles = [
  'processed_data/hunt_research_2026.json',
  'processed_data/draw_reality_engine.csv',
  'processed_data/point_ladder_view.csv',
  'processed_data/hunt_master_enriched.csv',
  'processed_data/hunt_unit_reference_linked.csv',
  'processed_data/outfitter-federal-unit-coverage-review.json',
  'processed_data/coverage-matrix.json',
  'processed_data/normalized-staging-audit.csv',
  'processed_data/normalized-staging-audit.json',
];

const dirsToCopy = [
  'assets',
  'processed_data/hard_data_exports',
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureParent(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function copyFileIfExists(relPath, missing) {
  const src = path.join(repoRoot, relPath);
  const dest = path.join(outDir, relPath);
  if (!(await exists(src))) {
    missing.push(relPath);
    return;
  }
  await ensureParent(dest);
  await fs.copyFile(src, dest);
}

async function copyDirIfExists(relPath, missing) {
  const src = path.join(repoRoot, relPath);
  const dest = path.join(outDir, relPath);
  if (!(await exists(src))) {
    missing.push(relPath);
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

async function writeConfigLocalStub() {
  const target = path.join(outDir, 'config.local.js');
  const body = [
    'window.UOGA_CONFIG_LOCAL = window.UOGA_CONFIG_LOCAL || {};',
    '',
  ].join('\n');
  await fs.writeFile(target, body, 'utf8');
}

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const missing = [];

  for (const relPath of rootFiles) {
    await copyFileIfExists(relPath, missing);
  }
  for (const relPath of dataFiles) {
    await copyFileIfExists(relPath, missing);
  }
  for (const relPath of processedFiles) {
    await copyFileIfExists(relPath, missing);
  }
  for (const relPath of dirsToCopy) {
    await copyDirIfExists(relPath, missing);
  }

  await writeConfigLocalStub();

  console.log(`pages-dist build complete: ${outDir}`);
  if (missing.length) {
    console.log('Missing optional paths:');
    for (const item of missing) {
      console.log(`- ${item}`);
    }
  }
}

main().catch((error) => {
  console.error('Failed to build pages-dist.');
  console.error(error);
  process.exit(1);
});

