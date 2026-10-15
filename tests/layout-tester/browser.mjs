import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {startServer} from '../../tools/layout_tester_server.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR=path.join(ROOT,'layout-tester'),out=process.env.TEST_OUTPUT_DIR||await fs.mkdtemp(path.join(os.tmpdir(),'isekai-tester-results-'));
await fs.mkdir(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),chromiumSandbox:true,timeout:20000});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1,acceptDownloads:true});
const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
let server;
const tests=[];async function test(name,run){await run();tests.push(name);console.log(`ok ${tests.length} - ${name}`);}
const settled=async()=>{await page.waitForFunction(()=>window.layoutTester?.result&&!window.layoutTester.dirty,{},{timeout:15000});};
const config=async s=>{await page.locator('#config-file').setInputFiles({name:'test.layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await settled();};
const load=async text=>{await page.locator('#md-file').setInputFiles({name:'test.md',mimeType:'text/markdown',buffer:Buffer.from(text)});await settled();};
const state=()=>page.evaluate(()=>({settings:window.layoutTester.settings,measurements:window.layoutTester.result.measurements,diagnostics:window.layoutTester.result.diagnostics,pages:window.layoutTester.result.pages.length}));
const download=async(id,name)=>{const p=page.waitForEvent('download');await page.locator('#'+id).click();const d=await p;assert.equal(await d.failure(),null);const file=path.join(out,name);await d.saveAs(file);await page.waitForFunction(()=>document.querySelector('#status').dataset.state!=='busy');return fs.readFile(file);};
const dimensions=b=>[b.readUInt32BE(16),b.readUInt32BE(20)];
const defaults=JSON.parse(await fs.readFile(path.join(DIR,'defaults.json'),'utf8'));
try{
  // Use the normal HTTP/module route with the Chromium sandbox enabled.
  // If this environment does not permit it, report failure; do not change browser protections.
  server=await startServer({port:0});
  await page.goto(`http://127.0.0.1:${server.address().port}/layout-tester/`);
  await settled();
  await page.evaluate(async()=>{const a=await import('./export.mjs'),b=await import('./renderer.mjs');window.testHooks={pagePng:a.pagePng,PAGE_CSS:b.PAGE_CSS};});
  await test('sample: two pages and no diagnostics',async()=>{await settled();const s=await state();assert.equal(s.pages,2);assert.equal(s.diagnostics.length,0);assert.equal(await page.locator('#png').isDisabled(),false);});
  await test('image frame versus aspect-preserving visible image',async()=>{const m=(await state()).measurements.find(m=>m.id==='photo');assert.equal(m.image.frame.height,600);assert.ok(Math.abs(m.image.scaled.width/m.image.scaled.height-2.4)<.001);assert.ok(m.image.visible.height<m.image.frame.height);await page.locator('[data-id="photo"]').click();assert.match(await page.locator('#metrics').innerText(),/元画像 1200 × 500/);});
  let png;
  await test('PNG actual download and 1x dimensions',async()=>{png=await download('png','page-001.png');assert.deepEqual(dimensions(png),[1456,2056]);assert.ok(png.length>10000);});
  await test('guides and zoom do not change exported pixels',async()=>{const before=(await state()).measurements;await page.locator('#guides').uncheck();await page.locator('#zoom').evaluate(n=>{n.value='55';n.dispatchEvent(new Event('input',{bubbles:true}));});assert.deepEqual((await state()).measurements,before);const next=await download('png','without-guides.png');assert.equal(createHash('sha256').update(next).digest('hex'),createHash('sha256').update(png).digest('hex'));});
  await test('PNG versus clean DOM screenshot',async()=>{
    await page.setViewportSize({width:1456,height:2056});
    await page.evaluate(()=>{const n=window.layoutTester.result.pages[0].cloneNode(true);n.id='pixel-reference';n.querySelectorAll('[data-guide]').forEach(n=>n.remove());Object.assign(n.style,{position:'fixed',left:'0',top:'0',transform:'none',margin:'0',boxShadow:'none',zIndex:'99999'});document.body.append(n);});
    const reference=await page.screenshot({path:path.join(out,'reference.png'),clip:{x:0,y:0,width:1456,height:2056}});
    const diff=await page.evaluate(async({a,b})=>{
      async function pixels(data){const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data;}
      const x=await pixels(a),y=await pixels(b);let changed=0,sum=0;for(let i=0;i<x.length;i+=4){let d=0;for(let c=0;c<4;c++)d+=Math.abs(x[i+c]-y[i+c]);if(d)changed++;sum+=d;}return{changed,total:x.length/4,mean:sum/x.length};
    },{a:png.toString('base64'),b:reference.toString('base64')});
    await fs.writeFile(path.join(out,'pixel-comparison.json'),JSON.stringify(diff,null,2));console.log('pixel comparison',diff);assert.ok(diff.changed/diff.total<.015,JSON.stringify(diff));
    await page.locator('#pixel-reference').evaluate(n=>n.remove());await page.setViewportSize({width:1600,height:1000});
  });
  await test('all-page ZIP actual download',async()=>{const zip=await download('zip','pages.zip');assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(zip.readUInt16LE(zip.length-12),2);});
  await test('2x export scale independent of screen zoom',async()=>{await config({export:{scale:2}});const b=await download('png','2x.png');assert.deepEqual(dimensions(b),[2912,4112]);});
  await test('settings JSON actual download and import roundtrip',async()=>{const saved=await download('save-config','settings.json');const s=JSON.parse(saved);assert.equal(s.export.scale,2);await config(s);assert.deepEqual((await state()).settings,s);});
  await test('block width, asymmetric margin and padding',async()=>{await config({blocks:{photo:{width:900,margin:{left:17,top:11,bottom:19},padding:{left:10,right:20,top:5,bottom:7}}}});const m=(await state()).measurements.find(m=>m.id==='photo');assert.equal(m.width,900);assert.equal(m.x,64+17);assert.equal(m.padding.right,20);assert.equal(m.margin.top,11);assert.equal(m.image.frame.width,870);});
  await test('cover clips without distorting the image',async()=>{await config({image:{fit:'cover',height:800}});const a=(await state()).measurements.find(m=>m.id==='photo').image;assert.ok(Math.abs(a.scaled.width/a.scaled.height-2.4)<.001);assert.equal(a.visible.width,a.frame.width);assert.equal(a.visible.height,a.frame.height);assert.ok(a.scaled.width>a.frame.width);});
  await test('oversized atomic image disables PNG',async()=>{await config({image:{height:3000}});assert.ok((await state()).diagnostics.some(d=>d.level==='error'));assert.equal(await page.locator('#png').isDisabled(),true);});
  await config(defaults);
  const long='日本語とe\u0301と👨‍👩‍👧‍👦の文章です。'.repeat(300);
  await test('long styled paragraph splits with no Unicode loss',async()=>{await load('<!-- block:long -->\n'+long+'**太字の末尾**');const s=await state(),m=s.measurements.filter(m=>m.id==='long');assert.ok(m.length>1);assert.equal(m.map(x=>x.text).join(''),long+'太字の末尾');assert.equal(s.diagnostics.filter(d=>d.level==='error').length,0);const offsets=new Set([...new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(long+'太字の末尾')].map(x=>x.index));for(const piece of m)assert.ok(offsets.has(piece.from));assert.ok(await page.locator('.block strong').count()>0);});
  await test('two-column pagination uses both columns',async()=>{await config({page:{width:640,height:600,padding:{top:32,right:32,bottom:32,left:32},columns:2,columnGap:24},body:{fontSize:18,lineHeight:27}});const s=await state();assert.ok(s.measurements.some(m=>m.column===2));assert.equal(s.diagnostics.filter(d=>d.level==='error').length,0);});
  await test('heading is kept with a following text line',async()=>{const text=Array.from({length:20},(_,i)=>`段落${i}。本文が続きます。\n\n## 見出し${i}\n\n次の本文です。`).join('\n\n');await load(text);const m=(await state()).measurements;for(let i=0;i<m.length-1;i++)if(m[i].kind==='heading'){assert.equal(m[i].page,m[i+1].page);assert.equal(m[i].column,m[i+1].column);}});
  await test('stale block override is visible',async()=>{await config({blocks:{missing:{width:400}}});assert.ok((await state()).diagnostics.some(d=>d.message.includes('未適用')));});
  await test('missing image blocks output without reusing old success',async()=>{await page.locator('#md-file').setInputFiles({name:'missing.md',mimeType:'text/markdown',buffer:Buffer.from('![欠落](missing.png)')});await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='error');assert.match(await page.locator('#status').innerText(),/画像が見つかりません/);assert.equal(await page.locator('#png').isDisabled(),true);assert.equal(await page.evaluate(()=>window.layoutTester.dirty),true);});
  await config(defaults).catch(()=>{}); // current missing source still cannot render; replace it next.
  await load('原稿を戻します。');
  await test('unsupported HTML is rejected and never executed',async()=>{await page.locator('#md-file').setInputFiles({name:'bad.md',mimeType:'text/markdown',buffer:Buffer.from('<script>window.injected=true</script>')});await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='error');assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.locator('#png').isDisabled(),true);});
  await load('正常な原稿。');
  await test('invalid JSON cannot be accepted by pressing compose',async()=>{const before=(await state()).settings;await page.locator('#config-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"page":{"width":-1}}')});await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='error');assert.deepEqual((await state()).settings,before);await page.locator('#compose').click();assert.equal(await page.locator('#png').isDisabled(),true);assert.equal(await page.evaluate(()=>window.layoutTester.dirty),true);await config(defaults);});
  await test('rapid edits keep only the latest composition',async()=>{await page.evaluate(async()=>{const n=document.querySelector('#markdown');n.value='旧版です。'.repeat(200);n.dispatchEvent(new Event('input'));const old=window.layoutTester.recompose();n.value='最終版だけを表示';n.dispatchEvent(new Event('input'));const latest=window.layoutTester.recompose();await Promise.all([old,latest]);});await settled();assert.equal((await state()).measurements.map(m=>m.text).join(''),'最終版だけを表示');});
  await test('folder input resolves identical basenames by exact relative path',async()=>{
    const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'isekai-images-'));
    try{await fs.mkdir(path.join(fixture,'a'));await fs.mkdir(path.join(fixture,'b'));const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=16;c.getContext('2d').fillRect(0,0,32,16);return c.toDataURL().split(',')[1];});
      await fs.writeFile(path.join(fixture,'a','image.png'),Buffer.from(image,'base64'));await fs.writeFile(path.join(fixture,'b','image.png'),Buffer.from(image,'base64'));await fs.writeFile(path.join(fixture,'article.md'),'![甲](a/image.png)\n\n![乙](b/image.png)');
      await page.locator('#folder-files').setInputFiles(fixture);await settled();const s=await state();assert.equal(s.measurements.filter(m=>m.image).length,2);assert.equal(s.diagnostics.filter(d=>d.level==='error').length,0);
    }finally{await fs.rm(fixture,{recursive:true,force:true});}
  });
  await test('blank numeric setting stays invalid instead of becoming zero',async()=>{const input=page.locator('#settings-form [data-path="page.width"]');await input.fill('');await input.dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='error');assert.equal(await page.locator('#png').isDisabled(),true);await config(defaults);});
  await page.locator('#demo').click();await settled();await page.locator('#guides').check();await page.locator('[data-id="photo"]').click();await page.screenshot({path:path.join(out,'tester.png')});
  await test('no unhandled browser errors',()=>assert.deepEqual(jsErrors,[]));
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({mode:'HTTP',chromiumSandbox:true,browser:browser.version(),node:process.version,tests,passed:tests.length},null,2));
  console.log(`PASS ${tests.length} browser tests; ${out}`);
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
