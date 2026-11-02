import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readlink,writeFile} from 'node:fs/promises';
const exec=promisify(execFile);const result={};
try{
 const {stdout}=await exec('lsof',['-t','-iTCP:2034','-sTCP:LISTEN']);
 for(const pid of stdout.trim().split(/\s+/).map(Number)){
  const cwd=await readlink(`/proc/${pid}/cwd`);
  if(cwd!=='/tmp/safethrift-t39-phase-b-baseline-web')throw Error('Refusing unrelated listener');
  process.kill(pid,'SIGTERM');result.baseline={pid,cwd,signal:'SIGTERM'};
 }
 await new Promise(r=>setTimeout(r,1500));
}catch(e){if(e.code!==1)throw e;}
result.ports={};
for(const port of [2034,2035,2036,2040,2041,2042,3040,3042]){
 try{const {stdout}=await exec('lsof',['-t',`-iTCP:${port}`,'-sTCP:LISTEN']);result.ports[port]={listeners:stdout.trim()};}
 catch(e){if(e.code!==1)throw e;result.ports[port]={listeners:''};}
}
await writeFile(new URL('preview-cleanup.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
