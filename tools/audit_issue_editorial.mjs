import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ISSUE = process.argv[2] || process.env.ISSUE || '202604';
const ISSUE_DIR = path.join(ROOT, ISSUE);

if (!fs.existsSync(ISSUE_DIR) || !fs.statSync(ISSUE_DIR).isDirectory()) {
  throw new Error(`Missing issue directory: ${ISSUE}`);
}

const articleDirs = fs.readdirSync(ISSUE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d{2}_/.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'ja'));

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[|*_`~-]/g, '')
    .replace(/\s+/g, '');
}

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function fileInfo(dir, name) {
  const p = path.join(dir, name);
  const stat = fs.statSync(p);
  return {
    file: name,
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

const rows = [];
const numberGroups = new Map();

for (const article of articleDirs) {
  const articleDir = path.join(ISSUE_DIR, article);
  const files = collectFiles(articleDir);
  const number = article.slice(0, 2);
  if (!numberGroups.has(number)) numberGroups.set(number, []);
  numberGroups.get(number).push(article);

  const mdFiles = files.filter((name) => name.endsWith('.md') && name !== '企画.md');
  const planFile = files.includes('企画.md') ? '企画.md' : null;
  const htmlFiles = files.filter((name) => name.endsWith('.html') && name !== 'fixed_layout.html');
  const fixedLayout = files.includes('fixed_layout.html');
  const fixedCss = files.includes('fixed_layout.css');

  const markdown = mdFiles.map((name) => {
    const p = path.join(articleDir, name);
    const text = fs.readFileSync(p, 'utf8');
    const plain = stripMarkdown(text);
    return {
      ...fileInfo(articleDir, name),
      charsRaw: text.length,
      charsApproxBody: plain.length,
      headings: (text.match(/^#{1,6}\s+/gm) || []).length,
      blockquotes: (text.match(/^>\s?/gm) || []).length,
      tables: (text.match(/^\|.*\|\s*$/gm) || []).length > 1,
      titleHasLightweightMarker: /^#.*軽量版/m.test(text),
    };
  });

  rows.push({
    number,
    article,
    plan: planFile ? fileInfo(articleDir, planFile) : null,
    markdown,
    html: htmlFiles.map((name) => fileInfo(articleDir, name)),
    fixedLayout,
    fixedCss,
    hasArchiveDir: fs.existsSync(path.join(articleDir, '過去版')) || fs.existsSync(path.join(articleDir, 'backup')),
  });
}

const numberConflicts = [...numberGroups.entries()]
  .filter(([, dirs]) => dirs.length > 1)
  .map(([number, dirs]) => ({ number, dirs }));

const report = {
  issue: ISSUE,
  generatedAt: new Date().toISOString(),
  sourceRule: 'Article body source of truth is the current top-level .md in each article directory. Archives are not canonical.',
  articleCount: rows.length,
  numberConflicts,
  articles: rows,
};

const exportDir = path.join(ROOT, 'exports', ISSUE);
fs.mkdirSync(exportDir, { recursive: true });
const outPath = path.join(exportDir, 'editorial_audit.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Editorial audit: ${ISSUE}`);
console.log(`Articles: ${rows.length}`);
if (numberConflicts.length) {
  console.log('Number conflicts:');
  for (const conflict of numberConflicts) {
    console.log(`  ${conflict.number}: ${conflict.dirs.join(' | ')}`);
  }
}
for (const row of rows) {
  const body = row.markdown.length
    ? row.markdown.map((m) => `${m.file}:${m.charsApproxBody}chars`).join(', ')
    : 'NO BODY MD';
  console.log(`${row.article} -> ${body}; fixed_layout=${row.fixedLayout ? 'yes' : 'no'}`);
}
console.log(`Wrote ${path.relative(ROOT, outPath)}`);
