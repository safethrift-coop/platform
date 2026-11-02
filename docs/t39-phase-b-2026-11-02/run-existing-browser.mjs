import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','2036'],{cwd:new URL('../../apps/web/',import.meta.url),stdio:'inherit'});
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:2036')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Preview not ready');
 const child=spawn('pnpm',['--filter','@safethrift/web','test:browser'],{env:{...process.env,TEST_BASE_URL:'http://127.0.0.1:2036',TEST_ARTIFACTS_DIR:'/tmp/safethrift-t39-phase-b-existing-browser',TEST_VIEWPORTS:'320,390,768,1024,1440'},stdio:'inherit'});
 const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});
 await writeFile(new URL('existing-browser-results.json',import.meta.url),JSON.stringify({command:'pnpm --filter @safethrift/web test:browser',exitCode,viewportWidths:[320,390,768,1024,1440],assertionChanges:0,selectorChanges:3},null,2)+'\n');process.exitCode=exitCode;
}finally{server.kill('SIGTERM');}
