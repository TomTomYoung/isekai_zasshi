import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import safety from '../../preview/layout_safety.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.resolve(process.env.LAYOUT_SAFETY_TEST_OUTPUT || path.join(root, 'exports/layout-safety-tests'));
const executablePath = process.env.LAYOUT_SAFETY_CHROMIUM || process.env.PREVIEW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath, args: ['--no-sandbox', '--disable-gpu'] } : {})
});
const page = await browser.newPage({ viewport: { width: 1456, height: 2056 }, deviceScaleFactor: 1 });
const results = [];

function fixture(body, css = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0}.fixed-page{position:relative;width:1456px;height:2056px;box-sizing:border-box;overflow:hidden}
    ${css}
    </style></head><body><main class="fixed-page">${body}</main></body></html>`;
}
async function inspect(html, options = {}) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(safety.inspect, options);
}
function has(report, type, origin) {
  return report.issues.some(issue => issue.level === 'error' && issue.type === type && (!origin || issue.data.origin === origin));
}
async function test(name, work) {
  try {
    const detail = await work();
    results.push({ name, passed: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.stack || String(error) });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  await test('exact 28px perimeter is accepted without changing the document', async () => {
    const html = fixture('<div id="boundary"></div>', '#boundary{position:absolute;left:28px;top:28px;width:1400px;height:2000px}');
    await page.setContent(html);
    const before = await page.content();
    const report = await page.evaluate(safety.inspect, {});
    assert.equal(report.ok, true);
    assert.deepEqual(report.pages[0].clearance, { top: 28, right: 28, bottom: 28, left: 28 });
    assert.equal(await page.content(), before);
    return report.pages[0].clearance;
  });
  await test('safety buffer is a measured threshold and can be increased', async () => {
    const html = fixture('<div id="boundary"></div>', '#boundary{position:absolute;left:28px;top:28px;width:1400px;height:2000px}');
    const report = await inspect(html, { safetyPx: 40 });
    assert.equal(report.ok, false);
    assert.equal(has(report, 'insufficient-clearance'), true);
    assert.equal(report.safetyPx, 40);
    return { requested: 40, measured: report.pages[0].clearance };
  });
  await test('the 28px threshold rejects both 26px and 27.6px despite geometry tolerance', async () => {
    const html = x => fixture('<div id="boundary"></div>', `#boundary{position:absolute;left:${x}px;top:80px;width:200px;height:80px}`);
    assert.equal(has(await inspect(html(26)), 'insufficient-clearance'), true);
    assert.equal(has(await inspect(html(27.6)), 'insufficient-clearance'), true);
    assert.equal((await inspect(html(28))).ok, true);
  });
  await test('20px page overflow is rejected even inside the old 24px allowance', async () => {
    const report = await inspect(fixture('<div id="past-bottom"></div>', '#past-bottom{position:absolute;left:80px;top:1956px;width:200px;height:120px}'));
    assert.equal(report.ok, false);
    assert.equal(has(report, 'page-overflow'), true);
    assert.equal(report.pages[0].clearance.bottom, -20);
    return { bottomClearance: report.pages[0].clearance.bottom, types: report.issues.map(issue => issue.type) };
  });
  await test('an inner overflow:hidden clips content while all boxes remain inside the page', async () => {
    const report = await inspect(fixture('<div id="clip"><div id="tall">content</div></div>', '#clip{position:absolute;left:80px;top:80px;width:400px;height:100px;overflow:hidden}#tall{height:200px}'));
    assert.equal(has(report, 'page-overflow'), false);
    assert.equal(has(report, 'clipped-content', 'element'), true);
    assert.equal(report.ok, false);
  });
  await test('an outer wrapper can clip text that still fits within its fixed page', async () => {
    const html = fixture('<p id="late">late content</p>', '#late{position:absolute;left:80px;top:1400px;margin:0;width:400px;height:100px}#wrapper{height:900px;overflow:hidden}')
      .replace('<main class="fixed-page">', '<div id="wrapper"><main class="fixed-page">')
      .replace('</main>', '</main></div>');
    const report = await inspect(html);
    assert.equal(has(report, 'page-overflow'), false);
    assert.equal(report.issues.some(issue => issue.type === 'clipped-content' && issue.data.clippingAncestor === 'div#wrapper' && issue.data.origin === 'text'), true);
    assert.equal(report.ok, false);
  });
  await test('the document viewport does not falsely clip later pages', async () => {
    for (const css of ['html{overflow:hidden}', 'body{overflow:hidden}']) {
      const html = fixture('<div class="box"></div>', '.box{position:absolute;left:80px;top:1400px;width:400px;height:100px}' + css)
        .replace('</body>', '<main class="fixed-page"><div class="box"></div></main></body>');
      const report = await inspect(html);
      assert.equal(report.pageCount, 2);
      assert.equal(report.ok, true);
      assert.equal(has(report, 'clipped-content'), false);
    }
  });
  await test('paint containment and legacy clip are explicit measurement limitations', async () => {
    for (const contain of ['paint', 'strict', 'content']) {
      const report = await inspect(fixture('<div id="contain"><div id="child">content</div></div>', `#contain{position:absolute;left:80px;top:80px;width:400px;height:100px;contain:${contain}}#child{position:absolute;top:120px;width:400px;height:80px}`));
      assert.equal(report.issues.some(issue => issue.type === 'unmeasured-paint' && issue.data.features.some(feature => feature.startsWith('contain:'))), true);
      assert.equal(report.ok, true);
      assert.ok(report.limitations.some(item => item.includes('contain:paint')));
    }
    const legacy = await inspect(fixture('<div id="legacy">content</div>', '#legacy{position:absolute;left:80px;top:80px;width:400px;height:100px;clip:rect(0px, 200px, 50px, 0px)}'));
    assert.equal(legacy.issues.some(issue => issue.type === 'unmeasured-paint' && issue.data.features.includes('clip')), true);
  });
  await test('nowrap text is inspected as line rectangles, not only its paragraph box', async () => {
    const report = await inspect(fixture(`<p id="line">${'W'.repeat(200)}</p>`, '#line{position:absolute;left:80px;top:80px;margin:0;width:500px;white-space:nowrap;font:40px monospace}'));
    assert.equal(has(report, 'page-overflow', 'element'), false);
    assert.equal(has(report, 'page-overflow', 'text'), true);
    assert.equal(report.ok, false);
    return { textFragments: report.pages[0].textFragments, rightClearance: report.pages[0].clearance.right };
  });
  await test('text cut by its own paragraph is rejected even when its parent is safe', async () => {
    const report = await inspect(fixture(`<p id="line">${'W'.repeat(80)}</p>`, '#line{position:absolute;left:80px;top:80px;margin:0;width:500px;overflow:hidden;white-space:nowrap;font:30px monospace}'));
    assert.equal(has(report, 'clipped-content', 'text'), true);
    assert.equal(report.ok, false);
  });
  await test('scrollable content is rejected when a still PNG would hide its bottom', async () => {
    const report = await inspect(fixture('<div id="scroll"><div id="tall">content</div></div>', '#scroll{position:absolute;left:80px;top:80px;width:400px;height:100px;overflow:auto}#tall{height:200px}'));
    assert.equal(has(report, 'clipped-content'), true);
    assert.equal(report.ok, false);
  });
  await test('object-fit cover inside an equally sized image box remains valid', async () => {
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="green"/></svg>');
    const report = await inspect(fixture(`<div id="photo"><img src="${image}"></div>`, '#photo{position:absolute;left:80px;top:80px;width:400px;height:400px;overflow:hidden}#photo img{width:100%;height:100%;object-fit:cover;display:block}'));
    assert.equal(report.ok, true);
  });
  await test('hidden off-page elements do not cause an overflow finding', async () => {
    const report = await inspect(fixture('<div id="safe"></div><div id="hidden">invisible</div>', '#safe{position:absolute;left:80px;top:80px;width:300px;height:100px}#hidden{display:none;position:absolute;left:-10000px;width:1000px;height:1000px}'));
    assert.equal(report.ok, true);
  });
  await test('a visible child of a visibility:hidden parent still gets inspected', async () => {
    const report = await inspect(fixture('<div id="hidden-parent"><div id="visible-child">visible</div></div>', '#hidden-parent{visibility:hidden;position:absolute;left:80px;top:80px;width:400px;height:100px}#visible-child{visibility:visible;position:absolute;top:1850px;width:300px;height:200px}'));
    assert.equal(has(report, 'page-overflow'), true);
    assert.equal(report.ok, false);
  });
  await test('a clip under a rotated ancestor is explicitly outside strict clip measurement', async () => {
    const report = await inspect(fixture('<div id="rotated"><div id="clip"><div id="child">content</div></div></div>', '#rotated{position:absolute;left:400px;top:400px;width:300px;height:300px;transform:rotate(10deg)}#clip{width:200px;height:100px;overflow:hidden}#child{width:200px;height:80px}'));
    assert.equal(report.issues.some(issue => issue.level === 'warning' && issue.type === 'unmeasured-transformed-clip' && issue.data.transformedAncestor.includes('rotated')), true);
    assert.equal(report.ok, true);
  });
  await test('wrong dimensions and missing pages cannot pass', async () => {
    assert.equal(has(await inspect(fixture('<p style="margin:80px">content</p>', '.fixed-page{width:1450px}')), 'wrong-page-size'), true);
    const report = await inspect('<!doctype html><html><body>no page</body></html>');
    assert.equal(report.ok, false);
    assert.equal(has(report, 'missing-fixed-page'), true);
  });
  await test('broken images and removed-image placeholders cannot pass', async () => {
    const broken = await inspect(fixture('<img id="broken" src="data:image/png;base64,broken">', '#broken{position:absolute;left:80px;top:80px;width:300px;height:100px}'));
    assert.equal(has(broken, 'broken-image'), true);
    const placeholder = await inspect(fixture('<div class="missing">image missing</div>', '.missing{position:absolute;left:80px;top:80px;width:300px;height:100px}'));
    assert.equal(has(placeholder, 'missing-image-placeholder'), true);
  });
  await test('an image whose request is still pending cannot pass', async () => {
    const url = 'https://layout-fixture.invalid/pending.png';
    let pendingRoute;
    await page.route(url, route => { pendingRoute = route; });
    try {
      const requested = page.waitForRequest(url);
      await page.setContent(fixture(`<img id="pending" src="${url}">`, '#pending{position:absolute;left:80px;top:80px;width:300px;height:100px}'), { waitUntil: 'domcontentloaded' });
      await requested;
      const report = await page.evaluate(safety.inspect, {});
      assert.equal(has(report, 'image-not-ready'), true);
      assert.equal(report.ok, false);
    } finally {
      if (pendingRoute) await pendingRoute.abort();
      await page.unroute(url);
    }
  });
  await test('a FontFace load error cannot pass after fonts.ready resolves', async () => {
    await page.setContent(fixture('<p style="margin:80px">content</p>'));
    await page.evaluate(async () => {
      const font = new FontFace('BrokenFixtureFont', 'url(data:font/woff2;base64,invalid)');
      document.fonts.add(font);
      try { await font.load(); } catch { /* The fixture deliberately provides invalid font bytes. */ }
      await document.fonts.ready;
    });
    try {
      const report = await page.evaluate(safety.inspect, {});
      assert.equal(has(report, 'font-load-failed'), true);
      assert.equal(report.ok, false);
    } finally {
      // setContent reuses the document's programmatically added FontFace entries.
      await page.evaluate(() => {
        for (const font of document.fonts) if (font.family === 'BrokenFixtureFont') document.fonts.delete(font);
      });
    }
  });
  await test('a fallback page is an error even when it fits', async () => {
    const report = await inspect(fixture('<p style="margin:80px">固定レイアウト生成エラー</p>'));
    assert.equal(has(report, 'fallback-page'), true);
  });
  await test('animation must be stopped before geometry is accepted', async () => {
    const report = await inspect(fixture('<div id="moving">moving</div>', '#moving{position:absolute;left:80px;top:80px;width:100px;height:100px;animation:move 10s infinite}@keyframes move{to{left:150px}}'));
    assert.equal(has(report, 'animation-active'), true);
  });
  await test('unmeasured shadows and pseudo-elements are warnings, not a false paint guarantee', async () => {
    const report = await inspect(fixture('<div id="decorated">content</div>', '#decorated{position:absolute;left:80px;top:1700px;width:400px;height:100px;box-shadow:0 400px black}#decorated::after{position:absolute;content:"decoration";top:400px}'));
    assert.equal(report.ok, true);
    assert.equal(report.issues.some(issue => issue.level === 'warning' && issue.type === 'unmeasured-paint'), true);
    assert.equal(report.scope, 'rendered-element-boxes-and-nonblank-text-fragments');
    assert.ok(report.limitations.some(item => item.includes('疑似要素')));
    return { scope: report.scope, warningTypes: report.issues.map(issue => issue.type) };
  });
  await test('page-relative clearance is unchanged by scrolling and page number stays one-based', async () => {
    const html = fixture('<div class="box"></div>', '.box{position:absolute;left:80px;top:80px;width:400px;height:1800px}').replace('</body>', '<main class="fixed-page"><div class="box"></div></main></body>');
    const before = await inspect(html);
    await page.evaluate(() => window.scrollTo(0, 2056));
    const after = await page.evaluate(safety.inspect, {});
    assert.deepEqual(after.pages.map(item => item.clearance), before.pages.map(item => item.clearance));
    assert.deepEqual(after.pages.map(item => item.pageIndex), [1, 2]);
    assert.equal(after.ok, true);
  });
  await test('browser global and Node-exported inspector give the same result', async () => {
    await page.setContent(fixture('<div id="safe"></div>', '#safe{position:absolute;left:80px;top:80px;width:400px;height:100px}'));
    await page.addScriptTag({ path: path.join(root, 'preview/layout_safety.js') });
    const injected = await page.evaluate(safety.inspect, {});
    const global = await page.evaluate(() => window.FixedLayoutSafety.inspect({}));
    assert.deepEqual(global, injected);
    assert.equal(global.ok, true);
  });
} finally {
  const report = {
    generatedAt: new Date().toISOString(), browser: browser.version(),
    viewport: [1456, 2056], dpr: 1, scope: 'independent in-memory geometry fixtures',
    passed: results.filter(result => result.passed).length,
    failed: results.filter(result => !result.passed).length,
    results
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(`${report.passed} passed, ${report.failed} failed`);
  if (report.failed) process.exitCode = 1;
}
