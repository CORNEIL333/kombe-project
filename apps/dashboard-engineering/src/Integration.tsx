/* KÓMBE — Intégration : le contrat réel de l'API pour les équipes qui
   branchent un système externe (comptabilité, portail, audit). Chaque fait
   affiché est vérifié dans le code serveur ; rien n'est promis pour demain.
   Référence détaillée : docs/API_TONTINE.md à la racine du dépôt. */
import {DataTable,KeyValue,PageHeader,Panel,StatusChip} from '@kombe/dashboard-core';

const BASE = 'https://kombe.vercel.app/v1';

function Bloc({titre, lignes}:{readonly titre:string; readonly lignes:readonly string[]}){
  return <Panel title={titre}><pre className="k-code" style={{whiteSpace:'pre-wrap',margin:0}}>{lignes.join('\n')}</pre></Panel>;
}

export function Integration(){
  return <>
    <PageHeader title="Intégrer l’API KÓMBE" description="Contrat réel, vérifié dans le code serveur : ce qu’une équipe technique doit savoir pour brancher un système externe au registre. KÓMBE ne détient aucun argent : l’API ne fait qu’enregistrer ce que les membres déclarent et confirment."/>
    <div className="k-grid">
      <div className="k-span-6">
        <Panel title="Principe">
          <KeyValue label="Base" value={`${BASE} — même origine que le site en production`} />
          <KeyValue label="Format" value="JSON UTF-8 ; dates ISO 8601 servies par le serveur" />
          <KeyValue label="Authentification" value="Bearer : Authorization: Bearer <sessionId>" />
          <KeyValue label="CORS" value="Liste fermée d’origines ; intégrez depuis la même origine ou une origine déclarée" />
          <KeyValue label="Santé (sans session)" value={<code>GET /v1/health/ready</code>} />
        </Panel>
      </div>
      <div className="k-span-6">
        <Panel title="Connexion — code à usage unique">
          <KeyValue label="1. Demande" value={<code>POST /v1/auth/code-requests {'{ "login": "…@…" }'}</code>} />
          <KeyValue label="2. Vérification" value={<code>POST /v1/auth/code-verifications {'{ "login": "…", "code": "123456" }'}</code>} />
          <KeyValue label="Réponse" value={<code>{'{ "sessionId", "identityId", "expiresAt" }'}</code>} />
          <KeyValue label="Règles" value="Code 6 chiffres, expire en 10 min, 5 essais max, une seule consommation" />
          <KeyValue label="Limites" value="10 requêtes auth/min/IP ; session valable 720 h" />
        </Panel>
      </div>
      <div className="k-span-12">
        <Panel title="Règles d’intégration">
          <DataTable rows={[
            {sujet:'Montants', regle:'XAF entiers sérialisés en CHAÎNES JSON (« 5000 »), plafond 1 000 000 000 par mouvement — au-delà : 400'},
            {sujet:'Écritures répétées', regle:'En-tête Idempotency-Key optionnelle : une reprise rejoue la première réponse (en-tête idempotent-replay: true), jamais un double effet'},
            {sujet:'Concurrence support', regle:'Accès JIT : en-tête if-match-version — une version périmée répond 409'},
            {sujet:'Erreurs', regle:'Corps { "code", "message" } ; 400 requête, 401 session, 403 droit, 404 inconnu, 409 conflit d’état, 410 épuisé, 422 règle métier, 429 quota'},
            {sujet:'Quota', regle:'120 requêtes/min/IP toutes routes confondues (429 au-delà)'},
            {sujet:'Sessions', regle:'401 = session expirée ou révoquée : redemander un code, ne jamais réessayer en boucle'},
          ]} rowKey={(r)=>r.sujet} caption="Règles" columns={[{header:'Sujet',render:r=>r.sujet},{header:'Règle',render:r=>r.regle}]}/>
        </Panel>
      </div>
      <div className="k-span-7">
        <Panel title="Familles d’endpoints">
          <DataTable rows={[
            {famille:'/v1/health', acces:'Public', usage:'Sondes de vie et de préparation (mode, schéma attendu)'},
            {famille:'/v1/auth', acces:'Public', usage:'Connexion par code (e-mail ; SMS et WhatsApp quand ils sont ouverts — voir /v1/auth/channels)'},
            {famille:'/v1/me', acces:'Session membre', usage:'Mes tontines, mes échéances, mes notifications'},
            {famille:'/v1/tontines', acces:'Session membre', usage:'Le produit : tontines, statuts, cycles, séances, cotisations, caisses, amendes, secours, décisions, parts, rôles, registre'},
            {famille:'/v1/support', acces:'Opérateurs', usage:'Accès justifié à double approbation, TTL, révocation'},
            {famille:'/v1/ops', acces:'Opérateurs', usage:'Vue d’ensemble, groupes, KPI, santé d’ingénierie'},
            {famille:'/v1/metrics', acces:'Opérateurs', usage:'Analyse pilote : entonnoir, cohortes, économie, risques'},
          ]} rowKey={(r)=>r.famille} caption="Familles" columns={[{header:'Famille',render:r=><code>{r.famille}</code>},{header:'Accès',render:r=><StatusChip status={r.acces} tone={r.acces==='Public'?'ok':'neutral'}/>},{header:'Usage',render:r=>r.usage}]}/>
        </Panel>
      </div>
      <div className="k-span-5">
        <Bloc titre="Exemple complet (curl)" lignes={[
          `# 1. Demander un code`,
          `curl -X POST ${BASE}/auth/code-requests \\`,
          `  -H 'content-type: application/json' \\`,
          `  -d '{"login":"tresorier@groupe.cm"}'`,
          ``,
          `# 2. Vérifier le code reçu par SMS/e-mail`,
          `curl -X POST ${BASE}/auth/code-verifications \\`,
          `  -H 'content-type: application/json' \\`,
          `  -d '{"login":"tresorier@groupe.cm","code":"123456"}'`,
          ``,
          `# 3. Mes tontines, puis le registre chaîné d'une tontine`,
          `curl ${BASE}/me/tontines -H 'Authorization: Bearer <sessionId>'`,
          `curl ${BASE}/tontines/<groupId>/journal \\`,
          `  -H 'Authorization: Bearer <sessionId>'`,
          ``,
          `# 4. Déclarer une cotisation (rejouable sans doublon grâce à la clé)`,
          `curl -X POST ${BASE}/tontines/<groupId>/movements \\`,
          `  -H 'Authorization: Bearer <sessionId>' \\`,
          `  -H 'idempotency-key: <uuid unique>' \\`,
          `  -H 'content-type: application/json' \\`,
          `  -d '{"fundId":"<fundId>","kind":"contribution","amount":"5000","roundSeq":1,"channel":"cash"}'`,
        ]}/>
      </div>
      <div className="k-span-12">
        <Panel title="Références du dépôt">
          <KeyValue label="Contrat produit détaillé" value={<code>docs/API_TONTINE.md</code>} />
          <KeyValue label="Autorisations (rôles, matrice)" value="matrice dans packages/domain/src/tontine/roles.ts — le serveur est la seule autorité" />
          <KeyValue label="Historique d’audit" value={<code>docs/AUDIT_INCOHERENCES.md</code>} />
        </Panel>
      </div>
    </div>
  </>;
}
