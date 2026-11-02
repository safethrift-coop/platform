// T39 review evidence only: existing Chrome/axe capabilities, no application mutations.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { launchChrome } from '../../apps/web/tests/helpers/chrome.mjs';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const axe=await readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const root=path.dirname(fileURLToPath(import.meta.url));
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:2035';
const baseline=process.env.BASELINE_URL||'http://127.0.0.1:2034';
const profile=await mkdtemp(path.join(os.tmpdir(),'safethrift-phase-b-chrome-'));
const {chrome,ready}=launchChrome(profile);let ws;let sessionId;
const results=[],errors=[],requests=[];
try{
 ws=new WebSocket(await ready);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});let serial=0;const pending=new Map();
 ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id&&pending.has(m.id)){const {resolve,reject,timer}=pending.get(m.id);pending.delete(m.id);clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push({type:'console.error',args:m.params.args.map(a=>a.value||a.description)});if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry);if(m.method==='Network.responseReceived'&&m.params.response.status>=400)requests.push({url:m.params.response.url,status:m.params.response.status});});
 const cdp=(method,params={},sid=sessionId)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error(method+' timeout')),60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...sid?{sessionId:sid}:{}}));});
 const {targetId}=await cdp('Target.createTarget',{url:'about:blank'},null);({sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true},null));
 for(const method of ['Page.enable','Runtime.enable','Log.enable','Network.enable'])await cdp(method);await cdp('Emulation.setScrollbarsHidden',{hidden:true});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<300;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+expression);};
 const size=async(width,height=1000,scale=1)=>cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
 const go=async(route,origin=base)=>{await cdp('Page.navigate',{url:new URL(route,origin).href});await wait("document.readyState==='complete'&&!!document.querySelector('main')");await evaluate('document.fonts.ready');};
 const shot=async(name,width,height)=>{await evaluate("scrollTo({top:0,behavior:'instant'})");const h=height||await evaluate('document.documentElement.scrollHeight');const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:h,scale:1}});await writeFile(path.join(root,name+'.png'),Buffer.from(r.data,'base64'));return{width,height:h};};
 const metrics=()=>evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,archivo:document.fonts.check('650 40px "Safethrift Archivo"'),sourceSans:document.fonts.check('400 18px "Safethrift Source Sans"'),fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),clipping:[...document.querySelectorAll('h1,h2,h3,p,a,button,summary')].filter(e=>e.clientWidth>0&&(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,70)})),forms:document.querySelectorAll('form').length,duplicateIds:[...new Set([...document.querySelectorAll('[id]')].map(e=>e.id))].filter(id=>document.querySelectorAll('[id]').length&&[...document.querySelectorAll('[id]')].filter(e=>e.id===id).length>1),missingAnchors:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash)})`);
 const snapshot=()=>evaluate(`(()=>{const props=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','display','position','padding','margin','border','width','height'];return [...document.querySelectorAll('body,body *')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({tag:e.tagName,class:e.className,styles:Object.fromEntries(props.map(p=>[p,getComputedStyle(e)[p]]))}));})()`);
 if(process.env.BASELINE_ONLY){
 const snaps={};for(const width of [390,1440]){await size(width);for(const route of ['/register','/dashboard','/dashboard/loans','/dashboard/loans/apply']){await go(route,baseline);await wait('!!document.querySelector("h1")');snaps[route+'@'+width]=await snapshot();}}
 await writeFile(path.join(root,'protected-baseline.json'),JSON.stringify(snaps,null,2)+'\n');console.log('Protected baseline saved');
 }else{
 const routes=['/','/products','/about','/membership','/knowledge-centre'];
 const widths=process.env.T39_WIDTHS?process.env.T39_WIDTHS.split(',').map(Number):[1440,390,320,768,1024];
 for(const width of widths){await size(width);for(const route of routes){await go(route);await wait('!!document.querySelector("h1")');await evaluate(axe);const audit=await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))");const m=await metrics();const name=(route==='/'?'home':route.slice(1))+'-'+width;const png=await shot(name,width);results.push({route,...m,png,...audit});console.log(name,JSON.stringify({height:m.height,overflow:m.scrollWidth>width,clipping:m.clipping.length,axe:audit.violations.length}));}}
 await writeFile(path.join(root,'public-matrix.json'),JSON.stringify(results,null,2)+'\n');
 const interactions={};
 await size(390,844);await go('/');await new Promise(r=>setTimeout(r,300));
 await evaluate("document.querySelector('.menu-toggle').click()");await wait("document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='true'");await shot('mobile-menu-open',390);
 await evaluate(axe);interactions.menuAudit=await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>v.id),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))");
 await evaluate("document.querySelector('#site-navigation a').focus()");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 interactions.escape=await evaluate("({closed:document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='false',restored:document.activeElement===document.querySelector('.menu-toggle')})");
 await evaluate("document.querySelector('.menu-toggle').click();document.querySelector('#site-navigation a[href=\"/about\"]').click()");await wait("location.pathname==='/about'&&!!document.querySelector('.m-intro')");
 interactions.clientNavigation=await evaluate("({route:location.pathname,closed:document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='false',active:document.querySelector('#site-navigation [aria-current]').getAttribute('href')})");
 await evaluate("document.querySelector('summary').focus()");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});interactions.disclosure=await evaluate("document.querySelector('details').open");
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});interactions.reducedMotion=await evaluate("getComputedStyle(document.documentElement).scrollBehavior");
 const text=[];for(const route of routes){await go(route);await evaluate("document.documentElement.style.fontSize='200%'");text.push({route,...await metrics()});if(route==='/'||route==='/products')await shot((route==='/'?'home':'products')+'-text-200',390,1400);await evaluate("document.documentElement.style.fontSize=''");}interactions.enlargedText=text;
 await size(720,500,2);const zoom=[];for(const route of routes){await go(route);zoom.push({route,...await metrics()});}interactions.zoomEquivalent=zoom;
 await size(1440);await go('/');await evaluate("document.querySelector('.b-saving-piece').focus()");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await shot('keyboard-focus',1440,900);interactions.focus=await evaluate("({visible:document.activeElement.matches(':focus-visible'),outline:getComputedStyle(document.activeElement).outline,offset:getComputedStyle(document.activeElement).outlineOffset})");
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});interactions.motif=await evaluate("({hash:location.hash,activeId:document.activeElement.id})");
 await go('/products');interactions.anchors=[];for(const id of ['fsa','rsa','gsa']){await evaluate(`document.querySelector('.b-account-jump a[href="#${id}"]').click()`);await wait(`location.hash==='#${id}'`);interactions.anchors.push(await evaluate(`({id:'${id}',exists:!!document.getElementById('${id}'),details:!!document.getElementById('${id}-details'),focus:document.activeElement.id})`));}
 // Retain a marketing stylesheet on protected pages, then compare visible computed styles.
 const protectedBefore=JSON.parse(await readFile(path.join(root,'protected-baseline.json'),'utf8'));const comparisons=[];
 for(const width of [390,1440]){await size(width);for(const route of ['/register','/dashboard','/dashboard/loans','/dashboard/loans/apply']){
  await go(route);await wait('!!document.querySelector("h1")');const clean=await snapshot();
  // Deliberately resident stylesheet reproduces client-navigation residency without touching protected source.
  const css=await readFile(new URL('../../apps/web/src/components/public-site/marketing.css',import.meta.url),'utf8');
  await evaluate(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.append(s)})()`);
  const resident=await snapshot();comparisons.push({route,width,baselineMatches:JSON.stringify(clean)===JSON.stringify(protectedBefore[route+'@'+width]),residentStylesMatch:JSON.stringify(clean)===JSON.stringify(resident),markerAbsent:await evaluate("!document.querySelector('.marketing-site')")});
 }}interactions.protectedStyles=comparisons;
 await writeFile(path.join(root,'interaction-results.json'),JSON.stringify(interactions,null,2)+'\n');
 await writeFile(path.join(root,'browser-errors.json'),JSON.stringify({errors,failedRequests:requests},null,2)+'\n');
 assert.ok(results.every(r=>r.scrollWidth<=r.width&&r.violations.length===0&&r.duplicateIds.length===0),'Inspect public matrix');
 assert.ok(interactions.escape.closed&&interactions.escape.restored,'Menu Escape');
 assert.ok(comparisons.every(r=>r.baselineMatches&&r.residentStylesMatch&&r.markerAbsent),'Protected style preservation');
 console.log('PASS: public matrix and protected style preservation');
 }
 await cdp('Target.closeTarget',{targetId},null);
}finally{ws?.close();chrome.kill('SIGTERM');await new Promise(r=>{if(chrome.exitCode!==null||chrome.signalCode!==null)return r();chrome.once('exit',r)});await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
