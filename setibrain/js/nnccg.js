/* MindBlown NNCCG — Neural Network Connection Charts and Graphs (starter set).
   Ported from mindblown@ae299e8/nnccg.js. The engine supplies live lobe visibility and its tools-column launcher.
   Charts open from Charts, C or &chart=<id>. Built-in definitions are memory-only; no browser-storage APIs are required.
   The factual dataset (window.MINDBLOWN) is read, never written. Every dataset string reaches the DOM through textContent. */
(() => {
  'use strict';
  const D = window.MINDBLOWN, R = window.MINDBLOWN_RENDERER;
  if (!D || !R || !window.d3 || !document.getElementById('lobes') || window.MINDBLOWN_NNCCG) return;
  const ENGINE = R.engine === 'neural' ? 'neural' : 'canonical';

  // ---------- model adapters ----------
  // Both return { lobes[{id,name,color,on}], pages[{id,title,lobe,parent}], links[{s,t,w}] }. The canonical adapter reads the
  // static dataset; the Neural adapter also takes lobes the engine adds at runtime (e.g. mice-built lobes) from the renderer.
  const baseLobes = () => (D.lobes || []).map(l => ({ id: String(l.id), name: String(l.name || l.id), color: String(l.color || '#8aa'), on: !l.hidden }));
  const livelobes = () => { try { const v = R.lobes && R.lobes(); return Array.isArray(v) && v.length ? v : null; } catch { return null; } };
  const adapters = {
    canonical() {
      const on = new Map((livelobes() || baseLobes()).map(l => [l.id, l.on]));
      return { lobes: baseLobes().map(l => ({ ...l, on: on.has(l.id) ? !!on.get(l.id) : l.on })), pages: D.pages || [], links: D.links || [] };
    },
    neural() {
      const live = livelobes(), base = baseLobes(), byId = new Map(base.map(l => [l.id, l]));
      const lobes = live ? live.map(l => ({ ...(byId.get(l.id) || {}), id: String(l.id), name: String(l.name || l.id), color: String(l.color || '#8aa'), on: !!l.on })) : base;
      return { lobes, pages: D.pages || [], links: D.links || [] };
    }
  };
  const model = () => adapters[ENGINE]();

  // ---------- measure providers ----------
  // 'basic' is built in. 'connectome' (MBN.connectome) is detected so later chart types can ask for it; phase 0 charts use basic.
  const providers = { basic: true, connectome: !!(window.MBN && window.MBN.connectome) };

  // ---------- chart types ----------
  const types = Object.create(null); // Stored type names must never resolve inherited Object methods.
  types['lobe-matrix'] = {
    name: 'Lobe wiring matrix',
    defaults: { measure: 'count', includeSubNeurons: true },
    compute(m, def) {
      const opt = { ...this.defaults, ...(def.options || {}) };
      const pageById = new Map(m.pages.map(p => [p.id, p]));
      const lobeOn = new Map(m.lobes.map(l => [l.id, l.on]));
      const pageOn = p => p && lobeOn.get(p.lobe) && (!p.parent || !pageById.has(p.parent) || lobeOn.get(pageById.get(p.parent).lobe)) && (opt.includeSubNeurons || !p.parent);
      const lobes = m.lobes.filter(l => l.on && m.pages.some(p => p.lobe === l.id && pageOn(p)));
      const idx = new Map(lobes.map((l, i) => [l.id, i]));
      const n = lobes.length, cells = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ v: 0, links: 0, hubs: new Map() })));
      let total = 0;
      for (const l of m.links) {
        const a = pageById.get(l.s), b = pageById.get(l.t);
        if (!pageOn(a) || !pageOn(b) || a === b) continue;
        const i = idx.get(a.lobe), j = idx.get(b.lobe); if (i == null || j == null) continue;
        const w = opt.measure === 'weight' ? (Number.isFinite(+l.w) && +l.w > 0 ? +l.w : 1) : 1;
        for (const [x, y] of i === j ? [[i, j]] : [[i, j], [j, i]]) {
          const c = cells[x][y]; c.v += w; c.links++;
          for (const p of [a, b]) c.hubs.set(p.id, (c.hubs.get(p.id) || 0) + 1);
        }
        total++;
      }
      const titleOf = id => { const p = pageById.get(id); return String((p && p.title) || id); };
      for (const row of cells) for (const c of row) c.top = [...c.hubs].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([id, k]) => ({ id, title: titleOf(id), k }));
      const max = d3.max(cells.flat(), c => c.v) || 0;
      let best = null; cells.forEach((row, i) => row.forEach((c, j) => { if (i < j && (!best || c.v > best.v)) best = { i, j, v: c.v }; }));
      return { lobes, cells, max, total, measure: opt.measure, best };
    },
    summary(r) {
      if (!r.lobes.length) return 'Lobe wiring matrix: no visible lobes.';
      const b = r.best && r.best.v ? `, strongest pair ${r.lobes[r.best.i].name}–${r.lobes[r.best.j].name} ${r.best.v}` : '';
      return `Lobe wiring matrix: ${r.lobes.length} lobes, ${r.total} links${b}`;
    },
    draw(cv, r, hit) {
      const dpr = window.devicePixelRatio || 1, n = r.lobes.length;
      const labelW = Math.min(150, Math.max(60, ...r.lobes.map(l => measure(l.name) + 14)));
      const tail = Math.ceil(Math.cos(Math.PI / 2.6) * (labelW - 22)) + 6;   // the rotated column labels lean right past the last column
      const avail = cv.parentElement.clientWidth || 320, cell = n ? Math.max(14, Math.min(42, Math.floor((avail - labelW - tail) / n))) : 0;
      const W = n ? Math.max(avail, labelW + n * cell + tail) : avail;
      const H = n ? labelW + n * cell + 8 : 60;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      g.font = '11px Satoshi, system-ui, sans-serif'; g.textBaseline = 'middle';
      if (!n) { g.fillStyle = '#9fb0c8'; g.fillText('No visible lobes. Turn a lobe on in the Lobes panel.', 8, 30); hit.length = 0; return; }
      const x0 = labelW, y0 = labelW, scale = v => r.max ? Math.sqrt(v / r.max) : 0;
      hit.length = 0;
      r.lobes.forEach((l, i) => {
        g.fillStyle = l.color; g.fillRect(x0 - 10, y0 + i * cell + cell / 2 - 3, 6, 6);
        g.fillStyle = '#c9d4e6'; g.textAlign = 'right'; g.fillText(clip(g, l.name, labelW - 18), x0 - 14, y0 + i * cell + cell / 2);
        g.save(); g.translate(x0 + i * cell + cell / 2, y0 - 14); g.rotate(-Math.PI / 2.6); g.textAlign = 'left'; g.fillText(clip(g, l.name, labelW - 22), 0, 0); g.restore();
        g.fillStyle = l.color; g.fillRect(x0 + i * cell + cell / 2 - 3, y0 - 10, 6, 6);
      });
      r.cells.forEach((row, i) => row.forEach((c, j) => {
        const x = x0 + j * cell, y = y0 + i * cell, s = scale(c.v);
        g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        if (c.v) { g.fillStyle = rgba(i === j ? r.lobes[i].color : '#7dd3c0', 0.18 + 0.82 * s); g.fillRect(x + 1, y + 1, cell - 2, cell - 2); }
        if (cell >= 24 && c.v) { g.fillStyle = s > 0.55 ? '#0a0e19' : '#e6edf7'; g.textAlign = 'center'; g.fillText(String(c.v), x + cell / 2, y + cell / 2); }
        hit.push({ x, y, w: cell, h: cell, i, j, c });
      }));
    }
  };

  // Unique-neighbour degree, not link-record count. Isolated visible pages have degree zero.
  function graph(m) {
    const byId = new Map(m.pages.map(p => [p.id, p])), on = new Set(m.lobes.filter(l => l.on).map(l => l.id));
    const nodes = m.pages.filter(p => on.has(p.lobe) && (!byId.has(p.parent) || on.has(byId.get(p.parent).lobe)));
    const adjacent = new Map(nodes.map(p => [p.id, new Set()]));
    for (const e of m.links) if (e.s !== e.t && adjacent.has(e.s) && adjacent.has(e.t)) {
      adjacent.get(e.s).add(e.t); adjacent.get(e.t).add(e.s);
    }
    return nodes.map(p => ({ ...p, degree: adjacent.get(p.id).size }));
  }
  function bars(cv, r, hit) {
    const dpr = window.devicePixelRatio || 1, W = cv.parentElement.clientWidth || 320;
    const H = Math.max(64, r.rows.length * 29 + 24), left = Math.min(155, W * .48), width = Math.max(20, W - left - 38);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = '11px Satoshi, system-ui, sans-serif'; g.textBaseline = 'middle'; hit.length = 0;
    const max = Math.max(1, ...r.rows.map(row => row.value));
    if (!r.rows.length) { g.fillStyle = '#a7b2cc'; g.fillText('No visible data for this chart.', 8, 30); }
    r.rows.forEach((row, i) => {
      const y = 10 + i * 29, w = width * row.value / max;
      g.textAlign = 'right'; g.fillStyle = '#c9d4e6'; g.fillText(clip(g, row.label, left - 12), left - 8, y + 10);
      g.fillStyle = row.color || '#7dd3c0'; g.fillRect(left, y, w, 20);
      if (row.secondary) { g.fillStyle = '#d8b4fe'; g.fillRect(left + w * (row.value - row.secondary) / row.value, y, w * row.secondary / row.value, 20); }
      g.textAlign = 'left'; g.fillStyle = '#c9d4e6'; g.fillText(String(row.value), left + w + 5, y + 10);
      hit.push({ x: 0, y, w: W, h: 24, label: row.detail || row.label, value: row.value, c: { top: row.id ? [{ id: row.id, title: row.label }] : [] } });
    });
  }
  types['degree-hist'] = {
    name: 'Degree distribution', draw: bars,
    compute(m) {
      const nodes = graph(m), max = Math.max(0, ...nodes.map(p => p.degree)), step = Math.max(1, Math.ceil((max + 1) / 12)), bins = new Map();
      for (const p of nodes) {
        const low = Math.floor(p.degree / step) * step;
        if (!bins.has(low)) bins.set(low, { low, label: step === 1 ? String(low) : `${low}–${low + step - 1}`, value: 0, secondary: 0 });
        const row = bins.get(low); row.value++; if (p.parent) row.secondary++;
      }
      const rows = [...bins.values()].sort((a, b) => a.low - b.low);
      rows.forEach(r => { r.detail = `Degree ${r.label}: ${r.value - r.secondary} neurons, ${r.secondary} sub-neurons`; });
      return { rows, total: nodes.length, children: nodes.filter(p => p.parent).length };
    },
    summary: r => `${r.total} visible pages (${r.children} sub-neurons). Degree = distinct visible neighbours; purple = sub-neurons.`
  };
  types['hub-rank'] = {
    name: 'Hub ranking', draw: bars,
    compute(m) {
      const colors = new Map(m.lobes.map(l => [l.id, l.color]));
      const nodes = graph(m).sort((a, b) => b.degree - a.degree || String(a.id).localeCompare(String(b.id)));
      return { rows: nodes.slice(0, 20).map(p => ({ id: p.id, label: String(p.title || p.id), value: p.degree, color: colors.get(p.lobe) })), total: nodes.length };
    },
    summary: r => `Top ${r.rows.length} of ${r.total} visible pages by distinct neighbours. Select a bar or use the neuron list.`
  };
  types['source-mix'] = {
    name: 'Source mix', draw: bars,
    compute(m) {
      const visible = new Set(graph(m).map(p => p.id)), grouped = new Map(), seen = new Set();
      for (const s of D.sources || []) {
        if (seen.has(s.id)) continue; seen.add(s.id);
        const pages = new Set((s.pages || []).filter(id => visible.has(id)));
        for (const p of m.pages) if (visible.has(p.id) && (p.sources || []).includes(s.id)) pages.add(p.id);
        if (!pages.size) continue;
        const kind = String(s.kind || 'unknown');
        if (!grouped.has(kind)) grouped.set(kind, { label: kind, value: 0, pages: new Set() });
        const row = grouped.get(kind); row.value++; pages.forEach(id => row.pages.add(id));
      }
      const rows = [...grouped.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .map(r => ({ label: r.label, value: r.value, pages: r.pages.size, detail: `${r.label}: ${r.value} sources across ${r.pages.size} distinct pages` }));
      return { rows, total: rows.reduce((s, r) => s + r.value, 0) };
    },
    summary: r => `${r.total} unique sources cited by visible pages, grouped by kind. Counts are sources, not citation occurrences.`
  };

  // ---------- built-in registry ----------
  // The engine has no chart-definition editor or previous persisted Charts state to migrate.
  // Keep these built-ins in memory rather than introducing unsupported preview storage APIs.
  const starter = () => ['lobe-matrix', 'degree-hist', 'hub-rank', 'source-mix'].map((type, order) => ({
    id: 'nn-' + type, v: 1, name: type === 'lobe-matrix' ? 'Lobe wiring' : types[type].name, type, scope: '*', provider: 'basic',
    filters: { lobes: null }, options: { measure: 'count', includeSubNeurons: true }, order
  }));
  const defs = starter();

  // ---------- helpers ----------
  const mctx = document.createElement('canvas').getContext('2d'); mctx.font = '11px Satoshi, system-ui, sans-serif';
  const measure = s => mctx.measureText(s).width;
  const clip = (g, s, w) => { if (g.measureText(s).width <= w) return s; let t = s; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
  const rgba = (hex, a) => { const m = /^#?([\da-f]{6})$/i.exec(String(hex).trim()); if (!m) return `rgba(125,211,192,${a})`; const v = parseInt(m[1], 16); return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- drawer UI ----------
  // Charts sits in the rail's View group (desktop and the phone rail); a page without the rail keeps it in the Lobes switches plus a phone button
  const RAIL = window.MINDBLOWN_RAIL;
  const ICON_CHART = RAIL && RAIL.svg ? RAIL.svg('<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>') : '';
  let launch = RAIL && RAIL.toolButton ? RAIL.toolButton({ group: 'view-tools', id: 'nnccg-open', label: 'Charts', title: 'Connection charts and graphs (C)', icon: ICON_CHART }) : null;
  if (!launch && RAIL && RAIL.brainButton) launch = RAIL.brainButton({ id: 'nnccg-open', label: 'Charts', title: 'Connection charts and graphs (C)', icon: ICON_CHART });
  const inRail = !!launch;
  if (!launch) { launch = el('button', 'panel-action nnccg-open', 'Charts'); launch.type = 'button'; launch.id = 'nnccg-open'; launch.title = 'Connection charts and graphs (C)'; (document.querySelector('#lobes .switches') || document.getElementById('lobes')).append(launch); }
  launch.classList.add('nnccg-open'); launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', 'nnccg-drawer');

  const drawer = el('aside', 'nnccg-drawer'); drawer.id = 'nnccg-drawer'; drawer.hidden = true; drawer.setAttribute('aria-label', 'Connection charts and graphs');
  const head = el('header', 'nnccg-head');
  const htext = el('div'); htext.append(el('small', null, 'NNCCG · ' + (ENGINE === 'neural' ? 'Neural engine' : 'Canonical renderer')), el('h2', null, 'Connection charts'));
  const close = el('button', 'nnccg-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close charts');
  head.append(htext, close);
  const note = el('p', 'nnccg-note', 'Four starter charts of the loaded dataset follow visible lobes. Basic measures; built-in definitions stay in memory.');
  const chooser = el('select', 'nnccg-chooser'); chooser.setAttribute('aria-label', 'Choose chart');
  defs.forEach(d => { const o = el('option', null, d.name); o.value = d.id; chooser.append(o); });
  const mobile = el('button', 'nnccg-mobile', 'Charts'); mobile.type = 'button'; mobile.setAttribute('aria-label', 'Open connection charts');
  mobile.onclick = () => launch.click(); if (!inRail) document.body.append(mobile);   // the phone rail already carries Charts
  const list = el('div', 'nnccg-list');
  const tip = el('div', 'nnccg-tip'); tip.hidden = true; tip.setAttribute('role', 'status');
  drawer.append(head, note, chooser, list, tip); document.body.append(drawer);

  const cards = new Map();   // def.id -> { card, cv, hit, result }
  function renderCard(def) {
    const t = types[def.type];
    const card = el('section', 'nnccg-card'); card.dataset.id = def.id;
    const top = el('div', 'nnccg-card-head');
    const title = el('h3', null, def.name);
    const badge = el('span', 'nnccg-badge', def.scope === '*' ? 'All brains' : def.scope === 'network' ? 'Network' : 'This brain');
    const shot = el('button', 'nnccg-shot', 'PNG'); shot.type = 'button'; shot.title = 'Save this chart as PNG'; shot.setAttribute('aria-label', 'Save ' + def.name + ' as PNG');
    top.append(title, badge, shot); card.append(top);
    if (!t) { shot.disabled = true; card.append(el('p', 'nnccg-note', 'This chart type is unavailable on this page.')); return { card, def }; }
    const wrap = el('div', 'nnccg-canvas'); const cv = document.createElement('canvas'); cv.setAttribute('role', 'img'); wrap.append(cv); card.append(wrap);
    const sum = el('p', 'nnccg-summary'); card.append(sum);
    const details = el('details', 'nnccg-data'); details.append(el('summary', null, 'Accessible chart data'));
    const table = el('div'); details.append(table); card.append(details);
    const rec = { card, cv, hit: [], result: null, sum, def, table };
    shot.onclick = () => savePng(rec);
    cv.addEventListener('pointermove', e => hover(rec, e));
    cv.addEventListener('pointerleave', () => { tip.hidden = true; });
    cv.addEventListener('click', e => { const h = hitAt(rec, e); if (h && h.c.top[0]) R.focus(h.c.top[0].id); });
    return rec;
  }
  function hitAt(rec, e) { const b = rec.cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; return rec.hit.find(h => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) || null; }
  function hover(rec, e) {
    const h = hitAt(rec, e); if (!h || !rec.result) { tip.hidden = true; return; }
    if (h.label) tip.replaceChildren(el('strong', null, h.label), el('span', null, String(h.value)));
    else {
      const a = rec.result.lobes[h.i], b = rec.result.lobes[h.j];
      tip.replaceChildren(el('strong', null, h.i === h.j ? `${a.name} (inside)` : `${a.name} ↔ ${b.name}`), el('span', null, `${h.c.v} ${rec.result.measure === 'weight' ? 'weight' : h.c.links === 1 ? 'link' : 'links'}`));
    }
    if (h.c.top.length) { const ul = el('ul'); h.c.top.forEach(p => ul.append(el('li', null, p.title))); tip.append(ul, el('em', null, 'click to open the busiest neuron')); }
    const d = drawer.getBoundingClientRect(); tip.style.left = Math.max(0, Math.min(e.clientX - d.left + 12, d.width - 230)) + 'px'; tip.style.top = (e.clientY - d.top + drawer.scrollTop + 14) + 'px'; tip.hidden = false;
  }
  function draw(rec) {
    if (rec.card.hidden) return;
    drawChart(rec);
  }
  function drawChart(rec) {
    const t = types[rec.def.type]; if (!t) return;
    rec.result = t.compute(model(), rec.def); t.draw(rec.cv, rec.result, rec.hit);
    const s = t.summary(rec.result); rec.sum.textContent = s; rec.cv.setAttribute('aria-label', s);
    rec.table.replaceChildren();
    const rows = rec.result.rows || rec.result.cells.flatMap((row, i) => row.flatMap((c, j) => j >= i ? [{
      id: c.top[0]?.id, label: `${rec.result.lobes[i].name} / ${rec.result.lobes[j].name}${c.top[0] ? ' → ' + c.top[0].title : ''}`, value: c.v
    }] : []));
    rows.forEach(row => {
      const line = el(row.id ? 'button' : 'p', null, `${row.detail || row.label}: ${row.value}`);
      if (row.id) { line.type = 'button'; line.onclick = () => R.focus(row.id); }
      rec.table.append(line);
    });
  }
  function renderAll() {
    list.replaceChildren(); cards.clear();
    [...defs].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(def => { const rec = renderCard(def); rec.card.hidden = def.id !== chooser.value; cards.set(def.id, rec); list.append(rec.card); });
    if (!drawer.hidden) cards.forEach(draw);
  }
  function savePng(rec) {
    if (!rec.cv) return;
    // Measure the actual drawer width even for a never-opened chart, without painting a transient state.
    const drawerHidden = drawer.hidden, cardHidden = rec.card.hidden, visibility = drawer.style.visibility;
    try {
      drawer.style.visibility = 'hidden'; drawer.hidden = false; rec.card.hidden = false;
      drawChart(rec);
    } finally {
      rec.card.hidden = cardHidden; drawer.hidden = drawerHidden; drawer.style.visibility = visibility;
    }
    const out = document.createElement('canvas'); out.width = rec.cv.width; out.height = rec.cv.height + Math.round(28 * (window.devicePixelRatio || 1));
    const o = out.getContext('2d'); o.fillStyle = '#0a0e19'; o.fillRect(0, 0, out.width, out.height); o.drawImage(rec.cv, 0, 0);
    const dpr = window.devicePixelRatio || 1, brain = String(D.title || 'MindBlown');
    o.setTransform(dpr, 0, 0, dpr, 0, 0); o.font = '11px Satoshi, system-ui, sans-serif'; o.fillStyle = 'rgba(167,178,204,0.85)';
    o.fillText(`${brain} · ${rec.def.name} · ${new Date().toISOString().slice(0, 10)}`, 8, rec.cv.height / dpr + 18);
    const name = `${brain}-${rec.def.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
    out.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); lastShot = name; }, 'image/png');
  }
  let lastShot = null;

  function open(id) {
    if (id && cards.has(id)) chooser.value = id;
    cards.forEach((rec, key) => { rec.card.hidden = key !== chooser.value; });
    if (RAIL && RAIL.closeFlyout) RAIL.closeFlyout();
    drawer.hidden = false; document.body.classList.add('nnccg-on'); launch.setAttribute('aria-expanded', 'true');
    cards.forEach(draw);
    drawer.scrollTop = 0; tip.hidden = true;
    close.focus({ preventScroll: true });
  }
  function shut() { drawer.hidden = true; tip.hidden = true; document.body.classList.remove('nnccg-on'); launch.setAttribute('aria-expanded', 'false'); setHash(null); }
  launch.onclick = () => { if (drawer.hidden) { open(); setHash(chooser.value); } else shut(); };
  chooser.onchange = () => { open(chooser.value); setHash(chooser.value); chooser.focus({ preventScroll: true }); };
  close.onclick = () => { shut(); launch.focus(); };
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !drawer.hidden) {
      e.preventDefault(); e.stopImmediatePropagation(); shut();
      (window.innerWidth <= 900 && !inRail ? mobile : launch).focus({ preventScroll: true });
      return;
    }
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'c' || e.key === 'C') { e.preventDefault(); launch.click(); }
  }, true);

  // ---------- #chart=<id> ----------
  const hashChart = () => { const m = /[#&]chart=([\w-]+)/.exec(location.hash); return m ? m[1] : null; };
  function setHash(id) {
    if (!history.replaceState) return;
    let h = location.hash.replace(/[#&]chart=[\w-]+/g, '').replace(/^&/, '#'); if (h === '#') h = '';
    try { history.replaceState(null, '', id ? (h ? h + '&' : '#') + 'chart=' + id : (h || location.pathname + location.search)); } catch { /* opaque preview origin: the drawer still works */ }
  }
  const fromHash = () => { const id = hashChart(); if (id && cards.has(id)) open(id); else if (!drawer.hidden) shut(); };
  window.addEventListener('hashchange', fromHash);

  // ---------- live updates ----------
  let raf = 0; const redraw = () => { if (drawer.hidden || raf) return; raf = requestAnimationFrame(() => { raf = 0; cards.forEach(draw); }); };
  window.addEventListener('mindblown:lobes', redraw);
  window.addEventListener('resize', redraw);

  renderAll(); fromHash();

  window.MINDBLOWN_NNCCG = Object.freeze({
    engine: ENGINE, providers: { ...providers }, types: Object.keys(types),
    open: id => open(id), close: shut, isOpen: () => !drawer.hidden,
    defs: () => JSON.parse(JSON.stringify(defs)),
    result: id => { const r = cards.get(id || (defs[0] && defs[0].id)); if (!r || !types[r.def.type]) return null; const x = types[r.def.type].compute(model(), r.def); return x.rows ? JSON.parse(JSON.stringify(x)) : { lobes: x.lobes.map(l => l.id), matrix: x.cells.map(row => row.map(c => c.v)), total: x.total, max: x.max }; },
    summary: id => { const r = cards.get(id || (defs[0] && defs[0].id)); return r && r.sum ? r.sum.textContent : null; },
    savePng: id => { const r = cards.get(id || (defs[0] && defs[0].id)); if (r) savePng(r); },
    lastShot: () => lastShot
  });
})();
