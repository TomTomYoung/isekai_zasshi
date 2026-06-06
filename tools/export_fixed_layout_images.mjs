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

function toUrlPath(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return '/' + rel;
}

function safeBaseName(articleDir) {
  return path.basename(articleDir).replace(/[\\/:*?"<>|]/g, '_');
}

function outputName(articleDir, index, count) {
  const base = safeBaseName(articleDir);
  if (count <= 1) return `${base}_001.png`;
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

async function waitForAssets(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await Promise.all(Array.from(document.images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  });
}

async function exportTarget(page, baseUrl, target) {
  const url = baseUrl + toUrlPath(target.htmlPath);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(PAGE_SELECTOR, { state: 'visible' });
  await waitForAssets(page);

  const locators = await page.locator(PAGE_SELECTOR).all();
  const outputs = [];
  for (let i = 0; i < locators.length; i += 1) {
    const outputPath = path.join(OUT_DIR, outputName(target.dir, i, locators.length));
    await locators[i].screenshot({ path: outputPath, animations: 'disabled' });
    outputs.push(outputPath);
  }
  return outputs;
}

async function main() {
  const targets = await collectTargets();
  if (targets.length === 0) {
    throw new Error('No fixed_layout.html files found under 202603 article folders.');
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }, deviceScaleFactor: 1 });
    for (const target of targets) {
      const outputPaths = await exportTarget(page, baseUrl, target);
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
