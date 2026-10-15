import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {parseMarkdown, inline, inlineText, mergeSettings, validateSettings, assetPath, makeZip, crc32} from '../../layout-tester/core.mjs';
import {startServer} from '../../tools/layout_tester_server.mjs';
import {parseArticle} from '../../tools/article_parse.mjs';
import {parseArticle as parseProductionArticle} from '../../tools/article_source.mjs';
import {validateTesterSettings,TESTER_DEFAULTS} from '../../layout-tester/production_settings.mjs';
import {parseArticleForTester} from '../../layout-tester/article_compat.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const defaults=JSON.parse(await fs.readFile(path.join(ROOT,'layout-tester/defaults.json'),'utf8'));
let count=0;async function test(name,run){await run();console.log(`ok ${++count} - ${name}`);}
await test('default settings and partial merge',()=>{assert.equal(validateSettings(defaults).page.width,1456);assert.equal(mergeSettings(defaults,{body:{fontSize:30,lineHeight:45}}).page.height,2056);});
await test('settings do not mutate defaults',()=>{const v=mergeSettings(defaults,{page:{padding:{left:90}}});assert.equal(defaults.page.padding.left,64);assert.equal(v.page.padding.right,64);});
for(const [name,value] of Object.entries({unknown:{typo:1},unknownNested:{body:{lineHieght:2}},null:{page:null},negative:{page:{width:-1}},nonfinite:{body:{fontSize:Infinity}},string:{page:{columns:'2'}},badBoolean:{blocks:{title:{breakBefore:'false'}}},badID:{blocks:{constructor:{width:2}}},wrongVersion:{version:2},emptyArea:{page:{padding:{left:1456}}},badFont:{body:{fontFamily:'a;display:none'}},badColor:{body:{color:'red'}},giantPNG:{page:{width:6000,height:6000},export:{scale:3}},unknownOverride:{blocks:{title:{scaleX:2}}}})) {
  await test(`reject ${name}`,()=>assert.throws(()=>mergeSettings(defaults,value)));
}
await test('all supported block types preserve source order',()=>{const p=parseMarkdown('# 題\n\n段落 **太字**\n\n> 引用\n\n- 項目\n\n```js\na();\n```\n\n![画像](a.png "注")\n\n| 名 |\n| --- |\n| 値 |\n\n---');assert.deepEqual(p.blocks.map(b=>b.type),['heading','p','quote','list','code','image','table','hr']);});
await test('inline formatting and Unicode text',()=>assert.equal(inlineText(inline('あ**強調** *斜体* `x_y` [リンク](https://example.com) 👨‍👩‍👧')), 'あ強調 斜体 x_y リンク 👨‍👩‍👧'));
await test('unrelated insertion preserves automatic IDs',()=>{const a=parseMarkdown('甲\n\n乙'),b=parseMarkdown('追加\n\n甲\n\n乙');assert.equal(a.blocks[1].id,b.blocks[2].id);});
await test('explicit ID remains stable when text changes',()=>assert.equal(parseMarkdown('<!-- block:lead -->\n甲').blocks[0].id,parseMarkdown('<!-- block:lead -->\n改稿').blocks[0].id));
await test('duplicate auto-ID is visible as warning',()=>{const p=parseMarkdown('甲\n\n甲');assert.equal(p.warnings.length,1);assert.notEqual(p.blocks[0].id,p.blocks[1].id);});
await test('duplicate explicit ID is an error',()=>assert.throws(()=>parseMarkdown('<!-- block:a -->\n甲\n\n<!-- block:a -->\n乙'),/重複/));
for(const raw of ['<script>alert(1)</script>','[x](javascript:alert)','![x](https://example.com/x.png)','````\nx','[not closed','- a\n  - nested','<!-- block:constructor -->\nx','<!-- discard me -->','word **open','<iframe src=x>']) await test(`reject unsafe/unsupported ${raw.slice(0,22)}`,()=>assert.throws(()=>parseMarkdown(raw)));
await test('table column alignment is preserved',()=>assert.deepEqual(parseMarkdown('| 左 | 中 | 右 |\n| --- | :---: | ---: |\n| 甲 | 乙 | 丙 |').blocks[0].align,['left','center','right']));
await test('legacy article figure is supported without arbitrary HTML',()=>{const b=parseMarkdown('<figure>\n <img src="./apr26_04_01_blessing_bill.png" alt="既存の画像">\n <figcaption>▲ 説明。</figcaption>\n</figure>').blocks[0];assert.equal(b.src,'apr26_04_01_blessing_bill.png');assert.equal(b.caption,'▲ 説明。');});
await test('Japanese encoded relative image path',()=>assert.equal(assetPath('./素材/%E7%B5%B5.png'),'素材/絵.png'));
for(const src of ['../a.png','/a.png','a.svg','a.png?x','file:a.png','a/%00.png']) await test(`reject image path ${src}`,()=>assert.throws(()=>assetPath(src)));
await test('ZIP CRC32 known vector and archive structure',async()=>{const bytes=new TextEncoder().encode('123456789');assert.equal(crc32(bytes),0xcbf43926);const zip=Buffer.from(await makeZip([{name:'page-001.png',bytes}]).arrayBuffer());assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(zip.readUInt32LE(14),0xcbf43926);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);assert.equal(zip.readUInt16LE(zip.length-12),1);});
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'isekai-tester-server-'));await fs.mkdir(path.join(tmp,'layout-tester'));await fs.writeFile(path.join(tmp,'layout-tester/index.html'),'fixture');await fs.writeFile(path.join(tmp,'原稿.md'),'原稿');
const server=await startServer({port:0,root:tmp}),port=server.address().port;
const request=(url,options={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:url,...options},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});
try{
  await test('HTTP entry, no-store and MIME',async()=>{const r=await request('/layout-tester/');assert.equal(r.status,200);assert.equal(r.body,'fixture');assert.equal(r.headers['cache-control'],'no-store');assert.match(r.headers['content-type'],/text\/html/);});
  await test('HTTP Japanese MD path',async()=>assert.equal((await request('/'+encodeURIComponent('原稿.md'))).body,'原稿'));
  for(const p of ['/.git/config','/../outside.md','/%2e%2e/outside.md','/..%2foutside.md','/%00.png','/a\\b.md'])await test(`HTTP rejects ${p}`,async()=>assert.equal((await request(p)).status,403));
  await test('HTTP rejects writes and unexpected Host',async()=>{assert.equal((await request('/',{method:'POST'})).status,405);assert.equal((await request('/',{headers:{Host:'example.com'}})).status,403);});
  await test('HTTP rejects cross-site requests and mismatched origins',async()=>{assert.equal((await request('/',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);assert.equal((await request('/',{headers:{Origin:'https://example.com'}})).status,403);});
  await test('HTTP allows its own origin and blocks cross-origin embedding',async()=>{const r=await request('/layout-tester/',{headers:{Origin:`http://127.0.0.1:${port}`,'Sec-Fetch-Site':'same-origin'}});assert.equal(r.status,200);assert.equal(r.headers['cross-origin-resource-policy'],'same-origin');});
  await test('HTTP rejects a symlink outside root',async()=>{const outside=path.join(os.tmpdir(),`isekai-outside-${process.pid}.md`);await fs.writeFile(outside,'secret');try{await fs.symlink(outside,path.join(tmp,'escape.md'));assert.equal((await request('/escape.md')).status,403);}finally{await fs.rm(outside,{force:true});}});
}finally{await new Promise(r=>server.close(r));await fs.rm(tmp,{recursive:true,force:true});}
await test('production tester settings are bounded',()=>{assert.equal(validateTesterSettings(TESTER_DEFAULTS).body.fontSize,28);assert.throws(()=>validateTesterSettings({version:1,body:{fontSize:999}}),/fontSize/);assert.throws(()=>validateTesterSettings({version:1,blocks:{x:{width:100}}}),/本番ブロックID/);});
const articleMd=await fs.readFile(path.join(ROOT,'202604','04_聖職者花見乱痴気騒ぎ','聖職者花見乱痴気騒ぎ.md'),'utf8');
await test('browser parser is the same function body and result as production',()=>{
  assert.equal(parseArticle.toString(),parseProductionArticle.toString());
  const parsed=parseArticle(articleMd),production=parseProductionArticle(articleMd);
  assert.deepEqual(parsed,production);
  assert.equal(parsed.blocks.length,45);
  assert.equal(parsed.blocks.filter(b=>b.type==='figure').length,5);
  assert.equal(parsed.groups.length,5);
});
const article03Md=await fs.readFile(path.join(ROOT,'202604','03_王都ギルド登録所大混乱','王都ギルド登録所大混乱.md'),'utf8');
await test('202604 compatibility adapter accepts legacy figures and text-only section',()=>{
  const adapted=parseArticleForTester(article03Md);
  assert.equal(adapted.normalizedLegacyFigure,true);
  assert.equal(adapted.textOnlySections,1);
  assert.equal(adapted.parsed.blocks.length,49);
  assert.equal(adapted.parsed.blocks.filter(b=>b.type==='figure').length,5);
  assert.equal(adapted.parsed.groups.length,6);
  assert.deepEqual(adapted.parsed.groups.map(g=>g.filter(b=>b.type==='figure').length),[1,1,1,1,0,1]);
});
await test('stable compatibility paginator handles text-only sections without source patching',async()=>{
  const runtime=await fs.readFile(path.join(ROOT,'layout-tester','paginate_compat.js'),'utf8');
  const compat=await fs.readFile(path.join(ROOT,'layout-tester','article_compat.mjs'),'utf8');
  const app=await fs.readFile(path.join(ROOT,'layout-tester','app.mjs'),'utf8');
  assert.match(runtime,/if \(!figure\) return null/);
  assert.match(runtime,/!page\.querySelector\('img'\)/);
  assert.match(runtime,/scene\?\.dataset\.figure/);
  assert.match(runtime,/page\.dataset\.textOnly = 'true'/);
  assert.doesNotMatch(compat,/adaptRuntimeForTextSections/);
  assert.doesNotMatch(app,/adaptRuntimeForTextSections/);
  assert.match(app,/layout-tester\/paginate_compat\.js/);
  assert.doesNotMatch(app,/tools\/article-layout\/paginate\.js/);
});
await test('all 202604 layout-source articles pass the tester compatibility parser',async()=>{
  const issueDir=path.join(ROOT,'202604');
  const dirs=(await fs.readdir(issueDir,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&/^\d\d_/.test(entry.name));
  let checked=0;
  for(const dir of dirs){
    const configPath=path.join(issueDir,dir.name,'layout-source.json');
    let config;
    try{config=JSON.parse(await fs.readFile(configPath,'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
    const markdown=await fs.readFile(path.join(issueDir,dir.name,config.source),'utf8');
    const adapted=parseArticleForTester(markdown);
    assert.ok(adapted.parsed.blocks.length>0,dir.name);
    assert.ok(adapted.parsed.groups.length>0,dir.name);
    checked++;
  }
  assert.equal(checked,24);
});
await test('layout tester entry has no dedicated API dependency',async()=>{
  const app=await fs.readFile(path.join(ROOT,'layout-tester','app.mjs'),'utf8');
  assert.doesNotMatch(app,/\/__layout-tester\//);
  assert.match(app,/layout-source\.json/);
  assert.match(app,/article_parse\.mjs/);
  assert.match(app,/production_export\.mjs/);
  assert.match(app,/article_compat\.mjs/);
  assert.match(app,/paginate_compat\.js/);
  assert.match(app,/shared-fallback/);
});
await test('Explorer article-folder picker is present and wired',async()=>{
  const html=await fs.readFile(path.join(ROOT,'layout-tester','index.html'),'utf8');
  const app=await fs.readFile(path.join(ROOT,'layout-tester','app.mjs'),'utf8');
  assert.match(html,/id="folder-files"[^>]*webkitdirectory/);
  assert.match(app,/function folderSelection\(/);
  assert.match(app,/function loadFolderArticle\(/);
  assert.match(app,/\$\('folder-files'\)\.onchange/);
  assert.match(app,/kind:'folder'/);
});
await test('browser runner keeps sandbox enabled and forbids dedicated API use',async()=>{const s=await fs.readFile(path.join(ROOT,'tests/layout-tester/browser.mjs'),'utf8');assert.match(s,/chromiumSandbox:true/);assert.doesNotMatch(s,/--no-sandbox|LAYOUT_TEST_MEMORY|page\.setContent|page\.addScriptTag/);assert.match(s,/dedicatedRequests/);});
console.log(`PASS ${count} tests`);
