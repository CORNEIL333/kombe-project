// Typage minimal de la dépendance JCS épinglée (`canonicalize`, RFC 8785).
// Le paquet n'expose pas de types ; on déclare seulement la surface utilisée.
declare module "canonicalize" {
  const canonicalize: (value: unknown) => string | undefined;
  export default canonicalize;
}
