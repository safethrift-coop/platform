import pathlib,subprocess,json,time
out=pathlib.Path(__file__).resolve().parent
url='postgresql://princewill@127.0.0.1:55439/safethrift_preservation_continuation_20261029_test'
query="SELECT json_build_object('sessions',(SELECT coalesce(json_agg(row_to_json(s)),'[]') FROM (SELECT pid,application_name,state FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())s),'t36_jobs',(SELECT count(*) FROM t36_jobs.job),'t38_jobs',(SELECT count(*) FROM t38_jobs.job),'members',(SELECT count(*) FROM members),'loans',(SELECT count(*) FROM loans),'repayments',(SELECT count(*) FROM repayment_transactions))"
def run(name,args):
    r=subprocess.run(args,capture_output=True,text=True)
    (out/(name+'.log.txt')).write_text(r.stdout+r.stderr)
    assert r.returncode==0,(name,r.stderr)
    return r.stdout
first=json.loads(run('resource-immediate',['psql',url,'-XAt','-v','ON_ERROR_STOP=1','-c',query]));time.sleep(3)
later=json.loads(run('resource-delayed',['psql',url,'-XAt','-v','ON_ERROR_STOP=1','-c',query]))
assert first==later and not later['sessions']
processes=subprocess.run(['ps','-eo','pid,ppid,comm,args'],capture_output=True,text=True,check=True).stdout
(out/'relevant-processes.log.txt').write_text('\n'.join(line for line in processes.splitlines() if any(s in line for s in ['safethrift','registration-browser','dashboard-browser','loans-browser','next-server','t40-browser-server','t41-browser-server','t42-browser-server'])))
run('redis-stop',['docker','stop','safethrift-t38-continuation-redis'])
run('postgres-stop',['/usr/lib/postgresql/16/bin/pg_ctl','-D','/tmp/safethrift-t38-continuation-pg','stop','-m','fast'])
run('redis-final',['docker','inspect','--format','{{.State.Status}}','safethrift-t38-continuation-redis'])
(out/'postgres-server.log.txt').write_bytes(pathlib.Path('/tmp/safethrift-t38-continuation-pg/server.log').read_bytes())
(out/'final-resource-state.json').write_text(json.dumps(dict(immediate=first,delayed=later,verification_window_seconds=3,postgres_stopped=True,redis_stopped=True,data_directory='/tmp/safethrift-t38-continuation-pg',database=url,diagnostic_database='NOT CREATED: stopped at T40 browser setup failure'),indent=2))
print('Final resource checks recorded; temporary PostgreSQL and Redis stopped.')
