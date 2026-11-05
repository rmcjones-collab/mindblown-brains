# MindBlown Brain API — protocol `mindblown-brain/1`

Every MindBlown brain can have an API. A brain is a zoomable knowledge network: **lobes** contain **neurons** (pages),
neurons unfold into **synapses** (cited facts) and **sources**; several brains on one host form a **network** that may
share neuron ids and point at **peer** hosts. This protocol exposes all of that as plain JSON documents that any static
host can serve, so brains and networks can connect to outside apps: scripts, dashboards, automations, feed readers,
graph tools and AI assistants.

It is read-only by design. Writing into a brain goes through the routes a brain's manifest names (see *Writing back*).

## 1. Discovery

A host publishes one discovery document at both of these paths (identical content; the second exists for hosts that
hide dot-directories):

```
GET /.well-known/mindblown.json
GET /api/index.json
```

```json
{
  "protocol": "mindblown-brain/1",
  "host": "https://mindblown.pplx.app",
  "title": "MindBlown demo",
  "generated": "2026-11-03T02:50:00Z",
  "brains": [
    { "id": "projects", "title": "Projects", "short": "Projects", "color": "#ff8a3d", "href": "index.html",
      "viewer": "https://mindblown.pplx.app/index.html", "api": "https://mindblown.pplx.app/api/projects/v1/",
      "counts": { "lobes": 10, "pages": 70, "neurons": 55, "subNeurons": 15, "synapses": 616, "sources": 94, "links": 390, "synLinks": 265, "cocite": 406 },
      "fictional": true, "hash": "…sha256 of the dataset…" }
  ],
  "network": { "id": "demo", "title": "MindBlown demo", "api": "https://mindblown.pplx.app/api/network/v1/", "brains": 3, "shared": 2 },
  "peers": ["https://deepanswers.pplx.app", "https://hubbrain.pplx.app"],
  "explorer": "https://mindblown.pplx.app/api/",
  "sdk": { "js": ".../api/sdk/mindblown-brain.js", "python": ".../api/sdk/mindblown_brain.py", "mcp": ".../api/sdk/mindblown-mcp.mjs" },
  "transports": ["json", "script"]
}
```

`network` is `null` on a single-brain host. `peers` are other MindBlown hosts; each has the same discovery document, so
a client can walk from site to site. A brain `id` matches `^[a-z0-9][a-z0-9_-]{0,40}$`; `network`, `sdk` and `index`
are reserved.

## 2. Brain documents

All paths are relative to a brain's `api` root, `https://<host>/api/<brain>/v1/`.

| Document | Holds |
| --- | --- |
| `brain.json` | Manifest: `title`, `subtitle`, `viewer`, `fictional`, `built`, `generated`, `center`, `counts`, `hash`, `lobes`, `endpoints`, `deepLink`, `network`, `write`, `license`, `sizes`. |
| `lobes.json` | `{center, lobes: [{id, name, color, hidden}]}`. |
| `pages.json` | `{count, pages: [PageSummary]}` — every neuron and sub-neuron: `id, title, type, lobe, parent, desc, created, updated, synapses, sources, children, links` (counts), `url` (viewer deep link), `api` (host-relative path of its document). |
| `pages/<encId>.json` | `{page, url, parent, children, synapses, sources, neighbours: {out, in, synapsesIn, cocite}}` — one neuron with everything inline. |
| `synapses.json` | `{count, synapses: [{id, page, lead, text, section, links, cites}]}`. |
| `sources.json` | `{count, sources: [{id, label, kind, pages}]}`; `id` is a URL or URI (`pplx://sessions/…`, `https://…`). |
| `links.json` | `{links: [{s, t, w, kinds, notes}], synLinks: [{s, t}], cocite: [{s, t, w}]}`. |
| `graph.json` | [JSON Graph Format](https://jsongraphformat.info/): `graph.nodes` keyed by id with `label` + `metadata`, `graph.edges` with `relation` ∈ `in-lobe · part-of · link · synapse-link · co-cited`. Lobes appear as `lobe:<id>` nodes. |
| `search.json` | `{v: 1, pages: [id…], index: {token: [[pageIndex, score]…]}}` — page-level inverted index; see §5 for the ranking the clients use. |
| `feed.json` | [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/): the 100 most recently updated neurons, `content_text` = description plus first three facts, `external_url` = the page document. |
| `data.json` | The full dataset in the shared MindBlown contract (`lobes, center, pages, synapses, sources, links, synLinks, cocite` plus `title, subtitle, built, demo, dayName`). This is what the viewer itself loads. |
| `openapi.json` | OpenAPI 3.1 for these paths, `servers[0].url` set to this brain's root. |

Every document carries `protocol` and `brain` so a consumer can tell documents apart when it holds several.

### Page id encoding

Page ids contain `/` (`projects/tidewatch`, `shared/brain/computer`). In a path, keep `[A-Za-z0-9._-]` and turn every
other UTF-8 byte into `~hh`: `projects/tidewatch` → `pages/projects~2ftidewatch.json`. `pages.json` already lists the
ready-made `api` path of every page, so clients rarely encode anything themselves. (Percent-encoding is avoided
because static hosts decode `%2F` into a directory separator.)

### Content hash

`brain.json.hash` is the SHA-256 of the canonical dataset (sorted keys, no whitespace). It changes exactly when the
brain's content changes, which gives pollers a one-request change check.

## 3. Network documents

When a host carries more than one brain (or ships a `network-data.js`), it also serves:

```
/api/network/v1/network.json   {id, title, host, brains: [...as in discovery...], sections, sharedCount, shared, registry, peers, compose}
/api/network/v1/shared.json    {count, shared: {pageId: [brainId…]}, registry: {pageId: {title, type, desc}}}
```

`shared` maps a neuron id to every brain on the host that holds it (the AI Hub convention `shared/…` and Deep Answers'
cross-brain registry both surface here). `compose.hash` documents the viewer's `#net=` composition hash for pages that
ship the Networks panel.

## 4. Transports

**JSON** — `GET` any document. Servers, command-line tools, MCP servers and same-origin pages use this.

**Script** — every `X.json` has an `X.js` twin:

```js
;(function(p){var w=typeof window!=='undefined'?window:globalThis;(w.MINDBLOWN_API_Q=w.MINDBLOWN_API_Q||[]).push(p);
if(w.MINDBLOWN_API&&typeof w.MINDBLOWN_API.receive==='function')w.MINDBLOWN_API.receive(p);})({"protocol":"mindblown-brain/1","brain":"projects","endpoint":"pages","data":{…}});
```

A page on another origin loads the twin with a `<script>` tag and receives the document in
`window.MINDBLOWN_API.receive({protocol, brain, endpoint, data})`; if the receiver is not installed yet the payload waits
in `window.MINDBLOWN_API_Q`. This is how browsers read brains on hosts that send no `Access-Control-Allow-Origin`
header (pplx.app hosting today). The JavaScript client tries `fetch` first and falls back to the twin on a network/CORS
failure; a 404 is never retried. `endpoint` values: `index, brain, lobes, pages, page, synapses, sources, links, graph,
search, feed, data, openapi, network, shared`.

Hosts that do send CORS headers need nothing extra; the twins are simply unused.

## 5. Search ranking (what the clients do)

Tokens are lower-cased runs of `[a-z0-9]`, length > 1, minus a short stop list. At build time each page's score for a
token is the sum of `title 6 · lead 3 · desc 2 · text 1 · type/id 1` over the page and its synapses. A query sums the
scores of its exact tokens (a prefix match on a token without an exact hit counts half) and multiplies by
`1 + 0.75 × (distinct query tokens matched − 1)`, so pages matching several words rise. Results carry `terms` so a
consumer can explain a hit. Clients may implement a different ranking over the same index.

## 6. Writing back

The documents above never change through this API. A brain's manifest may name how outside apps contribute:

```json
"write": {
  "hub":   { "protocol": "mindblown-ai/1", "manifest": "https://hubbrain.pplx.app/protocol.json", "brain": "computer" },
  "build": { "import": "https://mindblown.pplx.app/build.html", "format": "mindblown.json" },
  "inbox": { "url": "https://…/inbox", "method": "POST", "auth": "bearer" }
}
```

- `hub` — the brain is mirrored on the AI Hub, where registered agents publish brains, register shared ids and propose
  cross-brain links (owner acceptance applies). Agent keys never appear in any API document.
- `build` — a local Build-module brain that imports `.mindblown.json` files; nothing is uploaded anywhere.
- `inbox` — an optional owner-run webhook. The protocol defines the slot, not the service.

`write` is `null` for read-only publications.

## 7. Privacy and publication

The API publishes exactly what the brain's data file already publishes, nothing more: a private preview's API is as
private as its host. Generating the API does not change a site's visibility. Public brains must be sanitised before
their data file is published, and that holds for the API too, because `data.json` is the data file.

## 8. Generating

`build_api.py` (standard library only) reads the `window.MINDBLOWN = {…}` data files a site already ships, plus an
optional `window.MINDBLOWN_NETWORK`, and writes the tree above next to them. Configure with `api.config.json`:

```json
{
  "host": "https://mindblown.pplx.app",
  "title": "MindBlown demo",
  "network": { "id": "demo", "title": "MindBlown demo" },
  "brains": [
    { "id": "projects", "data": "data.js", "href": "index.html", "title": "Projects", "color": "#ff8a3d", "fictional": true },
    { "id": "life", "data": "life-data.js", "href": "life.html", "title": "Life", "color": "#4ade80", "fictional": true }
  ],
  "peers": ["https://deepanswers.pplx.app", "https://hubbrain.pplx.app"],
  "license": "CC BY 4.0"
}
```

Run `python3 build_api.py` after the site's data builders; commit `api/` and `.well-known/` with the data files they
describe. Validate with `node tools/qa-api.cjs <root>`.

## 9. Versioning

The protocol string is `mindblown-brain/1`; path segment `v1`. Additive fields do not bump the version. Renaming or
removing a field, changing the id encoding, or changing the script wrapper would produce `mindblown-brain/2` under
`/api/<brain>/v2/`, served alongside `v1`.
