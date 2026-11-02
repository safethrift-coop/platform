// Isolated visual-prototype capture. Never imports or starts the application.
import { createServer } from 'node:http';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { launchChrome } from '../../../apps/web/tests/helpers/chrome.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const axe=await readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const server=createServer(async(req,res)=>{
 try{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  const file=path.resolve(root,relative||'home.html');
  if(!file.startsWith(root+path.sep))throw Error('outside prototype');
  const content=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
  res.end(content);
 }catch{res.writeHead(404);res.end('Prototype file not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const profile=await mkdtemp(path.join(os.tmpdir(),'safethrift-direction-b-'));
const {chrome,ready}=launchChrome(profile);let ws;const results=[];
try{
 ws=new WebSocket(await ready);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let serial=0;const pending=new Map();
 ws.addEventListener('message',({data})=>{const r=JSON.parse(data);if(pending.has(r.id)){const {resolve,reject,timer}=pending.get(r.id);pending.delete(r.id);clearTimeout(timer);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);}});
 const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await cdp('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 const call=(method,params={})=>cdp(method,params,sessionId);
 const evaluate=async(expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');
 await call('Emulation.setScrollbarsHidden',{hidden:true});
 for(const page of ['home','products'])for(const width of [1440,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
  await call('Page.navigate',{url:`http://127.0.0.1:${port}/${page}.html`});
  for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete' && !!document.querySelector('main')"))break;await new Promise(r=>setTimeout(r,100));}
  await evaluate('document.fonts.ready.then(()=>true)');
  await evaluate(axe);
  const audit=await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))");
  const metrics=await evaluate("({width:innerWidth,height:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,archivoLoaded:document.fonts.check('650 40px Archivo'),h1:document.querySelector('h1').innerText,forms:document.querySelectorAll('form').length,overflowElements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)}).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.trim().slice(0,60)}))})");
  assert.equal(metrics.width,width);assert.equal(metrics.scrollWidth,width);assert.equal(metrics.archivoLoaded,true);assert.equal(metrics.forms,0);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.height,scale:1}});
  await writeFile(path.join(root,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));
  results.push({page,width,...metrics,...audit});
  console.log(`${page} ${width}: ${metrics.height}px tall; overflow ${metrics.scrollWidth>width}; axe violations ${audit.violations.length}`);
 }
 await writeFile(path.join(root,'visual-checks.json'),JSON.stringify(results,null,2)+'\n');
 await cdp('Target.closeTarget',{targetId});
 assert.ok(results.every(r=>r.violations.length===0),'Inspect recorded axe violations');
}finally{
 if(ws)ws.close();
 chrome.kill('SIGTERM');
 await new Promise(resolve=>{if(chrome.exitCode!==null||chrome.signalCode!==null)return resolve();const timer=setTimeout(()=>{chrome.kill('SIGKILL');resolve();},5000);chrome.once('exit',()=>{clearTimeout(timer);resolve();});});
 await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
