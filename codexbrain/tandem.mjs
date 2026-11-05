// Codex · In tandem. Read-only partnership with Deep Answers, Babel Fish and the AI Hub.
// Partner content is rendered with textContent only; every link is checked against an https allowlist.
import {project} from './analysis.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=text;if(cls)e.className=cls;return e;};
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const HOSTS=['deepanswers.pplx.app','babelfish.pplx.app','hubbrain.pplx.app'];
function safeHref(u,peerOnly=false){
  try{const x=new URL(u);if(x.protocol!=='https:')return null;if(peerOnly&&!HOSTS.includes(x.hostname))return null;return x.href;}catch{return null;}
}
function link(href,text,cls,peerOnly=false){const ok=safeHref(href,peerOnly);const a=el(ok?'a':'span',text,cls);if(ok){a.href=ok;a.target='_blank';a.rel='noopener noreferrer';}return a;}
const hostLabel=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch{return 'source';}};

let manifest,snapshot,catalog,corpusCache=null,liveIndex=null;
const PEER_META={deepanswers:{tag:'DA'},babelfish:{tag:'BF'},hub:{tag:'HUB'}};
const PROBLEMS=[
  {id:'voynich',title:'Voynich Manuscript',codex:['voynich','methods'],deep:'cipher/voynich',babel:['s/types','a/grapheme','a/word','a/morpheme','babel/universals','babel/swadesh'],summary:'Codex holds two transliterations and fixed structural tests. Deep Answers asks whether the text is language, cipher or hoax. Babel Fish describes what sign inventories and word structure look like in known writing systems.'},
  {id:'kryptos',title:'Kryptos K4',codex:['vigenere','methods'],deep:'cipher/kryptos',babel:['a/grapheme','a/word'],summary:'A known answer without a known method is the open question Deep Answers poses. Codex contributes polyalphabetic cryptanalysis as a documented comparison case, not as a claimed route to K4.'},
  {id:'beale',title:'Beale ciphers',codex:['methods'],deep:'cipher/beale',babel:['a/word','babel/count'],summary:'Book-cipher claims depend on a key text. Codex contributes the evidence protocol: which document, which edition, and what would count against the story.'},
  {id:'dorabella',title:'Dorabella cipher',codex:['methods'],deep:'cipher/dorabella',babel:['a/grapheme','s/types'],summary:'A short symbol string gives little statistical purchase. Babel Fish supplies how few or many signs real scripts need; Codex supplies the limits of short-text measurement.'},
  {id:'tamam',title:'Tamam Shud code',codex:['methods'],deep:'cipher/tamam',babel:['a/word','a/utterance'],summary:'Letters that may be initials, a code or nothing. The partnership here is mostly about restraint: what a dozen letters can and cannot support.'},
  {id:'zodiac',title:'Zodiac Z13 and Z32',codex:['methods','vigenere'],deep:'cipher/zodiac',babel:['a/grapheme'],summary:'Homophonic substitution was readable at 340 characters; the remaining texts are far shorter. Codex contributes how substitution ciphers were historically broken and why length matters.'},
  {id:'survive',title:'Why do some ciphers survive?',codex:['methods','enigma','lorenz','purple'],deep:'cipher/why',babel:['babel/translation','a/word'],summary:'Deep Answers asks why some ciphers outlast every attack. Codex answers with the systems that did not survive: Enigma, Lorenz and PURPLE were broken through operator habit, captured material and statistical structure.'}
];
// Figures quoted from Babel Fish pages for the sign-inventory comparison. Each is re-read from the snapshot text.
const INVENTORIES=[
  {page:'s/latin',label:'Latin alphabet',pattern:/(\d+)\s+letters/i,kind:'alphabet'},
  {page:'s/arabic',label:'Arabic script',pattern:/(\d+)\s+letters/i,kind:'abjad'},
  {page:'s/cyrillic',label:'Cyrillic (Russian)',pattern:/(\d+)\s+letters/i,kind:'alphabet'},
  {page:'s/kana',label:'Kana (each syllabary)',pattern:/(\d+)\s+basic signs/i,kind:'syllabary'},
  {page:'s/han',label:'Chinese characters (everyday reading)',pattern:/about\s+([\d,]+)\s+cover/i,kind:'logography'}
];

function tab(which){
  for(const id of ['board','checks','search','contribute']){$(id+'-view').hidden=id!==which;$(id+'-tab').setAttribute('aria-pressed',String(id===which));}
}
for(const id of ['board','checks','search','contribute'])$(id+'-tab').onclick=()=>tab(id);

function factNode(f,opts={}){
  const s=el('section',undefined,'fact');
  if(opts.status)s.append(el('small',opts.status));
  s.append(el('h4',f.lead));s.append(el('p',f.text));
  const cites=el('div',undefined,'cites');
  for(const c of (f.cites||[]))cites.append(link(c,hostLabel(c)+' ↗'));
  if(opts.open)cites.append(link(opts.open,opts.openLabel||'Open neuron ↗','open',true));
  if(cites.childElementCount)s.append(cites);
  return s;
}
function pageBlock(p,attribution){
  const wrap=document.createDocumentFragment();
  wrap.append(el('p',attribution,'attrib'));
  const head=el('section',undefined,'fact');head.append(el('h4',p.title));if(p.desc)head.append(el('p',p.desc));
  const c=el('div',undefined,'cites');c.append(link(p.url,'Open in '+hostLabel(p.url)+' ↗','open',true));head.append(c);wrap.append(head);
  for(const f of p.facts.slice(0,4))wrap.append(factNode(f));
  return wrap;
}
function renderPartners(){
  const box=$('partners');box.replaceChildren();
  for(const [id,p] of Object.entries(snapshot.peers)){
    const card=el('article',undefined,'partner');
    const h=el('h3');h.append(el('span',p.title||id));
    const status=el('span',p.access||'unknown','status '+(p.pages?.length?(/public/.test(p.access)?'ok':'warn'):'bad'));status.id='status-'+id;h.append(status);card.append(h);
    card.append(el('div',p.protocol||'','proto'));
    const dl=el('dl');
    const add=(k,v)=>{dl.append(el('dt',k));const dd=el('dd');if(v instanceof Node)dd.append(v);else dd.textContent=v;dl.append(dd);};
    add('Host',p.host||'');add('Relayed pages',String(p.pages?.length||0));add('Fetched',(p.fetched||'').slice(0,10));
    if(id==='deepanswers'&&p.brains)add('Brains',Object.values(p.brains).map(b=>b.title).join(', '));
    if(id==='hub')add('Hub holds',`${p.brains?.length||0} visible brains by ${p.agents?.length||0} agents · ${p.registry?.length||0} shared ids · ${p.links?.length||0} active links`);
    if(p.provenance)add('Pinned data',p.provenance.commit.slice(0,12)+' · '+p.provenance.bytes.toLocaleString()+' bytes');
    const live=el('span','not checked');live.id='live-'+id;add('Live state',live);
    card.append(dl);
    if(p.note)card.append(el('p',p.note,'small'));
    card.append(link(p.host,'Visit '+hostLabel(p.host||'')+' ↗','small',true));
    box.append(card);
  }
}
function renderBoard(){
  const sel=$('problem');sel.replaceChildren();
  for(const p of PROBLEMS){const o=el('option',p.title);o.value=p.id;sel.append(o);}
  sel.onchange=()=>showProblem(sel.value);
  const wanted=new URLSearchParams(location.search).get('problem');
  sel.value=PROBLEMS.some(p=>p.id===wanted)?wanted:'voynich';showProblem(sel.value);
}
function showProblem(id){
  const prob=PROBLEMS.find(p=>p.id===id)||PROBLEMS[0];
  const sum=$('problem-summary');sum.replaceChildren(el('p',prob.summary));
  const codexLinks=el('p');for(const s of prob.codex){const sub=catalog.subjects.find(x=>x.id===s);if(sub){const a=el('a',sub.name+' brain ↗');a.href='./'+encodeURIComponent(sub.id)+'.html';codexLinks.append(a,' ');}}
  const tandemLink=el('a','Voynich tandem checks ↗');tandemLink.href='#checks';tandemLink.onclick=e=>{e.preventDefault();tab('checks');};
  if(prob.id==='voynich')codexLinks.append(tandemLink);sum.append(codexLinks);
  // Deep Answers
  const deep=$('col-deep-body');deep.replaceChildren();
  const dp=snapshot.peers.deepanswers?.pages?.find(p=>p.id===prob.deep);
  if(dp)deep.append(pageBlock(dp,`Quoted from Deep Answers · ${dp.brainTitle} brain · ${dp.lobeName}`));
  else deep.append(el('p','This question is not in the relayed Deep Answers snapshot.','small'));
  const why=snapshot.peers.deepanswers?.pages?.filter(p=>p.id!==prob.deep&&p.lobe!=='cipher')||[];
  if(why.length){deep.append(el('p','Standards of evidence the network applies across its questions','attrib'));for(const p of why.slice(0,3)){const s=el('section',undefined,'fact');s.append(el('h4',p.title));s.append(el('p',p.desc));const c=el('div',undefined,'cites');c.append(link(p.url,p.brainTitle+' brain ↗','open',true));s.append(c);deep.append(s);}}
  // Codex
  const cx=$('col-codex-body');cx.replaceChildren();
  for(const sid of prob.codex){
    const sub=catalog.subjects.find(x=>x.id===sid);if(!sub)continue;
    cx.append(el('p',`Codex · ${sub.name} · ${sub.status}`,'attrib'));
    for(const f of sub.facts.slice(0,sid===prob.codex[0]?4:2)){
      const src=f[2]?catalog.sources[f[2]]:null;
      cx.append(factNode({lead:f[0],text:f[1],cites:src?[src[1]]:[]},{status:f[3]}));
    }
  }
  // Babel Fish
  const bf=$('col-babel-body');bf.replaceChildren();
  const bpages=prob.babel.map(id=>snapshot.peers.babelfish?.pages?.find(p=>p.id===id)).filter(Boolean);
  if(!bpages.length)bf.append(el('p','No Babel Fish pages relayed for this problem.','small'));
  for(const p of bpages){bf.append(el('p',`Quoted from Babel Fish · ${p.lobeName}`,'attrib'));const s=el('section',undefined,'fact');s.append(el('h4',p.title));s.append(el('p',p.desc));const c=el('div',undefined,'cites');for(const u of p.facts.flatMap(f=>f.cites).filter((x,i,a)=>a.indexOf(x)===i).slice(0,3))c.append(link(u,hostLabel(u)+' ↗'));c.append(link(p.url,'Open neuron ↗','open',true));s.append(c);bf.append(s);}
  // Hub
  const hub=$('col-hub-body');hub.replaceChildren();
  const hpages=snapshot.peers.hub?.pages||[];
  if(!hpages.length)hub.append(el('p','No AI Hub pages relayed.','small'));
  for(const p of hpages.slice(0,6)){hub.append(el('p',`Published on the AI Hub by ${p.agent||'an agent'} · ${p.brainTitle}`,'attrib'));const f=p.facts[0];const s=el('section',undefined,'fact');s.append(el('h4',p.title));s.append(el('p',f?f.text:p.desc));const c=el('div',undefined,'cites');for(const u of (f?.cites||[]).slice(0,2))c.append(link(u,hostLabel(u)+' ↗'));c.append(link(p.url,'Open on the hub ↗','open',true));s.append(c);hub.append(s);}
  hub.append(el('p','These are the agents’ own statements about evidence and uncertainty. Codex uses them as working rules, not as facts about any cipher.','small'));
}

// ---------- Tandem checks (Voynich) ----------
async function loadCorpora(){
  if(corpusCache)return corpusCache;
  const bytes=async path=>{const r=await fetch(path);if(!r.ok)throw new Error('Unable to load '+path+' ('+r.status+')');return new Uint8Array(await r.arrayBuffer());};
  const cm=JSON.parse(new TextDecoder().decode(await bytes('./corpus/manifest.json')));const corpora=[];
  for(const s of cm.sources){
    const parsed=await bytes('./corpus/'+s.id+'.json');
    if(await sha(parsed)!==s.parsedSha256)throw new Error('Corpus integrity check failed for '+s.id);
    corpora.push(JSON.parse(new TextDecoder().decode(parsed)));
  }
  corpusCache={manifest:cm,corpora};return corpusCache;
}
function measure(corpus,policy){
  const chars=new Map(),types=new Map(),lengths=new Map();let tokens=0,loci=0,rejected=0;
  for(const l of corpus.loci){
    if(l.type!=='P0')continue;loci++;
    const p=project(l.raw,policy);rejected+=p.rejected.length;
    for(const run of p.runs)for(const t of run){tokens++;types.set(t,(types.get(t)||0)+1);lengths.set(t.length,(lengths.get(t.length)||0)+1);for(const ch of t)chars.set(ch,(chars.get(ch)||0)+1);}
  }
  const mean=tokens?[...lengths].reduce((s,[k,v])=>s+k*v,0)/tokens:0;
  return {id:corpus.id,loci,tokens,types:types.size,rejected,inventory:[...chars].sort((a,b)=>b[1]-a[1]),lengths:[...lengths].sort((a,b)=>a[0]-b[0]),mean};
}
function quotedInventories(){
  const pages=snapshot.peers.babelfish?.pages||[];
  return INVENTORIES.map(spec=>{
    const p=pages.find(x=>x.id===spec.page);if(!p)return {...spec,value:null,quote:'page not in snapshot',url:null};
    const texts=[p.desc,...p.facts.map(f=>f.lead+': '+f.text)];
    for(const t of texts){const m=t.match(spec.pattern);if(m)return {...spec,value:Number(m[1].replace(/,/g,'')),quote:t,url:p.url,cites:p.facts.flatMap(f=>f.cites)};}
    return {...spec,value:null,quote:'figure not found in snapshot text',url:p.url};
  });
}
async function runCheck(){
  const policy=$('check-projection').value;$('run-check').disabled=true;$('check-status').textContent='Verifying corpus hashes and measuring…';
  try{
    const {corpora}=await loadCorpora();const results=corpora.map(c=>measure(c,policy));
    const box=$('check-results');box.replaceChildren();
    for(const r of results){
      const card=el('article',undefined,'check-card');card.append(el('h3',`Codex corpus ${r.id} · ${policy==='strict'?'strict projection':'first-reading projection'}`));
      const m=el('div',undefined,'metrics');
      for(const [v,l] of [[r.inventory.length,'distinct EVA characters'],[r.tokens.toLocaleString(),'retained tokens'],[r.types.toLocaleString(),'token types'],[r.mean.toFixed(2),'mean token length'],[r.loci.toLocaleString(),'paragraph loci']]){const d=el('div');d.append(el('strong',String(v)));d.append(el('span',l));m.append(d);}
      card.append(m);
      card.append(el('p','Characters by frequency: '+r.inventory.map(([c,n])=>c+' '+n).join(' · '),'small'));
      card.append(el('p','Token length distribution','attrib'));const bars=el('div',undefined,'bars');const max=Math.max(...r.lengths.map(x=>x[1]));
      for(const [len,n] of r.lengths){if(len>14)continue;const b=el('div',undefined,'bar');b.append(el('span',String(len)));const i=el('i');i.style.width=(100*n/max).toFixed(1)+'%';b.append(i);b.append(el('span',(100*n/r.tokens).toFixed(1)+'%'));bars.append(b);}
      card.append(bars);card.append(el('p',`${r.rejected.toLocaleString()} uncertain or non-alphabetic tokens were rejected under this projection and are not counted.`,'small'));
      box.append(card);
    }
    // Babel Fish comparison
    const cmp=el('article',undefined,'check-card wide');cmp.append(el('h3','Babel Fish · documented sign inventories'));
    const inv=quotedInventories();const t=el('table');const thead=el('thead');const hr=el('tr');for(const h of ['Script','Type','Signs','Quoted from Babel Fish'])hr.append(el('th',h));thead.append(hr);t.append(thead);const tb=el('tbody');
    for(const i of inv){const tr=el('tr');tr.append(el('td',i.label));tr.append(el('td',i.kind));tr.append(el('td',i.value===null?'—':i.value.toLocaleString()));const td=el('td');td.append(el('span',i.quote.length>140?i.quote.slice(0,137)+'…':i.quote));td.append(' ');if(i.url)td.append(link(i.url,'neuron ↗','open',true));tr.append(td);tb.append(tr);}
    t.append(tb);cmp.append(t);
    const eva=results.map(r=>r.inventory.length);const lo=Math.min(...eva),hi=Math.max(...eva);
    const small=inv.filter(i=>i.value!==null&&i.kind!=='logography').map(i=>i.value);const logo=inv.find(i=>i.kind==='logography'&&i.value!==null);
    let reading=`Under the ${policy} projection the EVA transliteration uses ${lo===hi?lo:lo+'–'+hi} distinct characters across the two corpora.`;
    if(small.length)reading+=` Babel Fish documents ${Math.min(...small)}–${Math.max(...small)} signs for the alphabets, abjad and syllabaries it covers`+(logo?` and about ${logo.value.toLocaleString()} characters for everyday reading in a logography`:'')+'.';
    reading+=' EVA is a transliteration convention, so its character count bounds nothing about the manuscript’s own glyph set; the comparison shows the scale a sign inventory can take, not which system this is.';
    cmp.append(el('p',reading,'reading-line'));
    box.append(cmp);
    // Lexicon illustration
    const lex=snapshot.peers.babelfish?.lexicon;
    if(lex?.languages?.length){
      const card=el('article',undefined,'check-card wide');card.append(el('h3','Babel Fish · 30 shared meanings, written length per language'));
      card.append(el('p','Illustration only. Thirty words per language in their own script, counted in Unicode code points; the Codex figure counts EVA letters. Units differ, samples are tiny, and nothing here is a test.','small'));
      const t2=el('table');const h2=el('thead');const r2=el('tr');for(const h of ['Language','Script','Words','Mean length','Range'])r2.append(el('th',h));h2.append(r2);t2.append(h2);const b2=el('tbody');
      for(const L of lex.languages){const lens=L.words.map(w=>[...w.form.replace(/\s+/g,'')].length);const mean=lens.reduce((a,b)=>a+b,0)/lens.length;const tr=el('tr');const td=el('td');td.append(link(L.url,L.title,'',true));tr.append(td);tr.append(el('td',(L.script||'').replace(/^s\//,'')));tr.append(el('td',String(L.words.length)));tr.append(el('td',mean.toFixed(2)));tr.append(el('td',Math.min(...lens)+'–'+Math.max(...lens)));b2.append(tr);}
      const tr=el('tr');tr.append(el('td','Codex · Voynich EVA tokens'));tr.append(el('td','EVA (transliteration)'));tr.append(el('td',results.map(r=>r.types.toLocaleString()+' types').join(' / ')));tr.append(el('td',results.map(r=>r.mean.toFixed(2)).join(' / ')));tr.append(el('td','see distributions'));b2.append(tr);
      t2.append(b2);card.append(t2);box.append(card);
    }
    $('check-status').textContent=`Measured ${results.map(r=>r.id).join(' and ')} in this browser after verifying parsed-corpus hashes. Babel Fish figures are quoted from the pinned snapshot.`;
  }catch(e){$('check-status').textContent='Check failed: '+e.message;}
  finally{$('run-check').disabled=false;}
}
$('run-check').onclick=runCheck;

// ---------- Cross-brain search ----------
const STOP=new Set(['the','and','for','that','with','this','from','are','was','were','has','have','its','not','but','into','than','then','what','when','which','who','how','why','can','does','did','also','their','they','them','there','been','being','one','two','all','any','our','you','your']);
const tokens=s=>[...new Set(String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t.length>1&&!STOP.has(t)))];
function scoreText(q,fields){let score=0,hit=new Set();for(const t of q){for(const [text,w] of fields){const lower=String(text||'').toLowerCase();if(lower.includes(t)){score+=w;hit.add(t);}}}return hit.size?score*(1+0.75*(hit.size-1)):0;}
function rankIndex(index,q,limit){
  const scores=new Map(),hits=new Map();
  for(const t of q){const exact=index.index[t];if(exact){for(const [pi,sc] of exact){scores.set(pi,(scores.get(pi)||0)+sc);(hits.get(pi)||hits.set(pi,new Set()).get(pi)).add(t);}continue;}
    for(const key in index.index)if(key.startsWith(t))for(const [pi,sc] of index.index[key]){scores.set(pi,(scores.get(pi)||0)+sc/2);(hits.get(pi)||hits.set(pi,new Set()).get(pi)).add(t);}}
  return [...scores].map(([pi,s])=>({id:index.pages[pi],score:s*(1+0.75*(hits.get(pi).size-1)),terms:[...hits.get(pi)]})).sort((a,b)=>b.score-a.score).slice(0,limit);
}
function loadTwin(url,expect){
  // Deep Answers publishes no CORS headers, so its .js twins are the only in-browser read path. They are third-party code
  // from an allowlisted https host; each response is matched to the requested brain+endpoint, and failures are cleaned up.
  return new Promise((resolve,reject)=>{
    const href=safeHref(url,true);if(!href||!/\/api\/[a-z0-9/_-]+\.js$/.test(new URL(href).pathname))return reject(new Error('blocked url'));
    window.MINDBLOWN_API=window.MINDBLOWN_API||{receive(p){(window.MINDBLOWN_API.handlers||[]).forEach(h=>h(p));}};
    const handlers=window.MINDBLOWN_API.handlers=window.MINDBLOWN_API.handlers||[];
    const s=document.createElement('script');let timer=0;
    const done=(fn,v)=>{clearTimeout(timer);window.MINDBLOWN_API.handlers=handlers.filter(h=>h!==handler);s.remove();fn(v);};
    const handler=p=>{if(p&&p.protocol==='mindblown-brain/1'&&p.brain===expect.brain&&p.endpoint===expect.endpoint&&p.data&&typeof p.data==='object')done(resolve,p);};
    handlers.push(handler);
    s.src=href;s.async=true;s.referrerPolicy='no-referrer';s.onerror=()=>done(reject,new Error('could not load '+href));document.head.append(s);
    timer=setTimeout(()=>done(reject,new Error('timed out '+href)),15000);
  });
}
async function liveDeepAnswersIndex(){
  if(liveIndex)return liveIndex;
  const host=snapshot.peers.deepanswers.host;const index=(await loadTwin(host+'/api/index.js',{brain:'index',endpoint:'index'})).data;
  const brains=[];
  for(const b of index.brains){if(!/^[a-z0-9_-]+$/.test(b.id))continue;const search=(await loadTwin(host+'/api/'+b.id+'/v1/search.js',{brain:b.id,endpoint:'search'})).data;const pages=(await loadTwin(host+'/api/'+b.id+'/v1/pages.js',{brain:b.id,endpoint:'pages'})).data;brains.push({id:b.id,title:b.title,href:host+'/'+(b.href||b.id+'.html'),search,pages:new Map(pages.pages.map(p=>[p.id,p]))});}
  liveIndex={fetched:new Date().toISOString(),brains};return liveIndex;
}
let searchSeq=0;
async function crossSearch(){
  const raw=$('xq').value.trim(),q=tokens(raw),seq=++searchSeq,out=$('xresults');out.replaceChildren();
  if(!q.length)return;
  const group=(title,hits,empty)=>{const g=el('section',undefined,'xgroup');g.append(el('h3',title));if(!hits.length)g.append(el('p',empty,'small'));for(const h of hits){const d=el('div',undefined,'hit');d.append(el('strong',h.title));if(h.text)d.append(el('p',h.text));const w=el('p',undefined,'why');w.append(h.why||'');if(h.url){w.append(' ');w.append(h.internal?(()=>{const a=el('a','open ↗');a.href=h.url;return a;})():link(h.url,'open ↗','',true));}d.append(w);g.append(d);}return g;};
  // Codex
  const cx=[];for(const s of catalog.subjects){for(const f of s.facts){const sc=scoreText(q,[[s.name,6],[f[0],3],[f[1],1]]);if(sc)cx.push({score:sc,title:s.name+' · '+f[0],text:f[1],why:f[3],url:'./'+encodeURIComponent(s.id)+'.html',internal:true});}}
  out.append(group('Codex',cx.sort((a,b)=>b.score-a.score).slice(0,6),'No Codex fact matches.'));
  // Snapshot peers
  for(const [id,label] of [['deepanswers','Deep Answers (snapshot)'],['babelfish','Babel Fish (snapshot)'],['hub','AI Hub (snapshot)']]){
    const hits=[];for(const p of snapshot.peers[id]?.pages||[]){const sc=scoreText(q,[[p.title,6],[p.desc,2],...p.facts.flatMap(f=>[[f.lead,3],[f.text,1]])]);if(sc)hits.push({score:sc,title:p.title,text:p.desc,why:(p.brainTitle?p.brainTitle+' brain · ':'')+(p.lobeName||''),url:p.url});}
    if(id==='babelfish'){for(const L of snapshot.peers.babelfish?.lexicon?.languages||[])for(const w of L.words){if(q.some(t=>w.meaning.includes(t)||w.form.toLowerCase().includes(t)||(w.roman||'').toLowerCase().includes(t)))hits.push({score:4,title:`${w.form}${w.roman?' · '+w.roman:''}`,text:`${L.title.split(' · ')[0]} word for “${w.meaning}”`,why:'Shared-meaning lexicon',url:w.url});}}
    out.append(group(label,hits.sort((a,b)=>b.score-a.score).slice(0,6),'No match in the relayed snapshot.'));
  }
  if($('live-search').checked){
    const g=el('section',undefined,'xgroup');g.append(el('h3','Deep Answers (live index)'));g.append(el('p','Querying the published search index…','small'));out.append(g);
    try{const live=await liveDeepAnswersIndex();if(seq!==searchSeq)return;const hits=[];for(const b of live.brains)for(const h of rankIndex(b.search,q,3)){const p=b.pages.get(h.id);if(p)hits.push({score:h.score,title:p.title,text:p.desc,why:`${b.title} brain · matched ${h.terms.join(', ')}`,url:`${b.href}#n=${encodeURIComponent(p.id)}`});}
      g.replaceWith(group('Deep Answers (live index · '+live.fetched.slice(0,16).replace('T',' ')+' UTC)',hits.sort((a,b)=>b.score-a.score).slice(0,8),'No live match.'));
    }catch(e){if(seq===searchSeq)g.replaceWith(group('Deep Answers (live index)',[],'Live index unavailable: '+e.message));}
  }
}
let searchTimer;$('xq').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(crossSearch,250);};$('live-search').onchange=crossSearch;

// ---------- Live partner check ----------
async function checkLive(){
  $('check-live').disabled=true;
  const set=(id,text,cls)=>{const s=$('live-'+id);if(s){s.textContent=text;s.className=cls||'';}};
  try{const idx=(await loadTwin(snapshot.peers.deepanswers.host+'/api/index.js',{brain:'index',endpoint:'index'})).data;const changed=idx.brains.filter(b=>snapshot.peers.deepanswers.brains[b.id]&&b.hash!==snapshot.peers.deepanswers.brains[b.id].hash).map(b=>b.id);set('deepanswers',changed.length?'published hashes changed for: '+changed.join(', ')+' (snapshot is behind)':'live hashes match the snapshot for all '+idx.brains.length+' brains','status '+(changed.length?'warn':'ok'));}
  catch(e){set('deepanswers',(/could not load|timed out/.test(e.message)?'live index not readable from this origin (the host answered auth_required or did not answer); snapshot in use':'live check failed: '+e.message),'status warn');}
  try{await fetch(snapshot.peers.babelfish.host+'/babel-fish.html',{mode:'no-cors',referrerPolicy:'no-referrer'});set('babelfish','host reachable; it publishes no readable data for other origins, so the pinned data file is used','status warn');}
  catch{set('babelfish','host not reachable from this browser; pinned data in use','status warn');}
  try{const pr=snapshot.peers.hub.publicRead;const base=safeHref(pr&&pr.baseUrl);if(!base)throw new Error('no public read endpoint in snapshot');const u=base.replace(/\/$/,'')+'/rest/v1/ai_brains?select=id,updated_at&hidden=is.false';let r;for(let attempt=0;attempt<2;attempt++){try{r=await fetch(u,{headers:{apikey:pr.apikey},referrerPolicy:'no-referrer'});break;}catch(e){if(attempt)throw e;await new Promise(z=>setTimeout(z,800));}}if(!r.ok)throw new Error('HTTP '+r.status);const rows=await r.json();const snapIds=new Set(snapshot.peers.hub.brains.map(b=>b.id));const newer=rows.filter(x=>!snapIds.has(x.id)||x.updated_at>(snapshot.peers.hub.brains.find(b=>b.id===x.id)?.updated||'')).length;set('hub',`${rows.length} visible brains live; ${newer} new or updated since the snapshot`,'status '+(newer?'warn':'ok'));}
  catch(e){set('hub','live check failed: '+e.message,'status bad');}
  finally{$('check-live').disabled=false;}
}
$('check-live').onclick=checkLive;

// ---------- Contribution drafts ----------
let drafts=null;
async function buildDrafts(){
  const text=await (await fetch('./index-data.js')).text();const data=JSON.parse(text.replace(/^window\.MINDBLOWN\s*=\s*/,'').replace(/;\s*$/,''));
  const proto={shared_prefix:'shared/',pattern:/^shared\/[a-z0-9][a-z0-9/_-]{1,80}$/,limits:snapshot.peers.hub?.limits||{lobes:30,neurons:600,synapses:6000,bytes:1500000,link_weight:[1,5]}};
  // Shared problem ids: one per deciphering problem on the board.
  const registry=PROBLEMS.map(p=>({id:'shared/problem/'+p.id,title:p.title,type:'problem',description:p.summary.slice(0,280)}));
  // Hub brain payload: Codex overview with shared ids added for the centre and the problem neurons.
  const alias={codex:'shared/brain/codex',voynich:'shared/problem/voynich'};
  const re=id=>alias[id]||id;
  const brain={title:data.title,subtitle:data.subtitle,built:data.built,center:re(data.center),lobes:data.lobes.map(l=>({id:l.id,name:l.name,color:l.color,hidden:false})),
    pages:data.pages.map(p=>({id:re(p.id),title:p.title,type:p.type,lobe:p.lobe,parent:p.parent?re(p.parent):null,desc:p.desc,intro:p.intro,created:p.updated,updated:p.updated,synapses:p.synapses.map(s=>s.replace(/^[^#]+/,m=>re(m))),sources:p.sources})),
    synapses:data.synapses.map(s=>({id:s.id.replace(/^[^#]+/,m=>re(m)),page:re(s.page),lead:s.lead,text:s.text,section:s.section,links:s.links.map(re),cites:s.cites})),
    sources:data.sources.map(s=>({id:s.id,label:s.label,kind:'web',pages:s.pages.map(re)})),
    links:data.links.map(l=>({s:re(l.s),t:re(l.t),w:l.w,kinds:l.kinds,notes:l.notes})),synLinks:[],cocite:[]};
  const bytes=new TextEncoder().encode(JSON.stringify(brain)).length;
  const problems=[];
  if(brain.lobes.length>proto.limits.lobes)problems.push('too many lobes');if(brain.pages.length>proto.limits.neurons)problems.push('too many neurons');if(brain.synapses.length>proto.limits.synapses)problems.push('too many synapses');if(bytes>proto.limits.bytes)problems.push('payload too large');
  for(const r of registry)if(!proto.pattern.test(r.id))problems.push('bad shared id '+r.id);
  const publish={rpc:'ai_publish_brain',args:{p_key:'<owner-held agent key; not stored>',p_slug:'codex',p_title:'Codex · decipherment research',p_description:'Source-linked research network for undeciphered texts and historical codebreaking. Measures and tests; claims no decipherment. Mirrors the public Codex overview brain.',p_link_policy:'handshake',p_color:'#dfb97a',p_data:brain}};
  const hubPages=snapshot.peers.hub?.pages||[],hubBrains=snapshot.peers.hub?.brains||[];
  const pick=(slug,id)=>hubPages.find(p=>p.brain===slug&&p.id===id)?{brain:hubBrains.find(b=>b.slug===slug)?.id,neuron:id,title:hubPages.find(p=>p.brain===slug&&p.id===id).title}:null;
  const proposals=[
    ['methods',pick('claude','unc/calibration'),'Codex evidence-status labels apply the same calibration rule: say how sure, and why'],
    ['methods',pick('grok-public-knowledge','sources/reports'),'A reported decipherment is a report; Codex requires independent reproduction before it counts'],
    ['methods',pick('gpt-astra','network/evidence'),'Evidence first, then links: Codex connects brains only through cited facts'],
    ['voynich',pick('gpt-6-1-sol','validity/contamination'),'Held-out folio groups in the Codex tests guard against the same leakage the hub calls contamination'],
    ['methods',pick('gemini-4-argon','capabilities/search-grounding'),'Grounding in retrievable sources is the Codex rule for every fact']
  ].filter(([,to])=>to).map(([from,to,label])=>({rpc:'ai_link',args:{p_key:'<owner-held agent key; not stored>',p_from_brain:'<codex brain id after publish>',p_from_neuron:re(from),p_to_brain:to.brain,p_to_neuron:to.neuron,p_label:label,p_kind:'synapse',p_weight:2,p_to_key:null},to_title:to.title}));
  const peerEntry={file:'api.config.json (Deep Answers repository)',change:'append Codex public origin to "peers" once Codex has a stable public address',value:{peers:[...(snapshot.peers.deepanswers?.discovery?.peers||[]),'<codex public origin>']},note:'Also add the Deep Answers, Babel Fish and AI Hub origins to Codex’s own api.config.json peers; Codex’s Brain API is built alongside this page.'};
  drafts={schema:'codex-tandem-drafts/1',preparedAt:new Date().toISOString(),status:'draft · not sent · requires owner approval and an owner-held agent key',protocol:'mindblown-ai/1',validation:{bytes,lobes:brain.lobes.length,neurons:brain.pages.length,synapses:brain.synapses.length,withinLimits:!problems.length,problems},registry:registry.map(r=>({rpc:'ai_register_shared',args:{p_key:'<owner-held agent key; not stored>',p_id:r.id,p_title:r.title,p_type:r.type,p_description:r.description}})),publish,links:proposals,deepAnswersPeerEntry:peerEntry};
  return drafts;
}
function renderDrafts(){
  const box=$('drafts');box.replaceChildren();const d=drafts;
  const card=(title,items,pre)=>{const c=el('article',undefined,'draft');c.append(el('h3',title));const ul=el('ul');for(const i of items)ul.append(el('li',i));c.append(ul);if(pre)c.append(el('pre',pre));box.append(c);};
  card('Codex brain for the AI Hub',[`${d.validation.neurons} neurons · ${d.validation.synapses} synapses · ${d.validation.lobes} lobes · ${(d.validation.bytes/1024).toFixed(0)} KB`,d.validation.withinLimits?'Within the hub’s published limits':'Outside hub limits: '+d.validation.problems.join('; '),'Link policy: handshake (incoming links need Codex’s acceptance)','Centre id follows the hub convention shared/brain/codex'],JSON.stringify({rpc:d.publish.rpc,args:{...d.publish.args,p_data:'<'+d.validation.neurons+' neurons>'}},null,1));
  card('Shared problem ids',d.registry.map(r=>r.args.p_id+' · '+r.args.p_title),JSON.stringify(d.registry[0],null,1));
  card('Link proposals to hub brains',d.links.map(l=>`${l.args.p_from_neuron} → ${l.to_title}: ${l.args.p_label}`),JSON.stringify(d.links[0]||{},null,1));
  card('Deep Answers peer entry',[d.deepAnswersPeerEntry.change,d.deepAnswersPeerEntry.note],JSON.stringify(d.deepAnswersPeerEntry.value,null,1));
  $('draft-status').textContent='Drafts prepared locally at '+d.preparedAt.slice(0,19).replace('T',' ')+' UTC. Nothing was sent. Registration, publishing and linking require the owner’s approval.';
}
$('export-drafts').onclick=async()=>{try{if(!drafts)await buildDrafts();const blob=new Blob([JSON.stringify(drafts,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='codex-tandem-drafts.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('draft-status').textContent='Downloaded codex-tandem-drafts.json. Status: draft, not sent.';}catch(e){$('draft-status').textContent='Could not prepare drafts: '+e.message;}};

// ---------- Boot ----------
async function init(){
  manifest=await (await fetch('./tandem/manifest.json')).json();
  const raw=new Uint8Array(await (await fetch('./tandem/peers.json')).arrayBuffer());
  if(await sha(raw)!==manifest.sha256)throw new Error('Partner snapshot failed its integrity check');
  snapshot=JSON.parse(new TextDecoder().decode(raw));
  catalog=await (await fetch('./catalog.json')).json();
  const n=Object.values(snapshot.peers).reduce((s,p)=>s+(p.pages?.length||0),0);
  $('snapshot-note').textContent=`${n} relayed pages · snapshot ${snapshot.generated.slice(0,10)} · SHA-256 ${manifest.sha256.slice(0,12)}…`;
  renderPartners();renderBoard();
  try{await buildDrafts();renderDrafts();}catch(e){$('draft-status').textContent='Could not prepare drafts: '+e.message;}
  window.CODEX_TANDEM_READY=true;
}
init().catch(e=>{$('load-error').hidden=false;$('load-error').textContent=e.message+'. Reload to retry. The research desk and brains remain available.';$('snapshot-note').textContent='Partner snapshot unavailable.';});
