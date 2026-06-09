import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const ISSUE = process.argv[2] || process.env.ISSUE || '202603';
const ISSUE_EXPORT_DIR = path.join(ROOT, 'exports', ISSUE);
const SRC_DIR = path.join(ISSUE_EXPORT_DIR, 'fixed_layout_images');
const OUT_DIR = path.join(ISSUE_EXPORT_DIR, 'kindle_pages');
const PAGE_NAME_PATTERN = /^\d{2}_.+_\d{3}\.png$/i;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function pageKeyFromName(name) {
  if (!PAGE_NAME_PATTERN.test(name)) return null;

  const articleMatch = name.match(/^(\d{2})_/);
  const pageMatch = name.match(/_(\d{3})\.png$/i);
  if (!articleMatch || !pageMatch) return null;

  return { article: Number(articleMatch[1]), page: Number(pageMatch[1]) };
}

function comparePages(a, b) {
  if (a.key.article !== b.key.article) return a.key.article - b.key.article;
  if (a.key.page !== b.key.page) return a.key.page - b.key.page;
  return a.name.localeCompare(b.name, 'ja');
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Missing source directory: ${path.relative(ROOT, SRC_DIR)}`);
    console.error(`Run: node tools/export_fixed_layout_images.mjs ${ISSUE}`);
    process.exit(1);
  }

  const ignored = [];
  const pages = fs.readdirSync(SRC_DIR)
    .filter(name => name.toLowerCase().endsWith('.png'))
    .map(name => ({ name, key: pageKeyFromName(name) }))
    .filter(item => {
      if (item.key !== null) return true;
      ignored.push(item.name);
      return false;
    })
    .sort(comparePages);

  if (pages.length === 0) {
    console.error(`No fixed layout PNG pages found in ${path.relative(ROOT, SRC_DIR)}`);
    process.exit(1);
  }

  ensureDir(OUT_DIR);
  cleanDir(OUT_DIR);

  for (const name of ignored) {
    console.warn(`ignored stale/non-page PNG: ${name}`);
  }

  for (let i = 0; i < pages.length; i += 1) {
    const src = path.join(SRC_DIR, pages[i].name);
    const outName = `${String(i + 1).padStart(4, '0')}.png`;
    const dest = path.join(OUT_DIR, outName);
    fs.copyFileSync(src, dest);
    console.log(`${pages[i].name} -> ${path.relative(ROOT, dest)}`);
  }

  console.log('');
  console.log(`Prepared ${pages.length} Kindle pages in ${path.relative(ROOT, OUT_DIR)}`);
}

main();
