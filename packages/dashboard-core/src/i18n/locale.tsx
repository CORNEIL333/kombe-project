import {createContext,useContext,useMemo,useState,type PropsWithChildren} from 'react';
export type Locale='fr'|'en'; export type MessageCatalog=Readonly<Record<string,Readonly<Record<Locale,string>>>>;
const C=createContext<{locale:Locale;setLocale:(l:Locale)=>void;t:(k:string,f?:string)=>string}|null>(null);
export function LocaleProvider(p:PropsWithChildren<{messages:MessageCatalog;initialLocale?:Locale}>){const[locale,setLocale]=useState<Locale>(p.initialLocale??'fr');const v=useMemo(()=>({locale,setLocale,t:(k:string,f?:string)=>p.messages[k]?.[locale]??f??k}),[locale,p.messages]);return <C.Provider value={v}>{p.children}</C.Provider>}
export function useLocale(){const v=useContext(C);if(!v)throw new Error('useLocale outside LocaleProvider');return v}
