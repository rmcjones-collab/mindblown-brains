/* MindBlown Neural — origin.js
   Origin brains. An origin brain is a brain placed with the intention of having it built by another brain. The visitor
   places a blank one (a hollow hub on a satellite ring, or wherever they click), a builder brain asks what it is about,
   and from then on the builder owns it: it fills the brain in to its own standards and keeps a journal so the work
   survives a reload. The first builder is the mice (js/mice.js): on the Guide they build in character; on any other page
   they respond to the host network, relaying what it already knows about the subject and bringing in further information
   from the rest of MindBlown (data/origin-index.js, loaded only when needed).
   This file owns placement, the builder registry, the dock and the journal (localStorage mbn:origin:<brain>); builders own
   what gets built. Everything placed or built carries an `origin` tag, so the engine rings it in red and every signal that
   sets out from it travels in red (dynamics.js / render.js). Built-in material is never edited.
   View-level add-on: uses only window.MINDBLOWN_GROW (the growth API) and the page data. Load it before any builder. */
(() => {
  const D = window.MINDBLOWN, G = () => window.MINDBLOWN_GROW;
  if (!D || !Array.isArray(D.pages) || !G()) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'mbn:origin:' + (D.brain || D.title || 'brain');
  const CAP = { brains: 3 };
  const ORIGIN = 'origin';
  const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toastEl = document.getElementById('toast'); let toastT = 0;
  const toast = msg => { if (!toastEl) return; toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 3200); };

  // ---------- journal ----------
  let journal = { v: 1, brains: [] };
  try { const j = JSON.parse(storage?.getItem(KEY) || 'null'); if (j && Array.isArray(j.brains)) journal = j; } catch (e) { }
  let storageFailed = !storage;
  const save = () => {
    try { if (!storage) throw Error('storage unavailable'); storage.setItem(KEY, JSON.stringify(journal)); storageFailed = false; }
    catch (e) { storageFailed = true; }
    const warning = document.getElementById('origin-storage');
    if (warning) warning.hidden = !storageFailed;
    return !storageFailed;
  };

  // ---------- builders ----------
  // A builder registers { id, name, verb, ask(origin), suggest(origin), take(origin), replay(origin), pause(), resume(), paused() }.
  // origin: { id, hub, name, subject, builder, acts, done, record(act), say(text), finish(summary) }.
  const builders = new Map(); const order = []; let selectedBuilder = null;
  const brains = [];   // live origin brains, in placement order
  const byId = id => brains.find(b => b.id === id);
  const hostHub = () => G().hub();

  function live(entry) {   // the object a builder works with; `entry` is the journal row it persists to
    const o = {
      get id() { return entry.id; }, get hub() { return entry.hub; }, get name() { return entry.name; }, get subject() { return entry.subject; }, get builder() { return entry.builder; },
      get acts() { return entry.acts; }, get done() { return !!entry.done; }, get summary() { return entry.summary || ''; }, get at() { return entry.at || null; },
      record(act) { entry.acts.push(act); save(); return act; },
      say(text) { setStatus(text); },
      finish(summary) { entry.done = true; entry.summary = summary || ''; save(); setStatus(summary ? `${entry.subject}: ${summary}` : `${entry.subject}: finished`); renderDock(); },
    };
    return o;
  }

  function placeEntry(entry) {   // put a journal row on the canvas (fresh or replayed)
    const g = G();
    g.addLobe({ id: entry.id, name: entry.subject ? `Origin brain: ${entry.subject}` : entry.name, color: entry.color || '#e2e8f0', origin: ORIGIN, by: entry.builderName || 'you', satellite: true, at: entry.at || null });
    g.addNeuron({ id: entry.hub, title: entry.subject || entry.name, desc: entry.desc || blankDesc(), lobe: entry.id, origin: ORIGIN, by: entry.builderName || 'you', hub: true, blank: !entry.subject });
    const hub = hostHub(); if (hub && hub !== entry.hub) g.addLink({ s: entry.hub, t: hub, w: 1, note: 'placed on this brain', origin: ORIGIN, by: 'you' });
    const o = live(entry); brains.push(o); return o;
  }
  const blankDesc = () => `A blank brain, placed to be built by another brain. Nobody has said what it is about yet.`;

  function place(opts = {}) {
    if (brains.length >= CAP.brains) { toast(`${CAP.brains} origin brains is the limit on one page. Clear sends them away.`); return null; }
    const n = journal.brains.reduce((m, b) => Math.max(m, +(String(b.id).match(/-(\d+)$/) || [])[1] || 0), 0) + 1;
    const entry = { id: `origin-brain-${n}`, hub: `origin/${n}`, name: `Origin brain ${n}`, color: '#e2e8f0', at: opts.at && Number.isFinite(opts.at.x) && Number.isFinite(opts.at.y) ? { x: +opts.at.x.toFixed(1), y: +opts.at.y.toFixed(1) } : null, subject: null, builder: null, builderName: null, acts: [], done: false, placed: new Date().toISOString() };
    journal.brains.push(entry); save();
    const o = placeEntry(entry);
    G().commit({ alpha: 0.7 }); if (G().fitIfOut) setTimeout(() => G().fitIfOut(900), reduceMotion ? 0 : 900);
    setStatus(`${entry.name} placed: blank, waiting to be told what it is about`); renderDock(); setTimeout(() => { const i = dock.querySelector('input'); if (i && !opts.quiet) i.focus(); }, 50);
    return o;
  }

  function give(id, subject, builderId) {   // hand an origin brain to a builder with its subject
    const o = byId(id), entry = journal.brains.find(b => b.id === id), b = builders.get(builderId || order[0]);
    subject = String(subject || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!o || !entry || !b || !subject || entry.subject) return null;
    entry.subject = subject; entry.builder = b.id; entry.builderName = b.name; entry.desc = `An origin brain about ${subject}, placed by the visitor and handed to ${b.name} to build.`; save();
    G().update(entry.hub, { title: subject, desc: entry.desc, blank: false, by: b.name }); G().update(entry.id, { name: `Origin brain: ${subject}`, by: b.name }); G().commit({ alpha: 0.4 });
    renderDock(); b.take(o); return o;
  }

  function register(b) {
    if (!b || !b.id || builders.has(b.id)) return;
    builders.set(b.id, b); order.push(b.id);
    // brains already handed to this builder (from the journal) are replayed now; the ones still blank just wait
    brains.filter(o => o.builder === b.id).forEach(o => { try { b.replay(o); } catch (e) { console.warn('origin: replay failed', o.id, e); } });
    renderDock();
  }

  // ---------- dock ----------
  // the Origin brain button is an icon in the rail's Brains group (js/app.js MINDBLOWN_RAIL); its question, status, Pause and Clear sit in a
  // card beside the rail, level with the button. The card shows while it has something to say (a blank brain's question, a status line);
  // × folds it until the next news. Without the rail (a page that never loads app.js) the old bottom-left pill is kept.
  const RAIL = window.MINDBLOWN_RAIL;
  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.4 2.4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
  const dock = document.createElement('div'); dock.className = RAIL ? 'origin-dock origin-card' : 'origin-dock'; dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', 'Origin brain');
  dock.innerHTML = `${RAIL ? `<div class="origin-head"><span class="ring" aria-hidden="true"></span><b>Origin brain</b><button type="button" class="origin-fold" id="origin-fold" title="Fold this card until there is news" aria-label="Fold the origin brain card">×</button></div><output id="origin-out" class="origin-status"></output>` : ''}
    ${RAIL ? '' : `<button id="origin-btn" class="origin-btn" type="button"><span class="ring" aria-hidden="true"></span><span class="label">Origin brain</span><output id="origin-out"></output></button>`}
    <p id="origin-storage" role="status" hidden>Browser storage is unavailable or full. This work is not safely saved; keep this tab open.</p>
    <form id="origin-ask" class="origin-ask" hidden autocomplete="off"><label for="origin-builder">Builder</label><select id="origin-builder" aria-label="Builder"></select><label for="origin-subject" id="origin-q"></label><div class="row"><input id="origin-subject" type="text" maxlength="80" placeholder="a subject" aria-describedby="origin-q"><button type="submit" class="go" id="origin-go"></button></div><div class="chips" id="origin-chips"></div></form>
    <div class="origin-actions"><button id="origin-pause" class="mice-clear" type="button" hidden aria-pressed="false">Pause</button>
    <button id="origin-clear" class="mice-clear" type="button" title="Forget every origin brain placed on this page in this browser and reload" hidden>Clear</button></div>`;
  document.body.appendChild(dock); document.body.classList.add('has-origin');
  // the dock's height (one pill, or the builder's open question with its chips) is published as --origin-dock-h so toasts clear it; see style.css
  const dockHeight = () => document.documentElement.style.setProperty('--origin-dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
  dockHeight(); if (window.ResizeObserver) new ResizeObserver(dockHeight).observe(dock); else window.addEventListener('resize', dockHeight);   // without ResizeObserver, renderDock and the submit handler also remeasure (they are what shows or hides the question)
  const railBtn = RAIL ? RAIL.brainButton({ id: 'origin-btn', label: 'Place an origin brain', title: 'Origin brain (O): place a blank brain for another brain to build. Click the canvas to choose where it goes.', icon: `${ICON}<span class="label" hidden>Origin brain</span>` }) : null;
  if (railBtn) { railBtn.classList.add('origin-rail'); RAIL.card(dock, railBtn); }
  if (!RAIL && document.querySelector('.mice-dock')) dock.classList.add('above-mice');
  let folded = false;
  const syncCard = () => { if (!RAIL) return; const has = !dock.querySelector('#origin-ask').hidden || !!dock.querySelector('#origin-out').textContent; dock.hidden = folded || !has; railBtn.classList.toggle('news', folded && has); railBtn.setAttribute('aria-expanded', String(!dock.hidden)); };
  if (RAIL) dock.querySelector('#origin-fold').addEventListener('click', () => { folded = true; syncCard(); railBtn.focus(); });
  const btn = railBtn || dock.querySelector('#origin-btn'), out = dock.querySelector('#origin-out'), pauseBtn = dock.querySelector('#origin-pause'), clearBtn = dock.querySelector('#origin-clear'), ask = dock.querySelector('#origin-ask'), q = dock.querySelector('#origin-q'), input = dock.querySelector('#origin-subject'), go = dock.querySelector('#origin-go'), chips = dock.querySelector('#origin-chips');
  const builderSelect = dock.querySelector('#origin-builder');
  builderSelect.addEventListener('change', () => { selectedBuilder = builderSelect.value; renderDock(); });
  const setStatus = text => { out.textContent = text || ''; folded = false; syncCard(); };
  function renderDock() {
    const blank = brains.find(o => !o.subject), b = builders.get(selectedBuilder || order[0]);
    builderSelect.replaceChildren(...order.map(id => { const option = document.createElement('option'); option.value = id; option.textContent = builders.get(id).name; return option; }));
    if (b) builderSelect.value = b.id;
    dock.querySelector('#origin-storage').hidden = !storageFailed;
    clearBtn.hidden = !brains.length;
    btn.classList.toggle('blank', !!blank); btn.classList.toggle('full', brains.length >= CAP.brains);
    btn.querySelector('.label').textContent = brains.length >= CAP.brains ? `${brains.length} origin brains` : brains.length ? `Place another origin brain` : 'Place an origin brain';
    if (RAIL) btn.setAttribute('aria-label', btn.querySelector('.label').textContent);
    if (blank && b) {
      ask.hidden = false; q.textContent = b.ask(blank); go.textContent = b.verb || `Hand it to ${b.name}`; input.placeholder = 'a subject';
      const s = (b.suggest ? b.suggest(blank) : []).slice(0, 4);
      chips.innerHTML = s.map(x => `<button type="button" class="chip">${esc(x)}</button>`).join('');
      chips.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => { input.value = c.textContent; ask.requestSubmit ? ask.requestSubmit() : go.click(); }));
    } else if (blank) { ask.hidden = false; q.textContent = 'No builder brain is on this page; the origin brain stays blank.'; go.textContent = 'Keep'; chips.innerHTML = ''; }
    else ask.hidden = true;
    const working = brains.some(o => o.subject && !o.done);
    pauseBtn.hidden = !(working && b && b.pause && !b.ownControls && !(b.id === 'mice' && document.getElementById('mice-btn')));
    if (b && b.paused) { const p = b.paused(); pauseBtn.textContent = p ? 'Resume' : 'Pause'; pauseBtn.setAttribute('aria-pressed', String(p)); }
    if (!ask.hidden) folded = false;   // a waiting question always shows
    syncCard();
    dockHeight();
  }
  ask.addEventListener('submit', e => { e.preventDefault(); const blank = brains.find(o => !o.subject); if (!blank) return; const v = input.value.trim(); if (!v) { input.focus(); return; } if (!order.length) { ask.hidden = true; dockHeight(); return; } input.value = ''; give(blank.id, v, selectedBuilder || order[0]); });
  pauseBtn.addEventListener('click', () => { const b = builders.get(selectedBuilder || order[0]); if (!b || !b.pause) return; b.paused() ? b.resume() : b.pause(); renderDock(); });
  clearBtn.addEventListener('click', () => { try { storage?.removeItem(KEY); } catch (e) { } location.reload(); });

  // ---------- placing: press the button, then click where the brain should go (Esc or the button again: the outer ring) ----------
  let placing = false, down = null;
  const canvas = document.querySelector('canvas');
  function setPlacing(on) { placing = on; document.body.classList.toggle('placing-origin', on); btn.setAttribute('aria-pressed', String(on)); if (on) toast('Click where the origin brain should go. Esc, or the button again, puts it on the outer ring.'); }
  // one panel beside the rail at a time: the Modifier panel opening folds this card (its news dot stays on the button); the button unfolds it
  document.addEventListener('mindblown:flyout', e => { if (RAIL && e.detail !== 'origin' && !dock.hidden) { folded = true; syncCard(); } });
  btn.addEventListener('click', () => {
    // The mobile chat sheet hides Origin. Explicitly opening Origin folds chat
    // without pausing or clearing the mice.
    if (window.innerWidth <= 900 && document.querySelector('.mice-chat.open:not([hidden])')) document.getElementById('mice-btn')?.click();
    if (RAIL && folded) { folded = false; syncCard(); document.dispatchEvent(new CustomEvent('mindblown:flyout', { detail: 'origin' })); }
    if (placing) { setPlacing(false); place(); return; }
    if (brains.find(o => !o.subject)) { input.focus(); toast('Say what the blank origin brain is about first.'); return; }
    if (brains.length >= CAP.brains) { toast(`${CAP.brains} origin brains is the limit on one page. Clear sends them away.`); return; }
    setPlacing(true);
  });
  window.addEventListener('pointerdown', e => { if (!placing || e.target !== canvas) return; down = [e.clientX, e.clientY]; e.stopImmediatePropagation(); }, true);
  window.addEventListener('pointerup', e => {
    if (!placing || e.target !== canvas || !down) return; e.stopImmediatePropagation();
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6; down = null; if (moved) return;   // a drag is a pan, not a placement
    const [x, y] = G().toWorld(e.clientX, e.clientY); setPlacing(false); place({ at: { x, y } });
  }, true);
  window.addEventListener('click', e => { if (placing && e.target === canvas) e.stopImmediatePropagation(); }, true);
  document.addEventListener('keydown', e => {
    const t = e.target; const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape' && placing) { setPlacing(false); place(); return; }
    if ((e.key === 'o' || e.key === 'O') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) btn.click();
  });

  // ---------- the index (further information from the rest of MindBlown), loaded on demand ----------
  let indexP = null;
  function index() {
    if (window.MINDBLOWN_ORIGIN_INDEX) return Promise.resolve(window.MINDBLOWN_ORIGIN_INDEX);
    if (indexP) return indexP;
    const src = (document.currentScript && document.currentScript.dataset.index) || document.querySelector('script[data-index]')?.dataset.index || './data/origin-index.js';
    // a failed load is not remembered: the next call tries again, so a brain is never finished on a host-only view by accident
    indexP = new Promise(res => { const s = document.createElement('script'); s.src = src; const settle = ok => { if (!ok) indexP = null; s.remove(); res(ok ? window.MINDBLOWN_ORIGIN_INDEX : null); }; s.onload = () => settle(!!window.MINDBLOWN_ORIGIN_INDEX); s.onerror = () => settle(false); document.body.appendChild(s); });
    return indexP;
  }

  // ---------- boot: put the journal's brains back ----------
  journal.brains.forEach(entry => { try { placeEntry(entry); } catch (e) { console.warn('origin: could not replace', entry.id, e); } });
  if (brains.length) { G().commit({ alpha: 0.8 }); setStatus(`${brains.length} origin ${brains.length === 1 ? 'brain' : 'brains'} from last time`); }
  renderDock();

  window.MINDBLOWN_ORIGIN = Object.freeze({
    place, give, register, index, cap: CAP,
    clearBuilder: id => { if (!builders.has(id)) return false; const before = journal.brains; journal.brains = before.filter(b => b.builder !== id); if (save()) return true; journal.brains = before; return false; },
    brains: () => brains.map(o => ({ id: o.id, hub: o.hub, name: o.name, subject: o.subject, builder: o.builder, done: o.done, acts: o.acts.length, summary: o.summary, at: o.at })),
    builders: () => order.slice(), journal: () => JSON.parse(JSON.stringify(journal)), status: () => out.textContent,
    clear: () => { try { storage?.removeItem(KEY); } catch (e) { } },
  });
})();
