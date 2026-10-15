import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {startServer} from '../../tools/layout_tester_server.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.TEST_OUTPUT_DIR||await fs.mkdtemp(path.join(os.tmpdir(),'isekai-tester-production-'));
await fs.mkdir(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),chromiumSandbox:true,timeout:20000});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1,acceptDownloads:true});
page.setDefaultTimeout(30000);
const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
let server;const tests=[];
async function test(name,run){await run();tests.push(name);console.log(`ok ${tests.length} - ${name}`);}
const settled=()=>page.waitForFunction(()=>window.layoutTester?.ready===true,{},{timeout:25000});
const state=()=>page.evaluate(()=>{
  const tester=window.layoutTester,frame=document.querySelector('#preview-frame'),win=frame.contentWindow,doc=frame.contentDocument;
  const report=win.auditArticleComposition();
  return{
    ready:tester.ready,dirty:tester.dirty,article:tester.source.article,source:tester.source.source,pages:tester.pages.length,
    contract:doc.querySelector('meta[name="article-source-contract"]')?.content,
    testerCandidate:doc.querySelector('meta[name="layout-tester-candidate"]')?.content,
    composition:win.__articleComposition?.status,auditOk:report.ok,auditPages:report.pages.length,
    bodyFont:getComputedStyle(doc.querySelector('.article-body')).fontSize,
    renderSha:Boolean(doc.querySelector('meta[name="article-render-sha256"]'))
  };
});
const dimensions=b=>[b.readUInt32BE(16),b.readUInt32BE(20)];

try{
  server=await startServer({port:0,root:ROOT});
  await page.goto(`http://127.0.0.1:${server.address().port}/layout-tester/`,{waitUntil:'domcontentloaded'});
  await settled();

  await test('real 202604 article is the default source',async()=>{
    const s=await state();
    assert.equal(s.article,'202604/04_聖職者花見乱痴気騒ぎ');
    assert.equal(s.source,'聖職者花見乱痴気騒ぎ.md');
    assert.equal(s.contract,'1');
    assert.equal(s.testerCandidate,'1');
    assert.equal(s.composition,'ready');
    assert.equal(s.auditOk,true);
    assert.equal(s.pages,s.auditPages);
    assert.ok(s.pages>=1);
    assert.equal(s.renderSha,false);
  });

  await test('preview is the production fixed-page DOM',async()=>{
    const v=await page.evaluate(()=>{
      const doc=document.querySelector('#preview-frame').contentDocument;
      const page=doc.querySelector('.fixed-page');
      const style=getComputedStyle(page),source=JSON.parse(doc.querySelector('#article-source').textContent);
      return{w:page.getBoundingClientRect().width,h:page.getBoundingClientRect().height,font:getComputedStyle(doc.querySelector('.article-body')).fontFamily,blocks:source.blocks.length,figures:source.blocks.filter(b=>b.type==='figure').length,bg:style.backgroundColor};
    });
    assert.equal(v.w,1456);assert.equal(v.h,2056);assert.match(v.font,/ArticleSubset/);assert.ok(v.blocks>10);assert.ok(v.figures>=1);
  });

  await test('production source block selection exposes actual box metrics',async()=>{
    await page.locator('#block-list button').first().click();
    const text=await page.locator('#metrics').innerText();
    assert.match(text,/W \d/);assert.match(text,/H \d/);assert.match(text,/紙面端/);
    const selected=await page.evaluate(()=>document.querySelector('#preview-frame').contentDocument.querySelectorAll('.layout-tester-selected').length);
    assert.ok(selected>=1);
  });

  await test('temporary CSS setting repaginates the same production renderer',async()=>{
    const input=page.locator('#settings-form [data-key="body.fontSize"]');
    await input.fill('27');await input.dispatchEvent('change');await settled();
    const s=await state();assert.equal(s.bodyFont,'27px');assert.equal(s.auditOk,true);
    const css=await page.evaluate(()=>document.querySelector('#preview-frame').contentDocument.querySelector('#layout-tester-overrides').textContent);
    assert.match(css,/\.article-body\{font-size:27px/);
  });

  await test('PNG export screenshots the production candidate page at 1456x2056',async()=>{
    const pending=page.waitForEvent('download',{timeout:45000});
    await page.locator('#png').click();
    const d=await pending;assert.equal(await d.failure(),null);
    const file=path.join(out,'production-page-001.png');await d.saveAs(file);
    const png=await fs.readFile(file);assert.deepEqual(dimensions(png),[1456,2056]);assert.ok(png.length>10000);
  });

  await test('no unhandled browser errors',()=>assert.deepEqual(jsErrors,[]));
  await page.screenshot({path:path.join(out,'production-tester.png'),fullPage:true});
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({mode:'production-http',chromiumSandbox:true,browser:browser.version(),node:process.version,tests,passed:tests.length},null,2));
  console.log(`PASS ${tests.length} browser tests; ${out}`);
}finally{
  await browser.close();
  if(server)await new Promise(r=>server.close(r));
}
