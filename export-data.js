/**
 * Export readability artifacts for key datasets:
 * - CSV stays the canonical raw interchange format
 * - XLSX is convenient for humans
 * - PDF is a "readable snapshot" (summary + sample rows) for quick review
 *
 * Outputs land in `_exports/` (gitignored).
 *
 * Usage:
 *   npm install
 *   npm run export:data
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, '_exports');

const DATASETS = [
  { id: 'draw_reality_engine', input: path.join(ROOT, 'processed_data', 'draw_reality_engine.csv') },
  { id: 'point_ladder_view', input: path.join(ROOT, 'processed_data', 'point_ladder_view.csv') },
  { id: 'harvest_metrics_2025_preliminary', input: path.join(ROOT, 'processed_data', 'harvest-metrics-extract.csv') },
  { id: 'hunt_join_2025', input: path.join(ROOT, 'processed_data', 'hunt_join_2025.csv') },
  { id: 'sleeper_report_elk_deer_2025', input: path.join(ROOT, 'processed_data', 'sleeper-report-elk-deer-2025.csv') },
  { id: 'hunt_master_canonical_2026', input: path.join(ROOT, 'hunt_master_canonical_2026_built.csv') },
  { id: 'hunt_history_2025_2026', input: path.join(ROOT, 'hunt_history_2025_2026_dwr_aligned.csv') }
];

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readCsvLines(filePath, maxBytes = 30 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (stat.size > maxBytes) {
    // Read a prefix to keep memory bounded for very large exports.
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    fs.closeSync(fd);
    return buf.subarray(0, bytesRead).toString('utf8').split(/\r?\n/);
  }
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function parseCsvSample(filePath, maxRows = 80) {
  const lines = readCsvLines(filePath).filter((l) => l && l.trim().length);
  const header = (lines[0] || '').split(',');
  const rows = [];
  for (let i = 1; i < lines.length && rows.length < maxRows; i += 1) {
    const parts = lines[i].split(',');
    rows.push(parts);
  }
  return { header, rows, rowCountEstimate: Math.max(0, lines.length - 1) };
}

function exportXlsxFromCsv(dataset, outBase) {
  const csvText = fs.readFileSync(dataset.input, 'utf8');
  const wb = XLSX.read(csvText, { type: 'string' });
  const outPath = `${outBase}.xlsx`;
  XLSX.writeFile(wb, outPath, { bookType: 'xlsx' });
  return outPath;
}

function writePdf(dataset, outBase) {
  const stat = fs.statSync(dataset.input);
  const sample = parseCsvSample(dataset.input, 60);

  const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
  const outPath = `${outBase}.pdf`;
  const out = fs.createWriteStream(outPath);
  doc.pipe(out);

  doc.fontSize(18).font('Helvetica-Bold').text(`U.O.G.A. Data Snapshot: ${dataset.id}`);
  doc.moveDown(0.4);
  doc.fontSize(10).font('Helvetica').fillColor('#333').text(`Source: ${path.relative(ROOT, dataset.input)}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.text(`File size: ${Math.round(stat.size / 1024).toLocaleString()} KB`);
  doc.text(`Row estimate: ${sample.rowCountEstimate.toLocaleString()} (approx)`);
  doc.moveDown(0.8);

  doc.fontSize(12).font('Helvetica-Bold').fillColor('#111').text('Columns');
  doc.moveDown(0.2);
  doc.fontSize(9).font('Helvetica').fillColor('#222').text(sample.header.join(', '), { width: 520 });
  doc.moveDown(0.8);

  doc.fontSize(12).font('Helvetica-Bold').fillColor('#111').text('Sample Rows (first 60)');
  doc.moveDown(0.4);

  // Render a simple fixed-width preview: we keep it readable by truncating each cell.
  const maxCell = 26;
  const colCount = Math.min(6, sample.header.length);
  const headerLine = sample.header.slice(0, colCount).map((h) => (h.length > maxCell ? `${h.slice(0, maxCell - 1)}…` : h).padEnd(maxCell)).join('  ');
  doc.fontSize(7.8).font('Courier-Bold').fillColor('#111').text(headerLine);
  doc.moveDown(0.15);

  doc.font('Courier').fillColor('#222');
  sample.rows.forEach((r) => {
    const line = r
      .slice(0, colCount)
      .map((v) => {
        const s = String(v ?? '');
        const t = s.length > maxCell ? `${s.slice(0, maxCell - 1)}…` : s;
        return t.padEnd(maxCell);
      })
      .join('  ');
    doc.text(line);
  });

  doc.moveDown(1.2);
  doc.fontSize(9).font('Helvetica').fillColor('#444').text(
    'Note: This PDF is a readability snapshot (summary + sample rows). Use the CSV/XLSX exports for full analysis.'
  );

  doc.end();

  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve(outPath));
    out.on('error', reject);
  });
}

async function run() {
  ensureDir(OUT_DIR);
  console.log(`Exporting to ${OUT_DIR}`);

  for (const ds of DATASETS) {
    if (!fs.existsSync(ds.input)) {
      console.warn(`[skip] Missing input: ${ds.input}`);
      continue;
    }
    const outBase = path.join(OUT_DIR, ds.id);
    console.log(`\n[${ds.id}]`);
    console.log(`- input: ${ds.input}`);

    const xlsxPath = exportXlsxFromCsv(ds, outBase);
    console.log(`- xlsx:  ${xlsxPath}`);

    const pdfPath = await writePdf(ds, outBase);
    console.log(`- pdf:   ${pdfPath}`);
  }

  console.log('\nDone.');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
