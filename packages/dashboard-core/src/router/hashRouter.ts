import {useEffect,useMemo,useState} from 'react';
const norm=(r:string)=>{const v=r.replace(/^#/,'').trim();return !v||v==='/'?'/':v.startsWith('/')?v:`/${v}`};
export function useHashRoute(){const[path,setPath]=useState(()=>norm(window.location.hash));useEffect(()=>{const f=()=>setPath(norm(window.location.hash));window.addEventListener('hashchange',f);return()=>window.removeEventListener('hashchange',f)},[]);return useMemo(()=>({path,navigate:(n:string)=>{window.location.hash=norm(n)}}),[path])}
