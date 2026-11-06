/* MindBlown — the Quantum Entangler.
   A toggle that sits below the Don't Panic button. Switch it on and the brain you are looking at becomes entangled: from then on,
   every neuron you select is a measurement, and measuring a neuron collapses it together with a partner it had no wire to.
   The collapse is drawn as a pair node — “A ⟷ B” — wired to both, carrying one synapse that says, honestly, what the two share.
   Pair nodes gather in Entangled-pairs lobes; a partner found in another brain is drawn as an image inside a satellite brain
   named after its home. Everything the Entangler makes carries origin 'entangled', so the engine rings it and sends its
   signals out in entangled cyan rather than the mice's red (MBN.registerOrigin). Nothing the brain was built with is edited.

   Principles, borrowed from the Improbability Drive:
   - one shared script, loaded on every brain page; it injects its own button, styles and toasts, and reads only the public hooks
     (window.MINDBLOWN, MINDBLOWN_GROW, MINDBLOWN_ORIGIN, the mbn:select event);
   - probability, not choice: the partner is drawn at odds, weighted towards neurons that share evidence with the measured one
     but have no wire to it (and lightly-wired neurons over hubs); the odds are stated in the pair node;
   - it does nothing until switched on, and measuring an already-collapsed neuron gives the same partner again (the pair node
     fires, so the partner lights up), as a second measurement should;
   - what it draws is journaled per brain (localStorage) and replayed on reload, like the mice; switching off keeps the pairs,
     Shift-press (or a long press) twice forgets them;
   - reduced motion is honoured (no glow animation, and the engine already drops spikes);
   - no invented facts: a pair node says which sources the two neurons share, or that they share none, and that this is a picture
     of entanglement drawn on the knowledge graph, not a physical claim. */
(() => {
  'use strict';
  if (window.MINDBLOWN_ENTANGLER) return;
  const TAG = 'entangled', BY = 'the Entangler', COLOR = '#2ee6ff', LOBE_COLOR = '#a5f3fc', IMAGE_COLOR = '#7dd3fc';
  const CAP = Object.freeze({ pairs: 32, perLobe: 8, brains: 3 });   // 32 pairs → up to 4 pair lobes; up to 3 image brains
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const STOP = new Set(['the', 'and', 'that', 'with', 'from', 'this', 'what', 'when', 'where', 'which', 'does', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'have', 'been', 'were', 'about', 'after', 'before', 'between', 'over', 'under', 'your', 'ours', 'also', 'very', 'much', 'many', 'most', 'some', 'such', 'only', 'other', 'because', 'through', 'while', 'these', 'those', 'being', 'first', 'last', 'every']);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the colour is registered before the engine draws anything (render.js reads the registry at draw time, so either load order works)
  const MBN = (window.MBN = window.MBN || {});
  MBN.originColors = Object.assign(MBN.originColors || { mice: '#ff3b3b' }, { [TAG]: COLOR });

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (s, n = 28) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const tokens = s => [...new Set(String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !STOP.has(t)))];
  const G = () => window.MINDBLOWN_GROW;

  // ---------- styles + button ----------
  const css = `
  .mb-entangler{position:absolute;right:auto;bottom:auto;z-index:7;width:44px;height:44px;border-radius:50%;border:1px solid rgba(46,230,255,.35);background:rgba(10,14,20,.78);
    backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#9aa5b8;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;
    box-shadow:0 6px 18px rgba(0,0,0,.35);transition:color .2s,box-shadow .2s,border-color .2s,opacity .2s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  .mb-entangler[hidden]{display:none}
  .mb-entangler svg{display:block;width:26px;height:26px}
  .mb-entangler:hover,.mb-entangler:focus-visible{color:#e6ebf5;border-color:rgba(46,230,255,.6)}
  .mb-entangler:focus-visible{outline:2px solid ${COLOR};outline-offset:2px}
  .mb-entangler[aria-pressed="true"]{color:${COLOR};border-color:rgba(46,230,255,.75);box-shadow:0 0 0 1px rgba(46,230,255,.25),0 0 18px rgba(46,230,255,.45),0 6px 18px rgba(0,0,0,.35)}
  .mb-entangler[aria-pressed="true"] svg .mb-ent-wave{stroke-dasharray:3 2}
  @media (prefers-reduced-motion:no-preference){.mb-entangler[aria-pressed="true"] svg .mb-ent-wave{animation:mb-ent-flow 1.4s linear infinite}}
  @keyframes mb-ent-flow{to{stroke-dashoffset:-10}}
  .mb-entangler .mb-ent-n{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:${COLOR};color:#0b0e14;font:700 10px/16px 'Satoshi',system-ui,sans-serif;text-align:center;box-shadow:0 0 6px ${COLOR}}
  .mb-entangler .mb-ent-n:empty{display:none}
  .mb-entangler.mb-hidden{opacity:0;pointer-events:none}
  .mb-entangler.mb-armed{border-color:rgba(255,120,120,.8);color:#ff8c8c}
  .mb-ent-toast{position:fixed;z-index:8;left:50%;bottom:92px;transform:translateX(-50%);max-width:min(92vw,520px);padding:10px 14px;border-radius:12px;
    background:rgba(12,16,24,.92);border:1px solid rgba(46,230,255,.3);color:#e6ebf5;font:500 13px/1.45 'Satoshi',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);pointer-events:none;transition:opacity .25s}
  .mb-ent-toast[hidden]{display:none}
  .mb-ent-toast b{color:${COLOR};font-weight:600}
  @media (max-width:900px){.mb-ent-toast{bottom:calc(84px + var(--mbar-h, 0px))}}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const ICON = `<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
    <circle cx="6" cy="13" r="3.2" fill="currentColor" stroke="none" opacity=".95"/><circle cx="20" cy="13" r="3.2" fill="currentColor" stroke="none" opacity=".95"/>
    <path class="mb-ent-wave" d="M9 13c1.3-3 2.6-3 3.9 0s2.6 3 3.9 0"/>
    <circle cx="6" cy="13" r="5.4" opacity=".45"/><circle cx="20" cy="13" r="5.4" opacity=".45"/></svg>`;
  const btn = document.createElement('button');
  btn.id = 'mb-entangler'; btn.className = 'zoom-ctl mb-entangler'; btn.type = 'button';   // a .zoom-ctl: the Don't Panic button sits above the highest one, so it lifts above this (positioned absolute, not fixed: the Drive skips elements without an offsetParent)
  btn.setAttribute('aria-pressed', 'false'); btn.hidden = true;
  btn.innerHTML = ICON + '<span class="mb-ent-n" aria-hidden="true"></span>';
  const toastEl = document.createElement('div'); toastEl.className = 'mb-ent-toast'; toastEl.setAttribute('role', 'status'); toastEl.hidden = true;
  let toastT = 0;
  const toast = (html, ms = 3200) => { toastEl.innerHTML = html; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms); };

  // ---------- placement: in the stack above the zoom column, directly below the Don't Panic button ----------
  // The button is a .zoom-ctl, so the Drive (which sits 12px above the highest visible zoom column) lifts above it. When the
  // stack is too tall for that (tall phone rails under a header), the button leaves the stack and sits beside the Drive instead:
  // Don't Panic keeps its place; the Entangler never pushes it off the screen.
  const DRIVE = 56, HEADER = '#top > *, .search, .brand, nav.brains';
  function place() {
    if (!booted) return;
    let r = null;
    document.querySelectorAll('.zoom-ctl').forEach(z => {
      if (z === btn || z.offsetParent === null) return;
      const b = z.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && (!r || b.top < r.top)) r = b;
    });
    const size = 44, W = window.innerWidth, H = window.innerHeight;
    const header = [...document.querySelectorAll(HEADER)].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(q => q.width > 0);
    const hits = (l, t, w, h) => header.some(q => q.left < l + w + 4 && q.right > l - 4 && q.top < t + h + 4 && q.bottom > t - 4);
    let l, t, stacked = !!r;
    if (r) {
      l = Math.round(Math.min(W - size - 8, Math.max(8, r.left + r.width / 2 - size / 2))); t = Math.round(r.top - 10 - size);
      const driveTop = t - 12 - DRIVE;   // where the Drive would have to go
      if (t < 4 || driveTop < 4 || hits(l, t, size, size) || hits(l - 6, driveTop, DRIVE, DRIVE)) stacked = false;
    }
    btn.classList.toggle('zoom-ctl', stacked);
    if (!stacked) {   // beside the Drive, on its left (or right, at the left edge); without a Drive on the page, the usual corner
      const d = document.getElementById('mb-drive'), dr = d && !d.classList.contains('mb-hidden') ? d.getBoundingClientRect() : null;
      if (dr && dr.width > 0) { l = Math.round(dr.left - 10 - size); if (l < 4) l = Math.round(dr.right + 10); t = Math.round(dr.top + (dr.height - size) / 2); }
      else if (d) { btn.hidden = true; return; }
      else { l = W - (W <= 900 ? 16 : 24) - size; t = H - (W <= 900 ? 16 : 24) - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h')) || 0) - size; }
    }
    btn.style.left = (l + window.scrollX) + 'px'; btn.style.top = (t + window.scrollY) + 'px';
    // an open panel or phone sheet over the spot hides the button (display:none, so the Drive drops back to the zoom column)
    const mine = e => e === btn || btn.contains(e) || e === toastEl || toastEl.contains(e) || (e.id && /^mb-drive/.test(e.id)) || (e.classList && /mb-drive/.test(e.className));
    const covered = [[l + size / 2, t + size / 2], [l + 4, t + 4], [l + size - 4, t + size - 4]].some(([x, y]) => {
      const e = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []).find(el => !mine(el));
      return e && e.closest && e.closest('.panel, .sheet, [role="dialog"], .nav-menu, .mbar-sheet, .mice-chat, .origin-dock');
    });
    btn.hidden = covered || t < 4 || l < 4 || l + size > W - 4 || t + size > H - 4;
  }

  // ---------- state ----------
  let D = null, key = null, journal = [], on = false, booted = false, index = null, indexAsked = false, armedT = 0, lastMeasure = 0;
  const collapsed = new Map();   // neuron id → act (both halves of every pair)
  // Storage: localStorage when the browser allows it; otherwise a tab-scoped shim on window.name, which survives the
  // reload that commit() performs (sandboxed previews and private modes block localStorage). The shim only claims
  // window.name when it is empty or already ours, and is capped like the stored journal.
  const NAME_TAG = 'mbn-entangle:';
  const nameStore = {
    read() { const n = typeof window.name === 'string' ? window.name : ''; if (!n.startsWith(NAME_TAG)) return null; try { const o = JSON.parse(n.slice(NAME_TAG.length)); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } },
    usable() { return window.name === '' || this.read() !== null; },
    getItem(k) { const o = this.read(); return o && typeof o[k] === 'string' ? o[k] : null; },
    setItem(k, v) { if (!this.usable()) throw new Error('window.name in use'); const o = this.read() || {}; o[k] = String(v); const out = NAME_TAG + JSON.stringify(o); if (out.length > 1048576) throw new Error('too large'); window.name = out; },
    removeItem(k) { const o = this.read(); if (!o) return; delete o[k]; window.name = Object.keys(o).length ? NAME_TAG + JSON.stringify(o) : ''; }
  };
  // Every save carries a revision (a millisecond clock, never repeated, and always above every revision already stored for this brain, so
  // saves keep their order across tabs and across a clock that steps back). localStorage keeps the journal, the enabled flag and the
  // revision as ONE record key, so a save is all-or-nothing; the three separate keys of older builds are still read and are removed once a
  // record lands. The tab-scoped fallback keeps the same record as one window.name entry. On boot the newest copy wins: another tab that
  // later updates or forgets the brain writes a higher revision, so this tab's older fallback is dropped instead of replayed. Forgetting
  // writes an empty journal with a fresh revision (a deletion marker) rather than only removing keys, so a copy that could not be removed
  // can never come back. Copies written before revisions existed count as revision 0 and keep their old precedence.
  const local = () => { try { return window.localStorage || null; } catch (e) { return null; } };
  const K = () => ({ rec: `mbn:entangle:rec:${key}`, j: `mbn:entangle:${key}`, on: `mbn:entangle:on:${key}`, rev: `mbn:entangle:rev:${key}`, fb: `mbn:entangle:fb:${key}` });
  // window.name is capped at 1 MiB by store(); localStorage has its own quota, so anything it accepted is read back whatever its size
  const parse = (raw, cap = 1048576) => { try { return typeof raw === 'string' && raw.length <= cap ? JSON.parse(raw) : null; } catch (e) { return null; } };
  // a stored revision is a non-negative safe integer below MAX_SAFE_INTEGER (nextRev() adds one); anything else (Infinity, NaN, 1e300) counts as 0
  const okRev = v => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 && n < Number.MAX_SAFE_INTEGER ? n : 0; };
  const asCopy = (o, rev) => o && typeof o === 'object' && Array.isArray(o.journal) ? { rev: okRev(o.rev ?? rev), journal: o.journal, on: !!o.on } : null;
  let lastRev = 0;
  function fallbackCopy() {
    const k = K(), f = asCopy(parse(nameStore.getItem(k.fb)));
    if (f) return f;
    const legacy = nameStore.getItem(k.j);   // pre-revision fallback: two separate entries
    if (legacy === null) return null;
    const j = parse(legacy);
    return Array.isArray(j) ? { rev: 0, journal: j, on: parse(nameStore.getItem(k.on)) === 1 } : null;
  }
  function localCopy() {
    const k = K();
    try {
      const ls = local(); if (!ls) return null;
      const recRaw = ls.getItem(k.rec), rec = recRaw === null ? null : asCopy(parse(recRaw, Infinity)) || { rev: 0, journal: [], on: false, unreadable: true };
      const raw = ls.getItem(k.j), onRaw = ls.getItem(k.on), rev = okRev(ls.getItem(k.rev));
      let old = null;
      if (raw !== null || onRaw !== null || rev) { const j = parse(raw, Infinity); old = { rev, journal: Array.isArray(j) ? j : [], on: parse(onRaw, Infinity) === 1 }; }
      // a record write removes the three keys, so three keys beside a record were written after it, by an older build in another tab:
      // without a revision they are taken as the later write; with one, the higher revision wins. A readable legacy copy also beats an unreadable record.
      if (rec && old) return rec.unreadable || !old.rev || old.rev > rec.rev ? old : rec;
      return rec || old;
    } catch (e) { return null; }
  }
  const storedRev = () => Math.max((localCopy() || {}).rev || 0, (fallbackCopy() || {}).rev || 0);
  const nextRev = () => (lastRev = Math.max(Date.now(), lastRev + 1, storedRev() + 1));
  const dropFallback = () => { const k = K(); for (const x of [k.fb, k.j, k.on]) nameStore.removeItem(x); };
  function loadState() {
    const f = fallbackCopy(), l = localCopy();
    let pick = l && !l.unreadable ? l : null;
    if (f && (!l || f.rev >= l.rev)) pick = f;
    else if (f && l && !l.unreadable) dropFallback();   // stale: another tab has written a newer copy since
    if (pick) lastRev = Math.max(lastRev, pick.rev);
    return pick || { rev: 0, journal: [], on: false };
  }
  function store(journalArr, onFlag) {
    let k, rev, rec;
    try { k = K(); rev = nextRev(); rec = JSON.stringify({ rev, journal: journalArr, on: !!onFlag }); }
    catch (e) { console.warn('entangler: could not serialise the journal', e); return false; }
    try {
      const ls = local(); if (!ls) throw new Error('no localStorage');
      ls.setItem(k.rec, rec);   // one write: the journal, flag and revision land together or not at all
      for (const x of [k.j, k.on, k.rev]) { try { ls.removeItem(x); } catch (e) { /* an older copy left behind loses to the record's revision */ } }
      dropFallback(); return 'local';
    } catch (e) { /* fall through to the tab-scoped copy */ }
    try {
      const o = nameStore.read() || {}; delete o[k.j]; delete o[k.on];
      o[k.fb] = rec;
      const out = NAME_TAG + JSON.stringify(o);
      if (!nameStore.usable() || out.length > 1048576) throw new Error('fallback unavailable');
      window.name = out; return 'fallback';   // one assignment: the journal, flag and revision land together or not at all
    } catch (e) { return false; /* nowhere to keep it: the pairs last for this page view */ }
  }
  let held = [];   // saved pairs that could not be replayed this time (a partner brain not loaded, say): kept in the journal on disk, not drawn
  const save = () => store([...journal, ...held].slice(0, CAP.pairs), on);
  const count = () => G() ? G().count(TAG) : { neurons: 0, lobes: 0, brains: 0, synapses: 0, links: 0 };
  const brainName = () => (document.querySelector('nav.brains a.on')?.textContent || '').trim() || (D && D.title ? String(D.title).replace(/^MindBlown:\s*/, '') : '')
    || (document.querySelector('.brand .title')?.textContent || '').replace(/^MindBlown(\s+(Neural|AI hub))?:?\s*/i, '').trim()   // canonical-renderer pages name the brain in the header only
    || 'this brain';

  // the origin index (every neuron in every MindBlown brain) is what partners at a distance are drawn from; asked for once, when needed
  function askIndex() { if (index || indexAsked || !window.MINDBLOWN_ORIGIN) return; indexAsked = true; window.MINDBLOWN_ORIGIN.index().then(I => { index = I || null; if (!I) indexAsked = false; }).catch(() => { indexAsked = false; }); }
  function setOn(v, opts = {}) {
    on = !!v; btn.setAttribute('aria-pressed', String(on)); save(); sync(); if (on) askIndex();
    if (opts.quiet) return;
    if (on) {
      toast(`<b>${esc(brainName())}</b> is entangled. Select a neuron to measure it; a partner it had no wire to collapses with it.`);
      const sel = G() && G().selected(); if (sel && sel.kind === 'page' && sel.by === 'visitor') setTimeout(() => { try { measure(sel.id); } catch (e) { console.warn('entangler: measurement failed', e); } }, 900);   // the neuron already open counts as the first measurement
    }
    else toast(`<b>${esc(brainName())}</b> is no longer entangled. The ${journal.length ? `${journal.length} pair${journal.length === 1 ? '' : 's'} stay` : 'pairs would stay'}; Shift-press twice to forget them.`);
  }
  function sync() { btn.setAttribute('aria-pressed', String(on)); const n = btn.querySelector('.mb-ent-n'); if (n) n.textContent = journal.length ? String(journal.length) : ''; btn.setAttribute('aria-label', `Quantum Entangler: ${on ? 'entangled, press to switch off' : 'press to entangle this brain'} (E)${journal.length ? `, ${journal.length} pair${journal.length === 1 ? '' : 's'}` : ''}`); btn.title = `Quantum Entangler (E) — ${on ? 'on' : 'off'}${journal.length ? ` · ${journal.length} pair${journal.length === 1 ? '' : 's'}` : ''}. Shift-press twice to forget the pairs.`; }

  // ---------- evidence shared between two neurons ----------
  let pageSrcs = null, srcById = null, eligibleIds = null;
  function evidence() {
    if (pageSrcs) return;
    pageSrcs = Object.create(null); srcById = Object.create(null);
    eligibleIds = new Set((D.pages || []).filter(p => !p.parent).map(p => p.id));
    for (const s of (D.sources || [])) { srcById[s.id] = s; for (const pid of (s.pages || [])) (pageSrcs[pid] = pageSrcs[pid] || new Set()).add(s.id); }
  }
  const sharedSources = (a, b) => { const A = pageSrcs[a] || new Set(), B = pageSrcs[b]; return B ? [...A].filter(id => B.has(id)) : []; };

  // ---------- choosing the partner ----------
  function candidates(A, pages) {
    evidence();
    const hub = G().hub(), hidden = new Set((D.lobes || []).filter(l => l.hidden).map(l => l.id)), children = new Set((D.pages || []).filter(p => p.parent).map(p => p.id));
    const wired = new Set(A.neighbors), ta = tokens(A.title);
    const out = [];
    for (const p of pages) {
      if (!eligibleIds.has(p.id) || p === A || p.origin || p.id === hub || p.blank || hidden.has(p.lobe) || children.has(p.id) || wired.has(p.id) || collapsed.has(p.id)) continue;
      const shared = sharedSources(A.id, p.id), terms = tokens(p.title).filter(t => ta.includes(t)).length;
      out.push({ kind: 'here', id: p.id, title: p.title, shared, terms, w: (0.04 + 2 * shared.length + 0.6 * terms) / Math.sqrt(1 + p.deg) });   // shared evidence weighs most; a title word counts a little; a bare neuron is the long shot
    }
    // partners at a distance: neurons in other brains whose titles share words with A (the origin index, once it has loaded)
    if (index && ta.length) {
      const brains = index.brains || [], used = new Set(journal.filter(a => a.afield).map(a => `${a.afield.brain}/${a.afield.page}`)), afield = [];
      for (const row of index.pages || []) {
        const b = brains[row[0]]; if (!b || b.id === D.brain || !b.site && !b.page) continue;
        const terms = tokens(row[2]).filter(t => ta.includes(t)).length; if (terms < 1) continue;
        const pid = `${b.id}/${row[1]}`; if (used.has(pid)) continue;
        afield.push({ kind: 'afield', id: pid, title: row[2], shared: [], terms, w: 0.6 * terms, afield: { brain: b.id, name: b.title, page: row[1], lobe: row[3], site: b.site || null, html: b.page || null } });
      }
      // a common word matches many neurons elsewhere: the whole afield pool is worth at most half the local pool, so distance stays the exception
      const here = out.reduce((s, c) => s + c.w, 0), far = afield.reduce((s, c) => s + c.w, 0);
      if (here > 0 && far > here / 2) afield.forEach(c => { c.w *= here / 2 / far; });
      out.push(...afield);
    }
    return out;
  }
  function draw(cands) {
    const total = cands.reduce((s, c) => s + c.w, 0); let r = Math.random() * total;
    for (const c of cands) { r -= c.w; if (r <= 0) return { pick: c, odds: Math.max(1, Math.round(total / c.w)) }; }
    const c = cands[cands.length - 1]; return { pick: c, odds: Math.max(1, Math.round(total / c.w)) };
  }

  // ---------- building what a collapse produces (deterministic from the act, so the journal replays) ----------
  const bounded = (v, n = 512) => typeof v === 'string' && v.length > 0 && v.length <= n;
  function homeHref(af) {
    if (typeof af.site === 'string') {
      try {
        const u = new URL(af.site);
        if (u.protocol === 'https:' && u.hostname.endsWith('.pplx.app') && !u.username && !u.password) {
          u.hash = 'n=' + encodeURIComponent(af.page); return u.href;
        }
      } catch (_) { /* untrusted persisted URL: omit it */ }
    }
    return typeof af.html === 'string' && /^[a-z0-9-]+\.html$/i.test(af.html) ? `./${af.html}#n=${encodeURIComponent(af.page)}` : null;
  }
  function validAct(a) {
    if (!a || a.act !== 'pair' || !bounded(a.a) || !Number.isSafeInteger(a.odds) || a.odds < 1 ||
        !Number.isSafeInteger(a.terms) || a.terms < 0 || a.terms > 512 ||
        !Array.isArray(a.shared) || a.shared.length > 1024 || !a.shared.every(s => bounded(s, 2048))) return false;
    if (!a.afield) return bounded(a.b) && a.b !== a.a;
    const f = a.afield;
    return typeof f === 'object' && !Array.isArray(f) && typeof f.brain === 'string' &&
      /^[a-z0-9-]{1,100}$/i.test(f.brain) && bounded(f.page) && bounded(f.name) && bounded(f.title) &&
      (!f.lobe || bounded(f.lobe)) && (!f.site && !f.html || !!homeHref(f));
  }
  const pairLobeId = i => `entangled/pairs-${Math.floor(i / CAP.perLobe) + 1}`;
  function ensurePairLobe(i) {
    const id = pairLobeId(i), n = Math.floor(i / CAP.perLobe);
    return G().addLobe({ id, name: `Entangled pairs${n ? ' ' + (ROMAN[n] || n + 1) : ''}`, color: LOBE_COLOR, origin: TAG, by: BY });
  }
  function ensureImageBrain(af) {
    const lobeId = `entangled/brain-${af.brain}`, hubId = `entangled/${af.brain}/hub`;
    const existed = !!G().lobes().find(l => l.id === lobeId);
    G().addLobe({ id: lobeId, name: `${af.name} (entangled)`, color: IMAGE_COLOR, brain: lobeId, satellite: true, origin: TAG, by: BY });
    if (!existed) {
      G().addNeuron({ id: hubId, title: `${af.name} (entangled)`, lobe: lobeId, hub: true, origin: TAG, by: BY, near: G().hub(),
        desc: `An image of the ${af.name} brain, drawn here by the Quantum Entangler: neurons of ${brainName()} that were measured while it was entangled collapsed with partners that live there. Each image cites its home page.` });
      G().addLink({ s: hubId, t: G().hub(), w: 2, kinds: ['entangled'], origin: TAG, by: BY });
    }
    return { lobeId, hubId };
  }
  function apply(act) {
    evidence();
    if (!eligibleIds.has(act.a) || !act.afield && !eligibleIds.has(act.b)) return false;
    const g = G(), pages = g.pages(), byId = Object.fromEntries(pages.map(p => [p.id, p]));
    const A = byId[act.a]; if (!A || A.origin || A.id === g.hub() || A.parent || A.blank) return false;
    if (!act.afield && (!byId[act.b] || byId[act.b].origin || act.a === act.b || act.b === g.hub())) return false;
    evidence();
    let bId = act.b, bTitle = act.bTitle, where = '';
    if (act.afield) {
      const af = act.afield, { lobeId, hubId } = ensureImageBrain(af);
      bId = `entangled/${af.brain}/${af.page}`;
      const href = homeHref(af);
      if (!byId[bId]) {
        g.addNeuron({ id: bId, title: af.title, lobe: lobeId, origin: TAG, by: BY, near: hubId, desc: `“${af.title}” lives in the ${af.name} brain${af.lobe ? ` (${af.lobe})` : ''}. It collapsed with “${A.title}” when that neuron was measured here; this is its image, citing its home page.` });
        g.addLink({ s: bId, t: hubId, w: 1, kinds: ['entangled'], origin: TAG, by: BY });
        g.addSynapse({ id: `${bId}#home`, page: bId, lead: 'Home page', text: `The neuron itself is in the ${af.name} brain; what is written about it there is not copied here.`, origin: TAG, by: BY,
          sources: [{ id: `mindblown:${af.brain}/${af.page}`, label: `${af.name} › ${af.title}`, kind: 'mindblown', href }] });
      }
      bTitle = af.title; where = ` “${af.title}” lives in the ${af.name} brain.`;
    } else if (!byId[bId]) return false;
    else bTitle = byId[bId].title;
    const shared = (act.shared || []).map(id => srcById[id]).filter(Boolean);
    const sharedText = shared.length ? `They share ${shared.length} source${shared.length === 1 ? '' : 's'}: ${shared.map(s => s.label || s.id).join('; ')}.` : act.terms ? `They share no source, only ${act.terms} word${act.terms === 1 ? '' : 's'} of their titles: a correlation at a distance.` : 'They share no source: a correlation at a distance.';
    ensurePairLobe(act.i);
    const nodeId = `entangled/pair-${act.i + 1}`;
    g.addNeuron({ id: nodeId, title: `${short(A.title)} ⟷ ${short(bTitle)}`, lobe: pairLobeId(act.i), origin: TAG, by: BY, near: act.a,
      desc: `Measured “${A.title}” while ${brainName()} was entangled; “${bTitle}” collapsed with it.${where} ${sharedText} Odds of this partner: 1 in ${act.odds} (weighted towards neurons that share evidence with “${A.title}” but have no wire to it). A picture of entanglement drawn on the knowledge graph, not a physical claim.` });
    const sources = shared.map(s => ({ id: s.id, label: s.label, kind: s.kind }));
    sources.push({ id: 'entangler:record', label: 'Quantum Entangler pair record (drawn in this browser; a visualisation on the knowledge graph, not a physical claim)', kind: 'entangler' });
    const q = index && (index.brains || []).find(b => b.id === 'quantum'); if (q && D.brain !== 'quantum' && q.site) sources.push({ id: 'mindblown:quantum/strange/entanglement', label: 'Quantum › Entanglement (where the metaphor comes from)', kind: 'mindblown', href: `${q.site.replace(/\/$/, '')}/#n=strange%2Fentanglement` });
    g.addSynapse({ id: `${nodeId}#pair`, page: nodeId, lead: 'Entangled pair', text: `“${A.title}” and “${bTitle}” were fixed together by one measurement. ${sharedText}`, links: [act.a, bId], sources, origin: TAG, by: BY });
    g.addLink({ s: act.a, t: nodeId, w: 1 + shared.length, kinds: ['entangled'], origin: TAG, by: BY });
    g.addLink({ s: bId, t: nodeId, w: 1 + shared.length, kinds: ['entangled'], origin: TAG, by: BY });
    act.node = nodeId; collapsed.set(act.a, act); collapsed.set(bId, act);
    return true;
  }

  // ---------- a measurement ----------
  function measure(id, opts = {}) {
    const g = G(); if (!g || !on && !opts.force) return null;
    const now = Date.now(); if (!opts.force && now - lastMeasure < 700) return null; lastMeasure = now;
    const pages = g.pages(), A = pages.find(p => p.id === id); if (!A) return null;
    evidence(); if (!eligibleIds.has(A.id)) return null;   // generated atoms and folded children are anatomy, not connectome vertices
    if (A.origin) return null;   // grown material (the mice's, the Entangler's own) is not measured; selecting it already makes it fire
    const hidden = new Set((D.lobes || []).filter(l => l.hidden).map(l => l.id)), children = new Set((D.pages || []).filter(p => p.parent).map(p => p.id));
    if (A.id === g.hub() || hidden.has(A.lobe) || children.has(A.id) || A.blank) return null;
    const prior = collapsed.get(A.id);
    if (prior) {   // a second measurement gives the same answer: the pair fires and the partner lights up
      const other = prior.a === A.id ? (prior.afield ? prior.afield.title : (pages.find(p => p.id === prior.b) || {}).title || prior.b) : (pages.find(p => p.id === prior.a) || {}).title || prior.a;
      if (prior.node) g.pulse(prior.node);
      toast(`<b>${esc(A.title)}</b> has already collapsed, with <b>${esc(other)}</b>.`);
      return prior;
    }
    if (journal.length + held.length >= CAP.pairs) { toast(`The Entangler has drawn all ${CAP.pairs} of its pairs here. Shift-press twice to forget them and start again.`); return null; }
    askIndex();   // partners at a distance join once the index has arrived (asked for when the Entangler is switched on)
    let cands = candidates(A, pages);
    const imageBrains = new Set(g.lobes().filter(l => l.origin === TAG && l.satellite).map(l => l.id));
    if (imageBrains.size >= CAP.brains) cands = cands.filter(c => c.kind === 'here' || imageBrains.has(`entangled/brain-${c.afield.brain}`));   // the image-brain cap: new partners afield only from brains already pictured here
    if (!cands.length) { toast(`No free partner for <b>${esc(A.title)}</b>: everything it could pair with is wired to it or has collapsed already.`); return null; }
    const { pick, odds } = draw(cands);
    const act = { act: 'pair', i: journal.length, t: Date.now(), a: A.id, odds, shared: pick.shared, terms: pick.terms };
    if (pick.kind === 'afield') act.afield = { ...pick.afield, title: pick.title }; else act.b = pick.id;
    if (!apply(act)) return null;
    journal.push(act); save(); sync();
    g.commit({ alpha: 0.6 }); if (!reduceMotion) setTimeout(() => g.pulse(act.node), 350); setTimeout(() => g.fitIfOut(700), 500);
    const partner = pick.kind === 'afield' ? `${pick.title} (${pick.afield.name})` : pick.title;
    toast(`Measured <b>${esc(A.title)}</b>; <b>${esc(partner)}</b> collapsed with it — ${pick.shared.length ? `${pick.shared.length} shared source${pick.shared.length === 1 ? '' : 's'}` : pick.kind === 'afield' ? 'a partner in another brain' : 'no shared source'}, odds 1 in ${odds}.`);
    return act;
  }

  // forgetting is durable only when no copy is left that a later visit or another tab could replay. A deletion marker in localStorage
  // covers every tab. A marker that could only go to the tab-scoped fallback covers this tab alone, so the shared localStorage copies are
  // then removed as well; with no marker at all, every copy that can be removed is. Storage that cannot even be read is out of reach for
  // every tab of this browser alike, so it counts as holding no copy. The page's pairs are cleared only once the forget is durable:
  // a forget that fails changes nothing, here or on disk, and can simply be retried.
  function clear() {
    if (!booted) return false;
    let name0 = null; try { name0 = window.name; } catch (e) { /* no tab copy to restore */ }   // a failed forget puts the tab copy back as it was
    const where = store([], false), k = K();
    const dropLocal = () => { try { const ls = local(); if (ls) for (const x of [k.rec, k.j, k.on, k.rev]) ls.removeItem(x); } catch (e) { /* checked below */ } };
    let ok = where === 'local';
    if (where === 'fallback') { dropLocal(); ok = !localCopy(); }
    if (!where) { dropLocal(); try { dropFallback(); } catch (e) { /* checked below */ } ok = !localCopy() && !fallbackCopy(); }
    if (!ok) { if (name0 !== null) { try { window.name = name0; } catch (e) { /* the tab copy could not be put back */ } } return false; }
    journal = []; held = []; collapsed.clear(); on = false; btn.setAttribute('aria-pressed', 'false');
    return true;
  }

  // ---------- boot: wait for a brain, replay, wire the button ----------
  function boot() {
    const g = G(); D = window.MINDBLOWN; if (!g || !D) return false;
    key = D.brain || location.pathname.replace(/[^a-z0-9]+/gi, '-');
    const saved = loadState();
    journal = saved.journal.slice(0, CAP.pairs).filter(validAct);
    on = saved.on;
    if (journal.length) {
      const j = journal; journal = [];
      const imageBrains = new Set();
      j.forEach(a => {
        // a pair the guards turn away (a neuron already collapsed, the image-brain cap reached) is held like a failed replay: kept on disk, not drawn
        if (collapsed.has(a.a) || !a.afield && collapsed.has(a.b)) { held.push(a); return; }
        if (a.afield && !imageBrains.has(a.afield.brain) && imageBrains.size >= CAP.brains) { held.push(a); return; }
        a.i = journal.length;
        let ok = false;
        try { ok = !!apply(a); if (ok) { journal.push(a); if (a.afield) imageBrains.add(a.afield.brain); } }
        catch (e) { console.warn('entangler: could not replay a saved pair', e); }
        if (!ok) held.push(a);   // kept for the next save and the next visit rather than erased by a failed replay
      });
      g.commit({ alpha: 0.8 });   // nothing is written at boot: the copy on disk already holds every pair, and a newer one from another tab must not be overwritten
    }
    if (on || journal.some(a => a.afield)) askIndex();
    document.body.append(btn, toastEl);
    btn.addEventListener('click', e => {
      if (e.shiftKey || btn.dataset.long === '1') { delete btn.dataset.long; forget(); return; }
      setOn(!on);
    });
    let pressT = 0;
    btn.addEventListener('pointerdown', () => { clearTimeout(pressT); pressT = setTimeout(() => { btn.dataset.long = '1'; }, 700); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => btn.addEventListener(t, () => {
      clearTimeout(pressT);
      if (btn.dataset.long) setTimeout(() => { delete btn.dataset.long; }, 350);
    }));
    document.addEventListener('keydown', e => {
      if ((e.key !== 'e' && e.key !== 'E') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (btn.hidden) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.shiftKey) forget(); else setOn(!on);
    });
    window.addEventListener('mbn:select', e => {
      const d = e.detail; if (!on || !d || d.kind !== 'page' || d.by !== 'visitor') return;
      setTimeout(() => { try { measure(d.id); } catch (err) { console.warn('entangler: measurement failed', err); } }, 0);   // after select() has finished: never re-enter the engine mid-selection
    });
    window.addEventListener('resize', place);
    setInterval(place, 300);
    booted = true; btn.setAttribute('aria-pressed', String(on)); sync(); place();
    document.documentElement.classList.add('has-quantum-entangler');
    return true;
  }
  function forget() {
    if (!journal.length && !held.length) { toast('Nothing to forget: no pairs have been drawn here.'); return; }
    if (armedT && Date.now() - armedT < 5000) {
      armedT = 0; const n = journal.length + held.length;
      if (!clear()) { sync(); toast(`Could not forget the ${n} pair${n === 1 ? '' : 's'}: this browser would not save that. Nothing was changed; Shift-press twice to try again.`, 4000); return; }
      toast(`Forgot ${n} pair${n === 1 ? '' : 's'}. Reloading…`, 1200); setTimeout(() => location.reload(), 600); return;
    }
    armedT = Date.now(); btn.classList.add('mb-armed'); setTimeout(() => btn.classList.remove('mb-armed'), 5000);
    const n = journal.length + held.length; toast(`Forget ${n} pair${n === 1 ? '' : 's'} and reload? Shift-press again within 5 seconds.`, 5000);
  }
  // pages that boot their data late (community/AI loaders, composed networks) get the Entangler when the brain arrives
  (function wait(n) { if (boot()) return; if (n < 200) setTimeout(() => wait(n + 1), 150); })(0);

  window.MINDBLOWN_ENTANGLER = Object.freeze({
    on: () => on, setOn: v => { if (booted) setOn(v, { quiet: true }); return on; }, measure: (id, o) => measure(id, o), journal: () => journal.map(a => ({ ...a })), count, clear: () => { const ok = clear(); sync(); return ok; },   // true when the deletion marker was kept somewhere
    booted: () => booted, caps: CAP, color: COLOR, tag: TAG, candidates: id => { const g = G(); if (!g) return []; const A = g.pages().find(p => p.id === id); return A ? candidates(A, g.pages()).map(c => ({ id: c.id, kind: c.kind, w: +c.w.toFixed(3), shared: c.shared.length, terms: c.terms })) : []; },
    collapsed: () => [...collapsed.keys()], place, index: () => !!index, button: () => btn,
  });
})();
