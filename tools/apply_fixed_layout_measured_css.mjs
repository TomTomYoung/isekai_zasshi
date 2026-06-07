import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), '202603', '01_聖女泥酔スクープ記事', 'fixed_layout.html');
const tag = '<link rel="stylesheet" href="../../tools/fixed_layout_measured_overrides.css">';
let html = fs.readFileSync(file, 'utf8');

if (!html.includes('fixed_layout_measured_overrides.css')) {
  html = html.replace('</head>', `  ${tag}\n</head>`);
  fs.writeFileSync(file, html, 'utf8');
  console.log('measured override css injected.');
} else {
  console.log('measured override css already present.');
}
