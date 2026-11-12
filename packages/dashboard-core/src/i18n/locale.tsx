import {createContext,useCallback,useContext,useEffect,useMemo,useState,type PropsWithChildren} from 'react';
import {CORE_EN} from './coreEn';
export type Locale='fr'|'en'; export type MessageCatalog=Readonly<Record<string,Readonly<Record<Locale,string>>>>;
/** Traductions anglaises indexées par le texte français exact. */
export type EnglishCatalog=Readonly<Record<string,string>>;
interface Valeur{locale:Locale;setLocale:(l:Locale)=>void;t:(k:string,f?:string)=>string;
  /** Texte français → texte de la langue courante (catalogue de l'espace, puis du socle ; sinon inchangé). */
  tx:(fr:string)=>string;
  /** Choix explicite pour un texte composé : (français, anglais). */
  L:(fr:string,en:string)=>string}
const C=createContext<Valeur|null>(null);
function lireLangue(cle:string|undefined,defaut:Locale):Locale{if(!cle)return defaut;try{const l=window.localStorage.getItem(cle);return l==='en'||l==='pcm'?'en':l==='fr'?'fr':defaut}catch{return defaut}}
/** `storageKey` : la langue suit celle choisie dans l'application KÓMBE (même clé, même origine) et y est gardée. */
export function LocaleProvider(p:PropsWithChildren<{messages:MessageCatalog;initialLocale?:Locale;storageKey?:string;english?:EnglishCatalog}>){
  const[locale,setLocaleState]=useState<Locale>(()=>lireLangue(p.storageKey,p.initialLocale??'fr'));
  const setLocale=useCallback((l:Locale)=>{setLocaleState(l);if(p.storageKey){try{window.localStorage.setItem(p.storageKey,l)}catch{/* stockage indisponible */}}},[p.storageKey]);
  useEffect(()=>{if(p.storageKey)document.documentElement.lang=locale},[locale,p.storageKey]);
  const v=useMemo<Valeur>(()=>({locale,setLocale,
    t:(k:string,f?:string)=>p.messages[k]?.[locale]??f??k,
    tx:(fr:string)=>locale==='en'?(p.english?.[fr]??CORE_EN[fr]??fr):fr,
    L:(fr:string,en:string)=>locale==='en'?en:fr}),[locale,setLocale,p.messages,p.english]);
  return <C.Provider value={v}>{p.children}</C.Provider>}
export function useLocale(){const v=useContext(C);if(!v)throw new Error('useLocale outside LocaleProvider');return v}
/** Traduction tolérante : hors fournisseur (écran de démarrage), le français est rendu tel quel. */
export function useTx():{tx:(fr:string)=>string;L:(fr:string,en:string)=>string;locale:Locale}{const v=useContext(C);return v?{tx:v.tx,L:v.L,locale:v.locale}:{tx:(s:string)=>s,L:(fr:string)=>fr,locale:'fr'}}
/** Traduit une valeur affichée si c'est une chaîne ; laisse tout autre nœud intact. */
export function txNode<T>(tx:(fr:string)=>string,v:T):T{return(typeof v==='string'?tx(v):v) as T}
