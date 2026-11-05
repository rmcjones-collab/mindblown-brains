/* Ask Deep Answers: source-first UI. No credentials are read outside settings/adapters. */
(function () {
  'use strict';
  const D = window.DeepAsk = window.DeepAsk || {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const safeHref = value => {
    const s = String(value || '');
    return /^(https?:\/\/|\.?\.?\/|[a-z0-9_-]+\.html(?:#|$))/i.test(s) ? s : '#';
  };
  const fallbacks = {
    brain: 'These are excerpts from the knowledge network, not a model-generated answer.',
    local: 'This model synthesis may miss context or make mistakes. Check its references against the cited sources.',
    council: 'These independent model syntheses may disagree or make mistakes. Agreement does not settle an open question.'
  };
  const starters = [
    'Why is quantum gravity still an open question?', 'What is dark matter?',
    'How did life begin?', 'Why do organisms age?',
    'What makes a problem hard to compute?', 'Can machines understand meaning?',
    'How does consciousness arise?', 'How does the brain form memories?',
    'What can mathematics prove?', 'Why do prime numbers matter?',
    'How do complex systems emerge?', 'What connects information and physics?'
  ];
  let mode = 'brain', busy = false, controller = null, lastFocus = null, ready = false;
  // Council inclusion: an explicit saved choice wins; otherwise a provider is included when it has a saved key.
  let saveSeq = 0, webllmStarted = false;
  // WebLLM code can read the page, so hosted-key inputs are emptied and disabled before it loads
  function lockKeyInputs() {
    document.querySelectorAll('#ask-settings-fields input[name^="key:"]').forEach(input => { input.value = ''; input.disabled = true; });
  }
  function included(id, settings) {
    const s = settings || (D.models ? D.models.settings.get() : {});
    const choice = (s.council || {})[id];
    return typeof choice === 'boolean' ? choice : !!(s.keys || {})[id];
  }
  const adapters = () => D.models && typeof D.models.list === 'function' ? D.models.list() : [];
  const disclaimer = which => D.prompts && D.prompts.disclaimers && D.prompts.disclaimers[which] || fallbacks[which];
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function link(label, href, className) {
    const a = el('a', className, label); a.href = safeHref(href);
    if (/^https?:/i.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function chip(title, className = 'ask-chip') {
    const b = el('button', className, title); b.type = 'button';
    b.addEventListener('click', () => ask(title)); return b;
  }
  function setMode(next) {
    mode = next;
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('ask-mode-note').textContent = {brain:'Cited excerpts · no model or keys', local:'One local model · same cited context', council:'Selected providers · same cited context'}[mode];
    $('ask-local-picker').hidden = mode !== 'local';
  }
  function hideSuggestions() {
    $('ask-suggestions').hidden = true; $('composer').setAttribute('aria-expanded', 'false');
  }
  function suggest() {
    const list = $('ask-suggestions'), text = $('composer').value.trim();
    list.replaceChildren();
    if (!text || !D.engine || busy) return hideSuggestions();
    const items = D.engine.suggest(text, 5) || [];
    items.forEach(item => {
      const li = el('li'), button = el('button', '', item.title); button.type = 'button';
      if (item.brain) button.append(el('small', '', item.brain));
      button.addEventListener('click', () => { $('composer').value = item.title; hideSuggestions(); $('composer').focus(); });
      li.append(button); list.append(li);
    });
    list.hidden = !items.length; $('composer').setAttribute('aria-expanded', String(!!items.length));
  }
  function synapseView(s, neuron) {
    const row = el('div', 'ask-synapse'), p = el('p');
    p.append(link('[' + s.ref + ']', neuron.hrefBrain || neuron.hrefNet, 'ref'), document.createTextNode(' '));
    if (s.sealed) {   // a puzzle seals this fact; show the prompt, a way to solve it, and nothing of the fact itself
      row.classList.add('is-sealed'); row.dataset.testid = 'sealed-synapse';
      p.append(el('strong', '', s.lead), document.createTextNode(' Sealed · solve to unfold.'));
      const solve = el('button', 'ask-solve', 'Solve'); solve.type = 'button';
      solve.addEventListener('click', () => openPuzzles(s.id));
      p.append(solve); row.append(p); return row;
    }
    if (s.lead) p.append(el('strong', '', s.lead + (/[.:?]$/.test(s.lead) ? ' ' : ': ')));
    p.append(document.createTextNode(s.text || '')); row.append(p);
    const sources = el('div', 'ask-source-list');
    (s.cites || []).forEach(c => {
      if (/^https:\/\//i.test(c.url || '')) sources.append(link(c.label || new URL(c.url).hostname, c.url, 'ask-source'));
    });
    if (!sources.childNodes.length) sources.append(el('span', 'ask-warning ask-small', 'No external source attached to this excerpt.'));
    row.append(sources); return row;
  }
  function brainCard(result) {
    const card = el('article', 'ask-card ask-brain-card'); card.dataset.testid = 'brain-card';
    const head = el('div', 'ask-card-head'), title = el('h3', '', 'Brain');
    title.prepend(el('span', 'ask-live-dot'));
    head.append(title, el('span', 'ask-card-meta', `${result.neurons.length} neurons · ${Math.round(result.elapsedMs || 0)} ms`)); card.append(head);
    if (!result.neurons.length) card.append(el('p', 'ask-model-text', 'No matching neurons were found. Try a specific concept or choose a suggested question.'));
    result.neurons.forEach(n => {
      const section = el('section', 'ask-neuron'), meta = el('div', 'ask-neuron-meta'), dot = el('span', 'ask-brain-dot');
      const brain = (window.MINDBLOWN && window.MINDBLOWN.brains || []).find(b => b.id === n.brain);
      dot.style.backgroundColor = brain && brain.color || n.color || 'var(--accent)';
      dot.setAttribute('aria-hidden', 'true');
      meta.append(dot, el('span', '', brain && (brain.short || brain.title) || n.brain || 'Shared'), el('span', 'ask-type', n.type), el('span', '', '[' + n.ref + ']'));
      const heading = el('h4'); heading.append(link(n.title, n.hrefBrain || n.hrefNet));
      section.append(meta, heading);
      if (n.desc) section.append(el('p', 'ask-neuron-desc', n.desc));
      const hits = (n.synapses || []).filter(s => s.hit), rest = (n.synapses || []).filter(s => !s.hit);
      hits.forEach(s => section.append(synapseView(s, n)));
      if (rest.length) {
        const details = el('details', 'ask-more');
        details.append(el('summary', '', `More from this neuron (${rest.length})`));
        rest.forEach(s => details.append(synapseView(s, n))); section.append(details);
      }
      section.append(link('Open in network', n.hrefNet, 'ask-open-network')); card.append(section);
    });
    if (result.related && result.related.length) {
      const related = el('div', 'ask-related'), chips = el('div', 'ask-chips');
      related.append(el('p', '', 'Follow a connection'));
      result.related.forEach(n => chips.append(chip(n.title))); related.append(chips); card.append(related);
    }
    const footer = el('footer', 'ask-card-footer'); footer.append(el('p', '', disclaimer('brain'))); card.append(footer);
    return card;
  }
  function modelCard(adapter, which) {
    const card = el('article', 'ask-card ask-model-card'); card.dataset.testid = 'model-card'; card.dataset.provider = adapter.id;
    const settings = D.models.settings.get();
    const modelName = adapter.id === 'ollama' ? settings.ollamaModel : adapter.id === 'webllm' ? settings.webllmModel : (settings.models || {})[adapter.id];
    const head = el('div', 'ask-card-head'), info = el('div', 'ask-provider-info'), model = el('small', '', modelName || 'Model pending'), status = el('span', 'ask-model-status', 'waiting');
    info.append(el('h3', '', adapter.label), model); head.append(info, status);
    const text = el('div', 'ask-model-text', 'Waiting for provider…'), footer = el('footer', 'ask-card-footer');
    const check = el('span', 'ask-grounding', 'Grounding check pending'), time = el('span', 'ask-card-meta');
    footer.append(check, time, el('p', '', disclaimer(which))); card.append(head, text, footer);
    return {card, text, status, model, check, time};
  }
  function renderModelText(view, text, context, result) {
    if (D.ground && D.ground.linkify) view.text.innerHTML = D.ground.linkify(text, result);
    else view.text.textContent = text;
    if (!D.ground || !D.ground.check) {
      view.check.textContent = 'Ungrounded · grounding check unavailable';
      view.check.classList.add('is-warning'); return;
    }
    const report = D.ground.check(text, context, result);
    const parts = [`cites ${report.refs.length} ${report.refs.length === 1 ? 'ref' : 'refs'}`];
    if (report.uncited) parts.push(`${report.uncited} ${report.uncited === 1 ? 'sentence' : 'sentences'} uncited`);
    if (report.unknownRefs.length) parts.push(`${report.unknownRefs.length} unknown ${report.unknownRefs.length === 1 ? 'ref' : 'refs'}`);
    if (report.settledClaims.length) parts.push('may present an open question as settled');
    const grounded = report.ok && report.refs.length > 0;
    view.check.classList.toggle('is-warning', !grounded);
    view.check.textContent = (!grounded ? 'Ungrounded · ' : !report.uncited ? 'All sentences grounded · ' : '') + parts.join(' · ');
  }
  async function runModel(adapter, view, context, result, which, signal) {
    let text = ''; const start = performance.now();
    try {
      if (adapter.id === 'webllm') { webllmStarted = true; lockKeyInputs(); }
      const available = await adapter.available();
      if (!available.ok) throw new Error(available.reason || 'Provider is unavailable. Check Settings.');
      view.status.textContent = 'streaming'; view.text.textContent = 'Reading the cited context…';
      const system = D.prompts && D.prompts.system ? D.prompts.system({mode:which}) : 'Answer only from the supplied context. Cite every factual sentence with [N1] or [N1.1] references. Keep open questions open. If the context is insufficient, say so. Do not invent claims or references.';
      const user = D.prompts && D.prompts.user ? D.prompts.user(context) : context.text;
      // render at most every 120 ms while streaming; the full render and check always run on completion
      let lastPaint = 0, pending = null;
      const paint = () => { pending = null; lastPaint = performance.now(); renderModelText(view, text, context, result); view.time.textContent = `${Math.round(lastPaint - start)} ms · `; };
      let answer;
      try {
        answer = await adapter.complete({system, user, signal, onToken(delta) {
          if (signal.aborted) return;
          text += delta;
          if (pending) return;
          const wait = 120 - (performance.now() - lastPaint);
          if (wait <= 0) paint(); else pending = setTimeout(paint, wait);
        }});
      } finally { if (pending) { clearTimeout(pending); pending = null; } }
      if (signal.aborted) throw new Error('Request stopped.');
      text = answer.text || text;
      if (!text.trim()) throw new Error('The provider returned no text.');
      renderModelText(view, text, context, result); view.model.textContent = answer.model || adapter.label;
      view.time.textContent = `${Math.round(answer.ms == null ? performance.now() - start : answer.ms)} ms · `;
      view.status.textContent = 'done';
    } catch (error) {
      view.status.textContent = 'failed';
      const reason = signal.aborted ? 'Request stopped.' : error.message || 'Provider request failed.';
      if (text) { renderModelText(view, text, context, result); view.text.append(el('p', 'ask-warning', reason)); }
      else { view.text.textContent = reason; view.check.textContent = 'No completed answer to check'; view.check.classList.add('is-warning'); }
      view.time.textContent = `${Math.round(performance.now() - start)} ms · `;
    }
  }
  async function ask(question) {
    const query = String(question || '').trim();
    if (!query || busy) return;
    if (!D.engine) { $('ask-status').textContent = 'The knowledge index is unavailable. Reload the page to try again.'; return; }
    busy = true; $('send').disabled = true; hideSuggestions();
    $('composer').value = ''; $('composer').style.height = ''; $('ask-empty').hidden = true;
    $('ask-status').textContent = 'Finding cited excerpts…';
    const which = mode, turn = el('section', 'ask-turn'), heading = el('h2', 'ask-question', query);
    turn.append(heading); $('ask-conversation').append(turn);
    controller = new AbortController();
    try {
      const result = D.engine.retrieve(query, {k:6}); turn.append(brainCard(result));
      $('ask-scroll').scrollTo({top:turn.offsetTop - 20, behavior:'auto'});
      if (which !== 'brain' && D.models) {
        const context = D.engine.context(result, {maxChars:9000});
        if (!result.neurons.length || !context.refs.length) {
          turn.append(el('p', 'ask-small ask-brain-card', 'No cited context was found, so no model request was sent.'));
        } else {
          const settings = D.models.settings.get();
          // excluded providers never receive the question; unavailable included ones show their reason on a card
          const chosen = adapters().filter(a => which === 'local' ? a.id === $('ask-local-provider').value : a.kind === 'hosted' && included(a.id, settings));
          if (!chosen.length) turn.append(el('p', 'ask-small ask-brain-card', 'No providers are ready. Open Settings to choose a model or add a provider key.'));
          else {
            const grid = el('div', 'ask-model-grid' + (which === 'council' ? ' is-council' : '') + (chosen.length >= 3 ? ' has-many' : ''));
            turn.append(grid);
            const views = chosen.map(a => { const view = modelCard(a, which); grid.append(view.card); return view; });
            $('ask-status').textContent = 'Models are reading the same cited context…';
            await Promise.all(chosen.map((a, i) => runModel(a, views[i], context, result, which, controller.signal)));
          }
        }
      }
      $('ask-status').textContent = 'Ready for another question.';
    } catch (error) {
      turn.append(el('p', 'ask-warning', error.message || 'The question could not be processed.'));
      $('ask-status').textContent = 'Could not finish this question. You can try again.';
    } finally {
      busy = false; $('send').disabled = false; controller = null;
    }
  }
  function field(label, name, value, type = 'text') {
    const wrap = el('label', 'ask-field', label), input = el('input');
    input.type = type; input.name = name; input.value = value || ''; input.autocomplete = 'off'; input.spellcheck = false;
    if (type === 'password') input.autocomplete = 'new-password';
    wrap.append(input); return wrap;
  }
  async function availability(adapter, container) {
    const dot = container.querySelector('.ask-availability'), reason = container.querySelector('.ask-availability-reason');
    try {
      const state = await adapter.available();
      dot.className = 'ask-availability ' + (state.ok ? 'is-ready' : 'is-unavailable');
      reason.textContent = state.ok ? 'Available' : state.reason || 'Not available';
      dot.setAttribute('aria-label', state.ok ? 'Available' : 'Unavailable');
    } catch (_) { dot.className = 'ask-availability is-unavailable'; reason.textContent = 'Could not check availability.'; }
  }
  function buildSettings() {
    const host = $('ask-settings-fields'); host.replaceChildren();
    if (!D.models) {
      host.append(el('p', 'ask-small', 'Model adapters are not loaded. Brain mode is available without settings.'));
      $('settings-save').hidden = true; $('settings-forget').hidden = true; return;
    }
    $('settings-save').hidden = false; $('settings-forget').hidden = false;
    const settings = D.models.settings.get();
    const local = el('section', 'ask-settings-section'); local.append(el('h3', '', 'Local models'));
    local.append(field('Ollama URL', 'ollamaUrl', settings.ollamaUrl || 'http://localhost:11434', 'url'), field('Ollama model', 'ollamaModel', settings.ollamaModel), field('WebLLM model', 'webllmModel', settings.webllmModel));
    const consent = el('label', 'ask-provider-heading'), consentBox = el('input');
    consentBox.type = 'checkbox'; consentBox.name = 'webllmConsent'; consentBox.checked = settings.webllmConsent === true;
    consent.append(consentBox, document.createTextNode('Allow WebLLM to load its code from esm.run'));
    local.append(consent, el('p', 'ask-small', 'WebLLM is third-party code that runs inside this page. It cannot be allowed while provider keys are stored, and keys cannot be saved while any tab has WebLLM running.'));
    host.append(local);
    adapters().forEach(adapter => {
      const section = el('section', 'ask-settings-section'), heading = el('label', 'ask-provider-heading');
      if (adapter.kind === 'hosted') {
        const check = el('input'); check.type = 'checkbox';
        check.name = `council:${adapter.id}`; check.checked = included(adapter.id, settings); heading.append(check);
      }
      const dot = el('span', 'ask-availability'); dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', 'Checking availability');
      heading.append(dot, document.createTextNode(adapter.label + (adapter.kind === 'hosted' ? ' · include in Council' : '')));
      section.append(heading, el('p', 'ask-availability-reason', 'Checking availability…'));
      if (adapter.kind === 'hosted') {
        const keyField = field(`${adapter.label} API key`, `key:${adapter.id}`, webllmStarted ? '' : (settings.keys || {})[adapter.id], 'password');
        if (webllmStarted) keyField.querySelectorAll('input').forEach(input => { input.disabled = true; });
        section.append(keyField);
        section.append(el('p', 'ask-small', 'Stored in this browser only. Sent only to this provider or your local proxy.'));
        section.append(field(`${adapter.label} model`, `model:${adapter.id}`, (settings.models || {})[adapter.id]));
        if (adapter.id === 'anthropic') {
          section.append(field('Anthropic workspace ID (optional)', 'anthropicWorkspace', settings.anthropicWorkspace));
          section.append(el('p', 'ask-small', 'Only for keys that work across workspaces. Use the ID that starts with wrkspc_, not the workspace name.'));
        }
      }
      host.append(section); availability(adapter, section);
    });
    const proxy = el('section', 'ask-settings-section'); proxy.append(el('h3', '', 'Optional local proxy'));
    proxy.append(field('Proxy URL', 'proxyUrl', settings.proxyUrl, 'url'), el('p', 'ask-small', 'Use a localhost proxy when a provider blocks browser requests. Leave blank to call providers directly.'));
    host.append(proxy);
  }
  // ---- puzzles: the ladder drawer ------------------------------------------------------------------------------------
  function puzzleCount() {
    const E = DeepAsk.engine, all = E && E.puzzles ? E.puzzles() : [], done = all.filter(p => p.solved).length;
    const badge = $('puzzles-count'); if (badge) badge.textContent = done ? String(done) : '';
    return { all, done };
  }
  function buildPuzzles(focusId) {
    const E = DeepAsk.engine, { all, done } = puzzleCount(), host = $('ask-puzzles-ladder'), dlg = $('ask-puzzles');
    const top = dlg.scrollTop; host.textContent = '';
    const rungs = Array.from(new Set(all.map(p => p.rung))).sort((a, b) => a - b);
    const reached = rungs.filter(r => all.some(p => p.rung === r && p.solved)).pop();
    $('ask-puzzles-progress').textContent = all.length
      ? `${done} of ${all.length} unfolded this session` + (reached ? ` · highest rung reached: ${reached}` : '')
      : (E ? 'No puzzles are loaded in this network.' : 'The knowledge index is unavailable. Reload the page to try again.');
    let focusEl = null;
    rungs.forEach(r => {
      const list = all.filter(p => p.rung === r), sec = el('section', 'ask-rung');
      const solvedHere = list.filter(p => p.solved).length;
      sec.append(el('h3', '', (list[0] && list[0].pageTitle) || ('Rung ' + r)));
      sec.append(el('p', 'ask-rung-meta', `${solvedHere} of ${list.length} unfolded`));
      list.forEach(p => {
        const item = el('div', 'ask-puzzle' + (p.solved ? ' is-solved' : '')); item.dataset.puzzle = p.id; item.dataset.testid = 'puzzle';
        item.append(el('p', '', p.q));
        if (p.solved) {
          const fact = el('p', 'ask-puzzle-fact'); fact.append(el('strong', '', p.lead + ': '), document.createTextNode(p.text)); item.append(fact);
        } else {
          const form = el('form'), input = el('input'), go = el('button', 'ask-button ask-primary', 'Unfold'), state = el('p', 'ask-puzzle-state');
          input.type = 'text'; input.placeholder = 'Your answer'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Answer for: ' + p.q);
          go.type = 'submit';
          form.append(input, go);
          if (p.hint) {
            const hintBtn = el('button', 'ask-button', 'Hint'); hintBtn.type = 'button';
            hintBtn.addEventListener('click', () => { item.classList.add('show-hint'); hintBtn.disabled = true; });
            form.append(hintBtn); item.append(form, el('p', 'ask-hint', p.hint));
          } else item.append(form);
          item.append(state);
          form.addEventListener('submit', e => {
            e.preventDefault();
            if (!input.value.trim()) return;
            if (E.solve(p.id, input.value)) { buildPuzzles(p.id); announce('Unfolded: ' + (E.puzzles().find(x => x.id === p.id) || {}).lead); }
            else { item.classList.add('is-wrong'); state.textContent = 'Not yet. Try again' + (p.hint ? ' or take the hint.' : '.'); input.select(); }
          });
          if (p.id === focusId) focusEl = input;
        }
        sec.append(item);
      });
      host.append(sec);
    });
    if (focusEl) { focusEl.closest('.ask-puzzle').scrollIntoView({ block: 'center' }); focusEl.focus(); }
    else dlg.scrollTop = top;
  }
  function announce(text) { const n = $('ask-puzzles-progress'); if (n) n.textContent = text + ' · ' + n.textContent; }
  function openPuzzles(focusId) {
    lastFocus = document.activeElement; buildPuzzles(focusId);
    const dlg = $('ask-puzzles'); if (!dlg.open) dlg.showModal();
    if (focusId) { const input = dlg.querySelector(`[data-puzzle="${CSS.escape(focusId)}"] input`); if (input) input.focus(); }
  }
  function openSettings() {
    lastFocus = document.activeElement; buildSettings(); $('ask-settings-status').textContent = '';
    $('ask-settings').showModal();
  }
  function init() {
    if (ready || !$('composer')) return; ready = true;
    document.title = 'Ask Deep Answers';
    if (D.engine && window.MINDBLOWN) D.engine.load(window.MINDBLOWN);
    const questions = D.prompts && D.prompts.starters || starters;
    questions.forEach(q => {
      const title = typeof q === 'string' ? q : q.q || q.title;
      if (!title) return;
      const button = chip(title, 'ask-starter'); button.replaceChildren(el('span', '', title), el('span', '', '↗')); button.lastChild.setAttribute('aria-hidden', 'true'); $('ask-starters').append(button);
    });
    document.querySelectorAll('[data-mode]').forEach(button => {
      if (!D.models && button.dataset.mode !== 'brain') button.hidden = true;
      button.addEventListener('click', () => setMode(button.dataset.mode));
    });
    adapters().filter(a => a.kind === 'local').forEach(a => {
      const option = el('option', '', a.label); option.value = a.id; $('ask-local-provider').append(option);
    });
    $('ask-form').addEventListener('submit', e => { e.preventDefault(); ask($('composer').value); });
    $('composer').addEventListener('input', () => {
      $('composer').style.height = 'auto'; $('composer').style.height = Math.min(140, $('composer').scrollHeight) + 'px'; suggest();
    });
    $('composer').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask($('composer').value); }
      if (e.key === 'Escape') hideSuggestions();
      if (e.key === 'ArrowDown' && !$('ask-suggestions').hidden) { e.preventDefault(); $('ask-suggestions').querySelector('button').focus(); }
    });
    $('ask-suggestions').addEventListener('keydown', e => {
      const buttons = Array.from($('ask-suggestions').querySelectorAll('button')), index = buttons.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus(); }
      if (e.key === 'Escape') { hideSuggestions(); $('composer').focus(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('#ask-form')) hideSuggestions(); });
    $('settings-open').addEventListener('click', openSettings);
    $('puzzles-open').addEventListener('click', () => openPuzzles());
    $('puzzles-close').addEventListener('click', () => $('ask-puzzles').close());
    $('ask-puzzles').addEventListener('close', () => { puzzleCount(); if (lastFocus && lastFocus.focus) lastFocus.focus(); });
    puzzleCount();
    $('settings-close').addEventListener('click', () => $('ask-settings').close());
    $('ask-settings').addEventListener('close', () => { if (lastFocus) lastFocus.focus(); });
    $('settings-save').addEventListener('click', async () => {
      if (!D.models) return;
      try {
        const settings = D.models.settings.get(), partial = {keys:{...settings.keys}, models:{...settings.models}, council:{...settings.council}};
        $('ask-settings-fields').querySelectorAll('input[name]').forEach(input => {
          const [kind, id] = input.name.split(':');
          if (kind === 'council') partial.council[id] = input.checked;
          else if (input.type === 'checkbox') partial[input.name] = input.checked;
          else if (kind === 'key') partial.keys[id] = input.value.trim();
          else if (kind === 'model') partial.models[id] = input.value.trim();
          else partial[input.name] = input.value.trim();
        });
        const seq = saveSeq;
        if (D.models.settings.setGuarded) {
          const blocked = Object.values(partial.keys).some(Boolean) && D.models.settings.keysBlocked ? await D.models.settings.keysBlocked() : '';
          if (blocked) throw new Error(blocked);
          if (seq !== saveSeq) return; // Forget ran while this save was pending
          await D.models.settings.setGuarded(partial);
        } else D.models.settings.set(partial);
        if (seq !== saveSeq) { D.models.settings.clear(); return; }
        buildSettings(); $('ask-settings-status').textContent = 'Settings saved in this browser.';
      } catch (error) { $('ask-settings-status').textContent = error.message || 'Could not save settings.'; }
    });
    $('settings-forget').addEventListener('click', () => {
      if (!D.models) return;
      if (controller) controller.abort();
      saveSeq++; D.models.settings.clear(); $('ask-conversation').replaceChildren(); $('ask-empty').hidden = false;
      $('composer').value = ''; hideSuggestions(); setMode('brain'); buildSettings();
      $('ask-settings-status').textContent = 'Saved keys, model settings and this conversation have been cleared.';
    });
    setMode('brain');
  }
  D.ui = {init, ask, setMode, openSettings};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
