(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixedLayoutSafety = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Keep inspect self-contained: the export gate also passes it to page.evaluate.
  function inspect(options = {}) {
    const version = '1.0.0';
    const scope = 'rendered-element-boxes-and-nonblank-text-fragments';
    const pageWidth = Number(options.pageWidth ?? 1456);
    const pageHeight = Number(options.pageHeight ?? 2056);
    const safetyPx = Number(options.safetyPx ?? 28);
    const tolerancePx = Number(options.tolerancePx ?? 0.5);
    const limitations = [
      '合格は、現在描画されている要素箱と非空白テキスト行箱の幾何に限ります。',
      '疑似要素、影、フィルター、輪郭線、clip-path、mask、contain:paint/strict/content、従来のCSS clip、角丸の切抜き、回転・傾斜を含む切抜き、画像やcanvas内部の描画は完全には計測しません。',
      '要素どうしの重なり、本文の欠落や原稿との同期、画像の意図したトリミング、読みやすさは判定しません。',
      '後続のJavaScript、未開始の資産読込、別のブラウザやフォントへの変更後まで保証する検査ではありません。'
    ];
    const report = { version, scope, pageCount: 0, safetyPx, tolerancePx, ok: false, issues: [], pages: [], limitations };
    function globalIssue(type, message, data = {}) {
      report.issues.push({ level: 'error', type, pageIndex: null, selector: 'document', message, data });
    }
    if (![pageWidth, pageHeight, safetyPx, tolerancePx].every(Number.isFinite)
        || pageWidth <= 0 || pageHeight <= 0 || safetyPx < 0 || tolerancePx < 0) {
      globalIssue('invalid-options', 'ページ寸法・安全余裕・許容誤差の指定が不正です。');
      return report;
    }
    if (document.readyState === 'loading') globalIssue('document-not-ready', 'HTMLの読込が完了していません。');
    if (document.fonts) {
      if (document.fonts.status !== 'loaded') globalIssue('fonts-not-ready', 'フォントの読込が完了していません。');
      const failedFonts = Array.from(document.fonts).filter(font => font.status === 'error');
      if (failedFonts.length) globalIssue('font-load-failed', '読込に失敗したフォントがあります。', { families: failedFonts.map(font => font.family) });
    }
    document.querySelectorAll('link[rel~="stylesheet"]').forEach(link => {
      if (!link.disabled && (!link.media || window.matchMedia(link.media).matches) && !link.sheet) {
        globalIssue('stylesheet-unavailable', 'スタイルシートの読込を確認できません。', { href: link.href });
      }
    });
    const activeAnimations = typeof document.getAnimations === 'function'
      ? document.getAnimations().filter(animation => animation.playState === 'running' || animation.pending) : [];
    if (activeAnimations.length) globalIssue('animation-active', '動作中のアニメーションがあります。描画を確定してから検査してください。', { count: activeAnimations.length });

    const fixedPages = Array.from(document.querySelectorAll('.fixed-page'));
    report.pageCount = fixedPages.length;
    if (!fixedPages.length) globalIssue('missing-fixed-page', '.fixed-page がありません。');
    const styles = new WeakMap();
    function styleOf(el) {
      if (!styles.has(el)) styles.set(el, getComputedStyle(el));
      return styles.get(el);
    }
    function visible(el) {
      const ownStyle = styleOf(el);
      if (ownStyle.visibility === 'hidden' || ownStyle.visibility === 'collapse') return false;
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        const style = styleOf(node);
        // A descendant can override inherited visibility, but cannot override display:none.
        if (style.display === 'none' || style.contentVisibility === 'hidden') return false;
      }
      return true;
    }
    function selectorOf(el) {
      if (el.id) return el.tagName.toLowerCase() + '#' + (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id);
      const parts = [];
      for (let node = el; node && !node.classList.contains('fixed-page'); node = node.parentElement) {
        let part = node.tagName.toLowerCase();
        if (node.classList.length) part += '.' + Array.from(node.classList).map(name => typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(name) : name).join('.');
        if (node.parentElement) {
          const siblings = Array.from(node.parentElement.children).filter(sibling => sibling.tagName === node.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
      }
      return parts.join(' > ') || '.fixed-page';
    }
    const clipValues = new Set(['hidden', 'clip', 'scroll', 'auto']);
    fixedPages.forEach((fixedPage, pageOffset) => {
      const pageIndex = pageOffset + 1;
      const pr = fixedPage.getBoundingClientRect();
      const pageReport = {
        pageIndex, width: pr.width, height: pr.height,
        clearance: { top: null, right: null, bottom: null, left: null },
        measuredBoxes: 0, textFragments: 0, ok: false, issues: []
      };
      report.pages.push(pageReport);
      const issueKeys = new Map();
      function addIssue(level, type, el, message, data = {}, discriminator = '') {
        const selector = typeof el === 'string' ? el : selectorOf(el);
        const key = type + '|' + selector + '|' + discriminator;
        if (issueKeys.has(key)) {
          const previous = issueKeys.get(key);
          previous.data.occurrences = (previous.data.occurrences || 1) + 1;
          if (data.clearance && previous.data.clearance) {
            for (const edge of ['top', 'right', 'bottom', 'left']) previous.data.clearance[edge] = Math.min(previous.data.clearance[edge], data.clearance[edge]);
          }
          return;
        }
        const item = { level, type, pageIndex, selector, message, data };
        issueKeys.set(key, item);
        pageReport.issues.push(item);
        report.issues.push(item);
      }
      function relativeRect(rect) {
        return { left: rect.left - pr.left, top: rect.top - pr.top, right: rect.right - pr.left, bottom: rect.bottom - pr.top, width: rect.width, height: rect.height };
      }
      function clearanceOf(rect) {
        return { top: rect.top - pr.top, right: pr.right - rect.right, bottom: pr.bottom - rect.bottom, left: rect.left - pr.left };
      }
      function nonAxisTransform(ancestor) {
        for (let node = ancestor; node; node = node.parentElement) {
          const cs = styleOf(node);
          const transform = cs.transform;
          if (transform && transform !== 'none') {
            const matrix = transform.match(/^matrix\(([^)]+)\)$/);
            const values = matrix ? matrix[1].split(',').map(Number) : null;
            if (!values || values[1] !== 0 || values[2] !== 0 || values[0] <= 0 || values[3] <= 0) return node;
          }
          if (cs.rotate && cs.rotate !== 'none' && cs.rotate !== '0deg') return node;
          if (cs.perspective && cs.perspective !== 'none') return node;
          if (cs.scale && cs.scale !== 'none' && cs.scale.split(/\s+/).some(value => Number(value) <= 0)) return node;
        }
        return null;
      }
      function containmentPaint(cs) {
        const features = [];
        if (/(^|\s)(paint|strict|content)(\s|$)/.test(cs.contain || '')) features.push('contain:' + cs.contain);
        if (cs.clip && cs.clip !== 'auto' && cs.clip !== 'none') features.push('clip');
        return features;
      }
      function isViewportOverflow(ancestor) {
        // The exporter can scroll/capture each page beyond the current viewport.
        // Root overflow, including the body's propagated value, is not a wrapper clip.
        if (ancestor === document.documentElement || ancestor === document.scrollingElement) return true;
        if (ancestor !== document.body) return false;
        const rootStyle = styleOf(document.documentElement);
        return rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible';
      }
      function measure(rect, el, origin, clipStart) {
        if (rect.width <= 0 || rect.height <= 0) return;
        const clearance = clearanceOf(rect);
        for (const edge of ['top', 'right', 'bottom', 'left']) {
          const old = pageReport.clearance[edge];
          pageReport.clearance[edge] = old === null ? clearance[edge] : Math.min(old, clearance[edge]);
        }
        if (origin === 'text') pageReport.textFragments += 1;
        else pageReport.measuredBoxes += 1;
        const outside = Object.keys(clearance).filter(edge => clearance[edge] < -tolerancePx);
        // A configured 28px margin must not accept 27.6px because of a geometry tolerance.
        const insufficient = Object.keys(clearance).filter(edge => clearance[edge] < safetyPx - 1e-6);
        if (outside.length) {
          addIssue('error', 'page-overflow', el, '描画領域がページ外へはみ出しています。', { origin, rect: relativeRect(rect), clearance, edges: outside }, origin);
        } else if (insufficient.length) {
          addIssue('error', 'insufficient-clearance', el, 'ページ外縁からの安全余裕が不足しています。', { origin, rect: relativeRect(rect), clearance, edges: insufficient, requiredPx: safetyPx }, origin);
        }
        for (let ancestor = clipStart; ancestor; ancestor = ancestor.parentElement) {
          const cs = styleOf(ancestor);
          if (!fixedPage.contains(ancestor)) {
            const features = containmentPaint(cs);
            if (features.length) addIssue('warning', 'unmeasured-paint', ancestor, '装飾等の描画範囲は幾何検査の保証対象外です。', { features });
          }
          if (isViewportOverflow(ancestor)) continue;
          const clipX = clipValues.has(cs.overflowX);
          const clipY = clipValues.has(cs.overflowY);
          if (!clipX && !clipY) continue;
          const ar = ancestor.getBoundingClientRect();
          // A rotated/skewed clipping polygon cannot be derived from its axis-aligned rectangle.
          const transformedAncestor = nonAxisTransform(ancestor);
          if (transformedAncestor) {
            addIssue('warning', 'unmeasured-transformed-clip', ancestor, '回転・傾斜を伴う切抜き領域は厳密に検査していません。', { transformedAncestor: selectorOf(transformedAncestor) });
            continue;
          }
          const sx = ancestor.offsetWidth ? ar.width / ancestor.offsetWidth : 1;
          const sy = ancestor.offsetHeight ? ar.height / ancestor.offsetHeight : 1;
          const margin = Math.max(0, parseFloat(cs.overflowClipMargin) || 0);
          const cx = cs.overflowX === 'clip' ? margin * sx : 0;
          const cy = cs.overflowY === 'clip' ? margin * sy : 0;
          const left = ar.left + ancestor.clientLeft * sx - cx;
          const top = ar.top + ancestor.clientTop * sy - cy;
          const right = ar.left + (ancestor.clientLeft + ancestor.clientWidth) * sx + cx;
          const bottom = ar.top + (ancestor.clientTop + ancestor.clientHeight) * sy + cy;
          if ((clipX && (rect.left < left - tolerancePx || rect.right > right + tolerancePx))
              || (clipY && (rect.top < top - tolerancePx || rect.bottom > bottom + tolerancePx))) {
            addIssue('error', 'clipped-content', el, '親要素の表示範囲で内容が切れます。', {
              origin, rect: relativeRect(rect), clippingAncestor: selectorOf(ancestor),
              clipRect: { left: left - pr.left, top: top - pr.top, right: right - pr.left, bottom: bottom - pr.top },
              overflowX: cs.overflowX, overflowY: cs.overflowY
            }, origin + '|' + selectorOf(ancestor));
          }
        }
      }
      if (Math.abs(pr.width - pageWidth) > tolerancePx || Math.abs(pr.height - pageHeight) > tolerancePx) {
        addIssue('error', 'wrong-page-size', fixedPage, 'ページ寸法が出力基準と一致しません。', { expectedWidth: pageWidth, expectedHeight: pageHeight, width: pr.width, height: pr.height });
      }
      if (fixedPage.matches('.export-fallback-page') || /固定レイアウト(?:生成|読込)エラー/.test(fixedPage.textContent)) {
        addIssue('error', 'fallback-page', fixedPage, 'エラーを示す代替ページが含まれています。');
      }
      const elements = [fixedPage, ...fixedPage.querySelectorAll('*')];
      for (const el of elements) {
        if (['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'NOSCRIPT'].includes(el.tagName) || !visible(el)) continue;
        const cs = styleOf(el);
        if (el !== fixedPage) Array.from(el.getClientRects()).forEach(rect => measure(rect, el, 'element', el.parentElement));
        if (el.tagName === 'IMG' && (!el.complete || el.naturalWidth === 0 || el.naturalHeight === 0)) {
          addIssue('error', el.complete ? 'broken-image' : 'image-not-ready', el, '画像の読込が完了していないか、画像が壊れています。', { src: el.currentSrc || el.src || '', complete: el.complete, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight });
        }
        if (el.matches('.missing, .missing-image, .image-missing, [data-image-missing="true"]')) {
          addIssue('error', 'missing-image-placeholder', el, '画像欠落の代替表示が残っています。');
        }
        const paint = containmentPaint(cs);
        if (cs.boxShadow !== 'none') paint.push('box-shadow');
        if (cs.textShadow !== 'none') paint.push('text-shadow');
        if (cs.filter !== 'none') paint.push('filter');
        if (cs.backdropFilter && cs.backdropFilter !== 'none') paint.push('backdrop-filter');
        if (cs.clipPath !== 'none') paint.push('clip-path');
        if (cs.maskImage && cs.maskImage !== 'none') paint.push('mask');
        if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') paint.push('outline');
        if (['CANVAS', 'SVG', 'VIDEO', 'IFRAME'].includes(el.tagName)) paint.push(el.tagName.toLowerCase());
        for (const pseudo of ['::before', '::after']) {
          const ps = getComputedStyle(el, pseudo);
          if (ps.display !== 'none' && ps.content !== 'none' && ps.content !== 'normal') paint.push(pseudo);
        }
        if (paint.length) addIssue('warning', 'unmeasured-paint', el, '装飾等の描画範囲は幾何検査の保証対象外です。', { features: paint });
        if (cs.backgroundImage && /url\(/i.test(cs.backgroundImage)) {
          addIssue('warning', 'unverified-background-image', el, '背景画像の読込完了と内部描画は、この検査だけでは確認できません。');
        }
      }
      const walker = document.createTreeWalker(fixedPage, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const el = node.parentElement;
        if (!el || !visible(el) || el.closest('script, style, template, noscript')) continue;
        const raw = node.nodeValue || '';
        const start = raw.search(/\S/);
        if (start < 0) continue;
        const end = raw.length - raw.match(/\s*$/)[0].length;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        Array.from(range.getClientRects()).forEach(rect => measure(rect, el, 'text', el));
      }
      if (!pageReport.measuredBoxes && !pageReport.textFragments) addIssue('warning', 'empty-measurement', fixedPage, '検査対象の要素箱・テキスト行箱がありません。');
      pageReport.ok = !pageReport.issues.some(issue => issue.level === 'error');
    });
    report.ok = report.pageCount > 0 && !report.issues.some(issue => issue.level === 'error');
    return report;
  }
  return { inspect };
});
