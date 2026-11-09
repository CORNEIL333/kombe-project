import {ApiClient,encodePath} from '@kombe/dashboard-core';
export interface Funnel{readonly cohortId:string;readonly steps:readonly{readonly step:string;readonly count:number}[];readonly individualFinancialFields:number}
export interface Cohort{readonly groupId:string;readonly memberCount:number;readonly roundsCompleted:number;readonly completedCycles:number;readonly eligibleThreeCycleRetention:boolean}
export interface Economics{readonly exposedMembers:number;readonly realPayers:number;readonly promisedOnly:number;readonly paymentRealPercent:number;readonly gateG2Met:boolean;readonly supportMinutes:number;readonly supportCostMinor:string;readonly infrastructureCostMinor:string;readonly cancellations:number;readonly taxesMinor:string;readonly totalCostMinor:string}
export interface WeeklyKpi{readonly weekStart:string;readonly groupsCreated:number;readonly identitiesCreated:number;readonly membersAdmitted:number;readonly movementsDeclared:number;readonly movementsConfirmed:number;readonly amountDeclared:string;readonly amountConfirmed:string;readonly payoutsReceived:number;readonly meetingsClosed:number;readonly medianConfirmHours:number|null}
export interface OpsOverviewLite{readonly groupsByState:Readonly<Record<string,number>>;readonly identities:number;readonly membershipsActive:number;readonly movementsDeclared:number;readonly payoutsAwaitingReceipt:number;readonly debtsOpen:number}
export interface RiskRecord{readonly riskId:string;readonly severity:'faible'|'moyen'|'eleve'|'critique';readonly probabilityPercent:number;readonly impactPercent:number;readonly control:string;readonly evidenceRef:string;readonly owner:string;readonly reviewedAt:string;readonly residual:string}
export interface ExtensionCheck{readonly extensionAllowed:boolean;readonly criticalWithoutControl:readonly string[]}
export interface RiskInput{readonly riskId:string;readonly severity:'faible'|'moyen'|'eleve'|'critique';readonly probabilityPercent:number;readonly impactPercent:number;readonly control:string;readonly evidenceRef:string;readonly owner:string;readonly reviewedAt:string;readonly residual:string}
export class DirectionApi{
 constructor(private readonly api:ApiClient){}
 funnel(id:string,groupId:string,signal?:AbortSignal){return this.api.get<Funnel>(`/v1/metrics/analytics/funnel/${encodePath(id)}`,{groupId},signal)}
 cohort(id:string,signal?:AbortSignal){return this.api.get<Cohort>(`/v1/metrics/cohorts/${encodePath(id)}`,undefined,signal)}
 risks(signal?:AbortSignal){return this.api.get<readonly RiskRecord[]>('/v1/metrics/risks',undefined,signal)}
 extensionCheck(signal?:AbortSignal){return this.api.get<ExtensionCheck>('/v1/metrics/extension-check',undefined,signal)}
 createEconomics(input:Record<string,unknown>){return this.api.post<Economics>('/v1/metrics/economics',input)}
 createRisk(input:RiskInput){return this.api.post<RiskRecord>('/v1/metrics/risks',input)}
 kpis(weeks:number,signal?:AbortSignal){return this.api.get<WeeklyKpi[]>('/v1/ops/kpis',{weeks},signal)}
 overview(signal?:AbortSignal){return this.api.get<OpsOverviewLite>('/v1/ops/overview',undefined,signal)}
}
