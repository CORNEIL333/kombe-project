import {useMemo,useState,type ReactNode} from 'react';
import {ActivityList,CapabilityNotice,DashboardBoot,DashboardShell,DataTable,Field,JsonDisclosure,MetricCard,OperatorGate,PageHeader,Panel,RemoteState,StatCard,SubmitButton,formatXaf,useHashRoute,useMutation,useRemote,type DashboardContext} from '@kombe/dashboard-core';
import {DirectionApi,type Economics,type WeeklyKpi} from './api';
const messages={app:{fr:'Direction & Analytics',en:'Direction & Analytics'}} as const;
const NAV=[{path:'/',label:'Activité de la plateforme',icon:'◫'},{path:'/pilote',label:'Pilote (C18)',icon:'◆'},{path:'/funnel',label:'Funnel',icon:'↘'},{path:'/cohorts',label:'Cohortes',icon:'◎'},{path:'/economics',label:'Économie unitaire',icon:'¤'},{path:'/risks',label:'Risques',icon:'!'},{path:'/gates',label:'Gates d’extension',icon:'◆'}] as const;
function PilotOverview({api}:{api:DirectionApi}){
  const r=useRemote(s=>api.risks(s),[api],{isEmpty:d=>d.length===0});
  const g=useRemote(s=>api.extensionCheck(s),[api]);
  return <><PageHeader title="Pilotage KÓMBE" description="Mesures agrégées/pseudonymisées C18 uniquement — aucun champ financier individuel, aucun chiffre de plateforme fabriqué tant que son contrat d’agrégation n’existe pas."/>
    <div className="k-grid">
      <div className="k-span-12">
        <div className="k-stats">
          <RemoteState state={g.state} onRetry={g.reload}>{d=>{
            const allowed=(d as {extensionAllowed?:boolean}).extensionAllowed;
            const critical=(d as {criticalWithoutControl?:readonly string[]}).criticalWithoutControl??[];
            return <>
              <StatCard icon="◆" label="Extension pilote" value={allowed?'Autorisée':'Bloquée'} tone={allowed?'ok':'danger'}/>
              <StatCard icon="!" label="Risques critiques sans contrôle" value={String(critical.length)} tone={critical.length>0?'danger':'ok'}/>
            </>;
          }}</RemoteState>
          <RemoteState state={r.state} onRetry={r.reload} emptyTitle="Aucun risque retourné">{d=>
            <StatCard icon="▦" label="Risques enregistrés" value={String(d.length)}/>
          }</RemoteState>
        </div>
      </div>
      <div className="k-span-12">
        <Panel>
          <RemoteState state={r.state} onRetry={r.reload} emptyTitle="Aucun risque retourné">{rows=>
            <ActivityList title="Registre des risques" empty="Aucun risque enregistré." items={rows.map((row,i)=>{
              const x=row as {riskId?:unknown;severity?:unknown;control?:unknown};
              return {id:String(x.riskId??i),text:`${String(x.riskId??'—')} — sévérité ${String(x.severity??'—')}`,meta:x.control?'Contrôlé':'Sans contrôle',tone:x.control?'ok':x.severity==='critique'?'danger':'warn'};
            })}/>
          }</RemoteState>
        </Panel>
      </div>
    </div>
  </>;
}
function FunnelPage({api}:{api:DirectionApi}){const[id,setId]=useState('');const[gid,setGid]=useState('');const[selected,setSelected]=useState('');const[selGroup,setSelGroup]=useState('');const q=useRemote(s=>api.funnel(selected,selGroup,s),[api,selected,selGroup],{enabled:!!selected&&!!selGroup});return <><PageHeader title="Funnel d’adoption" description="Comptes agrégés ; individualFinancialFields doit rester 0. En mode réel, le groupe porteur scope la lecture (RLS)."/><Panel><form onSubmit={e=>{e.preventDefault();setSelected(id.trim());setSelGroup(gid.trim())}}><Field label="Cohort ID" inputProps={{value:id,onChange:e=>setId(e.target.value),required:true}}/><Field label="Group ID" inputProps={{value:gid,onChange:e=>setGid(e.target.value),required:true}}/><button className="k-button k-button-primary">Charger</button></form></Panel><div style={{height:16}}/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><><div className="k-metrics"><MetricCard label="Champs financiers individuels" value={String(d.individualFinancialFields)} hint="Garde structurelle : 0"/></div><DataTable rows={d.steps} rowKey={r=>r.step} columns={[{header:'Étape',render:r=>r.step},{header:'Compte',render:r=>String(r.count)}]}/></>}</RemoteState></Panel></>}
function Cohorts({api}:{api:DirectionApi}){const[id,setId]=useState('');const[selected,setSelected]=useState('');const q=useRemote(s=>api.cohort(selected,s),[api,selected],{enabled:!!selected});return <><PageHeader title="Cohortes" description="Un cycle correspond à une rotation complète."/><Panel><form onSubmit={e=>{e.preventDefault();setSelected(id.trim())}}><Field label="Group ID" inputProps={{value:id,onChange:e=>setId(e.target.value),required:true}}/><button className="k-button k-button-primary">Consulter</button></form></Panel><div style={{height:16}}/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><div className="k-metrics"><MetricCard label="Membres" value={String(d.memberCount)}/><MetricCard label="Tours terminés" value={String(d.roundsCompleted)}/><MetricCard label="Cycles complets" value={String(d.completedCycles)}/><MetricCard label="Rétention 3 cycles" value={d.eligibleThreeCycleRetention?'Éligible':'Non éligible'}/></div>}</RemoteState></Panel></>}
function EconomicsResult({data}:{data:Economics}){return <><div className="k-metrics" style={{marginTop:20}}><MetricCard label="Payeurs réels" value={String(data.realPayers)}/><MetricCard label="Taux réel" value={`${data.paymentRealPercent}%`}/><MetricCard label="Coût total" value={formatXaf(data.totalCostMinor)}/><MetricCard label="Gate G2" value={data.gateG2Met?'Atteinte':'Non atteinte'}/></div><JsonDisclosure value={data}/></>}
function EconomicsPage({api}:{api:DirectionApi}){const[form,setForm]=useState({exposedMembers:'',paidCount:'',promisedCount:'',supportMinutes:'',supportCostPerMinuteMinor:'',infrastructureCostMinor:'',cancellations:'',taxesMinor:''});const update=(k:keyof typeof form,v:string)=>setForm(f=>({...f,[k]:v}));const m=useMutation(()=>api.createEconomics(Object.fromEntries(Object.entries(form).map(([k,v])=>[k,k.endsWith('Minor')?v:Number(v)]))));return <><PageHeader title="Économie unitaire" description="Les coûts XAF restent des entiers ; le serveur calcule le snapshot."/><Panel><form onSubmit={e=>{e.preventDefault();m.run(undefined)}} className="k-grid">{Object.entries(form).map(([k,v])=><div className="k-span-4" key={k}><Field label={k} inputProps={{value:v,onChange:e=>update(k as keyof typeof form,e.target.value),required:true,inputMode:'numeric'}}/></div>)}<div className="k-span-12"><SubmitButton busy={m.state.kind==='submitting'}>Calculer et enregistrer côté serveur</SubmitButton></div></form>{m.state.kind==='success'&&<EconomicsResult data={m.state.data}/>}</Panel></>}
function Risks({api}:{api:DirectionApi}){const q=useRemote(s=>api.risks(s),[api],{isEmpty:d=>d.length===0});return <><PageHeader title="Registre des risques" description="Les risques critiques sans contrôle effectif bloquent l’extension."/><Panel><RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucun risque retourné">{rows=><DataTable rows={rows} rowKey={(_,i)=>String(i)} columns={[{header:'Risque',render:r=><JsonDisclosure value={r}/>} ]}/>}</RemoteState></Panel></>}
function Gates({api}:{api:DirectionApi}){const q=useRemote(s=>api.extensionCheck(s),[api]);return <><PageHeader title="Gates d’extension" description="Décision serveur uniquement ; aucun verdict local n’est fabriqué."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><JsonDisclosure value={d}/>}</RemoteState></Panel></>}
export function sommeXaf(xs:readonly string[]):string{return xs.reduce((a,x)=>a+BigInt(/^\d+$/.test(x)?x:'0'),0n).toString()}
export function tauxConfirmation(k:readonly WeeklyKpi[]):number|null{const d=k.reduce((a,x)=>a+x.movementsDeclared,0);const c=k.reduce((a,x)=>a+x.movementsConfirmed,0);return d===0?null:Math.round(Math.min(100,(c*100)/d))}
function Barres({valeurs,libelle}:{valeurs:readonly number[];libelle:string}){const max=Math.max(1,...valeurs);return <figure aria-label={libelle} style={{margin:0}}><div className="k-bars">{valeurs.map((v,i)=><div key={i} className="k-bar" data-zero={v===0?'true':'false'} style={{height:`${Math.max(2,(v/max)*100)}%`}} title={String(v)}/>)}</div><figcaption className="k-bars-legend"><span>il y a {valeurs.length} sem.</span><span>{libelle}</span><span>cette semaine</span></figcaption></figure>}
function Activite({api}:{api:DirectionApi}){
  const[weeks,setWeeks]=useState(12);
  const k=useRemote(s=>api.kpis(weeks,s),[api,weeks],{isEmpty:()=>false});
  const o=useRemote(s=>api.overview(s),[api],{isEmpty:()=>false});
  return <><PageHeader title="Activité de la plateforme" description="Indicateurs calculés en base sur l’activité réelle des groupes. Les montants sont des totaux DÉCLARÉS et CONFIRMÉS par les trésoriers : KÓMBE ne détient aucun argent." actions={<select className="k-select-group" value={weeks} onChange={e=>setWeeks(Number(e.target.value))} aria-label="Période"><option value={4}>4 semaines</option><option value={12}>12 semaines</option><option value={26}>26 semaines</option><option value={52}>52 semaines</option></select>}/>
    <RemoteState state={k.state} onRetry={k.reload}>{rows=>{
      const taux=tauxConfirmation(rows);
      const med=rows.map(r=>r.medianConfirmHours).filter((x):x is number=>x!==null);
      return <div className="k-grid">
        <div className="k-span-12"><div className="k-stats">
          <RemoteState state={o.state} onRetry={o.reload}>{ov=><>
            <StatCard icon="◎" label="Groupes en cours" value={String(ov.groupsByState.active??0)} hint={`${Object.values(ov.groupsByState).reduce((a,b)=>a+b,0)} au total`}/>
            <StatCard icon="◉" label="Adhésions actives" value={String(ov.membershipsActive)} hint={`${ov.identities} comptes`}/>
          </>}</RemoteState>
          <StatCard icon="✓" label="Taux de confirmation" value={taux===null?'—':`${taux} %`} hint={`cotisations confirmées / déclarées (${weeks} sem.)`} tone={taux!==null&&taux<70?'warn':'ok'}/>
          <StatCard icon="⏱" label="Délai médian de confirmation" value={med.length?`${med[med.length-1]} h`:'—'} hint="dernière semaine avec des confirmations"/>
          <StatCard icon="¤" label="Cotisations confirmées" value={formatXaf(sommeXaf(rows.map(r=>r.amountConfirmed)))} hint={`déclarées : ${formatXaf(sommeXaf(rows.map(r=>r.amountDeclared)))}`}/>
        </div></div>
        <div className="k-span-6"><Panel title="Nouveaux groupes par semaine"><Barres valeurs={rows.map(r=>r.groupsCreated)} libelle="groupes créés"/></Panel></div>
        <div className="k-span-6"><Panel title="Nouveaux comptes par semaine"><Barres valeurs={rows.map(r=>r.identitiesCreated)} libelle="comptes"/></Panel></div>
        <div className="k-span-6"><Panel title="Cotisations déclarées par semaine"><Barres valeurs={rows.map(r=>r.movementsDeclared)} libelle="déclarations"/></Panel></div>
        <div className="k-span-6"><Panel title="Séances closes par semaine"><Barres valeurs={rows.map(r=>r.meetingsClosed)} libelle="séances"/></Panel></div>
        <div className="k-span-12"><Panel title="Détail hebdomadaire"><DataTable rows={[...rows].reverse()} rowKey={r=>r.weekStart} caption="Indicateurs hebdomadaires" columns={[
          {header:'Semaine du',render:r=>r.weekStart},{header:'Groupes',render:r=>String(r.groupsCreated)},{header:'Comptes',render:r=>String(r.identitiesCreated)},{header:'Admissions',render:r=>String(r.membersAdmitted)},
          {header:'Déclarées',render:r=>String(r.movementsDeclared)},{header:'Confirmées',render:r=>String(r.movementsConfirmed)},{header:'Montant confirmé',render:r=>formatXaf(r.amountConfirmed)},
          {header:'Remises reçues',render:r=>String(r.payoutsReceived)},{header:'Séances closes',render:r=>String(r.meetingsClosed)},{header:'Médiane (h)',render:r=>r.medianConfirmHours===null?'—':String(r.medianConfirmHours)}]}/></Panel></div>
      </div>;
    }}</RemoteState>
  </>;
}
function Console({ctx}:{ctx:DashboardContext}){const api=useMemo(()=>new DirectionApi(ctx.api),[ctx.api]);const{path,navigate}=useHashRoute();let page:ReactNode;switch(path){case'/pilote':page=<PilotOverview api={api}/>;break;case'/funnel':page=<FunnelPage api={api}/>;break;case'/cohorts':page=<Cohorts api={api}/>;break;case'/economics':page=<EconomicsPage api={api}/>;break;case'/risks':page=<Risks api={api}/>;break;case'/gates':page=<Gates api={api}/>;break;default:page=<Activite api={api}/>;}const badge=<span className="k-hint">{ctx.session.phase.kind==='authenticated'?ctx.session.phase.identityId:''} <button type="button" className="k-button k-button-secondary" onClick={ctx.session.logout}>Se déconnecter</button></span>;return <DashboardShell product="Direction & Analytics" nav={NAV} activePath={path} onNavigate={navigate} userBadge={badge} {...(ctx.config.environment?{environment:ctx.config.environment}:{})}><OperatorGate api={ctx.api}>{page}</OperatorGate></DashboardShell>}
export function App(){return <DashboardBoot product="Direction & Analytics" messages={messages}>{ctx=><Console ctx={ctx}/>}</DashboardBoot>}
