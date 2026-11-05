(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog=null,current='voynich';
  const groupNames={mysteries:'Open manuscripts',systems:'Machines & historical codes',people:'Codebreakers',methods:'Methods & evidence'};
  function showSubject(id){
    const s=catalog.subjects.find(s=>s.id===id);if(!s)return;current=id;
    $('dossier').innerHTML=`<div class="dossier-head"><span class="badge">${esc(s.status)}</span><h2>${esc(s.name)}</h2><p>${esc(s.summary)}</p><a href="./${encodeURIComponent(s.id)}.html">Explore this brain ↗</a></div><h3>Source-linked evidence</h3>${s.facts.map(f=>`<section class="fact"><small>${esc(f[3])}</small><h3>${esc(f[0])}</h3><p>${esc(f[1])}${f[2]?` <a href="${esc(catalog.sources[f[2]][1])}" target="_blank" rel="noopener noreferrer">(${esc(catalog.sources[f[2]][0])})</a>`:''}</p></section>`).join('')}<section class="research"><p class="eyebrow">PROPOSED WORK · NOT YET COMPLETED</p><h3>Next research questions</h3><ul>${s.tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p class="small">Curated starting point, not an exhaustive dossier. Source review: ${esc(catalog.checked)}.</p></section><section class="research"><h3>Connected brains</h3><p class="small">Curated research connections, not claims of equivalent mechanisms.</p><div class="connections">${s.related.map(id=>`<button type="button" data-subject="${esc(id)}">${esc(catalog.subjects.find(s=>s.id===id)?.name||id)}</button>`).join('')}</div></section>`;
    $('dossier').querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{showSubject(b.dataset.subject);$('dossier').scrollIntoView({block:'start'});});
    renderList();
  }
  function renderList(){
    const q=$('subject-filter').value.trim().toLowerCase(),list=catalog.subjects.filter(s=>(s.name+' '+s.id).toLowerCase().includes(q));
    $('subject-list').innerHTML=Object.entries(groupNames).map(([group,label])=>{
      const groupList=list.filter(s=>s.group===group);if(!groupList.length)return '';
      return `<div class="group-label">${label}</div>`+groupList.map(s=>`<button type="button" data-subject="${s.id}" aria-current="${s.id===current}">${esc(s.name)}</button>`).join('');
    }).join('')||(q?'<p class="small">No matching subject. Try a shorter name or clear the filter.</p>':'');
    $('subject-list').querySelectorAll('button').forEach(b=>b.onclick=()=>showSubject(b.dataset.subject));
  }
  fetch('./catalog.json').then(r=>{if(!r.ok)throw Error('registry');return r.json();}).then(d=>{
    catalog=d;$('coverage').textContent=`${d.subjects.length} subject brains · ${Object.keys(d.sources).length} sources`;
    showSubject(new URLSearchParams(location.search).get('subject')||'voynich');
    if(!$('dossier').querySelector('h2'))showSubject('voynich');
    $('subject-filter').oninput=renderList;
  }).catch(()=>{$('coverage').textContent='Registry unavailable';$('dossier').textContent='The source registry could not be loaded. Reload the page to retry.';});
  function view(lab){$('evidence-view').hidden=lab;$('lab-view').hidden=!lab;$('evidence-tab').setAttribute('aria-pressed',String(!lab));$('lab-tab').setAttribute('aria-pressed',String(lab));}
  $('evidence-tab').onclick=()=>view(false);$('lab-tab').onclick=()=>view(true);
  function measure(){
    const raw=$('text-input').value,mode=$('units').value;
    const symbols=mode==='latin'?(raw.toUpperCase().match(/[A-Z]/g)||[]):mode==='tokens'?(raw.match(/\S+/gu)||[]):Array.from(raw).filter(c=>!/\s/u.test(c));
    const counts=new Map();for(const s of symbols)counts.set(s,(counts.get(s)||0)+1);
    const n=symbols.length;
    let h=0,pairs=0;for(const c of counts.values()){const p=c/n;h-=p*Math.log2(p);pairs+=c*(c-1);}
    return {version:'codex-measurements-1',representation:mode,normalization:'none; see representation policy',inputCodePoints:Array.from(raw).length,inputUTF16Units:raw.length,n,distinct:counts.size,empiricalEntropyBits:n?h:null,indexOfCoincidence:n>1?pairs/(n*(n-1)):null,counts:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),interpretation:'Descriptive only; not proof of language, cipher family or decipherment.'};
  }
  function renderMeasurements(){
    const r=measure();$('export-status').textContent='';
    if(!r.n){$('measurements').innerHTML='<p class="eyebrow">NO SYMBOLS TO MEASURE</p><h3>Add text or change the symbol policy.</h3><p>Empty input and input removed by the selected policy do not produce meaningful statistics.</p>';return r;}
    const val=n=>n===null?'Not defined':n.toFixed(5);
    $('measurements').innerHTML=`<p class="eyebrow">DESCRIPTIVE RESULTS · NOT A DECIPHERMENT</p><div class="metrics"><div class="metric"><strong>${r.n.toLocaleString()}</strong><span>symbols under your policy</span></div><div class="metric"><strong>${r.distinct.toLocaleString()}</strong><span>distinct symbols</span></div><div class="metric"><strong>${val(r.empiricalEntropyBits)}</strong><span>empirical entropy (bits/symbol)</span></div><div class="metric"><strong>${val(r.indexOfCoincidence)}</strong><span>index of coincidence</span></div></div><h3>Most frequent symbols</h3>${r.counts.slice(0,15).map(([s,c])=>`<div class="freq"><span>${esc(s.length>40?s.slice(0,40)+'…':s)}</span><div class="bar"><i style="width:${100*c/r.counts[0][1]}%"></i></div><span>${c}</span></div>`).join('')}<p class="small">Showing ${Math.min(15,r.distinct)} of ${r.distinct} symbols. The export includes the full frequency table.</p><p class="small">Entropy = −Σ p log₂ p. Coincidence = Σ nᵢ(nᵢ−1) / N(N−1). Short samples, transcription choices and mixtures can dominate these measurements.</p>`;
    return r;
  }
  $('analyze').onclick=renderMeasurements;
  $('units').onchange=()=>{if($('text-input').value)renderMeasurements();};
  $('text-input').oninput=()=>{$('measurements').innerHTML='<p class="eyebrow">INPUT CHANGED</p><h3>Measure the updated text.</h3><p>Previous measurements have been cleared to avoid mixing versions.</p>';$('export-status').textContent='';};
  $('sample').onclick=()=>{$('corpus-name').value='Synthetic classroom fixture v1; not Voynich';$('text-input').value='ATTACK AT DAWN ATTACK AT DUSK';$('units').value='latin';renderMeasurements();};
  $('clear').onclick=()=>{for(const id of ['text-input','corpus-name','hypothesis','falsification','notes'])$(id).value='';$('include-text').checked=false;renderMeasurements();};
  $('export').onclick=async()=>{
    const r=renderMeasurements();if(!r.n){$('export-status').textContent='Add measurable text before exporting.';return;}
    const raw=$('text-input').value;
    let hash=null;
    try{if(globalThis.crypto?.subtle)hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(n=>n.toString(16).padStart(2,'0')).join('');}catch{}
    const record={schema:'codex-experiment/v1',created:new Date().toISOString(),corpus:$('corpus-name').value||'Unspecified corpus',inputSHA256:hash,inputHashStatus:hash?'SHA-256 of original UTF-8 text':'Unavailable in this browser context',...r,hypothesis:$('hypothesis').value,falsification:$('falsification').value,notes:$('notes').value,reviewStatus:'Unreviewed observation; not a solved claim',inputIncluded:$('include-text').checked,...($('include-text').checked?{input:raw}:{})};
    const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Codex-Experiment.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('export-status').textContent='Export requested. Check your browser downloads; keep this file to preserve the record. Frequency tables can reveal input tokens even when full text is excluded.';
  };
})();
