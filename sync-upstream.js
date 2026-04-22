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

// "Gather raw data first" mode:
// - Treat upstream pages as authoritative and discover the PDFs dynamically.
// - Keep large PDFs OUT of git (we store them under `_exports/upstream/`)
// - Check in only extracted, small CSV/JSON artifacts under `processed_data/` (optional)

// Static sources: add rare/special PDFs here (RAC packets, one-off docs, etc.)
const STATIC_SOURCES = [
  {
    id: 'rac-packet-2026-04',
    url: 'https://wildlife.utah.gov/public_meetings/rac/2026-04-rac-packet.pdf',
    filename: '2026-04-rac-packet.pdf',
    group: 'rac'
  }
];

// Dynamic sources: scrape these pages for PDF links so we always follow "latest".
const SCRAPE_PAGES = [
  {
    id: 'big-game-harvest-data',
    // Page is updated regularly; PDFs linked here should be treated as authoritative.
    url: 'https://wildlife.utah.gov/hunting/main-hunting-page/big-game/big-game-harvest-data.html?tmpl=component',
    group: 'harvest',
    include: (absUrl, opts) => {
      if (!absUrl.includes('/pdf/') || !absUrl.toLowerCase().endsWith('.pdf')) return false;
      if (opts.includeAll) return true;

      // Default: keep this focused on hunt-relevant big game harvest PDFs
      // (avoid downloading the full bighorn survey archive unless requested).
      const f = safeBasenameFromUrl(absUrl);
      const name = (f || '').toLowerCase();
      return (
        name.includes('harvest') ||
        name.includes('bg') ||
        name.includes('deer') ||
        name.includes('elk') ||
        name.includes('oial') ||
        name.includes('antlerless') ||
        name.includes('buck') ||
        name.includes('preliminary')
      );
    }
  },
  {
    id: 'annual-reports',
    url: 'https://wildlife.utah.gov/index.php/annual-reports/',
    group: 'annual',
    include: (absUrl) => absUrl.includes('/pdf/') && absUrl.toLowerCase().endsWith('.pdf')
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

function safeBasenameFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const base = path.basename(u.pathname || '');
    return base || null;
  } catch {
    return null;
  }
}

function idFromFilename(filename) {
  return String(filename || '')
    .replace(/\.pdf$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function subdirFromPdfUrl(absUrl) {
  // Keep upstream files separated by their site path to avoid collisions.
  // Example: https://wildlife.utah.gov/pdf/bg/2025/foo.pdf -> bg/2025
  try {
    const u = new URL(absUrl);
    const parts = String(u.pathname || '').split('/').filter(Boolean); // no leading/trailing empties
    const pdfIndex = parts.findIndex((p) => p.toLowerCase() === 'pdf');
    if (pdfIndex === -1) return '';
    const withoutFilename = parts.slice(pdfIndex + 1, -1); // after "pdf", before filename
    return withoutFilename.join('/');
  } catch {
    return '';
  }
}

function parseYearFilters(argv) {
  const yearsArg = argv.find((a) => a.startsWith('--years='));
  if (yearsArg) {
    const years = yearsArg
      .slice('--years='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { years: new Set(years) };
  }
  const sinceArg = argv.find((a) => a.startsWith('--since='));
  if (sinceArg) {
    const since = parseInt(sinceArg.slice('--since='.length), 10);
    if (!Number.isFinite(since)) return { since: null };
    return { since };
  }
  return { years: null, since: null };
}

function passesYearFilter(src, yearFilter) {
  if (!yearFilter || (!yearFilter.years && !yearFilter.since)) return true;
  const probe = `${src.subdir || ''}/${src.filename || ''}`;
  const yearMatch = probe.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (!year) return false;
  if (yearFilter.years) return yearFilter.years.has(String(year));
  if (yearFilter.since) return year >= yearFilter.since;
  return true;
}

async function scrapePdfLinks(page) {
  const html = (await download(page.url)).toString('utf8');

  // Very simple scraper: extract href="...pdf" and resolve to absolute URLs.
  const links = [];
  const re = /href\s*=\s*"([^"]+?\.pdf)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    try {
      const abs = new URL(href, page.url).toString();
      if (!page.include(abs, scrapePdfLinks.opts)) continue;
      links.push(abs);
    } catch {
      // ignore bad URLs
    }
  }

  // Deduplicate while preserving order
  return Array.from(new Set(links));
}

async function syncOne(src) {
  const groupDir = path.join(OUT_DIR, src.group || 'misc', src.subdir || '');
  ensureDir(groupDir);
  const target = path.join(groupDir, src.filename);
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
  const argv = process.argv.slice(2);
  const wantHarvest = process.argv.includes('--harvest') || (!process.argv.includes('--annual') && !process.argv.includes('--rac'));
  const wantAnnual = process.argv.includes('--annual') || (!process.argv.includes('--harvest') && !process.argv.includes('--rac'));
  const wantRac = process.argv.includes('--rac') || (!process.argv.includes('--harvest') && !process.argv.includes('--annual'));
  const doExtract = process.argv.includes('--extract');
  const includeAll = process.argv.includes('--include-all');
  const yearFilter = parseYearFilters(argv);
  ensureDir(OUT_DIR);

  scrapePdfLinks.opts = { includeAll };

  const discovered = [];
  for (const page of SCRAPE_PAGES) {
    if (page.group === 'harvest' && !wantHarvest) continue;
    if (page.group === 'annual' && !wantAnnual) continue;

    process.stdout.write(`[discover] ${page.id} ... `);
    const pdfUrls = await scrapePdfLinks(page);
    process.stdout.write(`${pdfUrls.length} pdf(s)\n`);
    for (const absUrl of pdfUrls) {
      const filename = safeBasenameFromUrl(absUrl);
      if (!filename) continue;
      const subdir = subdirFromPdfUrl(absUrl);
      discovered.push({
        id: `${page.group}-${idFromFilename(subdir)}-${idFromFilename(filename)}`.replace(/-+/g, '-'),
        url: absUrl,
        filename,
        group: page.group,
        subdir,
        discoveredFrom: page.url
      });
    }
  }

  const sources = [
    ...(wantRac ? STATIC_SOURCES : []),
    ...discovered
  ].filter((s) => passesYearFilter(s, yearFilter));

  const results = [];
  for (const src of sources) {
    process.stdout.write(`[sync] ${src.id} ... `);
    const r = await syncOne(src);
    results.push(r);
    process.stdout.write(r.changed ? 'updated\n' : 'ok\n');
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'sync-report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        options: { harvest: wantHarvest, annual: wantAnnual, rac: wantRac, extract: doExtract },
        pages: SCRAPE_PAGES.map((p) => ({ id: p.id, url: p.url, group: p.group })),
        results
      },
      null,
      2
    )
  );

  if (doExtract) {
    // Conservative: only run harvest extractor on harvest-group PDFs.
    // (Other annual-report PDFs can be long-form narrative and may not parse cleanly.)
    const harvestResults = results.filter((r) => (r.group || '').toLowerCase() === 'harvest');
    for (const hr of harvestResults) {
      const pdfPath = path.join(OUT_DIR, hr.group || 'harvest', hr.filename);
      // Stable output id: use the year/type embedded in filename when present, otherwise fallback to hash prefix.
      const outId = hr.filename.toLowerCase().includes('2025') ? '2025' : hr.filename.toLowerCase().includes('2024') ? '2024' : (hr.sha256 || '').slice(0, 10) || hr.id;
      try {
        runExtractor(pdfPath, `${outId}-${idFromFilename(hr.filename)}`.slice(0, 60));
      } catch (e) {
        // Don't fail the whole sync run if one PDF doesn't match the table format.
        console.warn(`[extract] skip ${hr.filename}: ${e && e.message ? e.message : e}`);
      }
    }
  }

  console.log(`Saved: ${path.join(OUT_DIR, 'sync-report.json')}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
