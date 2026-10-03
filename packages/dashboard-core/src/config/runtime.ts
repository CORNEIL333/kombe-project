export interface DashboardRuntimeConfig { readonly apiBaseUrl:string; readonly engineeringGatewayBaseUrl?:string; readonly environment?:string; }
function validUrl(v:unknown):v is string{if(typeof v!=='string'||!v.trim())return false;try{return ['http:','https:'].includes(new URL(v,window.location.origin).protocol)}catch{return false}}
export async function loadRuntimeConfig(fallback=import.meta.env.VITE_KOMBE_API_BASE_URL as string|undefined):Promise<DashboardRuntimeConfig>{
  try{const r=await fetch('/kombe-dashboard-config.json',{cache:'no-store',credentials:'same-origin'});if(r.ok){const raw=await r.json() as Record<string,unknown>;if(!validUrl(raw.apiBaseUrl))throw new Error('Invalid apiBaseUrl in runtime config.');return {apiBaseUrl:raw.apiBaseUrl,...(validUrl(raw.engineeringGatewayBaseUrl)?{engineeringGatewayBaseUrl:raw.engineeringGatewayBaseUrl}:{}),...(typeof raw.environment==='string'?{environment:raw.environment}:{})};}}catch{}
  if(!validUrl(fallback))throw new Error('Aucune URL API réelle configurée.'); return {apiBaseUrl:fallback};
}
