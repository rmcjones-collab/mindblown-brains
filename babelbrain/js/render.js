/* MindBlown Neural — render.js
   Canvas drawing. Reads the model, the layout (positions, explode/depth tweens) and the dynamics (activation field,
   spikes, learned weights, pruning) and paints one frame. Focus is a continuous activation field, not a 1-hop set:
   a neuron's brightness is its activation; a wire lights up with the weaker of its two ends.
   In the genome layout (G) the karyogram — bars, bands, centromeres, titles — stands in for the lobe halos, wires bend like
   Circos ribbons and labels sit beside their band like gene annotations.
   Grown material (anything with an `origin`, e.g. what the Guide's mice build) is marked with a thin red ring, and every signal that sets out from it — spikes, routed volleys, routes — is drawn in red along its path. */
window.MBN = window.MBN || {};
(() => {
  // Brains whose overview titles are placed with hard separation (no title/title or title/neuron overlap).
  const PHONE_STRICT_TITLE_BRAINS = new Set(['brain42']);   // few, spread-out lobes: soft placement reads better on wide screens
  const STRICT_TITLE_BRAINS = new Set(['chess-network', 'dna', 'elements', 'cellular', 'biosphere', 'seti', 'atomic', 'higgs', 'quantum', 'molecular', 'body', 'babel', 'particles', 'chemistry', 'guide']);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const colorCache = {};
  const RED = '#ff3b3b';
  // Origin colours: grown material carries an `origin` tag (mice, entangled, ...) and every signal that sets out from it travels in
  // that origin's colour. Unknown tags fall back to the mice red so older builders keep their look. Add-ons register their own
  // colour with MBN.registerOrigin(tag, hex) before the engine boots (or at any time: the registry is read at draw time).
  const ORIGIN_COLORS = (window.MBN = window.MBN || {}).originColors = window.MBN.originColors || { mice: RED };
  const originColor = tag => (tag && ORIGIN_COLORS[tag]) || RED;
  window.MBN.originColor = originColor;
  window.MBN.registerOrigin = (tag, hex) => { if (typeof tag === 'string' && /^#[0-9a-f]{6}$/i.test(hex || '')) ORIGIN_COLORS[tag] = hex; return ORIGIN_COLORS[tag]; };
  const rgba = (hex, a) => { const key = hex + '|' + (a = Math.round(a * 1000) / 1000); if (colorCache[key]) return colorCache[key]; const c = d3.color(hex) || d3.color('#9aa'); c.opacity = a; return (colorCache[key] = c.formatRgb()); };

  class Renderer {
    constructor(canvas, M, L, dyn, view) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.M = M; this.L = L; this.dyn = dyn; this.view = view;
      this.W = 0; this.H = 0; this.dpr = 1;
      this.showCommunities = false; this.showHubs = true; this.route = null;   // route: {path, club}
      // labels toggle: state.labelF (0..1) fades every label out; labelFilter(node, state) names the nodes that keep theirs (default: the hovered one)
      this.labelFilter = (n, state) => n === state.hover || n === state.selected;   // the selected neuron keeps its label too, so labels-off still reads on touch screens (no hover)
      this.labelsDrawn = new Set();   // ids of the neurons whose label was painted this frame (read by the QA harness)
      this.resize(); window.addEventListener('resize', () => this.resize());
    }
    resize() { this.dpr = Math.min(window.devicePixelRatio || 1, 2); this.W = this.canvas.clientWidth; this.H = this.canvas.clientHeight; this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr; }
    // ---------- genome layout drawing ----------
    // connections bend in the genome layout: along one chromosome they bow out to the right like a Circos ribbon, between chromosomes they arch
    ctrlOf(l) {
      const L = this.L; if (!L.genome()) return null;
      const a = l.source, b = l.target, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (L.sameChromo(a, b)) return [mx + L.G.barW / 2 + 22 + Math.abs(b.y - a.y) * 0.25, my];
      return [mx, my - Math.min(260, 14 + Math.abs(b.x - a.x) * 0.16)];
    }
    linkPoint(l, s, e, t) { const c = this.ctrlOf(l); if (!c) return [s.x + (e.x - s.x) * t, s.y + (e.y - s.y) * t]; const u = 1 - t; return [u * u * s.x + 2 * u * t * c[0] + t * t * e.x, u * u * s.y + 2 * u * t * c[1] + t * t * e.y]; }
    // break a chromosome title into up to three lines that fit the column; the last line is cut with an ellipsis
    wrapTitle(text, maxW, lines = 3) {
      const ctx = this.ctx, words = String(text).split(/\s+/), out = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; } }
      if (cur) out.push(cur);
      if (out.length > lines) { out.length = lines; out[lines - 1] += ' …'; }
      // a line that still overflows (a single long word, or the overflow marker) is cut with an ellipsis so columns never collide
      return out.map(ln => { if (ctx.measureText(ln).width <= maxW) return ln; let t = ln.replace(/ …$/, ''); while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t + '…'; });
    }
    roundRect(x, y, w, h, r) { const ctx = this.ctx; r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    drawKaryogram(titleVis, lobeOn, state) {
      const { ctx, L, M, view } = this, { k, tx, ty } = view, dpr = this.dpr, G = L.G, hw = G.barW / 2, sw = px => px / k;
      const toScreen = (x, y) => [x * k + tx, y * k + ty], mobile = window.innerWidth <= 900, pageOn = L.pageOn;
      L.chromos.forEach(c => {
        if (!c.on) return;
        const x = c.x, pTop = c.top, pBot = c.cy - c.hubH / 2, qTop = c.cy + c.hubH / 2, qBot = c.bot;
        const arms = [[pTop, pBot], [qTop, qBot]].filter(([a, b]) => b - a > 1);
        // arms: rounded bars, banded by locus in the lobe colour at alternating density (the G-banding), clipped to the arm shape
        arms.forEach(([a, b]) => {
          this.roundRect(x - hw, a, G.barW, b - a, hw);
          ctx.fillStyle = rgba(c.color, 0.08); ctx.fill();
          ctx.save(); ctx.clip();
          let y = c.top; c.loci.forEach((p, i) => { if (i === c.cIdx) y += c.hubH; const h = c.hs[i]; if (y < b && y + h > a) { ctx.fillStyle = rgba(this.lobeColor(p), i % 2 ? 0.30 : 0.14); ctx.fillRect(x - hw, Math.max(y, a), G.barW, Math.min(y + h, b) - Math.max(y, a)); } y += h; });
          ctx.restore();
          this.roundRect(x - hw, a, G.barW, b - a, hw); ctx.lineWidth = sw(1); ctx.strokeStyle = rgba(c.color, 0.45); ctx.stroke();
        });
        // centromere: a waist between the arms, where the hub neuron sits on a network screen
        if (arms.length === 2) {
          const wy = c.hubH / 2, wx = hw * (c.hubOn ? 0.55 : 0.4);
          ctx.beginPath(); ctx.moveTo(x - hw + sw(0.5), pBot); ctx.bezierCurveTo(x - hw, pBot + wy * 0.6, x - wx, c.cy - wy * 0.35, x - wx, c.cy); ctx.bezierCurveTo(x - wx, c.cy + wy * 0.35, x - hw, qTop - wy * 0.6, x - hw + sw(0.5), qTop);
          ctx.lineTo(x + hw - sw(0.5), qTop); ctx.bezierCurveTo(x + hw, qTop - wy * 0.6, x + wx, c.cy + wy * 0.35, x + wx, c.cy); ctx.bezierCurveTo(x + wx, c.cy - wy * 0.35, x + hw, pBot + wy * 0.6, x + hw - sw(0.5), pBot); ctx.closePath();
          ctx.fillStyle = rgba(c.color, 0.16); ctx.fill(); ctx.lineWidth = sw(1); ctx.strokeStyle = rgba(c.color, 0.45); ctx.stroke();
        }
        // Chromosome annotations follow the same labels toggle and hover policy as neural lobe titles.
        const hovered = state.mouseW && Math.abs(state.mouseW[0] - x) <= hw + sw(12) && state.mouseW[1] >= c.top && state.mouseW[1] <= c.bot;
        const tl = Math.max(state.labelF ?? 1, hovered ? 1 : 0);
        // p / q arm marks, like a cytogenetic map
        if (arms.length === 2 && k > 0.42 && tl > 0.02) {
          ctx.font = `500 ${sw(10)}px 'Satoshi', sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba(c.color, 0.5 * clamp01((k - 0.42) / 0.3) * tl);
          ctx.fillText('p', x - hw - sw(6), (pTop + pBot) / 2); ctx.fillText('q', x - hw - sw(6), (qTop + qBot) / 2);
        }
        // title above the bar and a count below it, at screen size like the lobe titles; names fade out once the columns are too tight to hold them
        const [sx, sy] = toScreen(x, c.top), [, sb] = toScreen(x, c.bot);
        const pitch = (G.barW + G.gapX + c.reachL + c.reachR) * k - 8;
        const v = titleVis * clamp01((pitch - 18) / 26) * tl; if (v < 0.02) return;
        const fs = Math.max(9.5, Math.min(mobile ? 11 : 14, 10 + Math.sqrt(c.loci.length) * 1.2)), fs2 = Math.max(9, fs - 3);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.font = `600 ${fs}px 'Clash Display', 'Satoshi', sans-serif`; ctx.fillStyle = rgba(c.color, 0.9 * v);
        const lines = this.wrapTitle(c.name, Math.max(40, pitch)); lines.forEach((ln, i) => ctx.fillText(ln, sx, sy - 10 - (lines.length - 1 - i) * (fs + 2)));
        const subs = d3.sum(c.loci, p => p.children.filter(pageOn).length), syn = d3.sum(c.loci, p => p.nSyn) + (c.hubOn ? c.hubOn.nSyn : 0);
        ctx.font = `500 ${fs2}px 'Satoshi', sans-serif`; ctx.textBaseline = 'top'; ctx.fillStyle = rgba('#a7b2cc', 0.8 * v);
        ctx.fillText(`${c.loci.length + (c.hubOn ? 1 : 0)}${subs ? `+${subs}` : ''} · ${syn}`, sx, sb + 8);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(tx, ty); ctx.scale(k, k);
      });
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    }
    // ---------- table layout drawing (T) ----------
    // the table top is a faint empty disc; each seat is an arc of the ring in its colour, banded chair by chair like the karyogram's bars; a
    // card with the seat's name and counts stands outside the ring at the seat's middle angle, clear of the chairs' outward labels
    drawTable(titleVis, state, tl) {
      const { ctx, L, view } = this, { k, tx, ty } = view, dpr = this.dpr, R = L.tableR, hw = L.TB.ring / 2, sw = px => px / k;
      const toScreen = (x, y) => [x * k + tx, y * k + ty], mobile = window.innerWidth <= 900, pageOn = L.pageOn, depthF = L.depthF, explodeF = L.explodeF;
      const sector = (r0, r1, a0, a1) => { ctx.beginPath(); ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, r0, a1, a0, true); ctx.closePath(); };
      const inArc = (ang, a0, a1) => { let d = ang - a0; d -= Math.floor(d / (Math.PI * 2)) * Math.PI * 2; return d <= a1 - a0; };
      ctx.beginPath(); ctx.arc(0, 0, R - hw - 6, 0, Math.PI * 2); ctx.fillStyle = rgba('#a7b2cc', 0.025); ctx.fill();
      ctx.lineWidth = sw(1); ctx.strokeStyle = rgba('#a7b2cc', 0.08); ctx.stroke();
      const mouseW = state.mouseW, mAng = mouseW ? Math.atan2(mouseW[1], mouseW[0]) : 0, mRad = mouseW ? Math.hypot(mouseW[0], mouseW[1]) : -1;
      const qBox = (() => { const el = document.querySelector('.search') || document.getElementById('q'); const r = el && el.getBoundingClientRect(); return r && r.width ? r : null; })();
      const railL = (() => { const el = document.getElementById('tools'); const r = el && el.getBoundingClientRect(); return r && r.width ? r.left - 6 : this.W - 8; })();
      // the phone bar hides while the detail sheet is open; then --mbar-h (the sheet's height) is the bottom reservation, as for the titles
      const barTop = (() => { const el = document.getElementById('mbar'); const r = el && el.getBoundingClientRect(); if (r && r.height) return r.top; const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h')); return this.H - (h > 0 ? h : 56); })();
      (L.seats || []).forEach(c => {
        if (!c.on) return;
        sector(R - hw, R + hw, c.a0, c.a1); ctx.fillStyle = rgba(c.color, 0.08); ctx.fill();
        // a chair with sub-neurons holds a slot wide enough for them; until they stand up (depth level) only the chair's own width is dense
        let a = c.a0; c.loci.forEach((p, i) => {
          const w = c.ws[i] / R, own = Math.min(w, (2 * p.r * 1.6 + 8) / R), al = i % 2 ? 0.30 : 0.14;
          if (w - own > 0.001 && depthF < 0.97) {
            sector(R - hw, R + hw, a, a + w); ctx.fillStyle = rgba(this.lobeColor(p), al * (0.35 + 0.65 * depthF)); ctx.fill();
            sector(R - hw, R + hw, a + (w - own) / 2, a + (w + own) / 2); ctx.fillStyle = rgba(this.lobeColor(p), al * (1 - depthF)); ctx.fill();
          } else { sector(R - hw, R + hw, a, a + w); ctx.fillStyle = rgba(this.lobeColor(p), al); ctx.fill(); }
          a += w;
        });
        sector(R - hw, R + hw, c.a0, c.a1); ctx.lineWidth = sw(1); ctx.strokeStyle = rgba(c.color, 0.45); ctx.stroke();
        const hovered = mouseW && mRad > R - hw - 30 && mRad < R + hw + 60 && inArc(mAng, c.a0 - 0.02, c.a1 + 0.02);
        const pitch = (c.a1 - c.a0) * R * k;
        const v = titleVis * Math.max(tl, hovered ? 1 : 0.55) * (hovered ? 1 : clamp01((pitch - 8) / 14)); if (v < 0.02) return;
        // the card stands past the sub-neurons behind the chairs and, once exploded, their ladders
        const out = hw + depthF * c.kidR + explodeF * c.kidSyn, cx = Math.cos(c.am), cy = Math.sin(c.am), [sx, sy] = toScreen((R + out) * cx, (R + out) * cy);
        // chairs near the card's angle carry their labels outward under it, so the card steps past the longest (measured); the push follows the
        // labels' own visibility, so a label drawn at all (even faint) is one the card must not sit on
        const outward = p => !(p.children.some(pageOn) && depthF > 0.5), nearCard = p => Math.abs(Math.sin(p.ga - c.am)) * (R + hw) * k < 48;
        ctx.font = `500 ${sw(12)}px 'Satoshi', sans-serif`;
        const under = c.loci.filter(p => outward(p) && nearCard(p)), lblF = under.some(p => p === state.hover) ? 1 : (this.labelVisOf ? Math.max(0, ...under.map(p => clamp01(this.labelVisOf(p) * 25))) : tl);
        let reach = under.length ? Math.max(...under.map(p => (p.r / Math.pow(k, 0.45) + sw(6)) * k + ctx.measureText(p.title).width * k + 10)) : 0;
        if (depthF > 0.5) {
          ctx.font = `500 ${sw(10.5)}px 'Satoshi', sans-serif`;
          const kidsUnder = c.loci.flatMap(p => p.children.filter(x => pageOn(x) && Math.abs(Math.sin(Math.atan2(x.gy, x.gx) - c.am)) * (R + hw) * k < 48));
          if (kidsUnder.length) reach = Math.max(reach, clamp01((k - 1.05) / 0.1) * depthF * Math.max(...kidsUnder.map(x => (x.r / Math.pow(k, 0.45) + sw(6)) * k + ctx.measureText(x.title).width * k + 10)));
        }
        let push = 14 + (lblF > 0.01 ? reach : 0);   // full measured reach as soon as a label paints (canonical #42); the on-screen fallback below still applies
        const fs = Math.max(9.5, Math.min(mobile ? 11 : 14, 10 + Math.sqrt(c.loci.length) * 1.2)), fs2 = Math.max(9, fs - 3);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textAlign = cx > 0.2 ? 'left' : cx < -0.2 ? 'right' : 'center'; ctx.textBaseline = 'middle';
        ctx.font = `600 ${fs}px 'Clash Display', 'Satoshi', sans-serif`;
        const lines = this.wrapTitle(c.name, 150), lh = fs + 2, block = lines.length * lh + fs2 + 4;
        // the card stays on screen: on a small screen at a far fit the labels outreach the table, so when stepping past them would put the card
        // off screen (or under the search bar) it keeps its near place; a card beside the labels beats one nobody can see
        // the card's width covers its title lines and its count line, each in its own font
        const subs = d3.sum(c.loci, p => p.children.filter(pageOn).length), syn = d3.sum(c.loci, p => p.nSyn), count = `${c.loci.length}${subs ? `+${subs}` : ''} · ${syn}`;
        let bw = Math.max(...lines.map(ln => ctx.measureText(ln).width));
        ctx.font = `500 ${fs2}px 'Satoshi', sans-serif`; bw = Math.max(bw, ctx.measureText(count).width); ctx.font = `600 ${fs}px 'Clash Display', 'Satoshi', sans-serif`;
        const al = ctx.textAlign === 'left' ? 0 : ctx.textAlign === 'right' ? 1 : 0.5;
        const place = d => { const x = sx + cx * d, t = sy + cy * d - block / 2 + (cy * block) / 2, l = x - bw * al, r = x + bw * (1 - al);
          const t0 = qBox && l < qBox.right && r > qBox.left ? qBox.bottom + 6 : 8;
          // in the search box's columns a card is fine wholly above or wholly below it (6 px clear), never across it (canonical #42)
          const clear = t0 === 8 || t + block <= qBox.top - 6 || t >= t0;
          return { x, t, l, r, t0, ok: l >= 8 && r <= railL && t >= 8 && clear && t + block <= barTop - 8 }; };
        let at = place(push); if (!at.ok && push > 14) { push = 14; at = place(14); }
        if (!at.ok) {   // still off the edge (a phone at a far fit): slide the card just inside the screen, clear of the tool rail and the bars
          at.x += Math.max(0, 8 - at.l) - Math.max(0, at.r - railL); at.t = Math.max(8, Math.min(barTop - 8 - block, at.t));
          // the slide may have moved the card into the search box's columns: recheck, then take the slot above or below it, else no card
          const l2 = at.x - bw * al, r2 = at.x + bw * (1 - al);
          if (qBox && l2 < qBox.right && r2 > qBox.left && at.t + block > qBox.top - 6 && at.t < qBox.bottom + 6) {
            if (qBox.top - 6 - block >= 8) at.t = qBox.top - 6 - block; else if (qBox.bottom + 6 + block <= barTop - 8) at.t = qBox.bottom + 6; else at = null;
          }
          if (at && (at.t < 8 || at.t + block > barTop - 8 || l2 < 8 || r2 > railL)) at = null;   // still no room on screen
          if (!at && !hovered) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(tx, ty); ctx.scale(k, k); return; }
          if (!at) at = place(14);   // a hovered seat always shows its card, at its near place
        }
        // a dense table (Chemistry has 20 seats) can bring two cards together at a far fit: the later one waits for hover instead of overprinting
        const box = { id: c.id, x0: at.x - bw * al - 4, x1: at.x + bw * (1 - al) + 4, y0: at.t - 2, y1: at.t + block + 2 }, boxes = this.cardBoxes || (this.cardBoxes = []);
        if (!hovered && boxes.some(b => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(tx, ty); ctx.scale(k, k); return; }
        ctx.fillStyle = rgba(c.color, 0.9 * v);
        lines.forEach((ln, i) => ctx.fillText(ln, at.x, at.t + lh / 2 + i * lh));
        ctx.font = `500 ${fs2}px 'Satoshi', sans-serif`; ctx.fillStyle = rgba('#a7b2cc', 0.8 * v);
        ctx.fillText(count, at.x, at.t + lines.length * lh + 4 + fs2 / 2);
        boxes.push(box);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(tx, ty); ctx.scale(k, k);
      });
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    }
    lobeColor(n) { return n.isAtom ? n.atom.color : this.showCommunities && n.kind === 'page' && n.comm !== undefined ? this.M.commColor[n.comm] : this.M.lobeById[n.lobe]?.color || '#9aa'; }
    // how far a neuron's unfolded molecule reaches, in world units, at the current depth tween
    molReach(n) { return n.mol ? this.L.depthF * (n.mol.re + 8) : 0; }

    draw(now, state) {
      const { ctx, M, L, dyn, view } = this; const { k, tx, ty } = view; const { W, H, dpr } = this;
      const { pageById, isChild, lobes } = M; const explodeF = L.explodeF, depthF = L.depthF;
      const { selected, hover, pulseSyn, multi, marquee, lobeOn, forceExplode, showCocite, plural, mouseW } = state;
      const keep = n => this.labelFilter(n, state), labelF = state.labelF ?? 1, labelOf = n => keep(n) ? 1 : labelF;   // kept nodes also bypass the activation guard on their label
      const labelsDrawn = this.labelsDrawn; labelsDrawn.clear();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.translate(tx, ty); ctx.scale(k, k);
      const sw = px => px / k;
      const toScreen = (x, y) => [x * k + tx, y * k + ty];
      const lobeVis = clamp01((1.05 - k) / 0.45), synVis = forceExplode ? 1 : clamp01((k - 1.25) / 0.45), labelVis = clamp01((k - 0.62) / 0.4);
      const synLabelVisAll = clamp01((k - 3.4) / 0.6), synLabelVisFocus = clamp01((k - 1.6) / 0.4), srcLabelVis = clamp01((k - 3.2) / 0.8), childLabelVis = clamp01((k - 1.05) / 0.4) * depthF;
      const focus = selected || hover; const focusing = !!focus || dyn.act.size > 0;
      // activation of any node: pages carry their own; synapses/sources borrow their page's
      const actOf = n => n.kind === 'page' ? dyn.activation(n) : n.kind === 'syn' ? dyn.activation(pageById[n.page]) : Math.max(...n.pageNodes.map(p => dyn.activation(p)));
      const focusA = n => focusing ? 0.14 + 0.86 * actOf(n) : 1;     // brightness multiplier under focus
      const nodeR = n => n.kind === 'page' ? n.r / Math.pow(k, 0.45) * (isChild(n) ? 0.35 + 0.65 * depthF : 1) : n.kind === 'syn' ? sw(3.2) : sw(2.4);
      const depthA = n => n.kind === 'page' ? (isChild(n) ? depthF : 1) : n.kind === 'syn' ? (isChild(pageById[n.page]) ? depthF : 1) : 1;
      const [vx0, vy0] = view.toWorld(-80, -80), [vx1, vy1] = view.toWorld(W + 80, H + 80);
      const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
      const routeSet = this.route ? new Set(this.route.path) : null;
      const routeEdge = l => routeSet && routeSet.has(l.source) && routeSet.has(l.target) && Math.abs(this.route.path.indexOf(l.source) - this.route.path.indexOf(l.target)) === 1;
      const genome = L.genome(), table = L.table(), mapped = genome || table;
      // a neuron's label visibility, before the hover/labels filter (the table cards read it to know which labels they must step past)
      const labelVisRaw = n => { const important = n.isSelf || n.hub || n.club || n.r > 12.5; return isChild(n) ? childLabelVis : n.isSelf ? 1 : important ? Math.max(labelVis, clamp01((k - 0.45) / 0.25)) : labelVis; };
      this.labelVisOf = n => labelVisRaw(n) * labelOf(n);

      // ---------- genome layout: the karyogram (bars, bands, centromeres, titles) stands in for the lobe halos ----------
      if (genome) this.drawKaryogram(clamp01((1.7 - k) / 0.6), lobeOn, state);
      // ---------- table layout: the ring of seats stands in for the lobe halos ----------
      this.cardBoxes = [];
      if (table) this.drawTable(clamp01((1.7 - k) / 0.6), state, labelF);

      // ---------- double-helix backbone (helix layouts only) ----------
      // Two sugar-phosphate ribbons wound around the x axis, drawn in world space behind everything else. Depth is
      // faked from the phase: the strand nearer the viewer (cos θ > 0) is wider and brighter. Thin rungs every few
      // world units are the base pairs, coloured in complementary halves; the heavy rungs join the paired lobes.
      if (L.helix && !mapped) {
        const Hx = L.helix, fade = clamp01((2.2 - k) / 1.2);   // the backbone gives way once the reader is down among the facts
        if (fade > 0.02) {
          const yOf = (x, s) => (s ? -1 : 1) * Hx.A * Math.sin(Hx.theta(x)), depth = (x, s) => (s ? -1 : 1) * Math.cos(Hx.theta(x));
          const stepX = 9, rungEvery = Hx.step / 7, basePairs = [['#fbbf24', '#60a5fa'], ['#34d399', '#f87171']];
          // rungs first (they sit behind both ribbons)
          ctx.lineCap = 'round';
          for (let x = Hx.x0, j = 0; x <= Hx.x1; x += rungEvery, j++) {
            const ya = yOf(x, 0), yb = yOf(x, 1); if (Math.abs(ya - yb) < 24) continue;
            const pair = basePairs[j % 2], flip = (j >> 1) % 2, ca = pair[flip ? 1 : 0], cb = pair[flip ? 0 : 1], ym = (ya + yb) / 2;
            ctx.lineWidth = 6; ctx.strokeStyle = rgba(ca, 0.2 * fade); ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x, ym); ctx.stroke();
            ctx.strokeStyle = rgba(cb, 0.2 * fade); ctx.beginPath(); ctx.moveTo(x, ym); ctx.lineTo(x, yb); ctx.stroke();
          }
          for (const [a, b] of Hx.pairs) {
            if (!lobeOn[a] || !lobeOn[b]) continue; const pa = L.anchor[a], pb = L.anchor[b]; if (!pa || !pb) continue;
            ctx.lineWidth = 3.5; ctx.setLineDash([14, 10]); ctx.strokeStyle = rgba('#dbe4ff', 0.28 * fade); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); ctx.setLineDash([]);
          }
          // ribbons: each strand is split into back-facing and front-facing runs (by the sign of its depth) and every run
          // is filled as one variable-width polygon, so the strand stays smooth at any zoom and each crossing reads as
          // over/under. Width and brightness follow the depth; the alpha is sampled at the run's midpoint.
          const outline = (xs, s, sign) => {
            const top = [], bot = [];
            for (const x of xs) {
              const y = yOf(x, s), d = depth(x, s), hw = (15 + 9 * d) / 2;
              const dydx = (yOf(x + 1, s) - yOf(x - 1, s)) / 2, nl = Math.hypot(1, dydx), nx = -dydx / nl, ny = 1 / nl;
              top.push([x + nx * hw, y + ny * hw]); bot.push([x - nx * hw, y - ny * hw]);
            }
            ctx.beginPath(); top.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); bot.reverse().forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath();
            const xm = xs[xs.length >> 1]; ctx.fillStyle = rgba(Hx.colors[s], (0.24 + 0.18 * depth(xm, s)) * fade); ctx.fill();
          };
          for (const front of [false, true]) for (const s of [0, 1]) {
            const xs = []; for (let x = Hx.x0; x < Hx.x1; x += stepX) xs.push(x); xs.push(Hx.x1);
            let run = [];
            for (const x of xs) {
              const on = front ? depth(x, s) >= 0 : depth(x, s) < 0;
              if (on) run.push(x);
              if ((!on || x === Hx.x1) && run.length > 1) outline(run, s, front);
              if (!on) run = [];
            }
          }
          ctx.lineCap = 'butt';
        }
      }

      // ---------- coastlines (a designed world's scenery; neural layout only) ----------
      // A grown lobe may carry a closed outline (lobe.coast, offsets from its anchor). It is drawn here, under halos, wires and
      // neurons: a faint land wash, a wide soft surf band and a hairline shore in the lobe's colour, never dashed or pulsed, so it
      // reads as a map and is never mistaken for a wire. The genome layout has no geography and draws none.
      let coastsDrawn = 0;
      if (!mapped) {
        const rk = L.ringK();
        for (const l of lobes) {
          const c = l.coast; if (!c || !lobeOn[l.id]) continue; const a = L.anchor[l.id]; if (!a) continue;
          const ox = a.x * rk, oy = a.y * rk, P = c.pts, n = P.length;
          const mid = i => { const p = P[i], q = P[(i + 1) % n]; return [ox + (p[0] + q[0]) / 2, oy + (p[1] + q[1]) / 2]; };
          ctx.beginPath(); const m0 = mid(n - 1); ctx.moveTo(m0[0], m0[1]);
          for (let i = 0; i < n; i++) { const m = mid(i); ctx.quadraticCurveTo(ox + P[i][0], oy + P[i][1], m[0], m[1]); }
          ctx.closePath(); ctx.setLineDash([]); ctx.lineJoin = 'round';
          ctx.fillStyle = rgba(l.color, 0.07); ctx.fill();
          ctx.strokeStyle = rgba(l.color, 0.09); ctx.lineWidth = sw(9); ctx.stroke();   // screen-constant widths: a map line, not a road
          ctx.strokeStyle = rgba(l.color, 0.5); ctx.lineWidth = sw(1.6); ctx.stroke();
          coastsDrawn++;
        }
      }
      this.coastsDrawn = coastsDrawn;   // read-only QA hook: coastlines drawn in the last frame

      // ---------- lobe halos + titles ----------
      // halos are drawn here, under everything; the title text is placed now but drawn after the neurons (titleDraws)
      const titleDraws = []; this.titleBoxes = []; MBN.titleBoxes = this.titleBoxes;   // read-only QA hook: last frame's placed titles
      if (lobeVis > 0 && !mapped) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        const atomsByLobe = this.atomsByLobe || (this.atomsByLobe = d3.rollup(M.atoms || [], v => v.length, a => a.lobe));
        const circles = lobes.filter(l => lobeOn[l.id] && !M.selfLobe(l)).map(l => {
          const ps = M.pages.filter(p => p.lobe === l.id && !p.isAtom); if (!ps.length) return null;   // atoms ride with their molecule: they size nothing here
          const cx = d3.mean(ps, p => p.x), cy = d3.mean(ps, p => p.y);
          const rr = Math.max(44, d3.quantile(ps.map(p => Math.hypot(p.x - cx, p.y - cy)).sort(d3.ascending), 0.92) + 48);
          const [sx, sy] = toScreen(cx, cy); return { l, ps, cx, cy, rr, sx, sy, sr: rr * k };
        }).filter(Boolean).sort((a, b) => {
          // The shared bridge is the entry point on this owner preview.
          if (M.D.brain === 'particles' && window.innerWidth <= 900) {
            if (a.l.id === 'shared') return -1;
            if (b.l.id === 'shared') return 1;
          }
          return b.ps.length - a.ps.length;
        });
        const placed = [];
        const phone = window.innerWidth <= 900, particlePhone = M.D.brain === 'particles' && phone;
        // Brains whose crowded overviews let titles collide take hard title separation; others keep the soft placement.
        const strictBrain = STRICT_TITLE_BRAINS.has(M.D.brain) || (phone && PHONE_STRICT_TITLE_BRAINS.has(M.D.brain)), strictTitles = strictBrain || particlePhone || M.D.brain === 'chemistry';
        const guardedTitles = !phone && PHONE_STRICT_TITLE_BRAINS.has(M.D.brain);   // soft placement, but titles stay inside the canvas and off the controls
        const molTitles = M.hasMol && !L.helix;   // molecule brains: keep titles clear of the tool rail too
        const obstacles = particlePhone ? ['#zoom-ctl', '#tools', '#panel'].map(sel => document.querySelector(sel))
          .filter(el => el && !el.hidden && el.getClientRects().length).map(el => el.getBoundingClientRect()) : [];
        // bottom reserve on phones: the bar or open sheet (--mbar-h) plus a gap; a hidden bar (0px) falls back to the plain 70px margin
        const phoneBottom = () => { const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h')); return Number.isFinite(h) ? (h > 0 ? h + 12 : 70) : 160; };
        const edge = { x0: phone ? 8 : 238, x1: W - (molTitles && !phone ? 72 : 8), y0: strictTitles || phone ? Math.max(78, (document.getElementById('top')?.getBoundingClientRect().bottom || 64) + 12) : 78,
          // phones: every brain keeps titles above the options bar (or open sheet), not only the strict ones
          y1: H - (phone && document.getElementById('mbar') ? phoneBottom() : 70) };
        const offEdge = b => Math.max(0, edge.x0 - b.x) + Math.max(0, b.x + b.w - edge.x1) + Math.max(0, edge.y0 - b.y) + Math.max(0, b.y + b.h - edge.y1);
        const overlapBox = (b, q) => Math.max(0, Math.min(b.x + b.w, q.x + q.w) - Math.max(b.x, q.x)) * Math.max(0, Math.min(b.y + b.h, q.y + q.h) - Math.max(b.y, q.y));
        const circPen = (b, c) => Math.max(0, c.sr * 0.9 - Math.hypot(Math.max(b.x, Math.min(c.sx, b.x + b.w)) - c.sx, Math.max(b.y, Math.min(c.sy, b.y + b.h)) - c.sy));
        const dots = M.pages.filter(p => !isChild(p) && lobeOn[p.lobe] !== false).map(p => { const [x, y] = toScreen(p.x, p.y); return { x, y, lobe: p.lobe }; });
        if (L.helix && k < 2.2) for (let x = L.helix.x0; x <= L.helix.x1; x += 24) for (const st of [0, 1]) { const [sx, sy] = toScreen(x, (st ? -1 : 1) * L.helix.A * Math.sin(L.helix.theta(x))); dots.push({ x: sx, y: sy, lobe: null }); }   // keep titles off the ribbons
        const dotPen = (b, self, own) => { let n = 0; for (const d of dots) if (d.lobe !== self.l.id && !(own && d.lobe === null) && d.x > b.x - 6 && d.x < b.x + b.w + 6 && d.y > b.y - 4 && d.y < b.y + b.h + 4) n++; return n * (own ? 20 : 60); };
        const padX = strictBrain && phone ? 10 : 14, padY = strictBrain && phone ? 6 : 8, padded = b => ({ x: b.x - padX, y: b.y - padY, w: b.w + 2 * padX, h: b.h + 2 * padY });
        const coversNeuron = b => dots.some(d => d.lobe !== null && d.x > b.x - 12 && d.x < b.x + b.w + 12 && d.y > b.y - 12 && d.y < b.y + b.h + 12);
        // on-screen controls (header, tool and zoom columns, level pill, phone Lobes/Connectome buttons, phone Modifiers button and options bar, open reader) also block titles
        const controlIds = ['top', 'tools', 'zoom-ctl', 'level', 'lobes', 'connectome', 'panel', 'mb-drive', 'modifiers-open-phone', 'mbar'];
        if (M.D.brain === 'guide') controlIds.push('mice-chat', 'modifier-panel', 'origin-dock', 'brain-tools', 'mb-entangler', 'mice-toggle');
        const controls = strictBrain || guardedTitles ? controlIds.map(id => document.getElementById(id))
          .filter(el => el && (M.D.brain === 'guide' ? !el.hidden && el.getClientRects().length && !el.classList.contains('mb-hidden') : (el.offsetParent !== null || (['mb-drive', 'modifiers-open-phone', 'mbar'].includes(el.id) && el.getClientRects().length && !el.classList.contains('mb-hidden')))))
          .map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => ({ x: r.left, y: r.top, w: r.width, h: r.height })) : [];
        if (strictBrain || guardedTitles) for (const n of M.pages) {   // the brain's own label is always drawn under its hub; keep titles off it too
          if (!n.isSelf || isChild(n)) continue;
          const [sx, sy] = toScreen(n.x, n.y), rs = (n.r || 8) * k; ctx.font = `600 15px 'Satoshi', sans-serif`; const tw = ctx.measureText(n.title).width;
          controls.push({ x: sx - tw / 2 - 4, y: sy - rs - 4, w: tw + 8, h: rs * 2 + 30 });
        }
        // soft-placement brains: a title over a right-rail control (tool/zoom columns, Brains group, Drive, Entangler, cheese) costs more than turning to another side of its lobe
        const rail = strictBrain || guardedTitles ? [] : ['tools', 'zoom-ctl', 'brain-tools', 'mb-drive', 'mb-entangler', 'mice-toggle'].map(id => document.getElementById(id))
          .filter(el => el && !el.hidden && el.getClientRects().length && !el.classList.contains('mb-hidden')).map(el => el.getBoundingClientRect())
          .filter(r => r.width > 0 && r.height > 0).map(r => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
        const readable = b => offEdge(padded(b)) === 0 && !coversNeuron(padded(b)) && !placed.some(q => overlapBox(padded(b), padded(q)) > 0) && !controls.some(q => overlapBox(padded(b), q) > 0);
        const penalty = (b, self, own) => offEdge(b) * (phone ? 12 : 3) + rail.reduce((a, q) => a + (overlapBox(padded(b), q) > 0 ? 400 : 0), 0) + placed.reduce((a, q) => a + overlapBox(b, q) / (phone ? 12 : 40), 0) + circles.reduce((a, c) => a + (c === self ? 0 : circPen(b, c)), 0) + dotPen(b, self, own);
        circles.forEach(c => {
          const { l, ps, cx, cy, rr } = c;
          const shrink = M.brainsIn || L.helix ? Math.min(1, Math.max(0.5, k / 0.3)) : molTitles ? Math.min(1, Math.max(0.62, k / 0.5)) : 1;   // wide layouts shrink their titles when zoomed right out
          const compact = phone ? 0.8 : 1;   // phones: smaller titles so more of them find clear space above the options bar
          const fs00 = particlePhone ? 12 : Math.min(W / (M.brainsIn ? 36 : 22), 13 + Math.sqrt(ps.length) * 2.4) * shrink * compact;
          const fs20 = particlePhone ? 12 : Math.max(9.5, Math.min(W / 32, 12) * shrink * compact);
          const fs0 = strictBrain && M.brainsIn ? Math.max(fs00, fs20) : fs00;   // strict network layouts: a title never shrinks below its own count line
          ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fillStyle = rgba(l.color, 0.05 * lobeVis); ctx.fill(); ctx.lineWidth = sw(1); ctx.strokeStyle = rgba(l.color, 0.22 * lobeVis); ctx.stroke();
          if (l.origin) { ctx.setLineDash([sw(4), sw(6)]); ctx.strokeStyle = rgba(originColor(l.origin), 0.32 * lobeVis); ctx.beginPath(); ctx.arc(cx, cy, rr + sw(4), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
          const o = L.hubOf[l.id] || { x: 0, y: 0 }, dl = Math.hypot(cx - o.x, cy - o.y) || 1, a0 = L.helix && L.anchor[l.id] ? (L.anchor[l.id].y > 0 ? Math.PI / 2 : -Math.PI / 2) : dl > 1 ? Math.atan2(cy - o.y, cx - o.x) : -Math.PI / 2;   // on a helix, titles sit outside their strand
          const subs = ps.filter(isChild).length, atomsN = atomsByLobe.get(l.id) || 0;
          const line2 = `${plural(ps.length - subs, 'neuron')}${subs ? ` · ${plural(subs, 'sub-neuron')}` : ''}${atomsN ? ` · ${plural(atomsN, M.D.subName || 'atom')}` : ''} · ${plural(d3.sum(ps, p => p.nSyn), 'synapse')}`;
          // guarded brains shrink a title (down to 70%) before letting it drift away from its own lobe
          // ...and at each size first tries the title on one line, then a long title wrapped onto two (name and count), so it can stay beside its lobe when a tool column or the screen edge is close
          const scales = guardedTitles ? [[1, 0], [1, 1], [0.85, 0], [0.85, 1], [0.7, 0], [0.7, 1], [0.7, 0]] : [[1, 0]]; let fs, fs2, bw, bh, lines1, lines2, best = null, bestPen = Infinity, outs = [];
          const split = (t, sep) => {   // two lines of balanced width, broken at a separator; null when there is nowhere to break
            const parts = t.split(sep); if (parts.length < 2) return null;
            let cut = null, bestD = Infinity;
            for (let i = 1; i < parts.length; i++) { const a = parts.slice(0, i).join(sep), b = parts.slice(i).join(sep); const d = Math.abs(ctx.measureText(a).width - ctx.measureText(b).width); if (d < bestD) { bestD = d; cut = [a, b]; } }
            return cut;
          };
          for (let si = 0; si < scales.length && (!best || (scales[si][1] === 1 && scales[si][0] === scales[si - 1][0])); si++) {   // a size's wrapped form competes with its one-line form
          const near = guardedTitles && si < scales.length - 1, wrap = scales[si][1] === 1;
          fs = fs0 * scales[si][0]; fs2 = Math.max(guardedTitles ? 8.5 : 0, fs20 * scales[si][0]);
          ctx.font = `600 ${fs}px 'Clash Display', 'Satoshi', sans-serif`; lines1 = [l.name]; if (wrap) { const t = split(l.name, ' '); if (!t) continue; lines1 = t; }
          const w1 = Math.max(...lines1.map(t => ctx.measureText(t).width));
          ctx.font = `500 ${fs2}px 'Satoshi', sans-serif`; lines2 = [line2]; if (wrap) { const t = split(line2, ' · '); if (t) lines2 = t; }
          const w2 = Math.max(...lines2.map(t => ctx.measureText(t).width));
          if (wrap && Math.max(w1, w2) > 0.8 * Math.max(ctx.measureText(line2).width, (ctx.font = `600 ${fs}px 'Clash Display', 'Satoshi', sans-serif`, ctx.measureText(l.name).width))) continue;   // wrapping would barely narrow it
          bw = Math.max(w1, w2); bh = fs + fs2 + 10 + (lines1.length - 1) * fs * 1.04 + (lines2.length - 1) * fs2 * 1.25;
          const tries = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, Math.PI].flatMap(da => L.helix ? [[da, 14], [da, 14 + bh], [da, 14 + 2 * bh], [da, 14 + 3 * bh]] : [[da, 14], [da, 14 + bh], [da, 14 + 2 * bh]]);
          tries.sort((p, q) => (Math.abs(p[0]) + p[1] / 40) - (Math.abs(q[0]) + q[1] / 40));
          if (L.helix) tries.push([NaN, 0]);   // last resort on crowded layouts: the title sits on its own cluster
          for (const [da, off] of tries) {
            let box, cost;
            if (Number.isNaN(da)) { const [sx, sy] = toScreen(cx, cy); box = { x: sx - bw / 2, y: sy - bh / 2, w: bw, h: bh, sx, sy, align: 'center', onCluster: true, fs, fs2, lines1, lines2 }; cost = 30; }
            else {
              const ang = a0 + da, ux = Math.cos(ang), uy = Math.sin(ang); const [sx, sy] = toScreen(cx + ux * (rr + sw(off)), cy + uy * (rr + sw(off)));
              const align = Math.abs(ux) < 0.35 ? 'center' : ux > 0 ? 'left' : 'right';
              box = { x: align === 'center' ? sx - bw / 2 : align === 'left' ? sx : sx - bw, y: uy < -0.35 ? sy - bh : uy > 0.35 ? sy : sy - bh / 2, w: bw, h: bh, sx, sy, align, fs, fs2, lines1, lines2 };
              cost = Math.abs(da) * 30 + off * 0.35 + (wrap ? 12 : 0);   // a near title with a small clash beats a clean one far from its lobe; one line beats two at the same spot
            }
            if (strictTitles && !readable(box)) continue;
            if (guardedTitles && (offEdge(padded(box)) > 0 || controls.some(q => overlapBox(padded(box), q) > 0))) continue;
            if (near) {   // beside its own halo, clear of other lobes' halos, neurons and titles
              const lx = Math.max(box.x, Math.min(c.sx, box.x + box.w)), ly = Math.max(box.y, Math.min(c.sy, box.y + box.h));
              if (Math.hypot(c.sx - lx, c.sy - ly) - c.sr > 26 || dotPen(box, c, false) > (box.onCluster ? 120 : 0) || placed.some(q => overlapBox(padded(box), q) > 0)
                || (!box.onCluster && circles.some(o => o !== c && circPen(box, o) > 0))) continue;
            }
            if (obstacles.some(q => box.x - 14 < q.right && box.x + box.w + 14 > q.left && box.y - 8 < q.bottom && box.y + box.h + 8 > q.top)) continue;
            const clash = penalty(box, c, Number.isNaN(da)), pen = clash + cost;
            // phones: the header and the options bar are hard bounds; a crossing candidate is only kept as a fallback to slide back inside
            if (phone && (box.y < edge.y0 || box.y + box.h > edge.y1)) { outs.push([box, cost]); continue; }
            if (pen < bestPen) { bestPen = pen; best = box; } if (clash === 0 && da === 0) break;
          }
          }
          // Hard separation: a soft penalty can otherwise prefer overlapping a neighboring title or count.
          // On crowded phones, full lobe names remain available in the scrollable Lobes interface.
          // phones, nothing inside the bounds: slide the best crossing candidate back between header and bar (or drop the title if it cannot fit; the Lobes list still names it)
          // each slid box is scored again where it lands (titles, rail, halos, neurons), so the clamp cannot pick a worse spot unseen
          // ...only for a lobe whose halo still reaches the band between header and bar and the screen; a panned-away lobe keeps no title rather than one pinned to an edge
          const inBand = c.sy + c.sr >= edge.y0 && c.sy - c.sr <= edge.y1 && c.sx + c.sr >= 0 && c.sx - c.sr <= W;
          if (!best && inBand) for (const [ob, cost] of outs) {
            if (edge.y1 - edge.y0 < ob.h) continue;   // no room between header and bar: leave it to the Lobes list
            const y = Math.min(edge.y1 - ob.h, Math.max(edge.y0, ob.y)), box = { ...ob, y, sy: ob.sy + y - ob.y }, pen = penalty(box, c, !!ob.onCluster) + cost;
            if (pen < bestPen) { bestPen = pen; best = box; }
          }
          if (!best && strictTitles && !particlePhone) {
            for (let y = edge.y0 + 8; y + bh + 8 <= edge.y1; y += bh + 20) {
              for (let x = edge.x0 + 14; x + bw + 14 <= edge.x1; x += Math.max(36, bw / 2)) {
                const box = { x, y, w: bw, h: bh, sx: x + bw / 2, align: 'center', onCluster: true, fs, fs2, lines1, lines2 };
                if (!readable(box)) continue;
                const pen = Math.hypot(box.sx - c.sx, y + bh / 2 - c.sy) + dotPen(box, c, true);
                if (pen < bestPen) { bestPen = pen; best = box; }
              }
            }
          }
          if (!best) return;
          placed.push(best);
          const tl = Math.max(labelF, mouseW && Math.hypot(mouseW[0] - cx, mouseW[1] - cy) < rr ? 1 : 0);   // hovered lobe keeps its title
          if (tl < 0.02) return;   // labels off: the title is neither drawn nor reserved as a hit box
          this.titleBoxes.push({ id: l.id, x: best.x - (strictTitles ? 10 : 0), y: best.y - (strictTitles ? 4 : 0), w: best.w + (strictTitles ? 20 : 0), h: best.h + (strictTitles ? 6 : 0) });
          titleDraws.push(() => {
            ctx.textAlign = best.align; ctx.textBaseline = 'top';
            {   // leader line when a title had to sit away from its lobe (crowded layouts): box edge → halo edge
              const lx = Math.max(best.x, Math.min(c.sx, best.x + best.w)), ly = Math.max(best.y, Math.min(c.sy, best.y + best.h));
              const dx = c.sx - lx, dy = c.sy - ly, dist = Math.hypot(dx, dy), gap = dist - c.sr;
              if (gap > 36) {
                const ex = c.sx - dx / dist * c.sr, ey = c.sy - dy / dist * c.sr;
                ctx.lineWidth = 1; ctx.strokeStyle = rgba(l.color, 0.55 * lobeVis * tl); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle = rgba(l.color, 0.8 * lobeVis * tl); ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2); ctx.fill();
              }
            }
            if (best.onCluster || strictTitles) {   // strict titles always get a plate above crossing graph threads
              ctx.fillStyle = rgba('#070a14', 0.78 * lobeVis * tl); ctx.beginPath(); ctx.roundRect(best.x - 10, best.y - 4, best.w + 20, best.h + 6, 9); ctx.fill();
              ctx.lineWidth = 1; ctx.strokeStyle = rgba(l.color, 0.35 * lobeVis * tl); ctx.stroke();
            }
            ctx.shadowColor = 'rgba(6,8,16,0.9)'; ctx.shadowBlur = 6;
            const fs = best.fs, fs2 = best.fs2, nl = best.lines1.length - 1;
            ctx.font = `600 ${fs}px 'Clash Display', 'Satoshi', sans-serif`; ctx.fillStyle = rgba(l.color, 0.85 * lobeVis * tl); best.lines1.forEach((t, i) => ctx.fillText(t, best.sx, best.y + 2 + i * fs * 1.04));
            if (l.origin) { const tw = ctx.measureText(best.lines1[0]).width, dx = best.align === 'center' ? best.sx - tw / 2 : best.align === 'left' ? best.sx : best.sx - tw; ctx.fillStyle = rgba(originColor(l.origin), 0.9 * lobeVis * tl); ctx.beginPath(); ctx.arc(dx - 9, best.y + 2 + fs * 0.55, 3, 0, Math.PI * 2); ctx.fill(); }
            ctx.font = `500 ${fs2}px 'Satoshi', sans-serif`; ctx.fillStyle = rgba('#a7b2cc', 0.8 * lobeVis * tl); best.lines2.forEach((t, j) => ctx.fillText(t, best.sx, best.y + fs + 8 + nl * fs * 1.04 + j * fs2 * 1.25));
            ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
          });
        });
      }

      // ---------- wires: every stroke below goes through the Synapse Manager (js/synapses.js) ----------
      // Rule 1: width is weight only, never state. Rule 3: a per-frame budget with stable thinning. Rule 4: crowd alpha.
      // Rule 5: one path per style. See the Synapse Manager brain (synapses.html) for the policy in full.
      const SM = window.MBN.synapses, POL = SM.POLICY;
      const pathOf = (c, l) => { c.moveTo(l.source.x, l.source.y); const q = this.ctrlOf(l); if (q) c.quadraticCurveTo(q[0], q[1], l.target.x, l.target.y); else c.lineTo(l.target.x, l.target.y); };
      const B = SM.batcher(ctx, pathOf);
      // ---------- bonds (the connectors inside an unfolded molecule) ----------
      // a structural formula, not a synapse: bonds keep their chemical notation (orders, wedges, hashes) and are drawn
      // before the Manager's wires, which therefore sit on top; they appear only when a molecule is unfolded
      // drawn the way a structural formula draws them: one line per bond order, a filled wedge for a bond toward the
      // reader, a hashed wedge for one away, a dotted line for the ionic pull between a salt's ions
      if (depthF > 0.03 && L.activeBonds && L.activeBonds.length) {
        const bondCol = '#d6dcef', bw = sw(1.5), gap = 2.6;
        for (const l of L.activeBonds) {
          const a = l.source, b = l.target; if (l.style === 'layout' || (!inView(a.x, a.y) && !inView(b.x, b.y))) continue;   // layout tethers hold fragments together but are not bonds
          const fa = focusing ? 0.14 + 0.86 * Math.max(actOf(a), actOf(b)) : 1, al = (0.22 + 0.5 * depthF) * fa * depthF;
          const ms = Math.max(0.5, a.parent.mol.s), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
          ctx.strokeStyle = rgba(bondCol, al); ctx.fillStyle = rgba(bondCol, al); ctx.lineWidth = bw; ctx.lineCap = 'round';
          if (l.style === 'ionic' || l.style === 'coord') { ctx.setLineDash(l.style === 'ionic' ? [sw(1.6), sw(4)] : [sw(5), sw(3)]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); continue; }
          if (l.style === 'wedge') { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + nx * 3.2 * ms, b.y + ny * 3.2 * ms); ctx.lineTo(b.x - nx * 3.2 * ms, b.y - ny * 3.2 * ms); ctx.closePath(); ctx.fill(); continue; }
          if (l.style === 'hash') { ctx.lineWidth = sw(1.2); for (let i = 1; i <= 6; i++) { const t = i / 6, w = 3.2 * ms * t, x = a.x + dx * t, y = a.y + dy * t; ctx.beginPath(); ctx.moveTo(x + nx * w, y + ny * w); ctx.lineTo(x - nx * w, y - ny * w); ctx.stroke(); } continue; }
          const g = gap * ms;
          if (l.order === 2 && (l.style === 'aromatic' || (a.bonds.length > 1 && b.bonds.length > 1))) {
            // an internal double bond is drawn the way a skeletal formula draws it: one line on the axis, a shorter one beside it on the ring's (molecule's) side
            const pa = a.parent, side = Math.sign((pa.x - (a.x + b.x) / 2) * nx + (pa.y - (a.y + b.y) / 2) * ny) || 1, o = g * side, t0 = 0.16, t1 = 0.84;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(a.x + dx * t0 + nx * o, a.y + dy * t0 + ny * o); ctx.lineTo(a.x + dx * t1 + nx * o, a.y + dy * t1 + ny * o); ctx.stroke();
            continue;
          }
          const offs = l.order === 2 ? [-g / 2, g / 2] : l.order === 3 ? [-g, 0, g] : [0];
          for (const o of offs) { ctx.beginPath(); ctx.moveTo(a.x + nx * o, a.y + ny * o); ctx.lineTo(b.x + nx * o, b.y + ny * o); ctx.stroke(); }
        }
        ctx.lineCap = 'butt';
      }
      const cands = [];   // the neuron-neuron wires in view this frame
      for (const l of L.activeLinks) {
        if (l.kind !== 'pp') continue;
        if (!inView(l.source.x, l.source.y) && !inView(l.target.x, l.target.y)) continue;
        const da = Math.min(depthA(l.source), depthA(l.target)); if (da < 0.03) continue;
        l._da = da; cands.push(l);
      }
      const litOf = l => focusing ? Math.min(actOf(l.source), actOf(l.target)) : 0;
      const T = SM.thin(cands, l => routeEdge(l) || l.redGlow > 0.02 || l.learn > 0.2 || litOf(l) > 0.3, l => Math.min(1, l.weff / 6));
      const crowdA = SM.crowd(cands.length, W * H);
      // co-citation threads
      if (showCocite) for (const l of L.activeLinks) { if (l.kind !== 'cc') continue; const a = focusing ? Math.min(actOf(l.source), actOf(l.target)) * 0.4 + 0.03 : 0.08 + Math.min(l.w, 4) * 0.03; B.add('#c7d2ea', a * crowdA, POL.width.rest, l); }
      // parent → sub-neuron tethers
      if (depthF > 0.03) for (const l of L.activeLinks) { if (l.kind !== 'pc' || !inView(l.target.x, l.target.y)) continue; B.add(this.lobeColor(l.source), 0.45 * depthF * focusA(l.target), POL.width.max, l); }
      // neuron-neuron wires
      const late = [];   // routed wires and red paths are stroked after the rest so they sit on top (same width: rule 1)
      for (const l of cands) {
        if (!T.keep(l)) continue;
        const da = l._da, pruned = dyn.isPruned(l), onRoute = routeEdge(l), lit = litOf(l), wn = Math.min(1, l.weff / 6), w = SM.width(l.weff);
        let a = (focusing ? 0.04 + 0.85 * lit : 0.14 + 0.3 * wn) * da * crowdA; if (pruned) a *= 0.25;
        if (genome && !L.sameChromo(l.source, l.target) && lit < 0.5) a *= 0.45;   // genome layout: arches between chromosomes stay faint so the bands read
        if (onRoute) { late.push([l, this.route.red ? (this.route.col || RED) : '#ffffff', POL.alpha.ceil, w]); continue; }
        const col = l.learn > 0.2 ? '#ffd27a' : l.source.lobe === l.target.lobe ? this.lobeColor(l.source) : '#b9c4e0';   // grown wires look like any other at rest: the red is the signal's path, not the wire
        B.add(col, Math.min(POL.alpha.ceil, a), w, l, pruned ? '2,5' : '');
        if (l.redGlow > 0.02) late.push([l, l.redCol || RED, Math.min(POL.alpha.ceil, 0.9 * l.redGlow * da), w]);   // a red (origin-coloured) signal crossed this wire a moment ago: the path of travel, fading, at the wire's own width
      }
      let drawn = B.flush(rgba, sw);
      for (const [l, col, a, w] of late) B.add(col, a, w, l);
      const lateOut = B.flush(rgba, sw); drawn = { batches: drawn.batches + lateOut.batches, strokes: drawn.strokes + lateOut.strokes };
      // synapse tethers / cross links / source tethers
      if (synVis > 0.02 && explodeF > 0.05) {
        const v = synVis * explodeF;
        for (const l of L.activeLinks) {
          if (l.kind === 'pp' || l.kind === 'cc' || l.kind === 'pc' || !inView(l.target.x, l.target.y)) continue;
          const da = depthA(l.source); if (da < 0.03) continue; const fa = focusA(l.source) * (da > 0.5 ? 1 : 0.3);
          if (l.kind === 'st') B.add(this.lobeColor(l.source), 0.35 * v * fa * crowdA, POL.width.rest, l);
          else if (l.kind === 'sx') B.add('#ffffff', 0.55 * v * fa * crowdA, POL.width.rest, l, '4,4');
          else B.add('#8ea2cc', 0.22 * v * fa * crowdA, POL.width.rest, l, '1.5,3');
        }
        const t = B.flush(rgba, sw); drawn = { batches: drawn.batches + t.batches, strokes: drawn.strokes + t.strokes };
      }
      // ---------- spikes (action potentials in flight): one size for all, red is a colour ----------
      let spikesDrawn = 0; const spikeCap = SM.budget().spikes;
      for (const s of dyn.spikes) {
        const l = s.l; const bond = l.kind === 'bond';
        if (!bond && spikesDrawn >= spikeCap) continue;   // the Manager caps neuron spikes; bond spikes have their own budget in dynamics
        const da = Math.min(depthA(l.source), depthA(l.target)); if (da < 0.5) continue; if (bond && (l.style === 'layout' || !L.activeLinkSet.has(l))) continue;
        const from = s.dir > 0 ? l.source : l.target, to = s.dir > 0 ? l.target : l.source;
        if (!inView(from.x, from.y) && !inView(to.x, to.y)) continue;
        if (!bond) spikesDrawn++;
        const [x, y] = this.linkPoint(l, from, to, s.t);
        const col = s.red ? (s.col || RED) : from.lobe === to.lobe ? this.lobeColor(from) : '#ffffff'; const a = Math.sin(s.t * Math.PI) * (focusing ? 0.45 + 0.55 * Math.max(actOf(from), actOf(to)) : 1);
        // tail: a short fading streak behind the spike along the axon
        const [bx, by] = this.linkPoint(l, from, to, Math.max(0, s.t - POL.spike.tailLen));
        ctx.strokeStyle = rgba(col, 0.35 * a); ctx.lineWidth = sw(POL.spike.tail); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = rgba(col, 0.95 * a); ctx.beginPath(); ctx.arc(x, y, sw(POL.spike.dot), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(col, 0.25 * a); ctx.beginPath(); ctx.arc(x, y, sw(POL.spike.halo), 0, Math.PI * 2); ctx.fill();
      }
      SM.report({ candidates: cands.length, budgetUsed: T.budget, drawn: T.drawn, skipped: T.skipped, batches: drawn.batches, strokes: drawn.strokes, crowd: +crowdA.toFixed(2), spikes: spikesDrawn });
      // routed volley: one bright spike walking the chosen path
      if (dyn.volley) { const v = dyn.volley, a = v.path[v.i], b = v.path[v.i + 1]; if (a && b) { const vl = genome ? a.neighbors.find(q => q.n === b)?.l : null; const [x, y] = vl ? this.linkPoint(vl, a, b, v.t) : [a.x + (b.x - a.x) * v.t, a.y + (b.y - a.y) * v.t]; const vc = v.red ? (v.col || RED) : '#ffffff'; ctx.fillStyle = rgba(vc, 0.95); ctx.beginPath(); ctx.arc(x, y, sw(POL.spike.dot + 0.6), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = rgba(vc, 0.25); ctx.beginPath(); ctx.arc(x, y, sw(POL.spike.halo + 2), 0, Math.PI * 2); ctx.fill(); } }

      // ---------- sources ----------
      if (synVis > 0.02 && explodeF > 0.05) {
        const v = synVis * explodeF;
        for (const n of L.activeNodes) {
          if (n.kind !== 'src' || !inView(n.x, n.y)) continue; const fa = focusA(n), r = nodeR(n) * (0.6 + 0.4 * explodeF);
          ctx.fillStyle = rgba(n.kindOf === 'github' ? '#c7d2ea' : '#dbe4ff', 0.9 * v * fa);
          ctx.beginPath(); ctx.moveTo(n.x, n.y - r * 1.4); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r * 1.4); ctx.lineTo(n.x - r, n.y); ctx.closePath(); ctx.fill();
          if (srcLabelVis * labelOf(n) > 0.02 && (fa > 0.5 || keep(n))) { ctx.font = `500 ${sw(10)}px 'Satoshi', sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba('#a7b2cc', 0.9 * srcLabelVis * v * (keep(n) ? 1 : fa) * labelOf(n)); ctx.fillText(n.label, n.x + r + sw(4), n.y); }
        }
      }
      // ---------- synapses (facts) ----------
      if (synVis > 0.02 && explodeF > 0.05) {
        for (const n of L.activeNodes) {
          if (n.kind !== 'syn' || !inView(n.x, n.y)) continue; const da = depthA(n); if (da < 0.03) continue;
          const fa = focusA(n), r = nodeR(n) * (0.5 + 0.5 * explodeF) * da, col = this.lobeColor(n), isPulse = n === pulseSyn;
          if (n.sealed) {   // a sealed rung: a hollow ring with a dark core, the fact still folded inside
            ctx.strokeStyle = rgba(col, 0.9 * synVis * da * fa); ctx.lineWidth = sw(1.1); ctx.beginPath(); ctx.arc(n.x, n.y, r * (isPulse ? 1.9 : 1.15), 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = rgba(col, 0.35 * synVis * da * fa); ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.45, 0, Math.PI * 2); ctx.fill();
          } else { ctx.fillStyle = rgba(col, 0.95 * synVis * da * fa); ctx.beginPath(); ctx.arc(n.x, n.y, r * (isPulse ? 1.9 : 1), 0, Math.PI * 2); ctx.fill(); }
          if (this.unfolding && this.unfolding.n === n) {   // the seal breaking: one ring runs outward over ~0.9 s
            const age = (now - this.unfolding.t0) / 900;
            if (age < 1) { ctx.strokeStyle = rgba('#ffffff', 0.85 * (1 - age)); ctx.lineWidth = sw(1.6); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(3 + 26 * age), 0, Math.PI * 2); ctx.stroke(); } else this.unfolding = null;
          }
          if (fa > 0.5 && n.links.length) { ctx.strokeStyle = rgba('#ffffff', 0.7 * synVis * fa); ctx.lineWidth = sw(0.8); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(1.6), 0, Math.PI * 2); ctx.stroke(); }
          if (isPulse) { ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = sw(1.5); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(5), 0, Math.PI * 2); ctx.stroke(); }
          if (n.origin) { ctx.strokeStyle = rgba(originColor(n.origin), 0.75 * synVis * da * fa); ctx.lineWidth = sw(0.9); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(3.2), 0, Math.PI * 2); ctx.stroke(); }
          const focusedLabel = focusing && (fa > 0.5 || keep(n));
          const lv = (mapped ? (focusedLabel ? synLabelVisFocus : 0) : focusedLabel ? Math.max(synLabelVisFocus, synLabelVisAll) : synLabelVisAll) * labelOf(n);
          if (lv > 0.02 && (fa > 0.5 || keep(n))) {
            const p = pageById[n.page]; let ang = Math.atan2(n.y - p.y, n.x - p.x); let flip = Math.cos(ang) < 0;
            if (genome) { flip = isChild(p); ang = flip ? -1.0 : 1.0; }   // down-right for a neuron's ladder, down-left for a sub-neuron's
            ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(flip && !genome ? ang + Math.PI : ang);
            ctx.font = `500 ${sw(10.5)}px 'Satoshi', sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = flip ? 'right' : 'left'; ctx.fillStyle = rgba('#e9eefb', 0.92 * lv * synVis * explodeF);
            const label = n.lead.length > 36 ? n.lead.slice(0, 34) + '…' : n.lead; ctx.fillText(label, flip ? -(r + sw(5)) : r + sw(5), 0); ctx.restore();
          }
        }
      }
      // ---------- neurons ----------
      const selfLabels = [];   // the brain's own hub label is drawn after every neuron so none can sit on top of it
      for (const n of L.activeNodes) {
        if (n.kind !== 'page' || !inView(n.x, n.y)) continue; const da = depthA(n); if (da < 0.03) continue;
        const act = dyn.activation(n), fa = focusing ? 0.18 + 0.82 * act : 1, a = fa * da, col = this.lobeColor(n), r = nodeR(n);
        const fired = dyn.fired.has(n); const u = clamp01(n.u / Math.max(n.theta, 0.01));
        if (n.isAtom) {   // an atom: a CPK-coloured ball with its symbol beside it (heteroatoms first, carbons once the reader is close)
          ctx.fillStyle = rgba(col, 0.18 * a); ctx.beginPath(); ctx.arc(n.x, n.y, r * 1.8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = rgba(col, 0.95 * a); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.5 * a); ctx.beginPath(); ctx.arc(n.x - r * 0.28, n.y - r * 0.28, r * 0.3, 0, Math.PI * 2); ctx.fill();
          if (n === selected) { ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = sw(1.4); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(7), 0, Math.PI * 2); ctx.stroke(); }
          else if (n === hover) { ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = sw(1.1); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(6), 0, Math.PI * 2); ctx.stroke(); }
          const plainC = n.atom.z === 6 && !n.atom.q, lv = (plainC ? clamp01((k - 1.9) / 0.6) : clamp01((k - 0.95) / 0.45)) * depthF;
          if (lv > 0.02 && (fa > 0.5 || lv > 0.6)) {
            ctx.font = `600 ${sw(plainC ? 8.5 : 9.5)}px 'Satoshi', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillStyle = rgba('#000000', 0.6 * lv * a); ctx.fillText(n.title, n.x + sw(0.7), n.y + r + sw(2.7));
            ctx.fillStyle = rgba(fa > 0.5 ? '#f4f6ff' : '#aab3cc', 0.95 * lv * a); ctx.fillText(n.title, n.x, n.y + r + sw(2));
          }
          continue;
        }
        const reach = this.molReach(n);   // a neuron with a molecule: the soma fades as the structure unfolds and a membrane halo wraps the whole drawing
        if (reach > 0) { ctx.fillStyle = rgba(col, 0.045 * a * depthF); ctx.beginPath(); ctx.arc(n.x, n.y, reach + r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = rgba(col, 0.16 * a * depthF); ctx.lineWidth = sw(0.9); ctx.beginPath(); ctx.arc(n.x, n.y, reach + r, 0, Math.PI * 2); ctx.stroke(); }
        const rs = n.mol ? r * (1 - 0.55 * depthF) : r, somaA = n.mol ? 1 - 0.45 * depthF : 1;   // the soma gives way to the structure as it unfolds
        // halo: baseline + membrane potential (the soma brightens as it charges) + activation
        ctx.fillStyle = rgba(col, (0.08 + 0.10 * u + 0.18 * act) * a * somaA); ctx.beginPath(); ctx.arc(n.x, n.y, rs * (2.6 + 0.6 * act), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(col, (0.2 + 0.12 * u) * a * somaA); ctx.beginPath(); ctx.arc(n.x, n.y, rs * 1.6, 0, Math.PI * 2); ctx.fill();
        if (fired) { ctx.fillStyle = rgba(dyn.isRed(n) ? (n.origin ? originColor(n.origin) : n.redCol || RED) : '#ffffff', 0.35 * a * somaA); ctx.beginPath(); ctx.arc(n.x, n.y, rs * 2.2, 0, Math.PI * 2); ctx.fill(); }
        if (n.redHeat > 0.03) { ctx.fillStyle = rgba(n.redCol || RED, 0.3 * n.redHeat * a * somaA); ctx.beginPath(); ctx.arc(n.x, n.y, rs * (2.0 + 0.8 * n.redHeat), 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = rgba(col, 0.95 * a * somaA); ctx.beginPath(); ctx.arc(n.x, n.y, rs, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba('#ffffff', (0.45 + 0.4 * u) * a * somaA); ctx.beginPath(); ctx.arc(n.x - rs * 0.25, n.y - rs * 0.25, rs * 0.32, 0, Math.PI * 2); ctx.fill();
        // hub rings: rich club wears gold, connector/global hubs a double ring, provincial hubs a single ring
        if (this.showHubs && !isChild(n) && !n.isSelf) {
          if (n.club) { ctx.strokeStyle = rgba('#ffd27a', 0.8 * a); ctx.lineWidth = sw(1.3); ctx.beginPath(); ctx.arc(n.x, n.y, rs + sw(3.5), 0, Math.PI * 2); ctx.stroke(); }
          if (n.hub && n.part > 0.3) { ctx.strokeStyle = rgba('#ffffff', 0.5 * a); ctx.lineWidth = sw(0.8); ctx.beginPath(); ctx.arc(n.x, n.y, rs + sw(n.club ? 6.5 : 3.5), 0, Math.PI * 2); ctx.stroke(); }
        }
        if (routeSet && routeSet.has(n)) { ctx.strokeStyle = rgba(this.route.red ? (this.route.col || RED) : '#ffffff', 0.9); ctx.lineWidth = sw(1.4); ctx.setLineDash([sw(3), sw(3)]); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(10), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        if (n.origin) { ctx.strokeStyle = rgba(originColor(n.origin), (n.miceHub ? 0.85 : 0.6) * a); ctx.lineWidth = sw(n.miceHub ? 1.4 : 1); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(6.5), 0, Math.PI * 2); ctx.stroke(); }
        if (M.D.brains && n.brains && n.brains.length > 1) { ctx.strokeStyle = rgba('#ffffff', 0.45 * a); ctx.lineWidth = sw(0.9); ctx.setLineDash([sw(2.5), sw(2.5)]); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(9), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        if (n.children.length && depthF < 0.97) { const m = n.children.length, rr = r + sw(10); ctx.fillStyle = rgba(col, 0.9 * a * (1 - depthF)); for (let i = 0; i < m; i++) { const ang = n.spin + Math.PI / 2 + (i / m) * Math.PI * 2; ctx.beginPath(); ctx.arc(n.x + Math.cos(ang) * rr, n.y + Math.sin(ang) * rr, sw(2.2), 0, Math.PI * 2); ctx.fill(); } }
        if (explodeF < 0.95 && n.nSyn) { ctx.strokeStyle = rgba(col, 0.5 * a * (1 - explodeF)); ctx.lineWidth = sw(1); ctx.setLineDash([sw(1.5), sw(Math.max(2, 40 / n.nSyn))]); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(5), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        if (n === selected) { ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = sw(1.6); ctx.beginPath(); ctx.arc(n.x, n.y, r + reach + sw(12), 0, Math.PI * 2); ctx.stroke(); }
        else if (n === hover) { ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = sw(1.2); ctx.beginPath(); ctx.arc(n.x, n.y, r + reach + sw(10), 0, Math.PI * 2); ctx.stroke(); }
        if (multi.has(n) && n !== selected) { ctx.strokeStyle = rgba('#ff8a3d', 0.9); ctx.lineWidth = sw(1.4); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(8), 0, Math.PI * 2); ctx.stroke(); }
        if (n.pinned) { ctx.strokeStyle = rgba('#ffffff', 0.22 * a); ctx.lineWidth = sw(0.8); ctx.beginPath(); ctx.arc(n.x, n.y, r + sw(14), 0, Math.PI * 2); ctx.stroke(); }
        // label: hubs and the brain's own hub earn their label earlier than peripheral neurons
        const baseLabelVis = labelVisRaw(n);
        const lv = baseLabelVis * labelOf(n);
        if (lv > 0.02 && (fa > 0.5 || baseLabelVis > 0.6 || keep(n))) {
          labelsDrawn.add(n.id);
          const fs = n.isSelf ? 15 : isChild(n) ? 10.5 : 12;
          ctx.font = `${n.isSelf ? 600 : 500} ${sw(fs)}px 'Satoshi', sans-serif`;
          // genome layout: labels sit beside the band like gene annotations (right of a neuron, left of a sub-neuron) and lift above the synapse ladder
          if (table && n.gux !== undefined && (n.seat || isChild(n))) {
            // table layout: the label runs along the chair's radius, outward past the ring; a chair whose sub-neurons stand behind it labels
            // inward instead (between its ladder rungs' ends and the table), and a left-half label is flipped so it never reads upside down
            const kidsOn = !isChild(n) && n.children.some(L.pageOn) && depthF > 0.5, dir = kidsOn ? -1 : 1, ux = n.gux * dir, uy = n.guy * dir, flip = ux < 0;
            const drawRadial = () => {
              ctx.save(); ctx.translate(n.x + ux * (r + reach + sw(6)), n.y + uy * (r + reach + sw(6))); ctx.rotate(Math.atan2(uy, ux) + (flip ? Math.PI : 0));
              ctx.font = `${n.isSelf ? 600 : 500} ${sw(fs)}px 'Satoshi', sans-serif`; ctx.textAlign = flip ? 'right' : 'left'; ctx.textBaseline = 'middle';
              ctx.fillStyle = rgba('#000000', 0.55 * lv * a); ctx.fillText(n.title, sw(0.8), sw(0.8));
              const lit = fa > 0.5 || keep(n); ctx.fillStyle = rgba(lit ? '#f1f4ff' : '#9aa5c2', (lit ? 0.95 : 0.5) * lv); ctx.fillText(n.title, 0, 0); ctx.restore();
            };
            if (n.isSelf) selfLabels.push(drawRadial); else drawRadial();
            continue;
          }
          const beside = genome && !(n.isSelf && !M.brainsIn), side = beside ? (isChild(n) ? -1 : 1) : 0;
          const lx = beside ? n.x + side * (r + reach + sw(6)) : n.x, ly = beside ? n.y - explodeF * (n.nSyn ? r * 0.6 + sw(8) : 0) : n.y + r + reach + sw(5);
          const draw = () => {
            ctx.font = `${n.isSelf ? 600 : 500} ${sw(fs)}px 'Satoshi', sans-serif`;
            ctx.textAlign = beside ? (side > 0 ? 'left' : 'right') : 'center'; ctx.textBaseline = beside ? 'middle' : 'top';
            if (n.isSelf && !beside) {   // the hub label gets a soft plate so crossing wires and dots never break it up
              const tw = ctx.measureText(n.title).width, px = sw(7), py = sw(3), th = sw(fs) * 1.25;
              ctx.fillStyle = rgba('#070a14', 0.72 * lv * a); ctx.beginPath(); ctx.roundRect(lx - tw / 2 - px, ly - py, tw + 2 * px, th + 2 * py, sw(7)); ctx.fill();
            }
            ctx.fillStyle = rgba('#000000', 0.55 * lv * a); ctx.fillText(n.title, lx + sw(0.8), ly + sw(0.8));
            const lit = fa > 0.5 || keep(n); ctx.fillStyle = rgba(lit ? '#f1f4ff' : '#9aa5c2', (lit ? 0.95 : 0.5) * lv); ctx.fillText(n.title, lx, ly);
          };
          if (n.isSelf) selfLabels.push(draw); else draw();
        }
      }
      selfLabels.forEach(f => f());
      // ---------- lobe titles (screen space, above the neurons) ----------
      if (titleDraws.length) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); titleDraws.forEach(f => f()); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(tx, ty); ctx.scale(k, k); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; }
      // ---------- marquee ----------
      if (marquee) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1), w = Math.abs(marquee.x1 - marquee.x0), h = Math.abs(marquee.y1 - marquee.y0);
        ctx.fillStyle = 'rgba(255,138,61,0.08)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(255,138,61,0.8)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]); ctx.strokeRect(x + 0.5, y + 0.5, w, h); ctx.setLineDash([]);
      }
    }
  }
  window.MBN.Renderer = Renderer; window.MBN.rgba = rgba; window.MBN.RED = RED;
})();
