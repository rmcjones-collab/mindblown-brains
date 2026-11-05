/* MindBlown Log — log-client.js (protocol v1)
   The small client a brain includes so the Log Brain can learn from it. It never talks to a server: every event is
   written to this origin's IndexedDB journal and handed to the Log Brain in one of three ways.
     1. Popup: the "Log Brain" link opens a fresh ledger with no opener. The client sends hello to its exact origin;
        the ledger replies ready and acknowledges journal batches. data-frame="1" enables an acked iframe sink on hosts
        that allow framing (pplx.app hosts answer frame-ancestors 'none'). Retention is bounded; status()
        reports unsaved data and cap losses. Await ready() before synchronous journal/export/handoff reads, and
        await save() before relying on a durable journal.
     2. Handoff: MBLOG.handoffUrl() opens the ledger with the journal in the URL fragment (never sent to a server); it is the
        link's plain href, so it also works with popups blocked. Fragments can be visible to browser history/extensions
        until the ledger removes them; only acknowledged transfers drain the local outbox.
     3. Export: MBLOG.exportJson() for a file the ledger can import.
   What is recorded, on any renderer: a visit, each neuron opened (the trail), each search term. The Neural engine's
   adapter adds what it learns (potentiation, trips, pruning, forgetting, routes). The Chess Explorer adds matches and counts.
   No identity fields are requested. Search terms are recorded as typed and can contain personal data.
   Search notice and opt-out: focusing the empty search box shows a short note that searches, visits and the neurons
   opened or routed through (with their titles, so grown neurons can carry what the visitor typed) are saved in this browser, with a Turn off /
   Turn on searches button that covers searches only. Desktops also get a "Save my searches" switch beside the Log Brain
   link. The choice is kept
   per browser (mblog:search-off) and also blocks searches sent through MBLOG.record. Searches already saved stay in the
   journal until it is cleared. Site owners can turn search logging off entirely with { searches: false }.
   The host and brain are the page's own. Owners can see exactly what left the page in
   the ledger of the Log Brain, which lives in the same browser.
   Config: window.MBLOG_CONFIG = { sink, brain, title, engine, frame, enabled, fragment, searches } or data-sink / data-brain / data-title / data-frame
   on the script tag. */
(() => {
  'use strict';
  if (window.MBLOG) return;
  const script = document.currentScript;
  const ds = script ? script.dataset : {};
  const cfg = Object.assign({ sink: 'https://logbrain.pplx.app', enabled: true, frame: false }, ds.sink ? { sink: ds.sink } : {}, ds.brain ? { brain: ds.brain } : {}, ds.title ? { title: ds.title } : {}, ds.frame ? { frame: ds.frame !== '0' } : {}, window.MBLOG_CONFIG || {});
  const V = 1, JOURNAL = 'mblog:journal', OUTBOX = 'mblog:outbox', MAX_JOURNAL = 2000, MAX_BYTES = 900 * 1024, BATCH = 200;
  let sinkOrigin = null;
  try { sinkOrigin = cfg.sink ? new URL(cfg.sink, location.href).origin : null; } catch (e) { sinkOrigin = null; }
  // the Log Brain does not log itself, and the sink page is not a brain
  const self = sinkOrigin && location.origin === sinkOrigin;
  // Configuration is captured at load. Disabled and sink/self clients never touch persistence or transport.
  const active = !!cfg.enabled && !self;
  const store = active ? (() => { try { const s = window.localStorage; s.getItem(JOURNAL); return s; } catch (e) { return null; } })() : null;
  const read = (k, d, failed = d) => { try { const v = store && store.getItem(k); const j = v == null ? d : JSON.parse(v); return j == null ? d : j; } catch (e) { return failed; } };
  const write = (k, v) => { if (!store) return false; try { store.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  // Search logging is a visitor choice: on by default (cfg.searches), switched off per browser under SEARCH_OFF. The choice is a
  // plain flag, never the searches themselves, and it is read on every search so other tabs' changes apply at once.
  const SEARCH_OFF = 'mblog:search-off';
  let searchOff = null;   // in-memory choice, so the switch still works when storage is blocked
  let searchKept = true;   // false when the last choice could not be stored: it then holds for this page only (reloading or leaving the page ends it); a stored choice is re-read on every search
  const searchesOn = () => cfg.searches !== false && (searchOff !== null && !searchKept ? !searchOff : store !== null && read(SEARCH_OFF, false, true) === false);   // a missing choice means on; an unreadable one means off
  const setSearches = on => { if (cfg.searches === false) return; searchOff = !on; searchKept = write(SEARCH_OFF, !on); searchPrefListeners.forEach(f => { try { f(); } catch (e) { } }); };
  const searchPrefListeners = new Set();
  if (active) window.addEventListener('storage', e => { if (e.key === SEARCH_OFF) { searchOff = null; searchKept = true; } });   // another tab chose; its stored choice applies
  const uid = () => { const a = new Uint8Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return Date.now().toString(36) + '-' + [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
  const D = () => window.MINDBLOWN || {};
  const brainId = () => (cfg.brain || D().brain || D().title || location.pathname.replace(/^\/|\.html$/g, '') || 'brain').toString().replace(/[^\w.-]+/g, '_').slice(0, 60);
  const brainTitle = () => (cfg.title || D().title || document.title || brainId()).toString().slice(0, 120);
  const engine = () => cfg.engine || (window.MBN ? 'neural' : 'canonical');

  const STATE = 'mblog:client:v2', LOCK = 'mblog:client:writer', RECOVERY = 'mblog:recovery:';
  const SNAP = 'mblog:snapshot:';   // per-brain signatures of the last learned-edges snapshot
  const forgetLocal = test => { try { if (!store) return; for (let i = store.length - 1; i >= 0; i--) { const k = store.key(i); if (k && test(k)) store.removeItem(k); } } catch (e) { /* best effort */ } };
  const RECOVERY_NOTICE = 'mblog:recovery-warning', RECOVERY_LIMIT = 8, RECOVERY_BYTES = 2 * 1024 * 1024;
  const locks = active && window.navigator && window.navigator.locks;
  const bytes = x => new TextEncoder().encode(JSON.stringify(x)).length;
  const isEvent = e => e && typeof e === 'object' && typeof e.id === 'string' && /^[\w-]{1,48}$/.test(e.id) && Number.isFinite(e.t) && typeof e.kind === 'string';
  const cleanState = (j, o, recovered = [], cleared = [], generation = '') => {
    const journal = Array.isArray(j) ? j.filter(isEvent) : [], ids = new Set(journal.map(e => e.id));
    return { journal, outbox: Array.isArray(o) ? [...new Set(o.filter(id => typeof id === 'string' && ids.has(id)))] : [],
      recovered: Array.isArray(recovered) ? recovered.filter(id => typeof id === 'string') : [],
      cleared: Array.isArray(cleared) ? cleared.filter(id => typeof id === 'string') : [],
      generation: typeof generation === 'string' ? generation : '' };
  };
  function loadState() {
    const state = read(STATE, null);
    if (state && Array.isArray(state.journal) && Array.isArray(state.outbox)) return cleanState(state.journal, state.outbox, state.recovered, state.cleared, state.generation);
    // One-time migration under LOCK on the first save. Older tabs must be reloaded after upgrading.
    const journal = read(JOURNAL, []), outbox = read(OUTBOX, []);
    return cleanState(journal, outbox);
  }
  // Never expose the best-effort mirror as the authoritative startup journal.
  let journal = [], outbox = [], hydrated = false, hydrationState = active ? 'pending' : 'inactive', startupAttempts = 0, currentAttempt;
  const hydrationWaiters = new Set();
  /** Wait for all current recovery attempts, including retries after initial readiness resolved. */
  function afterHydration(callback) {
    const run = () => {
      if (hydrationState === 'pending') hydrationWaiters.add(run);
      else callback();
    };
    run();
  }
  const listeners = new Set();
  let lost = 0, rejected = 0, storageStatus = !active ? (self ? 'self' : 'disabled') : store ? 'loading' : 'no-storage', clearRequested = false, clearEpoch = 0, clearId = null;
  let recoveryWarning = read(RECOVERY_NOTICE, null), lastCheckpoint = null, checkpointedClearId = null, checkpointTime = 0;
  // A generation is a durable clear token, not a wall-clock timestamp. Stale tabs must refresh/save before
  // recording into a new generation. Initial boot appends bind only during the first ordered startup attempt.
  let generation = null, initialObservation = true, clearedPending = 0;
  // Only new append/removal operations are applied to disk, never a stale tab's whole snapshot.
  // Durable absence from outbox is the acknowledgement state; stale snapshots cannot requeue it.
  const additions = new Map(), additionGenerations = new Map(), acknowledgements = new Set();
  function bounded(events, waiting) {
    events = events.slice(); const pending = new Set(waiting), droppedIds = []; let size = bytes(events);
    while ((events.length > MAX_JOURNAL || size > MAX_BYTES) && events.length) {
      const i = events.findIndex(e => e.kind !== 'match');
      const ev = events.splice(i < 0 ? 0 : i, 1)[0];
      size -= bytes(ev) + 1;
      if (pending.delete(ev.id)) droppedIds.push(ev.id);
    }
    const ids = new Set(events.map(e => e.id));
    return { journal: events, outbox: [...pending].filter(id => ids.has(id)), droppedIds };
  }
  function boundMemory() {
    const next = bounded(journal, outbox); journal = next.journal; outbox = next.outbox;
    // Only never-saved appends are lost here. Durable entries are counted if the locked commit evicts them.
    lost += next.droppedIds.filter(id => additions.has(id)).length;
    const ids = new Set(journal.map(e => e.id));
    for (const id of additions.keys()) if (!ids.has(id)) { additions.delete(id); additionGenerations.delete(id); }
    for (const id of acknowledgements) if (!ids.has(id)) acknowledgements.delete(id);
  }
  function recoveryBatches() {
    const batches = [];
    for (let i = 0; store && i < store.length; i++) {
      const key = store.key(i); if (!key || !key.startsWith(RECOVERY)) continue;
      const value = read(key, null);
      if (value && Array.isArray(value.additions) && Array.isArray(value.acks) && Array.isArray(value.remove)) batches.push({ key, value });
    }
    return batches.sort((a, b) => a.value.t - b.value.t || a.key.localeCompare(b.key));
  }
  // Boot events follow clears that were already checkpointed when this document started, but not later clears.
  const startupClears = (() => {
    try { return new Set(recoveryBatches().map(b => b.value.clear).filter(id => typeof id === 'string')); }
    catch (e) { initialObservation = false; return new Set(); } // Recovery itself still fails closed in commit().
  })();
  // Unload cannot await a Web Lock. Write immutable, per-unload operation records synchronously instead.
  // Only the locked writer folds these into shared state; receipts make crash-after-commit replay idempotent.
  function checkpoint() {
    boundMemory();
    if (!store) return false;
    if (!additions.size && !acknowledgements.size && !clearRequested) return true;
    // A clear linearizes at its locked commit/replay, not against a stale mirror's ID list.
    // The token makes repeated checkpoints of the same clear idempotent.
    const operations = { additions: [...additions.values()], generations: Object.fromEntries(additionGenerations), acks: [...acknowledgements], remove: [], clear: clearRequested ? clearId : null };
    const signature = JSON.stringify(operations);
    if (lastCheckpoint && lastCheckpoint.signature === signature && read(lastCheckpoint.key, null)) return true;
    // Once a checkpoint owns a clear, later checkpoints and this document's live save must not issue it again.
    // Cleanup of that immutable checkpoint means another writer committed it; absence is not a reason to repeat it.
    // Strict document-local ordering keeps its clear before later append checkpoints, even within one millisecond.
    const value = { t: Math.max(Date.now(), checkpointTime + 1), ...operations, clear: clearRequested && checkpointedClearId !== clearId ? clearId : null }, batches = recoveryBatches();
    const size = batches.reduce((sum, b) => sum + bytes(b.value), 0) + bytes(value);
    // Admission-only cap: never delete an older recoverable operation to make room for a new one.
    // Concurrent unloads may briefly overshoot this snapshot budget; unique keys avoid overwriting each other.
    const key = RECOVERY + uid();
    if (batches.length >= RECOVERY_LIMIT || size > RECOVERY_BYTES || !write(key, value)) {
      recoveryWarning = { t: Date.now(), additions: additions.size, acknowledgements: acknowledgements.size,
        clear: clearRequested, reason: 'Recovery checkpoint refused: count, byte budget, or storage quota' };
      write(RECOVERY_NOTICE, recoveryWarning); // best effort if even this small warning exceeds the origin's quota
      return false;
    }
    checkpointTime = value.t;
    if (value.clear) checkpointedClearId = value.clear;
    lastCheckpoint = { key, signature }; return true;
  }
  let database;
  // resolved once, like the other engine stores: absent or blocked (private mode, sandboxed preview) → the existing 'unavailable' path
  const idb = (() => { try { return window['indexed' + 'DB'] || null; } catch (e) { return null; } })();
  function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
      if (!idb) { reject(new Error('IndexedDB unavailable')); return; }
      const request = idb.open('mblog-client', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => { database = null; reject(request.error); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        db.onclose = () => { database = null; };
        resolve(db);
      };
    });
    return database;
  }
  function requireHydrated() {
    if (!active) throw new Error('Log client is inactive; storage is untouched. Reload with an enabled, non-sink configuration to access the journal.');
    if (!hydrated) throw new Error('Log journal is not ready; await MBLOG.ready(), or retry MBLOG.save() after a storage error.');
  }
  /** Complete exports require committed startup recovery. After a confirmed failure,
   * explicit exports can rescue only this document's new events, labelled partial.
   * Pending startup/retry transactions never expose an incomplete snapshot. */
  function exportSnapshot() {
    if (hydrated) return { events: journal };
    if (hydrationState !== 'failed') { requireHydrated(); }
    return { events: bounded([...additions.values()], additions.keys()).journal, partial: true };
  }
  // Web Locks alone cannot make cross-process localStorage caches linearizable. IndexedDB is authoritative;
  // the localStorage value remains only a best-effort mirror and migration source.
  function transaction(db, update) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite'), objectStore = tx.objectStore('state');
      let result, failure;
      const request = objectStore.get('client');
      request.onsuccess = () => {
        try {
          const raw = request.result;
          const saved = raw ? cleanState(raw.journal, raw.outbox, raw.recovered, raw.cleared, raw.generation) : loadState();
          result = update(saved); objectStore.put(result.state, 'client');
        } catch (e) { failure = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('Transaction aborted'));
      tx.onerror = () => { /* onabort reports the failure */ };
    });
  }
  async function commit() {
    if (!active) return false;
    boundMemory();
    if (!store) { initialObservation = false; storageStatus = 'no-storage'; return false; }
    // Do not silently fall back to unsafe read/merge/write on platforms without cross-tab locks.
    if (!locks || typeof locks.request !== 'function') { initialObservation = false; storageStatus = 'no-lock'; return false; }
    try {
      return await locks.request(LOCK, async () => {
        const db = await openDatabase();
        const committed = await transaction(db, saved => {
        const recovered = new Set(saved.recovered), cleared = new Set(saved.cleared), batches = recoveryBatches();
        // Startup requested this lock before exposing record(). Never bind unknown events on a later retry:
        // a clear could have committed while storage was unavailable.
        const bindBootstrap = generation === null && initialObservation;
        let bootstrapGeneration = saved.generation;
        initialObservation = false;
        let nextGeneration = saved.generation;
        const entries = new Map(saved.journal.map(e => [e.id, e])), pending = new Set(saved.outbox);
        for (const { key, value } of batches) {
          if (recovered.has(key)) continue;
          // Clears take effect in transaction/replay order. Own post-clear additions are applied afterwards.
          if (typeof value.clear === 'string' && !cleared.has(value.clear)) {
            entries.clear(); pending.clear(); cleared.add(value.clear); nextGeneration = value.clear;
            if (startupClears.has(value.clear)) bootstrapGeneration = value.clear;
          }
          // Retain compatibility with older ID-based checkpoints.
          for (const id of value.remove) { entries.delete(id); pending.delete(id); }
          for (const ev of value.additions.filter(isEvent)) {
            // Legacy checkpoints have no generation. Only their own clear, or the never-cleared baseline,
            // can admit them; an untyped stale checkpoint must not resurrect erased history.
            const epoch = value.generations && Object.hasOwn(value.generations, ev.id) ? value.generations[ev.id] : (value.clear || '');
            if ((epoch === nextGeneration || (epoch === null && nextGeneration === '')) && !entries.has(ev.id)) { entries.set(ev.id, ev); pending.add(ev.id); }
          }
          for (const id of value.acks) pending.delete(id);
        }
        if (bindBootstrap) {
          for (const id of additions.keys()) if (additionGenerations.get(id) === null) additionGenerations.set(id, bootstrapGeneration);
        }
        if (clearRequested && checkpointedClearId !== clearId && !cleared.has(clearId)) { entries.clear(); pending.clear(); cleared.add(clearId); nextGeneration = clearId; }
        const appliedAdditions = new Map(additions), appliedAcks = new Set(acknowledgements), appliedClear = clearEpoch;
        let discarded = 0;
        for (const [id, ev] of appliedAdditions) {
          const epoch = additionGenerations.get(id);
          if (epoch !== nextGeneration && !(epoch === null && nextGeneration === '')) { discarded++; continue; }
          if (!entries.has(id)) { entries.set(id, ev); pending.add(id); }
        }
        generation = nextGeneration;
        for (const id of appliedAcks) pending.delete(id);
        const next = bounded([...entries.values()].sort((a, b) => a.t - b.t), pending);
        // Keep receipts only while a checkpoint can replay, plus the current live clear.
        const clearReceipts = [...new Set([...batches.map(b => b.value.clear), clearRequested ? clearId : null])].filter(id => typeof id === 'string' && cleared.has(id));
        return { state: { journal: next.journal, outbox: next.outbox, recovered: batches.map(b => b.key), cleared: clearReceipts, generation: nextGeneration },
          next, batches, appliedAdditions, appliedAcks, appliedClear, discarded };
        });
        const { state, next, batches, appliedAdditions, appliedAcks, appliedClear, discarded } = committed;
        // An event, ack, or clear may arrive while the IDB transaction commits. Remove only the applied deltas.
        for (const [id, ev] of appliedAdditions) if (additions.get(id) === ev) { additions.delete(id); additionGenerations.delete(id); }
        for (const id of appliedAcks) acknowledgements.delete(id);
        if (appliedClear === clearEpoch) {
          const merged = new Map(next.journal.map(e => [e.id, e]));
          for (const [id, ev] of additions) merged.set(id, ev);
          journal = [...merged.values()];
          outbox = [...new Set([...next.outbox, ...additions.keys()])].filter(id => !acknowledgements.has(id));
          clearRequested = false;
          clearedPending += discarded;
          boundMemory();
        }
        if (appliedClear === clearEpoch) lost += next.droppedIds.length;
        hydrated = true; hydrationState = 'ready'; storageStatus = 'saved';
        write(STATE, state); // best-effort mirror; failure cannot undo the authoritative IndexedDB commit
        try { store.removeItem(JOURNAL); store.removeItem(OUTBOX); } catch (e) { /* obsolete migration copies */ }
        for (const { key } of batches) { try { store.removeItem(key); } catch (e) { /* receipt prevents replay until cleanup succeeds */ } }
        if (!additions.size && !acknowledgements.size && !clearRequested && persistTimer) { clearTimeout(persistTimer); persistTimer = 0; }
        schedule();
        return true;
      });
    } catch (e) {
      initialObservation = false;
      const cached = database; database = null;
      if (cached) cached.then(db => db.close(), () => {});
      storageStatus = e && e.name === 'QuotaExceededError' ? 'storage-full' : 'storage-error'; return false;
    }
  }
  /** Startup and retries share the exact same locked recovery/commit path.
   * Failure never installs the pre-recovery database or mirror snapshot in memory. */
  async function attemptPersistence() {
    const starting = !hydrated;
    if (starting) { startupAttempts++; hydrationState = 'pending'; }
    try { return await commit(); }
    finally {
      if (starting) startupAttempts--;
      if (!hydrated) hydrationState = startupAttempts ? 'pending' : 'failed';
      if (hydrationState !== 'pending') {
        const waiting = [...hydrationWaiters]; hydrationWaiters.clear();
        waiting.forEach(run => run());
      }
    }
  }
  const startPersistence = () => (currentAttempt = attemptPersistence());
  async function persist() {
    if (!active) return false;
    await readiness;
    return startPersistence();
  }
  // one write per burst, not per event: the engine's boot snapshot records up to 300 events in one loop, and serializing a
  // journal near its cap each time would stall the page. Delivery reads memory, so it does not wait for the write.
  let persistTimer = 0;
  const persistSoon = () => { if (active && !persistTimer) persistTimer = setTimeout(() => { persistTimer = 0; persist(); }, 50); };
  const persistNow = () => { if (persistTimer) { clearTimeout(persistTimer); persistTimer = 0; } return persist(); };
  if (active) window.addEventListener('pagehide', () => { checkpoint(); persistNow(); });

  function record(kind, data) {
    if (!active || typeof kind !== 'string') return null;
    if (kind === 'search' && !searchesOn()) return null;   // the opt-out also covers searches recorded through window.MBLOG
    const ev = { v: V, id: uid(), t: Date.now(), brain: brainId(), title: brainTitle(), host: location.host, path: location.pathname, engine: engine(), kind: kind.slice(0, 24), data: sanitize(data) };
    if (bytes(ev) + 2 > MAX_BYTES) { rejected++; return null; }
    journal.push(ev); outbox.push(ev.id); additions.set(ev.id, ev); additionGenerations.set(ev.id, generation); persistSoon();
    listeners.forEach(f => { try { f(ev); } catch (e) { /* a listener must not break logging */ } });
    schedule();
    return ev;
  }
  // plain data only: strings capped, numbers finite, arrays and objects to a small depth
  function sanitize(x, depth = 0) {
    if (x == null) return null;
    if (typeof x === 'string') return x.slice(0, 2000);
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (typeof x === 'boolean') return x;
    if (depth >= 4) return null;
    if (Array.isArray(x)) return x.slice(0, 600).map(v => sanitize(v, depth + 1));
    if (typeof x === 'object') { const o = {}; for (const k of Object.keys(x).slice(0, 40)) o[k.slice(0, 40)] = sanitize(x[k], depth + 1); return o; }
    return null;
  }

  // ---------- transport: the isolated ledger popup or explicitly opted-in sink iframe ----------
  let frame = null, popup = null, port = null, ready = false, timer = 0, inflight = null, sends = 0, status = store ? (sinkOrigin && !self ? 'idle' : 'local') : 'no-storage';
  function schedule() { if (!active || !sinkOrigin || !store || timer) return; timer = setTimeout(flush, 400); }
  function ensureFrame() {
    if (!active || frame || !cfg.frame || !sinkOrigin) return;
    frame = document.createElement('iframe'); frame.src = sinkOrigin + '/sink.html'; frame.title = 'MindBlown Log sink'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    frame.addEventListener('error', () => { status = 'unreachable'; });
    (document.body || document.documentElement).appendChild(frame);
    status = 'connecting';
    setTimeout(() => { if (!ready) status = 'unreachable'; }, 6000);
  }
  function reconnectFrame() {
    if (!cfg.frame) return;
    if (frame) frame.remove();
    frame = null;
    ensureFrame(); // A fresh frame sends ready again; unacknowledged ids remain in outbox.
  }
  function flush() {
    timer = 0;
    if (!active || !hydrated) return;
    if (!outbox.length || !sinkOrigin || self) return;
    if (!port) { ensureFrame(); return; }
    if (!ready || inflight) return;
    const byId = new Map(journal.map(e => [e.id, e]));
    const batch = outbox.slice(0, BATCH).map(id => byId.get(id)).filter(Boolean);
    if (!batch.length) { outbox = []; persist(); return; }
    const token = ++sends; inflight = { token, ids: batch.map(e => e.id) };
    try { port.postMessage({ mblog: 'push', v: V, events: batch }, sinkOrigin); } catch (e) { inflight = null; port = null; ready = false; status = 'unreachable'; }
    setTimeout(() => { if (inflight && inflight.token === token) { inflight = null; status = 'unreachable'; } }, 8000);   // only this batch's timeout clears it
  }
  window.addEventListener('message', e => {
    if (!active || !sinkOrigin || !e.source || (e.source !== popup && !(cfg.frame && frame && e.source === frame.contentWindow)) || e.origin !== sinkOrigin || !e.data || typeof e.data !== 'object') return;
    if (e.data.mblog === 'ready') { if (port && port !== e.source) return; port = e.source; ready = true; status = 'connected'; flush(); }
    else if (e.data.mblog === 'ack' && Array.isArray(e.data.ids)) {
      if (e.source !== port || !inflight) return;
      const expected = new Set(inflight.ids);
      inflight = null;
      if (e.data.saved === false) { status = 'log-full'; return; }   // the Log Brain could not save: the outbox keeps everything, try again another time
      const got = new Set(e.data.ids.filter(x => expected.has(x))); outbox = outbox.filter(id => !got.has(id)); got.forEach(id => acknowledgements.add(id)); persistNow();
      if (outbox.length) schedule(); else status = 'connected';
    }
  });
  // Reserve a fresh same-origin blank synchronously so popup blocking can be detected. Sever and verify its opener
  // before any remote document runs; noopener on window.open itself returns null even when successful.
  // The ready handshake uses explicit messages, never window.opener. A remote isolated window cannot reliably be
  // navigated again by its former opener, so timeout exposes a user-clicked link rather than pretending fallback worked.
  function offerHandoff() {
    if (document.getElementById('mblog-handoff-retry')) return;
    const note = document.createElement('div'); note.id = 'mblog-handoff-retry'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
    note.style.cssText = 'position:fixed;z-index:10000;left:12px;bottom:12px;max-width:min(420px,calc(100vw - 48px));padding:12px;border:1px solid #6f7b99;border-radius:8px;background:#101522;color:#eee;font:13px/1.4 sans-serif';
    const text = document.createElement('span');
    text.textContent = 'The Log Brain did not connect. Your journal remains here. You can send it by link; this may resend older entries. ';
    const a = document.createElement('a'); a.textContent = 'Send by link'; a.href = handoffUrl(true); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = '#9ef0e8';
    a.addEventListener('click', e => {
      if (hydrationState === 'pending') {
        e.preventDefault(); a.removeAttribute('href'); text.textContent = 'Recovering your journal. Please wait before sending it. ';
        afterHydration(() => {
          if (!note.isConnected) return;
          a.href = handoffUrl(true); text.textContent = 'Recovery finished. You can now send the unacknowledged entries by link. ';
        });
        return;
      }
      a.href = handoffUrl(true); status = 'handoff-unconfirmed';
      text.textContent = 'Sent by link (unconfirmed). Your journal and unacknowledged entries remain here. ';
    });
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss';
    close.style.cssText = 'margin-left:12px;padding:4px 8px;border:1px solid #6f7b99;border-radius:4px;background:#202a3c;color:#fff;font:inherit;cursor:pointer';
    close.addEventListener('click', () => note.remove());
    note.append(text, a, close); document.body.appendChild(note);
  }
  function open() {
    if (!active || !sinkOrigin) return false;
    let w;
    try {
      w = window.open('about:blank', '_blank');
      if (!w) return false;
      w.opener = null;
      if (w.opener !== null) throw new Error('Could not isolate Log window');
    } catch (e) { try { if (w) w.close(); } catch (_) {} return false; }
    popup = w; port = null; ready = false; inflight = null; status = 'connecting';
    try {
      w.location.replace(hydrationState === 'failed' ? handoffUrl() : sinkOrigin + '/ledger.html');
    } catch (e) { popup = null; try { w.close(); } catch (_) {} reconnectFrame(); return false; }
    if (hydrationState === 'failed') { status = 'handoff-unconfirmed'; return true; }
    const started = Date.now();
    const hello = () => {
      if (popup !== w || ready) return;
      if (w.closed || Date.now() - started >= 8000) {
        popup = null; port = null; ready = false; inflight = null; status = 'unreachable';
        try { w.close(); } catch (e) {}
        reconnectFrame();
        afterHydration(() => {
          if (!popup && !ready) offerHandoff();
        });
        return;
      }
      try { w.postMessage({ mblog: 'hello', v: V }, sinkOrigin); } catch (e) {}
      setTimeout(hello, 200);
    };
    setTimeout(hello, 0);
    return true;
  }

  // ---------- handoff and export ----------
  const b64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // the whole journal when the fragment can hold it (browsers take URLs of a few MB; the journal is capped at 900 KB); past
  // that the newest events that fit go over and `omitted` says how many older ones need MBLOG.exportJson() instead
  const MAX_FRAGMENT = Number.isFinite(Number(cfg.fragment)) && Number(cfg.fragment) >= 128 ? Number(cfg.fragment) : 1500 * 1024;
  const handoffUrl = (onlyWaiting = false) => {
    const snapshot = exportSnapshot(), partial = snapshot.partial ? { partial: true } : {};
    if (onlyWaiting && !snapshot.partial) { const waiting = new Set(outbox); snapshot.events = snapshot.events.filter(e => waiting.has(e.id)); }
    if (!sinkOrigin) return null;
    const head = sinkOrigin + '/ledger.html#import=';
    let events = snapshot.events, omitted = 0, frag = b64url(JSON.stringify({ mblog: V, events, ...partial }));
    while (frag.length > MAX_FRAGMENT && events.length) {
      events = events.slice(Math.ceil(events.length / 4)); omitted = snapshot.events.length - events.length;
      frag = b64url(JSON.stringify({ mblog: V, events, omitted, ...partial }));
    }
    return head + frag;
  };
  const exportJson = () => JSON.stringify({ mblog: V, exported: new Date().toISOString(), host: location.host, ...exportSnapshot() }, null, 1);
  function downloadJson() {
    const json = exportJson(); // Check readiness/inactive mode before creating any browser resources.
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = hydrationState === 'failed' ? 'mindblown-log-partial.json' : 'mindblown-log.json';
    (document.body || document.documentElement).appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- what every renderer reports ----------
  const page = () => location.pathname.split('/').pop() || 'index.html';
  const titleOf = id => { const p = (D().pages || []).find(x => x.id === id); return p ? p.title : id; };
  let lastSel = null;
  const trail = () => {
    const m = /[#&]n=([^&]+)/.exec(location.hash); if (!m) return;
    let id; try { id = decodeURIComponent(m[1]); } catch (e) { return; }
    if (id === lastSel) return; lastSel = id; record('select', { id, title: titleOf(id), page: page() });
  };
  // A short notice under the search box each time it is focused while empty: what is kept, where, and a one-tap switch.
  // Shown on phones and desktops alike (the phone options sheet has no room for it); hidden as soon as typing starts.
  function searchNotice(q) {
    const tip = document.createElement('div'); tip.className = 'mblog-search-note'; tip.id = 'mblog-search-note'; tip.setAttribute('role', 'note'); tip.hidden = true;
    tip.style.cssText = 'position:fixed;z-index:60;max-width:min(420px,calc(100vw - 24px));padding:6px 10px;border-radius:8px;background:rgba(10,14,26,.94);border:1px solid rgba(255,255,255,.12);color:var(--text-2,#a7b2cc);font:12px/1.35 Satoshi,system-ui,sans-serif;display:none;gap:8px;align-items:center';
    const msg = document.createElement('span'), btn = document.createElement('button');
    btn.type = 'button'; btn.style.cssText = 'flex:none;background:none;border:1px solid rgba(255,255,255,.2);border-radius:6px;color:var(--text-1,#e8ecf6);font:inherit;padding:2px 8px;cursor:pointer';
    tip.append(msg, btn); q.insertAdjacentElement('afterend', tip);   // next in tab order after the search box
    const paint = () => {
      const on = searchesOn();
      // the switch is for searches only; the rest of what the Log keeps is named so nobody reads 'off' as 'nothing saved'
      msg.textContent = on ? 'Your searches, visits and the neurons you open or route through, including ones you build, are saved in this browser for the Log Brain.'
        : cfg.searches === false ? 'Searches are not saved on this site; any saved earlier stay until the log is cleared. Visits and the neurons you open or route through, including ones you build, are saved in this browser for the Log Brain.'
        : 'Searches are not being saved. Visits and the neurons you open or route through, including ones you build, still are; earlier searches stay until the log is cleared.';
      btn.hidden = cfg.searches === false;
      if (!searchKept) msg.textContent += ' This choice applies to this page only and ends when you reload or leave it.';
      btn.textContent = on ? 'Turn off searches' : 'Turn on searches';
      btn.setAttribute('aria-label', on ? 'Stop saving searches in this browser' : 'Save searches in this browser');
      const sw = document.getElementById('mblog-searches'); if (sw) sw.checked = on;
    };
    // fixed, then corrected by what actually landed, in case an ancestor (transform, filter) becomes the containing block
    const place = () => { const r = q.getBoundingClientRect(), x = Math.max(12, r.left), y = r.bottom + 6; tip.style.left = x + 'px'; tip.style.top = y + 'px';
      const t = tip.getBoundingClientRect(); if (Math.abs(t.left - x) > 1 || Math.abs(t.top - y) > 1) { tip.style.left = (2 * x - t.left) + 'px'; tip.style.top = (2 * y - t.top) + 'px'; } };
    const show = () => { if (q.value.trim()) return; paint(); tip.hidden = false; tip.style.display = 'flex'; place(); };
    const hide = () => { tip.hidden = true; tip.style.display = 'none'; };
    q.setAttribute('aria-describedby', [q.getAttribute('aria-describedby'), tip.id].filter(Boolean).join(' '));
    q.addEventListener('focus', show); q.addEventListener('input', hide); q.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== btn) hide(); }, 120));
    btn.addEventListener('pointerdown', e => e.preventDefault());   // keep focus in the search box so the tap is not lost to blur
    btn.addEventListener('click', () => { setSearches(!searchesOn()); paint(); q.focus(); });
    btn.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== q) hide(); }, 120));
    window.addEventListener('resize', () => { if (!tip.hidden) place(); });
    window.addEventListener('storage', e => { if (e.key === SEARCH_OFF) { searchOff = null; searchKept = true; paint(); } });
    searchPrefListeners.add(paint);
  }
  // desktop: the same choice as a switch beside the Log Brain link in the Lobes panel
  function searchSwitch(host) {
    if (cfg.searches === false) return;   // the owner has switched search logging off; nothing to choose
    const lab = document.createElement('label'); lab.className = 'switch mblog-searches';
    const box = document.createElement('input'); box.type = 'checkbox'; box.id = 'mblog-searches'; box.checked = searchesOn();
    const span = document.createElement('span'), note = () => { span.textContent = searchKept ? 'Save my searches' : 'Save my searches (this page only)'; };
    note(); searchPrefListeners.add(() => { box.checked = searchesOn(); note(); });
    lab.title = 'Searches are kept only in this browser, for the Log Brain';
    lab.append(box, span); host.appendChild(lab);
    box.addEventListener('change', () => setSearches(box.checked));
    window.addEventListener('storage', e => { if (e.key === SEARCH_OFF) { searchOff = null; searchKept = true; box.checked = searchesOn(); note(); } });
  }
  function boot() {
    if (!active) return;
    record('visit', { page: page(), layout: (window.MINDBLOWN_OPTIONS || {}).layout || null, neurons: (D().pages || []).length || null });
    const panel = document.getElementById('panel-body') || document.getElementById('panel');
    if (panel && window.MutationObserver) new MutationObserver(() => setTimeout(trail, 0)).observe(panel, { childList: true, subtree: false });
    window.addEventListener('hashchange', trail);
    const q = document.getElementById('q');
    if (q) q.addEventListener('change', () => { const v = q.value.trim(); if (v.length > 1) record('search', { q: v.slice(0, 80), page: page() }); });
    if (q) searchNotice(q);
    link();
    schedule();
  }
  // the Neural engine announces what it learns as DOM events (dynamics.js): potentiation, routes, pruning, forgetting, and a
  // snapshot of what it already knew when the page opened
  function neural() {
    const ed = (e) => e.detail || {};
    window.addEventListener('mbn:learn', e => { const d = ed(e); record('learn', { a: d.a, b: d.b, at: titleOf(d.a), bt: titleOf(d.b), w: d.w, n: d.n, uses: d.uses, bonus: d.bonus, amount: d.amount }); });
    window.addEventListener('mbn:route', e => { const d = ed(e); record('route', { from: d.from, to: d.to, ft: titleOf(d.from), tt: titleOf(d.to), hops: d.hops, path: d.path }); });
    window.addEventListener('mbn:prune', e => { const d = ed(e); record('prune', { share: d.share, pruned: d.pruned, links: d.links }); });
    window.addEventListener('mbn:forget', e => record('forget', { edges: ed(e).edges }));
    // the snapshot repeats on every page open: record only edges that are new or changed since this brain's last snapshot.
    // Signatures belong to one journal generation, so a clear (from any tab) invalidates them and the next snapshot records
    // everything again; an edge the journal refused, or a save that failed, is not marked as seen, so it is offered again.
    window.addEventListener('mbn:snapshot', e => { const arrived = clearEpoch; afterHydration(() => {
      if (clearEpoch !== arrived) return;   // a clear landed while this waited for hydration: the next open records it afresh
      const d = ed(e), k = SNAP + brainId(), g = generation || '', saved = read(k, null);
      const seen = saved && saved.g === g && saved.s && typeof saved.s === 'object' ? saved.s : {}, kept = {}, fresh = [];
      for (const x of (d.edges || []).slice(0, 300)) {
        const id = x.a + '\u0001' + x.b, sig = `${x.w}|${x.n}|${x.uses}`;
        if (seen[id] === sig) { kept[id] = sig; continue; }
        const ev = record('learn', { a: x.a, b: x.b, at: titleOf(x.a), bt: titleOf(x.b), w: x.w, n: x.n, uses: x.uses, snapshot: true });
        if (ev) fresh.push([id, sig, ev.id]);
      }
      // a signature is kept only once its event is saved and still in the journal, in the same generation, with no clear in between
      const epoch = clearEpoch;
      persistNow().then(ok => {
        if (!ok || clearEpoch !== epoch || (generation || '') !== g) return;
        const inJournal = new Set(journal.map(x => x.id));
        for (const [id, sig, evId] of fresh) if (inJournal.has(evId)) kept[id] = sig;
        write(k, { g, s: kept });
      }).catch(() => { /* not saved: offer them again */ });
    }); });
  }
  // where the log goes and how much is waiting: a button in the right rail's Brains group when the renderer has one
  // (Neural engine: MINDBLOWN_RAIL), else a quiet line in the lobes panel (canonical renderer)
  function link() {
    if (!sinkOrigin) return;
    const rail = window.MINDBLOWN_RAIL;
    const label = () => `Log Brain · ${journal.length} logged here` + (outbox.length ? ` · ${outbox.length} to hand over` : ' · all handed over') +
      (hydrationState === 'pending' ? ' · loading and recovering journal' : hydrationState === 'failed' ? ' · storage unavailable: partial export only' : storageStatus !== 'saved' ? ` · ${storageStatus}: export before leaving` : '') +
      (lost ? ` · ${lost} dropped at retention limits` : '') + (rejected ? ` · ${rejected} oversized events rejected` : '') +
      (recoveryWarning ? ' · an earlier recovery checkpoint failed; inspect/export the journal' : '');
    if (rail && typeof rail.brainButton === 'function') {
      const b = rail.brainButton({ id: 'mblog-open', label: 'Open the Log Brain', title: label(), icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>' });
      b.className += ' mblog-link';
      const paint = () => { b.title = label(); }; listeners.add(paint); setInterval(paint, 2500);
      // popups blocked: a second window.open is blocked too, so the handoff goes in this tab (the journal is saved; Back returns here)
      b.addEventListener('click', async () => {
        if (open()) return;
        const saved = await persistNow();
        // A successful snapshot commit may leave newer deltas in memory. Do not rely on a fallible unload checkpoint.
        if (saved && !additions.size && !acknowledgements.size && !clearRequested) location.assign(handoffUrl(true));
        else {
          paint();
          try {
            downloadJson();
            const scope = hydrated ? 'The export includes this tab’s complete current journal.' : 'The partial export contains only this page’s new events, not the stored history.';
            window.alert('Some log changes are still unsaved. A JSON export was requested; confirm the download before leaving. ' + scope + ' This tab will stay open.');
          }
          catch (e) { window.alert('The log is still loading or the export failed. This tab will stay open. Retry the JSON export before leaving.'); }
        }
      });
      return;
    }
    const host = document.querySelector('#lobes .switches') || document.getElementById('lobes'); if (!host) return;
    const a = document.createElement('a'); a.className = 'mblog-link'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.style.cssText = 'display:block;margin:8px 0 0;font-size:11px;color:var(--text-3,#6f7b99);text-decoration:none';
    let painted; const paint = () => {
      const signature = hydrationState + ':' + outbox.length + ':' + (journal.length ? journal[journal.length - 1].id : '');
      if (painted !== signature) {
        painted = signature;
        if (hydrated || hydrationState === 'failed') a.href = handoffUrl(true); else a.removeAttribute('href');
      }
      a.textContent = label() + ' ↗';
    };
    a.addEventListener('click', e => { if ((!hydrated && hydrationState !== 'failed') || open()) e.preventDefault(); else a.href = handoffUrl(true); });
    paint(); listeners.add(paint); setInterval(paint, 2500); host.appendChild(a);
    searchSwitch(host);
    readiness.then(paint);
  }
  // the engine's listeners attach at once: dynamics.js announces its boot snapshot on the next tick, before DOMContentLoaded work
  if (active && window.MBN) neural();
  if (active) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  }

  const readiness = active ? startPersistence() : Promise.resolve(false);
  if (!currentAttempt) currentAttempt = readiness;
  window.MBLOG = Object.freeze({
    v: V, record, searches: () => searchesOn(), setSearches: on => setSearches(!!on), handoffUrl, exportJson, downloadJson, onRecord: f => { listeners.add(f); return () => listeners.delete(f); },
    status: () => ({ status: storageStatus === 'saved' ? status : storageStatus, storageStatus, hydrated, hydrationState, recoveryWarning, unsaved: !!(additions.size || acknowledgements.size || clearRequested), journal: journal.length, waiting: outbox.length, lost, rejected, clearedPending, sink: sinkOrigin, brain: brainId(), engine: engine() }),
    ready: () => hydrated ? Promise.resolve(true) : currentAttempt,
    journal: () => { requireHydrated(); return journal.slice(); }, open, flush: () => { if (outbox.length) { ready ? flush() : ensureFrame(); } }, save: persistNow,
    clear: () => { if (!active) return Promise.resolve(false); journal = []; outbox = []; additions.clear(); additionGenerations.clear(); acknowledgements.clear(); lost = 0; clearedPending = 0; clearRequested = true; recoveryWarning = null; forgetLocal(k => k === RECOVERY_NOTICE || k.startsWith(SNAP)); clearId = uid(); generation = clearId; clearEpoch++; const saved = persistNow(); listeners.forEach(f => { try { f(null); } catch (e) { /* ignore */ } }); return saved; }
  });
})();
