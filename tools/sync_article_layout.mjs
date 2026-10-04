import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareArticle, ROOT, sha256 } from './article_source.mjs';
import { exportArticle } from './build_article.mjs';

export async function syncArticle(articleDir, { checkOnly = false } = {}) {
  const prepared = await prepareArticle(articleDir);
  const result = { article: path.basename(articleDir), mode: 'source-preflight', ok: false, pages: [] };
  // Serve the candidate at its actual article URL, entirely from memory. Images
  // remain their original selected files; neither old HTML nor PNG is touched.
  await exportArticle(articleDir, { checkOnly: true, sourceHtml: prepared.html, safetyPx: 28 }, result);
  const again = await prepareArticle(articleDir);
  if (again.html !== prepared.html) throw new Error('Source changed during composition; retry.');
  result.sourceSync = { status: checkOnly ? 'candidate-verified' : 'verified', htmlSha256: sha256(prepared.html), ...prepared.manifest };
  if (!checkOnly) {
    const temporary = await fs.mkdtemp(path.join(articleDir, '.layout-sync-'));
    try {
      await fs.writeFile(path.join(temporary, 'fixed_layout.html'), prepared.html);
      await fs.rename(path.join(temporary, 'fixed_layout.html'), path.join(articleDir, 'fixed_layout.html'));
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  }
  return result;
}

async function main() {
  const [article, ...args] = process.argv.slice(2);
  if (!article || args.some(a => a !== '--check-only')) throw new Error('usage: node tools/sync_article_layout.mjs <202604/article-dir> [--check-only]');
  const dir = path.resolve(ROOT, article);
  if (path.dirname(dir) !== path.join(ROOT, '202604') || !/^\d{2}_/.test(path.basename(dir)) || await fs.realpath(dir) !== dir) throw new Error('Sync is restricted to a real 202604 article directory.');
  const result = await syncArticle(dir, { checkOnly: args.includes('--check-only') });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
