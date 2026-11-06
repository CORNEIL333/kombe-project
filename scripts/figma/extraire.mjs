// S'exécute DANS la page : décrit l'écran affiché en calques simples pour le plugin Figma.
// Coordonnées absolues en pixels CSS ; le plugin les rend relatives à chaque parent.
export function extraire() {
  const couleur = (c) => {
    const m = c && c.match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a = 1] = m.map(Number);
    return Number(a) === 0 ? null : { r: r / 255, g: g / 255, b: b / 255, a: Number(a) };
  };
  const px = (v) => parseFloat(v) || 0;
  const sy = window.scrollY, sx = window.scrollX;
  const nomDe = (e) => {
    const cl = typeof e.className === "string" ? e.className.trim().split(/\s+/)[0] : "";
    return cl || e.getAttribute("aria-label") || e.tagName.toLowerCase();
  };
  const svgAplati = (s, cs) => {
    const c = s.cloneNode(true);
    const r = s.getBoundingClientRect();
    c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    c.setAttribute("width", r.width);
    c.setAttribute("height", r.height);
    // Le plugin ne connaît ni currentColor ni les variables CSS.
    const src = [s, ...s.querySelectorAll("*")], dst = [c, ...c.querySelectorAll("*")];
    src.forEach((n, i) => {
      const k = getComputedStyle(n);
      for (const a of ["fill", "stroke"]) {
        const v = k[a];
        if (v && v !== "none") dst[i].setAttribute(a, v);
        else if (v === "none") dst[i].setAttribute(a, "none");
      }
      if (px(k.strokeWidth)) dst[i].setAttribute("stroke-width", k.strokeWidth);
      dst[i].removeAttribute("style");
      dst[i].removeAttribute("class");
    });
    return c.outerHTML.replace(/currentColor/g, cs.color);
  };
  function texte(n, parent) {
    const brut = n.textContent.replace(/\s+/g, " ");
    if (!brut.trim()) return null;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cs = getComputedStyle(parent);
    const t = cs.textTransform === "uppercase" ? brut.toUpperCase() : cs.textTransform === "lowercase" ? brut.toLowerCase() : brut;
    const rects = [...rg.getClientRects()];
    const lignes = rects.length;
    const base = {
      font: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), size: px(cs.fontSize), weight: Number(cs.fontWeight) || 400,
      italic: cs.fontStyle === "italic", color: couleur(cs.color), lh: px(cs.lineHeight) || null, ls: px(cs.letterSpacing), align: "left", multi: false,
    };
    if (lignes > 1 && rects[0].left > r.left + 1) {
      const sortie = [], mots = [...n.textContent.matchAll(/\S+/g)];
      let cur = null;
      for (const m of mots) {
        rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const q = rg.getBoundingClientRect();
        if (cur && Math.abs(cur.y - (q.top + sy)) < 2) { cur.text += ` ${m[0]}`; cur.w = q.right + sx - cur.x; }
        else { cur = { t: "text", ...base, name: m[0], x: q.left + sx, y: q.top + sy, w: q.width, h: q.height, text: m[0] }; sortie.push(cur); }
      }
      return sortie;
    }
    return {
      t: "text", name: t.trim().slice(0, 40), x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, text: t.trim(),
      font: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), size: px(cs.fontSize), weight: Number(cs.fontWeight) || 400,
      italic: cs.fontStyle === "italic", color: couleur(cs.color), lh: px(cs.lineHeight) || null, ls: px(cs.letterSpacing),
      align: cs.textAlign, multi: lignes > 1,
    };
  }
  function visiter(e) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return [];
    if (e.closest(".visuellement-cache")) return [];
    const r = e.getBoundingClientRect();
    if (e.tagName === "svg" || e.tagName === "SVG") {
      if (!r.width || !r.height) return [];
      return [{ t: "svg", name: e.getAttribute("aria-label") || "icône", x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, svg: svgAplati(e, cs) }];
    }
    if (e.tagName === "IMG") {
      let data = null;
      try {
        const c = document.createElement("canvas");
        const k = Math.min(1, (r.width * 2) / (e.naturalWidth || 1));
        c.width = Math.max(1, Math.round(e.naturalWidth * k)); c.height = Math.max(1, Math.round(e.naturalHeight * k));
        c.getContext("2d").drawImage(e, 0, 0, c.width, c.height);
        data = c.width * c.height > 90000 ? c.toDataURL("image/jpeg", 0.8) : c.toDataURL("image/png");
      } catch { /* image d'une autre origine : cadre vide */ }
      return [{ t: "image", z: cs.position === "absolute" ? -1 : Number(cs.zIndex) || 0, opacity: cs.maskImage && cs.maskImage !== "none" ? 0.45 : Number(cs.opacity), name: e.alt || "image", x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, data, radius: px(cs.borderTopLeftRadius) }];
    }
    const enfants = [];
    for (const n of e.childNodes) {
      if (n.nodeType === 3) { const t = texte(n, e); if (t) enfants.push(...[].concat(t)); }
      else if (n.nodeType === 1) enfants.push(...visiter(n));
    }
    if ((e.tagName === "INPUT" || e.tagName === "TEXTAREA") && (e.value || e.placeholder) && e.type !== "file" && e.type !== "hidden") {
      enfants.push({
        t: "text", name: "saisie", x: r.left + sx + px(cs.paddingLeft), y: r.top + sy + px(cs.paddingTop), w: Math.max(1, r.width - px(cs.paddingLeft) - px(cs.paddingRight)),
        h: Math.max(px(cs.fontSize) * 1.2, r.height - px(cs.paddingTop) - px(cs.paddingBottom)), text: e.value || e.placeholder, font: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        size: px(cs.fontSize), weight: Number(cs.fontWeight) || 400, italic: false, color: couleur(e.value ? cs.color : "rgb(86,100,94)"), lh: null, ls: 0, align: "left", multi: false,
      });
    }
    // Dégradé : Figma recevra sa première couleur, en aplat. Une image de fond CSS n'est pas reprise.
    const degrade = /^linear-gradient/.test(cs.backgroundImage) && !/rgba\([^)]*,\s*0\)|transparent/.test(cs.backgroundImage) ? cs.backgroundImage.match(/rgba?\([^)]+\)/) : null;
    for (const quoi of ["::before", "::after"]) {
      const ps = getComputedStyle(e, quoi);
      if (ps.content === "none" || ps.content === "normal" || ps.display === "none" || ps.position !== "absolute") continue;
      const f = couleur(ps.backgroundColor), w = px(ps.width), h = px(ps.height);
      if (!f || !w || !h || ps.backgroundImage !== "none") continue;
      enfants.push({ t: "box", name: "décor", x: r.left + sx + px(ps.left), y: r.top + sy + px(ps.top), w, h, fill: f, stroke: null, bottom: null, radius: Array(4).fill(Math.min(px(ps.borderTopLeftRadius), Math.min(w, h) / 2)), shadow: null, opacity: Number(ps.opacity), children: [] });
    }
    enfants.sort((a, b) => (a.z || 0) - (b.z || 0));
    const fond = couleur(cs.backgroundColor) || (degrade ? couleur(degrade[0]) : null);
    const bordure = px(cs.borderTopWidth) && cs.borderTopStyle !== "none" ? { w: px(cs.borderTopWidth), c: couleur(cs.borderTopColor) } : null;
    const bas = !bordure && px(cs.borderBottomWidth) && cs.borderBottomStyle !== "none" ? { w: px(cs.borderBottomWidth), c: couleur(cs.borderBottomColor) } : null;
    const ombre = cs.boxShadow !== "none";
    const visible = (fond || bordure || bas || ombre) && r.width > 0 && r.height > 0;
    if (!visible) return enfants; // boîte invisible : ses enfants remontent d'un cran
    return [{
      t: "box", name: nomDe(e), x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, fill: fond, stroke: bordure, bottom: bas,
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(px).map((v) => Math.min(v, Math.min(r.width, r.height) / 2)),
      shadow: ombre ? cs.boxShadow : null, opacity: Number(cs.opacity), children: enfants,
    }];
  }
  const fondPage = couleur(getComputedStyle(document.body).backgroundColor) || couleur(getComputedStyle(document.documentElement).backgroundColor) || { r: 1, g: 1, b: 1, a: 1 };
  return { w: document.documentElement.scrollWidth, h: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), fill: fondPage, children: visiter(document.body) };
}
