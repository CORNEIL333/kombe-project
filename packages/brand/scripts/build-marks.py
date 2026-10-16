# -*- coding: utf-8 -*-
"""KÓMBE — génère les signes de la marque d'après la charte visuelle (01/08).

Symbole : l'anneau de confiance — quatre arcs (or chaud en haut à gauche,
vert actif à droite, vert forêt en bas à gauche) reliant quatre nœuds, les
membres (sable en haut, or à gauche, verts à droite et en bas), chacun
détaché par un liseré de la couleur du fond.
Logotype : « KÓMBE » en Manrope ExtraBold (contours vectorisés, aucune police
requise à l'affichage) + signature « Votre tontine, plus claire. ».

Sorties (versionnées) : marks/*.svg (horizontal, empilé, symbole, inversé,
monochrome) et marks/kombe-logo.json (géométrie partagée web + Flutter, pour
dessiner et ANIMER le logo).
Prérequis : pip install fonttools — Usage : python packages/brand/scripts/build-marks.py
"""
import json
import math
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "..", "mobile", "assets", "fonts")

C = {
    "foret": "#103C32",
    "actif": "#176B52",
    "soutien": "#2A8A68",
    "or": "#C7922E",
    "or_noeud": "#D4A544",
    "sable": "#EFE3CC",
    "sable_clair": "#FBF8F1",
    "encre": "#13211C",
}

# Géométrie du symbole (repère 100 × 100).
RING = {"cx": 50, "cy": 50, "r": 34, "stroke": 15.5, "node": 11.2, "halo": 3.4}
# Arcs (degrés, 0 = droite, sens horaire écran) et nœuds, par variante.
ARCS = [  # (début, fin, rôle)
    (180, 270, "arc_hg"),  # gauche → haut : or
    (270, 360, "arc_hd"),  # haut → droite : vert actif
    (0, 90, "arc_bd"),     # droite → bas : vert actif
    (90, 180, "arc_bg"),   # bas → gauche : vert forêt
]
NODES = [(270, "n_haut"), (180, "n_gauche"), (0, "n_droite"), (90, "n_bas")]
VARIANTES = {
    "couleur": {"arc_hg": C["or"], "arc_hd": C["actif"], "arc_bd": C["actif"], "arc_bg": C["foret"],
                "n_haut": C["sable"], "n_gauche": C["or_noeud"], "n_droite": C["actif"], "n_bas": C["actif"],
                "fond": C["sable_clair"], "texte": C["foret"], "signature": C["actif"]},
    "inverse": {"arc_hg": C["or"], "arc_hd": C["soutien"], "arc_bd": C["sable"], "arc_bg": C["sable"],
                "n_haut": C["sable_clair"], "n_gauche": C["or_noeud"], "n_droite": C["soutien"], "n_bas": C["sable_clair"],
                "fond": C["foret"], "texte": C["sable_clair"], "signature": C["sable"]},
    "mono": {k: C["encre"] for k in ["arc_hg", "arc_hd", "arc_bd", "arc_bg", "n_haut", "n_gauche", "n_droite", "n_bas", "texte", "signature"]} | {"fond": "#FFFFFF"},
}


def pt(a, r=RING["r"]):
    return RING["cx"] + r * math.cos(math.radians(a)), RING["cy"] + r * math.sin(math.radians(a))


def arc_d(a0, a1):
    x0, y0 = pt(a0)
    x1, y1 = pt(a1)
    return f"M{x0:.2f} {y0:.2f}A{RING['r']} {RING['r']} 0 0 1 {x1:.2f} {y1:.2f}"


def symbole(v, transform=""):
    col = VARIANTES[v]
    parts = []
    for a0, a1, role in ARCS:
        parts.append(f'<path d="{arc_d(a0, a1)}" fill="none" stroke="{col[role]}" stroke-width="{RING["stroke"]}"/>')
    for a, role in NODES:
        x, y = pt(a)
        parts.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{RING["node"]}" fill="{col[role]}" stroke="{col["fond"]}" stroke-width="{RING["halo"]}"/>')
    g = "".join(parts)
    return f'<g transform="{transform}">{g}</g>' if transform else g


def glyphs(font_file, text, size_units=None):
    f = TTFont(os.path.join(FONTS, font_file))
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    cap = f["OS/2"].sCapHeight
    x = 0.0
    paths = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))  # ligne de base y = 0, y vers le bas
        d = pen.getCommands()
        if d:
            paths.append(d)
        x += gs[name].width
    return "".join(paths), x, cap, f["head"].unitsPerEm, f["OS/2"].sTypoAscender


def main():
    word_d, word_w, cap, upm, _ = glyphs("Manrope-800.ttf", "KÓMBE")
    sig_d, sig_w, sig_cap, _, _ = glyphs("Manrope-500.ttf", "Votre tontine, plus claire.")
    acute_top = -cap * 1.32  # l'accent du Ó dépasse la hauteur de capitale

    # Logotype horizontal : symbole (hauteur ≈ 1,9 × capitale) + mot + signature.
    sym_h = cap * 2.15
    s_sym = sym_h / 100
    gap = cap * 0.42
    word_x = sym_h + gap
    sig_scale = 0.45
    sig_y = cap * 0.62 + sig_cap * sig_scale  # ligne de base de la signature sous le mot
    mid = (acute_top + sig_y) / 2
    sym_y = mid - sym_h / 2
    width = word_x + max(word_w, sig_w * sig_scale)
    top = min(sym_y, acute_top) - cap * 0.05
    bottom = max(sym_y + sym_h, sig_y + cap * 0.12)

    def horizontal(v, avec_signature=True):
        col = VARIANTES[v]
        sig = f'<path transform="translate({word_x:.1f} {sig_y:.1f}) scale({sig_scale})" d="{sig_d}" fill="{col["signature"]}"/>' if avec_signature else ""
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top:.0f} {width:.0f} {bottom - top:.0f}" role="img" aria-label="KÓMBE — Votre tontine, plus claire.">'
                f'{symbole(v, f"translate(0 {sym_y:.1f}) scale({s_sym:.4f})")}'
                f'<path transform="translate({word_x:.1f} 0)" d="{word_d}" fill="{col["texte"]}"/>{sig}</svg>\n')

    # Empilé : symbole centré au-dessus du mot.
    st_sym = cap * 2.6
    st_w = max(word_w, sig_w * sig_scale)
    st_sym_y = acute_top - cap * 0.35 - st_sym
    st_sig_y = cap * 0.62 + sig_cap * sig_scale

    def empile(v):
        col = VARIANTES[v]
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {st_sym_y - cap * 0.05:.0f} {st_w:.0f} {st_sig_y - st_sym_y + cap * 0.2:.0f}" role="img" aria-label="KÓMBE — Votre tontine, plus claire.">'
                f'{symbole(v, f"translate({(st_w - st_sym) / 2:.1f} {st_sym_y:.1f}) scale({st_sym / 100:.4f})")}'
                f'<path transform="translate({(st_w - word_w) / 2:.1f} 0)" d="{word_d}" fill="{col["texte"]}"/>'
                f'<path transform="translate({(st_w - sig_w * sig_scale) / 2:.1f} {st_sig_y:.1f}) scale({sig_scale})" d="{sig_d}" fill="{col["signature"]}"/></svg>\n')

    def symbole_svg(v):
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 96 96" role="img" aria-label="KÓMBE">{symbole(v)}</svg>\n'

    marks = os.path.join(ROOT, "marks")
    out = {
        "kombe-logo-horizontal.svg": horizontal("couleur"),
        "kombe-logo-horizontal-inverse.svg": horizontal("inverse"),
        "kombe-logo-horizontal-mono.svg": horizontal("mono"),
        "kombe-logo-court.svg": horizontal("couleur", False),
        "kombe-logo-court-inverse.svg": horizontal("inverse", False),
        "kombe-logo-empile.svg": empile("couleur"),
        "kombe-logo-empile-inverse.svg": empile("inverse"),
        "kombe-symbol.svg": symbole_svg("couleur"),
        "kombe-symbol-inverse.svg": symbole_svg("inverse"),
        "kombe-symbol-mono.svg": symbole_svg("mono"),
    }
    for name, svg in out.items():
        with open(os.path.join(marks, name), "w", encoding="utf-8") as f:
            f.write(svg)
    for old in ["kombe-wordmark.svg", "kombe-wordmark-inverse.svg", "kombe-mark.svg", "kombe-mark-inverse.svg"]:
        p = os.path.join(marks, old)
        if os.path.exists(p):
            os.remove(p)

    geo = {
        "_": "GÉNÉRÉ par packages/brand/scripts/build-marks.py — ne pas éditer.",
        "colors": C,
        "variants": VARIANTES,
        "ring": RING,
        "arcs": [[a0, a1, role] for a0, a1, role in ARCS],
        "nodes": [[a, role] for a, role in NODES],
        "wordmark": {
            "d": word_d, "width": round(word_w, 1), "capHeight": cap, "acuteTop": round(acute_top, 1),
            "signature": sig_d, "signatureWidth": round(sig_w, 1), "signatureScale": sig_scale, "signatureY": round(sig_y, 1),
            "symbolSize": round(sym_h, 1), "symbolY": round(sym_y, 1), "wordX": round(word_x, 1),
            "viewBox": [0, round(top), round(width), round(bottom - top)],
        },
    }
    with open(os.path.join(marks, "kombe-logo.json"), "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, indent=1)
    print("marques générées")


if __name__ == "__main__":
    main()
