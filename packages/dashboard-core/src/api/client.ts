export type QueryValue = string | number | boolean | null | undefined;
export type Query = Readonly<Record<string, QueryValue>>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly correlationId: string | null;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown, code: string | null, correlationId: string | null) {
    super(message); this.name='ApiError'; this.status=status; this.body=body; this.code=code; this.correlationId=correlationId;
  }
}

export interface ApiClientOptions { readonly baseUrl:string; readonly timeoutMs?:number; readonly getCsrfToken?:()=>string|null; readonly csrfHeaderName?:string; }
function joinUrl(baseUrl:string,path:string,query?:Query){
  if(!path.startsWith('/')) throw new Error("API path must start with '/'.");
  const base=baseUrl.endsWith('/')?baseUrl.slice(0,-1):baseUrl;
  const url=new URL(`${base}${path}`,window.location.origin);
  if(query) for(const [k,v] of Object.entries(query)) if(v!==null&&v!==undefined) url.searchParams.set(k,String(v));
  return url.toString();
}
async function decode(response:Response):Promise<unknown>{
  if(response.status===204)return null;
  const type=response.headers.get('content-type')??'';
  return type.includes('application/json')?response.json():response.text();
}
function err(body:unknown){
  if(body&&typeof body==='object'){const r=body as Record<string,unknown>;return {message:typeof r.message==='string'?r.message:typeof r.error==='string'?r.error:'Requête refusée par le serveur.',code:typeof r.code==='string'?r.code:null};}
  return {message:typeof body==='string'&&body.trim()?body:'Requête refusée par le serveur.',code:null};
}
export class ApiClient{
  private readonly baseUrl:string; private readonly timeoutMs:number; private readonly getCsrfToken:(()=>string|null)|undefined; private readonly csrfHeaderName:string;
  constructor(o:ApiClientOptions){this.baseUrl=o.baseUrl;this.timeoutMs=o.timeoutMs??15000;this.getCsrfToken=o.getCsrfToken;this.csrfHeaderName=o.csrfHeaderName??'x-csrf-token';}
  async request<T>(path:string,init:RequestInit&{readonly query?:Query}={},signal?:AbortSignal):Promise<T>{
    const controller=new AbortController(); const timer=window.setTimeout(()=>controller.abort('timeout'),this.timeoutMs); const onAbort=()=>controller.abort(signal?.reason); signal?.addEventListener('abort',onAbort,{once:true});
    const headers=new Headers(init.headers); headers.set('accept','application/json');
    if(init.body!==undefined&&init.body!==null&&!headers.has('content-type'))headers.set('content-type','application/json');
    const method=(init.method??'GET').toUpperCase(); if(!['GET','HEAD','OPTIONS'].includes(method)){const csrf=this.getCsrfToken?.();if(csrf)headers.set(this.csrfHeaderName,csrf);}
    try{const response=await fetch(joinUrl(this.baseUrl,path,init.query),{...init,headers,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});const body=await decode(response);if(!response.ok){const e=err(body);throw new ApiError(e.message,response.status,body,e.code,response.headers.get('x-correlation-id'));}return body as T;}
    finally{window.clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
  }
  get<T>(path:string,query?:Query,signal?:AbortSignal){return this.request<T>(path,{method:'GET',...(query!==undefined?{query}:{})},signal);}
  post<T>(path:string,body?:unknown,headers?:HeadersInit,signal?:AbortSignal){return this.request<T>(path,{method:'POST',...(body!==undefined?{body:JSON.stringify(body)}:{}),...(headers!==undefined?{headers}:{})},signal);}
}
