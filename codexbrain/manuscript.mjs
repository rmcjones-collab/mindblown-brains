import {project,runSuite} from './analysis.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const enc=s=>new TextEncoder().encode(s);
async function bytes(path){const r=await fetch(path);if(!r.ok)throw new Error('Unable to load '+path+' ('+r.status+')');return new Uint8Array(await r.arrayBuffer());}
const json=b=>JSON.parse(new TextDecoder().decode(b));
let manifest,corpora,protocol,archive,current,protocolHash,implementationHash,cancelled=false;
function tab(which){
  for(const id of ['browse','tests']){$(id+'-view').hidden=id!==which;$(id+'-tab').setAttribute('aria-pressed',String(id===which));}
}
$('browse-tab').onclick=()=>tab('browse');$('tests-tab').onclick=()=>tab('tests');
function imageCanvas(index){
  const c=manifest.canvases[index];if(!c)return;
  $('canvas').value=String(index);$('scan').hidden=true;$('scan').alt='Yale manuscript image: '+c.label;
  $('image-open').href=c.image;$('image-status').textContent='Loading Yale image…';
  let full=$('image-full');
  if(!full){full=el('a','Open full-resolution scan');full.id='image-full';full.className='small';full.target='_blank';full.rel='noopener noreferrer';$('image-status').after(full);}
  full.href=c.image;full.hidden=false;
  $('scan').onload=()=>{$('scan').hidden=false;$('image-status').textContent='Click the image to open the full-resolution Yale scan.';};
  $('scan').onerror=()=>{$('scan').hidden=true;$('image-status').textContent='The Yale image could not load. The catalog and full-resolution link remain available.';};
  $('scan').src=c.image.replace('/full/full/','/full/!1000,1400/');
}
function readings(){
  const folio=$('folio').value,policy=$('projection').value,query=$('reading-search').value.trim().toLowerCase(),container=$('loci');container.replaceChildren();
  const maps=corpora.map(c=>new Map(c.loci.filter(l=>l.folio===folio).map(l=>[l.id,l])));
  const ids=[...new Set(maps.flatMap(m=>[...m.keys()]))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  let shown=0;
  for(const id of ids){
    const ls=maps.map(m=>m.get(id));if(query&&!ls.some(l=>l?.raw.toLowerCase().includes(query)))continue;
    shown++;const row=el('section',undefined,'locus'),head=el('div',id+' · '+ls.filter(Boolean).map(l=>l.type).filter((x,i,a)=>a.indexOf(x)===i).join(' / '),'locus-title'),parallel=el('div',undefined,'parallel');row.append(head,parallel);
    ls.forEach((l,i)=>{
      const box=el('div',undefined,'reading');box.append(el('strong',corpora[i].id+' · '+(l?'source line '+l.sourceLine:'not transcribed here')));
      if(l){
        const p=project(l.raw,policy);box.append(el('pre',l.raw,'raw'),el('div',p.runs.map(r=>r.join(' ')).join(' | ')||'No retained tokens','projection'));
        box.append(el('p',`${p.retained} retained · ${p.rejected.length} rejected${l.type!=='P0'?' · excluded from fixed tests (non-P0)':''}`,'small'));
        if(p.rejected.length)box.append(el('div','Rejected: '+p.rejected.join(' · '),'projection rejected'));
      }else box.append(el('p','Missing reading. No text is inferred.','small'));
      parallel.append(box);
    });container.append(row);
  }
  if(!shown)container.append(el('p','No matching loci on this folio. Try a different search or folio.'));
  $('locus-count').textContent=shown+' / '+ids.length+' loci';
}
function folioChanged(){
  const f=$('folio').value,ps=corpora.map(c=>c.pages.find(p=>p.id===f)).filter(Boolean);
  $('folio-info').textContent=ps.map((p,i)=>`${p.id} · ${p.partition} · group ${p.group} · metadata ${Object.entries(p.metadata).map(([k,v])=>k+'='+v).join(' ')}`).filter((x,i,a)=>a.indexOf(x)===i).join(' | ');
  const side=f.replace(/\d+$/,''),candidates=manifest.canvases.filter(c=>f==='fRos'?c.label==='85v and 86r (foldout)':c.folioSides.includes(side));
  $('mapping').textContent=candidates.length?`${candidates.length} label-derived canvas candidate(s). Foldout panel coordinates are not aligned. You can select any of the 213 Yale canvases.`:'No exact label-derived canvas match. Choose a Yale canvas manually; no image alignment is inferred.';
  if(candidates.length)imageCanvas(candidates[0].index);
  else{$('scan').hidden=true;$('scan').removeAttribute('src');$('image-open').removeAttribute('href');if($('image-full'))$('image-full').hidden=true;$('image-status').textContent='No mapped scan selected.';}
  readings();
}
function renderResults(record){
  const tbody=$('result-rows');tbody.replaceChildren();
  for(const r of record.comparisons){
    const tr=el('tr');
    for(const s of [`${r.source} / ${r.policy}`,r.partition,r.test==='repeat'?'H1 repeat':'H2 entropy',r.observed.toFixed(6),r.nullMean.toFixed(6),r.effect.toFixed(6),r.p.toFixed(3),r.pHolm.toFixed(3),r.rejectNull?'Rejected':'Not rejected'])tr.append(el('td',s));
    tbody.append(tr);
  }
}
async function init(){
  manifest=json(await bytes('./corpus/manifest.json'));corpora=[];
  for(const s of manifest.sources){
    const raw=await bytes('./corpus/raw/'+s.file),parsed=await bytes('./corpus/'+s.id+'.json');
    if(await sha(raw)!==s.sha256||await sha(parsed)!==s.parsedSha256)throw new Error('Corpus integrity check failed for '+s.id);
    corpora.push(json(parsed));
  }
  const pb=await bytes('./corpus/protocol.json');protocol=json(pb);protocolHash=await sha(pb);
  implementationHash=await sha(await bytes('./analysis.mjs'));
  archive=json(await bytes('./corpus/results.json'));
  const {resultSha256,...content}=archive;
  if(await sha(enc(JSON.stringify(content)))!==resultSha256||archive.inputs.protocolSha256!==protocolHash||archive.inputs.implementationSha256!==implementationHash)throw new Error('Archived protocol, implementation or result hash does not match');
  if(JSON.stringify(archive.inputs.sources)!==JSON.stringify(manifest.sources.map(s=>({id:s.id,sha256:s.sha256,parsedSha256:s.parsedSha256}))))throw new Error('Archived corpus hashes differ');
  current=archive;renderResults(current);
  $('corpus-counts').replaceChildren();
  for(const [n,label] of [[manifest.canvases.length,'Yale image canvases'],[corpora[0].loci.length,'ZL source loci'],[corpora[1].loci.length,'IT source loci'],[archive.commonParagraphLoci,'shared paragraph loci']]){
    const d=el('div');d.append(el('strong',n.toLocaleString()),el('span',label));$('corpus-counts').append(d);
  }
  $('folio').replaceChildren();
  for(const f of [...new Set(corpora.flatMap(c=>c.pages.map(p=>p.id)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){const o=el('option',f);o.value=f;$('folio').append(o);}
  $('canvas').replaceChildren();
  for(const c of manifest.canvases){const o=el('option',c.label);o.value=c.index;$('canvas').append(o);}
  $('folio').disabled=$('canvas').disabled=false;$('folio').value='f1r';
  $('folio').onchange=folioChanged;$('canvas').onchange=()=>{imageCanvas(Number($('canvas').value));$('mapping').textContent='Manually selected canvas. No alignment to the displayed transcription is asserted.';};
  $('reading-search').oninput=readings;$('projection').onchange=readings;folioChanged();
  for(const text of protocol.limits)$('limitations').append(el('li',text));
  $('integrity-note').textContent='Verified source bytes, parsed corpus, protocol and implementation. Archived result SHA-256: '+archive.resultSha256;
  $('suite-status').textContent='Archived reference results loaded and hashes verified. Not yet rerun in this browser.';
  $('run-suite').disabled=$('export-suite').disabled=false;
}
$('run-suite').onclick=async()=>{
  cancelled=false;$('run-suite').disabled=$('export-suite').disabled=true;$('cancel-suite').hidden=false;$('suite-progress').hidden=false;$('suite-progress').value=0;
  try{
    const result=await runSuite(corpora,protocol,p=>{$('suite-progress').value=p.completed;$('suite-status').textContent=`${p.completed}/16 complete · ${p.comparison} · shuffle ${p.permutation}/499`;},async()=>{await new Promise(r=>setTimeout(r,0));if(cancelled)throw new Error('Run cancelled. Archived results are retained.');});
    result.inputs=archive.inputs;
    const record={...result,resultSha256:await sha(enc(JSON.stringify(result)))};
    current=record;renderResults(record);
    const exact=record.resultSha256===archive.resultSha256;
    $('suite-status').textContent=exact?'Verified: all 16 results match the archived Node run exactly at the recorded precision. No decipherment is implied.':'Completed, but the result hash differs from the archived run. Treat this as a reproducibility failure; do not promote the result.';
  }catch(e){$('suite-status').textContent=e.message;}
  finally{$('run-suite').disabled=$('export-suite').disabled=false;$('cancel-suite').hidden=true;}
};
$('cancel-suite').onclick=()=>{cancelled=true;};
$('export-suite').onclick=()=>{
  const record={schema:'codex-export/v1',exportedAt:new Date().toISOString(),manifest,protocol,results:current,browserRerunMatchesArchive:current!==archive?current.resultSha256===archive.resultSha256:null};
  const u=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),a=el('a');a.href=u;a.download='codex-voynich-experiment.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
};
init().catch(e=>{$('load-error').hidden=false;$('load-error').textContent=e.message+'. Reload to retry. Source downloads and the research desk remain available.';$('corpus-counts').textContent='Corpus unavailable or integrity check failed.';$('suite-status').textContent='No verified run available.';});
