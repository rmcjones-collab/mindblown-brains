/* MindBlown Neural — dynamics.js
   Activity on the connectome: leaky integrate-and-fire spiking with adaptive thresholds (E/I balance),
   spreading activation from the focused neuron (Collins & Loftus), Hebbian potentiation of the synapses you
   actually travel (persisted per brain), slow forgetting, myelination of well-used axons, and the pruning threshold.
   Works on the page graph only; synapses (facts) and sources are passive.
   Grown material: a neuron, wire or lobe with an `origin` (something built at runtime, e.g. by the Guide's mice) is a red
   source. Spikes leaving a red source are red, a red spike arriving warms the neuron it reaches (redHeat) so what it fires
   next is red too, and every wire a red signal crosses glows red for a moment (redGlow): the path of travel, in red.
   The red carries for a bounded number of relay hops (RED_HOPS) so a trace shows where a grown signal went without the
   whole brain turning red: origin → red → one red relay → ordinary. A routed volley from grown material is red along its whole path.
   "Red" is the mice's colour; every origin tag has its own (MBN.originColor), and heat, glow, spikes and volleys carry the colour they set out with. */
window.MBN = window.MBN || {};
(() => {
  const DAY = 86400000;

  class Dynamics {
    constructor(pages, links, opts = {}) {
      this.pages = pages; this.links = links;
      this.key = opts.storageKey || 'mbn:learned';
      // persistent store when the browser allows it (sandboxed preview iframes do not); otherwise learning lives for the session only
      this.store = (() => { try { const st = window['local' + 'Storage']; st.getItem(this.key); return st; } catch (e) { return null; } })();
      this.enabled = { activity: true, learning: true };
      this.reduceMotion = !!opts.reduceMotion;
      // LIF parameters (seconds)
      this.tau = 0.9;            // membrane time constant: how fast potential leaks back to rest
      this.theta0 = 1.0;         // resting threshold
      this.refractory = 0.45;    // absolute refractory period after a spike
      this.adapt = 0.35;         // threshold jump per spike (spike-frequency adaptation → sparse firing)
      this.tauTheta = 2.5;       // threshold recovery
      this.noise = 0.55;         // spontaneous drive, scaled by each neuron's relative strength
      this.gain = 0.9;           // postsynaptic jump per arriving spike, × normalized synaptic weight
      this.maxSpikes = 140;      // global inhibition kicks in above this many travelling spikes
      this.spikes = [];          // {l, t, dir, speed, boost}
      this.bondSpikes = 0;       // spikes along molecule bonds: drawn with the rest, but kept out of the neuron budget and inhibition
      this.volley = null;        // a routed path being animated
      this.act = new Map();      // spreading activation per page (0..1)
      this.actTarget = null;     // focused page while hovering/selected
      this.fired = new Set();    // pages that spiked this frame (for the renderer's flash)
      this.learned = {};         // edgeKey → {w, n, t}
      this.usage = {};           // edgeKey → traversals (myelination)
      this.pruneShare = 1;       // 1 = keep every link, 0.2 = keep the strongest 20 %
      this.pruned = new Set();
      this.onLearn = null;
      pages.forEach(p => this.initPage(p));
      links.forEach(l => this.initLink(l));
      this.load();
      this.recomputeWeights();
      // the Log Brain (js/log-client.js) listens for mbn:* events; announce what was remembered once every script has loaded
      const snapshot = () => setTimeout(() => this.announce('snapshot', { edges: this.strongest(300) }), 0);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', snapshot); else snapshot();
    }
    // ---------- what the Log Brain hears: plain DOM events, ignored when nothing listens ----------
    announce(kind, detail) { try { window.dispatchEvent(new CustomEvent('mbn:' + kind, { detail })); } catch (e) { /* never interrupts the engine */ } }
    strongest(limit) {
      return Object.entries(this.learned).sort((x, y) => y[1].w - x[1].w).slice(0, limit).map(([k, L]) => { const [a, b] = k.split('\u0001'); return { a, b, w: +L.w.toFixed(3), n: L.n, uses: this.usage[k] || 0 }; });
    }
    static key(a, b) { return a.id < b.id ? a.id + '\u0001' + b.id : b.id + '\u0001' + a.id; }
    // runtime state for a neuron / wire; also used when the graph grows after boot (the arrays are shared with the model)
    initPage(p) { p.u = Math.random() * 0.3; p.theta = this.theta0; p.refr = 0; p.rate = 0; p.redHeat = 0; p.redCarry = 0; p.redCol = null; }
    initLink(l) { l.key = Dynamics.key(l.source, l.target); l.learn = 0; l.myelin = 0; l.weff = l.w; l.redGlow = 0; l.redCol = null; }
    // a red source is grown material (origin set) or a neuron a red signal has just reached
    isRed(p) { return !!p.origin || (p.redHeat > 0.3 && p.redCarry > 0); }
    // how many relay hops a red spike keeps its colour after leaving grown material
    static get RED_HOPS() { return 1; }
    redOf(p) { return p.origin ? Dynamics.RED_HOPS + 1 : (p.redHeat > 0.3 ? p.redCarry : 0); }
    warm(p, carry, col) { p.redHeat = 1; if (carry > p.redCarry) p.redCarry = carry; if (col) p.redCol = col; }
    colOf(p) { return p.origin ? window.MBN.originColor(p.origin) : p.redCol || window.MBN.originColor(); }   // the colour a signal leaving p travels in

    // ---------- persistence ----------
    load() {
      try {
        if (!this.store) return; const raw = this.store.getItem(this.key); if (!raw) return;
        const j = JSON.parse(raw); if (!j || typeof j !== 'object') return;
        const now = Date.now();
        for (const [k, v] of Object.entries(j.learned || {})) {
          if (typeof v !== 'object' || typeof v.w !== 'number' || typeof v.t !== 'number') continue;
          // forgetting: potentiation decays 3 % per day since the last reinforcement, never below zero
          const days = Math.max(0, (now - v.t) / DAY); const w = Math.max(0, Math.min(3, v.w * Math.pow(0.97, days)));
          if (w > 0.01) this.learned[k] = { w, n: Math.max(0, v.n | 0), t: v.t };
        }
        for (const [k, v] of Object.entries(j.usage || {})) if (typeof v === 'number' && v > 0) this.usage[k] = Math.min(200, v | 0);
      } catch (e) { /* storage blocked or corrupt: run without memory */ }
    }
    save() { if (!this.store) return false; try { this.store.setItem(this.key, JSON.stringify({ learned: this.learned, usage: this.usage, saved: Date.now() })); return true; } catch (e) { return false; } }
    reset() { const edges = Object.keys(this.learned).length; this.learned = {}; this.usage = {}; try { this.store && this.store.removeItem(this.key); } catch (e) { } this.recomputeWeights(); this.announce('forget', { edges }); }

    // effective synaptic weight = base evidence × (1 + what you have learned); myelin = log of traversals
    recomputeWeights() {
      let maxW = 0;
      this.links.forEach(l => {
        const L = this.learned[l.key]; l.learn = L ? L.w : 0; l.uses = this.usage[l.key] || 0;
        l.myelin = Math.min(1, Math.log1p(l.uses) / Math.log1p(40));
        l.weff = l.w * (1 + l.learn); if (l.weff > maxW) maxW = l.weff;
      });
      this.maxW = maxW || 1;
      this.pages.forEach(p => { let s = 0, mx = 0; p.neighbors.forEach(x => { s += x.l.weff; if (x.l.weff > mx) mx = x.l.weff; }); p.strength = s; p.maxIn = mx || 1; });
      this.maxStrength = Math.max(1, ...this.pages.map(p => p.strength));
      this.applyPrune();
    }
    // pruning: keep the strongest share of links network-wide, but never a neuron's single strongest link, so nothing is orphaned
    applyPrune() {
      this.pruned = new Set();
      if (this.pruneShare >= 0.999) return;
      const sorted = [...this.links].sort((a, b) => b.weff - a.weff);
      const keep = new Set(sorted.slice(0, Math.max(1, Math.round(sorted.length * this.pruneShare))));
      this.pages.forEach(p => { let best = null; p.neighbors.forEach(x => { if (!best || x.l.weff > best.weff) best = x.l; }); if (best) keep.add(best); });
      this.links.forEach(l => { if (!keep.has(l)) this.pruned.add(l); });
    }
    setPrune(share) { this.pruneShare = Math.max(0.05, Math.min(1, share)); this.applyPrune(); this.announce('prune', { share: this.pruneShare, pruned: this.pruned.size, links: this.links.length }); }
    isPruned(l) { return this.pruned.has(l); }

    // ---------- Hebbian learning ----------
    // called when attention actually travels a synapse (panel navigation, routed volleys, selecting a neighbour)
    potentiate(a, b, amount = 0.25) {
      const l = a.neighbors.find(x => x.n === b)?.l; if (!l) return null;
      this.usage[l.key] = (this.usage[l.key] || 0) + 1;
      let bonus = 0;   // 0 when learning is off: the trip still myelinates
      if (this.enabled.learning) {
        const L = this.learned[l.key] || { w: 0, n: 0, t: 0 }; const now = Date.now();
        // spacing effect: a repetition after a long gap consolidates more than a massed one
        const gapH = L.t ? (now - L.t) / 3600000 : Infinity; bonus = gapH > 24 ? 1.6 : gapH > 1 ? 1.25 : 1;
        L.w = Math.min(3, L.w + amount * bonus); L.n += 1; L.t = now; this.learned[l.key] = L;
      }
      this.recomputeWeights(); this.save();
      if (this.onLearn) this.onLearn(l);
      const L = this.learned[l.key];
      this.announce('learn', { a: a.id, b: b.id, w: L ? +L.w.toFixed(3) : 0, n: L ? L.n : 0, uses: this.usage[l.key], bonus, amount });
      return l;
    }

    // ---------- spreading activation ----------
    // activation starts at 1 on the focus, loses ~45 % per hop and more on weak links; stops below 0.07 or after 3 hops
    focus(p) {
      this.actTarget = p || null;
      if (!p) return;
      const next = new Map([[p, 1]]); const frontier = [[p, 1, 0]];
      for (let i = 0; i < frontier.length; i++) {
        const [n, a, hop] = frontier[i]; if (hop >= 3) continue;
        for (const { n: m, l } of n.neighbors) {
          if (this.pruned.has(l)) continue;
          const na = a * 0.55 * (0.45 + 0.55 * l.weff / n.maxIn);
          if (na < 0.07 || (next.get(m) || 0) >= na) continue;
          next.set(m, na); frontier.push([m, na, hop + 1]);
        }
      }
      // children and parents share their family's activation so folded depth still reads as one unit
      p.children.forEach(c => next.set(c, Math.max(next.get(c) || 0, 0.8))); if (p.atoms) p.atoms.forEach(c => next.set(c, Math.max(next.get(c) || 0, 0.8))); if (p.parent) next.set(p.parent, Math.max(next.get(p.parent) || 0, 0.8));
      this.actNext = next;
    }
    activation(p) { return this.act.get(p) || 0; }

    // ---------- routed volley ----------
    route(path) { const red = !!(path[0] && path[0].origin), col = red ? this.colOf(path[0]) : null; this.volley = { path, i: 0, t: 0, red, col }; if (red) this.warm(path[0], Dynamics.RED_HOPS + 1, col); }
    wireBetween(a, b) { const x = a.neighbors.find(q => q.n === b); return x ? x.l : null; }

    // ---------- integrate one frame ----------
    step(dt, viewLinks) {
      dt = Math.min(dt, 0.05);
      // activation field tweens toward its target, or decays once nothing is focused
      if (this.actTarget && this.actNext) {
        this.actNext.forEach((v, n) => this.act.set(n, (this.act.get(n) || 0) + (v - (this.act.get(n) || 0)) * Math.min(1, dt * 9)));
        this.act.forEach((v, n) => { if (!this.actNext.has(n)) { const nv = v * Math.exp(-dt * 6); nv < 0.01 ? this.act.delete(n) : this.act.set(n, nv); } });
      } else {
        this.act.forEach((v, n) => { const nv = v * Math.exp(-dt * 3.2); nv < 0.01 ? this.act.delete(n) : this.act.set(n, nv); });
      }
      this.fired.clear();
      // red traces fade: a warmed neuron cools in about half a second, a glowing wire in about a second and a half
      const cool = Math.exp(-dt / 0.55), dim = Math.exp(-dt / 1.4);
      for (const p of this.pages) if (p.redHeat > 0.001) { p.redHeat = p.redHeat < 0.01 ? 0 : p.redHeat * cool; if (!p.redHeat) { p.redCarry = 0; p.redCol = null; } }
      for (const l of this.links) if (l.redGlow > 0.001) l.redGlow = l.redGlow < 0.01 ? 0 : l.redGlow * dim;
      if (!this.enabled.activity || this.reduceMotion) { this.spikes.length = 0; this.bondSpikes = 0; this.volley = null; return; }

      // global inhibition: the more spikes in flight, the higher every threshold (E/I balance)
      const inhib = Math.max(0, (this.spikes.length - this.bondSpikes - this.maxSpikes * 0.6) / this.maxSpikes) * 1.5;

      // membrane dynamics
      for (const p of this.pages) {
        if (!p.active) continue;
        p.refr = Math.max(0, p.refr - dt);
        p.theta += (this.theta0 - p.theta) * (dt / this.tauTheta);
        const drive = this.noise * (0.25 + 0.75 * Math.sqrt(p.strength / this.maxStrength)) * (Math.random() < dt * 2.2 ? 1 : 0) + (this.act.get(p) || 0) * 0.9 * dt;
        p.u += (-p.u / this.tau) * dt + drive;
        p.rate *= Math.exp(-dt / 4);
        if (p.refr <= 0 && p.u >= p.theta + inhib) this.fire(p, viewLinks);
      }
      // travelling spikes
      for (let i = this.spikes.length - 1; i >= 0; i--) {
        const s = this.spikes[i]; s.t += s.speed * dt;
        if (s.red) { s.l.redGlow = Math.max(s.l.redGlow, 1); s.l.redCol = s.col; }
        if (s.t >= 1) {
          this.spikes.splice(i, 1); if (s.l.kind === 'bond') this.bondSpikes--;
          const to = s.dir > 0 ? s.l.target : s.l.source;
          if (s.red) this.warm(to, s.red - 1, s.col);
          if (to.active && to.refr <= 0) to.u += this.gain * (s.l.weff / to.maxIn) * (s.boost || 1);
        }
      }
      // routed volley: a spike handed from hop to hop along a shortest path
      if (this.volley) {
        const v = this.volley; v.t += dt * 1.6;
        if (v.red) { const l = this.wireBetween(v.path[v.i], v.path[v.i + 1]); if (l) { l.redGlow = 1; l.redCol = v.col; } }
        if (v.t >= 1) {
          v.t = 0; v.i++;
          if (v.i >= v.path.length - 1) { if (v.red) { const last = v.path[v.path.length - 1]; if (last) this.warm(last, 1, v.col); } this.volley = null; }
          else { const n = v.path[v.i]; n.u = 0; n.refr = this.refractory; this.fired.add(n); if (v.red) this.warm(n, 1, v.col); }
        }
      }
    }
    fire(p, viewLinks) {
      p.u = 0; p.refr = this.refractory; p.theta += this.adapt; p.rate += 1; this.fired.add(p);
      const burst = !!p.burst; p.burst = false;   // a pulse (MINDBLOWN_GROW.pulse, grown material only): recruits every neighbour and may overshoot the spike budget by the neuron's degree
      const full = () => !burst && this.spikes.length - this.bondSpikes >= this.maxSpikes;
      const red = this.redOf(p), col = red ? this.colOf(p) : null;   // 0 = ordinary; otherwise the number of hops this spike may still be red for (in col)
      for (const { n, l } of p.neighbors) {
        if (this.pruned.has(l) || !n.active || (viewLinks && !viewLinks.has(l))) continue;
        const bond = l.kind === 'bond'; if (bond ? l.style === 'layout' || this.bondSpikes >= this.maxSpikes : full()) continue;   // bonds and neuron links each have their own budget
        // conduction velocity: myelinated (well-travelled) axons carry spikes faster; a dense neuron only recruits a few at once
        if (!burst && Math.random() > 0.35 + 0.65 * (l.weff / p.maxIn)) continue;
        if (red) { l.redGlow = 1; l.redCol = col; }
        this.spikes.push({ l, t: 0, dir: l.source === p ? 1 : -1, speed: (0.55 + 0.9 * l.myelin) * (0.9 + Math.random() * 0.2), red, col }); if (bond) this.bondSpikes++;
      }
    }
  }
  window.MBN.Dynamics = Dynamics;
})();
