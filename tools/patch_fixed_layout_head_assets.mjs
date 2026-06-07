import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), '202603', '01_聖女泥酔スクープ記事', 'fixed_layout.html');
let html = fs.readFileSync(file, 'utf8');

const css = '  <' + 'link rel="stylesheet" href="../../tools/fixed_layout_measured_overrides.css">';
const js = '  <' + 'script src="../../tools/fixed_layout_image_expand.js" defer></' + 'script>';

if (!html.includes('fixed_layout_measured_overrides.css')) html = html.replace('</head>', css + '\n</head>');
if (!html.includes('fixed_layout_image_expand.js')) html = html.replace('</head>', js + '\n</head>');

fs.writeFileSync(file, html, 'utf8');
console.log('fixed layout head assets patched.');
