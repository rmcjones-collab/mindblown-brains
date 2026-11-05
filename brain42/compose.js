/* MindBlown — network composition: add any published network or brain to the current screen, or take brains away.
   Classic script, no dependencies, engine-agnostic. Load order on a page: <data>.js, [network-data.js], catalog.js, compose.js, engine.
   Contract with the engines: they boot through `MINDBLOWN_COMPOSE.ready().then(start)`; this file reads the saved selection
   (URL hash `net=` first, then saved storage `mb:compose:<brainKey>`), loads any remote brains by <script> injection, merges them
   (a port of build_network.py) or subtracts native ones, replaces window.MINDBLOWN before the engine reads it, and mounts the
   Networks panel (#networks button, key N; #networks-panel). Changing a checkbox persists the selection and reloads the page. */
(() => {
  const D0 = window.MINDBLOWN;
  const stage = document.getElementById('brain');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = s => String(s || '').toLowerCase().replace(/^mindblown:\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const here = location.pathname.split('/').pop() || 'index.html';
  const base = s => (s || '').split('/').pop().split(/[?#]/)[0];
  const SELF = 'self';            // network id used for native brains when the page's own network is not in the catalog

  // pages without a canvas or data (an overview page) get a no-op so the engine's boot line still works
  if (!stage || !D0) { window.MINDBLOWN_COMPOSE = { ready: () => Promise.resolve(window.MINDBLOWN), native: true }; return; }

  // ---------- catalog ----------
  const CAT = (window.MINDBLOWN_CATALOG && Array.isArray(window.MINDBLOWN_CATALOG.networks) ? window.MINDBLOWN_CATALOG.networks : [])
    .concat(Array.isArray(window.MINDBLOWN_CATALOG_EXTRA) ? window.MINDBLOWN_CATALOG_EXTRA : [])
    .filter(n => n && n.id && Array.isArray(n.brains)).map(n => ({ ...n, short: n.short || n.title || n.id, brains: n.brains.filter(b => b && b.id && b.data) }));
  const hostOf = n => { try { return new URL(n.host).host; } catch (e) { return ''; } };   // host:port, so two local servers stay distinct
  const N0 = window.MINDBLOWN_NETWORK || null;
  const scriptSrcs = [...document.scripts].map(s => base(s.getAttribute('src')));
  // which catalog network is this page part of? by host, else (local previews) by the brains its network-data.js lists
  const selfNet = CAT.find(n => hostOf(n) && hostOf(n) === location.host)
    || (N0 && Array.isArray(N0.brains) && N0.brains.length ? CAT.find(n => N0.brains.every(b => n.brains.some(x => x.id === b.id))) : null) || null;
  const selfNetId = selfNet ? selfNet.id : SELF;
  const catBrain = (netId, id) => { const n = CAT.find(x => x.id === netId); return n ? n.brains.find(b => b.id === id) || null : null; };

  // ---------- native brains ----------
  const isNetScreen = Array.isArray(D0.brains) && D0.brains.length > 0;
  let native;
  if (isNetScreen) native = D0.brains.map(b => ({ id: b.id, title: b.title || b.id, short: b.short || b.title || b.id, color: b.color || '', href: b.href || '' }));
  else {
    const pick = selfNet && (selfNet.brains.find(b => base(b.href) === here) || selfNet.brains.find(b => scriptSrcs.includes(base(b.data))));
    const id = D0.brain || (pick && pick.id) || slug(D0.title) || 'brain';
    const selfL = (D0.lobes || []).find(l => l.id === 'self');
    const title = (pick && pick.title) || String(D0.title || '').replace(/^MindBlown:\s*/, '') || (selfL && selfL.name) || id;
    native = [{ id, title, short: (pick && pick.short) || (selfL && selfL.name) || title, color: (pick && pick.color) || (selfL && selfL.color) || '#ff8a3d', href: here }];
  }
  const nativeIds = new Set(native.map(b => b.id));
  const nativeRefs = native.map(b => `${selfNetId}/${b.id}`);
  const brainKey = D0.brain || slug(D0.title) || here.replace(/\.html$/, '') || 'brain';
  const LS = 'mb:compose:' + brainKey;

  // ---------- selection: hash `net=` → saved storage → native ----------
  // storage is looked up indirectly and probed once (as app.js does): sandboxed previews and privacy modes may deny it; the hash still works
  const store = (() => { try { const st = window['local' + 'Storage']; st.getItem(LS); return st; } catch (e) { return null; } })();
  const hashParts = () => location.hash.replace(/^#/, '').split('&').filter(Boolean);
  const hashNet = () => { const p = hashParts().find(x => x.startsWith('net=')); return p ? p.slice(4) : null; };
  const parseRefs = s => String(s || '').split(',').map(x => { try { return decodeURIComponent(x.trim()); } catch (e) { return ''; } }).filter(x => /^[^/]+\/.+$/.test(x));
  const encodeRefs = refs => refs.map(r => encodeURIComponent(r).replace(/%2F/gi, '/').replace(/%3A/gi, ':')).join(',');
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  let stored = null; try { stored = store && parseRefs(store.getItem(LS)); } catch (e) { }
  const fromHash = hashNet();
  let selection = fromHash !== null ? parseRefs(fromHash) : (stored && stored.length ? stored : nativeRefs.slice());
  // native refs first, in native order, then the additions in the order they were ticked; nothing selected means native
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
  selection = uniq(nativeRefs.filter(r => selection.includes(r)).concat(selection.filter(r => !nativeRefs.includes(r))));
  if (!selection.length) selection = nativeRefs.slice();
  const isNative = sameSet(selection, nativeRefs);

  // a ref `<network>/<brain>` → how it is loaded and what it is called on the composed screen
  const splitRef = r => { const i = r.indexOf('/'); return [r.slice(0, i), r.slice(i + 1)]; };
  const dupCount = id => CAT.reduce((n, net) => n + net.brains.filter(b => b.id === id).length, 0);
  function resolve(ref) {
    const [net, id] = splitRef(ref);
    if (net === selfNetId && nativeIds.has(id)) return { ref, native: true, id, meta: native.find(b => b.id === id) };
    const n = CAT.find(x => x.id === net), b = catBrain(net, id);
    if (!n || !b) return { ref, missing: true, id, meta: { title: ref } };
    const amb = nativeIds.has(id) || dupCount(id) > 1;           // `life` in two networks: prefix the added one, keep the names distinct
    const cid = amb ? `${net}-${id}` : id;
    const at = f => net === selfNetId ? String(f || '').replace(/^\//, '') : String(n.host || '').replace(/\/$/, '') + '/' + String(f || '').replace(/^\//, '');
    const href = at(b.href), url = at(b.data);     // same network: relative, like the host's own files; otherwise absolute on its host
    return { ref, id: cid, url, net: n, cat: b, meta: { id: cid, title: amb ? `${b.title} (${n.short})` : b.title, short: amb ? `${b.short} (${n.short})` : b.short, color: b.color || '#ff8a3d', href, palette: b.palette } };
  }

  // ---------- merge: port of build_network.py ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  function shiftHue(hex, deg) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return hex;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l <= 0.5 ? d / (mx + mn) : d / (2 - mx - mn);
      h = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d; h = ((h / 6) % 1 + 1) % 1;
    }
    h = (h + deg / 360) % 1;
    const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s, m1 = 2 * l - m2;
    const v = hh => { hh = ((hh % 1) + 1) % 1; return hh < 1 / 6 ? m1 + (m2 - m1) * hh * 6 : hh < 0.5 ? m2 : hh < 2 / 3 ? m1 + (m2 - m1) * (2 / 3 - hh) * 6 : m1; };
    const to = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return s === 0 ? hex : '#' + to(v(h + 1 / 3)) + to(v(h)) + to(v(h - 1 / 3));
  }
  const pairKey = (a, b) => (a < b ? [a, b] : [b, a]).join('\u0000');
  // an empty accumulator, or indices over an already merged network screen
  function accumulator(M) {
    const A = { M, lobes: new Set(M.lobes.map(l => l.id)), page: new Map(), link: new Map(), cocite: new Map() };
    M.pages.forEach((p, i) => A.page.set(p.id, i)); M.links.forEach((l, i) => A.link.set(pairKey(l.s, l.t), i)); M.cocite.forEach((l, i) => A.cocite.set(pairKey(l.s, l.t), i));
    return A;
  }
  // cfg = { registry: Set of shared page ids, sharedLobes: Set of shared lobe ids } taken from the host network
  function addBrain(A, d, b, cfg, bi) {
    const M = A.M, id = b.id;
    const mp = pid => cfg.registry.has(pid) ? pid : `${id}:${pid}`, ml = lid => cfg.sharedLobes.has(lid) ? lid : `${id}:${lid}`, ns = x => `${id}:${x}`;
    // some builders list whole synapse objects under page.synapses (the engines only count them); namespace by their id
    const nsx = x => ns(typeof x === 'string' ? x : x && x.id != null ? x.id : String(x));
    const brand = String(b.short || '').split(/\s+/)[0].toLowerCase();
    (d.lobes || []).forEach(l => {
      const lid = ml(l.id); if (A.lobes.has(lid)) return; A.lobes.add(lid);
      if (cfg.sharedLobes.has(l.id)) { M.lobes.push({ ...l, id: lid }); return; }
      const name = l.id === 'self' ? b.short : (brand && String(l.name || '').toLowerCase().includes(brand)) ? l.name : `${b.short} · ${l.name}`;
      const color = (l.id === 'self' || bi === 0) ? l.color : (b.palette && b.palette[l.id]) || shiftHue(l.color, 40 * bi);
      M.lobes.push({ ...l, id: lid, brain: id, self: l.id === 'self', name, color });
    });
    const center = mp(d.center || (d.pages && d.pages[0] ? d.pages[0].id : ''));
    M.brains.push({ id, title: b.title, short: b.short, color: b.color, href: b.href, self: ns('self'), center });
    M.centers.push(center);
    (d.pages || []).forEach(p => {
      const pid = mp(p.id);
      const q = { ...p, id: pid, lobe: ml(p.lobe), synapses: (p.synapses || []).map(nsx), sources: (p.sources || []).map(nsx) };
      if (p.parent) q.parent = mp(p.parent); else delete q.parent;
      if (A.page.has(pid)) {   // shared neuron already created by an earlier brain: pool the evidence
        const m = M.pages[A.page.get(pid)];
        m.synapses = m.synapses.concat(q.synapses); m.sources = m.sources.concat(q.sources);
        m.brains = (m.brains || (m.brain ? [m.brain] : [])).concat(id); delete m.brain;
        m.updated = [m.updated || '', q.updated || ''].sort().pop();
      } else {
        if (cfg.registry.has(pid)) q.brains = [id]; else q.brain = id;
        q.orig = p.id; A.page.set(pid, M.pages.length); M.pages.push(q);
      }
    });
    (d.synapses || []).forEach(sy => M.synapses.push({ ...sy, id: ns(sy.id), page: mp(sy.page), links: (sy.links || []).map(mp), cites: (sy.cites || []).map(ns) }));
    (d.sources || []).forEach(src => M.sources.push({ ...src, id: ns(src.id), pages: (src.pages || []).map(mp) }));
    (d.links || []).forEach(l => {
      const s = mp(l.s), t = mp(l.t), key = pairKey(s, t);
      if (A.link.has(key)) {
        const m = M.links[A.link.get(key)]; m.w += l.w; m.kinds = [...new Set([...(m.kinds || []), ...(l.kinds || [])])].sort();
        m.notes = (m.notes || []).concat((l.notes || []).filter(n => !(m.notes || []).includes(n))).slice(0, 3);
      } else { A.link.set(key, M.links.length); M.links.push({ ...l, s, t }); }
    });
    (d.synLinks || []).forEach(l => M.synLinks.push({ s: ns(l.s), t: mp(l.t) }));
    (d.cocite || []).forEach(l => {
      const s = mp(l.s), t = mp(l.t), key = pairKey(s, t);
      if (A.cocite.has(key)) M.cocite[A.cocite.get(key)].w += l.w; else { A.cocite.set(key, M.cocite.length); M.cocite.push({ s, t, w: l.w }); }
    });
    if (d.built && (!M.built || d.built > M.built)) M.built = d.built;
  }
  // the Python asserts no dangling link/parent; here we fail soft, drop the dangling item and say how many went
  function sanitize(M) {
    let dropped = 0;
    const keep = (arr, ok) => { const out = arr.filter(ok); dropped += arr.length - out.length; return out; };
    const pid = new Set(M.pages.map(p => p.id));
    M.pages.forEach(p => { if (p.parent && !pid.has(p.parent)) { delete p.parent; dropped++; } });
    M.synapses = keep(M.synapses, s => pid.has(s.page));
    const sid = new Set(M.synapses.map(s => s.id));
    M.sources.forEach(s => { s.pages = keep(s.pages || [], x => pid.has(x)); });
    M.sources = keep(M.sources, s => s.pages.length > 0);
    const rid = new Set(M.sources.map(s => s.id));
    M.synapses.forEach(s => { s.links = keep(s.links || [], x => pid.has(x)); s.cites = keep(s.cites || [], x => rid.has(x)); });
    // page.synapses / page.sources are only counted by the engines (and are not always ids), so they are left alone here
    M.links = keep(M.links, l => pid.has(l.s) && pid.has(l.t));
    M.synLinks = keep(M.synLinks, l => sid.has(l.s) && pid.has(l.t));
    M.cocite = keep(M.cocite, l => pid.has(l.s) && pid.has(l.t));
    M.centers = M.centers.filter(c => pid.has(c));
    // a lobe with no pages left only clutters the ring (hub lobes stay)
    const used = new Set(M.pages.map(p => p.lobe)); M.lobes = M.lobes.filter(l => used.has(l.id) || l.self);
    if (dropped) console.warn(`[compose] dropped ${dropped} dangling reference(s) while merging`);
    return M;
  }
  // keep only the brains in `keep` (composed ids); shared pages lose the other brains' evidence and go when nobody is left
  function subtract(M, keep) {
    const all = M.brains.slice(), owner = x => all.find(b => x.startsWith(b.id + ':'));
    const keepOwn = x => { const o = owner(x); return !o || keep.has(o.id); };
    M.brains = all.filter(b => keep.has(b.id));
    M.lobes = M.lobes.filter(l => !l.brain || keep.has(l.brain));
    M.pages = M.pages.filter(p => {
      if (p.brain) return keep.has(p.brain);
      if (p.brains) {   // a shared neuron loses the leaving brains' evidence and goes when nobody is left
        p.brains = p.brains.filter(b => keep.has(b)); if (!p.brains.length) return false;
        p.synapses = (p.synapses || []).filter(x => typeof x !== 'string' || keepOwn(x)); p.sources = (p.sources || []).filter(x => typeof x !== 'string' || keepOwn(x));
      }
      return true;
    });
    M.synapses = M.synapses.filter(s => keepOwn(s.id)); M.sources = M.sources.filter(s => keepOwn(s.id));
    // edges that touched the leaving brains go with them (expected, so not reported as dangling)
    const pid = new Set(M.pages.map(p => p.id)), has = x => pid.has(x);
    M.links = M.links.filter(l => has(l.s) && has(l.t)); M.cocite = M.cocite.filter(l => has(l.s) && has(l.t)); M.synLinks = M.synLinks.filter(l => keepOwn(l.s) && has(l.t));
    M.synapses.forEach(s => { s.links = (s.links || []).filter(has); }); M.sources.forEach(s => { s.pages = (s.pages || []).filter(has); }); M.sources = M.sources.filter(s => s.pages.length);
    return sanitize(M);
  }
  // one brain left: hand the engine a single-brain data set so the single-brain layout applies
  function toSingle(M) {
    const b = M.brains[0], pre = b.id + ':', strip = x => x.startsWith(pre) ? x.slice(pre.length) : x;
    const lobeId = {}; M.lobes.forEach(l => { lobeId[l.id] = l.self ? 'self' : strip(l.id); });
    const unbrand = s => String(s || '').startsWith(b.short + ' · ') ? s.slice(b.short.length + 3) : s;
    const S = { ...M, center: strip(b.center) }; delete S.brains; delete S.centers;
    S.lobes = M.lobes.map(l => { const q = { ...l, id: lobeId[l.id], name: l.self ? l.name : unbrand(l.name) }; delete q.brain; delete q.self; return q; });
    S.lobes.sort((a, b) => (a.id === 'self' ? 0 : 1) - (b.id === 'self' ? 0 : 1));   // hub lobe first, as a brain's own file has it
    S.pages = M.pages.map(p => { const q = { ...p, id: p.orig || strip(p.id), lobe: lobeId[p.lobe] || p.lobe, synapses: p.synapses.map(strip), sources: p.sources.map(strip) }; if (q.parent) q.parent = strip(q.parent); delete q.brain; delete q.brains; delete q.orig; return q; });
    S.synapses = M.synapses.map(s => ({ ...s, id: strip(s.id), page: strip(s.page), links: s.links.map(strip), cites: s.cites.map(strip) }));
    S.sources = M.sources.map(s => ({ ...s, id: strip(s.id), pages: s.pages.map(strip) }));
    S.links = M.links.map(l => ({ ...l, s: strip(l.s), t: strip(l.t) })); S.synLinks = M.synLinks.map(l => ({ s: strip(l.s), t: strip(l.t) })); S.cocite = M.cocite.map(l => ({ ...l, s: strip(l.s), t: strip(l.t) }));
    return S;
  }
  // the host's sharing rules: registry ids stay one node across brains; shared lobes are the network's un-tagged lobes
  function hostConfig() {
    const registry = new Set(N0 && N0.registry ? Object.keys(N0.registry) : []);
    const sharedLobes = new Set(isNetScreen ? D0.lobes.filter(l => !l.brain && !l.self && l.id !== 'self').map(l => l.id)
      : N0 && N0.registry ? Object.values(N0.registry).map(r => r && r.lobe).filter(Boolean) : []);
    return { registry, sharedLobes };
  }
  function compose(loaded) {   // loaded: [{ res, data }] in selection order, native entries carry no data
    const cfg = hostConfig();
    let M, A;
    if (isNetScreen) { M = clone(D0); M.brains = M.brains || []; M.centers = M.centers || []; ['lobes', 'pages', 'synapses', 'sources', 'links', 'synLinks', 'cocite'].forEach(k => { M[k] = M[k] || []; }); A = accumulator(M); }
    else {
      M = { lobes: [], pages: [], synapses: [], sources: [], links: [], synLinks: [], cocite: [], brains: [], centers: [], brain: D0.brain, title: D0.title, subtitle: D0.subtitle, built: D0.built };
      if (D0.demo) M.demo = true; if (D0.dayName) M.dayName = D0.dayName;
      A = accumulator(M); addBrain(A, D0, native[0], cfg, 0);
    }
    loaded.filter(x => !x.res.native && x.data).forEach(x => addBrain(A, x.data, x.res.meta, cfg, M.brains.length));
    sanitize(M);
    const keep = new Set(loaded.filter(x => x.res.native || x.data).map(x => x.res.id));
    if ([...keep].length < M.brains.length) subtract(M, keep);
    const added = loaded.filter(x => !x.res.native && x.data).map(x => x.res.id), removed = native.map(b => b.id).filter(id => !keep.has(id));
    M.brain = brainKey + (added.length ? '+' + added.join('+') : '') + (removed.length ? '-' + removed.join('-') : '');
    M.subtitle = `composed · ${M.brains.length} ${M.brains.length === 1 ? 'brain' : 'brains'}: ${M.brains.map(b => b.short).join(', ')}`;
    if (M.title == null) M.title = D0.title;
    return M.brains.length === 1 ? toSingle(M) : M;
  }

  // ---------- cross-origin load: trap the data file's `window.MINDBLOWN = …` assignment ----------
  // One accessor guards window.MINDBLOWN for the rest of the page's life once remote loading starts: the getter serves `current`,
  // the setter only accepts a write made by the script we are waiting for (document.currentScript), so a script that settles
  // after its timeout, or anything else writing late, cannot replace the composed data the engine was handed.
  let current = D0, trap = null, guarded = false;
  function guard() {
    if (guarded) return true;
    try {
      Object.defineProperty(window, 'MINDBLOWN', { configurable: true, enumerable: true, get() { return current; },
        set(v) { if (trap && document.currentScript === trap.el) trap.capture(v); else console.warn('[compose] ignored a late write to window.MINDBLOWN'); } });
      guarded = true;
    } catch (e) { }
    return guarded;
  }
  const TIMEOUT = Math.max(1000, +window.MINDBLOWN_COMPOSE_TIMEOUT || 15000);
  function loadBrain(url, ms = TIMEOUT) {
    return new Promise((ok, no) => {
      if (!guard()) { no(new Error('cannot trap window.MINDBLOWN')); return; }
      const s = document.createElement('script'); s.src = url;   // async (the default): a stalled earlier script must not hold this one back
      let captured, done = false;
      trap = { el: s, capture: v => { captured = v; } };
      const finish = err => { if (done) return; done = true; clearTimeout(t); if (trap && trap.el === s) trap = null; s.remove(); if (err) no(err); else if (captured && Array.isArray(captured.pages)) ok(captured); else no(new Error('no MINDBLOWN data in ' + url)); };
      const t = setTimeout(() => finish(new Error('timed out loading ' + url)), ms);
      s.onload = () => finish(null); s.onerror = () => finish(new Error('could not load ' + url));
      document.head.appendChild(s);
    });
  }
  // what the engine (and the panel) read from window.MINDBLOWN from now on
  function publish(data) { current = data; if (!guarded) window.MINDBLOWN = data; }

  // ---------- boot ----------
  const failed = [];            // [{ res, error }]
  let composedData = D0, resolved = [];
  const loadingText = t => { const el = document.querySelector('#loading span'); if (el) el.textContent = t; };
  const ready = (async () => {
    resolved = selection.map(resolve);
    if (isNative) return D0;
    const loaded = [];
    for (const res of resolved) {
      if (res.native) { loaded.push({ res }); continue; }
      if (res.missing) { failed.push({ res, error: 'not in the catalog' }); continue; }
      loadingText(`Loading ${res.meta.title}…`);
      try { loaded.push({ res, data: await loadBrain(res.url) }); }
      catch (e) { failed.push({ res, error: e.message }); console.warn('[compose]', e.message); }
    }
    // a stored selection with refs that are not in the catalog is stale: forget those refs (a valid ref whose load merely failed is kept
    // for next time, and nothing is forgotten when the catalogue itself did not load, since every ref would look unknown then)
    if (fromHash === null && CAT.length && resolved.some(r => r.missing)) {
      const good = resolved.filter(r => !r.missing).map(r => r.ref);
      try { if (!store) { } else if (!good.length || sameSet(good, nativeRefs)) store.removeItem(LS); else store.setItem(LS, good.join(',')); } catch (e) { }
    }
    // nothing usable or nothing actually changed: stay native, never hand the engine an empty set
    if (!loaded.length || sameSet(loaded.map(x => x.res.ref), nativeRefs)) return D0;
    loadingText('Merging brains…');
    try { composedData = compose(loaded); } catch (e) { console.warn('[compose] merge failed, showing the page\'s own data', e); failed.push({ res: { meta: { title: 'merge' } }, error: e.message }); return D0; }
    publish(composedData);
    // let the engine's "open in the X brain" links reach the added brains too
    const extra = loaded.filter(x => !x.res.native && x.data).map(x => ({ id: x.res.id, title: x.res.meta.title, short: x.res.meta.short, color: x.res.meta.color, href: x.res.meta.href }));
    if (extra.length) window.MINDBLOWN_NETWORK = { ...(N0 || {}), brains: ((N0 && N0.brains) || []).concat(extra) };
    return composedData;
  })();
  window.MINDBLOWN_COMPOSE = { ready: () => ready, native: isNative, selection: () => selection.slice(), nativeRefs: () => nativeRefs.slice(), key: LS, version: 1 };

  // ---------- UI: a tool button and the Networks panel ----------
  let btn, panel, list, status;
  const checked = new Set(selection);
  const rowOf = (ref, b, extraTag) => `<label class="net-row"><input type="checkbox" value="${esc(ref)}"${checked.has(ref) ? ' checked' : ''}><span class="sw" style="background:${esc(b.color || '#888')};color:${esc(b.color || '#888')}"></span><span class="t" title="${esc(b.title)}">${esc(b.title)}</span>${b.fictional ? '<span class="tag">fictional data</span>' : ''}${extraTag || ''}</label>`;
  function render() {
    const fail = ref => { const f = failed.find(x => x.res.ref === ref); return f ? `<span class="tag err" title="${esc(f.error)}">failed</span>` : ''; };
    let h = `<div class="net-group"><h4>This network</h4>${native.map(b => rowOf(`${selfNetId}/${b.id}`, b, fail(`${selfNetId}/${b.id}`))).join('')}</div>`;
    CAT.forEach(n => {
      const rows = n.brains.filter(b => !(n.id === selfNetId && nativeIds.has(b.id)));
      if (!rows.length) return;
      const t = n.host ? `<a href="${esc(n.host)}" target="_blank" rel="noopener">${esc(n.title)} ↗</a>` : esc(n.title);
      h += `<div class="net-group"><h4>${t}</h4>${rows.map(b => rowOf(`${n.id}/${b.id}`, b, fail(`${n.id}/${b.id}`))).join('')}</div>`;
    });
    if (!CAT.length) h += `<div class="net-empty">No catalog loaded: add catalog.js before compose.js.</div>`;
    list.innerHTML = h;
    list.querySelectorAll('input[type=checkbox]').forEach(c => c.addEventListener('change', () => change(c)));
    summary();
  }
  function summary() {
    const Dn = window.MINDBLOWN || composedData, n = (Dn.brains || []).length || 1, m = (Dn.pages || []).filter(p => !p.parent).length;
    const f = failed.length ? ` · ${failed.length} failed` : '';
    setStatus(`${n} ${n === 1 ? 'brain' : 'brains'} · ${m} neurons${f}`, !!failed.length);
  }
  function setStatus(t, err) { if (status) { status.textContent = t; status.classList.toggle('err', !!err); } }
  function persist(refs) {
    const nat = sameSet(refs, nativeRefs);
    try { if (!store) { } else if (nat) store.removeItem(LS); else store.setItem(LS, refs.join(',')); } catch (e) { }
    const parts = hashParts().filter(p => !p.startsWith('net='));
    if (!nat) parts.push('net=' + encodeRefs(refs));
    const h = parts.length ? '#' + parts.join('&') : '';
    history.replaceState(null, '', location.pathname + location.search + h);
  }
  function change(c) {
    if (c.checked) checked.add(c.value); else checked.delete(c.value);
    if (!checked.size) { c.checked = true; checked.add(c.value); setStatus('keep at least one brain', true); return; }
    const unknown = r => resolved.some(x => x.ref === r && x.missing);   // refs with no catalog entry have no row to untick: drop them on the next change
    const refs = uniq(nativeRefs.filter(r => checked.has(r)).concat(selection.filter(r => checked.has(r) && !nativeRefs.includes(r))).concat([...checked].filter(r => !nativeRefs.includes(r) && !selection.includes(r)))).filter(r => !unknown(r));
    persist(refs);
    list.querySelectorAll('input').forEach(i => { i.disabled = true; });
    setStatus('Rebuilding…'); loadingText('Rebuilding…');
    setTimeout(() => location.reload(), 60);
  }
  function reset() { persist(nativeRefs); setStatus('Rebuilding…'); setTimeout(() => location.reload(), 60); }
  const openP = o => { if (!panel) return; panel.hidden = !o; btn.setAttribute('aria-expanded', String(o)); btn.classList.toggle('on', o); if (o) { summary(); (panel.querySelector('input:not(:disabled)') || panel).focus({ preventScroll: true }); } };
  // the toolbar is injected by the engine; put the button after #shot, or in the zoom column when the toolbar is hidden (mobile), else float it
  function home() {
    const shot = document.getElementById('shot') || document.getElementById('labels-toggle');
    const tools = shot && shot.parentElement;
    if (tools && getComputedStyle(tools).display !== 'none') { if (btn.previousElementSibling !== shot) shot.insertAdjacentElement('afterend', btn); btn.classList.remove('fab'); return; }
    const z = document.getElementById('zoom-ctl');
    if (z) { if (btn.parentElement !== z) z.prepend(btn); btn.classList.remove('fab'); return; }
    if (btn.parentElement !== document.body) document.body.appendChild(btn); btn.classList.add('fab');
  }
  function mount() {
    if (btn) return;
    btn = document.createElement('button'); btn.id = 'networks'; btn.type = 'button'; btn.title = 'Networks (N): add other networks or brains to this screen, or take brains away'; btn.setAttribute('aria-label', 'Networks'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'networks-panel');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="6" r="3"/><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M10.5 8.6 7.5 14.2M13.5 8.6l3 5.6M9 17h6"/></svg>';
    panel = document.createElement('aside'); panel.id = 'networks-panel'; panel.hidden = true; panel.tabIndex = -1; panel.setAttribute('aria-label', 'Networks');
    panel.innerHTML = `<div class="lobes-head net-head">Networks <span class="net-key">N</span></div><div class="net-list"></div><div class="net-foot"><span class="status"></span><button type="button" class="net-reset" title="Back to this page's own brains">Reset</button></div>`;
    list = panel.querySelector('.net-list'); status = panel.querySelector('.status');
    (document.getElementById('stage') || document.body).appendChild(panel);
    home(); render();
    btn.addEventListener('click', () => openP(panel.hidden));
    panel.querySelector('.net-reset').addEventListener('click', reset);
    document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) openP(false); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !panel.hidden) { openP(false); return; }
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); openP(panel.hidden); }
    });
    window.addEventListener('resize', home);
    if (failed.length) toast(`Could not load ${failed.map(f => f.res.meta.title).join(', ')} — showing the rest`);
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'net-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    (document.getElementById('stage') || document.body).appendChild(t);
    setTimeout(() => t.classList.add('show'), 30); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 6000);
  }
  // mount after the engine has booted (its then() runs after this one, synchronously; the toolbar exists by the next frame)
  ready.then(() => requestAnimationFrame(() => requestAnimationFrame(mount)));
})();
