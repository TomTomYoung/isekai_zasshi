import {makeZip} from './core.mjs';

const PAGE_WIDTH=1456;
const PAGE_HEIGHT=2056;
const transport=document.createElement('iframe');
transport.hidden=true;transport.title='画像読取';transport.setAttribute('aria-hidden','true');
document.body.append(transport);
const read=transport.contentWindow.fetch.bind(transport.contentWindow);

function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function blobDataUrl(url){
  const response=await read(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`画像読込失敗 ${response.status}: ${url}`);
  const blob=await response.blob();
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error(`画像を埋め込めません: ${url}`));
    reader.readAsDataURL(blob);
  });
}
async function selfContainedClone(sheet,{includeInstruction=false}={}){
  const doc=sheet.ownerDocument,clone=sheet.cloneNode(true);
  clone.classList.remove('layout-tester-selected');
  clone.querySelectorAll('.layout-tester-selected').forEach(n=>n.classList.remove('layout-tester-selected'));
  if(!includeInstruction)clone.querySelectorAll('.layout-instruction-region').forEach(n=>n.remove());
  clone.querySelectorAll('a').forEach(n=>n.removeAttribute('href'));
  const originals=[...sheet.querySelectorAll('img')],images=[...clone.querySelectorAll('img')];
  for(let i=0;i<images.length;i++){
    const src=originals[i]?.currentSrc||originals[i]?.src;
    if(src)images[i].src=await blobDataUrl(src);
    images[i].removeAttribute('srcset');
  }
  const styles=[...doc.querySelectorAll('style')].map(n=>n.textContent).join('\n');
  return{clone,styles};
}
export async function pagePng(sheet,{includeInstruction=false}={}){
  if(!sheet?.matches?.('.fixed-page'))throw new Error('出力対象の本番ページがありません');
  await sheet.ownerDocument.fonts.ready;
  const {clone,styles}=await selfContainedClone(sheet,{includeInstruction});
  Object.assign(clone.style,{margin:'0',boxShadow:'none',transform:'none'});
  const wrapper=document.createElement('div');
  wrapper.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const style=document.createElement('style');
  style.textContent=styles+'\n.fixed-page{margin:0!important;box-shadow:none!important}';
  wrapper.append(style,clone);
  const serialized=new XMLSerializer().serializeToString(wrapper);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const image=new Image();
  image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  await Promise.race([
    image.decode(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('PNG描画がタイムアウトしました')),20000))
  ]);
  const canvas=document.createElement('canvas');
  canvas.width=PAGE_WIDTH;canvas.height=PAGE_HEIGHT;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvasを作成できません');
  ctx.drawImage(image,0,0,PAGE_WIDTH,PAGE_HEIGHT);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG生成に失敗しました')),'image/png'));
  canvas.width=canvas.height=1;
  if(blob.size<1000)throw new Error('PNG生成結果が小さすぎます');
  return blob;
}
export async function exportProductionPages({pages,currentPage,all,stem,progress=()=>{}}){
  const targets=all?pages:[pages[currentPage-1]];
  if(!targets.length||targets.some(x=>!x))throw new Error('出力するページがありません');
  const files=[];
  for(let i=0;i<targets.length;i++){
    progress(i+1,targets.length);
    const blob=await pagePng(targets[i]);
    files.push({
      name:`${stem}-${String(all?i+1:currentPage).padStart(3,'0')}.png`,
      bytes:new Uint8Array(await blob.arrayBuffer())
    });
  }
  if(all){
    download(makeZip(files),`${stem}-pages.zip`);
  }else{
    download(new Blob([files[0].bytes],{type:'image/png'}),files[0].name);
  }
}
