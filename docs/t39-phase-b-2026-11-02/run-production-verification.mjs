import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const cwd=new URL('../../apps/web/',import.meta.url);
const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','2035'],{cwd,stdio:'inherit'});
async function run(name,command,args,env={},directory=process.cwd()){
 console.log('Starting '+name);const start=new Date().toISOString();const child=spawn(command,args,{cwd:directory,env:{...process.env,...env},stdio:'inherit'});const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});return{name,start,finished:new Date().toISOString(),exitCode};
}
const results=[];
try{
 let ready=false;for(let i=0;i<200;i++){if(server.exitCode!==null)throw Error('Preview exited');try{if((await fetch('http://127.0.0.1:2035')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Preview timeout');
 if(!process.env.T39_REUSE_BASELINE) results.push(await run('baseline styles',process.execPath,['docs/t39-phase-b-2026-11-02/verify.mjs'],{BASELINE_ONLY:'1'}));
 results.push(await run('production browser matrix',process.execPath,['docs/t39-phase-b-2026-11-02/verify.mjs']));
 results.push(await run('existing T39 browser suite','pnpm',['--filter','@safethrift/web','test:browser'],{TEST_BASE_URL:'http://127.0.0.1:2035',TEST_ARTIFACTS_DIR:'/tmp/safethrift-t39-phase-b-existing-browser',TEST_VIEWPORTS:'320,390,768,1024,1440'}));
 results.push(await run('existing HTTP, metadata and closed-gate suites',process.execPath,['--test','tests/public-site.test.mjs','tests/seo-config.test.mjs','tests/registration.test.mjs','tests/dashboard.test.mjs','tests/browser-runtime.test.mjs','tests/dashboard-closed.test.mjs','tests/registration-closed.test.mjs'],{TEST_BASE_URL:'http://127.0.0.1:2035'},cwd));
 await writeFile(new URL('production-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
 process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
}finally{server.kill('SIGTERM');}
