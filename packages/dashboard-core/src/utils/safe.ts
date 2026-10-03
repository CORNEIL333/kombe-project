export function encodePath(v:string){const t=v.trim();if(!t)throw new Error('Identifiant requis.');return encodeURIComponent(t)}
export function safeText(v:unknown){return v===null||v===undefined?'—':typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v):'—'}
