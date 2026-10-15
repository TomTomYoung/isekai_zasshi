import {parseArticleForTester} from './article_compat.mjs';
import {TESTER_DEFAULTS,validateTesterSettings,cssForTesterSettings} from './production_settings.mjs';
import {exportProductionPages,pagePng} from './production_export.mjs';

const $=id=>document.getElementById(id);
const SIDES=['top','right','bottom','left'];
const REPO_ROOT=new URL('../',document.baseURI);
// CodeSwing等がwindow.fetchを差し替えて日本語パスを変形する場合でも、
// 同一originの空iframeから取得したブラウザ本来のfetchを使う。
const transport=document.createElement('iframe');
transport.hidden=true;transport.title='資産読取';transport.setAttribute('aria-hidden','true');
document.body.append(transport);
const read=transport.contentWindow.fetch.bind(transport.contentWindow);
let source=null,settings=structuredClone(TESTER_DEFAULTS),articleData=null,pages=[],currentPage=1,selected=null,busy=false,dirty=true,ready=false,pendingJson=false,generation=0;
let instructionMode=false,instruction=null,instructionDrag=null;
const frame=$('preview-frame');

function status(text,state='ok'){$('status').textContent=text;$('status').dataset.state=state;}
function setPath(obj,path,value){
  const bits=path.split('.'),last=bits.pop();let at=obj;
  for(const bit of bits)at=at[bit]??={};
  if(value===undefined)delete at[last];else at[last]=value;
}
function getPath(obj,path){return path.split('.').reduce((v,k)=>v?.[k],obj);}
function clean(obj){
  if(Array.isArray(obj))return obj.map(clean);
  if(!obj||typeof obj!=='object')return obj;
  const out={};for(const [k,v] of Object.entries(obj)){const c=clean(v);if(c&&typeof c==='object'&&!Array.isArray(c)&&!Object.keys(c).length)continue;out[k]=c;}return out;
}
function fileStem(){return (source?.source||'layout').replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_.-]+/gu,'-').slice(0,70)||'layout';}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function repoUrl(relative){return new URL(relative,REPO_ROOT);}
async function staticFetch(relative,{binary=false}={}){
  const response=await read(repoUrl(relative),{cache:'no-store'});
  if(!response.ok)throw new Error(`読込失敗 ${response.status}: ${relative}`);
  return binary?response.blob():response.text();
}
async function staticJson(relative){
  const text=await staticFetch(relative);
  try{return JSON.parse(text);}catch{throw new Error(`JSONを読めません: ${relative}`);}
}
async function blobDataUrl(blob){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('フォントをブラウザへ読み込めません'));
    reader.readAsDataURL(blob);
  });
}
async function sha256(blob){
  if(!globalThis.crypto?.subtle)return null;
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function optionalStaticFont(article){
  const request=async relative=>{try{return await read(repoUrl(relative),{cache:'no-store'});}catch{return null;}};
  const [infoResponse,fontResponse]=await Promise.all([
    request(`${article}/fonts/font.json`),
    request(`${article}/fonts/article.woff`)
  ]);
  if(infoResponse?.ok&&fontResponse?.ok){
    let fontInfo;
    try{fontInfo=JSON.parse(await infoResponse.text());}catch{throw new Error('fonts/font.json をJSONとして読めません');}
    if(!Array.isArray(fontInfo.codepoints)||typeof fontInfo.sha256!=='string')throw new Error('fonts/font.json が不正です');
    const fontBlob=await fontResponse.blob(),actualHash=await sha256(fontBlob);
    if(actualHash!==null&&actualHash!==fontInfo.sha256)throw new Error('記事フォントのハッシュが font.json と一致しません');
    return{fontInfo,fontBlob,fontMode:'article'};
  }
  if(Boolean(infoResponse?.ok)!==Boolean(fontResponse?.ok))throw new Error('fonts/font.json と fonts/article.woff は両方置くか、両方省略してください');
  const fallbackArticle='202604/04_聖職者花見乱痴気騒ぎ';
  const [fallbackInfo,fallbackBlob]=await Promise.all([
    staticJson(`${fallbackArticle}/fonts/font.json`),
    staticFetch(`${fallbackArticle}/fonts/article.woff`,{binary:true})
  ]);
  const fallbackHash=await sha256(fallbackBlob);
  if(fallbackHash!==null&&fallbackHash!==fallbackInfo.sha256)throw new Error('共通fallbackフォントのハッシュが font.json と一致しません');
  return{fontInfo:fallbackInfo,fontBlob:fallbackBlob,fontMode:'shared-fallback'};
}
function normalizeArticleInput(input){
  let relative=String(input||'').trim().replace(/\\/g,'/');
  if(!relative||relative.startsWith('/')||relative.includes(':')||relative.includes('?')||relative.includes('#')||relative.split('/').some(x=>!x||x==='.'||x==='..'||x.startsWith('.')))throw new Error('リポジトリ内の記事パスを指定してください');
  let expectedSource=null;
  if(/\.md$/i.test(relative)){expectedSource=relative.split('/').pop();relative=relative.slice(0,relative.lastIndexOf('/'));}
  if(!/^20\d{4}\/[^/]+$/.test(relative))throw new Error('記事は YYYYMM/記事フォルダー の形で指定してください');
  return{article:relative,expectedSource};
}
async function loadStaticArticle(input){
  const {article,expectedSource}=normalizeArticleInput(input);
  const config=await staticJson(`${article}/layout-source.json`);
  if(config?.version!==1||config?.template!=='illustrated-article-v1'||typeof config.source!=='string'||!config.source||/[\\/]/.test(config.source)||config.source.startsWith('.'))throw new Error('layout-source.json が本番Markdown記事の形式ではありません');
  if(expectedSource&&expectedSource!==config.source)throw new Error(`指定MDは正本ではありません。正本: ${config.source}`);
  const [markdown,templateCss,runtime,font]=await Promise.all([
    staticFetch(`${article}/${config.source}`),
    staticFetch('tools/article-layout/template.css'),
    staticFetch('layout-tester/paginate_compat.js'),
    optionalStaticFont(article)
  ]);
  return{
    kind:'repo',article,source:config.source,template:config.template,markdown,templateCss,runtime,
    fontInfo:font.fontInfo,fontMode:font.fontMode,fontDataUrl:await blobDataUrl(font.fontBlob),
    articleBase:repoUrl(article+'/')
  };
}
function folderSelection(fileList){
  const entries=[...fileList].map(file=>({
    file,
    path:String(file.webkitRelativePath||file.name||'').replace(/\\/g,'/')
  })).filter(x=>x.path);
  const configs=entries.filter(x=>x.path==='layout-source.json'||x.path.endsWith('/layout-source.json'));
  if(configs.length!==1)throw new Error(configs.length?'記事フォルダー単位で選択してください。layout-source.json が複数あります':'選択したフォルダーに layout-source.json がありません');
  const root=configs[0].path.slice(0,-'layout-source.json'.length);
  const folderName=(root.replace(/\/$/,'').split('/').pop()||'記事フォルダー');
  const files=new Map();
  for(const entry of entries){
    if(!entry.path.startsWith(root))continue;
    const relative=entry.path.slice(root.length);
    if(relative&&!files.has(relative))files.set(relative,entry.file);
  }
  return{folderName,files};
}
async function localText(files,path,max,label=path){
  const file=files.get(path);
  if(!file)throw new Error(`記事フォルダーに ${label} がありません`);
  if(file.size>max)throw new Error(`${label} が大きすぎます`);
  return file.text();
}
async function loadFolderArticle(fileList){
  const {folderName,files}=folderSelection(fileList);
  let config;
  try{config=JSON.parse(await localText(files,'layout-source.json',1_000_000));}
  catch(error){if(error instanceof SyntaxError)throw new Error('layout-source.json をJSONとして読めません');throw error;}
  if(config?.version!==1||config?.template!=='illustrated-article-v1'||typeof config.source!=='string'||!config.source||/[\\/]/.test(config.source)||config.source.startsWith('.'))throw new Error('layout-source.json が本番Markdown記事の形式ではありません');
  const [markdown,templateCss,runtime]=await Promise.all([
    localText(files,config.source,1_200_000,'正本MD '+config.source),
    staticFetch('tools/article-layout/template.css'),
    staticFetch('layout-tester/paginate_compat.js')
  ]);
  const localInfoFile=files.get('fonts/font.json'),localFontBlob=files.get('fonts/article.woff');
  let fontInfo,fontBlob,fontMode;
  if(localInfoFile&&localFontBlob){
    try{fontInfo=JSON.parse(await localInfoFile.text());}catch{throw new Error('fonts/font.json をJSONとして読めません');}
    if(!Array.isArray(fontInfo.codepoints)||typeof fontInfo.sha256!=='string')throw new Error('fonts/font.json が不正です');
    fontBlob=localFontBlob;fontMode='article';
    const actualHash=await sha256(fontBlob);
    if(actualHash!==null&&actualHash!==fontInfo.sha256)throw new Error('記事フォルダーの article.woff と font.json のハッシュが一致しません');
  }else if(localInfoFile||localFontBlob){
    throw new Error('fonts/font.json と fonts/article.woff は両方置くか、両方省略してください');
  }else{
    const fallback=await optionalStaticFont('202604/04_聖職者花見乱痴気騒ぎ');
    fontInfo=fallback.fontInfo;fontBlob=fallback.fontBlob;fontMode='shared-fallback';
  }
  return{
    kind:'folder',article:folderName,folderName,source:config.source,template:config.template,markdown,
    templateCss,runtime,fontInfo,fontMode,fontDataUrl:await blobDataUrl(fontBlob),files,assetUrls:new Map()
  };
}
function releaseSourceAssets(value){
  if(value?.assetUrls)for(const url of value.assetUrls.values())URL.revokeObjectURL(url);
}
function localAssetUrl(src){
  const relative=src.replace(/^\.\//,'');
  const file=source.files?.get(relative);
  if(!file)throw new Error(`記事フォルダーに採用画像がありません: ${relative}`);
  let url=source.assetUrls.get(relative);
  if(!url){url=URL.createObjectURL(file);source.assetUrls.set(relative,url);}
  return url;
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeJson(value){return JSON.stringify(value).replace(/</g,'\\u003c');}
function validateSourceForFont(markdown,parsed){
  if(markdown.length>1_200_000)throw new Error('原稿は120万文字以下にしてください');
  if(source.fontMode==='article'){
    const coverage=new Set(source.fontInfo.codepoints);
    const sample=markdown+'異世界丸見え実話現地取材202604月号続0123456789 /';
    const missing=[...new Set([...sample].map(c=>c.codePointAt(0)))].filter(c=>c>32&&!coverage.has(c));
    if(missing.length)throw new Error(`埋込フォント未収録文字: ${missing.map(c=>`U+${c.toString(16).toUpperCase()}`).join(', ')}`);
  }
  for(const block of parsed.blocks.filter(b=>b.type==='figure')){
    if(!/^\.\/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i.test(block.src))throw new Error(`本番画像パス形式ではありません: ${block.src}`);
    if(source.kind==='folder'&&!source.files.has(block.src.replace(/^\.\//,'')))throw new Error(`記事フォルダーに採用画像がありません: ${block.src}`);
  }
}
async function candidateHtml(markdown,rawSettings){
  const adapted=parseArticleForTester(markdown),parsed=adapted.parsed,validated=validateTesterSettings(rawSettings);
  validateSourceForFont(markdown,parsed);
  const selectedImages=[...new Set(parsed.blocks.filter(b=>b.type==='figure').map(b=>b.src))];
  let rendered=parsed;
  if(source.kind==='folder'){
    const blocks=parsed.blocks.map(block=>block.type==='figure'?{...block,originalSrc:block.src,src:localAssetUrl(block.src)}:{...block});
    const byId=new Map(blocks.map(block=>[block.id,block]));
    rendered={blocks,groups:parsed.groups.map(group=>group.map(block=>byId.get(block.id)))};
  }
  const manifest={version:1,source:source.source,template:source.template,blockCount:parsed.blocks.length,selectedImages,font:source.fontInfo,fontMode:source.fontMode,normalizedLegacyFigure:adapted.normalizedLegacyFigure,normalizedInlineMarkup:adapted.normalizedInlineMarkup,normalizedListMarkup:adapted.normalizedListMarkup,normalizedQuoteGaps:adapted.normalizedQuoteGaps,normalizedDividers:adapted.normalizedDividers,textOnlySections:adapted.textOnlySections,splitFigureSections:adapted.splitFigureSections,syntheticSubtitle:adapted.syntheticSubtitle};
  const data=safeJson({...rendered,manifest});
  const runtime=source.runtime.replace(/<\/script/gi,'<\\/script');
  const overrides=cssForTesterSettings(validated);
  const baseHref=source.kind==='repo'?source.articleBase.href:document.baseURI;
  return{
    parsed,settings:validated,
    html:`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=1456"><meta name="article-source-contract" content="1"><meta name="layout-tester-candidate" content="${source.kind==='folder'?'folder-browser':'static-browser'}"><base href="${escapeHtml(baseHref)}"><title>${escapeHtml(parsed.blocks[0].text)}</title>
<style>@font-face{font-family:ArticleSubset;src:url("${source.fontDataUrl}") format('woff');font-weight:100 900;font-display:block}
${source.templateCss}
${overrides}</style></head><body><main id="article-pages"></main>
<script type="application/json" id="article-source">${data}</script>
<script>${runtime}</script></body></html>`
  };
}
function buttons(){
  const allowed=source&&ready&&!busy&&!dirty;
  $('png').disabled=$('zip').disabled=!allowed;
  $('save-config').disabled=!source||busy||pendingJson;
  $('prev').disabled=!ready||busy||currentPage<=1;
  $('next').disabled=!ready||busy||currentPage>=pages.length;
  $('instruction-mode').disabled=!ready||busy;
  if(!instruction){
    $('copy-instruction').disabled=$('save-instruction').disabled=$('clear-instruction').disabled=true;
  }
}
function invalidate(message='MDまたは設定が未反映です。「このMDで本番組版」を押してください。'){
  clearInstruction({keepMode:true});
  generation++;dirty=true;ready=false;status(message,'busy');$('diagnostic-title').textContent='本番組版検査：未確認';buttons();
}
function syncJson(){$('json-editor').value=JSON.stringify(clean(settings),null,2);pendingJson=false;}
function syncGlobalForm(){for(const input of $('settings-form').querySelectorAll('[data-key]'))input.value=getPath(settings,input.dataset.key)??'';}
function syncBlockForm(){
  const entry=selected?settings.blocks?.[selected]||{}:{};
  for(const input of $('block-form').querySelectorAll('[data-key]'))input.value=getPath(entry,input.dataset.key)??'';
  $('reset-block').disabled=!selected||!Object.hasOwn(settings.blocks||{},selected);
}
function syncSettingsUI(){syncGlobalForm();syncBlockForm();syncJson();}
function readNumber(input){
  if(input.value==='')return undefined;
  const v=Number(input.value);if(!Number.isFinite(v))throw new Error(`${input.dataset.key}: 数値が必要です`);return v;
}
function blockLabel(block){
  if(!block)return'';
  if(block.type==='figure')return block.caption||block.alt||block.src;
  if(block.type==='table')return block.header.join(' / ');
  return block.text||block.type;
}
function buildBlockList(){
  $('block-list').replaceChildren();
  for(const block of articleData?.blocks||[]){
    const button=document.createElement('button');button.dataset.id=block.id;
    const kind=document.createElement('small'),label=document.createElement('span');
    kind.textContent=block.type.toUpperCase();label.textContent=blockLabel(block);button.append(kind,label);
    button.onclick=()=>selectBlock(block.id);$('block-list').append(button);
  }
  $('block-count').textContent=`${articleData?.blocks?.length||0}件`;
}
function pageIndexFor(node){const page=node?.closest('.fixed-page');return page?pages.indexOf(page)+1:0;}
function selectedNodes(){
  const doc=frame.contentDocument;if(!doc||!selected)return[];
  return [...doc.querySelectorAll(`[data-source="${selected}"],[data-figure="${selected}"]`)];
}
function updateSelectionOutline(){
  const doc=frame.contentDocument;if(!doc)return;
  doc.querySelectorAll('.layout-tester-selected').forEach(n=>n.classList.remove('layout-tester-selected'));
  if(!$('guides').checked||!selected)return;
  for(const node of selectedNodes())node.classList.add('layout-tester-selected');
}
function selectBlock(id,page){
  if(!ready||!articleData)return;selected=id;
  const nodes=selectedNodes();
  if(page)currentPage=page;else if(nodes.length)currentPage=pageIndexFor(nodes[0])||currentPage;
  updatePreview();updateSelection();
}
function px(style,key){const v=parseFloat(style[key]);return Number.isFinite(v)?Math.round(v*100)/100:0;}
function visibleImageMetrics(figure,page){
  const img=figure.querySelector('img');if(!img||!img.naturalWidth||!img.naturalHeight)return null;
  const r=img.getBoundingClientRect(),pr=page.getBoundingClientRect(),fit=getComputedStyle(img).objectFit||'fill';
  let sw=r.width,sh=r.height;
  if(fit==='contain'){const scale=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight);sw=img.naturalWidth*scale;sh=img.naturalHeight*scale;}
  else if(fit==='cover'){const scale=Math.max(r.width/img.naturalWidth,r.height/img.naturalHeight);sw=img.naturalWidth*scale;sh=img.naturalHeight*scale;}
  const vw=Math.min(r.width,sw),vh=Math.min(r.height,sh);
  return{frame:{width:r.width,height:r.height},source:{width:img.naturalWidth,height:img.naturalHeight},visible:{width:vw,height:vh},fit};
}
function updateSelection(){
  $('block-list').querySelectorAll('button').forEach(n=>n.setAttribute('aria-current',String(n.dataset.id===selected)));
  syncBlockForm();updateSelectionOutline();
  if(!ready||!selected){$('selection-name').textContent='紙面上の本文・画像を選択';$('metrics').textContent='選択するとW/H、位置、margin、padding、紙面端までの距離を表示します。';return;}
  const block=articleData.blocks.find(b=>b.id===selected),nodes=selectedNodes();
  const node=nodes.find(n=>pageIndexFor(n)===currentPage)||nodes[0];
  if(!node){$('selection-name').textContent=selected;$('metrics').textContent='現在の候補DOMにこのブロックがありません。';return;}
  const page=node.closest('.fixed-page'),r=node.getBoundingClientRect(),pr=page.getBoundingClientRect(),style=getComputedStyle(node);
  const x=r.left-pr.left,y=r.top-pr.top,w=r.width,h=r.height;
  const margin=Object.fromEntries(SIDES.map(k=>[k,px(style,'margin'+k[0].toUpperCase()+k.slice(1))]));
  const padding=Object.fromEntries(SIDES.map(k=>[k,px(style,'padding'+k[0].toUpperCase()+k.slice(1))]));
  const edge={top:y,right:pr.width-(x+w),bottom:pr.height-(y+h),left:x};
  let text=`W ${w.toFixed(1)} × H ${h.toFixed(1)} px\nx ${x.toFixed(1)} / y ${y.toFixed(1)}\np${pageIndexFor(node)} / ${block?.type||node.tagName}\n\n上 / 右 / 下 / 左\nmargin  ${SIDES.map(k=>margin[k]).join(' / ')}\npadding ${SIDES.map(k=>padding[k]).join(' / ')}\n紙面端  ${SIDES.map(k=>edge[k].toFixed(1)).join(' / ')}`;
  const figure=node.matches('[data-figure]')?node:null,image=figure?visibleImageMetrics(figure,page):null;
  if(image)text+=`\n\n画像枠 ${image.frame.width.toFixed(1)} × ${image.frame.height.toFixed(1)}\n元画像 ${image.source.width} × ${image.source.height}\n可視範囲 ${image.visible.width.toFixed(1)} × ${image.visible.height.toFixed(1)}\n配置 ${image.fit}`;
  $('selection-name').textContent=`${selected} / ${block?.type||node.tagName} / ${blockLabel(block)}`;$('metrics').textContent=text;
}

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function round1(value){return Math.round(value*10)/10;}
function removeInstructionOverlay(){
  frame.contentDocument?.querySelectorAll('.layout-instruction-region').forEach(node=>node.remove());
}
function applyInstructionMode(){
  const doc=frame.contentDocument;if(!doc)return;
  doc.querySelectorAll('.fixed-page').forEach(page=>page.style.cursor=instructionMode?'crosshair':'');
  $('instruction-mode').setAttribute('aria-pressed',String(instructionMode));
}
function setInstructionMode(active){
  instructionMode=Boolean(active);
  applyInstructionMode();
  if(instructionMode&&ready)status('指示範囲モード：紙面上をドラッグしてください。','ok');
}
function normalizeRegion(pageIndex,rect){
  const page=pages[pageIndex-1];if(!page)throw new Error('指示対象ページがありません');
  const width=page.getBoundingClientRect().width||1456,height=page.getBoundingClientRect().height||2056;
  let x=clamp(Number(rect.x)||0,0,width),y=clamp(Number(rect.y)||0,0,height);
  let w=clamp(Number(rect.w)||0,0,width-x),h=clamp(Number(rect.h)||0,0,height-y);
  return{page:pageIndex,rect:{x:round1(x),y:round1(y),w:round1(w),h:round1(h)}};
}
function renderInstructionOverlay(){
  removeInstructionOverlay();
  if(!instruction)return;
  const page=pages[instruction.page-1];if(!page)return;
  const {x,y,w,h}=instruction.rect;
  const box=page.ownerDocument.createElement('div');
  box.className='layout-instruction-region';
  Object.assign(box.style,{
    position:'absolute',left:x+'px',top:y+'px',width:w+'px',height:h+'px',
    border:'5px solid #d52b1e',background:'rgba(213,43,30,.08)',
    zIndex:'9999',pointerEvents:'none',boxSizing:'border-box'
  });
  const label=page.ownerDocument.createElement('div');
  label.textContent=`指示範囲 p${String(instruction.page).padStart(2,'0')}`;
  Object.assign(label.style,{
    position:'absolute',left:'-5px',top:'-34px',padding:'4px 8px',
    background:'#d52b1e',color:'#fff',font:'22px/26px sans-serif',
    whiteSpace:'nowrap'
  });
  box.append(label);page.append(box);
}
function blockSnippet(block){
  if(!block)return'';
  const raw=block.type==='table'?block.header.join(' / '):block.type==='figure'?(block.caption||block.alt||block.src):(block.text||'');
  return String(raw).replace(/\s+/g,' ').trim().slice(0,100);
}
function instructionNodeDescriptor(node,pageRect){
  const r=node.getBoundingClientRect();
  let id=node.dataset.source||node.dataset.figure||'';
  let type='structure',label='';
  if(id){
    const block=articleData?.blocks.find(b=>b.id===id);
    type=block?.type||(node.dataset.figure?'figure':'block');
    label=blockSnippet(block);
  }else if(node.classList.contains('running-head')){id='running-head';type='running-head';label='柱';}
  else if(node.classList.contains('folio')){id='folio';type='folio';label='ノンブル';}
  else return null;
  return{
    id,type,label,
    start:node.dataset.start??null,end:node.dataset.end??null,
    rect:{x:round1(r.left-pageRect.left),y:round1(r.top-pageRect.top),w:round1(r.width),h:round1(r.height)}
  };
}
function overlapsRect(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function instructionContext(target=instruction){
  if(!target)return null;
  const page=pages[target.page-1];if(!page)return null;
  const pr=page.getBoundingClientRect();
  const nodes=[...page.querySelectorAll('.running-head,[data-figure],[data-source],.folio')]
    .map(node=>instructionNodeDescriptor(node,pr)).filter(Boolean);
  const rect=target.rect;
  const overlaps=nodes.filter(item=>overlapsRect(rect,item.rect));
  const top=rect.y,bottom=rect.y+rect.h;
  const above=nodes.filter(item=>item.rect.y+item.rect.h<=top+0.1)
    .sort((a,b)=>(b.rect.y+b.rect.h)-(a.rect.y+a.rect.h))[0]||null;
  const below=nodes.filter(item=>item.rect.y>=bottom-0.1)
    .sort((a,b)=>a.rect.y-b.rect.y)[0]||null;
  return{
    kind:overlaps.length?'content':'blank',overlaps,above,below,
    textOnly:page.dataset.textOnly==='true',
    figure:page.querySelector('.scene')?.dataset.figure||null
  };
}
function compactInstructionNode(node){
  if(!node)return null;
  return{id:node.id,type:node.type,label:node.label,start:node.start,end:node.end,rect:node.rect};
}
function instructionPayload(){
  if(!instruction||!source)return null;
  const context=instructionContext();
  return{
    version:1,
    article:source.article,
    source:source.source,
    input:source.kind,
    page:instruction.page,
    pageCount:pages.length,
    pageSize:{w:1456,h:2056},
    rect:instruction.rect,
    kind:context.kind,
    textOnlyPage:context.textOnly,
    figure:context.figure,
    overlaps:context.overlaps.map(compactInstructionNode),
    above:compactInstructionNode(context.above),
    below:compactInstructionNode(context.below),
    note:$('instruction-note').value.trim()||null
  };
}
function instructionNodeLine(node){
  if(!node)return'なし';
  const range=node.start!==null?` range=${node.start}-${node.end}`:'';
  return `${node.id} / ${node.type}${range}${node.label?' / '+node.label:''}`;
}
function buildInstructionText(){
  const payload=instructionPayload();if(!payload)throw new Error('指示範囲がありません');
  const rect=payload.rect,context=instructionContext();
  return [
    '【組版テスター指示対象】',
    `記事: ${payload.article}`,
    `正本MD: ${payload.source}`,
    `ページ: ${payload.page} / ${payload.pageCount}`,
    `範囲: x=${rect.x}, y=${rect.y}, w=${rect.w}, h=${rect.h} px（1456×2056基準）`,
    `判定: ${payload.kind==='blank'?'空白':'要素上'}${payload.textOnlyPage?' / テキストのみページ':''}`,
    `重なる要素: ${context.overlaps.length?context.overlaps.map(instructionNodeLine).join(' | '):'なし'}`,
    `直前: ${instructionNodeLine(context.above)}`,
    `直後: ${instructionNodeLine(context.below)}`,
    `指示: ${payload.note||'この範囲を対象にしてください。'}`,
    'LAYOUT_TARGET_JSON: '+JSON.stringify(payload)
  ].join('\n');
}
function updateInstructionPanel(){
  if(!instruction){
    $('instruction-name').textContent='「指示範囲」を押して紙面上をドラッグ';
    $('instruction-metrics').textContent='空白部分を含め、紙面上の任意の矩形を指定できます。';
    $('copy-instruction').disabled=$('save-instruction').disabled=$('clear-instruction').disabled=true;
    return;
  }
  const context=instructionContext(),r=instruction.rect;
  $('instruction-name').textContent=`p${instruction.page} / ${context.kind==='blank'?'空白':'要素上'}`;
  $('instruction-metrics').textContent=
    `x ${r.x} / y ${r.y}\nW ${r.w} × H ${r.h} px\n重なり ${context.overlaps.length}件\n直前 ${context.above?.id||'なし'}\n直後 ${context.below?.id||'なし'}`;
  $('copy-instruction').disabled=$('save-instruction').disabled=$('clear-instruction').disabled=false;
}
function setInstructionRegion(pageIndex,rect,{jump=true}={}){
  instruction=normalizeRegion(pageIndex,rect);
  if(jump){currentPage=instruction.page;updatePreview();}
  renderInstructionOverlay();updateInstructionPanel();buttons();
  return instruction;
}
function clearInstruction({keepMode=true}={}){
  instruction=null;instructionDrag=null;removeInstructionOverlay();updateInstructionPanel();
  if(!keepMode)setInstructionMode(false);
  buttons();
}
function pointOnPage(event,page){
  const r=page.getBoundingClientRect();
  return{x:clamp(event.clientX-r.left,0,r.width),y:clamp(event.clientY-r.top,0,r.height)};
}
function dragRect(start,end){
  return{x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)};
}
function installInstructionHandlers(doc){
  doc.addEventListener('pointerdown',event=>{
    if(!instructionMode||event.button!==0)return;
    const page=event.target.closest?.('.fixed-page');if(!page)return;
    event.preventDefault();event.stopImmediatePropagation();
    const pageIndex=pages.indexOf(page)+1,start=pointOnPage(event,page);
    instructionDrag={page:pageIndex,start,last:start,pointerId:event.pointerId};
    try{doc.documentElement.setPointerCapture(event.pointerId);}catch{}
    setInstructionRegion(pageIndex,{x:start.x,y:start.y,w:1,h:1},{jump:false});
  },true);
  doc.addEventListener('pointermove',event=>{
    if(!instructionMode||!instructionDrag||event.pointerId!==instructionDrag.pointerId)return;
    const page=pages[instructionDrag.page-1];if(!page)return;
    event.preventDefault();event.stopImmediatePropagation();
    const end=pointOnPage(event,page);instructionDrag.last=end;
    setInstructionRegion(instructionDrag.page,dragRect(instructionDrag.start,end),{jump:false});
  },true);
  doc.addEventListener('pointerup',event=>{
    if(!instructionMode||!instructionDrag||event.pointerId!==instructionDrag.pointerId)return;
    const page=pages[instructionDrag.page-1];if(!page)return;
    event.preventDefault();event.stopImmediatePropagation();
    let rect=dragRect(instructionDrag.start,pointOnPage(event,page));
    if(rect.w<8&&rect.h<8){
      const cx=instructionDrag.start.x,cy=instructionDrag.start.y;
      rect={x:clamp(cx-80,0,1456),y:clamp(cy-50,0,2056),w:160,h:100};
      rect.w=Math.min(rect.w,1456-rect.x);rect.h=Math.min(rect.h,2056-rect.y);
    }
    const pageIndex=instructionDrag.page;instructionDrag=null;
    setInstructionRegion(pageIndex,rect,{jump:true});
    status('指示範囲を指定しました。「ChatGPT用にコピー」で位置情報を渡せます。','ok');
  },true);
  doc.addEventListener('click',event=>{
    if(instructionMode&&event.target.closest?.('.fixed-page')){event.preventDefault();event.stopImmediatePropagation();}
  },true);
}
async function copyText(text){
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
  const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';
  document.body.append(area);area.select();
  if(!document.execCommand('copy'))throw new Error('クリップボードへコピーできません');
  area.remove();
}
async function copyInstruction(){
  if(!instruction)return;
  const text=buildInstructionText(),page=pages[instruction.page-1];
  try{
    const png=await pagePng(page,{includeInstruction:true});
    if(navigator.clipboard?.write&&globalThis.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain':new Blob([text],{type:'text/plain'}),
        'image/png':png
      })]);
      status('ChatGPT用の位置情報と赤枠PNGをクリップボードへコピーしました。','ok');
      return;
    }
  }catch{}
  await copyText(text);
  status('ChatGPT用の位置情報をコピーしました。画像が必要なら「指示PNG保存」を使えます。','ok');
}
async function saveInstructionPng(){
  if(!instruction)return;
  const blob=await pagePng(pages[instruction.page-1],{includeInstruction:true});
  download(blob,`${fileStem()}-p${String(instruction.page).padStart(3,'0')}-instruction.png`);
  status('赤枠つき指示PNGを保存しました。','ok');
}
function updatePreview(){
  if(!ready||!pages.length){$('page-number').textContent='—';buttons();return;}
  currentPage=Math.max(1,Math.min(currentPage,pages.length));
  const zoom=Number($('zoom').value)/100;$('zoom-value').value=`${Math.round(zoom*100)}%`;
  frame.style.transform=`scale(${zoom})`;frame.style.transformOrigin='top left';
  $('frame-holder').style.width=`${1456*zoom}px`;$('frame-holder').style.height=`${2056*zoom}px`;
  requestAnimationFrame(()=>frame.contentWindow.scrollTo(0,pages[currentPage-1].offsetTop));
  $('page-number').textContent=`${String(currentPage).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`;
  $('paper-size').textContent='紙面 1456 × 2056 px / 本番DOM';updateSelectionOutline();renderInstructionOverlay();applyInstructionMode();buttons();
}
function showDiagnostics(report,error){
  const host=$('diagnostics');host.replaceChildren();
  if(error){const p=document.createElement('p');p.className='error';p.textContent='エラー: '+error;host.append(p);$('diagnostic-title').textContent='本番組版検査：失敗';return;}
  const errors=report?.errors||[];$('diagnostic-title').textContent=`本番組版検査：エラー ${errors.length} / ${report?.pages?.length||0}ページ`;
  if(errors.length)for(const e of errors){const p=document.createElement('p');p.className='error';p.textContent=e;host.append(p);}
  else{const p=document.createElement('p');p.textContent=`auditArticleComposition(): OK。正本ブロック ${report.sourceBlocks}件、採用画像 ${report.selectedImages}点、${report.pages.length}ページ。`;host.append(p);}
  for(const m of report?.pages||[]){const p=document.createElement('p');p.className='metric';p.textContent=`p${m.page}: image/text=${m.imageToText.toFixed(2)} / body bottom=${m.bottom.toFixed(1)} / figure=${m.figure}${m.repeated?' (再掲)':''}`;host.append(p);}
}
async function waitComposition(token){
  const deadline=Date.now()+22000;
  while(Date.now()<deadline){
    if(token!==generation)throw new Error('組版を更新しました');
    const state=frame.contentWindow?.__articleComposition;
    if(state?.status==='ready')return state;if(state?.status==='failed')throw new Error(state.error||'本番組版に失敗しました');
    await new Promise(r=>setTimeout(r,50));
  }
  throw new Error('本番組版の完了待ちがタイムアウトしました');
}
async function setFrameHtml(html,token){
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('候補HTMLの読込がタイムアウトしました')),15000);
    frame.onload=()=>{clearTimeout(timer);resolve();};frame.srcdoc=html;
  });
  return waitComposition(token);
}
function clearPreview(error){
  clearInstruction({keepMode:false});
  ready=false;pages=[];articleData=null;selected=null;
  frame.removeAttribute('src');frame.srcdoc='<!doctype html><html><body style="margin:0;background:#fff"></body></html>';
  $('block-list').replaceChildren();$('block-count').textContent='0件';$('page-number').textContent='—';$('render-source').textContent='—';
  showDiagnostics(null,error);updateSelection();
}
async function compose(){
  if(!source||busy)return;if(pendingJson){status('設定JSONが未適用です。JSONを適用してください。','error');return;}
  if(instruction)clearInstruction({keepMode:true});
  const token=++generation;busy=true;ready=false;buttons();status('本番parser・CSS・埋込フォント・paginate.jsでブラウザ内組版しています…','busy');
  try{
    const candidate=await candidateHtml($('markdown').value,clean(settings));settings=candidate.settings;syncSettingsUI();
    await setFrameHtml(candidate.html,token);if(token!==generation)return;
    const doc=frame.contentDocument;articleData=JSON.parse(doc.getElementById('article-source').textContent);
    pages=[...doc.querySelectorAll('.fixed-page')];if(!pages.length)throw new Error('fixed-pageが生成されませんでした');
    const report=frame.contentWindow.auditArticleComposition();if(!report.ok)throw new Error(report.errors.join('\n'));
    ready=true;dirty=false;currentPage=Math.min(currentPage,pages.length)||1;
    if(!articleData.blocks.some(b=>b.id===selected))selected=articleData.blocks[0]?.id||null;buildBlockList();
    doc.addEventListener('click',event=>{if(instructionMode)return;const n=event.target.closest?.('[data-source],[data-figure]');if(!n)return;event.preventDefault();selectBlock(n.dataset.source||n.dataset.figure,pageIndexFor(n));});
    installInstructionHandlers(doc);applyInstructionMode();updateInstructionPanel();
    showDiagnostics(report);$('render-source').textContent=(source.kind==='folder'?'エクスプローラ選択 + ':'静的GET + ')+'parseArticle + template.css + '+(source.fontMode==='article'?'記事ArticleSubset':'共通フォントfallback')+' + paginate_compat.js';
    status(`${source.kind==='folder'?'エクスプローラ: ':''}${source.source} · ${pages.length}ページ · 本番組版OK${source.fontMode==='article'?'':' · 記事フォントなし→共通fallback'}`,'ok');updatePreview();updateSelection();
  }catch(error){
    if(token===generation){dirty=false;clearPreview(error.message);status(error.message,'error');}
  }finally{busy=false;buttons();}
}
async function loadSource(){
  if(busy)return;const token=++generation;busy=true;buttons();status('layout-source.json と正本MDを直接読込中です…','busy');
  try{
    const loaded=await loadStaticArticle($('source-path').value.trim());if(token!==generation)return;
    releaseSourceAssets(source);source=loaded;settings=structuredClone(TESTER_DEFAULTS);
    $('markdown').value=loaded.markdown;$('source-name').textContent=loaded.source;$('source-article').textContent=loaded.article;$('source-path').value=loaded.article;
    selected=null;currentPage=1;syncSettingsUI();dirty=true;busy=false;await compose();
  }catch(error){
    if(token===generation){releaseSourceAssets(source);source=null;dirty=true;clearPreview(error.message);status(error.message,'error');}
  }finally{busy=false;buttons();}
}
async function loadFolder(fileList){
  if(busy)return;const token=++generation;busy=true;buttons();status('記事フォルダーの layout-source.json・正本MD・画像・フォントを読込中です…','busy');
  try{
    const loaded=await loadFolderArticle(fileList);if(token!==generation)return;
    releaseSourceAssets(source);source=loaded;settings=structuredClone(TESTER_DEFAULTS);
    $('markdown').value=loaded.markdown;$('source-name').textContent=loaded.source;$('source-article').textContent='エクスプローラ: '+loaded.folderName;
    selected=null;currentPage=1;syncSettingsUI();dirty=true;busy=false;await compose();
  }catch(error){
    if(token===generation){releaseSourceAssets(source);source=null;dirty=true;clearPreview(error.message);status(error.message,'error');}
  }finally{busy=false;buttons();}
}
async function exportOutput(all){
  if(!source||!ready||dirty||busy)return;busy=true;buttons();
  try{
    await exportProductionPages({
      pages,currentPage,all,stem:fileStem(),
      progress:(i,n)=>status(`本番DOMからPNGを生成中 ${i}/${n}…`,'busy')
    });
    status(all?'全ページPNGをZIP出力しました。':'このページのPNGを出力しました。','ok');
  }catch(error){status(error.message,'error');}finally{busy=false;buttons();}
}

$('load-path').onclick=loadSource;$('compose').onclick=compose;
$('folder-files').onchange=async e=>{const files=[...e.target.files];try{if(files.length)await loadFolder(files);}finally{$('folder-files').value='';}};
$('markdown').addEventListener('input',()=>invalidate());
$('md-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1_200_000)throw new Error('原稿は120万文字以下にしてください');$('markdown').value=await file.text();invalidate(`${file.name} を一時差替えしました。本番組版してください。`);}catch(error){status(error.message,'error');}finally{$('md-file').value='';}};
$('zoom').oninput=updatePreview;$('guides').onchange=()=>{updateSelectionOutline();updateSelection();};
$('instruction-mode').onclick=()=>setInstructionMode(!instructionMode);
$('clear-instruction').onclick=()=>clearInstruction({keepMode:true});
$('copy-instruction').onclick=async()=>{try{await copyInstruction();}catch(error){status(error.message,'error');}};
$('save-instruction').onclick=async()=>{try{await saveInstructionPng();}catch(error){status(error.message,'error');}};
$('prev').onclick=()=>{currentPage--;updatePreview();updateSelection();};$('next').onclick=()=>{currentPage++;updatePreview();updateSelection();};
$('settings-form').addEventListener('change',async()=>{try{for(const input of $('settings-form').querySelectorAll('[data-key]'))setPath(settings,input.dataset.key,readNumber(input));settings=validateTesterSettings(clean(settings));syncJson();invalidate('本番CSS一時設定を変更しました。再組版しています…');await compose();}catch(error){status(error.message,'error');}});
$('block-form').addEventListener('change',async()=>{
  if(!selected)return;
  try{
    const entry={};for(const input of $('block-form').querySelectorAll('[data-key]')){const value=readNumber(input);if(value!==undefined)setPath(entry,input.dataset.key,value);}
    settings.blocks??={};if(Object.keys(clean(entry)).length)settings.blocks[selected]=clean(entry);else delete settings.blocks[selected];
    settings=validateTesterSettings(clean(settings));syncJson();invalidate('ブロック一時設定を変更しました。再組版しています…');await compose();
  }catch(error){status(error.message,'error');}
});
$('reset-block').onclick=async()=>{if(!selected)return;delete settings.blocks[selected];syncSettingsUI();invalidate('ブロック一時設定を解除しました。再組版しています…');await compose();};
$('json-editor').addEventListener('input',()=>{pendingJson=true;invalidate('設定JSONが未適用です。「JSONを適用して再組版」を押してください。');});
$('apply-json').onclick=async()=>{try{settings=validateTesterSettings(JSON.parse($('json-editor').value));pendingJson=false;syncSettingsUI();await compose();}catch(error){status(error.message,'error');}};
$('config-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1_000_000)throw new Error('設定JSONが大きすぎます');settings=validateTesterSettings(JSON.parse(await file.text()));pendingJson=false;syncSettingsUI();invalidate('設定JSONを読み込みました。再組版しています…');await compose();}catch(error){status(error.message,'error');}finally{$('config-file').value='';}};
$('save-config').onclick=()=>download(new Blob([JSON.stringify(clean(settings),null,2)+'\n'],{type:'application/json'}),`${fileStem()}.layout.json`);
$('png').onclick=()=>exportOutput(false);$('zip').onclick=()=>exportOutput(true);

window.layoutTester={
  get ready(){return ready;},get dirty(){return dirty;},get source(){return source;},get settings(){return settings;},
  get articleData(){return articleData;},get pages(){return pages;},get currentPage(){return currentPage;},
  get instruction(){return instruction;},
  compose,loadSource,loadFolder,selectBlock,setInstructionRegion,clearInstruction,
  instructionText:buildInstructionText
};
syncSettingsUI();loadSource();
