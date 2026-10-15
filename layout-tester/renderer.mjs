import {MAX_PAGES, SIDES, inlineText, validateSettings} from './core.mjs';

// All printable styles live here. UI styles must never change descendants of .sheet.
export const PAGE_CSS = `
.sheet{position:relative;box-sizing:border-box;overflow:hidden;text-align:left;font-weight:400;font-style:normal;letter-spacing:normal;text-rendering:auto;font-kerning:auto}
.sheet *{box-sizing:border-box}
.sheet p,.sheet h1,.sheet h2,.sheet h3,.sheet h4,.sheet h5,.sheet h6,.sheet blockquote,.sheet figure,.sheet pre,.sheet ul,.sheet ol{margin:0;padding:0}
.sheet .page-content{display:flex;height:100%;align-items:stretch}
.sheet .flow{display:flex;flex-direction:column;flex:none;min-width:0;min-height:0;position:relative}
.sheet .block{flex:none;position:relative;overflow-wrap:anywhere;min-width:0}
.sheet .payload{min-width:0}
.sheet .quote-text{border-left:4px solid #88909c;padding-left:18px}
.sheet .image-frame{position:relative;overflow:hidden;width:100%;background:#f3f4f6}
.sheet .image-frame img{display:block;width:100%;height:100%;object-position:center}
.sheet figcaption{color:#525965}
.sheet ul,.sheet ol{padding-left:1.5em}
.sheet li{margin:0;padding:0}
.sheet code{font-family:monospace;background:#f0f1f3}
.sheet pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:monospace;background:#f0f1f3}
.sheet table{border-collapse:collapse;table-layout:fixed;width:100%;font:inherit}
.sheet td,.sheet th{border:1px solid #b8bec6;padding:8px;overflow-wrap:anywhere;text-align:left;vertical-align:top}
.sheet th{font-weight:700;background:#f0f1f3}
.sheet a{color:inherit;text-decoration:underline;pointer-events:none}
.sheet hr{margin:0;border:0;border-top:2px solid #b8bec6}
`;
export function installPageStyle() {
  if (!document.getElementById('printable-style')) {
    const style = document.createElement('style'); style.id = 'printable-style'; style.textContent = PAGE_CSS; document.head.append(style);
  }
}
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function appendInline(parent, tokens) {
  for (const t of tokens) {
    if (t.type === 'text') parent.append(document.createTextNode(t.text));
    else { const n = el(t.type); if (t.type === 'a') { n.href = t.href; n.tabIndex = -1; n.rel = 'noopener noreferrer'; } if (t.children) appendInline(n, t.children); else n.textContent = t.text; parent.append(n); }
  }
}
function graphemeOffsets(text) {
  if (!globalThis.Intl?.Segmenter) throw new Error('このブラウザはIntl.Segmenterに未対応です。現行のChrome/Edgeをご利用ください');
  return [...new Intl.Segmenter('ja', {granularity: 'grapheme'}).segment(text)].map(s => s.index).concat(text.length);
}
function rangeContents(root, from, to) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []; let p = 0, n;
  while ((n = walker.nextNode())) { nodes.push({node: n, from: p, to: p + n.length}); p += n.length; }
  if (!nodes.length) return document.createDocumentFragment();
  const at = pos => { const item = nodes.find(n => n.to >= pos) || nodes.at(-1); return [item.node, Math.max(0, Math.min(item.node.length, pos - item.from))]; };
  const r = document.createRange(); r.setStart(...at(from)); r.setEnd(...at(to)); return r.cloneContents();
}
function blockStyle(block, s, columnWidth) {
  const o = s.blocks[block.id] || {}, heading = block.type === 'heading';
  const fontSize = o.fontSize ?? (heading ? s.body.fontSize * Math.max(1.05, s.heading.scale - (block.level - 1) * .14) : s.body.fontSize);
  const lineHeight = o.lineHeight ?? (heading ? fontSize * s.heading.lineHeight : s.body.lineHeight * fontSize / s.body.fontSize);
  const margin = {top: 0, right: 0, bottom: heading ? s.heading.gap : s.body.paragraphGap, left: 0, ...o.margin};
  const padding = {top: 0, right: 0, bottom: 0, left: 0, ...o.padding};
  return {fontSize, lineHeight, margin, padding, width: o.width ?? Math.max(1, columnWidth - margin.left - margin.right), imageHeight: o.imageHeight ?? s.image.height};
}
function makeBlock(b, s, width, assets) {
  const node = el('div', 'block'); node.dataset.blockId = b.id; node.dataset.kind = b.type; node.dataset.line = b.line;
  const bs = blockStyle(b, s, width);
  Object.assign(node.style, {width: `${bs.width}px`, fontSize: `${bs.fontSize}px`, lineHeight: `${bs.lineHeight}px`});
  for (const edge of SIDES) { node.style[`margin-${edge}`] = `${bs.margin[edge]}px`; node.style[`padding-${edge}`] = `${bs.padding[edge]}px`; }
  let payload;
  if (b.type === 'heading' || b.type === 'p' || b.type === 'quote') {
    payload = el(b.type === 'heading' ? `h${b.level}` : b.type === 'quote' ? 'blockquote' : 'p', 'payload');
    if (b.type === 'heading') Object.assign(payload.style, {fontSize: 'inherit', lineHeight: 'inherit', fontWeight: '700'});
    if (b.type === 'quote') payload.classList.add('quote-text'); appendInline(payload, b.tokens);
  } else if (b.type === 'code') { payload = el('pre', 'payload', b.text); }
  else if (b.type === 'image') {
    payload = el('figure', 'payload'); const frame = el('div', 'image-frame'), img = el('img');
    const a = assets.get(b.src); img.src = a.dataURL; img.alt = b.alt; img.style.objectFit = s.image.fit;
    frame.style.height = `${bs.imageHeight}px`; frame.append(img); payload.append(frame);
    if (b.caption) { const cap = el('figcaption', '', b.caption); Object.assign(cap.style, {fontSize: `${s.image.captionSize}px`, lineHeight: '1.5', marginTop: `${s.image.captionGap}px`}); payload.append(cap); }
  } else if (b.type === 'list') {
    payload = el(b.ordered ? 'ol' : 'ul', 'payload'); if (b.ordered) payload.start = b.first;
    for (const t of b.items) { const li = el('li'); appendInline(li, t); payload.append(li); }
  } else if (b.type === 'table') {
    payload = el('table', 'payload'); const head = el('thead'), body = el('tbody');
    for (const [idx, row] of [b.header, ...b.rows].entries()) { const tr = el('tr'); for (const [column, c] of row.entries()) { const td = el(idx === 0 ? 'th' : 'td'); td.style.textAlign = b.align[column]; appendInline(td, c); tr.append(td); } (idx === 0 ? head : body).append(tr); }
    payload.append(head, body);
  } else payload = el('hr', 'payload');
  node.append(payload); return node;
}
const round = n => Math.round(n * 100) / 100;
export function rectInPage(node, sheet) {
  const a = node.getBoundingClientRect(), b = sheet.getBoundingClientRect(), scale = b.width / sheet.offsetWidth;
  return {x: round((a.left - b.left) / scale), y: round((a.top - b.top) / scale), width: round(a.width / scale), height: round(a.height / scale)};
}
const bottom = r => r.y + r.height;
const right = r => r.x + r.width;
export function measure(pages) {
  return pages.flatMap((sheet, pageIndex) => [...sheet.querySelectorAll('.flow > .block')].map(node => {
    const r = rectInPage(node, sheet), style = getComputedStyle(node), margin = {}, padding = {};
    for (const k of SIDES) { margin[k] = parseFloat(style[`margin-${k}`]); padding[k] = parseFloat(style[`padding-${k}`]); }
    const flow = node.parentElement, f = rectInPage(flow, sheet), prev = node.previousElementSibling, next = node.nextElementSibling;
    const item = {id: node.dataset.blockId, part: Number(node.dataset.part || 1), kind: node.dataset.kind, page: pageIndex + 1, column: Number(flow.dataset.column), ...r, margin, padding,
      edges: {top: r.y, right: round(sheet.offsetWidth - right(r)), bottom: round(sheet.offsetHeight - bottom(r)), left: r.x},
      gapBefore: round(r.y - (prev ? bottom(rectInPage(prev, sheet)) : f.y)), gapAfter: round((next ? rectInPage(next, sheet).y : bottom(f)) - bottom(r)),
      from: Number(node.dataset.from || 0), to: Number(node.dataset.to || 0), text: node.querySelector('.payload').textContent};
    const img = node.querySelector('img');
    if (img) {
      const frame = rectInPage(img.parentElement, sheet), fit = img.style.objectFit;
      const ratio = (fit === 'cover' ? Math.max : Math.min)(frame.width / img.naturalWidth, frame.height / img.naturalHeight);
      const w = img.naturalWidth * ratio, h = img.naturalHeight * ratio;
      item.image = {sourceWidth: img.naturalWidth, sourceHeight: img.naturalHeight, fit, frame,
        scaled: {x: round(frame.x + (frame.width - w) / 2), y: round(frame.y + (frame.height - h) / 2), width: round(w), height: round(h)},
        visible: {x: round(frame.x + Math.max(0, (frame.width - w) / 2)), y: round(frame.y + Math.max(0, (frame.height - h) / 2)), width: round(Math.min(w, frame.width)), height: round(Math.min(h, frame.height))}};
    }
    return item;
  }));
}
export async function compose(parsed, settings, host, resolveAsset, alive = () => true) {
  const s = validateSettings(structuredClone(settings)); installPageStyle();
  const assets = new Map();
  for (const src of new Set(parsed.blocks.filter(b => b.type === 'image').map(b => b.src))) assets.set(src, await resolveAsset(src));
  if (!alive()) throw new Error('組版が更新されました');
  const p = s.page.padding, width = (s.page.width - p.left - p.right - s.page.columnGap * (s.page.columns - 1)) / s.page.columns;
  const diagnostics = parsed.warnings.map(message => ({level: 'warning', message}));
  for (const id of Object.keys(s.blocks)) if (!parsed.blocks.some(b => b.id === id)) diagnostics.push({level: 'warning', message: `未適用の個別設定: ${id}（原稿改稿・取り違えを確認）`});
  const pages = []; let flows = [], column = 0, flow;
  function newPage() {
    if (pages.length >= MAX_PAGES) throw new Error(`ページ数が上限${MAX_PAGES}を超えました`);
    const page = el('article', 'sheet');
    Object.assign(page.style, {width: `${s.page.width}px`, height: `${s.page.height}px`, padding: `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`, background: s.page.background, color: s.body.color, fontFamily: s.body.fontFamily, fontSize: `${s.body.fontSize}px`, lineHeight: `${s.body.lineHeight}px`});
    const content = el('div', 'page-content'); content.style.gap = `${s.page.columnGap}px`; page.append(content); host.append(page); pages.push(page);
    flows = Array.from({length: s.page.columns}, (_, i) => { const n = el('section', 'flow'); n.style.width = `${width}px`; n.dataset.column = i + 1; content.append(n); return n; }); column = 0; flow = flows[0];
  }
  function advance(forcePage = false) { if (forcePage || column + 1 === flows.length) newPage(); else flow = flows[++column]; }
  newPage();
  // Attach all prototypes before waiting, so the browser resolves every font and image in use.
  const probe = el('div'); Object.assign(probe.style, {position: 'absolute', width: `${width}px`, visibility: 'hidden'}); host.append(probe);
  const prototypes = new Map();
  for (const b of parsed.blocks.filter(b => b.type !== 'break')) { const n = makeBlock(b, s, width, assets); probe.append(n); prototypes.set(b.id, n); }
  try {
    await Promise.all([...probe.querySelectorAll('img')].map(img => img.decode()));
    await document.fonts.ready;
  } finally { probe.remove(); }
  const fits = n => n.getBoundingClientRect().bottom + parseFloat(n.style.marginBottom) <= flow.getBoundingClientRect().bottom + .15;
  const height = n => n.getBoundingClientRect().height + parseFloat(n.style.marginTop) + parseFloat(n.style.marginBottom);
  const error = (b, message) => diagnostics.push({level: 'error', id: b.id, message: `${b.line}行 ${b.id}: ${message}`});
  const clonePart = (original, from, to, part) => {
    const n = original.cloneNode(true), payload = n.querySelector('.payload');
    payload.replaceChildren(rangeContents(original.querySelector('.payload'), from, to));
    n.dataset.from = from; n.dataset.to = to; n.dataset.part = part; return n;
  };
  for (let bi = 0; bi < parsed.blocks.length; bi++) {
    if (!alive()) throw new Error('組版が更新されました');
    const b = parsed.blocks[bi];
    if (b.type === 'break' || s.blocks[b.id]?.breakBefore) {
      if (flows.some(f => f.children.length)) advance(true);
      if (b.type === 'break') continue;
    }
    const original = prototypes.get(b.id), text = original.querySelector('.payload').textContent;
    let node = original.cloneNode(true); node.dataset.from = 0; node.dataset.to = text.length; node.dataset.part = 1;
    // Keep consecutive headings together with the first visible line (or next atomic block).
    if (b.type === 'heading' && flow.children.length) {
      const probes = [node]; flow.append(node);
      for (let j = bi + 1; j < parsed.blocks.length; j++) {
        const next = parsed.blocks[j]; if (next.type === 'break' || s.blocks[next.id]?.breakBefore) break;
        const proto = prototypes.get(next.id); let candidate;
        if (['p', 'quote', 'code'].includes(next.type)) { const offsets = graphemeOffsets(proto.querySelector('.payload').textContent); candidate = clonePart(proto, 0, offsets[Math.min(2, offsets.length - 1)], 1); }
        else candidate = proto.cloneNode(true);
        flow.append(candidate); probes.push(candidate); if (next.type !== 'heading') break;
      }
      const ok = fits(probes.at(-1)); probes.forEach(n => n.remove()); if (!ok) advance();
    }
    flow.append(node);
    if (fits(node)) continue;
    const fullHeight = height(node); node.remove();
    if (fullHeight <= flow.clientHeight + .15) { if (flow.children.length) advance(); flow.append(node); continue; }
    if (!['p', 'quote', 'code'].includes(b.type) || !text.length) {
      if (flow.children.length) advance(); flow.append(node); error(b, '分割できないブロックが段の高さを超えています。画像高・幅・文字等を調整してください'); continue;
    }
    const offsets = graphemeOffsets(text); let start = 0, part = 1;
    while (start < offsets.length - 1) {
      let lo = start, hi = offsets.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2), probePart = clonePart(original, offsets[start], offsets[mid], part); flow.append(probePart);
        const ok = fits(probePart); probePart.remove(); if (ok) lo = mid; else hi = mid - 1;
      }
      if (lo === start) {
        if (flow.children.length) { advance(); continue; }
        node = clonePart(original, offsets[start], text.length, part); flow.append(node); error(b, '1文字も収まりません。padding・行高・幅を調整してください'); break;
      }
      flow.append(clonePart(original, offsets[start], offsets[lo], part++)); start = lo;
      if (start < offsets.length - 1) advance();
    }
    if (bi % 8 === 0) await new Promise(r => setTimeout(r, 0));
  }
  // Explicit trailing pagebreak must not invent an empty exported page.
  while (pages.length > 1 && !pages.at(-1).querySelector('.block')) pages.pop().remove();
  const measurements = measure(pages);
  for (const [pageIndex, sheet] of pages.entries()) for (const f of sheet.querySelectorAll('.flow')) {
    const fr = rectInPage(f, sheet); let previousBottom = fr.y;
    for (const n of f.children) {
      const r = rectInPage(n, sheet), b = parsed.blocks.find(b => b.id === n.dataset.blockId);
      if (r.x < fr.x - .5 || r.y < fr.y - .5 || right(r) > right(fr) + .5 || bottom(r) + parseFloat(n.style.marginBottom) > bottom(fr) + .5) error(b, `p${pageIndex + 1}: 本文領域のはみ出し`);
      if (r.y < previousBottom - .5) error(b, `p${pageIndex + 1}: ブロックの重なり`); previousBottom = bottom(r);
      // Check text line boxes against the block's inner box, not scrollHeight alone.
      const payload = n.querySelector('.payload'), nr = n.getBoundingClientRect(), walker = document.createTreeWalker(payload, NodeFilter.SHOW_TEXT); let t;
      while ((t = walker.nextNode())) {
        if (!t.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(t);
        if ([...range.getClientRects()].some(x => x.left < nr.left - 1 || x.right > nr.right + 1 || x.top < nr.top - 2 || x.bottom > nr.bottom + 2)) { error(b, `p${pageIndex + 1}: 文字行のはみ出し`); break; }
      }
    }
  }
  for (const b of parsed.blocks.filter(b => ['p', 'quote', 'code'].includes(b.type))) {
    const originalText = b.type === 'code' ? b.text : inlineText(b.tokens), pieces = measurements.filter(m => m.id === b.id);
    let offset = 0;
    for (const piece of pieces) { if (piece.from !== offset) error(b, '分割範囲が不連続です'); offset = piece.to; }
    if (offset !== originalText.length || pieces.map(m => m.text).join('') !== originalText) error(b, '本文の分割保存性検査に失敗しました');
  }
  return {pages, measurements, diagnostics, settings: s, blocks: parsed.blocks};
}
export function showGuides(result, enabled, selectedId) {
  for (const sheet of result.pages) sheet.querySelectorAll('[data-guide]').forEach(n => n.remove());
  if (!enabled) return;
  const rect = (layer, box, color, fill = 'transparent', label = '') => {
    const n = el('div'); Object.assign(n.style, {position: 'absolute', left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px`, border: `2px solid ${color}`, background: fill, boxSizing: 'border-box'});
    if (label) { const l = el('span', '', label); Object.assign(l.style, {position: 'absolute', left: '0', top: '0', color: '#ffffff', background: color, padding: '2px 7px', font: '20px sans-serif', whiteSpace: 'nowrap'}); n.append(l); } layer.append(n);
  };
  result.pages.forEach((sheet, i) => {
    const layer = el('div'); layer.dataset.guide = ''; Object.assign(layer.style, {position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '100'}); sheet.append(layer);
    const p = result.settings.page.padding, w = sheet.offsetWidth, h = sheet.offsetHeight;
    for (const box of [{x: 0,y: 0,width: w,height: p.top},{x: 0,y: h-p.bottom,width:w,height:p.bottom},{x:0,y:p.top,width:p.left,height:h-p.top-p.bottom},{x:w-p.right,y:p.top,width:p.right,height:h-p.top-p.bottom}]) rect(layer,box,'#c79a40','#e7b95822');
    for (const flow of sheet.querySelectorAll('.flow')) rect(layer, rectInPage(flow, sheet), '#5d809e');
    for (const m of result.measurements.filter(m => m.page === i + 1)) {
      const selected = m.id === selectedId;
      if (selected) {
        rect(layer, {x: m.x - m.margin.left, y: m.y - m.margin.top, width: m.width + m.margin.left + m.margin.right, height: m.height + m.margin.top + m.margin.bottom}, '#dd9841', '#dd984126');
        rect(layer, {x: m.x + m.padding.left, y: m.y + m.padding.top, width: Math.max(0,m.width-m.padding.left-m.padding.right), height: Math.max(0,m.height-m.padding.top-m.padding.bottom)}, '#19a080', '#19a08012');
      }
      rect(layer, m, selected ? '#315dde' : '#7391b5', 'transparent', selected ? `${m.width} × ${m.height} px` : '');
      if (selected && m.image) rect(layer, m.image.visible, '#ae438b', 'transparent', `画像 ${m.image.visible.width} × ${m.image.visible.height}`);
    }
  });
}
