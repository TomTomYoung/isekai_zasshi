// Browser copy of the production parseArticle() function.
// tests/layout-tester/unit.mjs compares its output with tools/article_source.mjs on the real article.
// Keep this file browser-safe: no node:* imports.
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
