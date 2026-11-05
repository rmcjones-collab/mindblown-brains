(() => {
  'use strict';
  const picker=document.getElementById('brain-picker');
  picker.value=location.pathname.split('/').pop()||'index.html';
  picker.addEventListener('change',()=>{location.href='./'+picker.value;});
  // A closed selection must not be reopened by the renderer's delayed boot
  // deep-link check. Preserve layout state and canonical renderer bytes.
  function clearClosedDeepLink(){
    if(!document.getElementById('panel').hidden)return;
    const parts=location.hash.slice(1).split('&').filter(p=>p&&!p.startsWith('n='));
    try{history.replaceState(null,'',location.pathname+location.search+(parts.length?'#'+parts.join('&'):''));}catch(_){/* Opaque preview has no writable history. */}
  }
  document.getElementById('panel-close').addEventListener('click',clearClosedDeepLink);
  document.getElementById('z-fit').addEventListener('click',clearClosedDeepLink);
  window.addEventListener('keydown',e=>{if(e.key==='Escape')clearClosedDeepLink();});
  const body=document.getElementById('panel-body'),D=window.MINDBLOWN;
  // Add actual links beside fact-level claims without changing the canonical renderer.
  const observer=new MutationObserver(enhance);
  function enhance(){
    observer.disconnect();
    for(const el of body.querySelectorAll('.syn[data-id]:not([data-codex])')){
      el.dataset.codex='true';const syn=D.synapses.find(s=>s.id===el.dataset.id);
      for(const url of syn?.cites||[]){
        if(!/^https:\/\//.test(url))continue;const a=document.createElement('a');a.className='codex-citation';a.href=url;a.target='_blank';a.rel='noopener noreferrer';
        a.textContent=D.sources.find(s=>s.id===url)?.label||new URL(url).hostname;
        a.addEventListener('click',e=>e.stopPropagation());el.append(a);
      }
    }
    const h=body.querySelector('h2');
    if(h&&!body.querySelector('.codex-status')){
      const p=D.pages.find(p=>p.title===h.textContent);
      if(p){
        const badge=document.createElement('p');badge.className='codex-status';badge.textContent=p.status||'Research seed';h.after(badge);
        if(p.id!=='codex'){
          const a=document.createElement('a');a.className='codex-open';a.href='./desk.html?subject='+encodeURIComponent(p.id);a.textContent='Read dossier & evidence →';badge.after(a);
          if(p.id==='voynich'){const corpus=document.createElement('a');corpus.className='codex-open';corpus.href='./manuscript.html';corpus.textContent='Open manuscript & reproducible tests →';a.after(document.createElement('br'),corpus);}
          if(p.id!==D.brain){const b=document.createElement('a');b.className='codex-open';b.href='./'+p.id+'.html';b.textContent='Open dedicated brain →';a.after(document.createElement('br'),b);}
        }
      }
    }
    observer.observe(body,{childList:true,subtree:true});
  }
  enhance();
})();
