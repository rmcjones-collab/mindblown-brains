/* MindBlown Neural — the Synapse Manager (window.MBN.synapses)
   One place that decides how every synapse (wire) is drawn, in every layout, at any count. The renderer asks it three
   things each frame: how wide a wire may be, which wires it may draw, and how to draw them cheaply. The rules:

     1. Width is not a channel. A wire is as fine as the rest: 0.55 px plus up to 0.45 px for its weight, never more than
        1 px on screen, at every zoom and in every layout. Nothing a wire is doing (lit, learned, routed, red) changes
        its width; state is colour and alpha only. So a red route is a red wire, not a thicker one.
     2. A budget, not a hope. Each frame may stroke at most `budget.wires` wires and show at most `budget.spikes` spikes.
        The budget comes from a device tier (lean / standard / ample) picked from the hardware the browser reports and
        then steered by the measured frame time, so a weak machine stays fluid and a strong one shows more.
     3. Stable thinning. When a view holds more wires than the budget, wires that are doing something (on the route,
        lit by activation, carrying a red signal, learned) are always drawn; the rest are kept or dropped by a per-wire
        stable key biased toward heavier wires, so the picture does not flicker frame to frame.
     4. Crowd alpha. The denser the wires per screen pixel, the fainter each one, so a million wires read as a texture
        instead of a white sheet.
     5. Batches. Wires with the same colour, alpha and dash are stroked as one path, so draw calls grow with the number
        of distinct styles, not the number of wires.
     6. A seat for what comes next. A 'frontier' tier exists only for an attached provider (a worker, WebGPU, or, in
        the far future, a quantum co-processor for the graph problems that have proven query advantages). Nothing here
        pretends such a provider exists today; attach() is the hook, and the manager's decisions are a pure function
        of (graph counts, viewport, capability) so a provider can take them over without the renderer changing.

   Classic script; no build step. Load after layout.js and before render.js. The renderer requires it, and every
   page loads it so the rules are enforced everywhere. */
(() => {
  const MBN = window.MBN = window.MBN || {};

  const POLICY = Object.freeze({
    width: Object.freeze({ rest: 0.55, weight: 0.45, max: 1.0 }),     // screen px; rest + weight × (weff / 6, capped at 1), hard max
    spike: Object.freeze({ tail: 1.0, dot: 1.8, halo: 5.0, tailLen: 0.1 }),   // one size for every spike, red or not
    alpha: Object.freeze({ floor: 0.03, ceil: 0.95 }),
    crowd: 1.6e-4,                                                        // wires per screen px² at which crowd alpha starts to bite
    tiers: Object.freeze({
      lean:     Object.freeze({ wires: 2500,  spikes: 48 }),
      standard: Object.freeze({ wires: 9000,  spikes: 110 }),
      ample:    Object.freeze({ wires: 28000, spikes: 180 }),
      frontier: Object.freeze({ wires: 90000, spikes: 260 }),            // reserved for an attached provider
    }),
    frame: Object.freeze({ slow: 1000 / 40, fast: 1000 / 57 }),
    seat: Object.freeze({ auditEvery: 8 }),                            // every Nth provider route is checked against the connectome's own search; a worse answer detaches the provider         // steer the budget down above `slow`, up below `fast`
  });

  // ---------- capability ----------
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const mq = q => typeof matchMedia === 'function' && matchMedia(q).matches;
  const forced = (() => { try { return new URLSearchParams(location.search).get('tier'); } catch (e) { return null; } })();
  function detect() {
    const cores = nav.hardwareConcurrency || 4, mem = nav.deviceMemory || 4, coarse = mq('(pointer: coarse)'), small = Math.min(screen?.width || 1200, screen?.height || 800) < 700;
    let tier = 'standard', why = `${cores} cores · ${mem} GB`;
    if (coarse || small || cores <= 4 || mem <= 4) { tier = 'lean'; why = coarse ? 'touch device' : small ? 'small screen' : why; }
    else if (cores >= 8 && mem >= 8) tier = 'ample';
    if (mq('(prefers-reduced-motion: reduce)')) why += ' · reduced motion';
    return { tier, why, cores, mem, coarse, dpr: window.devicePixelRatio || 1 };
  }
  const cap = detect();
  let provider = null;                       // { name, tier, wires, spikes } attached by a future accelerator
  if (forced && POLICY.tiers[forced] && forced !== 'frontier') { cap.tier = forced; cap.why = 'forced by ?tier=' + forced; }

  // ---------- adaptive steering ----------
  let ema = 1000 / 60, scale = 1, frames = 0, hz = 60;
  function observe(ms) {
    if (!(ms > 0) || ms > 250) return;         // tab was hidden or a hitch: not a measurement
    ema += (ms - ema) * 0.08; hz = 1000 / ema;
    if (++frames % 30) return;                  // steer twice a second, gently
    if (ema > POLICY.frame.slow) scale = Math.max(0.3, scale * 0.85);
    else if (ema < POLICY.frame.fast && scale < 1.5) scale = Math.min(1.5, scale * 1.03);
  }

  // ---------- budget ----------
  function tier() { return provider ? 'frontier' : cap.tier; }
  function budget() {
    const base = provider ? { wires: provider.wires || POLICY.tiers.frontier.wires, spikes: provider.spikes || POLICY.tiers.frontier.spikes } : POLICY.tiers[cap.tier];
    return { wires: Math.round(base.wires * scale), spikes: Math.round(base.spikes * Math.min(1, scale)) };
  }

  // ---------- rule 1: width ----------
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const width = weff => Math.min(POLICY.width.max, POLICY.width.rest + POLICY.width.weight * clamp01((weff || 0) / 6));

  // ---------- rule 3: stable thinning ----------
  let nextKey = 1;
  const keyOf = l => l._sk || (l._sk = ((nextKey = (nextKey * 48271) % 2147483647) / 2147483647));   // a fixed pseudo-random key per wire
  /**
   * Decide which of `cands` may be drawn this frame. `must(l)` marks wires that are always drawn; `weight(l)` in [0,1]
   * biases the rest toward heavier wires. Returns { keep: l => boolean, drawn, skipped, frac }.
   */
  function thin(cands, must, weight) {
    const B = budget().wires;
    if (cands.length <= B) return { keep: () => true, drawn: cands.length, skipped: 0, frac: 1, budget: B };
    let m = 0, sum = 0; for (const l of cands) { if (must(l)) m++; else sum += 0.5 + weight(l); }
    const room = Math.max(0, B - m), frac = sum ? 0.97 * room / sum : 0;   // expected draw a hair under the room; the hard stop below makes the budget a cap, not a hope
    let drawn = 0;
    const keep = l => { if (must(l)) { drawn++; return true; } const ok = drawn < B && keyOf(l) < frac * (0.5 + weight(l)); if (ok) drawn++; return ok; };
    return { keep, get drawn() { return drawn; }, get skipped() { return cands.length - drawn; }, frac, budget: B };
  }

  // ---------- rule 4: crowd alpha ----------
  const crowd = (n, areaPx) => { const d = n / Math.max(1, areaPx); return d <= POLICY.crowd ? 1 : 1 / Math.sqrt(d / POLICY.crowd); };

  // ---------- rule 5: batches ----------
  /** Collect strokes by style and flush each style as one path. `path(ctx, l)` adds a wire's geometry to the current path. */
  function batcher(ctx, path) {
    const groups = new Map(); let n = 0;
    const q = x => Math.round(x * 24) / 24;   // alpha quantised to 1/24: invisible, and it collapses thousands of styles into dozens
    return {
      add(color, alpha, w, l, dash) { const a = q(alpha); if (a <= 0) return; const key = color + '|' + a + '|' + w.toFixed(2) + '|' + (dash || ''); let g = groups.get(key); if (!g) groups.set(key, g = { color, a, w, dash, items: [] }); g.items.push(l); n++; },
      flush(rgba, sw) {
        for (const g of groups.values()) {
          ctx.strokeStyle = rgba(g.color, g.a); ctx.lineWidth = sw(g.w); if (g.dash) ctx.setLineDash(g.dash.split(',').map(x => sw(+x)));
          ctx.beginPath(); for (const l of g.items) path(ctx, l); ctx.stroke();
          if (g.dash) ctx.setLineDash([]);
        }
        const out = { batches: groups.size, strokes: n }; groups.clear(); n = 0; return out;
      },
    };
  }

  // ---------- rule 6: the seat ----------
  let routeCalls = 0;   // provider route answers since attach; drives the audit cadence
  function attach(p) {
    if (!p || typeof p !== 'object' || !p.name) throw new Error('attach(provider): { name, wires?, spikes?, route? } required');
    provider = { name: String(p.name), wires: +p.wires || POLICY.tiers.frontier.wires, spikes: +p.spikes || POLICY.tiers.frontier.spikes, route: typeof p.route === 'function' ? p.route : null };
    routeCalls = 0;   // a replacement provider gets the normal first-call audit
    return tier();
  }
  function detach() { provider = null; routeCalls = 0; return tier(); }

  // ---------- stats / monitor ----------
  const last = { candidates: 0, drawn: 0, skipped: 0, batches: 0, strokes: 0, crowd: 1, spikes: 0 };
  function report(r) { Object.assign(last, r); }
  // rule 6 in practice: a provider may answer shortest-path requests. The contract is that it returns a shortest path
  // under the same cost (sum of 1/weight). The Manager verifies every hop is a real wire on every answer, and audits
  // every Nth answer against the connectome's own Dijkstra; a provider that ever returns a worse route is detached
  // (the page falls back to its own search), because checking optimality on every call would make the seat pointless.
  function route(adj, src, dst, weightOf) {
    const own = () => MBN.connectome && MBN.connectome.shortestPath ? MBN.connectome.shortestPath(adj, src, dst, weightOf) : null;
    if (!provider || !provider.route) return own();
    const who = provider.name;
    let ans = null; try { ans = provider.route({ adj, src, dst, weightOf }); } catch (e) { ans = null; }
    const path = Array.isArray(ans) ? ans : ans && Array.isArray(ans.path) ? ans.path : null;
    if (!path || path.length < 2 || path[0] !== src || path[path.length - 1] !== dst) return own();
    let cost = 0;
    for (let i = 1; i < path.length; i++) { const row = adj.get(path[i - 1]); if (!row || !row.has(path[i])) return own(); const w = weightOf ? weightOf(path[i - 1], path[i], row.get(path[i])) : row.get(path[i]); cost += 1 / Math.max(w, 1e-6); }
    const audit = ++routeCalls % POLICY.seat.auditEvery === 1;
    if (audit) { const mine = own(); if (mine && cost > mine.cost * (1 + 1e-9)) { detach(); cap.why = `provider ${who} failed a route audit`; if (typeof console !== 'undefined') console.warn(`[synapses] provider ${who} returned a longer route (${cost.toFixed(3)} vs ${mine.cost.toFixed(3)}); detached`); return mine; } }
    return { path, cost, hops: path.length - 1, by: who, audited: audit };
  }
  function stats() { return { tier: tier(), why: cap.why, provider: provider && provider.name, cores: cap.cores, mem: cap.mem, dpr: cap.dpr, budget: budget(), scale: +scale.toFixed(2), hz: Math.round(hz), frameMs: +ema.toFixed(1), ...last, policy: POLICY }; }
  function setTier(t) { if (!t) { const d = detect(); cap.tier = d.tier; cap.why = d.why; scale = 1; return true; } if (!POLICY.tiers[t] || t === 'frontier') return false; cap.tier = t; cap.why = 'set by the page'; scale = 1; return true; }   // setTier('') returns to the detected tier

  MBN.synapses = Object.freeze({ POLICY, width, thin, crowd, batcher, budget, tier, observe, stats, report, attach, detach, setTier, route, capability: () => ({ ...cap }) });
})();
