import subprocess,json,os,time,pathlib,re,sys
out=pathlib.Path('docs/test-artifacts/t38-controlled-verification-2026-10-29')
url='postgresql://princewill@localhost:55439/safethrift_t38_recovery_approved_20261029_test'
def query(sql):
 r=subprocess.run(['psql',url,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,text=True,check=True)
 return json.loads(r.stdout)
def state():
 return query('''SELECT json_build_object('sessions',(SELECT coalesce(json_agg(row_to_json(s)), '[]') FROM (SELECT pid,application_name,state,query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())s),'queues',(SELECT coalesce(json_agg(row_to_json(j)), '[]') FROM (SELECT name,state,count(*) FROM t38_jobs.job GROUP BY name,state ORDER BY name,state)j),'nonterminal',(SELECT coalesce(json_agg(row_to_json(j)), '[]') FROM (SELECT id,name,state,data,retry_count FROM t38_jobs.job WHERE name='t38-evidence' AND state IN ('created','retry','active'))j),'schema',(SELECT version FROM t38_jobs.version));''')
pre=state();(out/'preflight-database.json').write_text(json.dumps(pre,indent=2))
assert pre['schema']==46 and not pre['sessions'] and not pre['queues'],pre
print('Database preflight PASS',flush=True)
env=dict(os.environ,NODE_ENV='test',T38_TEST_DATABASE_URL=url)
for n in range(1,6):
 start=time.monotonic()
 run=subprocess.run(['pnpm','--filter','@safethrift/api','test:payment-webhooks'],env=env,capture_output=True,text=True)
 elapsed=time.monotonic()-start
 log=run.stdout+run.stderr;(out/f'run-{n}.log').write_text(log)
 st=state()
 targets=re.findall(r'Recovery target: (\{[^\n]+\})',log)
 evidence=[]
 for raw in targets:
  t=json.loads(raw); jid=t['jobId']
  assert re.fullmatch(r'[0-9a-f-]+',jid)
  evidence.append(query('''SELECT row_to_json(r) FROM (SELECT e.id AS event_id,e."jobId" AS job_id,e.status AS business_status,j.state AS broker_state,j.retry_count,(SELECT count(*) FROM payment_observations o WHERE o."eventId"=e.id) AS observations FROM payment_webhook_events e JOIN t38_jobs.job j ON j.id::text=e."jobId" WHERE j.id='''+"'"+jid+"'"+''')r'''))
 record=dict(run=n,exit_code=run.returncode,duration_seconds=elapsed,target_diagnostics=targets,recovery_evidence=evidence,post_state=st)
 (out/f'run-{n}.json').write_text(json.dumps(record,indent=2))
 print(json.dumps(record),flush=True)
 if run.returncode or st['sessions'] or st['nonterminal'] or not targets:
  print('STOP: suite/teardown blocker; no subsequent run',flush=True);sys.exit(1)
 assert all(e['business_status']=='quarantined' and e['broker_state']=='completed' and e['retry_count']==2 and e['observations']==1 for e in evidence)
 # Process exited; recheck for delayed state changes/session residue before next run.
 time.sleep(1)
 later=state();(out/f'run-{n}-delayed-state.json').write_text(json.dumps(later,indent=2))
 assert later==st, 'Post-exit state changed; stop verification'
print('FIVE CLEAN NORMAL RUNS',flush=True)
