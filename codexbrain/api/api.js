/* MindBlown Brain API explorer: reads this host's discovery document and lets a visitor call every endpoint. Same origin, so plain fetch. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const origin = location.origin + location.pathname.replace(/\/api\/.*$/, '');   // host root as served (works for subpath previews too)
  const mb = MindBlownAPI.host(origin, { transport: 'json' });
  const rel = u => typeof u === 'string' && u.startsWith(origin) ? u.slice(origin.length) : (() => { try { return new URL(u).pathname; } catch { return u; } })();
  const fmtKB = n => n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const EP = [
    ['brain.json', 'Manifest: title, counts, lobes, endpoints, content hash, network membership, optional write route.', 'brain'],
    ['lobes.json', 'The lobes (clusters) and the centre page.', 'lobes'],
    ['pages.json', 'Every neuron and sub-neuron as a summary: type, lobe, parent, counts, viewer deep link, document path.', 'pages'],
    ['pages/{id}.json', 'One neuron with its synapses, sources, parent, children and neighbours inline.', 'page'],
    ['synapses.json', 'Every cited fact: lead, text, section, links and cites.', 'synapses'],
    ['sources.json', 'Every source (sessions, repositories, web, papers…) and the pages that cite it.', 'sources'],
    ['links.json', 'Page↔page links with kinds and notes, synapse→page links, co-citation pairs.', 'links'],
    ['graph.json', 'The brain as JSON Graph Format: nodes keyed by id, typed edges (in-lobe, part-of, link, synapse-link, co-cited).', 'graph'],
    ['search.json', 'Inverted index (token → [page, score]) used by the clients\' search().', 'search'],
    ['feed.json', 'JSON Feed 1.1 of recently updated neurons for pollers, automations and feed readers.', 'feed'],
    ['data.json', 'The whole dataset in the shared MindBlown contract (what the viewer itself loads).', 'data'],
    ['openapi.json', 'The OpenAPI 3.1 contract with this brain\'s server URL filled in.', 'openapi'],
  ];
  let disc = null, brains = [], current = null, pagesCache = new Map();

  function highlight(json) {
    return esc(json).replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, m => {
      if (/^"/.test(m)) return /:$/.test(m) ? '<span class="k">' + m + '</span>' : '<span class="s">' + m + '</span>';
      if (/true|false|null/.test(m)) return '<span class="b">' + m + '</span>';
      return '<span class="n">' + m + '</span>';
    });
  }
  function showJSON(obj, url) {
    const text = JSON.stringify(obj, null, 2);
    const cut = text.length > 60000 ? text.slice(0, 60000) + '\n… (' + fmtKB(text.length) + ' total; open raw for everything)' : text;
    $('#r-body').innerHTML = highlight(cut);
    $('#r-body').dataset.full = text;
    $('#r-url').textContent = rel(url);
  }
  const copyBtn = (btn, text) => navigator.clipboard.writeText(text).then(() => { btn.classList.add('done'); btn.textContent = 'copied'; setTimeout(() => { btn.classList.remove('done'); btn.textContent = 'copy'; }, 1400); }).catch(() => {});

  // ---------- render host ----------
  function renderHost() {
    const total = k => brains.reduce((a, b) => a + (b.counts[k] || 0), 0);
    $('#host-title').textContent = 'Brain API · ' + (disc.title || new URL(origin).hostname);
    document.title = 'Brain API · ' + (disc.title || 'MindBlown');
    $('#host-stats').innerHTML = [[brains.length, brains.length === 1 ? 'brain' : 'brains'], [total('pages'), 'neurons'], [total('synapses'), 'synapses'], [total('sources'), 'sources'], [disc.network ? disc.network.shared : 0, 'shared ids']]
      .map(([n, l]) => `<div class="st"><span class="n">${n.toLocaleString()}</span><span class="l">${l}</span></div>`).join('');
    $('#brain-nav').innerHTML = brains.map(b => `<a href="${esc(b.href)}" title="Open the ${esc(b.title)} brain"><span class="sw" style="background:${esc(b.color || '#ff8a3d')}"></span>${esc(b.short || b.title)}</a>`).join('')
      + (disc.network ? `<a href="${esc(disc.network.api)}network.json" title="Network manifest">network ↗</a>` : '');
    $('#brain-grid').innerHTML = brains.map(b => `<article class="card" style="--c:${esc(b.color || '#ff8a3d')}">
      <h3>${esc(b.title)}${b.fictional ? '<span class="fic">fictional</span>' : ''}</h3>
      <div class="counts"><b>${b.counts.pages}</b> neurons · <b>${b.counts.synapses}</b> synapses · <b>${b.counts.sources}</b> sources · <b>${b.counts.links}</b> links</div>
      <div class="paths"><a href="${esc(b.api)}brain.json">${esc(rel(b.api))}brain.json</a><a href="${esc(b.api)}pages.json">${esc(rel(b.api))}pages.json</a><a href="${esc(b.api)}feed.json">${esc(rel(b.api))}feed.json</a></div>
      <a class="open" href="${esc(b.viewer)}">open the brain ↗</a></article>`).join('')
      + (disc.network ? `<article class="card" style="--c:#a7b2cc"><h3>Network</h3><div class="counts"><b>${disc.network.brains}</b> brains · <b>${disc.network.shared}</b> shared neuron ids${disc.peers && disc.peers.length ? ' · <b>' + disc.peers.length + '</b> peer hosts' : ''}</div>
        <div class="paths"><a href="${esc(disc.network.api)}network.json">${esc(rel(disc.network.api))}network.json</a><a href="${esc(disc.network.api)}shared.json">${esc(rel(disc.network.api))}shared.json</a><a href="${esc(disc.network.api)}network.json">peers: ${esc((disc.peers || []).map(p => p.replace(/^https?:\/\//, '')).join(', ') || 'none')}</a></div><a class="open" href="${esc(disc.network.api)}network.json">open the network manifest ↗</a></article>` : '');
    $('#foot-gen').textContent = `${disc.protocol} · generated ${disc.generated} by ${disc.generator || 'build_api.py'} · host ${disc.host}`;
    $('#disc-link').href = origin + '/.well-known/mindblown.json';
    // try-it controls
    $('#t-brain').innerHTML = brains.map(b => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('') + (disc.network ? '<option value="@network">Network</option>' : '');
    setEndpoints();
    renderSnippet('curl');
    runTry();
  }
  function setEndpoints() {
    const sel = $('#t-brain').value;
    const opts = sel === '@network' ? [['network.json', 'Network manifest'], ['shared.json', 'Shared neuron ids']] : EP.map(e => [e[0], e[0]]).concat([['@search', 'search (client-side, via the SDK)']]);
    $('#t-endpoint').innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    onEndpoint();
    renderTable();
  }
  function renderTable() {
    const b = brains.find(x => x.id === $('#t-brain').value) || brains[0];
    const p = rel(b.api);
    fetch(b.api + 'brain.json').then(r => r.json()).then(m => {
      $('#ep-table').innerHTML = EP.map(([f, d, key]) => `<tr><td><a href="${esc(b.api + (f.includes('{') ? 'pages.json' : f))}"><code>${esc(p + f)}</code></a></td><td>${esc(d)}</td><td>${f.includes('{') ? 'per page' : fmtKB(m.sizes && m.sizes[key])}</td></tr>`).join('');
      $('#openapi-link').href = b.api + 'openapi.json';
    }).catch(() => {});
  }
  function onEndpoint() {
    const e = $('#t-endpoint').value;
    $('#t-page-wrap').hidden = e !== 'pages/{id}.json';
    $('#t-query-wrap').hidden = e !== '@search';
    if (e === 'pages/{id}.json') loadPages();
    updateOpen();
  }
  async function loadPages() {
    const id = $('#t-brain').value;
    if (!pagesCache.has(id)) pagesCache.set(id, (await mb.brain(id)).pages());
    const ps = await pagesCache.get(id);
    $('#t-pages').innerHTML = ps.slice(0, 400).map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
    if (!$('#t-page').value) $('#t-page').value = ps[0].id;
    updateOpen();
  }
  function targetURL() {
    const bid = $('#t-brain').value, e = $('#t-endpoint').value;
    if (bid === '@network') return disc.network.api + e;
    const b = brains.find(x => x.id === bid);
    if (e === '@search') return b.api + 'search.json';
    if (e === 'pages/{id}.json') return b.api + 'pages/' + MindBlownAPI.encId($('#t-page').value || '') + '.json';
    return b.api + e;
  }
  function updateOpen() { try { $('#t-open').href = targetURL(); } catch (e) { /* not ready */ } }
  async function runTry(ev) {
    if (ev) ev.preventDefault();
    const url = targetURL(); updateOpen();
    const t0 = performance.now();
    $('#t-meta').textContent = '…';
    try {
      if ($('#t-endpoint').value === '@search') {
        const b = await mb.brain($('#t-brain').value);
        const q = $('#t-query').value.trim() || 'brain';
        const hits = await b.search(q, { limit: 12 });
        $('#r-url').textContent = `search("${q}") over ${rel(url)}`;
        $('#r-body').innerHTML = hits.length ? '<ul class="hits">' + hits.map(h => `<li><span class="sc">${h.score.toFixed(1)}</span><span><a class="t" href="${esc(h.page.url)}">${esc(h.page.title)}</a><span class="d">${esc(h.page.id)} · ${h.page.synapses} synapses · matched ${esc(h.terms.join(', '))}</span></span></li>`).join('') + '</ul>' : 'no matches';
        $('#r-body').dataset.full = JSON.stringify(hits, null, 2);
      } else {
        const r = await fetch(url, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const text = await r.text();
        showJSON(JSON.parse(text), rel(url));
        $('#t-meta').textContent = `${fmtKB(text.length)} · ${Math.round(performance.now() - t0)} ms`;
        return;
      }
      $('#t-meta').textContent = `${Math.round(performance.now() - t0)} ms`;
    } catch (e) {
      $('#r-url').textContent = rel(url);
      $('#r-body').innerHTML = `<span class="err">${esc(e.message)}</span>`;
      $('#t-meta').textContent = '';
    }
  }

  // ---------- snippets ----------
  function renderSnippet(tab) {
    const b = brains.find(x => x.id === $('#t-brain').value) || brains[0];
    const api = b.api, host = disc.servedFrom || disc.host, pid = (b.center || 'projects/example');
    const S = {
      curl: `# discovery: every brain on this host\ncurl -s ${host}/.well-known/mindblown.json | jq '.brains[] | {id, title, counts}'\n\n# one brain\ncurl -s ${api}brain.json | jq '{title, counts, hash}'\ncurl -s ${api}pages.json | jq '.pages[:5]'\ncurl -s ${api}synapses.json | jq '.synapses | length'\n\n# one neuron (pages.json lists each page's ready-made "api" path)\ncurl -s ${api}pages/${MindBlownAPI.encId(pid)}.json | jq '.synapses[:3]'\n\n# JSON Feed of recently updated neurons\ncurl -s ${api}feed.json | jq '.items[:3] | map({title, date_modified})'`,
      js: `// browser or Node 18+: ${host}/api/sdk/mindblown-brain.js  (UMD: window.MindBlownAPI / require)\n<script src="${host}/api/sdk/mindblown-brain.js"><\/script>\n<script>\nconst mb = MindBlownAPI.host('${host}');\nconst brain = await mb.brain('${b.id}');\n\nconst hits = await brain.search('${(b.title || '').split(' ')[0].toLowerCase()}');          // [{page, score, terms}]\nconst page = await brain.page(hits[0].page.id);           // synapses, sources, neighbours inline\nconsole.log(page.page.title, page.synapses.length, 'facts');\n\nconst graph = await brain.graph();                        // JSON Graph Format for D3 / Cytoscape / vis\nconst net = await mb.network();                           // shared ids + peers, or null\n// Cross-origin without CORS? The client falls back to the .js twin of each document automatically.\n<\/script>`,
      py: `# python3 -m pip install nothing — standard library only. Save ${host}/api/sdk/mindblown_brain.py next to your script.\nfrom mindblown_brain import Host\n\nmb = Host('${host}')\nfor b in mb.brains():\n    print(b['id'], b['counts']['pages'], 'neurons')\n\nbrain = mb.brain('${b.id}')\nfor hit in brain.search('${(b.title || '').split(' ')[0].toLowerCase()}', limit=5):\n    print(round(hit['score'], 1), hit['page']['title'], hit['page']['url'])\n\npage = brain.page('${pid}')\nfor s in page['synapses'][:3]:\n    print('-', s['lead'], '—', s['text'], s['cites'])\n\nnet = mb.network()            # None for a single-brain host\nfor peer in mb.peers():       # other MindBlown hosts this one points at\n    print(peer.origin, [b['id'] for b in peer.brains()])`,
      mcp: `// Give an AI assistant (Claude Desktop, Cursor, Zed, any MCP host) direct access to these brains.\n// 1. Save ${host}/api/sdk/mindblown-mcp.mjs and ${host}/api/sdk/mindblown-brain.js in one folder (Node 18+).\n// 2. Add the server to the host's MCP config:\n{\n  "mcpServers": {\n    "mindblown": {\n      "command": "node",\n      "args": ["/path/to/mindblown-mcp.mjs", "${host}"${(disc.peers || []).slice(0, 2).map(p => `, "${p}"`).join('')}]\n    }\n  }\n}\n// Tools: list_brains, get_brain, list_pages, get_page, search, neighbours, facts, random_synapse, network\n// Resources: mindblown://${new URL(host).hostname}/${b.id}/pages/<page id>\n// Every fact arrives with its sources, so the assistant can cite them.`,
      feed: `# Any JSON Feed reader, Zapier / Make / n8n / IFTTT "poll a URL" step, or a cron job can watch a brain.\n${api}feed.json           # JSON Feed 1.1: most recently updated neurons, with their first facts\n${api}brain.json          # .hash changes whenever the brain's content changes → cheap change detection\n\n# shell example: notify when the brain changes\nold=$(cat .mindblown-hash 2>/dev/null)\nnew=$(curl -s ${api}brain.json | jq -r .hash)\n[ "$old" != "$new" ] && echo "${b.title} changed" && echo "$new" > .mindblown-hash\n\n# Webhook-style: Pipedream / Discord bot — fetch feed.json on a schedule, post new items[].title + items[].url`,
      graph: `# graph.json is JSON Graph Format: nodes keyed by id with metadata, edges with a relation.\n#   relations: in-lobe · part-of · link · synapse-link · co-cited\n\n# Python → networkx\nimport json, urllib.request, networkx as nx\ng = json.load(urllib.request.urlopen('${api}graph.json'))['graph']\nG = nx.DiGraph()\nfor nid, n in g['nodes'].items(): G.add_node(nid, **n.get('metadata', {}), label=n['label'])\nfor e in g['edges']: G.add_edge(e['source'], e['target'], relation=e['relation'])\nprint(nx.pagerank(G))\n\n# Cytoscape.js\n// elements = [...Object.entries(g.nodes).map(([id, n]) => ({ data: { id, label: n.label, ...n.metadata } })),\n//             ...g.edges.map(e => ({ data: { source: e.source, target: e.target, relation: e.relation } }))]\n\n# Gephi / Obsidian / Neo4j: import nodes + edges as CSV from the same document, or load data.json for the raw contract.`,
    };
    $('#snippet').textContent = S[tab] || '';
    document.querySelectorAll('#tabs button').forEach(bt => bt.setAttribute('aria-selected', String(bt.dataset.tab === tab)));
    $('#snippet').dataset.tab = tab;
  }

  // ---------- wire up ----------
  $('#try-form').addEventListener('submit', runTry);
  $('#t-brain').addEventListener('change', () => { setEndpoints(); renderSnippet($('#snippet').dataset.tab || 'curl'); runTry(); });
  $('#t-endpoint').addEventListener('change', () => { onEndpoint(); if ($('#t-endpoint').value !== 'pages/{id}.json' && $('#t-endpoint').value !== '@search') runTry(); });
  $('#t-page').addEventListener('input', updateOpen);
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) renderSnippet(b.dataset.tab); });
  $('#r-copy').addEventListener('click', e => copyBtn(e.target, $('#r-body').dataset.full || $('#r-body').textContent));
  $('#s-copy').addEventListener('click', e => copyBtn(e.target, $('#snippet').textContent));

  mb.discover().then(d => { disc = d; brains = d.brains; renderHost(); }).catch(e => {
    $('#r-body').innerHTML = `<span class="err">Could not read the discovery document (${esc(e.message)}). Run build_api.py on this site first.</span>`;
  });
})();
