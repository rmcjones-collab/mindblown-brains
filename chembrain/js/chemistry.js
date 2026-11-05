// Chemistry brain: the "Display a compound" chooser. Every compound neuron in data/chemistry-data.js is listed, grouped by
// lobe, with its formula; picking one travels to that neuron, selects it and lets the molecule unfold (app.js handles
// the zoom tween and the #n= deep link). Nothing here touches the data — it only reads window.MINDBLOWN and calls the
// renderer's public focus() hook.
(() => {
  const D = window.MINDBLOWN, sel = document.getElementById('compound-pick');
  if (!D || !sel || !Array.isArray(D.pages)) return;
  const lobeById = Object.fromEntries((D.lobes || []).map(l => [l.id, l]));
  const compounds = D.pages.filter(p => p.type === 'compound' && p.mol);
  const formula = p => (p.desc || '').split(' · ')[0];   // "C₆H₁₂O₆" — the first clause of the composition line
  const byLobe = new Map();
  for (const p of compounds) { if (!byLobe.has(p.lobe)) byLobe.set(p.lobe, []); byLobe.get(p.lobe).push(p); }
  for (const l of D.lobes || []) {
    const ps = byLobe.get(l.id); if (!ps) continue;
    const g = document.createElement('optgroup'); g.label = `${l.name} (${ps.length})`;
    ps.sort((a, b) => a.title.localeCompare(b.title)).forEach(p => {
      const o = document.createElement('option'); o.value = p.id; o.textContent = `${p.title} — ${formula(p)}`; g.appendChild(o);
    });
    sel.appendChild(g);
  }
  sel.title = `${compounds.length} compounds, grouped by lobe`;
  const go = () => {
    const id = sel.value; if (!id) return;
    const hook = window.MINDBLOWN_RENDERER;
    if (hook && typeof hook.focus === 'function') hook.focus(id);
    else location.hash = 'n=' + encodeURIComponent(id);
  };
  sel.addEventListener('change', go);
  // keep the chooser in step with whatever the reader clicked on the canvas
  const sync = () => { const cur = window.MINDBLOWN_RENDERER?.selected?.(); if (cur !== undefined && cur !== sel.value && (cur === null || compounds.some(p => p.id === cur))) sel.value = cur || ''; };
  // phones: the desktop switches panel is hidden, so the chooser moves into its own row of the bottom options bar
  const home = sel.parentElement, anchor = sel.nextSibling, mq = window.matchMedia('(max-width: 900px)');
  let row = null;
  const place = () => {
    const rows = document.querySelector('#mbar .mbar-rows');
    if (mq.matches && rows) {
      if (!row) { row = document.createElement('div'); row.className = 'mbar-row compound-row'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Display a compound'); row.style.cssText = 'padding: 2px 10px 6px; display: flex;'; }
      if (row.parentElement !== rows) rows.appendChild(row);
      if (sel.parentElement !== row) { row.appendChild(sel); sel.style.margin = '0'; sel.style.width = '100%'; sel.style.minHeight = '36px'; }
    } else if (sel.parentElement !== home) { home.insertBefore(sel, anchor); sel.style.margin = sel.style.width = sel.style.minHeight = ''; row?.remove(); }
    window.dispatchEvent(new Event('resize'));   // app.js re-measures the bar (--mbar-h) so the zoom, Modifiers and Drive buttons sit above the new row
  };
  place(); mq.addEventListener('change', place);
  window.addEventListener('hashchange', sync);
  window.addEventListener('mbn:select', sync);   // keyboard, search and programmatic selections
  document.addEventListener('click', () => setTimeout(sync, 0), true);
})();
