/* MindBlown Neural — connectome.js
   Network-neuroscience measures for a brain: strength, clustering, path length, small-world index,
   betweenness, Louvain communities, participation coefficient / within-module z, hub roles, rich club,
   weighted shortest paths. Pure functions over {nodes, edges}; no DOM, no D3. */
window.MBN = window.MBN || {};
(() => {
  const C = {};

  // ---------- adjacency ----------
  // nodes: [{id}], edges: [{a, b, w}] (undirected, a/b are node objects). Returns per-node adjacency maps.
  C.adjacency = (nodes, edges) => {
    const adj = new Map(nodes.map(n => [n, new Map()]));
    for (const e of edges) {
      if (e.a === e.b) continue;
      adj.get(e.a).set(e.b, (adj.get(e.a).get(e.b) || 0) + e.w);
      adj.get(e.b).set(e.a, (adj.get(e.b).get(e.a) || 0) + e.w);
    }
    return adj;
  };

  // ---------- local measures ----------
  C.strength = adj => { const s = new Map(); adj.forEach((m, n) => { let t = 0; m.forEach(w => t += w); s.set(n, t); }); return s; };
  C.degree = adj => { const d = new Map(); adj.forEach((m, n) => d.set(n, m.size)); return d; };

  // unweighted local clustering: closed triangles / possible triangles around a node
  C.clustering = adj => {
    const c = new Map();
    adj.forEach((m, n) => {
      const nb = [...m.keys()]; const k = nb.length;
      if (k < 2) { c.set(n, 0); return; }
      let t = 0;
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (adj.get(nb[i]).has(nb[j])) t++;
      c.set(n, (2 * t) / (k * (k - 1)));
    });
    return c;
  };

  // BFS hop distances from a node (topological path length: 1 = directly connected)
  C.bfs = (adj, src) => {
    const dist = new Map([[src, 0]]); const q = [src];
    for (let i = 0; i < q.length; i++) { const u = q[i]; for (const v of adj.get(u).keys()) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); } }
    return dist;
  };

  // Brandes betweenness (unweighted), normalized to [0,1]
  C.betweenness = adj => {
    const nodes = [...adj.keys()], bc = new Map(nodes.map(n => [n, 0]));
    for (const s of nodes) {
      const S = [], P = new Map(nodes.map(n => [n, []])), sigma = new Map(nodes.map(n => [n, 0])), d = new Map(nodes.map(n => [n, -1]));
      sigma.set(s, 1); d.set(s, 0); const Q = [s];
      for (let i = 0; i < Q.length; i++) {
        const v = Q[i]; S.push(v);
        for (const w of adj.get(v).keys()) {
          if (d.get(w) < 0) { Q.push(w); d.set(w, d.get(v) + 1); }
          if (d.get(w) === d.get(v) + 1) { sigma.set(w, sigma.get(w) + sigma.get(v)); P.get(w).push(v); }
        }
      }
      const delta = new Map(nodes.map(n => [n, 0]));
      while (S.length) { const w = S.pop(); for (const v of P.get(w)) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w))); if (w !== s) bc.set(w, bc.get(w) + delta.get(w)); }
    }
    const n = nodes.length, norm = n > 2 ? 1 / ((n - 1) * (n - 2)) : 0;   // undirected: each pair counted twice, so (n-1)(n-2) rather than /2
    bc.forEach((v, k) => bc.set(k, v * norm));
    return bc;
  };

  // ---------- global measures ----------
  // characteristic path length over the largest connected component, plus component sizes
  C.pathLength = adj => {
    const nodes = [...adj.keys()]; const seen = new Set(); let best = [];
    for (const n of nodes) { if (seen.has(n)) continue; const comp = [...C.bfs(adj, n).keys()]; comp.forEach(x => seen.add(x)); if (comp.length > best.length) best = comp; }
    let total = 0, pairs = 0;
    for (const s of best) { const d = C.bfs(adj, s); d.forEach((v, t) => { if (t !== s) { total += v; pairs++; } }); }
    return { L: pairs ? total / pairs : 0, giant: best.length, n: nodes.length };
  };

  // Watts–Strogatz style small-world summary against an Erdős–Rényi reference with the same n and mean degree
  C.smallWorld = adj => {
    const n = adj.size; if (n < 4) return null;
    const deg = C.degree(adj); let m = 0; deg.forEach(v => m += v); m /= 2;
    const kMean = (2 * m) / n;
    const cl = C.clustering(adj); let Cobs = 0; cl.forEach(v => Cobs += v); Cobs /= n;
    const { L, giant } = C.pathLength(adj);
    const Crand = kMean / (n - 1), Lrand = kMean > 1 ? Math.log(n) / Math.log(kMean) : Infinity;
    const gamma = Crand > 0 ? Cobs / Crand : 0, lambda = Lrand > 0 && L > 0 ? L / Lrand : 0;
    return { n, m, density: m / (n * (n - 1) / 2), kMean, C: Cobs, L, Crand, Lrand, gamma, lambda, sigma: lambda > 0 ? gamma / lambda : 0, giant };
  };

  // ---------- communities (Louvain, weighted, undirected) ----------
  C.louvain = (adj, resolution = 1) => {
    // work on integer ids
    const nodes = [...adj.keys()], idx = new Map(nodes.map((n, i) => [n, i]));
    let N = nodes.length;
    let links = []; adj.forEach((m, a) => m.forEach((w, b) => { if (idx.get(a) < idx.get(b)) links.push([idx.get(a), idx.get(b), w]); }));
    let membership = nodes.map((_, i) => i);   // current node → community at the current level, mapped back to original nodes
    let levelNodes = N;
    for (let level = 0; level < 10; level++) {
      // one level of local moving
      const nb = Array.from({ length: levelNodes }, () => new Map()); const k = new Array(levelNodes).fill(0); let m2 = 0;
      for (const [a, b, w] of links) {
        if (a === b) { k[a] += 2 * w; m2 += 2 * w; continue; }   // self-loop from an aggregated community: counts twice toward degree, never as a neighbour
        nb[a].set(b, (nb[a].get(b) || 0) + w); nb[b].set(a, (nb[b].get(a) || 0) + w); k[a] += w; k[b] += w; m2 += 2 * w;
      }
      if (m2 === 0) break;
      const comm = Array.from({ length: levelNodes }, (_, i) => i), tot = k.slice();
      let moved = true, rounds = 0;
      while (moved && rounds++ < 50) {
        moved = false;
        for (let i = 0; i < levelNodes; i++) {
          const ci = comm[i]; const wIn = new Map();
          nb[i].forEach((w, j) => wIn.set(comm[j], (wIn.get(comm[j]) || 0) + w));
          tot[ci] -= k[i];
          let best = ci, bestGain = (wIn.get(ci) || 0) - resolution * tot[ci] * k[i] / m2;
          wIn.forEach((w, c) => { const gain = w - resolution * tot[c] * k[i] / m2; if (gain > bestGain + 1e-12) { bestGain = gain; best = c; } });
          tot[best] += k[i];
          if (best !== ci) { comm[i] = best; moved = true; }
        }
      }
      // renumber
      const ids = new Map(); comm.forEach((c, i) => { if (!ids.has(c)) ids.set(c, ids.size); comm[i] = ids.get(c); });
      const nComm = ids.size;
      if (nComm === levelNodes) break;
      membership = membership.map(c => comm[c]);
      // aggregate
      const agg = new Map();
      for (const [a, b, w] of links) { const ca = comm[a], cb = comm[b]; const key = ca < cb ? ca * nComm + cb : cb * nComm + ca; agg.set(key, (agg.get(key) || 0) + w); }
      links = []; agg.forEach((w, key) => { const ca = Math.floor(key / nComm), cb = key % nComm; links.push([ca, cb, w]); });   // keep self-loops: they carry the community's internal weight
      levelNodes = nComm;
    }
    // modularity Q of the final partition on the original graph
    let m2 = 0; const kk = new Map(), tot = new Map();
    adj.forEach((m, a) => { let s = 0; m.forEach(w => s += w); kk.set(a, s); m2 += s; tot.set(membership[idx.get(a)], (tot.get(membership[idx.get(a)]) || 0) + s); });
    let Q = 0; adj.forEach((m, a) => m.forEach((w, b) => { if (membership[idx.get(a)] === membership[idx.get(b)]) Q += w; }));
    Q /= m2; tot.forEach(t => Q -= (t / m2) * (t / m2));
    const out = new Map(nodes.map((n, i) => [n, membership[i]]));
    return { membership: out, count: new Set(membership).size, Q };
  };

  // ---------- roles (Guimerà–Amaral cartography; thresholds as used in connectome work) ----------
  // participation coefficient: 1 − Σ_m (k_im / k_i)²  — 0 = all links in one module, →1 = spread evenly
  C.roles = (adj, membership, opts = {}) => {
    const zHub = opts.zHub ?? 1.0, pProv = 0.3, pConn = 0.75;
    const kin = new Map(), P = new Map();
    adj.forEach((m, n) => {
      const mine = membership.get(n); let k = 0, kIn = 0; const per = new Map();
      m.forEach((w, o) => { k += w; const c = membership.get(o); per.set(c, (per.get(c) || 0) + w); if (c === mine) kIn += w; });
      kin.set(n, kIn); let s = 0; per.forEach(v => s += (v / k) * (v / k)); P.set(n, k ? 1 - s : 0);
    });
    const byMod = new Map(); kin.forEach((v, n) => { const c = membership.get(n); if (!byMod.has(c)) byMod.set(c, []); byMod.get(c).push(v); });
    const stats = new Map(); byMod.forEach((arr, c) => { const mean = arr.reduce((a, b) => a + b, 0) / arr.length; const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) || 1; stats.set(c, { mean, sd }); });
    const out = new Map();
    adj.forEach((_, n) => {
      const { mean, sd } = stats.get(membership.get(n)); const z = (kin.get(n) - mean) / sd, p = P.get(n);
      const hub = z >= zHub;
      const role = hub ? (p <= pProv ? 'provincial hub' : p <= pConn ? 'connector hub' : 'global hub') : (p <= 0.05 ? 'ultra-peripheral' : p <= 0.62 ? 'peripheral' : p <= 0.8 ? 'connector' : 'kinless');
      out.set(n, { z, p, hub, role });
    });
    return out;
  };

  // ---------- rich club ----------
  // top share of nodes by strength; φ = links among them / possible links, compared with the whole network's density
  C.richClub = (adj, share = 0.1, min = 4) => {
    if (adj.size < 12) { let m = 0; adj.forEach(mm => m += mm.size); m /= 2; return { members: new Set(), phi: 0, density: adj.size > 1 ? m / (adj.size * (adj.size - 1) / 2) : 0, ratio: 0, links: 0 }; }
    const s = C.strength(adj); const nodes = [...adj.keys()].sort((a, b) => s.get(b) - s.get(a));
    const k = Math.max(min, Math.round(nodes.length * share)); const club = new Set(nodes.slice(0, Math.min(k, nodes.length)));
    let e = 0; club.forEach(a => adj.get(a).forEach((_, b) => { if (club.has(b)) e++; })); e /= 2;
    const possible = club.size * (club.size - 1) / 2; let m = 0; adj.forEach(mm => m += mm.size); m /= 2;
    const density = adj.size > 1 ? m / (adj.size * (adj.size - 1) / 2) : 0;
    const phi = possible ? e / possible : 0;
    return { members: club, phi, density, ratio: density ? phi / density : 0, links: e };
  };

  // ---------- routing ----------
  // weighted shortest path: strong synapses are short roads (cost = 1 / w). Returns {path:[nodes], cost, hops}
  C.shortestPath = (adj, src, dst, weightOf) => {
    const dist = new Map([[src, 0]]), prev = new Map(), done = new Set();
    const open = [src];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
      const u = open.splice(bi, 1)[0]; if (u === dst) break; if (done.has(u)) continue; done.add(u);
      adj.get(u).forEach((w, v) => {
        if (done.has(v)) return; const ww = weightOf ? weightOf(u, v, w) : w; const nd = dist.get(u) + 1 / Math.max(ww, 1e-6);
        if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u); if (!open.includes(v)) open.push(v); }
      });
    }
    if (!dist.has(dst)) return null;
    const path = [dst]; while (path[0] !== src) path.unshift(prev.get(path[0]));
    return { path, cost: dist.get(dst), hops: path.length - 1 };
  };

  // Rich-club route motif (van den Heuvel style): classify each hop as C (club–club), F (feeder) or L (local) and condense runs
  C.routeMotif = (path, club) => {
    const t = []; for (let i = 1; i < path.length; i++) { const a = club.has(path[i - 1]), b = club.has(path[i]); t.push(a && b ? 'C' : a || b ? 'F' : 'L'); }
    return t.join('-');   // e.g. L-F-C-F-L: local → feeder → club backbone → feeder → local
  };
  // motif class as in the C. elegans rich-club paper: consecutive hops of the same type are condensed (F-F-C-F → F-C-F)
  C.motifClass = motif => motif.split('-').filter((x, i, a) => i === 0 || x !== a[i - 1]).join('-');

  // ---------- one call that computes everything the app needs ----------
  C.analyze = (nodes, edges) => {
    const adj = C.adjacency(nodes, edges);
    const strength = C.strength(adj), degree = C.degree(adj), clustering = C.clustering(adj), betweenness = C.betweenness(adj);
    const sw = C.smallWorld(adj);
    const lv = C.louvain(adj);
    const roles = C.roles(adj, lv.membership);
    const club = C.richClub(adj);
    // how well the configured lobes match the connectivity: share of link weight that stays inside a lobe
    // (edges touching the self node or day logs are excluded: they are hubs by construction)
    let inLobe = 0, all = 0; for (const e of edges) { if (e.a.isSelf || e.b.isSelf || e.a.isCenter || e.b.isCenter || e.a.type === 'day' || e.b.type === 'day') continue; all += e.w; if (e.a.lobe === e.b.lobe) inLobe += e.w; }
    // neurons whose detected community is dominated by another lobe than their own
    const commLobe = new Map(); lv.membership.forEach((c, n) => { if (!commLobe.has(c)) commLobe.set(c, new Map()); const m = commLobe.get(c); m.set(n.lobe, (m.get(n.lobe) || 0) + 1); });
    const commMajor = new Map(); commLobe.forEach((m, c) => { let best = null, bv = -1; m.forEach((v, l) => { if (v > bv) { bv = v; best = l; } }); commMajor.set(c, best); });
    const misfiled = []; lv.membership.forEach((c, n) => { if (commMajor.get(c) !== n.lobe && degree.get(n) >= 2) misfiled.push(n); });
    return { adj, strength, degree, clustering, betweenness, smallWorld: sw, communities: lv, roles, club, lobeFidelity: all ? inLobe / all : 0, commMajor, misfiled };
  };

  window.MBN.connectome = C;
})();
