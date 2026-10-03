import {ApiClient,encodePath} from '@kombe/dashboard-core';
export interface SupportAccessView{readonly requestId:string;readonly applicantIdentityId:string;readonly targetGroupId:string;readonly motif:string;readonly permissions:readonly string[];readonly approverCount:number;readonly requiredApprovals:number;readonly requestedAt:number;readonly expiresAt:number|null;readonly status:'pending_approval'|'granted'|'expired'|'revoked';readonly version:number}
export class OperationsApi{
 constructor(private readonly api:ApiClient){}
 health(signal?:AbortSignal){return this.api.get<Record<string,unknown>>('/v1/health',undefined,signal)}
 createAccess(i:{requestId:string;targetGroupId:string;motif:string;permissions:readonly string[];ttlSeconds:number}){return this.api.post<SupportAccessView>('/v1/support/access-requests',i)}
 approve(id:string,ttl:number,version:number){return this.api.post<SupportAccessView>(`/v1/support/access-requests/${encodePath(id)}/approvals`,{ttlSeconds:ttl},{'if-match-version':String(version)})}
 revoke(id:string,version:number){return this.api.post<SupportAccessView>(`/v1/support/access-requests/${encodePath(id)}/revocations`,undefined,{'if-match-version':String(version)})}
 perform(id:string,action:string,version:number){return this.api.post<Record<string,unknown>>(`/v1/support/access-requests/${encodePath(id)}/actions`,{action},{'if-match-version':String(version)})}
 getAccess(groupId:string,requestId:string,signal?:AbortSignal){return this.api.get<SupportAccessView>(`/v1/groups/${encodePath(groupId)}/support/access-requests/${encodePath(requestId)}`,undefined,signal)}
}
