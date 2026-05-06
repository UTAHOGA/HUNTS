#!/usr/bin/env node
/**
 * Ingest a hunt-related PDF into clean, reviewable hunt-engine artifacts.
 *
 * Usage:
 *   node scripts/ingest-pdf-to-hunt-engine.js path/to/file.pdf --id 2026-harvest --type harvest
 *
 * Outputs:
 *   processed_data/pdf_ingest/<id>/source-metadata.json
 *   processed_data/pdf_ingest/<id>/pages.json
 *   processed_data/pdf_ingest/<id>/sections.json
 *   processed_data/pdf_ingest/<id>/extracted-rows.raw.json
 *   processed_data/pdf_ingest/<id>/extracted-rows.cleaned.json
 *   processed_data/pdf_ingest/<id>/extracted-rows.cleaned.csv
 *   processed_data/pdf_ingest/<id>/rejects.json
 *   processed_data/pdf_ingest/<id>/validation-report.json
 *   processed_data/pdf_ingest/<id>/sectioned-report.pdf
 *   processed_data/pdf_ingest/<id>/manifest.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_ROOT = path.join(ROOT, 'processed_data', 'pdf_ingest');
const DEFAULT_CANONICAL = path.join(ROOT, 'processed_data', 'hunt-master-canonical-2026-source-of-truth.json');

const SECTION_TERMS = [
  { key: 'bison', label: 'Bison', re: /\bbison\b/i },
  { key: 'moose', label: 'Moose', re: /\bmoose\b/i },
  { key: 'mountain_goat', label: 'Mountain Goat', re: /\bmountain\s+goat\b/i },
  { key: 'bighorn_sheep', label: 'Bighorn Sheep', re: /\b(bighorn|desert\s+bighorn|rocky\s+mountain\s+bighorn|sheep)\b/i },
  { key: 'pronghorn', label: 'Pronghorn', re: /\bpronghorn\b/i },
  { key: 'elk', label: 'Elk', re: /\b(bull\s+elk|cow\s+elk|elk)\b/i },
  { key: 'deer', label: 'Deer', re: /\b(mule\s+deer|buck\s+deer|deer)\b/i },
  { key: 'black_bear', label: 'Black Bear', re: /\bblack\s+bear\b/i },
  { key: 'cougar', label: 'Cougar', re: /\bcougar\b/i },
  { key: 'turkey', label: 'Turkey', re: /\bturkey\b/i },
  { key: 'draw_odds', label: 'Draw Odds', re: /\b(draw\s+odds|drawing\s+odds|bonus\s+points|preference\s+points)\b/i },
  { key: 'harvest', label: 'Harvest Metrics', re: /\b(harvest|hunters\s+afield|percent\s+success|success\s+%)\b/i },
  { key: 'permits', label: 'Permit Counts', re: /\b(permits|quota|available\s+permits)\b/i }
];

const METRIC_FIELDS = [
  'permits',
  'hunters',
  'harvest',
  'percent_success',
  'avg_days',
  'avg_satisfaction',
  'points',
  'applicants',
  'bonus_permits',
  'regular_permits',
  'total_permits',
  'success_ratio'
];

function printUsage() {
  console.error([
    'Usage:',
    '  node scripts/ingest-pdf-to-hunt-engine.js <file.pdf|directory> [--id output-id] [--type auto|harvest|draw-odds] [--out-dir processed_data/pdf_ingest] [--canonical path]',
    '',
    'Examples:',
    '  node scripts/ingest-pdf-to-hunt-engine.js _pdf_inbox/2026-harvest.pdf --id 2026-harvest --type harvest',
    '  npm run ingest:pdf -- _pdf_inbox/2026-harvest.pdf --id 2026-harvest',
    '  npm run ingest:pdf -- "C:/Users/tyler/Desktop/GitHub/HUNTS/pipeline/RAW/hunt_unit_database/2025/pdf/harvest_report" --id harvest-report-2025 --type harvest',
    '  npm run ingest:pdf -- "C:/Users/tyler/Desktop/GitHub/HUNTS/pipeline/RAW/hunt_unit_database/2025/pdf/draw_odds/big file" --id draw-odds-2025 --type draw-odds'
  ].join('\n'));
}

function parseArgs(argv) {
  const args = [...argv];
  const opts = {
    type: 'auto',
    outRoot: DEFAULT_OUT_ROOT,
    canonical: DEFAULT_CANONICAL,
    maxRejects: 250
  };
  const positional = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--id') {
      opts.id = args[++i];
    } else if (arg === '--type') {
      opts.type = String(args[++i] || 'auto').toLowerCase();
    } else if (arg === '--out-dir') {
      opts.outRoot = path.resolve(args[++i] || DEFAULT_OUT_ROOT);
    } else if (arg === '--canonical') {
      opts.canonical = path.resolve(args[++i] || DEFAULT_CANONICAL);
    } else if (arg === '--max-rejects') {
      opts.maxRejects = Number(args[++i] || opts.maxRejects);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  opts.inputPath = positional.join(' ').trim().replace(/^"|"$/g, '');
  return opts;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(value, fallback = 'pdf-ingest') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function collapseWs(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value).replace(/,/g, '').replace(/%$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsvWithHeaders(filePath, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(Array.isArray(row[h]) ? row[h].join('|') : row[h])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\r\n')}\r\n`);
}

function writeCsv(filePath, rows) {
  writeCsvWithHeaders(filePath, [
    'source_id',
    'source_page',
    'section_key',
    'section_label',
    'hunt_code',
    'canonical_match',
    'canonical_species',
    'canonical_hunt_name',
    'hunt_name_raw',
    'residency',
    'points',
    'applicants',
    'bonus_permits',
    'regular_permits',
    'total_permits',
    'success_ratio',
    'draw_odds_pct',
    'permits',
    'hunters',
    'harvest',
    'percent_success',
    'avg_days',
    'avg_satisfaction',
    'confidence',
    'warnings'
  ], rows);
}

async function readPdfPages(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const pageTexts = [];
  await pdfParse(buf, {
    pagerender: (pageData) => pageData.getTextContent().then((tc) => {
      const lines = [];
      let lastY = null;
      let line = [];
      for (const item of tc.items) {
        const y = item.transform && Number.isFinite(item.transform[5]) ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.length) {
          lines.push(line.join(' '));
          line = [];
        }
        line.push(item.str);
        if (y !== null) lastY = y;
      }
      if (line.length) lines.push(line.join(' '));
      const text = lines.map(collapseWs).filter(Boolean).join('\n');
      pageTexts.push(text);
      return text;
    })
  });
  return { buf, pages: pageTexts };
}

function detectSections(pages) {
  const sections = [];
  for (const [idx, text] of pages.entries()) {
    const hits = [];
    const firstLines = text.split(/\r?\n/).slice(0, 14).join(' ');
    const searchText = `${firstLines}\n${text}`;
    for (const term of SECTION_TERMS) {
      if (term.re.test(searchText)) hits.push({ key: term.key, label: term.label });
    }
    const primary = hits[0] || { key: 'unclassified', label: 'Unclassified' };
    sections.push({
      page: idx + 1,
      key: primary.key,
      label: primary.label,
      matches: hits,
      heading: inferHeading(text, primary.label)
    });
  }
  return sections;
}

function inferHeading(text, fallback) {
  const lines = text.split(/\r?\n/).map(collapseWs).filter(Boolean);
  const candidate = lines.find((line) => {
    if (line.length < 4 || line.length > 120) return false;
    if (/^[\d\s.,%]+$/.test(line)) return false;
    return /[A-Za-z]/.test(line);
  });
  return candidate || fallback;
}

function loadCanonical(canonicalPath) {
  if (!fs.existsSync(canonicalPath)) {
    return { rows: [], byCode: new Map(), path: canonicalPath, warning: 'canonical file not found' };
  }
  const parsed = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : (parsed.hunts || parsed.rows || parsed.data || []);
  const byCode = new Map();
  for (const row of rows) {
    const code = String(row.hunt_code || row.huntCode || row.code || '').trim().toUpperCase();
    if (code && !byCode.has(code)) byCode.set(code, row);
  }
  return { rows, byCode, path: canonicalPath };
}

function extractCandidateChunks(pageText) {
  const flat = collapseWs(pageText);
  const matches = [...flat.matchAll(/\b[A-Z]{2}\d{4}\b/g)];
  const chunks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : flat.length;
    if (start == null || end == null) continue;
    chunks.push(flat.slice(start, end).trim());
  }
  return chunks;
}

function cleanPdfWordBreaks(value) {
  return collapseWs(String(value || '')
    .replace(/\bA pp licants\b/gi, 'Applicants')
    .replace(/\bHenr y\b/gi, 'Henry')
    .replace(/\bArcher y\b/gi, 'Archery')
    .replace(/\bPaunsau g unt\b/gi, 'Paunsaugunt')
    .replace(/\bB onus\b/gi, 'Bonus'));
}

function extractDrawOddsContext(pageText) {
  const lines = pageText.split(/\r?\n/).map(collapseWs).filter(Boolean);
  const yearMatch = lines.join(' ').match(/\b(20\d{2})\b/);
  const huntLineIndex = lines.findIndex((line) => /^Hunt:/i.test(line));
  let huntCode = '';
  let huntNameRaw = '';
  if (huntLineIndex >= 0) {
    const headingParts = [];
    for (let i = huntLineIndex; i < lines.length && i < huntLineIndex + 14; i += 1) {
      if (/^Page\s+\d+/i.test(lines[i])) break;
      headingParts.push(lines[i]);
    }
    const heading = cleanPdfWordBreaks(headingParts.join(' ').replace(/^Hunt:\s*/i, ''));
    const m = heading.match(/^([A-Z]{2}\d{4})\s*(.*)$/);
    if (m) {
      huntCode = m[1];
      huntNameRaw = cleanPdfWordBreaks(m[2]);
    }
  }
  const reportPageMatch = lines.join(' ').match(/\bPage\s+(\d+)\b/i);
  return {
    year: yearMatch ? Number(yearMatch[1]) : null,
    huntCode,
    huntNameRaw,
    reportPage: reportPageMatch ? Number(reportPageMatch[1]) : null,
    lines
  };
}

function normalizeRatio(parts) {
  const text = cleanPdfWordBreaks(parts.join(' ')).replace(/N\s*\/\s*A/i, 'N/A').replace(/\s+/g, ' ').trim();
  if (/^N\/A$/i.test(text)) return { text: 'N/A', pct: null };
  const match = text.match(/^1\s+in\s+(\d+(?:\.\d+)?)$/i);
  if (!match) return { text, pct: null };
  const denom = Number(match[1]);
  return { text: `1 in ${match[1]}`, pct: denom > 0 ? Number((100 / denom).toFixed(3)) : null };
}

function consumeDrawRatio(tokens, index) {
  const first = tokens[index];
  if (!first) return { ratio: { text: '', pct: null }, next: index };
  if (/^N\/A$/i.test(first)) return { ratio: { text: 'N/A', pct: null }, next: index + 1 };
  if (/^N\/$/i.test(first) && /^A$/i.test(tokens[index + 1] || '')) return { ratio: { text: 'N/A', pct: null }, next: index + 2 };
  if (/^1\s+in\s+\d+(?:\.\d+)?$/i.test(first)) return { ratio: normalizeRatio([first]), next: index + 1 };
  if (/^1\s+in$/i.test(first) && /^\d+(?:\.\d+)?$/.test(tokens[index + 1] || '')) return { ratio: normalizeRatio([first, tokens[index + 1]]), next: index + 2 };
  if (/^1$/i.test(first) && /^in$/i.test(tokens[index + 1] || '') && /^\d+(?:\.\d+)?$/.test(tokens[index + 2] || '')) return { ratio: normalizeRatio([first, tokens[index + 1], tokens[index + 2]]), next: index + 3 };
  if (/^1$/i.test(first) && /^in\s+\d+(?:\.\d+)?$/i.test(tokens[index + 1] || '')) return { ratio: normalizeRatio([first, tokens[index + 1]]), next: index + 2 };
  return { ratio: normalizeRatio([first]), next: index + 1 };
}

function findDrawDataStart(lines) {
  const ratioIndexes = [];
  lines.forEach((line, index) => {
    if (/^Ratio$/i.test(line)) ratioIndexes.push(index);
  });
  if (ratioIndexes.length >= 2) return ratioIndexes[1] + 1;
  const pointsIndex = lines.findIndex((line) => /^Points$/i.test(line));
  return pointsIndex >= 0 ? pointsIndex + 1 : 0;
}

function parseDrawOddsPage(pageText, page, section) {
  const context = extractDrawOddsContext(pageText);
  if (!context.huntCode) return { rows: [], rejects: [{ ok: false, reason: 'no_hunt_header', page, section, raw: pageText.slice(0, 500) }] };

  const tokens = context.lines.slice(findDrawDataStart(context.lines));
  const rows = [];
  const rejects = [];
  let index = 0;
  let recordIndex = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^Totals$/i.test(token)) break;
    if (!/^\d+$/.test(token || '')) {
      index += 1;
      continue;
    }
    if (!/^\d+$/.test(tokens[index + 1] || '') || !/^\d+$/.test(tokens[index + 2] || '') || !/^\d+$/.test(tokens[index + 3] || '') || !/^\d+$/.test(tokens[index + 4] || '')) {
      rejects.push({ ok: false, reason: 'incomplete_draw_row', code: context.huntCode, page, section, raw: tokens.slice(index, index + 12).join(' ') });
      index += 1;
      continue;
    }
    const ratioResult = consumeDrawRatio(tokens, index + 5);
    const residency = recordIndex % 2 === 0 ? 'Resident' : 'Nonresident';
    rows.push({
      source_page: page,
      report_page: context.reportPage,
      draw_year: context.year,
      section_key: section.key,
      section_label: section.label,
      hunt_code: context.huntCode,
      hunt_name_raw: context.huntNameRaw,
      residency,
      points: toNumber(tokens[index]),
      applicants: toNumber(tokens[index + 1]),
      bonus_permits: toNumber(tokens[index + 2]),
      regular_permits: toNumber(tokens[index + 3]),
      total_permits: toNumber(tokens[index + 4]),
      success_ratio: ratioResult.ratio.text,
      draw_odds_pct: ratioResult.ratio.pct,
      raw_text: tokens.slice(index, ratioResult.next).join(' ')
    });
    recordIndex += 1;
    index = ratioResult.next;
  }
  return { rows, rejects };
}

function parseHarvestChunk(chunk, page, section) {
  const code = (chunk.match(/^([A-Z]{2}\d{4})\b/) || [])[1];
  if (!code) return { ok: false, reason: 'no_hunt_code', page, section, raw: chunk };

  const tail = chunk.match(/(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d+(?:\.\d+)?)%?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);
  if (!tail) {
    return { ok: false, reason: 'no_harvest_metric_tail', code, page, section, raw: chunk };
  }

  const huntNameRaw = collapseWs(chunk.slice(code.length, tail.index).replace(/^(hunt\s+name|unit|weapon|sex|type)\b/i, ''));
  return {
    ok: true,
    row: {
      source_page: page,
      section_key: section.key,
      section_label: section.label,
      hunt_code: code,
      hunt_name_raw: huntNameRaw,
      permits: toNumber(tail[1]),
      hunters: toNumber(tail[2]),
      harvest: toNumber(tail[3]),
      percent_success: toNumber(tail[4]),
      avg_days: toNumber(tail[5]),
      avg_satisfaction: toNumber(tail[6]),
      raw_text: chunk
    }
  };
}

function extractRows(pages, sections, type) {
  const normalizedType = String(type || 'auto').toLowerCase().replace(/_/g, '-');
  const parserType = normalizedType === 'auto' ? 'harvest' : normalizedType;
  const rows = [];
  const rejects = [];
  for (const [idx, text] of pages.entries()) {
    const page = idx + 1;
    const section = sections[idx] || { key: 'unclassified', label: 'Unclassified' };
    if (parserType === 'draw-odds' || parserType === 'draw_odds') {
      const result = parseDrawOddsPage(text, page, section);
      rows.push(...result.rows);
      rejects.push(...result.rejects);
      continue;
    }
    const chunks = extractCandidateChunks(text);
    for (const chunk of chunks) {
      const result = parseHarvestChunk(chunk, page, section);
      if (result.ok) rows.push(result.row);
      else rejects.push(result);
    }
  }
  return { rows, rejects, parserType };
}

function normalizeRows(rows, canonical, sourceId) {
  const deduped = new Map();
  for (const row of rows) {
    const key = [
      row.hunt_code,
      row.source_page,
      row.residency || '',
      row.points ?? '',
      row.permits ?? '',
      row.hunters ?? '',
      row.harvest ?? '',
      row.percent_success ?? '',
      row.applicants ?? '',
      row.bonus_permits ?? '',
      row.regular_permits ?? '',
      row.total_permits ?? '',
      row.success_ratio || ''
    ].join('|');
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return Array.from(deduped.values()).map((row) => {
    const canonicalRow = canonical.byCode.get(row.hunt_code);
    const warnings = [];
    if (!canonicalRow) warnings.push('hunt_code_not_found_in_canonical');
    if (row.percent_success != null && (row.percent_success < 0 || row.percent_success > 100)) warnings.push('percent_success_out_of_range');
    if (row.harvest != null && row.hunters != null && row.harvest > row.hunters * 2) warnings.push('harvest_unusually_high_vs_hunters');
    if (row.avg_satisfaction != null && (row.avg_satisfaction < 0 || row.avg_satisfaction > 5)) warnings.push('avg_satisfaction_out_of_expected_range');
    if (row.draw_odds_pct != null && (row.draw_odds_pct < 0 || row.draw_odds_pct > 100)) warnings.push('draw_odds_pct_out_of_range');

    const metricCount = METRIC_FIELDS.filter((key) => row[key] != null && row[key] !== '').length;
    const confidence = Math.max(0.3, Math.min(0.98, 0.45 + (metricCount * 0.07) + (canonicalRow ? 0.1 : 0) - (warnings.length * 0.08)));

    return {
      source_id: sourceId,
      ...row,
      canonical_match: canonicalRow ? 'yes' : 'no',
      canonical_species: canonicalRow ? String(canonicalRow.species || '') : '',
      canonical_hunt_name: canonicalRow ? String(canonicalRow.hunt_name || canonicalRow.huntName || '') : '',
      confidence: Number(confidence.toFixed(2)),
      warnings
    };
  }).sort((a, b) => a.hunt_code.localeCompare(b.hunt_code) || a.source_page - b.source_page);
}

function buildValidationReport(cleanedRows, rawRows, rejects, canonical) {
  const matched = cleanedRows.filter((r) => r.canonical_match === 'yes');
  const unmatched = cleanedRows.filter((r) => r.canonical_match !== 'yes');
  const warningCounts = {};
  for (const row of cleanedRows) {
    for (const warning of row.warnings || []) warningCounts[warning] = (warningCounts[warning] || 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    canonicalPath: canonical.path,
    canonicalRowsLoaded: canonical.rows.length,
    rawRowsExtracted: rawRows.length,
    cleanedRows: cleanedRows.length,
    canonicalMatches: matched.length,
    canonicalMisses: unmatched.length,
    rejects: rejects.length,
    warningCounts,
    unmatchedHuntCodes: Array.from(new Set(unmatched.map((r) => r.hunt_code))).sort(),
    recommendation: cleanedRows.length && !unmatched.length
      ? 'Review the sectioned PDF and CSV, then merge using a dedicated engine import step.'
      : 'Review rejects and unmatched hunt codes before merging into canonical engine data.'
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeTextBlock(doc, title, lines) {
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text(title);
  doc.moveDown(0.25);
  doc.fontSize(9).font('Helvetica').fillColor('#333');
  for (const line of lines) doc.text(line, { width: 500 });
  doc.moveDown(0.6);
}

function maybeAddPage(doc) {
  if (doc.y > 700) doc.addPage();
}

function writeRowsTable(doc, rows, parserType = 'harvest') {
  const drawMode = String(parserType).replace(/_/g, '-') === 'draw-odds';
  const columns = drawMode
    ? [
      ['Code', 'hunt_code', 50],
      ['Pg', 'source_page', 24],
      ['Res', 'residency', 56],
      ['Pts', 'points', 24],
      ['Apps', 'applicants', 36],
      ['Bonus', 'bonus_permits', 36],
      ['Reg', 'regular_permits', 30],
      ['Total', 'total_permits', 34],
      ['Ratio', 'success_ratio', 58],
      ['Match', 'canonical_match', 38]
    ]
    : [
      ['Code', 'hunt_code', 56],
      ['Pg', 'source_page', 28],
      ['Match', 'canonical_match', 42],
      ['Permits', 'permits', 52],
      ['Hunters', 'hunters', 52],
      ['Harvest', 'harvest', 52],
      ['Success', 'percent_success', 52],
      ['Conf', 'confidence', 38]
    ];
  const x0 = doc.x;
  let y = doc.y;
  doc.fontSize(7.3).font('Helvetica-Bold').fillColor('#111');
  let x = x0;
  columns.forEach(([label, , width]) => {
    doc.text(label, x, y, { width });
    x += width;
  });
  y += 13;
  doc.moveTo(x0, y - 2).lineTo(x0 + columns.reduce((sum, col) => sum + col[2], 0), y - 2).strokeColor('#999').stroke();
  doc.font('Helvetica').fillColor('#222');
  for (const row of rows) {
    if (y > 720) {
      doc.addPage();
      y = doc.y;
      doc.fontSize(7.3).font('Helvetica').fillColor('#222');
    }
    x = x0;
    for (const [, key, width] of columns) {
      let value = row[key];
      if (key === 'percent_success' && value != null && value !== '') value = `${value}%`;
      doc.text(String(value ?? ''), x, y, { width });
      x += width;
    }
    y += 12;
  }
  doc.y = y + 8;
}

function writeSectionedPdf(filePath, context) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `PDF Ingest Report: ${context.sourceId}` } });
    const out = fs.createWriteStream(filePath);
    doc.pipe(out);
    out.on('finish', () => resolve(filePath));
    out.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text(`U.O.G.A. PDF Ingest Report`);
    doc.fontSize(12).font('Helvetica').fillColor('#333').text(context.sourceId);
    doc.moveDown(0.5);

    writeTextBlock(doc, 'Source Summary', [
      `Source: ${context.sourcePath}`,
      `Generated: ${context.generatedAt}`,
      `SHA-256: ${context.sourceSha256}`,
      `Pages detected: ${context.pages.length}`,
      `Parser type: ${context.parserType}`,
      `Rows cleaned: ${context.cleanedRows.length}`,
      `Rejects: ${context.rejects.length}`,
      `Canonical matches: ${context.validation.canonicalMatches}`,
      `Canonical misses: ${context.validation.canonicalMisses}`
    ]);

    writeTextBlock(doc, 'Validation Recommendation', [context.validation.recommendation]);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text('Detected Sections');
    doc.moveDown(0.25);
    doc.fontSize(8.5).font('Helvetica').fillColor('#333');
    for (const section of context.sections) {
      maybeAddPage(doc);
      doc.text(`Page ${section.page}: ${section.label} — ${section.heading}`);
    }

    const rowsBySection = new Map();
    for (const row of context.cleanedRows) {
      const key = `${row.section_key}|${row.section_label}`;
      if (!rowsBySection.has(key)) rowsBySection.set(key, []);
      rowsBySection.get(key).push(row);
    }

    for (const [key, rows] of rowsBySection.entries()) {
      const [, label] = key.split('|');
      doc.addPage();
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#111').text(label || 'Unclassified');
      doc.fontSize(9).font('Helvetica').fillColor('#333').text(`${rows.length} cleaned row(s)`);
      doc.moveDown(0.6);
      writeRowsTable(doc, rows, context.parserType);
    }

    if (context.rejects.length) {
      doc.addPage();
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#111').text('Rejected / Needs Review');
      doc.moveDown(0.4);
      doc.fontSize(8).font('Helvetica').fillColor('#333');
      for (const reject of context.rejects.slice(0, 80)) {
        maybeAddPage(doc);
        doc.font('Helvetica-Bold').text(`Page ${reject.page || ''} ${reject.code || ''} — ${reject.reason}`);
        doc.font('Helvetica').text(collapseWs(reject.raw).slice(0, 300), { width: 500 });
        doc.moveDown(0.3);
      }
    }

    doc.end();
  });
}

function resolveInputPath(inputPath) {
  if (!inputPath) return '';
  if (fs.existsSync(inputPath)) return path.resolve(inputPath);

  // Helps when a Windows path is supplied while running under WSL/Linux.
  const winDrive = inputPath.match(/^([A-Za-z]):[\\/](.*)$/);
  if (winDrive && process.platform !== 'win32') {
    const converted = path.join('/mnt', winDrive[1].toLowerCase(), winDrive[2].replace(/[\\/]+/g, '/'));
    if (fs.existsSync(converted)) return path.resolve(converted);
  }

  return path.resolve(inputPath);
}

function listPdfFiles(inputPath) {
  const resolved = resolveInputPath(inputPath);
  if (!fs.existsSync(resolved)) {
    const hint = /^[A-Za-z]:[\\/]/.test(inputPath) && process.platform !== 'win32'
      ? ' If you are running in WSL/Linux, make sure the Windows drive is mounted under /mnt/<drive-letter>.'
      : '';
    throw new Error(`Input not found: ${inputPath}.${hint}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (!/\.pdf$/i.test(resolved)) throw new Error(`Input file must be a .pdf: ${resolved}`);
    return { inputType: 'file', root: path.dirname(resolved), pdfs: [resolved] };
  }
  if (!stat.isDirectory()) throw new Error(`Input must be a .pdf file or directory: ${resolved}`);

  const pdfs = [];
  const stack = [resolved];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && /\.pdf$/i.test(entry.name)) pdfs.push(fullPath);
    }
  }
  pdfs.sort((a, b) => a.localeCompare(b));
  if (!pdfs.length) throw new Error(`No .pdf files found under directory: ${resolved}`);
  return { inputType: 'directory', root: resolved, pdfs };
}

function idForPdf(pdfPath, opts, batch) {
  const baseId = slugify(path.basename(pdfPath, path.extname(pdfPath)));
  if (!batch) return slugify(opts.id || baseId);
  const rel = path.relative(batch.root, pdfPath).replace(/\.[^.]+$/i, '');
  const relId = slugify(rel || baseId);
  return opts.id ? `${slugify(opts.id)}-${relId}`.slice(0, 110).replace(/-+$/g, '') : relId;
}

async function ingestOnePdf(sourcePath, opts, canonical, outDir, sourceId) {
  ensureDir(outDir);

  const { buf, pages } = await readPdfPages(sourcePath);
  const generatedAt = new Date().toISOString();
  const sourceSha256 = sha256(buf);
  const sections = detectSections(pages);
  const { rows: rawRows, rejects, parserType } = extractRows(pages, sections, opts.type);
  const cleanedRows = normalizeRows(rawRows, canonical, sourceId);
  const validation = buildValidationReport(cleanedRows, rawRows, rejects, canonical);

  const metadata = {
    sourceId,
    sourcePath,
    generatedAt,
    bytes: buf.length,
    sha256: sourceSha256,
    pages: pages.length,
    parserType,
    canonicalPath: canonical.path
  };

  writeJson(path.join(outDir, 'source-metadata.json'), metadata);
  writeJson(path.join(outDir, 'pages.json'), pages.map((text, idx) => ({ page: idx + 1, text })));
  writeJson(path.join(outDir, 'sections.json'), sections);
  writeJson(path.join(outDir, 'extracted-rows.raw.json'), rawRows);
  writeJson(path.join(outDir, 'extracted-rows.cleaned.json'), cleanedRows);
  writeCsv(path.join(outDir, 'extracted-rows.cleaned.csv'), cleanedRows);
  writeJson(path.join(outDir, 'rejects.json'), rejects.slice(0, opts.maxRejects));
  writeJson(path.join(outDir, 'validation-report.json'), validation);

  const reportPdf = path.join(outDir, 'sectioned-report.pdf');
  await writeSectionedPdf(reportPdf, {
    sourceId,
    sourcePath,
    sourceSha256,
    generatedAt,
    pages,
    sections,
    parserType,
    cleanedRows,
    rejects,
    validation
  });

  const manifest = {
    ...metadata,
    outputs: {
      sourceMetadata: path.relative(ROOT, path.join(outDir, 'source-metadata.json')),
      pages: path.relative(ROOT, path.join(outDir, 'pages.json')),
      sections: path.relative(ROOT, path.join(outDir, 'sections.json')),
      rawRows: path.relative(ROOT, path.join(outDir, 'extracted-rows.raw.json')),
      cleanedRowsJson: path.relative(ROOT, path.join(outDir, 'extracted-rows.cleaned.json')),
      cleanedRowsCsv: path.relative(ROOT, path.join(outDir, 'extracted-rows.cleaned.csv')),
      rejects: path.relative(ROOT, path.join(outDir, 'rejects.json')),
      validation: path.relative(ROOT, path.join(outDir, 'validation-report.json')),
      sectionedPdf: path.relative(ROOT, reportPdf)
    },
    summary: {
      cleanedRows: cleanedRows.length,
      rejects: rejects.length,
      canonicalMatches: validation.canonicalMatches,
      canonicalMisses: validation.canonicalMisses,
      recommendation: validation.recommendation
    }
  };
  writeJson(path.join(outDir, 'manifest.json'), manifest);
  return { manifest, outDir, reportPdf };
}

function writeBatchSummary(batchOutDir, input, results) {
  ensureDir(batchOutDir);
  const rows = results.map((result) => ({
    source_id: result.manifest.sourceId,
    source_path: result.manifest.sourcePath,
    pages: result.manifest.pages,
    cleaned_rows: result.manifest.summary.cleanedRows,
    rejects: result.manifest.summary.rejects,
    canonical_matches: result.manifest.summary.canonicalMatches,
    canonical_misses: result.manifest.summary.canonicalMisses,
    manifest: path.relative(ROOT, path.join(result.outDir, 'manifest.json')),
    sectioned_pdf: path.relative(ROOT, result.reportPdf),
    recommendation: result.manifest.summary.recommendation
  }));
  writeCsvWithHeaders(path.join(batchOutDir, 'batch-summary.csv'), [
    'source_id',
    'source_path',
    'pages',
    'cleaned_rows',
    'rejects',
    'canonical_matches',
    'canonical_misses',
    'manifest',
    'sectioned_pdf',
    'recommendation'
  ], rows);
  writeJson(path.join(batchOutDir, 'batch-manifest.json'), {
    generatedAt: new Date().toISOString(),
    inputType: input.inputType,
    inputRoot: input.root,
    pdfCount: input.pdfs.length,
    totals: rows.reduce((acc, row) => {
      acc.pages += Number(row.pages || 0);
      acc.cleanedRows += Number(row.cleaned_rows || 0);
      acc.rejects += Number(row.rejects || 0);
      acc.canonicalMatches += Number(row.canonical_matches || 0);
      acc.canonicalMisses += Number(row.canonical_misses || 0);
      return acc;
    }, { pages: 0, cleanedRows: 0, rejects: 0, canonicalMatches: 0, canonicalMisses: 0 }),
    outputs: {
      batchSummaryCsv: path.relative(ROOT, path.join(batchOutDir, 'batch-summary.csv')),
      files: rows
    }
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.inputPath) {
    printUsage();
    process.exit(opts.help ? 0 : 2);
  }

  const input = listPdfFiles(opts.inputPath);
  const canonical = loadCanonical(opts.canonical);
  const isBatch = input.inputType === 'directory';
  const batchId = slugify(opts.id || path.basename(input.root));
  const batchOutDir = isBatch ? path.join(opts.outRoot, batchId) : null;
  const results = [];

  console.log(`Input: ${input.root}`);
  console.log(`PDF files: ${input.pdfs.length}`);
  if (isBatch) console.log(`Batch output: ${batchOutDir}`);

  for (const [index, pdfPath] of input.pdfs.entries()) {
    const sourceId = idForPdf(pdfPath, opts, isBatch ? input : null);
    const outDir = isBatch ? path.join(batchOutDir, sourceId) : path.join(opts.outRoot, sourceId);
    console.log(`\n[${index + 1}/${input.pdfs.length}] ${pdfPath}`);
    const result = await ingestOnePdf(pdfPath, opts, canonical, outDir, sourceId);
    results.push(result);
    console.log(`Output: ${outDir}`);
    console.log(`Pages: ${result.manifest.pages}`);
    console.log(`Cleaned rows: ${result.manifest.summary.cleanedRows}`);
    console.log(`Rejects: ${result.manifest.summary.rejects}`);
    console.log(`Canonical matches: ${result.manifest.summary.canonicalMatches}`);
    console.log(`Canonical misses: ${result.manifest.summary.canonicalMisses}`);
    console.log(`Sectioned PDF: ${result.reportPdf}`);
  }

  if (isBatch) {
    writeBatchSummary(batchOutDir, input, results);
    console.log(`\nBatch manifest: ${path.join(batchOutDir, 'batch-manifest.json')}`);
    console.log(`Batch summary CSV: ${path.join(batchOutDir, 'batch-summary.csv')}`);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
