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
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectArticleDirs(issueDir) {
  const entries = await fs.readdir(issueDir, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{2}_/.test(entry.name)) continue;
    const dir = path.join(issueDir, entry.name);
    if (await exists(path.join(dir, 'fixed_layout.html'))) {
      dirs.push(dir);
    }
  }
  return dirs.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ja'));
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
    throw new Error(`No article folders with fixed_layout.html found under ${issue}`);
  }

  const buildScript = path.join(ROOT, 'tools', 'build_article.mjs');
  let built = 0;
  let skipped = 0;

  for (const articleDir of articleDirs) {
    const manifestPath = path.join(articleDir, 'intermediate', 'article_manifest.json');
    const rel = path.relative(ROOT, articleDir).split(path.sep).join('/');
    if (missingOnly && await exists(manifestPath)) {
      console.log(`skip existing: ${rel}`);
      skipped += 1;
      continue;
    }
    console.log(`build article: ${rel}`);
    await runNodeScript(buildScript, [rel]);
    built += 1;
  }

  console.log(`issue article build complete: ${issue}`);
  console.log(`built: ${built}`);
  console.log(`skipped: ${skipped}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
