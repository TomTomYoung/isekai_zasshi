import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { chromium } from 'playwright';

const ARTICLE_DIR = process.cwd();
const HTML_PATH = path.join(ARTICLE_DIR, 'fixed_layout.html');
const OUT_DIR = path.join(ARTICLE_DIR, 'preview');
const PAGE_SELECTOR = '.fixed-page';
const VIEWPORT_WIDTH = 1456;
const VIEWPORT_HEIGHT = 2056;
const WAIT_AFTER_LOAD_MS = 500;
const FAIL_ON_BROKEN_IMAGE = process.argv.includes('--fail-on-broken-image');

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

async function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const packageJson = path.join(current, 'package.json');
    const gitDir = path.join(current, '.git');
    if (await exists(packageJson) || await exists(gitDir)) return current;

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Repository root not found from: ${startDir}`);
    }
    current = parent;
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

function toUrlPath(rootDir, filePath) {
  const rel = path.relative(rootDir, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return '/' + rel;
}

function rel(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function startServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const normalizedPath = path.normalize(rawPath).replace(/^([/\\])+/, '');
      const filePath = path.join(rootDir, normalizedPath);

      if (!filePath.startsWith(rootDir)) {
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
        setTimeout(done, 2500);
      });
    }));

    await new Promise(resolve => requestAnimationFrame(resolve));
  });
}

async function readImageStatus(page) {
  return await page.evaluate(() => {
    const images = Array.from(document.images);
    const broken = images
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => ({
        src: img.currentSrc || img.src || img.getAttribute('src') || '',
        attr: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
      }));

    return {
      total: images.length,
      broken,
    };
  });
}

async function main() {
  const rootDir = await findRepoRoot(ARTICLE_DIR);

  const htmlStat = await fs.stat(HTML_PATH).catch(() => null);
  if (!htmlStat || !htmlStat.isFile()) {
    throw new Error(`fixed_layout.html not found: ${rel(rootDir, HTML_PATH)}`);
  }

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const { server, baseUrl } = await startServer(rootDir);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1,
    });

    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(12000);

    page.on('console', message => {
      if (message.type() === 'error') console.warn(`browser console error: ${message.text()}`);
    });
    page.on('pageerror', error => {
      console.warn(`page error: ${error.message}`);
    });

    const url = baseUrl + toUrlPath(rootDir, HTML_PATH);
    console.log(`article: ${rel(rootDir, ARTICLE_DIR)}`);
    console.log(`open: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(WAIT_AFTER_LOAD_MS);
    await waitForAssets(page);

    const pageCount = await page.locator(PAGE_SELECTOR).count();
    if (pageCount === 0) {
      throw new Error(`No ${PAGE_SELECTOR} found in fixed_layout.html.`);
    }

    const imageStatus = await readImageStatus(page);
    console.log(`fixed pages: ${pageCount}`);
    console.log(`images: ${imageStatus.total}`);
    console.log(`broken images: ${imageStatus.broken.length}`);

    if (imageStatus.broken.length > 0) {
      for (const item of imageStatus.broken) {
        console.warn(`- ${item.attr || item.src}${item.alt ? ` (${item.alt})` : ''}`);
      }
      if (FAIL_ON_BROKEN_IMAGE) {
        throw new Error('Broken images found.');
      }
    }

    const pages = await page.locator(PAGE_SELECTOR).all();
    for (let i = 0; i < pages.length; i += 1) {
      const outputPath = path.join(OUT_DIR, `${String(i + 1).padStart(3, '0')}.png`);
      await pages[i].screenshot({ path: outputPath, animations: 'disabled', timeout: 12000 });
      console.log(`exported: ${rel(rootDir, outputPath)}`);
    }

    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  console.log(`preview images: ${rel(rootDir, OUT_DIR)}`);
  console.log('done');
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
