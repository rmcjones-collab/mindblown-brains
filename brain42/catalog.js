/* MindBlown — catalog of published networks and brains, read by compose.js (the Networks panel).
   Public data only: every entry here is a published site. A private repo adds its own entries locally through
   window.MINDBLOWN_CATALOG_EXTRA = [{ id, title, short, host, brains: [...] }] (same shape) instead of editing this file.
   Each brain's data file assigns window.MINDBLOWN = {...} in the shared contract; `data` and `href` are relative to `host`. */
window.MINDBLOWN_CATALOG = {
  networks: [
    { id: 'deepanswers', title: 'Deep Answers', short: 'Deep Answers', host: 'https://rmcjones-collab.github.io/mindblown-brains/deepanswers/', brains: [
      { id: 'physics',    title: 'Physics',     short: 'Physics',    color: '#ff8a3d', data: 'physics-data.js',    href: 'physics.html' },
      { id: 'cosmos',     title: 'Cosmology',   short: 'Cosmos',     color: '#60a5fa', data: 'cosmos-data.js',     href: 'cosmos.html' },
      { id: 'life',       title: 'Life',        short: 'Life',       color: '#4ade80', data: 'life-data.js',       href: 'life.html' },
      { id: 'mind',       title: 'Mind',        short: 'Mind',       color: '#c084fc', data: 'mind-data.js',       href: 'mind.html' },
      { id: 'math',       title: 'Mathematics', short: 'Math',       color: '#f472b6', data: 'math-data.js',       href: 'math.html' },
      { id: 'philosophy', title: 'Philosophy',  short: 'Philosophy', color: '#2dd4bf', data: 'philosophy-data.js', href: 'philosophy.html' }
    ] },
    { id: 'demo', title: 'MindBlown demo', short: 'demo', host: 'https://rmcjones-collab.github.io/mindblown-demo/', brains: [
      { id: 'projects',    title: 'Projects',    short: 'Projects',    color: '#ff8a3d', data: 'data.js',             href: 'index.html',       fictional: true },
      { id: 'life',        title: 'Life',        short: 'Life',        color: '#4ade80', data: 'life-data.js',        href: 'life.html',        fictional: true },
      { id: 'programming', title: 'Programming', short: 'Programming', color: '#60a5fa', data: 'programming-data.js', href: 'programming.html', fictional: true }
    ] },
    { id: 'gta', title: 'GTA network', short: 'GTA', host: 'https://gtabrain.pplx.app', brains: [
      { id: 'gta', title: 'Grand Theft Auto', short: 'GTA', color: '#ff8a3d', data: 'gta-data.js', href: 'gta.html' },
      { id: 'leo', title: "Leo's Black Book", short: 'Leo', color: '#f1e6c8', data: 'leo-data.js', href: 'leo.html' }
    ] },
    { id: 'brain42', title: 'Brain 42', short: '42', host: 'https://rmcjones-collab.github.io/mindblown-brains/brain42/', brains: [
      { id: 'brain42', title: '42', short: '42', color: '#fde68a', data: 'data/brain42-data.js', href: 'index.html' }   // published as brain42.pplx.app/index.html (build-publication renames the page)
    ] },
    { id: 'codex', title: 'Codex', short: 'Codex', host: 'https://codexbrain.pplx.app', brains: [   // decipherment research; public sources only, no decipherment claimed
      { id: 'codex', title: 'Codex Brain', short: 'Codex', color: '#dfb97a', data: 'index-data.js', href: 'index.html' },
      { id: 'voynich', title: 'Voynich Manuscript', short: 'Voynich', color: '#dfb97a', data: 'voynich-data.js', href: 'voynich.html' },
      { id: 'lorenz', title: 'Lorenz / Tunny', short: 'Lorenz', color: '#86bcc6', data: 'lorenz-data.js', href: 'lorenz.html' },
      { id: 'purple', title: 'PURPLE', short: 'PURPLE', color: '#86bcc6', data: 'purple-data.js', href: 'purple.html' },
      { id: 'typex', title: 'TypeX', short: 'TypeX', color: '#86bcc6', data: 'typex-data.js', href: 'typex.html' },
      { id: 'sigaba', title: 'SIGABA', short: 'SIGABA', color: '#86bcc6', data: 'sigaba-data.js', href: 'sigaba.html' },
      { id: 'vigenere', title: 'Vigenère Cipher', short: 'Vigenère', color: '#86bcc6', data: 'vigenere-data.js', href: 'vigenere.html' },
      { id: 'zimmermann', title: 'Zimmermann Telegram', short: 'Zimmermann', color: '#86bcc6', data: 'zimmermann-data.js', href: 'zimmermann.html' },
      { id: 'navajo', title: 'Navajo Code Talkers', short: 'Navajo', color: '#86bcc6', data: 'navajo-data.js', href: 'navajo.html' },
      { id: 'enigma', title: 'Enigma & the Bombe', short: 'Enigma', color: '#86bcc6', data: 'enigma-data.js', href: 'enigma.html' },
      { id: 'turing', title: 'Alan Turing', short: 'Turing', color: '#aab9df', data: 'turing-data.js', href: 'turing.html' },
      { id: 'welchman', title: 'Gordon Welchman', short: 'Welchman', color: '#aab9df', data: 'welchman-data.js', href: 'welchman.html' },
      { id: 'rejewski', title: 'Marian Rejewski', short: 'Rejewski', color: '#aab9df', data: 'rejewski-data.js', href: 'rejewski.html' },
      { id: 'rozycki', title: 'Jerzy Różycki', short: 'Różycki', color: '#aab9df', data: 'rozycki-data.js', href: 'rozycki.html' },
      { id: 'zygalski', title: 'Henryk Zygalski', short: 'Zygalski', color: '#aab9df', data: 'zygalski-data.js', href: 'zygalski.html' },
      { id: 'elizebeth', title: 'Elizebeth Smith Friedman', short: 'Friedman', color: '#aab9df', data: 'elizebeth-data.js', href: 'elizebeth.html' },
      { id: 'grotjan', title: 'Genevieve Grotjan', short: 'Grotjan', color: '#aab9df', data: 'grotjan-data.js', href: 'grotjan.html' },
      { id: 'tutte', title: 'Bill Tutte', short: 'Tutte', color: '#aab9df', data: 'tutte-data.js', href: 'tutte.html' },
      { id: 'methods', title: 'Methods & Evidence', short: 'Methods', color: '#a9c89a', data: 'methods-data.js', href: 'methods.html' }
    ] }
  ]
};
