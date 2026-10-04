import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { URI, Utils } from 'vscode-uri';
import { PNG } from 'pngjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.resolve(process.env.PREVIEW_TEST_OUTPUT||path.join(repo,'exports/preview-tests'));
await fs.mkdir(out,{recursive:true});
const source=await fs.readFile(process.env.PREVIEW_TEST_INDEX||path.join(repo,'index.html'),'utf8');
const fetchMock=await fs.readFile(path.join(repo,'node_modules/fetch-mock/es5/client-bundle.js'),'utf8');
const root=URI.parse('vscode-vfs://github/TomTomYoung/isekai_zasshi/');
const proxy=URI.parse('codeswing-proxy:/'+encodeURIComponent(root.toString()));
const proxyPath=URI.from({scheme:'https',authority:'preview.invalid',path:proxy.path}).toString().replace('https://preview.invalid','');
const workspacePrefix=root.path;
const fixture='202604/99_試験 空白/fixed_layout.html';
const safeFixture='202604/97_余白検査/fixed_layout.html';
const overflowFixture='202604/96_本文はみ出し/fixed_layout.html';
const cover='202604/00_表紙/fixed_layout.html';
const uniforms='202604/01_王都女学院春の制服名鑑/fixed_layout.html';
let revision=1,delay=0,broken=false,missingCss=false,throwJs=false,noPages=false;
const requests=[],workspaceRequests=[];
const svg=color=>`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="${color}"/></svg>`;
const fixtureHTML=()=>`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="様式 空白.css"></head><body>
<main class="${noPages?'absent':'fixed-page'}"><h1 id="text">保存版 ${revision}</h1><div id="css">CSS</div><img src="${broken?'missing.svg':'画像 空白.svg'}"><img id="late"><span id="fetch"></span><span id="script"></span></main>
<main class="${noPages?'absent':'fixed-page'}"><h1>中間</h1></main><main class="${noPages?'absent':'fixed-page'}"><h1>末尾</h1></main>
<script src="処理 空白.js"></script></body></html>`;
// These pages keep exact export geometry while independently varying content
// safety. Everything is served from memory; existing articles are untouched.
const safetyFixtureHTML=overflow=>`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}.fixed-page{position:relative;box-sizing:border-box;width:1456px;height:2056px;overflow:hidden;background:#fff;font:24px/36px monospace;color:#111}
.panel{position:absolute;left:80px;top:80px;box-sizing:border-box;width:1296px;height:1800px;border:1px solid #111;background:#f8fafc}.fixed-page:nth-child(2) .panel{height:1700px}
.panel p{margin:20px}.overhang{position:absolute;left:80px;top:2030px;margin:0;font:32px/64px monospace}
</style></head><body><main class="fixed-page"><div class="panel"><p>Safe page one</p></div>${overflow?'<p id="overhang" class="overhang">This line extends below the page.</p>':''}</main><main class="fixed-page"><div class="panel"><p>Safe page two</p></div></main></body></html>`;
const mime=file=>({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream';
const wrapper=(base,content)=>`<!doctype html><html><head><base href="${base}"><script src="/__fetch-mock.js"></script><script>
window.__workspaceRequests=[];
const rawFetch=window.fetch.bind(window);
fetchMock.any(url=>new Promise(async resolve=>{
 window.__workspaceRequests.push(url);
 const response=await rawFetch('/__workspace?path='+encodeURIComponent(url));
 // Like CodeSwing's httpRequest handler, workspace.fs failure has no reply.
 if(response.ok)resolve(new Response(await response.text(),{status:200}));
}));
</script></head><body>${content}</body></html>`;
async function contentFor(relative){
 if(relative===fixture)return Buffer.from(fixtureHTML());
 if(relative===safeFixture||relative===overflowFixture)return Buffer.from(safetyFixtureHTML(relative===overflowFixture));
 if(relative==='202604/99_試験 空白/様式 空白.css'){
  if(missingCss)throw Error('fixture missing CSS');
  return Buffer.from(`html,body{margin:0;padding:0}.fixed-page{box-sizing:border-box;width:1456px;height:2056px;overflow:hidden;background:white}h1{margin:0}#css{color:rgb(${revision===1?'1, 2, 3':'4, 5, 6'})}.fixed-page:last-child{background:#eee}@media(min-height:2057px){#css{color:red}}`);
 }
 if(relative==='202604/99_試験 空白/処理 空白.js')return Buffer.from(`document.querySelector('#script').textContent='JS ${revision}';
 document.querySelector('#late').src='画像 空白.svg';
 Promise.all([fetch('値 空白.json').then(r=>r.json()),fetch(new URL('値 空白.json',document.baseURI)).then(r=>r.json()),fetch(new Request(new URL('値 空白.json',document.baseURI))).then(r=>r.json())]).then(all=>document.querySelector('#fetch').textContent=all.map(x=>x.value).join('/'));
 ${throwJs?"throw new Error('fixture exception');":''}`);
 if(relative==='202604/99_試験 空白/値 空白.json')return Buffer.from(JSON.stringify({value:revision}));
 if(relative==='202604/99_試験 空白/画像 空白.svg'){
  if(delay)await new Promise(r=>setTimeout(r,delay));
  return Buffer.from(svg(revision===1?'red':'blue'));
 }
 if(relative.includes('missing.svg'))throw Error('fixture missing image');
 if(relative==='index.html')return Buffer.from(source);
 if(relative.startsWith('202603/'))throw Error('protected');
 const full=path.resolve(repo,relative);if(!full.startsWith(repo+path.sep))throw Error('outside repo');
 return fs.readFile(full);
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://test');
 try{
  if(url.pathname==='/__fetch-mock.js'){res.setHeader('Content-Type','application/javascript');res.end(fetchMock);return;}
  if(url.pathname==='/__mock'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(wrapper(proxyPath,source));return;}
  let relative;
  if(url.pathname==='/__workspace'){
   const requested=url.searchParams.get('path');
   const joined=Utils.joinPath(root,requested);
   relative=joined.path.slice(workspacePrefix.length);workspaceRequests.push({requested,relative});
  }else if(url.pathname.startsWith('/vscode-vfs')){
   // Real provider sequence: URI parse -> decode inner path -> URI.parse.
   const requested=URI.parse('codeswing-proxy:'+url.pathname);
   const original=URI.parse(decodeURIComponent(requested.path.slice(1)));
   assert.equal(original.scheme,root.scheme);assert.equal(original.authority,root.authority);
   assert.ok(original.path.startsWith(workspacePrefix));
   relative=original.path.slice(workspacePrefix.length);
  }else relative=decodeURIComponent(url.pathname.slice(1))||'index.html';
  requests.push({relative,revision:url.searchParams.get('__fixedPreview')});
  const bytes=await contentFor(relative);
  res.setHeader('Content-Type',mime(relative));
  // Deliberately cache assets to make the reload test meaningful.
  res.setHeader('Cache-Control',relative.endsWith('.html')?'no-store':'public,max-age=3600');
  res.end(bytes);
 }catch(error){res.statusCode=404;res.end('NOT FOUND');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.PREVIEW_CHROMIUM||undefined,args:['--no-sandbox','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1100,height:900},deviceScaleFactor:1});
context.setDefaultTimeout(20000);
const page=await context.newPage();
const results=[];
const check=async(name,fn)=>{try{const detail=await fn();results.push({name,passed:true,detail});console.log('PASS '+name);}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+' '+error.message);throw error;}};
const choose=async value=>{await page.locator('#source').fill(value);await page.locator('#reload').click();};
const ready=async()=>page.waitForFunction(()=>document.querySelector('#status').textContent.includes('読込検査完了'),{},{timeout:22000});
const articleFrame=()=>page.frames().find(f=>f.name()===''&&f.url()==='about:srcdoc');
const metrics=async()=>articleFrame().evaluate(()=>({viewport:[innerWidth,innerHeight],pages:[...document.querySelectorAll('.fixed-page')].map(p=>{const r=p.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y}}),images:[...document.images].map(i=>({w:i.naturalWidth,h:i.naturalHeight,src:i.currentSrc})),missing:document.querySelectorAll('.missing').length}));
const layoutReady=async expected=>page.waitForFunction(state=>document.querySelector('#layout-status').dataset.state===state,expected,{timeout:5000});
const layoutMetrics=async()=>articleFrame().evaluate(()=>{
 const report=window.FixedLayoutSafety.inspect({pageWidth:1456,pageHeight:2056,safetyPx:28,tolerancePx:.5});
 return {ok:report.ok,pages:report.pages.map(p=>p.clearance)};
});
try{
 await check('real URI serialization preserves directory',()=>{
  assert.equal(proxy.path,'/vscode-vfs://github/TomTomYoung/isekai_zasshi/');
  assert.equal(new URL('.',origin+proxyPath).pathname,proxyPath);
  return {library:'vscode-uri 3.2.0',proxyPath};
 });
 await check('fetch-mock 9.11.0 encodes Japanese before workspace join',async()=>{
  await page.goto(origin+'/__mock');
  await page.evaluate(path=>fetch(path), 'preview/articles.json');
  // Explicitly exercise CodeSwing fetch; fixed app uses a pristine iframe fetch.
  await page.evaluate(path=>{fetch(path);},cover);
  await page.waitForFunction(()=>window.__workspaceRequests.some(u=>u.includes('%E8')));
  const normalized=await page.evaluate(()=>window.__workspaceRequests.find(u=>u.includes('%E8')));
  const actual=Utils.joinPath(root,normalized).path;
  assert.notEqual(actual,Utils.joinPath(root,cover).path);
  assert.ok(actual.includes('%E8'));return {requested:cover,normalized,actual};
 });
 if(process.env.PREVIEW_TEST_BASELINE){
  await check('baseline remains without pages after Japanese read fails',async()=>{
   assert.ok(workspaceRequests.some(r=>r.relative.includes('%E8')));
   assert.equal(await page.locator('#paper iframe').count(),0);
   return {status:await page.locator('#status').innerText(),workspaceRequests};
  });
 }else{
 await check('MOCK: Japanese article and real cover',async()=>{
  await ready();assert.equal(await page.locator('#status').getAttribute('data-error'),'false');
  const m=await metrics();assert.deepEqual(m.viewport,[1456,2056]);assert.equal(m.pages.length,1);return m;
 });
 await check('MOCK: Japanese + spaces / CSS / JS / GET string URL Request',async()=>{
  await choose(fixture);await ready();
  const frame=articleFrame();assert.equal(await frame.locator('#fetch').innerText(),'1/1/1');assert.equal(await frame.locator('#script').innerText(),'JS 1');
  assert.equal(await frame.locator('#css').evaluate(e=>getComputedStyle(e).color),'rgb(1, 2, 3)');
  const m=await metrics();assert.equal(m.images.length,2);assert.ok(m.images.every(i=>i.w===32&&i.h===24));return m;
 });
 await check('MOCK: zoom / narrow / first middle last / guide invariance',async()=>{
  const positions=[];
  for(const zoom of ['0.25','0.5','1','auto']){
   await page.locator('#zoom').selectOption(zoom);
   for(const p of ['0','1','2']){
    await page.locator('#page-number').selectOption(p);const m=await metrics();
    assert.deepEqual(m.viewport,[1456,2056]);assert.deepEqual([m.pages[p].x,m.pages[p].y],[0,0]);assert.ok(m.pages.every(p=>p.w===1456&&p.h===2056));
   }
   positions.push({zoom,...await metrics()});
  }
  await page.setViewportSize({width:450,height:800});assert.deepEqual((await metrics()).viewport,[1456,2056]);
  const before=await metrics();await page.locator('#guides').uncheck();assert.deepEqual(await metrics(),before);
  await page.locator('#guides').check();assert.deepEqual(await metrics(),before);await page.setViewportSize({width:1100,height:900});return positions;
 });
 await check('MOCK: saved HTML CSS JS image refresh without commit',async()=>{
  const before=await articleFrame().locator('img').first().screenshot();revision=2;
  await page.locator('#reload').click();await ready();
  const frame=articleFrame();assert.equal(await frame.locator('#text').innerText(),'保存版 2');assert.equal(await frame.locator('#fetch').innerText(),'2/2/2');assert.equal(await frame.locator('#script').innerText(),'JS 2');
  assert.equal(await frame.locator('#css').evaluate(e=>getComputedStyle(e).color),'rgb(4, 5, 6)');
  assert.notDeepEqual(await frame.locator('img').first().screenshot(),before);
  return {revisions:[...new Set(requests.filter(r=>r.relative.endsWith('画像 空白.svg')).map(r=>r.revision))]};
 });
 await check('MOCK: slow image and rapid reload cannot update next article',async()=>{
  delay=1200;await page.locator('#reload').click();
  await page.waitForTimeout(200);assert.ok(!(await page.locator('#status').innerText()).includes('読込検査完了'));
  await choose(cover);await ready();await page.waitForTimeout(1500);
  assert.equal((await metrics()).pages.length,1);assert.equal(await page.locator('#status').getAttribute('data-error'),'false');delay=0;
 });
 await check('MOCK: missing image CSS and script error remain failures',async()=>{
  broken=true;missingCss=true;throwJs=true;await choose(fixture);await ready();
  const text=await page.locator('#status').innerText();assert.equal(await page.locator('#status').getAttribute('data-error'),'true');
  assert.match(text,/画像未読込/);assert.match(text,/CSS未読込/);assert.match(text,/JavaScript例外/);
  broken=false;missingCss=false;throwJs=false;return text;
 });
 await check('MOCK: missing HTML gives immediate stage and path',async()=>{
  await choose('202604/98_存在しない/fixed_layout.html');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('HTTP 404'));
  assert.equal(await page.locator('#status').getAttribute('data-error'),'true');return await page.locator('#diagnostic-log').innerText();
 });
 await check('MOCK: no fixed-page is a bounded failure',async()=>{
  noPages=true;await choose(fixture);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('.fixed-page がありません'),{},{timeout:22000});
  assert.equal(await page.locator('#status').getAttribute('data-error'),'true');noPages=false;
 });
 await check('MOCK: protect 202603',async()=>{
  const count=requests.length;await choose('202603/00_表紙/fixed_layout.html');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('対象は202604'));
  assert.ok(!requests.slice(count).some(r=>r.relative.startsWith('202603/')));
 });
 await check('MOCK: content overflow fails independently of ready assets and exact page dimensions',async()=>{
  await choose(overflowFixture);await ready();await layoutReady('failed');
  const m=await metrics();assert.deepEqual(m.viewport,[1456,2056]);
  assert.equal(m.pages.length,2);assert.ok(m.pages.every(p=>p.w===1456&&p.h===2056));
  assert.equal(await page.locator('#status').getAttribute('data-error'),'false');
  const detail=await page.locator('#layout-report').textContent();assert.match(detail,/#overhang/);
  const geometry=await articleFrame().locator('#overhang').evaluate(e=>({bottom:e.getBoundingClientRect().bottom,pageBottom:e.closest('.fixed-page').getBoundingClientRect().bottom,overflow:getComputedStyle(e.closest('.fixed-page')).overflow}));
  assert.equal(geometry.overflow,'hidden');assert.ok(geometry.bottom>geometry.pageBottom);
  return {geometry,status:await page.locator('#layout-status').textContent()};
 });
 await check('MOCK: changing the required margin changes safety without changing source geometry',async()=>{
  await choose(safeFixture);await ready();await layoutReady('passed');
  assert.equal(await page.locator('#status').getAttribute('data-error'),'false');
  const before=await layoutMetrics();assert.equal(before.ok,true);assert.equal(before.pages.length,2);
  await page.locator('#safety-margin').fill('81');await layoutReady('failed');
  assert.match(await page.locator('#layout-status').textContent(),/必要な余白 81px/);
  assert.match(await page.locator('#layout-report').textContent(),/\.panel/);
  assert.deepEqual(await layoutMetrics(),before,'the margin control must not alter article layout');
  await page.locator('#safety-margin').fill('28');await layoutReady('passed');
  assert.match(await page.locator('#layout-status').textContent(),/必要な余白 28px/);
  assert.deepEqual(await layoutMetrics(),before);return before;
 });
 await check('MOCK: safety clearances survive zoom, narrow viewport and page selection',async()=>{
  const before=await layoutMetrics(),statusByPage=[];
  for(const p of ['0','1']){
   await page.locator('#page-number').selectOption(p);await layoutReady('passed');
   statusByPage.push(await page.locator('#layout-status').textContent());
  }
  assert.notEqual(statusByPage[0],statusByPage[1],'selected page must display its own clearance');
  for(const zoom of ['0.25','0.5','1','auto']){
   await page.locator('#zoom').selectOption(zoom);
   for(const p of ['0','1']){
    await page.locator('#page-number').selectOption(p);await layoutReady('passed');
    assert.equal(await page.locator('#layout-status').textContent(),statusByPage[Number(p)]);
    assert.deepEqual(await layoutMetrics(),before,'zoom/page selection changes measured clearances');
   }
  }
  await page.setViewportSize({width:450,height:800});
  assert.deepEqual(await layoutMetrics(),before);
  assert.equal(await page.locator('#layout-status').textContent(),statusByPage[1]);
  await page.setViewportSize({width:1100,height:900});return before;
 });
 await check('MOCK: delayed text revokes a prior safety pass and switching articles clears it',async()=>{
  await page.locator('#page-number').selectOption('0');await layoutReady('passed');
  await articleFrame().evaluate(()=>setTimeout(()=>{
   const paragraph=document.createElement('p');paragraph.id='late-overhang';paragraph.className='overhang';
   paragraph.textContent='Text added after the initial readiness check.';
   document.querySelector('.fixed-page').append(paragraph);
  },120));
  await layoutReady('failed');
  assert.match(await page.locator('#layout-report').textContent(),/#late-overhang/);
  assert.equal(await page.locator('#status').getAttribute('data-error'),'false');
  const delayedStatus=await page.locator('#layout-status').textContent();
  await choose(safeFixture);await ready();await layoutReady('passed');
  assert.doesNotMatch(await page.locator('#layout-report').textContent(),/#late-overhang/);
  assert.equal(await articleFrame().locator('#late-overhang').count(),0);
  await articleFrame().evaluate(()=>document.querySelectorAll('.fixed-page').forEach(element=>element.remove()));
  await layoutReady('failed');
  assert.match(await page.locator('#layout-report').textContent(),/missing-fixed-page/);
  await choose(safeFixture);await ready();await layoutReady('passed');
  return {delayedStatus,resetStatus:await page.locator('#layout-status').textContent()};
 });
 await check('MOCK and HTTP real articles / geometry / PNG comparison',async()=>{
  const comparisons=[];
  const direct=await context.newPage();await direct.setViewportSize({width:1456,height:2056});
  const geometry=element=>{
   const origin=element.getBoundingClientRect();
   const rect=r=>[r.x-origin.x,r.y-origin.y,r.width,r.height].map(v=>Math.round(v*1000)/1000);
   const nodes=[element,...element.querySelectorAll('*')].map(e=>({name:e.tagName,box:rect(e.getBoundingClientRect()),font:getComputedStyle(e).font}));
   const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),lines=[];
   while(walker.nextNode()){const n=walker.currentNode;if(!n.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(n);lines.push({text:n.textContent,rects:[...r.getClientRects()].map(rect)});}
   return {nodes,lines};
  };
  for(const article of [cover,uniforms]){
   await page.goto(origin+'/__mock');await choose(article);await ready();const mock=await metrics();
   assert.equal(await page.locator('#status').getAttribute('data-error'),'false');
   await page.locator('#guides').uncheck();await page.locator('#zoom').selectOption('1');
   // The safety readout adds height above the fixed-size iframe. Fit the entire
   // paper on the outer screen so the capture cannot include clipped screen
   // pixels or a sticky toolbar. This does not change the article viewport.
   const mockFrame=articleFrame();await page.setViewportSize({width:1550,height:2800});
   await page.evaluate(()=>window.scrollTo(0,0));
   const mockShots=[];for(let i=0;i<mock.pages.length;i++){
    await page.locator('#page-number').selectOption(String(i));
    const capture=await page.locator('#paper iframe').evaluate(frame=>{
     const rect=frame.getBoundingClientRect(),controls=document.querySelector('#controls').getBoundingClientRect();
     return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,controlsBottom:controls.bottom,width:innerWidth,height:innerHeight,frameWidth:frame.contentWindow.innerWidth,frameHeight:frame.contentWindow.innerHeight};
    });
    assert.ok(capture.left>=0&&capture.right<=capture.width&&capture.top>=capture.controlsBottom&&capture.bottom<=capture.height,'paper must fit the capture screen without toolbar overlap');
    assert.deepEqual([capture.frameWidth,capture.frameHeight],[1456,2056]);
    mockShots.push(await mockFrame.locator('.fixed-page').nth(i).screenshot());
   }
   await direct.goto(origin+'/'+article);await direct.evaluate(()=>document.fonts.ready);await direct.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)&&!document.querySelector('.missing'));
   const directPages=direct.locator('.fixed-page');assert.equal(await directPages.count(),mock.pages.length);
   const pngComparisons=[];
   for(let i=0;i<mock.pages.length;i++){
    const png=await directPages.nth(i).screenshot();
    const name=article===cover?'cover':`uniforms-${i+1}`;
    await fs.writeFile(path.join(out,name+'.png'),png);await fs.writeFile(path.join(out,name+'-mock.png'),mockShots[i]);
    assert.deepEqual(await mockFrame.locator('.fixed-page').nth(i).evaluate(geometry),await directPages.nth(i).evaluate(geometry),name+' geometry or text line wrapping');
    const a=PNG.sync.read(png),b=PNG.sync.read(mockShots[i]);
    assert.deepEqual([a.width,a.height,b.width,b.height],[1456,2056,1456,2056]);
    let sum=0,max=0,strong=0;
    for(let offset=0;offset<a.data.length;offset+=4){let pixel=0;
     for(let c=0;c<3;c++){const d=Math.abs(a.data[offset+c]-b.data[offset+c]);sum+=d;pixel=Math.max(pixel,d);}
     if(pixel>16)strong++;max=Math.max(max,pixel);
    }
    const meanAbsoluteError=sum/(a.width*a.height*3),strongPixelFraction=strong/(a.width*a.height);
    // The compositor dithers gradients/antialiasing at different screen origins.
    // First require exact element AND text-line geometry; then allow only the
    // measured small raster difference (record metrics instead of "pixel equal").
    assert.ok(meanAbsoluteError<=0.3,name+' mean pixel error');
    assert.ok(strongPixelFraction<=0.001,name+' strong pixel difference');
    assert.ok(max<=100,name+' peak pixel difference');
    pngComparisons.push({name,geometryEqual:true,byteEqual:png.equals(mockShots[i]),meanAbsoluteError,strongPixelFraction,maxChannelDifference:max});
   }
   const beforeGuide=await directPages.first().evaluate(geometry);
   await direct.goto(origin+'/'+article+'?fixedPreviewGuide=1');
   await direct.locator('#fixed-layout-manual-preview-badge').waitFor();
   await direct.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
   assert.deepEqual(await direct.locator('.fixed-page').first().evaluate(geometry),beforeGuide,'guide changes geometry');
   await page.setViewportSize({width:1100,height:900});await page.goto(origin+'/index.html');await choose(article);await ready();const normal=await metrics();assert.equal(await page.locator('#status').getAttribute('data-error'),'false');
   assert.equal(normal.pages.length,mock.pages.length);assert.ok(normal.images.every(i=>i.w>0));
   comparisons.push({article,pages:mock.pages.length,images:mock.images.length,pngComparisons});
  }
  await direct.close();return comparisons;
 });
 }
}catch(error){process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 const report={date:new Date().toISOString(),sourceSha256:createHash('sha256').update(source).digest('hex'),browser:await browser.version(),playwrightVersion:JSON.parse(await fs.readFile(path.join(repo,'node_modules/playwright/package.json'),'utf8')).version,node:process.version,viewport:[1456,2056],dpr:1,os:process.platform,fontNote:'OS fonts apply. Reference run installed Noto Sans JP; see tests/preview/README.md. No font file is redistributed.',devArticlePassed:false,results};
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(r=>server.close(r));
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,report:path.relative(repo,path.join(out,'results.json'))}));
}
