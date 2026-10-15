#!/usr/bin/env node
// Production-layout tester server.
// Static files stay read-only. The two POST endpoints only compose/render in memory;
// they never overwrite Markdown, fixed_layout.html, images, or generated pages.
import http from 'node:http';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {prepareArticle, parseArticle, escapeHtml} from './article_source.mjs';
import {makeZip} from '../layout-tester/core.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff'};
export const TESTER_DEFAULTS={
  version:1,
  body:{fontSize:28,lineHeight:42},
  image:{landscapeHeight:885,portraitHeight:1030},
  blocks:{}
};
const SIDES=['top','right','bottom','left'];
const within=(root,target)=>{const rel=path.relative(root,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
const encodePath=value=>value.split('/').map(encodeURIComponent).join('/');
const htmlAttr=value=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const jsonText=value=>JSON.stringify(value).replace(/</g,'\\u003c');
function number(value,min,max,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label}: ${min}〜${max}の数値が必要です`);
}
function object(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label}: オブジェクトが必要です`);
}
function allowedKeys(value,allowed,label){
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`${label}: 未対応の設定 ${key}`);
}
export function validateTesterSettings(raw){
  const value=raw??TESTER_DEFAULTS;object(value,'設定');allowedKeys(value,['version','body','image','blocks'],'設定');
  if(value.version!==1)throw new Error('設定versionは1のみ対応です');
  const out={version:1,body:{},image:{},blocks:{}};
  if(value.body!==undefined){
    object(value.body,'body');allowedKeys(value.body,['fontSize','lineHeight'],'body');
    if(value.body.fontSize!==undefined){number(value.body.fontSize,8,120,'body.fontSize');out.body.fontSize=value.body.fontSize;}
    if(value.body.lineHeight!==undefined){number(value.body.lineHeight,10,180,'body.lineHeight');out.body.lineHeight=value.body.lineHeight;}
  }
  if(value.image!==undefined){
    object(value.image,'image');allowedKeys(value.image,['landscapeHeight','portraitHeight'],'image');
    if(value.image.landscapeHeight!==undefined){number(value.image.landscapeHeight,120,1600,'image.landscapeHeight');out.image.landscapeHeight=value.image.landscapeHeight;}
    if(value.image.portraitHeight!==undefined){number(value.image.portraitHeight,120,1800,'image.portraitHeight');out.image.portraitHeight=value.image.portraitHeight;}
  }
  if(value.blocks!==undefined){
    object(value.blocks,'blocks');if(Object.keys(value.blocks).length>500)throw new Error('blocksは500件以下にしてください');
    for(const [id,entry] of Object.entries(value.blocks)){
      if(!/^b\d{3,6}$/.test(id))throw new Error(`blocks.${id}: 本番ブロックID(b001等)を指定してください`);
      object(entry,`blocks.${id}`);allowedKeys(entry,['width','fontSize','lineHeight','imageHeight','margin','padding'],`blocks.${id}`);
      const next={};
      for(const [key,min,max] of [['width',80,1328],['fontSize',8,120],['lineHeight',10,180],['imageHeight',120,1800]]){
        if(entry[key]!==undefined){number(entry[key],min,max,`blocks.${id}.${key}`);next[key]=entry[key];}
      }
      for(const group of ['margin','padding'])if(entry[group]!==undefined){
        object(entry[group],`blocks.${id}.${group}`);allowedKeys(entry[group],SIDES,`blocks.${id}.${group}`);next[group]={};
        for(const side of SIDES)if(entry[group][side]!==undefined){
          const min=group==='margin'?-200:0;number(entry[group][side],min,600,`blocks.${id}.${group}.${side}`);next[group][side]=entry[group][side];
        }
      }
      out.blocks[id]=next;
    }
  }
  return out;
}
function cssForSettings(settings){
  const s=validateTesterSettings(settings),rules=[];
  const body=[];
  if(s.body.fontSize!==undefined)body.push(`font-size:${s.body.fontSize}px`);
  if(s.body.lineHeight!==undefined)body.push(`line-height:${s.body.lineHeight}px`);
  if(body.length)rules.push(`.article-body{${body.join(';')}}`);
  if(s.image.landscapeHeight!==undefined)rules.push(`.scene:not(.portrait) .scene-image{height:${s.image.landscapeHeight}px}`);
  if(s.image.portraitHeight!==undefined)rules.push(`.scene.portrait .scene-image{height:${s.image.portraitHeight}px}`);
  for(const [id,entry] of Object.entries(s.blocks)){
    const text=`.article-body>[data-source="${id}"]`,figure=`[data-figure="${id}"]`,decl=[];
    if(entry.width!==undefined)decl.push(`width:${entry.width}px`);
    if(entry.fontSize!==undefined)decl.push(`font-size:${entry.fontSize}px`);
    if(entry.lineHeight!==undefined)decl.push(`line-height:${entry.lineHeight}px`);
    for(const group of ['margin','padding'])for(const side of SIDES)if(entry[group]?.[side]!==undefined)decl.push(`${group}-${side}:${entry[group][side]}px`);
    if(decl.length)rules.push(`${text},${figure}{${decl.join(';')}}`);
    if(entry.imageHeight!==undefined)rules.push(`${figure} .scene-image{height:${entry.imageHeight}px}`);
  }
  // Selection is tester-only decoration. It is never present in server-side PNG export.
  rules.push('.layout-tester-selected{outline:5px solid #315dde!important;outline-offset:3px}');
  rules.push('html{scrollbar-width:none}body::-webkit-scrollbar{display:none}');
  return rules.join('\n');
}
async function resolveArticle(realRoot,input){
  if(typeof input!=='string'||!input.trim())throw new Error('記事ディレクトリまたはMDパスを指定してください');
  let relative=input.trim().replace(/\\/g,'/');
  if(relative.startsWith('/')||relative.includes('\0')||relative.includes(':')||relative.split('/').some(x=>!x||x==='.'||x==='..'||x.startsWith('.')))throw new Error('リポジトリ内の相対パスを指定してください');
  let expectedSource=null;
  if(/\.md$/i.test(relative)){expectedSource=path.posix.basename(relative);relative=path.posix.dirname(relative);}
  if(!/^20\\d{4}\\/[^/]+$/.test(relative))throw new Error('記事は YYYYMM/記事フォルダー の形で指定してください');
  const articleDir=path.resolve(realRoot,...relative.split('/'));
  if(!within(realRoot,articleDir))throw new Error('記事パスがリポジトリ外です');
  const realArticle=await fs.realpath(articleDir);
  if(!within(realRoot,realArticle)||!(await fs.stat(realArticle)).isDirectory())throw new Error('記事ディレクトリが見つかりません');
  const config=JSON.parse(await fs.readFile(path.join(realArticle,'layout-source.json'),'utf8'));
  if(config.version!==1||config.template!=='illustrated-article-v1'||typeof config.source!=='string')throw new Error('本番Markdown組版対象の記事ではありません');
  if(expectedSource&&expectedSource!==config.source)throw new Error(`指定MDはlayout-source.jsonの正本ではありません: ${config.source}`);
  return{articleDir:realArticle,article:relative,config};
}
async function validateOverrideSource(articleDir,markdown,parsed){
  if(markdown.length>1_200_000)throw new Error('原稿は120万文字以下にしてください');
  const fontInfo=JSON.parse(await fs.readFile(path.join(articleDir,'fonts/font.json'),'utf8'));
  const coverage=new Set(fontInfo.codepoints);
  const text=markdown+'異世界丸見え実話現地取材202604月号続0123456789 /';
  const missing=[...new Set([...text].map(c=>c.codePointAt(0)))].filter(c=>c>32&&!coverage.has(c));
  if(missing.length)throw new Error(`埋込フォント未収録文字: ${missing.map(c=>`U+${c.toString(16).toUpperCase()}`).join(', ')}。本番フォントを更新してください`);
  for(const block of parsed.blocks.filter(b=>b.type==='figure')){
    const target=path.resolve(articleDir,block.src);
    if(!within(articleDir,target))throw new Error(`画像が記事外です: ${block.src}`);
    const real=await fs.realpath(target);if(!within(articleDir,real)||!(await fs.stat(real)).isFile())throw new Error(`画像が見つかりません: ${block.src}`);
  }
}
export async function composeCandidate(realRoot,{article,markdown,settings}={}){
  const resolved=await resolveArticle(realRoot,article);
  const baseline=await prepareArticle(resolved.articleDir);
  const sourceText=markdown===undefined?await fs.readFile(path.join(resolved.articleDir,resolved.config.source),'utf8'):String(markdown);
  const parsed=markdown===undefined?baseline.parsed:parseArticle(sourceText);
  await validateOverrideSource(resolved.articleDir,sourceText,parsed);
  const selectedImages=[...new Set(parsed.blocks.filter(b=>b.type==='figure').map(b=>b.src))];
  const manifest={...baseline.manifest,blockCount:parsed.blocks.length,selectedImages};
  const payload=jsonText({...parsed,manifest});
  let html=baseline.html
    .replace(/<meta name="article-render-sha256" content="[^"]+">/,'')
    .replace(/<title>[\s\S]*?<\/title>/,`<title>${escapeHtml(parsed.blocks[0].text)}</title>`)
    .replace(/<script type="application\/json" id="article-source">[\s\S]*?<\/script>/,`<script type="application/json" id="article-source">${payload}</script>`);
  const validated=validateTesterSettings(settings??TESTER_DEFAULTS);
  const base=`/${encodePath(resolved.article)}/`;
  html=html.replace('</head>',`<base href="${htmlAttr(base)}"><meta name="layout-tester-candidate" content="1"><style id="layout-tester-overrides">${cssForSettings(validated)}</style></head>`);
  return{...resolved,html,markdown:sourceText,parsed,settings:validated};
}
async function readJson(req,max=2_000_000){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error('リクエストが大きすぎます');chunks.push(chunk);}
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new Error('JSONを読めません');}
  object(value,'リクエスト');return value;
}
function send(res,status,type,body,extra={}){
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(String(body));
  res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length,...extra});res.end(bytes);
}
function pngDimensions(buffer){
  if(buffer.length<24||buffer.toString('ascii',1,4)!=='PNG')throw new Error('PNG生成結果が不正です');
  return{width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
}
async function renderCandidate(html,url,pageSpec){
  const {chromium}=await import('playwright');
  let browser,page;
  try{
    browser=await chromium.launch({headless:true});
    page=await browser.newPage({viewport:{width:1456,height:2056},deviceScaleFactor:1});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForFunction(()=>window.__articleComposition?.status==='ready'||window.__articleComposition?.status==='failed',{}, {timeout:20000});
    const failure=await page.evaluate(()=>window.__articleComposition?.status==='failed'?window.__articleComposition.error:null);
    if(failure)throw new Error(`本番組版失敗: ${failure}`);
    const locators=page.locator('.fixed-page'),count=await locators.count();
    if(!count)throw new Error('本番ページが生成されませんでした');
    const indices=pageSpec==='all'?Array.from({length:count},(_,i)=>i):[Number(pageSpec)-1];
    if(indices.some(i=>!Number.isInteger(i)||i<0||i>=count))throw new Error(`ページ指定が範囲外です（1〜${count}）`);
    const files=[];
    for(const i of indices){
      const buffer=await locators.nth(i).screenshot({animations:'disabled',scale:'css',timeout:15000});
      const d=pngDimensions(buffer);if(d.width!==1456||d.height!==2056)throw new Error(`p${i+1}: ${d.width}×${d.height}。1456×2056ではありません`);
      files.push({name:`page-${String(i+1).padStart(3,'0')}.png`,bytes:new Uint8Array(buffer)});
    }
    return{files,count};
  }finally{if(page)await page.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});}
}
export async function startServer({port=4173,root=ROOT}={}){
  const realRoot=await fs.realpath(root),productionRoot=await fs.realpath(ROOT),candidates=new Map();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    try{
      const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)){send(res,403,'text/plain; charset=utf-8','Loopback only');return;}
      const origin=req.headers.origin;if(req.headers['sec-fetch-site']==='cross-site'||(origin&&origin!==`http://${host}`)){send(res,403,'text/plain; charset=utf-8','Same origin only');return;}
      const requestUrl=new URL(req.url||'/',`http://${host}`),pathname=decodeURIComponent(requestUrl.pathname);
      if(pathname.startsWith('/__layout-tester/')){
        if(realRoot!==productionRoot){send(res,404,'text/plain; charset=utf-8','Not available');return;}
        const tokenMatch=pathname.match(/^\/__layout-tester\/candidate\/([0-9a-f-]+)$/);
        if(tokenMatch&&req.method==='GET'){
          const html=candidates.get(tokenMatch[1]);if(!html){send(res,404,'text/plain; charset=utf-8','Candidate expired');return;}
          send(res,200,'text/html; charset=utf-8',html);return;
        }
        if(pathname==='/__layout-tester/source'&&req.method==='GET'){
          const resolved=await resolveArticle(realRoot,requestUrl.searchParams.get('article')||'');
          const markdown=await fs.readFile(path.join(resolved.articleDir,resolved.config.source),'utf8');
          send(res,200,'application/json; charset=utf-8',JSON.stringify({article:resolved.article,source:resolved.config.source,markdown,settings:TESTER_DEFAULTS}));return;
        }
        if(pathname==='/__layout-tester/compose'&&req.method==='POST'){
          const candidate=await composeCandidate(realRoot,await readJson(req));
          send(res,200,'text/html; charset=utf-8',candidate.html);return;
        }
        if(pathname==='/__layout-tester/export'&&req.method==='POST'){
          const payload=await readJson(req),candidate=await composeCandidate(realRoot,payload),token=randomUUID();
          candidates.set(token,candidate.html);
          try{
            const rendered=await renderCandidate(candidate.html,`http://${host}/__layout-tester/candidate/${token}`,payload.page??1);
            if(payload.page==='all'){
              const blob=makeZip(rendered.files),buffer=Buffer.from(await blob.arrayBuffer());
              send(res,200,'application/zip',buffer,{'X-Layout-Page-Count':String(rendered.count)});return;
            }
            send(res,200,'image/png',Buffer.from(rendered.files[0].bytes),{'X-Layout-Page-Count':String(rendered.count)});return;
          }finally{candidates.delete(token);}
        }
        send(res,req.method==='GET'||req.method==='POST'?404:405,'text/plain; charset=utf-8','Not available');return;
      }
      if(!['GET','HEAD'].includes(req.method)){send(res,405,'text/plain; charset=utf-8','Read only');return;}
      const raw=pathname;
      if(raw.includes('\\')||raw.includes('\0')||raw.split('/').some(x=>x.startsWith('.'))){send(res,403,'text/plain; charset=utf-8','Forbidden');return;}
      let relative=raw.replace(/^\//,'');if(!relative||relative==='layout-tester/'||relative==='layout-tester')relative='layout-tester/index.html';
      const target=path.resolve(realRoot,relative),ext=path.extname(target).toLowerCase();
      if(!within(realRoot,target)||!MIME[ext]){send(res,403,'text/plain; charset=utf-8','Forbidden');return;}
      const real=await fs.realpath(target);if(!within(realRoot,real)){send(res,403,'text/plain; charset=utf-8','Forbidden');return;}
      const stat=await fs.stat(real);if(!stat.isFile()||stat.size>25*1024*1024){send(res,413,'text/plain; charset=utf-8','File too large');return;}
      res.writeHead(200,{'Content-Type':MIME[ext],'Content-Length':stat.size});res.end(req.method==='HEAD'?undefined:await fs.readFile(real));
    }catch(e){
      if(!res.headersSent)send(res,400,'text/plain; charset=utf-8',e?.message||'Not available');
      else res.end();
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=process.argv.find(a=>a.startsWith('--port='));const port=arg?Number(arg.slice(7)):4173;
  if(!Number.isInteger(port)||port<0||port>65535){console.error('Invalid port');process.exitCode=1;}
  else try{const server=await startServer({port});console.log(`組版テスター: http://127.0.0.1:${server.address().port}/layout-tester/`);}catch(e){console.error(e.message);process.exitCode=1;}
}
