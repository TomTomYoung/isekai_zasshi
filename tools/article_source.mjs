import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const escapeHtml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const exists = file => fs.access(file).then(() => true, () => false);

import { parseArticle } from './article_parse.mjs';
export { parseArticle } from './article_parse.mjs';

export async function prepareArticle(articleDir) {
  const configPath = path.join(articleDir, 'layout-source.json');
  const configBytes = await fs.readFile(configPath);
  const config = JSON.parse(configBytes);
  if (config.version !== 1 || config.template !== 'illustrated-article-v1' || !/^[^/\\]+\.md$/.test(config.source) || config.source.startsWith('.')) throw new Error('Unsupported layout-source.json.');
  const sourceBytes = await fs.readFile(path.join(articleDir, config.source));
  const parsed = parseArticle(sourceBytes.toString('utf8'));
  const files = [];
  const record = async (base, relative) => {
    const file = path.join(base, relative), real = await fs.realpath(file);
    if (!real.startsWith((await fs.realpath(ROOT)) + path.sep)) throw new Error(`Dependency outside repository: ${file}`);
    const bytes = await fs.readFile(file);
    files.push({ path: path.relative(ROOT, file).split(path.sep).join('/'), sha256: sha256(bytes) });
    return bytes;
  };
  await record(articleDir, 'layout-source.json');
  await record(articleDir, config.source);
  const css = (await record(ROOT, 'tools/article-layout/template.css')).toString('utf8');
  const runtime = (await record(ROOT, 'tools/article-layout/paginate.js')).toString('utf8');
  await record(ROOT, 'tools/article_source.mjs');
  await record(ROOT, 'tools/article_parse.mjs');
  const font = await record(articleDir, 'fonts/article.woff');
  const fontInfo = JSON.parse(await record(articleDir, 'fonts/font.json'));
  await record(articleDir, 'fonts/OFL.txt');
  if (sha256(font) !== fontInfo.sha256) throw new Error('Bundled font hash mismatch.');
  const text = sourceBytes.toString('utf8') + '異世界丸見え実話現地取材202604月号続0123456789 /';
  const coverage = new Set(fontInfo.codepoints);
  const missing = [...new Set([...text].map(c => c.codePointAt(0)))].filter(c => c > 32 && !coverage.has(c));
  if (missing.length) throw new Error(`Bundled font lacks ${missing.map(c => `U+${c.toString(16).toUpperCase()}`).join(', ')}; regenerate the subset with tools/subset_article_font.py.`);
  const assets = [...new Set(parsed.blocks.filter(b => b.type === 'figure').map(b => b.src))];
  for (const asset of assets) await record(articleDir, asset);
  const manifest = { version: 1, source: config.source, template: config.template, files, blockCount: parsed.blocks.length, selectedImages: assets, font: fontInfo };
  const html = `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=1456"><meta name="article-source-contract" content="1"><title>${escapeHtml(parsed.blocks[0].text)}</title>\n<style>@font-face{font-family:ArticleSubset;src:url(data:font/woff;base64,${font.toString('base64')}) format('woff');font-weight:100 900;font-display:block}\n${css}</style></head><body><main id="article-pages"></main>\n<script type="application/json" id="article-source">${json({ ...parsed, manifest })}</script>\n<script>${runtime.replace(/<\/script/gi, '<\\/script')}</script></body></html>\n`;
  const signedHtml = html.replace('</head>', `<meta name="article-render-sha256" content="${sha256(html)}"></head>`);
  return { html: signedHtml, manifest, parsed };
}

export async function verifyArticleSource(articleDir) {
  const html = await fs.readFile(path.join(articleDir, 'fixed_layout.html'), 'utf8');
  if (!await exists(path.join(articleDir, 'layout-source.json'))) {
    if (html.includes('name="article-source-contract"')) throw new Error('Generated article is missing layout-source.json.');
    return { status: 'legacy-untracked' };
  }
  const prepared = await prepareArticle(articleDir);
  if (html !== prepared.html) throw new Error('Stale fixed_layout.html: Markdown, selected assets, font or template changed. Run tools/sync_article_layout.mjs for this article.');
  return { status: 'verified', htmlSha256: sha256(html), ...prepared.manifest };
}
