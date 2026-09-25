"""Contrôle mécanique des preuves G0 ; la revue humaine reste obligatoire."""
import argparse,json,hashlib,sys,re
from pathlib import Path
from datetime import datetime
REQUIRED=['application_report','security_review','restore_report','privacy_decision','support_roster','release_review']
def verify(manifest_path,suite_path,commit):
    if not re.fullmatch(r'[0-9a-f]{40,64}',commit):raise ValueError('SHA réel requis')
    manifest_path=Path(manifest_path).resolve();root=manifest_path.parent
    m=json.loads(manifest_path.read_text());suite_path=Path(suite_path).resolve()
    if m.get('commit')!=commit or m.get('gate')!='G0':raise ValueError('Version ou gate incorrecte')
    if not m.get('author') or not m.get('reviewer') or m['author']==m['reviewer']:raise ValueError('Revue indépendante absente')
    expected={x['id'] for x in json.loads(suite_path.read_text()) if x['gate']=='G0'}
    if not expected:raise ValueError('Suite vide')
    artifacts=m.get('artifacts',{})
    for name in REQUIRED:
        item=artifacts.get(name,{})
        if item.get('status')!='PASS' or not item.get('path'):raise ValueError('Preuve absente: '+name)
        file=(root/item['path']).resolve()
        if not file.is_relative_to(root) or not file.is_file():raise ValueError('Chemin de preuve invalide')
        if hashlib.sha256(file.read_bytes()).hexdigest()!=item.get('sha256'):raise ValueError('Empreinte invalide: '+name)
        if name=='application_report':
            report=json.loads(file.read_text());results=report.get('results',[])
            if report.get('target')!='application' or report.get('commit')!=commit or report.get('gate')!='G0' or report.get('status')!='PASS':raise ValueError('Rapport application invalide')
            if report.get('suite_sha256')!=hashlib.sha256(suite_path.read_bytes()).hexdigest():raise ValueError('Suite de recette modifiée')
            ids=[r['id'] for r in results]
            if len(ids)!=len(set(ids)) or set(ids)!=expected or any(x.get('status')!='PASS' for x in results):raise ValueError('Scénarios absents ou échoués')
            datetime.fromisoformat(report['at_utc'])
    return True
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--suite',required=True);p.add_argument('--commit',required=True);a=p.parse_args()
    try:verify(a.manifest,a.suite,a.commit)
    except (ValueError,OSError,KeyError,TypeError):print('BLOCKED: preuve G0 absente, invalide ou incohérente');sys.exit(2)
    print('PASS: contrôles mécaniques G0 ; décision humaine de mise en service toujours requise')
