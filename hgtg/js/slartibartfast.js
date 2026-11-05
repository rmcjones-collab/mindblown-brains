/* Slartibartfast: a procedural Origin builder. Phase 2 builds a fictional blueprint from sourced
   materials; Phase 3 draws its coastline and fjords. No life yet. No server writes; world acts belong to Origin. */
(() => {
  'use strict';
  const D = window.MINDBLOWN, O = window.MINDBLOWN_ORIGIN, G = window.MINDBLOWN_GROW;
  if (!D || !O || !G || window.MINDBLOWN_SLARTI) return;
  const ID = 'slartibartfast', NAME = 'Slartibartfast';
  const BOUNDARY = 'Designed by Slartibartfast. The materials are sourced; the world is not.';
  const SIGNED = 'Blueprint signed. Coastlines and entities are not built yet.';   // Phase 1 and 2 worlds
  const SIGNED3 = 'World signed. Coastline drawn; entities are not built yet.';
  const CAPS = Object.freeze({ neurons: 90, lobes: 12, brains: 3, synapses: 320, entities: 8 });
  const KEY = 'mbn:slarti:' + (D.brain || D.title || 'brain');
  // Phase 2 materials table: every material is a canonical neuron, keyed by brain and id, with its
  // canonical title kept for a fallback match if an id is renamed. Each option is one design choice:
  // its note is his, its materials are sourced. Option order and the first two notes match Phase 1
  // so version-1 journals replay with the same words.
  const SITES = Object.freeze({ atomic: 'https://rmcjones-collab.github.io/mindblown-brains/atomicbrain/', elements: 'https://rmcjones-collab.github.io/mindblown-brains/elementsbrain/',
    molecular: 'https://rmcjones-collab.github.io/mindblown-brains/molecularbrain/', chemistry: 'https://rmcjones-collab.github.io/mindblown-brains/chembrain/',
    biosphere: 'https://rmcjones-collab.github.io/mindblown-brains/biospherebrain/', brain42: 'https://rmcjones-collab.github.io/mindblown-brains/brain42/' });
  const M = (brain, ref, title) => Object.freeze({ brain, ref, title });
  const STEPS = [
    { rung: 1, name: 'Atom', legacy: M('atomic', 'cloud/hydrogen'),
      core: [M('atomic', 'nuc/proton', 'The proton'), M('atomic', 'cloud/electron', 'The electron'),
        M('atomic', 'cloud/orbital', 'Orbitals: s, p, d, f'), M('atomic', 'cloud/hydrogen', 'Hydrogen: the simplest atom')],
      options: [{ note: 'Hydrogen first. I shall give the heavier materials something to aspire to.', extra: [] },
        { note: 'A modest beginning: hydrogen. Plenty of room for improvements at the coast.', extra: [] }] },
    { rung: 2, name: 'Elements', legacy: M('elements', 'el/si'),
      core: [M('elements', 'el/o', 'Oxygen (O)'), M('elements', 'el/si', 'Silicon (Si)')],
      options: [{ note: 'Silicon for the stony palette; pale cliffs and a little dark sand.',
          extra: [M('elements', 'el/al', 'Aluminium (Al)'), M('elements', 'el/ca', 'Calcium (Ca)'), M('elements', 'el/cu', 'Copper (Cu)')] },
        { note: 'A darker mineral palette. The headlands should look dignified in the rain.',
          extra: [M('elements', 'el/fe', 'Iron (Fe)'), M('elements', 'el/mg', 'Magnesium (Mg)'), M('elements', 'el/au', 'Gold (Au)')] }] },
    { rung: 3, name: 'Molecules', legacy: M('molecular', 'water/structure'),
      core: [M('molecular', 'water/structure', 'The water molecule'), M('chemistry', 'silicon-dioxide', 'Silicon dioxide')],
      options: [{ note: 'Water for the sea. A restrained blue-green, with no obligation to match another planet.',
          extra: [M('chemistry', 'sodium-chloride', 'Sodium chloride'), M('chemistry', 'nitrogen', 'Nitrogen (N₂)'), M('chemistry', 'oxygen', 'Oxygen (O₂)')] },
        { note: 'Water, with silver light across the bays. The colour is a design choice, not chemistry.',
          extra: [M('chemistry', 'nitrogen', 'Nitrogen (N₂)'), M('chemistry', 'carbon-dioxide', 'Carbon dioxide'), M('chemistry', 'calcium-carbonate', 'Calcium carbonate')] }] },
    { rung: 4, name: 'Ground and sea', legacy: M('biosphere', 'earth/oceans'),
      core: [M('biosphere', 'earth/oceans', 'The oceans'), M('biosphere', 'earth/tectonics', 'Plate tectonics'), M('biosphere', 'cycle/rock', 'The rock cycle and the biosphere')],
      options: [{ note: 'Reserve a long western shore and an extravagant northern inlet. Drawing comes later.', extra: [M('biosphere', 'eco/soils', 'Soils')] },
        { note: 'Reserve an archipelago around a sheltered sea. I have left ample room for fjords.', extra: [M('brain42', 'uni/solar-system/moon', 'The Moon')] }] },
    { rung: 6, name: 'Weather and light', legacy: M('biosphere', 'earth/climate'),
      core: [M('biosphere', 'earth/atmosphere', 'The atmosphere'), M('biosphere', 'earth/climate', 'The climate system'), M('biosphere', 'cycle/water', 'The water cycle')],
      options: [{ note: 'Cool mornings and very long amber evenings, as a fictional design brief, not a climate prediction.', extra: [M('brain42', 'uni/stars/sun', 'The Sun')] },
        { note: 'Soft rain, then clear light on the headlands. No physical simulation is implied.', extra: [M('biosphere', 'earth/sun', 'The Sun as power supply')] }] },
    { rung: 8, name: 'World blueprint', core: [],
      options: [{ note: 'Blueprint signed. The coastline and living entities are still to be built. Rather looking forward to the fjords.', extra: [] }] },
  ];
  // Phase 3: new worlds (version-3 acts) climb a seven-rung ladder with the coastline drawn at rung 5, after ground and sea
  // and before weather. Phase 1 and 2 journals keep their six-step ladder and replay exactly; they are not given a coast.
  const COAST = { rung: 5, name: 'Coastline', coast: true, core: [],
    options: [{ note: 'One long coast and an extravagant northern fjord, with a second for practice.', extra: [], rough: 0.1 },
      { note: 'A ragged coast, crinkled like the edge of a good map. Two fjords; one will win an award.', extra: [], rough: 0.16 }] };
  const SIGN3 = { rung: 8, name: 'World blueprint', core: [],
    options: [{ note: 'Blueprint signed, coastline and all. Living entities are still to come. The fjord came out rather well.', extra: [] }] };
  const WORLD = [STEPS[0], STEPS[1], STEPS[2], STEPS[3], COAST, STEPS[4], SIGN3];
  [...STEPS, COAST, SIGN3].forEach(s => { s.notes = s.options.map(o => o.note); });
  const ladderOf = o => o.acts.length && o.acts[0] && o.acts[0].v < 3 ? STEPS : WORLD;
  const signedFor = L => L === WORLD ? SIGNED3 : SIGNED;
  // ---------- coastline design (Phase 3): a seeded outline, two fjords, named places; scenery and fiction, not geography ----------
  const prng = seed => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const u32 = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const SHORES = ['Grey Headland', 'Heron Point', 'Saltmarsh Bay', 'Cormorant Rocks', 'Amber Cove', 'The Long Strand', 'Quiet Bay', 'Gull Ness', 'Seal Skerry', 'Bramble Point'];
  const LANDS = ['The Uplands', 'Lake Country', 'The High Moor', 'Pine Ridge'];
  const SEAS = ['The Sheltered Sea', 'Open Water', 'The Sound', 'The Outer Banks'];
  const FJORDS = ['Norrafjord', 'The Crinkled Fjord', 'Langvik Fjord', 'Unhurried Fjord', 'Mistfjord', 'Stillwater Fjord'];
  const FJORD_PARTS = [['Inner basin', 'Threshold sill', 'Hanging valley'], ['Head of the fjord', 'Steep wall', 'Narrow mouth']];
  const DRAFT_NOTES = ['A first sketch of the coast. The headland is in quite the wrong place.', 'Moved the headland. Closer. The bay wants taking in a little.'];
  const COAST_R = 230, COAST_N = 160, TAU = Math.PI * 2;
  const angDiff = (a, b) => { const d = ((a - b) % TAU + TAU) % TAU; return d > Math.PI ? d - TAU : d; };
  function coastline(seed, choice) {
    const rnd = prng(seed), rough = COAST.options[choice].rough, R = COAST_R;
    const harm = [2, 3, 4, 5, 7].map(k => ({ k, a: (0.4 + rnd()) / Math.sqrt(k - 1), p: rnd() * TAU }));
    const sum = harm.reduce((n, h) => n + h.a, 0); harm.forEach(h => { h.a *= rough * 2.2 / sum; });   // never more than ±rough·2.2 of the radius
    const f0 = rnd() * TAU, f1 = f0 + Math.PI * (0.65 + rnd() * 0.5);
    const fjords = [{ th: f0, depth: 0.55, w: 0.11, bend: rnd() - 0.5 }, { th: f1, depth: 0.38, w: 0.09, bend: rnd() - 0.5 }];
    const base = th => R * (1 + harm.reduce((n, h) => n + h.a * Math.sin(h.k * th + h.p), 0));
    const pts = [];
    for (let i = 0; i < COAST_N; i++) {
      let th = (i / COAST_N) * TAU, rr = base(th);
      for (const f of fjords) { const d = Math.abs(angDiff(th, f.th)); if (d < f.w) { const t = 1 - d / f.w; rr -= f.depth * R * Math.pow(t, 0.7); th += f.bend * f.w * t * 0.6; } }
      pts.push([Math.round(Math.cos(th) * rr), Math.round(Math.sin(th) * rr)]);
    }
    const at = (th, r) => ({ dx: Math.round(Math.cos(th) * r), dy: Math.round(Math.sin(th) * r) });
    // places: five shores spaced round the coast clear of both fjords, two inland, two at sea, a neuron at each fjord head
    const shoreTh = []; for (let j = 0; j < 6; j++) shoreTh.push(f0 + (j + 0.5) * TAU / 6);
    shoreTh.sort((a, b) => Math.abs(angDiff(b, f1)) - Math.abs(angDiff(a, f1))); shoreTh.length = 5;
    shoreTh.sort((a, b) => ((a - f0) % TAU + TAU) % TAU - ((b - f0) % TAU + TAU) % TAU);
    const pick = (list, n) => { const l = list.slice(), out = []; while (out.length < n) out.push(l.splice(Math.floor(rnd() * l.length), 1)[0]); return out; };
    const sn = pick(SHORES, 5), ln = pick(LANDS, 2), wn = pick(SEAS, 2), fn = pick(FJORDS, 1)[0];
    return { pts, fjords,
      shores: shoreTh.map((th, j) => ({ name: sn[j], th, at: at(th, base(th)) })),
      lands: [f0 + Math.PI / 2, f0 - Math.PI / 2].map((th, j) => ({ name: ln[j], th, at: at(th, R * 0.42) })),
      seas: [f0 + Math.PI * 0.25, f1 + Math.PI * 0.3].map((th, j) => ({ name: wn[j], th, at: at(th, R * (1 + rough * 2.2) + 95) })),
      heads: fjords.map((f, k) => ({ name: k ? 'The practice fjord' : fn, th: f.th, at: at(f.th + f.bend * f.w * 0.6, base(f.th) - f.depth * R * 0.8), parts: FJORD_PARTS[k] })) };
  }
  const COAST_NEURONS = 5 + 2 + 2 + 2 + 6;   // shores, lands, seas, fjord heads, fjord sub-neurons
  const wanted = (spec, choice) => [...spec.core, ...spec.options[choice].extra];
  const hrefs = m => [`${m.brain}.html#n=${encodeURIComponent(m.ref)}`, `${SITES[m.brain]}/#n=${encodeURIComponent(m.ref)}`];
  const worlds = new Map();
  let paused = false, working = false, timer = 0, cursor = 0, preferenceWarning = '';
  // one guarded handle, as in origin.js: storage can be missing or throw on access
  const prefs = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  try { if (!prefs) throw Error('storage unavailable'); paused = prefs.getItem(KEY) === 'paused'; } catch (e) { preferenceWarning = 'Pause preference cannot be saved.'; }
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hostPages = new Map(D.pages.map(p => [p.id, p]));
  const hidden = new Set(D.lobes.filter(l => l.hidden).map(l => l.id));
  const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

  const box = document.createElement('section');
  box.id = 'slarti-controls'; box.hidden = true; box.setAttribute('aria-label', 'Slartibartfast workshop controls');
  box.innerHTML = `<b>Slartibartfast</b><p class="slarti-boundary"></p><output id="slarti-progress" aria-live="polite"></output>
    <p id="slarti-warning" role="status" hidden></p><div class="slarti-actions">
    <button type="button" id="slarti-pause" aria-pressed="false">Pause</button>
    <button type="button" id="slarti-step">Next step</button>
    <button type="button" id="slarti-clear">Clear his worlds</button></div>
    <div id="slarti-confirm" hidden><p>Forget only Slartibartfast's worlds on this page? Mice worlds and learned weights will stay.</p>
    <button type="button" id="slarti-confirm-clear">Forget his worlds</button><button type="button" id="slarti-cancel-clear">Cancel</button></div>`;
  box.querySelector('.slarti-boundary').textContent = BOUNDARY;
  document.querySelector('.origin-dock').appendChild(box);
  const $ = id => document.getElementById(id);
  function sync() {
    box.hidden = !worlds.size;
    const all = [...worlds.values()], current = all.find(w => !w.o.done && !w.error) || all[all.length - 1];
    const completed = current ? current.o.acts.length : 0;
    const L = current ? ladderOf(current.o) : STEPS;
    const mats = current ? current.o.acts.flatMap(a => a.materials || (a.material ? [{ brain: STEPS[a.step].legacy.brain }] : [])) : [];
    const nb = new Set(mats.map(m => m.brain)).size, plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const matText = mats.length ? ` ${plural(mats.length, 'material')} from ${plural(nb, 'brain')}.` : '';
    const doneText = L === WORLD ? 'World signed; coastline drawn, life reserved.' : 'Blueprint signed; coastline and life reserved.';
    $('slarti-progress').textContent = current ? `${current.o.subject}: ${completed}/${L.length} blueprint stages.${matText} ${current.o.done ? doneText : current.message || 'Ready for ' + L[Math.min(completed, L.length - 1)].name + '.'}` : '';
    const warning = all.find(w => w.error)?.error || preferenceWarning;
    $('slarti-warning').textContent = warning; $('slarti-warning').hidden = !warning;
    $('slarti-pause').textContent = paused ? 'Resume' : 'Pause';
    $('slarti-pause').setAttribute('aria-pressed', String(paused));
    $('slarti-step').disabled = working || !all.some(w => !w.o.done && !w.error);
  }
  function setPaused(value) {
    paused = value;
    try { if (!prefs) throw Error('storage unavailable'); prefs.setItem(KEY, value ? 'paused' : 'running'); preferenceWarning = ''; }
    catch (e) { preferenceWarning = 'Pause preference cannot be saved.'; }
    clearTimeout(timer); if (!paused) schedule(); sync();
  }
  function schedule() {
    clearTimeout(timer);
    if (!paused && [...worlds.values()].some(w => !w.o.done && !w.error)) timer = setTimeout(() => {
      if (!document.hidden) step(false).catch(() => {}); else schedule();
    }, 7000);
  }
  const ownedPrefix = o => `slarti/${o.id}`;
  const safeRef = r => typeof r === 'string' && /^[\w./-]{1,120}$/.test(r);
  // A stored material must name an entry from this rung's table (or its renamed id, matched by the
  // canonical title), and link only to that brain's known page or public site.
  function validMaterial(m, entry) {
    if (!m || m.brain !== entry.brain || !safeRef(m.ref) || !text(m.title, 200) || !text(m.desc, 2000) || typeof m.local !== 'boolean') return false;
    if (m.fallback === true ? m.title.toLowerCase() !== entry.title.toLowerCase() : (m.fallback !== undefined || m.ref !== entry.ref)) return false;
    return hrefs(m).includes(m.href);
  }
  function validAct(a, i, L = STEPS) {
    const spec = L[i];
    if (!a || !spec || a.step !== i || !Number.isInteger(a.choice) || a.choice < 0) return false;
    if (L === WORLD) {   // Phase 3 worlds: version-3 acts only
      if (a.v !== 3 || a.choice >= spec.options.length || a.material) return false;
      if (spec.coast) return !a.materials && u32(a.seed) && Array.isArray(a.drafts) && a.drafts.length <= 2 && a.drafts.every(u32);
      if (a.seed !== undefined || a.drafts !== undefined) return false;
      const list = wanted(spec, a.choice);
      if (!list.length) return !a.materials;
      return Array.isArray(a.materials) && a.materials.length === list.length && a.materials.every((m, k) => validMaterial(m, list[k]));
    }
    if (a.v === 1) {   // Phase 1 journals: one material per rung, the rung's legacy reference
      if (a.choice >= Math.min(2, spec.notes.length)) return false;
      if (i === STEPS.length - 1) return !a.material && !a.materials;
      const m = a.material, l = spec.legacy;
      return !!m && !a.materials && text(m.title, 200) && text(m.desc, 2000) && typeof m.local === 'boolean' &&
        (m.href === `${l.brain}.html#n=${encodeURIComponent(l.ref)}` || m.href === `${SITES[l.brain]}/#n=${encodeURIComponent(l.ref)}`);
    }
    if (a.v !== 2 || a.choice >= spec.options.length || a.material || !Array.isArray(a.materials)) return false;
    const list = wanted(spec, a.choice);
    return a.materials.length === list.length && a.materials.every((m, k) => validMaterial(m, list[k]));
  }
  const titleKey = t => String(t || '').trim().toLowerCase();
  function liveSource(entry, ref = entry.ref) {
    if (!(D.brain === entry.brain || (D.brain === 'particles' && entry.brain === 'atomic'))) return null;
    const ok = p => p && !p.origin && !hidden.has(p.lobe);
    const p = hostPages.get(ref);
    if (ok(p)) return p;
    return [...hostPages.values()].find(q => ok(q) && titleKey(q.title) === titleKey(entry.title)) || null;
  }
  async function materials(list) {
    let index = null; const out = [];
    for (const entry of list) {
      const p = liveSource(entry);
      if (p) {
        const fallback = p.id !== entry.ref;
        out.push({ brain: entry.brain, ref: p.id, title: String(p.title).slice(0, 200), desc: String(p.desc || p.intro || p.title).slice(0, 2000),
          local: true, href: `${entry.brain}.html#n=${encodeURIComponent(p.id)}`, ...(fallback ? { fallback: true } : {}) });
        continue;
      }
      if (!index) { index = await O.index(); if (!index || !Array.isArray(index.brains) || !Array.isArray(index.pages)) return { missing: entry }; }
      const n = index.brains.findIndex(b => b.id === entry.brain && !b.fiction && b.page === `${entry.brain}.html`);
      if (n < 0) return { missing: entry };
      const rows = index.pages.filter(r => r[0] === n);
      let row = rows.find(r => r[1] === entry.ref), fallback = false;
      if (!row) { row = rows.find(r => titleKey(r[2]) === titleKey(entry.title)); fallback = !!row; }
      if (!row || !safeRef(row[1])) return { missing: entry };
      // Only the manifest's expected public host is used, else the known relative page.
      const site = index.brains[n].site === SITES[entry.brain] ? SITES[entry.brain] : null;
      const ref = row[1];
      out.push({ brain: entry.brain, ref, title: String(row[2]).slice(0, 200), desc: String(row[4]).slice(0, 2000), local: false,
        href: site ? `${site}/#n=${encodeURIComponent(ref)}` : `${entry.brain}.html#n=${encodeURIComponent(ref)}`, ...(fallback ? { fallback: true } : {}) });
    }
    return { list: out };
  }
  const coastLobe = o => `${ownedPrefix(o)}/coast`;
  function addCoastLobe(o, tag) { return G.addLobe({ id: coastLobe(o), name: `${o.subject}: coastline`, color: '#d9c49b', brain: o.id, reach: 860, ...tag }); }
  // the coast rung: the final outline, then its places. Every place is labelled design; land and sea trace back to sourced materials.
  function applyCoast(o, a, node, tag) {
    const prefix = ownedPrefix(o), lobe = coastLobe(o), c = coastline(a.seed, a.choice), id = `${prefix}/${a.step}/coast`;
    addCoastLobe(o, tag); G.setCoast(lobe, { pts: c.pts });
    const place = (pid, title, desc, lead, text, at, parent) => {
      G.addNeuron({ id: pid, title, desc: `${BOUNDARY} ${desc}`, lobe, near: node, ...(at ? { at } : {}), ...(parent ? { parent } : {}), ...tag });
      G.addSynapse({ id: `${pid}#note`, page: pid, lead, text, section: "Designer's notes", sources: [], ...tag });
    };
    const nearest = th => c.shores.reduce((b, s, j) => Math.abs(angDiff(s.th, th)) < Math.abs(angDiff(c.shores[b].th, th)) ? j : b, 0);
    c.shores.forEach((s, j) => place(`${id}/s${j}`, s.name, 'A designed stretch of shore; it follows no real coastline.', 'Design, not geography', `${s.name}: drawn by hand, the way he likes it.`, s.at));
    c.shores.forEach((s, j) => G.addLink({ s: `${id}/s${j}`, t: `${id}/s${(j + 1) % c.shores.length}`, w: 1, note: 'Along the coast', ...tag }));
    c.lands.forEach((l, j) => {
      place(`${id}/l${j}`, l.name, 'Designed land behind the coast.', 'Design, not geography', `${l.name}: land laid on the sourced ground materials.`, l.at);
      G.addLink({ s: `${id}/l${j}`, t: `${id}/s${nearest(l.th)}`, w: 1, note: 'Inland from this shore', ...tag });
      G.addLink({ s: `${id}/l${j}`, t: `${prefix}/3/m${j + 1}`, w: 1, note: 'Land built on this sourced material', ...tag });
    });
    c.seas.forEach((x, j) => {
      place(`${id}/w${j}`, x.name, 'Designed water off the coast.', 'Design, not geography', `${x.name}: sea filled from the sourced oceans material.`, x.at);
      G.addLink({ s: `${id}/w${j}`, t: `${id}/s${nearest(x.th)}`, w: 1, note: 'Offshore from this shore', ...tag });
      if (j === 0) G.addLink({ s: `${id}/w${j}`, t: `${prefix}/3/m0`, w: 1, note: 'Sea built on this sourced material', ...tag });
    });
    c.heads.forEach((f, k) => {
      const fid = `${id}/f${k}`;
      place(fid, f.name, k ? 'A second fjord, drawn for practice.' : 'The named fjord: his favourite part of the job.',
        k ? 'Design, not geography' : 'Award-winning, by his own reckoning',
        k ? 'Drawn for practice. Still rather good.' : `${f.name}. Nobody has yet told him it is not equatorial enough.`, f.at);
      G.addLink({ s: fid, t: `${id}/s${nearest(f.th)}`, w: 1, note: 'The fjord opens onto this shore', ...tag });
      G.addLink({ s: node, t: fid, w: 1, note: 'Rung 5: the fjords', ...tag });
      f.parts.forEach((part, j) => {
        place(`${fid}/${j}`, part, `Part of ${f.name}. The landform word is borrowed; nothing here is measured.`, 'Design, not geography', `${part}: a designed feature of ${f.name}.`, null, fid);
        G.addLink({ s: `${fid}/${j}`, t: fid, w: 1, note: `Part of ${f.name}`, ...tag });
      });
    });
    G.addLink({ s: node, t: `${id}/s0`, w: 1, note: 'Rung 5: the coastline', ...tag });
  }
  function apply(w, a, L = STEPS) {
    const o = w.o, spec = L[a.step], prefix = ownedPrefix(o);
    const lobe = `${prefix}/workshop`, node = `${prefix}/${a.step}/design`;
    const tag = { origin: ID, by: NAME };
    G.addLobe({ id: lobe, name: `${o.subject}: design ladder`, color: '#70b9af', brain: o.id, ...tag });
    const note = spec.notes[a.choice];
    G.addNeuron({ id: node, title: `${spec.rung}. ${spec.name}`, desc: `${BOUNDARY} ${note}`, lobe, near: o.hub, ...tag });
    G.addSynapse({ id: `${node}#note`, page: node, lead: 'Design choice, not a scientific fact', text: note, section: "Designer's notes", sources: [], ...tag });
    if (a.v === 1 && a.material) {   // Phase 1 shape, replayed unchanged
      const ref = `${prefix}/${a.step}/material`, m = a.material;
      G.addNeuron({ id: ref, title: m.title, desc: `Material reference, not an invented property of ${o.subject}. ${m.desc}`, lobe, near: o.hub, ...tag });
      G.addSynapse({ id: `${ref}#source`, page: ref, lead: 'Material reference', text: m.desc,
        section: 'Materials', sources: [{ id: `${ref}:source`, label: `${spec.legacy.brain}: ${m.title}`, href: m.href, kind: 'mindblown' }], ...tag });
      const local = liveSource(spec.legacy);
      if (local) G.addLink({ s: ref, t: local.id, w: 1, note: 'Material reference to the sourced original', ...tag });
      G.addLink({ s: ref, t: o.hub, w: 1, note: 'Material for the world blueprint', ...tag });
      G.addLink({ s: node, t: ref, w: 1, note: 'Fictional design uses this reference', ...tag });
    } else if (a.materials && a.materials.length) {
      const mlobe = `${prefix}/materials`;
      G.addLobe({ id: mlobe, name: `${o.subject}: materials`, color: '#8fb3d9', brain: o.id, ...tag });
      const list = wanted(spec, a.choice);
      a.materials.forEach((m, k) => {
        const id = `${prefix}/${a.step}/m${k}`, rung = `Rung ${spec.rung} (${spec.name})`;
        G.addNeuron({ id, title: m.title, desc: `Material relayed from ${m.brain}; a sourced fact, not an invented property of ${o.subject}. ${m.desc}`, lobe: mlobe, near: node, ...tag });
        G.addSynapse({ id: `${id}#source`, page: id, lead: `${rung} material`, text: m.desc, section: 'Materials',
          sources: [{ id: `${id}:source`, label: `${m.brain}: ${m.title}`, href: m.href, kind: 'mindblown' }], ...tag });
        const local = liveSource(list[k], m.ref);
        if (local) G.addLink({ s: id, t: local.id, w: 1, note: `${rung} material: the sourced original`, ...tag });
        G.addLink({ s: node, t: id, w: 1, note: `${rung}: design built on this material`, ...tag });
      });
    } else if (spec.coast) {
      applyCoast(o, a, node, tag);
    } else if (a.step === L.length - 1) {
      G.addLink({ s: node, t: o.hub, w: 1, note: 'The blueprint is signed into the world', ...tag });
    }
    if (a.step) G.addLink({ s: node, t: `${prefix}/${a.step - 1}/design`, w: 1, note: 'Blueprint order; not a causal scientific claim', ...tag });
    else if (a.v !== 1) G.addLink({ s: node, t: o.hub, w: 1, note: 'The ladder starts at the atom', ...tag });
    G.update(o.hub, { desc: L === WORLD && a.step >= 4 ? `${BOUNDARY} Blueprint built from sourced materials and a coastline drawn by design; living entities are reserved for a later phase.`
      : `${BOUNDARY} Blueprint built from sourced materials; coastline rendering and living entities are reserved for later phases.` });
    return node;
  }
  function attach(o, replay) {
    const w = { o, error: '', message: '' }; worlds.set(o.id, w);
    const acts = o.acts, L = ladderOf(o);
    if (!/^origin-brain-[1-9]\d*$/.test(o.id) || o.hub !== `origin/${o.id.replace('origin-brain-', '')}` ||
        hostPages.has(o.hub) || D.lobes.some(l => l.id === o.id) || !Array.isArray(acts) || acts.length > L.length ||
        acts.some((a, i) => !validAct(a, i, L)) || (o.done && acts.length !== L.length)) {
      w.error = 'This world journal is invalid. It was not replayed; clear his worlds to start again.'; sync(); return;
    }
    if (replay) {
      try { acts.forEach(a => apply(w, a, L)); G.commit({ alpha: 0.3 }); if (!o.done && acts.length === L.length) o.finish(signedFor(L)); }
      catch (e) { w.error = 'This world could not be replayed. Generation is stopped.'; }
    } else {
      G.update(o.hub, { desc: `${BOUNDARY} A commissioned world blueprint.` });
      G.commit({ alpha: 0.3 });
      o.say(`${NAME}: A world called ${o.subject}. Splendid. I shall start with the atom.`);
    }
    sync(); schedule();
  }
  async function step(manual = true) {
    if (working || (!manual && paused)) return null;
    const pending = [...worlds.values()].filter(w => !w.o.done && !w.error);
    if (!pending.length) return null;
    const w = pending[cursor++ % pending.length], L = ladderOf(w.o), i = w.o.acts.length, spec = L[i];
    // All acts saved but the completion write failed earlier: finish now rather than leave the world pending.
    if (!spec) { w.o.finish(signedFor(L)); sync(); return null; }
    working = true; sync();
    try {
      const choice = Math.floor(Math.random() * spec.options.length), list = wanted(spec, choice);
      const got = list.length ? await materials(list) : { list: [] };
      // Pause during an index request must stop the background act as well.
      if (!manual && paused) return null;
      if (got.missing) { w.message = `Waiting for ${got.missing.brain}: ${got.missing.title}. Next step retries; no material invented.`; w.o.say(w.message); return null; }
      const seed32 = () => Math.floor(Math.random() * 4294967296);
      const a = L === STEPS ? { v: 2, step: i, choice, materials: got.list }
        : spec.coast ? { v: 3, step: i, choice, seed: seed32(), drafts: Array.from({ length: 1 + (Math.random() < 0.5 ? 1 : 0) }, seed32) }
        : { v: 3, step: i, choice, ...(list.length ? { materials: got.list } : {}) };
      if (!validAct(a, i, L)) throw Error('Invalid material');
      const mine = new Set([w.o.id, ...G.lobes().filter(l => l.brain === w.o.id).map(l => l.id)]);
      const pages = G.pages().filter(p => mine.has(p.lobe));
      const grows = list.length + (spec.coast ? COAST_NEURONS : 0) + 1;
      const newLobes = (i === 0 ? 1 : 0) + (list.length && !mine.has(`${ownedPrefix(w.o)}/materials`) ? 1 : 0) + (spec.coast && !mine.has(coastLobe(w.o)) ? 1 : 0);
      if (pages.length + grows > CAPS.neurons || mine.size + newLobes > CAPS.lobes ||
          pages.reduce((n, p) => n + p.nSyn, 0) + grows > CAPS.synapses) throw Error('World budget reached');
      // He redraws the coast once or twice before settling, with a note each time; reduced motion goes straight to the final line.
      if (spec.coast && motion) {
        addCoastLobe(w.o, { origin: ID, by: NAME }); G.commit({ alpha: 0.2 });
        for (const [k, d] of a.drafts.entries()) {
          G.setCoast(coastLobe(w.o), { pts: coastline(d, choice).pts }); w.message = DRAFT_NOTES[k]; w.o.say(`${NAME}: ${DRAFT_NOTES[k]}`); sync();
          if (G.fitIfOut) G.fitIfOut(500);
          await new Promise(r => setTimeout(r, 1100));
        }
      }
      const node = apply(w, a, L);
      // Record the act before completion: finish() saves the whole journal row, so `done` is never persisted without its final act.
      w.o.record(a);
      if (i === L.length - 1) w.o.finish(signedFor(L));
      w.message = spec.coast ? 'Coastline drawn. Moved the headland. Better.' : `${spec.name} drafted.`;
      G.commit({ alpha: 0.3 }); w.o.say(`${w.o.subject}: ${spec.name}. ${spec.coast ? 'Moved the headland. Better. ' : ''}${spec.notes[a.choice]}`);
      if (!manual && motion && !G.busy()) G.showRoute(node, w.o.hub, 700);
      if (G.fitIfOut) G.fitIfOut(motion ? 600 : 0);
      return a;
    } catch (e) { w.error = 'This world stopped safely: ' + e.message; return null; }
    finally { working = false; sync(); schedule(); }
  }
  $('slarti-pause').onclick = () => setPaused(!paused);
  $('slarti-step').onclick = () => step(true);
  $('slarti-clear').onclick = () => { $('slarti-confirm').hidden = false; $('slarti-confirm-clear').focus(); };
  $('slarti-cancel-clear').onclick = () => { $('slarti-confirm').hidden = true; $('slarti-clear').focus(); };
  $('slarti-confirm-clear').onclick = () => {
    setPaused(true);
    if (O.clearBuilder(ID)) location.reload();
    else { preferenceWarning = 'Could not save the clear operation. Nothing was reloaded.'; sync(); }
  };
  window.MINDBLOWN_SLARTI = Object.freeze({
    step, pause: () => setPaused(true), resume: () => setPaused(false), paused: () => paused,
    caps: CAPS, status: () => ({ paused, working, worlds: worlds.size }),
    materials: () => STEPS.map(s => ({ rung: s.rung, name: s.name, core: s.core, options: s.options.map(o => o.extra) })),
    ladder: () => WORLD.map(s => ({ rung: s.rung, name: s.name })), coastline: (seed, choice) => coastline(seed, choice),
  });
  O.register({ id: ID, name: NAME, verb: 'Commission Slartibartfast', ownControls: true,
    ask: () => 'A world, is it? Splendid. What shall we call it?',
    suggest: () => ['Quiet Reach', 'Northwater', 'The Unhurried Isles', 'Another Norway'],
    take: o => attach(o, false), replay: o => attach(o, true),
    pause: () => setPaused(true), resume: () => setPaused(false), paused: () => paused });
})();
