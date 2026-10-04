import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { parseArticle, prepareArticle, verifyArticleSource, sha256, ROOT } from '../../tools/article_source.mjs';
import { syncArticle } from '../../tools/sync_article_layout.mjs';
const execute = promisify(execFile);
const article = path.join(ROOT, '202604/04_聖職者花見乱痴気騒ぎ');
const output = path.join(ROOT, 'exports/article-source-tests');
await fs.mkdir(output, { recursive: true });
const fixtureRoot = await fs.mkdtemp(path.join(ROOT, '.article-source-fixtures-'));
const results = [];
const figure = '<figure>\n  <img src="./scene.png" alt="Selected scene">\n  <figcaption>Selected scene caption.</figcaption>\n</figure>';
const basic = '# Title\n\n## Subtitle\n\nThe first paragraph.\n\n' + figure + '\n';
async function snapshot(dir) {
  const files = {};
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const name = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(name);
      else files[path.relative(dir, name)] = sha256(await fs.readFile(name));
    }
  }
  await walk(dir); return files;
}
async function fixture(name, markdown = basic) {
  const dir = path.join(fixtureRoot, name);
  await fs.mkdir(dir);
  await fs.cp(path.join(article, 'fonts'), path.join(dir, 'fonts'), { recursive: true });
  await fs.writeFile(path.join(dir, 'layout-source.json'), JSON.stringify({ version: 1, template: 'illustrated-article-v1', source: 'Article.md' }));
  await fs.writeFile(path.join(dir, 'Article.md'), markdown);
  const image = new PNG({ width: 1536, height: 1024 }); image.data.fill(150);
  await fs.writeFile(path.join(dir, 'scene.png'), PNG.sync.write(image));
  await fs.writeFile(path.join(dir, 'fixed_layout.html'), 'old HTML retained on failure');
  for (const folder of ['pages', 'intermediate']) {
    await fs.mkdir(path.join(dir, folder));
    await fs.writeFile(path.join(dir, folder, 'sentinel'), 'old output');
  }
  return dir;
}
async function cli(dir, args = []) {
  try {
    const out = await execute(process.execPath, ['tools/build_article.mjs', path.relative(ROOT, dir), ...args], { cwd: ROOT, env: process.env, timeout: 55000, maxBuffer: 3e6 });
    return { code: 0, ...out };
  } catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
async function check(name, task) {
  const start = Date.now();
  try { const detail = await task(); results.push({ name, ok: true, ms: Date.now() - start, ...detail }); console.log(name + ': PASS'); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error(name + ': FAIL ' + error.message); }
}
let browser, server, sourceOverride = null, htmlOverride = null;
try {
  await check('real article: source, selected images, six pages, read-only check', async () => {
    const before = await snapshot(article);
    const sync = await verifyArticleSource(article); assert.equal(sync.status, 'verified');
    const result = await cli(article, ['--check-only']); assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout); assert.equal(report.composition.sourceBlocks, 45); assert.equal(report.composition.selectedImages, 5);
    assert.equal(report.composition.pages.length, 6); assert.equal(report.layoutSafety.issues.length, 0);
    assert(report.composition.pages.every(p => p.imageToText > 1)); assert.deepEqual(await snapshot(article), before);
    return { composition: report.composition, environment: report.environment };
  });
  await check('candidate preflight does not replace HTML or outputs', async () => {
    const dir = await fixture('readonly'); const before = await snapshot(dir);
    const result = await syncArticle(dir, { checkOnly: true }); assert(result.ok); assert.deepEqual(await snapshot(dir), before);
  });
  await check('paragraph and table split preserve all source content and repeat selected image', async () => {
    const table = '| Column | Value |\n|---|---|\n' + Array.from({ length: 45 }, (_, i) => `| row ${i} | value ${i} |`).join('\n');
    const dir = await fixture('split', '# Title\n\n## Subtitle\n\n' + 'A long paragraph. '.repeat(280) + '\n\n' + figure + '\n\n### Table heading\n\n' + table + '\n');
    const report = await syncArticle(dir);
    assert(report.composition.pages.length > 3); assert(report.composition.ok); assert(report.composition.pages.slice(1).every(p => p.repeated));
    const out = await cli(dir, ['--check-only']); assert.equal(out.code, 0, out.stderr);
    return { pages: report.composition.pages.length };
  });
  await check('oversized heading stops and preserves old HTML/PNG', async () => {
    const dir = await fixture('oversized', basic.replace('# Title', '# ' + 'Title '.repeat(1000)));
    const before = await snapshot(dir); await assert.rejects(syncArticle(dir), /cannot fit/); assert.deepEqual(await snapshot(dir), before);
  });
  await check('unsupported syntax and multiple/missing selected images fail closed', async () => {
    for (const bad of ['**bold**', '![image](foo.png)', '<script>alert(1)</script>', '- list', '[link](a)', '|x|\n|---|\n|x|y|']) {
      assert.throws(() => parseArticle(basic + '\n' + bad), /Markdown line/);
    }
    assert.throws(() => parseArticle(basic + '\n' + figure), /exactly one/);
    assert.throws(() => parseArticle('# Title\n\n## Subtitle\n\nText'), /exactly one/);
  });
  await check('missing image and missing font glyph preserve old outputs', async () => {
    const dir = await fixture('missing'); await fs.unlink(path.join(dir, 'scene.png'));
    let before = await snapshot(dir); await assert.rejects(syncArticle(dir), /ENOENT/); assert.deepEqual(await snapshot(dir), before);
    await fs.writeFile(path.join(dir, 'Article.md'), basic + '\n龘\n');
    before = await snapshot(dir); await assert.rejects(syncArticle(dir), /Bundled font lacks/); assert.deepEqual(await snapshot(dir), before);
  });
  await check('Markdown, image and generated HTML changes block stale export', async () => {
    const dir = await fixture('stale'); await syncArticle(dir);
    for (const [name, edit] of [['Article.md', bytes => Buffer.from(bytes.toString().replace('first', 'new'))], ['scene.png', bytes => Buffer.concat([bytes, Buffer.from('changed')])], ['fixed_layout.html', bytes => Buffer.from(bytes.toString().replace('#a12e36', '#000000'))]]) {
      const file = path.join(dir, name), original = await fs.readFile(file); await fs.writeFile(file, edit(original));
      const before = await snapshot(dir), out = await cli(dir);
      assert.notEqual(out.code, 0); assert.match(out.stderr, /Stale fixed_layout/); assert.deepEqual(await snapshot(dir), before);
      await fs.writeFile(file, original);
    }
  });
  await check('valid generated article PNG has source hashes and PNG hash', async () => {
    const dir = await fixture('export'); await syncArticle(dir);
    const out = await cli(dir); assert.equal(out.code, 0, out.stderr);
    const report = JSON.parse(await fs.readFile(path.join(dir, 'intermediate/article_manifest.json')));
    assert.equal(report.sourceSync.status, 'verified'); assert(report.composition.ok);
    assert.equal(report.pages.length, 1);
    const bytes = await fs.readFile(path.join(dir, report.pages[0].file)), png = PNG.sync.read(bytes);
    assert.equal(png.width, 1456); assert.equal(png.height, 2056); assert.equal(sha256(bytes), report.pages[0].sha256);
  });
  server = http.createServer(async (req, res) => {
    try {
      const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
      const file = path.resolve(ROOT, relative || 'index.html');
      if (!file.startsWith(ROOT + path.sep)) throw Error('outside');
      const bytes = sourceOverride && file === path.join(article, '聖職者花見乱痴気騒ぎ.md') ? sourceOverride : htmlOverride && file === path.join(article, 'fixed_layout.html') ? htmlOverride : await fs.readFile(file);
      const mime = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain;charset=utf-8' }[path.extname(file)];
      res.writeHead(200, { 'Content-Type': mime || 'application/octet-stream' }); res.end(bytes);
    } catch { res.writeHead(404); res.end('missing'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PREVIEW_CHROMIUM || undefined, args: ['--no-sandbox', '--disable-gpu'] });
  await check('live composition audit detects removed text and overlapping blocks', async () => {
    const page = await browser.newPage();
    await page.goto(base + '/' + path.relative(ROOT, article) + '/fixed_layout.html');
    await page.waitForFunction(() => window.__articleComposition?.status === 'ready');
    assert((await page.evaluate(() => window.auditArticleComposition())).ok);
    const report = await page.evaluate(() => {
      document.querySelector('.article-body p').textContent = 'missing text';
      return window.auditArticleComposition();
    }); assert(!report.ok); assert(report.errors.some(e => /text loss/.test(e)));
    await page.reload(); await page.waitForFunction(() => window.__articleComposition?.status === 'ready');
    assert(!(await page.evaluate(() => { document.querySelector('.article-body p').style.marginTop = '-80px'; return window.auditArticleComposition(); })).ok);
    await page.close();
  });
  await check('preview matches all six PNGs and blocks a stale Markdown reload', async () => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 2450 }, deviceScaleFactor: 1 });
    await page.goto(base + '/index.html');
    await page.locator('#source').fill(path.relative(ROOT, article) + '/fixed_layout.html'); await page.locator('#reload').click();
    await page.waitForFunction(() => document.querySelector('#layout-status').dataset.state === 'passed' && document.querySelector('#page-number').options.length === 6, { timeout: 20000 });
    await page.locator('#zoom').selectOption('1');
    const frame = page.frames().find(frame => frame.url() === 'about:srcdoc'); assert(frame);
    const diff = [];
    for (let i = 0; i < 6; i++) {
      await page.locator('#page-number').selectOption(String(i));
      const actual = PNG.sync.read(await frame.locator('.fixed-page').nth(i).screenshot());
      const expected = PNG.sync.read(await fs.readFile(path.join(article, 'pages', String(i + 1).padStart(3, '0') + '.png')));
      assert.equal(actual.width, expected.width); assert.equal(actual.height, expected.height);
      let changed = 0, difference = 0;
      for (let j = 0; j < actual.data.length; j += 4) {
        let delta = 0; for (let c = 0; c < 3; c++) delta += Math.abs(actual.data[j + c] - expected.data[j + c]);
        if (delta) changed++; difference += delta;
      }
      const ratio = changed / (actual.width * actual.height), mae = difference / (actual.width * actual.height * 3);
      assert(ratio < .01 && mae < .1, `page ${i + 1}: ${ratio} ${mae}`); diff.push({ page: i + 1, changedRatio: ratio, meanAbsoluteError: mae });
    }
    await page.locator('#page-number').selectOption('0'); await page.locator('#zoom').selectOption('0.5');
    await page.screenshot({ path: path.join(output, 'preview.png') });
    sourceOverride = Buffer.from((await fs.readFile(path.join(article, '聖職者花見乱痴気騒ぎ.md'), 'utf8')) + '\nChanged\n');
    await page.locator('#reload').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('固定HTMLが古く'));
    assert.equal(await page.locator('#paper iframe').count(), 0); sourceOverride = null;
    htmlOverride = Buffer.from((await fs.readFile(path.join(article, 'fixed_layout.html'), 'utf8')).replace('#a12e36', '#000000'));
    await page.locator('#reload').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('生成後に固定HTMLが変更'));
    assert.equal(await page.locator('#paper iframe').count(), 0); htmlOverride = null; await page.close();
    return { diff };
  });
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ results, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length }, null, 2) + '\n');
if (results.some(r => !r.ok)) process.exitCode = 1;
