import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
const exec=promisify(execFile);const out={};
for(const name of ['safethrift-t39-phase-b-postgres','safethrift-t39-phase-b-redis']){
 const inspected=JSON.parse((await exec('docker',['inspect',name])).stdout)[0];
 if(inspected.Config.Labels?.['safethrift.task']!=='t39-phase-b')throw Error('Refusing unrelated container');
 if(name.endsWith('postgres'))out.database=JSON.parse((await exec('docker',['exec',name,'psql','-U','t39_test','-d','safethrift_t39_phase_b_test','-Atc',"SELECT json_build_object('database',current_database(),'migrations',(SELECT count(*) FROM _prisma_migrations),'members',(SELECT count(*) FROM members),'accounts',(SELECT count(*) FROM member_accounts),'savingsTransactions',(SELECT count(*) FROM savings_transactions),'loans',(SELECT count(*) FROM loans),'otherSessions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()));"])).stdout);
 else out.redisKeys=Number((await exec('docker',['exec',name,'redis-cli','DBSIZE'])).stdout.trim());
 await exec('docker',['stop',name]);const state=JSON.parse((await exec('docker',['inspect',name])).stdout)[0].State;
 out[name]={status:state.Status,running:state.Running,retained:true};
}
await writeFile(new URL('test-service-cleanup.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
