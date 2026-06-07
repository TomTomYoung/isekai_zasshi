import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ISSUE_DIR = path.join(ROOT, '202603');
const OUT_DIR = path.join(ROOT, 'exports');
const REPORT_PATH = path.join(OUT_DIR, 'layout_report.json');
const PAGE_W = 1456;
const PAGE_H = 2056;
const EPS = 1;
const BLEED = 24;
const ARTICLE_TIMEOUT_MS = 18000;
const CHECK_SELECTOR = 'h1,h2,h3,p,figure,img,table,blockquote,.article-sheet,.lead,.note-box,.warning-box,.summary-box,.push-point,.column-box,.danger-box';

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

function timeout(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms));
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

async function collectTargets() {
  const entries = await fs.readdir(ISSUE_DIR, { withFileTypes: true });
  const dirs = entries
    .filter(entry => entry.isDirectory() && /^\d{2}_/.test(entry.name))
    .map(entry => path.join(ISSUE_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b, 'ja'));

  const targets = [];
  for (const dir of dirs) {
    const htmlPath = path.join(dir, 'fixed_layout.html');
    if (await exists(htmlPath)) targets.push({ name: path.basename(dir), dir, htmlPath });
  }
  return targets;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const normalizedPath = path.normalize(rawPath).replace(/^([/\\])+/, '');
      const filePath = path.join(ROOT, normalizedPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
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
      if (!address || typeof address === 'string') reject(new Error('Could not start local server.'));
      else resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function crashResult(target, type, message, pageErrors = []) {
  return {
    name: target.name,
    status: 'error',
    pageCount: 0,
    pageErrors,
    issues: [{ level: 'error', type, selector: '', message, data: {} }],
  };
}

async function inspectPage(page, targetName) {
  return await page.evaluate(({ PAGE_W, PAGE_H, EPS, BLEED, CHECK_SELECTOR, targetName }) => {
    function rectOf(el) {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }
    function selectorOf(el) {
      if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
      if (el.className && typeof el.className === 'string') return `${el.tagName.toLowerCase()}.${el.className.trim().split(/\s+/).join('.')}`;
      return el.tagName.toLowerCase();
    }
    function issue(level, type, selector, message, data = {}) {
      return { level, type, selector, message, data };
    }

    const isCover = targetName.startsWith('00_');
    const issues = [];
    const fixedPages = Array.from(document.querySelectorAll('.fixed-page'));
    if (fixedPages.length === 0) {
      issues.push(issue('error', 'missing-fixed-page', '.fixed-page', 'No .fixed-page elements were generated.'));
      return { pageCount: 0, issues };
    }

    fixedPages.forEach((fixedPage, pageIndex) => {
      const pr = rectOf(fixedPage);
      const pageLabel = `page-${String(pageIndex + 1).padStart(3, '0')}`;
      if (Math.abs(pr.width - PAGE_W) > EPS || Math.abs(pr.height - PAGE_H) > EPS) {
        issues.push(issue('error', 'wrong-page-size', `.fixed-page[${pageIndex}]`, `Expected ${PAGE_W}x${PAGE_H}, got ${Math.round(pr.width)}x${Math.round(pr.height)}.`, { pageIndex, rect: pr }));
      }

      const text = fixedPage.textContent.trim();
      if (!isCover && text.length < 50) issues.push(issue('warn', 'near-empty-page', pageLabel, 'Page has very little text content.', { pageIndex, textLength: text.length }));
      if (text.includes('固定レイアウト生成エラー') || text.includes('固定レイアウト読込エラー')) {
        issues.push(issue('error', 'fallback-page', pageLabel, 'Fallback/error page is present.', { pageIndex }));
      }

      const sheet = fixedPage.querySelector('.article-sheet');
      if (!isCover && !sheet) issues.push(issue('error', 'missing-article-sheet', pageLabel, 'Missing .article-sheet.', { pageIndex }));
      const usableHeight = sheet ? sheet.getBoundingClientRect().height : pr.height;

      fixedPage.querySelectorAll(CHECK_SELECTOR).forEach(el => {
        const r = rectOf(el);
        const selector = `${pageLabel} ${selectorOf(el)}`;
        if (r.width <= 0 || r.height <= 0) return;
        if (r.left < pr.left - BLEED || r.right > pr.right + BLEED) {
          issues.push(issue('error', 'overflow-x', selector, 'Element overflows page horizontally.', { pageIndex, rect: r, pageRect: pr }));
        }
        if (r.top < pr.top - BLEED || r.bottom > pr.bottom + BLEED) {
          issues.push(issue('error', 'overflow-y', selector, 'Element overflows page vertically.', { pageIndex, rect: r, pageRect: pr, overflowBottom: Math.max(0, r.bottom - pr.bottom) }));
        }
        const tag = el.tagName.toLowerCase();
        if (!isCover && (tag === 'table' || tag === 'figure' || tag === 'img') && r.height > usableHeight * 0.95) {
          issues.push(issue('warn', 'oversized-element', selector, 'Element is nearly as tall as the usable page area.', { pageIndex, rect: r, usableHeight }));
        }
        if ((tag === 'table' || tag === 'figure' || el.classList.contains('note-box') || el.classList.contains('warning-box')) && el.getClientRects().length > 1) {
          issues.push(issue('warn', 'split-element', selector, 'Element appears split across columns or fragments.', { pageIndex, fragments: el.getClientRects().length }));
        }
      });
    });
    return { pageCount: fixedPages.length, issues };
  }, { PAGE_W, PAGE_H, EPS, BLEED, CHECK_SELECTOR, targetName });
}

async function validateTargetInner(baseUrl, target) {
  const pageErrors = [];
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: PAGE_W, height: PAGE_H }, deviceScaleFactor: 1 });
    await context.route('**/*', route => {
      const type = route.request().resourceType();
      if (type === 'font' || type === 'media') route.abort();
      else route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(8000);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });

    await page.goto(baseUrl + toUrlPath(target.htmlPath), { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 300))]);
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    const result = await inspectPage(page, target.name);
    return { name: target.name, status: result.issues.some(i => i.level === 'error') ? 'error' : result.issues.length ? 'warn' : 'ok', pageErrors, ...result };
  } catch (error) {
    return crashResult(target, 'validator-crash', error.message, pageErrors);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function validateTarget(baseUrl, target) {
  console.log(`validate: ${target.name}`);
  return await Promise.race([
    validateTargetInner(baseUrl, target),
    timeout(ARTICLE_TIMEOUT_MS, `validate ${target.name}`)
      .then(() => null)
      .catch(error => crashResult(target, 'validator-timeout', error.message)),
  ]);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const targets = await collectTargets();
  const { server, baseUrl } = await startServer();
  const report = { pageWidth: PAGE_W, pageHeight: PAGE_H, generatedAt: new Date().toISOString(), articles: [] };
  try {
    for (const target of targets) {
      const articleReport = await validateTarget(baseUrl, target);
      report.articles.push(articleReport);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  let errors = 0;
  let warnings = 0;
  for (const article of report.articles) {
    for (const issue of article.issues) {
      if (issue.level === 'error') errors += 1;
      if (issue.level === 'warn') warnings += 1;
      console.log(`[${issue.level.toUpperCase()}] ${article.name} ${issue.type}: ${issue.message}`);
    }
  }
  console.log(`layout report: ${path.relative(ROOT, REPORT_PATH)}`);
  console.log(`layout validation: ${errors} errors, ${warnings} warnings`);
  if (errors > 0) process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
