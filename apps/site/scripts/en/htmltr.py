#!/usr/bin/env python3
"""htmltr.py extract <fr.html>            → fragments numérotés (texte et attributs)
   htmltr.py apply <fr.html> <tr.txt> <en.html> → page anglaise (même balisage)
tr.txt : « N|anglais » par ligne ; « N|= » garde le fragment ; tout fragment doit être couvert.
Liens /site/... réécrits vers les pages anglaises ; lang="fr" → lang="en"."""
import re, sys, html
ATTR = r'(?:content|aria-label|alt|title|placeholder)'
TOK = re.compile(r'(<script\b.*?</script(?=>)|<style\b.*?</style(?=>)|<!--.*?--(?=>))|(' + ATTR + r')="([^"]*)"|>([^<>]*\S[^<>]*)<', re.S)
MAP = {'/site/a-propos/': '/site/en/about/', '/site/aide/': '/site/en/help/', '/site/securite/': '/site/en/security/',
       '/site/telecharger/': '/site/en/download/', '/site/legal/conditions/': '/site/en/legal/terms/',
       '/site/legal/mentions-legales/': '/site/en/legal/notice/', '/site/legal/cookies/': '/site/en/legal/cookies/',
       '/site/legal/confidentialite/': '/site/en/legal/privacy/', '/site/legal/': '/site/en/legal/'}
def frags(s):
    out = []
    for m in TOK.finditer(s):
        if m.group(1): continue
        if m.group(2):
            if m.group(2) == 'content' and not re.search(r'[A-Za-zÀ-ÿ]{3,} ', m.group(3)): continue
            out.append((m.start(3), m.end(3), m.group(3)))
        else:
            t = m.group(4)
            if not re.search(r'[A-Za-zÀ-ÿ]', t): continue
            out.append((m.start(4), m.end(4), t))
    return out
def rewrite_links(s):
    def fix(m):
        url = m.group(2)
        for fr in sorted(MAP, key=len, reverse=True):
            if url.startswith(fr): return m.group(1) + MAP[fr] + url[len(fr):] + '"'
        if url == '/site/' or url.startswith('/site/#'): return m.group(1) + '/site/en/' + url[len('/site/'):] + '"'
        return m.group(0)
    return re.sub(r'(href=")(/site/[^"]*)"', fix, s)
if sys.argv[1] == 'extract':
    s = open(sys.argv[2]).read()
    for i, (_, _, t) in enumerate(frags(s)): print(f'{i}|{" ".join(t.split())}')
else:
    s = open(sys.argv[2]).read(); fr = frags(s)
    tr = {}
    for l in open(sys.argv[3]).read().split('\n'):
        if '|' in l and l.split('|', 1)[0].strip().isdigit():
            i, t = l.split('|', 1); tr[int(i)] = t.strip()
    missing = [i for i in range(len(fr)) if i not in tr]
    if missing: sys.exit(f'non traduits : {missing[:20]}')
    out, pos = [], 0
    for i, (a, b, t) in enumerate(fr):
        out.append(s[pos:a]); new = t if tr[i] == '=' else tr[i]
        lead = t[:len(t) - len(t.lstrip())]; trail = t[len(t.rstrip()):]
        out.append(new if tr[i] == '=' else lead + new + trail); pos = b
    out.append(s[pos:])
    r = rewrite_links(''.join(out)).replace('<html lang="fr">', '<html lang="en">')
    r = r.replace('href="/#/inscription"', 'href="/?lang=en#/inscription"').replace('href="/"', 'href="/?lang=en"')
    import os; os.makedirs(os.path.dirname(sys.argv[4]), exist_ok=True)
    open(sys.argv[4], 'w').write(r)
    print('ok', len(fr))
