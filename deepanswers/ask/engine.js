// Ask Deep Answers — retrieval engine (window.DeepAsk.engine).
// Pure ES2020, no dependencies. Indexes window.MINDBLOWN (network-brain-data.js) and ranks neurons with BM25F over
// title (3), synapse lead (2), desc (1.5), synapse text (1) and lobe name (0.5). Facts come from the top-level
// synapses grouped by page; pages[].synapses are stringified in the merged data and are ignored.
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const DeepAsk = root.DeepAsk = root.DeepAsk || {};

  // ---------- text ----------
  const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing down during each else ever few for from further get got had has have having he ' +
    'her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ' +
    'ours out over own really same she should so some such than that the their theirs them then there these they this those through ' +
    'to too under until up us very was we were what when where which while who whom whose why will with would you your yours ' +
    'tell explain anyone anybody someone know known think thing things mean means kind sort way ways actually much many lot').split(/\s+/));
  // Words that signal the visitor is asking an open question rather than looking up a term.
  const QWORDS = /^(why|how|what|is|are|does|do|can|could|will|would|should|where|when|which|who)\b|\?\s*$/i;

  // Small visitor-phrasing expansions. Keys and values are raw words; they are tokenised like everything else.
  const SYN = {
    ai: 'artificial intelligence machine', aliens: 'extraterrestrial life', alien: 'extraterrestrial life',
    et: 'extraterrestrial', seti: 'extraterrestrial signal', ufo: 'extraterrestrial',
    conscious: 'consciousness', aware: 'consciousness awareness', awareness: 'consciousness',
    qm: 'quantum mechanics', gr: 'general relativity', relativity: 'relativity gravity',
    expanding: 'expansion', expand: 'expansion', expands: 'expansion', bigbang: 'big bang',
    begin: 'origin beginning first', began: 'origin beginning first', start: 'origin beginning', started: 'origin beginning',
    antimatter: 'antimatter matter asymmetry', dna: 'dna genetic', genes: 'gene genetic',
    evolution: 'evolution evolutionary', brain: 'brain neural neuron', primes: 'prime', riemann: 'riemann zeta',
    'free-will': 'free will', freewill: 'free will', math: 'mathematics mathematical', maths: 'mathematics mathematical',
    morality: 'moral ethics', ethics: 'moral ethics', god: 'god existence', meaning: 'meaning'
  };

  function fold(s) {
    return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[’']/g, '').replace(/[‐-―−]/g, '-');
  }
  // Light suffix stripping, deliberately conservative so that 'physics'/'physical' and 'cosmos'/'cosmic' stay recognisable.
  function stem(w) {
    if (w.length <= 3 || /^\d/.test(w)) return w;
    if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
    else if (w.endsWith('sses')) w = w.slice(0, -2);
    else if (w.endsWith('s') && !/(ss|us|is|os|ics)$/.test(w)) w = w.slice(0, -1);
    if (w.length > 5) {
      if (w.endsWith('ational')) w = w.slice(0, -5) + 'e';
      else if (w.endsWith('ization')) w = w.slice(0, -5) + 'e';
      else if (w.endsWith('ation')) w = w.slice(0, -3) + 'e';
      else if (w.endsWith('ness')) w = w.slice(0, -4);
      else if (w.endsWith('ment') && w.length > 7) w = w.slice(0, -4);
      else if (w.endsWith('ingly')) w = w.slice(0, -5);
      else if (w.endsWith('edly')) w = w.slice(0, -4);
      else if (w.endsWith('ly')) w = w.slice(0, -2);
      else if (w.endsWith('ing') && w.length > 6) w = w.slice(0, -3);
      else if (w.endsWith('ed') && w.length > 5) w = w.slice(0, -2);
      else if (w.endsWith('er') && w.length > 6) w = w.slice(0, -2);
    }
    if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
    if (w.length > 4 && w.endsWith('al')) w = w.slice(0, -2);
    return w;
  }
  function words(s) { return fold(s).split(/[^a-z0-9]+/).filter(Boolean); }
  function tokens(s) {
    const out = [];
    for (const w of words(s)) { if (!STOP.has(w) && (w.length > 1 || /\d/.test(w))) out.push(stem(w)); }
    return out;
  }
  function normTitle(s) { return words(s).join(' '); }

  // Bounded Levenshtein distance <= 1 test, used for typo tolerance on unseen query terms.
  function within1(a, b) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  // ---------- index ----------
  const FIELDS = ['title', 'lead', 'desc', 'text', 'lobe'];
  const W = { title: 3, lead: 2, desc: 1.5, text: 1, lobe: 0.5 };
  const K1 = 1.2, B = 0.75;
  let IX = null;

  function countMap(toks) { const m = new Map(); for (const t of toks) m.set(t, (m.get(t) || 0) + 1); return m; }

  // Sealed synapses. A synapse may carry `puzzle: { q, a, hint? }` (Section 5, Puzzles). Until its answer matches, the renderer hides
  // its lead and text everywhere; retrieval does the same here: the prompt is indexed in place of the lead, the text is not indexed at
  // all, and context() tells the model only that a sealed fact exists. Solved ids are shared with the renderer through the same
  // sessionStorage key it uses, so a puzzle solved on the network screen is unfolded here in the same tab, and the other way round.
  // The network dataset namespaces brain ids as `<brain>:<id>`, and each single-brain page (puzzles.html) keeps its own dataset
  // and so its own key with bare ids. Ask reads both and writes both, so a puzzle solved on puzzles.html is unfolded here and
  // one solved here is unfolded there. Shared-registry ids are the same in every dataset and need no translation.
  let SOLVED = new Set();
  const keyFor = title => 'mindblown.solved.' + (title || (root.location && root.location.pathname) || '');
  const solvedKey = D => keyFor(D && D.title);
  const readKey = key => { try { return JSON.parse(root.sessionStorage.getItem(key) || '[]').filter(x => typeof x === 'string'); } catch (e) { return []; } };
  const brainKeys = D => ((D && D.brains) || []).filter(b => b.id && b.dataTitle && b.dataTitle !== D.title).map(b => ({ id: b.id, key: keyFor(b.dataTitle) }));
  function readSolved(D) {
    const ids = new Set(readKey(solvedKey(D)));
    const have = new Set((D.synapses || []).map(s => s.id));
    for (const b of brainKeys(D)) for (const x of readKey(b.key)) { const full = b.id + ':' + x; ids.add(have.has(full) ? full : x); }
    return ids;
  }
  function writeSolved(D) {
    try {
      root.sessionStorage.setItem(solvedKey(D), JSON.stringify(Array.from(SOLVED)));
      for (const b of brainKeys(D)) {
        const pre = b.id + ':', mine = Array.from(SOLVED).filter(x => x.startsWith(pre) || !x.includes(':')).map(x => x.startsWith(pre) ? x.slice(pre.length) : x);
        root.sessionStorage.setItem(b.key, JSON.stringify(Array.from(new Set(readKey(b.key).concat(mine)))));
      }
    } catch (e) { /* storage may be unavailable; the session still unfolds */ }
  }
  const isSealed = s => !!(s && s.puzzle) && !SOLVED.has(s.id);
  const sealedLead = s => '? ' + String(s.puzzle.q || '');
  // Mirror of the renderer's normAns / answerOk, so an answer accepted on one screen is accepted on the other.
  function normAns(t) {
    return String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}.,]+/gu, ' ').trim();
  }
  function answerOk(s, text) {
    let re = null;
    try { re = new RegExp('^(?:' + s.puzzle.a + ')$', 'iu'); } catch (e) { re = null; }
    return re ? re.test(normAns(text)) || re.test(String(text).trim()) : normAns(s.puzzle.a) === normAns(text);
  }

  function load(D, opts) {
    opts = opts || {};
    D = D || root.MINDBLOWN;
    if (IX && IX.D === D && !opts.force) return api;
    if (!D || !Array.isArray(D.pages)) throw new Error('DeepAsk.engine.load: window.MINDBLOWN is missing');
    if (opts.solved) SOLVED = new Set(opts.solved); else if (!(IX && IX.D === D)) SOLVED = readSolved(D);
    const t0 = now();
    const lobes = new Map((D.lobes || []).map(l => [l.id, l]));
    const brains = new Map((D.brains || []).map(b => [b.id, b]));
    const srcLabel = new Map((D.sources || []).map(s => [s.id, s.label]));
    const pages = new Map(D.pages.map(p => [p.id, p]));
    const synBy = new Map();
    for (const s of D.synapses || []) {
      if (!pages.has(s.page)) continue;
      if (!synBy.has(s.page)) synBy.set(s.page, []);
      synBy.get(s.page).push(s);
    }
    const docs = [], df = new Map(), sumLen = { title: 0, lead: 0, desc: 0, text: 0, lobe: 0 };
    const titleIx = new Map();
    for (const p of D.pages) {
      const leadOf = s => isSealed(s) ? sealedLead(s) : s.lead;   // what retrieval may see of a synapse
      const textOf = s => isSealed(s) ? '' : s.text;
      const syns = (synBy.get(p.id) || []).map(s => ({
        raw: s, sealed: isSealed(s),
        lead: countMap(tokens(leadOf(s))), text: countMap(tokens(textOf(s))),
        len: tokens(leadOf(s)).length + tokens(textOf(s)).length
      }));
      const lobe = lobes.get(p.lobe);
      const f = {
        title: tokens(p.title),
        lead: [].concat(...(synBy.get(p.id) || []).map(s => tokens(leadOf(s)))),
        desc: tokens(p.desc || p.intro || ''),
        text: [].concat(...(synBy.get(p.id) || []).map(s => tokens(textOf(s)))),
        lobe: tokens(lobe ? lobe.name : '')
      };
      const tf = {}, len = {};
      for (const k of FIELDS) { tf[k] = countMap(f[k]); len[k] = f[k].length; sumLen[k] += f[k].length; }
      const all = new Set(FIELDS.flatMap(k => f[k]));
      for (const t of all) df.set(t, (df.get(t) || 0) + 1);
      const nt = normTitle(p.title);
      if (!titleIx.has(nt)) titleIx.set(nt, []);
      titleIx.get(nt).push(p.id);
      // Titles phrased as questions ("Why is there something...") also match without the trailing question words.
      const doc = { p, tf, len, syns, titleNorm: nt, titleSet: new Set(f.title), brains: brainsOf(p), lobe, words: words(p.title) };
      docs.push(doc);
    }
    const N = docs.length, avg = {};
    for (const k of FIELDS) avg[k] = Math.max(1, sumLen[k] / N);
    const idf = new Map();
    for (const [t, n] of df) idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
    IX = { D, docs, byId: new Map(docs.map(d => [d.p.id, d])), df, idf, avg, N, lobes, brains, srcLabel, titleIx, vocab: [...df.keys()], ms: now() - t0 };
    return api;
  }
  function brainsOf(p) {
    if (Array.isArray(p.brains) && p.brains.length) return p.brains.slice();
    return p.brain ? [p.brain] : [];
  }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function ensure() { if (!IX) load(root.MINDBLOWN); return IX; }

  // ---------- query ----------
  function queryTerms(q) {
    const raw = words(q);
    const out = new Map(); // term -> weight
    const add = (t, w) => { if (!t) return; out.set(t, Math.max(out.get(t) || 0, w)); };
    for (const w of raw) {
      if (SYN[w]) for (const t of tokens(SYN[w])) add(t, 0.7);
      if (STOP.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
      add(stem(w), 1);
    }
    // Typo tolerance: unseen terms of five or more letters borrow the closest indexed term at reduced weight.
    for (const [t, w] of [...out]) {
      if (IX.df.has(t) || t.length < 5 || w < 1) continue;
      let best = null, bestDf = 0;
      for (const v of IX.vocab) {
        if (v[0] !== t[0] && v[1] !== t[1]) continue;
        if (within1(t, v) || (v.length >= 6 && v.startsWith(t)) || (t.length >= 6 && t.startsWith(v) && v.length >= 5)) {
          const n = IX.df.get(v); if (n > bestDf) { best = v; bestDf = n; }
        }
      }
      if (best) add(best, 0.6);
    }
    return out;
  }

  function bm25f(doc, terms) {
    let s = 0;
    for (const [t, qw] of terms) {
      const idf = IX.idf.get(t); if (!idf) continue;
      let tf = 0;
      for (const k of FIELDS) {
        const c = doc.tf[k].get(t); if (!c) continue;
        tf += W[k] * c / (1 - B + B * doc.len[k] / IX.avg[k]);
      }
      if (tf) s += qw * idf * tf / (K1 + tf);
    }
    return s;
  }
  function synScore(sy, terms) {
    let s = 0;
    for (const [t, qw] of terms) {
      const idf = IX.idf.get(t); if (!idf) continue;
      const c = 2 * (sy.lead.get(t) || 0) + (sy.text.get(t) || 0);
      if (c) s += qw * idf * c / (K1 + c);
    }
    return s;
  }

  function shapeNeuron(doc, ref, score, terms) {
    const p = doc.p, brain = p.brain || null, b = brain ? IX.brains.get(brain) : null;
    const scored = doc.syns.map((sy, i) => ({ sy, i, s: terms ? synScore(sy, terms) : 0 }));
    scored.sort((a, b2) => (b2.s - a.s) || (a.i - b2.i));
    const synapses = scored.map((x, j) => {
      const s = x.sy.raw;
      if (x.sy.sealed) {   // the fact, its sources and its links stay hidden until the puzzle is solved
        return { ref: ref ? ref + '.' + (j + 1) : '', id: s.id, lead: sealedLead(s), text: 'Sealed · solve to unfold',
                 sealed: true, puzzle: { q: s.puzzle.q, hint: s.puzzle.hint || '' }, cites: [], links: [], hit: x.s > 0 };
      }
      return {
        ref: ref ? ref + '.' + (j + 1) : '',
        id: s.id, lead: s.lead || '', text: s.text || '',
        cites: (s.cites || []).map(c => { const url = stripNs(c); return { url, label: IX.srcLabel.get(c) || hostLabel(url) }; }),
        links: (s.links || []).map(id => { const d = IX.byId.get(id); return { id, title: d ? d.p.title : id }; }),
        hit: x.s > 0
      };
    });
    return {
      ref, id: p.id, orig: brain ? (p.orig || p.id.slice(brain.length + 1)) : null,
      title: p.title, type: p.type, brain, brains: doc.brains.slice(),
      lobe: doc.lobe ? doc.lobe.name : (p.lobe || ''), color: doc.lobe ? doc.lobe.color : (b ? b.color : '#9aa4b2'),
      desc: p.desc || p.intro || '', score: Math.round(score * 1000) / 1000,
      hrefBrain: b ? `${b.href}#n=${encodeURIComponent(p.orig || p.id.slice(brain.length + 1))}` : null,
      hrefNet: `index.html#n=${encodeURIComponent(p.id)}`,
      synapses
    };
  }
  function stripNs(c) { const i = c.indexOf(':'); const rest = c.slice(i + 1); return /^https?:\/\//.test(rest) ? rest : c; }
  function hostLabel(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } }

  function retrieve(query, opts) {
    ensure();
    const t0 = now();
    opts = opts || {};
    const k = Math.max(1, opts.k || 6);
    const bf = opts.brains && opts.brains.length ? new Set(opts.brains) : null;
    const tf = opts.types && opts.types.length ? new Set(opts.types) : null;
    const q = String(query == null ? '' : query).trim();
    const terms = queryTerms(q);
    const asks = QWORDS.test(q);
    const qn = normTitle(q);
    const qset = new Set(terms.keys());
    const qWords = words(q);
    const exact = new Set(IX.titleIx.get(qn) || []);

    const scored = [];
    for (const doc of IX.docs) {
      if (bf && !doc.brains.some(b => bf.has(b))) continue;
      if (tf && !tf.has(doc.p.type)) continue;
      let s = bm25f(doc, terms);
      if (s <= 0 && !exact.has(doc.p.id)) continue;
      // Title coverage: how much of the title the query names, and how much of the query the title covers.
      if (doc.titleSet.size) {
        let hit = 0; for (const t of doc.titleSet) if (qset.has(t)) hit++;
        const cov = hit / doc.titleSet.size, qcov = qset.size ? hit / qset.size : 0;
        s *= 1 + 0.6 * cov * cov + 0.3 * qcov;
        if (hit >= 2 && phraseIn(doc.words, qWords)) s *= 1.15;
      }
      if (doc.p.type === 'question') s *= asks ? 1.12 : 1.05;
      else if (doc.p.type === 'hub') s *= 0.8;
      if (exact.has(doc.p.id)) s = s * 2 + 100;
      scored.push({ doc, s });
    }
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, k);
    const neurons = top.map((x, i) => shapeNeuron(x.doc, 'N' + (i + 1), x.s, terms));
    const seen = new Set(neurons.map(n => n.id)), freq = new Map();
    neurons.forEach((n, i) => {
      for (const sy of n.synapses) for (const l of sy.links) {
        if (seen.has(l.id) || !IX.byId.has(l.id)) continue;
        freq.set(l.id, (freq.get(l.id) || 0) + (sy.hit ? 2 : 1) / (i + 1));
      }
    });
    const related = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => {
      const p = IX.byId.get(id).p; return { id, title: p.title, brain: p.brain || null };
    });
    return { query: q, terms: [...terms.keys()], neurons, related, elapsedMs: Math.round((now() - t0) * 100) / 100 };
  }
  function phraseIn(tw, qw) {
    for (let i = 0; i + 1 < tw.length; i++) {
      if (STOP.has(tw[i]) || STOP.has(tw[i + 1])) continue;
      for (let j = 0; j + 1 < qw.length; j++) if (qw[j] === tw[i] && qw[j + 1] === tw[i + 1]) return true;
    }
    return false;
  }

  function suggest(prefix, k) {
    ensure();
    k = k || 8;
    const p = normTitle(prefix);
    if (!p) return [];
    const pw = p.split(' ');
    const tw = d => d.words;
    const ranks = [];
    for (const doc of IX.docs) {
      const t = doc.titleNorm;
      let r = -1;
      if (t.startsWith(p)) r = 0;
      else if ((' ' + t).includes(' ' + p)) r = 1;
      else if (pw.length > 1 && pw.every(w => tw(doc).some(x => x.startsWith(w)))) r = 1.5;
      else if (t.includes(p)) r = 2;
      if (r >= 0) ranks.push({ r, len: t.length, doc });
    }
    ranks.sort((a, b) => (a.r - b.r) || (a.len - b.len));
    const out = ranks.slice(0, k).map(x => ({ id: x.doc.p.id, title: x.doc.p.title, brain: x.doc.p.brain || null }));
    if (out.length < k && p.length >= 3) {
      // Fall back to ranked retrieval so mid-sentence typing still offers neurons.
      const have = new Set(out.map(o => o.id));
      for (const n of retrieve(prefix, { k: k * 2 }).neurons) {
        if (out.length >= k) break;
        if (!have.has(n.id)) { out.push({ id: n.id, title: n.title, brain: n.brain }); have.add(n.id); }
      }
    }
    return out;
  }

  function neuron(id) {
    ensure();
    const d = IX.byId.get(id) || IX.byId.get(String(id || '').replace(/^#?n=/, ''));
    return d ? shapeNeuron(d, '', 0, null) : null;
  }

  function context(result, opts) {
    opts = opts || {};
    const max = opts.maxChars || 9000;
    const refs = [];
    let text = `Question: ${oneLine(result && result.query)}\n`;
    for (const n of (result && result.neurons) || []) {
      const head = `\n[${n.ref}] ${oneLine(n.title)} (${n.type}, ${n.brain || 'shared'} · ${oneLine(n.lobe)})\n${oneLine(n.desc)}\n`;
      if (text.length + head.length > max && refs.length) break;
      text += head; refs.push(n.ref);
      const order = n.synapses.filter(s => s.hit).concat(n.synapses.filter(s => !s.hit));
      for (const s of order) {
        const src = s.cites.map(c => c.label).join('; ');
        const line = s.sealed
          ? `  [${s.ref}] Sealed fact: it unfolds only when the visitor solves the puzzle "${oneLine(s.puzzle.q)}" on the Puzzles ladder; its content is not available to you.\n`
          : `  [${s.ref}] ${oneLine(s.lead)}: ${oneLine(s.text)}${src ? '  — sources: ' + src : ''}\n`;
        if (text.length + line.length > max) continue;
        text += line; refs.push(s.ref);
      }
    }
    if (text.length > max) text = text.slice(0, max);
    return { text, refs, chars: text.length };
  }
  function oneLine(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  // ---- puzzles: the ladder as seen from Ask ----------------------------------------------------------------------
  // puzzles(): every sealed-or-unfolded synapse with its rung, in ladder order. solve(id, answer): unfold it for the session and
  // re-index, so the next retrieval can cite the fact. Nothing leaves the browser.
  function puzzles() {
    if (!IX) return [];
    const out = [];
    (IX.D.synapses || []).forEach((s, order) => {
      if (!s.puzzle) return;
      const d = IX.byId.get(s.page), p = d && d.p;
      const m = /rung-(\d)/.exec(s.page);
      out.push({ id: s.id, page: s.page, pageTitle: p ? p.title : s.page, rung: m ? +m[1] : 0, q: s.puzzle.q, hint: s.puzzle.hint || '',
                 solved: SOLVED.has(s.id), lead: SOLVED.has(s.id) ? s.lead : '', text: SOLVED.has(s.id) ? s.text : '', order });
    });
    // rung first, then the order the brain was built in (the renderer's order); ids sort as strings, which would put #10 before #2
    out.sort((a, b) => (a.rung - b.rung) || (a.order - b.order));
    out.forEach(x => { delete x.order; });
    return out;
  }
  function solve(id, answer) {
    if (!IX) return false;
    const s = (IX.D.synapses || []).find(x => x.id === id);
    if (!s || !s.puzzle || SOLVED.has(id) || !answerOk(s, answer)) return false;
    SOLVED.add(id); writeSolved(IX.D);
    load(IX.D, { force: true, solved: SOLVED });
    return true;
  }
  function solved() { return Array.from(SOLVED); }

  const api = {
    load, retrieve, suggest, neuron, context, puzzles, solve, solved,
    // Exposed for QA and for ground.js; not part of the visitor-facing contract.
    _tokens: tokens, stats: () => IX && { neurons: IX.N, terms: IX.df.size, loadMs: Math.round(IX.ms) }
  };
  DeepAsk.engine = api;
  if (root.MINDBLOWN && Array.isArray(root.MINDBLOWN.pages)) { try { load(root.MINDBLOWN); } catch (e) { /* loaded lazily on first call */ } }
})();
