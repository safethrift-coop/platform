import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {writeFile} from 'node:fs/promises';
const results=[];
for(const task of ['typecheck','lint','build']){
 const log='/tmp/safethrift-t39-final-polish-'+task+'.log';const stream=createWriteStream(log);console.log('Starting '+task);const started=new Date().toISOString();
 const child=spawn('pnpm',['--filter','@safethrift/web',task],{stdio:['ignore','pipe','pipe']});child.stdout.pipe(stream);child.stderr.pipe(stream);
 const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});stream.end();results.push({command:'pnpm --filter @safethrift/web '+task,exitCode,started,finished:new Date().toISOString(),log});console.log(task+': '+exitCode);await writeFile(new URL('static-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');if(exitCode!==0){process.exitCode=exitCode;break;}
}
