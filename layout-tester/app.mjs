const $=id=>document.getElementById(id);
const SIDES=['top','right','bottom','left'];
const DEFAULTS={version:1,body:{fontSize:28,lineHeight:42},image:{landscapeHeight:885,portraitHeight:1030},blocks:{}};
let source=null,settings=structuredClone(DEFAULTS),articleData=null,pages=[],currentPage=1,selected=null,busy=false,dirty=true,ready=false,pendingJson=false;
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
async function api(url,options){
  const response=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',...options});
  if(!response.ok)throw new Error((await response.text()).trim()||`HTTP ${response.status}`);
  return response;
}
function buttons(){
  const allowed=source&&ready&&!busy&&!dirty;
  $('png').disabled=$('zip').disabled=!allowed;
  $('save-config').disabled=!source||busy;
  $('prev').disabled=!ready||busy||currentPage<=1;
  $('next').disabled=!ready||busy||currentPage>=pages.length;
}
function invalidate(message='MDまたは設定が未反映です。「このMDで本番組版」を押してください。'){
  dirty=true;ready=false;status(message,'busy');$('diagnostic-title').textContent='本番組版検査：未確認';buttons();
}
function syncJson(){$('json-editor').value=JSON.stringify(clean(settings),null,2);pendingJson=false;}
function syncGlobalForm(){
  for(const input of $('settings-form').querySelectorAll('[data-key]'))input.value=getPath(settings,input.dataset.key)??'';
}
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
  if(block.type==='figure')return block.caption||block.alt||block.src;
  if(block.type==='table')return block.header.join(' / ');
  return block.text||block.type;
}
function buildBlockList(){
  $('block-list').replaceChildren();
  for(const block of articleData?.blocks||[]){
    const button=document.createElement('button');button.dataset.id=block.id;
    const kind=document.createElement('small'),text=document.createElement('span');
    kind.textContent=block.type.toUpperCase();text.textContent=blockLabel(block);button.append(kind,text);
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
  if(page)currentPage=page;
  else if(nodes.length)currentPage=pageIndexFor(nodes[0])||currentPage;
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
  return{frame:{width:r.width,height:r.height},source:{width:img.naturalWidth,height:img.naturalHeight},visible:{x:r.left-pr.left+(r.width-vw)/2,y:r.top-pr.top+(r.height-vh)/2,width:vw,height:vh},fit};
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
  $('selection-name').textContent=`${selected} / ${block?.type||node.tagName} / ${blockLabel(block||{})}`;
  $('metrics').textContent=text;
}
function updatePreview(){
  if(!ready||!pages.length){$('page-number').textContent='—';buttons();return;}
  currentPage=Math.max(1,Math.min(currentPage,pages.length));
  const zoom=Number($('zoom').value)/100;$('zoom-value').value=`${Math.round(zoom*100)}%`;
  frame.style.transform=`scale(${zoom})`;frame.style.transformOrigin='top left';
  $('frame-holder').style.width=`${1456*zoom}px`;$('frame-holder').style.height=`${2056*zoom}px`;
  requestAnimationFrame(()=>frame.contentWindow.scrollTo(0,pages[currentPage-1].offsetTop));
  $('page-number').textContent=`${String(currentPage).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`;
  $('paper-size').textContent='紙面 1456 × 2056 px / 本番DOM';
  updateSelectionOutline();buttons();
}
function showDiagnostics(report,error){
  const host=$('diagnostics');host.replaceChildren();
  if(error){const p=document.createElement('p');p.className='error';p.textContent='エラー: '+error;host.append(p);$('diagnostic-title').textContent='本番組版検査：失敗';return;}
  const errors=report?.errors||[];
  $('diagnostic-title').textContent=`本番組版検査：エラー ${errors.length} / ${report?.pages?.length||0}ページ`;
  if(errors.length)for(const e of errors){const p=document.createElement('p');p.className='error';p.textContent=e;host.append(p);}
  else{const p=document.createElement('p');p.textContent=`auditArticleComposition(): OK。正本ブロック ${report.sourceBlocks}件、採用画像 ${report.selectedImages}点、${report.pages.length}ページ。`;host.append(p);}
  for(const m of report?.pages||[]){const p=document.createElement('p');p.className='metric';p.textContent=`p${m.page}: image/text=${m.imageToText.toFixed(2)} / body bottom=${m.bottom.toFixed(1)} / figure=${m.figure}${m.repeated?' (再掲)':''}`;host.append(p);}
}
async function waitComposition(){
  const deadline=Date.now()+22000;
  while(Date.now()<deadline){
    const state=frame.contentWindow?.__articleComposition;
    if(state?.status==='ready')return state;
    if(state?.status==='failed')throw new Error(state.error||'本番組版に失敗しました');
    await new Promise(r=>setTimeout(r,50));
  }
  throw new Error('本番組版の完了待ちがタイムアウトしました');
}
async function setFrameHtml(html){
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('候補HTMLの読込がタイムアウトしました')),15000);
    frame.onload=()=>{clearTimeout(timer);resolve();};
    frame.srcdoc=html;
  });
  return waitComposition();
}
async function compose(){
  if(!source||busy)return;
  if(pendingJson){status('設定JSONが未適用です。JSONを適用してください。','error');return;}
  busy=true;ready=false;buttons();status('正本パーサー・本番CSS・埋込フォント・paginate.jsで組版しています…','busy');
  try{
    const response=await api('/__layout-tester/compose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article:source.article,markdown:$('markdown').value,settings:clean(settings)})});
    const html=await response.text(),composition=await setFrameHtml(html),doc=frame.contentDocument;
    articleData=JSON.parse(doc.getElementById('article-source').textContent);
    pages=[...doc.querySelectorAll('.fixed-page')];if(!pages.length)throw new Error('fixed-pageが生成されませんでした');
    const report=frame.contentWindow.auditArticleComposition();
    if(!report.ok)throw new Error(report.errors.join('\n'));
    ready=true;dirty=false;currentPage=Math.min(currentPage,pages.length)||1;
    if(!articleData.blocks.some(b=>b.id===selected))selected=articleData.blocks[0]?.id||null;
    buildBlockList();
    doc.addEventListener('click',event=>{
      const n=event.target.closest?.('[data-source],[data-figure]');if(!n)return;
      event.preventDefault();selectBlock(n.dataset.source||n.dataset.figure,pageIndexFor(n));
    });
    showDiagnostics(report);$('render-source').textContent='parseArticle + template.css + ArticleSubset + paginate.js';
    status(`${source.source} · ${pages.length}ページ · 本番組版OK`,'ok');updatePreview();updateSelection();
  }catch(error){
    ready=false;dirty=false;pages=[];articleData=null;showDiagnostics(null,error.message);status(error.message,'error');
  }finally{busy=false;buttons();}
}
async function loadSource(){
  if(busy)return;busy=true;buttons();status('正本MDを読込中です…','busy');
  try{
    const path=$('source-path').value.trim(),response=await api('/__layout-tester/source?article='+encodeURIComponent(path));
    source=await response.json();settings=structuredClone(source.settings||DEFAULTS);
    $('markdown').value=source.markdown;$('source-name').textContent=source.source;$('source-article').textContent=source.article;$('source-path').value=source.article;
    selected=null;currentPage=1;syncSettingsUI();dirty=true;await compose();
  }catch(error){source=null;ready=false;dirty=true;status(error.message,'error');showDiagnostics(null,error.message);}
  finally{busy=false;buttons();}
}
async function exportOutput(all){
  if(!source||!ready||dirty||busy)return;busy=true;buttons();status(all?'本番DOMから全ページPNGを生成しています…':'本番DOMからPNGを生成しています…','busy');
  try{
    const response=await api('/__layout-tester/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article:source.article,markdown:$('markdown').value,settings:clean(settings),page:all?'all':currentPage})});
    const blob=await response.blob();download(blob,all?`${fileStem()}-pages.zip`:`${fileStem()}-${String(currentPage).padStart(3,'0')}.png`);
    status(all?'本番DOMの全ページPNGをZIP出力しました。':'本番DOMのPNGを出力しました。','ok');
  }catch(error){status(error.message,'error');}
  finally{busy=false;buttons();}
}

$('load-path').onclick=loadSource;$('compose').onclick=compose;
$('markdown').addEventListener('input',()=>invalidate());
$('md-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1_200_000)throw new Error('原稿は120万文字以下にしてください');$('markdown').value=await file.text();invalidate(`${file.name} を一時差替えしました。本番組版してください。`);}catch(error){status(error.message,'error');}finally{$('md-file').value='';}};
$('zoom').oninput=updatePreview;$('guides').onchange=()=>{updateSelectionOutline();updateSelection();};
$('prev').onclick=()=>{currentPage--;updatePreview();updateSelection();};$('next').onclick=()=>{currentPage++;updatePreview();updateSelection();};
$('settings-form').addEventListener('change',async()=>{
  try{for(const input of $('settings-form').querySelectorAll('[data-key]'))setPath(settings,input.dataset.key,readNumber(input));syncJson();invalidate('本番CSS一時設定を変更しました。再組版しています…');await compose();}catch(error){status(error.message,'error');}
});
$('block-form').addEventListener('change',async()=>{
  if(!selected)return;
  try{
    const entry={};for(const input of $('block-form').querySelectorAll('[data-key]')){const value=readNumber(input);if(value!==undefined)setPath(entry,input.dataset.key,value);}
    settings.blocks??={};if(Object.keys(clean(entry)).length)settings.blocks[selected]=clean(entry);else delete settings.blocks[selected];
    syncJson();invalidate('ブロック一時設定を変更しました。再組版しています…');await compose();
  }catch(error){status(error.message,'error');}
});
$('reset-block').onclick=async()=>{if(!selected)return;delete settings.blocks[selected];syncSettingsUI();invalidate('ブロック一時設定を解除しました。再組版しています…');await compose();};
$('json-editor').addEventListener('input',()=>{pendingJson=true;invalidate('設定JSONが未適用です。「JSONを適用して再組版」を押してください。');});
$('apply-json').onclick=async()=>{try{const next=JSON.parse($('json-editor').value);if(next?.version!==1)throw new Error('設定versionは1のみ対応です');settings=next;pendingJson=false;syncGlobalForm();syncBlockForm();await compose();}catch(error){status(error.message,'error');}};
$('config-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1_000_000)throw new Error('設定JSONが大きすぎます');const next=JSON.parse(await file.text());if(next?.version!==1)throw new Error('設定versionは1のみ対応です');settings=next;pendingJson=false;syncSettingsUI();invalidate('設定JSONを読み込みました。再組版しています…');await compose();}catch(error){status(error.message,'error');}finally{$('config-file').value='';}};
$('save-config').onclick=()=>download(new Blob([JSON.stringify(clean(settings),null,2)+'\n'],{type:'application/json'}),`${fileStem()}.layout.json`);
$('png').onclick=()=>exportOutput(false);$('zip').onclick=()=>exportOutput(true);

window.layoutTester={
  get ready(){return ready;},get dirty(){return dirty;},get source(){return source;},get settings(){return settings;},
  get articleData(){return articleData;},get pages(){return pages;},get currentPage(){return currentPage;},
  compose,loadSource,selectBlock
};
syncSettingsUI();loadSource();
