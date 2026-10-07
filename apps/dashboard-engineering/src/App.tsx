import {useEffect,useState,type ReactNode} from 'react';
import {ActivityList,CapabilityNotice,DashboardShell,DataTable,JsonDisclosure,LocaleProvider,MetricCard,PageHeader,Panel,RemoteState,StatCard,StatusChip,loadRuntimeConfig,safeText,useHashRoute,useRemote} from '@kombe/dashboard-core';
import {EngineeringApi} from './api';
const messages={app:{fr:'Engineering',en:'Engineering'}} as const;
const NAV=[{path:'/',label:'Vue d’ensemble',icon:'◫'},{path:'/lots',label:'Lots C00–C29',icon:'▦'},{path:'/h00',label:'G-CONSTRUCTION',icon:'◆'},{path:'/ci',label:'CI / workflows',icon:'⚙'},{path:'/migrations',label:'Migrations DB',icon:'▤'},{path:'/evidence',label:'Preuves',icon:'✓'},{path:'/repo',label:'Provenance dépôt',icon:'⌁'}] as const;
function h00Tone(status:unknown):'ok'|'warn'|'danger'{return status==='PASS'?'ok':status==='BLOCKED'?'warn':'danger'}
function Overview({api}:{api:EngineeringApi}){
  const r=useRemote(s=>api.repo(s),[api]);
  const h=useRemote(s=>api.h00(s),[api]);
  const l=useRemote(s=>api.lots(s),[api],{isEmpty:d=>d.lots.length===0});
  return <><PageHeader title="KÓMBE Engineering" description="État observé directement dans le dépôt local (git, rapport H00, registre des lots). Aucune métrique CI n’est simulée."/>
    <div className="k-grid">
      <div className="k-span-12">
        <div className="k-stats">
          <RemoteState state={r.state} onRetry={r.reload}>{d=>
            <StatCard icon="⌁" label="Branche" value={d.branch||'—'} tone={d.dirty?'warn':'ok'} hint={d.dirty?'Working tree modifié':'Working tree propre'}/>
          }</RemoteState>
          <RemoteState state={h.state} onRetry={h.reload}>{d=>{
            const counts=(d as {counts?:{PASS?:number;FAIL?:number;BLOCKED?:number;NOT_RUN?:number}}).counts;
            const status=(d as {status?:unknown}).status;
            return <>
              <StatCard icon="◆" label="G-CONSTRUCTION" value={String(status??'—')} tone={h00Tone(status)}/>
              <StatCard icon="✓" label="Preuves H00" value={`${counts?.PASS??0} PASS`} tone={(counts?.FAIL??0)>0?'danger':'ok'} hint={`${counts?.BLOCKED??0} bloquées · ${counts?.FAIL??0} échouées`}/>
            </>;
          }}</RemoteState>
          <RemoteState state={l.state} onRetry={l.reload}>{d=>{
            const total=d.lots.length;
            const done=d.lots.filter(x=>x.status==='done').length;
            return <StatCard icon="▦" label="Lots de construction" value={`${done}/${total}`} hint="Statut done / total (ETATS_LOTS.json)"/>;
          }}</RemoteState>
        </div>
      </div>
      <div className="k-span-7">
        <Panel title="Dernier rapport H00 (détail)">
          <RemoteState state={h.state} onRetry={h.reload}>{d=><JsonDisclosure value={d}/>}</RemoteState>
        </Panel>
      </div>
      <div className="k-span-5">
        <Panel>
          <RemoteState state={l.state} onRetry={l.reload} emptyTitle="Aucun lot">{d=>
            <ActivityList title="Lots récents" empty="Aucun lot." items={d.lots.slice(0,8).map((r,i)=>({id:String(r.lot??i),text:`${safeText(r.lot)} — ${safeText(r.mission)}`,meta:safeText(r.status),tone:r.status==='done'?'ok':r.status==='blocked'?'danger':r.status==='in_review'?'warn':'neutral'}))}/>
          }</RemoteState>
        </Panel>
      </div>
    </div>
  </>;
}
function Lots({api}:{api:EngineeringApi}){const q=useRemote(s=>api.lots(s),[api],{isEmpty:d=>d.lots.length===0});return <><PageHeader title="Lots de construction" description="Source : COORDINATION_MULTI_HARNESS/ETATS_LOTS.json."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><DataTable rows={d.lots} rowKey={(r,i)=>String(r.lot??i)} columns={[{header:'Lot',render:r=>safeText(r.lot)},{header:'Mission',render:r=>safeText(r.mission)},{header:'Statut',render:r=><StatusChip status={safeText(r.status)} tone={r.status==='done'?'ok':r.status==='blocked'?'danger':r.status==='in_review'?'warn':'neutral'}/>},{header:'Owner',render:r=>safeText(r.owner_harness_id)}]}/>}</RemoteState></Panel></>}
function H00({api}:{api:EngineeringApi}){const q=useRemote(s=>api.h00(s),[api]);return <><PageHeader title="G-CONSTRUCTION / H00" description="Rapport réellement présent dans harness/reports."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><JsonDisclosure value={d}/>}</RemoteState></Panel></>}
function Files({api,title,kind}:{api:EngineeringApi;title:string;kind:'migrations'|'evidence'|'workflows'}){const q=useRemote(s=>api[kind](s),[api,kind],{isEmpty:d=>d.files.length===0});return <><PageHeader title={title} description="Inventaire lu sur disque depuis le dépôt configuré."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><DataTable rows={d.files} rowKey={x=>x} columns={[{header:'Fichier',render:x=><code>{x}</code>} ]}/>}</RemoteState></Panel></>}
function Repo({api}:{api:EngineeringApi}){const q=useRemote(s=>api.repo(s),[api]);return <><PageHeader title="Provenance dépôt" description="HEAD, branche et état de travail issus de commandes git à arguments fixes."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><JsonDisclosure value={d}/>}</RemoteState></Panel></>}
function Dashboard({api}:{api:EngineeringApi}){const{path,navigate}=useHashRoute();let page:ReactNode;switch(path){case'/lots':page=<Lots api={api}/>;break;case'/h00':page=<H00 api={api}/>;break;case'/ci':page=<Files api={api} title="CI / workflows" kind="workflows"/>;break;case'/migrations':page=<Files api={api} title="Migrations PostgreSQL" kind="migrations"/>;break;case'/evidence':page=<Files api={api} title="Preuves Cxx" kind="evidence"/>;break;case'/repo':page=<Repo api={api}/>;break;default:page=<Overview api={api}/>;}return <DashboardShell product="Engineering" nav={NAV} activePath={path} onNavigate={navigate} environment="local/repo">{page}</DashboardShell>}
export function App(){const[api,setApi]=useState<EngineeringApi|null>(null);const[error,setError]=useState<unknown>(null);useEffect(()=>{loadRuntimeConfig().then(c=>setApi(new EngineeringApi(c.engineeringGatewayBaseUrl??'http://127.0.0.1:4399'))).catch(setError)},[]);if(error)return <main><CapabilityNotice title="Configuration invalide">{error instanceof Error?error.message:String(error)}</CapabilityNotice></main>;if(!api)return <main><div className="k-skeleton-stack"><span className="k-skeleton"/></div></main>;return <LocaleProvider messages={messages}><Dashboard api={api}/></LocaleProvider>}
