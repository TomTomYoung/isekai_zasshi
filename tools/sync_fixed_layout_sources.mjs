import path from 'node:path';
import { promises as fs } from 'node:fs';

const ROOT = process.cwd();
const ISSUE_DIR = path.join(ROOT, '202603');
const TEMPLATE_HTML = path.join(ISSUE_DIR, '01_聖女泥酔スクープ記事', 'fixed_layout.html');
const TEMPLATE_CSS = path.join(ISSUE_DIR, '01_聖女泥酔スクープ記事', 'fixed_layout.css');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectArticleDirs() {
  const entries = await fs.readdir(ISSUE_DIR, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && /^\d{2}_/.test(entry.name))
    .map(entry => path.join(ISSUE_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

function assertTemplate(html, css) {
  const requiredHtml = [
    'function flatten(',
    'MAX_BLOCKS_PER_PAGE',
    "classList.contains('column-box')",
  ];
  for (const token of requiredHtml) {
    if (!html.includes(token)) {
      throw new Error(`Template HTML is not the recursive-pagination version. Missing: ${token}`);
    }
  }
  if (html.includes('scrollHeight') || html.includes('clientHeight')) {
    throw new Error('Template HTML must not use layout-measure pagination.');
  }
  if (css.includes('column-count')) {
    throw new Error('Template CSS must not contain column-count.');
  }
}

async function main() {
  if (!(await exists(TEMPLATE_HTML))) throw new Error(`Missing template: ${path.relative(ROOT, TEMPLATE_HTML)}`);
  if (!(await exists(TEMPLATE_CSS))) throw new Error(`Missing template: ${path.relative(ROOT, TEMPLATE_CSS)}`);

  const html = await fs.readFile(TEMPLATE_HTML, 'utf-8');
  const css = await fs.readFile(TEMPLATE_CSS, 'utf-8');
  assertTemplate(html, css);

  const dirs = await collectArticleDirs();
  let updated = 0;
  for (const dir of dirs) {
    const name = path.basename(dir);
    if (name.startsWith('00_')) continue;

    const htmlPath = path.join(dir, 'fixed_layout.html');
    const cssPath = path.join(dir, 'fixed_layout.css');

    const currentHtml = (await exists(htmlPath)) ? await fs.readFile(htmlPath, 'utf-8') : '';
    const currentCss = (await exists(cssPath)) ? await fs.readFile(cssPath, 'utf-8') : '';

    if (currentHtml !== html) {
      await fs.writeFile(htmlPath, html, 'utf-8');
      console.log(`synced: ${path.relative(ROOT, htmlPath)}`);
      updated += 1;
    }
    if (currentCss !== css) {
      await fs.writeFile(cssPath, css, 'utf-8');
      console.log(`synced: ${path.relative(ROOT, cssPath)}`);
      updated += 1;
    }
  }

  console.log(`fixed layout source sync complete. changed files: ${updated}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
