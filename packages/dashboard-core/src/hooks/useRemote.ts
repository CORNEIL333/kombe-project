import {useCallback,useEffect,useRef,useState} from 'react';
export type RemoteState<T>={readonly kind:'idle'}|{readonly kind:'loading'}|{readonly kind:'ready';readonly data:T}|{readonly kind:'empty';readonly data:T}|{readonly kind:'error';readonly error:unknown};
export function useRemote<T>(loader:(signal:AbortSignal)=>Promise<T>,deps:readonly unknown[],options:{readonly enabled?:boolean;readonly isEmpty?:(data:T)=>boolean}={}){
  const[state,setState]=useState<RemoteState<T>>({kind:'idle'});const generation=useRef(0);const[nonce,setNonce]=useState(0);
  useEffect(()=>{if(options.enabled===false){setState({kind:'idle'});return;}const c=new AbortController();const current=++generation.current;setState({kind:'loading'});loader(c.signal).then(data=>{if(c.signal.aborted||current!==generation.current)return;const empty=options.isEmpty?.(data)??(Array.isArray(data)&&data.length===0);setState(empty?{kind:'empty',data}:{kind:'ready',data});}).catch(error=>{if(!c.signal.aborted&&current===generation.current)setState({kind:'error',error});});return()=>c.abort('unmounted');},[...deps,nonce,options.enabled]);
  return {state,reload:useCallback(()=>setNonce(v=>v+1),[])};
}
