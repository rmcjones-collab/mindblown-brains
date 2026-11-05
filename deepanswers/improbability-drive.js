/* MindBlown — improbability-drive.js (shared, byte-identical in every MindBlown repo; edit the copy in
   rmcjones-collab/mindblown-neural and re-copy it, never fork it per brain)

   The Infinite Improbability Drive, available on every brain and network. A small red round button reading
   "DON'T PANIC" sits above the zoom buttons. Pressing it (or the I key) picks a destination neuron at odds
   inversely proportional to how connected that neuron is (the least-wired neuron is the most improbable place to
   arrive), plays the ship's falling readout, and takes you there through the engine's own navigation:
     · Neural engines (window.MINDBLOWN_QA.routeFromTo) route a signal from the brain's centre to the destination;
     · every other engine opens the destination through its #n=<id> deep link, which reveals hidden lobes,
       selects the neuron and flies the camera to it.
   Once in 42 presses the Drive passes through every point in the Universe and arrives exactly where it was.
   A second press within a second of landing lights the panel Arthur found.

   Self-contained: it injects its own button, readout, toast and styles, reads only window.MINDBLOWN (pages, links,
   center/centers), or window.MINDBLOWN_NETWORK on network overview pages (where it opens a shared neuron in one of
   the member brains), and the public hooks above, writes nothing to storage and does nothing until pressed. It waits for
   brains that load their data late (boot loaders, composed networks) and recomputes the odds if the data changes. */
(() => {
  if (window.__MB_IMPROBABILITY_DRIVE__) return;   // one Drive per page, even if a page includes the script twice
  window.__MB_IMPROBABILITY_DRIVE__ = true;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, reduceMotion ? 0 : ms));
  const fmt = n => n.toLocaleString('en-GB');
  const LADDER = ['2^(∞−1) : 1 against', '2^276,709 : 1 against', '2^100,000 : 1 against and falling', '2^75,000 : 1 against and falling', '2^50,000 : 1 against and falling', '2^25,000 : 1 against and falling', '2^20,000 : 1 against and falling'];

  const CSS = `
.mb-drive { position: fixed; z-index: 7; width: 56px; height: 56px; padding: 0; border-radius: 50%; cursor: pointer; display: grid; place-content: center; gap: 1px;
  border: 1px solid rgba(255, 255, 255, 0.28); color: #fff; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  background: radial-gradient(circle at 34% 28%, #ff8a7a 0%, #f2392c 26%, #c8161d 58%, #7d0a10 100%);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35), 0 6px 18px rgba(200, 22, 29, 0.45), inset 0 -4px 8px rgba(0, 0, 0, 0.35), inset 0 2px 3px rgba(255, 255, 255, 0.35);
  font: 700 9.5px/1 'Clash Display', 'Satoshi', ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif; letter-spacing: 0.06em; text-align: center;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.45); transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.2s ease; user-select: none; -webkit-user-select: none; }
.mb-drive span { display: block; }
.mb-drive:hover { box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(242, 57, 44, 0.6), inset 0 -4px 8px rgba(0, 0, 0, 0.35), inset 0 2px 3px rgba(255, 255, 255, 0.4); }
.mb-drive:active, .mb-drive.pressed { transform: translateY(2px) scale(0.96); box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(200, 22, 29, 0.4), inset 0 3px 8px rgba(0, 0, 0, 0.45); }
.mb-drive:focus-visible { outline: 2px solid #fde68a; outline-offset: 4px; }
.mb-drive.running { animation: mb-drive-glow 0.38s ease-in-out infinite alternate; }
.mb-drive.mb-hidden { opacity: 0; pointer-events: none; }
@keyframes mb-drive-glow { from { box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35), 0 0 10px rgba(242, 57, 44, 0.5), inset 0 -4px 8px rgba(0, 0, 0, 0.35); } to { box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35), 0 0 30px rgba(255, 120, 90, 0.95), inset 0 -4px 8px rgba(0, 0, 0, 0.35); } }
.mb-drive-out, .mb-drive-toast { position: fixed; z-index: 7; pointer-events: none; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(12, 14, 22, 0.88); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #e7e9ee;
  font: 500 12px/1.35 'Satoshi', system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35); }
.mb-drive-out { padding: 6px 12px; white-space: nowrap; font-variant-numeric: tabular-nums; color: #fde68a; }
.mb-drive-toast { padding: 9px 14px; border-radius: 14px; max-width: min(360px, calc(100vw - 32px)); text-align: left; }
.mb-drive-out[hidden], .mb-drive-toast[hidden] { display: none; }
@media (max-width: 900px) { .mb-drive { width: 52px; height: 52px; font-size: 9px; } .mb-drive-out { font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .mb-drive, .mb-drive.running { transition: none; animation: none; } }
@media print { .mb-drive, .mb-drive-out, .mb-drive-toast { display: none !important; } }`;

  let btn, out, toastEl, model = null;

  // ----- odds: weight 1/degree over every connected neuron except the centre -----
  function buildModel() {
    const D = window.MINDBLOWN;
    if (!D || !Array.isArray(D.pages) || !D.pages.length) return null;
    const links = Array.isArray(D.links) ? D.links : [];
    // rebuilt on every press from the current data (cheap: one pass over the links), so a same-size edit never leaves stale odds
    const degree = new Map(D.pages.map(p => [p.id, 0]));
    links.forEach(l => { if (degree.has(l.s)) degree.set(l.s, degree.get(l.s) + 1); if (degree.has(l.t)) degree.set(l.t, degree.get(l.t) + 1); });
    const byDeg = [...D.pages].sort((a, b) => degree.get(b.id) - degree.get(a.id));
    const hubId = [D.center, ...(Array.isArray(D.centers) ? D.centers : [])].find(id => id && degree.has(id)) || byDeg[0].id;
    let candidates = D.pages.filter(p => p.id !== hubId && degree.get(p.id) > 0);
    if (!candidates.length) candidates = D.pages.filter(p => p.id !== hubId);   // a brain with no wires: every neuron is equally improbable
    if (!candidates.length) return null;
    const c = candidates.map(p => ({ id: p.id, title: p.title || p.id, w: 1 / Math.max(1, degree.get(p.id)) }));
    const Z = c.reduce((a, x) => a + x.w, 0);
    model = { hubId, hubTitle: (D.pages.find(p => p.id === hubId) || {}).title || hubId, c, Z };
    return model;
  }
  // network overview pages (window.MINDBLOWN_NETWORK, no single brain): the destinations are the shared neurons in
  // each member brain, weighted 1/connections, and arriving means opening that brain at that neuron
  function buildNetworkModel() {
    const N = window.MINDBLOWN_NETWORK;
    if (!N || !Array.isArray(N.brains) || !N.brains.length) return null;
    const reg = N.registry || {}, shared = N.shared || {}, c = [];
    Object.keys(shared).forEach(id => N.brains.forEach(b => {
      const k = shared[id] && shared[id][b.id]; if (!k || !b.href) return;
      const t = (reg[id] && reg[id].title) || id;
      c.push({ id, title: `${t}” in “${b.title || b.id}`, href: b.href + '#n=' + encodeURIComponent(id), w: 1 / Math.max(1, (k.connections || 0) + (k.synapses || 0)) });
    }));
    if (!c.length) N.brains.forEach(b => { if (b.href) c.push({ id: b.id, title: b.title || b.id, href: b.href, w: 1 }); });
    if (!c.length) return null;
    model = { network: true, c, Z: c.reduce((a, x) => a + x.w, 0) };
    return model;
  }
  const hasBrain = () => !!(window.MINDBLOWN && Array.isArray(window.MINDBLOWN.pages) && window.MINDBLOWN.pages.length);
  const pick = m => { let r = Math.random() * m.Z; for (const x of m.c) { r -= x.w; if (r <= 0) return x; } return m.c[m.c.length - 1]; };
  const oddsAgainst = (m, x) => Math.max(1, Math.round(m.Z / x.w - 1));

  // ----- navigation through the engine's own hooks -----
  function go(m, id) {
    if (m.network) { if (m.lastHref) location.href = m.lastHref; return; }
    const qa = window.MINDBLOWN_QA;
    if (qa && typeof qa.routeFromTo === 'function') { try { if (qa.routeFromTo(m.hubId, id)) return; } catch (e) { /* fall through to the deep link */ } }
    if (qa && typeof qa.selectId === 'function') { try { qa.selectId(id); return; } catch (e) { /* fall through */ } }
    const rest = location.hash.replace(/^#/, '').split('&').filter(x => x && !/^n=/.test(x));
    const hash = '#' + [...rest, 'n=' + encodeURIComponent(id)].join('&');
    try { history.replaceState(history.state, '', hash); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    catch (e) { location.hash = hash; }   // opaque-origin previews can refuse replaceState; a plain hash write still opens it
  }

  // ----- placement: above the zoom column when the page has one, else bottom-right -----
  function place() {
    if (!btn) return;
    // several pages stack two zoom columns (zoom + tools); sit above the highest one that is visible
    let r = null;
    document.querySelectorAll('.zoom-ctl').forEach(z => {
      if (z.offsetParent === null) return;
      const b = z.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && (!r || b.top < r.top)) r = b;
    });
    const size = btn.offsetWidth || 56, W = window.innerWidth, H = window.innerHeight;
    let cx, bottom;
    if (r && r.width > 0 && r.top > size + 70) { cx = r.left + r.width / 2; bottom = r.top - 12; }
    else if (r && r.width > 0 && W > 900) { cx = r.left - 12 - size / 2; bottom = r.top + size; }   // a short window: no room above the rail, so beside its top
    else { cx = W - (W <= 900 ? 16 : 24) - size / 2; bottom = H - (W <= 900 ? 16 : 24) - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h')) || 0); }   // no zoom column (network overviews): the usual floating-button corner, above a phone options bar if there is one
    const clampL = x => Math.round(Math.min(W - size - 8, Math.max(8, x)));
    const mine = e => e === btn || btn.contains(e) || e === out || e === toastEl || (toastEl && toastEl.contains(e));
    const sheetAt = (x, y) => {   // the panel or sheet under a point, looking past the Drive's own elements
      const e = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []).find(el => !mine(el));
      return e && e.closest ? e.closest('.panel, .sheet, [role="dialog"], .nav-menu, .mbar-sheet') : null;
    };
    const CONTROLS = '#top > *, .search, .brand, nav.brains, .zoom-ctl';
    const free = (l, t) => {   // inside the viewport, off every panel/sheet (centre and corners) and clear of the header and zoom columns
      if (l < 4 || t < 4 || l + size > W - 4 || t + size > H - 4) return false;
      const pts = [[l + size / 2, t + size / 2], [l + 4, t + 4], [l + size - 4, t + 4], [l + 4, t + size - 4], [l + size - 4, t + size - 4]];
      if (pts.some(([x, y]) => sheetAt(x, y))) return false;
      return ![...document.querySelectorAll(CONTROLS)].some(e => {
        if (e.offsetParent === null) return false; const q = e.getBoundingClientRect();
        return q.width > 0 && q.left < l + size + 4 && q.right > l - 4 && q.top < t + size + 4 && q.bottom > t - 4;
      });
    };
    // first choice above the zoom column; when an open panel or phone sheet takes that spot, step beside the zoom column,
    // then beside or above the panel, so the button (and its "do not press again" line) stays in reach
    const home = [clampL(cx - size / 2), Math.round(bottom - size)];
    const spots = [home];
    if (r) spots.push([clampL(r.left - size - 10), Math.round(r.top)]);
    const P = sheetAt(home[0] + size / 2, home[1] + size / 2);
    if (P) { const q = P.getBoundingClientRect(); spots.push([clampL(q.left - size - 12), home[1]], [clampL(W - size - 16), Math.round(q.top - size - 12)]); }
    const spot = spots.find(([l, t]) => free(l, t));
    const [left, top] = spot || home;
    btn.style.left = left + 'px'; btn.style.top = top + 'px';
    const hidden = !spot;   // nowhere free: hide rather than float over reading text
    btn.classList.toggle('mb-hidden', hidden);
    btn.disabled = hidden; btn.tabIndex = hidden ? -1 : 0;   // a hidden button is out of the tab order and cannot be activated
    const rightEdge = W - (left - 10);
    if (out) { out.style.right = rightEdge + 'px'; out.style.top = (top + size / 2 - 14) + 'px'; }
    if (toastEl) {
      if (hidden) {   // the button's spot is under a panel: say it centred, clear of the panel text, instead
        toastEl.style.right = 'auto'; toastEl.style.left = '50%'; toastEl.style.transform = 'translateX(-50%)';
        if (W <= 900) { toastEl.style.bottom = 'auto'; toastEl.style.top = '12px'; } else { toastEl.style.top = 'auto'; toastEl.style.bottom = '72px'; }
      } else {
        toastEl.style.left = 'auto'; toastEl.style.top = 'auto'; toastEl.style.transform = 'none';
        toastEl.style.right = Math.max(16, W - (left + size)) + 'px'; toastEl.style.bottom = (H - top + 12) + 'px';
      }
    }
  }

  let toastT = 0;
  const toast = msg => { toastEl.textContent = msg; toastEl.hidden = false; place(); clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 4200); };

  let busy = false, landedAt = 0;
  async function run() {
    if (busy) return;
    if (Date.now() - landedAt < 1200) { toast('Please do not press this button again.'); return; }
    const m = hasBrain() ? buildModel() : buildNetworkModel();
    if (!m) { toast('The Drive is still warming the tea. Try again in a moment.'); return; }
    busy = true; btn.classList.add('running'); btn.setAttribute('aria-busy', 'true');
    try {
      const exactlyWhereWeWere = Math.random() < 1 / 42;
      const dest = exactlyWhereWeWere ? null : pick(m);
      const steps = [...LADDER, dest ? `${fmt(oddsAgainst(m, dest))} : 1 against and falling` : '2^(∞−1) : 1 against and falling', '5 : 1 against and falling', '1 : 1 — we have normality'];
      out.hidden = false; place();
      for (const s of steps) { out.textContent = s; await sleep(190); }
      if (dest) {
        m.lastHref = dest.href;
        if (m.network) {   // leaving the page: announce first so the landing line is readable before the brain opens
          toast(`Course set for “${dest.title}” at ${fmt(oddsAgainst(m, dest))} : 1 against. Opening the brain…`);
          await new Promise(r => setTimeout(r, 1300));   // a real pause even with reduced motion, so the line can be read
        }
        go(m, dest.id);
        if (!m.network) toast(`Arrived at “${dest.title}” at ${fmt(oddsAgainst(m, dest))} : 1 against. Anything you still can’t cope with is therefore your own problem.`);
      } else {
        if (!m.network) go(m, m.hubId);
        toast('The Drive passed through every point in the Universe and came back exactly where it was.');
      }
      await sleep(700);
    } finally {   // a throwing route or toast must never leave the button locked
      out.hidden = true; out.textContent = '';
      busy = false; btn.classList.remove('running'); btn.removeAttribute('aria-busy'); landedAt = Date.now();
    }
  }

  function mount() {
    if (btn) return;
    const style = document.createElement('style'); style.id = 'mb-drive-style'; style.textContent = CSS; document.head.appendChild(style);
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mb-drive'; btn.id = 'mb-drive';
    btn.title = 'Infinite Improbability Drive: jump to an improbable neuron (I)';
    btn.setAttribute('aria-label', 'Don’t Panic: engage the Infinite Improbability Drive and jump to an improbable neuron');
    btn.setAttribute('aria-keyshortcuts', 'I');
    btn.innerHTML = '<span aria-hidden="true">DON’T</span><span aria-hidden="true">PANIC</span>';
    out = document.createElement('output'); out.className = 'mb-drive-out'; out.hidden = true; out.setAttribute('aria-hidden', 'true');
    toastEl = document.createElement('div'); toastEl.className = 'mb-drive-toast'; toastEl.hidden = true; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
    document.body.append(btn, out, toastEl);
    btn.addEventListener('click', run);
    btn.addEventListener('pointerdown', () => btn.classList.add('pressed'));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => btn.addEventListener(t, () => btn.classList.remove('pressed')));
    document.addEventListener('keydown', e => {
      if ((e.key !== 'i' && e.key !== 'I') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (btn.classList.contains('mb-hidden')) return;   // a sheet or panel is over the button: the shortcut waits with it
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      run();
    });
    window.addEventListener('resize', place);
    // the zoom column moves with phone bars and sheets; follow it cheaply
    setInterval(place, 300);
    place();
    document.documentElement.classList.add('has-improbability-drive');
  }

  // wait for a brain: pages that boot their data late (community/AI loaders, composed networks) get the Drive when it arrives
  let tries = 0;
  (function wait() {
    if (document.body && (hasBrain() || buildNetworkModel())) { mount(); return; }
    if (++tries < 240) setTimeout(wait, 250);   // a minute; a page with no brain never shows the button
  })();
})();
