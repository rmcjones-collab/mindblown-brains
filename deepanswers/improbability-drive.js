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
   The first press on a site opens a short disclaimer (role=alertdialog) that must be acknowledged with its checkbox before
   "Engage the Drive" runs the jump; "Not today" or Escape closes it and leaves the Drive idle. The acknowledgement is kept
   per site in localStorage (key mb-drive-disclaimer-v1), or for the page's lifetime when storage is unavailable.
   On desktop the Drive keeps its place at the top of the static right rail: the details panel opens to the rail's left
   (app.js MINDBLOWN_RAIL, --rail-clear), so the Drive no longer steps aside for it; its readout and toast sit left of that panel.

   Self-contained: it injects its own button, readout, toast and styles, reads only window.MINDBLOWN (pages, links,
   center/centers), or window.MINDBLOWN_NETWORK on network overview pages (where it opens a shared neuron in one of
   the member brains), and the public hooks above, writes only the disclaimer acknowledgement to storage and does
   nothing until pressed. It waits for
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
@media print { .mb-drive, .mb-drive-out, .mb-drive-toast, .mb-drive-dlg { display: none !important; } }
.mb-drive-dlg { position: fixed; inset: 0; margin: auto; z-index: 30; height: fit-content; box-sizing: border-box; width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 32px); overflow: auto; padding: 22px 22px 18px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.16);
  background: #0c0e16; color: #e7e9ee; font: 400 14px/1.5 'Satoshi', system-ui, sans-serif; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55); }
.mb-drive-dlg:not([open]) { display: none; }
.mb-drive-dlg::backdrop { background: rgba(3, 4, 8, 0.62); }
.mb-drive-dlg h2 { margin: 0 0 10px; color: #ff5a4d; font: 700 20px/1.15 'Clash Display', 'Satoshi', system-ui, sans-serif; letter-spacing: 0.06em; }
.mb-drive-dlg p { margin: 0 0 10px; color: #c9cdd6; }
.mb-drive-dlg label { display: flex; gap: 10px; align-items: flex-start; margin: 14px 0 16px; cursor: pointer; color: #e7e9ee; }
.mb-drive-dlg input { flex: none; width: 18px; height: 18px; margin: 2px 0 0; accent-color: #f2392c; cursor: pointer; }
.mb-drive-dlg-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
.mb-drive-dlg button { min-height: 40px; padding: 9px 16px; border-radius: 999px; cursor: pointer; font: 600 13px/1 'Satoshi', system-ui, sans-serif; }
.mb-drive-dlg .mb-drive-dlg-no { background: transparent; color: #e7e9ee; border: 1px solid rgba(255, 255, 255, 0.28); }
.mb-drive-dlg .mb-drive-dlg-go { background: #c8161d; color: #fff; border: 1px solid #c8161d; }
.mb-drive-dlg .mb-drive-dlg-go:disabled { opacity: 0.45; cursor: not-allowed; }
.mb-drive-dlg button:focus-visible, .mb-drive-dlg input:focus-visible { outline: 2px solid #fde68a; outline-offset: 3px; }`;

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
      if (z.offsetParent === null || z.classList.contains('rail-beside')) return;
      const b = z.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && (!r || b.top < r.top)) r = b;
    });
    const size = btn.offsetWidth || 56, W = window.innerWidth, H = window.innerHeight;
    let cx, bottom;
    if (r && r.width > 0 && r.top > size + 70) { cx = r.left + r.width / 2; bottom = r.top - 12; }
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
    // desktop: a details panel opened beside the rail (left of the Drive) keeps its text clear; the readout and toast sit left of it instead
    const side = W > 900 && [...document.querySelectorAll('.panel, #mb-rando-panel')].map(p => !p.hidden && p.getClientRects().length ? p.getBoundingClientRect() : null)
      .find(q => q && q.width > 0 && q.right <= left + 4 && q.right > W / 2 && q.top < top + size && q.bottom > top) || null;
    const rightEdge = side ? W - side.left + 10 : W - (left - 10);
    if (out) { out.style.right = rightEdge + 'px'; out.style.top = (top + size / 2 - 14) + 'px'; }
    if (toastEl) {
      if (side && !hidden) {
        toastEl.style.left = 'auto'; toastEl.style.bottom = 'auto'; toastEl.style.transform = 'none';
        toastEl.style.right = rightEdge + 'px'; toastEl.style.top = (top + size + 8) + 'px';   // below the readout, never over it
      } else if (hidden) {   // the button's spot is under a panel: say it centred, clear of the panel text, instead
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

  // ----- first-press disclaimer: acknowledged once per site, before the Drive's first jump -----
  const ACK_KEY = 'mb-drive-disclaimer-v1';
  let ackedInPage = false, dlg = null, dlgBox, dlgGo, dlgResult = 'no';
  const acked = () => { if (ackedInPage) return true; try { const ls = window.localStorage; return ls.getItem(ACK_KEY) === '1'; } catch (e) { return false; } };
  const acknowledge = () => { ackedInPage = true; try { const ls = window.localStorage; ls.setItem(ACK_KEY, '1'); } catch (e) { /* storage blocked: remember for this page only */ } };
  const dlgOpen = () => !!(dlg && dlg.hasAttribute('open'));
  const nativeModal = () => !!(dlg && typeof dlg.showModal === 'function');
  function dlgClosed() {
    if (dlgResult === 'go') run();
    else if (!nativeModal() && btn) btn.focus();   // a native modal dialog restores focus by itself
  }
  function closeDlg(result) {
    dlgResult = result;
    if (nativeModal()) { if (dlg.open) dlg.close(); return; }   // the 'close' event calls dlgClosed
    dlg.removeAttribute('open'); dlgClosed();
  }
  function buildDialog() {
    dlg = document.createElement('dialog'); dlg.className = 'mb-drive-dlg'; dlg.id = 'mb-drive-dlg';
    dlg.setAttribute('role', 'alertdialog'); dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'mb-drive-dlg-t'); dlg.setAttribute('aria-describedby', 'mb-drive-dlg-d');
    dlg.innerHTML = '<h2 id="mb-drive-dlg-t">DON’T PANIC</h2>'
      + '<div id="mb-drive-dlg-d"><p>You are about to engage the Infinite Improbability Drive. Your destination is unpredictable, and the journey may take you somewhere unexpected, including another brain.</p>'
      + '<p>Unknown results may occur. Proceed only if you’re comfortable with an unpredictable exploration experience.</p></div>'
      + '<label><input type="checkbox" id="mb-drive-dlg-ack"><span>I understand that unknown results may occur and choose to proceed.</span></label>'
      + '<div class="mb-drive-dlg-actions"><button type="button" class="mb-drive-dlg-no">Not today</button>'
      + '<button type="button" class="mb-drive-dlg-go" disabled>Engage the Drive</button></div>';
    dlgBox = dlg.querySelector('#mb-drive-dlg-ack'); dlgGo = dlg.querySelector('.mb-drive-dlg-go');
    dlgBox.addEventListener('change', () => { dlgGo.disabled = !dlgBox.checked; });
    dlg.querySelector('.mb-drive-dlg-no').addEventListener('click', () => closeDlg('no'));
    dlgGo.addEventListener('click', () => { if (!dlgBox.checked) return; acknowledge(); closeDlg('go'); });
    dlg.addEventListener('close', dlgClosed);   // native dialogs only; Escape fires cancel, then close, with dlgResult still 'no'
    dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && !nativeModal()) { e.preventDefault(); closeDlg('no'); } });
    document.body.appendChild(dlg);
  }
  function askFirst() {
    if (!dlg) buildDialog();
    dlgResult = 'no'; dlgBox.checked = false; dlgGo.disabled = true;
    if (nativeModal()) dlg.showModal(); else dlg.setAttribute('open', '');
    dlgBox.focus();
  }

  let busy = false, landedAt = 0;
  async function run() {
    if (busy || dlgOpen()) return;
    if (!acked()) { askFirst(); return; }
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
