/* KÓMBE — moteur d'orbite (prototype de design, hors runtime).
   Une seule grammaire : CERCLE = groupe, NŒUD = membre, ARC = progression,
   ANNEAU FERMÉ = validé, NŒUD OR = bénéficiaire du tour.
   Chaque composition est générée depuis des paramètres réels (n, tour courant),
   jamais dessinée « pour décorer ». */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function seeded(i) {
    const x = Math.sin(i * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }

  /**
   * @param {HTMLElement} host
   * @param {{n:number,current:number,size?:number,ring?:string,arc?:string,node?:string,
   *          nodeDone?:string,beneficiary?:string,stroke?:number,nodeR?:number,
   *          converge?:boolean,labels?:string[],halo?:boolean,delay?:number}} o
   */
  function orbit(host, o) {
    const size = o.size || 400;
    const c = size / 2;
    const stroke = o.stroke || size * 0.035;
    const r = c - (o.nodeR || size * 0.06) - stroke;
    const nodeR = o.nodeR || size * 0.06;
    const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, role: "img", class: "k-orbit" });
    const title = el("title", {}, svg);
    title.textContent = `Cycle de ${o.n} tours — tour ${o.current} en cours`;

    const angle = (i) => (-90 + (i * 360) / o.n) * (Math.PI / 180);
    const pos = (i) => [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))];

    // Anneau de fond (le groupe)
    const ring = el("circle", { cx: c, cy: c, r, fill: "none", stroke: o.ring || "#E7DFCC", "stroke-width": stroke }, svg);

    // Arc de progression : du tour 1 jusqu'au tour courant
    const frac = Math.max(0, (o.current - 1) / o.n);
    const circ = 2 * Math.PI * r;
    const arc = el("circle", {
      cx: c, cy: c, r, fill: "none", stroke: o.arc || "#176B52", "stroke-width": stroke,
      "stroke-linecap": "round", transform: `rotate(-90 ${c} ${c})`,
      "stroke-dasharray": `${circ}`, "stroke-dashoffset": `${circ}`,
    }, svg);
    arc.style.transition = "stroke-dashoffset 1100ms cubic-bezier(.2,.7,.1,1)";

    // Halo du bénéficiaire
    let halo = null;
    if (o.halo !== false) {
      const [hx, hy] = pos(o.current - 1);
      halo = el("circle", { cx: hx, cy: hy, r: nodeR * 1.9, fill: o.beneficiary || "#C7922E", opacity: 0 }, svg);
      halo.style.transition = "opacity 600ms ease";
    }

    // Nœuds (membres)
    const nodes = [];
    for (let i = 0; i < o.n; i++) {
      const [x, y] = pos(i);
      const g = el("g", {}, svg);
      const done = i < o.current - 1;
      const isCurrent = i === o.current - 1;
      const fill = isCurrent ? (o.beneficiary || "#C7922E") : done ? (o.nodeDone || "#103C32") : (o.node || "#FBF8F1");
      el("circle", {
        cx: 0, cy: 0, r: isCurrent ? nodeR * 1.12 : nodeR, fill,
        stroke: done || isCurrent ? "none" : (o.ring || "#E7DFCC"), "stroke-width": stroke * 0.55,
      }, g);
      if (o.labels && o.labels[i]) {
        const t = el("text", { x: 0, y: nodeR * 0.36, "text-anchor": "middle", "font-size": nodeR * 0.95, "font-weight": 700,
          fill: done ? "#FBF8F1" : isCurrent ? "#13211C" : "#66746E", "font-family": "Manrope, sans-serif" }, g);
        t.textContent = o.labels[i];
      }
      // position initiale : dispersée (individus séparés) si convergence
      const sx = c + (seeded(i + 1) - 0.5) * size * 1.5;
      const sy = c + (seeded(i + 7) - 0.5) * size * 1.5;
      const start = o.converge && !reduce() ? `translate(${sx}px, ${sy}px) scale(.6)` : `translate(${x}px, ${y}px)`;
      g.style.transform = start;
      g.style.opacity = o.converge && !reduce() ? "0" : "1";
      g.style.transition = `transform 900ms cubic-bezier(.2,.8,.2,1) ${i * 55}ms, opacity 500ms ease ${i * 55}ms`;
      nodes.push({ g, x, y });
    }

    if (o.converge && !reduce()) ring.style.opacity = "0";
    ring.style.transition = "opacity 700ms ease 500ms";
    host.appendChild(svg);

    const play = () => {
      nodes.forEach(({ g, x, y }) => { g.style.transform = `translate(${x}px, ${y}px)`; g.style.opacity = "1"; });
      ring.style.opacity = "1";
      const wait = o.converge && !reduce() ? 900 + o.n * 55 : 0;
      setTimeout(() => {
        arc.setAttribute("stroke-dashoffset", String(circ * (1 - frac)));
        if (halo) setTimeout(() => (halo.style.opacity = "0.18"), reduce() ? 0 : 700);
      }, (o.delay || 0) + wait);
    };
    if (reduce()) { arc.style.transition = "none"; }
    requestAnimationFrame(() => requestAnimationFrame(play));
    return svg;
  }

  window.KombeOrbit = orbit;
})();
