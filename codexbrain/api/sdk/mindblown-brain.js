/* MindBlown Brain API client — protocol mindblown-brain/1. Browser + Node (18+), no dependencies.
   UMD: `window.MindBlownAPI` in a page, `module.exports` in Node, ES import via `import('./mindblown-brain.js')` (CommonJS shim).

   const mb = MindBlownAPI.host('https://rmcjones-collab.github.io/mindblown-demo/');   // discovery via /.well-known/mindblown.json (falls back to /api/index.json)
   const brains = await mb.brains();                               // [{id,title,counts,api,...}]
   const brain = await mb.brain('projects');                       // Brain
   const hits = await brain.search('tide gates');                  // ranked pages [{page, score}]
   const page = await brain.page('projects/tidewatch');            // full document: synapses, sources, neighbours
   const net = await mb.network();                                 // network manifest (shared ids, sections, peers) or null
   for (const peer of await mb.peers()) ...                        // other hosts this one points at

   Transport: fetch() first; when a browser hits a CORS wall the client loads the `.js` twin of the same document through a
   <script> tag (the host wraps every document for window.MINDBLOWN_API.receive). Documents are cached per client. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MindBlownAPI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PROTOCOL = 'mindblown-brain/1';
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const SAFE = /[A-Za-z0-9._-]/;
  const STOP = new Set('a an and are as at be by for from has have in into is it its of on or that the this to was were will with your you we our they their not but if then than so can may also any all each more most such only own same very'.split(' '));

  // ---------- helpers ----------
  function encId(id) { let o = ''; for (const ch of id) { if (SAFE.test(ch)) o += ch; else for (const b of new TextEncoder().encode(ch)) o += '~' + b.toString(16).padStart(2, '0'); } return o; }
  function tokens(s) { return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t)); }
  function join(base, rel) { if (/^https?:/.test(rel)) return rel; return base.replace(/\/+$/, '') + '/' + rel.replace(/^\/+/, ''); }

  // script transport: one shared receiver, resolved by (brain, endpoint) of the payload the host wrapped
  const waiting = [];
  function receive(p) { for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].match(p)) { const w = waiting.splice(i, 1)[0]; w.ok(p.data); } }
  if (isBrowser) {
    const prev = window.MINDBLOWN_API;
    window.MINDBLOWN_API = Object.assign(prev || {}, { receive, protocol: PROTOCOL });
    (window.MINDBLOWN_API_Q || []).splice(0).forEach(receive);
  }
  function viaScript(url, match) {
    return new Promise((ok, no) => {
      const s = document.createElement('script'); s.async = true; s.src = url;
      const t = setTimeout(() => { done(new Error('timeout loading ' + url)); }, 20000);
      const entry = { match, ok: d => done(null, d) };
      function done(err, d) { clearTimeout(t); const i = waiting.indexOf(entry); if (i >= 0) waiting.splice(i, 1); s.remove(); err ? no(err) : ok(d); }
      waiting.push(entry);
      s.onerror = () => done(new Error('cannot load ' + url));
      document.head.appendChild(s);
    });
  }

  // ---------- transport ----------
  class Client {
    constructor(opts) { this.opts = Object.assign({ fetch: typeof fetch === 'function' ? fetch.bind(globalThis) : null, transport: 'auto', timeout: 20000 }, opts || {}); this.cache = new Map(); }
    async get(url, match) {
      if (this.cache.has(url)) return this.cache.get(url);
      const p = this._get(url, match); this.cache.set(url, p);
      try { return await p; } catch (e) { this.cache.delete(url); throw e; }
    }
    async _get(url, match) {
      const mode = this.opts.transport;
      if (mode !== 'script' && this.opts.fetch) {
        try {
          const ctl = typeof AbortController === 'function' ? new AbortController() : null;
          const t = ctl && setTimeout(() => ctl.abort(), this.opts.timeout);
          const r = await this.opts.fetch(url, { signal: ctl && ctl.signal, headers: { accept: 'application/json' } });
          if (t) clearTimeout(t);
          if (r.status === 404) { const e = new Error('404 ' + url); e.status = 404; throw e; }
          if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
          return await r.json();
        } catch (e) {
          if (e.status === 404 || mode === 'json' || !isBrowser) throw e;   // only a network/CORS failure falls through
        }
      }
      if (!isBrowser) throw new Error('script transport needs a browser: ' + url);
      return viaScript(url.replace(/\.json(\?.*)?$/, '.js$1'), match || (() => true));
    }
  }

  // ---------- Brain ----------
  class Brain {
    constructor(client, manifestOrApi) {
      this.client = client;
      if (typeof manifestOrApi === 'string') { this.api = manifestOrApi.replace(/\/+$/, '') + '/'; this.manifest = null; }
      else { this.manifest = manifestOrApi; this.api = (manifestOrApi.api || '').replace(/\/+$/, '') + '/'; }
      this.id = this.manifest && this.manifest.id || null;
    }
    _doc(name, endpoint) { const id = this.id; return this.client.get(join(this.api, name), p => p.endpoint === endpoint && (!id || p.brain === id)); }
    async info() { if (!this.manifest || !this.manifest.endpoints) { this.manifest = await this._doc('brain.json', 'brain'); this.id = this.manifest.id; } return this.manifest; }
    async lobes() { return (await this._doc('lobes.json', 'lobes')).lobes; }
    async pages() { return (await this._doc('pages.json', 'pages')).pages; }
    async synapses() { return (await this._doc('synapses.json', 'synapses')).synapses; }
    async sources() { return (await this._doc('sources.json', 'sources')).sources; }
    async links() { return this._doc('links.json', 'links'); }
    async graph() { return (await this._doc('graph.json', 'graph')).graph; }
    async feed() { return this._doc('feed.json', 'feed'); }
    async data() { return this._doc('data.json', 'data'); }
    async openapi() { return this._doc('openapi.json', 'openapi'); }
    async page(id) { await this.info(); return this.client.get(join(this.api, 'pages/' + encId(id) + '.json'), p => p.endpoint === 'page' && p.data && p.data.page && p.data.page.id === id); }
    async neighbours(id) { const d = await this.page(id); return d.neighbours; }
    async children(id) { const d = await this.page(id); return d.children; }
    /** Ranked search over the brain's inverted index. Returns [{page: PageSummary, score}]. */
    async search(query, opts) {
      const limit = (opts && opts.limit) || 10;
      const [idx, pages] = await Promise.all([this._doc('search.json', 'search'), this.pages()]);
      const byId = new Map(pages.map(p => [p.id, p]));
      const q = tokens(query); if (!q.length) return [];
      const score = new Map(), hitTerms = new Map();
      for (const t of q) {
        const exact = idx.index[t] || [];
        const prefix = exact.length ? [] : Object.keys(idx.index).filter(k => k.startsWith(t) && k !== t).slice(0, 25).flatMap(k => idx.index[k].map(([i, s]) => [i, s * 0.5]));
        for (const [i, s] of exact.concat(prefix)) { score.set(i, (score.get(i) || 0) + s); hitTerms.set(i, (hitTerms.get(i) || new Set()).add(t)); }
      }
      return [...score.entries()]
        .map(([i, s]) => ({ page: byId.get(idx.pages[i]), score: s * (1 + (hitTerms.get(i).size - 1) * 0.75), terms: [...hitTerms.get(i)] }))
        .filter(h => h.page).sort((a, b) => b.score - a.score).slice(0, limit);
    }
    /** Synapses of a page whose lead/text mention any query token (for quoting facts). */
    async facts(id, query) { const d = await this.page(id); const q = tokens(query || ''); return q.length ? d.synapses.filter(s => { const ts = new Set(tokens(s.lead + ' ' + s.text)); return q.some(t => ts.has(t)); }) : d.synapses; }
  }

  // ---------- Host (discovery) ----------
  class Host {
    constructor(origin, opts) { this.origin = String(origin).replace(/\/+$/, ''); this.client = (opts && opts.client) || new Client(opts); this._disc = null; }
    async discover() {
      if (this._disc) return this._disc;
      const m = p => p.endpoint === 'index' || (p.data && Array.isArray(p.data.brains));
      this._disc = this.client.get(this.origin + '/.well-known/mindblown.json', m)
        .catch(() => this.client.get(this.origin + '/api/index.json', m))
        .then(d => this._rebase(d));
      return this._disc;
    }
    /** A mirror or preview serves the same tree under another origin: point every absolute URL at the origin we actually read from. */
    _rebase(d) {
      const from = (d.host || '').replace(/\/+$/, ''); if (!from || from === this.origin) return d;
      const fix = u => typeof u === 'string' && u.startsWith(from + '/') ? this.origin + u.slice(from.length) : u;
      const out = JSON.parse(JSON.stringify(d));
      out.brains = (out.brains || []).map(b => ({ ...b, api: fix(b.api), viewer: fix(b.viewer) }));
      if (out.network) out.network.api = fix(out.network.api);
      out.explorer = fix(out.explorer);
      if (out.sdk) for (const k of Object.keys(out.sdk)) out.sdk[k] = fix(out.sdk[k]);
      out.servedFrom = this.origin;
      return out;
    }
    async brains() { return (await this.discover()).brains; }
    async brain(id) { const d = await this.discover(); const m = d.brains.find(b => b.id === id); if (!m) throw new Error('no brain "' + id + '" on ' + this.origin); return new Brain(this.client, m); }
    async network() { const d = await this.discover(); if (!d.network) return null; return this.client.get(join(d.network.api, 'network.json'), p => p.endpoint === 'network'); }
    async shared() { const d = await this.discover(); if (!d.network) return {}; return (await this.client.get(join(d.network.api, 'shared.json'), p => p.endpoint === 'shared')).shared; }
    async peers() { return ((await this.discover()).peers || []).map(h => new Host(h, { client: this.client })); }
    /** Search every brain on this host; results carry the brain id. */
    async searchAll(query, opts) {
      const bs = await this.brains();
      const all = await Promise.all(bs.map(async b => (await new Brain(this.client, b).search(query, opts)).map(h => Object.assign(h, { brain: b.id }))));
      return all.flat().sort((a, b) => b.score - a.score).slice(0, (opts && opts.limit) || 10);
    }
  }

  return {
    protocol: PROTOCOL, encId, tokens, Client, Brain, Host,
    host: (origin, opts) => new Host(origin, opts),
    brain: (apiRoot, opts) => new Brain(new Client(opts), apiRoot),
    receive,
  };
});
