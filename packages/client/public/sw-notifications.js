/* KÓMBE — service de notification de la PWA (A14). Il ne fait QUE recevoir
   les notifications et ouvrir KÓMBE au clic : aucun cache, aucune
   interception des requêtes. Le message est générique (ADR-0016). */
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = {};
  }
  const titre = typeof d.title === "string" && d.title ? d.title : "KÓMBE";
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: typeof d.body === "string" ? d.body : "",
      icon: "/brand/kombe-icone-192.png",
      badge: "/brand/kombe-icone-192.png",
      tag: typeof d.kind === "string" ? d.kind : "kombe",
      data: { link: typeof d.link === "string" ? d.link : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let cible = new URL("/", self.location.origin);
  try {
    const u = new URL(event.notification.data && event.notification.data.link ? event.notification.data.link : "/", self.location.origin);
    if (u.origin === self.location.origin) cible = u; // jamais d'ouverture vers un autre site
  } catch (e) {
    /* lien illisible : accueil */
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if (f.url.startsWith(self.location.origin)) {
          f.focus();
          return f.navigate ? f.navigate(cible.href) : undefined;
        }
      }
      return self.clients.openWindow(cible.href);
    }),
  );
});
