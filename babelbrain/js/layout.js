/* MindBlown Neural — layout.js
   Wiring-economy force layout. Lobes (or brains, on a network screen) get anchors on a ring; inside a lobe the
   strongest synapses are the shortest wires (as in cortex: strong connections are short and clustered, weak ones
   are long shortcuts); connector hubs are pulled toward the midpoint of the modules they bridge, so bridging neurons
   sit between lobes instead of being buried in one. Synapses orbit their neuron, sub-neurons sit on a child ring.
   A second mode, the genome layout (G), arranges the same brain the way a genome is mapped: a karyogram of vertical bars
   (lobes, or brains on a network screen), neurons as bands sorted by connectivity, the hub at the centromere, sub-neurons
   beside their parent, synapses on a ladder to the right. Positions are static loci; the forces only hold things there.
   Atoms (sub-neurons of a neuron that carries a molecule) are not force nodes at all: a molecule force keeps each one at its
   parent plus its drawing offset, so a structural formula unfolds rigidly out of its neuron in either layout. */
window.MBN = window.MBN || {};
(() => {
  class Layout {
    constructor(M, dyn) {
      this.M = M; this.dyn = dyn;
      this.explodeF = 0; this.depthF = 0;
      this.activeNodes = []; this.activeLinks = [];
      this.anchor = {}; this.hubOf = {};
      this.mode = 'neural'; this.viewport = { W: 0, H: 0 }; this.layoutAspect = 0; this.pageOn = () => true;
      this.placeAnchors();
      this.buildChromosomes();
      this.seedPositions();
      this.makeSim();
    }
    genome() { return this.mode === 'genome'; }
    table() { return this.mode === 'table'; }
    mapped() { return this.mode === 'genome' || this.mode === 'table'; }   // layouts with static loci (gx/gy) that the forces only hold

    // ---------- genome layout: every brain mapped like a karyotype ----------
    // Chromosomes are the brains on a network screen (plus one per shared lobe) and the lobes on a single brain. Each is a vertical bar
    // whose length follows its content as a chromosome's follows its base pairs; bands are the neurons, painted in alternating density like
    // G-banding; the hub neuron sits in the centromere constriction, submetacentric (38 % down) like most human chromosomes; sub-neurons
    // line up beside their parent on the left, synapses fan out to the right. Built from lobes[].brain / self and D.brains alone.
    buildChromosomes() {
      const { lobes, lobeById, pages, brainsIn, selfLobe, isChild } = this.M;
      this.G = { barW: 44, gapX: 170, rowGap: 300, hubGap: 420, synPitch: 9 };
      const chromos = this.chromos = [], chromoOf = this.chromoOf = {};
      if (brainsIn) {
        brainsIn.forEach(b => {
          const hub = pages.find(p => p.isCenter && p.lobe === b.self) || pages.find(p => p.lobe === b.self && !isChild(p)) || null;
          const c = { id: b.id, name: b.short || b.title, color: b.color || lobeById[b.self]?.color || '#9aa', hub, segs: lobes.filter(l => l.brain === b.id) };
          chromos.push(c); c.segs.forEach(l => { chromoOf[l.id] = c; });
        });
        lobes.filter(l => !l.brain && !selfLobe(l)).forEach(l => { const c = { id: l.id, name: l.name, color: l.color, hub: null, segs: [l] }; chromos.push(c); chromoOf[l.id] = c; });
      } else lobes.filter(l => !selfLobe(l)).forEach(l => { const c = { id: l.id, name: l.name, color: l.color, hub: null, segs: [l] }; chromos.push(c); chromoOf[l.id] = c; });
    }
    // a lobe added at runtime also gets a chromosome, so the genome layout (G) can place its neurons: a lobe inside a grown brain joins
    // that brain's chromosome as a further segment; any other new lobe is a chromosome of its own
    addChromosome(l) {
      if (!this.chromos || this.chromoOf[l.id]) return this.chromoOf[l.id] || null;
      const parent = l.brain && this.chromoOf[l.brain];
      if (parent) { parent.segs.push(l); this.chromoOf[l.id] = parent; return parent; }
      const c = { id: l.id, name: l.name, color: l.color, hub: null, segs: [l] }; this.chromos.push(c); this.chromoOf[l.id] = c; return c;
    }
    sameChromo(a, b) { const c = this.chromoOf[a.lobe]; return !!c && c === this.chromoOf[b.lobe]; }
    // how far a neuron's synapse ladder reaches sideways once exploded: one row, synPitch units a rung
    synReach(p) { return p.nSyn ? p.r * 1.3 + 8 + p.nSyn * this.G.synPitch : 0; }
    // the map is static: slots and columns are sized for the unfolded, exploded state up front, so zooming never shifts a locus
    kidPitch(c) { return 2 * c.r * 1.5 + 8; }
    molR(p) { return p.mol ? p.mol.re + 14 : 0; }
    slotH(p) { return Math.max(2 * p.r * 1.6 + 8, 2 * this.molR(p) + 8, d3.sum(p.children.filter(this.pageOn), c => this.kidPitch(c)), 24); }
    // a sub-neuron's slot is an offset from its parent; the anchors scale it by depthF so children unfold out of the bar into their column
    placeKids(p) { const kids = p.children.filter(this.pageOn), kh = d3.sum(kids, c => this.kidPitch(c)); let ky = p.gy - kh / 2; kids.forEach(x => { const ph = this.kidPitch(x); x.gdx = -(this.G.barW / 2 + 16 + x.r * 1.5); x.gdy = ky + ph / 2 - p.gy; x.gx = p.gx + x.gdx; x.gy = p.gy + x.gdy; ky += ph; }); }
    layoutGenome(snap) {
      const { pages, brainsIn, isChild } = this.M, G = this.G, pageOn = this.pageOn, { W, H } = this.viewport;
      this.chromos.forEach(c => {
        const segs = c.segs.map(l => ({ l, ps: pages.filter(p => p.lobe === l.id && p !== c.hub && !isChild(p) && pageOn(p)).sort((a, b) => b.deg - a.deg || a.title.localeCompare(b.title)) })).filter(s => s.ps.length);
        const loci = segs.flatMap(s => s.ps), hs = loci.map(p => this.slotH(p)), total = d3.sum(hs);
        let acc = 0, cIdx = loci.length;
        for (let i = 0; i < loci.length; i++) { if (acc + hs[i] / 2 > total * 0.38) { cIdx = i; break; } acc += hs[i]; }
        c.hubOn = c.hub && pageOn(c.hub) ? c.hub : null;
        c.hubH = c.hubOn ? Math.max(2 * c.hubOn.r * 1.6 + 16, d3.sum(c.hubOn.children.filter(pageOn), k => this.kidPitch(k))) : loci.length > 1 ? 16 : 0;
        c.loci = loci; c.hs = hs; c.cIdx = cIdx;
        c.above = d3.sum(hs.slice(0, cIdx)) + c.hubH / 2; c.below = d3.sum(hs.slice(cIdx)) + c.hubH / 2;
        const withHub = c.hubOn ? [...loci, c.hubOn] : loci;   // the hub and its sub-neurons share the chromosome's horizontal extent
        c.reachR = Math.max(0, ...withHub.map(p => Math.max(this.synReach(p), this.molR(p))));
        c.reachL = Math.max(0, ...withHub.map(p => { const kids = p.children.filter(pageOn); return Math.max(this.molR(p), kids.length ? 24 + Math.max(...kids.map(x => 2 * x.r * 1.5 + this.synReach(x))) : 0); }));
        c.on = loci.length > 0 || !!c.hubOn;
      });
      // a karyogram puts many chromosomes on two or three rows, centromeres aligned along each row; the row count that brings the whole
      // map closest to the screen's shape wins, so a brain with a handful of lobes stays on one row and a big network takes two or three
      const on = this.chromos.filter(c => c.on), n = on.length;
      const oneRowW = d3.sum(on, c => c.reachL + G.barW + c.reachR + G.gapX), tallest = Math.max(0, ...on.map(c => c.above + c.below)), hubExtra = brainsIn ? 0 : G.hubGap;
      this.layoutAspect = (W || 1600) / (H || 900);
      const target = Math.max(0.7, Math.min(2.2, this.layoutAspect));
      const aspectOff = r => Math.abs(Math.log((oneRowW / r) / (hubExtra + tallest * r + G.rowGap * (r - 1)) / target));
      let rows = 1; for (let r = 2; r <= Math.min(4, n); r++) if (aspectOff(r) < aspectOff(rows)) rows = r;
      const per = Math.ceil(n / rows);
      let rowTop = 0; const spans = [];
      for (let r = 0; r < rows; r++) {
        const row = on.slice(r * per, (r + 1) * per); if (!row.length) break;
        const above = Math.max(...row.map(c => c.above)), below = Math.max(...row.map(c => c.below));
        let x = 0; row.forEach(c => { x += c.reachL + G.barW / 2; c.x = x; c.cy = rowTop + above; x += G.barW / 2 + c.reachR + G.gapX; });
        const shift = (x - G.gapX) / 2; row.forEach(c => { c.x -= shift; });
        spans.push({ x0: -shift, x1: x - G.gapX - shift });
        rowTop += above + below + G.rowGap;
      }
      on.forEach(c => {
        let y = c.cy - c.above; c.top = y;
        c.loci.forEach((p, i) => { if (i === c.cIdx) y += c.hubH; const h = c.hs[i]; p.gx = c.x; p.gy = y + h / 2; y += h; this.placeKids(p); });
        if (c.cIdx >= c.loci.length) y += c.hubH;
        c.bot = y;
        if (c.hubOn) { c.hubOn.gx = c.x; c.hubOn.gy = c.cy; this.placeKids(c.hubOn); }
      });
      // a single brain's hub (and any other self-lobe neuron) sits above the karyogram, the nucleus the chromosomes came out of
      if (!brainsIn) { const hubs = pages.filter(p => p.isSelf && !isChild(p) && pageOn(p)), span = spans[0] || { x0: 0, x1: 0 }, top = on.length ? Math.min(...on.map(c => c.top)) : 0; hubs.forEach((p, i) => { p.gx = (span.x0 + span.x1) / 2 + (i - (hubs.length - 1) / 2) * 120; p.gy = top - G.hubGap; this.placeKids(p); }); }
      if (snap) pages.forEach(p => { if (p.gx !== undefined) { p.x = isChild(p) ? p.parent.gx : p.gx; p.y = isChild(p) ? p.parent.gy : p.gy; p.vx = p.vy = 0; } });
    }
    // switch between the force-directed brain and the karyogram; the caller rebuilds and restarts the simulation
    setMode(mode) { if (mode !== 'genome' && mode !== 'neural' && mode !== 'table') return false; if (mode === this.mode) return false; this.mode = mode; this.relayout(false); this.refreshForces(); return true; }
    relayout(snap) { if (this.genome()) this.layoutGenome(snap); else if (this.table()) this.layoutTable(snap); }

    // ---------- table layout (T): a round table with no head ----------
    // Ported from the canonical renderer (rmcjones-collab/mindblown #13/#17/#42). The lobes (or the brains of a network, plus one seat per shared
    // lobe) sit around one ring as equals; a single brain's hub takes a seat like everyone else instead of the centre, and a network brain's hub
    // takes the first chair of its brain's seat. Neurons are the chairs along the ring; synapses lie on the table (a ladder toward the centre);
    // sub-neurons stand behind their parent's chair with their ladders running outward; connections cross the table as chords. The centre
    // stays empty on purpose. Built from lobes[].brain / self alone, like the genome layout.
    seatsNow() {
      const { lobes, brainsIn, selfLobe } = this.M;
      const fresh = brainsIn ? this.chromos : [...lobes.filter(selfLobe).map(l => ({ id: l.id, name: l.name, color: l.color, hub: null, segs: [l] })), ...this.chromos];
      // seats keep their identity across relayouts (the renderer and the QA hooks read them), so only the list of members is refreshed
      const old = new Map((this.seats || []).map(c => [c.id, c]));
      this.seats = fresh.map(c => Object.assign(old.get(c.id) || {}, { id: c.id, name: c.name, color: c.color, hub: c.hub, segs: c.segs }));
      return this.seats;
    }
    placeKidsRadial(p) {
      const kids = p.children.filter(this.pageOn), kw = d3.sum(kids, c => this.kidPitch(c)); let t = -kw / 2;
      kids.forEach(x => { const pw = this.kidPitch(x), d = this.TB.ring / 2 + 16 + x.r * 1.5, tt = t + pw / 2; x.gux = p.gux; x.guy = p.guy; x.gdx = p.gux * d - p.guy * tt; x.gdy = p.guy * d + p.gux * tt; x.gx = p.gx + x.gdx; x.gy = p.gy + x.gdy; t += pw; });
    }
    layoutTable(snap) {
      const { pages, isChild } = this.M, pageOn = this.pageOn, TB = this.TB = this.TB || { ring: 36, seatGap: 72, minR: 260 };
      const seats = this.seatsNow();
      pages.forEach(p => { p.seat = null; });
      seats.forEach(c => {
        const loci = c.segs.flatMap(l => pages.filter(p => p.lobe === l.id && p !== c.hub && !isChild(p) && !p.isAtom && pageOn(p)).sort((a, b) => b.deg - a.deg || a.title.localeCompare(b.title)));
        c.hubOn = c.hub && pageOn(c.hub) ? c.hub : null;
        if (c.hubOn) loci.unshift(c.hubOn);
        c.loci = loci; c.ws = loci.map(p => this.slotH(p)); c.on = loci.length > 0; loci.forEach(p => { p.seat = c; });
        const kids = loci.flatMap(p => p.children.filter(pageOn));
        c.kidR = kids.length ? Math.max(...kids.map(x => 16 + 2 * x.r * 1.5)) : 0; c.kidSyn = kids.length ? Math.max(...kids.map(x => this.synReach(x))) : 0;
      });
      const on = seats.filter(c => c.on);
      // the ring is as long as its chairs plus a gap between seats, and never so small that a synapse ladder would reach the centre
      const reach = Math.max(0, ...on.flatMap(c => c.loci.map(p => this.synReach(p)))), need = d3.sum(on, c => d3.sum(c.ws)) + TB.seatGap * on.length;
      const R = this.tableR = Math.max(TB.minR, need / (2 * Math.PI), reach + 90);
      // spare circumference is shared between the seats, so a sparse brain still sits all the way round
      const gap = TB.seatGap + Math.max(0, 2 * Math.PI * R - need) / Math.max(1, on.length);
      let a = -Math.PI / 2;   // the first seat starts at twelve o'clock
      on.forEach(c => {
        c.a0 = a;
        c.loci.forEach((p, i) => { const am = a + c.ws[i] / 2 / R; p.ga = am; p.gux = Math.cos(am); p.guy = Math.sin(am); p.gx = R * p.gux; p.gy = R * p.guy; this.placeKidsRadial(p); a += c.ws[i] / R; });
        c.a1 = a; c.am = (c.a0 + c.a1) / 2; a += gap / R;
      });
      if (snap) pages.forEach(p => { if (p.gx !== undefined && p.seat || (isChild(p) && p.parent?.seat)) { p.x = isChild(p) ? p.parent.gx : p.gx; p.y = isChild(p) ? p.parent.gy : p.gy; p.vx = p.vy = 0; } });
    }

    // ---------- anchors ----------
    placeAnchors() {
      const { lobes, lobeById, pages, brainsIn, selfLobe, isChild } = this.M;
      const anchor = this.anchor, hubOf = this.hubOf;
      const lobeCount = {}; pages.forEach(p => { lobeCount[p.lobe] = (lobeCount[p.lobe] || 0) + 1; });
      const arc = (ids, cx, cy, R, start, sweep) => {
        const span = ids.map(id => Math.sqrt(lobeCount[id] || 1) + 2.6), total = d3.sum(span); let acc = start;
        ids.forEach((id, i) => { const a = acc + (span[i] / total) * sweep / 2; acc += (span[i] / total) * sweep; anchor[id] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }; hubOf[id] = { x: cx, y: cy }; });
      };
      if (!brainsIn && this.M.D.layout?.kind === 'helix') {
        // double helix: two strands of lobes wound around a horizontal axis; the hub sits where the strands cross.
        // Pair i of the two strands sits at the same x; phase runs one full turn over the strands, offset so no pair
        // lands on the axis (which would stack the two lobes on top of each other, and on the hub). With an even pair
        // count a half-step offset (pi/n) keeps every pair off the axis; with an odd count the middle pair would hit
        // theta = pi, so the offset is a quarter step (pi/2n) instead.
        const H = this.M.D.layout, strands = (H.strands || []).slice(0, 2).map(s => (s || []).filter(id => lobeById[id] && !selfLobe(lobeById[id])));
        const n = Math.max(strands[0]?.length || 0, strands[1]?.length || 0, 1), A = H.amplitude || 520, step = H.spacing || 520;
        const phase = n % 2 ? Math.PI / (2 * n) : Math.PI / n;
        // the crossing (sin theta = 0) must sit on the hub at x = 0: with the quarter-step phase it would land at step/4, so odd counts shift left by that much
        const x0 = -((n - 1) / 2) * step - (n % 2 ? step / 4 : 0), theta = x => phase + ((x - x0) / step) * (Math.PI * 2 / n);
        this.helix = { A, step, n, theta, x0: x0 - step * 0.45, x1: x0 + (n - 1) * step + step * 0.45, colors: H.colors || ['#7dd3fc', '#f9a8d4'], pairs: [] };
        lobes.filter(selfLobe).forEach(l => { anchor[l.id] = { x: 0, y: 0 }; });
        strands.forEach((ids, s) => ids.forEach((id, i) => { const x = x0 + i * step, y = (s ? -1 : 1) * A * Math.sin(theta(x)); anchor[id] = { x, y }; hubOf[id] = { x, y: 0 }; }));
        for (let i = 0; i < n; i++) { const a = strands[0]?.[i], b = strands[1]?.[i]; if (a && b) this.helix.pairs.push([a, b]); }
        // any visible lobe left off both strands falls back to the ring so nothing is lost
        const rest = lobes.filter(l => !selfLobe(l) && !anchor[l.id]).map(l => l.id);
        if (rest.length) arc(rest, 0, 0, A + 420, -Math.PI / 2, Math.PI * 2);
      } else if (!brainsIn) {
        lobes.filter(selfLobe).forEach(l => { anchor[l.id] = { x: 0, y: 0 }; });
        const ring = lobes.filter(l => !selfLobe(l)).map(l => l.id);
        if (ring.length) { const total = d3.sum(ring.map(id => Math.sqrt(lobeCount[id] || 1) + 2.6)), span0 = Math.sqrt(lobeCount[ring[0]] || 1) + 2.6; arc(ring, 0, 0, 760, -Math.PI / 2 - (span0 / total) * Math.PI, Math.PI * 2); }
      } else {
        // network: hubs on a big circle, each brain's lobes fanned outward, shared lobes in the middle (the corpus callosum)
        const NB = brainsIn.length, RB = NB === 1 ? 0 : 1550 + 250 * Math.max(0, NB - 2);
        brainsIn.forEach((b, i) => {
          const th = Math.PI + (Math.PI * 2 * i) / NB, hx = Math.cos(th) * RB, hy = Math.sin(th) * RB;
          b.hub = { x: hx, y: hy }; anchor[b.self] = b.hub;
          arc(lobes.filter(l => l.brain === b.id && !selfLobe(l)).map(l => l.id), hx, hy, 820, th - Math.PI * 0.7, Math.PI * 1.4);
        });
        // shared lobes (the corpus callosum) sit in the middle; the callosum widens as the ring of brains grows
        const sharedL = lobes.filter(l => !l.brain && !selfLobe(l)).map(l => l.id);
        sharedL.forEach((id, j) => { const m = sharedL.length, a = -Math.PI / 2 + (Math.PI * 2 * j) / m, r = m === 1 ? 0 : 430 + 110 * Math.max(0, NB - 3); anchor[id] = { x: Math.cos(a) * r, y: Math.sin(a) * r }; hubOf[id] = { x: 0, y: 0 }; });
      }
      this.lobeSize = {}; pages.forEach(p => { if (!isChild(p)) this.lobeSize[p.lobe] = (this.lobeSize[p.lobe] || 0) + 1; });
    }
    // ---------- growth after boot ----------
    // A lobe added at runtime gets an anchor outside the brain's ring. A plain new network sits on an outer ring (R 1180) in the
    // widest free gap; a new brain (`lobe.miceBrain`, or any lobe flagged `satellite`) sits further out (R 1750); lobes that belong to a
    // grown brain (`lobe.brain` naming that brain's lobe id) fan outward around it. The anchor is also the seed position for its neurons.
    addAnchor(l, at) {   // at: world coordinates chosen by the visitor (a placed origin brain); otherwise the lobe takes the widest free gap on its ring
      const anchor = this.anchor, hubOf = this.hubOf;
      if (anchor[l.id]) return anchor[l.id];
      this.addChromosome(l);
      if (at) { const rk = this.ringK(); anchor[l.id] = { x: at.x / rk, y: at.y / rk }; hubOf[l.id] = { x: 0, y: 0 }; return anchor[l.id]; }
      const parent = l.brain && anchor[l.brain] && this.M.lobeById[l.brain]?.origin ? anchor[l.brain] : null;
      if (parent) {
        const siblings = this.M.lobes.filter(x => x.brain === l.brain && x.id !== l.id && anchor[x.id]).length;
        const out = Math.atan2(parent.y, parent.x), a = out + (siblings ? (siblings % 2 ? 1 : -1) * Math.ceil(siblings / 2) * 0.7 : 0);   // straight out first, then alternating either side
        const reach = l.reach || 470;   // reach: a wide lobe (a drawn coastline) sits further out
        anchor[l.id] = { x: parent.x + Math.cos(a) * reach, y: parent.y + Math.sin(a) * reach }; hubOf[l.id] = parent; return anchor[l.id];
      }
      const R = l.satellite ? 1750 : 1180;
      const taken = Object.entries(anchor).filter(([id]) => id !== l.id && !this.M.selfLobe(this.M.lobeById[id] || {})).map(([, a]) => Math.atan2(a.y, a.x));
      let best = -Math.PI / 2, bestGap = -1;
      for (let i = 0; i < 48; i++) {
        const a = -Math.PI + (i / 48) * Math.PI * 2;
        const gap = taken.length ? Math.min(...taken.map(t => { let d = Math.abs(a - t) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); })) : Math.PI;
        if (gap > bestGap + 1e-6) { bestGap = gap; best = a; }
      }
      anchor[l.id] = { x: Math.cos(best) * R, y: Math.sin(best) * R }; hubOf[l.id] = { x: 0, y: 0 };
      return anchor[l.id];
    }
    // a neuron added at runtime: count it toward its lobe and seed it near the lobe's anchor (or near a given neighbour)
    seedPage(p, near) {
      if (!this.M.isChild(p)) this.lobeSize[p.lobe] = (this.lobeSize[p.lobe] || 0) + 1;
      const a = near && Number.isFinite(near.x) ? near : (this.anchor[p.lobe] || this.addAnchor(this.M.lobeById[p.lobe]) || { x: 0, y: 0 });
      p.x = a.x + (Math.random() - 0.5) * (near ? 60 : 160); p.y = a.y + (Math.random() - 0.5) * (near ? 60 : 160); p.vx = p.vy = 0;
    }
    seedNear(n, p) { n.x = p.x + (Math.random() - 0.5) * 4; n.y = p.y + (Math.random() - 0.5) * 4; n.vx = n.vy = 0; }
    seedPositions() {
      const { pages, syns, srcs, isChild, pageById } = this.M, anchor = this.anchor;
      const rk = this.ringK();
      pages.forEach(p => { if (isChild(p)) return; const a = anchor[p.lobe] || { x: 0, y: 0 }; p.x = a.x * rk + (Math.random() - 0.5) * 220; p.y = a.y * rk + (Math.random() - 0.5) * 220; });
      if (this.M.hasMol) {   // molecules need their room: each lobe is a sunflower packing of its drawings (strongest neurons at the heart), and every
        // molecule is anchored to its own cell in it (ax, ay) rather than to the lobe's centre, so links and collisions cannot squeeze the drawings into one another
        const byLobe = d3.group(pages.filter(p => !isChild(p) && !p.isSelf && !p.isCenter), p => p.lobe), GA = Math.PI * (3 - Math.sqrt(5));
        byLobe.forEach((ps, lobe) => {
          const a = anchor[lobe] || { x: 0, y: 0 }, pitch = 2 * d3.mean(ps, p => p.r + 10 + this.molR(p)) * 0.95, a0 = Math.atan2(a.y, a.x);
          ps.sort((p, q) => (q.nSyn + q.strength0) - (p.nSyn + p.strength0)).forEach((p, i) => { const rr = pitch * Math.sqrt(i + 0.5) * 0.56, th = a0 + i * GA; p.ax = p.x = a.x * rk + Math.cos(th) * rr; p.ay = p.y = a.y * rk + Math.sin(th) * rr; });
        });
      }
      pages.forEach(p => { if (!isChild(p)) return; p.x = p.parent.x + (Math.random() - 0.5) * 6; p.y = p.parent.y + (Math.random() - 0.5) * 6; });
      syns.forEach(s => { const p = pageById[s.page]; s.x = p.x + (Math.random() - 0.5) * 4; s.y = p.y + (Math.random() - 0.5) * 4; });
      srcs.forEach(s => { const p = s.pageNodes[0]; s.x = p.x + (Math.random() - 0.5) * 4; s.y = p.y + (Math.random() - 0.5) * 4; });
    }

    // ---------- geometry helpers shared with the renderer ----------
    // a brain whose neurons unfold into molecules needs room for them, so its lobe ring is wider from the start: a ring
    // that grew with the depth tween would carry a pinned, selected molecule away from the reader
    ringK() { return this.M.hasMol && !this.mapped() && !this.M.brainsIn && !this.helix ? 2.8 : 1; }
    orbitR(p) { return 16 + p.nSyn * 1.7 + this.molR(p); }   // synapses orbit outside the molecule's drawing
    childRingR(p) { return p.r + 42 + Math.sqrt(p.children.length) * 16 + this.explodeF * (this.orbitR(p) * 0.6); }

    // ---------- forces ----------
    makeSim() {
      const { M, dyn } = this; const { lobeById, brainsIn, isChild, pageById } = M; const anchor = this.anchor;
      const isAtom = n => !!n.isAtom;   // atoms ride on their parent (moleculeForce) and take no part in the force balance
      const lobeBrain = id => lobeById[id]?.brain || null;
      const crossBrain = l => !!brainsIn && lobeBrain(l.source.lobe) !== lobeBrain(l.target.lobe);
      // wiring economy: within a lobe, distance shrinks with effective weight (strong = short); across lobes links stay slack
      const linkDist = l => {
        if (l.kind === 'pp') {
          const wn = Math.min(1, l.weff / 6);
          const base = l.source.type === 'day' || l.target.type === 'day' ? 170 : crossBrain(l) ? 420 : l.source.lobe !== l.target.lobe ? 200 + 60 * (1 - wn) : 60 + 55 * (1 - wn);
          return base + Math.max(this.explodeF * (this.orbitR(l.source) + this.orbitR(l.target)) * 0.7, (this.molR(l.source) + this.molR(l.target)) * 0.9);   // two molecules keep room for their drawings (the synapse orbit already rings the drawing)
        }
        if (l.kind === 'st') return 4 + this.explodeF * this.orbitR(l.target);
        if (l.kind === 'sx') return 110;
        if (l.kind === 'sr') return 12 + this.explodeF * (44 + (l.source.pageNodes.length > 1 ? 30 : 0)) + this.molR(l.target);
        if (l.kind === 'pc') return 2 + this.depthF * (this.childRingR(l.target) + this.explodeF * this.orbitR(l.source) * 0.5);
        return 160;
      };
      const linkStrength = l => {
        // genome layout: every neuron is held at its locus and every synapse at its rung, so connections are drawn but do not pull;
        // only a source's tether to its neuron remains, so the sparks stay with their citation
        if (this.mapped() && l.kind !== 'sr') return 0;
        if (l.kind === 'pp') { if (dyn.isPruned(l)) return 0.004; const wn = Math.min(1, l.weff / 6), molK = l.source.mol || l.target.mol ? 0.25 : 1;   // a molecule sits in its own cell; its wires are drawn, not pulled hard
          return (l.source.type === 'day' || l.target.type === 'day' ? 0.02 : crossBrain(l) ? (isChild(l.source) || isChild(l.target) ? 0.001 : 0.015) : l.source.lobe !== l.target.lobe ? 0.06 + 0.04 * wn : 0.2 + 0.2 * wn) * molK; }
        if (l.kind === 'st') return 0.15;
        // on a network screen, synapse and source tethers that reach into another brain stay slack: a thousand
        // word → meaning wires would otherwise drag every brain into the callosum
        if (l.kind === 'sx') return crossBrain(l) ? 0.003 : 0.03;
        if (l.kind === 'sr') return crossBrain(l) ? 0.01 : l.source.pageNodes.length > 1 ? 0.12 : 0.5;
        if (l.kind === 'pc') return 0.6;
        return 0.01;
      };
      const charge = n => this.mapped() ? -2 : n.isCenter ? -1200 : isChild(n) ? -(30 + n.nSyn * 3) * this.depthF - 1 : -170 - n.nSyn * 6 - n.children.length * 40 - (n.hub ? 60 : 0);
      const pageCharge = d3.forceManyBody().strength(charge).theta(0.9).distanceMax(900);
      const chargeForce = Object.assign(a => pageCharge(a), { initialize: (nodes, rnd) => pageCharge.initialize(nodes.filter(n => n.kind === 'page' && !isAtom(n)), rnd), strength: f => (pageCharge.strength(f), chargeForce) });
      // genome layout: a folded sub-neuron sits inside its parent, so it must not collide with it until it has unfolded
      const collideR = n => n.kind === 'page' ? (this.mapped() ? (isChild(n) ? this.depthF : 1) * (n.r + 4) : n.r + 6) : n.kind === 'syn' ? (this.mapped() ? 2.5 : 1 + 4 * this.explodeF) : 1 + 3.5 * this.explodeF;
      // a neuron that unfolds into a molecule keeps the molecule's radius clear around it at every depth: room that
      // appeared only while unfolded would move the layout under a reader's feet when the selected neuron is released
      const pageCollideR = n => this.mapped() ? (isChild(n) ? this.depthF : 1) * (n.r + 2) + this.molR(n) : isChild(n) ? this.depthF * (n.r + 6 + this.explodeF * (n.nSyn ? this.orbitR(n) + 8 : 0)) : n.r + 10 + (n.mol ? this.molR(n) + 0.25 * Math.max(0, this.explodeF * (this.orbitR(n) + 14) - this.molR(n)) : this.explodeF * (n.nSyn ? this.orbitR(n) + 14 : 0)) + this.depthF * (n.children.length ? 20 : 0);   // a molecule's facts may orbit into the slack the link distances leave, so exploding barely moves the layout
      const pageCollide = d3.forceCollide().radius(pageCollideR).strength(0.7).iterations(2);
      const pageCollideForce = Object.assign(a => pageCollide(a), { initialize: (nodes, rnd) => pageCollide.initialize(nodes.filter(n => n.kind === 'page' && !isAtom(n)), rnd), radius: f => (pageCollide.radius(f), pageCollideForce) });
      const nodeCollide = d3.forceCollide().radius(collideR).iterations(2);
      const collideForce = Object.assign(a => nodeCollide(a), { initialize: (nodes, rnd) => nodeCollide.initialize(nodes.filter(n => !isAtom(n)), rnd), radius: f => (nodeCollide.radius(f), collideForce) });
      // molecule force: every atom sits exactly at its parent plus its drawing offset, scaled by the unfolding tween, so the
      // structural formula keeps its shape at any zoom and follows the parent wherever the layout or the reader moves it
      const moleculeForce = () => {
        const f = this.depthF;
        for (const n of this.activeNodes) { if (!n.isAtom) continue; const p = n.parent; n.x = p.x + n.mdx * f; n.y = p.y + n.mdy * f; n.vx = 0; n.vy = 0; }
      };
      const orbitForce = alpha => {
        const st = 0.3 * alpha;
        const g = this.genome(), tb = this.table();
        for (const n of this.activeNodes) {
          if (n.kind !== 'syn') continue;
          const p = pageById[n.page];
          if (tb && p.gux !== undefined) {   // table layout: a chair's ladder runs inward across the table; a sub-neuron's runs outward, away from the ring
            const dir = isChild(p) ? 1 : -1, d = (p.r * 1.3 + 8 + n.ordinal * this.G.synPitch) * this.explodeF + 2;
            n.vx += (p.x + dir * p.gux * d - n.x) * st; n.vy += (p.y + dir * p.guy * d - n.y) * st; continue;
          }
          if (g) {   // genome layout: a ladder of synapses on the locus line, to the right of the bar (to the left of a sub-neuron)
            const side = isChild(p) ? -1 : 1, gx = p.x + side * ((p.r * 1.3 + 8 + n.ordinal * this.G.synPitch) * this.explodeF + 2);
            n.vx += (gx - n.x) * st; n.vy += (p.y - n.y) * st; continue;
          }
          const a = p.spin + (n.ordinal / p.nSyn) * Math.PI * 2, rr = (this.orbitR(p) + (n.ordinal % 2 ? 7 : -5)) * this.explodeF + 2;
          n.vx += (p.x + Math.cos(a) * rr - n.x) * st; n.vy += (p.y + Math.sin(a) * rr - n.y) * st;
        }
      };
      const childOrbitForce = alpha => {
        const st = 0.25 * alpha * this.depthF; if (st <= 0 || this.mapped()) return;   // genome / table layout: sub-neurons are anchored to their own slot instead
        for (const n of this.activeNodes) {
          if (!isChild(n) || n.isAtom) continue;
          const p = n.parent, m = p.children.length, i = p.children.indexOf(n), a = p.spin + Math.PI / 2 + (i / m) * Math.PI * 2, rr = this.childRingR(p);
          n.vx += (p.x + Math.cos(a) * rr - n.x) * st; n.vy += (p.y + Math.sin(a) * rr - n.y) * st;
        }
      };
      // bridging force: a connector hub is drawn toward the weighted centre of the lobes it links, in proportion to its participation
      const bridgeForce = alpha => {
        if (this.mapped()) return;   // loci, not bridges, place the hubs in the karyogram
        const st = 0.05 * alpha * (this.helix ? 0.4 : 1), rk = this.ringK();   // on a helix the rungs, not the bridges, carry the geometry
        for (const n of this.activeNodes) {
          if (n.kind !== 'page' || isChild(n) || n.isSelf || !n.hub || n.part < 0.3 || n.ax !== undefined || n.at) continue;   // connector / global hubs only; a molecule keeps its cell
          let x = 0, y = 0, w = 0;
          for (const { n: m, l } of n.neighbors) { if (dyn.isPruned(l) || !m.active) continue; const a = anchor[m.lobe]; if (!a) continue; x += a.x * rk * l.weff; y += a.y * rk * l.weff; w += l.weff; }
          if (!w) continue; const k = st * Math.min(1, n.part);
          n.vx += (x / w - n.x) * k; n.vy += (y / w - n.y) * k;
        }
      };
      const helixK = this.helix ? 1.9 : 1;   // strands are closer than the ring, so lobes hold their rung a little tighter
      // genome layout: every neuron (sub-neurons included) is pulled firmly onto its locus; the lobe anchors are not used
      // `at` (a grown neuron's offset from its lobe anchor, e.g. a shore on a drawn coastline) holds it to that spot in the neural layout only
      const anchorX = n => this.mapped() && n.gx !== undefined ? (isChild(n) ? n.parent.gx + this.depthF * n.gdx : n.gx) : n.at && !isChild(n) ? (anchor[n.lobe]?.x ?? 0) * this.ringK() + n.at.dx : n.ax !== undefined ? n.ax : (anchor[n.lobe]?.x ?? 0) * this.ringK();
      const anchorY = n => this.mapped() && n.gy !== undefined ? (isChild(n) ? n.parent.gy + this.depthF * n.gdy : n.gy) : n.at && !isChild(n) ? (anchor[n.lobe]?.y ?? 0) * this.ringK() + n.at.dy : n.ay !== undefined ? n.ay : (anchor[n.lobe]?.y ?? 0) * this.ringK();
      const anchorStrength = n => n.kind !== 'page' || isAtom(n) ? 0 : this.mapped() ? (n.gx !== undefined ? 0.9 : 0) : isChild(n) ? 0.02 : n.at ? 0.8 : n.isSelf ? (brainsIn ? 0.9 : 0.6) : n.type === 'day' ? 0.5 : (this.lobeSize[n.lobe] <= 4 ? 0.65 : this.lobeSize[n.lobe] <= 10 ? 0.5 : 0.3) * (brainsIn ? 1.7 : helixK) * (n.hub && n.part >= 0.3 ? 0.75 : 1);
      this.sim = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id).distance(linkDist).strength(linkStrength))
        .force('charge', chargeForce)
        .force('collide', collideForce)
        .force('orbit', orbitForce).force('childOrbit', childOrbitForce).force('bridge', bridgeForce).force('molecule', moleculeForce)
        .force('pageCollide', pageCollideForce)
        .force('x', d3.forceX(anchorX).strength(anchorStrength))
        .force('y', d3.forceY(anchorY).strength(anchorStrength))
        .alphaDecay(0.03).velocityDecay(0.35).stop();
      this.sim.on('tick.molecule', moleculeForce);   // again after integration, so atoms never trail a moving parent by a tick
      this._accessors = { linkDist, linkStrength, charge, collideR, pageCollideR, anchorX, anchorY, anchorStrength };
    }
    // D3 caches per-node strengths/radii when an accessor is set, so re-set them whenever explodeF/depthF/weights move
    refreshForces() { const a = this._accessors; this.sim.force('link').distance(a.linkDist).strength(a.linkStrength); this.sim.force('charge').strength(a.charge); this.sim.force('collide').radius(a.collideR); this.sim.force('pageCollide').radius(a.pageCollideR); this.sim.force('x').x(a.anchorX).strength(a.anchorStrength); this.sim.force('y').y(a.anchorY).strength(a.anchorStrength); }

    rebuild(visible, showCocite, warm) {
      const { M } = this;
      this.pageOn = p => p.kind === 'page' && visible(p);
      this.relayout(false);
      const vp = M.pages.filter(visible), vs = M.syns.filter(visible), vr = M.srcs.filter(visible);
      M.pages.forEach(p => { p.active = false; }); vp.forEach(p => { p.active = true; });
      this.activeNodes = [...vp, ...vs, ...vr]; const on = new Set(this.activeNodes);
      // genome layout: a source cited by several neurons would pull them together, so it is tethered to its first visible neuron only
      const srcT = this.mapped() ? M.srcTethers.filter(l => l.source.pageNodes.find(p => on.has(p)) === l.target) : M.srcTethers;
      this.activeLinks = [...M.pageLinks, ...M.childTethers, ...M.synTethers, ...M.synCross, ...srcT, ...(showCocite ? M.cociteLinks : [])].filter(l => on.has(l.source) && on.has(l.target));
      // bonds between atoms are drawn (and carry spikes) but never pull: the molecule force places the atoms
      this.activeBonds = (M.bondLinks || []).filter(l => on.has(l.source) && on.has(l.target));
      this.activeLinkSet = new Set([...this.activeLinks, ...this.activeBonds]);
      this.sim.nodes(this.activeNodes.filter(n => !n.isAtom)); this.sim.force('link').links(this.activeLinks);   // atoms are placed by the molecule force, not integrated by the simulation
      if (warm) { this.sim.alpha(1); for (let i = 0; i < (M.brainsIn ? 420 : 260); i++) this.sim.tick(); }
      this.sim.alpha(warm ? 0.25 : 0.5).restart();
    }
    // total wire length of the visible neuron graph (a wiring-cost readout for the connectome panel)
    wiringCost() { let s = 0; for (const l of this.activeLinks) if (l.kind === 'pp' && !this.dyn.isPruned(l)) s += Math.hypot(l.source.x - l.target.x, l.source.y - l.target.y); return s; }
  }
  window.MBN.Layout = Layout;
})();
