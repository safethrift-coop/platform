import pathlib,subprocess,json,time,socket
out=pathlib.Path(__file__).resolve().parent
def run(name,args):
    r=subprocess.run(args,capture_output=True,text=True)
    (out/(name+'.log.txt')).write_text(r.stdout+r.stderr)
    assert r.returncode==0,(name,r.stderr)
    return r.stdout
base=['psql','-h','127.0.0.1','-p','55439','-XAt','-v','ON_ERROR_STOP=1']
names=json.loads(subprocess.run(base+['-d','postgres','-c',"SELECT json_agg(datname) FROM pg_database WHERE datname LIKE 'safethrift_%test'"],capture_output=True,text=True,check=True).stdout)
def state():
    states={}
    for db in names:
        sql="SELECT json_build_object('sessions',(SELECT coalesce(json_agg(row_to_json(s)),'[]') FROM (SELECT pid,application_name,state FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())s),'jobs',(SELECT coalesce(json_agg(row_to_json(j)),'[]') FROM (SELECT id,name,state,data,retry_count FROM t38_jobs.job ORDER BY id)j))"
        states[db]=json.loads(subprocess.run(base+['-d',db,'-c',sql],capture_output=True,text=True,check=True).stdout)
    return states
first=state();(out/'resource-immediate.json').write_text(json.dumps(first,indent=2));time.sleep(3)
later=state();(out/'resource-delayed.json').write_text(json.dumps(later,indent=2))
assert first==later
assert all(not s['sessions'] for s in later.values())
ports={}
for port in [2040,2041,2042,3040,3042]:
    with socket.socket() as s:
        s.settimeout(.2); ports[str(port)]=s.connect_ex(('127.0.0.1',port))==0
lines=subprocess.run(['ps','-eo','pid,ppid,comm,args'],capture_output=True,text=True,check=True).stdout.splitlines()
relevant=[line for line in lines if any(x in line for x in ['tests/registration-browser.mjs','tests/dashboard-browser.mjs','tests/loans-browser.mjs','fixtures/t40-browser-server.mjs','fixtures/t41-browser-server.mjs','fixtures/t42-browser-server.mjs','safethrift-web-test-','safethrift-t40-chrome-','safethrift-t41-chrome-','safethrift-t42-chrome-','test/fetch-diagnostic.mjs'])]
(out/'verification-processes.json').write_text(json.dumps(dict(ports=ports,processes=relevant),indent=2))
run('redis-stop',['docker','stop','safethrift-t38-continuation-redis'])
run('postgres-stop',['/usr/lib/postgresql/16/bin/pg_ctl','-D','/tmp/safethrift-t38-continuation-pg','stop','-m','fast'])
run('redis-final',['docker','inspect','--format','{{.State.Status}}','safethrift-t38-continuation-redis'])
(out/'postgres-server.log.txt').write_bytes(pathlib.Path('/tmp/safethrift-t38-continuation-pg/server.log').read_bytes())
checks=dict(no_sessions=all(not s['sessions'] for s in later.values()),stable_window=first==later,no_verification_processes=not relevant,no_browser_ports=not any(ports.values()),normal_databases_no_nonterminal_jobs=all(not any(j['state'] in ['created','retry','active'] for j in st['jobs']) for db,st in later.items() if db!='safethrift_t38_recovery_final_fetch_20261029_test'))
(out/'final-resource-state.json').write_text(json.dumps(dict(checks=checks,window_seconds=3,databases=names,postgres_stopped=True,redis_stopped=True,retained_data_directory='/tmp/safethrift-t38-continuation-pg'),indent=2))
assert all(checks.values()),checks
print(json.dumps(checks),flush=True)
