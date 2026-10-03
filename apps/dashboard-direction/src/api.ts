import {ApiClient,encodePath} from '@kombe/dashboard-core';
export interface Funnel{readonly cohortId:string;readonly steps:readonly{readonly step:string;readonly count:number}[];readonly individualFinancialFields:number}
export interface Cohort{readonly groupId:string;readonly memberCount:number;readonly roundsCompleted:number;readonly completedCycles:number;readonly eligibleThreeCycleRetention:boolean}
export interface Economics{readonly exposedMembers:number;readonly realPayers:number;readonly promisedOnly:number;readonly paymentRealPercent:number;readonly gateG2Met:boolean;readonly supportMinutes:number;readonly supportCostMinor:string;readonly infrastructureCostMinor:string;readonly cancellations:number;readonly taxesMinor:string;readonly totalCostMinor:string}
export class DirectionApi{
 constructor(private readonly api:ApiClient){}
 funnel(id:string,signal?:AbortSignal){return this.api.get<Funnel>(`/v1/metrics/analytics/funnel/${encodePath(id)}`,undefined,signal)}
 cohort(id:string,signal?:AbortSignal){return this.api.get<Cohort>(`/v1/metrics/cohorts/${encodePath(id)}`,undefined,signal)}
 risks(signal?:AbortSignal){return this.api.get<readonly Record<string,unknown>[]>('/v1/metrics/risks',undefined,signal)}
 extensionCheck(signal?:AbortSignal){return this.api.get<Record<string,unknown>>('/v1/metrics/extension-check',undefined,signal)}
 createEconomics(input:Record<string,unknown>){return this.api.post<Economics>('/v1/metrics/economics',input)}
}
