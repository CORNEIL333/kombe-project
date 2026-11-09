/* KÓMBE — filet de démarrage (ES5, sans module). Si l'application n'a pas
   remplacé « Chargement de KÓMBE… » après 20 s (réseau très lent, navigateur
   trop ancien, script bloqué), on l'explique et on propose de réessayer au
   lieu de laisser un écran figé. */
(function () {
  var DELAI = 20000;
  setTimeout(function () {
    var attente = document.querySelector("#root .chargement");
    if (!attente) return;
    var racine = document.getElementById("root");
    racine.innerHTML =
      '<div class="demarrage-lent" role="alert" style="max-width:32rem;margin:3rem auto;padding:1.5rem;font-family:system-ui,sans-serif;line-height:1.5;color:#F6F1E7;background:#061F1B;border-radius:16px">' +
      "<h1 style=\"font-size:1.4rem\">KÓMBE n'arrive pas à démarrer</h1>" +
      "<p>Le réseau est peut-être lent, ou ce navigateur est trop ancien.</p>" +
      "<ul><li>Réessayez dans un instant (Wi-Fi ou données mobiles).</li>" +
      "<li>Mettez à jour Chrome depuis le Play Store, ou ouvrez le lien dans Chrome.</li>" +
      "<li>Sur iPhone : utilisez Safari à jour.</li></ul>" +
      '<p lang="en"><em>KÓMBE could not start. Check your connection or update your browser.</em></p>' +
      '<button type="button" id="kombe-reessayer" style="font-size:1rem;padding:.75rem 1.25rem;border-radius:999px;border:0;background:#E3B23C;color:#061F1B;font-weight:700">Réessayer</button>' +
      "</div>";
    var bouton = document.getElementById("kombe-reessayer");
    if (bouton) bouton.onclick = function () { window.location.reload(); };
  }, DELAI);
})();
