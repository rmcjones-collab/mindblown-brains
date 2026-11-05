// Ask Deep Answers — grounding check and ref linking (window.DeepAsk.ground).
// check() measures how well model text is tied to the retrieved context; linkify() turns [N1.2] refs into links and
// HTML-escapes everything else. Neither ever hides text: the UI shows the flags next to the answer.
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const DeepAsk = root.DeepAsk = root.DeepAsk || {};

  // A bracket group holding one or more refs: [N1], [N1.2], [N1.2, N3], [N1.2; N2.1], [N1.2][N3] (two groups).
  const GROUP = /\[\s*(N\d+(?:\.\d+)?(?:\s*[,;]\s*N\d+(?:\.\d+)?)*)\s*\]/g;
  const ONE = /N\d+(?:\.\d+)?/g;
  // Claims that would close an open question.
  const SETTLED = /\b(solved|proven|proved|settled|resolved|the answer is|we now know|has been answered|is now known|definitively shown)\b/gi;
  // Hedges or negations in the few words before the claim word, or right after "the answer is".
  const NEG_BEFORE = /\b(not|never|no|nor|yet|unlikely|unclear|without|neither|nobody|none|isnt|arent|hasnt|havent|wasnt|werent|cannot|cant|if|whether|until|unless|before|would|could|might|may|claim\w*|hope\w*|attempt\w*)\b/;
  const NEG_AFTER = /^\s*(not|unknown|open|unclear|still|disputed|contested|that nobody|that no one)\b/i;

  function refsIn(text) {
    const out = [], seen = new Set();
    String(text || '').replace(GROUP, (m, inner) => {
      for (const r of inner.match(ONE) || []) if (!seen.has(r)) { seen.add(r); out.push(r); }
      return m;
    });
    return out;
  }

  // Split into sentences. Refs written after the full stop (". [N1]") are moved before it so they count for that sentence.
  function sentencesOf(text) {
    let t = String(text || '').replace(/\r/g, '');
    t = t.replace(/([.!?])((?:\s*\[\s*N\d+(?:\.\d+)?(?:\s*[,;]\s*N\d+(?:\.\d+)?)*\s*\])+)/g, '$2$1');
    // Protect common abbreviations and decimals from splitting.
    t = t.replace(/\b(e\.g|i\.e|et al|cf|vs|approx|ca|Dr|Mr|Ms|Prof|St|Fig|No)\./g, '$1\u2024').replace(/(\d)\.(\d)/g, '$1\u2024$2');
    const parts = [];
    for (const block of t.split(/\n+/)) {
      const b = block.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
      if (!b) continue;
      for (const s of b.split(/(?<=[.!?])\s+(?=[^a-z])/)) {
        const clean = s.replace(/\u2024/g, '.').trim();
        // Headings and fragments under three words are not claims.
        const nWords = clean.replace(GROUP, ' ').split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length;
        if (nWords >= 3 && !/^#{1,6}\s/.test(clean) && !/:\s*$/.test(clean)) parts.push(clean);
      }
    }
    return parts;
  }

  // Map neuron ref -> type, from the result when given, otherwise parsed from the context text header lines.
  function typesOf(context, result) {
    const m = new Map();
    if (result && Array.isArray(result.neurons)) for (const n of result.neurons) m.set(n.ref, n.type);
    if (!m.size && context && context.text) {
      const re = /^\[(N\d+)\] .*\((hub|concept|method|question),/gm; let x;
      while ((x = re.exec(context.text))) m.set(x[1], x[2]);
    }
    return m;
  }

  function isSettledClaim(sentence) {
    const s = sentence.replace(GROUP, ' ');
    SETTLED.lastIndex = 0;
    let m;
    while ((m = SETTLED.exec(s))) {
      const before = s.slice(0, m.index).toLowerCase().replace(/[’']/g, '').split(/\s+/).slice(-4).join(' ');
      const after = s.slice(m.index + m[0].length);
      if (NEG_BEFORE.test(before)) continue;
      if (/the answer is/i.test(m[0]) && NEG_AFTER.test(after)) continue;
      return true;
    }
    return false;
  }

  function check(text, context, result) {
    const refs = refsIn(text);
    const known = new Set((context && context.refs) || []);
    if (!known.size && result && result.neurons) for (const n of result.neurons) { known.add(n.ref); for (const s of n.synapses || []) known.add(s.ref); }
    const unknownRefs = refs.filter(r => !known.has(r));
    const types = typesOf(context, result);
    const sents = sentencesOf(text);
    let uncited = 0;
    const settledClaims = [];
    const hasQuestion = [...types.values()].includes('question');
    for (const s of sents) {
      const rs = refsIn(s);
      if (!rs.length) {
        uncited++;
        // an uncited sentence can still present an open question as settled; flag it when one was retrieved
        if (hasQuestion && isSettledClaim(s)) settledClaims.push(s);
        continue;
      }
      const touchesQuestion = rs.some(r => types.get(r.split('.')[0]) === 'question');
      if (touchesQuestion && isSettledClaim(s)) settledClaims.push(s);
    }
    const sentences = sents.length;
    return {
      refs, unknownRefs, sentences, uncited, settledClaims,
      ok: unknownRefs.length === 0 && settledClaims.length === 0 && uncited <= Math.ceil(sentences * 0.25)
    };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function linkify(text, result) {
    const href = new Map(), title = new Map();
    if (result && Array.isArray(result.neurons)) for (const n of result.neurons) {
      href.set(n.ref, n.hrefBrain || n.hrefNet); title.set(n.ref, n.title);
      for (const s of n.synapses || []) { href.set(s.ref, n.hrefBrain || n.hrefNet); title.set(s.ref, n.title + ' · ' + (s.lead || '')); }
    }
    const src = String(text == null ? '' : text);
    let out = '', last = 0, m;
    GROUP.lastIndex = 0;
    while ((m = GROUP.exec(src))) {
      out += esc(src.slice(last, m.index));
      const parts = m[1].match(ONE) || [];
      out += parts.map(r => {
        const h = href.get(r);
        if (!h) return `<span class="ref-unknown" data-ref="${esc(r)}" title="Not in the retrieved context">${esc(r)}</span>`;
        return `<a class="ref" data-ref="${esc(r)}" href="${esc(h)}" title="${esc(title.get(r) || r)}">${esc(r)}</a>`;
      }).join(', ');
      last = m.index + m[0].length;
    }
    out += esc(src.slice(last));
    return out;
  }

  DeepAsk.ground = { check, linkify, _sentences: sentencesOf, _refs: refsIn };
})();
