import pathlib,subprocess,os,json,time,socket,hashlib
out=pathlib.Path(__file__).resolve().parent
db='safethrift_browser_final_20261029_test'
url='postgresql://princewill@127.0.0.1:55439/'+db
env=dict(os.environ,NODE_ENV='test',DATABASE_URL=url,T40_TEST_DATABASE_URL=url,T41_TEST_DATABASE_URL=url,T42_TEST_DATABASE_URL=url,AUTH_TEST_REDIS_URL='redis://127.0.0.1:56442',REDIS_HOST='127.0.0.1',REDIS_PORT='56442',REDIS_PASSWORD='',JWT_SECRET='test_jwt_secret_minimum_32_characters',JWT_REFRESH_SECRET='test_refresh_secret_minimum_32_chars',ENCRYPTION_KEY='0'*64,RESEND_API_KEY='re_test_not_a_live_key',NEXT_TELEMETRY_DISABLED='1',T36_JOBS_ENABLED='false',T38_WEBHOOKS_ENABLED='false',T40_APPLICATIONS_ENABLED='false',SAVINGS_SIMULATION_ENABLED='false')
def run(name,args):
    start=time.monotonic();r=subprocess.run(args,env=env,capture_output=True,text=True)
    log=r.stdout+r.stderr
    (out/(name+'.log.txt')).write_text(log.replace(url,'[dedicated local test database]'))
    result=dict(command=args,exit_code=r.returncode,seconds=time.monotonic()-start)
    (out/(name+'.json')).write_text(json.dumps(result,indent=2));print(name,r.returncode,flush=True)
    assert r.returncode==0,name
    return r.stdout
def state():
    sql="SELECT json_build_object('database',current_database(),'sessions',(SELECT coalesce(json_agg(row_to_json(s)),'[]') FROM (SELECT pid,application_name,state FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())s),'t36_jobs',(SELECT count(*) FROM t36_jobs.job),'t38_jobs',(SELECT count(*) FROM t38_jobs.job),'members',(SELECT count(*) FROM members),'loans',(SELECT count(*) FROM loans),'repayments',(SELECT count(*) FROM repayment_transactions),'accounts',(SELECT count(*) FROM member_accounts),'savings',(SELECT count(*) FROM savings_transactions),'withdrawals',(SELECT count(*) FROM withdrawal_transactions),'applications',(SELECT count(*) FROM loan_applications))"
    r=subprocess.run(['psql',url,'-XAt','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)
def resources():
    ports={}
    for port in [2040,2041,2042,3040,3042]:
        with socket.socket() as s:
            s.settimeout(.2); ports[str(port)]=s.connect_ex(('127.0.0.1',port))==0
    lines=subprocess.run(['ps','-eo','pid,ppid,comm,args'],capture_output=True,text=True,check=True).stdout.splitlines()
    processes=[line for line in lines if any(x in line for x in ['tests/registration-browser.mjs','tests/dashboard-browser.mjs','tests/loans-browser.mjs','fixtures/t40-browser-server.mjs','fixtures/t41-browser-server.mjs','fixtures/t42-browser-server.mjs','safethrift-web-test-','safethrift-t40-chrome-','safethrift-t41-chrome-','safethrift-t42-chrome-'])]
    return dict(listening_ports=ports,verification_processes=processes)
run('browser-createdb',['createdb','-h','127.0.0.1','-p','55439',db])
run('browser-migrations',['pnpm','--filter','@safethrift/prisma','migrate:deploy'])
run('browser-t36-install',['pnpm','--filter','@safethrift/api','jobs:migrate'])
run('browser-t38-install',['pnpm','--filter','@safethrift/api','payments:jobs:migrate'])
initial=state();(out/'browser-preflight.json').write_text(json.dumps(initial,indent=2))
assert not initial['sessions'] and all(initial[k]==0 for k in initial if k not in ['database','sessions'])
for suite in ['registration','dashboard','loans']:
    artifacts=out/('browser-'+suite);artifacts.mkdir(exist_ok=True)
    env['TEST_ARTIFACTS_DIR']=str(artifacts)
    try:
        run('browser-'+suite,['pnpm','--filter','@safethrift/web','test:'+suite+':browser'])
    finally:
        time.sleep(1)
        post=state();res=resources()
        (out/('browser-'+suite+'-post.json')).write_text(json.dumps(dict(database=post,resources=res),indent=2))
    assert post==initial,(suite,'fixture database residue',post)
    assert not any(res['listening_ports'].values()) and not res['verification_processes'],res
    assert (artifacts/'results.json').exists()
print('ALL THREE BROWSER SUITES PASSED; CLEAN FIXTURE DATABASE AND PROCESSES',flush=True)
