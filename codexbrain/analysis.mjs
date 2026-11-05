/* Shared browser/Node implementation. No network, storage or user-data access. */
export const VERSION = 'codex-analysis-1.0.0';
export function fnv(s) {
  let h=2166136261;
  for(const c of s) h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
  return h;
}
export function random(seed) {
  let x=seed>>>0||1;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
export function shuffle(a,rng) {
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
export function groupFor(folio) {
  if(folio==='fRos')return 'f85-86';
  const m=/^f(\d+)/.exec(folio);
  if(!m) throw new Error('Unsupported folio ID: '+folio);
  return +m[1]===85||+m[1]===86?'f85-86':'f'+m[1];
}
export function partitionFor(folio) {
  return fnv(groupFor(folio)+'|codex-split-v1')%5===0?'heldout':'development';
}
export function parseIVTFF(text,id) {
  if(!text.startsWith('#=IVTFF')) throw new Error('Missing IVTFF header');
  const pages=[],loci=[],seen=new Set(),warnings=[];
  let current=null;
  for(const [i,line] of text.split(/\r?\n/).entries()){
    if(!line.trim()||line.startsWith('#'))continue;
    const p=/^<(f(?:\d+[rv]\d*|Ros))>\s*(.*)$/.exec(line);
    if(p){
      if(pages.some(x=>x.id===p[1]))throw new Error('Duplicate page '+p[1]);
      current={id:p[1],group:groupFor(p[1]),partition:partitionFor(p[1]),metadata:Object.fromEntries([...p[2].matchAll(/\$([A-Z])=([^\s>]+)/g)].map(m=>[m[1],m[2]]))};
      pages.push(current);continue;
    }
    const m=/^<([^,>]+),([^>]+)>\s*(.*)$/.exec(line);
    if(!m)throw new Error(`Unparsed non-comment line ${i+1}: ${line.slice(0,80)}`);
    const folio=m[1].split('.')[0];
    if(!current||folio!==current.id)throw new Error('Locus/page mismatch '+m[1]);
    if(seen.has(m[1]))throw new Error('Duplicate locus '+m[1]);
    seen.add(m[1]);
    loci.push({id:m[1],locator:`<${m[1]},${m[2]}>`,folio,type:m[2].slice(1),raw:m[3],sourceLine:i+1});
  }
  if(!loci.length)throw new Error('No loci parsed');
  return {id,header:text.split(/\r?\n/)[0],pages,loci,warnings};
}
export function project(raw,policy='strict') {
  if(!['strict','first-reading'].includes(policy))throw new Error('Unknown projection');
  let t=raw.replace(/<![^>]*>/g,'').replace(/<[%$]>/g,'').replace(/<->/g,'.|.').replace(/\s+/g,'');
  if(policy==='first-reading')t=t.replace(/\[([^\[\]]+)\]/g,(_,v)=>v.split(':')[0]).replace(/[{}]/g,'').toLowerCase().replace(/,/g,'.');
  const runs=[],rejected=[];let run=[],candidates=0;
  const flush=()=>{if(run.length)runs.push(run);run=[];};
  for(const token of t.split('.')){
    if(!token)continue;
    if(token==='|'){flush();continue;}
    candidates++;
    if(/^[a-z]+$/.test(token))run.push(token);
    else{rejected.push(token);flush();}
  }
  flush();
  return {runs,rejected,candidates,retained:runs.reduce((s,r)=>s+r.length,0)};
}
export function corpusData(corpus,policy,partition,common) {
  const pages=new Map(),coverage={loci:0,candidates:0,retained:0,rejected:0,folios:[],groups:[]};
  for(const l of corpus.loci){
    if(l.type!=='P0'||!common.has(l.id)||partitionFor(l.folio)!==partition)continue;
    const p=project(l.raw,policy);coverage.loci++;coverage.candidates+=p.candidates;coverage.retained+=p.retained;coverage.rejected+=p.rejected.length;
    if(!pages.has(l.folio))pages.set(l.folio,[]);
    pages.get(l.folio).push(...p.runs);
  }
  coverage.folios=[...pages.keys()].sort();
  coverage.groups=[...new Set(coverage.folios.map(groupFor))].sort();
  return {pages:[...pages].map(([folio,runs])=>({folio,runs})),coverage};
}
export function repeatStat(pages) {
  let equal=0,total=0;
  for(const p of pages)for(const r of p.runs)for(let i=1;i<r.length;i++){total++;if(r[i]===r[i-1])equal++;}
  return {value:total?equal/total:null,pairs:total,equal};
}
function entropyFrom(counts,totals) {
  let h=0,n=0;
  for(let i=0;i<26;i++)n+=totals[i];
  if(!n)return null;
  for(let i=0;i<676;i++)if(counts[i])h-=counts[i]/n*Math.log2(counts[i]/totals[Math.floor(i/26)]);
  return h;
}
function encodeWords(pages) {return pages.flatMap(p=>p.runs.flat()).map(w=>Uint8Array.from(w,c=>c.charCodeAt(0)-97));}
function entropyWords(words,rng=null) {
  const counts=new Uint32Array(676),totals=new Uint32Array(26);
  for(const original of words){
    const w=rng?shuffle(original.slice(),rng):original;
    for(let i=1;i<w.length;i++){counts[w[i-1]*26+w[i]]++;totals[w[i-1]]++;}
  }
  return entropyFrom(counts,totals);
}
export function entropyStat(pages){return entropyWords(encodeWords(pages));}
const round=n=>n===null?null:Math.round(n*1e10)/1e10;
export function holm(values) {
  const order=values.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p||a.i-b.i),out=[];let prev=0;
  order.forEach((x,k)=>{prev=Math.max(prev,Math.min(1,x.p*(values.length-k)));out[x.i]=round(prev);});
  return out;
}
export async function runSuite(corpora,protocol,onProgress=()=>{},yieldControl=null) {
  if(protocol.algorithm!==VERSION||protocol.permutations!==499||protocol.seed!==4082026)throw new Error('Protocol differs from the frozen implementation');
  const common=new Set(corpora[0].loci.filter(l=>l.type==='P0').map(l=>l.id));
  for(const c of corpora.slice(1)){const ids=new Set(c.loci.filter(l=>l.type==='P0').map(l=>l.id));for(const id of common)if(!ids.has(id))common.delete(id);}
  const rows=[];
  for(const source of protocol.sources)for(const policy of protocol.policies)for(const partition of protocol.partitions){
    const corpus=corpora.find(c=>c.id===source);
    if(!corpus)throw new Error('Missing source '+source);
    const data=corpusData(corpus,policy,partition,common),words=encodeWords(data.pages);
    const bags=data.pages.map(p=>({bag:p.runs.flat(),lengths:p.runs.map(r=>r.length)}));
    for(const test of protocol.tests){
      const key=[source,policy,partition,test.id].join('|'),seed=(protocol.seed^fnv(key))>>>0,rng=random(seed);
      const observed=test.id==='repeat'?repeatStat(data.pages).value:entropyWords(words);
      if(observed===null)throw new Error('Insufficient pairs: '+key);
      const nulls=[];
      for(let b=0;b<protocol.permutations;b++){
        let v;
        if(test.id==='entropy')v=entropyWords(words,rng);
        else{
          let equal=0,total=0;
          for(const p of bags){const bag=shuffle(p.bag.slice(),rng);let offset=0;for(const len of p.lengths){for(let j=1;j<len;j++){total++;if(bag[offset+j]===bag[offset+j-1])equal++;}offset+=len;}}
          v=total?equal/total:0;
        }
        nulls.push(v);
        if(b%25===0){onProgress({completed:rows.length,total:16,comparison:key,permutation:b+1});if(yieldControl)await yieldControl();}
      }
      const extreme=nulls.filter(v=>test.tail==='upper'?v>=observed:v<=observed).length;
      const mean=nulls.reduce((s,v)=>s+v,0)/nulls.length;
      nulls.sort((a,b)=>a-b);
      rows.push({key,source,policy,partition,test:test.id,seed,observed:round(observed),nullMean:round(mean),effect:round(observed-mean),nullRange:[round(nulls[Math.floor(.025*(nulls.length-1))]),round(nulls[Math.floor(.975*(nulls.length-1))])],extreme,permutations:protocol.permutations,p:round((extreme+1)/(nulls.length+1)),coverage:data.coverage});
      onProgress({completed:rows.length,total:16,comparison:key,permutation:protocol.permutations});
    }
  }
  const adjusted=holm(rows.map(r=>r.p));rows.forEach((r,i)=>{r.pHolm=adjusted[i];r.rejectNull=r.pHolm<=.05;});
  return {schema:'codex-results/v1',algorithm:VERSION,protocol:protocol.id,commonParagraphLoci:common.size,comparisons:rows};
}
