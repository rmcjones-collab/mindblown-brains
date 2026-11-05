/* MindBlown Neural — mice.js
   The mice for guide.html. Frankie and Benjy — the two hyperintelligent pan-dimensional beings filed under "The mice" in the
   Minds lobe — are let loose on the Guide's brain. Every few seconds one of them adds something: a neuron in a lobe that
   already exists (the Guide's or one of their own), a new network (a lobe of their own), or, rarely, a whole satellite brain
   (a hub neuron with lobes of its own, tethered back to 42 and the Question). They also wire new synapses into neurons they
   have built. Everything they make carries `origin: 'mice'` and `by: 'Frankie' | 'Benjy'`, and the engine treats grown
   material specially: it is ringed in red, and any signal that sets out from it — a spike, a routed volley, a route — shows
   its path of travel in red (see dynamics.js / render.js).
   Design rules kept: the Question neuron can be wired to but never receives synapses; the Footnotes lobe is the only
   real-world lobe, so the mice never touch it; the mice never edit or remove anything the Guide wrote.
   The mice write a journal to localStorage (mbn:mice:guide) so their work survives a reload; "Clear" sends them home.
   Origin brains (js/origin.js): the mice are also the first builder brain. Hand them a blank origin brain and they ask what
   it is about, then build it to their standards. On the Guide that includes their own lab notes; on any other page they
   respond to the host network instead — relaying what it already knows about the subject (its own neurons, synapses and
   sources, never hidden lobes) and bringing in further information from the rest of MindBlown through the origin index,
   each with a link back. Relayed facts keep their real sources; the mice's own remarks are filed as lab notes and say so.
   The cheese (mbn:mice:on:guide, key M) switches them off and on; off, they stop building and their chat is put away.
   This file is the engine only: it announces what happens through MINDBLOWN_MICE.listen(), and js/mice-chat.js is the
   dock the visitor sees on the Guide (the chat, the cheese, and the mice's answers).
   View-level add-on: uses only window.MINDBLOWN_GROW (the opt-in growth API), window.MINDBLOWN_ORIGIN and the page data. */
(() => {
  const toastEl = document.getElementById('toast');
  const D = window.MINDBLOWN, G = () => window.MINDBLOWN_GROW;
  if (!D || !Array.isArray(D.pages) || !G()) return;
  const ROAM = D.brain === 'guide';   // free-roaming mice live on the Guide (their chat, js/mice-chat.js, is the dock); elsewhere they only build origin brains
  if (ROAM) document.body.classList.add('has-mice');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'mbn:mice:' + (D.brain || 'guide'), ON_KEY = 'mbn:mice:on:' + (D.brain || 'guide');
  const HUB = D.center || 'answer', QUESTION = 'question', MICE = 'mice';
  const hasPage = id => D.pages.some(p => p.id === id);
  const ON_GUIDE = D.brain === 'guide' && hasPage(QUESTION) && hasPage(MICE);
  const CAP = { neurons: 48, lobes: 8, brains: 3, synapses: 200 };
  const MICE_NAMES = ['Frankie', 'Benjy'];
  const PALETTE = ['#f472b6', '#a3e635', '#38bdf8', '#fb923c', '#e879f9', '#2dd4bf', '#facc15', '#c084fc'];
  const hue = c => typeof c === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? c : PALETTE[0];   // journal colours come back from localStorage: only a plain hex reaches a style attribute

  // ---------- word banks (fiction; the mice are not reliable narrators) ----------
  const LOBE_NAMES = ['Question Candidates', 'Chat-show Material', 'Experiment {n}', 'Earth Mark {roman}', 'Brain Procurement', 'Maze Design', 'Cheese Theory', 'Ten Million Year Plan', 'Pan-dimensional Paperwork', 'Lab Notes, Series {n}'];
  const BRAIN_NAMES = ['Earth Mark {roman}', 'Deep Thought Junior', 'The Replacement Computer', 'A Simple Brain'];
  const IDEAS = [
    ['How many roads must a man walk down?', 'A perfectly respectable Question, if a little wordy. Frankie thinks it will play well on the chat shows.'],
    ['Is there any tea?', 'Arthur asked this more than anything else, which makes it a strong candidate for the Question by sheer frequency.'],
    ['Why 42 and not 41?', 'Deep Thought checked it very thoroughly. The mice would like to see the working.'],
    ['Who ordered the fjords?', 'Slartibartfast did Norway. Somebody signed off on the invoice, and the mice would like a word.'],
    ['How much for Arthur\u2019s brain?', 'A fair price was offered. A replacement electronic brain was also offered. Neither was accepted.'],
    ['Would a simple brain do?', '"You\u2019d just have to program it to say What? and I don\u2019t understand and Where\u2019s the tea? Who\u2019d know the difference?"'],
    ['Where did the dolphins go?', 'They left a message. The message was widely misunderstood as a surprisingly sophisticated attempt to do a double-backwards somersault through a hoop whilst whistling.'],
    ['Maze 4,000,001', 'The next maze. The humans run it believing they are studying the mice. The mice let them.'],
    ['Control Earth', 'An Earth with no experiment running on it, for comparison. Budget pending.'],
    ['The humans never noticed', 'Ten million years of being run as an experiment by their laboratory animals, and not one of them wrote it down.'],
    ['What do you get if you multiply six by nine?', 'Arthur\u2019s Scrabble tiles produced this. Benjy notes that it is only correct in base thirteen and that nobody makes jokes in base thirteen.'],
    ['A proposal for a new Earth', 'Same design, slightly fewer dinosaurs, a shorter run-in to the Question. Magrathea has been asked to quote.'],
    ['Programme note: Zaphod', 'Two heads, three arms, one of them surgically added, and a Galactic Presidency he does not use. Chat-show gold.'],
    ['Running order', 'Open with the Answer, hold the Question till after the adverts, close on the dolphins.'],
    ['Cheese: a working hypothesis', 'The mice do not actually want the cheese. They want the humans to think they want the cheese.'],
    ['The Vogon angle', 'Somebody demolished the experiment five minutes before it finished. The paperwork for that is being pursued.'],
    ['Marvin as a witness', 'He was there for most of it and remembers all of it, which is more or less his whole problem.'],
    ['The towel standard', 'Any species that can keep track of its towel is probably ready to hear the Question. Possibly.'],
    ['Deep Thought, second opinion', 'Seven and a half million years, and the mice would like to know whether a weekend would have done.'],
    ['Audience research', 'The Galaxy will accept any Question as long as it is delivered with confidence and a small wink.'],
    ['A quieter maze', 'Fewer cheese incidents, better data. Rejected by Frankie on grounds of entertainment value.'],
    ['Nine times six, revisited', 'Still thirty-nine in base thirteen. Still not the point.'],
    ['Petunias (follow-up)', 'The bowl of petunias thought "Oh no, not again." The mice would like to know what it meant by "again".'],
    ['Ursa Minor Beta, expenses', 'The Guide\u2019s offices are on a beach where it is always Saturday afternoon. The mice have asked for a desk.'],
  ];
  const FACTS = [
    ['Frankie\u2019s proposal', '{idea} — put it to the chat shows, see if it sticks. If it does not, we were never here.'],
    ['Benjy\u2019s objection', 'Nobody will believe {idea}. On the other hand, nobody believed the Answer either, and that did rather well.'],
    ['Experiment note', 'Tested {idea} on a human. The human asked for tea. Inconclusive; repeat with biscuits.'],
    ['Minutes', 'Resolved: {idea} is the Question until a better one turns up. Carried, two votes to none, one abstention from the cat.'],
    ['Lab note', 'Wired {idea} into {target}. Signal came back red, which Frankie says is a feature.'],
    ['Budget line', '{idea}: one planet, ten million years, a modest fee for Magrathea. Approved in principle by Benjy, who does not have the authority.'],
  ];
  const LINK_NOTES = ['commissioned by Frankie', 'wired in by Benjy', 'a shortcut through the maze', 'on the chat-show running order', 'pan-dimensional paperwork', 'checked very thoroughly, by a mouse'];
  const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const fill = (s, n) => s.replace('{n}', String(n)).replace('{roman}', ROMAN[(n - 2 + ROMAN.length) % ROMAN.length]);
  // a lobe or brain name nobody is using yet (the mice are inventive, but only up to a point: after that, "Mark II")
  const uniqueName = (bank, n) => { const taken = new Set(G().lobes().map(l => l.name)); const free = bank.map(b => fill(b, n)).filter(x => !taken.has(x)); if (free.length) return pick(free); let k = 2, base = fill(pick(bank), n); while (taken.has(`${base} (${k})`)) k++; return `${base} (${k})`; };

  // ---------- journal ----------
  const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  let journal = []; try { journal = JSON.parse(storage?.getItem(KEY) || '[]'); if (!Array.isArray(journal)) journal = []; } catch (e) { journal = []; }
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(journal)); } catch (e) { } };
  // id counter. A journal entry can carry several ids (a brain: hub + lobes + members), so on reload the counter resumes
  // after the largest numeric suffix the journal used, and fresh ids additionally skip anything already in the graph.
  const idNums = a => [a.id, a.hub?.id, ...(a.members || []).map(m => m.id), ...(a.lobes || []).flatMap(l => [l.id, ...l.members.map(m => m.id)])].filter(Boolean).map(id => +(String(id).match(/-(\d+)$/) || [])[1] || 0);
  let seq = journal.reduce((m, a) => Math.max(m, ...idNums(a)), 0);
  const inUse = id => !!(G().pages().some(p => p.id === id) || G().lobes().some(l => l.id === id));
  const freshId = make => { let id = make(++seq); while (inUse(id)) id = make(++seq); return id; };

  // ---------- state ----------
  const state = { paused: false, retired: false, working: false, timer: 0, usedIdeas: new Set(), lobeN: 0, brainN: 0 };
  try { state.paused = storage?.getItem(ON_KEY) === 'off'; } catch (e) { }
  // listeners (the chat): ('act', { a, text }) · ('status', status()) · ('toast', msg)
  const listeners = new Set(); const emit = (type, data) => listeners.forEach(f => { try { f(type, data); } catch (e) { console.warn('mice listener', e); } });
  const status = () => ({ on: !state.paused, retired: state.retired, working: state.working, count: count() });
  const guideLobes = D.lobes.filter(l => !l.hidden).map(l => l.id);   // Footnotes is hidden and real; the mice never file there
  const hiddenLobe = id => D.lobes.some(l => l.id === id && l.hidden);   // ...nor wire into it
  const mine = () => G().lobes().filter(l => l.origin === 'mice');
  const myNeurons = () => G().pages().filter(p => p.origin === 'mice');
  const ownLobes = () => mine().filter(l => !l.satellite);
  const brains = () => mine().filter(l => l.satellite);
  const neuronsIn = id => G().pages().filter(p => p.lobe === id);
  const count = () => G().count('mice');   // the roaming mice count only their own material; origin brains are counted by origin.js
  const nextIdea = () => { const left = IDEAS.filter((_, i) => !state.usedIdeas.has(i)); if (!left.length) state.usedIdeas.clear(); const i = IDEAS.indexOf(left.length ? pick(left) : pick(IDEAS)); state.usedIdeas.add(i); return IDEAS[i]; };

  // ---------- the acts themselves (pure data; apply() turns one into graph changes, so the journal replays exactly) ----------
  function planNeuron(by, idea) {   // idea: [title, desc] when a visitor asked for something the brain has no neuron for
    const own = mine().filter(l => !l.satellite), lobes = (idea ? own.length : Math.random() < 0.55 && own.length) ? own.map(l => l.id) : guideLobes.filter(id => id !== 'ans' && (!idea || id !== 'q'));   // a visitor's idea goes into one of the mice's own networks when they have one, and never straight into The Question
    const lobe = pick(lobes), [title, desc] = idea || nextIdea();
    const id = freshId(n => `mice/${slug(title)}-${n}`), peers = neuronsIn(lobe).filter(p => p.id !== HUB).map(p => p.id);
    const links = []; const same = [...peers].sort(() => Math.random() - 0.5).slice(0, peers.length ? 1 + (Math.random() < 0.5 ? 1 : 0) : 0);
    same.forEach(t => links.push({ t, note: pick(LINK_NOTES), w: 1 + Math.floor(Math.random() * 2) }));
    if (Math.random() < 0.6) links.push({ t: MICE, note: 'reported back to the mice', w: 1 });
    if (Math.random() < 0.45) links.push({ t: QUESTION, note: 'a candidate for the Question', w: 1 });
    if (!links.length) links.push({ t: MICE, note: 'reported back to the mice', w: 1 });
    const [lead, text] = pick(FACTS);
    return { act: 'neuron', by, id, title, desc, lobe, near: same[0] || MICE, links, syn: { id: `${id}#1`, lead, text: text.replace('{idea}', title.replace(/\?$/, '')).replace('{target}', same[0] || 'the mice'), links: links.filter(l => l.t !== id).slice(0, 1).map(l => l.t) } };
  }
  function planLobe(by, brain) {   // brain: { id: brain lobe, hub: hub neuron } when this network belongs to a mice brain
    const brainId = brain && brain.id, hubId = brain && brain.hub;
    state.lobeN++; const n = state.lobeN + 1;
    const name = uniqueName(LOBE_NAMES, n), id = freshId(k => `mice-lobe-${slug(name)}-${k}`), color = PALETTE[(state.lobeN + state.brainN) % PALETTE.length];
    const members = []; const k = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < k; i++) { const [title, desc] = nextIdea(); members.push({ id: freshId(j => `mice/${slug(title)}-${j}`), title, desc }); }
    const links = [];
    for (let i = 1; i < members.length; i++) links.push({ s: members[i].id, t: members[i - 1].id, note: pick(LINK_NOTES), w: 2 });
    if (members.length > 2) links.push({ s: members[0].id, t: members[members.length - 1].id, note: pick(LINK_NOTES), w: 1 });
    links.push({ s: members[0].id, t: hubId || QUESTION, note: hubId ? 'filed with its brain' : 'every network must be wired to the Question', w: 2 });   // the design rule: everything is wired to the Question (a brain's lobes reach it through their hub)
    if (!brainId) links.push({ s: members[1].id, t: MICE, note: 'reported back to the mice', w: 1 });
    const [lead, text] = pick(FACTS);
    return { act: 'lobe', by, id, name, color, brain: brainId || null, members, links, syn: { page: members[0].id, id: `${members[0].id}#1`, lead, text: text.replace('{idea}', members[0].title.replace(/\?$/, '')).replace('{target}', members[1].title), links: [members[1].id] } };
  }
  function planBrain(by) {
    state.brainN++; const n = state.brainN + 1;
    const name = uniqueName(BRAIN_NAMES, n), id = freshId(k => `mice-brain-${slug(name)}-${k}`), color = PALETTE[(state.lobeN + state.brainN + 3) % PALETTE.length];
    const hub = { id: freshId(k => `mice/hub-${slug(name)}-${k}`), title: name, desc: `A brain of the mice\u2019s own, built by ${by} as a satellite of the Guide\u2019s. Its hub is tethered to 42 and to the Question, because that is how brains are done around here.` };
    const lobes = []; const k = 1 + (Math.random() < 0.6 ? 1 : 0);
    for (let i = 0; i < k; i++) lobes.push(planLobe(by, { id, hub: hub.id }));
    return { act: 'brain', by, id, name, color, hub, lobes, links: [{ s: hub.id, t: HUB, note: 'tethered to the Answer', w: 3 }, { s: hub.id, t: QUESTION, note: 'tethered to the Question', w: 2 }, { s: hub.id, t: MICE, note: 'built by the mice', w: 1 }] };
  }
  function planSynapse(by) {
    const own = myNeurons(); if (!own.length) return null;
    const p = pick(own); const targets = G().pages().filter(x => x.id !== p.id && x.lobe === p.lobe).map(x => x.id); const [lead, text] = pick(FACTS); const idea = nextIdea()[0];
    const t = targets.length && Math.random() < 0.7 ? pick(targets) : (Math.random() < 0.5 ? MICE : QUESTION);
    return { act: 'synapse', by, page: p.id, id: `${p.id}#${p.nSyn + 1}`, lead, text: text.replace('{idea}', idea.replace(/\?$/, '')).replace('{target}', t), links: [t] };
  }
  function planWire(by) {
    const own = myNeurons(); if (!own.length) return null; const p = pick(own);
    const all = G().pages().filter(x => x.id !== p.id && x.id !== HUB && !hiddenLobe(x.lobe) && (Math.random() < 0.5 ? x.lobe === p.lobe : true)); if (!all.length) return null;   // never into Footnotes (the hidden, real-world lobe)
    return { act: 'wire', by, s: p.id, t: pick(all).id, note: pick(LINK_NOTES), w: 1 };
  }

  const SRC = { id: 'mice:lab-notes', label: 'The mice\u2019s own lab notes (grown in this session, fiction)', kind: 'mice' };
  function apply(a) {
    const g = G(); if (!g) return null; let focus = null;
    const neuron = (spec, lobe, by, hub) => g.addNeuron({ id: spec.id, title: spec.title, desc: spec.desc, lobe, origin: 'mice', by, near: spec.near, hub: !!hub });
    if (a.act === 'neuron') {
      focus = neuron({ ...a, near: a.near }, a.lobe, a.by); if (!focus) return null;
      a.links.forEach(l => g.addLink({ s: a.id, t: l.t, w: l.w, note: l.note, origin: 'mice', by: a.by }));
      if (a.syn) g.addSynapse({ ...a.syn, page: a.id, section: 'Lab notes', origin: 'mice', by: a.by, sources: [SRC] });
    } else if (a.act === 'lobe' || a.act === 'brain') {
      const addLobe = (lb, brainId) => {
        g.addLobe({ id: lb.id, name: lb.name, color: hue(lb.color), origin: 'mice', by: lb.by, brain: brainId || lb.brain || null });
        lb.members.forEach((m, i) => { const n = neuron({ ...m, near: i ? lb.members[0].id : undefined }, lb.id, lb.by); if (!focus) focus = n; });
        lb.links.forEach(l => g.addLink({ s: l.s, t: l.t, w: l.w, note: l.note, origin: 'mice', by: lb.by }));
        if (lb.syn) g.addSynapse({ ...lb.syn, section: 'Lab notes', origin: 'mice', by: lb.by, sources: [SRC] });
      };
      if (a.act === 'lobe') addLobe(a);
      else {
        g.addLobe({ id: a.id, name: a.name, color: hue(a.color), origin: 'mice', by: a.by, satellite: true });
        focus = neuron(a.hub, a.id, a.by, true);
        a.links.forEach(l => g.addLink({ s: l.s, t: l.t, w: l.w, note: l.note, origin: 'mice', by: a.by }));
        a.lobes.forEach(lb => addLobe(lb, a.id));
      }
    } else if (a.act === 'synapse') { g.addSynapse({ ...a, section: 'Lab notes', origin: 'mice', sources: [SRC] }); focus = { id: a.page }; }
    else if (a.act === 'wire') { g.addLink({ s: a.s, t: a.t, w: a.w, note: a.note, origin: 'mice', by: a.by }); focus = { id: a.s }; }
    return focus;
  }
  const describe = a => a.act === 'neuron' ? `${a.by} added \u201c${a.title}\u201d to ${lobeName(a.lobe)}`
    : a.act === 'lobe' ? `${a.by} built a new network: ${a.name} (${a.members.length} neurons)`
    : a.act === 'brain' ? `${a.by} built a whole brain: ${a.name}, with ${a.lobes.length} ${a.lobes.length === 1 ? 'lobe' : 'lobes'}`
    : a.act === 'synapse' ? `${a.by} wrote a synapse into \u201c${titleOf(a.page)}\u201d` : `${a.by} wired \u201c${titleOf(a.s)}\u201d to \u201c${titleOf(a.t)}\u201d`;
  const lobeName = id => G().lobes().find(l => l.id === id)?.name || id;
  const titleOf = id => G().pages().find(p => p.id === id)?.title || id;

  // ---------- choosing what to do next ----------
  // why an explicit request cannot be met right now ('' when it can); the chat asks before it promises anything
  function cannot(want) {
    const c = count();
    if (c.neurons >= CAP.neurons || c.synapses >= CAP.synapses) return 'We are full up; the caps say no.';
    if (want === 'brain') {
      if (c.brains >= CAP.brains) return `${CAP.brains} brains is the cap, and we have built them.`;
      if (c.neurons < 4) return 'A brain needs a few of our own neurons to stand on first. Ask again once we have four.';
      if (c.neurons + 7 > CAP.neurons || c.lobes - c.brains + 2 > CAP.lobes || c.synapses + 2 > CAP.synapses) return 'Not enough room under the caps for a whole brain. A network or a neuron would still fit.';
    }
    if (want === 'lobe') {
      if (c.lobes - c.brains >= CAP.lobes) return `${CAP.lobes} networks is the cap, and we have built them.`;
      if (c.neurons + 3 > CAP.neurons) return 'Not enough room under the caps for a network. A neuron would still fit.';
    }
    return '';
  }
  function plan(want, idea) {   // want: 'brain' | 'lobe' | 'neuron' prefers that act when the caps allow it and falls back to a smaller one otherwise (QA uses it; the chat checks cannot() first so an explicit request is never swapped); the mice roll dice
    const c = count(), by = pick(MICE_NAMES);
    if (c.neurons >= CAP.neurons || c.synapses >= CAP.synapses) return null;
    if (want === 'neuron' || idea) return planNeuron(by, idea);
    const r = want === 'brain' ? 0 : want === 'lobe' ? 0.2 : Math.random();
    if (r < 0.125 && c.brains < CAP.brains && c.neurons >= 4 && c.neurons + 7 <= CAP.neurons && c.lobes - c.brains + 2 <= CAP.lobes && c.synapses + 2 <= CAP.synapses) return planBrain(by);   // a brain is a hub plus up to two lobes of three (one synapse each), and those lobes count as networks
    if (r < 0.34 && c.lobes - c.brains < CAP.lobes && c.neurons + 3 <= CAP.neurons) return planLobe(by);
    if (r < 0.74 || !myNeurons().length) return planNeuron(by);
    return (Math.random() < 0.5 ? planSynapse(by) : planWire(by)) || planNeuron(by);
  }

  // ---------- the loop ----------
  let toastT = 0; const toast = msg => { emit('toast', msg); if (!toastEl || (listeners.size && !state.paused)) return; toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 3200); };   // with a chat listening (and showing: it hides while the mice are off), the chat shows the message instead
  const sleep = ms => new Promise(r => setTimeout(r, reduceMotion ? 0 : ms));
  const say = text => emit('say', text);   // the one-line status the chat shows in its pill
  const working = w => { state.working = w; emit('status', status()); };
  function retire() { state.retired = true; if (!ROAM) return; clearTimeout(state.timer); working(false); toast('The mice have gone to the chat shows. Their networks stay; Send them home lets them start again.'); }
  async function act(opts = {}) {
    if (state.retired || !ROAM) return null;
    const a = plan(opts.want, opts.idea); if (!a) { retire(); return null; }
    working(true);
    const focus = apply(a); journal.push(a); save();
    G().commit({ alpha: a.act === 'brain' ? 0.8 : 0.5 });
    // a new network lands on the outer ring; once the layout has settled a little, bring it into view if it fell off the edge
    if ((a.act === 'lobe' || a.act === 'brain') && G().fitIfOut) setTimeout(() => G().fitIfOut(900), reduceMotion ? 0 : 1200);
    emit('act', { a, text: describe(a), focus: focus && focus.id });
    // let the signal be seen: a fresh network announces itself with a red volley back to the Question / the mice
    // (shown passively: nothing is selected or potentiated, and the volley stands aside while the visitor is routing or holding a selection)
    const from = focus && focus.id;
    if (from && !opts.quiet && G().showRoute) { await sleep(a.act === 'brain' || a.act === 'lobe' ? 900 : 400); if (!state.paused || opts.force) G().showRoute(from, a.act === 'brain' ? HUB : Math.random() < 0.5 ? QUESTION : MICE); }
    await sleep(600); working(false);
    return a;
  }
  // roaming acts come every 7–15 s; commissioned work on an origin brain is quicker (3.5–6.5 s) and takes priority three times in five
  const idle = () => (!ROAM || state.retired) && !ORIGIN.pending().length;
  function schedule(ms) { clearTimeout(state.timer); if (state.paused || idle()) return; state.timer = setTimeout(tick, ms ?? (ORIGIN.pending().length ? 3500 + Math.random() * 3000 : 7000 + Math.random() * 8000)); }
  async function tick() {
    if (state.paused || idle()) return; if (document.hidden) { schedule(3000); return; }
    const o = ORIGIN.pending()[0];
    if (o && (!ROAM || state.retired || Math.random() < 0.6)) await ORIGIN.act(o); else await act();
    schedule();
  }
  // the cheese: off stops the building (their work stays) and is remembered on the Guide; on picks up where they left off
  function setOn(on, opts = {}) {
    state.paused = !on; if (ROAM) { try { storage?.setItem(ON_KEY, on ? 'on' : 'off'); } catch (e) { } }
    if (!on) clearTimeout(state.timer); else if (!idle()) schedule(1500);
    emit('status', status());
    if (opts.quiet) return;
    if (!on) toast(ROAM ? 'The mice are off. Their networks stay; the cheese brings them back.' : 'The mice are having a sit-down.');
    else if (!idle()) toast('The mice are back at work.');
    else if (ROAM) toast('The mice are on, but they have gone to the chat shows. Send them home and they start again.');
  }
  const clear = () => { try { storage?.removeItem(KEY); storage?.removeItem(ON_KEY); } catch (e) { } };
  if (ROAM) document.addEventListener('keydown', e => { if (e.key !== 'm' && e.key !== 'M') return; const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; if (e.metaKey || e.ctrlKey || e.altKey) return; setOn(state.paused); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.paused && !idle()) schedule(2500); });

  // ---------- origin brains: the mice as a builder ----------
  const ORIGIN = (() => {
    const ORIGIN_TAG = 'origin', CAPO = { neurons: 24, synapses: 60, here: 14, afield: 8, notes: 4 };
    const STOP = new Set('a an and are as at be by for from how in into is it its of on or that the this to was what when where which who why with without'.split(' '));
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const words = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
    const stem = w => w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 4 && /(ch|sh|x|z|ss|s)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !/(ss|is|us)$/.test(w) ? w.slice(0, -1) : w;   // gases → gas, families → family, photosynthesis stays
    const tokens = subject => [...new Set(words(subject).map(stem))];   // whole words only, lightly stemmed on both sides: carbon is not carbonyl, but gases are gas
    const hits = (text, toks) => { const bag = new Set(words(text).map(stem)); let n = 0; for (const k of toks) if (bag.has(k)) n++; return n; };
    const phrase = (text, subject) => norm(text).includes(norm(subject).trim());
    // coverage: the share of the subject's words that appear somewhere in the text; a match must cover the whole subject
    // (three words or fewer) or most of it, so "black holes" does not pull in black powder and water holes
    const coverage = (text, subject) => { const ws = tokens(subject); if (!ws.length) return 0; return hits(text, ws) / ws.length; };
    const covers = (text, subject) => coverage(text, subject) >= (tokens(subject).length <= 3 ? 1 : 0.6);
    const hiddenLobes = new Set(D.lobes.filter(l => l.hidden).map(l => l.id)), lobeName = Object.fromEntries(D.lobes.map(l => [l.id, l.name]));
    const synsOf = Object.create(null); D.synapses.forEach(s => (synsOf[s.page] = synsOf[s.page] || []).push(s));
    const srcById = Object.fromEntries(D.sources.map(s => [s.id, s])), srcsOf = Object.create(null); D.sources.forEach(s => (s.pages || []).forEach(p => (srcsOf[p] = srcsOf[p] || []).push(s)));
    const selfIds = new Set([D.self, ...(D.brains || []).map(b => b.self)].filter(Boolean));
    const hostHub = () => G().hub();
    const srcSpec = s => s && ({ id: s.id, label: s.label || s.id, kind: s.kind || 'web' });
    const pending = () => window.MINDBLOWN_ORIGIN ? window.MINDBLOWN_ORIGIN.brains().filter(b => b.subject && b.builder === 'mice' && !b.done).map(b => plans.get(b.id)).filter(Boolean).filter(o => !o.done) : [];
    const plans = new Map();   // origin id → live origin object (from origin.js)

    // what this brain knows about the subject: its own visible, built-in, top-level neurons, best first
    function hostMatches(subject) {
      const toks = tokens(subject); if (!toks.length) return [];
      const lobeHit = D.lobes.filter(l => !l.hidden && (phrase(l.name, subject) || hits(l.name, toks) >= Math.max(1, toks.length / 2))).map(l => l.id);
      const out = [];
      for (const p of D.pages) {
        if (hiddenLobes.has(p.lobe) || p.parent || p.id === D.center || selfIds.has(p.id) || p.origin) continue;
        const title = hits(p.title, toks), lobe = hits(lobeName[p.lobe] || '', toks), desc = hits(p.desc || p.intro || '', toks);
        let score = title * 6 + lobe * 3 + desc * 2 + (phrase(p.title, subject) ? 5 : 0) + (lobeHit.includes(p.lobe) ? 4 : 0);
        const syns = synsOf[p.id] || []; let best = null, bestN = -1;
        for (const s of syns) { const n = hits(s.lead + ' ' + s.text, toks); if (n > bestN) { bestN = n; best = s; } }
        score += Math.min(3, syns.reduce((a, s) => a + (hits(s.lead + ' ' + s.text, toks) ? 0.5 : 0), 0));
        if (score >= 2 && (lobeHit.includes(p.lobe) || covers(`${p.title} ${lobeName[p.lobe] || ''} ${p.desc || p.intro || ''}`, subject))) out.push({ id: p.id, title: p.title, lobe: p.lobe, desc: p.desc || p.intro || '', score, syn: best, synHits: bestN });
      }
      return out.sort((a, b) => b.score - a.score).slice(0, CAPO.here);
    }
    // further information from the rest of MindBlown (the origin index); the host brain itself is skipped
    // where another brain lives from here: its sibling page when this deployment has it (the brain menu links to it relatively, as the
    // repo and local builds do); otherwise that brain's own hosted site (a hosted single-brain site ships no sibling pages)
    const hasNav = !!document.querySelector('nav.brains');
    const pageHref = brain => (!hasNav || document.querySelector(`nav.brains a[href="./${brain.page}"], nav.brains a[href="${brain.page}"]`)) ? brain.page : brain.site ? `${brain.site}/` : null;
    function afieldMatches(subject, I) {
      if (!I) return []; const toks = tokens(subject); if (!toks.length) return [];
      const hostFiction = D.brain === 'guide' || D.brain === 'improbability', out = [];
      for (const [bi, id, title, lobe, desc] of I.pages) {
        const b = I.brains[bi]; if (!b || b.id === D.brain || !pageHref(b)) continue;   // only brains a visitor can reach from this deployment
        const t = hits(title, toks), l = hits(lobe, toks), d = hits(desc, toks);
        let score = t * 6 + l * 3 + d * 2 + (phrase(title, subject) ? 5 : 0);
        if (b.fiction && !hostFiction) score *= 0.5;
        if (score >= 4 && (t || l || d) && covers(`${title} ${lobe} ${desc}`, subject)) out.push({ brain: b, id, title, lobe, desc, score });
      }
      out.sort((a, b) => b.score - a.score);
      const seen = new Set(), picked = [];   // at most three per brain, so one big brain does not crowd the rest out
      for (const m of out) { const k = m.brain.id; if (picked.filter(x => x.brain.id === k).length >= 3 || seen.has(k + '|' + norm(m.title))) continue; seen.add(k + '|' + norm(m.title)); picked.push(m); if (picked.length >= CAPO.afield) break; }
      return picked;
    }

    const NOTE_LEADS = ['Lab note', 'Minutes', 'Frankie\u2019s remark', 'Benjy\u2019s objection', 'Experiment note'];
    const NOTES = [
      'Wired \u201c{title}\u201d in from {where}. The signal came back red, which {by} says is a feature.',
      'Relayed from {where} without changing a word; the mice are many things but they are not editors.',
      '{by} checked \u201c{title}\u201d very thoroughly, by which {by} means it was read twice.',
      'Filed under {subject} on the grounds that it was the nearest thing in {where} that mentioned it.',
      'Two votes to none in favour of keeping \u201c{title}\u201d. The cat abstained.',
      'Found in {where} while looking for something else, which is how most things get found.',
    ];
    const SRC = { id: 'mice:lab-notes', label: 'The mice\u2019s own lab notes (grown in this session, fiction)', kind: 'mice' };
    const fillNote = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
    const num = o => +(String(o.id).match(/-(\d+)$/) || [])[1] || 0;
    const P = o => { let p = plans.get(o.id); if (!p) { p = o; p.k = 0; p.lobes = {}; p.host = null; p.afield = null; p.indexed = false; p.used = new Set(); plans.set(o.id, p); } return p; };
    const idsIn = acts => acts.flatMap(a => [a.id, a.lobe && a.lobe.id].filter(Boolean));
    const usedFrom = acts => new Set(acts.flatMap(a => [a.from, a.ref && (a.brain + '|' + a.ref)].filter(Boolean)));
    const freshId = (o, make) => { const inUse = new Set([...G().pages().map(p => p.id), ...G().lobes().map(l => l.id)]); let id = make(++o.k); while (inUse.has(id)) id = make(++o.k); return id; };
    const lobeFor = (o, kind) => {   // the origin brain's lobes, made on first use: found here · found elsewhere · lab notes
      if (o.lobes[kind]) return { id: o.lobes[kind], kind };
      const names = { here: `${o.subject} \u00b7 found in this brain`, afield: `${o.subject} \u00b7 found elsewhere in MindBlown`, notes: `${o.subject} \u00b7 lab notes`, open: `${o.subject} \u00b7 open questions` };
      const colors = { here: '#38bdf8', afield: '#a3e635', notes: '#f472b6', open: '#fb923c' };
      const id = freshId(o, k => `${o.id}/${kind}-${k}`); o.lobes[kind] = id;
      return { id, name: names[kind], color: colors[kind], brain: o.id, kind };
    };
    const countIn = o => { const lobeIds = new Set([o.id, ...G().lobes().filter(l => l.brain === o.id).map(l => l.id)]); const ps = G().pages().filter(p => lobeIds.has(p.lobe)); return { neurons: ps.length - 1, synapses: ps.reduce((a, p) => a + p.nSyn, 0) }; };

    // ----- planning one act (pure data; apply() turns it into graph changes, so the journal replays exactly) -----
    function planRelay(o, by) {
      const m = o.host.find(x => !o.used.has(x.id)); if (!m) return null;
      const id = freshId(o, k => `${o.id}/relay-${slug(m.title)}-${k}`), where = lobeName[m.lobe] || m.lobe;
      const pages = G().pages(), relays = pages.filter(p => p.lobe === o.lobes.here);
      const hostNb = new Set(pages.find(p => p.id === m.id)?.neighbors || []);
      const peers = relays.filter(r => { const a = o.acts.find(x => x.id === r.id); return a && hostNb.has(a.from); }).slice(0, 2);   // relays whose originals are wired together get wired together too
      const links = [{ t: m.id, w: 2, note: `relayed from ${where}` }, { t: o.hub, w: 1, note: 'filed in the origin brain' }, ...peers.map(r => ({ t: r.id, w: 1, note: 'as wired in this brain' }))];
      if (ON_GUIDE) links.push({ t: QUESTION, w: 1, note: 'every network must be wired to the Question' });
      const s = m.syn, syn = s
        ? { id: `${id}#1`, lead: s.lead, text: s.text, section: 'Relayed from this brain', links: [m.id, ...(s.links || []).filter(l => l !== m.id && hasPage(l))].slice(0, 4), sources: (s.cites || []).map(c => srcSpec(srcById[c])).filter(Boolean).slice(0, 3) }
        : { id: `${id}#1`, lead: `From ${where}`, text: m.desc, section: 'Relayed from this brain', links: [m.id], sources: (srcsOf[m.id] || []).map(srcSpec).slice(0, 2) };
      const note = Math.random() < 0.34 ? { id: `${id}#2`, lead: pick(NOTE_LEADS), text: fillNote(pick(NOTES), { title: m.title, where, by, subject: o.subject }) } : null;
      return { act: 'relay', by, id, from: m.id, title: m.title, desc: `Relayed by ${by} from ${where}: ${m.desc}`.slice(0, 400), lobe: lobeFor(o, 'here'), links, syn, note };
    }
    function planAfield(o, by) {
      const m = o.afield.find(x => !o.used.has(x.brain.id + '|' + x.id)); if (!m) return null;
      const id = freshId(o, k => `${o.id}/afield-${slug(m.title)}-${k}`), where = `${m.brain.title}${m.brain.fiction ? ' (fiction)' : ''}`;
      const twins = G().pages().filter(p => p.lobe === o.lobes.here && norm(p.title) === norm(m.title)).slice(0, 1);   // the same subject known here and there
      const links = [{ t: o.hub, w: 1, note: `found in ${m.brain.title}` }, ...twins.map(t => ({ t: t.id, w: 2, note: 'the same thing, known here and there' }))];
      if (ON_GUIDE) links.push({ t: QUESTION, w: 1, note: 'every network must be wired to the Question' });
      const href = `${pageHref(m.brain)}#n=${encodeURIComponent(m.id)}`;
      return { act: 'afield', by, id, brain: m.brain.id, where: m.brain.title, ref: m.id, title: m.title, desc: `${by} found this in ${where}, filed under ${m.lobe}: ${m.desc}`.slice(0, 400), lobe: lobeFor(o, 'afield'), links,
        syn: { id: `${id}#1`, lead: `Further reading in ${m.brain.title}`, text: m.desc, section: 'Found elsewhere in MindBlown', links: twins.map(t => t.id), sources: [{ id: href, label: `${m.brain.title} \u203a ${m.title}${m.brain.fiction ? ' (fiction)' : ''}`, kind: 'mindblown', href }] } };
    }
    function planNote(o, by) {   // the Guide only: the mice's own material, in their own voice, tied to the subject
      if (!ON_GUIDE) return null; const [title, desc] = nextIdea();
      const id = freshId(o, k => `${o.id}/note-${slug(title)}-${k}`), [lead, text] = pick(FACTS);
      return { act: 'note', by, id, title, desc: `${desc} (Filed under ${o.subject} by ${by}.)`, lobe: lobeFor(o, 'notes'), links: [{ t: o.hub, w: 1, note: 'filed in the origin brain' }, { t: QUESTION, w: 1, note: 'a candidate for the Question' }],
        syn: { id: `${id}#1`, lead, text: text.replace('{idea}', title.replace(/\?$/, '')).replace('{target}', o.subject), section: 'Lab notes', links: [o.hub], sources: [SRC] } };
    }
    function planOpen(o, by) {   // nothing found anywhere: the mice say so rather than make something up
      const id = freshId(o, k => `${o.id}/open-${k}`);
      return { act: 'open', by, id, title: `Nobody here has heard of ${o.subject}`, desc: `${by} asked around this brain and the rest of MindBlown and found nothing filed under \u201c${o.subject}\u201d. The request stands; the mice do not invent facts, only Questions.`, lobe: lobeFor(o, 'open'), links: [{ t: o.hub, w: 1, note: 'an open request' }, ...(ON_GUIDE ? [{ t: QUESTION, w: 1, note: 'possibly the Question' }] : [])],
        syn: { id: `${id}#1`, lead: 'Request', text: `What is ${o.subject}, and who in MindBlown should know? Logged by ${by}.`, section: 'Lab notes', links: [o.hub], sources: [SRC] } };
    }
    function planDone(o, by) {
      const c = countIn(o), here = o.acts.filter(a => a.act === 'relay').length, afield = o.acts.filter(a => a.act === 'afield').length, notes = o.acts.filter(a => a.act === 'note').length, open = o.acts.some(a => a.act === 'open');
      const parts = []; if (here) parts.push(`${here} relayed from this brain`); if (afield) parts.push(`${afield} found elsewhere in MindBlown`); if (notes) parts.push(`${notes} lab ${notes === 1 ? 'note' : 'notes'}`); if (open) parts.push('nothing found, request logged');
      return { act: 'done', by, summary: `built by the mice: ${parts.join(', ')}; ${c.synapses} synapses`, desc: `An origin brain about ${o.subject}, placed by the visitor and built by the mice (${parts.join(', ')}). Relayed facts keep the sources they came with; the mice\u2019s own remarks are filed as lab notes.` };
    }
    function plan(o) {
      const by = pick(MICE_NAMES), c = countIn(o), done = o.acts.some(a => a.act === 'done');
      if (done) return null;
      const hereLeft = o.host.some(x => !o.used.has(x.id)), afieldLeft = o.afield.some(x => !o.used.has(x.brain.id + '|' + x.id));
      if (!o.indexed && !hereLeft) return null;   // the rest of MindBlown is out of reach: stay pending and try the index again next time rather than finish early
      if (!o.host.length && !o.afield.length && !o.acts.some(a => a.act === 'open')) return planOpen(o, by);
      if (c.neurons >= CAPO.neurons || c.synapses >= CAPO.synapses - 1) return planDone(o, by);
      const notes = o.acts.filter(a => a.act === 'note').length, noteOK = ON_GUIDE && notes < CAPO.notes && o.acts.length >= 2;
      const r = Math.random();
      if (hereLeft && (!afieldLeft || r < 0.6) && !(noteOK && r > 0.88)) return planRelay(o, by);
      if (afieldLeft && !(noteOK && r > 0.88)) return planAfield(o, by);
      if (noteOK) return planNote(o, by);
      return planDone(o, by);
    }
    function apply(o, a) {
      const g = G(); let focus = null;
      if (a.act === 'done') { g.update(o.hub, { desc: a.desc }); return null; }
      if (a.lobe.name) g.addLobe({ id: a.lobe.id, name: a.lobe.name, color: hue(a.lobe.color), origin: ORIGIN_TAG, by: a.by, brain: o.id });
      o.lobes[a.lobe.kind] = a.lobe.id;
      const lobe = a.lobe.id;
      focus = g.addNeuron({ id: a.id, title: a.title, desc: a.desc, lobe, origin: ORIGIN_TAG, by: a.by, near: a.from && hasPage(a.from) ? undefined : o.hub }); if (!focus) return null;
      a.links.forEach(l => g.addLink({ s: a.id, t: l.t, w: l.w, note: l.note, origin: ORIGIN_TAG, by: a.by }));
      if (a.syn) g.addSynapse({ ...a.syn, page: a.id, origin: ORIGIN_TAG, by: a.by });
      if (a.note) g.addSynapse({ ...a.note, page: a.id, section: 'Lab notes', links: [o.hub], origin: ORIGIN_TAG, by: a.by, sources: [SRC] });
      if (a.from) o.used.add(a.from); if (a.ref) o.used.add(a.brain + '|' + a.ref);
      return focus;
    }
    const describe = (o, a) => a.act === 'relay' ? `${a.by} relayed \u201c${a.title}\u201d into ${o.subject} from ${lobeName[D.pages.find(p => p.id === a.from)?.lobe] || 'this brain'}`
      : a.act === 'afield' ? `${a.by} brought \u201c${a.title}\u201d into ${o.subject} from MindBlown ${a.where || a.brain}`
      : a.act === 'note' ? `${a.by} filed a lab note under ${o.subject}: \u201c${a.title}\u201d`
      : a.act === 'open' ? `${a.by} found nothing on ${o.subject} and logged the request` : `${a.by}: ${o.subject} is ${a.summary}`;

    async function prepare(o) {   // candidates: this brain first, then the index (loaded on demand; retried on every act until it arrives)
      if (!o.host) { o.host = hostMatches(o.subject); o.afield = []; o.used = usedFrom(o.acts); }
      if (o.indexed) return;
      const I = window.MINDBLOWN_ORIGIN && window.MINDBLOWN_ORIGIN.index ? await window.MINDBLOWN_ORIGIN.index() : null; o.indexed = !!I;
      if (I) o.afield = afieldMatches(o.subject, I);
    }
    async function originAct(o, opts = {}) {
      o = P(o); if (o.done) return null;
      await prepare(o);
      const a = plan(o);
      if (!a) { if (!o.done && !o.indexed && !o.waited) { o.waited = true; const t = `${o.subject}: the rest of MindBlown is out of reach right now; the mice will try again`; o.say(t); say(t); } return null; }
      working(true);
      const focus = apply(o, a);
      if (a.act === 'done') { o.record(a); G().commit({ alpha: 0.3 }); o.finish(a.summary); toast(describe(o, a)); working(false); return a; }
      if (!focus) { working(false); return null; }
      o.record(a); G().commit({ alpha: 0.5 });
      if (a.lobe && a.lobe.name && G().fitIfOut) setTimeout(() => G().fitIfOut(900), reduceMotion ? 0 : 1200);
      const text = describe(o, a); o.say(`${text} \u00b7 ${countIn(o).neurons} so far`); emit('act', { a, text, focus: a.id, origin: o.id }); if (!listeners.size) toast(text);
      // the announcement: a red volley from what was built back into the host network (a relay fires at its original, the rest at the hub)
      if (!opts.quiet && G().showRoute) { await sleep(500); if (!state.paused || opts.force) G().showRoute(a.id, a.from && hasPage(a.from) ? a.from : (hostHub() || o.hub)); }
      await sleep(500); working(false);
      return a;
    }
    function take(o) {   // a fresh commission: tether to the Guide's fixtures when on the Guide, then start work
      o = P(o);
      if (ON_GUIDE) { G().addLink({ s: o.hub, t: QUESTION, w: 2, note: 'tethered to the Question', origin: ORIGIN_TAG, by: 'the mice' }); G().addLink({ s: o.hub, t: MICE, w: 1, note: 'commissioned to the mice', origin: ORIGIN_TAG, by: 'the mice' }); G().commit({ alpha: 0.4 }); }
      o.say(`the mice are looking into ${o.subject}\u2026`); say(`looking into ${o.subject}\u2026`); toast(ON_GUIDE ? `The mice have taken the brain. Subject: ${o.subject}. Frankie is very excited; Benjy is checking the paperwork.` : `The mice have taken the brain. Subject: ${o.subject}. They will see who here has heard of it.`);
      if (!state.paused) schedule(1200);
    }
    function replay(o) {   // a brain from the journal: rebuild it exactly, then carry on if there is work left
      o = P(o); let n = 0; o.k = o.acts.reduce((m, a) => Math.max(m, ...idsIn([a]).map(id => +(String(id).match(/-(\d+)$/) || [])[1] || 0)), 0);
      if (ON_GUIDE) { G().addLink({ s: o.hub, t: QUESTION, w: 2, note: 'tethered to the Question', origin: ORIGIN_TAG, by: 'the mice' }); G().addLink({ s: o.hub, t: MICE, w: 1, note: 'commissioned to the mice', origin: ORIGIN_TAG, by: 'the mice' }); }
      for (const a of o.acts) { try { if (a.act === 'done') { apply(o, a); n++; } else if (apply(o, a)) n++; } catch (e) { console.warn('mice: could not replay origin act', a, e); } }
      G().commit({ alpha: 0.8 });
      if (!o.done) o.say(`${o.subject}: ${n} ${n === 1 ? 'entry' : 'entries'} from last time, carrying on`);   // the boot code below schedules the work once ORIGIN exists; replay runs inside its initializer
    }
    const ask = o => ON_GUIDE ? `Frankie: \u201cAnd what, precisely, is this brain about?\u201d` : `Benjy: \u201cWhat is this brain about? We\u2019ll see who here has heard of it.\u201d`;
    const suggest = () => { const names = D.lobes.filter(l => !l.hidden && l.id !== D.center).map(l => l.name); const titles = D.pages.filter(p => !hiddenLobes.has(p.lobe) && !p.parent && p.id !== D.center && !selfIds.has(p.id)).sort((a, b) => (synsOf[b.id]?.length || 0) - (synsOf[a.id]?.length || 0)).slice(0, 6).map(p => p.title); return [...new Set([...names.slice(0, 2), ...titles])].slice(0, 4); };
    if (window.MINDBLOWN_ORIGIN) window.MINDBLOWN_ORIGIN.register({ id: 'mice', name: 'the mice', verb: 'Hand it to the mice', ask, suggest, take, replay, pause: () => setOn(false), resume: () => setOn(true), paused: () => state.paused });
    return { pending, act: originAct, plan: o => { const p = P(o); return p.host ? plan(p) : null; }, matches: subject => ({ host: hostMatches(subject).map(m => m.id) }), afield: (subject, I) => afieldMatches(subject, I).map(m => m.brain.id + '|' + m.id), count: o => countIn(P(o)) };
  })();

  // ---------- boot: replay the journal, then start ----------
  const replayed = ROAM ? journal.length : 0;
  if (!ROAM) { window.MINDBLOWN_MICE = Object.freeze({ origin: ORIGIN, status, listen: f => { listeners.add(f); return () => listeners.delete(f); }, setOn, on: () => !state.paused, pause: () => setOn(false, { quiet: true }), resume: () => setOn(true, { quiet: true }), paused: () => state.paused, roaming: false }); if (ORIGIN.pending().length && !state.paused) schedule(2500); return; }
  if (replayed) {
    const j = journal; journal = [];
    for (const a of j) { try { if (apply(a)) journal.push(a); } catch (e) { console.warn('mice: could not replay', a, e); } }
    save(); G().commit({ alpha: 0.9 }); setTimeout(() => G().fit(900), 700);
    // keep the counters in step with what came back so new names do not repeat
    state.lobeN = journal.filter(a => a.act === 'lobe').length + journal.reduce((s, a) => s + (a.act === 'brain' ? a.lobes.length : 0), 0); state.brainN = journal.filter(a => a.act === 'brain').length;
    if (!plan()) retire();
  }
  schedule(replayed ? 6000 : 4000);

  // the public face: the chat (js/mice-chat.js) and the QA harness drive the mice through this
  window.MINDBLOWN_MICE = Object.freeze({
    act: (o) => act({ force: true, ...o }), plan, count, journal: () => journal.slice(), describe,
    status, listen: f => { listeners.add(f); return () => listeners.delete(f); },
    cannot, setOn, on: () => !state.paused, pause: () => setOn(false, { quiet: true }), resume: () => setOn(true, { quiet: true }), paused: () => state.paused, retired: () => state.retired, clear, origin: ORIGIN, roaming: true,
    names: MICE_NAMES.slice(), caps: { ...CAP }, hub: HUB, question: QUESTION, mice: MICE,
  });
  emit('status', status());
})();
