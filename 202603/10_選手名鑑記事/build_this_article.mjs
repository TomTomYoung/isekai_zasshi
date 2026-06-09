import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const ARTICLE_DIR = path.dirname(__filename);
const ROOT = path.resolve(ARTICLE_DIR, '../..');
const ARTICLE_NAME = path.basename(ARTICLE_DIR);
const FIXED_LAYOUT_HTML = path.join(ARTICLE_DIR, 'fixed_layout.html');
const OUT_DIR = path.join(ARTICLE_DIR, 'build');
const FIXED_EXPORT_DIR = path.join(ROOT, 'exports', 'fixed_layout_images');
const KINDLE_EXPORT_DIR = path.join(ROOT, 'exports', 'kindle_pages');
const PAGE_SELECTOR = '.fixed-page';
const VIEWPORT_WIDTH = 1456;
const VIEWPORT_HEIGHT = 2056;
const PAGE_NAME_PATTERN = /^\d{2}_.+_\d{3}\.png$/i;

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
]);

function toUrlPath(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return '/' + rel;
}

function outputName(index) {
  return `${ARTICLE_NAME}_${String(index + 1).padStart(3, '0')}.png`;
}

function pageKeyFromName(name) {
  if (!PAGE_NAME_PATTERN.test(name)) return null;

  const articleMatch = name.match(/^(\d{2})_/);
  const pageMatch = name.match(/_(\d{3})\.png$/i);
  if (!articleMatch || !pageMatch) return null;

  return { article: Number(articleMatch[1]), page: Number(pageMatch[1]) };
}

function comparePages(a, b) {
  if (a.key.article !== b.key.article) return a.key.article - b.key.article;
  if (a.key.page !== b.key.page) return a.key.page - b.key.page;
  return a.name.localeCompare(b.name, 'ja');
}

async function ensureExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
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

async function cleanLocalBuildDir() {
  await cleanDir(OUT_DIR);
}

async function removeArticleFixedExports() {
  await fs.mkdir(FIXED_EXPORT_DIR, { recursive: true });
  const names = await fs.readdir(FIXED_EXPORT_DIR).catch(() => []);
  const prefix = `${ARTICLE_NAME}_`;
  for (const name of names) {
    if (name.startsWith(prefix) && name.toLowerCase().endsWith('.png')) {
      await fs.rm(path.join(FIXED_EXPORT_DIR, name), { force: true });
      console.log(`removed stale fixed export: ${path.relative(ROOT, path.join(FIXED_EXPORT_DIR, name))}`);
    }
  }
}

async function copyBuildToFixedExports(outputPaths) {
  await removeArticleFixedExports();
  for (const src of outputPaths) {
    const dest = path.join(FIXED_EXPORT_DIR, path.basename(src));
    await fs.copyFile(src, dest);
    console.log(`fixed export: ${path.relative(ROOT, dest)}`);
  }
}

async function rebuildKindlePagesFromFixedExports() {
  if (!(await exists(FIXED_EXPORT_DIR))) {
    throw new Error(`Missing source directory: ${path.relative(ROOT, FIXED_EXPORT_DIR)}`);
  }

  const ignored = [];
  const pages = (await fs.readdir(FIXED_EXPORT_DIR))
    .filter(name => name.toLowerCase().endsWith('.png'))
    .map(name => ({ name, key: pageKeyFromName(name) }))
    .filter(item => {
      if (item.key !== null) return true;
      ignored.push(item.name);
      return false;
    })
    .sort(comparePages);

  if (pages.length === 0) {
    throw new Error(`No fixed layout PNG pages found in ${path.relative(ROOT, FIXED_EXPORT_DIR)}`);
  }

  await cleanDir(KINDLE_EXPORT_DIR);

  for (const name of ignored) {
    console.warn(`ignored stale/non-page PNG: ${name}`);
  }

  for (let i = 0; i < pages.length; i += 1) {
    const src = path.join(FIXED_EXPORT_DIR, pages[i].name);
    const outName = `${String(i + 1).padStart(4, '0')}.png`;
    const dest = path.join(KINDLE_EXPORT_DIR, outName);
    await fs.copyFile(src, dest);
    console.log(`kindle page: ${pages[i].name} -> ${path.relative(ROOT, dest)}`);
  }

  console.log(`prepared ${pages.length} Kindle pages in ${path.relative(ROOT, KINDLE_EXPORT_DIR)}`);
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

async function waitForAssets(page) {
  await page.evaluate(async () => {
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
  });
}

async function main() {
  await ensureExists(FIXED_LAYOUT_HTML, 'fixed_layout.html');
  await cleanLocalBuildDir();

  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  const outputPaths = [];

  try {
    const page = await browser.newPage({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1,
    });

    page.on('pageerror', error => {
      console.warn(`page error: ${error.message}`);
    });
    page.on('console', message => {
      if (message.type() === 'error') console.warn(`browser console error: ${message.text()}`);
    });

    const url = baseUrl + toUrlPath(FIXED_LAYOUT_HTML);
    console.log(`open: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(500);
    await waitForAssets(page);

    const pages = await page.locator(PAGE_SELECTOR).all();
    if (pages.length === 0) {
      throw new Error(`No ${PAGE_SELECTOR} elements generated.`);
    }

    for (let i = 0; i < pages.length; i += 1) {
      const outputPath = path.join(OUT_DIR, outputName(i));
      await pages[i].screenshot({ path: outputPath, animations: 'disabled', timeout: 15000 });
      outputPaths.push(outputPath);
      console.log(`local build: ${path.relative(ROOT, outputPath)}`);
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  await copyBuildToFixedExports(outputPaths);
  await rebuildKindlePagesFromFixedExports();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
