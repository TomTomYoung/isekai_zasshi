#!/usr/bin/env node
// Optional read-only static server for local tests.
// The layout tester itself does not depend on special HTTP endpoints.
import http from 'node:http';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MIME={
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.md':'text/plain; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.woff':'font/woff'
};
const within=(root,target)=>{
  const rel=path.relative(root,target);
  return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));
};
export async function startServer({port=4173,root=ROOT}={}){
  const realRoot=await fs.realpath(root);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Read only');return;}
      const host=req.headers.host||'';
      if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)){res.writeHead(403);res.end('Loopback only');return;}
      const origin=req.headers.origin;
      if(req.headers['sec-fetch-site']==='cross-site'||(origin&&origin!==`http://${host}`)){res.writeHead(403);res.end('Same origin only');return;}
      const raw=decodeURIComponent((req.url||'/').split('?')[0]);
      if(raw.includes('\\')||raw.includes('\0')||raw.split('/').some(x=>x.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
      let relative=raw.replace(/^\//,'');
      if(!relative||relative==='layout-tester/'||relative==='layout-tester')relative='layout-tester/index.html';
      const target=path.resolve(realRoot,relative),ext=path.extname(target).toLowerCase();
      if(!within(realRoot,target)||!MIME[ext]){res.writeHead(403);res.end('Forbidden');return;}
      const real=await fs.realpath(target);
      if(!within(realRoot,real)){res.writeHead(403);res.end('Forbidden');return;}
      const stat=await fs.stat(real);
      if(!stat.isFile()||stat.size>25*1024*1024){res.writeHead(413);res.end('File too large');return;}
      res.writeHead(200,{'Content-Type':MIME[ext],'Content-Length':stat.size});
      res.end(req.method==='HEAD'?undefined:await fs.readFile(real));
    }catch(error){
      if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:400);
      res.end('Not available');
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=process.argv.find(a=>a.startsWith('--port='));
  const port=arg?Number(arg.slice(7)):4173;
  if(!Number.isInteger(port)||port<0||port>65535){console.error('Invalid port');process.exitCode=1;}
  else try{
    const server=await startServer({port});
    console.log(`静的テスト用: http://127.0.0.1:${server.address().port}/layout-tester/`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
