/* MindBlown Neural — mice-chat.js
   The mice's chat for guide.html: the dock at bottom left where Frankie and Benjy report what they are building and
   answer questions, and the cheese above the Don't Panic button that switches them off and on.
   The look follows the Ask page of Deep Answers (eyebrow labels, glass cards with a head row, a composer with
   Enter-to-ask): the same chat, in red, in a corner of the brain. Answers are grounded, not generated: a question is
   matched against the Guide's own neurons and synapses (never the hidden Footnotes lobe; the mice do not touch reality)
   and against the mice's own lab notes, and the answer quotes the neuron and offers it as a chip that opens it. A few
   things are understood directly (who they are, what they have built, build me a network, the Question, 42, the red
   trails, cheese), and a question nobody has a neuron for can become one: "Build it" files it as a new neuron of theirs.
   Engine: js/mice.js (window.MINDBLOWN_MICE). This file only listens and asks. */
(() => {
  const M = window.MINDBLOWN_MICE, D = window.MINDBLOWN, G = () => window.MINDBLOWN_GROW;
  const root = document.getElementById('mice-chat'); if (!M || !D || !root || !G()) return;
  const $ = id => document.getElementById(id);
  const head = $('mice-btn'), out = $('mice-out'), body = $('mice-body'), log = $('mice-log'), starters = $('mice-starters'), form = $('mice-ask'), input = $('mice-q'), homeBtn = $('mice-clear'), cheese = $('mice-toggle');
  if (!head || !out || !log || !form || !input || !cheese) return;
  // the chat's height (0 while hidden) for the desktop Lobes panel, which ends 12px above it (style.css), as js/origin.js does with --origin-dock-h
  const chatHeight = () => document.documentElement.style.setProperty('--mice-chat-h', `${Math.ceil(root.getBoundingClientRect().height)}px`);
  chatHeight(); if (window.ResizeObserver) new ResizeObserver(chatHeight).observe(root); else { window.addEventListener('resize', chatHeight); head.addEventListener('click', () => setTimeout(chatHeight)); }
  const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const OPEN_KEY = 'mbn:mice:chat:' + (D.brain || 'guide');
  const phone = () => window.innerWidth <= 900;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const lobeOf = id => G().lobes().find(l => l.id === id) || D.lobes.find(l => l.id === id);
  const lobeName = id => lobeOf(id)?.name || '';
  const lobeColor = id => { const c = lobeOf(id)?.color || '#ff3b3b'; return /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#ff3b3b'; };
  const titleOf = id => G().pages().find(p => p.id === id)?.title || D.pages.find(p => p.id === id)?.title || id;
  let turn = Math.floor(Math.random() * 2); const who = () => M.names[(turn++) % M.names.length];

  // ---------- the log ----------
  const MAX = 80;
  const scrollDown = () => { log.scrollTop = log.scrollHeight; };
  const addItem = (cls, html) => {
    const li = document.createElement('li'); li.className = 'mice-turn ' + cls; li.innerHTML = html; log.appendChild(li);
    while (log.children.length > MAX) log.removeChild(log.firstChild);
    scrollDown(); return li;
  };
  const chip = (id, label) => `<button type="button" class="mice-chip" data-n="${esc(id)}"><span class="dot" style="background:${lobeColor(G().pages().find(p => p.id === id)?.lobe)}"></span>${esc(label || titleOf(id))}</button>`;
  const note = text => addItem('note', `<span class="dot" aria-hidden="true"></span><span class="text">${esc(text)}</span>`);
  const activity = (text, focus) => addItem('act', `<span class="dot" aria-hidden="true"></span><span class="text">${esc(text)}</span>${focus ? `<button type="button" class="mice-go" data-n="${esc(focus)}" title="Show it">show</button>` : ''}`);
  const question = q => addItem('q', `<p>${esc(q)}</p>`);
  const answer = ({ by, text, chips = [], meta = '', actions = [] }) => addItem('a', `<div class="head"><span class="dot" aria-hidden="true"></span><b>${esc(by)}</b>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}</div><p>${text}</p>${chips.length || actions.length ? `<div class="chips">${chips.map(c => chip(c.id, c.label)).join('')}${actions.map(a => `<button type="button" class="mice-chip act" data-act="${esc(a.act)}" data-arg="${esc(a.arg || '')}">${esc(a.label)}</button>`).join('')}</div>` : ''}`);
  log.addEventListener('click', e => {
    const n = e.target.closest('[data-n]'); if (n) { G().select(n.dataset.n); if (phone()) setOpen(false); return; }
    const a = e.target.closest('[data-act]'); if (a) runAction(a.dataset.act, a.dataset.arg, a);
  });

  // ---------- open / shut, on / off ----------
  let open = false;
  function setOpen(o, remember = true) {
    open = o; root.classList.toggle('open', o); head.setAttribute('aria-expanded', String(o));
    if (o) root.setAttribute('role', 'dialog'); else root.removeAttribute('role');   // open, it is a dialog: on a phone it covers the brain, and the Drive's button steps out of its way (hiding if there is nowhere to go)
    if (remember) try { storage?.setItem(OPEN_KEY, o ? 'open' : 'shut'); } catch (e) { }
    // on a desktop the chat shares the left column with the lobe list: while it is open the list folds to its heading (as it does for the connectome)
    const cx = document.getElementById('connectome'), lobes = document.getElementById('lobes');
    if (o && cx && cx.classList.contains('open')) document.getElementById('cx-head')?.click();
    if (lobes && !(cx && cx.classList.contains('open'))) lobes.classList.toggle('folded', o && !phone());
    if (o) { scrollDown(); if (!phone()) setTimeout(() => input.focus({ preventScroll: true }), 60); }
  }
  window.addEventListener('resize', () => { const lobes = document.getElementById('lobes'); const cx = document.getElementById('connectome'); if (lobes && !(cx && cx.classList.contains('open'))) lobes.classList.toggle('folded', open && !phone()); });
  head.addEventListener('click', () => setOpen(!open));
  document.querySelector('.lobes-head')?.addEventListener('click', () => { if (open && !phone()) setOpen(false); });   // opening the folded lobe list puts the chat away
  const statusText = s => s.retired ? 'gone to the chat shows' : !s.on ? 'off' : 'at work';
  let lastState = '';
  function paint(s) {
    head.classList.toggle('paused', !s.on); head.classList.toggle('done', s.retired); head.classList.toggle('working', s.working && s.on);
    root.hidden = !s.on; document.body.classList.toggle('mice-off', !s.on);
    cheese.setAttribute('aria-pressed', String(s.on));
    cheese.title = s.on ? 'The mice are on (M). Press to switch them off: they stop building and their chat is put away. Their networks stay.' : 'The mice are off (M). Press the cheese to bring them back.';
    const st = statusText(s); if (st !== lastState || !out.textContent) out.textContent = st; lastState = st;   // the latest act stays in the head until the state itself changes
  }
  cheese.addEventListener('click', () => M.setOn(!M.on()));
  if (homeBtn) homeBtn.addEventListener('click', () => { M.clear(); location.reload(); });

  // ---------- the cheese sits above the Improbability Drive's button ----------
  const drive = () => document.getElementById('mb-drive');
  function place() {
    const d = drive(); const size = cheese.offsetWidth || 44;
    if (!d) {   // no Drive on this page: above the highest zoom column
      let r = null; document.querySelectorAll('.zoom-ctl').forEach(z => { if (z.offsetParent === null) return; const b = z.getBoundingClientRect(); if (b.width > 0 && (!r || b.top < r.top)) r = b; });
      if (!r) { cheese.hidden = true; return; }
      cheese.hidden = false; cheese.style.left = Math.round(r.left + r.width / 2 - size / 2) + 'px'; cheese.style.top = Math.round(r.top - size - 12) + 'px'; return;
    }
    const r = d.getBoundingClientRect(); const hide = d.classList.contains('mb-hidden') || r.width === 0;
    cheese.hidden = hide; if (hide) return;
    const top = Math.round(r.top - size - 10);
    // no room between the header and the Drive (short desktop windows): sit beside the Drive instead of under the stats
    const hd = document.getElementById('top'), ceil = hd && window.innerWidth > 900 && hd.offsetParent !== null ? hd.getBoundingClientRect().bottom + 4 : 4;
    if (top < ceil && ceil > 4) {
      let x = r.left; const en = document.getElementById('mb-entangler');   // the Entangler may already sit beside the Drive: go one slot further left
      if (en && !en.hidden && en.offsetParent !== null) { const e = en.getBoundingClientRect(); if (e.width && e.bottom > r.top && e.top < r.bottom && e.left < x) x = e.left; }
      cheese.style.left = Math.round(x - size - 10) + 'px'; cheese.style.top = Math.round(r.top + r.height / 2 - size / 2) + 'px'; cheese.classList.remove('mice-cheese-squeezed'); return; }
    cheese.style.left = Math.round(r.left + r.width / 2 - size / 2) + 'px'; cheese.style.top = Math.max(4, top) + 'px';
    cheese.classList.toggle('mice-cheese-squeezed', top < 4);
  }
  const d0 = drive(); if (d0) new MutationObserver(place).observe(d0, { attributes: true, attributeFilter: ['style', 'class'] });
  else setTimeout(() => { const d = drive(); if (d) new MutationObserver(place).observe(d, { attributes: true, attributeFilter: ['style', 'class'] }); place(); }, 400);
  window.addEventListener('resize', place); setInterval(place, 600); place();

  // ---------- what the mice understand directly ----------
  const STARTERS = ['Who are you?', 'What have you built?', 'What is the Question?', 'Why are the lines red?', 'Build a network', 'Where did the dolphins go?'];
  const mine = () => G().lobes().filter(l => l.origin === 'mice');
  function summary() {
    const c = M.count(), lobes = mine().filter(l => !l.satellite), brains = mine().filter(l => l.satellite);
    if (!c.neurons) return { text: 'Nothing yet. Give us a minute; Frankie is still reading the brief.', chips: [] };
    const bits = [`${c.neurons} ${c.neurons === 1 ? 'neuron' : 'neurons'}`, `${lobes.length} ${lobes.length === 1 ? 'network' : 'networks'}`, brains.length ? `${brains.length} ${brains.length === 1 ? 'brain' : 'brains'}` : null, `${c.synapses} ${c.synapses === 1 ? 'synapse' : 'synapses'}`].filter(Boolean);
    const chips = [...brains, ...lobes].slice(0, 6).map(l => { const ps = G().pages().filter(p => p.lobe === l.id); const hub = ps.find(p => p.hub) || ps[0]; return hub ? { id: hub.id, label: l.name } : null; }).filter(Boolean);
    const caps = M.caps; const left = Math.max(0, caps.neurons - c.neurons);
    return { text: `So far: ${bits.join(' \u00b7 ')}, all wired back to the Question. ${left ? `Room for ${left} more neurons before we go to the chat shows.` : 'That is the lot; we have gone to the chat shows.'}`, chips, meta: `${c.neurons} neurons \u00b7 lab notes` };
  }
  const candidates = () => G().pages().filter(p => p.origin === 'mice' && !p.hub).slice(-3).map(p => ({ id: p.id }));
  // a build offer only promises what the caps allow right now; otherwise it says why and offers the next size down
  const BUILD = { brain: 'Build a brain', lobe: 'Build a network', neuron: 'Build a neuron' };
  function offer(want, text) {
    if (M.retired()) return { text: 'We have gone to the chat shows. Send us home first and we will start again.', actions: [{ act: 'home', label: 'Send them home' }] };
    const why = M.cannot(want);
    if (!why) return { text, actions: [{ act: 'build', arg: want, label: BUILD[want] }] };
    const smaller = ['lobe', 'neuron'].find(w => w !== want && ['brain', 'lobe', 'neuron'].indexOf(w) > ['brain', 'lobe', 'neuron'].indexOf(want) && !M.cannot(w));
    return { text: `Not that one, not yet. ${why}`, actions: smaller ? [{ act: 'build', arg: smaller, label: BUILD[smaller] }] : [] };
  }
  const INTENTS = [
    [/\b(who|what) (are|r) (you|u|the mice)\b|\byourselves?\b|\bfrankie\b|\bbenjy\b/i, () => ({
      text: 'Frankie and Benjy. Hyperintelligent pan-dimensional beings, though in this dimension we come out as mice. We commissioned the Earth to find the Question, the Vogons demolished it five minutes early, and we are now rebuilding the research programme on this brain instead. It is cheaper.', chips: [{ id: M.mice }, { id: 'earth' }], meta: 'Minds \u00b7 2 neurons' })],
    [/\b(what|which|how much|how many)\b.*\b(you|you've|your|the mice)\b.*\b(built|made|done|added|grown|building|so far|progress)\b|\byour (networks?|brains?|neurons?|work|progress)\b|\bshow me\b.*\b(built|yours?|your)\b|\bbuilt so far\b/i, () => summary()],
    [/^(?!\s*(who|what|when|where|why|how|did|does|do|is|was|has|have)\b).*\b(build|make|add|create|grow|start)\b.*\b(brain)\b/i, () => offer('brain', 'A whole brain. Benjy is drawing up the hub now.')],
    [/^(?!\s*(who|what|when|where|why|how|did|does|do|is|was|has|have)\b).*\b(build|make|add|create|grow|start)\b.*\b(network|lobe)\b/i, () => offer('lobe', 'Right. A network of our own, wired to the Question like the others.')],
    [/^(?!\s*(who|what|when|where|why|how|did|does|do|is|was|has|have)\b).*\b(build|make|add|create|grow)\b.*\b(neuron|something|anything)\b|^\s*(build|go on|do something)\s*[.!]?\s*$/i, () => offer('neuron', 'One neuron, coming up.')],
    [/^\s*(stop|pause|rest|quiet|shut up|go away|sit down)\b[^?]*$|\b(switch|turn) (the mice |you |yourselves |them |it )?off\b|\b(stop|pause) (building|working|growing)\b|\b(take|have) a (rest|break)\b/i, () => ({ text: 'Fine. We were due a sit-down. The cheese above Don\u2019t Panic brings us back.', actions: [{ act: 'off', label: 'Switch the mice off' }] })],
    [/^\s*(go home|clear|reset|start (over|again))\b[^?]*$|\bsend (you|them|the mice) home\b|\b(clear|delete|remove|forget|undo) (everything|it all|all of it|all that|your (work|stuff|networks?|brains?|neurons?)|what you (built|made))\b/i, () => ({ text: 'Send us home and everything we built in this browser goes with us. The Guide\u2019s own brain is untouched; it always was.', actions: [{ act: 'home', label: 'Send them home' }] })],
    [/\b(ultimate question|the question)\b/i, () => ({
      text: 'Nobody knows; that is rather the point. Deep Thought produced the Answer and then needed a bigger computer, the Earth, to work out what the Question was. Every network we build is wired to it, and the Question itself stays empty until somebody finds it. Our current candidates are below.', chips: [{ id: M.question }, ...candidates()], meta: 'The Question \u00b7 design rule' })],
    [/\b(the answer|42|forty[- ]two|meaning of (life|everything))\b/i, () => ({ text: 'Forty-two. Deep Thought checked it very thoroughly. What it is the answer to is the bit we are still working on.', chips: [{ id: M.hub }, { id: 'deep-thought' }], meta: 'The Answer \u00b7 2 neurons' })],
    [/\bred (lines?|wires?|trails?|paths?|signals?|rings?|dots?|spikes?|glow|ones?)\b|\bin red\b|\bwhy\b.*\bred\b|\bcolou?r\b.*\b(line|wire|trail|path|signal)|\b(line|wire|trail|path|signal)s?\b.*\bcolou?r/i, () => ({ text: 'Everything we build signals in red: a spike leaving one of our neurons, the hop after it, a route that starts with us. It is so you can see which paths are ours and which are the Guide\u2019s. Frankie says it is a feature.', chips: candidates(), meta: 'how to read the brain' })],
    [/\bcheese\b/i, () => ({ text: 'We do not actually want the cheese. We want the humans to think we want the cheese. The one above Don\u2019t Panic is a switch, which is about right.', chips: G().pages().filter(p => /cheese/i.test(p.title)).slice(0, 2).map(p => ({ id: p.id })), meta: 'lab notes' })],
    [/^\s*(hi|hello|hey|hiya|good (morning|evening|afternoon)|greetings)\b/i, () => ({ text: pick(['Hello. Mind the maze.', 'Hello. We are a bit busy, but go on.', 'Good day. Have you brought a towel?']), chips: [{ id: 'towel' }] })],
    [/\b(thanks|thank you|cheers|ta)\b/i, () => ({ text: pick(['Not at all. Put it on the invoice.', 'You are welcome. Say so on the chat shows.']) })],
    [/\b(help|what can i ask|how does this work|what do you do)\b/i, () => ({ text: 'Ask about anything in the Guide\u2019s brain and we will find the neuron. Ask what we have built, ask us to build a network or a brain, or ask something nobody has a neuron for yet and we will file it.', chips: [], meta: 'help' })],
  ];

  // ---------- grounded answers: the brain itself, minus Footnotes, plus the mice's lab notes ----------
  const STOP = new Set('the a an is are was were be been being am what who whom whose why how when where which do does did of to in on at by and or it its this that these those you your yours i me my we us our they them their can could would should will shall about for with tell know any there here from as into than then so if not no yes please mice mouse guide really ever some something anything every'.split(' '));
  const stem = w => w.length > 4 ? w.replace(/(ies|ing|ed|es|s)$/, m => m === 'ies' ? 'y' : '') : w;
  const tokens = s => String(s || '').toLowerCase().replace(/[\u2019']/g, '').split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w)).map(stem);
  const hidden = new Set(D.lobes.filter(l => l.hidden).map(l => l.id));
  function corpus() {
    const docs = [];
    const add = (id, title, lobe, fields) => docs.push({ id, title, lobe, fields: fields.filter(f => f[1]).map(([w, s]) => ({ w, s, t: tokens(s) })) });
    const synsOf = {}; (D.synapses || []).forEach(s => (synsOf[s.page] = synsOf[s.page] || []).push(s));
    D.pages.forEach(p => { if (hidden.has(p.lobe) || /^foot\//.test(p.id)) return; add(p.id, p.title, p.lobe, [[3, p.title], [1.5, p.desc], ...(synsOf[p.id] || []).map(s => [1.2, `${s.lead}. ${s.text}`])]); });
    M.journal().forEach(a => {
      if (a.act === 'neuron') add(a.id, a.title, a.lobe, [[3, a.title], [1.5, a.desc], [1.2, a.syn ? `${a.syn.lead}. ${a.syn.text}` : '']]);
      else if (a.act === 'lobe' || a.act === 'brain') {
        (a.act === 'lobe' ? [a] : a.lobes).forEach(lb => lb.members.forEach(m => add(m.id, m.title, lb.id, [[3, m.title], [1.5, m.desc], [2, lb.name], ...(lb.syn && lb.syn.page === m.id ? [[1.2, `${lb.syn.lead}. ${lb.syn.text}`]] : [])])));
        if (a.act === 'brain') add(a.hub.id, a.name, a.id, [[3, a.name], [1.5, a.hub.desc]]);
      } else if (a.act === 'synapse') { const d = docs.find(x => x.id === a.page); if (d) d.fields.push({ w: 1.2, s: `${a.lead}. ${a.text}`, t: tokens(`${a.lead}. ${a.text}`) }); }
    });
    return docs.filter(d => G().pages().some(p => p.id === d.id));   // only what is on the brain right now
  }
  const hit = (q, t) => t === q || (q.length >= 4 && t.startsWith(q)) || (t.length >= 4 && q.startsWith(t));
  function search(q) {
    const qt = [...new Set(tokens(q))]; if (!qt.length) return [];
    const ql = q.toLowerCase();
    return corpus().map(d => {
      let score = 0, best = null, bestScore = 0;
      d.fields.forEach((f, i) => { const m = qt.filter(x => f.t.some(t => hit(x, t))).length; if (!m) return; const s = f.w * m; score += s; if (i && s >= bestScore) { bestScore = s; best = f.s; } });
      if (d.title.length >= 4 && ql.includes(d.title.toLowerCase())) score += 4;
      return { d, score, snippet: best || d.fields[1]?.s || '' };
    }).filter(x => x.score >= 2.4).sort((a, b) => b.score - a.score).slice(0, 3);
  }
  const trim = (s, n) => { s = String(s || '').trim(); if (s.length <= n) return s; const cut = s.slice(0, n); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? ')); return end > n * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '\u2026'; };
  const OPENERS = ['We looked that up.', 'There is a neuron for that.', 'From the Guide\u2019s own entry:', 'Benjy had a note on this.', 'Checked very thoroughly, by a mouse.', 'Short version:'];
  const titleFor = q => { let t = q.trim().replace(/\s+/g, ' ').replace(/^(tell me|do you know|what about|what is|what are|who is|who was|where is|why is|how is)\s+/i, m => /^(what|who|where|why|how)/i.test(m) ? m : ''); t = t.charAt(0).toUpperCase() + t.slice(1); return t.length > 60 ? t.slice(0, 57).replace(/\s+\S*$/, '') + '\u2026' : t; };
  // Intents answer questions about the mice themselves. A question the brain has a confident neuron for (its title is in
  // the question) goes to the neuron first, so Guide questions that happen to contain "answer" or "red" are not hijacked.
  function reply(q) {
    const hits = search(q); const sure = hits.length && hits[0].score >= 6;
    const intent = INTENTS.find(([re]) => re.test(q));
    if (intent && !sure) return intent[1](q);
    if (hits.length) {
      const top = hits[0], lobes = [...new Set(hits.map(h => lobeName(h.d.lobe)).filter(Boolean))];
      const own = G().pages().find(p => p.id === top.d.id)?.origin === 'mice';
      const text = `${own ? 'That is one of ours.' : pick(OPENERS)} <b>${esc(top.d.title)}</b> \u2014 ${esc(trim(top.snippet, 260))}`;
      return { text, chips: hits.map(h => ({ id: h.d.id })), meta: `${hits.length} ${hits.length === 1 ? 'neuron' : 'neurons'} \u00b7 ${lobes.join(', ')}` };
    }
    if (intent) return intent[1](q);
    const title = titleFor(q); const c = M.count(); const room = c.neurons < M.caps.neurons && !M.retired();
    return { text: `Nobody has a neuron for that yet. ${room ? 'We could file it as one of ours and see where the wiring takes it.' : 'And we are full up, so it will have to wait for the next brain.'}`, actions: room ? [{ act: 'file', arg: title, label: `Build \u201c${trim(title, 40)}\u201d` }] : [], meta: 'no match' };
  }

  // ---------- asking ----------
  let busy = false;
  async function ask(q) {
    q = String(q || '').trim(); if (!q || busy) return; busy = true; input.value = ''; starters.hidden = true;
    question(q);
    const typing = addItem('a typing', `<div class="head"><span class="dot" aria-hidden="true"></span><b>${esc(M.names[turn % M.names.length])}</b><span class="meta">thinking\u2026</span></div>`);
    await new Promise(r => setTimeout(r, reduceMotion ? 0 : 350 + Math.random() * 450));
    typing.remove();
    let r; try { r = reply(q); } catch (e) { console.warn('mice chat', e); r = { text: 'Sorry, the maze moved. Ask that again?' }; }
    answer({ by: who(), ...r }); busy = false;
  }
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  async function runAction(act, arg, btn) {
    if (btn) btn.disabled = true;
    if (act === 'build') {
      if (M.retired()) { answer({ by: who(), text: 'We have gone to the chat shows. Send us home first and we will start again.' }); return; }
      const why = M.cannot(arg); if (why) { answer({ by: who(), text: `Not that one, not yet. ${why}` }); return; }   // never quietly build something smaller than what was asked for
      const a = await M.act({ want: arg }); if (!a) answer({ by: who(), text: 'The caps say no. We have gone to the chat shows.' });
    }
    else if (act === 'file') { const a = await M.act({ idea: [arg, 'Raised by a visitor and filed by the mice. Under investigation; the mice are not reliable narrators, and neither, in fairness, is the visitor.'] }); const by = a ? a.by : who(); if (a) answer({ by, text: `Filed. <b>${esc(a.title)}</b> is now a neuron in ${esc(lobeName(a.lobe))}, wired to ${esc(titleOf(a.links[0]?.t))}.`, chips: [{ id: a.id }], meta: 'lab notes \u00b7 1 neuron' }); else answer({ by, text: 'No room left; we have gone to the chat shows.' }); }
    else if (act === 'off') M.setOn(false);
    else if (act === 'home') { M.clear(); location.reload(); }
  }
  starters.innerHTML = STARTERS.map(s => `<button type="button" class="mice-starter">${esc(s)}</button>`).join('');
  starters.addEventListener('click', e => { const b = e.target.closest('.mice-starter'); if (b) ask(b.textContent); });

  // ---------- listen to the mice ----------
  let lastToast = '';
  M.listen((type, data) => {
    if (type === 'act') { out.textContent = data.text; activity(data.text, data.focus); }
    else if (type === 'say') out.textContent = data;
    else if (type === 'toast') { if (data !== lastToast) note(data); lastToast = data; out.textContent = data; setTimeout(() => { lastToast = ''; }, 1000); }
    else if (type === 'status') paint(data);
  });
  paint(M.status());
  const replayed = M.journal().length;   // the engine replayed the journal before this script loaded
  if (replayed) note(`${replayed} ${replayed === 1 ? 'entry' : 'entries'} from last time, replayed`);
  else note('Frankie and Benjy are warming up. Ask them something while you wait.');
  setOpen((() => { try { const v = storage?.getItem(OPEN_KEY); if (v) return v === 'open'; } catch (e) { } return !phone(); })(), false);
})();
