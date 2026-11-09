import {ActivityList,ApiClient,DataTable,JsonDisclosure,KeyValue,PageHeader,Panel,RemoteState,StatCard,StatusChip,formatServerDate,safeText,useRemote} from '@kombe/dashboard-core';
import {EngineeringApi} from './api';
export {EngineeringApi};
export {Integration} from './Integration';
function h00Tone(status:unknown):'ok'|'warn'|'danger'{return status==='PASS'?'ok':status==='BLOCKED'?'warn':'danger'}
export function RepoOverview({api}:{api:EngineeringApi}){
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
export function Lots({api}:{api:EngineeringApi}){const q=useRemote(s=>api.lots(s),[api],{isEmpty:d=>d.lots.length===0});return <><PageHeader title="Lots de construction" description="Source : COORDINATION_MULTI_HARNESS/ETATS_LOTS.json."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><DataTable rows={d.lots} rowKey={(r,i)=>String(r.lot??i)} columns={[{header:'Lot',render:r=>safeText(r.lot)},{header:'Mission',render:r=>safeText(r.mission)},{header:'Statut',render:r=><StatusChip status={safeText(r.status)} tone={r.status==='done'?'ok':r.status==='blocked'?'danger':r.status==='in_review'?'warn':'neutral'}/>},{header:'Owner',render:r=>safeText(r.owner_harness_id)}]}/>}</RemoteState></Panel></>}
export function H00({api}:{api:EngineeringApi}){const q=useRemote(s=>api.h00(s),[api]);return <><PageHeader title="G-CONSTRUCTION / H00" description="Rapport réellement présent dans harness/reports."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><JsonDisclosure value={d}/>}</RemoteState></Panel></>}
export function Files({api,title,kind}:{api:EngineeringApi;title:string;kind:'migrations'|'evidence'|'workflows'}){const q=useRemote(s=>api[kind](s),[api,kind],{isEmpty:d=>d.files.length===0});return <><PageHeader title={title} description="Inventaire lu sur disque depuis le dépôt configuré (passerelle locale)."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><DataTable rows={d.files} rowKey={x=>x} columns={[{header:'Fichier',render:x=><code>{x}</code>} ]}/>}</RemoteState></Panel></>}
export function Repo({api}:{api:EngineeringApi}){const q=useRemote(s=>api.repo(s),[api]);return <><PageHeader title="Provenance dépôt" description="HEAD, branche et état de travail issus de commandes git à arguments fixes."/><Panel><RemoteState state={q.state} onRetry={q.reload}>{d=><JsonDisclosure value={d}/>}</RemoteState></Panel></>}
export interface EngineeringState{readonly postgresVersion?:string;readonly databaseSizeBytes?:number;readonly migrations?:readonly{readonly name:string;readonly appliedAt:string}[];readonly journalEntries?:number;readonly idempotencyKeys?:number;readonly serverNow?:string;readonly api?:{readonly nodeVersion?:string;readonly uptimeSeconds?:number;readonly commit?:string|null;readonly environment?:string|null;readonly smsProvider?:string|null;readonly emailConfigured?:boolean};readonly expectedLatestMigration?:string;readonly schemaUpToDate?:boolean}
export function taille(octets:number|undefined):string{if(octets===undefined)return '—';const u=['o','Ko','Mo','Go'];let v=octets,i=0;while(v>=1024&&i<u.length-1){v/=1024;i++}return `${v.toFixed(i?1:0)} ${u[i]}`}
export function Production({api}:{api:ApiClient}){
  const q=useRemote(s=>api.get<EngineeringState>('/v1/ops/engineering',undefined,s),[api],{isEmpty:()=>false});
  return <><PageHeader title="Production" description="État réel de l’API et de la base de production, lu par l’API (opérateurs seulement)." actions={<button type="button" className="k-button k-button-secondary" onClick={q.reload}>Actualiser</button>}/>
    <RemoteState state={q.state} onRetry={q.reload}>{e=>{const migs=e.migrations??[];const last=migs[migs.length-1];return <div className="k-grid">
      <div className="k-span-12"><div className="k-stats">
        <StatCard icon="▤" label="Schéma" value={e.schemaUpToDate?'À jour':'En retard'} tone={e.schemaUpToDate?'ok':'danger'} hint={e.schemaUpToDate?`${migs.length} jalons appliqués`:`attendu : ${e.expectedLatestMigration??'—'} — lancer migrate.mjs`}/>
        <StatCard icon="✉" label="SMS" value={e.api?.smsProvider??'Non configuré'} tone={e.api?.smsProvider&&e.api.smsProvider!=='simulator'?'ok':'warn'} hint={e.api?.smsProvider==='simulator'?'Simulateur : aucun SMS réel ne part':'Fournisseur de codes de connexion'}/>
        <StatCard icon="@" label="E-mail" value={e.api?.emailConfigured?'Configuré':'Absent'} tone={e.api?.emailConfigured?'ok':'warn'} hint="Seconde voie de connexion (Resend)"/>
        <StatCard icon="⌁" label="Version" value={e.api?.commit?e.api.commit.slice(0,8):'—'} hint={e.api?.environment??''}/>
      </div></div>
      <div className="k-span-5"><Panel title="Base de données">
        <KeyValue label="PostgreSQL" value={e.postgresVersion??'—'}/><KeyValue label="Taille" value={taille(e.databaseSizeBytes)}/>
        <KeyValue label="Événements au registre" value={String(e.journalEntries??'—')}/><KeyValue label="Clés d’idempotence" value={String(e.idempotencyKeys??'—')}/>
        <KeyValue label="Dernier jalon" value={last?`${last.name} (${formatServerDate(last.appliedAt)})`:'—'}/>
      </Panel><Panel title="API"><KeyValue label="Node" value={e.api?.nodeVersion??'—'}/><KeyValue label="En service depuis" value={e.api?.uptimeSeconds!==undefined?`${Math.round(e.api.uptimeSeconds/60)} min`:'—'}/><KeyValue label="Heure serveur" value={e.serverNow?formatServerDate(e.serverNow):'—'}/></Panel></div>
      <div className="k-span-7"><Panel title="Jalons de schéma appliqués"><DataTable rows={[...migs].reverse()} rowKey={m=>m.name} caption="Migrations appliquées" columns={[{header:'Fichier',render:m=><code>{m.name}</code>},{header:'Appliqué le',render:m=>formatServerDate(m.appliedAt)}]}/></Panel></div>
    </div>}}</RemoteState>
  </>;
}
