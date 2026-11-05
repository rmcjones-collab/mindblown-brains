/*
 * Ask Deep Answers: model adapters (window.DeepAsk.models).
 *
 * Pure ES2020, no build step. The only external code is WebLLM, imported lazily
 * from a pinned CDN URL the first time a visitor actually runs the WebLLM adapter.
 *
 * Keys live in localStorage ('deepask.settings') and are sent only to the provider
 * they belong to, or to the local proxy when settings.proxyUrl is set. Nothing here
 * logs keys, prompts or responses.
 *
 * Endpoint shapes, header names and default model names were checked on 2026-11-03 against:
 *   Ollama        https://docs.ollama.com/api/tags
 *                 https://docs.ollama.com/api/chat
 *                 https://github.com/ollama/ollama/blob/main/docs/api.md
 *   WebLLM        https://webllm.mlc.ai/docs/user/get_started.html      (CDN import via esm.run)
 *                 https://webllm.mlc.ai/docs/user/basic_usage.html      (CreateMLCEngine, initProgressCallback, stream)
 *                 https://www.jsdelivr.com/package/npm/@mlc-ai/web-llm  (current version 0.2.87)
 *   OpenAI        https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
 *                 https://platform.openai.com/docs/guides/completions/  (gpt-5.6-terra as the lower-cost current model)
 *   Anthropic     https://platform.claude.com/docs/en/api/messages.md
 *                 https://platform.claude.com/docs/en/api/versioning    (anthropic-version header)
 *                 https://platform.claude.com/docs/en/about-claude/models/overview
 *                 https://github.com/anthropics/anthropic-sdk-typescript/pull/504 (anthropic-dangerous-direct-browser-access)
 *   Gemini        https://ai.google.dev/api                              (x-goog-api-key header)
 *                 https://ai.google.dev/api/generate-content             (streamGenerateContent?alt=sse)
 *                 https://ai.google.dev/gemini-api/docs/changelog        (gemini-3.8-flash GA)
 *   Kimi          https://platform.kimi.ai/docs/api/overview             (https://api.moonshot.ai/v1, OpenAI compatible)
 *                 https://platform.kimi.ai/docs/api/chat.md
 *                 https://platform.kimi.ai/docs/api/list-models.md
 *   Perplexity    https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview (POST /v1/agent; Sonar Pro = effort "fast")
 *                 https://docs.perplexity.ai/docs/agent-api/effort.md   (effort levels, or creator/model ids)
 *                 https://docs.perplexity.ai/docs/agent-api/output-control (stream: response.output_text.delta)
 *                 https://docs.perplexity.ai/docs/agent-api/prompt-guide (instructions replace the effort prompt)
 *   Browser CORS  https://cors.dev/guides/free-ai-api  (plus preflight checks of each endpoint on 2026-11-03:
 *                 all five hosted providers answered a localhost preflight with an allow-origin header)
 *
 * WebLLM status reporting: complete() accepts an optional onStatus({phase, text, progress}) callback
 * next to onToken. phase is 'loading' while the library and model weights download and compile
 * (progress is 0..1 when WebLLM reports it), then 'ready'. The same updates are also delivered to any
 * listener registered with DeepAsk.models.onStatus(fn), which returns an unsubscribe function, so the
 * UI can show download progress without changing its complete() call.
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const D = root.DeepAsk = root.DeepAsk || {};

  const STORAGE_KEY = 'deepask.settings';
  const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.87';
  const HOSTED = ['openai', 'anthropic', 'gemini', 'kimi', 'perplexity'];
  const DEFAULT_MODELS = {
    openai: 'gpt-5.6-terra',
    anthropic: 'claude-sonnet-5-5',
    gemini: 'gemini-3.8-flash',
    kimi: 'kimi-k3.1-pro-highspeed',
    perplexity: 'fast'
  };
  const DEFAULTS = {
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'gemma4',
    webllmModel: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    keys: {},
    models: {},
    proxyUrl: '',
    anthropicWorkspace: ''
  };
  const MAX_TOKENS = 1200;
  const AVAIL_TTL_MS = 60000;

  /* ---------- settings ---------- */

  let memoryStore = null; // used when localStorage is unavailable (private mode, tests)
  function storage() {
    try { if (root.localStorage) return root.localStorage; } catch (_) { /* blocked */ }
    return null;
  }
  function clean(obj) {
    const out = {};
    Object.keys(obj || {}).forEach(k => {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    });
    return out;
  }
  function readRaw() {
    const s = storage();
    let raw = null;
    try { raw = s ? s.getItem(STORAGE_KEY) : memoryStore; } catch (_) { raw = memoryStore; }
    if (!raw) return {};
    try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed : {}; }
    catch (_) { return {}; }
  }
  function writeRaw(obj) {
    const text = JSON.stringify(obj);
    const s = storage();
    try { if (s) { s.setItem(STORAGE_KEY, text); return; } } catch (_) { /* fall through */ }
    memoryStore = text;
  }
  function normalise(stored) {
    const out = Object.assign({}, DEFAULTS, stored);
    out.keys = clean(stored.keys);
    out.models = clean(stored.models);
    out.ollamaUrl = String(out.ollamaUrl || DEFAULTS.ollamaUrl).trim().replace(/\/+$/, '') || DEFAULTS.ollamaUrl;
    out.ollamaModel = String(out.ollamaModel || '').trim() || DEFAULTS.ollamaModel;
    out.webllmModel = String(out.webllmModel || '').trim() || DEFAULTS.webllmModel;
    out.proxyUrl = String(out.proxyUrl || '').trim().replace(/\/+$/, '');
    out.anthropicWorkspace = String(out.anthropicWorkspace || '').trim();
    out.webllmConsent = stored.webllmConsent === true;
    out.council = {};
    Object.keys(stored.council || {}).forEach(k => { if (typeof stored.council[k] === 'boolean') out.council[k] = stored.council[k]; });
    return out;
  }
  function isLocalUrl(url) {
    try {
      const u = new URL(url);
      return (u.protocol === 'http:' || u.protocol === 'https:') &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]');
    } catch (_) { return false; }
  }
  const settings = {
    get() { return normalise(readRaw()); },
    set(partial) {
      partial = partial || {};
      if (partial.proxyUrl && !isLocalUrl(String(partial.proxyUrl).trim())) {
        throw new Error('The proxy URL must point to localhost or 127.0.0.1, so keys never leave this machine.');
      }
      const current = readRaw();
      const next = Object.assign({}, current, partial);
      if (partial.keys) next.keys = clean(Object.assign({}, current.keys, partial.keys));
      // Hosted keys and WebLLM never share storage: the consent flag lives in the same localStorage every
      // tab reads, and a tab that has started WebLLM holds a Web Lock (see keysBlocked) until it closes.
      const hasKeys = Object.keys(clean(next.keys)).length > 0;
      if (hasKeys && next.webllmConsent === true) {
        throw new Error('Hosted keys and WebLLM cannot be stored together. Remove the keys or turn off WebLLM first.');
      }
      if (hasKeys && (webllm.locked || webllm.loading || webllm.lib)) {
        throw new Error('WebLLM has run in this tab, so keys cannot be saved here. Close this tab and open Ask in a new one.');
      }
      if (partial.models) next.models = clean(Object.assign({}, current.models, partial.models));
      if (partial.council) next.council = Object.assign({}, current.council, partial.council);
      writeRaw(next);
      availCache.clear();
      return normalise(next);
    },
    // Saves settings; when hosted keys are present the write runs under an exclusive, non-waiting
    // deepask-webllm lock, so no tab can start WebLLM between the check and the write.
    async setGuarded(partial) {
      const keys = clean(Object.assign({}, readRaw().keys, (partial || {}).keys));
      const locks = root.navigator && root.navigator.locks;
      if (!Object.keys(keys).length || !locks || !locks.request) return settings.set(partial);
      if (webllm.locked || webllm.loading || webllm.lib) throw new Error('WebLLM has run in this tab, so keys cannot be saved here. Close this tab and open Ask in a new one.');
      return locks.request(WEBLLM_LOCK, {mode: 'exclusive', ifAvailable: true}, lock => {
        if (!lock) throw new Error('Another Ask tab is running WebLLM. Close it before saving keys.');
        return settings.set(partial);
      });
    },
    // Resolves to a reason when any open tab of this site has started WebLLM, otherwise ''.
    async keysBlocked() {
      if (webllm.locked || webllm.loading || webllm.lib) return 'WebLLM has run in this tab, so keys cannot be saved here. Close this tab and open Ask in a new one.';
      const locks = root.navigator && root.navigator.locks;
      if (!locks || !locks.query) return '';
      try {
        const q = await locks.query();
        const busy = [...(q.held || []), ...(q.pending || [])].some(l => l.name === WEBLLM_LOCK);
        return busy ? 'Another Ask tab is running WebLLM. Close it before saving keys.' : '';
      } catch (_) { return ''; }
    },
    clear() {
      const s = storage();
      try { if (s) s.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
      memoryStore = null;
      availCache.clear();
      if (webllm.engine && webllm.engine.unload) { try { webllm.engine.unload(); } catch (_) { /* ignore */ } }
      webllm.engine = null; webllm.modelId = null; webllm.loading = null;
    },
    defaults: { models: Object.assign({}, DEFAULT_MODELS), ollamaModel: DEFAULTS.ollamaModel, webllmModel: DEFAULTS.webllmModel }
  };

  /* ---------- helpers ---------- */

  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
  const statusListeners = new Set();
  function emitStatus(cb, update) {
    if (typeof cb === 'function') { try { cb(update); } catch (_) { /* ignore */ } }
    statusListeners.forEach(fn => { try { fn(update); } catch (_) { /* ignore */ } });
  }

  // Availability results are cached briefly so the settings drawer and each question
  // do not repeat the same models-list call. The cache key never contains the key itself.
  const availCache = new Map();
  function fingerprint(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + str.length;
  }
  async function cached(id, secret, fn) {
    const k = id + '|' + fingerprint(secret || '');
    const hit = availCache.get(k);
    if (hit && now() - hit.t < AVAIL_TTL_MS) return hit.v;
    const v = await fn();
    // cache only successes, so a proxy or network that comes back is picked up on the next question
    if (v && v.ok) availCache.set(k, {t: now(), v});
    return v;
  }

  function timeoutSignal(ms, outer) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    if (outer) {
      if (outer.aborted) ctl.abort();
      else outer.addEventListener('abort', () => ctl.abort(), {once: true});
    }
    return {signal: ctl.signal, done: () => clearTimeout(timer)};
  }

  function networkReason(label, err) {
    if (err && err.name === 'AbortError') return `${label} did not answer in time.`;
    return `Could not reach ${label} from this page. The browser may be blocking it; the local proxy is an alternative.`;
  }

  async function errorFromResponse(label, res) {
    let detail = '';
    try {
      const body = await res.json();
      const e = body && (body.error || body);
      detail = (e && (e.message || e.detail || (typeof e === 'string' ? e : ''))) || '';
    } catch (_) { /* not JSON */ }
    detail = String(detail).replace(/\s+/g, ' ').slice(0, 240);
    let plain;
    if (res.status === 401 || res.status === 403) plain = `${label} did not accept the key. Check it in Settings.`;
    else if (res.status === 404) plain = `${label} could not find the model. Check the model name in Settings.`;
    else if (res.status === 429) plain = `${label} is rate limiting or out of credit. Try again later.`;
    else if (res.status >= 500) plain = `${label} had a server problem (status ${res.status}).`;
    else plain = `${label} rejected the request (status ${res.status}).`;
    const err = new Error(detail ? `${plain} ${detail}` : plain);
    err.status = res.status;
    return err;
  }

  // Reads a text/event-stream body and calls onEvent(dataString, eventName) for each event.
  async function readSSE(res, onEvent) {
    if (!res.body || !res.body.getReader) {
      const text = await res.text();
      parseSSEChunk(text + '\n\n', onEvent);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      buf += decoder.decode(value, {stream: true});
      buf = parseSSEChunk(buf, onEvent);
    }
    buf += decoder.decode();
    if (buf.trim()) parseSSEChunk(buf + '\n\n', onEvent);
  }
  function parseSSEChunk(buf, onEvent) {
    buf = buf.replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = '', data = [];
      block.split('\n').forEach(line => {
        if (line.startsWith(':')) return;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      });
      if (data.length) onEvent(data.join('\n'), event);
    }
    return buf;
  }

  // Reads newline-delimited JSON (Ollama streaming).
  async function readNDJSON(res, onObj) {
    const handle = line => { line = line.trim(); if (!line) return; try { onObj(JSON.parse(line)); } catch (_) { /* skip */ } };
    if (!res.body || !res.body.getReader) { (await res.text()).split('\n').forEach(handle); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      buf += decoder.decode(value, {stream: true});
      let i;
      while ((i = buf.indexOf('\n')) !== -1) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    handle(buf + decoder.decode());
  }

  /* ---------- proxy mode ---------- */

  async function proxyAvailable(id, label, proxyUrl) {
    return cached('proxy:' + id, proxyUrl, async () => {
      const t = timeoutSignal(4000);
      try {
        const res = await fetch(proxyUrl + '/v1/providers', {method: 'GET', signal: t.signal});
        if (!res.ok) return {ok: false, reason: `The local proxy answered with status ${res.status}.`};
        const body = await res.json();
        const set = body && (body.providers || body);
        return set && set[id] === true
          ? {ok: true}
          : {ok: false, reason: `The local proxy has no ${label} key. Set it in the proxy environment.`};
      } catch (err) {
        return {ok: false, reason: 'The local proxy is not running at ' + proxyUrl + '.'};
      } finally { t.done(); }
    });
  }

  async function proxyComplete(id, label, proxyUrl, model, {system, user, signal, onToken}) {
    const start = now();
    const t = timeoutSignal(180000, signal);
    let res;
    try {
      res = await fetch(`${proxyUrl}/v1/${id}/complete`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({system: system || '', user: user || '', model}),
        signal: t.signal
      });
    } catch (err) {
      t.done();
      if (signal && signal.aborted) throw err;
      throw new Error(err && err.name === 'AbortError' ? 'The local proxy did not answer in time.' : 'Could not reach the local proxy at ' + proxyUrl + '.');
    }
    try {
      let body = null;
      try { body = await res.json(); } catch (_) { /* not JSON */ }
      if (!res.ok) {
        const msg = body && body.error && (body.error.message || body.error);
        throw new Error(msg ? String(msg) : `The local proxy could not complete the ${label} request (status ${res.status}).`);
      }
      const text = String((body && body.text) || '');
      if (text && typeof onToken === 'function') onToken(text);
      return {text, model: (body && body.model) || model, ms: Math.round(now() - start)};
    } finally { t.done(); }
  }

  /* ---------- hosted adapters ---------- */

  // spec: { id, label, request(key, model, system, user) -> {url, init}, delta(json, eventName) -> string,
  //         finalModel(json) -> string|undefined, probe(key) -> {url, init} | null }
  function hosted(spec) {
    const adapter = {
      id: spec.id,
      label: spec.label,
      kind: 'hosted',
      defaultModel: DEFAULT_MODELS[spec.id],
      async available() {
        const s = settings.get();
        if (s.proxyUrl) return proxyAvailable(spec.id, spec.label, s.proxyUrl);
        const key = s.keys[spec.id];
        if (!key) return {ok: false, reason: 'no key'};
        const probe = spec.probe && spec.probe(key);
        if (!probe) return {ok: true};
        return cached(spec.id, key, async () => {
          const t = timeoutSignal(6000);
          try {
            const res = await fetch(probe.url, Object.assign({}, probe.init, {signal: t.signal}));
            if (res.ok) return {ok: true};
            const err = await errorFromResponse(spec.label, res);
            return {ok: false, reason: err.message};
          } catch (err) {
            return {ok: false, reason: networkReason(spec.label, err)};
          } finally { t.done(); }
        });
      },
      async complete(opts) {
        opts = opts || {};
        const s = settings.get();
        const model = s.models[spec.id] || DEFAULT_MODELS[spec.id];
        if (s.proxyUrl) return proxyComplete(spec.id, spec.label, s.proxyUrl, model, opts);
        const key = s.keys[spec.id];
        if (!key) throw new Error(`No ${spec.label} key is set. Add one in Settings or use the local proxy.`);
        const {url, init} = spec.request(key, model, opts.system || '', opts.user || '');
        const start = now();
        const t = timeoutSignal(180000, opts.signal);
        let res;
        try {
          res = await fetch(url, Object.assign({}, init, {signal: t.signal}));
        } catch (err) {
          t.done();
          if (opts.signal && opts.signal.aborted) throw err;
          throw new Error(networkReason(spec.label, err));
        }
        try {
          if (!res.ok) throw await errorFromResponse(spec.label, res);
          let text = '', usedModel = model;
          const ctype = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
          const take = (json, event) => {
            if (json && json.error) {
              throw new Error(`${spec.label} stopped with an error. ${String(json.error.message || '').slice(0, 240)}`.trim());
            }
            const m = spec.finalModel && spec.finalModel(json);
            if (m) usedModel = m;
            const d = spec.delta(json, event);
            if (d) { text += d; if (typeof opts.onToken === 'function') opts.onToken(d); }
          };
          if (/event-stream/i.test(ctype) || !/json/i.test(ctype)) {
            await readSSE(res, (data, event) => {
              if (data === '[DONE]') return;
              let json; try { json = JSON.parse(data); } catch (_) { return; }
              take(json, event);
            });
          } else {
            // A provider answered with plain JSON instead of a stream.
            take(spec.whole ? spec.whole(await res.json()) : await res.json(), '');
          }
          return {text, model: usedModel, ms: Math.round(now() - start)};
        } finally { t.done(); }
      }
    };
    return adapter;
  }

  const openAIDelta = j => (j && j.choices && j.choices[0] && ((j.choices[0].delta && j.choices[0].delta.content) || (j.choices[0].message && j.choices[0].message.content))) || '';
  const openAIModel = j => j && j.model;
  function openAIRequest(url, key, model, system, user, extra) {
    return {
      url,
      init: {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key},
        body: JSON.stringify(Object.assign({
          model,
          messages: [{role: 'system', content: system}, {role: 'user', content: user}],
          stream: true
        }, extra || {}))
      }
    };
  }

  const openai = hosted({
    id: 'openai', label: 'OpenAI',
    request: (key, model, system, user) => openAIRequest('https://api.openai.com/v1/chat/completions', key, model, system, user, {max_completion_tokens: MAX_TOKENS}),
    probe: key => ({url: 'https://api.openai.com/v1/models', init: {method: 'GET', headers: {'Authorization': 'Bearer ' + key}}}),
    delta: openAIDelta, finalModel: openAIModel
  });

  // Keys that are not scoped to one workspace (personal or service-account keys) must name the
  // workspace on every request: https://platform.claude.com/docs/en/manage-claude/authentication
  const ANTHROPIC_HEADERS = key => {
    const h = {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    const workspace = settings.get().anthropicWorkspace;
    if (workspace) h['anthropic-workspace-id'] = workspace;
    return h;
  };
  const anthropic = hosted({
    id: 'anthropic', label: 'Anthropic',
    request: (key, model, system, user) => ({
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: Object.assign({'Content-Type': 'application/json'}, ANTHROPIC_HEADERS(key)),
        body: JSON.stringify({model, max_tokens: MAX_TOKENS, system, messages: [{role: 'user', content: user}], stream: true})
      }
    }),
    probe: key => ({url: 'https://api.anthropic.com/v1/models?limit=1', init: {method: 'GET', headers: ANTHROPIC_HEADERS(key)}}),
    delta: j => {
      if (!j) return '';
      if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') return j.delta.text || '';
      if (j.type === 'message' && Array.isArray(j.content)) return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
      return '';
    },
    finalModel: j => j && ((j.type === 'message_start' && j.message && j.message.model) || (j.type === 'message' && j.model))
  });

  const geminiText = j => {
    const c = j && j.candidates && j.candidates[0];
    const parts = c && c.content && c.content.parts;
    return Array.isArray(parts) ? parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('') : '';
  };
  const gemini = hosted({
    id: 'gemini', label: 'Google Gemini',
    request: (key, model, system, user) => ({
        // Key only in the x-goog-api-key header (current Gemini docs), never in the URL.
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        init: {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
          body: JSON.stringify({
            systemInstruction: {parts: [{text: system}]},
            contents: [{role: 'user', parts: [{text: user}]}],
            generationConfig: {maxOutputTokens: MAX_TOKENS}
          })
        }
    }),
    probe: key => ({url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', init: {method: 'GET', headers: {'x-goog-api-key': key}}}),
    delta: geminiText,
    whole: j => (Array.isArray(j) ? {candidates: [{content: {parts: j.map(x => ({text: geminiText(x)}))}}], modelVersion: j[0] && j[0].modelVersion} : j),
    finalModel: j => j && j.modelVersion
  });

  const kimi = hosted({
    id: 'kimi', label: 'Moonshot Kimi',
    request: (key, model, system, user) => openAIRequest('https://api.moonshot.ai/v1/chat/completions', key, model, system, user, {max_tokens: MAX_TOKENS}),
    probe: key => ({url: 'https://api.moonshot.ai/v1/models', init: {method: 'GET', headers: {'Authorization': 'Bearer ' + key}}}),
    delta: openAIDelta, finalModel: openAIModel
  });

  // Perplexity: Sonar Chat Completions was retired in favour of the Agent API (POST /v1/agent).
  // The model setting accepts an effort level (fast, low, medium, high, xhigh, ultra-preview) or a
  // catalog id in creator/model form (for example perplexity/sonar). Legacy Sonar ids map to the
  // migration guide's effort levels (sonar and sonar-pro to fast, sonar-reasoning-pro to low,
  // sonar-deep-research to high). Our instructions replace the effort
  // level's own system prompt, so the neuron citation rules still apply.
  const PPLX_EFFORTS = ['fast', 'low', 'medium', 'high', 'xhigh', 'ultra-preview'];
  // legacy Sonar ids, per https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to
  const PPLX_LEGACY = {'sonar': 'fast', 'sonar-pro': 'fast', 'sonar-reasoning-pro': 'low', 'sonar-deep-research': 'high'};
  const perplexityTarget = model => {
    const m = String(model || '').trim() || 'fast';
    if (PPLX_EFFORTS.indexOf(m) !== -1) return {effort: m};
    if (Object.prototype.hasOwnProperty.call(PPLX_LEGACY, m)) return {effort: PPLX_LEGACY[m]};
    // creator/model ids pass through; anything else goes as-is so Perplexity reports it rather than us
    // silently switching the visitor's choice
    return {model: m};
  };
  // A 200 response (or stream event) can still carry status failed, incomplete or cancelled
  // (https://docs.perplexity.ai/api-reference/agent-post); never show such text as a finished answer.
  const agentStatusError = j => {
    const r = j && (j.response || (!j.type ? j : null));
    const status = r && r.status;
    if (status === 'failed') return 'Perplexity could not finish the answer. ' + String((r.error && r.error.message) || '').slice(0, 240);
    if (status === 'incomplete') return 'Perplexity stopped before the answer finished' + (r.incomplete_details && r.incomplete_details.reason ? ` (${String(r.incomplete_details.reason).slice(0, 60)})` : '') + '. Try again.';
    if (status === 'cancelled') return 'Perplexity cancelled the answer. Try again.';
    return '';
  };
  const agentText = j => {
    if (!j) return '';
    const failure = agentStatusError(j);
    if (failure) throw new Error(failure.trim());
    if (j.type === 'response.output_text.delta') return typeof j.delta === 'string' ? j.delta : '';
    if (j.type) return '';
    if (typeof j.output_text === 'string') return j.output_text;
    const out = Array.isArray(j.output) ? j.output : [];
    return out.filter(o => o && o.type === 'message' && Array.isArray(o.content))
      .map(o => o.content.filter(c => c && c.type === 'output_text').map(c => c.text || '').join('')).join('');
  };
  const perplexity = hosted({
    id: 'perplexity', label: 'Perplexity',
    request: (key, model, system, user) => ({
      url: 'https://api.perplexity.ai/v1/agent',
      init: {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key},
        body: JSON.stringify(Object.assign(perplexityTarget(model), {
          instructions: system, input: user, max_output_tokens: MAX_TOKENS, stream: true
        }))
      }
    }),
    probe: key => ({url: 'https://api.perplexity.ai/v1/models', init: {method: 'GET', headers: {'Authorization': 'Bearer ' + key}}}),
    delta: agentText,
    finalModel: j => j && ((j.response && j.response.model) || (!j.type && j.model))
  });

  /* ---------- local adapters ---------- */

  // Chrome's Local Network Access: an https page reaching Ollama on this computer needs the visitor's
  // permission, and the request should declare its target address space.
  // https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access
  function addressSpace(url) {
    try {
      const h = new URL(url).hostname.replace(/^\[|\]$/g, '');
      if (h === 'localhost' || h === '::1') return 'loopback';
      if (/\.local$/i.test(h)) return 'local';
      if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return 'local';   // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
      const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
      if (ip && ip.slice(1).every(n => +n <= 255)) {
        const a = +ip[1], b = +ip[2];
        if (a === 127) return 'loopback';
        if (a === 10 || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)) return 'local';
      }
    } catch (_) { /* invalid URL: let fetch report it */ }
    return '';
  }
  function localInit(url, init) {
    const space = addressSpace(url);
    return space ? Object.assign({targetAddressSpace: space}, init) : init;
  }
  async function ollamaUnreachable(url) {
    let msg = `Ollama is not reachable at ${url}. Start it with ollama serve.`;
    const origin = root.location && root.location.origin;
    const space = addressSpace(url);
    if (space && origin && addressSpace(origin) !== 'loopback') {
      msg += ` For this page, start it with OLLAMA_ORIGINS=${origin} and choose Allow when the browser asks to reach this device.`;
      const perms = root.navigator && root.navigator.permissions;
      // Query only the granular name: Chrome notes that querying the legacy 'local-network-access'
      // name crashes the renderer in older versions, which try/catch cannot prevent.
      if (perms && typeof perms.query === 'function') {
        try {
          const st = await perms.query({name: space === 'loopback' ? 'loopback-network' : 'local-network'});
          if (st && st.state === 'denied') msg += ' This browser is currently blocking that access; allow it in this site\'s settings.';
        } catch (_) {
          // Chrome 142-144 enforce the rule without the granular names; a blocked site shows no prompt there.
          msg += ' If no prompt appears, check this site\'s settings for local network access.';
        }
      } else msg += ' If no prompt appears, check this site\'s settings for local network access.';
    }
    return msg;
  }

  const ollama = {
    id: 'ollama', label: 'Ollama (this computer)', kind: 'local',
    async available() {
      const s = settings.get();
      const t = timeoutSignal(2500);
      try {
        const res = await fetch(s.ollamaUrl + '/api/tags', localInit(s.ollamaUrl, {method: 'GET', signal: t.signal}));
        if (!res.ok) return {ok: false, reason: `Ollama answered with status ${res.status}.`};
        const body = await res.json().catch(() => ({}));
        const names = ((body && body.models) || []).map(m => m.name || m.model || '');
        if (!names.length) return {ok: false, reason: 'Ollama is running but has no models. Pull one with ollama pull.'};
        const want = s.ollamaModel;
        const has = names.some(n => n === want || n === want + ':latest' || n.split(':')[0] === want);
        return has ? {ok: true} : {ok: false, reason: `Ollama does not have ${want}. Installed: ${names.slice(0, 5).join(', ')}.`};
      } catch (err) {
        return {ok: false, reason: await ollamaUnreachable(s.ollamaUrl)};
      } finally { t.done(); }
    },
    async complete(opts) {
      opts = opts || {};
      const s = settings.get();
      const start = now();
      const t = timeoutSignal(300000, opts.signal);
      let res;
      try {
        res = await fetch(s.ollamaUrl + '/api/chat', localInit(s.ollamaUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            model: s.ollamaModel,
            messages: [{role: 'system', content: opts.system || ''}, {role: 'user', content: opts.user || ''}],
            stream: true
          }),
          signal: t.signal
        }));
      } catch (err) {
        t.done();
        if (opts.signal && opts.signal.aborted) throw err;
        throw new Error(await ollamaUnreachable(s.ollamaUrl));
      }
      try {
        if (!res.ok) throw await errorFromResponse('Ollama', res);
        let text = '', model = s.ollamaModel;
        await readNDJSON(res, j => {
          if (j.error) throw new Error('Ollama stopped with an error. ' + String(j.error).slice(0, 240));
          if (j.model) model = j.model;
          const d = j.message && j.message.content;
          if (d) { text += d; if (typeof opts.onToken === 'function') opts.onToken(d); }
        });
        return {text, model, ms: Math.round(now() - start)};
      } finally { t.done(); }
    }
  };

  const webllm = { engine: null, modelId: null, loading: null, lib: null, locked: false, release: null };
  const WEBLLM_LOCK = 'deepask-webllm';
  // Hold a shared Web Lock for the life of this tab once WebLLM starts, so other tabs can see it.
  function holdWebllmLock() {
    if (webllm.locked) return Promise.resolve();
    const locks = root.navigator && root.navigator.locks;
    if (!locks || !locks.request) return Promise.reject(new Error('This browser cannot keep WebLLM apart from stored keys (Web Locks are unavailable). Use Ollama instead.'));
    return new Promise((granted, failed) => {
      locks.request(WEBLLM_LOCK, {mode: 'shared'}, () => {
        webllm.locked = true; granted();
        return new Promise(done => { webllm.release = () => { webllm.locked = false; webllm.release = null; done(); }; });
      }).catch(failed);
    });
  }
  // WebLLM is third-party code imported into this page from a CDN. It would share an origin with any
  // keys kept in localStorage, so it loads only after explicit consent and only while no hosted keys
  // are stored; once it has started, keys cannot be saved in this tab or, through the lock, in any other.
  function webllmGate() {
    const s = settings.get();
    if (!s.webllmConsent) return 'WebLLM loads third-party code from esm.run into this page. Allow it in Settings first.';
    if (Object.keys(s.keys || {}).length) return 'WebLLM will not load while hosted-provider keys are stored in this browser. Remove the keys, or use Ollama instead.';
    return '';
  }
  async function loadWebLLM(modelId, onStatus) {
    if (webllm.engine && webllm.modelId === modelId) return webllm.engine;
    if (webllm.loading && webllm.loading.modelId === modelId) return webllm.loading.promise;
    const gate = webllmGate();
    if (gate) throw new Error(gate);
    const promise = (async () => {
      await holdWebllmLock();
      try {
        const late = webllmGate(); // re-check after the lock, in case another tab saved a key meanwhile
        if (late) throw new Error(late);
        emitStatus(onStatus, {phase: 'loading', text: 'Loading the in-browser model library.', progress: 0});
        if (!webllm.lib) webllm.lib = await import(/* webpackIgnore: true */ WEBLLM_URL);
      } catch (error) {
        // nothing third-party ran yet, so give the lock back; once the library has loaded it stays held
        if (!webllm.lib && webllm.release) webllm.release();
        throw error;
      }
      if (webllm.engine && webllm.engine.unload) { try { await webllm.engine.unload(); } catch (_) { /* ignore */ } }
      const engine = await webllm.lib.CreateMLCEngine(modelId, {
        initProgressCallback: p => emitStatus(onStatus, {
          phase: 'loading',
          text: (p && p.text) || 'Downloading the model.',
          progress: p && typeof p.progress === 'number' ? p.progress : undefined
        })
      });
      webllm.engine = engine; webllm.modelId = modelId;
      emitStatus(onStatus, {phase: 'ready', text: 'The in-browser model is ready.', progress: 1});
      return engine;
    })();
    webllm.loading = {modelId, promise};
    try { return await promise; } finally { if (webllm.loading && webllm.loading.promise === promise) webllm.loading = null; }
  }

  const webllmAdapter = {
    id: 'webllm', label: 'WebLLM (in this tab)', kind: 'local',
    async available() {
      const gate = webllmGate();
      if (gate) return {ok: false, reason: gate};
      const nav = root.navigator;
      if (!nav || !nav.gpu) return {ok: false, reason: 'This browser does not offer WebGPU, which WebLLM needs.'};
      try {
        const adapterGpu = await nav.gpu.requestAdapter();
        if (!adapterGpu) return {ok: false, reason: 'WebGPU is present but no compatible graphics adapter was found.'};
        // q4f16 / q0f16 builds need 16-bit shaders; software and some older adapters lack them
        if (/f16_/.test(settings.get().webllmModel || '') && !(adapterGpu.features && adapterGpu.features.has('shader-f16'))) {
          return {ok: false, reason: 'This graphics adapter lacks 16-bit shader support. Choose a q4f32 model in Settings, for example Llama-3.2-1B-Instruct-q4f32_1-MLC.'};
        }
      } catch (_) {
        return {ok: false, reason: 'WebGPU is present but could not start.'};
      }
      return {ok: true};
    },
    async complete(opts) {
      opts = opts || {};
      const s = settings.get();
      const start = now();
      const engine = await loadWebLLM(s.webllmModel, opts.onStatus);
      if (opts.signal && opts.signal.aborted) throw new DOMException('Request stopped.', 'AbortError');
      const onAbort = () => { try { engine.interruptGenerate(); } catch (_) { /* ignore */ } };
      if (opts.signal) opts.signal.addEventListener('abort', onAbort, {once: true});
      try {
        const chunks = await engine.chat.completions.create({
          messages: [{role: 'system', content: opts.system || ''}, {role: 'user', content: opts.user || ''}],
          stream: true,
          max_tokens: MAX_TOKENS
        });
        let text = '';
        for await (const chunk of chunks) {
          const d = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
          if (d) { text += d; if (typeof opts.onToken === 'function') opts.onToken(d); }
        }
        return {text, model: s.webllmModel, ms: Math.round(now() - start)};
      } finally {
        if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      }
    }
  };

  /* ---------- registry ---------- */

  const ADAPTERS = [ollama, webllmAdapter, openai, anthropic, gemini, kimi, perplexity];
  D.models = {
    list() { return ADAPTERS.slice(); },
    get(id) { return ADAPTERS.find(a => a.id === id) || null; },
    settings,
    hostedIds: HOSTED.slice(),
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
  };
}());
