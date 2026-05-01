#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'pages-dist');
const MAX_BYTES = 25 * 1024 * 1024;

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.codex',
  '.npm-cache',
  'pages-dist',
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyTree(srcDir, destDir) {
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const rel = path.relative(ROOT, src);
    const dest = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyTree(src, dest);
      continue;
    }

    const stat = fs.statSync(src);
    if (stat.size > MAX_BYTES) {
      console.log(`Skipping >25MiB: ${rel} (${(stat.size / (1024 * 1024)).toFixed(1)} MiB)`);
      continue;
    }
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}
copyTree(ROOT, OUT_DIR);
console.log('Built Cloudflare Pages output at pages-dist/');

