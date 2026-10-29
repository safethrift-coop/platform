import pathlib,subprocess,os,time,json,sys
out=pathlib.Path('docs/test-artifacts/t38-controlled-verification-2026-10-29')
url='postgresql://princewill@localhost:55439/safethrift_preservation_20261029_test'
env=dict(os.environ,NODE_ENV='test',DATABASE_URL=url,T36_TEST_DATABASE_URL=url,GOVERNANCE_TEST_DATABASE_URL=url,T40_TEST_DATABASE_URL=url,T41_TEST_DATABASE_URL=url,T42_TEST_DATABASE_URL=url,SAVINGS_TEST_DATABASE_URL=url,AUTH_TEST_REDIS_URL='redis://localhost:56442',REDIS_HOST='localhost',REDIS_PORT='56442',REDIS_PASSWORD='',JWT_SECRET='test_jwt_secret_minimum_32_characters',JWT_REFRESH_SECRET='test_refresh_secret_minimum_32_chars',ENCRYPTION_KEY='0'*64,RESEND_API_KEY='re_test_not_a_live_key',NEXT_TELEMETRY_DISABLED='1')
steps=[('t36-install',['pnpm','--filter','@safethrift/api','jobs:migrate']),('t36-reminders',['pnpm','--filter','@safethrift/api','test:reminders']),('api-unit',['pnpm','--filter','@safethrift/api','test','--runInBand']),('t37-auth',['pnpm','--filter','@safethrift/api','test:e2e','--runInBand','--runTestsByPath','test/auth-security.integration.e2e-spec.ts']),('t40-registration',['pnpm','--filter','@safethrift/api','test:e2e','--runInBand','--runTestsByPath','test/registration.integration.e2e-spec.ts']),('t41-dashboard',['pnpm','--filter','@safethrift/api','test:e2e','--runInBand','--runTestsByPath','test/dashboard.integration.e2e-spec.ts']),('t42-loans',['pnpm','--filter','@safethrift/api','test:e2e','--runInBand','--runTestsByPath','test/loans.integration.e2e-spec.ts']),('api-build',['pnpm','--filter','@safethrift/api','build']),('web-tests',['pnpm','--filter','@safethrift/web','test']),('web-types',['pnpm','--filter','@safethrift/web','typecheck']),('web-lint',['pnpm','--filter','@safethrift/web','lint']),('web-build',['pnpm','--filter','@safethrift/web','build']),('web-production',['pnpm','--filter','@safethrift/web','test:production'])]
results=[]
for name,args in steps:
 start=time.monotonic();r=subprocess.run(args,env=env,capture_output=True,text=True)
 (out/f'regression-{name}.log').write_text(r.stdout+r.stderr)
 result=dict(name=name,exit_code=r.returncode,duration_seconds=time.monotonic()-start,command=args);results.append(result)
 (out/'regressions.json').write_text(json.dumps(results,indent=2))
 print(json.dumps(result),flush=True)
 if r.returncode: print('STOP: first preservation blocker',flush=True);sys.exit(1)
