(() => {
  'use strict';
  const source = JSON.parse(document.getElementById('article-source').textContent);
  const root = document.getElementById('article-pages');
  window.__articleComposition = { status: 'pending' };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function render(block, start = 0, end) {
    let node;
    if (block.type === 'table') {
      end ??= block.rows.length;
      node = el('table');
      const head = node.createTHead().insertRow();
      block.header.forEach(value => head.append(el('th', '', value)));
      const body = node.createTBody();
      block.rows.slice(start, end).forEach(values => {
        const row = body.insertRow();
        values.forEach(value => row.append(el('td', '', value)));
      });
    } else {
      end ??= [...block.text].length;
      node = el(block.type === 'quote' ? 'blockquote' : block.type, '', [...block.text].slice(start, end).join(''));
    }
    node.dataset.source = block.id;
    node.dataset.start = start;
    node.dataset.end = end;
    return node;
  }

  const area = node => {
    const r = node.getBoundingClientRect();
    return r.width * r.height;
  };

  function metrics(page) {
    const image = page.querySelector('img');
    let imageArea = 0;
    if (image && image.naturalWidth && image.naturalHeight) {
      const box = image.getBoundingClientRect();
      const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
      imageArea = image.naturalWidth * image.naturalHeight * scale * scale;
    }
    const textArea = [...page.querySelectorAll('.running-head,.folio,figcaption,.article-lead > *,.article-body > *')]
      .reduce((sum, node) => sum + area(node), 0);
    const body = page.querySelector('.article-body');
    const children = [...body.children];
    const bottom = children.length
      ? children.at(-1).getBoundingClientRect().bottom - page.getBoundingClientRect().top
      : 0;
    return {
      imageArea,
      textArea,
      imageToText: imageArea / Math.max(1, textArea),
      bottom
    };
  }

  function fits(page) {
    const m = metrics(page);
    const packedFirstPage = page.dataset.packFirstPage === 'true';
    return m.bottom <= 1936 && (packedFirstPage || !page.querySelector('img') || m.imageArea > m.textArea);
  }

  let pageNumber = 0;

  function newPage(figure, image, repeated, leadBlocks = []) {
    const page = el('section', 'fixed-page');
    const head = el('header', 'running-head');
    head.append(
      el('span', '', '異世界丸見え実話'),
      el('span', '', '2026 / 04　現地取材')
    );
    const lead = leadBlocks.length ? el('div', 'article-lead') : null;
    if (lead) lead.append(...leadBlocks.map(block => render(block)));
    const body = el('div', 'article-body');
    const folio = el('footer', 'folio', String(++pageNumber).padStart(3, '0'));
    if (leadBlocks.length && source.testerSettings?.magazine?.packFirstPage) {
      page.dataset.packFirstPage = 'true';
    }

    const parts = [head];
    if (lead) parts.push(lead);
    if (figure && image) {
      const scene = el('figure', 'scene' + (image.naturalHeight > image.naturalWidth ? ' portrait' : ''));
      scene.dataset.figure = figure.id;
      scene.dataset.repeated = String(repeated);
      const img = image.cloneNode();
      img.className = 'scene-image';
      scene.append(img, el('figcaption', '', figure.caption));
      parts.push(scene);
    } else {
      page.dataset.textOnly = 'true';
    }
    parts.push(body, folio);
    page.append(...parts);

    root.append(page);
    return { page, body };
  }

  function candidate(context, headings, block, start, end, reserveQuickStrip = false) {
    const nodes = [...headings.map(h => render(h)), render(block, start, end)];
    context.body.append(...nodes);
    const reserve = reserveQuickStrip ? magazineQuickStrip() : null;
    if (reserve) context.body.append(reserve);
    const ok = fits(context.page);
    if (reserve) reserve.remove();
    nodes.forEach(n => n.remove());
    return ok;
  }

  function magazineQuickStrip() {
    const config = source.testerSettings?.magazine?.cards;
    if (!config?.enabled) return null;
    const entries = [config.one, config.two, config.three]
      .filter(card => card && (card.title || card.text));
    if (!entries.length) return null;
    const strip = el('section', 'magazine-quick-strip');
    if (config.heading) strip.append(el('h3', '', config.heading));
    const cards = el('div', 'magazine-quick-cards');
    for (const entry of entries) {
      const card = el('div', 'magazine-quick-card');
      if (entry.title) card.append(el('strong', '', entry.title));
      if (entry.text) card.append(el('span', '', entry.text));
      cards.append(card);
    }
    strip.append(cards);
    return strip;
  }

  function paginate(group, image, groupIndex) {
    const figure = group.find(b => b.type === 'figure') || null;
    const leadBlocks = group[0]?.type === 'h1' && group[1]?.type === 'h2' ? group.slice(0, 2) : [];
    const blocks = group.filter(b => b.type !== 'figure' && !leadBlocks.includes(b));
    let context = newPage(figure, image, false, leadBlocks), headings = [];
    const firstContext = context;
    const keepQuickStrip = groupIndex === 0 && Boolean(magazineQuickStrip());
    let quickStripPlaced = false;
    const reserveQuickStrip = () => keepQuickStrip && !quickStripPlaced && context === firstContext;
    const placeQuickStrip = () => {
      if (!keepQuickStrip || quickStripPlaced) return;
      const strip = magazineQuickStrip();
      if (!strip) return;
      firstContext.body.append(strip);
      if (!fits(firstContext.page)) {
        strip.remove();
        throw new Error('Magazine quick strip cannot fit on the first page.');
      }
      quickStripPlaced = true;
    };
    const nextPage = () => {
      if (context === firstContext) placeQuickStrip();
      context = newPage(null, null, false);
    };

    for (const block of blocks) {
      if (/^h[123]$/.test(block.type)) {
        headings.push(block);
        continue;
      }

      const length = block.type === 'table' ? block.rows.length : [...block.text].length;
      let start = 0;
      while (start < length) {
        if (!candidate(context, headings, block, start, length, reserveQuickStrip()) && context.body.children.length) {
          nextPage();
        }

        let end = length;
        if (!candidate(context, headings, block, start, end, reserveQuickStrip())) {
          let low = start, high = length;
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (candidate(context, headings, block, start, mid, reserveQuickStrip())) low = mid;
            else high = mid - 1;
          }
          end = low;
          if (end === start) {
            throw new Error(
              figure
                ? `Block ${block.id} cannot fit with its heading and selected image.`
                : `Block ${block.id} cannot fit with its heading.`
            );
          }

          if (block.type !== 'table') {
            const chars = [...block.text];
            for (let j = end; j > start + (end - start) / 2; j--) {
              if (/[。！？\n]/.test(chars[j - 1])) {
                end = j;
                break;
              }
            }
          }
        }

        context.body.append(...headings.map(h => render(h)), render(block, start, end));
        headings = [];
        start = end;
        if (start < length) nextPage();
      }
    }

    if (headings.length) {
      throw new Error(`Section ends in orphan heading ${headings[0].id}.`);
    }

    placeQuickStrip();
  }

  function audit() {
    const errors = [];
    const pages = [...root.querySelectorAll('.fixed-page')];
    const rendered = [...root.querySelectorAll('[data-source]')];
    const expectedOrder = source.blocks.filter(b => b.type !== 'figure').map(b => b.id);
    const actualOrder = rendered
      .map(n => n.dataset.source)
      .filter((id, i, all) => i === 0 || id !== all[i - 1]);

    if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
      errors.push('Source block order, duplication or coverage mismatch.');
    }

    for (const block of source.blocks) {
      if (block.type === 'figure') {
        const figures = [...root.querySelectorAll('[data-figure]')]
          .filter(n => n.dataset.figure === block.id);
        if (figures.length !== 1 || figures[0].dataset.repeated !== 'false') {
          errors.push(`${block.id}: figure missing or duplicated`);
        }
        for (const figure of figures) {
          const image = figure.querySelector('img');
          const expected = new URL(block.src, document.baseURI);
          const actual = new URL(image.src, document.baseURI);
          if (
            actual.href !== expected.href ||
            image.alt !== block.alt ||
            figure.querySelector('figcaption').textContent !== block.caption
          ) {
            errors.push(`${block.id}: selected image/caption mismatch`);
          }
        }
        continue;
      }

      const parts = rendered.filter(n => n.dataset.source === block.id);
      let offset = 0;
      for (const part of parts) {
        if (Number(part.dataset.start) !== offset) {
          errors.push(`${block.id}: discontinuous split`);
        }
        offset = Number(part.dataset.end);
      }

      if (block.type === 'table') {
        const rows = parts.flatMap(table =>
          [...table.tBodies[0].rows].map(row =>
            [...row.cells].map(cell => cell.textContent)
          )
        );
        if (JSON.stringify(rows) !== JSON.stringify(block.rows)) {
          errors.push(`${block.id}: table row loss or duplication`);
        }
        for (const table of parts) {
          const header = [...table.tHead.rows[0].cells].map(cell => cell.textContent);
          if (JSON.stringify(header) !== JSON.stringify(block.header)) {
            errors.push(`${block.id}: table header mismatch`);
          }
        }
        if (offset !== block.rows.length) {
          errors.push(`${block.id}: table coverage mismatch`);
        }
      } else if (
        parts.map(n => n.textContent).join('') !== block.text ||
        offset !== [...block.text].length
      ) {
        errors.push(`${block.id}: text loss or duplication`);
      }
    }

    const reports = pages.map((page, index) => {
      const body = page.querySelector('.article-body');
      const children = [...body.children];
      if (!children.length || /^H[123]$/.test(children.at(-1)?.tagName)) {
        errors.push(`page ${index + 1}: empty body or orphan heading`);
      }

      const ordered = [
        page.querySelector('.running-head'),
        page.querySelector('.article-lead'),
        page.querySelector('.scene'),
        ...children,
        page.querySelector('.folio')
      ].filter(Boolean);

      for (let i = 1; i < ordered.length; i++) {
        if (
          ordered[i].getBoundingClientRect().top <
          ordered[i - 1].getBoundingClientRect().bottom - .1
        ) {
          errors.push(`page ${index + 1}: component overlap`);
        }
      }

      const m = metrics(page);
      if (!fits(page)) {
        errors.push(`page ${index + 1}: image/text area or body budget failed`);
      }

      const scene = page.querySelector('.scene');
      return {
        page: index + 1,
        ...m,
        figure: scene?.dataset.figure || null,
        repeated: scene?.dataset.repeated === 'true',
        textOnly: !scene
      };
    });

    return {
      ok: errors.length === 0,
      sourceBlocks: source.blocks.length,
      selectedImages: source.manifest.selectedImages.length,
      pages: reports,
      errors
    };
  }

  window.auditArticleComposition = audit;

  async function compose() {
    await document.fonts.load('28px ArticleSubset');
    await document.fonts.ready;

    if (![...document.fonts].some(f => f.family === 'ArticleSubset' && f.status === 'loaded')) {
      throw new Error('Bundled article font did not load.');
    }

    const images = await Promise.all(source.groups.map(async group => {
      const figure = group.find(b => b.type === 'figure');
      if (!figure) return null;
      const image = new Image();
      image.src = figure.src;
      image.alt = figure.alt;
      await image.decode();
      return image;
    }));

    source.groups.forEach((group, index) => paginate(group, images[index], index));
    await Promise.all([...document.images].map(image => image.decode()));

    const report = audit();
    if (!report.ok) throw new Error(report.errors.join('\n'));

    window.__articleComposition = { status: 'ready', report };
    window.dispatchEvent(new Event('article-composed'));
  }

  compose().catch(error => {
    root.replaceChildren(el('p', 'layout-failure', '組版を停止しました：' + error.message));
    window.__articleComposition = { status: 'failed', error: error.message };
    setTimeout(() => { throw error; }, 0);
  });
})();
