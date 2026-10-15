export const TESTER_DEFAULTS={
  version:1,
  body:{fontSize:28,lineHeight:42},
  image:{landscapeHeight:885,portraitHeight:1030},
  magazine:{
    paperColor:'#fffdf8',
    accentColor:'#a12e36',
    textureStrength:0,
    titleSize:52,
    subtitleSize:34,
    paragraphGap:18,
    introSize:28,
    introLineHeight:42,
    introRuleWidth:0,
    dropCapSize:0,
    captionSize:22,
    captionRuleWidth:0,
    cards:{
      enabled:false,
      heading:'',
      one:{title:'',text:''},
      two:{title:'',text:''},
      three:{title:'',text:''}
    }
  },
  blocks:{}
};

const SIDES=['top','right','bottom','left'];
const CARD_KEYS=['one','two','three'];

function number(value,min,max,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label}: ${min}〜${max}の数値が必要です`);
}
function object(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label}: オブジェクトが必要です`);
}
function allowedKeys(value,allowed,label){
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`${label}: 未対応の設定 ${key}`);
}
function boolean(value,label){
  if(typeof value!=='boolean')throw new Error(`${label}: true/false が必要です`);
}
function text(value,max,label){
  if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw new Error(`${label}: ${max}文字以下の文字列が必要です`);
}
function color(value,label){
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw new Error(`${label}: #RRGGBB形式が必要です`);
}
function validateCard(value,label){
  object(value,label);allowedKeys(value,['title','text'],label);
  const out={};
  if(value.title!==undefined){text(value.title,80,`${label}.title`);out.title=value.title;}
  if(value.text!==undefined){text(value.text,240,`${label}.text`);out.text=value.text;}
  return out;
}

export function validateTesterSettings(raw){
  const value=raw??TESTER_DEFAULTS;object(value,'設定');allowedKeys(value,['version','body','image','magazine','blocks'],'設定');
  if(value.version!==1)throw new Error('設定versionは1のみ対応です');
  const out={version:1,body:{},image:{},magazine:{},blocks:{}};
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
  if(value.magazine!==undefined){
    object(value.magazine,'magazine');
    allowedKeys(value.magazine,['paperColor','accentColor','textureStrength','titleSize','subtitleSize','paragraphGap','introSize','introLineHeight','introRuleWidth','dropCapSize','captionSize','captionRuleWidth','cards'],'magazine');
    const numeric=[
      ['textureStrength',0,40],
      ['titleSize',20,100],
      ['subtitleSize',14,70],
      ['paragraphGap',0,60],
      ['introSize',10,80],
      ['introLineHeight',12,120],
      ['introRuleWidth',0,16],
      ['dropCapSize',0,120],
      ['captionSize',8,60],
      ['captionRuleWidth',0,8]
    ];
    for(const [key,min,max] of numeric)if(value.magazine[key]!==undefined){
      number(value.magazine[key],min,max,`magazine.${key}`);
      out.magazine[key]=value.magazine[key];
    }
    for(const key of ['paperColor','accentColor'])if(value.magazine[key]!==undefined){
      color(value.magazine[key],`magazine.${key}`);
      out.magazine[key]=value.magazine[key];
    }
    if(value.magazine.cards!==undefined){
      object(value.magazine.cards,'magazine.cards');
      allowedKeys(value.magazine.cards,['enabled','heading',...CARD_KEYS],'magazine.cards');
      const cards={};
      if(value.magazine.cards.enabled!==undefined){boolean(value.magazine.cards.enabled,'magazine.cards.enabled');cards.enabled=value.magazine.cards.enabled;}
      if(value.magazine.cards.heading!==undefined){text(value.magazine.cards.heading,100,'magazine.cards.heading');cards.heading=value.magazine.cards.heading;}
      for(const key of CARD_KEYS)if(value.magazine.cards[key]!==undefined)cards[key]=validateCard(value.magazine.cards[key],`magazine.cards.${key}`);
      out.magazine.cards=cards;
    }
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

  const m=s.magazine||{};
  if(m.paperColor!==undefined)rules.push(`.fixed-page{background-color:${m.paperColor}}`);
  if(m.textureStrength>0){
    const a=Math.min(.12,m.textureStrength/360).toFixed(4);
    const b=Math.min(.08,m.textureStrength/520).toFixed(4);
    rules.push(`.fixed-page{background-image:radial-gradient(circle at 18% 23%,rgba(94,73,52,${a}) 0 0.7px,transparent 0.9px),radial-gradient(circle at 72% 64%,rgba(120,99,75,${b}) 0 0.6px,transparent 0.85px);background-size:13px 11px,17px 19px}`);
  }else if(m.textureStrength===0){
    rules.push('.fixed-page{background-image:none}');
  }
  if(m.accentColor!==undefined){
    rules.push(`.running-head{border-bottom-color:${m.accentColor};color:${m.accentColor}}`);
    rules.push(`.article-lead h1,.article-body h1,.article-body h3{color:${m.accentColor}}`);
    rules.push(`.article-lead h2,.article-body h2{border-left-color:${m.accentColor}}`);
  }
  if(m.titleSize!==undefined)rules.push(`.article-lead h1{font-size:${m.titleSize}px;line-height:${Math.round(m.titleSize*1.28)}px}`);
  if(m.subtitleSize!==undefined)rules.push(`.article-lead h2{font-size:${m.subtitleSize}px;line-height:${Math.round(m.subtitleSize*1.42)}px}`);
  if(m.paragraphGap!==undefined)rules.push(`.article-body p{margin-bottom:${m.paragraphGap}px}`);
  const intro=[];
  if(m.introSize!==undefined)intro.push(`font-size:${m.introSize}px`);
  if(m.introLineHeight!==undefined)intro.push(`line-height:${m.introLineHeight}px`);
  if(m.introRuleWidth!==undefined){
    intro.push(`border-left:${m.introRuleWidth}px solid ${m.accentColor||'#a12e36'}`);
    if(m.introRuleWidth>0)intro.push('padding-left:18px');
  }
  if(intro.length)rules.push(`.fixed-page:first-child .article-body>p:first-child{${intro.join(';')}}`);
  if(m.dropCapSize>0)rules.push(`.fixed-page:first-child .article-body>p:first-child::first-letter{float:left;font-size:${m.dropCapSize}px;line-height:.78;margin:6px 10px 0 0;color:${m.accentColor||'#a12e36'}}`);
  if(m.captionSize!==undefined)rules.push(`.scene figcaption{font-size:${m.captionSize}px;line-height:${Math.round(m.captionSize*1.45)}px}`);
  if(m.captionRuleWidth!==undefined)rules.push(`.scene figcaption{border-top:${m.captionRuleWidth}px solid ${m.accentColor||'#a12e36'};padding-top:${m.captionRuleWidth>0?8:0}px}`);

  rules.push(`.magazine-quick-strip{margin-top:14px;padding-top:13px;border-top:2px solid ${m.accentColor||'#a12e36'}}`);
  rules.push(`.magazine-quick-strip>h3{margin:0 0 10px;font-size:23px;line-height:31px;color:${m.accentColor||'#a12e36'};font-weight:600;letter-spacing:.04em}`);
  rules.push('.magazine-quick-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}');
  rules.push('.magazine-quick-card{min-width:0;padding:12px 14px;border:1px solid #cbbdad;background:rgba(255,255,255,.48)}');
  rules.push(`.magazine-quick-card strong{display:block;margin:0 0 5px;font-size:20px;line-height:28px;color:${m.accentColor||'#a12e36'};font-weight:600}`);
  rules.push('.magazine-quick-card span{display:block;font-size:18px;line-height:27px}');

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
