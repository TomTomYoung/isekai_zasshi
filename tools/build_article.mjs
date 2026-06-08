import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PAGE_SELECTOR = '.fixed-page';
const VIEWPORT_WIDTH = 1456;
const VIEWPORT_HEIGHT = 2056;
const TARGET_TIMEOUT_MS = 25000;

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
  console.error('usage: node tools/build_article.mjs <issue/article-dir>');
  console.error('example: node tools/build_article.mjs 202603/06_裏賭博場実態記事');
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function safeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
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

async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
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
      if (!address || typeof address === 'string') {
        reject(new Error('Could not start local server.'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function attachPageLogging(page, targetName) {
  page.on('pageerror', error => {
    console.warn(`page error: ${targetName}: ${error.message}`);
  });
  page.on('console', message => {
    if (message.type() === 'error') {
      console.warn(`browser console error: ${targetName}: ${message.text()}`);
    }
  });
}

async function waitForAssets(page) {
  await withTimeout(page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise(resolve => setTimeout(resolve, 1500)),
      ]);
    }

    await Promise.all(Array.from(document.images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 2000);
      });
    }));

    await new Promise(resolve => requestAnimationFrame(resolve));
  }), 5000, 'waitForAssets');
}

async function collectGeometry(page) {
  return await page.evaluate(selector => {
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
  }, PAGE_SELECTOR);
}

async function ensureFixedPage(page, targetName) {
  const count = await withTimeout(page.locator(PAGE_SELECTOR).count(), 3000, 'count fixed pages');
  if (count > 0) return false;

  await withTimeout(page.evaluate(({ targetName, width, height }) => {
    document.body.innerHTML = '';
    document.documentElement.style.margin = '0';
    document.body.style.margin = '0';
    document.body.style.background = '#c8beb0';

    const fixedPage = document.createElement('main');
    fixedPage.className = 'fixed-page export-fallback-page';
    fixedPage.style.width = `${width}px`;
    fixedPage.style.height = `${height}px`;
    fixedPage.style.boxSizing = 'border-box';
    fixedPage.style.margin = '0 auto';
    fixedPage.style.padding = '86px 66px 72px';
    fixedPage.style.overflow = 'hidden';
    fixedPage.style.background = '#f4ecd2';
    fixedPage.style.borderLeft = '14px solid #111';
    fixedPage.style.borderRight = '14px solid #111';
    fixedPage.innerHTML = `
      <section class="article-sheet" style="font-family: sans-serif; font-size: 34px; line-height: 1.5;">
        <header style="border: 8px solid #111; background: #fff4b8; padding: 24px; box-shadow: 10px 10px 0 #111;">
          <div style="display:inline-block; padding:8px 16px; background:#c40018; color:white; font-weight:900;">記事単位固定レイアウト生成エラー</div>
          <h1 style="font-size:64px; line-height:1.1;">${targetName}</h1>
        </header>
        <div style="margin-top:32px; padding:24px; border:6px solid #c40018; background:#ffe2df; font-weight:700;">
          <p>.fixed-page が生成されなかったため、記事単位ビルド側でフォールバック紙面を生成しました。</p>
          <p>該当記事の fixed_layout.html、元記事HTML名、画像パスを確認してください。</p>
        </div>
      </section>`;
    document.body.appendChild(fixedPage);
  }, { targetName, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }), 5000, 'create fallback fixed page');
  return true;
}

async function copyIntermediate(articleDir, intermediateDir) {
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
  const mdPath = path.join(articleDir, `${articleName}.md`);
  if (await exists(mdPath)) {
    const md = await fs.readFile(mdPath, 'utf8');
    await fs.writeFile(path.join(intermediateDir, 'article.md'), md, 'utf8');
  }
}

async function exportArticle(articleDir) {
  const articleName = path.basename(articleDir);
  const intermediateDir = path.join(articleDir, 'intermediate');
  const pagesDir = path.join(articleDir, 'pages');
  const fixedLayoutPath = path.join(articleDir, 'fixed_layout.html');

  await cleanDir(intermediateDir);
  await cleanDir(pagesDir);
  await copyIntermediate(articleDir, intermediateDir);

  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(12000);
  attachPageLogging(page, articleName);

  const result = {
    article: articleName,
    articleDir: path.relative(ROOT, articleDir).split(path.sep).join('/'),
    sourceHtml: path.relative(ROOT, fixedLayoutPath).split(path.sep).join('/'),
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    fallback: false,
    pages: [],
  };

  try {
    const url = baseUrl + toUrlPath(fixedLayoutPath);
    await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }), 12000, 'goto');
    await page.waitForTimeout(500);
    result.fallback = await ensureFixedPage(page, articleName);

    try {
      await waitForAssets(page);
    } catch (error) {
      console.warn(`asset wait skipped: ${articleName}: ${error.message}`);
    }

    const geometry = await collectGeometry(page);
    await fs.writeFile(path.join(intermediateDir, 'layout_report.json'), JSON.stringify({ article: articleName, pages: geometry }, null, 2), 'utf8');

    const locators = await withTimeout(page.locator(PAGE_SELECTOR).all(), 5000, 'collect fixed pages');
    if (locators.length === 0) {
      throw new Error('No .fixed-page elements available after fallback.');
    }

    for (let i = 0; i < locators.length; i += 1) {
      const fileName = `${String(i + 1).padStart(3, '0')}.png`;
      const outputPath = path.join(pagesDir, fileName);
      await withTimeout(locators[i].screenshot({ path: outputPath, animations: 'disabled', timeout: 12000 }), 15000, `screenshot ${i + 1}`);
      result.pages.push({
        articlePage: i + 1,
        file: `pages/${fileName}`,
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
      });
      console.log(`exported: ${path.relative(ROOT, outputPath)}`);
    }

    await fs.writeFile(path.join(intermediateDir, 'article_manifest.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(`article manifest: ${path.relative(ROOT, path.join(intermediateDir, 'article_manifest.json'))}`);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    usage();
    process.exit(1);
  }

  const articleDir = path.resolve(ROOT, arg);
  if (!articleDir.startsWith(ROOT)) {
    throw new Error(`Article dir escapes repository root: ${articleDir}`);
  }

  const stat = await fs.stat(articleDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Article dir not found: ${articleDir}`);
  }

  await withTimeout(exportArticle(articleDir), TARGET_TIMEOUT_MS, `build article ${path.basename(articleDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
