import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'exports', 'fixed_layout_images');
const OUT_DIR = path.join(ROOT, 'exports', 'kindle_pages');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function pageNumberFromName(name) {
  const match = name.match(/^(\d{2})_/);
  if (!match) return null;
  return Number(match[1]);
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Missing source directory: ${path.relative(ROOT, SRC_DIR)}`);
    console.error('Run: node tools/export_fixed_layout_images.mjs');
    process.exit(1);
  }

  const pages = fs.readdirSync(SRC_DIR)
    .filter(name => name.toLowerCase().endsWith('.png'))
    .map(name => ({ name, page: pageNumberFromName(name) }))
    .filter(item => item.page !== null)
    .sort((a, b) => a.page - b.page);

  if (pages.length === 0) {
    console.error(`No fixed layout PNG pages found in ${path.relative(ROOT, SRC_DIR)}`);
    process.exit(1);
  }

  ensureDir(OUT_DIR);
  cleanDir(OUT_DIR);

  for (let i = 0; i < pages.length; i += 1) {
    const src = path.join(SRC_DIR, pages[i].name);
    const outName = `${String(i + 1).padStart(4, '0')}.png`;
    const dest = path.join(OUT_DIR, outName);
    fs.copyFileSync(src, dest);
    console.log(`${pages[i].name} -> ${outName}`);
  }

  console.log('');
  console.log(`Prepared ${pages.length} Kindle pages in ${path.relative(ROOT, OUT_DIR)}`);
  if (pages.length !== 23) {
    console.warn(`Warning: expected 23 pages, got ${pages.length}.`);
  }
}

main();
