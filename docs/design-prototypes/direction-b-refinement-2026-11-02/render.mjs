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
  const file=relative.startsWith('direction-b-2026-10-29/')?path.resolve(path.dirname(root),relative):path.resolve(root,relative||'home.html');
  if(!file.startsWith(path.dirname(root)+path.sep))throw Error('outside prototype');
  const content=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
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
 for(const page of ['home','products'])for(const width of [1440,1024,768,390,320]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
  await call('Page.navigate',{url:`http://127.0.0.1:${port}/${page}.html`});
  for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete' && !!document.querySelector('main')"))break;await new Promise(r=>setTimeout(r,100));}
  await evaluate('document.fonts.ready.then(()=>true)');
  await evaluate(axe);
  const audit=await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))");
  const metrics=await evaluate("({width:innerWidth,height:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,archivoLoaded:document.fonts.check('650 40px Archivo'),sourceSansLoaded:document.fonts.check('400 18px \"Source Sans 3\"'),fontFaces:[...document.fonts].map(f=>({family:f.family,status:f.status})),clippedElements:[...document.querySelectorAll('h1,h2,h3,p,a,button')].filter(e=>e.clientWidth>0&&(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)).map(e=>({tag:e.tagName,text:e.textContent.slice(0,80)})),h1:document.querySelector('h1').innerText,forms:document.querySelectorAll('form').length,overflowElements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)}).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.trim().slice(0,60)}))})");
  assert.equal(metrics.width,width);assert.equal(metrics.scrollWidth,width);assert.equal(metrics.archivoLoaded,true);assert.equal(metrics.forms,0);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.height,scale:1}});
  await writeFile(path.join(root,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));
  results.push({page,width,...metrics,...audit});
  console.log(`${page} ${width}: ${metrics.height}px tall; overflow ${metrics.scrollWidth>width}; axe violations ${audit.violations.length}`);
 }

 // Additional isolated interaction and enlarged-text artboards.
 const extras=[];
 async function capture(name,width,height=900){
  const m=await evaluate("({width:innerWidth,height:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth})");
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.min(m.height,height),scale:1}});
  await writeFile(path.join(root,name+'.png'),Buffer.from(shot.data,'base64'));
  extras.push({name,...m,screenshotHeight:Math.min(m.height,height)});
 }
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await call('Page.navigate',{url:`http://127.0.0.1:${port}/home.html`});
 await new Promise(r=>setTimeout(r,400));await evaluate('document.fonts.ready');
 await capture('state-menu-closed',390,844);
 await evaluate("document.querySelector('.menu-toggle').click()");
 await capture('state-menu-open',390,844);
 await evaluate(axe);
 const menuAudit=await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>v.id)}))");
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 const escape=await evaluate("({closed:document.querySelector('#mobile-menu').hidden,focusRestored:document.activeElement===document.querySelector('.menu-toggle')})");
 for(const page of ['home','products']){
 await call('Page.navigate',{url:`http://127.0.0.1:${port}/${page}.html`});await new Promise(r=>setTimeout(r,300));await evaluate('document.fonts.ready');
 await evaluate("document.documentElement.style.fontSize='200%'");
 const m=await evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('h1,h2,h3,p,a,button')].filter(e=>e.clientWidth>0&&(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)).map(e=>e.textContent.slice(0,60))})");
 extras.push({name:page+'-text-200',...m});await capture(page+'-text-200',390,1400);
 }
 await call('Emulation.setDeviceMetricsOverride',{width:720,height:500,deviceScaleFactor:2,mobile:false});
 for(const page of ['home','products']){await call('Page.navigate',{url:`http://127.0.0.1:${port}/${page}.html`});await new Promise(r=>setTimeout(r,300));await evaluate('document.fonts.ready');extras.push({name:page+'-zoom-equivalent-200',...await evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})")});}
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:`http://127.0.0.1:${port}/home.html`});await new Promise(r=>setTimeout(r,300));await evaluate('document.fonts.ready');
 await evaluate("document.querySelector('.saving-piece').focus()");
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await capture('state-motif-focus',1440,900);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await new Promise(r=>setTimeout(r,500));
 extras.push({name:'motif-anchor',...await evaluate("({hash:location.hash,activeId:document.activeElement.id})")});
 await evaluate("scrollTo(0,0)");
 await evaluate("document.querySelector('.desktop-nav a').focus()");
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await capture('state-navigation-focus',1440,900);
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 extras.push({name:'reduced-motion',...await evaluate("({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior})")});

 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await call('Page.navigate',{url:`http://127.0.0.1:${port}/products.html`});await new Promise(r=>setTimeout(r,300));await evaluate('document.fonts.ready');
 const anchors=[];
 for(const id of ['fsa','rsa','gsa','fsa-details','rsa-details','gsa-details']){await evaluate(`location.hash='${id}';document.getElementById('${id}').scrollIntoView();document.getElementById('${id}').tabIndex=-1;document.getElementById('${id}').focus({preventScroll:true})`);anchors.push(await evaluate(`({id:'${id}',exists:!!document.getElementById('${id}'),hash:location.hash,focus:document.activeElement.id})`));}
 await evaluate('scrollTo(0,0)');
 let rect=await evaluate("(()=>{const r=document.querySelector('.desktop-nav a[aria-current]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...rect});
 await capture('state-navigation-active-hover',1440,650);
 await call('Page.navigate',{url:`http://127.0.0.1:${port}/home.html`});await new Promise(r=>setTimeout(r,300));await evaluate('document.fonts.ready');
 rect=await evaluate("(()=>{const r=document.querySelector('.saving-piece').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...rect});
 await capture('state-motif-hover',1440,900);
 await evaluate("document.querySelector('.saving-piece').click()");await new Promise(r=>setTimeout(r,100));
 await capture('state-product-links',1440,900);
 extras.push({name:'six-product-anchor-contracts',anchors});
 // Content and interaction bounds: no application controls and no missing local destinations.
 for(const name of ['home','products']){await call('Page.navigate',{url:`http://127.0.0.1:${port}/${name}.html`});await new Promise(r=>setTimeout(r,250));await evaluate('document.fonts.ready');extras.push({name:name+'-links',...await evaluate("({missingLocalAnchors:[...document.querySelectorAll('a[href^=\"#\"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash),controls:[...document.querySelectorAll('input,form,select,textarea')].length,touchTargets:[...document.querySelectorAll('a,button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<24||r.height<24)}).map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})")});}
 await writeFile(path.join(root,'interaction-checks.json'),JSON.stringify({extras,escape,menuAudit},null,2)+'\n');
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
