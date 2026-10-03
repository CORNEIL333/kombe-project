import {ApiClient, encodePath} from '@kombe/dashboard-core';
export interface CycleSchedule {readonly groupId?:string;readonly ruleVersion?:number;readonly memberCount?:number;readonly rounds?:number;readonly frequency?:string;readonly state?:string;readonly contribution?:string;readonly roundPot?:string;readonly cycleExpectedTotal?:string;readonly schedule?:readonly Record<string,unknown>[]}
export interface DisputeView {readonly disputeId?:string;readonly state?:string;readonly [key:string]:unknown}
export interface DeclareDisbursementInput {readonly disbursementId:string;readonly roundId:string;readonly obligationId:string;readonly beneficiaryIdentityId:string;readonly netAmount:string;readonly groupFees:string;readonly personalFeesOutOfPot?:string;readonly requiredControllers:number;readonly allegedDate:number}
function mutationHeaders(actorHeader:string,version?:number):Record<string,string>{return version===undefined?{'x-actor':actorHeader}:{'x-actor':actorHeader,'if-match-version':String(version)}}
export class GroupAdminApi{
 constructor(private readonly api:ApiClient){}
 cycleReadiness(groupId:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/cycle-readiness`,undefined,signal)}
 schedule(groupId:string,signal?:AbortSignal){return this.api.get<CycleSchedule>(`/v1/groups/${encodePath(groupId)}/schedules`,undefined,signal)}
 timeline(groupId:string,signal?:AbortSignal){return this.api.get<readonly Record<string,unknown>[]>(`/v1/groups/${encodePath(groupId)}/timeline`,undefined,signal)}
 journalVerify(groupId:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/journal/verify`,undefined,signal)}
 decisions(groupId:string,signal?:AbortSignal){return this.api.get<readonly Record<string,unknown>[]>(`/v1/groups/${encodePath(groupId)}/decisions`,undefined,signal)}
 disputes(groupId:string,signal?:AbortSignal){return this.api.get<readonly DisputeView[]>(`/v1/groups/${encodePath(groupId)}/dispute-cases`,undefined,signal)}
 invite(groupId:string,handle:string){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/memberships`,{handle})}
 vote(groupId:string,voteId:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/votes/${encodePath(voteId)}`,undefined,signal)}
 contribution(groupId:string,id:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/contributions/${encodePath(id)}`,undefined,signal)}
 obligation(groupId:string,id:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/obligations/${encodePath(id)}`,undefined,signal)}
 disbursement(groupId:string,id:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/disbursements/${encodePath(id)}`,undefined,signal)}
 reconciliation(groupId:string,roundId:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/rounds/${encodePath(roundId)}/reconciliation`,undefined,signal)}
 createExport(groupId:string){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/exports`)}
 exportManifest(id:string,signal?:AbortSignal){return this.api.get<Record<string,unknown>>(`/v1/exports/${encodePath(id)}/manifest`,undefined,signal)}
 // C07 — validations/corrections. Version d'objet EXIGÉE (18.2) : jamais de défaut silencieux.
 confirmContribution(groupId:string,id:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/contributions/${encodePath(id)}/confirmations`,undefined,mutationHeaders(actorHeader,version))}
 controlContribution(groupId:string,id:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/contributions/${encodePath(id)}/control`,undefined,mutationHeaders(actorHeader,version))}
 rejectContribution(groupId:string,id:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/contributions/${encodePath(id)}/rejections`,undefined,mutationHeaders(actorHeader,version))}
 compensateContribution(groupId:string,id:string,reversalContributionId:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/contributions/${encodePath(id)}/compensations`,{reversalContributionId},mutationHeaders(actorHeader,version))}
 // C08 — décaissements. La déclaration (CREATE) n'exige aucune version ; les actes sur un décaissement existant l'exigent.
 declareDisbursement(groupId:string,input:DeclareDisbursementInput,actorHeader:string){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/disbursements`,input,mutationHeaders(actorHeader))}
 confirmDisbursement(groupId:string,id:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/disbursements/${encodePath(id)}/confirmations`,undefined,mutationHeaders(actorHeader,version))}
 controlDisbursement(groupId:string,id:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/disbursements/${encodePath(id)}/control`,undefined,mutationHeaders(actorHeader,version))}
 requestDisbursementReversal(groupId:string,id:string,reason:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/disbursements/${encodePath(id)}/reversal-requests`,{reason},mutationHeaders(actorHeader,version))}
 approveDisbursementReversal(groupId:string,id:string,actorHeader:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/groups/${encodePath(groupId)}/disbursements/${encodePath(id)}/reversals`,undefined,mutationHeaders(actorHeader,version))}
}
