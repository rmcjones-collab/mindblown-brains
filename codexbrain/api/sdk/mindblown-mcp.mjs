#!/usr/bin/env node
/* MindBlown Brain MCP server — exposes MindBlown brains (protocol mindblown-brain/1) to any MCP client over stdio.
   Zero dependencies; Node 18+ (global fetch). JSON-RPC 2.0, newline-delimited, legacy `initialize` handshake
   (2024-11-05 … 2025-11-25) plus `server/discover` for newer clients.

   Run:    MINDBLOWN_HOSTS=https://rmcjones-collab.github.io/mindblown-demo/,https://rmcjones-collab.github.io/mindblown-brains/deepanswers/ node mindblown-mcp.mjs
   or:     node mindblown-mcp.mjs https://rmcjones-collab.github.io/mindblown-demo/ https://hubbrain.pplx.app
   Claude Desktop / Cursor / any MCP host config:
     { "mcpServers": { "mindblown": { "command": "node", "args": ["/path/to/mindblown-mcp.mjs", "https://rmcjones-collab.github.io/mindblown-demo/"] } } }

   Tools: list_brains · get_brain · list_pages · get_page · search · neighbours · facts · random_synapse · network
   Resources: mindblown://<host>/<brain>/pages/<id>  (one neuron document) */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

const require = createRequire(import.meta.url);
const MB = require(path.join(path.dirname(fileURLToPath(import.meta.url)), 'mindblown-brain.js'));

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const hostsArg = process.argv.slice(2).filter(a => /^https?:/.test(a));
const HOSTS = (hostsArg.length ? hostsArg : (process.env.MINDBLOWN_HOSTS || 'https://rmcjones-collab.github.io/mindblown-demo/').split(',')).map(s => s.trim()).filter(Boolean);
const hosts = HOSTS.map(h => MB.host(h));
const log = (...a) => process.stderr.write('[mindblown-mcp] ' + a.join(' ') + '\n');

// ---------- brain lookup ----------
async function allBrains() {
  const out = [];
  for (const h of hosts) {
    try { for (const b of await h.brains()) out.push({ host: h.origin, ...b }); }
    catch (e) { log('cannot discover', h.origin, e.message); }
  }
  return out;
}
async function findBrain(ref) {
  const brains = await allBrains();
  if (!ref) { if (brains.length === 1) ref = brains[0].id; else throw new Error('brain is required; one of: ' + brains.map(b => (hosts.length > 1 ? new URL(b.host).hostname + '/' : '') + b.id).join(', ')); }
  let host = null, id = ref;
  if (ref.includes('/')) { const [h, ...rest] = ref.split('/'); host = h; id = rest.join('/'); }
  const m = brains.find(b => b.id === id && (!host || new URL(b.host).hostname === host || b.host === host));
  if (!m) throw new Error('unknown brain "' + ref + '"; known: ' + brains.map(b => (hosts.length > 1 ? new URL(b.host).hostname + '/' : '') + b.id).join(', '));
  return { meta: m, brain: new MB.Brain(hosts.find(h => h.origin === m.host).client, m) };
}
const fmtSyn = s => `• ${s.lead ? s.lead + ' — ' : ''}${s.text}${s.cites && s.cites.length ? '  [' + s.cites.join(', ') + ']' : ''}`;

// ---------- tools ----------
const TOOLS = [
  { name: 'list_brains', description: 'List every MindBlown brain the server can reach (id, title, counts, viewer URL). Call first to learn brain ids.', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => { const bs = await allBrains(); return bs.map(b => `${hosts.length > 1 ? new URL(b.host).hostname + '/' : ''}${b.id} — ${b.title}${b.fictional ? ' (fictional demo data)' : ''}: ${b.counts.pages} neurons, ${b.counts.synapses} synapses, ${b.counts.sources} sources · ${b.viewer}`).join('\n') || 'no brains reachable'; } },
  { name: 'get_brain', description: 'Manifest of one brain: title, lobes, counts, content hash, network membership.', inputSchema: { type: 'object', properties: { brain: { type: 'string', description: 'brain id (or host/brain when several hosts are configured)' } }, required: ['brain'] },
    run: async ({ brain }) => { const { brain: b } = await findBrain(brain); const m = await b.info(); return JSON.stringify({ id: m.id, title: m.title, subtitle: m.subtitle, viewer: m.viewer, fictional: m.fictional, built: m.built, counts: m.counts, hash: m.hash, lobes: m.lobes.map(l => l.id + ': ' + l.name), network: m.network, license: m.license }, null, 2); } },
  { name: 'list_pages', description: 'List neurons (pages) of a brain, optionally filtered by lobe or type. Returns id, title, type, lobe, synapse count.', inputSchema: { type: 'object', properties: { brain: { type: 'string' }, lobe: { type: 'string' }, type: { type: 'string' }, limit: { type: 'integer', default: 100 } }, required: ['brain'] },
    run: async ({ brain, lobe, type, limit = 100 }) => { const { brain: b } = await findBrain(brain); const ps = (await b.pages()).filter(p => (!lobe || p.lobe === lobe) && (!type || p.type === type)); return `${ps.length} pages\n` + ps.slice(0, limit).map(p => `${p.id} — ${p.title} [${p.type}/${p.lobe}${p.parent ? ' ⊂ ' + p.parent : ''}] ${p.synapses} synapses`).join('\n'); } },
  { name: 'get_page', description: 'One neuron with all its cited facts (synapses), sources, parent/children and linked neurons.', inputSchema: { type: 'object', properties: { brain: { type: 'string' }, id: { type: 'string', description: 'page id, e.g. projects/tidewatch' } }, required: ['brain', 'id'] },
    run: async ({ brain, id }) => { const { brain: b } = await findBrain(brain); const d = await b.page(id); const p = d.page;
      return [`# ${p.title}  (${p.id}; ${p.type} in lobe ${p.lobe}${d.parent ? '; part of ' + d.parent.title : ''})`, p.desc || '', `viewer: ${d.url}`, '',
        `## Synapses (${d.synapses.length})`, ...d.synapses.map(fmtSyn), '',
        d.children.length ? `## Sub-neurons: ${d.children.map(c => c.title + ' (' + c.id + ')').join('; ')}` : '',
        `## Linked neurons: out → ${d.neighbours.out.map(n => n.page).join(', ') || '—'}; in ← ${d.neighbours.in.map(n => n.page).join(', ') || '—'}`,
        `## Sources (${d.sources.length})`, ...d.sources.map(s => `- ${s.label} <${s.id}> (${s.kind})`)].filter(x => x !== '').join('\n'); } },
  { name: 'search', description: 'Ranked full-text search over a brain (or every brain when brain is omitted). Returns page ids to pass to get_page.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, brain: { type: 'string', description: 'optional; omit to search all brains' }, limit: { type: 'integer', default: 10 } }, required: ['query'] },
    run: async ({ query, brain, limit = 10 }) => {
      let hits;
      if (brain) { const { meta, brain: b } = await findBrain(brain); hits = (await b.search(query, { limit })).map(h => ({ ...h, brain: meta.id })); }
      else { hits = []; for (const h of hosts) { try { hits.push(...(await h.searchAll(query, { limit })).map(x => ({ ...x, host: h.origin }))); } catch (e) { log(e.message); } } hits.sort((a, b) => b.score - a.score); hits = hits.slice(0, limit); }
      return hits.length ? hits.map(h => `${h.score.toFixed(1)}  ${h.brain}:${h.page.id} — ${h.page.title} (${h.page.synapses} synapses; matched ${h.terms.join(', ')})`).join('\n') : 'no matches'; } },
  { name: 'neighbours', description: 'Neurons connected to a page: outgoing/incoming links, synapse links, co-cited pages, children.', inputSchema: { type: 'object', properties: { brain: { type: 'string' }, id: { type: 'string' } }, required: ['brain', 'id'] },
    run: async ({ brain, id }) => { const { brain: b } = await findBrain(brain); const d = await b.page(id); return JSON.stringify({ parent: d.parent && d.parent.id, children: d.children.map(c => c.id), ...d.neighbours }, null, 2); } },
  { name: 'facts', description: 'Synapses (cited facts) of a page that mention a query; omit query for all of them.', inputSchema: { type: 'object', properties: { brain: { type: 'string' }, id: { type: 'string' }, query: { type: 'string' } }, required: ['brain', 'id'] },
    run: async ({ brain, id, query }) => { const { brain: b } = await findBrain(brain); const fs = await b.facts(id, query); return fs.length ? fs.map(fmtSyn).join('\n') : 'no matching facts'; } },
  { name: 'random_synapse', description: 'A random cited fact from a brain (for prompts, quizzes, daily digests).', inputSchema: { type: 'object', properties: { brain: { type: 'string' } }, required: ['brain'] },
    run: async ({ brain }) => { const { brain: b } = await findBrain(brain); const ss = await b.synapses(); const s = ss[Math.floor(Math.random() * ss.length)]; return `${s.page}: ${fmtSyn(s)}`; } },
  { name: 'network', description: 'Network manifest of a host: brains, shared neuron ids, sections and peer hosts.', inputSchema: { type: 'object', properties: { host: { type: 'string', description: 'origin; defaults to the first configured host' } } },
    run: async ({ host }) => { const h = host ? hosts.find(x => x.origin === host.replace(/\/+$/, '')) || MB.host(host) : hosts[0]; const n = await h.network(); if (!n) return `${h.origin} hosts a single brain (no network manifest)`; return JSON.stringify({ id: n.id, title: n.title, brains: n.brains.map(b => b.id + ' — ' + b.title), sharedCount: n.sharedCount, shared: Object.keys(n.shared).slice(0, 50), sections: n.sections, peers: n.peers }, null, 2); } },
];

// ---------- resources ----------
async function listResources() {
  const out = [];
  for (const b of await allBrains()) out.push({ uri: `mindblown://${new URL(b.host).hostname}/${b.id}`, name: b.title, description: `${b.counts.pages} neurons, ${b.counts.synapses} synapses`, mimeType: 'application/json' });
  return out;
}
async function readResource(uri) {
  const m = /^mindblown:\/\/([^/]+)\/([^/]+)(?:\/pages\/(.+))?$/.exec(uri);
  if (!m) throw new Error('bad resource uri ' + uri);
  const { brain } = await findBrain(m[1] + '/' + m[2]);
  const doc = m[3] ? await brain.page(decodeURIComponent(m[3])) : await brain.info();
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(doc, null, 2) }] };
}

// ---------- JSON-RPC over stdio ----------
const serverInfo = { name: 'mindblown-brain', version: '1.0.0' };
const capabilities = { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } };
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

async function handle(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined) return;   // notifications (notifications/initialized, notifications/cancelled …)
  try {
    switch (method) {
      case 'initialize': { const v = SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0]; return ok(id, { protocolVersion: v, capabilities, serverInfo, instructions: `MindBlown brains reachable: ${HOSTS.join(', ')}. Start with list_brains, then search / get_page. Facts carry their sources; quote them.` }); }
      case 'server/discover': return ok(id, { protocolVersions: SUPPORTED, serverInfo, capabilities });
      case 'ping': return ok(id, {});
      case 'tools/list': return ok(id, { tools: TOOLS.map(({ run, ...t }) => t) });
      case 'tools/call': { const t = TOOLS.find(x => x.name === params.name); if (!t) return fail(id, -32602, 'unknown tool ' + params.name);
        try { const text = await t.run(params.arguments || {}); return ok(id, { content: [{ type: 'text', text: String(text) }], isError: false }); }
        catch (e) { return ok(id, { content: [{ type: 'text', text: 'error: ' + e.message }], isError: true }); } }
      case 'resources/list': return ok(id, { resources: await listResources() });
      case 'resources/templates/list': return ok(id, { resourceTemplates: [{ uriTemplate: 'mindblown://{host}/{brain}/pages/{pageId}', name: 'MindBlown neuron', mimeType: 'application/json' }] });
      case 'resources/read': return ok(id, await readResource(params.uri));
      case 'prompts/list': return ok(id, { prompts: [] });
      default: return fail(id, -32601, 'method not found: ' + method);
    }
  } catch (e) { return fail(id, -32603, e.message); }
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  line = line.trim(); if (!line) return;
  let msg; try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'parse error'); }
  (Array.isArray(msg) ? msg : [msg]).forEach(m => { handle(m).catch(e => log('unhandled', e.message)); });
});
process.stdin.on('end', () => process.exit(0));
log('ready; hosts:', HOSTS.join(', '));
