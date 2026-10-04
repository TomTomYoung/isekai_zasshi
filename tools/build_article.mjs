import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { chromium } from 'playwright';
import safety from '../preview/layout_safety.js';
import { verifyArticleSource, sha256 } from './article_source.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PAGE_SELECTOR = '.fixed-page';
const VIEWPORT_WIDTH = 1456;
const VIEWPORT_HEIGHT = 2056;
const ASSET_TIMEOUT_MS = 15000;
const SETTLE_MS = 300;

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
]);

function usage() {
  console.error('usage: node tools/build_article.mjs <issue/article-dir> [--check-only] [--safety-px=28] [--report <path>]');
  console.error('example: node tools/build_article.mjs 202604/00_表紙 --check-only');
  console.error('--check-only writes JSON to stdout; its optional --report writes it outside the article directory instead.');
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function toUrlPath(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return '/' + rel;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function startServer(overrides = new Map()) {
  const server = http.createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const normalizedPath = path.normalize(rawPath).replace(/^([/\\])+/, '');
      const filePath = path.join(ROOT, normalizedPath);

      if (!isWithin(ROOT, filePath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (overrides.has(filePath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(overrides.get(filePath));
        return;
      }

      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES.get(ext) || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not start local server.'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function attachPageLogging(page, targetName) {
  const state = { pending: new Set(), failures: new Map(), imageFailures: new Map(), errors: [], changed: Date.now() };
  const critical = new Set(['document', 'stylesheet', 'script', 'font', 'fetch', 'xhr']);
  const fail = (request, detail) => {
    const type = request.resourceType();
    if (type === 'image') state.imageFailures.set(request.url(), detail);
    else if (critical.has(type)) state.failures.set(request.url(), detail);
  };
  page.on('request', request => {
    state.pending.add(request);
    state.changed = Date.now();
  });
  page.on('requestfinished', request => {
    state.pending.delete(request);
    state.changed = Date.now();
  });
  page.on('requestfailed', request => {
    state.pending.delete(request);
    state.changed = Date.now();
    fail(request, request.failure()?.errorText || 'request failed');
  });
  page.on('response', response => {
    if (response.status() >= 400) fail(response.request(), `HTTP ${response.status()}`);
    else if (response.request().resourceType() === 'image') state.imageFailures.delete(response.url());
  });
  page.on('pageerror', error => {
    state.errors.push(error.message);
    console.warn(`page error: ${targetName}: ${error.message}`);
  });
  page.on('console', message => {
    if (message.type() === 'error') {
      console.warn(`browser console error: ${targetName}: ${message.text()}`);
    }
  });
  return state;
}

async function installReadinessObserver(page) {
  await page.addInitScript(() => {
    const state = { changed: Date.now(), errors: [] };
    window.__fixedArticleExportState = state;
    new MutationObserver(() => { state.changed = Date.now(); }).observe(document, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
    window.addEventListener('unhandledrejection', event => {
      state.errors.push(String(event.reason?.message || event.reason || 'Unhandled promise rejection'));
    });
  });
}

async function assetState(page) {
  return withTimeout(page.evaluate(() => {
    // Every page will be exported, including images outside the initial viewport.
    for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
    const images = [...document.images];
    const requiredImageUrls = new Set(images.map(img => img.currentSrc || img.src).filter(Boolean));
    const candidateUrls = new Set();
    for (const img of images) {
      for (const candidate of (img.dataset.candidates || '').split('|').filter(Boolean)) {
        candidateUrls.add(new URL(candidate.trim(), document.baseURI).href);
      }
    }
    const addUrls = value => {
      for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
        const url = match[1] ?? match[2] ?? match[3];
        if (url) requiredImageUrls.add(new URL(url.trim(), document.baseURI).href);
      }
    };
    for (const element of document.querySelectorAll('.fixed-page, .fixed-page *')) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        for (const property of ['backgroundImage', 'borderImageSource', 'listStyleImage', 'maskImage', 'content']) {
          addUrls(style[property] || '');
        }
      }
    }
    for (const image of document.querySelectorAll('svg image')) {
      const href = image.href?.baseVal;
      if (href) requiredImageUrls.add(new URL(href, document.baseURI).href);
    }
    const errors = images.filter(img => img.complete && !img.naturalWidth && (img.src || !img.dataset.candidates))
      .map(img => `Image missing: ${img.getAttribute('src') || img.alt || '(no src)'}`);
    for (const element of document.querySelectorAll('.missing, .export-fallback-page')) {
      errors.push(`Fallback content present: .${element.className}`);
    }
    for (const link of document.querySelectorAll('link[rel~="stylesheet"]')) {
      if (!link.disabled && !link.sheet) errors.push(`Stylesheet missing: ${link.getAttribute('href')}`);
    }
    for (const font of document.fonts) {
      if (font.status === 'error') errors.push(`Font failed: ${font.family}`);
    }
    const state = window.__fixedArticleExportState;
    errors.push(...(state?.errors || []));
    if (window.__articleComposition?.status === 'failed') errors.push(`Composition failed: ${window.__articleComposition.error}`);
    return {
      pending: images.filter(img => !img.complete || (!img.getAttribute('src') && !img.getAttribute('srcset') && img.dataset.candidates)).length + (window.__articleComposition?.status === 'pending' ? 1 : 0),
      fontsLoading: document.fonts.status === 'loading',
      images: images.length,
      fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
      changed: state?.changed || 0,
      requiredImageUrls: [...requiredImageUrls],
      candidateUrls: [...candidateUrls],
      errors,
    };
  }), 5000, 'inspect asset readiness');
}

function readinessErrors(info, network) {
  const required = new Set(info.requiredImageUrls);
  const candidates = new Set(info.candidateUrls);
  const failures = [...network.failures];
  // Existing articles try several candidate filenames. Only failures of unused
  // candidates may be ignored; a missing selected image or CSS image still fails.
  for (const [url, detail] of network.imageFailures) {
    if (required.has(url) || !candidates.has(url)) failures.push([url, detail]);
  }
  return [...info.errors, ...network.errors, ...failures.map(([url, detail]) => `${detail}: ${url}`)];
}

async function waitForAssets(page, network) {
  const deadline = Date.now() + ASSET_TIMEOUT_MS;
  let info;
  while (Date.now() < deadline) {
    info = await assetState(page);
    if (!info.pending && !info.fontsLoading && !network.pending.size &&
        Date.now() - Math.max(info.changed, network.changed) >= SETTLE_MS) {
      const errors = readinessErrors(info, network);
      if (errors.length) throw new Error(`Asset readiness failed:\n${errors.join('\n')}`);
      await withTimeout(page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.decode()));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }), Math.max(1, deadline - Date.now()), 'decode images and load fonts');
      const final = await assetState(page);
      const finalErrors = readinessErrors(final, network);
      if (finalErrors.length) throw new Error(`Asset readiness failed:\n${finalErrors.join('\n')}`);
      if (!final.pending && !final.fontsLoading && !network.pending.size &&
          final.changed === info.changed && Date.now() - network.changed >= SETTLE_MS) {
        return { status: 'ready', images: final.images, fonts: final.fonts, settleMs: SETTLE_MS };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  const details = info ? readinessErrors(info, network) : [];
  throw new Error(`Asset readiness timed out after ${ASSET_TIMEOUT_MS}ms: ${info?.pending ?? '?'} images pending, ${network.pending.size} requests pending, fonts loading=${info?.fontsLoading ?? '?'}${details.length ? `\n${details.join('\n')}` : ''}`);
}

async function collectGeometry(page) {
  return withTimeout(page.evaluate(selector => {
    const pages = Array.from(document.querySelectorAll(selector));
    return pages.map((pageEl, pageIndex) => {
      const pageRect = pageEl.getBoundingClientRect();
      const elements = Array.from(pageEl.querySelectorAll('*')).map((el, index) => {
        const r = el.getBoundingClientRect();
        return {
          index,
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className : '',
          x: Math.round((r.left - pageRect.left) * 100) / 100,
          y: Math.round((r.top - pageRect.top) * 100) / 100,
          w: Math.round(r.width * 100) / 100,
          h: Math.round(r.height * 100) / 100,
        };
      });
      return {
        pageIndex: pageIndex + 1,
        width: Math.round(pageRect.width),
        height: Math.round(pageRect.height),
        elementCount: elements.length,
        elements,
      };
    });
  }, PAGE_SELECTOR), 5000, 'collect page geometry');
}

async function copyIntermediate(articleDir, intermediateDir, sourceSync) {
  const fixedLayout = path.join(articleDir, 'fixed_layout.html');
  if (!(await exists(fixedLayout))) {
    throw new Error(`Missing fixed_layout.html: ${fixedLayout}`);
  }

  await fs.copyFile(fixedLayout, path.join(intermediateDir, 'fixed_layout.html'));

  const css = path.join(articleDir, 'fixed_layout.css');
  if (await exists(css)) {
    await fs.copyFile(css, path.join(intermediateDir, 'fixed_layout.css'));
  }

  const articleName = path.basename(articleDir).replace(/^\d{2}_/, '');
  const mdPath = path.join(articleDir, sourceSync?.status === 'verified' ? sourceSync.source : `${articleName}.md`);
  if (await exists(mdPath)) {
    const md = await fs.readFile(mdPath, 'utf8');
    await fs.writeFile(path.join(intermediateDir, 'article.md'), md, 'utf8');
  }
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Screenshot is not a PNG with an IHDR header.');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function assertNoPreviewGuides(page) {
  const found = await withTimeout(page.evaluate(() => Boolean(document.querySelector(
    '#fixed-layout-manual-preview-style, #fixed-layout-manual-preview-badge, #fixed-layout-pages-preview-guide, [data-fixed-layout-manual-preview="1"]',
  ))), 3000, 'check preview guides');
  if (found) throw new Error('Preview guides are active. Export must use the unadorned fixed_layout.html.');
}

async function inspectSafety(page, safetyPx) {
  return withTimeout(page.evaluate(safety.inspect, {
    pageWidth: VIEWPORT_WIDTH, pageHeight: VIEWPORT_HEIGHT, safetyPx, tolerancePx: 0.5,
  }), 10000, 'layout safety inspection');
}

function assertSafety(report) {
  if (!report.ok) {
    const details = report.issues.filter(issue => issue.level === 'error')
      .map(issue => `page ${issue.pageIndex ?? '?'} ${issue.type}: ${issue.message}`);
    throw new Error(`Layout safety check failed:\n${details.join('\n')}`);
  }
}

async function inspectComposition(page) {
  const report = await page.evaluate(() => {
    if (!document.querySelector('meta[name="article-source-contract"]')) return null;
    if (window.__articleComposition?.status !== 'ready' || typeof window.auditArticleComposition !== 'function') throw new Error('Generated article composition did not complete.');
    return window.auditArticleComposition();
  });
  if (report && !report.ok) throw new Error(`Composition audit failed: ${report.errors.join('; ')}`);
  return report;
}

// Two directories cannot be renamed atomically together. Keep both old versions
// until both new directories are installed, and restore them on an I/O failure.
// A forced process kill or power loss during these renames still needs recovery.
async function publishStaged(articleDir, stageDir) {
  const items = ['pages', 'intermediate'].map(name => ({
    name, target: path.join(articleDir, name), staged: path.join(stageDir, name),
    backup: path.join(stageDir, `old-${name}`), backedUp: false, installed: false,
  }));
  try {
    for (const item of items) {
      const stat = await fs.lstat(item.target).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
        throw new Error(`Output path must be a normal directory: ${item.target}`);
      }
      item.existed = Boolean(stat);
    }
    for (const item of items) {
      if (item.existed) {
        await fs.rename(item.target, item.backup);
        item.backedUp = true;
      }
    }
    for (const item of items) {
      await fs.rename(item.staged, item.target);
      item.installed = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of [...items].reverse()) {
      try {
        if (item.installed) await fs.rename(item.target, item.staged);
        if (item.backedUp) await fs.rename(item.backup, item.target);
      } catch (rollbackError) {
        rollbackErrors.push(`${item.name}: ${rollbackError.message}`);
      }
    }
    if (rollbackErrors.length) {
      error.preserveStage = true;
      error.message += `\nRollback incomplete; preserved backups at ${stageDir}:\n${rollbackErrors.join('\n')}`;
    }
    throw error;
  }
}

export async function exportArticle(articleDir, options, result) {
  const fixedLayoutPath = path.join(articleDir, 'fixed_layout.html');
  if (options.sourceHtml !== undefined && !options.checkOnly) throw new Error('In-memory source is only supported for preflight.');
  if (options.sourceHtml === undefined) result.sourceSync = await verifyArticleSource(articleDir);
  let server, browser, page, stageDir;
  let preserveStage = false;
  try {
    const serving = await startServer(options.sourceHtml === undefined ? new Map() : new Map([[fixedLayoutPath, options.sourceHtml]]));
    server = serving.server;
    browser = await chromium.launch({
      headless: true, executablePath: process.env.PREVIEW_CHROMIUM || undefined,
      args: ['--no-sandbox', '--disable-gpu'],
    });
    page = await browser.newPage({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }, deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(12000);
    const network = attachPageLogging(page, result.article);
    await installReadinessObserver(page);
    result.environment = { browser: browser.version(), platform: process.platform, deviceScaleFactor: 1 };
    const response = await page.goto(serving.baseUrl + toUrlPath(fixedLayoutPath), {
      waitUntil: 'domcontentloaded', timeout: 12000,
    });
    if (!response?.ok()) throw new Error(`Article load failed: HTTP ${response?.status() ?? '(no response)'}`);
    result.readiness = await waitForAssets(page, network);
    await assertNoPreviewGuides(page);
    result.layoutSafety = await inspectSafety(page, options.safetyPx);
    assertSafety(result.layoutSafety);
    result.composition = await inspectComposition(page);
    if (options.checkOnly) {
      if (options.sourceHtml === undefined && JSON.stringify(await verifyArticleSource(articleDir)) !== JSON.stringify(result.sourceSync)) throw new Error('Source changed during preflight.');
      result.ok = true;
      return;
    }

    // The check-only path never reaches any mkdir, copy, screenshot or rename.
    // A failed preflight likewise leaves the existing output untouched.
    stageDir = await fs.mkdtemp(path.join(articleDir, '.article-build-'));
    const intermediateDir = path.join(stageDir, 'intermediate');
    const pagesDir = path.join(stageDir, 'pages');
    await fs.mkdir(intermediateDir);
    await fs.mkdir(pagesDir);
    await copyIntermediate(articleDir, intermediateDir, result.sourceSync);
    const geometry = await collectGeometry(page);
    const locators = await withTimeout(page.locator(PAGE_SELECTOR).all(), 5000, 'collect fixed pages');
    for (let i = 0; i < locators.length; i += 1) {
      // Catch assets or layout that changed after the first inspection as well.
      await waitForAssets(page, network);
      await assertNoPreviewGuides(page);
      const beforeShot = await inspectSafety(page, options.safetyPx);
      assertSafety(beforeShot);
      await inspectComposition(page);
      const buffer = await locators[i].screenshot({ animations: 'disabled', scale: 'css', timeout: 12000 });
      const dimensions = pngDimensions(buffer);
      if (dimensions.width !== VIEWPORT_WIDTH || dimensions.height !== VIEWPORT_HEIGHT) {
        throw new Error(`Page ${i + 1} PNG is ${dimensions.width}×${dimensions.height}; expected ${VIEWPORT_WIDTH}×${VIEWPORT_HEIGHT}.`);
      }
      const fileName = `${String(i + 1).padStart(3, '0')}.png`;
      await fs.writeFile(path.join(pagesDir, fileName), buffer);
      result.pages.push({ articlePage: i + 1, file: `pages/${fileName}`, sha256: sha256(buffer), ...dimensions });
    }
    result.readiness = await waitForAssets(page, network);
    await assertNoPreviewGuides(page);
    result.layoutSafety = await inspectSafety(page, options.safetyPx);
    assertSafety(result.layoutSafety);
    result.composition = await inspectComposition(page);
    const finalSource = await verifyArticleSource(articleDir);
    if (JSON.stringify(finalSource) !== JSON.stringify(result.sourceSync)) throw new Error('Source changed during export; existing outputs are retained.');
    if (JSON.stringify(await collectGeometry(page)) !== JSON.stringify(geometry)) {
      throw new Error('Page geometry changed during export. No output has been replaced; stabilize the article and retry.');
    }
    result.ok = true;
    await fs.writeFile(path.join(intermediateDir, 'layout_report.json'), JSON.stringify({
      article: result.article, pages: geometry, layoutSafety: result.layoutSafety,
    }, null, 2) + '\n', 'utf8');
    await fs.writeFile(path.join(intermediateDir, 'article_manifest.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
    await publishStaged(articleDir, stageDir);
    for (const item of result.pages) console.log(`exported: ${result.articleDir}/${item.file}`);
    console.log(`article manifest: ${result.articleDir}/intermediate/article_manifest.json`);
  } catch (error) {
    preserveStage = Boolean(error.preserveStage);
    result.ok = false;
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
    if (stageDir && !preserveStage) {
      await fs.rm(stageDir, { recursive: true, force: true }).catch(error => {
        console.warn(`Temporary build directory could not be removed: ${stageDir}: ${error.message}`);
      });
    }
  }
}

function parseArgs(args) {
  const options = { article: null, checkOnly: false, safetyPx: 28, report: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--check-only') options.checkOnly = true;
    else if (arg === '--safety-px' || arg.startsWith('--safety-px=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++i];
      options.safetyPx = value?.trim() ? Number(value) : NaN;
    } else if (arg === '--report' || arg.startsWith('--report=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++i];
      if (!value || value.startsWith('--')) throw new Error('--report needs a file path.');
      options.report = path.resolve(value);
    } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (options.article) throw new Error(`Unexpected argument: ${arg}`);
    else options.article = arg;
  }
  if (!options.article) throw new Error('An article directory is required.');
  if (options.report && !options.checkOnly) throw new Error('--report is available with --check-only. Builds save reports in intermediate/.');
  if (!Number.isFinite(options.safetyPx) || options.safetyPx < 0 || options.safetyPx >= VIEWPORT_WIDTH / 2) {
    throw new Error('--safety-px must be a finite number from 0 up to (but not including) 728.');
  }
  return options;
}

async function resolvedDestination(filePath) {
  try { return await fs.realpath(filePath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(filePath);
    if (parent === filePath) throw error;
    return path.join(await resolvedDestination(parent), path.basename(filePath));
  }
}

async function writeReport(filePath, json) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(path.dirname(filePath), '.layout-report-'));
  try {
    const staged = path.join(temporary, 'report.json');
    await fs.writeFile(staged, json, 'utf8');
    // Replacing the name also avoids modifying an article through a hard link.
    await fs.rename(staged, filePath);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { usage(); throw error; }
  const articleDir = path.resolve(ROOT, options.article);
  const result = {
    article: path.basename(articleDir),
    articleDir: path.relative(ROOT, articleDir).split(path.sep).join('/'),
    sourceHtml: path.relative(ROOT, path.join(articleDir, 'fixed_layout.html')).split(path.sep).join('/'),
    mode: options.checkOnly ? 'check-only' : 'build', ok: false,
    width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, safetyPx: options.safetyPx,
    fallback: false, readiness: null, layoutSafety: null, environment: null, pages: [], errors: [],
  };
  let reportAllowed = false;
  try {
    if (!isWithin(ROOT, articleDir) || articleDir === ROOT) throw new Error(`Invalid article directory: ${articleDir}`);
    const realArticle = await fs.realpath(articleDir);
    if (!isWithin(await fs.realpath(ROOT), realArticle) || !(await fs.stat(articleDir)).isDirectory()) {
      throw new Error(`Article directory must be inside the repository: ${articleDir}`);
    }
    if (options.report) {
      const destination = await resolvedDestination(options.report);
      if (isWithin(articleDir, options.report) || isWithin(realArticle, destination)) {
        throw new Error('--report must be outside the article directory to preserve read-only checks and existing outputs.');
      }
      reportAllowed = true;
    }
    await exportArticle(articleDir, options, result);
  } catch (error) {
    result.ok = false;
    result.errors.push(error.message);
    process.exitCode = 1;
    console.error(error.message);
  }
  const json = JSON.stringify(result, null, 2) + '\n';
  if (options.report && reportAllowed) {
    await writeReport(options.report, json);
    console.error(`report: ${options.report}`);
  } else if (options.checkOnly) process.stdout.write(json);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
