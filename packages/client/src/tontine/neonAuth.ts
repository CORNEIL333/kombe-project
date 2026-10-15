/* KÓMBE — connexion par e-mail via Neon Auth (ADR-0040), le temps d'avoir un
   domaine e-mail vérifié. Neon envoie et vérifie le code ; l'API KÓMBE
   échange ensuite le jeton Neon contre sa propre session. Le client Neon
   n'est chargé qu'à l'usage (connexion par téléphone : rien de plus). */

interface Resultat<T> {
  readonly data: T | null;
  readonly error: { readonly message?: string } | null;
}

interface ClientNeon {
  readonly emailOtp: { sendVerificationOtp(i: { email: string; type: "sign-in" }): Promise<Resultat<unknown>> };
  readonly signIn: { emailOtp(i: { email: string; otp: string }): Promise<Resultat<unknown>> };
  token(): Promise<Resultat<{ token: string }>>;
}

const clients = new Map<string, Promise<ClientNeon>>();

function client(base: string): Promise<ClientNeon> {
  let c = clients.get(base);
  if (!c) {
    c = import("@neondatabase/auth").then(({ createAuthClient }) => createAuthClient(base) as unknown as ClientNeon);
    clients.set(base, c);
  }
  return c;
}

function verifier<T>(r: Resultat<T>, repli: string): T {
  if (r.error || r.data === null) throw new Error(r.error?.message || repli);
  return r.data;
}

/** Demande à Neon d'envoyer un code à 6 chiffres à cette adresse. */
export async function envoyerCodeNeon(base: string, email: string): Promise<void> {
  const c = await client(base);
  verifier(await c.emailOtp.sendVerificationOtp({ email, type: "sign-in" }), "Envoi du code refusé : vérifiez l'adresse.");
}

/** Vérifie le code chez Neon et renvoie le jeton signé à échanger auprès de l'API. */
export async function jetonNeon(base: string, email: string, code: string): Promise<string> {
  const c = await client(base);
  verifier(await c.signIn.emailOtp({ email, otp: code }), "Code incorrect ou expiré.");
  return verifier(await c.token(), "Connexion refusée : redemandez un code.").token;
}
