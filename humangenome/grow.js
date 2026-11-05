/* MindBlown — grow.js: grown material for the canonical renderer.
   The Neural engine grows at runtime (window.MINDBLOWN_GROW there is the mice's and the Quantum Entangler's API). This renderer
   builds its whole model once, from window.MINDBLOWN, when app.js runs. So growth here is written into the data before the
   build: scripts that grow (the Quantum Entangler, loaded between data.js and app.js) add lobes, neurons, links and synapses
   through the same MINDBLOWN_GROW contract, and this file folds them into window.MINDBLOWN. Material added after the model is
   built is committed by reloading the page: the additions are already journaled by their owner and replayed before the next
   build, so the reload shows them. The pending toast and the new neuron's #n= deep link survive the reload.

   Contract (the subset the Entangler uses; same names and shapes as the Neural engine):
     pages() hub() lobes() selected() count(tag) addLobe(spec) addNeuron(spec) addLink(spec) addSynapse(spec)
     commit() pulse(id) fitIfOut() built()
   Everything added carries origin/by tags; nothing the brain was built with is edited. The colour registry (MBN.originColors)
   is shared with the Neural renderer: app.js paints origin-tagged neurons in their origin's colour. */
(() => {
  'use strict';
  if (window.MINDBLOWN_GROW) return;
  const MBN = (window.MBN = window.MBN || {});
  MBN.originColors = MBN.originColors || { mice: '#ff3b3b' };
  MBN.originColor = tag => (tag && MBN.originColors[tag]) || null;
  MBN.registerOrigin = (tag, hex) => { if (tag && /^#[0-9a-f]{6}$/i.test(String(hex || ''))) MBN.originColors[tag] = hex; return MBN.originColors[tag] || null; };

  const D = () => window.MINDBLOWN || null;
  const built = () => !!window.MINDBLOWN_RENDERER;   // app.js publishes it at the end of its build
  let dirty = false, lastNeuron = null, sel = null;
  const arr = (d, k) => (Array.isArray(d[k]) ? d[k] : (d[k] = []));
  const str = v => (v == null ? '' : String(v));

  // ----- reads -----
  function pages() {
    const d = D(); if (!d) return [];
    const deg = {}, nb = {};
    for (const l of arr(d, 'links')) { deg[l.s] = (deg[l.s] || 0) + (l.w || 1); deg[l.t] = (deg[l.t] || 0) + (l.w || 1); (nb[l.s] = nb[l.s] || []).push(l.t); (nb[l.t] = nb[l.t] || []).push(l.s); }
    return arr(d, 'pages').map(p => ({ id: p.id, title: p.title, lobe: p.lobe, parent: p.parent || null, deg: deg[p.id] || 0, neighbors: nb[p.id] || [], origin: p.origin || null, by: p.by || null, hub: !!p.hub, blank: !!p.blank, nSyn: (p.synapses || []).length }));
  }
  const hub = () => { const d = D(); return d ? (d.center || (d.centers && d.centers[0]) || null) : null; };
  const lobes = () => { const d = D(); return d ? arr(d, 'lobes').map(l => ({ ...l })) : []; };
  function count(tag) {
    const d = D(), c = { neurons: 0, lobes: 0, brains: 0, synapses: 0, links: 0 }; if (!d) return c;
    const own = x => x && (!tag || x.origin === tag) && x.origin;
    arr(d, 'pages').forEach(p => { if (own(p)) c.neurons++; });
    arr(d, 'lobes').forEach(l => { if (own(l)) { c.lobes++; if (l.satellite) c.brains++; } });
    arr(d, 'synapses').forEach(s => { if (own(s)) c.synapses++; });
    arr(d, 'links').forEach(l => { if (own(l)) c.links++; });
    return c;
  }

  // ----- writes: into the data, before or after the build -----
  function addLobe(spec) {
    const d = D(); if (!d || !spec || !spec.id) return null;
    const L = arr(d, 'lobes'); let l = L.find(x => x.id === spec.id);
    if (l) return l;
    l = { id: str(spec.id), name: str(spec.name || spec.id), color: /^#[0-9a-f]{6}$/i.test(str(spec.color)) ? spec.color : '#9aa', hidden: false, origin: spec.origin || 'grown', by: spec.by || null };
    if (spec.satellite) l.satellite = true;   // an image of another brain; this renderer draws it as an ordinary lobe (lobes[].brain is the network field here and is left alone)
    L.push(l); dirty = true; return l;
  }
  function addNeuron(spec) {
    const d = D(); if (!d || !spec || !spec.id) return null;
    const P = arr(d, 'pages'); let p = P.find(x => x.id === spec.id);
    if (p) return p;
    if (!arr(d, 'lobes').find(l => l.id === spec.lobe)) addLobe({ id: spec.lobe, name: spec.lobe, origin: spec.origin, by: spec.by });
    p = { id: str(spec.id), title: str(spec.title || spec.id), type: spec.hub ? 'brain' : 'entangled', lobe: str(spec.lobe), desc: str(spec.desc || ''), intro: str(spec.desc || ''), synapses: [], sources: [], origin: spec.origin || 'grown', by: spec.by || null };
    if (spec.hub) p.hub = true;
    P.push(p); dirty = true; if (!spec.hub) lastNeuron = p.id; return p;
  }
  function addLink(spec) {
    const d = D(); if (!d || !spec || !spec.s || !spec.t || spec.s === spec.t) return null;
    const P = arr(d, 'pages'); if (!P.find(x => x.id === spec.s) || !P.find(x => x.id === spec.t)) return null;
    const L = arr(d, 'links'); let l = L.find(x => (x.s === spec.s && x.t === spec.t) || (x.s === spec.t && x.t === spec.s));
    if (l) return l;
    l = { s: spec.s, t: spec.t, w: Math.max(1, +spec.w || 1), kinds: Array.isArray(spec.kinds) && spec.kinds.length ? spec.kinds.map(str) : ['grown'], notes: [spec.by ? `drawn by ${spec.by}` : 'grown'], origin: spec.origin || 'grown', by: spec.by || null };
    L.push(l); dirty = true; return l;
  }
  function addSynapse(spec) {
    const d = D(); if (!d || !spec || !spec.id || !spec.page) return null;
    const page = arr(d, 'pages').find(x => x.id === spec.page); if (!page) return null;
    const S = arr(d, 'synapses'); let s = S.find(x => x.id === spec.id);
    if (s) return s;
    const cites = [];
    for (const src of (spec.sources || [])) {
      if (!src || !src.id) continue;
      const SR = arr(d, 'sources'); let r = SR.find(x => x.id === src.id);
      if (!r) { r = { id: str(src.id), label: str(src.label || src.id), kind: str(src.kind || 'source'), pages: [] }; if (src.href) r.href = str(src.href); SR.push(r); }
      if (!r.pages.includes(page.id)) r.pages.push(page.id);
      if (!(page.sources = page.sources || []).includes(r.id)) page.sources.push(r.id);
      cites.push(r.id);
    }
    s = { id: str(spec.id), page: page.id, lead: str(spec.lead || ''), text: str(spec.text || ''), links: (spec.links || []).filter(id => id !== page.id && arr(d, 'pages').some(p => p.id === id)), cites, origin: spec.origin || 'grown', by: spec.by || null };
    S.push(s); (page.synapses = page.synapses || []).push(s.id);
    const SL = arr(d, 'synLinks'); s.links.forEach(t => { if (!SL.find(x => x.s === s.id && x.t === t)) SL.push({ s: s.id, t }); });
    dirty = true; return s;
  }

  // ----- commit: before the build nothing to do; after it, carry the toast and the new neuron over a reload -----
  let reloading = false;
  function commit() {
    if (!dirty) return false;
    dirty = false;
    if (!built() || reloading) return true;
    reloading = true;
    const open = lastNeuron ? '#n=' + encodeURIComponent(lastNeuron) : '';
    setTimeout(() => {   // long enough to read the owner's toast (set just after commit) before the page redraws; the toast is carried over
      try {
        const t = document.querySelector('.mb-ent-toast'); if (t && !t.hidden && t.textContent) sessionStorage.setItem('mbn:grow:toast-text', t.textContent.slice(0, 4000));
        if (lastNeuron) sessionStorage.setItem('mbn:grow:open', lastNeuron);
      } catch (e) { /* private mode: the reload still shows the material */ }
      if (open) { try { history.replaceState(history.state, '', open); } catch (e) { /* opaque origin: the engine's own #n= handling is enough */ } }
      location.reload();
    }, 1400);
    return true;
  }
  // after the reload: show the carried toast again and open the new neuron (the engine reads #n= itself)
  function afterReload() {
    let text = null, open = null;
    try { text = sessionStorage.getItem('mbn:grow:toast-text'); open = sessionStorage.getItem('mbn:grow:open'); sessionStorage.removeItem('mbn:grow:toast'); sessionStorage.removeItem('mbn:grow:toast-text'); sessionStorage.removeItem('mbn:grow:open'); } catch (e) { return; }
    if (!text && !open) return;
    (function wait(n) {
      if (!built()) { if (n < 200) setTimeout(() => wait(n + 1), 100); return; }
      if (open && !/[#&]n=/.test(location.hash)) { try { history.replaceState(history.state, '', '#n=' + encodeURIComponent(open)); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { location.hash = '#n=' + encodeURIComponent(open); } }
      if (text) { const t = document.querySelector('.mb-ent-toast'); if (t) { t.textContent = text.slice(0, 4000); t.hidden = false; setTimeout(() => { t.hidden = true; }, 3600); } }
    })(0);
  }
  function pulse(id) {   // this renderer has no spikes: a pulse opens the neuron (the flyout and its wires light up)
    if (!built() || !id) return false;
    const R = window.MINDBLOWN_RENDERER; if (R && typeof R.focus === 'function') { try { R.focus(id, { by: 'grow' }); return true; } catch (e) { /* fall through */ } }
    return false;
  }
  window.addEventListener('mbn:select', e => { const d = e.detail; if (d && d.id) sel = { id: d.id, kind: d.kind, by: d.by }; });

  window.MINDBLOWN_GROW = Object.freeze({
    pages, hub, lobes, count, addLobe, addNeuron, addLink, addSynapse, commit, pulse, fitIfOut: () => false, built,
    selected: () => (sel ? { ...sel } : null), dirty: () => dirty, engine: 'canonical',
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', afterReload); else afterReload();
})();
