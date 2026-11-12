#!/usr/bin/env bash
# Régénère les pages anglaises (A16) depuis les pages françaises et les
# traductions par fragment de ce dossier. Le balisage reste celui de la page
# française : un fragment ajouté ou retiré en français fait échouer la
# régénération (« non traduits »), jamais une page à moitié traduite.
# Les partiels header.en.html et footer.en.html sont tenus à la main.
set -euo pipefail
cd "$(dirname "$0")/../.."
T=scripts/en
python3 $T/htmltr.py apply index.html $T/index.txt en/index.html
python3 $T/htmltr.py apply a-propos/index.html $T/apropos.txt en/about/index.html
python3 $T/htmltr.py apply aide/index.html $T/aide.txt en/help/index.html
python3 $T/htmltr.py apply securite/index.html $T/securite.txt en/security/index.html
python3 $T/htmltr.py apply telecharger/index.html $T/tel.txt en/download/index.html
python3 $T/htmltr.py apply legal/index.html $T/legal.txt en/legal/index.html
python3 $T/htmltr.py apply legal/conditions/index.html $T/cgu.txt en/legal/terms/index.html
python3 $T/htmltr.py apply legal/mentions-legales/index.html $T/mentions.txt en/legal/notice/index.html
python3 $T/htmltr.py apply legal/cookies/index.html $T/cookies.txt en/legal/cookies/index.html
python3 $T/htmltr.py apply legal/confidentialite/index.html $T/conf.txt en/legal/privacy/index.html
