import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PAGE_W = 1456;
const PAGE_H = 2056;

function usage() {
  console.error('usage: node tools/collect_issue_pages.mjs <issue>');
  console.error('example: node tools/collect_issue_pages.mjs 202603');
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

function normalizeRel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

async function collectArticleDirs(issueDir) {
  const entries = await fs.readdir(issueDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && /^\d{2}_/.test(entry.name))
    .map(entry => path.join(issueDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ja'));
}

async function readArticleManifest(articleDir) {
  const manifestPath = path.join(articleDir, 'intermediate', 'article_manifest.json');
  if (!(await exists(manifestPath))) {
    throw new Error(`Missing article manifest. Build article first: ${normalizeRel(articleDir)}`);
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    throw new Error(`Article manifest has no pages: ${normalizeRel(manifestPath)}`);
  }
  return { manifestPath, manifest };
}

async function main() {
  const issue = process.argv[2] || process.env.ISSUE;
  if (!issue) {
    usage();
    process.exit(1);
  }

  const issueDir = path.join(ROOT, issue);
  const st = await fs.stat(issueDir).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw new Error(`Issue directory not found: ${issueDir}`);
  }

  const outRoot = path.join(ROOT, 'exports', issue);
  const kindlePagesDir = path.join(outRoot, 'kindle_pages');
  await cleanDir(kindlePagesDir);

  const articleDirs = await collectArticleDirs(issueDir);
  const issueManifest = {
    issue,
    width: PAGE_W,
    height: PAGE_H,
    generatedFrom: 'article-level pages',
    pages: [],
    articles: [],
  };

  let globalPage = 1;
  for (const articleDir of articleDirs) {
    const { manifestPath, manifest } = await readArticleManifest(articleDir);
    const articleEntry = {
      article: manifest.article || path.basename(articleDir),
      articleDir: normalizeRel(articleDir),
      manifest: normalizeRel(manifestPath),
      startPage: globalPage,
      pageCount: manifest.pages.length,
    };

    for (const p of manifest.pages) {
      const srcPath = path.join(articleDir, p.file);
      if (!(await exists(srcPath))) {
        throw new Error(`Missing article page image: ${normalizeRel(srcPath)}`);
      }
      const destName = `${String(globalPage).padStart(4, '0')}.png`;
      const destPath = path.join(kindlePagesDir, destName);
      await fs.copyFile(srcPath, destPath);
      issueManifest.pages.push({
        globalPage,
        article: articleEntry.article,
        articleDir: articleEntry.articleDir,
        articlePage: p.articlePage,
        src: normalizeRel(srcPath),
        dest: normalizeRel(destPath),
        width: p.width || PAGE_W,
        height: p.height || PAGE_H,
      });
      console.log(`collected: ${normalizeRel(srcPath)} -> ${normalizeRel(destPath)}`);
      globalPage += 1;
    }

    articleEntry.endPage = globalPage - 1;
    issueManifest.articles.push(articleEntry);
  }

  const manifestOut = path.join(outRoot, 'issue_manifest.json');
  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(manifestOut, JSON.stringify(issueManifest, null, 2), 'utf8');
  console.log(`issue manifest: ${normalizeRel(manifestOut)}`);
  console.log(`total pages: ${issueManifest.pages.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
