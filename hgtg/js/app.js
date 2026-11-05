/* MindBlown Neural — app.js
   Wires the modules together: model → dynamics → layout → renderer, plus zoom, picking, selection, routing,
   the detail panel, the connectome panel, lobe toggles and search. Dataset-agnostic: everything comes from window.MINDBLOWN. */
(() => {
  if (!window.d3) {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.setAttribute('role', 'alert');
      loading.textContent = 'The brain renderer could not be loaded or verified. Please reload; if this persists, contact the site owner.';
    }
    return;
  }
  // ---------- nav: one dropdown of every brain, in the header on every page (same control as the canonical renderer) ----------
  // Source, in order: window.MINDBLOWN_NAV ([{label, href, color?, sep?}]), or an existing <nav class="brains"> of links; the current page is marked by href or .on
  (() => {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let nav = document.querySelector('nav.brains');
    if (nav && nav.classList.contains('dd')) return;   // already built (a page that boots twice)
    const here = location.pathname.split('/').pop() || 'index.html';
    let items = Array.isArray(window.MINDBLOWN_NAV) ? window.MINDBLOWN_NAV : null;
    // links become items (external links keep target / rel / title, the community link keeps its class); a <select> of pages unfolds into one item per option; anything else is a separator
    const ofLink = el => ({ label: el.textContent.trim(), href: el.getAttribute('href'), color: (el.querySelector('.dot') || {}).style?.background || '', on: el.classList.contains('on'), target: el.getAttribute('target') || '', rel: el.getAttribute('rel') || '', title: el.getAttribute('title') || '', cls: [...el.classList].filter(c => c !== 'on' && c !== 'ext').join(' ') });
    if (!items && nav) items = [...nav.children].flatMap(el => el.matches('a') ? [ofLink(el)] : el.matches('select') ? [{ sep: true }, ...[...el.options].filter(o => o.value).map(o => ({ label: o.textContent.trim(), href: o.value, on: o.selected && el.classList.contains('on') }))] : [{ sep: true }]);
    if (items) items = items.filter((it, k, a) => !it.sep || (k > 0 && k < a.length - 1 && !a[k - 1].sep)); // no leading, trailing or doubled separators
    if (!items || !items.filter(i => !i.sep).length) return;
    const label = nav?.getAttribute('aria-label') || 'Brains';
    if (!nav) { nav = document.createElement('nav'); nav.className = 'brains'; const bt = document.querySelector('.brand-text'); if (bt) bt.after(nav); else document.getElementById('top')?.prepend(nav); }
    nav.classList.add('dd'); nav.setAttribute('aria-label', label);
    // the current item is the link marked .on or whose href is this page; a viewer page that matches no link (brain.html) shows the brain's title instead and marks nothing current
    const cur = items.find(i => !i.sep && (i.on || (i.href || '').split('/').pop().split('#')[0] === here)) || null;
    const shown = cur || { label: window.MINDBLOWN?.title || items.find(i => !i.sep).label, color: '' };
    const dot = c => c ? `<span class="dot" style="background:${esc(c)}"></span>` : '<span class="dot none"></span>';
    const attrs = i => `${i === cur ? ' aria-current="page"' : ''}${i.target ? ` target="${esc(i.target)}"` : ''}${i.rel ? ` rel="${esc(i.rel)}"` : ''}${i.title ? ` title="${esc(i.title)}"` : ''}`;
    const cls = i => [i === cur ? 'on' : '', i.cls || ''].filter(Boolean).join(' ');
    nav.innerHTML = `<button class="nav-btn" aria-haspopup="menu" aria-expanded="false" title="Switch brain">${dot(shown.color)}<span class="cur">${esc(shown.label)}</span><span class="chev" aria-hidden="true">▾</span></button>
      <ul class="nav-menu" role="menu" hidden>${items.map(i => i.sep ? '<li class="sep" role="separator"></li>' : `<li role="none"><a role="menuitem" href="${esc(i.href)}"${cls(i) ? ` class="${esc(cls(i))}"` : ''}${attrs(i)}>${dot(i.color)}<span>${esc(i.label)}</span></a></li>`).join('')}</ul>`;
    const btn = nav.querySelector('.nav-btn'), menu = nav.querySelector('.nav-menu');
    const open = o => { menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); nav.classList.toggle('open', o); if (o) { nav.classList.remove('flip'); nav.classList.toggle('flip', menu.getBoundingClientRect().right > innerWidth - 8); menu.querySelector('a.on, a')?.focus(); } };
    btn.addEventListener('click', () => open(menu.hidden));
    document.addEventListener('click', e => { if (!nav.contains(e.target)) open(false); });
    nav.addEventListener('keydown', e => {
      const links = [...menu.querySelectorAll('a')], i = links.indexOf(document.activeElement);
      if (e.key === 'Escape') { if (!menu.hidden) e.stopPropagation(); open(false); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (menu.hidden) open(true); else links[(i + 1) % links.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (menu.hidden) { open(true); links[links.length - 1]?.focus(); } else links[(i - 1 + links.length) % links.length]?.focus(); }
    });
  })();
  // pages without a canvas or data load app.js for the nav alone
  if (!window.MINDBLOWN || !document.getElementById('brain')) return;

  // ---------- right rail: Brains group (same API as the canonical renderer's MINDBLOWN_RAIL) ----------
  // Actions that place a brain on the canvas (Origin Brain, Modifier Brain) live in their own glass group above the Tools column, not in the
  // Lobes panel or a bottom-left pill. Add-ons call MINDBLOWN_RAIL.brainButton({ id, label, title, icon }); the group appears with its first
  // button and is kept above #tools (or #zoom-ctl when the tools are hidden on phones). The Drive and the cheese sit above the highest
  // .zoom-ctl, so they move up with it. MINDBLOWN_RAIL.card(el, btn) places a card beside the rail, level with its button.
  window.MINDBLOWN_RAIL = (() => {
    const svg = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    let group = null;
    const shown = el => el && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
    function place() {
      if (!group) return;
      const tools = document.getElementById('tools'), zoom = document.getElementById('zoom-ctl'), under = shown(tools) ? tools : shown(zoom) ? zoom : null;
      if (!under) { group.style.bottom = ''; group.style.right = ''; group.classList.remove('rail-beside'); return; }
      const host = (group.offsetParent || document.body).getBoundingClientRect(), r = under.getBoundingClientRect();
      // above the column only if the buttons stacked over the group (Entangler, Drive, cheese) still clear the header; else beside it
      // the cheese (mice-chat.js) and the Entangler (when it drops its .zoom-ctl) step beside the Drive on their own, so only what stays stacked counts
      const en = document.getElementById('mb-entangler'), dv = document.getElementById('mb-drive');
      const above = (en && shown(en) && en.classList.contains('zoom-ctl') ? en.offsetHeight + 12 : 0) + (dv && !dv.classList.contains('mb-hidden') && dv.getClientRects().length && (() => { const q = dv.getBoundingClientRect(), mx = q.left + q.width / 2; return mx >= r.left && mx <= r.right; })() ? (dv.offsetHeight || 56) + 12 : 0);   // the Drive counts only while it is lined up over the column (not in a side spot or the corner)
      const top = document.getElementById('top'), ceil = top && shown(top) && window.innerWidth > 900 ? top.getBoundingClientRect().bottom + 8 : 8;
      group.classList.toggle('rail-beside', !(r.top - 10 - group.offsetHeight - above >= ceil));   // beside: the Drive and Entangler do not anchor to it
      if (r.top - 10 - group.offsetHeight - above >= ceil) { group.style.bottom = Math.round(host.bottom - r.top + 10) + 'px'; group.style.right = Math.round(host.right - r.right) + 'px'; }
      else { group.style.bottom = Math.round(host.bottom - r.bottom) + 'px'; group.style.right = Math.round(host.right - r.left + 8) + 'px'; }   // no room above (landscape phones): beside the column instead
      cards.forEach(([el, btn]) => placeCard(el, btn));
    }
    const cards = [];
    function placeCard(el, btn) {
      if (el.hidden || window.innerWidth <= 900) { el.style.right = el.style.top = ''; return; }
      const g = group.getBoundingClientRect(), b = btn.getBoundingClientRect();
      el.style.right = Math.round(window.innerWidth - g.left + 10) + 'px';
      el.style.top = Math.round(Math.max(72, Math.min(b.top - 6, window.innerHeight - el.offsetHeight - 12))) + 'px';
    }
    let queued = false;
    const replace = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; place(); window.dispatchEvent(new Event('resize')); }); };
    window.addEventListener('resize', () => place());
    setInterval(place, 800);   // the Entangler, Drive and cheese arrive after the group: re-check so the stack still clears the header
    return {
      svg, place: replace,
      brainButton({ id, label, title, icon }) {
        if (!group) {
          group = document.createElement('div'); group.id = 'brain-tools'; group.className = 'zoom-ctl brain-tools'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Brains');
          const tools = document.getElementById('tools') || document.getElementById('zoom-ctl'); if (tools) tools.before(group); else document.body.appendChild(group);
          if (window.ResizeObserver) { const ro = new ResizeObserver(replace); ['tools', 'zoom-ctl'].forEach(i => { const e = document.getElementById(i); if (e) ro.observe(e); }); }
        }
        const b = document.createElement('button'); b.type = 'button'; b.id = id; b.title = title || label; b.setAttribute('aria-label', label); if (icon) b.innerHTML = icon; else b.textContent = label;   // icon: authored SVG only; a label is text
        group.appendChild(b); replace(); return b;
      },
      card(el, btn) { cards.push([el, btn]); new MutationObserver(() => placeCard(el, btn)).observe(el, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true }); placeCard(el, btn); },
    };
  })();

  // boot: compose.js (optional, loaded before this file) may swap window.MINDBLOWN for a composed data set first; without it the page's own data starts at once.
  // Everything below reads the D it is handed (model, layout, the mbn:<brain> weights key), so a composed set saves under its own key.
  const start = D => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;   // phones and tablets: bigger hit targets, tap-to-travel
  // performance preferences live apart from learned weights (mbn:<brain>) so clearing one never clears the other
  const perfStore = (() => { try { const st = window['local' + 'Storage']; st.getItem('mbn:perf'); return st; } catch (e) { return null; } })();
  const perf = Object.assign({ refresh: 'auto' }, (() => { try { return JSON.parse(perfStore?.getItem('mbn:perf') || '{}'); } catch (e) { return {}; } })());
  const savePerf = () => { try { perfStore?.setItem('mbn:perf', JSON.stringify(perf)); } catch (e) { } };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pw = (n, w) => w + (n === 1 ? '' : 's'); const plural = (n, w) => `${n} ${pw(n, w)}`;
  const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '–';
  const $ = id => document.getElementById(id);

  if (D.title) { document.title = D.title; const h = document.querySelector('.brand .title'); if (h) h.textContent = h.dataset.displayTitle || D.title; }
  // on mid-width laptops the brain switcher scrolls; keep the current brain in view
  { const on = document.querySelector('.brains:not(.dd) a.on'); const show = () => { const nav = on.parentElement; if (nav.scrollWidth > nav.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' }); }; if (on) (document.fonts ? document.fonts.ready.then(show) : Promise.resolve().then(show)); }
  if (D.subtitle || D.demo) { const sub = document.querySelector('.brand .sub'); if (sub) sub.textContent = D.subtitle || 'demo brain · fictional data'; }
  // keep the current brain visible when the brain nav has to scroll (see the header-fit rules in style.css)
  { const nav = document.querySelector('.brains:not(.dd)'); const on = nav && nav.querySelector('a.on');
    if (nav && on) { const fit = () => { nav.scrollLeft = Math.max(0, on.offsetLeft + on.offsetWidth - nav.clientWidth + 6); }; fit(); window.addEventListener('resize', fit); window.addEventListener('load', fit); } }

  // ---------- modules ----------
  const M = window.MBN.buildModel(D);
  const { pages, pageById, syns, synById, srcs, lobes, lobeById, isChild } = M;
  let hasSubs = M.hasSubs;   // a grown sub-neuron (e.g. inside a designed fjord) can switch the sub-neuron level on later
  const subWord = D.subName || 'sub-neuron';   // what a sub-neuron is called on this brain (the Chemistry brain's are atoms)
  const brainKey = 'mbn:' + (D.brain || D.title || location.pathname).replace(/[^\w.-]+/g, '_');
  const dyn = new window.MBN.Dynamics(pages, M.pageLinks, { storageKey: brainKey, reduceMotion });
  const L = new window.MBN.Layout(M, dyn);
  const canvas = $('brain');
  const view = { k: 0.3, tx: 0, ty: 0, toWorld(sx, sy) { return [(sx - this.tx) / this.k, (sy - this.ty) / this.k]; }, toScreen(x, y) { return [x * this.k + this.tx, y * this.k + this.ty]; } };
  const R = new window.MBN.Renderer(canvas, M, L, dyn, view);
  L.viewport = R;   // the genome layout sizes its karyogram to the canvas (R.W / R.H stay current through the renderer's own resize)

  // ---------- state ----------
  const lobeOn = Object.fromEntries(lobes.map(l => [l.id, !l.hidden]));
  let forceExplode = false, showCocite = false, hover = null, selected = null, selectedBy = null, pulseSyn = null, routeFrom = null, initialHashTimer = null;   // selectedBy: 'visitor' | 'grow' (set by a GROW client such as the mice)
  let mode = 'select', spaceDown = false; const multi = new Set(); let marquee = null, drag = null;
  let labelsOn = true, labelF = 1, mouseW = null;   // labels toggle (L); when off, only the hovered neuron or lobe keeps its label
  const pageOn = p => lobeOn[p.lobe] && (!p.parent || lobeOn[p.parent.lobe]);
  const visible = n => n.kind === 'page' ? pageOn(n) : n.kind === 'syn' ? pageOn(pageById[n.page]) : n.pageNodes.some(pageOn);
  const rebuild = warm => { L.rebuild(visible, showCocite, warm); updateStats(); };

  // ---------- zoom ----------
  let lastLevel = '', lastLevelAt = 0;
  const zoom = d3.zoom().scaleExtent([0.08, 9]).on('zoom', ev => { view.k = ev.transform.k; view.tx = ev.transform.x; view.ty = ev.transform.y; const lv = lvlName(), t = performance.now(); if (lv !== lastLevel || t - lastLevelAt > 120) { lastLevel = lv; lastLevelAt = t; updateLevel(); } })
    .on('end', () => { lastLevel = lvlName(); lastLevelAt = performance.now(); updateLevel(); })
    .filter(ev => {
      if (ev.type === 'wheel' || ev.type.startsWith('touch')) return !ev.ctrlKey || ev.type === 'wheel';
      if (ev.type !== 'mousedown') return !ev.button;
      const onNeuron = pick(ev.clientX, ev.clientY)?.kind === 'page';
      if (ev.button === 1 || ev.button === 2) return !onNeuron;
      return ev.button === 0 && (mode === 'pan' || spaceDown) && !onNeuron;
    });
  d3.select(canvas).call(zoom).on('dblclick.zoom', null);
  function fitTransform() {
    const vp = pages.filter(p => visible(p) && !isChild(p));
    const xs = vp.map(p => p.x), ys = vp.map(p => p.y);
    const g = L.genome(), mx = g ? 120 : M.brainsIn ? 260 : 150, my = g ? 150 : M.brainsIn ? 260 : 170, W = R.W, H = R.H;
    const minX = Math.min(...xs) - mx, maxX = Math.max(...xs) + mx, minY = Math.min(...ys) - my, maxY = Math.max(...ys) + my;
    // phones: fit between the header and the bottom bar (and, on the Guide, above the mice dock), leaving room either side for
    // the titles of the outer lobes the mice grow (titles are screen-sized, so the world-unit margins above shrink with the zoom)
    const miceDock = M.D.brain === 'guide' ? document.querySelector('.mice-chat:not([hidden])') : null, miceRect = miceDock && miceDock.getBoundingClientRect();
    const miceTop = miceRect ? (miceDock.classList.contains('open') ? miceRect.bottom - 44 : miceRect.top) : 0;   // the open chat is a transient overlay: fit as if it were the collapsed pill
    if ((M.D.brain === 'dna' || miceTop) && window.innerWidth <= 900) {
      const top = (document.getElementById('top')?.getBoundingClientRect().bottom || 100) + 12 + (miceTop ? 30 : 0);
      const bottom = Math.min(H, document.getElementById('mbar')?.getBoundingClientRect().top || H, miceTop || H) - (miceTop ? 34 : 12);
      const height = Math.max(24, bottom - top), inset = Math.min(g ? 36 : 12, height * 0.15), side = miceTop ? Math.min(150, W * 0.36) : 84;
      const kk = Math.min((W - side) / (maxX - minX), (height - 2 * inset) / (maxY - minY)) * 0.96;
      return { kk, tx: (W - 48) / 2 - (minX + maxX) / 2 * kk, ty: (top + bottom) / 2 - (minY + maxY) / 2 * kk };
    }
    // pixels reserved for titles beside/above the outer lobes (above the bars in the genome layout)
    // Brain 42's few wide-named lobes need title room on both sides and clear of the right-hand tool column
    const roomy = (M.D.brain === 'brain42' || M.D.brain === 'guide') && window.innerWidth > 900 && !g;   // the Guide too: the mice's outer networks carry titles
    const padL = window.innerWidth <= 900 ? 0 : 230, padR = roomy ? 70 : 0, lx = M.brainsIn && !g ? Math.min(210, W * 0.16) : roomy ? Math.min(170, W * 0.14) : 0, ly = g ? 40 : M.brainsIn ? 30 : 0;
    const kk = Math.min((W - 60 - padL - padR - 2 * lx) / (maxX - minX), (H - (M.brainsIn ? 150 : 200) - 2 * ly) / (maxY - minY)) * 0.96;
    return { kk, tx: padL + (W - padL - padR) / 2 - (minX + maxX) / 2 * kk, ty: H / 2 + 12 - (minY + maxY) / 2 * kk };
  }
  // after the mice grow a network on the outer ring: refit only if something visible (with room for its title) now sits
  // off screen or under the left panel / right tool column; a view that still shows everything is left alone
  const fitIfOut = (dur = 900) => {
    const t = d3.zoomTransform(canvas), W = R.W, H = R.H, wide = window.innerWidth > 900;
    const x0 = wide ? 240 : 64, x1 = W - (wide ? 150 : 96), y0 = wide ? 70 : 170, y1 = H - (wide ? 110 : 200);   // room for a lobe's title around its neurons
    const out = pages.some(p => visible(p) && !isChild(p) && Number.isFinite(p.x) && (() => { const x = t.applyX(p.x), y = t.applyY(p.y); return x < x0 || x > x1 || y < y0 || y > y1; })());
    if (out) fitAll(dur);
  };
  const fitAll = (dur = 900) => { const { kk, tx, ty } = fitTransform(); if (!(kk > 0)) return; d3.select(canvas).transition().duration(dur).ease(d3.easeCubicInOut).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(kk)); };
  // travel to a node. On phones the detail sheet covers the lower half, so the target lands in the middle of what stays visible;
  // the duration follows the on-screen distance and zoom change so short hops feel immediate and long ones stay readable.
  function zoomTo(n, kk, dur, bottomH) {   // bottomH: pixels covered at the bottom of the screen; defaults to the (pending) detail sheet
    const mobile = window.innerWidth <= 900, panelW = mobile ? 0 : 380;
    const sheetH = !mobile ? 0 : bottomH != null ? bottomH : Math.max(MUI.barHeight(), !panel.hidden ? panel.offsetHeight || R.H * 0.5 : n.kind === 'page' ? Math.min(R.H * 0.5, 460) : MUI.detentPx('peek'));   // a closed sheet is about to open at half for pages, peek for synapses and sources
    const headH = mobile ? (document.getElementById('top')?.getBoundingClientRect().bottom || 0) : 0;
    const cy = mobile ? Math.max(headH + 60, headH + (R.H - sheetH - headH) / 2) : R.H / 2;
    const tx = (R.W - panelW) / 2 - n.x * kk, ty = cy - n.y * kk;
    if (dur == null) {
      const [sx, sy] = view.toScreen(n.x, n.y), dist = Math.hypot(sx - (R.W - panelW) / 2, sy - cy), ratio = Math.abs(Math.log(kk / view.k));
      dur = Math.round(Math.min(900, Math.max(300, 260 + dist * 0.45 + ratio * 220)));
    }
    if (reduceMotion) dur = 0;
    transitionUntil = performance.now() + dur + 80;
    d3.select(canvas).transition().duration(dur).ease(d3.easeCubicInOut).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(kk));
  }
  let transitionUntil = 0;

  // ---------- frame ----------
  let explodeTarget = 0, depthTarget = 0, last = performance.now();
  // refresh rate: 'auto' draws at 60 Hz on touch devices and at the display's native rate elsewhere; '60' always caps;
  // 'native' never skips a frame (120 Hz phones and high-refresh monitors). Simulation time (dt) is preserved across skipped frames.
  let nativeHz = 60;
  const refreshCap = () => perf.refresh === 'native' ? 0 : perf.refresh === '60' ? 60 : coarse ? 60 : 0;
  // measure the display's refresh rate once the boot warm-up is over, with a counter independent of the (possibly capped) engine loop
  const sampleHz = () => { let n = 0, t0 = 0; const f = t => { if (!t0) t0 = t; n++; if (t - t0 < 700) requestAnimationFrame(f); else { const hz = (n - 1) * 1000 / (t - t0); nativeHz = [60, 90, 120, 144, 165, 240].reduce((a, c) => Math.abs(c - hz) < Math.abs(a - hz) ? c : a, 60); updatePerfLabel(); } }; requestAnimationFrame(f); };
  setTimeout(sampleHz, 2500); document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(sampleHz, 800); });
  let nextDue = 0;
  function frame(now) {
    const cap = refreshCap();
    if (cap) {   // pace to the cap without losing the remainder: a 60 Hz cap on a 90 Hz display alternates one- and two-interval gaps
      const interval = 1000 / cap;
      if (now < nextDue - 1) { requestAnimationFrame(frame); return; }
      nextDue = nextDue + interval > now ? nextDue + interval : now + interval;
    }
    const raw = now - last, dt = Math.min(0.1, raw / 1000); last = now;   // dt is clamped for the animation; the Manager sees the raw delta so it can discard hitches
    const ease = f => reduceMotion ? 1 : 1 - Math.pow(1 - f, dt * 60);   // per 1/60 s so unfolding is frame-rate independent; reduced motion snaps
    const want = forceExplode || view.k >= 1.5 ? 1 : 0; explodeTarget = want;
    if (Math.abs(L.explodeF - explodeTarget) > 0.004) { L.explodeF += (explodeTarget - L.explodeF) * ease(0.12); L.refreshForces(); if (L.sim.alpha() < 0.2) L.sim.alpha(0.35).restart(); } else if (L.explodeF !== explodeTarget) { L.explodeF = explodeTarget; L.refreshForces(); }
    const wantD = hasSubs && (forceExplode || view.k >= 0.85) ? 1 : 0; depthTarget = wantD;
    if (Math.abs(L.depthF - depthTarget) > 0.004) { L.depthF += (depthTarget - L.depthF) * ease(0.1); L.refreshForces(); if (L.sim.alpha() < 0.2) L.sim.alpha(0.3).restart(); } else if (L.depthF !== depthTarget) { L.depthF = depthTarget; L.refreshForces(); }
    const wantL = labelsOn ? 1 : 0;
    if (Math.abs(labelF - wantL) > 0.004) labelF += (wantL - labelF) * ease(0.18); else labelF = wantL;
    if (window.MBN.synapses) { window.MBN.synapses.observe(raw); dyn.maxSpikes = window.MBN.synapses.budget().spikes; }   // the Synapse Manager steers the budget from the measured frame time
    dyn.step(dt, L.activeLinkSet);
    R.draw(now, { selected, hover, pulseSyn, multi, marquee, lobeOn, forceExplode, showCocite, plural, labelF, mouseW });
    if (frameCount++ % 30 === 0) updateLive();
    requestAnimationFrame(frame);
  }
  let frameCount = 0;

  // ---------- picking & pointer ----------
  function pick(sx, sy) {
    const [x, y] = view.toWorld(sx, sy); const synOk = L.explodeF > 0.6 && (forceExplode || view.k >= 1.25); let best = null, bd = Infinity;
    for (const n of L.activeNodes) {
      if (n.kind !== 'page' && !synOk) continue; if (isChild(n) && L.depthF < 0.5) continue; if (n.kind === 'syn' && isChild(pageById[n.page]) && L.depthF < 0.5) continue;
      const r = (n.kind === 'page' ? n.r / Math.pow(view.k, 0.45) : 4 / view.k) + (coarse ? 14 : 6) / view.k, d = Math.hypot(n.x - x, n.y - y);
      if (d < r && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  const tip = $('tip'); let downAt = null, downBtn = 0, downShift = false, pressed = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input')) { spaceDown = true; canvas.classList.add('space'); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; canvas.classList.remove('space'); } });
  // Touch: d3-zoom owns pan and pinch; the engine owns taps. A tap (under 10 px, under 350 ms, one finger) selects a neuron and
  // travels to it — the default on phones — or clears the selection on empty canvas. A second tap on empty canvas within 300 ms zooms in.
  let touch = null, lastTap = null; const fingers = new Set();   // active touch pointers; a gesture ends only when every finger has lifted
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') { fingers.add(e.pointerId); if (touch || fingers.size > 1) { if (touch) touch.multi = true; } else touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), multi: false }; tip.hidden = true; return; }
    downAt = [e.clientX, e.clientY]; downBtn = e.button; downShift = e.shiftKey; pressed = pick(e.clientX, e.clientY); const onNeuron = pressed?.kind === 'page';
    if (onNeuron && (e.button === 1 || e.button === 2 || (e.button === 0 && mode === 'select' && !spaceDown))) {
      const group = (multi.has(pressed) ? [...multi] : [pressed]).map(n => n.isAtom ? n.parent : n);   // an atom is dragged by its molecule
      drag = { nodes: group.map(n => ({ n, x: n.x, y: n.y })), sx: e.clientX, sy: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('moving'); tip.hidden = true;
    } else if (!onNeuron && e.button === 0 && mode === 'select' && !spaceDown) { marquee = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }; canvas.setPointerCapture(e.pointerId); }
    else canvas.classList.add('grabbing');
  });
  canvas.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') { fingers.delete(e.pointerId); if (touch) touch.multi = true; if (!fingers.size) touch = null; } });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') {
      fingers.delete(e.pointerId); const t = touch; if (!t) return;
      if (fingers.size) { t.multi = true; return; }   // other fingers still down: the gesture is a pinch, not a tap
      touch = null;
      const now = performance.now(), dist = Math.hypot(e.clientX - t.x, e.clientY - t.y);
      if (t.multi || t.moved || t.id !== e.pointerId || dist > 10 || now - t.t > 350) return;
      const n = pick(e.clientX, e.clientY);
      if (n) { if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) { } } hideResults(); clickNeuron(n, false, MUI.tapTravel() ? undefined : { noZoom: true }); lastTap = null; return; }
      if (lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        lastTap = null; const [wx, wy] = view.toWorld(e.clientX, e.clientY); const kk = Math.min(9, view.k * 1.8);
        transitionUntil = now + 420; d3.select(canvas).transition().duration(reduceMotion ? 0 : 340).ease(d3.easeCubicOut).call(zoom.transform, d3.zoomIdentity.translate(e.clientX - wx * kk, e.clientY - wy * kk).scale(kk)); return;
      }
      lastTap = { x: e.clientX, y: e.clientY, t: now }; multi.clear(); clearSelection(); hideResults(); updateHint(); return;
    }
    canvas.classList.remove('grabbing'); canvas.classList.remove('moving');
    const small = downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5;
    if (drag) {
      if (drag.moved) { drag.nodes.forEach(({ n }) => { n.pinned = true; n.fx = n.x; n.fy = n.y; }); L.sim.alpha(Math.max(L.sim.alpha(), 0.2)).restart(); }
      else if (downBtn === 0) clickNeuron(pressed, downShift); else if (!multi.has(pressed)) { multi.clear(); multi.add(pressed); updateHint(); }
      drag = null;
    } else if (marquee) { if (!small) finishMarquee(downShift); else { if (!downShift) { multi.clear(); clearSelection(); } updateHint(); } marquee = null; }
    else if (small && downBtn === 0) { const n = pick(e.clientX, e.clientY); n ? clickNeuron(n, downShift) : (multi.clear(), clearSelection(), updateHint()); }
    downAt = null; pressed = null;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') { if (touch && touch.id === e.pointerId && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 10) touch.moved = true; return; }   // a pan cancels the tap; d3-zoom handles the movement
    if (drag) {
      const dx = (e.clientX - drag.sx) / view.k, dy = (e.clientY - drag.sy) / view.k;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= 3) drag.moved = true; if (!drag.moved) return;
      drag.nodes.forEach(({ n, x, y }) => { n.fx = n.x = x + dx; n.fy = n.y = y + dy; n.vx = n.vy = 0; }); if (L.sim.alpha() < 0.12) L.sim.alpha(0.12).restart(); return;
    }
    if (marquee) { marquee.x1 = e.clientX; marquee.y1 = e.clientY; return; }
    if (downAt) return;
    mouseW = view.toWorld(e.clientX, e.clientY);
    const n = pick(e.clientX, e.clientY);
    if (n !== hover) { hover = n; canvas.classList.toggle('pointer', !!n); if (n) { tip.hidden = false; tip.innerHTML = tipHtml(n); } else tip.hidden = true; if (!selected) dyn.focus(n && n.kind === 'page' ? n : n && n.kind === 'syn' ? pageById[n.page] : null); }
    if (n) { tip.style.left = Math.min(e.clientX, R.W - 300) + 'px'; tip.style.top = Math.min(e.clientY, R.H - 90) + 'px'; }
  });
  canvas.addEventListener('pointerleave', () => { hover = null; mouseW = null; tip.hidden = true; if (!selected) dyn.focus(null); });
  function clickNeuron(n, shift, opts) {   // opts.noZoom: select without travelling (phone "Tap travels" off); routing and multi-select behave the same either way
    if (n.kind === 'page' && routeFrom && routeFrom !== n) { routeTo(n); return; }
    if (n.kind === 'page' && shift) { multi.has(n) ? multi.delete(n) : multi.add(n); updateHint(); return; }
    if (n.kind === 'page' && !multi.has(n)) multi.clear();
    select(n, opts); updateHint();
  }
  function finishMarquee(shift) {
    const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1), y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
    if (!shift) multi.clear();
    for (const n of L.activeNodes) { if (n.kind !== 'page' || (isChild(n) && L.depthF < 0.5)) continue; const [sx, sy] = view.toScreen(n.x, n.y); if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) multi.add(n); }
    if (multi.size === 1) select([...multi][0], { noZoom: true }); else if (multi.size > 1 && selected && !multi.has(selected)) clearSelection();
    updateHint();
  }
  const releaseAll = () => { pages.forEach(n => { if (n.pinned) { n.pinned = false; if (n !== selected) { n.fx = null; n.fy = null; } } }); L.sim.alpha(0.5).restart(); updateHint(); };
  const setMode = m => { mode = m; canvas.classList.toggle('select', m === 'select'); document.querySelectorAll('.tool-mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); updateHint(); };

  // ---------- tooltip ----------
  const roleShort = n => n.club ? 'rich club' : n.hub ? n.role : '';
  function tipHtml(n) {
    if (n.kind === 'page') return `<span class="k">${isChild(n) ? `${subWord} of ${esc(n.parent.title)}` : typeName(n) + ' · ' + esc(lobeById[n.lobe].name)}${roleShort(n) ? ' · ' + esc(roleShort(n)) : ''}</span><b>${esc(n.title)}</b>${n.nSyn} synapses · ${n.neighbors.length} connections${n.children.length ? ` · ${n.children.length} sub-neurons` : ''}${routeFrom && routeFrom !== n ? '<br><em>click to route here</em>' : ''}`;
    if (n.kind === 'syn') return `<span class="k">synapse of ${esc(pageById[n.page].title)}</span><b>${esc(n.lead)}</b>${esc(n.text.slice(0, 140))}${n.text.length > 140 ? '…' : ''}`;
    return `<span class="k">${srcKind(n)}</span><b>${esc(n.label)}</b>cited by ${plural(n.pageNodes.length, 'neuron')}`;
  }
  const srcKind = n => ({ session: 'Perplexity session', github: D.demo ? 'Code host (demo)' : 'GitHub', web: 'Web source', gmail: 'Gmail (metadata)', calendar: 'Google Calendar', spotify: 'Spotify', plaid: 'Bank data (names only)', memory: 'Memory note', wiki: 'Brain page', mice: 'The mice (grown in-session)', entangler: 'The Quantum Entangler (drawn in-session)' }[n.kindOf] || 'Source');
  const srcKindShort = s => ({ session: 'session', github: D.demo ? 'code' : 'github', web: 'web', gmail: 'gmail', calendar: 'calendar', spotify: 'spotify', plaid: 'bank', memory: 'memory', wiki: 'brain', mice: 'mice', entangler: 'entangler', mindblown: 'MindBlown' }[s.kindOf] || 'source');
  const srcLabel = s => s.href ? `<a class="src-link" href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label);   // only same-site brain links (set by the growth API) are rendered as links
  const typeName = n => esc({ atom: 'atom', compound: 'compound', group: 'functional group', reaction: 'reaction', element: 'element', project: 'project', entity: 'person / thing', person: 'person', place: 'place', habit: 'habit', event: 'event', account: 'account', trip: 'trip', preference: 'preference', day: D.dayName || 'dream log', audit: 'audit' }[n.type] || n.type || '');

  // ---------- selection ----------
  const panel = $('panel'), panelBody = $('panel-body');
  $('panel-close').addEventListener('click', clearSelection);
  window.addEventListener('keydown', e => {
    if (e.target.closest('input')) return;
    if (e.key === 'Escape') { if (routeFrom) { cancelRoute(); return; } clearSelection(); hideResults(); multi.clear(); marquee = null; updateHint(); }
    else if (e.key === 'v' || e.key === 'V') setMode('select'); else if (e.key === 'h' || e.key === 'H') setMode('pan'); else if (e.key === 'r' || e.key === 'R') releaseAll();
    else if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey) setLabels(!labelsOn);
    else if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) screenshot();
    else if (e.key === 'g' || e.key === 'G') setLayout(L.genome() ? 'neural' : 'genome');
  });
  function select(n, opts = {}) {
    clearTimeout(initialHashTimer); initialHashTimer = null;
    const prev = selected;
    if (selected && selected.kind === 'page' && !selected.pinned) { selected.fx = null; selected.fy = null; }
    selected = n; selectedBy = opts.by || 'visitor'; pulseSyn = null;
    try { window.dispatchEvent(new CustomEvent('mbn:select', { detail: { id: n.id, kind: n.kind, by: selectedBy, origin: n.origin || null } })); } catch (e) { /* an add-on threw inside its listener: never the engine's problem */ }   // add-ons (the Quantum Entangler) listen for visitor selections here instead of polling
    if (R.route && R.route.passive && selectedBy === 'visitor') R.route = null;   // the visitor takes over from a mice-shown route
    // Hebbian: moving your attention from one neuron to a connected one strengthens that synapse
    if (!opts.noLearn && prev && prev.kind === 'page' && n.kind === 'page' && prev !== n && prev.neighbors.some(x => x.n === n)) dyn.potentiate(prev, n);
    if (n.kind === 'page' && !isChild(n) && !L.genome()) { n.fx = n.x; n.fy = n.y; }   // in the genome layout the locus holds it
    if (n.kind === 'page') {
      dyn.focus(n); const kk = n.mol ? Math.max(1.1, Math.min(n.mol.s < 1 ? 3.2 / n.mol.s : 3.2, Math.min(R.W - 260, R.H - 160) * 0.4 / (n.mol.re + 30))) : isChild(n) ? 3.6 : n.nSyn > 14 ? 2.6 : 3.2;   // a molecule zooms to fit its drawing
      if (!opts.noZoom) { const folded = isChild(n) && L.depthF < 0.97; zoomTo(folded ? n.parent : n, n.mol ? kk : Math.max(view.k, kk)); if (folded) setTimeout(() => { if (selected === n) zoomTo(n, Math.max(view.k, kk), 700); }, 900); }
      n.u = n.theta;   // selecting a neuron makes it fire
    } else if (n.kind === 'syn') { pulseSyn = n; dyn.focus(pageById[n.page]); if (!opts.noZoom) { zoomTo(n, Math.max(view.k, 3.4)); if (isChild(pageById[n.page]) && L.depthF < 0.97) setTimeout(() => { if (selected === n) zoomTo(n, Math.max(view.k, 3.4), 700); }, 900); } }
    else { dyn.focus(n.pageNodes[0]); if (!opts.noZoom) zoomTo(n, Math.max(view.k, 3)); }
    const fresh = panel.hidden; renderPanel(n); panel.hidden = false; MUI.sheetOpened(n.kind === 'page' ? 'half' : 'peek', fresh);
    if (n.kind === 'page' && history.replaceState) { try { const rest = location.hash.replace(/^#/, '').split('&').filter(x => x && !/^n=/.test(x)); rest.push('n=' + encodeURIComponent(n.id)); history.replaceState(null, '', location.pathname + location.search + '#' + rest.join('&')); } catch (e) { } }
  }
  function clearSelection() { clearTimeout(initialHashTimer); initialHashTimer = null; if (selected && selected.kind === 'page' && !selected.pinned) { selected.fx = null; selected.fy = null; } selected = null; selectedBy = null; pulseSyn = null; panel.hidden = true; MUI.sheetClosed(); dyn.focus(hover && hover.kind === 'page' ? hover : null); R.route = null; }

  // ---------- routing (shortest weighted path, animated as a spike volley) ----------
  function startRoute(n) { routeFrom = n; canvas.classList.add('routing'); updateHint(); renderPanel(n); }
  function cancelRoute() { routeFrom = null; canvas.classList.remove('routing'); updateHint(); if (selected) renderPanel(selected); }
  const findRoute = (from, to) => window.MBN.synapses.route(M.analysis.adj, from, to, (a, b) => { const l = a.neighbors.find(x => x.n === b)?.l; return l && !dyn.isPruned(l) && l.source.active && l.target.active ? l.weff : 1e-6; });
  const routeOf = (from, res) => ({ path: res.path, motif: window.MBN.connectome.routeMotif(res.path, M.analysis.club.members), hops: res.hops, cost: res.cost, red: !!from.origin, col: from.origin ? window.MBN.originColor(from.origin) : null });   // a route that sets out from grown material travels in its origin's colour (the mice's red by default)
  function routeTo(to) {
    const from = routeFrom; cancelRoute(); ensureVisible(to); ensureVisible(from);
    const res = findRoute(from, to);
    if (!res) { toast('No route: these neurons are not connected through visible lobes'); return; }
    R.route = routeOf(from, res);
    for (let i = 1; i < res.path.length; i++) dyn.potentiate(res.path[i - 1], res.path[i], 0.12);   // travelling the route myelinates it a little
    dyn.route(res.path);
    dyn.announce('route', { from: from.id, to: to.id, hops: res.path.length - 1, path: res.path.map(p => p.id) });
    select(to, { noLearn: true }); renderPanel(to);
  }
  // A passive route: shown, not taken. Nothing is selected, nothing is potentiated, and it steps aside when the visitor is busy
  // (mid-route, or holding a selection they made themselves). Used by GROW clients such as the mice to announce new material.
  let passiveT = 0;
  function showRoute(from, to, ms = 6000) {
    if (!from || !to || from === to || routeFrom || (selected && selectedBy === 'visitor')) return false;
    const res = findRoute(from, to); if (!res) return false;
    const route = { ...routeOf(from, res), passive: true }; R.route = route; dyn.route(res.path);
    clearTimeout(passiveT); passiveT = setTimeout(() => { if (R.route === route) R.route = null; }, ms);
    return true;
  }

  // ---------- panel ----------
  const roleNote = { 'provincial hub': 'many links, nearly all inside its own module', 'connector hub': 'many links, spread across modules — a bridge', 'global hub': 'links everywhere; the network\'s integrator', 'ultra-peripheral': 'all links inside one module', peripheral: 'mostly inside its module', connector: 'few links, but across modules', kinless: 'links spread evenly, no home module' };
  function renderPanel(n) {
    const col = R.lobeColor(n); let h = '';
    if (n.kind === 'page') {
      h += `<div class="kind"><span class="sw" style="background:${col};color:${col}"></span>${typeName(n)} · ${esc(lobeById[n.lobe].name)}</div>`;
      h += `<h2>${esc(n.title)}</h2><p class="desc">${esc(n.desc || n.intro)}</p>`;
      h += `<div class="meta">${n.updated ? `<span>updated ${esc(n.updated)}</span>` : ''}<span>${plural(n.nSyn, 'synapse')}</span><span>${plural(n.neighbors.length, 'connection')}</span><span>${plural(n.srcNodes.length, 'source')}</span></div>`;
      if (!isChild(n)) {
        const badges = []; if (n.origin) { const oc = window.MBN.originColor(n.origin); badges.push(`<span class="badge mice" style="color:${oc};border-color:${oc}99;background:${oc}14" title="added after the brain was built; signals leaving it travel in this colour">built by ${esc(n.by || n.origin)}</span>`); } if (n.club) badges.push('<span class="badge gold">rich club</span>'); if (n.hub || n.role === 'connector' || n.role === 'kinless') badges.push(`<span class="badge">${esc(n.role)}</span>`); if (n.misfiled) badges.push('<span class="badge warn" title="its connections cluster with another lobe">wired elsewhere</span>');
        h += `<h3>Connectome role</h3>${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}<p class="note-p">${esc(roleNote[n.role] || '')}${n.misfiled ? ` · its connectivity clusters with <b>${esc(lobeById[M.analysis.commMajor.get(n.comm)]?.name || 'another lobe')}</b>` : ''}</p>`;
        h += `<dl class="metrics"><div><dt>strength</dt><dd>${fmt(n.strength, 1)}</dd></div><div><dt>degree</dt><dd>${n.deg}</dd></div><div><dt>betweenness</dt><dd>#${n.bcRank}</dd></div><div><dt>clustering</dt><dd>${fmt(n.cc)}</dd></div><div><dt>participation</dt><dd>${fmt(n.part)}</dd></div><div><dt>module z</dt><dd>${fmt(n.z, 1)}</dd></div></dl>`;
        h += `<div class="actions">${routeFrom === n ? `<button class="btn on" id="route-btn">Click a target neuron… (Esc cancels)</button>` : `<button class="btn" id="route-btn">Route a signal from here</button>`}</div>`;
        if (R.route && R.route.path[R.route.path.length - 1] === n) {
          const rp = R.route; h += `<h3>Route <span>${plural(rp.hops, 'hop')} · ${esc(rp.motif)}${window.MBN.connectome.motifClass(rp.motif) !== rp.motif ? ' · class ' + esc(window.MBN.connectome.motifClass(rp.motif)) : ''}</span></h3><ol class="route">` + rp.path.map(p => `<li class="nb" data-id="${esc(p.id)}"><span class="sw" style="background:${R.lobeColor(p)}"></span><span class="t">${esc(p.title)}${p.club ? ' <span class="badge gold sm">club</span>' : ''}</span></li>`).join('') + `</ol><p class="note-p">${rp.motif.includes('C') ? 'This route travels along the rich club — the brain\'s long-distance backbone (C = club-to-club hop).' : rp.motif.includes('F') ? 'This route feeds through a rich-club hub (F = feeder hop) without running along the club itself.' : rp.hops <= 2 ? 'A local route: the two neurons share a neighbourhood.' : 'A peripheral route that never touches the rich club.'}</p>`;
        }
      }
      const ob = M.D.brains && n.brains && n.brains.length > 1 ? n.brains : null;
      if (ob) h += `<h3>Shared across the network</h3><p class="note-p">This neuron exists in ${ob.map(b => `<b>${esc(M.brainsIn.find(x => x.id === b)?.title || b)}</b>`).join(' and ')}: one definition, both brains\u2019 synapses.</p>`;
      if (n.parent) h += `<h3>Part of</h3><ul><li class="nb" data-id="${esc(n.parent.id)}"><span class="sw" style="background:${R.lobeColor(n.parent)}"></span><span class="t">${esc(n.parent.title)}<span class="note">parent neuron</span></span></li></ul>`;
      if (n.atoms) h += `<h3>Structure <span>${plural(n.atoms.length, 'atom')} · ${plural(n.bondsN = n.bondsN ?? n.atoms.reduce((c, a) => c + a.bonds.length, 0) / 2, 'bond')}</span></h3><p class="note-p">The structural formula unfolds out of this neuron at 0.85×: atoms in CPK colours, bonds as connectors. Click any atom to read it.${n.mol.hiddenH ? ` ${plural(n.mol.hiddenH, 'hydrogen')} folded into the labels.` : ''}</p>`;
      if (n.children.length) h += `<h3>Sub-neurons <span>${n.children.length}</span></h3><ul>` + n.children.map(c => `<li class="nb" data-id="${esc(c.id)}"><span class="sw" style="background:${R.lobeColor(c)}"></span><span class="t">${esc(c.title)}<span class="note">${esc(c.desc || '')}</span></span><span class="w">${c.nSyn}</span></li>`).join('') + `</ul>`;
      if (n.neighbors.length) {
        h += `<h3>Connected neurons <span>by synaptic weight</span></h3><ul>`;
        [...n.neighbors].sort((a, b) => b.l.weff - a.l.weff).forEach(({ n: m, l }) => {
          const note = l.notes && l.notes.length ? l.notes[0] : l.kinds.includes('see-also') ? 'see also' : 'mentioned in a synapse';
          h += `<li class="nb ${dyn.isPruned(l) ? 'pruned' : ''}" data-id="${esc(m.id)}"><span class="sw" style="background:${R.lobeColor(m)}"></span><span class="t">${esc(m.title)}<span class="note">${esc(note)}${l.learn > 0.05 ? ` · <span class="learn">+${fmt(l.learn, 1)} learned</span>` : ''}${l.uses ? ` · ${plural(l.uses, 'trip')}` : ''}${dyn.isPruned(l) ? ' · pruned' : ''}</span></span><span class="w">×${fmt(l.weff, 1)}</span></li>`;
        });
        h += `</ul>`;
      }
      if (n.synNodes.length) {
        const bySection = d3.group(n.synNodes, s => s.section); h += `<h3>Synapses <span>${n.nSyn}</span></h3>`;
        bySection.forEach((list, sec) => { if (bySection.size > 1) h += `<div class="kind" style="margin:8px 0 4px 10px">${esc(sec)}</div>`; h += `<ul>` + list.map(s => `<li class="syn" data-id="${esc(s.id)}"><div class="lead">${esc(s.lead)}</div><div class="txt">${esc(s.text)}</div>${s.links.length ? `<div class="lk">→ ${s.links.map(id => esc(pageById[id]?.title || id)).join(' · ')}</div>` : ''}</li>`).join('') + `</ul>`; });
      }
      const incoming = syns.filter(s => s.links.includes(n.id));
      if (incoming.length) h += `<h3>Synapses pointing here <span>${incoming.length}</span></h3><ul>` + incoming.map(s => `<li class="syn" data-id="${esc(s.id)}"><div class="lead">${esc(pageById[s.page].title)} › ${esc(s.lead)}</div><div class="txt">${esc(s.text.slice(0, 180))}${s.text.length > 180 ? '…' : ''}</div></li>`).join('') + `</ul>`;
      if (n.srcNodes.length) h += `<h3>Sources <span>${n.srcNodes.length}</span></h3><ul>` + n.srcNodes.map(s => `<li class="src"><span class="sk">${esc(srcKindShort(s))}</span>${srcLabel(s)}</li>`).join('') + `</ul>`;
    } else if (n.kind === 'syn') {
      const p = pageById[n.page];
      h += `<div class="kind"><span class="sw" style="background:${col};color:${col}"></span>synapse · ${esc(n.section)}</div><h2>${esc(n.lead)}</h2><p class="desc">${esc(n.text)}</p>`;
      h += `<h3>Belongs to</h3><ul><li class="nb" data-id="${esc(p.id)}"><span class="sw" style="background:${col}"></span><span class="t">${esc(p.title)}</span></li></ul>`;
      if (n.links.length) h += `<h3>Fires toward</h3><ul>` + n.links.map(id => pageById[id] ? `<li class="nb" data-id="${esc(id)}"><span class="sw" style="background:${R.lobeColor(pageById[id])}"></span><span class="t">${esc(pageById[id].title)}</span></li>` : '').join('') + `</ul>`;
      if (n.cites.length) h += `<h3>Sources</h3><ul>` + n.cites.map(u => M.srcById[u] ? `<li class="src"><span class="sk">${esc(srcKindShort(M.srcById[u]))}</span>${srcLabel(M.srcById[u])}</li>` : '').join('') + `</ul>`;
    } else {
      h += `<div class="kind">${esc(srcKindShort(n))}</div><h2>${esc(n.label)}</h2><p class="desc">${esc(n.id)}</p><h3>Cited by</h3><ul>` + n.pageNodes.map(p => `<li class="nb" data-id="${esc(p.id)}"><span class="sw" style="background:${R.lobeColor(p)}"></span><span class="t">${esc(p.title)}</span></li>`).join('') + `</ul>`;
    }
    panelBody.innerHTML = h;
    // connected-neuron and synapse rows are click targets: make them focusable buttons that Enter/Space activate
    panelBody.querySelectorAll('.nb, .syn').forEach(el => { el.setAttribute('role', 'button'); el.tabIndex = 0; el.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); el.click(); }); });
    panelBody.querySelectorAll('.nb').forEach(el => el.addEventListener('click', () => { const m = pageById[el.dataset.id]; if (m) { ensureVisible(m); select(m); } }));
    panelBody.querySelectorAll('.syn').forEach(el => el.addEventListener('click', () => {
      const s = synById[el.dataset.id]; if (!s) return; panelBody.querySelectorAll('.syn').forEach(x => x.classList.remove('active')); el.classList.add('active');
      ensureVisible(s); pulseSyn = s; zoomTo(s, Math.max(view.k, 3.4), 800);
      if (isChild(pageById[s.page]) && L.depthF < 0.97) setTimeout(() => { if (pulseSyn === s) zoomTo(s, Math.max(view.k, 3.4), 700); }, 900);
    }));
    const rb = $('route-btn'); if (rb) rb.addEventListener('click', () => routeFrom === n ? cancelRoute() : startRoute(n));
    panel.scrollTop = 0;
  }
  const ensureLobe = id => { if (!lobeOn[id]) { lobeOn[id] = true; renderLobeList(); rebuild(false); MUI.sync(); } };
  const ensureVisible = n => { if (n.kind === 'page') { if (n.parent) ensureLobe(n.parent.lobe); ensureLobe(n.lobe); } else if (n.kind === 'syn') ensureVisible(pageById[n.page]); };

  // ---------- lobe list ----------
  const lobeList = $('lobe-list'), lobesAside = $('lobes');
  {   // a desktop lobe list cut off by a short window says so: a fade at its foot until it is scrolled to the end
    const sync = () => lobeList.classList.toggle('more-below', lobeList.scrollHeight - lobeList.clientHeight - lobeList.scrollTop > 4);
    lobeList.addEventListener('scroll', sync, { passive: true }); addEventListener('resize', sync);
    new ResizeObserver(sync).observe(lobeList); new MutationObserver(sync).observe(lobeList, { childList: true, subtree: true }); sync();
  }
  document.querySelector('.lobes-head').addEventListener('click', () => { if (lobesAside.classList.contains('folded')) setConnectome(false); else lobesAside.classList.toggle('open'); });
  // one lobe state, two presentations: the desktop list and the phone options bar both go through setLobe
  function setLobe(id, on) {
    if (lobeOn[id] === on) return; lobeOn[id] = on; if (selected && !visible(selected)) clearSelection(); renderLobeList(); rebuild(false); MUI.sync();
    if (L.genome()) { const before = selected; setTimeout(() => { if (selected !== before) return; fitAll(500); }, 350); }   // a shown lobe adds a chromosome, which may shift the karyogram
  }
  function renderLobeList() {
    lobeList.innerHTML = lobes.map(l => { const ps = pages.filter(p => p.lobe === l.id && !isChild(p)); return `<button class="lobe ${lobeOn[l.id] ? '' : 'off'}" data-id="${esc(l.id)}" aria-pressed="${lobeOn[l.id]}" style="color:${lobeOn[l.id] ? 'var(--text)' : ''}"><span class="sw" style="background:${esc(l.color)};color:${esc(l.color)}"></span><span>${l.origin ? `<i class="mice-dot" style="background:${window.MBN.originColor(l.origin)};box-shadow:0 0 6px ${window.MBN.originColor(l.origin)}" title="built by ${esc(l.by || l.origin)}"></i>` : ''}${esc(l.name)}</span><span class="n">${ps.length}</span></button>`; }).join('');
    lobeList.querySelectorAll('.lobe').forEach(b => b.addEventListener('click', () => setLobe(b.dataset.id, !lobeOn[b.dataset.id])));   // a shown lobe adds a chromosome, which may sit outside the current view; a newer selection wins
  }
  $('explode-all').addEventListener('change', e => { forceExplode = e.target.checked; updateLevel(); });
  // a page may offer a button that travels to the brain's centre and explodes it into its synapses (Atomic: "Split the atom")
  // A page's hub action: a link travels to its split view (Atomic → particles.html); a button focuses and explodes the hub in place.
  document.querySelectorAll('[data-split-hub]:not([href])').forEach(b => b.addEventListener('click', () => { const hub = pages.find(p => p.isCenter); if (!hub) return; ensureVisible(hub); select(hub); }));
  // refresh-rate preference (Auto · 60 Hz · Native), injected so every brain page gets it from one place
  const perfWrap = document.createElement('label'); perfWrap.className = 'switch perf';
  perfWrap.innerHTML = `<span id="perf-label">Refresh rate</span><select id="perf-refresh" aria-label="Refresh rate"><option value="auto">Auto</option><option value="60">60 Hz</option><option value="native">Native</option></select>`;
  (document.querySelector('#lobes .switches') || lobesAside).appendChild(perfWrap);
  const perfSel = $('perf-refresh'); perfSel.value = ['auto', '60', 'native'].includes(perf.refresh) ? perf.refresh : 'auto';
  function updatePerfLabel() { const auto = coarse ? 60 : nativeHz; const oa = perfSel.querySelector('option[value=auto]'), on = perfSel.querySelector('option[value=native]'); if (oa) oa.textContent = `Auto · ${auto} Hz`; if (on) on.textContent = `Native · ${nativeHz} Hz`; perfSel.title = `Drawing at ${refreshCap() || nativeHz} Hz`; }
  perfSel.addEventListener('change', () => { perf.refresh = perfSel.value; savePerf(); updatePerfLabel(); toast(perf.refresh === 'native' ? `Drawing at the display's native ${nativeHz} Hz` : perf.refresh === '60' ? 'Capped at 60 Hz' : 'Auto: 60 Hz on touch devices, native elsewhere'); });
  updatePerfLabel();
  $('cocite').addEventListener('change', e => { showCocite = e.target.checked; rebuild(false); });

  // ---------- connectome panel ----------
  const A = M.analysis, sw = A.smallWorld;
  function renderConnectome() {
    const hubs = pages.filter(p => p.hub && !isChild(p)).sort((a, b) => b.strength - a.strength);
    const club = [...A.club.members].sort((a, b) => b.strength - a.strength);
    const conn = hubs.filter(p => p.part > 0.3);
    $('cx-body').innerHTML = `
      <dl class="metrics wide">
        <div><dt>neurons</dt><dd>${sw ? sw.n : pages.length}</dd></div><div><dt>wires</dt><dd id="cx-wires">${sw ? sw.m : 0}</dd></div>
        <div><dt>density</dt><dd>${sw ? (sw.density * 100).toFixed(1) + '%' : '–'}</dd></div><div><dt>mean degree</dt><dd>${sw ? fmt(sw.kMean, 1) : '–'}</dd></div>
        <div title="mean local clustering vs. a random graph of the same size (γ)"><dt>clustering <span class="g">γ</span></dt><dd>${sw ? fmt(sw.gamma, 1) : '–'}</dd></div>
        <div title="characteristic path length vs. random (λ); ~1 means short paths"><dt>path length <span class="g">λ</span></dt><dd>${sw ? fmt(sw.lambda) : '–'}</dd></div>
        <div title="small-world index σ = γ/λ; above 1 means clustered but short"><dt>small-world <span class="g">σ</span></dt><dd class="${sw && sw.sigma > 1 ? 'good' : ''}">${sw ? fmt(sw.sigma, 1) : '–'}</dd></div>
        <div title="modularity Q of the detected communities"><dt>modularity Q</dt><dd>${fmt(A.communities.Q)}</dd></div>
        <div title="detected communities vs. configured lobes"><dt>communities</dt><dd>${A.communities.count} <span class="dim">/ ${lobes.filter(l => !M.selfLobe(l)).length} lobes</span></dd></div>
        <div title="share of link weight that stays inside a lobe"><dt>lobe fidelity</dt><dd>${(A.lobeFidelity * 100).toFixed(0)}%</dd></div>
        <div title="density among the top-strength neurons vs. the whole network"><dt>rich club</dt><dd>${fmt(A.club.ratio, 1)}× <span class="dim">(${club.length})</span></dd></div>
        <div title="total wire length of the visible neuron graph, in map units"><dt>wiring cost</dt><dd id="cx-wire">–</dd></div>
      </dl>
      <h4>Rich club <span>${club.length}</span></h4><ul class="chips">${club.slice(0, 8).map(p => `<li class="chip gold" data-id="${esc(p.id)}">${esc(p.title)}</li>`).join('')}</ul>
      <h4>Connector hubs <span>${conn.length}</span></h4><ul class="chips">${conn.slice(0, 8).map(p => `<li class="chip" data-id="${esc(p.id)}">${esc(p.title)}</li>`).join('') || '<li class="dim">none at this threshold</li>'}</ul>
      ${A.misfiled.length ? `<h4>Wired elsewhere <span>${A.misfiled.length}</span></h4><p class="note-p">Neurons whose connections cluster with a different lobe than the one they were filed in.</p><ul class="chips">${A.misfiled.slice(0, 6).map(p => `<li class="chip warn" data-id="${esc(p.id)}">${esc(p.title)}</li>`).join('')}</ul>` : ''}
      <h4>Learned <span id="cx-learned">${Object.keys(dyn.learned).length}</span></h4><p class="note-p" id="cx-learned-note">${learnedNote()}</p>`;
    $('cx-body').querySelectorAll('.chip[data-id]').forEach(el => el.addEventListener('click', () => { const p = pageById[el.dataset.id]; if (p) { ensureVisible(p); select(p); } }));
  }
  const learnedNote = () => { const n = Object.keys(dyn.learned).length; return n ? `${plural(n, 'synapse')} strengthened by your attention (gold wires). They fade 3% a day unless revisited.` : 'Travel between connected neurons and the synapses you use grow stronger (gold wires). ' + (dyn.store ? 'Stored only in this browser.' : 'Not persisted in this preview.'); };
  function updateLive() { const w = $('cx-wire'); if (w) w.textContent = Math.round(L.wiringCost() / 100) / 10 + 'k'; const lw = $('cx-learned'); if (lw) lw.textContent = Object.keys(dyn.learned).length; }
  dyn.onLearn = () => { const n = $('cx-learned-note'); if (n) n.textContent = learnedNote(); if (selected) renderPanel(selected); L.refreshForces(); if (L.sim.alpha() < 0.1) L.sim.alpha(0.1).restart(); };
  // the left column is shared: opening the connectome folds the lobe list down to its header (and vice versa)
  function setConnectome(open) { const cx = $('connectome'); cx.classList.toggle('open', open); $('cx-head').setAttribute('aria-expanded', open); lobesAside.classList.toggle('folded', open); if (open) { const lb = lobesAside.getBoundingClientRect(); cx.style.maxHeight = Math.max(220, R.H - lb.bottom - 36) + 'px'; } else cx.style.maxHeight = ''; }
  $('cx-head').addEventListener('click', () => setConnectome(!$('connectome').classList.contains('open')));
  $('tg-activity').addEventListener('change', e => { dyn.enabled.activity = e.target.checked; });
  $('tg-learning').addEventListener('change', e => { dyn.enabled.learning = e.target.checked; });
  $('tg-communities').addEventListener('change', e => { R.showCommunities = e.target.checked; renderLobeList(); });
  $('tg-hubs').addEventListener('change', e => { R.showHubs = e.target.checked; });
  const pruneIn = $('prune'), pruneOut = $('prune-out');
  pruneIn.addEventListener('input', () => { const v = pruneIn.value / 100; dyn.setPrune(v); pruneOut.textContent = v >= 0.999 ? 'all wires' : `strongest ${Math.round(v * 100)}%`; L.refreshForces(); L.sim.alpha(0.4).restart(); if (selected) renderPanel(selected); });
  $('reset-learning').addEventListener('click', () => { dyn.reset(); dyn.onLearn(); toast('Learned weights cleared'); });
  let toastT = 0; function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

  // ---------- level / hint / stats ----------
  const levelText = $('level-text'), levelDot = document.querySelector('#level .dot'), hint = $('hint');
  const subLevel = D.subName ? D.subName[0].toUpperCase() + D.subName.slice(1) + 's' : 'Sub-neurons';
  const lvlName = () => forceExplode || view.k >= 1.5 ? 'Synapses' : hasSubs && view.k >= 0.85 ? subLevel : view.k >= 0.6 ? 'Neurons' : 'Lobes';
  function updateLevel() { const lvl = lvlName(); levelText.textContent = lvl + ` · ${view.k.toFixed(1)}×`; const c = lvl === 'Synapses' ? '#ffffff' : lvl === subLevel ? '#fbbf24' : lvl === 'Neurons' ? '#ff8a3d' : '#4fd1c5'; levelDot.style.background = c; levelDot.style.boxShadow = `0 0 12px ${c}`; MUI.level(levelText.textContent, c); updateHint(); }
  function updateHint() {
    const lvl = lvlName(), pinned = pages.filter(n => n.pinned).length;
    if (routeFrom) { hint.textContent = `routing from ${routeFrom.title} · click the target neuron · Esc cancels`; return; }
    if (multi.size > 1) { hint.textContent = `${multi.size} neurons selected · drag one to move them all · Shift+click adds · Esc clears${pinned ? ' · R releases pins' : ''}`; return; }
    if (pinned && lvl === 'Lobes') { hint.textContent = `${plural(pinned, 'neuron')} placed by hand · R releases them`; return; }
    if (L.genome() && lvl === 'Lobes') { hint.textContent = 'genome layout · each bar is a lobe, each band a neuron · G returns to the neural layout'; return; }
    if (coarse) { hint.textContent = lvl === 'Lobes' ? 'tap a neuron to travel · pinch to zoom · double-tap to zoom in' : lvl === 'Neurons' ? 'tap a neuron to travel · keep pinching: synapses at 1.5×' : 'dots are facts · diamonds are sources · tap to open'; return; }
    hint.textContent = lvl === 'Lobes' ? (mode === 'select' ? 'scroll to zoom · drag to select · Space to pan · gold rings are the rich club' : 'scroll to zoom · drag to pan · click a neuron · V for select mode')
      : lvl === 'Neurons' ? (hasSubs ? `keep zooming: ${M.hasMol ? 'molecules unfold' : 'sub-neurons unfold'} at 0.85×, synapses at 1.5× · bright wires are strong synapses` : 'keep zooming: synapses explode at 1.5× · bright wires are strong synapses')
      : lvl === subLevel ? (M.hasMol ? 'structural formulas unfold out of their neurons · click an atom · zoom past 1.5× to explode synapses' : 'small satellites are sub-neurons · zoom past 1.5× to explode synapses') : 'dots are facts · diamonds are sources · dashed lines fire across neurons';
  }
  function updateStats() {
    const vp = pages.filter(visible), subs = vp.filter(isChild).length, pp = L.activeLinks.filter(l => l.kind === 'pp' && !dyn.isPruned(l)).length, ns = d3.sum(vp, p => p.nSyn);
    $('stats').innerHTML = `<b>${vp.length - subs}</b> ${D.brain === 'dna' ? 'visible ' : ''}${pw(vp.length - subs, 'neuron')}${subs ? ` · <b>${subs}</b> ${pw(subs, subWord)}` : ''} · <b>${ns}</b> ${pw(ns, 'synapse')}<br><b>${pp}</b> ${pw(pp, 'connection')} · <b>${srcs.filter(visible).length}</b> ${pw(srcs.filter(visible).length, 'source')}`;
  }

  // ---------- zoom controls & tools ----------
  $('z-in').addEventListener('click', () => d3.select(canvas).transition().duration(350).call(zoom.scaleBy, 1.6));
  $('z-out').addEventListener('click', () => d3.select(canvas).transition().duration(350).call(zoom.scaleBy, 1 / 1.6));
  $('z-fit').addEventListener('click', () => { clearSelection(); fitAll(); });
  document.querySelectorAll('.tool-mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('release-pins').addEventListener('click', releaseAll);
  canvas.classList.add('select');
  // labels toggle + screenshot: two tool buttons (same markup as the canonical renderer), injected so no page markup changes
  const toolsEl = $('tools');
  if (toolsEl && !$('labels-toggle')) toolsEl.insertAdjacentHTML('beforeend', `<button id="labels-toggle" title="Labels on/off (L): when off, only the neuron or lobe under the cursor keeps its label" aria-label="Toggle labels" aria-pressed="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg></button>
    <button id="shot" title="Screenshot (S): save the current view as a PNG" aria-label="Save a screenshot"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg></button>`);
  // the tool button and a "Labels" switch in the lobes panel drive the same state
  const switches = document.querySelector('#lobes .switches');
  if (switches && !$('labels')) { const l = document.createElement('label'); l.className = 'switch'; l.innerHTML = '<input type="checkbox" id="labels" checked><span>Labels</span>'; switches.prepend(l); }
  function setLabels(on) {
    labelsOn = on;
    const b = $('labels-toggle'); if (b) { b.classList.toggle('off', !on); b.setAttribute('aria-pressed', String(on)); }
    const c = $('labels'); if (c) c.checked = on;
    MUI.sync();   // the phone chip follows the L key and the tool button (MUI is built further down in start(); setLabels only runs from events after boot)
    flash(on ? 'labels on' : `labels off · ${coarse ? 'tap' : 'hover'} a neuron or lobe to read it`);
  }
  $('labels-toggle')?.addEventListener('click', () => setLabels(!labelsOn));
  $('labels')?.addEventListener('change', e => setLabels(e.target.checked));
  // screenshot: the canvas on the page background, with a small caption; saved as mindblown-<slug>-YYYYMMDD-HHMM.png. Returns the PNG as a data URL.
  function screenshot() {
    const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
    const o = out.getContext('2d');
    const g = o.createRadialGradient(out.width / 2, out.height * 0.45, 0, out.width / 2, out.height * 0.45, Math.max(out.width, out.height) * 0.7);
    g.addColorStop(0, '#0e1322'); g.addColorStop(1, '#06080f'); o.fillStyle = g; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(canvas, 0, 0);
    const title = (document.querySelector('.brand .title') || {}).textContent || D.title || 'MindBlown';
    o.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); o.textBaseline = 'alphabetic'; o.textAlign = 'left';
    o.font = `500 ${12}px 'Satoshi', sans-serif`; o.fillStyle = 'rgba(167,178,204,0.85)';
    o.fillText(`${title} · ${levelText.textContent} · ${new Date().toISOString().slice(0, 10)}`, 16, R.H - 14);
    const d = new Date(), p2 = v => String(v).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
    const slug = String(D.brain || D.title || 'brain').toLowerCase().replace(/^mindblown[-_: ]*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brain';
    const name = `mindblown-${slug}-${stamp}.png`;
    const dataUrl = out.toDataURL('image/png');
    out.toBlob(blob => {
      if (!blob) { flash('screenshot failed'); return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); flash(`saved ${name}`);
    }, 'image/png');
    return dataUrl;
  }
  $('shot')?.addEventListener('click', () => screenshot());
  // a short message in the level pill's hint slot
  let flashT = 0; function flash(msg) { hint.textContent = msg; clearTimeout(flashT); flashT = setTimeout(() => updateHint(), 2200); }
  // ---------- genome layout (G) ----------
  // a tool button, a "Genome layout" switch in the lobes panel and the G key drive the same state; the hash carries #layout=genome so a link can open the karyogram
  const layoutBtn = document.createElement('button'); layoutBtn.id = 'layout-toggle'; layoutBtn.setAttribute('aria-label', 'Toggle genome layout'); layoutBtn.setAttribute('aria-pressed', 'false');
  layoutBtn.title = 'Genome layout (G): arrange the brain like a karyogram — lobes as chromosomes, neurons as bands' + (M.brainsIn ? ', each hub at its centromere' : ', the hub above the map');
  layoutBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5c-1.6 0-2.5 1-2.5 2.5v3.6c0 1 .7 1.6 1.4 2.1-.7.5-1.4 1.1-1.4 2.1V18c0 1.5.9 2.5 2.5 2.5s2.5-1 2.5-2.5v-4.2c0-1-.7-1.6-1.4-2.1.7-.5 1.4-1.1 1.4-2.1V6c0-1.5-.9-2.5-2.5-2.5z"/><path d="M17 3.5c-1.6 0-2.5 1-2.5 2.5v5.2c0 1 .7 1.6 1.4 2.1-.7.5-1.4 1.1-1.4 2.1V18c0 1.5.9 2.5 2.5 2.5s2.5-1 2.5-2.5v-2.6c0-1-.7-1.6-1.4-2.1.7-.5 1.4-1.1 1.4-2.1V6c0-1.5-.9-2.5-2.5-2.5z"/><path d="M4.5 7.5h5M4.5 16h5M14.5 8.5h5M14.5 17h5"/></svg>';
  $('release-pins').after(layoutBtn);
  if (switches) { const g = document.createElement('label'); g.className = 'switch'; g.innerHTML = '<input type="checkbox" id="layout-genome"><span>Genome layout</span>'; const act = switches.querySelector('.hub-act'); act ? act.after(g) : switches.prepend(g); }   // a page's hub action stays first
  function setLayout(l, opts = {}) {
    const changed = L.setMode(l); const g = L.genome();
    layoutBtn.classList.toggle('on', g); layoutBtn.setAttribute('aria-pressed', String(g));
    const c = $('layout-genome'); if (c) c.checked = g;
    MUI.sync();
    if (!changed) return;
    // hand-placed pins would fight the loci, so both directions start from free neurons; the selected neuron keeps its pin in the neural layout
    pages.forEach(n => { n.pinned = false; n.fx = null; n.fy = null; });
    if (!g && selected && selected.kind === 'page' && !isChild(selected)) { selected.fx = selected.x; selected.fy = selected.y; }
    rebuild(false); L.sim.alpha(0.9).restart();
    if (history.replaceState) { try { const rest = location.hash.replace(/^#/, '').split('&').filter(x => x && x !== 'layout=genome'); if (g) rest.push('layout=genome'); history.replaceState(null, '', location.pathname + location.search + (rest.length ? '#' + rest.join('&') : '')); } catch (e) { } }
    if (!opts.silent) { toast(g ? 'genome layout · chromosomes are lobes, bands are neurons' + (M.brainsIn ? ', each hub sits at its centromere' : ', the hub sits above the karyogram') : 'neural layout'); if (!opts.noFit) { const before = selected; setTimeout(() => { if (selected !== before) return; clearSelection(); fitAll(1100); }, 350); } }   // fit once the pages have moved toward their new places, unless the reader has already picked a neuron
    updateHint();
  }
  layoutBtn.addEventListener('click', () => setLayout(L.genome() ? 'neural' : 'genome'));
  $('layout-genome')?.addEventListener('change', e => setLayout(e.target.checked ? 'genome' : 'neural'));
  // the karyogram picks its row count from the viewport aspect, so once the shape drifts far from the one it was laid out for (a rotation, or a long window drag) it re-lays out and refits
  window.addEventListener('resize', () => { if (!L.genome() || Math.abs(R.W / Math.max(1, R.H) - L.layoutAspect) <= 0.25) return; pages.forEach(n => { if (n.pinned) { n.pinned = false; n.fx = null; n.fy = null; } }); rebuild(false); L.refreshForces(); L.sim.alpha(0.6).restart(); setTimeout(() => fitAll(500), 350); });

  // ---------- search ----------
  const q = $('q'), results = $('results'); let resultItems = [], activeIdx = -1;
  // Search results behave as a combobox listbox: keep aria-expanded / aria-activedescendant on the input in sync.
  const hideResults = () => { results.hidden = true; activeIdx = -1; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); };
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase(); if (term.length < 2) { hideResults(); return; } const hits = [];
    pages.forEach(p => { if (p.isAtom) return; const t = p.title.toLowerCase(); if (t.includes(term)) hits.push({ n: p, score: (t === term ? 0 : t.startsWith(term) ? 1 : 2) + t.length / 1000 }); else if (Array.isArray(p.aka) && p.aka.some(a => String(a).toLowerCase().includes(term))) hits.push({ n: p, score: 1.5 }); else if ((p.desc || '').toLowerCase().includes(term)) hits.push({ n: p, score: 5 }); });
    syns.forEach(s => { const l = s.lead.toLowerCase(); if (l.includes(term)) hits.push({ n: s, score: 3 }); else if (s.text.toLowerCase().includes(term)) hits.push({ n: s, score: 6 }); });
    hits.sort((a, b) => a.score - b.score); resultItems = hits.slice(0, 9).map(h => h.n);
    results.innerHTML = resultItems.length ? resultItems.map((n, i) => n.kind === 'page'
      ? `<li id="search-result-${i}" role="option" aria-selected="false"><span class="sw" style="background:${R.lobeColor(n)}"></span><span><span class="rt">${esc(n.title)}</span><span class="rs">${isChild(n) ? subWord + ' of ' + esc(n.parent.title) : typeName(n) + ' · ' + esc(lobeById[n.lobe].name)} · ${plural(n.nSyn, 'synapse')}${roleShort(n) ? ' · ' + esc(roleShort(n)) : ''}</span></span></li>`
      : `<li id="search-result-${i}" role="option" aria-selected="false"><span class="sw" style="background:${R.lobeColor(n)};opacity:.6"></span><span><span class="rt">${esc(n.lead)}</span><span class="rs">synapse of ${esc(pageById[n.page].title)}</span></span></li>`).join('')
      : `<li><span class="empty">Nothing fires for “${esc(q.value)}”</span></li>`;
    results.hidden = false; activeIdx = -1; q.setAttribute('aria-expanded', 'true'); q.removeAttribute('aria-activedescendant'); results.querySelectorAll('li[role=option]').forEach((li, i) => li.addEventListener('click', () => choose(i)));
  });
  q.addEventListener('keydown', e => { if (results.hidden) return; if (e.key === 'ArrowDown') { activeIdx = Math.min(activeIdx + 1, resultItems.length - 1); mark(); e.preventDefault(); } else if (e.key === 'ArrowUp') { activeIdx = Math.max(activeIdx - 1, 0); mark(); e.preventDefault(); } else if (e.key === 'Enter') choose(Math.max(activeIdx, 0)); });
  const mark = () => { const opts = results.querySelectorAll('li[role=option]'); opts.forEach((li, i) => { const active = i === activeIdx; li.classList.toggle('active', active); li.setAttribute('aria-selected', String(active)); }); if (opts[activeIdx]) q.setAttribute('aria-activedescendant', opts[activeIdx].id); else q.removeAttribute('aria-activedescendant'); };
  const choose = i => { const n = resultItems[i]; if (!n) return; ensureVisible(n); hideResults(); q.blur(); if (routeFrom && n.kind === 'page' && routeFrom !== n) routeTo(n); else select(n); };   // picking a result while routing completes the route, as a canvas click does
  document.addEventListener('click', e => { if (!e.target.closest('.search')) hideResults(); });

  // ---------- mobile options bar + sheet detents (phones only; the DOM is built here so all brain pages get it) ----------
  // Strategy §6.3 / Spec §5: a bottom bar with a 44 px handle row (lobe pill · level · customize), a lobe row whose chips carry a
  // checkbox (show/hide) and a name (travel to the lobe), and an options row proxying the desktop switches. The detail sheet gets
  // peek / half / full detents with a drag handle. Everything persists per brain in localStorage under mbn:ui:<brain>.
  const MUI = (() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const uiKey = brainKey.replace(/^mbn:/, 'mbn:ui:');
    const defaults = { expanded: true, startExpanded: true, tapTravel: true, haptics: true, lobeOrder: 'brain', rememberLobes: false, hiddenLobes: [], optionOrder: null, hiddenOptions: [], lastPrune: 60, lastRefresh: 'native' };
    const ui = Object.assign({}, defaults, (() => { try { return JSON.parse(perfStore?.getItem(uiKey) || '{}'); } catch (e) { return {}; } })());
    if (!Array.isArray(ui.hiddenLobes)) ui.hiddenLobes = []; if (!Array.isArray(ui.hiddenOptions)) ui.hiddenOptions = [];   // an older or external writer may have stored another shape
    const save = () => { try { perfStore?.setItem(uiKey, JSON.stringify(ui)); } catch (e) { } };
    const buzz = ms => { if (ui.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } } };
    const proxy = (id, label) => ({ id, label, input: $(id), get() { return !!this.input?.checked; }, set(v) { if (!this.input) return; this.input.checked = v; this.input.dispatchEvent(new Event('change', { bubbles: true })); } });
    const hubBtn = document.querySelector('[data-split-hub]');   // a page's "Split the atom"-style action rides along as a plain chip
    const pageActs = [...document.querySelectorAll('[data-page-action]')];   // other page-level buttons (e.g. Babel's "Ask the Librarian") ride along the same way
    const options = [
      ...(hubBtn ? [{ id: 'split-hub', label: hubBtn.textContent.trim(), action: () => hubBtn.click() }] : []),
      ...pageActs.map(b => ({ id: 'act-' + (b.dataset.pageAction || b.id), label: b.textContent.trim(), action: () => b.click() })),
      { id: 'tap', label: 'Tap travels', get: () => ui.tapTravel, set: v => { ui.tapTravel = v; save(); } },
      proxy('layout-genome', 'Genome layout'),
      proxy('explode-all', 'Explode all'),
      proxy('tg-activity', 'Spiking'),
      proxy('tg-learning', 'Learning'),
      proxy('cocite', 'Shared sources'),
      proxy('tg-communities', 'Communities'),
      proxy('tg-hubs', 'Hub rings'),
      proxy('labels', 'Labels'),
      { id: 'shot', label: 'Screenshot', action: true, get: () => false, set() { }, run: () => { const dataUrl = screenshot(); return !!dataUrl; } },   // an action chip: no checkbox, one tap saves the PNG (same as the S key / tool button)
      { id: 'prune', label: 'Prune', popover: 'prune', get: () => pruneIn.value < 100, set(v) { if (!v) ui.lastPrune = Math.min(99, +pruneIn.value || 60); setPrune(v ? ui.lastPrune : 100); save(); } },
      { id: 'refresh', label: 'Refresh', popover: 'refresh', get: () => perf.refresh !== 'auto', set(v) { if (!v && perf.refresh !== 'auto') ui.lastRefresh = perf.refresh; setRefresh(v ? ui.lastRefresh : 'auto'); save(); } },
    ];
    const optById = Object.fromEntries(options.map(o => [o.id, o]));
    const setPrune = v => { pruneIn.value = v; pruneIn.dispatchEvent(new Event('input', { bubbles: true })); };
    const setRefresh = v => { perfSel.value = v; perfSel.dispatchEvent(new Event('change', { bubbles: true })); };
    const orderedOptions = () => { const order = Array.isArray(ui.optionOrder) ? ui.optionOrder : []; const seen = new Set(); const out = []; order.concat(options.map(o => o.id)).forEach(id => { if (optById[id] && !seen.has(id)) { seen.add(id); out.push(optById[id]); } }); return out; };
    const orderedLobes = () => { const ls = lobes.slice(); if (ui.lobeOrder === 'alpha') ls.sort((a, b) => a.name.localeCompare(b.name)); else if (ui.lobeOrder === 'size') ls.sort((a, b) => count(b) - count(a)); return ls; };
    const count = l => pages.filter(p => p.lobe === l.id && !isChild(p)).length;

    // ----- DOM -----
    const bar = document.createElement('div'); bar.id = 'mbar'; bar.className = 'mbar'; bar.setAttribute('aria-label', 'Lobes and options');
    bar.innerHTML = `<div class="mbar-handle"><button class="mbar-pill" aria-expanded="true"><span class="n"></span></button><span class="mbar-level"><span class="dot"></span><span class="t"></span></span><button class="mbar-custom" aria-label="Customize bar">⋯</button></div><div class="mbar-rows"><div class="mbar-row lobes" role="group" aria-label="Lobes"></div><div class="mbar-row opts" role="group" aria-label="Options"></div></div>`;
    document.body.appendChild(bar);
    const pill = bar.querySelector('.mbar-pill'), pillN = pill.querySelector('.n'), lvlDot = bar.querySelector('.mbar-level .dot'), lvlT = bar.querySelector('.mbar-level .t');
    const rowL = bar.querySelector('.mbar-row.lobes'), rowO = bar.querySelector('.mbar-row.opts');
    const pop = document.createElement('div'); pop.className = 'mbar-pop'; pop.hidden = true; document.body.appendChild(pop);
    const sheet = document.createElement('div'); sheet.id = 'mbar-custom'; sheet.className = 'mbar-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Customize bar'); document.body.appendChild(sheet);
    const scrim = document.createElement('div'); scrim.className = 'mbar-scrim'; scrim.hidden = true; document.body.appendChild(scrim);

    let solo = null;   // { id, prev: {lobeId: bool} } while one lobe is soloed by long-press
    const chip = (cls, id, label, on, extra = '', action = false) => `<div class="chip ${cls} ${on ? 'on' : ''}" data-id="${esc(id)}">${action ? '' : `<label class="chk"><input type="checkbox" ${on ? 'checked' : ''} aria-label="Show ${esc(label)}"></label>`}<button class="go">${extra}<span class="lbl">${esc(label)}</span></button></div>`;
    function renderLobes() {
      rowL.innerHTML = orderedLobes().map(l => chip('lobe-chip', l.id, l.name, lobeOn[l.id], `<span class="sw" style="background:${esc(l.color)};color:${esc(l.color)}"></span>`) + '').join('');
      rowL.querySelectorAll('.chip').forEach(c => {
        const id = c.dataset.id, l = lobeById[id]; c.querySelector('.go').insertAdjacentHTML('beforeend', `<span class="n">${count(l)}</span>`);
        c.querySelector('input').addEventListener('change', e => { buzz(6); setLobe(id, e.target.checked); rememberLobes(); });
        longPress(c.querySelector('.go'), () => { buzz(12); ensureLobe(id); rememberLobes(); fitLobe(id); }, () => { buzz(20); toggleSolo(id); });   // revealing a lobe by tapping its name persists like a checkbox would
      });
      const on = lobes.filter(l => lobeOn[l.id]).length; pillN.textContent = `Lobes · ${on} of ${lobes.length}`;
    }
    function renderOptions() {
      const hidden = new Set(ui.hiddenOptions);
      rowO.innerHTML = orderedOptions().filter(o => !hidden.has(o.id)).map(o => chip('opt' + (o.popover ? ' has-pop' : '') + (o.action ? ' act' : ''), o.id, o.label, !o.action && o.get(), '', !!o.action)).join('');
      rowO.querySelectorAll('.chip').forEach(c => {
        const o = optById[c.dataset.id];
        c.querySelector('input')?.addEventListener('change', e => { buzz(6); o.set(e.target.checked); syncOptions(); });
        c.querySelector('.go').addEventListener('click', () => { buzz(6); if (o.action) { c.classList.add('busy'); setTimeout(() => c.classList.remove('busy'), 600); (typeof o.action === 'function' ? o.action : o.run)(); } else if (o.popover) openPopover(o, c); else { o.set(!o.get()); syncOptions(); } });
      });
    }
    function syncOptions() { rowO.querySelectorAll('.chip').forEach(c => { const o = optById[c.dataset.id]; if (o.action) return; const on = o.get(); c.classList.toggle('on', on); const i = c.querySelector('input'); if (i) i.checked = on; }); }
    // desktop switches flipped elsewhere keep the chips honest
    options.forEach(o => { if (o.input) o.input.addEventListener('change', syncOptions); }); pruneIn.addEventListener('input', syncOptions); perfSel.addEventListener('change', syncOptions);

    function longPress(el, onTap, onHold) {
      let t = 0, held = false, sx = 0, sy = 0;
      el.addEventListener('pointerdown', e => { held = false; sx = e.clientX; sy = e.clientY; clearTimeout(t); t = setTimeout(() => { held = true; onHold(); }, 450); });
      el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(t); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
      el.addEventListener('click', e => { if (held) { e.preventDefault(); held = false; return; } onTap(); });
      el.addEventListener('contextmenu', e => e.preventDefault());
    }
    function toggleSolo(id) {
      if (solo && solo.id === id) { Object.entries(solo.prev).forEach(([k, v]) => setLobe(k, v)); solo = null; toast('All lobes restored'); }
      else { solo = { id, prev: { ...lobeOn } }; lobes.forEach(l => setLobe(l.id, l.id === id)); fitLobe(id); toast(`Only ${lobeById[id].name} · hold again to restore`); }
      rememberLobes();
    }
    const rememberLobes = () => { if (ui.rememberLobes) { ui.hiddenLobes = lobes.filter(l => !lobeOn[l.id]).map(l => l.id); save(); } };
    // travel so the whole lobe fits between the header and whatever covers the bottom of the screen
    function fitLobe(id) {
      const ps = pages.filter(p => p.lobe === id && !isChild(p) && visible(p)); if (!ps.length) return;
      const xs = ps.map(p => p.x), ys = ps.map(p => p.y), pad = 90;
      const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
      const headH = $('top')?.getBoundingClientRect().bottom || 0, botH = Math.max(barHeight(), panel.hidden ? 0 : panel.offsetHeight);
      const availH = Math.max(120, R.H - headH - botH - 24), availW = Math.max(120, R.W - 24);
      const kk = Math.max(0.3, Math.min(2.2, Math.min(availW / (maxX - minX), availH / (maxY - minY))));
      zoomTo({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, kk, undefined, botH);   // the lobe fits above the bar (or the sheet if one is open), not a pending sheet
    }

    // ----- popovers (prune slider, refresh segmented control) -----
    function openPopover(o, anchor) {
      if (!pop.hidden && pop.dataset.id === o.id) { closePopover(); return; }
      pop.dataset.id = o.id;
      if (o.popover === 'prune') {
        pop.innerHTML = `<div class="ph">Prune wires <span class="pv"></span></div><input type="range" min="10" max="100" step="5" aria-label="Prune wires">`;
        const r = pop.querySelector('input'), pv = pop.querySelector('.pv'); const show = () => { pv.textContent = r.value >= 100 ? 'all wires' : `strongest ${r.value}%`; }; r.value = pruneIn.value; show();
        r.addEventListener('input', () => { setPrune(+r.value); if (r.value < 100) { ui.lastPrune = +r.value; save(); } show(); syncOptions(); });
      } else {
        const hz = nativeHz;
        pop.innerHTML = `<div class="ph">Refresh rate</div><div class="seg">${[['auto', 'Auto'], ['60', '60 Hz'], ['native', hz ? `Native ${hz} Hz` : 'Native']].map(([v, t]) => `<button data-v="${v}" class="${perf.refresh === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
        pop.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { setRefresh(b.dataset.v); if (b.dataset.v !== 'auto') { ui.lastRefresh = b.dataset.v; save(); } pop.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); syncOptions(); }));
      }
      pop.hidden = false; const a = anchor.getBoundingClientRect(), pw = pop.offsetWidth;
      pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, a.left + a.width / 2 - pw / 2)) + 'px'; pop.style.bottom = (window.innerHeight - bar.getBoundingClientRect().top + 8) + 'px';   // above the whole bar, never over the handle row
    }
    const closePopover = () => { pop.hidden = true; pop.dataset.id = ''; };
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.chip.has-pop')) closePopover(); }, true);

    // ----- expanded / collapsed bar -----
    function setExpanded(v) { ui.expanded = v; save(); bar.classList.toggle('collapsed', !v); pill.setAttribute('aria-expanded', String(v)); closePopover(); applyHeight(); }
    pill.addEventListener('click', () => { buzz(6); setExpanded(!ui.expanded); });
    swipe(bar.querySelector('.mbar-handle'), dy => { if (dy < -24) setExpanded(true); else if (dy > 24) setExpanded(false); });
    function swipe(el, done) { let y0 = null; el.addEventListener('pointerdown', e => { y0 = e.clientY; }); el.addEventListener('pointerup', e => { if (y0 != null) done(e.clientY - y0); y0 = null; }); el.addEventListener('pointercancel', () => { y0 = null; }); }
    const barHeight = () => (mq.matches && bar.style.display !== 'none' && !bar.hidden) ? bar.offsetHeight : 0;
    // --mbar-h is whatever covers the bottom of the screen right now (bar, or the open sheet); the zoom buttons ride on top of it
    function applyHeight() { const open = !panel.hidden && mq.matches; document.documentElement.style.setProperty('--mbar-h', (!mq.matches ? 0 : open ? detentPx(detent) : bar.offsetHeight) + 'px'); document.body.classList.toggle('sheet-full', open && detent === 'full'); }

    // ----- detail sheet detents -----
    const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'sheet-handle'; handle.innerHTML = '<span></span>'; handle.setAttribute('aria-label', 'Resize details: tap to cycle peek, half and full; drag to resize'); panel.insertBefore(handle, panel.firstChild);
    let detent = 'half', dragH = null, handleArmed = false, barShownAt = -1e9;
    bar.addEventListener('click', e => { if (e.detail !== 0 && performance.now() - barShownAt < 250) { e.stopPropagation(); e.preventDefault(); } }, true);
    const detentPx = d => d === 'peek' ? 112 : d === 'half' ? Math.min(R.H * 0.5, 460) : Math.max(200, R.H - ($('top')?.getBoundingClientRect().bottom || 0) - 8);
    function setDetent(d) { detent = d; panel.dataset.detent = d; if (mq.matches) { panel.style.height = detentPx(d) + 'px'; panel.classList.remove('dragging'); applyHeight(); } }
    function sheetOpened(d, fresh = true) { if (!mq.matches) return; setDetent(fresh || !panel.dataset.detent ? d : detent); bar.hidden = true; applyHeight(); closePopover(); }
    function sheetClosed() { if (!mq.matches) return; panel.style.height = ''; const wasHidden = bar.hidden; bar.hidden = false; if (wasHidden) barShownAt = performance.now(); applyHeight(); }
    handle.addEventListener('pointerdown', e => { if (!mq.matches) return; handleArmed = true; dragH = { y0: e.clientY, h0: panel.offsetHeight, t0: performance.now(), samples: [[e.clientY, performance.now()]] }; panel.classList.add('dragging'); document.body.classList.add('sheet-dragging'); handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', e => { if (!dragH) return; dragH.samples.push([e.clientY, performance.now()]); if (dragH.samples.length > 8) dragH.samples.shift(); const hh = Math.max(64, Math.min(detentPx('full'), dragH.h0 - (e.clientY - dragH.y0))); panel.style.height = hh + 'px'; document.documentElement.style.setProperty('--mbar-h', hh + 'px'); document.body.classList.toggle('sheet-full', hh > detentPx('full') - 40); });
    const endDrag = e => {
      if (!dragH) return; const h = panel.offsetHeight, now = performance.now();
      const ref = dragH.samples.find(sm => now - sm[1] <= 120) || dragH.samples[dragH.samples.length - 1];   // release velocity from the last ~120 ms, not the whole gesture
      const v = (e.clientY - ref[0]) / Math.max(16, now - ref[1]);   // px per ms, + is downward
      handleArmed = Math.abs(e.clientY - dragH.y0) < 8; dragH = null; panel.classList.remove('dragging'); document.body.classList.remove('sheet-dragging');   // a drag never counts as a tap on the handle
      if (v > 0.5 || (h < 80 && detent === 'peek')) { clearSelection(); buzz(8); return; }   // flick down from anywhere dismisses
      const ds = ['peek', 'half', 'full']; let best = ds.reduce((a, b) => Math.abs(detentPx(b) - h) < Math.abs(detentPx(a) - h) ? b : a);
      if (Math.abs(v) > 0.25) { const i = ds.indexOf(detent); best = ds[Math.max(0, Math.min(2, i + (v < 0 ? 1 : -1)))]; }
      setDetent(best); buzz(6);
    };
    handle.addEventListener('pointerup', endDrag); handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('keydown', e => { if (!mq.matches) return; const ds = ['peek', 'half', 'full'], i = ds.indexOf(detent); if (e.key === 'ArrowUp' && i < 2) { setDetent(ds[i + 1]); e.preventDefault(); } else if (e.key === 'ArrowDown') { i > 0 ? setDetent(ds[i - 1]) : clearSelection(); e.preventDefault(); } });
    handle.addEventListener('click', e => { if (!mq.matches || (!handleArmed && e.detail !== 0)) return; handleArmed = false; setDetent(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'half'); });
    // following a link inside an open sheet keeps the chosen detent; a fresh selection resets it (select → sheetOpened)

    // ----- customize sheet -----
    function openCustomize() {
      const hidden = new Set(ui.hiddenOptions);
      sheet.innerHTML = `<div class="sh"><strong>Customize bar</strong><button class="x" aria-label="Close">×</button></div>
        <h4>Options shown · in order</h4><ul class="optlist">${orderedOptions().map(o => `<li data-id="${esc(o.id)}"><label><input type="checkbox" ${hidden.has(o.id) ? '' : 'checked'}> ${esc(o.label)}</label><span class="mv"><button data-d="-1" aria-label="Move up">▲</button><button data-d="1" aria-label="Move down">▼</button></span></li>`).join('')}</ul>
        <h4>Lobe row</h4><label class="rowopt">Order <select class="lorder"><option value="brain">Brain order</option><option value="alpha">Alphabetical</option><option value="size">By size</option></select></label>
        <label class="rowopt"><input type="checkbox" class="remember" ${ui.rememberLobes ? 'checked' : ''}> Remember hidden lobes on this brain</label>
        <h4>Bar</h4><label class="rowopt"><input type="checkbox" class="startx" ${ui.startExpanded ? 'checked' : ''}> Start expanded</label>
        <label class="rowopt"><input type="checkbox" class="haptics" ${ui.haptics ? 'checked' : ''}> Haptic ticks</label>
        <button class="reset">Reset bar to defaults</button>`;
      sheet.querySelector('.lorder').value = ui.lobeOrder;
      sheet.querySelector('.x').addEventListener('click', closeCustomize);
      sheet.querySelectorAll('.optlist li').forEach(li => {
        li.querySelector('input').addEventListener('change', e => { const h = new Set(ui.hiddenOptions); e.target.checked ? h.delete(li.dataset.id) : h.add(li.dataset.id); ui.hiddenOptions = [...h]; save(); renderOptions(); });
        li.querySelectorAll('.mv button').forEach(b => b.addEventListener('click', () => { const ids = orderedOptions().map(o => o.id), i = ids.indexOf(li.dataset.id), j = i + +b.dataset.d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; ui.optionOrder = ids; save(); renderOptions(); openCustomize(); }));
      });
      sheet.querySelector('.lorder').addEventListener('change', e => { ui.lobeOrder = e.target.value; save(); renderLobes(); });
      sheet.querySelector('.remember').addEventListener('change', e => { ui.rememberLobes = e.target.checked; ui.hiddenLobes = []; save(); rememberLobes(); });
      sheet.querySelector('.startx').addEventListener('change', e => { ui.startExpanded = e.target.checked; save(); });
      sheet.querySelector('.haptics').addEventListener('change', e => { ui.haptics = e.target.checked; save(); });
      sheet.querySelector('.reset').addEventListener('click', () => { Object.assign(ui, defaults, { hiddenLobes: [], hiddenOptions: [] }); save(); renderLobes(); renderOptions(); setExpanded(true); openCustomize(); toast('Bar reset'); });
      sheet.hidden = false; scrim.hidden = false;
    }
    const closeCustomize = () => { sheet.hidden = true; scrim.hidden = true; };
    bar.querySelector('.mbar-custom').addEventListener('click', () => { buzz(6); openCustomize(); });
    scrim.addEventListener('click', closeCustomize);

    // ----- boot -----
    if (ui.rememberLobes && ui.hiddenLobes.length) ui.hiddenLobes.forEach(id => { if (lobeOn[id] !== undefined) lobeOn[id] = false; });
    renderLobes(); renderOptions(); setExpanded(window.self !== window.top ? false : ui.startExpanded ? true : ui.expanded);   // embedded previews (the Community builder) start with just the handle row
    const onMq = () => { if (!mq.matches) { panel.style.height = ''; bar.hidden = false; closePopover(); closeCustomize(); } else { bar.hidden = !panel.hidden; if (!panel.hidden) setDetent(detent); } applyHeight(); };
    mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq); window.addEventListener('resize', () => { if (mq.matches && !panel.hidden) setDetent(detent); applyHeight(); });
    return {
      sync: () => { renderLobes(); syncOptions(); }, level: (t, c) => { lvlT.textContent = t; lvlDot.style.background = c; lvlDot.style.boxShadow = `0 0 10px ${c}`; },
      tapTravel: () => ui.tapTravel, barHeight, detentPx, sheetOpened, sheetClosed, setDetent, detent: () => detent, fitLobe, prefs: () => ({ ...ui }), expanded: () => ui.expanded, setExpanded, openCustomize, closeCustomize,
    };
  })();

  // ---------- boot ----------
  if (/[#&]layout=genome\b/.test(location.hash)) setLayout('genome', { silent: true });   // a link can open the karyogram directly, without the toast
  renderLobeList(); rebuild(true); if (L.genome()) L.layoutGenome(true); renderConnectome(); updateStats();
  (() => { const { kk, tx, ty } = fitTransform(); if (!(kk > 0)) return; d3.select(canvas).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(kk * 0.6)); d3.select(canvas).transition().duration(1600).ease(d3.easeCubicOut).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(kk)); })();
  updateLevel(); requestAnimationFrame(frame);
  document.fonts?.ready.then(() => $('loading').classList.add('done')); setTimeout(() => $('loading').classList.add('done'), 1500);
  const openHash = () => { const m = /[#&]n=([^&]+)/.exec(location.hash); if (!m) return; let id; try { id = decodeURIComponent(m[1]); } catch (e) { return; } const n = pageById[id]; if (n) { ensureVisible(n); select(n, { noLearn: true }); } };
  // A late boot callback must not reopen a search selection the reader has already closed.
  const initialHash = location.hash;
  if (initialHash) initialHashTimer = setTimeout(() => { initialHashTimer = null; if (location.hash === initialHash && !selected) openHash(); }, 1700);
  window.addEventListener('hashchange', openHash);
  // ---------- growth API (opt-in, for page add-ons such as the Guide's mice) ----------
  // Everything added here carries an `origin` tag. The engine treats origin-tagged material as "grown": the renderer rings it in
  // red and every signal that sets out from it (spikes, routed volleys, routes) travels in red. The Question neuron can be wired to,
  // but never receives synapses of its own (a design rule of the Guide brain); that is enforced here rather than trusted to callers.
  window.MINDBLOWN_GROW = (() => {
    const A = M.analysis, recolor = () => { if (R.showCommunities) renderLobeList(); };
    const pageR = p => isChild(p) ? 3.6 + Math.sqrt(p.nSyn) * 0.9 : 5.5 + Math.sqrt(p.nSyn) * 1.2 + Math.sqrt(Math.min(p.strength0, 40)) * 0.6;
    let dirty = false;
    const hex = c => typeof c === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? c : null;   // grown colours reach style attributes: hex only (the forms hue() accepts)
    function addLobe(spec) {
      if (!spec || !spec.id || lobeById[spec.id]) return lobeById[spec?.id] || null;
      const l = { id: spec.id, name: spec.name || spec.id, color: hex(spec.color) || '#e5e7eb', hidden: false, origin: spec.origin || 'grown', by: spec.by || null, brain: spec.brain || null, satellite: !!spec.satellite, reach: Number.isFinite(spec.reach) ? Math.max(300, Math.min(1600, spec.reach)) : undefined, created: spec.created || new Date().toISOString().slice(0, 10) };
      lobes.push(l); lobeById[l.id] = l; lobeOn[l.id] = true; L.addAnchor(l, spec.at && Number.isFinite(spec.at.x) && Number.isFinite(spec.at.y) ? spec.at : null); dirty = true; return l;   // `at` (world coordinates): a placed brain lands where the visitor put it
    }
    function addNeuron(spec) {
      if (!spec || !spec.id || pageById[spec.id] || !lobeById[spec.lobe]) return pageById[spec?.id] || null;
      const n = { id: spec.id, title: spec.title || spec.id, type: spec.type || 'concept', lobe: spec.lobe, parentId: null, desc: spec.desc || '', intro: spec.desc || '', created: spec.created || new Date().toISOString().slice(0, 10), updated: spec.created || new Date().toISOString().slice(0, 10), synapses: [], sources: [],
        origin: spec.origin || 'grown', by: spec.by || null, miceHub: !!spec.hub, blank: !!spec.blank,   // blank: an origin brain's hub before anyone has said what it is about (drawn hollow)
        kind: 'page', nSyn: 0, neighbors: [], synNodes: [], srcNodes: [], children: [], parent: null, isCenter: false, isSelf: false, active: true,
        deg: 0, strength0: 0, cc: 0, bc: 0, bcRank: pages.length + 1, comm: undefined, z: 0, part: 0, role: 'peripheral', hub: false, club: false, misfiled: false, spin: Math.random() * Math.PI * 2 };
      // parent: a grown sub-neuron folds into a grown neuron of the same lobe and unfolds with the depth level, like a built-in one
      const parent = spec.parent && pageById[spec.parent];
      if (spec.parent && (!parent || !parent.origin || parent.lobe !== n.lobe || isChild(parent))) return null;
      // at: an offset (world units) from the lobe anchor that the neural layout holds the neuron to, e.g. a point on a drawn coast
      const off = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2000;
      if (!parent && spec.at && off(spec.at.dx) && off(spec.at.dy)) n.at = { dx: spec.at.dx, dy: spec.at.dy };
      if (parent) { n.parentId = parent.id; n.parent = parent; parent.children.push(n); M.childTethers.push({ source: n, target: parent, kind: 'pc' }); hasSubs = M.hasSubs = true; }
      n.r = spec.hub ? 11 : pageR(n);
      const near = parent || (spec.near && pageById[spec.near]);
      pages.push(n); pageById[n.id] = n; A.adj.set(n, new Map()); dyn.initPage(n); L.seedPage(n, near || null);
      if (near) n.comm = near.comm;
      if (parent) resize(parent);
      dirty = true; return n;
    }
    const childBonus = p => Math.min((p.children || []).length, 6) * 0.6;   // same child bonus as model.js load-time sizing
    const resize = p => { if (!p.miceHub && !p.isCenter && !p.isAtom) p.r = pageR(p) + childBonus(p); };   // strength0 feeds the radius of every ordinary page
    function addLink(spec) {
      if (!spec) return null;
      const a = pageById[spec.s], b = pageById[spec.t]; if (!a || !b || a === b) return null;
      const w = spec.w === undefined ? 1 : spec.w; if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) return null;   // a supplied weight must be a finite positive number; absent means 1
      let l = a.neighbors.find(x => x.n === b)?.l;
      if (l) { l.w += w; l.weff = l.w; if (spec.note && !l.notes.includes(spec.note)) l.notes.push(spec.note); A.adj.get(a).set(b, l.w); A.adj.get(b).set(a, l.w); a.strength0 += w; b.strength0 += w; [a, b].forEach(resize); dirty = true; return l; }
      l = { source: a, target: b, w, kinds: spec.kinds || ['grown'], notes: spec.note ? [spec.note] : [], kind: 'pp', origin: spec.origin || a.origin || b.origin || 'grown', by: spec.by || null };
      M.pageLinks.push(l); a.neighbors.push({ n: b, l }); b.neighbors.push({ n: a, l }); dyn.initLink(l);
      A.adj.get(a).set(b, l.w); A.adj.get(b).set(a, l.w); a.deg++; b.deg++; a.strength0 += l.w; b.strength0 += l.w;
      if (a.comm === undefined && b.comm !== undefined) a.comm = b.comm; if (b.comm === undefined && a.comm !== undefined) b.comm = a.comm;
      [a, b].forEach(resize);
      dirty = true; return l;
    }
    function addSynapse(spec) {
      if (!spec || !spec.id) return null; const p = pageById[spec.page]; if (!p || synById[spec.id] || p.id === 'question' || p.isCenter) return null;   // the Question stays empty; the hub is the Guide's own
      const s = { id: spec.id, page: p.id, lead: spec.lead || '', text: spec.text || '', section: spec.section || 'Lab notes', links: (spec.links || []).filter(id => pageById[id] && id !== p.id), cites: (spec.sources || []).map(x => x.id), origin: spec.origin || 'grown', by: spec.by || null,
        kind: 'syn', idx: syns.length, lobe: p.lobe, ordinal: p.synNodes.length };
      syns.push(s); synById[s.id] = s; p.synNodes.push(s); p.synapses.push(s.id); p.nSyn++; if (!p.miceHub) p.r = pageR(p) + childBonus(p); L.seedNear(s, p);
      M.synTethers.push({ source: s, target: p, kind: 'st' });
      s.links.forEach(t => { M.synCross.push({ source: s, target: pageById[t], kind: 'sx' }); addLink({ s: p.id, t, w: 1, kinds: ['mention'], note: spec.lead, origin: s.origin, by: s.by }); });
      (spec.sources || []).forEach(src => {
        let r = M.srcById[src.id]; if (!r) { r = { id: src.id, label: src.label || src.id, kind: 'src', kindOf: src.kind || 'mice', href: typeof src.href === 'string' && /^(\.\/|[a-z0-9-]+\.html|https:\/\/[a-z0-9-]+\.pplx\.app\/)/i.test(src.href) ? src.href : null, lobe: p.lobe, pages: [], pageNodes: [], origin: s.origin }; M.srcs.push(r); M.srcById[r.id] = r; L.seedNear(r, p); }   // href: a link to another MindBlown brain (sibling page, or its hosted site), shown as a link in the panel
        if (!r.pageNodes.includes(p)) { r.pageNodes.push(p); r.pages.push(p.id); p.srcNodes.push(r); M.srcTethers.push({ source: r, target: p, kind: 'sr' }); }
      });
      dirty = true; return s;
    }
    // rename or fill in a grown neuron or lobe (an origin brain's blank hub takes its subject this way); built-in material is never touched
    function update(id, spec = {}) {
      const n = pageById[id], l = lobeById[id];
      if (n && n.origin) { if (spec.title) n.title = String(spec.title); if (spec.desc !== undefined) n.desc = n.intro = String(spec.desc); if (spec.blank !== undefined) n.blank = !!spec.blank; if (spec.by !== undefined) n.by = spec.by; n.updated = new Date().toISOString().slice(0, 10); dirty = true; if (selected === n) renderPanel(n); return n; }
      if (l && l.origin) {
        if (spec.name) { l.name = String(spec.name); const c = L.chromoOf && L.chromoOf[l.id]; if (c && c.id === l.id) c.name = l.name; }   // the genome layout draws the chromosome's own copy of the name
        if (hex(spec.color)) { l.color = hex(spec.color); const c = L.chromoOf && L.chromoOf[l.id]; if (c && c.id === l.id) c.color = l.color; }
        if (spec.by !== undefined) l.by = spec.by; dirty = true; return l;
      }
      return null;
    }
    // a coastline: scenery drawn behind a grown lobe in the neural layout (never in the genome layout), never a wire. pts are offsets
    // (world units) from the lobe anchor of one closed outline; null takes it away. Each call is a new draft (version counts them).
    function setCoast(id, spec) {
      const l = lobeById[id]; if (!l || !l.origin) return false;
      if (spec === null) { delete l.coast; return true; }
      const pts = spec && Array.isArray(spec.pts) ? spec.pts : null;
      if (!pts || pts.length < 8 || pts.length > 400 || !pts.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2000))) return false;
      l.coast = { pts: pts.map(p => [p[0], p[1]]), v: ((l.coast && l.coast.v) || 0) + 1 }; return true;
    }
    // apply everything added since the last commit: weights, lobe list, simulation, stats
    function commit(opts = {}) {
      if (!dirty) return; dirty = false;
      dyn.recomputeWeights(); renderLobeList(); recolor(); rebuild(false); MUI.sync(); L.refreshForces(); if (L.genome()) L.layoutGenome(false); L.sim.alpha(opts.alpha ?? 0.5).restart(); updateStats();   // in the genome layout the new loci need places on the karyogram
      if (selected) renderPanel(selected);
      const cx = $('connectome'); if (cx && !cx.hidden && typeof renderConnectome === 'function') renderConnectome();
    }
    // count(origin): only material with that origin tag (the mice count their own; an origin brain counts what was built into it)
    const tagged = (x, origin) => x.origin && (!origin || x.origin === origin);
    return Object.freeze({ addLobe, addNeuron, addLink, addSynapse, update, commit, setCoast, coast: id => { const c = lobeById[id] && lobeById[id].coast; return c ? { n: c.pts.length, v: c.v, pts: c.pts.map(p => p.slice()) } : null; }, fit: ms => fitAll(ms), fitIfOut: ms => fitIfOut(ms), toast, select: id => { const n = pageById[id]; if (n) { ensureVisible(n); select(n, { noLearn: true, by: 'grow' }); } },
      showRoute: (a, b, ms) => showRoute(pageById[a], pageById[b], ms), busy: () => !!routeFrom || !!(selected && selectedBy === 'visitor'),
      pulse: id => { const n = pageById[id]; if (!n || !n.origin || !n.active) return false; n.u = n.theta + 2; n.burst = true; return true; },   // make grown material fire now, above the global inhibition, recruiting every neighbour (its spikes travel in its origin's colour); built-in neurons are never pulsed
      selected: () => selected ? { id: selected.id, kind: selected.kind, by: selectedBy } : null,
      toWorld: (x, y) => view.toWorld(x, y), hub: () => (pages.find(p => p.isCenter) || {}).id || null,
      lobes: () => lobes.map(l => ({ id: l.id, name: l.name, color: l.color, origin: l.origin || null, by: l.by || null, brain: l.brain || null, satellite: !!l.satellite, hidden: !!l.hidden, size: pages.filter(p => p.lobe === l.id && !isChild(p)).length })),
      pages: () => pages.map(p => ({ id: p.id, title: p.title, lobe: p.lobe, parent: p.parentId || null, origin: p.origin || null, by: p.by || null, blank: !!p.blank, hub: !!p.miceHub, nSyn: p.nSyn, deg: p.neighbors.length, neighbors: p.neighbors.map(x => x.n.id) })),
      count: origin => ({ neurons: pages.filter(p => tagged(p, origin)).length, lobes: lobes.filter(l => tagged(l, origin)).length, brains: lobes.filter(l => tagged(l, origin) && l.satellite).length, synapses: syns.filter(s => tagged(s, origin)).length, links: M.pageLinks.filter(l => tagged(l, origin)).length }) });
  })();
  // read-only hooks for the QA harness
  // Narrow coordinate/selection adapter for optional scenario controllers. Factual nodes are never exposed for mutation.
  window.MINDBLOWN_RENDERER = Object.freeze({
    nodes: () => pages.map(n => ({ id: n.id, title: n.title })),
    titleBoxes: () => (R.titleBoxes || []).map(b => ({ ...b })),
    selected: () => selected?.kind === 'page' ? selected.id : null,
    screenOf: id => { const n = pageById[id]; return n && visible(n) && Number.isFinite(n.x) && Number.isFinite(n.y) ? view.toScreen(n.x, n.y) : null; },
    toWorld: (x, y) => view.toWorld(x, y),
    toScreen: (x, y) => view.toScreen(x, y),
    focus: id => { const n = pageById[id]; if (n) { ensureVisible(n); select(n); } },
  });
  window.MINDBLOWN_QA = { mui: MUI, coastsDrawn: () => R.coastsDrawn || 0, labels: () => labelsOn, labelsDrawn: () => [...R.labelsDrawn], synapses: () => window.MBN.synapses && window.MBN.synapses.stats(), alpha: () => L.sim.alpha(), depthF: () => L.depthF, ringK: () => L.ringK(), overlaps: lobe => { const ps = pages.filter(p => p.lobe === lobe && !isChild(p) && p.active), R = L._accessors.pageCollideR; let n = 0, worst = 0; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y), o = R(ps[i]) + R(ps[j]) - d; if (o > 0) { n++; worst = Math.max(worst, o); } } return { pairs: n, worst: +worst.toFixed(1), n: ps.length, meanR: +d3.mean(ps, R).toFixed(1), explodeF: L.explodeF }; }, anchor: lobe => L.anchor[lobe] && { ...L.anchor[lobe] }, node: id => { const n = pageById[id]; return n ? { x: n.x, y: n.y, fx: n.fx, px: n.parent?.x, py: n.parent?.y, mdx: n.mdx, mdy: n.mdy, active: n.active } : null; }, perf: () => ({ ...perf, cap: refreshCap(), nativeHz, coarse }), selected: () => selected && selected.id, view: () => ({ k: view.k, tx: view.tx, ty: view.ty }), layout: () => L.mode, chromosomes: () => L.chromos.filter(c => c.on).map(c => ({ id: c.id, name: c.name, x: c.x, cy: c.cy, top: c.top, bot: c.bot, loci: c.loci.length })), screenOf: id => { const n = pageById[id] || synById[id]; return n && n.x != null ? view.toScreen(n.x, n.y) : null; }, selection: () => [...multi].map(n => n.id), pinned: () => pages.filter(n => n.pinned).map(n => n.id), mode: () => mode, metrics: () => ({ sw, Q: A.communities.Q, communities: A.communities.count, club: [...A.club.members].map(p => p.id), hubs: pages.filter(p => p.hub).map(p => p.id), learned: Object.keys(dyn.learned).length, spikes: dyn.spikes.length, pruned: dyn.pruned.size }), route: () => R.route ? { hops: R.route.hops, motif: R.route.motif, path: R.route.path.map(p => p.id), red: !!R.route.red, passive: !!R.route.passive } : null, selectId: id => { const n = pageById[id]; if (n) { ensureVisible(n); select(n); } }, routeFromTo: (a, b) => { const A1 = pageById[a], B1 = pageById[b]; if (!A1 || !B1) return false; select(A1); startRoute(A1); routeTo(B1); return true; }, debugNode: id => { const n = pageById[id]; if (!n) return null; const A = M.analysis; return { lobe: n.lobe, active: n.active, visible: visible(n), nb: n.neighbors.map(x => [x.n.id, x.n.active, visible(x.n), dyn.isPruned(x.l), x.l.weff]), adj: [...(A.adj.get(n) || new Map()).keys()].map(m => m.id), inAdj: A.adj.has(n) }; }, redState: () => ({ routeRed: !!(R.route && R.route.red), routeCol: R.route && R.route.col || null, volleyRed: !!(dyn.volley && dyn.volley.red), glowing: M.pageLinks.filter(l => l.redGlow > 0.02).length, hot: pages.filter(p => p.redHeat > 0.05).length, redSpikes: dyn.spikes.filter(s => s.red).length, colours: Object.fromEntries([...new Set([...dyn.spikes.filter(s => s.red).map(s => s.col), ...pages.filter(p => p.redHeat > 0.05).map(p => p.redCol)])].filter(Boolean).map(c => [c, dyn.spikes.filter(s => s.col === c).length + pages.filter(p => p.redHeat > 0.05 && p.redCol === c).length])) }) };
  };
  (window.MINDBLOWN_COMPOSE ? window.MINDBLOWN_COMPOSE.ready() : Promise.resolve(window.MINDBLOWN)).then(start);
})();
