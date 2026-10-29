import pathlib, subprocess, os, json, tempfile, time, hashlib,re
repo=pathlib.Path.cwd(); out=pathlib.Path(__file__).resolve().parent
for suite in ['registration','dashboard','loans']:
    assert json.loads((out/('browser-'+suite+'.json')).read_text())['exit_code']==0
    assert (out/('browser-'+suite)/'results.json').exists()
db='safethrift_t38_recovery_final_fetch_20261029_test'
url='postgresql://princewill@127.0.0.1:55439/'+db
env=dict(os.environ,NODE_ENV='test',DATABASE_URL=url,T38_TEST_DATABASE_URL=url)
def run(name,args):
    r=subprocess.run(args,env=env,capture_output=True,text=True)
    (out/(name+'.log.txt')).write_text((r.stdout+r.stderr).replace(url,'[isolated diagnostic database]'))
    assert r.returncode==0,(name,r.returncode)
    return r
run('fetch-createdb',['createdb','-h','127.0.0.1','-p','55439',db])
run('fetch-migrations',['pnpm','--filter','@safethrift/prisma','migrate:deploy'])
run('fetch-t36-install',['pnpm','--filter','@safethrift/api','jobs:migrate'])
run('fetch-t38-install',['pnpm','--filter','@safethrift/api','payments:jobs:migrate'])
source=(repo/'apps/api/test/payment-webhooks.integration.test.mjs').read_text()
assert hashlib.sha256(source.encode()).hexdigest()=='9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a'
root=pathlib.Path(tempfile.mkdtemp(prefix='t38-final-fetch-diagnostic-'))
(root/'node_modules').symlink_to(repo/'apps/api/node_modules',target_is_directory=True)
(root/'dist').symlink_to(repo/'apps/api/dist',target_is_directory=True); (root/'test').mkdir()
marker="        assert.equal(leased.id, row.jobId);"
assert source.count(marker)==1
source=source.replace(marker,"        t.diagnostic(`Injected fetch target: ${JSON.stringify({jobId:leased.id,eventId:row.id,state:leased.state,retryCount:leased.retryCount})}`);\n        throw new Error('DELIBERATE_AFTER_MANUAL_FETCH_FAILURE');\n"+marker)
marker="        const [leased] = await jobs.boss.fetch(PAYMENT_QUEUES.events, {"
assert source.count(marker)==1
source=source.replace(marker,"        const unrelatedId = await jobs.boss.send(PAYMENT_QUEUES.events, { diagnostic: 'unrelated-retain' }, { startAfter: new Date(Date.now() + 86400000) });\n        t.diagnostic(`Unrelated diagnostic job: ${unrelatedId}`);\n"+marker)
source=source.replace("      const cleanup = async (label, fn) => {", "      const cleanup = async (label, fn) => {\n        t.diagnostic(`DIAGNOSTIC_CLEANUP_ATTEMPT: ${label}`);")
source=source.replace("          await bounded(label, fn, 5000);", "          await bounded(label, fn, 5000);\n          t.diagnostic(`DIAGNOSTIC_CLEANUP_SUCCESS: ${label}`);")
source=source.replace("if (jobs) await jobs.stop();","if (jobs) { await jobs.stop(); console.log('DIAGNOSTIC_JOBS_STOPPED'); }")
titles=['retains exhausted processing in review and dead-letter storage without infinite requeues','preserves identity collisions for review and prevents conflicting reprocessing','rejects cross-scope evidence at the database boundary and preserves all non-T38 rows']
for title in titles:
    marker="it('"+title+"', async () => {";assert marker in source
    source=source.replace(marker,marker+"\n      console.log('FORBIDDEN_SUBSEQUENT_BODY_EXECUTED');")
f=root/'test/fetch-diagnostic.mjs';f.write_text(source)
(out/'fetch-diagnostic-source.mjs.txt').write_text(source)
args=['node','--test','--test-name-pattern=persists worker failure|retains exhausted|preserves identity collisions|rejects cross-scope',str(f)]
r=subprocess.run(args,env=env,capture_output=True,text=True)
log=r.stdout+r.stderr;(out/'fetch-diagnostic.log.txt').write_text(log)
def state():
    sql="SELECT json_build_object('sessions',(SELECT coalesce(json_agg(row_to_json(s)),'[]') FROM (SELECT pid,application_name,state FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())s),'jobs',(SELECT coalesce(json_agg(row_to_json(j)),'[]') FROM (SELECT id,name,state,data,retry_count FROM t38_jobs.job ORDER BY id)j),'events',(SELECT coalesce(json_agg(row_to_json(e)),'[]') FROM (SELECT id,status,\"jobId\" FROM payment_webhook_events ORDER BY id)e),'observations',(SELECT count(*) FROM payment_observations))"
    q=subprocess.run(['psql',url,'-XAt','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,text=True,check=True)
    return json.loads(q.stdout)
first=state();(out/'fetch-state-immediate.json').write_text(json.dumps(first,indent=2));time.sleep(3)
later=state();(out/'fetch-state-delayed.json').write_text(json.dumps(later,indent=2))
latch_sections=[log.split('# Subtest: '+title,1)[1].split('# Subtest:',1)[0] if '# Subtest: '+title in log else '' for title in titles]
checks=dict(expected_nonzero=r.returncode!=0,original_failure="error: 'DELIBERATE_AFTER_MANUAL_FETCH_FAILURE'" in log,active_diagnosed='Recovery target retains an active lease' in log,latch_blocks=all('Prior fixture cleanup failed; stop verification and preserve evidence' in section and "failureType: 'hookFailed'" in section for section in latch_sections),no_subsequent_bodies='FORBIDDEN_SUBSEQUENT_BODY_EXECUTED' not in log,worker_stop_attempt='DIAGNOSTIC_CLEANUP_ATTEMPT: stop owned worker' in log,monitor_stop_attempt='DIAGNOSTIC_CLEANUP_ATTEMPT: stop local monitor' in log,worker_cleanup_success='DIAGNOSTIC_CLEANUP_SUCCESS: stop owned worker' in log,monitor_stopped='DIAGNOSTIC_CLEANUP_SUCCESS: stop local monitor' in log,jobs_stopped='DIAGNOSTIC_JOBS_STOPPED' in log,no_cancellation='Cancelling owned fixture job' not in log,active_retained=sum(j['state']=='active' and j['name']=='t38-evidence' and j['retry_count']==0 for j in later['jobs'])==1,unrelated_retained=any(j['name']=='t38-evidence' and j['state']=='created' and j['data']=={'diagnostic':'unrelated-retain'} for j in later['jobs']),no_sessions=not later['sessions'],stable_window=first==later,no_observations=later['observations']==0)
(out/'fetch-diagnostic.json').write_text(json.dumps(dict(command=args,database=db,source_copy=str(f),exit_code=r.returncode,window_seconds=3,checks=checks),indent=2))
print(json.dumps(checks),flush=True)
assert all(checks.values()),checks
