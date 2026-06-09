import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const ARTICLE_DIR = path.dirname(__filename);
const ROOT = path.resolve(ARTICLE_DIR, '../..');
const ARTICLE_NAME = path.basename(ARTICLE_DIR);
const LOCAL_BUILD_DIR = path.join(ARTICLE_DIR, 'build');
const FIXED_EXPORT_DIR = path.join(ROOT, 'exports', 'fixed_layout_images');
const KINDLE_EXPORT_DIR = path.join(ROOT, 'exports', 'kindle_pages');
const PAGE_NAME_PATTERN = /^\d{2}_.+_\d{3}\.png$/i;

function normalizeRel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
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

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function localBuildPages() {
  if (!(await exists(LOCAL_BUILD_DIR))) {
    throw new Error(`Missing local build directory: ${normalizeRel(LOCAL_BUILD_DIR)}. Run build_this_article.mjs first.`);
  }

  const names = (await fs.readdir(LOCAL_BUILD_DIR))
    .filter(name => name.startsWith(`${ARTICLE_NAME}_`))
    .filter(name => name.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, 'ja'));

  if (names.length === 0) {
    throw new Error(`No local build PNG found in ${normalizeRel(LOCAL_BUILD_DIR)}. Run build_this_article.mjs first.`);
  }

  return names.map(name => path.join(LOCAL_BUILD_DIR, name));
}

async function removeOldFixedExports() {
  await fs.mkdir(FIXED_EXPORT_DIR, { recursive: true });
  const names = await fs.readdir(FIXED_EXPORT_DIR).catch(() => []);
  const prefix = `${ARTICLE_NAME}_`;

  for (const name of names) {
    if (name.startsWith(prefix) && name.toLowerCase().endsWith('.png')) {
      const target = path.join(FIXED_EXPORT_DIR, name);
      await fs.rm(target, { force: true });
      console.log(`removed: ${normalizeRel(target)}`);
    }
  }
}

async function copyLocalBuildToFixedExports(localPages) {
  await removeOldFixedExports();

  for (const src of localPages) {
    const dest = path.join(FIXED_EXPORT_DIR, path.basename(src));
    await fs.copyFile(src, dest);
    console.log(`fixed_layout_images: ${normalizeRel(dest)}`);
  }
}

async function rebuildKindlePages() {
  if (!(await exists(FIXED_EXPORT_DIR))) {
    throw new Error(`Missing fixed export directory: ${normalizeRel(FIXED_EXPORT_DIR)}`);
  }

  const ignored = [];
  const pages = (await fs.readdir(FIXED_EXPORT_DIR))
    .filter(name => name.toLowerCase().endsWith('.png'))
    .map(name => ({ name, key: pageKeyFromName(name) }))
    .filter(item => {
      if (item.key !== null) return true;
      ignored.push(item.name);
      return false;
    })
    .sort(comparePages);

  if (pages.length === 0) {
    throw new Error(`No fixed layout PNG pages found in ${normalizeRel(FIXED_EXPORT_DIR)}`);
  }

  await cleanDir(KINDLE_EXPORT_DIR);

  for (const name of ignored) {
    console.warn(`ignored stale/non-page PNG: ${name}`);
  }

  for (let i = 0; i < pages.length; i += 1) {
    const src = path.join(FIXED_EXPORT_DIR, pages[i].name);
    const outName = `${String(i + 1).padStart(4, '0')}.png`;
    const dest = path.join(KINDLE_EXPORT_DIR, outName);
    await fs.copyFile(src, dest);
    console.log(`kindle_pages: ${pages[i].name} -> ${normalizeRel(dest)}`);
  }

  console.log(`prepared ${pages.length} Kindle pages in ${normalizeRel(KINDLE_EXPORT_DIR)}`);
}

async function main() {
  const localPages = await localBuildPages();
  await copyLocalBuildToFixedExports(localPages);
  await rebuildKindlePages();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
