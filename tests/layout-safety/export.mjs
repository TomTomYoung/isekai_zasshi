import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.env.LAYOUT_EXPORT_TEST_OUTPUT || path.join(repo, 'exports/layout-safety-export'));
await fs.mkdir(output, { recursive: true });
const root = await fs.mkdtemp(path.join(repo, '.export-fixtures-'));
const results = [];
const baseStyle = 'html,body{margin:0;padding:0}.fixed-page{width:1456px;height:2056px;box-sizing:border-box;position:relative;overflow:hidden;padding:64px;background:white}p{margin:0;font:32px/1.5 sans-serif}';
const html = (body='<main class="fixed-page"><p>Safe article rendering fixture</p></main>', css='') => '<!doctype html><html><head><meta charset="utf-8"><style>'+baseStyle+css+'</style></head><body>'+body+'</body></html>';
async function fixture(name, content=html()) {
  const dir = path.join(root,name);
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir,'fixed_layout.html'),content);
  for (const name of ['pages','intermediate']) {
    await fs.mkdir(path.join(dir,name));
    await fs.writeFile(path.join(dir,name,'old-sentinel.txt'), name+' original output');
  }
  return dir;
}
async function snapshot(dir) {
  const result = {};
  async function walk(current) {
    for (const item of await fs.readdir(current,{withFileTypes:true})) {
      const target=path.join(current,item.name); const rel=path.relative(dir,target);
      if(item.isDirectory()){result[rel]='/';await walk(target)}
      else result[rel]=createHash('sha256').update(await fs.readFile(target)).digest('hex');
    }
  }
  await walk(dir);return result;
}
async function run(dir,args=[],nodeArgs=[]) {
  let out;
  try {
    out=await execute(process.execPath,[...nodeArgs,'tools/build_article.mjs',path.relative(repo,dir),...args],{
      cwd:repo,env:{...process.env},maxBuffer:2*1024*1024,timeout:55000,
    });out.code=0;
  } catch(error){out={stdout:error.stdout||'',stderr:error.stderr||'',code:error.code}}
  return out;
}
async function check(name,task) {
  const start=Date.now();
  try {const detail=await task();results.push({name,ok:true,ms:Date.now()-start,...detail});console.log(name+': PASS');}
  catch(error){results.push({name,ok:false,ms:Date.now()-start,error:error.stack});console.error(name+': FAIL '+error.message)}
}
try {
  await check('check-only is JSON and makes no article writes',async()=>{
    const dir=await fixture('readonly');const before=await snapshot(dir);const out=await run(dir,['--check-only']);
    assert.equal(out.code,0,out.stderr);const report=JSON.parse(out.stdout);assert.equal(report.ok,true);assert.equal(report.layoutSafety.pageCount,1);assert.deepEqual(report.pages,[]);assert.deepEqual(await snapshot(dir),before);return {report};
  });
  await check('external --report succeeds without stdout',async()=>{
    const dir=await fixture('report');const before=await snapshot(dir);const target=path.join(output,'check-only-report.json');const out=await run(dir,['--check-only','--report',target]);
    assert.equal(out.code,0,out.stderr);assert.equal(out.stdout,'');assert.equal(JSON.parse(await fs.readFile(target,'utf8')).ok,true);assert.deepEqual(await snapshot(dir),before);
  });
  await check('article-local and build-mode reports are rejected without writes',async()=>{
    const dir=await fixture('invalid-report');const before=await snapshot(dir);const out=await run(dir,['--check-only','--report',path.join(dir,'intermediate','report.json')]);
    assert.notEqual(out.code,0);assert.match(out.stderr,/outside the article directory/);assert.deepEqual(await snapshot(dir),before);
    const buildReport=await run(dir,['--report',path.join(output,'refused-build-report.json')]);
    assert.notEqual(buildReport.code,0);assert.match(buildReport.stderr,/--report is available with --check-only/);
    assert.deepEqual(await snapshot(dir),before);
  });
  await check('report aliases do not modify article files',async()=>{
    const dir=await fixture('report-alias');const before=await snapshot(dir);
    const symlink=path.join(root,'symlink-report.json');
    await fs.symlink(path.join(dir,'fixed_layout.html'),symlink);
    const refused=await run(dir,['--check-only','--report',symlink]);
    assert.notEqual(refused.code,0);assert.match(refused.stderr,/outside the article directory/);
    assert.deepEqual(await snapshot(dir),before);
    const hardlink=path.join(root,'hardlink-report.json');
    await fs.link(path.join(dir,'fixed_layout.html'),hardlink);
    const accepted=await run(dir,['--check-only','--report',hardlink]);
    assert.equal(accepted.code,0,accepted.stderr);assert.equal(JSON.parse(await fs.readFile(hardlink,'utf8')).ok,true);
    assert.deepEqual(await snapshot(dir),before);
  });
  await check('successful build replaces both outputs and verifies PNG size',async()=>{
    const dir=await fixture('build');const out=await run(dir);assert.equal(out.code,0,out.stderr);const png=await fs.readFile(path.join(dir,'pages','001.png'));assert.equal(png.readUInt32BE(16),1456);assert.equal(png.readUInt32BE(20),2056);
    const manifest=JSON.parse(await fs.readFile(path.join(dir,'intermediate','article_manifest.json'),'utf8'));assert.equal(manifest.ok,true);assert.equal(manifest.layoutSafety.ok,true);assert.deepEqual(await fs.readdir(path.join(dir,'pages')),['001.png']);assert.equal((await fs.readdir(dir)).some(name=>name.startsWith('.article-build-')),false);return {png:{width:1456,height:2056}};
  });
  for(const [name,content,pattern] of [
    ['overflow',html('<main class="fixed-page"><p style="position:absolute;left:1440px;width:100px">Outside</p></main>'),/Layout safety check failed/],
    ['no-page',html('<p>No fixed page</p>'),/Layout safety check failed/],
    ['missing-image',html('<main class="fixed-page"><img src="missing.png" width="100" height="100"></main>'),/Asset readiness failed/],
    ['missing-font',html(undefined,'@font-face{font-family:Broken;src:url(missing.woff2)}p{font-family:Broken}'),/Asset readiness failed/],
    ['missing-background',html('<main class="fixed-page"><div style="width:100px;height:100px;background-image:url(missing-bg.png)"></div></main>'),/Asset readiness failed/],
    ['preview-guide',html('<style id="fixed-layout-manual-preview-style"></style><main class="fixed-page"><p>Guide</p></main>'),/Preview guides are active/],
    ['script-error',html('<main class="fixed-page"><p>Before error</p></main><script>throw new Error("fixture-script-error")</script>'),/Asset readiness failed/],
    ['fractional-png-size',html(undefined,'.fixed-page{width:1456.4px}'),/PNG is 1457×2056/],
    ['asset-timeout',html('<main class="fixed-page"><img data-candidates="never-assigned.png" width="100" height="100"></main>'),/Asset readiness timed out/],
  ]) {
    await check(name+' preserves both old outputs',async()=>{
      const dir=await fixture(name,content);const before=await snapshot(dir);const out=await run(dir);assert.notEqual(out.code,0,out.stdout);assert.match(out.stderr,pattern);assert.deepEqual(await snapshot(dir),before);return {failure:out.stderr.trim()};
    });
  }
  await check('optional missing image candidate followed by valid image succeeds',async()=>{
    const dir=await fixture('candidate',html('<main class="fixed-page"><img id="candidate" data-candidates="missing.png|good.png" width="100" height="100"></main><script>const img=document.getElementById("candidate");img.onerror=()=>{img.onerror=null;img.src="good.png"};img.src="missing.png"</script>'));
    await fs.writeFile(path.join(dir,'good.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=','base64'));
    const before=await snapshot(dir);const out=await run(dir,['--check-only']);assert.equal(out.code,0,out.stderr);assert.equal(JSON.parse(out.stdout).ok,true);assert.deepEqual(await snapshot(dir),before);
  });
  await check('second output installation failure rolls back both originals',async()=>{
    const hook=path.join(root,'rename-failure-hook.mjs');
    await fs.writeFile(hook,`import {promises as fs} from 'node:fs';const rename=fs.rename.bind(fs);let fired=false;fs.rename=async(source,target)=>{if(!fired && source.includes('/.article-build-') && source.endsWith('/intermediate') && target.endsWith('/intermediate')){fired=true;throw new Error('injected second install failure')}return rename(source,target)};`);
    const dir=await fixture('rollback');const before=await snapshot(dir);const out=await run(dir,[],['--import',hook]);assert.notEqual(out.code,0);assert.match(out.stderr,/injected second install failure/);assert.deepEqual(await snapshot(dir),before);
  });
} finally {
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({
    generatedAt:new Date().toISOString(),node:process.version,results,
  },null,2)+'\n');
  await fs.rm(root,{recursive:true,force:true});
}
console.log(`${results.filter(result=>result.ok).length}/${results.length} passed; ${path.join(output,'results.json')}`);
if(results.some(result=>!result.ok))process.exitCode=1;
