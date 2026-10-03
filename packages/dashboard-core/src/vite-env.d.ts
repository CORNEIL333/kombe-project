// Typage minimal de `import.meta.env` sans dépendre du paquet `vite`
// (dashboard-core est une lib source ; seule VITE_KOMBE_API_BASE_URL est lue).
interface ImportMetaEnv {
  readonly VITE_KOMBE_API_BASE_URL?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
