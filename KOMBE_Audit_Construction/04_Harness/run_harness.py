"""Pilote des adaptateurs autorisés ; jamais de shell, jamais de succès sur absence."""
import argparse,json,subprocess,sys,hashlib
from pathlib import Path
from datetime import datetime,timezone

def strict_equal(actual,expected):
    return type(actual) is type(expected) and actual==expected

def check(observations,expected):
    return [key for key,value in expected.items() if key not in observations or not strict_equal(observations[key],value)]

def main():
    p=argparse.ArgumentParser()
    for k in ['config','suite','commit','out']:p.add_argument('--'+k,required=True)
    p.add_argument('--gate',choices=['G0','G1','G2','G3','V2'],default='G0')
    args=p.parse_args(); results=[]
    try:
        cp=Path(args.config).resolve(); config=json.loads(cp.read_text()); suite_path=Path(args.suite).resolve()
        suite=json.loads(suite_path.read_text()); cases=[x for x in suite if x['gate']==args.gate]
        command=config['command']
        if not cases or not isinstance(command,list) or not command or any(not isinstance(x,str) for x in command):raise ValueError()
        timeout=config.get('timeout_seconds',90)
        if type(timeout) not in (int,float) or not 0<timeout<=900:raise ValueError()
        if len({x['id'] for x in cases})!=len(cases):raise ValueError()
    except (OSError,ValueError,KeyError,TypeError):
        print('BLOCKED: configuration ou suite invalide');return 2
    for case in cases:
        request={k:v for k,v in case.items() if k!='expected'}
        request['commit']=args.commit
        status='BLOCKED'; failed=[]; reason=None
        try:
            proc=subprocess.run(command,input=json.dumps(request),text=True,capture_output=True,cwd=cp.parent,timeout=timeout,check=False)
            if proc.returncode==2:reason='adapter_not_ready'
            elif proc.returncode!=0:status='FAIL';reason='adapter_failed'
            else:
                answer=json.loads(proc.stdout)
                if answer.get('target')!='application' or answer.get('scenario_id')!=case['id'] or answer.get('commit')!=args.commit:
                    reason='target_or_identity_mismatch'
                elif not isinstance(answer.get('observations'),dict):reason='missing_observations'
                else:
                    failed=check(answer['observations'],case['expected']);status='FAIL' if failed else 'PASS'
        except subprocess.TimeoutExpired:status='FAIL';reason='timeout'
        except (OSError,ValueError,TypeError,AttributeError):reason='adapter_protocol_error'
        results.append({'id':case['id'],'status':status,'failed_assertions':failed,'reason':reason})
    overall='FAIL' if any(r['status']=='FAIL' for r in results) else 'BLOCKED' if any(r['status']=='BLOCKED' for r in results) else 'PASS'
    report={'target':'application','commit':args.commit,'gate':args.gate,'suite_sha256':hashlib.sha256(suite_path.read_bytes()).hexdigest(),'at_utc':datetime.now(timezone.utc).isoformat(),'status':overall,'results':results}
    out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(f'{overall}: {len(results)} scénarios, rapport {out}')
    return {'PASS':0,'FAIL':1,'BLOCKED':2}[overall]
if __name__=='__main__':sys.exit(main())
