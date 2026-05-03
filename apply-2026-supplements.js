const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'processed_data', 'hunt_database_complete.csv');
const DEFAULT_PATCH_FILE = path.join(__dirname, 'processed_data', 'supplements', 'hunt_database_2026_patch.csv');
const OUTPUT_FILE = path.join(__dirname, 'processed_data', 'hunt_database_complete.csv');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toCsv(rows) {
  return `${rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')}\n`;
}

function normalize(v) {
  return String(v || '').trim().toLowerCase();
}

const argFile = process.argv.find((arg) => arg.startsWith('--patch='));
const patchFile = argFile ? path.resolve(__dirname, argFile.split('=')[1]) : DEFAULT_PATCH_FILE;

if (!fs.existsSync(patchFile)) {
  console.error(`Patch file not found: ${patchFile}`);
  console.error('Create it from: processed_data/supplements/hunt_database_2026_patch.template.csv');
  process.exit(1);
}

const dbRows = parseCsv(fs.readFileSync(DB_FILE, 'utf8'));
const patchRows = parseCsv(fs.readFileSync(patchFile, 'utf8'));

const [dbHeader, ...dbData] = dbRows;
const [patchHeader, ...patchData] = patchRows;

const dbIndex = Object.fromEntries(dbHeader.map((h, i) => [h, i]));
const patchIndex = Object.fromEntries(patchHeader.map((h, i) => [h, i]));

const requiredPatchCols = ['hunt_code', 'residency', 'field', 'value'];
for (const col of requiredPatchCols) {
  if (!(col in patchIndex)) {
    throw new Error(`Patch CSV missing required column: ${col}`);
  }
}

const rowKeyToDbRow = new Map();
for (const row of dbData) {
  rowKeyToDbRow.set(`${normalize(row[dbIndex.hunt_code])}::${normalize(row[dbIndex.residency])}`, row);
}

let applied = 0;
let skippedMissingRow = 0;
let skippedUnknownField = 0;
let skippedHasValue = 0;

for (const patch of patchData) {
  const huntCode = patch[patchIndex.hunt_code];
  const residency = patch[patchIndex.residency];
  const field = patch[patchIndex.field];
  const value = patch[patchIndex.value];
  const force = normalize(patch[patchIndex.force_overwrite]) === 'true';

  const dbRow = rowKeyToDbRow.get(`${normalize(huntCode)}::${normalize(residency)}`);
  if (!dbRow) {
    skippedMissingRow += 1;
    continue;
  }
  if (!(field in dbIndex)) {
    skippedUnknownField += 1;
    continue;
  }

  const existing = dbRow[dbIndex[field]];
  const isEmpty = existing == null || String(existing).trim() === '';
  if (isEmpty || force) {
    dbRow[dbIndex[field]] = value;
    applied += 1;
  } else {
    skippedHasValue += 1;
  }
}

fs.writeFileSync(OUTPUT_FILE, toCsv([dbHeader, ...dbData]));
console.log(`Applied ${applied} patches from ${path.relative(__dirname, patchFile)}.`);
console.log(`Skipped: missing row ${skippedMissingRow}, unknown field ${skippedUnknownField}, already populated ${skippedHasValue}.`);
