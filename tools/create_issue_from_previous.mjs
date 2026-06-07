import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FROM = process.env.FROM_ISSUE || '202603';
const TO = process.env.ISSUE || '202604';
const fromDir = path.join(ROOT, FROM);
const toDir = path.join(ROOT, TO);

function copyDir(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing source issue: ${src}`);
  if (fs.existsSync(dest)) throw new Error(`Target issue already exists: ${dest}`);
  fs.cpSync(src, dest, { recursive: true });
}

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function replaceInTextFiles(dir) {
  const files = walk(dir).filter(p => /\.(html|css|js|mjs|json|opf|xhtml|md|txt)$/i.test(p));
  for (const file of files) {
    let s = fs.readFileSync(file, 'utf8');
    const next = s
      .replaceAll(FROM, TO)
      .replaceAll('2026年3月', '2026年4月')
      .replaceAll('2026/03', '2026/04');
    if (next !== s) fs.writeFileSync(file, next, 'utf8');
  }
}

function main() {
  copyDir(fromDir, toDir);
  replaceInTextFiles(toDir);
  console.log(`created issue ${TO} from ${FROM}`);
}

main();
