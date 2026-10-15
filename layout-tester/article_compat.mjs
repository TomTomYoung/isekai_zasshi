import {parseArticle} from '../tools/article_parse.mjs';

function stripInlineMarkup(line){
  let out=line;
  out=out.replace(/<br\s*\/?\s*>/gi,'');
  out=out.replace(/<\/?small\s*>/gi,'');
  if(/^\s*<(?:figure|img|figcaption|\/figure)\b/.test(out))return out;
  out=out.replace(/\[([^\]\n]+)\]\([^\s)]+\)/g,'$1');
  out=out.replace(/\*\*([^*\n]+)\*\*/g,'$1');
  out=out.replace(/__([^_\n]+)__/g,'$1');
  out=out.replace(/\`([^\`\n]+)\`/g,'$1');
  out=out.replace(/\*([^*\n]+)\*/g,'$1');
  out=out.replace(/_([^_\n]+)_/g,'$1');
  out=out.replace(/\*\*/g,'');
  return out;
}

export function normalizeArticleMarkdown(markdown){
  let legacyFigure=false,inlineMarkup=false,listMarkup=false,quoteGaps=false,dividers=false;
  let normalized=markdown.replace(/<figure(?:\s+[^>]*)?>\s*\n\s*<img\s+([^>]*?)\/?\s*>\s*\n\s*<figcaption>([^<>]*)<\/figcaption>\s*\n\s*<\/figure>/g,(whole,attrs,caption)=>{
    const src=attrs.match(/(?:^|\s)src="([^"<>]+)"/),alt=attrs.match(/(?:^|\s)alt="([^"<>]*)"/);
    if(!src||!alt)return whole;
    let value=src[1];
    if(/^[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i.test(value))value='./'+value;
    if(!/^\.\/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i.test(value))return whole;
    const canonical=`<figure>\n<img src="${value}" alt="${alt[1]}">\n<figcaption>${caption}</figcaption>\n</figure>`;
    if(canonical!==whole)legacyFigure=true;
    return canonical;
  });
  const lines=normalized.replace(/\r\n?/g,'\n').split('\n'),out=[];
  let inFigure=false;
  for(const raw of lines){
    const trimmed=raw.trim();
    if(trimmed==='<figure>'){inFigure=true;out.push(raw);continue;}
    if(inFigure){out.push(raw);if(trimmed==='</figure>')inFigure=false;continue;}
    if(trimmed==='>'){quoteGaps=true;continue;}
    if(/^(?:---|\*\*\*)$/.test(trimmed)){dividers=true;continue;}
    let line=raw;
    if(/^\s*[-+]\s+/.test(line)){line=line.replace(/^(\s*)[-+]\s+/,'$1・');listMarkup=true;}
    else if(/^\s*\d+[.)]\s+/.test(line)){line=line.replace(/^(\s*)(\d+)[.)]\s+/,'$1$2　');listMarkup=true;}
    const stripped=stripInlineMarkup(line);
    if(stripped!==line)inlineMarkup=true;
    out.push(stripped);
  }
  return{
    markdown:out.join('\n'),
    changed:legacyFigure||inlineMarkup||listMarkup||quoteGaps||dividers,
    legacyFigure,inlineMarkup,listMarkup,quoteGaps,dividers
  };
}

export function parseArticleForTester(markdown){
  const normalized=normalizeArticleMarkdown(markdown);
  const lines=normalized.markdown.split('\n');
  let syntheticSubtitle=false;
  const first=lines.findIndex(line=>line.trim());
  if(first>=0&&/^#\s+/.test(lines[first].trim())){
    let second=first+1;while(second<lines.length&&!lines[second].trim())second++;
    if(second>=lines.length||!/^##\s+/.test(lines[second].trim())){
      lines.splice(first+1,0,'## LAYOUT TESTER SUBTITLE');
      syntheticSubtitle=true;
    }
  }
  const h2=[];for(let i=0;i<lines.length;i++)if(/^##\s+/.test(lines[i].trim()))h2.push(i);
  const starts=[0,...h2.slice(1)],insertions=[];
  let textOnlySections=0,splitFigureSections=0,syntheticSeq=0;
  for(let i=0;i<starts.length;i++){
    const start=starts[i],end=i+1<starts.length?starts[i+1]:lines.length;
    const figureStarts=[];
    for(let j=start;j<end;j++)if(lines[j].trim()==='<figure>')figureStarts.push(j);
    if(figureStarts.length===0){
      const n=String(++syntheticSeq).padStart(3,'0');textOnlySections++;
      insertions.push({at:end,kind:'missing-figure',lines:[
        '<figure>',
        `<img src="./__layout_tester_missing_${n}.png" alt="">`,
        '<figcaption>layout tester text-only section</figcaption>',
        '</figure>'
      ]});
    }else if(figureStarts.length>1){
      for(const at of figureStarts.slice(1)){
        const n=String(++syntheticSeq).padStart(3,'0');splitFigureSections++;
        insertions.push({at,kind:'split-heading',lines:[`## LAYOUT TESTER IMAGE SPLIT ${n}`]});
      }
    }
  }
  for(const insertion of insertions.sort((a,b)=>b.at-a.at))lines.splice(insertion.at,0,...insertion.lines);
  const staged=parseArticle(lines.join('\n'));
  const syntheticFigure=/^\.\/__layout_tester_missing_\d+\.png$/;
  const syntheticHeading=/^LAYOUT TESTER IMAGE SPLIT \d+$/;
  const syntheticSubtitleHeading=/^LAYOUT TESTER SUBTITLE$/;
  const groups=[];
  for(const stagedGroup of staged.groups){
    const kept=stagedGroup.filter(block=>!(
      (block.type==='figure'&&syntheticFigure.test(block.src))||
      (block.type==='h2'&&(syntheticHeading.test(block.text)||syntheticSubtitleHeading.test(block.text)))
    ));
    if(kept.length)groups.push(kept);
  }
  const all=[],seen=new Set();
  for(const group of groups)for(const block of group)if(!seen.has(block)){seen.add(block);all.push(block);}
  const idMap=new Map(all.map((block,index)=>[block,`b${String(index+1).padStart(3,'0')}`]));
  const normalizedGroups=groups.map(group=>group.map(block=>({...block,id:idMap.get(block)})));
  const blocks=normalizedGroups.flat();
  return{
    parsed:{blocks,groups:normalizedGroups},
    normalizedLegacyFigure:normalized.legacyFigure,
    normalizedInlineMarkup:normalized.inlineMarkup,
    normalizedListMarkup:normalized.listMarkup,
    normalizedQuoteGaps:normalized.quoteGaps,
    normalizedDividers:normalized.dividers,
    textOnlySections,
    splitFigureSections,
    syntheticSubtitle
  };
}

export function adaptRuntimeForTextSections(runtime){
  const replacements=[
    [
      "    const image = page.querySelector('img'), box = image.getBoundingClientRect();\n    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);\n    const imageArea = image.naturalWidth * image.naturalHeight * scale * scale;",
      "    const image = page.querySelector('img');\n    let imageArea = 0;\n    if (image) {\n      const box = image.getBoundingClientRect();\n      const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);\n      imageArea = image.naturalWidth * image.naturalHeight * scale * scale;\n    }"
    ],
    [
      "    return m.bottom <= 1936 && m.imageArea > m.textArea;",
      "    return m.bottom <= 1936 && (!page.querySelector('img') || m.imageArea > m.textArea);"
    ],
    [
      "    const scene = el('figure', 'scene' + (image.naturalHeight > image.naturalWidth ? ' portrait' : ''));\n    scene.dataset.figure = figure.id;\n    scene.dataset.repeated = String(repeated);\n    const img = image.cloneNode(); img.className = 'scene-image';\n    scene.append(img, el('figcaption', '', figure.caption));\n    const body = el('div', 'article-body');\n    const folio = el('footer', 'folio', String(++pageNumber).padStart(3, '0'));\n    page.append(head, scene, body, folio); root.append(page);",
      "    const body = el('div', 'article-body');\n    const folio = el('footer', 'folio', String(++pageNumber).padStart(3, '0'));\n    if (figure && image) {\n      const scene = el('figure', 'scene' + (image.naturalHeight > image.naturalWidth ? ' portrait' : ''));\n      scene.dataset.figure = figure.id;\n      scene.dataset.repeated = String(repeated);\n      const img = image.cloneNode(); img.className = 'scene-image';\n      scene.append(img, el('figcaption', '', figure.caption));\n      page.append(head, scene, body, folio);\n    } else page.append(head, body, folio);\n    root.append(page);"
    ],
    [
      "      const ordered = [page.querySelector('.running-head'), page.querySelector('.scene'), ...children, page.querySelector('.folio')];",
      "      const ordered = [page.querySelector('.running-head'), page.querySelector('.scene'), ...children, page.querySelector('.folio')].filter(Boolean);"
    ],
    [
      "      return { page: index + 1, ...m, figure: page.querySelector('.scene').dataset.figure, repeated: page.querySelector('.scene').dataset.repeated === 'true' };",
      "      const scene = page.querySelector('.scene');\n      return { page: index + 1, ...m, figure: scene?.dataset.figure || null, repeated: scene?.dataset.repeated === 'true' };"
    ],
    [
      "      const figure = group.find(b => b.type === 'figure');\n      const image = new Image(); image.src = figure.src; image.alt = figure.alt;\n      await image.decode(); return image;",
      "      const figure = group.find(b => b.type === 'figure');\n      if (!figure) return null;\n      const image = new Image(); image.src = figure.src; image.alt = figure.alt;\n      await image.decode(); return image;"
    ]
  ];
  let out=runtime;
  for(const [from,to] of replacements){
    if(!out.includes(from))throw new Error('paginate.js互換処理を適用できません。runtime更新に合わせてテスターを更新してください');
    out=out.replace(from,to);
  }
  return out;
}
