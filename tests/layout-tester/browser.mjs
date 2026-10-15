import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {startServer} from '../../tools/layout_tester_server.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.TEST_OUTPUT_DIR||await fs.mkdtemp(path.join(os.tmpdir(),'isekai-tester-static-'));
await fs.mkdir(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),chromiumSandbox:true,timeout:20000});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1,acceptDownloads:true});
page.setDefaultTimeout(30000);
const jsErrors=[],dedicatedRequests=[];
page.on('pageerror',e=>jsErrors.push(e.message));
page.on('request',request=>{
  try{if(new URL(request.url()).pathname.startsWith('/__layout-tester/'))dedicatedRequests.push(request.url());}catch{}
});
let server;const tests=[];
async function test(name,run){await run();tests.push(name);console.log(`ok ${tests.length} - ${name}`);}
const settled=()=>page.waitForFunction(()=>window.layoutTester?.ready===true,{},{timeout:30000});
const state=()=>page.evaluate(()=>{
  const tester=window.layoutTester,frame=document.querySelector('#preview-frame'),win=frame.contentWindow,doc=frame.contentDocument;
  const report=win.auditArticleComposition();
  const source=JSON.parse(doc.querySelector('#article-source').textContent);
  return{
    ready:tester.ready,dirty:tester.dirty,kind:tester.source.kind,article:tester.source.article,sourceName:tester.source.source,pages:tester.pages.length,
    contract:doc.querySelector('meta[name="article-source-contract"]')?.content,
    testerCandidate:doc.querySelector('meta[name="layout-tester-candidate"]')?.content,
    composition:win.__articleComposition?.status,auditOk:report.ok,auditPages:report.pages.length,
    bodyFont:getComputedStyle(doc.querySelector('.article-body')).fontSize,
    fontFamily:getComputedStyle(doc.querySelector('.article-body')).fontFamily,
    fontMode:tester.source.fontMode,
    blocks:source.blocks.length,figures:source.blocks.filter(b=>b.type==='figure').length,groups:source.groups.length,
    textOnlySections:source.manifest.textOnlySections||0,
    normalizedLegacyFigure:Boolean(source.manifest.normalizedLegacyFigure)
  };
});
const dimensions=b=>[b.readUInt32BE(16),b.readUInt32BE(20)];

try{
  // This server is used only as an ordinary static file host for the browser test.
  // The application must not call any /__layout-tester/* route.
  server=await startServer({port:0,root:ROOT});
  await page.goto(`http://127.0.0.1:${server.address().port}/layout-tester/`,{waitUntil:'domcontentloaded'});
  await settled();

  await test('real 04 article loads entirely through static files',async()=>{
    const s=await state();
    assert.equal(s.article,'202604/04_聖職者花見乱痴気騒ぎ');
    assert.equal(s.sourceName,'聖職者花見乱痴気騒ぎ.md');
    assert.equal(s.contract,'1');
    assert.equal(s.testerCandidate,'static-browser');
    assert.equal(s.composition,'ready');
    assert.equal(s.auditOk,true);
    assert.equal(s.pages,6);
    assert.equal(s.auditPages,6);
    assert.equal(s.blocks,45);
    assert.equal(s.figures,5);
    assert.equal(s.groups,5);
    assert.match(s.fontFamily,/ArticleSubset/);
  });

  await test('no dedicated API endpoint is requested',()=>assert.deepEqual(dedicatedRequests,[]));

  await test('Explorer folder without font.json loads with shared fallback and legacy figures',async()=>{
    const articleDir=path.join(ROOT,'202604','03_王都ギルド登録所大混乱');
    await page.locator('#folder-files').setInputFiles(articleDir);
    await settled();
    const s=await state();
    assert.equal(s.kind,'folder');
    assert.equal(s.sourceName,'王都ギルド登録所大混乱.md');
    assert.equal(s.testerCandidate,'folder-browser');
    assert.equal(s.fontMode,'shared-fallback');
    assert.equal(s.auditOk,true);
    assert.ok(s.pages>=1);
    assert.equal(s.blocks,49);
    assert.equal(s.figures,5);
    assert.equal(s.groups,6);
    assert.equal(s.textOnlySections,1);
    assert.equal(s.normalizedLegacyFigure,true);
    assert.match(s.fontFamily,/ArticleSubset/);
    const assets=await page.evaluate(()=>{
      const doc=document.querySelector('#preview-frame').contentDocument;
      const images=[...doc.querySelectorAll('.scene-image')];
      const source=JSON.parse(doc.querySelector('#article-source').textContent);
      return{
        imageCount:images.length,
        allLoaded:images.every(img=>img.complete&&img.naturalWidth>0),
        blobImages:images.every(img=>img.src.startsWith('blob:')),
        figureSources:source.blocks.filter(b=>b.type==='figure').map(b=>b.src)
      };
    });
    assert.ok(assets.imageCount>=5);
    assert.equal(assets.allLoaded,true);
    assert.equal(assets.blobImages,true);
    assert.ok(assets.figureSources.every(src=>src.startsWith('blob:')));
  });

  await test('Explorer folder selection still uses no dedicated API',()=>assert.deepEqual(dedicatedRequests,[]));

  await test('production fixed-page DOM is 1456x2056',async()=>{
    const v=await page.evaluate(()=>{
      const doc=document.querySelector('#preview-frame').contentDocument,p=doc.querySelector('.fixed-page'),r=p.getBoundingClientRect();
      return{w:r.width,h:r.height};
    });
    assert.deepEqual(v,{w:1456,h:2056});
  });

  await test('arbitrary paper region produces ChatGPT target metadata',async()=>{
    await page.evaluate(()=>window.layoutTester.setInstructionRegion(1,{x:120,y:1500,w:900,h:260}));
    await page.locator('#instruction-note').fill('この範囲の空白を詰めたい');
    const text=await page.evaluate(()=>window.layoutTester.instructionText());
    assert.match(text,/【組版テスター指示対象】/);
    assert.match(text,/ページ: 1 \/ /);
    assert.match(text,/x=120, y=1500, w=900, h=260/);
    assert.match(text,/LAYOUT_TARGET_JSON:/);
    assert.match(text,/この範囲の空白を詰めたい/);
    assert.equal(await page.locator('#copy-instruction').isDisabled(),false);
    assert.equal(await page.locator('#save-instruction').isDisabled(),false);
  });

  await test('annotated instruction PNG keeps page size',async()=>{
    const pending=page.waitForEvent('download',{timeout:45000});
    await page.locator('#save-instruction').click();
    const d=await pending;assert.equal(await d.failure(),null);
    const file=path.join(out,'instruction-page.png');await d.saveAs(file);
    const png=await fs.readFile(file);assert.deepEqual(dimensions(png),[1456,2056]);assert.ok(png.length>10000);
  });

  await test('production source block selection exposes actual box metrics',async()=>{
    await page.locator('#block-list button').first().click();
    const text=await page.locator('#metrics').innerText();
    assert.match(text,/W \d/);assert.match(text,/H \d/);assert.match(text,/紙面端/);
    const selected=await page.evaluate(()=>document.querySelector('#preview-frame').contentDocument.querySelectorAll('.layout-tester-selected').length);
    assert.ok(selected>=1);
  });

  await test('temporary CSS setting repaginates in the production paginator',async()=>{
    const input=page.locator('#settings-form [data-key="body.fontSize"]');
    await input.fill('27');await input.dispatchEvent('change');await settled();
    const s=await state();assert.equal(s.bodyFont,'27px');assert.equal(s.auditOk,true);
  });

  await test('PNG download is generated in browser from current production DOM',async()=>{
    const pending=page.waitForEvent('download',{timeout:45000});
    await page.locator('#png').click();
    const d=await pending;assert.equal(await d.failure(),null);
    const file=path.join(out,'production-page.png');await d.saveAs(file);
    const png=await fs.readFile(file);assert.deepEqual(dimensions(png),[1456,2056]);assert.ok(png.length>10000);
  });

  await test('dedicated API remains unused after recompose and PNG export',()=>assert.deepEqual(dedicatedRequests,[]));
  await test('no unhandled browser errors',()=>assert.deepEqual(jsErrors,[]));

  await page.screenshot({path:path.join(out,'static-production-tester.png'),fullPage:true});
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({mode:'static-production-http',chromiumSandbox:true,browser:browser.version(),node:process.version,tests,passed:tests.length,dedicatedRequests},null,2));
  console.log(`PASS ${tests.length} browser tests; ${out}`);
}finally{
  await browser.close();
  if(server)await new Promise(r=>server.close(r));
}
