export const TESTER_DEFAULTS={
  version:1,
  body:{fontSize:28,lineHeight:42},
  image:{landscapeHeight:885,portraitHeight:1030},
  blocks:{}
};

const SIDES=['top','right','bottom','left'];

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

export function cssForTesterSettings(settings){
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
  rules.push('.layout-tester-selected{outline:5px solid #315dde!important;outline-offset:3px}');
  rules.push('html{scrollbar-width:none}body::-webkit-scrollbar{display:none}');
  return rules.join('\n');
}
