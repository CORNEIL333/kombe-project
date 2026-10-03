import {ApiClient, encodePath} from '@kombe/dashboard-core';
export interface CycleSchedule {readonly groupId?:string;readonly ruleVersion?:number;readonly memberCount?:number;readonly rounds?:number;readonly frequency?:string;readonly state?:string;readonly contribution?:string;readonly roundPot?:string;readonly cycleExpectedTotal?:string;readonly schedule?:readonly Record<string,unknown>[]}
export interface DisputeView {readonly disputeId?:string;readonly state?:string;readonly [key:string]:unknown}
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
}
