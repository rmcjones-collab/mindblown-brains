/* MindBlown Neural — babel-librarian.js (Babel brain only)

   The Librarian: a chatbot that searches libraryofbabel.info the way a visitor does. You type any text; the
   Librarian reads it the way the Library reads it (lower-case, 29 symbols, up to 3,200 characters), spells out
   the syntax involved (the alphabet, the page geometry, the POST the site's own search form sends, the shape of
   the addresses that come back) and then submits that exact request to the real site, whose results page and
   book pages are shown inside the panel. Paste an address (hex-w1-s2-v03:45 or a book.cgi URL) and the Librarian
   decodes it rung by rung and opens the page.

   Honest about its limits: the site's text algorithm is not public (Basile published only the Babelia image
   algorithm), so nothing here computes an address; every address shown comes from libraryofbabel.info itself,
   requested from the visitor's own browser. The site is contacted only when the visitor asks for a search or a
   page; nothing loads at boot (tools/qa-offline.cjs still boots the brain with every non-localhost request blocked).

   Self-contained: injects its own panel, styles and hidden forms; wires any [data-librarian] button (app.js mirrors the
   button as a phone-bar chip via data-page-action); stores nothing. */
(() => {
  if (window.__MB_LIBRARIAN__) return;
  window.__MB_LIBRARIAN__ = true;

  const SITE = 'https://libraryofbabel.info/';
  const PAGE_CHARS = 3200, LINE_CHARS = 80, LINES = 40;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Number(n).toLocaleString('en-GB');
  const FRAME = 'mb-lib-frame';
  const GET_LIMIT = 1950;   // the site's Reference Hex page: names longer than this cannot be opened with GET in every browser
  const BOOK_FIELDS = ['hex', 'wall', 'shelf', 'volume', 'page'].map(n => `<input type="hidden" name="${n}">`).join('');   // the fields of the site's own #seekbook form

  const CSS = `
.lib-panel { position: fixed; right: 20px; top: 84px; bottom: 72px; width: min(640px, calc(100vw - 40px)); z-index: 8; display: flex; flex-direction: column;
  background: var(--glass-strong, rgba(10,14,26,0.92)); border: 1px solid var(--line, rgba(160,180,220,0.14)); border-radius: 16px;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); color: var(--text, #e9eefb); font-family: var(--font-body, system-ui, sans-serif); box-shadow: 0 18px 50px rgba(0,0,0,0.45); }
.lib-panel[hidden] { display: none !important; }   /* must beat the wide-screen .lib-panel.framed grid rule, or X cannot close the panel after a search */
.lib-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 10px; border-bottom: 1px solid var(--line, rgba(160,180,220,0.14)); }
.lib-kind { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3, #6f7b99); display: flex; align-items: center; gap: 6px; }
.lib-kind .sw { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; }
.lib-head h2 { font-family: var(--font-display, system-ui, sans-serif); font-weight: 600; font-size: 20px; margin: 4px 0 0; letter-spacing: -0.01em; }
.lib-head .lib-sub { font-size: 12px; color: var(--text-2, #a7b2cc); margin-top: 2px; }
.lib-close { width: 32px; height: 32px; border-radius: 8px; border: 0; background: transparent; color: var(--text-3, #6f7b99); font-size: 22px; cursor: pointer; flex: none; }
.lib-close:hover { background: rgba(255,255,255,0.06); color: var(--text, #e9eefb); }
.lib-chat { flex: 1 1 auto; min-height: 120px; overflow: auto; padding: 14px 18px 6px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.lib-msg { max-width: 92%; padding: 10px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.5; }
.lib-msg.you { align-self: flex-end; background: rgba(253,230,138,0.14); border: 1px solid rgba(253,230,138,0.35); color: var(--text, #e9eefb); white-space: pre-wrap; word-break: break-word; }
.lib-msg.bot { align-self: flex-start; background: rgba(255,255,255,0.04); border: 1px solid var(--line, rgba(160,180,220,0.14)); }
.lib-msg.bot p { margin: 0 0 8px; } .lib-msg.bot p:last-child { margin-bottom: 0; }
.lib-msg code, .lib-msg pre, .lib-msg kbd { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace; font-size: 12px; }
.lib-msg code { background: rgba(255,255,255,0.07); border: 1px solid var(--line, rgba(160,180,220,0.14)); border-radius: 5px; padding: 1px 5px; word-break: break-all; }
.lib-msg pre { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: #0b0f1a; border: 1px solid var(--line, rgba(160,180,220,0.14)); overflow: auto; white-space: pre; line-height: 1.35; max-height: 200px; color: var(--text-2, #a7b2cc); }
.lib-msg pre mark { background: rgba(253,230,138,0.3); color: #fde68a; border-radius: 2px; }
.lib-msg pre .sp { color: rgba(167,178,204,0.28); }
.lib-msg .lib-note { font-size: 12px; color: var(--text-3, #6f7b99); margin-top: 4px; }
.lib-msg h4 { margin: 10px 0 4px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3, #6f7b99); font-weight: 500; }
.lib-msg dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: 12.5px; }
.lib-msg dt { color: var(--text-3, #6f7b99); white-space: nowrap; } .lib-msg dd { margin: 0; color: var(--text-2, #a7b2cc); word-break: break-word; }
.lib-msg .ok { color: #34d399; } .lib-msg .warn { color: #fbbf24; } .lib-msg .err { color: #f87171; }
.lib-msg .lib-text { display: block; margin: 4px 0 2px; padding: 6px 9px; border-radius: 8px; background: rgba(253,230,138,0.08); border: 1px dashed rgba(253,230,138,0.35); color: #fde68a; white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
.lib-msg .lib-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.lib-mini { font: inherit; font-size: 12px; white-space: nowrap; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line-strong, rgba(160,180,220,0.28)); background: rgba(255,255,255,0.04); color: var(--text, #e9eefb); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.lib-mini:hover { background: rgba(255,255,255,0.09); }
.lib-mini[disabled] { opacity: 0.5; cursor: default; }
.lib-panel.framed .lib-chat { flex: 0 1 auto; max-height: 30%; }
.lib-panel.framed.big .lib-chat { max-height: 72px; }
.lib-frame-wrap { flex: 1 1 auto; min-height: 300px; border-top: 1px solid var(--line, rgba(160,180,220,0.14)); display: flex; flex-direction: column; }
.lib-frame-wrap[hidden] { display: none; }
.lib-frame-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; color: var(--text-2, #a7b2cc); }
.lib-frame-bar .t { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-frame-bar .t b { color: var(--text, #e9eefb); font-weight: 600; }
.lib-frame-box { flex: 1 1 auto; min-height: 260px; position: relative; overflow: hidden; background: #fff; border-radius: 0 0 14px 14px; }
.lib-frame-box.pan { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
.lib-frame-box iframe { position: absolute; left: 0; top: 0; width: 900px; height: 100%; border: 0; transform-origin: 0 0; background: #fff; }
.lib-composer { flex: none; border-top: 1px solid var(--line, rgba(160,180,220,0.14)); padding: 10px 12px 12px; display: grid; gap: 8px; }
.lib-composer textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 44px; max-height: 160px; padding: 9px 11px; border-radius: 10px; border: 1px solid var(--line-strong, rgba(160,180,220,0.28));
  background: rgba(255,255,255,0.05); color: var(--text, #e9eefb); font: inherit; font-size: 13.5px; line-height: 1.4; outline: none; }
.lib-composer textarea:focus { border-color: rgba(253,230,138,0.6); }
.lib-composer textarea::placeholder { color: var(--text-3, #6f7b99); }
.lib-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--text-3, #6f7b99); }
.lib-meta .cnt b { color: var(--text-2, #a7b2cc); font-weight: 500; } .lib-meta .cnt .warn { color: #fbbf24; }
.lib-send { font: inherit; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(253,230,138,0.5); background: rgba(253,230,138,0.14); color: #fde68a; cursor: pointer; }
.lib-send:hover { background: rgba(253,230,138,0.24); }
@media (min-width: 1101px) {
  .lib-panel.framed { width: min(1040px, calc(100vw - 40px)); display: grid; grid-template-columns: minmax(380px, 2fr) minmax(0, 3fr); grid-template-rows: auto minmax(0, 1fr) auto; grid-template-areas: "head frame" "chat frame" "composer frame"; }
  .lib-panel.framed .lib-head { grid-area: head; } .lib-panel.framed .lib-chat { grid-area: chat; max-height: none; } .lib-panel.framed .lib-composer { grid-area: composer; }
  .lib-panel.framed .lib-frame-wrap { grid-area: frame; border-top: 0; border-left: 1px solid var(--line, rgba(160,180,220,0.14)); min-height: 0; }
  .lib-panel.framed .lib-frame-box { border-radius: 0 0 14px 0; }
  .lib-panel.framed .lib-big { display: none; }
}
@media (max-width: 900px) {
  .lib-panel { left: 0; right: 0; top: auto; bottom: 0; width: auto; max-height: 86vh; height: 86vh; border-radius: 18px 18px 0 0; z-index: 9; padding-bottom: env(safe-area-inset-bottom, 0); }
  .lib-frame-wrap { min-height: 280px; }
  .lib-panel.framed .lib-chat { max-height: 34%; }
  .lib-msg { max-width: 96%; }
}
/* short screens (phone landscape): the framed panel scrolls as one column and the frame shrinks, so the composer stays reachable */
@media (max-width: 900px) and (max-height: 560px) {
  .lib-panel { overflow-y: auto; }
  .lib-frame-wrap { min-height: 180px; }
  .lib-panel.framed .lib-chat { max-height: none; min-height: 72px; }
}
@media (prefers-reduced-motion: reduce) { .lib-chat { scroll-behavior: auto; } }
@media print { .lib-panel { display: none !important; } }`;

  // ----- reading a request the way the Library reads it (mirror of the site's own clearout(): lower-case, then drop anything outside [a-z ,.]) -----
  function readAsLibrary(raw) {
    const chars = Array.from(raw);
    let lowered = 0; const dropped = new Map();
    let text = '';
    for (const ch of chars) {
      const lc = ch.toLowerCase();
      if (lc !== ch) lowered++;
      for (const c of Array.from(lc)) {
        if (/[a-z ,.]/.test(c)) text += c;
        else dropped.set(c, (dropped.get(c) || 0) + 1);
      }
    }
    const truncated = text.length > PAGE_CHARS;
    if (truncated) text = text.slice(0, PAGE_CHARS);
    return { text, lowered, dropped, truncated, rawLength: chars.length };
  }
  const describeChar = c => c === '\n' ? 'line break' : c === '\t' ? 'tab' : /\s/.test(c) ? 'other whitespace' : /\p{Nd}/u.test(c) ? `digit ${c}` : c;

  // addresses: hex-w1-s2-v03:45, with or without the book.cgi URL in front, page optional
  const ADDR = /^(?:https?:\/\/(?:www\.)?libraryofbabel\.info\/book\.cgi\?)?([0-9a-z]{1,4000})-w(\d{1,2})-s(\d{1,2})-v(\d{1,3})(?::(\d{1,4}))?\s*$/i;

  // ----- the exact-match page as the site lays it out: the text, then spaces to 3,200, in 40 lines of 80 (all rows drawn) -----
  function pagePreview(text) {
    const used = text.length, blank = PAGE_CHARS - used;
    const lines = [];
    for (let i = 0; i < LINES; i++) {
      const seg = text.slice(i * LINE_CHARS, (i + 1) * LINE_CHARS);
      const pad = LINE_CHARS - seg.length;
      lines.push(`${seg ? `<mark>${esc(seg)}</mark>` : ''}${pad ? `<span class="sp">${'·'.repeat(pad)}</span>` : ''}`);
    }
    return `<pre aria-label="Layout of the exact-match page: 40 lines of 80 characters">${lines.join('\n')}</pre>
      <p class="lib-note">${fmt(used)} character${used === 1 ? '' : 's'} of text on ${fmt(Math.ceil(used / LINE_CHARS))} of the 40 lines, then ${fmt(blank)} space${blank === 1 ? '' : 's'} (shown as dots) to the foot of the page.</p>`;
  }

  // ----- DOM -----
  let panel, chat, frameWrap, frame, frameTitle, openSite, backBtn, composer, ta, counter, postForm, postFormBlank, bookForm, bookFormBlank;
  let last = null;   // { kind: 'search'|'page'|'random', text?, url?, label }
  let awaiting = false;   // true between our own submit/src and the frame's first load for it

  function build() {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    panel = document.createElement('aside'); panel.className = 'lib-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'The Librarian');
    panel.innerHTML = `
      <header class="lib-head">
        <div><div class="lib-kind"><span class="sw"></span>Chatbot · searches libraryofbabel.info</div><h2>The Librarian</h2>
          <div class="lib-sub">Type any text; the Librarian reads it as the Library does, explains the syntax, then runs the site's own search.</div></div>
        <button type="button" class="lib-close" aria-label="Close the Librarian">×</button>
      </header>
      <div class="lib-chat" aria-live="polite"></div>
      <div class="lib-frame-wrap" hidden>
        <div class="lib-frame-bar"><span class="t"></span><button type="button" class="lib-mini lib-back" hidden>↩ results</button><button type="button" class="lib-mini lib-big" aria-pressed="false" title="Give the site more room">⤢ bigger</button><button type="button" class="lib-mini lib-open">open on the site ↗</button></div>
        <div class="lib-frame-box"><iframe name="${FRAME}" title="libraryofbabel.info" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      </div>
      <form class="lib-composer">
        <textarea rows="2" aria-label="Text to search for in the Library of Babel" placeholder="Any text to find in the Library… or paste an address (hex-w1-s2-v03:45)"></textarea>
        <div class="lib-meta"><span class="cnt"><b>0</b> of ${fmt(PAGE_CHARS)} Library characters</span><button type="submit" class="lib-send">Search the Library</button></div>
      </form>
      <form class="lib-post" method="POST" action="${SITE}search.cgi" target="${FRAME}" hidden><input type="hidden" name="find"><input type="hidden" name="method" value="x"></form>
      <form class="lib-post-blank" method="POST" action="${SITE}search.cgi" target="_blank" rel="noopener" hidden><input type="hidden" name="find"><input type="hidden" name="method" value="x"></form>
      <form class="lib-book" method="POST" action="${SITE}book.cgi" target="${FRAME}" hidden>${BOOK_FIELDS}</form>
      <form class="lib-book-blank" method="POST" action="${SITE}book.cgi" target="_blank" rel="noopener" hidden>${BOOK_FIELDS}</form>`;
    document.body.appendChild(panel);
    chat = panel.querySelector('.lib-chat'); frameWrap = panel.querySelector('.lib-frame-wrap'); frame = panel.querySelector('iframe');
    frameTitle = panel.querySelector('.lib-frame-bar .t'); openSite = panel.querySelector('.lib-open'); backBtn = panel.querySelector('.lib-back');
    composer = panel.querySelector('.lib-composer'); ta = composer.querySelector('textarea'); counter = composer.querySelector('.cnt');
    postForm = panel.querySelector('.lib-post'); postFormBlank = panel.querySelector('.lib-post-blank');
    bookForm = panel.querySelector('.lib-book'); bookFormBlank = panel.querySelector('.lib-book-blank');

    panel.querySelector('.lib-close').addEventListener('click', close);
    composer.addEventListener('submit', e => { e.preventDefault(); submit(); });
    // Enter sends, except while an IME is composing (isComposing / keyCode 229)
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); } });
    ta.addEventListener('input', updateCounter);
    openSite.addEventListener('click', () => {
      if (!last) return;
      if (last.kind === 'search') { postFormBlank.find.value = last.text; postFormBlank.submit(); }
      else if (last.kind === 'page' && last.post) { fillBook(bookFormBlank, last.post); bookFormBlank.submit(); }
      else window.open(last.url, '_blank', 'noopener');
    });
    // the site lays itself out 850px wide and clips its result headings at narrower viewports, so the frame is always
    // rendered 900px wide and scaled to fit the box (never below 0.6; on phones the box pans sideways instead)
    const box = panel.querySelector('.lib-frame-box');
    const fit = () => { const bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return; const cw = 900; const k = Math.max(0.6, Math.min(1, bw / cw)); frame.style.width = cw + 'px'; frame.style.height = Math.round(bh / k) + 'px'; frame.style.transform = `scale(${k})`; box.classList.toggle('pan', cw * k > bw + 1); };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(box); else window.addEventListener('resize', fit);
    panel.querySelector('.lib-big').addEventListener('click', e => { const on = panel.classList.toggle('big'); e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.textContent = on ? '⤡ smaller' : '⤢ bigger'; });
    backBtn.addEventListener('click', () => { if (last && last.kind === 'search') showSearch(last.text, true); });
    frame.addEventListener('load', () => {   // once the visitor has moved inside the site, name what is shown and offer the way back to the results
      if (awaiting) { awaiting = false; return; }
      if (last && last.kind === 'search') { backBtn.hidden = false; frameTitle.innerHTML = `<b>libraryofbabel.info</b> · a page opened from your results`; }
      else if (last) frameTitle.innerHTML = `<b>libraryofbabel.info</b> · browsing from ${esc(last.label)}`;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden && panel.contains(document.activeElement)) close(); });


    greet();
  }

  function updateCounter() {
    const r = readAsLibrary(ta.value);
    const dropped = [...r.dropped.values()].reduce((a, b) => a + b, 0);
    counter.innerHTML = `<b>${fmt(r.text.length)}</b> of ${fmt(PAGE_CHARS)} Library characters` + (dropped || r.lowered ? ` · <span class="warn">${[r.lowered ? `${fmt(r.lowered)} lower-cased` : '', dropped ? `${fmt(dropped)} dropped` : ''].filter(Boolean).join(', ')}</span>` : '') + (r.truncated ? ' · <span class="warn">cut at 3,200</span>' : '');
  }

  function add(kind, html) {
    const m = document.createElement('div'); m.className = 'lib-msg ' + kind;
    if (kind === 'you') m.textContent = html; else m.innerHTML = html;
    chat.appendChild(m); chat.scrollTop = chat.scrollHeight; return m;
  }

  function greet() {
    add('bot', `<p>I search <a class="lib-mini" href="${SITE}" target="_blank" rel="noopener">libraryofbabel.info ↗</a> the way a visitor does: your text goes into the site's own search form, and its results open here. Every address you see comes from the site; I compute none of them.</p>
      <p>Give me any text, or paste an address like <code>0-w1-s1-v01:1</code>. Try <button type="button" class="lib-mini" data-try="a brain that reads the library of babel">this brain's own sentence</button> or <button type="button" class="lib-mini" data-try="random">a random page</button>.</p>`);
    chat.addEventListener('click', e => { const b = e.target.closest('[data-try]'); if (b) { ta.value = b.dataset.try; updateCounter(); submit(); } });
  }

  // ----- turns -----
  function submit() {
    const raw = ta.value; if (!raw.trim()) return;
    add('you', raw); ta.value = ''; updateCounter();
    const t = raw.trim();
    if (/^(random|a random page|surprise me)$/i.test(t)) return showRandom();
    if (/^(help|\?)$/i.test(t)) return help();
    const a = t.match(ADDR); if (a) return showAddress(a);
    const r = readAsLibrary(raw);
    if (!r.text.trim()) return add('bot', `<p class="warn">Nothing of that survives the Library's alphabet. It keeps only the lower-case letters a–z, the space, the comma and the period, so <code>${esc(t.slice(0, 40))}</code> becomes an empty request.</p>`);
    replySearch(r); showSearch(r.text);
  }

  function replySearch(r) {
    const droppedN = [...r.dropped.values()].reduce((a, b) => a + b, 0);
    const changes = [];
    if (r.lowered) changes.push(`${fmt(r.lowered)} capital${r.lowered === 1 ? '' : 's'} lower-cased`);
    if (droppedN) changes.push(`${fmt(droppedN)} character${droppedN === 1 ? '' : 's'} dropped (${[...r.dropped.entries()].slice(0, 8).map(([c, n]) => `<code>${esc(describeChar(c))}</code>${n > 1 ? `×${n}` : ''}`).join(' ')}${r.dropped.size > 8 ? ' …' : ''})`);
    if (r.truncated) changes.push(`cut to ${fmt(PAGE_CHARS)} characters, one page`);
    const sites = r.text.length;
    const html = `
      <p>Read the way the Library reads it${changes.length ? `: <span class="warn">${changes.join('; ')}</span>` : ' — it is already in the Library\'s alphabet'}:</p>
      <span class="lib-text">${esc(r.text)}</span>
      <h4>Syntax of the request</h4>
      <dl>
        <dt>alphabet</dt><dd>29 symbols: <code>a</code>–<code>z</code>, space, <code>,</code> and <code>.</code>; the site lower-cases and strips everything else before searching (its form does this as you type)</dd>
        <dt>length</dt><dd><b>${fmt(sites)}</b> of ${fmt(PAGE_CHARS)} characters a page holds (40 lines × 80)</dd>
        <dt>request</dt><dd><code>POST ${SITE}search.cgi</code> with <code>find=</code><i>your text</i> and <code>method=x</code>, exactly what the site's search page sends</dd>
        <dt>results</dt><dd>four headings, each with one address and a <i>more … matches</i> link: <b>exact match</b> (your text alone on a page), <b>with random characters</b>, <b>with random English words</b> (those two carry <code>index</code> and <code>offset</code> so the site can highlight your text on the page) and <b>title search</b> (a book whose spine carries it)</dd>
        <dt>address</dt><dd><code>book.cgi?</code><i>hexagon</i><code>-w</code><i>1–4</i><code>-s</code><i>1–5</i><code>-v</code><i>01–32</i><code>:</code><i>1–410</i> — hexagon names are base-36 strings up to about 3,260 characters, so the full address is long</dd>
      </dl>
      <h4>What the exact-match page looks like</h4>
      ${pagePreview(r.text)}
      <p>The site's own results page is below (scroll inside it past its search form). Click an address there to open its page: the site shows the page with its full address underneath, and highlights your text on the random-character and random-word pages.</p>`;
    add('bot', html);
  }

  function showSearch(text, replay) {
    last = { kind: 'search', text };
    postForm.find.value = text;
    frameWrap.hidden = false; panel.classList.add('framed'); backBtn.hidden = true;
    frameTitle.innerHTML = `<b>libraryofbabel.info</b> · search results for <i>${esc(text.length > 48 ? text.slice(0, 45) + '…' : text)}</i>`;
    awaiting = true; postForm.submit();
    if (!replay) chat.scrollTop = chat.scrollHeight;
  }

  function showAddress(m) {
    const [, hex, w, s, v, p] = m;
    const wall = +w, shelf = +s, vol = +v, page = p === undefined ? 1 : +p;
    const problems = [];
    if (wall < 1 || wall > 4) problems.push(`wall <code>${wall}</code> is outside 1–4`);
    if (shelf < 1 || shelf > 5) problems.push(`shelf <code>${shelf}</code> is outside 1–5`);
    if (vol < 1 || vol > 32) problems.push(`volume <code>${vol}</code> is outside 1–32`);
    if (page < 1 || page > 410) problems.push(`page <code>${page}</code> is outside 1–410`);
    const hexL = hex.toLowerCase();
    const url = `${SITE}book.cgi?${hexL}-w${wall}-s${shelf}-v${String(vol).padStart(2, '0')}:${page}`;
    const rungs = `<dl>
        <dt>hexagon</dt><dd><code>${esc(hexL.length > 60 ? hexL.slice(0, 28) + '…' + hexL.slice(-28) : hexL)}</code> — ${fmt(hexL.length)} base-36 digit${hexL.length === 1 ? '' : 's'} (0–9, a–z) naming one of the Library's rooms</dd>
        <dt>wall</dt><dd><code>w${wall}</code> — one of the 4 walls of books (the other two sides hold the vestibule)</dd>
        <dt>shelf</dt><dd><code>s${shelf}</code> — one of 5 shelves on that wall</dd>
        <dt>volume</dt><dd><code>v${String(vol).padStart(2, '0')}</code> — one of 32 books on the shelf, written with two digits</dd>
        <dt>page</dt><dd><code>:${page}</code> — one of 410 pages${p === undefined ? ' (none given, so page 1)' : ''}</dd>
      </dl>`;
    if (problems.length) return add('bot', `<p class="err">That address does not fit the Library's syntax: ${problems.join('; ')}.</p>${rungs}`);
    const long = hexL.length > GET_LIMIT;
    const post = long ? { hex: hexL, wall, shelf, volume: vol, page } : null;
    last = { kind: 'page', url, post, label: `hexagon ${hexL.slice(0, 12)}… · w${wall} s${shelf} v${String(vol).padStart(2, '0')} p${page}` };
    add('bot', `<p>An address, read rung by rung:</p>${rungs}
      <h4>Syntax</h4><p><code>book.cgi?</code><i>hexagon</i><code>-w</code><i>wall</i><code>-s</code><i>shelf</i><code>-v</code><i>volume</i><code>:</code><i>page</i>, a GET request of ${fmt(url.length)} characters here. ${long
        ? `Names longer than ${fmt(GET_LIMIT)} characters cannot be opened with GET in every browser (the site says so on its Reference Hex page), so I am sending it the way the site's own results do: <code>POST book.cgi</code> with the fields <code>hex</code>, <code>wall</code>, <code>shelf</code>, <code>volume</code> and <code>page</code>.`
        : 'Opening it on the site below.'}</p>`);
    frameWrap.hidden = false; panel.classList.add('framed'); backBtn.hidden = true;
    frameTitle.innerHTML = `<b>libraryofbabel.info</b> · ${esc(last.label)}`;
    awaiting = true;
    if (post) { fillBook(bookForm, post); bookForm.submit(); } else frame.src = url;
  }

  function fillBook(form, post) { for (const k of Object.keys(post)) form.elements[k].value = post[k]; }

  function showRandom() {
    const url = `${SITE}random.cgi`;
    last = { kind: 'random', url, label: 'a random page' };
    add('bot', `<p>Opening <code>${esc(url)}</code>: the site picks a page at random. Almost every page is noise, which is the point; the address above the page is its only name.</p>`);
    frameWrap.hidden = false; panel.classList.add('framed'); backBtn.hidden = true;
    frameTitle.innerHTML = `<b>libraryofbabel.info</b> · a random page`;
    awaiting = true; frame.src = url;
  }

  function help() {
    add('bot', `<p>Three things I can do:</p><dl>
      <dt>text</dt><dd>any text up to 3,200 characters: I show how the Library reads it and run the site's exact-match search</dd>
      <dt>address</dt><dd><code>hex-w1-s2-v03:45</code> or a full <code>book.cgi?…</code> URL: I decode each rung and open the page</dd>
      <dt>random</dt><dd>the site's random page</dd></dl>`);
  }

  // ----- open / close -----
  function open() { if (!panel) build(); panel.hidden = false; setTimeout(() => ta.focus({ preventScroll: true }), 30); }
  function close() { if (panel) panel.hidden = true; }

  function wire() {
    document.querySelectorAll('[data-librarian]').forEach(b => b.addEventListener('click', open));
    build();   // the panel exists (hidden) from the start so the phone button and deep links work; the site is contacted only on a request
    if (/(^|[#&])librarian(=|&|$)/.test(location.hash)) open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  window.MINDBLOWN_LIBRARIAN = { open, close, read: readAsLibrary };
})();
