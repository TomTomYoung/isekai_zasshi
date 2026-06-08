import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function usage() {
  console.error('usage: node tools/build_issue_articles.mjs <issue> [--missing-only]');
  console.error('example: node tools/build_issue_articles.mjs 202603');
  console.error('example: node tools/build_issue_articles.mjs 202603 --missing-only');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function main() {
  const issue = process.argv[2] || process.env.ISSUE;
  if (!issue) {
    usage();
    process.exit(1);
  }

  const missingOnly = process.argv.includes('--missing-only');
  const issueDir = path.join(ROOT, issue);
  const stat = await fs.stat(issueDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Issue directory not found: ${issueDir}`);
  }

  const articleDirs = await collectArticleDirs(issueDir);
  if (articleDirs.length === 0) {
    throw new Error(`No article folders found under ${issue}`);
  }

  const buildScript = path.join(ROOT, 'tools', 'build_article.mjs');
  const results = [];

  for (const articleDir of articleDirs) {
    const rel = normalizeRel(articleDir);
    const fixedLayoutPath = path.join(articleDir, 'fixed_layout.html');
    const manifestPath = path.join(articleDir, 'intermediate', 'article_manifest.json');

    if (!(await exists(fixedLayoutPath))) {
      console.warn(`skip missing fixed_layout.html: ${rel}`);
      results.push({ article: rel, status: 'skipped', reason: 'missing fixed_layout.html' });
      continue;
    }

    if (missingOnly && await exists(manifestPath)) {
      console.log(`skip existing: ${rel}`);
      results.push({ article: rel, status: 'skipped', reason: 'article_manifest exists' });
      continue;
    }

    console.log(`build article: ${rel}`);
    try {
      await runNodeScript(buildScript, [rel]);
      results.push({ article: rel, status: 'ok' });
    } catch (error) {
      results.push({ article: rel, status: 'failed', reason: error.message });
      const outPath = path.join(ROOT, 'exports', issue, 'article_build_results.json');
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify({ issue, missingOnly, results }, null, 2), 'utf8');
      throw error;
    }
  }

  const outPath = path.join(ROOT, 'exports', issue, 'article_build_results.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ issue, missingOnly, results }, null, 2), 'utf8');

  const built = results.filter(result => result.status === 'ok').length;
  const skipped = results.filter(result => result.status === 'skipped').length;
  const failed = results.filter(result => result.status === 'failed').length;

  console.log(`issue article build complete: ${issue}`);
  console.log(`built: ${built}`);
  console.log(`skipped: ${skipped}`);
  console.log(`failed: ${failed}`);
  console.log(`article build results: ${normalizeRel(outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
