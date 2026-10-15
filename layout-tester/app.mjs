import {parseArticle} from '../tools/article_parse.mjs';
import {TESTER_DEFAULTS,validateTesterSettings,cssForTesterSettings} from './production_settings.mjs';
import {exportProductionPages} from './production_export.mjs';

const $=id=>document.getElementById(id);
const SIDES=['top','right','bottom','left'];
const REPO_ROOT=new URL('../',import.meta.url);
// CodeSwing等がwindow.fetchを差し替えて日本語パスを変形する場合でも、
// 同一originの空iframeから取得したブラウザ本来のfetchを使う。
const transport=document.createElement('iframe');
transport.hidden=true;transport.title='資産読取';transport.setAttribute('aria-hidden','true');
document.body.append(transport);
const read=transport.contentWindow.fetch.bind(transport.contentWindow);
let source=null,settings=structuredClone(TESTER_DEFAULTS),articleData=null,pages=[],currentPage=1,selected=null,busy=false,dirty=true,ready=false,pendingJson=false,generation=0;
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
  const [markdown,templateCss,runtime,fontInfo,fontBlob]=await Promise.all([
    staticFetch(`${article}/${config.source}`),
    staticFetch('tools/article-layout/template.css'),
    staticFetch('tools/article-layout/paginate.js'),
    staticJson(`${article}/fonts/font.json`),
    staticFetch(`${article}/fonts/article.woff`,{binary:true})
  ]);
  if(!Array.isArray(fontInfo.codepoints)||typeof fontInfo.sha256!=='string')throw new Error('fonts/font.json が不正です');
  const actualHash=await sha256(fontBlob);
  if(actualHash!==null&&actualHash!==fontInfo.sha256)throw new Error('記事フォントのハッシュが font.json と一致しません');
  return{
    article,source:config.source,template:config.template,markdown,templateCss,runtime,fontInfo,
    fontDataUrl:await blobDataUrl(fontBlob),
    articleBase:repoUrl(article+'/')
  };
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeJson(value){return JSON.stringify(value).replace(/</g,'\\u003c');}
function validateSourceForFont(markdown,parsed){
  if(markdown.length>1_200_000)throw new Error('原稿は120万文字以下にしてください');
  const coverage=new Set(source.fontInfo.codepoints);
  const sample=markdown+'異世界丸見え実話現地取材202604月号続0123456789 /';
  const missing=[...new Set([...sample].map(c=>c.codePointAt(0)))].filter(c=>c>32&&!coverage.has(c));
  if(missing.length)throw new Error(`埋込フォント未収録文字: ${missing.map(c=>`U+${c.toString(16).toUpperCase()}`).join(', ')}`);
  for(const block of parsed.blocks.filter(b=>b.type==='figure')){
    if(!/^\.\/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i.test(block.src))throw new Error(`本番画像パス形式ではありません: ${block.src}`);
  }
}
function candidateHtml(markdown,rawSettings){
  const parsed=parseArticle(markdown),validated=validateTesterSettings(rawSettings);
  validateSourceForFont(markdown,parsed);
  const selectedImages=[...new Set(parsed.blocks.filter(b=>b.type==='figure').map(b=>b.src))];
  const manifest={version:1,source:source.source,template:source.template,blockCount:parsed.blocks.length,selectedImages,font:source.fontInfo};
  const data=safeJson({...parsed,manifest});
  const runtime=source.runtime.replace(/<\/script/gi,'<\\/script');
  const overrides=cssForTesterSettings(validated);
  return{
    parsed,settings:validated,
    html:`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=1456"><meta name="article-source-contract" content="1"><meta name="layout-tester-candidate" content="static-browser"><base href="${escapeHtml(source.articleBase.href)}"><title>${escapeHtml(parsed.blocks[0].text)}</title>
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
}
function invalidate(message='MDまたは設定が未反映です。「このMDで本番組版」を押してください。'){
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
function updatePreview(){
  if(!ready||!pages.length){$('page-number').textContent='—';buttons();return;}
  currentPage=Math.max(1,Math.min(currentPage,pages.length));
  const zoom=Number($('zoom').value)/100;$('zoom-value').value=`${Math.round(zoom*100)}%`;
  frame.style.transform=`scale(${zoom})`;frame.style.transformOrigin='top left';
  $('frame-holder').style.width=`${1456*zoom}px`;$('frame-holder').style.height=`${2056*zoom}px`;
  requestAnimationFrame(()=>frame.contentWindow.scrollTo(0,pages[currentPage-1].offsetTop));
  $('page-number').textContent=`${String(currentPage).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`;
  $('paper-size').textContent='紙面 1456 × 2056 px / 本番DOM';updateSelectionOutline();buttons();
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
  ready=false;pages=[];articleData=null;selected=null;
  frame.removeAttribute('src');frame.srcdoc='<!doctype html><html><body style="margin:0;background:#fff"></body></html>';
  $('block-list').replaceChildren();$('block-count').textContent='0件';$('page-number').textContent='—';$('render-source').textContent='—';
  showDiagnostics(null,error);updateSelection();
}
async function compose(){
  if(!source||busy)return;if(pendingJson){status('設定JSONが未適用です。JSONを適用してください。','error');return;}
  const token=++generation;busy=true;ready=false;buttons();status('本番parser・CSS・埋込フォント・paginate.jsでブラウザ内組版しています…','busy');
  try{
    const candidate=candidateHtml($('markdown').value,clean(settings));settings=candidate.settings;syncSettingsUI();
    await setFrameHtml(candidate.html,token);if(token!==generation)return;
    const doc=frame.contentDocument;articleData=JSON.parse(doc.getElementById('article-source').textContent);
    pages=[...doc.querySelectorAll('.fixed-page')];if(!pages.length)throw new Error('fixed-pageが生成されませんでした');
    const report=frame.contentWindow.auditArticleComposition();if(!report.ok)throw new Error(report.errors.join('\n'));
    ready=true;dirty=false;currentPage=Math.min(currentPage,pages.length)||1;
    if(!articleData.blocks.some(b=>b.id===selected))selected=articleData.blocks[0]?.id||null;buildBlockList();
    doc.addEventListener('click',event=>{const n=event.target.closest?.('[data-source],[data-figure]');if(!n)return;event.preventDefault();selectBlock(n.dataset.source||n.dataset.figure,pageIndexFor(n));});
    showDiagnostics(report);$('render-source').textContent='静的GET + parseArticle + template.css + ArticleSubset + paginate.js';
    status(`${source.source} · ${pages.length}ページ · 本番組版OK`,'ok');updatePreview();updateSelection();
  }catch(error){
    if(token===generation){dirty=false;clearPreview(error.message);status(error.message,'error');}
  }finally{if(token===generation){busy=false;buttons();}}
}
async function loadSource(){
  if(busy)return;const token=++generation;busy=true;buttons();status('layout-source.json と正本MDを直接読込中です…','busy');
  try{
    const loaded=await loadStaticArticle($('source-path').value.trim());if(token!==generation)return;
    source=loaded;settings=structuredClone(TESTER_DEFAULTS);
    $('markdown').value=loaded.markdown;$('source-name').textContent=loaded.source;$('source-article').textContent=loaded.article;$('source-path').value=loaded.article;
    selected=null;currentPage=1;syncSettingsUI();dirty=true;busy=false;await compose();
  }catch(error){
    if(token===generation){source=null;dirty=true;clearPreview(error.message);status(error.message,'error');}
  }finally{if(token===generation){busy=false;buttons();}}
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
$('markdown').addEventListener('input',()=>invalidate());
$('md-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1_200_000)throw new Error('原稿は120万文字以下にしてください');$('markdown').value=await file.text();invalidate(`${file.name} を一時差替えしました。本番組版してください。`);}catch(error){status(error.message,'error');}finally{$('md-file').value='';}};
$('zoom').oninput=updatePreview;$('guides').onchange=()=>{updateSelectionOutline();updateSelection();};
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
  compose,loadSource,selectBlock
};
syncSettingsUI();loadSource();
