import {parseMarkdown, mergeSettings, validateSettings, inlineText, assetPath, SIDES} from './core.mjs';
import {compose, showGuides} from './renderer.mjs';
import {download, exportPages} from './export.mjs';

const $ = id => document.getElementById(id);
let pendingConfig = null;
let defaults, settings, result = null, selected = null, currentPage = 1, generation = 0, busy = false, dirty = true;
let sourceName = '試用原稿.md', sourceURL = null, folderRoot = '', files = new Map(), demoActive = true, assetCache = new Map();
const fields = [
  ['紙面', 'group'], ['page.width','紙面W',240,6000], ['page.height','紙面H',240,6000],
  ...SIDES.map((k,i)=>[`page.padding.${k}`,`余白 ${['上','右','下','左'][i]}`,0,2000]),
  ['page.columns','段数',1,3], ['page.columnGap','段間',0,1000],
  ['本文','group'], ['body.fontSize','文字サイズ',6,200], ['body.lineHeight','行高',6,400], ['body.paragraphGap','段落間',0,1000], ['body.fontFamily','フォント','text'],
  ['見出し','group'], ['heading.scale','文字倍率',1,4,.05], ['heading.lineHeight','行高倍率',1,3,.05], ['heading.gap','後の間隔',0,1000],
  ['画像・出力','group'], ['image.height','画像枠H',1,6000], ['image.fit','配置方法',['contain','cover']], ['image.captionSize','注釈文字',6,200], ['image.captionGap','注釈間隔',0,1000], ['export.scale','PNG倍率',1,3]
];
const blockFields = [ ['width','幅W',1,6000], ['fontSize','文字サイズ',1,200], ['lineHeight','行高',1,6000], ['imageHeight','画像枠H',1,6000],
  ...['margin','padding'].flatMap(group => [[group,'group'], ...SIDES.map((k,i)=>[`${group}.${k}`,['上','右','下','左'][i],0,2000])]), ['breakBefore','前で改ページ','checkbox'] ];
const get = (o, path) => path.split('.').reduce((a,k)=>a?.[k],o);
const put = (o, path, value) => { const bits=path.split('.'), last=bits.pop(); let at=o; for(const k of bits) at=at[k]??={}; at[last]=value; };
function status(text, state='ok') { $('status').textContent=text; $('status').dataset.state=state; }
function buttons() {
  const allowed = result && !busy && !dirty && !result.diagnostics.some(d=>d.level==='error');
  $('png').disabled=$('zip').disabled=!allowed; $('save-config').disabled=!settings||busy||dirty;
  $('prev').disabled=busy||!result||currentPage<=1; $('next').disabled=busy||!result||currentPage>=result.pages.length;
}
function invalidate(message='原稿・設定が未反映です。「この原稿で組版」を押してください。') {
  generation++; dirty=true; document.body.classList.add('stale'); $('diagnostic-title').textContent='検査結果：未確認（編集あり）'; status(message,'busy'); buttons();
}
function errorState(error) { dirty=true; busy=false; document.body.classList.add('stale'); status(error.message||String(error),'error'); $('diagnostic-title').textContent='検査結果：未確認（エラー）'; buttons(); }
function form(host, specs, value, overrides=false) {
  host.replaceChildren();
  for(const [path,label,min,max,step] of specs) {
    if(label==='group') { const n=document.createElement('div'); n.className='group-label'; n.textContent=path; host.append(n); continue; }
    const l=document.createElement('label'), input=Array.isArray(min)?document.createElement('select'):document.createElement('input');
    l.textContent=label; input.dataset.path=path;
    if(Array.isArray(min)) for(const option of min) { const o=document.createElement('option'); o.value=o.textContent=option; input.append(o); }
    else { input.type=typeof min==='string'?min:'number'; if(typeof min==='number'){input.min=min;input.max=max;input.step=step||1;} }
    if(input.type==='checkbox') input.checked=!!get(value,path); else input.value=get(value,path)??'';
    if(overrides) input.placeholder='共通設定';
    if(input.type==='text') l.className='full'; l.append(input); host.append(l);
  }
}
function syncSettingsUI() {
  pendingConfig=null;
  form($('settings-form'),fields,settings); $('json-editor').value=JSON.stringify(settings,null,2); updateSelection();
}
function readForm(host, target, overrides=false) {
  for(const input of host.querySelectorAll('[data-path]')) {
    if(overrides&&input.value===''&&input.type!=='checkbox') continue;
    const value=input.type==='checkbox'?input.checked:input.type==='number'?(input.value===''?NaN:Number(input.value)):input.value;
    put(target,input.dataset.path,value);
  }
  return target;
}
function fileStem() { return sourceName.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_.-]+/gu,'-').slice(0,65)||'layout'; }
function setSource(text,name,{url=null,root='',newFiles=new Map(),demo=false}={}) {
  $('markdown').value=text; sourceName=name; sourceURL=url; folderRoot=root; files=newFiles; demoActive=demo; assetCache=new Map();
  $('source-name').textContent=name; selected=null; currentPage=1; invalidate(); return recompose();
}
async function request(url) {
  const target=new URL(url,location.href);
  if(target.origin!==location.origin)throw new Error('同一サイト内のファイルだけを読み込めます');
  const response=await fetch(target,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error(`読込失敗 ${response.status}: ${url}`); return response;
}
async function rasterAsset(blob, name) {
  if(blob.size>20*1024*1024) throw new Error(`画像は20MB以下にしてください: ${name}`);
  const sig=new Uint8Array(await blob.slice(0,12).arrayBuffer());
  const png=sig[0]===137&&sig[1]===80&&sig[2]===78&&sig[3]===71, jpg=sig[0]===255&&sig[1]===216&&sig[2]===255;
  const webp=String.fromCharCode(...sig.slice(0,4))==='RIFF'&&String.fromCharCode(...sig.slice(8,12))==='WEBP';
  if(!png&&!jpg&&!webp) throw new Error(`PNG/JPEG/WebPとして読めません: ${name}`);
  const url=URL.createObjectURL(blob), img=new Image();
  try {
    img.src=url; await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error(`画像読込タイムアウト: ${name}`)),12000))]);
    if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>32000000) throw new Error(`画像が空か3200万画素を超えています: ${name}`);
    const canvas=document.createElement('canvas'); canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像処理用Canvasを作成できません');ctx.drawImage(img,0,0);
    const dataURL=canvas.toDataURL('image/png');canvas.width=canvas.height=1;return {dataURL,width:img.naturalWidth,height:img.naturalHeight};
  } finally {URL.revokeObjectURL(url);}
}
function sampleAsset() {
  const c=document.createElement('canvas'); c.width=1200;c.height=500;const x=c.getContext('2d');
  x.fillStyle='#dce8e7';x.fillRect(0,0,1200,500);x.fillStyle='#aec9c5';x.fillRect(45,45,1110,410);
  x.fillStyle='#3d6d70';x.fillRect(85,120,310,295);x.fillRect(435,75,240,340);x.fillRect(715,150,400,265);
  x.fillStyle='#e8bf6f';x.beginPath();x.arc(1030,110,47,0,Math.PI*2);x.fill();
  x.fillStyle='#ffffff';x.font='bold 42px sans-serif';x.fillText('IMAGE AREA / 1200 × 500 px',100,340);
  return {dataURL:c.toDataURL('image/png'),width:1200,height:500};
}
function resolverSnapshot() {
  const snapshot={base:sourceURL,root:folderRoot,files:new Map(files),demo:demoActive,cache:assetCache};
  return async src=>{
    const p=assetPath(src);if(snapshot.cache.has(p))return snapshot.cache.get(p);
    let a;
    if(snapshot.files.has(snapshot.root+p)) a=await rasterAsset(snapshot.files.get(snapshot.root+p),p);
    else if(snapshot.demo&&p==='sample.png') a=sampleAsset();
    else if(snapshot.base) {
      const url=new URL(p,snapshot.base);if(url.origin!==location.origin)throw new Error('外部画像は取り込めません');a=await rasterAsset(await (await request(url)).blob(),p);
    } else {
      const f=snapshot.files.get(snapshot.root+p);if(!f)throw new Error(`画像が見つかりません: ${p}。記事フォルダーまたは画像ファイルを選択してください`);a=await rasterAsset(f,p);
    }
    snapshot.cache.set(p,a);return a;
  };
}
async function recompose() {
  if(!settings)return; if(pendingConfig){errorState(new Error('未適用または不正な設定があります。設定を修正して適用してください（元の設定に戻すには表示中の設定JSONを適用）。'));return;} const token=++generation; dirty=true;busy=true;buttons();document.body.classList.add('stale');status('原稿・画像・フォントを確認して組版しています…','busy');
  const host=document.createElement('div');Object.assign(host.style,{position:'absolute',left:'-25000px',top:'0'});document.body.append(host);
  try {
    const parsed=parseMarkdown($('markdown').value), resolved=await compose(parsed,settings,host,resolverSnapshot(),()=>generation===token);
    if(generation!==token)return;
    result=resolved;currentPage=Math.min(currentPage,result.pages.length);$('pages').replaceChildren();
    for(const page of result.pages){const holder=document.createElement('div');holder.className='page-holder';holder.append(page);$('pages').append(holder);}
    if(!result.blocks.some(b=>b.id===selected))selected=result.blocks.find(b=>b.type!=='break')?.id;
    $('block-list').replaceChildren();
    for(const b of result.blocks.filter(b=>b.type!=='break')){
      const button=document.createElement('button');button.dataset.id=b.id;const type=document.createElement('small'),text=document.createElement('span');
      type.textContent=b.type==='heading'?`H${b.level}`:b.type.toUpperCase();text.textContent=b.tokens?inlineText(b.tokens):b.alt||b.text||b.type;
      button.title=`${b.line}行 / ${b.id}`;button.append(type,text);button.onclick=()=>selectBlock(b.id);$('block-list').append(button);
    }
    $('block-count').textContent=`${result.blocks.filter(b=>b.type!=='break').length}件`;
    $('diagnostics').replaceChildren();
    for(const d of result.diagnostics){const p=document.createElement('p');p.className=d.level;p.textContent=(d.level==='error'?'エラー: ':'注意: ')+d.message;$('diagnostics').append(p);}
    const errors=result.diagnostics.filter(d=>d.level==='error').length,warnings=result.diagnostics.filter(d=>d.level==='warning').length;
    $('diagnostic-title').textContent=`検査結果：エラー ${errors} / 注意 ${warnings}`;
    if(!result.diagnostics.length){const p=document.createElement('p');p.textContent='検査範囲内で、本文の欠落・重複・はみ出し・重なりは検出されませんでした。';$('diagnostics').append(p);}
    dirty=false;busy=false;document.body.classList.remove('stale');
    status(`${sourceName} · ${result.pages.length}ページ · ${errors?`${errors}件のエラーがあるためPNG出力を停止しています`:'組版完了'}${warnings?` · 注意${warnings}件`:''}`,errors?'error':'ok');
    updatePreview();updateSelection();buttons();
  }catch(error){if(generation===token)errorState(error);}finally{host.remove();if(generation===token){busy=false;buttons();}}
}
function updatePreview() {
  if(!result)return;const zoom=Number($('zoom').value)/100;$('zoom-value').value=`${Math.round(zoom*100)}%`;
  const holders=[...$('pages').children];
  holders.forEach(h=>{h.hidden=false;h.style.width=`${result.settings.page.width*zoom}px`;h.style.height=`${result.settings.page.height*zoom}px`;h.firstElementChild.style.transform=`scale(${zoom})`;});
  showGuides(result,$('guides').checked,selected);
  holders.forEach((h,i)=>h.hidden=i!==currentPage-1);
  $('page-number').textContent=`${String(currentPage).padStart(2,'0')} / ${String(result.pages.length).padStart(2,'0')}`;
  const s=result.settings;$('paper-size').textContent=`紙面 ${s.page.width} × ${s.page.height} px / PNG ${s.page.width*s.export.scale} × ${s.page.height*s.export.scale} px`;buttons();
}
function selectBlock(id,page){selected=id;currentPage=page||result.measurements.find(m=>m.id===id)?.page||currentPage;updatePreview();updateSelection();}
function updateSelection() {
  if(!settings||!result||!selected)return;
  const b=result.blocks.find(b=>b.id===selected),m=result.measurements.find(m=>m.id===selected&&m.page===currentPage)||result.measurements.find(m=>m.id===selected);
  $('selection-name').textContent=`${b.line}行 / ${selected}`;
  if(m){const edge=v=>SIDES.map(k=>v[k]).join(' / ');let info=`W ${m.width} × H ${m.height} px\nx ${m.x} / y ${m.y}\np${m.page}・${m.column}段目・分割${m.part}\n\n上 / 右 / 下 / 左\nmargin  ${edge(m.margin)}\npadding ${edge(m.padding)}\n紙面端  ${edge(m.edges)}\n前の間隔 ${m.gapBefore} / 後の間隔 ${m.gapAfter}`;
    if(m.image){const a=m.image;info+=`\n\n画像枠 ${a.frame.width} × ${a.frame.height}\n元画像 ${a.sourceWidth} × ${a.sourceHeight}\n比率保持後 ${a.scaled.width} × ${a.scaled.height}\n可視範囲 ${a.visible.width} × ${a.visible.height}\n配置 ${a.fit}${a.fit==='cover'?'（枠外を裁ち落とし）':''}`;}$('metrics').textContent=info;}
  form($('block-form'),blockFields,settings.blocks[selected]||{},true);$('reset-block').disabled=!Object.hasOwn(settings.blocks,selected);
  $('block-list').querySelectorAll('button').forEach(n=>n.setAttribute('aria-current',String(n.dataset.id===selected)));
}
$('markdown').addEventListener('input',()=>invalidate());$('json-editor').addEventListener('input',()=>{pendingConfig='json';invalidate('JSONが未適用です。「JSONを適用」を押してください。');});
$('compose').onclick=()=>recompose();
$('settings-form').addEventListener('input',()=>{pendingConfig='global';invalidate('設定を変更中です。入力を確定すると再組版します。');});
$('settings-form').addEventListener('change',()=>{try{const next=readForm($('settings-form'),structuredClone(settings));validateSettings(next);settings=next;syncSettingsUI();recompose();}catch(e){errorState(e);}});
$('block-form').addEventListener('input',()=>{pendingConfig='block';invalidate('個別設定を変更中です。入力を確定すると再組版します。');});
$('block-form').addEventListener('change',()=>{if(!selected)return;try{const next=structuredClone(settings);next.blocks[selected]=readForm($('block-form'),{},true);validateSettings(next);settings=next;syncSettingsUI();recompose();}catch(e){errorState(e);}});
$('reset-block').onclick=()=>{delete settings.blocks[selected];syncSettingsUI();recompose();};
$('apply-json').onclick=()=>{try{const next=mergeSettings(defaults,JSON.parse($('json-editor').value));settings=next;syncSettingsUI();recompose();}catch(e){errorState(e);}};
$('config-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;pendingConfig='file';invalidate('設定を読込中です');const token=generation;try{if(f.size>1000000)throw new Error('設定JSONが大きすぎます');const text=await f.text();if(generation!==token)return;const next=mergeSettings(defaults,JSON.parse(text));settings=next;syncSettingsUI();await recompose();}catch(e){if(generation===token)errorState(e);}finally{$('config-file').value='';}};
$('save-config').onclick=()=>download(new Blob([JSON.stringify(settings,null,2)+'\n'],{type:'application/json'}),`${fileStem()}.layout.json`);
$('md-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;invalidate('原稿を読込中です');const token=generation;try{if(f.size>1200000)throw new Error('原稿ファイルが大きすぎます');const text=await f.text();if(generation!==token)return;$('folder-md').hidden=true;await setSource(text,f.name);}catch(e){if(generation===token)errorState(e);}finally{$('md-file').value='';}};
$('image-files').onchange=e=>{for(const f of e.target.files){const key=folderRoot+f.name;files.set(key,f);}assetCache=new Map();invalidate();recompose();$('image-files').value='';};
$('folder-files').onchange=e=>{
  const imported=new Map([...e.target.files].map(f=>[f.webkitRelativePath,f])),mds=[...imported.keys()].filter(p=>/\.md$/i.test(p)).sort();
  const select=$('folder-md');select.replaceChildren();select.hidden=false;const prompt=document.createElement('option');prompt.value='';prompt.textContent='原稿MDを選択してください';select.append(prompt);
  for(const p of mds){const o=document.createElement('option');o.value=o.textContent=p;select.append(o);}
  select.onchange=async()=>{const p=select.value;if(!p)return;invalidate('原稿を読込中です');const token=generation;try{const f=imported.get(p);if(f.size>1200000)throw new Error('原稿ファイルが大きすぎます');const text=await f.text();if(generation!==token)return;await setSource(text,p.split('/').at(-1),{root:p.slice(0,p.lastIndexOf('/')+1),newFiles:imported});}catch(e){if(generation===token)errorState(e);}};
  invalidate(mds.length?'フォルダー内の原稿MDを選択してください':'選択フォルダーにMDがありません');if(mds.length===1){select.value=mds[0];select.onchange();}$('folder-files').value='';
};
$('load-path').onclick=async()=>{
  const path=$('source-path').value.trim();invalidate('リポジトリ内の原稿を読込中です');const token=generation;
  try{if(!path||!path.endsWith('.md')||/^[/.]|[:\\?#]|(^|\/)\./.test(path))throw new Error('リポジトリ内の相対MDパスを指定してください');const url=new URL('../'+path,location.href);const response=await request(url);const text=await response.text();if(generation!==token)return;if(text.length>300000)throw new Error('原稿は30万文字以下にしてください');await setSource(text,path.split('/').at(-1),{url});}catch(e){if(generation===token)errorState(e);}
};
$('demo').onclick=async()=>{invalidate('試用原稿を読込中です');const token=generation;try{const text=await (await request('demo.md')).text();if(generation!==token)return;await setSource(text,'試用原稿.md',{demo:true});}catch(e){if(generation===token)errorState(e);}};
$('zoom').oninput=()=>updatePreview();$('guides').onchange=()=>updatePreview();$('prev').onclick=()=>{currentPage--;updatePreview();updateSelection();};$('next').onclick=()=>{currentPage++;updatePreview();updateSelection();};
$('pages').onclick=e=>{const b=e.target.closest('.block');if(b)selectBlock(b.dataset.blockId,currentPage);};
async function output(all){if(!result||dirty||busy)return;busy=true;buttons();const token=generation;try{await exportPages(result,currentPage,all,fileStem(),(i,n)=>{if(generation!==token)throw new Error('出力中に原稿・設定が変更されました');status(`PNGを生成中 ${i}/${n}…`,'busy');},()=>generation===token);if(generation===token)status(all?'全ページのPNGをZIPにまとめました。':'このページのPNGを生成しました。');}catch(e){if(generation===token)status(e.message,'error');}finally{busy=false;buttons();}}
$('png').onclick=()=>output(false);$('zip').onclick=()=>output(true);
window.layoutTester={get result(){return result;},get settings(){return settings;},get dirty(){return dirty;},recompose};
try{defaults=validateSettings(await (await request('defaults.json')).json());settings=structuredClone(defaults);syncSettingsUI();await setSource(await (await request('demo.md')).text(),'試用原稿.md',{demo:true});}catch(e){errorState(e);}
