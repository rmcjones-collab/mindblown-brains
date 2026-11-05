/* MindBlown Neural — model.js
   Reads a window.MINDBLOWN data set (single brain, or a merged network with brains[]/centers[]) into node objects:
   pages (neurons, with one level of sub-neurons), synapses (facts), sources, and the link kinds the layout understands.
   A neuron that carries a molecule (page.mol, from the Chemistry brain) grows its atoms as sub-neurons and its bonds as connectors.
   Then runs the connectome analysis and attaches the measures to each neuron. */
window.MBN = window.MBN || {};
(() => {
  const C = () => window.MBN.connectome;
  // atomic number -> [symbol, name, CPK colour (Jmol convention), drawn radius]; used when a neuron carries a molecule
  const ELEMENTS = {
    1: ['H', 'Hydrogen', '#e8e8e8', 2.3], 2: ['He', 'Helium', '#d9ffff', 3.0], 5: ['B', 'Boron', '#ffb5b5', 3.3], 6: ['C', 'Carbon', '#9aa0ad', 3.3], 7: ['N', 'Nitrogen', '#5b8dff', 3.3], 8: ['O', 'Oxygen', '#ff5c5c', 3.3],
    9: ['F', 'Fluorine', '#90e050', 3.2], 10: ['Ne', 'Neon', '#b3e3f5', 3.2], 11: ['Na', 'Sodium', '#ab5cf2', 4.0], 12: ['Mg', 'Magnesium', '#8aff00', 3.8], 13: ['Al', 'Aluminium', '#bfa6a6', 3.8], 14: ['Si', 'Silicon', '#f0c8a0', 3.7],
    15: ['P', 'Phosphorus', '#ff8000', 3.7], 16: ['S', 'Sulfur', '#ffd21f', 3.6], 17: ['Cl', 'Chlorine', '#1ff01f', 3.6], 18: ['Ar', 'Argon', '#80d1e3', 3.6], 19: ['K', 'Potassium', '#8f40d4', 4.3], 20: ['Ca', 'Calcium', '#3dff00', 4.0],
    22: ['Ti', 'Titanium', '#bfc2c7', 3.9], 25: ['Mn', 'Manganese', '#9c7ac7', 3.8], 26: ['Fe', 'Iron', '#e06633', 3.8], 27: ['Co', 'Cobalt', '#f090a0', 3.8], 29: ['Cu', 'Copper', '#c88033', 3.8], 30: ['Zn', 'Zinc', '#7d80b0', 3.8],
    35: ['Br', 'Bromine', '#a62929', 3.8], 38: ['Sr', 'Strontium', '#00ff00', 4.3], 47: ['Ag', 'Silver', '#c0c0c0', 4.0], 51: ['Sb', 'Antimony', '#9e63b5', 3.9], 53: ['I', 'Iodine', '#940094', 4.0], 56: ['Ba', 'Barium', '#00c900', 4.5],
    78: ['Pt', 'Platinum', '#d0d0e0', 4.0], 80: ['Hg', 'Mercury', '#b8b8d0', 4.0], 82: ['Pb', 'Lead', '#575961', 4.2],
  };
  const sub = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const chargeMark = q => !q ? '' : (Math.abs(q) > 1 ? String(Math.abs(q)).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]) : '') + (q > 0 ? '⁺' : '⁻');
  window.MBN.ELEMENTS = ELEMENTS;

  function build(D) {
    const lobes = D.lobes.map(l => ({ ...l }));
    const lobeById = Object.fromEntries(lobes.map(l => [l.id, l]));
    const brainsIn = D.brains ? D.brains.map(b => ({ ...b })) : null;
    const selfLobe = l => !!l.self || l.id === 'self';
    const selfIds = new Set(lobes.filter(selfLobe).map(l => l.id));
    const centers = new Set(D.centers || (D.center ? [D.center] : []));

    const pageById = {};
    const pages = D.pages.map(p0 => {
      const p = { ...p0, parentId: p0.parent || null }; delete p.parent;
      const n = { ...p, kind: 'page', nSyn: p.synapses.length, neighbors: [], synNodes: [], srcNodes: [], children: [], parent: null, isCenter: centers.has(p.id), isSelf: selfIds.has(p.lobe), active: true };
      pageById[p.id] = n; return n;
    });
    pages.forEach(n => { const p = n.parentId && pageById[n.parentId]; if (p && p !== n && !p.parentId) { n.parent = p; p.children.push(n); } });
    const isChild = n => n.kind === 'page' && !!n.parent;

    // ---------- molecules: a neuron with a `mol` field unfolds into its structural formula ----------
    // Each atom becomes a sub-neuron held at a fixed offset (mdx, mdy) from its parent, so the drawing keeps the shape a
    // chemist would draw (the coordinates come from PubChem's 2-D depiction); bonds become connectors between atoms.
    // Atoms are kept out of the connectome analysis and out of the force balance: they are the parent's anatomy, not neurons of their own.
    const bondLinks = [], atoms = [];
    const BOND_NOTE = { 1: 'single bond', 2: 'double bond', 3: 'triple bond' };
    // Drawings are capped at MOL_R world units so a 93-atom vitamin does not swallow its lobe: bigger molecules are drawn
    // smaller (mol.s < 1) and read at a closer zoom; mol.re is the radius actually drawn.
    const MOL_R = 60;
    pages.filter(p => p.mol && Array.isArray(p.mol.atoms)).forEach(p => {
      const s = Math.min(1, MOL_R / Math.max(1, p.mol.r || 1)); p.mol.s = s; p.mol.re = (p.mol.r || 0) * s;
      p.atoms = p.mol.atoms.map(([z, x, y, q, h], i) => {
        const e = ELEMENTS[z] || ['Z' + z, 'element ' + z, '#9aa', 3.3];
        const label = e[0] + (h ? 'H' + (h > 1 ? sub(h) : '') : '') + chargeMark(q);
        const n = { id: p.id + '/' + i, title: label, kind: 'page', type: 'atom', lobe: p.lobe, parent: p, parentId: p.id, isAtom: true, atom: { z, sym: e[0], name: e[1], color: e[2], q, h }, mdx: x * s, mdy: y * s, r: e[3] * Math.max(0.5, s),
          desc: '', intro: '', synapses: [], sources: [], nSyn: 0, neighbors: [], synNodes: [], srcNodes: [], children: [], isCenter: false, isSelf: false, active: true, bonds: [] };
        pageById[n.id] = n; atoms.push(n); return n;
      });
      p.mol.bonds.forEach(([a, b, o, style]) => {
        const s = p.atoms[a], t = p.atoms[b]; if (!s || !t) return;
        const note = style === 'layout' ? 'layout connector (separate fragment, no bond)' : style === 'ionic' ? 'ionic attraction' : style === 'coord' ? 'coordinate bond' : (BOND_NOTE[o] || 'bond') + (style === 'wedge' ? ' (wedge: toward you)' : style === 'hash' ? ' (hash: away from you)' : style === 'aromatic' ? ' (aromatic)' : '');
        const l = { source: s, target: t, kind: 'bond', order: o, style: style || null, w: o, weff: o, learn: 0, myelin: 0, uses: 0, kinds: ['bond'], notes: [note], key: s.id + '\u0001' + t.id };
        bondLinks.push(l); s.neighbors.push({ n: t, l }); t.neighbors.push({ n: s, l }); s.bonds.push(l); t.bonds.push(l);
      });
      // each atom describes itself from its bonds, so the panel and tooltip read like a caption
      p.atoms.forEach(n => {
        const parts = n.neighbors.filter(({ l }) => l.style !== 'layout').map(({ n: m, l }) => (l.style === 'ionic' ? 'ionic attraction to ' : l.order === 3 ? 'triple bond to ' : l.order === 2 ? 'double bond to ' : 'bond to ') + m.atom.name.toLowerCase());
        n.desc = n.intro = `${n.atom.name} atom of ${p.title}${n.atom.q ? ` carrying a ${n.atom.q > 0 ? 'positive' : 'negative'} charge` : ''}${n.atom.h ? `, with ${n.atom.h} hydrogen${n.atom.h > 1 ? 's' : ''} folded into its label` : ''}${parts.length ? ': ' + parts.join(', ') : ''}.`;
      });
    });
    pages.push(...atoms);
    const isAtom = n => !!n.isAtom;

    const synById = {};
    const syns = D.synapses.map((s, i) => { const n = { ...s, kind: 'syn', idx: i, lobe: pageById[s.page].lobe, ordinal: pageById[s.page].synNodes.length }; synById[s.id] = n; pageById[s.page].synNodes.push(n); return n; });
    // ---------- puzzles: solve to unfold ----------
    // A synapse may carry `puzzle: { q, a, hint? }` (a prompt, an answer pattern, an optional hint). Such a synapse is sealed: the model itself
    // swaps its lead and text for the prompt, in its own node AND in the raw D.synapses entry, so the map, the panel, the tooltip, search and
    // every add-on that reads D directly (mice, mice chat, dock, Log) only ever read the puzzle; the fact is kept aside in this closure and
    // restored in both places when the answer matches, and stays unfolded for the session (sessionStorage, guarded).
    // Ported from the canonical renderer (rmcjones-collab/mindblown #13/#17). Brains without the field never see any of this.
    const SEALED_TEXT = 'Sealed · solve to unfold';
    const solvedKey = 'mindblown.solved.' + (D.brain || D.title || location.pathname);
    const store = (() => { try { return window.sessionStorage; } catch (e) { return null; } })();
    const solved = new Set((() => { try { const v = JSON.parse(store?.getItem(solvedKey) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch (e) { return []; } })());   // a malformed stored value must not stop the engine
    const folded = new Map();
    syns.forEach(n => {
      // a puzzle needs a prompt and a non-empty answer pattern; an empty pattern would let any input ("!!!") unfold it
      if (!n.puzzle || typeof n.puzzle.q !== 'string' || !n.puzzle.q.trim() || n.puzzle.a == null || !String(n.puzzle.a).trim()) { delete n.puzzle; return; }
      if (solved.has(n.id)) return;
      const raw = D.synapses[n.idx];
      folded.set(n, { lead: n.lead, text: n.text }); n.sealed = true; n.lead = '? ' + n.puzzle.q; n.text = SEALED_TEXT;
      raw.lead = n.lead; raw.text = SEALED_TEXT;   // the raw entry is sealed too: nothing outside this closure keeps the fact
    });
    const normAns = t => String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}.,]+/gu, ' ').trim();
    const answerOk = (n, text) => {
      let re = null; try { re = new RegExp('^(?:' + n.puzzle.a + ')$', 'iu'); } catch (e) { re = null; }   // the pattern is authored; a broken one falls back to a plain comparison
      return re ? re.test(normAns(text)) || re.test(String(text).trim()) : normAns(n.puzzle.a) === normAns(text);
    };
    const solve = (n, text) => {
      if (!n || !n.sealed || !answerOk(n, text)) return false;
      const fact = folded.get(n); Object.assign(n, fact); Object.assign(D.synapses[n.idx], fact); folded.delete(n); n.sealed = false; solved.add(n.id);
      try { store?.setItem(solvedKey, JSON.stringify([...solved])); } catch (e) { /* storage may be unavailable; the session still unfolds */ }
      return true;
    };
    const srcById = {};
    const srcs = D.sources.map(s => { const n = { ...s, kindOf: s.kind, kind: 'src', lobe: pageById[s.pages[0]].lobe, pageNodes: s.pages.map(p => pageById[p]) }; srcById[s.id] = n; n.pageNodes.forEach(p => p.srcNodes.push(n)); return n; });

    const pageLinks = D.links.filter(l => pageById[l.s] && pageById[l.t] && l.s !== l.t).map(l => ({ source: pageById[l.s], target: pageById[l.t], w: l.w, kinds: l.kinds || [], notes: l.notes || [], kind: 'pp' }));
    pageLinks.forEach(l => { l.source.neighbors.push({ n: l.target, l }); l.target.neighbors.push({ n: l.source, l }); });
    const synTethers = syns.map(s => ({ source: s, target: pageById[s.page], kind: 'st' }));
    const synCross = D.synLinks.filter(l => synById[l.s] && pageById[l.t]).map(l => ({ source: synById[l.s], target: pageById[l.t], kind: 'sx' }));
    const srcTethers = []; srcs.forEach(s => s.pageNodes.forEach(p => srcTethers.push({ source: s, target: p, kind: 'sr' })));
    const cociteLinks = (D.cocite || []).filter(l => pageById[l.s] && pageById[l.t]).map(l => ({ source: pageById[l.s], target: pageById[l.t], w: l.w, kind: 'cc' }));
    const childTethers = pages.filter(c => isChild(c) && !c.isAtom).map(c => ({ source: c, target: c.parent, kind: 'pc' }));

    // ---------- connectome measures on the neuron graph (atoms excluded) ----------
    const neurons = pages.filter(p => !p.isAtom);
    const A = C().analyze(neurons, pageLinks.map(l => ({ a: l.source, b: l.target, w: l.w })));
    // "wired elsewhere" is only meaningful for ordinary neurons in visible lobes (not the self node, day logs or hidden trails)
    A.misfiled = A.misfiled.filter(p => !p.isSelf && !p.isCenter && p.type !== 'day' && !lobeById[p.lobe]?.hidden && !lobeById[A.commMajor.get(A.communities.membership.get(p))]?.hidden);
    const bcSorted = [...A.betweenness.entries()].sort((a, b) => b[1] - a[1]);
    const bcRank = new Map(bcSorted.map(([n], i) => [n, i + 1]));
    atoms.forEach(p => { p.deg = p.neighbors.length; p.strength0 = p.neighbors.reduce((s, x) => s + x.l.w, 0); p.cc = 0; p.bc = 0; p.bcRank = neurons.length + 1; p.comm = undefined; p.z = 0; p.part = 0; p.role = 'atom'; p.hub = false; p.club = false; p.misfiled = false; });
    neurons.forEach(p => {
      p.deg = A.degree.get(p) || 0; p.strength0 = A.strength.get(p) || 0; p.cc = A.clustering.get(p) || 0; p.bc = A.betweenness.get(p) || 0; p.bcRank = bcRank.get(p);
      p.comm = A.communities.membership.get(p); const r = A.roles.get(p); p.z = r.z; p.part = r.p; p.role = r.role; p.hub = r.hub; p.club = A.club.members.has(p);
      p.misfiled = A.misfiled.includes(p);
    });
    // base radius: a neuron grows with its synapses (facts) and its strength (connections); the hub of a brain is biggest
    pages.forEach(p => { if (!p.isAtom) p.r = p.isCenter ? 16 : isChild(p) ? 3.6 + Math.sqrt(p.nSyn) * 0.9 : 5.5 + Math.sqrt(p.nSyn) * 1.2 + Math.sqrt(Math.min(p.strength0, 40)) * 0.6; p.spin = Math.random() * Math.PI * 2; });
    pages.forEach(p => { if (p.children.length) p.r += Math.min(p.children.length, 6) * 0.6; });

    // community colours (for the "detected communities" overlay) — evenly spaced hues, deterministic by community id
    const commColor = {}; const nComm = A.communities.count;
    for (let i = 0; i < nComm; i++) commColor[i] = d3.hsl((i * 137.508) % 360, 0.62, 0.62).formatHex();

    return { D, lobes, lobeById, brainsIn, selfLobe, selfIds, centers, pages, pageById, syns, synById, srcs, srcById, pageLinks, synTethers, synCross, srcTethers, cociteLinks, childTethers, bondLinks, atoms, isChild, isAtom, hasSubs: pages.some(isChild), hasMol: atoms.length > 0, analysis: A, commColor, solve, SEALED_TEXT };
  }

  window.MBN.buildModel = build;
})();
