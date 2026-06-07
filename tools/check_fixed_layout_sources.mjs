import path from 'node:path';
import { promises as fs } from 'node:fs';

const ROOT = process.cwd();
const ISSUE_DIR = path.join(ROOT, '202603');

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

async function main() {
  const dirs = await collectArticleDirs();
  const errors = [];
  const warnings = [];

  for (const dir of dirs) {
    const name = path.basename(dir);
    if (name.startsWith('00_')) continue;

    const htmlPath = path.join(dir, 'fixed_layout.html');
    const cssPath = path.join(dir, 'fixed_layout.css');

    if (!(await exists(htmlPath))) {
      errors.push(`${name}: missing fixed_layout.html`);
      continue;
    }
    if (!(await exists(cssPath))) {
      errors.push(`${name}: missing fixed_layout.css`);
      continue;
    }

    const html = await fs.readFile(htmlPath, 'utf-8');
    const css = await fs.readFile(cssPath, 'utf-8');

    if (!html.includes('ATOMIC_SELECTOR')) errors.push(`${name}: fixed_layout.html is old; missing ATOMIC_SELECTOR`);
    if (!html.includes('PAGE_BUDGET')) errors.push(`${name}: fixed_layout.html is old; missing PAGE_BUDGET`);
    if (!html.includes('function collectAtomicBlocks(')) errors.push(`${name}: fixed_layout.html is old; missing collectAtomicBlocks(`);
    if (!html.includes('function blockWeight(')) errors.push(`${name}: fixed_layout.html is old; missing blockWeight(`);
    if (html.includes('scrollHeight') || html.includes('clientHeight')) errors.push(`${name}: fixed_layout.html must not use layout-measure pagination`);

    if (css.includes('column-count')) errors.push(`${name}: fixed_layout.css is old; column-count remains`);
    if (css.includes('column-gap')) warnings.push(`${name}: fixed_layout.css still contains column-gap`);
    if (css.includes('column-rule')) warnings.push(`${name}: fixed_layout.css still contains column-rule`);
  }

  for (const warning of warnings) console.warn(`[WARN] ${warning}`);

  if (errors.length > 0) {
    console.error('fixed layout source check: FAILED');
    for (const error of errors) console.error(`- ${error}`);
    console.error('Run git pull, then re-run this check. If local edits block pull, resolve them before validation.');
    process.exit(1);
  }

  console.log('fixed layout source check: OK');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
