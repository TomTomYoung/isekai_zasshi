import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const escapeHtml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const exists = file => fs.access(file).then(() => true, () => false);

// Deliberately restricted dialect: unsupported notation fails with a line number.
// No general-purpose HTML is executed and no unrecognized source is discarded.
export function parseArticle(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const fail = (i, why) => { throw new Error(`Markdown line ${i + 1}: ${why}`); };
  const plain = (text, i) => {
    if (/[<>&*_`\[\]\\]/.test(text) || /^\s*(?:[-+]|\d+[.)])\s|^\s*[-=]{3,}\s*$/.test(text)) {
      fail(i, 'unsupported markup; extend the constrained parser explicitly before publishing.');
    }
    return text;
  };
  const add = block => blocks.push({ id: `b${String(blocks.length + 1).padStart(3, '0')}`, ...block });
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line === '<figure>') {
      const start = i, figure = [];
      while (i < lines.length && lines[i].trim() !== '</figure>') figure.push(lines[i++].trim());
      if (i === lines.length) fail(start, 'unclosed figure');
      figure.push(lines[i++].trim());
      const match = figure.join('\n').match(/^<figure>\n<img src="(\.\/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp))" alt="([^"<>]*)">\n<figcaption>([^<>]*)<\/figcaption>\n<\/figure>$/);
      if (!match) fail(start, 'expected one selected local image and a plain caption');
      add({ type: 'figure', src: match[1], alt: plain(match[2], start), caption: plain(match[3], start) });
      continue;
    }
    if (line.startsWith('|')) {
      const start = i;
      const cells = row => row.trim().slice(1, -1).split('|').map(c => plain(c.trim(), start));
      if (!line.endsWith('|')) fail(i, 'table requires closing pipes');
      const header = cells(lines[i++]);
      const separator = lines[i++]?.trim();
      if (!separator || !/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(separator) || separator.slice(1, -1).split('|').length !== header.length) fail(start, 'invalid table separator');
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!lines[i].trim().endsWith('|')) fail(i, 'table requires closing pipes');
        const row = cells(lines[i++]);
        if (row.length !== header.length) fail(i - 1, 'inconsistent table column count');
        rows.push(row);
      }
      if (!rows.length) fail(start, 'empty table');
      add({ type: 'table', header, rows });
      continue;
    }
    const heading = line.match(/^(#{1,3}) (.+)$/);
    if (heading) { add({ type: `h${heading[1].length}`, text: plain(heading[2], i) }); i++; continue; }
    const quote = line.startsWith('> ');
    const start = i, paragraph = [];
    while (i < lines.length && lines[i].trim()) {
      const value = lines[i].trim();
      if (paragraph.length && /^(?:#|<|\||>)/.test(value)) break;
      if (quote !== value.startsWith('> ')) break;
      if (!quote && /^[#<>|]/.test(value)) fail(i, 'unsupported block');
      paragraph.push(plain(quote ? value.slice(2) : value, i)); i++;
    }
    if (!paragraph.length) fail(start, 'unsupported block');
    add({ type: quote ? 'quote' : 'p', text: paragraph.join('\n') });
  }
  if (blocks[0]?.type !== 'h1' || blocks[1]?.type !== 'h2') throw new Error('Expected article title followed by subtitle.');
  const groups = [];
  for (const [index, block] of blocks.entries()) {
    if (!groups.length || (block.type === 'h2' && index > 1)) groups.push([]);
    groups.at(-1).push(block);
  }
  for (const group of groups) {
    if (group.filter(b => b.type === 'figure').length !== 1) throw new Error(`Section ${group[0].id} must have exactly one selected figure; no image is inferred.`);
  }
  return { blocks, groups };
}

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
