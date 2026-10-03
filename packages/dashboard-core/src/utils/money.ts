const RX=/^\d+$/; export function assertXafInteger(v:string){const n=v.trim();if(!RX.test(n))throw new Error('Montant XAF invalide.');return n}
export function formatXaf(v:string,locale:'fr'|'en'='fr'){return new Intl.NumberFormat(locale==='fr'?'fr-CM':'en-CM',{style:'currency',currency:'XAF',currencyDisplay:'code',maximumFractionDigits:0}).format(BigInt(assertXafInteger(v)))}
