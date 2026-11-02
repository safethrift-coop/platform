import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const cwd=new URL('../../apps/web/',import.meta.url);const results=[];
async function run(name,command,args,env={},directory=process.cwd()){console.log(name);const started=new Date().toISOString();const child=spawn(command,args,{cwd:directory,env:{...process.env,...env},stdio:'inherit'});const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});results.push({name,started,finished:new Date().toISOString(),exitCode:code});return code;}
const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','2037'],{cwd,stdio:'inherit'});
try{
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Preview exited');try{if((await fetch('http://127.0.0.1:2037')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Preview not ready');
 await run(process.env.POLISH_BASELINE==='1'?'Baseline capture':'Polish verification',process.execPath,['docs/t39-final-polish-2026-11-02/browser.mjs']);
 if(process.env.POLISH_BASELINE!=='1'){
  await run('Existing T39 browser suite','pnpm',['--filter','@safethrift/web','test:browser'],{TEST_BASE_URL:'http://127.0.0.1:2037',TEST_ARTIFACTS_DIR:new URL('existing-browser/',import.meta.url).pathname,TEST_VIEWPORTS:'320,390,768,1024,1440'});
  await run('Existing HTTP/SEO/closed-gate suites',process.execPath,['--test','tests/public-site.test.mjs','tests/seo-config.test.mjs','tests/registration.test.mjs','tests/dashboard.test.mjs','tests/browser-runtime.test.mjs','tests/dashboard-closed.test.mjs','tests/registration-closed.test.mjs'],{TEST_BASE_URL:'http://127.0.0.1:2037'},cwd);
 }
 await writeFile(new URL(process.env.POLISH_BASELINE==='1'?'baseline-run.json':'verification-run.json',import.meta.url),JSON.stringify(results,null,2)+'\n');process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
}finally{server.kill('SIGTERM');await new Promise(r=>{if(server.exitCode!==null||server.signalCode!==null)return r();server.once('exit',r)});}
