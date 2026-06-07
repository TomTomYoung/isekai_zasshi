(() => {
  const DEFAULT_MAX = 760;
  const EXPANDED_MAX = 960;
  const MIN_SLACK = 140;
  const KEEP_SLACK = 64;
  const DONE_FLAG = '__fixedLayoutImageExpansionDone';

  function outerHeight(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return Math.ceil(rect.height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0));
  }

  function pageCapacity(sheet) {
    const metrics = window.__fixedLayoutMetrics;
    if (metrics && Number(metrics.capacity) > 0) return Number(metrics.capacity);
    return Math.max(0, sheet.getBoundingClientRect().height - 28);
  }

  async function waitImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 1000);
      });
    }));
  }

  function getPageItems(sheet) {
    return Array.from(sheet.children).map(node => ({
      node,
      height: outerHeight(node),
      hasImage: Boolean(node.querySelector && node.querySelector('figure img, img')),
    }));
  }

  async function expandOnePage(sheet, pageIndex) {
    const capacity = pageCapacity(sheet);
    const items = getPageItems(sheet);
    const used = items.reduce((sum, item) => sum + item.height, 0);
    const remaining = capacity - used;
    if (remaining < MIN_SLACK) return { page: pageIndex, used, remaining, expanded: [] };

    const imageItems = items.filter(item => item.hasImage);
    if (imageItems.length === 0) return { page: pageIndex, used, remaining, expanded: [] };

    const extraPerImage = Math.floor((remaining - KEEP_SLACK) / imageItems.length);
    if (extraPerImage <= 0) return { page: pageIndex, used, remaining, expanded: [] };

    const expanded = [];
    for (const item of imageItems) {
      const oldMax = Number(item.node.dataset.imageMaxHeight || DEFAULT_MAX);
      const nextMax = Math.min(EXPANDED_MAX, oldMax + extraPerImage);
      if (nextMax <= oldMax) continue;

      item.node.style.setProperty('--image-max-height', `${nextMax}px`);
      await waitImages(item.node);
      const newHeight = outerHeight(item.node);
      const currentItems = getPageItems(sheet);
      const newUsed = currentItems.reduce((sum, x) => sum + x.height, 0);

      if (newUsed <= capacity - KEEP_SLACK) {
        item.node.dataset.imageMaxHeight = String(nextMax);
        item.node.dataset.imageExpandedBy = String(nextMax - oldMax);
        item.node.dataset.measuredHeight = String(newHeight);
        expanded.push({ oldMax, newMax: nextMax, by: nextMax - oldMax, newHeight });
      } else {
        item.node.style.setProperty('--image-max-height', `${oldMax}px`);
      }
    }

    const finalItems = getPageItems(sheet);
    const finalUsed = finalItems.reduce((sum, item) => sum + item.height, 0);
    return { page: pageIndex, used: finalUsed, remaining: capacity - finalUsed, expanded };
  }

  async function run() {
    if (window[DONE_FLAG]) return;
    if (!window.__fixedLayoutMetrics) return;
    const sheets = Array.from(document.querySelectorAll('.fixed-page .article-sheet'));
    if (sheets.length === 0) return;

    const pages = [];
    for (let i = 0; i < sheets.length; i += 1) pages.push(await expandOnePage(sheets[i], i + 1));

    const metrics = window.__fixedLayoutMetrics || {};
    metrics.imageExpansion = {
      defaultMaxHeight: DEFAULT_MAX,
      expandedMaxHeight: EXPANDED_MAX,
      minSlack: MIN_SLACK,
      keepSlack: KEEP_SLACK,
      pages,
    };
    window.__fixedLayoutMetrics = metrics;
    window[DONE_FLAG] = true;
  }

  const timer = setInterval(() => {
    if (window.__fixedLayoutMetrics && !window[DONE_FLAG]) {
      clearInterval(timer);
      run();
    }
  }, 30);
  setTimeout(() => clearInterval(timer), 5000);
})();
