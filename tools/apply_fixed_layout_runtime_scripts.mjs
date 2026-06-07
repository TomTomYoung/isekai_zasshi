import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TEMPLATE_HTML = path.join(ROOT, '202603', '01_聖女泥酔スクープ記事', 'fixed_layout.html');
const SCRIPT_TAG = '  <script src="../../tools/fixed_layout_image_expand.js" defer></script>';

function main() {
  let html = fs.readFileSync(TEMPLATE_HTML, 'utf8');
  if (!html.includes('fixed_layout_image_expand.js')) {
    html = html.replace('</head>', `${SCRIPT_TAG}\n</head>`);
    fs.writeFileSync(TEMPLATE_HTML, html, 'utf8');
    console.log('fixed layout runtime scripts injected.');
  } else {
    console.log('fixed layout runtime scripts already present.');
  }
}

main();
