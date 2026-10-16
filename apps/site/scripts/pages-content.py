# -*- coding: utf-8 -*-
"""Génère les pages secondaires du site (HTML statique) à partir d'un gabarit
commun. À relancer après modification : python apps/site/scripts/pages-content.py
Les éléments d'identité juridique encore inconnus sont marqués visiblement
(« à compléter ») : aucun nom, adresse ni numéro n'est inventé."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO = '<span class="todo">à compléter par l’éditeur</span>'
MAJ = 'Version pilote — mise à jour le 15 octobre 2026'


import re


def suisse(body):
    """Traduit le balisage des pages vers les composants de la charte v3."""
    body = re.sub(r'<p class="eyebrow eyebrow--light"><span class="eyebrow__num">(\d+)</span>', r'<p class="sect sect--clair"><span>\1</span>', body)
    body = re.sub(r'<p class="eyebrow"><span class="eyebrow__num">(\d+)</span>', r'<p class="sect"><span>\1</span>', body)
    body = body.replace('class="title-lg title--light"', 'class="titre titre--clair"').replace('class="title-lg"', 'class="titre"')
    body = body.replace('class="body body--light"', 'class="lede lede--clair"').replace('class="body"', 'class="lede"')
    body = body.replace('btn btn--gold', 'btn btn--primaire').replace('btn btn--line', 'btn btn--secondaire')
    body = body.replace('btn btn--forest', 'btn btn--primaire').replace('btn btn--sand', 'btn btn--secondaire')
    body = body.replace('sec sec--sand', 'sec sec--doux').replace('sec sec--night', 'sec sec--foret')
    body = body.replace('class="reveal"', 'class="revele"').replace(' reveal"', ' revele"')
    return body


def page(path, title, desc, body, photo='cercle-vue-dessus'):
    html = f'''<!doctype html>
<html lang="fr">
<head>
  <!--@head-->
  <title>{title} — KÓMBE</title>
  <meta name="description" content="{desc}" />
  <meta property="og:title" content="{title} — KÓMBE" />
  <meta property="og:description" content="{desc}" />
</head>
<body class="page">
  <!--@header-->
  <main id="contenu">
{suisse(body).replace('%PHOTO%', photo)}
  </main>
  <!--@footer-->
  <script type="module" src="/src/page.ts"></script>
</body>
</html>
'''
    d = os.path.join(ROOT, path)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)


def hero(crumbs, title, lead, extra=''):
    c = ''.join(f'<a href="{h}">{t}</a><span aria-hidden="true">/</span>' for t, h in crumbs[:-1]) + f'<span aria-current="page">{crumbs[-1][0]}</span>'
    # Héros clair de la charte : photo en arrière-plan, voile sable à gauche,
    # titre Fraunces, motif d'anneau pâle dans l'angle.
    return f'''    <section class="phero">
      <div class="phero__photo" aria-hidden="true"><img src="/brand/photos/%PHOTO%.webp" alt="" decoding="async" /></div>
      <div class="hero__deco" aria-hidden="true"><span></span><span></span></div>
      <div class="wrap">
        <nav class="crumbs" aria-label="Fil d’Ariane">{c}</nav>
        <h1 class="phero__titre">{title}</h1>
        <p class="phero__lead">{lead}</p>
{extra}
      </div>
    </section>'''


def legal(path, crumb, title, lead, sections, photo):
    toc = '\n'.join(f'          <li><a href="#{i}">{t}</a></li>' for i, t, _ in sections)
    secs = '\n'.join(f'        <h2 id="{i}">{t}</h2>\n{c}' for i, t, c in sections)
    body = hero([('Accueil', '/site/'), ('Centre juridique', '/site/legal/'), (crumb, '')], title, lead,
                f'        <p class="phero__meta">{MAJ}</p>') + f'''
    <section class="sec">
      <div class="wrap doc">
        <nav class="toc" aria-label="Sommaire"><p>Sommaire</p><ol>
{toc}
        </ol></nav>
        <article class="prose">
{secs}
        </article>
      </div>
    </section>'''
    page(path, crumb, lead, body, photo)


# ───────────────────────────── Centre d'aide ─────────────────────────────
GUIDES = [
    ('1', 'Créer votre compte', 'Pas de mot de passe à retenir.', ['Ouvrez <a href="/#/inscription">kombe.vercel.app</a> ou l’application Android.', 'Saisissez votre adresse e-mail (ou votre numéro, si le SMS est ouvert).', 'Recopiez le code à 6 chiffres reçu : votre compte est créé.', 'Indiquez le nom que les membres de vos groupes connaissent.']),
    ('2', 'Créer une tontine', 'Pour le président ou l’initiateur du groupe.', ['Depuis « Mes tontines », touchez « Créer une tontine ».', 'Suivez les étapes : nom, rythme, cotisation, ordre des tours, bureau, règles, relecture.', 'Partagez ensuite le lien d’invitation (par exemple sur WhatsApp).']),
    ('3', 'Rejoindre un groupe', 'Avec le code ou le lien reçu du bureau.', ['Touchez « Rejoindre avec un code », ou ouvrez le lien reçu.', 'Vérifiez le nom du groupe affiché, puis envoyez votre demande.', 'Le bureau valide votre adhésion : le groupe apparaît alors dans « Mes tontines ».']),
    ('4', 'Déclarer une cotisation', 'Espèces, Orange Money, MTN MoMo, banque…', ['Ouvrez le groupe, puis « Mes échéances ».', 'Touchez « Déclarer », choisissez le moyen de paiement et ajoutez la référence si vous en avez une.', 'Votre déclaration attend la confirmation du trésorier : vous voyez son état à tout moment.']),
    ('5', 'Confirmer en tant que trésorier', 'La confirmation se fait par une autre personne.', ['Ouvrez l’onglet « Cotisations » du groupe (ou l’Espace bureau sur ordinateur).', 'Contrôlez chaque déclaration, puis confirmez ou rejetez avec un motif.', 'Vous ne pouvez jamais confirmer votre propre déclaration.']),
    ('6', 'Travailler sans réseau', 'Pendant une séance sans connexion.', ['Faites l’appel et saisissez les déclarations normalement.', 'Elles restent sur le téléphone, marquées « pas encore envoyé ».', 'Elles partent automatiquement au retour du réseau ; rien n’est présenté comme confirmé avant.']),
]
cards = '\n'.join(f'''          <article class="card reveal">
            <span class="card__icon">{n}</span>
            <h3>{t}</h3>
            <p>{s}</p>
            <ol>{''.join(f'<li>{x}</li>' for x in steps)}</ol>
          </article>''' for n, t, s, steps in GUIDES)
FAQ = [
    ('KÓMBE garde-t-il l’argent du groupe&nbsp;?', 'Non. L’argent circule entre membres comme avant (espèces, Mobile Money, virement). KÓMBE tient le registre&nbsp;: qui a déclaré, qui a confirmé, à qui revient le tour.'),
    ('Je n’ai pas reçu mon code.', 'Vérifiez l’adresse saisie et le dossier des courriers indésirables, puis demandez un nouveau code. Le code n’est valable que quelques minutes.'),
    ('Mon adhésion est « en attente ».', 'C’est normal&nbsp;: un membre du bureau doit valider chaque nouvelle adhésion. Prévenez-le si l’attente se prolonge.'),
    ('Peut-on corriger une cotisation déjà confirmée&nbsp;?', 'Oui, par une correction qui s’ajoute à l’historique. L’écriture d’origine reste visible&nbsp;: rien ne s’efface en silence.'),
    ('Puis-je utiliser KÓMBE sur iPhone ou sur ordinateur&nbsp;?', 'Oui, avec l’application web dans le navigateur. Le bureau dispose aussi de l’Espace bureau, pensé pour le grand écran.'),
    ('Qui voit mon numéro de téléphone&nbsp;?', 'Le bureau de votre groupe. Les autres membres voient votre numéro masqué.'),
]
faq = '\n'.join(f'          <details><summary>{q}</summary><p>{a}</p></details>' for q, a in FAQ)
page('aide', 'Centre d’aide', 'Guides pour démarrer avec KÓMBE, questions fréquentes, SAV et contact.', hero(
    [('Accueil', '/site/'), ('Centre d’aide', '')],
    'Centre d’aide. <em>Pas à pas.</em>',
    'Tout pour démarrer&nbsp;: créer votre compte, lancer ou rejoindre une tontine, déclarer et confirmer les cotisations.',
    '''        <div class="ctas"><a class="btn btn--gold" href="#guides">Voir les guides</a><a class="btn btn--line" href="#sav">SAV &amp; assistance</a></div>''') + f'''
    <section class="sec" id="guides" aria-labelledby="h-guides">
      <div class="wrap">
        <p class="eyebrow"><span class="eyebrow__num">01</span>Bien démarrer</p>
        <h2 id="h-guides" class="title-lg">Six guides <em>pour commencer.</em></h2>
        <div class="cards cards--3">
{cards}
        </div>
      </div>
    </section>
    <section class="sec sec--sand" id="sav" aria-labelledby="h-sav">
      <div class="wrap">
        <div class="soon reveal">
          <div>
            <span class="badge-soon">Bientôt disponible</span>
            <h2 id="h-sav">Service après-vente <em>et assistance.</em></h2>
            <p>Une assistance directe est en préparation pour répondre aux membres et aux bureaux des groupes. Elle n’est pas encore ouverte&nbsp;: nous préférons l’annoncer clairement plutôt que promettre une réponse que personne ne donnerait.</p>
            <p>En attendant, les guides et les questions ci-dessous couvrent l’essentiel, et le bureau de votre groupe reste votre premier interlocuteur.</p>
          </div>
          <ul aria-label="Ce qui est prévu">
            <li>Signalement d’un problème depuis l’application</li>
            <li>Suivi de votre demande, avec son état</li>
            <li>Aide aux bureaux pour la mise en place d’un groupe</li>
          </ul>
        </div>
      </div>
    </section>
    <section class="sec" id="faq" aria-labelledby="h-faq2">
      <div class="wrap narrow">
        <p class="eyebrow"><span class="eyebrow__num">02</span>Questions fréquentes</p>
        <h2 id="h-faq2" class="title-lg">Les réponses <em>aux questions courantes.</em></h2>
        <div class="faq">
{faq}
        </div>
      </div>
    </section>
    <section class="sec sec--sand" id="contact" aria-labelledby="h-contact">
      <div class="wrap narrow">
        <p class="eyebrow"><span class="eyebrow__num">03</span>Contact</p>
        <h2 id="h-contact" class="title-lg">Nous <em>écrire.</em></h2>
        <p class="body">Pour une question sur votre groupe (cotisation, tour, adhésion), adressez-vous d’abord au bureau&nbsp;: il voit le registre et peut agir. Pour tout autre sujet (partenariat, presse, données personnelles)&nbsp;:</p>
        <div class="notice"><p>Adresse de contact&nbsp;: {TODO}. Elle sera publiée ici dès l’ouverture du domaine e-mail de KÓMBE.</p></div>
      </div>
    </section>''', 'mains-telephone')

# ─────────────────────────────── Sécurité ───────────────────────────────
SECU = [
    ('Connexion <em>sans mot de passe.</em>', 'Un code à 6 chiffres, à usage unique et valable quelques minutes, est envoyé à votre adresse (ou à votre numéro). Rien à retenir, rien à voler par-dessus l’épaule. Les sessions expirent d’elles-mêmes.'),
    ('Vérifié <em>à plusieurs.</em>', 'Une cotisation est déclarée par une personne et confirmée par une autre. Personne ne confirme sa propre déclaration&nbsp;: le serveur le refuse, quel que soit l’écran utilisé.'),
    ('Un registre <em>qui ne s’efface pas.</em>', 'Chaque événement est ajouté au journal du groupe et chaîné par une empreinte SHA-256&nbsp;: modifier ou supprimer une ligne casse la chaîne, ce qui se voit. Une erreur se corrige par une nouvelle écriture.'),
    ('Chaque groupe <em>dans son périmètre.</em>', 'Les données d’un groupe ne sont lisibles que par ses membres, selon leurs fonctions. Le cloisonnement est appliqué jusque dans la base de données, pas seulement à l’écran.'),
    ('Des numéros <em>masqués.</em>', 'Les numéros complets ne sont visibles que du bureau du groupe. Les autres membres voient un numéro masqué.'),
    ('Hors connexion, <em>en toute clarté.</em>', 'Sans réseau, vos saisies restent sur le téléphone et sont marquées «&nbsp;pas encore envoyé&nbsp;». Rien n’est affiché comme confirmé avant la réponse du serveur.'),
    ('Chiffré <em>en transit.</em>', 'Les échanges passent par HTTPS, avec des en-têtes de sécurité stricts (HSTS, politique de contenu) qui bloquent les scripts étrangers.'),
    ('Procès-verbaux <em>vérifiables.</em>', 'Le procès-verbal d’une séance est généré depuis les événements enregistrés et porte une empreinte&nbsp;: il est approuvé à la séance suivante.'),
]
principles = '\n'.join(f'          <div class="reveal"><b>{t}</b><p>{p}</p></div>' for t, p in SECU)
page('securite', 'Sécurité et confiance', 'Comment KÓMBE protège le registre de votre tontine : connexion par code, vérification à plusieurs, journal chaîné, cloisonnement des groupes.', hero(
    [('Accueil', '/site/'), ('Sécurité', '')],
    'La confiance, <em>ça se construit.</em>',
    'KÓMBE ne garde pas votre argent&nbsp;: il garde la vérité du groupe. Voici comment cette vérité est protégée.') + f'''
    <section class="sec" aria-labelledby="h-sec">
      <div class="wrap">
        <p class="eyebrow"><span class="eyebrow__num">01</span>Nos garde-fous</p>
        <h2 id="h-sec" class="title-lg">Huit principes, <em>appliqués par le serveur.</em></h2>
        <div class="principles">
{principles}
        </div>
      </div>
    </section>
    <section class="sec sec--night" aria-labelledby="h-not">
      <div class="wrap split-photo">
        <div class="reveal">
          <p class="eyebrow eyebrow--light"><span class="eyebrow__num">02</span>Ce que nous ne faisons pas</p>
          <h2 id="h-not" class="title-lg title--light">Ce que KÓMBE <em>ne fera jamais.</em></h2>
          <ul class="body body--light">
            <li>Garder, déplacer ou bloquer l’argent du groupe.</li>
            <li>Accéder à vos comptes Mobile Money ou bancaires.</li>
            <li>Vendre vos données ou afficher de la publicité.</li>
            <li>Déposer des cookies de suivi.</li>
            <li>Donner des conseils financiers.</li>
          </ul>
        </div>
        <figure class="reveal"><img src="/brand/photos/tresoriere.webp" alt="" loading="lazy" /><figcaption>Photo d’illustration.</figcaption></figure>
      </div>
    </section>
    <section class="sec" aria-labelledby="h-faille">
      <div class="wrap narrow">
        <p class="eyebrow"><span class="eyebrow__num">03</span>Signaler une faille</p>
        <h2 id="h-faille" class="title-lg">Vous avez trouvé <em>une faiblesse&nbsp;?</em></h2>
        <p class="body">Merci de nous la signaler avant toute divulgation publique, avec les étapes permettant de la reproduire. N’accédez pas aux données d’autres personnes au-delà du strict nécessaire pour démontrer le problème.</p>
        <div class="notice"><p>Adresse de signalement&nbsp;: {TODO}.</p></div>
      </div>
    </section>''', 'tresoriere')

# ─────────────────────────────── À propos ───────────────────────────────
page('a-propos', 'À propos', 'KÓMBE rend les tontines, njangi et associations plus claires : un registre partagé, vérifié à plusieurs, qui ne garde pas l’argent.', hero(
    [('Accueil', '/site/'), ('À propos', '')],
    'Rendre chaque tontine <em>plus claire.</em>',
    'La tontine est l’une des plus belles inventions de la confiance collective. KÓMBE lui donne un registre à la hauteur.') + '''
    <section class="sec" aria-labelledby="h-why">
      <div class="wrap split-photo">
        <div class="reveal">
          <p class="eyebrow"><span class="eyebrow__num">01</span>Pourquoi KÓMBE</p>
          <h2 id="h-why" class="title-lg">Un cahier, des messages, <em>des doutes.</em></h2>
          <p class="body">Dans beaucoup de groupes, les comptes vivent dans un cahier, une feuille de calcul et des dizaines de messages. Quand un doute apparaît — qui a payé, quand, combien —, il pèse sur le trésorier et sur la confiance de tous.</p>
          <p class="body">KÓMBE remplace ce brouillard par un registre unique&nbsp;: chaque cotisation est déclarée, confirmée par une autre personne, et reste visible. L’argent, lui, circule comme avant.</p>
        </div>
        <figure class="reveal"><img src="/brand/photos/quartier.webp" alt="" loading="lazy" /><figcaption>Photo d’illustration.</figcaption></figure>
      </div>
    </section>
    <section class="sec sec--sand" aria-labelledby="h-values">
      <div class="wrap">
        <p class="eyebrow"><span class="eyebrow__num">02</span>Nos principes</p>
        <h2 id="h-values" class="title-lg">Ce qui guide <em>chaque décision.</em></h2>
        <div class="principles">
          <div class="reveal"><b>Le groupe <em>décide.</em></b><p>Les règles, l’ordre des tours et le bureau appartiennent au groupe. KÓMBE les applique, il ne les invente pas.</p></div>
          <div class="reveal"><b>Pas d’argent <em>chez nous.</em></b><p>KÓMBE n’est ni une banque ni un portefeuille. Il tient le registre, sans jamais toucher aux fonds.</p></div>
          <div class="reveal"><b>Rien ne s’efface <em>en silence.</em></b><p>Une erreur se corrige par une nouvelle écriture&nbsp;; l’originale reste visible de tous.</p></div>
          <div class="reveal"><b>Pensé pour <em>le terrain.</em></b><p>Réseau irrégulier, téléphones modestes, séances en présentiel&nbsp;: l’application fonctionne hors connexion et reste légère.</p></div>
          <div class="reveal"><b>Des chiffres <em>vrais.</em></b><p>Aucun témoignage, aucun chiffre ni aucun utilisateur inventé&nbsp;: tout ce que vous voyez dans KÓMBE vient de votre groupe.</p></div>
          <div class="reveal"><b>Dans <em>vos langues.</em></b><p>Français, anglais et pidgin dans l’application web&nbsp;; d’autres langues suivront.</p></div>
        </div>
      </div>
    </section>
    <section class="sec" aria-labelledby="h-now">
      <div class="wrap narrow">
        <p class="eyebrow"><span class="eyebrow__num">03</span>Où en sommes-nous</p>
        <h2 id="h-now" class="title-lg">Une phase <em>pilote.</em></h2>
        <p class="body">KÓMBE est aujourd’hui en version pilote&nbsp;: application web, application Android et Espace bureau sont ouverts, et s’améliorent avec les premiers groupes. L’assistance directe (SAV) est en préparation.</p>
        <div class="ctas"><a class="btn btn--forest" href="/#/inscription">Créer un compte</a><a class="btn btn--sand" href="/site/aide/">Centre d’aide</a></div>
      </div>
    </section>''', 'generations')

# ───────────────────────────── Télécharger ──────────────────────────────
page('telecharger', 'Télécharger l’application', 'Téléchargez KÓMBE pour Android ou utilisez l’application web sur iPhone et ordinateur.', hero(
    [('Accueil', '/site/'), ('Télécharger', '')],
    'KÓMBE dans votre poche, <em>même sans réseau.</em>',
    'L’application Android s’installe directement depuis ce site. Sur iPhone ou ordinateur, l’application web fait tout dans le navigateur.',
    '''        <div class="dlx">
          <a class="is-main" href="/telecharger/kombe-arm64.apk" download><span class="dlx__icon" aria-hidden="true">↓</span><span><b>Android — recommandé</b><small>La plupart des téléphones · version 0.4.0</small></span></a>
          <a href="/telecharger/kombe-armv7.apk" download><span class="dlx__icon" aria-hidden="true">↓</span><span><b>Android — téléphones anciens</b><small>Appareils 32 bits ou d’entrée de gamme</small></span></a>
          <a href="/"><span class="dlx__icon" aria-hidden="true">◯</span><span><b>Application web</b><small>iPhone, ordinateur, tout navigateur récent</small></span></a>
          <a href="/bureau/"><span class="dlx__icon" aria-hidden="true">▦</span><span><b>Espace bureau</b><small>Pour le bureau du groupe, sur ordinateur</small></span></a>
        </div>''') + '''
    <section class="sec" aria-labelledby="h-install">
      <div class="wrap split-photo">
        <div class="reveal">
          <p class="eyebrow"><span class="eyebrow__num">01</span>Installer sur Android</p>
          <h2 id="h-install" class="title-lg">Trois étapes, <em>deux minutes.</em></h2>
          <ol class="steps">
            <li><b>Téléchargez le fichier</b><p>Touchez «&nbsp;Android — recommandé&nbsp;» puis ouvrez le fichier téléchargé.</p></li>
            <li><b>Autorisez l’installation</b><p>Si le téléphone le demande, autorisez «&nbsp;Installer des applications inconnues&nbsp;» pour votre navigateur.</p></li>
            <li><b>Connectez-vous</b><p>Saisissez votre adresse e-mail et le code reçu. Le premier code crée votre compte.</p></li>
          </ol>
          <div class="notice notice--forest"><p>«&nbsp;Application non compatible&nbsp;»&nbsp;? Prenez la version «&nbsp;téléphones anciens&nbsp;», ou utilisez l’application web.</p></div>
        </div>
        <figure class="reveal"><img src="/brand/photos/mains-telephone.webp" alt="" loading="lazy" /><figcaption>Photo d’illustration.</figcaption></figure>
      </div>
    </section>
    <section class="sec sec--sand" aria-labelledby="h-web">
      <div class="wrap narrow">
        <p class="eyebrow"><span class="eyebrow__num">02</span>iPhone et ordinateur</p>
        <h2 id="h-web" class="title-lg">L’application web, <em>sans installation.</em></h2>
        <p class="body">Ouvrez <a href="/">kombe.vercel.app</a> dans Safari, Chrome ou tout navigateur récent. Pour la retrouver comme une application, utilisez «&nbsp;Partager → Sur l’écran d’accueil&nbsp;» (iPhone) ou «&nbsp;Installer l’application&nbsp;» (Chrome).</p>
        <div class="ctas"><a class="btn btn--forest" href="/">Ouvrir l’application web</a></div>
      </div>
    </section>''', 'mains-telephone')

# ─────────────────────────── Centre juridique ───────────────────────────
DOCS = [
    ('conditions', 'Conditions d’utilisation', 'Les règles d’usage de KÓMBE'),
    ('confidentialite', 'Politique de confidentialité', 'Les données traitées et vos droits'),
    ('cookies', 'Politique de cookies', 'Aucun cookie de suivi, et ce que nous stockons'),
    ('mentions-legales', 'Mentions légales', 'Éditeur et hébergement du service'),
]
lst = '\n'.join(f'          <a href="/site/legal/{p}/"><span><b>{t}</b><small>{s}</small></span><span aria-hidden="true">→</span></a>' for p, t, s in DOCS)
page('legal', 'Centre juridique', 'Conditions d’utilisation, politique de confidentialité, politique de cookies et mentions légales de KÓMBE.', hero(
    [('Accueil', '/site/'), ('Centre juridique', '')],
    'Centre <em>juridique.</em>',
    'Des textes courts et lisibles, qui disent ce que KÓMBE fait — et ce qu’il ne fait pas.',
    f'        <p class="phero__meta">{MAJ}</p>') + f'''
    <section class="sec">
      <div class="wrap">
        <div class="notice"><p><strong>Version pilote.</strong> Ces textes décrivent fidèlement le fonctionnement actuel du service. Les éléments d’identité de l’éditeur encore manquants sont signalés «&nbsp;à compléter&nbsp;» et seront renseignés avant l’ouverture publique.</p></div>
        <div class="legal-list">
{lst}
        </div>
      </div>
    </section>''', 'decision')

# Conditions d'utilisation
legal('legal/conditions', 'Conditions d’utilisation', 'Conditions <em>d’utilisation.</em>',
      'Les règles qui s’appliquent à toute personne utilisant KÓMBE.', [
    ('objet', '1. Objet du service', '<p>KÓMBE est un registre partagé pour les tontines, njangi et associations&nbsp;: il permet à un groupe de consigner ses membres, ses règles, ses séances, les cotisations déclarées et confirmées, les tours et les décisions. Les présentes conditions encadrent l’usage de l’application web, de l’application Android et de l’Espace bureau.</p>'),
    ('nature', '2. Ce que KÓMBE n’est pas', '<ul><li>KÓMBE <strong>ne reçoit, ne détient et ne transfère aucun fonds</strong>. Les paiements se font entre membres, hors de l’application.</li><li>KÓMBE n’est ni une banque, ni un établissement de paiement, ni un établissement de microfinance.</li><li>KÓMBE ne donne aucun conseil financier et ne promet aucun rendement.</li><li>Un document produit par KÓMBE (procès-verbal, relevé, export) ne confère pas, à lui seul, de valeur juridique.</li></ul>'),
    ('compte', '3. Compte et connexion', '<p>La connexion se fait par un code à usage unique envoyé à votre adresse e-mail ou à votre numéro. Le premier code vérifié crée votre compte. Vous êtes responsable de l’accès à votre messagerie et à votre téléphone&nbsp;; signalez sans délai tout usage que vous ne reconnaissez pas.</p><p>Indiquez un nom sous lequel les membres de vos groupes vous connaissent. N’utilisez pas l’identité d’une autre personne.</p>'),
    ('groupes', '4. Groupes, bureau et règles', '<p>Chaque groupe fixe ses propres règles (cotisation, rythme, ordre des tours, amendes, secours) et désigne son bureau. KÓMBE applique ces règles telles qu’elles ont été enregistrées&nbsp;; elles ne sont jamais rétroactives. Le bureau valide les adhésions et répond des décisions prises au nom du groupe.</p>'),
    ('declarations', '5. Déclarations et confirmations', '<p>Chaque membre déclare de bonne foi les cotisations qu’il a versées. Une déclaration est confirmée par une autre personne habilitée&nbsp;; personne ne confirme sa propre déclaration. Les écritures ne sont pas supprimées&nbsp;: une erreur se corrige par une écriture de correction, l’originale restant visible.</p>'),
    ('usage', '6. Usage acceptable', '<p>Il est interdit d’utiliser KÓMBE pour tromper un groupe, déclarer un paiement fictif, harceler un membre, collecter des données d’autrui sans droit, perturber le service ou tenter d’accéder à des données qui ne vous sont pas destinées.</p>'),
    ('disponibilite', '7. Disponibilité', '<p>KÓMBE est en version pilote. Nous faisons notre possible pour assurer un service continu, sans pouvoir garantir l’absence d’interruption. Les saisies faites hors connexion sont conservées sur votre téléphone et envoyées au retour du réseau&nbsp;; elles ne sont considérées comme enregistrées qu’après la réponse du serveur.</p>'),
    ('responsabilite', '8. Responsabilité', '<p>KÓMBE est responsable du bon fonctionnement du registre. Il n’est pas partie aux engagements entre membres et ne répond pas des paiements effectués ou non entre eux, ni des décisions prises par un groupe ou son bureau.</p>'),
    ('donnees', '9. Données personnelles', '<p>Le traitement de vos données est décrit dans la <a href="/site/legal/confidentialite/">politique de confidentialité</a>. KÓMBE ne dépose aucun cookie de suivi (voir la <a href="/site/legal/cookies/">politique de cookies</a>).</p>'),
    ('pi', '10. Propriété intellectuelle', '<p>La marque KÓMBE, son logotype, ses interfaces et ses contenus sont protégés. Les données saisies par un groupe restent les siennes&nbsp;; KÓMBE ne les utilise que pour fournir le service.</p>'),
    ('suspension', '11. Suspension et clôture', '<p>Vous pouvez cesser d’utiliser KÓMBE à tout moment et demander l’effacement de votre identité (voir la politique de confidentialité). Un accès peut être suspendu en cas de manquement grave aux présentes conditions, après information de la personne concernée lorsque c’est possible.</p>'),
    ('modifications', '12. Modifications', '<p>Ces conditions peuvent évoluer avec le service. La date de mise à jour figure en tête de page&nbsp;; une modification importante sera signalée dans l’application.</p>'),
    ('droit', '13. Droit applicable et contact', f'<p>Droit applicable et juridiction compétente&nbsp;: {TODO}. Contact&nbsp;: {TODO}.</p>'),
], 'decision')

# Confidentialité
legal('legal/confidentialite', 'Politique de confidentialité', 'Politique de <em>confidentialité.</em>',
      'Quelles données KÓMBE traite, pourquoi, avec qui, combien de temps — et comment exercer vos droits.', [
    ('responsable', 'Responsable du traitement', f'<p>Responsable du traitement&nbsp;: {TODO}. Contact pour les questions relatives aux données personnelles&nbsp;: {TODO}.</p>'),
    ('donnees', 'Données traitées', '''<div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Exemples</th><th>Origine</th></tr></thead><tbody>
<tr><td>Identification</td><td>Adresse e-mail ou numéro de téléphone, nom affiché</td><td>Vous, à l’inscription</td></tr>
<tr><td>Appartenance</td><td>Groupes, fonctions (président, trésorier…), date d’adhésion</td><td>Vous et le bureau</td></tr>
<tr><td>Registre du groupe</td><td>Cotisations déclarées et confirmées, moyen de paiement, référence, tours, séances, présences, amendes, secours, votes</td><td>Les membres du groupe</td></tr>
<tr><td>Technique</td><td>Identifiant de session, horodatages, journaux techniques</td><td>Le service</td></tr>
</tbody></table></div><p>KÓMBE ne collecte ni vos identifiants Mobile Money ou bancaires, ni votre position, ni vos contacts.</p>'''),
    ('finalites', 'Pourquoi nous les traitons', '<ul><li>Vous connecter et sécuriser votre compte.</li><li>Tenir le registre de vos groupes et l’afficher aux membres selon leurs fonctions.</li><li>Envoyer les codes de connexion et les notifications du groupe.</li><li>Assurer la sécurité, détecter les abus et corriger les erreurs.</li></ul><p>Ces traitements sont nécessaires au service que vous et votre groupe avez demandé. Vos données ne sont ni vendues, ni utilisées pour de la publicité.</p>'),
    ('destinataires', 'Qui y a accès', '<ul><li><strong>Les membres de votre groupe</strong>, selon la transparence choisie par le groupe et leurs fonctions. Seul le bureau voit les numéros complets.</li><li><strong>Nos prestataires techniques</strong>, uniquement pour faire fonctionner le service&nbsp;: Vercel (hébergement de l’application), Neon (base de données et envoi des codes par e-mail), Africa’s Talking (envoi des SMS, lorsque ce canal est ouvert).</li></ul>'),
    ('transferts', 'Où sont-elles hébergées', '<p>Le service est hébergé par Vercel, avec des fonctions exécutées en Europe (Francfort), et la base de données par Neon. Ces prestataires peuvent être situés hors de votre pays&nbsp;; ils n’agissent que sur nos instructions.</p>'),
    ('conservation', 'Combien de temps', '<ul><li>Le registre d’un groupe est conservé tant que le groupe existe, car il fonde la confiance entre ses membres.</li><li>Votre identité peut être effacée sur demande&nbsp;: les écritures du groupe restent (pour que les comptes demeurent justes), mais ne vous désignent plus.</li><li>Les sessions expirent automatiquement&nbsp;; les codes de connexion ne sont valables que quelques minutes.</li></ul>'),
    ('droits', 'Vos droits', f'<p>Vous pouvez demander l’accès à vos données, leur rectification, leur export, l’effacement de votre identité ou vous opposer à un traitement. Une vérification d’identité proportionnée peut être demandée avant d’agir. Adressez votre demande à&nbsp;: {TODO}. Vous pouvez aussi saisir l’autorité de protection des données compétente.</p>'),
    ('securite', 'Sécurité', '<p>Connexion par code à usage unique, échanges chiffrés (HTTPS), cloisonnement des groupes jusque dans la base de données, journal chaîné par empreintes. Le détail est sur la page <a href="/site/securite/">Sécurité et confiance</a>.</p>'),
    ('modifications', 'Modifications', '<p>Cette politique peut évoluer avec le service&nbsp;; la date de mise à jour figure en tête de page.</p>'),
], 'tresoriere')

# Cookies
legal('legal/cookies', 'Politique de cookies', 'Politique <em>de cookies.</em>',
      'Courte, parce qu’il y a peu à dire&nbsp;: KÓMBE ne dépose aucun cookie de suivi.', [
    ('resume', 'En bref', '<ul><li><strong>Aucun cookie</strong> n’est déposé par KÓMBE&nbsp;: ni publicité, ni mesure d’audience, ni réseau social.</li><li>Aucun outil de suivi tiers n’est chargé&nbsp;: la politique de sécurité du site n’autorise que nos propres scripts.</li><li>C’est pourquoi aucune bannière de consentement ne vous est présentée.</li></ul>'),
    ('stockage', 'Ce que nous gardons sur votre appareil', '''<p>Pour fonctionner, l’application web garde quelques informations dans le stockage local de votre navigateur. Elles ne quittent pas votre appareil, sauf vos saisies hors connexion, envoyées au serveur au retour du réseau.</p>
<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Usage</th><th>Durée</th></tr></thead><tbody>
<tr><td><code>kombe.session</code></td><td>Garder votre connexion à l’application web</td><td>Jusqu’à expiration ou déconnexion</td></tr>
<tr><td><code>kombe.langue</code></td><td>Retenir la langue choisie</td><td>Jusqu’à effacement</td></tr>
<tr><td><code>kombe.fileAttente</code></td><td>Saisies faites hors connexion, en attente d’envoi</td><td>Jusqu’à leur envoi</td></tr>
<tr><td><code>kombe.dashboard.session</code></td><td>Connexion à l’Espace bureau (onglet en cours)</td><td>Fermeture de l’onglet</td></tr>
<tr><td><code>kombe.bureau.groupe</code></td><td>Groupe choisi dans l’Espace bureau</td><td>Jusqu’à effacement</td></tr>
</tbody></table></div>
<p>L’application Android garde de même votre session dans le stockage sécurisé du téléphone et vos brouillons hors connexion dans une base locale.</p>'''),
    ('effacer', 'Comment les effacer', '<p>Déconnectez-vous depuis l’application, ou effacez les données du site dans les réglages de votre navigateur. Sur Android, «&nbsp;Effacer les données&nbsp;» de l’application KÓMBE supprime tout ce qu’elle garde sur le téléphone. Attention&nbsp;: des saisies hors connexion non encore envoyées seraient alors perdues.</p>'),
    ('evolution', 'Si cela change', '<p>Si nous devions un jour utiliser un cookie non indispensable, il ne serait déposé qu’après votre accord explicite, et cette page serait mise à jour.</p>'),
], 'cercle-vue-dessus')

# Mentions légales
legal('legal/mentions-legales', 'Mentions légales', 'Mentions <em>légales.</em>',
      'Qui édite KÓMBE et qui l’héberge.', [
    ('editeur', 'Éditeur', f'<p>Dénomination&nbsp;: {TODO}<br />Forme juridique et immatriculation&nbsp;: {TODO}<br />Adresse&nbsp;: {TODO}<br />Contact&nbsp;: {TODO}</p>'),
    ('publication', 'Directeur de la publication', f'<p>{TODO}</p>'),
    ('hebergement', 'Hébergement', '<p><strong>Vercel Inc.</strong> — 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com<br /><strong>Neon</strong> (base de données PostgreSQL gérée) — neon.tech</p>'),
    ('nature', 'Nature du service', '<p>KÓMBE est un registre partagé&nbsp;; il ne reçoit ni ne détient de fonds et ne fournit aucun service de paiement ni de conseil financier. Voir les <a href="/site/legal/conditions/">conditions d’utilisation</a>.</p>'),
    ('credits', 'Crédits', '<p>Polices Manrope et Newsreader, sous licence SIL Open Font License. Les photographies du site sont des illustrations d’ambiance&nbsp;: elles ne représentent ni des utilisateurs ni des groupes réels de KÓMBE.</p>'),
], 'hero-cercle')

print('pages générées')
