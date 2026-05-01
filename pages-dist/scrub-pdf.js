/**
 * Scrub a PDF for hunt metrics + table-like signals.
 *
 * This does NOT try to perfectly parse tables (PDFs vary a lot).
 * It produces a page-by-page index of where key metrics appear so we can
 * target the right pages for structured extraction next.
 *
 * Usage:
 *   node scrub-pdf.js "C:\\path\\to\\file.pdf"
 *
 * Output:
 *   - Writes: _exports/pdf-scrub.json
 *   - Prints: a short summary + page hits
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const OUT_DIR = path.join(__dirname, '_exports');
const OUT_JSON = path.join(OUT_DIR, 'pdf-scrub.json');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safe(s) {
  return String(s || '');
}

function norm(s) {
  return safe(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function nospaceNorm(s) {
  return norm(s).replace(/ /g, '');
}

const GROUPS = {
  avg_age: ['average age', 'avg age', 'mean age', 'harvest age', 'age (avg)', 'average harvest age'],
  success_pct: ['success %', 'success percent', '% success', 'success rate', 'successfully harvested'],
  hunters: ['hunters', 'hunters afield', '# hunters', 'hunter count'],
  harvest: ['harvest', 'harvested', 'animals harvested', '# harvest'],
  days: ['days hunted', 'avg days', 'average days', 'avg days hunted', 'effort (days)'],
  satisfaction: ['satisfaction', 'satisfied', 'hunt satisfaction'],
  // Species / topic anchors (helps us quickly locate elk/deer sections)
  elk: ['elk', 'bull elk', 'limited entry elk'],
  deer: ['deer', 'mule deer', 'buck deer'],
  oial: ['once-in-a-lifetime', 'o.i.l.', 'oial'],
  ple: ['premium limited-entry', 'p.l.e.', 'premium le'],
  le: ['limited-entry', 'l.e.', 'limited entry'],
  general: ['general season', 'g.s.'],
  otc: ['over the counter', 'otc'],
  private: ['private lands', 'private land']
};

function findLineHits(lines, terms, limit = 8) {
  const hits = [];
  const termNoSpaces = terms.map((t) => nospaceNorm(t));
  for (let i = 0; i < lines.length; i += 1) {
    const raw = safe(lines[i]).replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const noSpace = nospaceNorm(raw);
    for (let ti = 0; ti < terms.length; ti += 1) {
      if (noSpace.includes(termNoSpaces[ti])) {
        hits.push({ line: i + 1, term: terms[ti], text: raw.slice(0, 240) });
        break;
      }
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

async function main() {
  const filePath = process.argv.slice(2).join(' ').trim().replace(/^\"|\"$/g, '');
  if (!filePath) {
    console.error('Usage: node scrub-pdf.js \"C:\\\\path\\\\file.pdf\"');
    process.exit(2);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(2);
  }

  ensureDir(OUT_DIR);

  const buf = fs.readFileSync(filePath);

  const pageTexts = [];
  const data = await pdfParse(buf, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((tc) => {
        const parts = tc.items.map((it) => it.str);
        const text = parts.join('\n');
        pageTexts.push(text);
        return text;
      })
  });

  const pages = pageTexts.length ? pageTexts : [data.text || ''];

  const report = {
    source: filePath,
    generatedAt: new Date().toISOString(),
    numPagesDetected: pages.length,
    groups: Object.keys(GROUPS),
    pages: []
  };

  const totals = {};
  for (const g of Object.keys(GROUPS)) totals[g] = 0;

  pages.forEach((text, idx) => {
    const lines = safe(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const joinedNoSpace = nospaceNorm(lines.join(' '));

    const pageEntry = { page: idx + 1, matches: {} };
    let pageAny = false;

    for (const [g, terms] of Object.entries(GROUPS)) {
      const termNoSpaces = terms.map((t) => nospaceNorm(t));
      const count = termNoSpaces.reduce((acc, t) => acc + (joinedNoSpace.includes(t) ? 1 : 0), 0);
      if (!count) continue;
      pageAny = true;
      totals[g] += count;
      pageEntry.matches[g] = {
        count,
        hits: findLineHits(lines, terms)
      };
    }

    if (pageAny) report.pages.push(pageEntry);
  });

  report.totals = totals;
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const coreGroups = ['avg_age', 'success_pct', 'hunters', 'harvest', 'days', 'satisfaction'];
  console.log(`PDF: ${filePath}`);
  console.log(`Pages detected: ${pages.length}`);
  console.log(`Pages with any hits: ${report.pages.length}`);
  console.log('');
  console.log('Core metric totals (presence hits across pages):');
  coreGroups.forEach((g) => console.log(`- ${g}: ${totals[g] || 0}`));
  console.log('');

  function printTop(group) {
    const hits = report.pages
      .filter((p) => p.matches[group])
      .map((p) => ({ page: p.page, count: p.matches[group].count, sample: (p.matches[group].hits[0] || {}).text }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    if (!hits.length) return;
    console.log(`Pages with '${group}':`);
    hits.forEach((h) => console.log(`- p${h.page} (count=${h.count}) ${h.sample ? `:: ${h.sample}` : ''}`));
    console.log('');
  }

  coreGroups.forEach(printTop);
  console.log(`Saved: ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
