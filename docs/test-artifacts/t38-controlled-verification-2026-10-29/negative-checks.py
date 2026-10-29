import pathlib,subprocess,os,json,tempfile,time
repo=pathlib.Path.cwd(); out=repo/'docs/test-artifacts/t38-controlled-verification-2026-10-29'
source=(repo/'apps/api/test/payment-webhooks.integration.test.mjs').read_text()
root=pathlib.Path(tempfile.mkdtemp(prefix='t38-negative-fixtures-'));(root/'node_modules').symlink_to(repo/'apps/api/node_modules',target_is_directory=True);(root/'dist').symlink_to(repo/'apps/api/dist',target_is_directory=True);(root/'test').mkdir()
marker="      const row = await receiveStripe(stripe());\n      const monitor = new PgBoss({"
cases={
 'unknown': "const diagnosticJobId = await jobs.boss.send(PAYMENT_QUEUES.events, { eventId: randomUUID() });",
 'scope': "const diagnosticJobId = row.jobId; ownedEvents.set(row.id, { ...ownedEvents.get(row.id), accountScope: 'acct_diagnostic_other' });",
 'payload': "const diagnosticJobId = row.jobId; await sql.query('UPDATE t38_jobs.job SET data=$2::jsonb WHERE id=$1', [row.jobId, JSON.stringify({eventId: randomUUID()})]);",
 'active': "const diagnosticJobId = row.jobId; const [diagnosticLease] = await jobs.boss.fetch(PAYMENT_QUEUES.events); assert.equal(diagnosticLease.id, row.jobId);",
}
def run(args,env=None):
 return subprocess.run(args,capture_output=True,text=True,env=env)
for name,inject in cases.items():
 db='safethrift_t38_recovery_negative_'+name+'_test';url='postgresql://princewill@localhost:55439/'+db
 r=run(['createdb','--host','localhost','--port','55439','--username','princewill',db]);assert r.returncode==0,r.stderr
 env=dict(os.environ,DATABASE_URL=url,NODE_ENV='test',T38_TEST_DATABASE_URL=url)
 for label,args in [('migrations',['pnpm','--filter','@safethrift/prisma','exec','prisma','migrate','deploy']),('jobs',['pnpm','--filter','@safethrift/api','payments:jobs:migrate'])]:
  r=run(args,env);(out/f'negative-{name}-{label}.log').write_text(r.stdout+r.stderr);assert r.returncode==0,r.stderr
 inject+='\n      const diagnosticBefore = await jobs.boss.getJobById(PAYMENT_QUEUES.events, diagnosticJobId);\n      t.diagnostic(`Diagnostic seeded: ${JSON.stringify(diagnosticBefore)}`);'
 diagnostic=source.replace(marker,"      const row = await receiveStripe(stripe());\n      "+inject+"\n      const monitor = new PgBoss({",1)
 assert diagnostic!=source
 f=root/'test'/f'negative-{name}.mjs';f.write_text(diagnostic)
 r=run(['node','--test','--test-name-pattern=persists worker failure',str(f)],env);log=r.stdout+r.stderr;(out/f'negative-{name}.log').write_text(log)
 import re
 seeded=re.search(r'Diagnostic seeded: (\{[^\n]+\})',log);assert seeded,log
 before=json.loads(seeded.group(1));jid=before['id']
 sql="SELECT row_to_json(j) FROM (SELECT id,state,data,retry_count FROM t38_jobs.job WHERE id='"+jid+"')j"
 q=run(['psql',url,'-XAt','-v','ON_ERROR_STOP=1','-c',sql]);assert q.returncode==0,q.stderr
 after=json.loads(q.stdout)
 session=run(['psql',url,'-XAt','-c',"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()"])
 expected='active leases' if name=='active' else 'unknown nonterminal jobs'
 result=dict(case=name,exit_code=r.returncode,expected_rejection=expected,diagnostic_job_id=jid,before=before,after=after,other_sessions=int(session.stdout))
 (out/f'negative-{name}.json').write_text(json.dumps(result,indent=2))
 assert r.returncode!=0 and expected in log,log
 assert after['state']==before['state'] and after['data']==before['data'] and after['retry_count']==before['retryCount'],result
 assert result['other_sessions']==0,result
 print(name+': expected rejection; diagnostic job unchanged; sessions zero',flush=True)
print('ALL FOUR ISOLATED NEGATIVE CHECKS PASSED',flush=True)
