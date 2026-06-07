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
const OUT_DIR = path.join(ROOT, 'exports', 'fixed_layout_images');
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

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function toUrlPath(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return '/' + rel;
}

function safeBaseName(articleDir) {
  return path.basename(articleDir).replace(/[\\/:*?"<>|]/g, '_');
}

function outputName(articleDir, index) {
  const base = safeBaseName(articleDir);
  return `${base}_${String(index + 1).padStart(3, '0')}.png`;
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

async function collectTargets() {
  const entries = await fs.readdir(ISSUE_DIR, { withFileTypes: true });
  const dirs = entries
    .filter(entry => entry.isDirectory() && /^\d{2}_/.test(entry.name))
    .map(entry => path.join(ISSUE_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b, 'ja'));

  const targets = [];
  for (const dir of dirs) {
    const htmlPath = path.join(dir, 'fixed_layout.html');
    if (await exists(htmlPath)) {
      targets.push({ dir, htmlPath });
    }
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
    if (message.type() === 'error') console.warn(`browser console error: ${targetName}: ${message.text()}`);
  });
}

async function newExportPage(browser, targetName) {
  const page = await browser.newPage({ viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(12000);
  attachPageLogging(page, targetName);
  return page;
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

async function ensureFixedPage(page, targetName) {
  const count = await withTimeout(page.locator(PAGE_SELECTOR).count(), 3000, 'count fixed pages');
  if (count > 0) return;

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
          <div style="display:inline-block; padding:8px 16px; background:#c40018; color:white; font-weight:900;">固定レイアウト生成エラー</div>
          <h1 style="font-size:64px; line-height:1.1;">${targetName}</h1>
        </header>
        <div style="margin-top:32px; padding:24px; border:6px solid #c40018; background:#ffe2df; font-weight:700;">
          <p>.fixed-page が生成されなかったため、書き出し側でフォールバック紙面を生成しました。</p>
          <p>該当記事の fixed_layout.html 内スクリプト、元記事HTML名、画像パスを確認してください。</p>
        </div>
      </section>`;
    document.body.appendChild(fixedPage);
  }, { targetName, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }), 5000, 'create fallback fixed page');
}

async function exportFallbackOnly(browser, target, reason) {
  const targetName = safeBaseName(target.dir);
  console.warn(`fallback: ${targetName}: ${reason}`);
  const page = await newExportPage(browser, `${targetName}:fallback`);
  try {
    await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
    await ensureFixedPage(page, targetName);
    const outputPath = path.join(OUT_DIR, outputName(target.dir, 0));
    await page.locator(PAGE_SELECTOR).first().screenshot({ path: outputPath, animations: 'disabled', timeout: 10000 });
    return [outputPath];
  } finally {
    await page.close().catch(() => {});
  }
}

async function exportTarget(browser, baseUrl, target) {
  const url = baseUrl + toUrlPath(target.htmlPath);
  const targetName = safeBaseName(target.dir);
  console.log(`start: ${targetName}`);

  const page = await newExportPage(browser, targetName);
  try {
    await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }), 12000, 'goto');
    await page.waitForTimeout(500);
    await ensureFixedPage(page, targetName);

    try {
      await waitForAssets(page);
    } catch (error) {
      console.warn(`asset wait skipped: ${targetName}: ${error.message}`);
    }

    const locators = await withTimeout(page.locator(PAGE_SELECTOR).all(), 5000, 'collect fixed pages');
    if (locators.length === 0) {
      await page.close().catch(() => {});
      return await exportFallbackOnly(browser, target, 'no .fixed-page after fallback');
    }

    const outputs = [];
    for (let i = 0; i < locators.length; i += 1) {
      const outputPath = path.join(OUT_DIR, outputName(target.dir, i));
      await withTimeout(locators[i].screenshot({ path: outputPath, animations: 'disabled', timeout: 12000 }), 15000, `screenshot ${i + 1}`);
      outputs.push(outputPath);
    }
    return outputs;
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const targets = await collectTargets();
  if (targets.length === 0) {
    throw new Error('No fixed_layout.html files found under 202603 article folders.');
  }

  await cleanDir(OUT_DIR);
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();

  try {
    for (const target of targets) {
      const targetName = safeBaseName(target.dir);
      const outputPaths = await withTimeout(exportTarget(browser, baseUrl, target), TARGET_TIMEOUT_MS, `export ${targetName}`)
        .catch(error => exportFallbackOnly(browser, target, error.message));
      for (const outputPath of outputPaths) {
        console.log(`exported: ${path.relative(ROOT, outputPath)}`);
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
