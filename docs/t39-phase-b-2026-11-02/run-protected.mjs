// Run unchanged, guarded repository fixtures sequentially against brand-new local services.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
const databaseUrl=process.env.T39_PHASE_B_TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('Explicit T39_PHASE_B_TEST_DATABASE_URL required');
const parsedDatabaseUrl=new URL(databaseUrl);
if(!['postgres:','postgresql:'].includes(parsedDatabaseUrl.protocol)||parsedDatabaseUrl.hostname!=='127.0.0.1'||parsedDatabaseUrl.port!=='55448'||parsedDatabaseUrl.pathname!=='/safethrift_t39_phase_b_test')throw new Error('T39_PHASE_B_TEST_DATABASE_URL must point to the isolated loopback Phase B test database');
const env={...process.env,T40_TEST_DATABASE_URL:databaseUrl,T41_TEST_DATABASE_URL:databaseUrl,T42_TEST_DATABASE_URL:databaseUrl,AUTH_TEST_REDIS_URL:'redis://127.0.0.1:55449'};
const results=process.env.T39_RESUME_AT?JSON.parse(await readFile(new URL('protected-regressions.json',import.meta.url),'utf8')):[];
for(const [name,script] of [['T40','test:registration:browser'],['T41','test:dashboard:browser'],['T42','test:loans:browser']]){
 if(process.env.T39_RESUME_AT==='T41'&&name==='T40')continue;
 const started=new Date().toISOString();const log='/tmp/safethrift-t39-phase-b-'+name+'-attempt'+(results.filter(r=>r.name===name).length+1)+'.log';const out=createWriteStream(log);
 console.log(name+' starting: unchanged '+script);
 const child=spawn('pnpm',['--filter','@safethrift/web',script],{env:{...env,TEST_ARTIFACTS_DIR:'/tmp/safethrift-t39-phase-b-'+name},stdio:['ignore','pipe','pipe']});child.stdout.pipe(out);child.stderr.pipe(out);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});out.end();results.push({name,script,started,finished:new Date().toISOString(),exitCode:code,log});console.log(name+' finished: '+code);
 await writeFile(new URL('protected-regressions.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
 if(code!==0){process.exitCode=1;break;}
}
