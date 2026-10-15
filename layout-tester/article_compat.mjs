import {parseArticle} from '../tools/article_parse.mjs';

export function normalizeArticleMarkdown(markdown){
  let changed=false;
  const normalized=markdown.replace(/<figure(?:\s+[^>]*)?>\s*\n\s*<img\s+([^>]*?)\/?\s*>\s*\n\s*<figcaption>([^<>]*)<\/figcaption>\s*\n\s*<\/figure>/g,(whole,attrs,caption)=>{
    const src=attrs.match(/(?:^|\s)src="([^"<>]+)"/),alt=attrs.match(/(?:^|\s)alt="([^"<>]*)"/);
    if(!src||!alt)return whole;
    let value=src[1];
    if(/^[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i.test(value))value='./'+value;
    if(!/^\.\/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i.test(value))return whole;
    changed=true;
    return `<figure>\n<img src="${value}" alt="${alt[1]}">\n<figcaption>${caption}</figcaption>\n</figure>`;
  });
  return{markdown:normalized,changed};
}

export function parseArticleForTester(markdown){
  const normalized=normalizeArticleMarkdown(markdown);
  const lines=normalized.markdown.replace(/\r\n?/g,'\n').split('\n');
  const h2=[];for(let i=0;i<lines.length;i++)if(/^##\s+/.test(lines[i].trim()))h2.push(i);
  const starts=[0,...h2.slice(1)],insertions=[];
  for(let i=0;i<starts.length;i++){
    const start=starts[i],end=i+1<starts.length?starts[i+1]:lines.length;
    let figures=0;
    for(let j=start;j<end;j++)if(lines[j].trim()==='<figure>')figures++;
    if(figures===0){
      const n=String(i+1).padStart(3,'0');
      insertions.push({at:end,lines:[
        '<figure>',
        `<img src="./__layout_tester_missing_${n}.png" alt="">`,
        '<figcaption>layout tester text-only section</figcaption>',
        '</figure>'
      ]});
    }
  }
  for(const insertion of insertions.sort((a,b)=>b.at-a.at))lines.splice(insertion.at,0,...insertion.lines);
  const staged=parseArticle(lines.join('\n'));
  const kept=staged.blocks.filter(block=>!(block.type==='figure'&&/^\.\/__layout_tester_missing_\d+\.png$/.test(block.src)));
  const blocks=kept.map((block,index)=>({...block,id:`b${String(index+1).padStart(3,'0')}`}));
  const groups=[];
  for(const [index,block] of blocks.entries()){
    if(!groups.length||(block.type==='h2'&&index>1))groups.push([]);
    groups.at(-1).push(block);
  }
  return{parsed:{blocks,groups},normalizedLegacyFigure:normalized.changed,textOnlySections:insertions.length};
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
