/** Pure, dependency-free Markdown dialect, settings validation and ZIP utilities. */
export const SIDES = ['top', 'right', 'bottom', 'left'];
export const MAX_PAGES = 80;
export function fail(line, reason) { throw new Error(`原稿 ${line}行: ${reason}`); }
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const number = (v, lo, hi, label, integer = false) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi || (integer && !Number.isInteger(v))) {
    throw new Error(`${label}: ${lo}〜${hi}の${integer ? '整数' : '数値'}が必要です`);
  }
};
function keys(o, allowed, label) {
  if (!isObject(o)) throw new Error(`${label}: オブジェクトが必要です`);
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`${label}.${k}: 未対応の設定です`);
}
function edges(o, label) {
  keys(o, SIDES, label);
  for (const k of Object.keys(o)) number(o[k], 0, 2000, `${label}.${k}`);
}
export function validateSettings(s) {
  keys(s, ['version', 'page', 'body', 'heading', 'image', 'export', 'blocks'], '設定');
  if (s.version !== 1) throw new Error('設定versionは1のみ対応しています');
  keys(s.page, ['width', 'height', 'padding', 'columns', 'columnGap', 'background'], 'page');
  number(s.page.width, 240, 6000, 'page.width', true); number(s.page.height, 240, 6000, 'page.height', true);
  number(s.page.columns, 1, 3, 'page.columns', true); number(s.page.columnGap, 0, 1000, 'page.columnGap');
  edges(s.page.padding, 'page.padding');
  for (const k of SIDES) if (!own(s.page.padding, k)) throw new Error(`page.padding.${k}: 必須です`);
  keys(s.body, ['fontFamily', 'fontSize', 'lineHeight', 'paragraphGap', 'color'], 'body');
  if (typeof s.body.fontFamily !== 'string' || !s.body.fontFamily.trim() || s.body.fontFamily.length > 300 || /[;{}<>\\]/.test(s.body.fontFamily)) throw new Error('body.fontFamily: 無効なフォント指定です');
  number(s.body.fontSize, 6, 200, 'body.fontSize'); number(s.body.lineHeight, s.body.fontSize, 400, 'body.lineHeight');
  number(s.body.paragraphGap, 0, 1000, 'body.paragraphGap');
  for (const [label, value] of [['body.color', s.body.color], ['page.background', s.page.background]]) {
    if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value)) throw new Error(`${label}: #RRGGBB形式が必要です`);
  }
  keys(s.heading, ['scale', 'lineHeight', 'gap'], 'heading');
  number(s.heading.scale, 1, 4, 'heading.scale'); number(s.heading.lineHeight, 1, 3, 'heading.lineHeight'); number(s.heading.gap, 0, 1000, 'heading.gap');
  keys(s.image, ['height', 'fit', 'captionSize', 'captionGap'], 'image');
  number(s.image.height, 1, 6000, 'image.height'); number(s.image.captionSize, 6, 200, 'image.captionSize'); number(s.image.captionGap, 0, 1000, 'image.captionGap');
  if (!['contain', 'cover'].includes(s.image.fit)) throw new Error('image.fit: containまたはcoverを指定してください');
  keys(s.export, ['scale'], 'export'); number(s.export.scale, 1, 3, 'export.scale', true);
  if (s.page.width * s.page.height * s.export.scale ** 2 > 32000000 || Math.max(s.page.width, s.page.height) * s.export.scale > 12000) throw new Error('PNG出力が上限（3200万画素／一辺12000px）を超えています');
  const p = s.page.padding;
  if ((s.page.width - p.left - p.right - s.page.columnGap * (s.page.columns - 1)) / s.page.columns < 80 || s.page.height - p.top - p.bottom < 80) throw new Error('余白・段間が大きすぎて本文領域が残りません');
  if (!isObject(s.blocks)) throw new Error('blocks: オブジェクトが必要です');
  for (const [id, b] of Object.entries(s.blocks)) {
    if (!/^[A-Za-z][\w-]{0,100}$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error(`無効なブロックID: ${id}`);
    keys(b, ['width', 'fontSize', 'lineHeight', 'margin', 'padding', 'imageHeight', 'breakBefore'], `blocks.${id}`);
    for (const k of ['width', 'fontSize', 'lineHeight', 'imageHeight']) if (own(b, k)) number(b[k], 1, k === 'fontSize' ? 200 : 6000, `${id}.${k}`);
    for (const k of ['margin', 'padding']) if (own(b, k)) edges(b[k], `${id}.${k}`);
    if (own(b, 'breakBefore') && typeof b.breakBefore !== 'boolean') throw new Error(`${id}.breakBefore: 真偽値が必要です`);
    if (b.lineHeight !== undefined && b.fontSize !== undefined && b.lineHeight < b.fontSize) throw new Error(`${id}: 行高は文字サイズ以上にしてください`);
  }
  return s;
}
/** Merge only known keys; JSON must not silently introduce executable CSS or unknown fields. */
export function mergeSettings(defaults, input = {}) {
  const merge = (a, b, at) => {
    if (!isObject(b)) throw new Error(`${at}: オブジェクトが必要です`);
    const out = structuredClone(a);
    for (const [k, v] of Object.entries(b)) {
      if (!own(a, k)) throw new Error(`${at}.${k}: 未対応の設定です`);
      out[k] = k === 'blocks' ? structuredClone(v) : isObject(a[k]) ? merge(a[k], v, `${at}.${k}`) : structuredClone(v);
    }
    return out;
  };
  return validateSettings(merge(defaults, input, '設定'));
}
export function stableHash(value) {
  let h = 0xcbf29ce484222325n;
  for (const c of new TextEncoder().encode(value)) h = BigInt.asUintN(64, (h ^ BigInt(c)) * 0x100000001b3n);
  return h.toString(16).padStart(16, '0');
}
export function assetPath(value) {
  let p;
  try { p = decodeURIComponent(value).replace(/\\/g, '/'); } catch { throw new Error(`画像パスの符号化が不正です: ${value}`); }
  if (/^[a-z][\w+.-]*:|^[\/]|[\x00-\x1f?#]/i.test(p)) throw new Error(`画像は記事内の相対パスで指定してください: ${value}`);
  const out = [];
  for (const bit of p.split('/')) {
    if (!bit || bit === '.') continue;
    if (bit === '..') { if (!out.length) throw new Error(`画像パスが記事フォルダー外です: ${value}`); out.pop(); }
    else out.push(bit);
  }
  p = out.join('/');
  if (!/\.(png|jpe?g|webp)$/i.test(p)) throw new Error(`画像はPNG/JPEG/WebPのみ対応しています: ${value}`);
  return p;
}
function safeLink(url, line) {
  if (/^(https?:\/\/|mailto:|#)/i.test(url) && !/[\x00-\x20<>"']/u.test(url)) return url;
  fail(line, 'リンクはhttp(s)・mailto・#のみ対応しています');
}
/** An explicit subset, not a CommonMark implementation. No raw HTML reaches innerHTML. */
export function inline(text, line = 1, depth = 0) {
  if (depth > 8) fail(line, 'インライン記法の入れ子が深すぎます');
  const tokens = []; let plain = '';
  const flush = () => { if (plain) tokens.push({type: 'text', text: plain}); plain = ''; };
  for (let i = 0; i < text.length;) {
    const tail = text.slice(i);
    if (tail[0] === '\\' && tail.length > 1) { plain += tail[1]; i += 2; continue; }
    if (tail[0] === '`') {
      const end = text.indexOf('`', i + 1); if (end < 0) fail(line, 'インラインコードが閉じていません');
      flush(); tokens.push({type: 'code', text: text.slice(i + 1, end)}); i = end + 1; continue;
    }
    const marker = tail.startsWith('**') ? '**' : tail.startsWith('*') ? '*' : null;
    if (marker) {
      const end = text.indexOf(marker, i + marker.length); if (end < 0) fail(line, '強調記法が閉じていません');
      flush(); tokens.push({type: marker === '**' ? 'strong' : 'em', children: inline(text.slice(i + marker.length, end), line, depth + 1)}); i = end + marker.length; continue;
    }
    if (tail.startsWith('![')) fail(line, '画像は独立した行に置いてください');
    if (tail[0] === '[') {
      const m = tail.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)/);
      if (!m) fail(line, '未対応または壊れたリンク記法です');
      flush(); tokens.push({type: 'a', href: safeLink(m[2], line), children: inline(m[1], line, depth + 1)}); i += m[0].length; continue;
    }
    if (/^<\/?[A-Za-z!]/.test(tail) || tail.startsWith('~~') || tail.startsWith('__') || tail[0] === '_') fail(line, '未対応のHTML／インライン記法です（文字として使う場合はバックスラッシュでエスケープ）');
    plain += tail[0]; i++;
  }
  flush(); return tokens;
}
export const inlineText = tokens => tokens.map(t => t.children ? inlineText(t.children) : t.text).join('');
export function parseMarkdown(markdown) {
  if (typeof markdown !== 'string' || markdown.length > 300000) throw new Error('原稿は30万文字以下にしてください');
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [], warnings = [], counts = new Map(), used = new Set(); let pending = null;
  const add = (b, line) => {
    const hash = `auto-${stableHash(JSON.stringify(b))}`, n = (counts.get(hash) || 0) + 1;
    counts.set(hash, n);
    const id = pending || `${hash}${n > 1 ? `-${n}` : ''}`;
    if (used.has(id)) fail(line, `ブロックIDが重複しています: ${id}`);
    if (!pending && n > 1) warnings.push(`${line}行: 同じ内容のブロックがあります。個別調整には固定IDを推奨します。`);
    used.add(id); pending = null; blocks.push({...b, id, line});
  };
  const splitCells = (s, line) => {
    if (!s.trim().endsWith('|')) fail(line, '表の末尾に | が必要です');
    if (s.includes('\\|')) fail(line, '表内のエスケープされた | は未対応です');
    return s.trim().slice(1, -1).split('|').map(c => inline(c.trim(), line));
  };
  const isStart = s => /^(?:#{1,6}\s|>|[-+]\s|\d+[.)]\s|```|~~~|!\[|\||<|---\s*$|\*\*\*\s*$)/.test(s.trim());
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim(), start = i + 1;
    if (!line) { i++; continue; }
    const id = line.match(/^<!--\s*block:([A-Za-z][\w-]{0,100})\s*-->$/);
    if (id) { if (['constructor', 'prototype', '__proto__'].includes(id[1])) fail(start, '予約されたIDです'); if (pending) fail(start, 'IDの直後に本文ブロックが必要です'); pending = id[1]; i++; continue; }
    if (line === '<!-- pagebreak -->') { add({type: 'break'}, start); i++; continue; }
    if (/^---$|^\*\*\*$/.test(line)) { add({type: 'hr'}, start); i++; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { add({type: 'heading', level: heading[1].length, tokens: inline(heading[2], start)}, start); i++; continue; }
    const fence = line.match(/^(```|~~~)([\w+-]*)\s*$/);
    if (fence) {
      const text = []; i++;
      while (i < lines.length && lines[i].trim() !== fence[1]) text.push(lines[i++]);
      if (i >= lines.length) fail(start, 'コードフェンスが閉じていません');
      add({type: 'code', text: text.join('\n'), language: fence[2]}, start); i++; continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"([^"]*)")?\)$/);
    if (image) { add({type: 'image', src: assetPath(image[2] || image[3]), alt: image[1], caption: image[4] || ''}, start); i++; continue; }
    if (line === '<figure>') {
      const raw = [];
      while (i < lines.length && lines[i].trim() !== '</figure>') raw.push(lines[i++].trim());
      if (i === lines.length) fail(start, 'figureが閉じていません'); raw.push(lines[i++].trim());
      const m = raw.join('\n').match(/^<figure>\s*<img\s+src="([^"<>]+)"\s+alt="([^"<>]*)"\s*\/?>\s*<figcaption>([^<>]*)<\/figcaption>\s*<\/figure>$/);
      if (!m) fail(start, 'figureはimg src/altと平文figcaptionの構造に限定しています');
      add({type: 'image', src: assetPath(m[1]), alt: m[2], caption: m[3]}, start); continue;
    }
    if (line.startsWith('|')) {
      const header = splitCells(lines[i++], start);
      const sep = lines[i++]?.trim();
      if (!sep || !/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(sep) || sep.slice(1, -1).split('|').length !== header.length) fail(start, '表の区切り行が不正です');
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { const row = splitCells(lines[i], i + 1); if (row.length !== header.length) fail(i + 1, '表の列数が一致しません'); rows.push(row); i++; }
      const align = sep.slice(1, -1).split('|').map(c => c.trim().endsWith(':') ? (c.trim().startsWith(':') ? 'center' : 'right') : 'left');
      add({type: 'table', header, rows, align}, start); continue;
    }
    if (/^[-+]\s|^\d+[.)]\s/.test(line)) {
      const ordered = /^\d/.test(line), items = [], first = Number(line.match(/^\d+/)?.[0] || 1);
      while (i < lines.length && /^\s*(?:[-+]|\d+[.)])\s/.test(lines[i])) {
        if (/^\s/.test(lines[i]) || /^\d/.test(lines[i]) !== ordered) fail(i + 1, '入れ子／混在リストは未対応です');
        const value = lines[i].replace(/^(?:[-+]|\d+[.)])\s+/, '');
        if (/^\[[ xX]\]/.test(value)) fail(i + 1, 'タスクリストは未対応です');
        items.push(inline(value, i + 1)); i++;
      }
      add({type: 'list', ordered, first, items}, start); continue;
    }
    if (/^>/.test(line)) {
      const texts = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { texts.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      if (texts.some(t => /^>|^#|^[-+]\s/.test(t))) fail(start, '引用内の入れ子ブロックは未対応です');
      add({type: 'quote', tokens: inline(texts.join('\n'), start)}, start); continue;
    }
    if (/^\s{4}|^\t/.test(lines[i]) || /^[<#~`!|]/.test(line) || /^\*\s/.test(line)) fail(start, '未対応または壊れたブロック記法です');
    const text = [lines[i++].trim()];
    while (i < lines.length && lines[i].trim() && !isStart(lines[i])) {
      if (/^\s{2,}|^\t/.test(lines[i])) fail(i + 1, '字下げ／リスト継続は未対応です');
      text.push(lines[i++].trim());
    }
    add({type: 'p', tokens: inline(text.join('\n'), start)}, start);
  }
  if (pending) fail(lines.length, 'IDの後に本文がありません');
  if (!blocks.some(b => b.type !== 'break')) throw new Error('原稿に本文がありません');
  return {blocks, warnings};
}
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const v of bytes) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
/** Store-only ZIP: PNG is already compressed; no additional library or CDN required. */
export function makeZip(files) {
  const chunks = [], directory = []; let offset = 0;
  const header = size => { const b = new Uint8Array(size); return [b, new DataView(b.buffer)]; };
  for (const {name, bytes} of files) {
    const n = new TextEncoder().encode(name), crc = crc32(bytes);
    const [h, d] = header(30); d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true); d.setUint16(6, 0x800, true); d.setUint16(12, 33, true);
    d.setUint32(14, crc, true); d.setUint32(18, bytes.length, true); d.setUint32(22, bytes.length, true); d.setUint16(26, n.length, true);
    const [c, v] = header(46); v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x800, true); v.setUint16(14, 33, true);
    v.setUint32(16, crc, true); v.setUint32(20, bytes.length, true); v.setUint32(24, bytes.length, true); v.setUint16(28, n.length, true); v.setUint32(42, offset, true);
    chunks.push(h, n, bytes); directory.push(c, n); offset += h.length + n.length + bytes.length;
  }
  const size = directory.reduce((n, b) => n + b.length, 0), [end, d] = header(22);
  d.setUint32(0, 0x06054b50, true); d.setUint16(8, files.length, true); d.setUint16(10, files.length, true); d.setUint32(12, size, true); d.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], {type: 'application/zip'});
}
