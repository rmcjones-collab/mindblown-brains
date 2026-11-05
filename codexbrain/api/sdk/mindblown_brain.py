"""MindBlown Brain API client — protocol mindblown-brain/1. Standard library only (Python 3.8+).

    from mindblown_brain import Host
    mb = Host('https://mindblown.pplx.app')
    for b in mb.brains(): print(b['id'], b['counts'])
    brain = mb.brain('projects')
    for hit in brain.search('tide gates'): print(hit['score'], hit['page']['title'])
    page = brain.page('projects/tidewatch')          # synapses, sources, neighbours inline
    net = mb.network()                               # shared ids, sections, peers (None for a single-brain host)

Servers and command-line tools can read every document directly: static hosts need no key. Documents are cached per Host.
"""
import json, re, sys, urllib.request, urllib.parse

PROTOCOL = 'mindblown-brain/1'
_SAFE = re.compile(r'[A-Za-z0-9._-]')
_STOP = set('a an and are as at be by for from has have in into is it its of on or that the this to was were will with your you we our they their not but if then than so can may also any all each more most such only own same very'.split())


def enc_id(pid):
    out = []
    for ch in pid:
        out.append(ch if _SAFE.match(ch) else ''.join('~%02x' % b for b in ch.encode('utf-8')))
    return ''.join(out)


def tokens(text):
    return [t for t in re.split(r'[^a-z0-9]+', (text or '').lower()) if len(t) > 1 and t not in _STOP]


def _join(base, rel):
    if re.match(r'https?:', rel):
        return rel
    return base.rstrip('/') + '/' + rel.lstrip('/')


class Client:
    def __init__(self, timeout=20, user_agent='mindblown-brain-py/1.0'):
        self.timeout, self.ua, self.cache = timeout, user_agent, {}

    def get(self, url):
        if url in self.cache:
            return self.cache[url]
        req = urllib.request.Request(url, headers={'accept': 'application/json', 'user-agent': self.ua})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            doc = json.loads(r.read().decode('utf-8'))
        self.cache[url] = doc
        return doc


class Brain:
    def __init__(self, client, manifest_or_api):
        self.client = client
        if isinstance(manifest_or_api, str):
            self.api, self.manifest, self.id = manifest_or_api.rstrip('/') + '/', None, None
        else:
            self.manifest, self.api, self.id = manifest_or_api, manifest_or_api['api'].rstrip('/') + '/', manifest_or_api['id']

    def _doc(self, name):
        return self.client.get(_join(self.api, name))

    def info(self):
        if not self.manifest or 'endpoints' not in self.manifest:
            self.manifest = self._doc('brain.json'); self.id = self.manifest['id']
        return self.manifest

    def lobes(self): return self._doc('lobes.json')['lobes']
    def pages(self): return self._doc('pages.json')['pages']
    def synapses(self): return self._doc('synapses.json')['synapses']
    def sources(self): return self._doc('sources.json')['sources']
    def links(self): return self._doc('links.json')
    def graph(self): return self._doc('graph.json')['graph']
    def feed(self): return self._doc('feed.json')
    def data(self): return self._doc('data.json')
    def openapi(self): return self._doc('openapi.json')

    def page(self, pid):
        return self.client.get(_join(self.api, 'pages/' + enc_id(pid) + '.json'))

    def neighbours(self, pid): return self.page(pid)['neighbours']
    def children(self, pid): return self.page(pid)['children']

    def search(self, query, limit=10):
        """Ranked pages for a query: [{'page': summary, 'score': float, 'terms': [...]}]."""
        idx, pages = self._doc('search.json'), {p['id']: p for p in self.pages()}
        q = tokens(query)
        if not q:
            return []
        score, hit = {}, {}
        for t in q:
            exact = idx['index'].get(t, [])
            prefix = [] if exact else [[i, s * 0.5] for k in list(idx['index']) if k.startswith(t) and k != t for i, s in idx['index'][k]][:200]
            for i, s in exact + prefix:
                score[i] = score.get(i, 0) + s
                hit.setdefault(i, set()).add(t)
        out = []
        for i, s in score.items():
            p = pages.get(idx['pages'][i])
            if p:
                out.append({'page': p, 'score': s * (1 + (len(hit[i]) - 1) * 0.75), 'terms': sorted(hit[i])})
        out.sort(key=lambda h: -h['score'])
        return out[:limit]

    def facts(self, pid, query=None):
        """Synapses of a page, optionally only those mentioning a query token."""
        doc = self.page(pid)
        q = set(tokens(query or ''))
        if not q:
            return doc['synapses']
        return [s for s in doc['synapses'] if q & set(tokens((s.get('lead') or '') + ' ' + (s.get('text') or '')))]


class Host:
    def __init__(self, origin, client=None):
        self.origin, self.client, self._disc = origin.rstrip('/'), client or Client(), None

    def discover(self):
        if self._disc is None:
            try:
                d = self.client.get(self.origin + '/.well-known/mindblown.json')
            except Exception:
                d = self.client.get(self.origin + '/api/index.json')
            self._disc = self._rebase(d)
        return self._disc

    def _rebase(self, d):
        """A mirror or preview serves the same tree under another origin: point absolute URLs at the origin we read from."""
        src = (d.get('host') or '').rstrip('/')
        if not src or src == self.origin:
            return d
        fix = lambda u: self.origin + u[len(src):] if isinstance(u, str) and u.startswith(src + '/') else u
        d = json.loads(json.dumps(d))
        d['brains'] = [dict(b, api=fix(b.get('api')), viewer=fix(b.get('viewer'))) for b in d.get('brains', [])]
        if d.get('network'):
            d['network']['api'] = fix(d['network']['api'])
        d['explorer'] = fix(d.get('explorer'))
        d['servedFrom'] = self.origin
        return d

    def brains(self): return self.discover()['brains']

    def brain(self, bid):
        for b in self.brains():
            if b['id'] == bid:
                return Brain(self.client, b)
        raise KeyError('no brain %r on %s' % (bid, self.origin))

    def network(self):
        d = self.discover()
        return self.client.get(_join(d['network']['api'], 'network.json')) if d.get('network') else None

    def shared(self):
        d = self.discover()
        return self.client.get(_join(d['network']['api'], 'shared.json'))['shared'] if d.get('network') else {}

    def peers(self):
        return [Host(h, self.client) for h in self.discover().get('peers', [])]

    def search_all(self, query, limit=10):
        hits = []
        for b in self.brains():
            for h in Brain(self.client, b).search(query, limit):
                h['brain'] = b['id']; hits.append(h)
        hits.sort(key=lambda h: -h['score'])
        return hits[:limit]


if __name__ == '__main__':   # python3 mindblown_brain.py https://mindblown.pplx.app [query]
    host = Host(sys.argv[1] if len(sys.argv) > 1 else 'https://mindblown.pplx.app')
    d = host.discover()
    print(d['title'], '·', len(d['brains']), 'brains')
    for b in d['brains']:
        c = b['counts']; print('  %-14s %4d neurons %5d synapses  %s' % (b['id'], c['pages'], c['synapses'], b['viewer']))
    if len(sys.argv) > 2:
        for h in host.search_all(' '.join(sys.argv[2:])):
            print('%6.1f  %-12s %s' % (h['score'], h['brain'], h['page']['title']))
