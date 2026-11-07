/* In-memory, reversible controller overlay; does not mutate the factual dataset. */
(() => {
  'use strict';
  // The renderer can be published after a boot wait (composition resolves first), so wait for it rather than giving up once.
  const available=()=>window.MINDBLOWN_RENDERER&&window.MindBlownModifierEngine&&document.getElementById('lobes');
  const init=()=>{
  const R=window.MINDBLOWN_RENDERER,E=window.MindBlownModifierEngine;
  // Keep a long public sibling menu navigable without clipping unexplained fragments.
  if(document.body.classList.contains('brain-dna')||document.body.classList.contains('mb-controls')) {
    const nav=document.querySelector('nav.brains'), shell=document.createElement('div');
    if(nav) {
      shell.className='brain-nav';nav.before(shell);
      const left=document.createElement('button'),right=document.createElement('button');
      left.type=right.type='button';left.textContent='‹';right.textContent='›';
      left.setAttribute('aria-label','Scroll brains left');right.setAttribute('aria-label','Scroll brains right');
      left.onclick=()=>nav.scrollBy({left:-200,behavior:'smooth'});right.onclick=()=>nav.scrollBy({left:200,behavior:'smooth'});
      shell.append(left,nav,right);
      const sync=()=>{left.disabled=nav.scrollLeft<=1;right.disabled=nav.scrollLeft+nav.clientWidth>=nav.scrollWidth-1;};
      nav.addEventListener('scroll',sync);new ResizeObserver(sync).observe(nav);sync();
    }
  }
  let nodes=R.nodes(), ids=nodes.map(n=>n.id), names=new Map(nodes.map(n=>[n.id,n.title]));
  const copy=o=>JSON.parse(JSON.stringify(o));
  let state={modifiers:[],edges:[]}, past=[],future=[],values={},serial=0,placing=false;
  const panel=document.createElement('section');panel.id='modifier-panel';panel.className='modifier-panel';
  panel.setAttribute('aria-label','Modifier scenario');
  panel.innerHTML=`<header><div><small>SCENARIO MODE</small><h2>Modifier brains</h2></div><button type="button" id="modifier-close" aria-label="Close modifiers">×</button></header>
    <p>Place a controller on this brain. Adjust a <strong>scenario signal</strong>, not a sourced fact.</p>
    <label>Target neuron<select id="modifier-target"></select></label>
    <div class="modifier-actions"><button id="modifier-place" type="button">Place on canvas</button><button id="modifier-beside" type="button">Place beside target</button></div>
    <p id="modifier-status" role="status" aria-live="polite">Choose a target, then place a modifier. Session only; reload resets it.</p>
    <div id="modifier-list"></div>
    <details id="modifier-dependencies"><summary>Modeled connections</summary><p>Knowledge links are not causal. Add your own directed dependencies to propagate the scenario signal.</p>
    <label>From neuron<select id="modifier-from"></select></label><label>To neuron<select id="modifier-to"></select></label>
    <label>Influence (−1 to 1)<input id="modifier-weight" type="number" value="0.5" min="-1" max="1" step="0.1"></label>
    <button id="modifier-add-edge" type="button">Add modeled connection</button><div id="modifier-edges"></div></details>
    <details open><summary>Scenario results</summary><p>Baseline 1.00, bounded 0–2. Unlisted neurons are <strong>not modeled</strong>.</p><div id="modifier-results"></div></details>
    <div class="modifier-actions"><button id="modifier-undo" type="button">Undo</button><button id="modifier-redo" type="button">Redo</button><button id="modifier-reset" type="button">Reset scenario</button></div>`;
  panel.hidden=true;document.body.append(panel);
  const $=id=>document.getElementById(id);
  // neurons grown at runtime become targets too: the lists are rebuilt from R.nodes() whenever the controls open
  function refreshNodes(){
    nodes=R.nodes();ids=nodes.map(n=>n.id);names=new Map(nodes.map(n=>[n.id,n.title]));
    for(const id of ['modifier-target','modifier-from','modifier-to']){const keep=$(id).value;$(id).replaceChildren(...nodes.map(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.title;return o;}));if(keep&&names.has(keep))$(id).value=keep;}
  }
  for(const id of ['modifier-target','modifier-from','modifier-to']){
    for(const n of nodes){const o=document.createElement('option');o.value=n.id;o.textContent=n.title;$(id).append(o);}
  }
  if(nodes.length>1)$('modifier-to').selectedIndex=1;
  // the launch button sits in the rail's Brains group (js/app.js MINDBLOWN_RAIL) on every screen size; without the rail it stays at the top of the Lobes switches
  const RAIL=window.MINDBLOWN_RAIL;
  const launch=RAIL?RAIL.brainButton({id:'modifiers-open',label:'Place Modifier Brain',title:'Place Modifier Brain: a controller brain that strengthens, weakens or gates another brain (research scenario)',icon:RAIL.svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.2 2.6"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>')}):document.createElement('button');
  if(!RAIL){launch.type='button';launch.id='modifiers-open';launch.className='panel-action';launch.textContent='Place Modifier Brain';document.querySelector('#lobes .switches').prepend(launch);}
  launch.setAttribute('aria-expanded','false');
  {   // a cut-off Lobes panel says so: fade plus a "more below" cue until the panel is scrolled to its end
    const lp=document.getElementById('lobes'),cue=document.createElement('div');cue.className='lobes-more';cue.setAttribute('aria-hidden','true');cue.textContent='▾ more below';lp.append(cue);
    const sync=()=>lp.classList.toggle('more-below',lp.scrollHeight-lp.clientHeight-lp.scrollTop>4);
    lp.addEventListener('scroll',sync,{passive:true});addEventListener('resize',sync);new ResizeObserver(sync).observe(lp);new MutationObserver(sync).observe(lp,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});sync();
  }
  const phoneLaunch=launch.cloneNode(true);phoneLaunch.id='modifiers-open-phone';phoneLaunch.textContent='Modifiers';if(!RAIL)document.body.append(phoneLaunch);   // the rail button already reaches phones
  const overlay=document.createElement('div');overlay.id='modifier-overlay';document.body.append(overlay);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('aria-hidden','true');overlay.append(svg);
  const status=text=>$('modifier-status').textContent=text;
  let opener=launch;
  function expanded(on){launch.setAttribute('aria-expanded',String(on));phoneLaunch.setAttribute('aria-expanded',String(on));}
  document.addEventListener('mindblown:flyout',e=>{if(e.detail!=='modifiers'&&!panel.hidden){panel.hidden=true;expanded(false);cancel();}});
  function open(e){document.dispatchEvent(new CustomEvent('mindblown:flyout',{detail:'modifiers'}));opener=e?.currentTarget||launch;refreshNodes();panel.hidden=false;expanded(true);const selected=R.selected();if(selected)$('modifier-target').value=selected;$('modifier-target').focus();}
  function close(){panel.hidden=true;expanded(false);cancel();opener.focus();}
  launch.onclick=e=>panel.hidden?open(e):close();phoneLaunch.onclick=open;$('modifier-close').onclick=close;
  function cancel(){placing=false;$('modifier-place').textContent='Place on canvas';document.body.classList.remove('modifier-placing');}
  function commit(next,message){
    try{E.evaluate(next,ids);}catch(e){status(e.message);return false;}
    past.push(copy(state));if(past.length>50)past.shift();future=[];state=next;render();if(message)status(message);return true;
  }
  function place(point){
    if(state.modifiers.length>=12){status('Remove a modifier before adding another (limit 12).');cancel();return;}
    const target=$('modifier-target').value;
    const next=copy(state);next.modifiers.push({id:'M'+(++serial),target,gain:1,x:point[0],y:point[1]});
    commit(next,'Modifier placed. Adjust its signal below. Drag its canvas handle to reposition.');cancel();
  }
  $('modifier-place').onclick=()=>{placing=!placing;$('modifier-place').textContent=placing?'Cancel placement':'Place on canvas';document.body.classList.toggle('modifier-placing',placing);status(placing?'Click an open area of the canvas to place the controller. Escape cancels.':'Placement cancelled.');};
  $('modifier-beside').onclick=()=>{
    const p=R.screenOf($('modifier-target').value)||[innerWidth/2,innerHeight/2];
    place(R.toWorld(Math.max(260,Math.min(innerWidth-100,p[0]+80)),Math.max(130,Math.min(innerHeight-100,p[1]-50))));
  };
  document.getElementById('brain').addEventListener('pointerdown',e=>{if(!placing)return;e.preventDefault();e.stopImmediatePropagation();place(R.toWorld(e.clientX,e.clientY));},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(placing){cancel();status('Placement cancelled.');}else if(!panel.hidden)close();}});
  $('modifier-add-edge').onclick=()=>{
    const next=copy(state),raw=$('modifier-weight').value;
    if(raw.trim()===''){status('Enter an influence between −1 and 1.');return;}
    next.edges.push({from:$('modifier-from').value,to:$('modifier-to').value,weight:Number(raw)});
    commit(next,'Scenario connection added. Changes now propagate through this explicit dependency.');
  };
  $('modifier-undo').onclick=()=>{if(!past.length)return;future.push(copy(state));state=past.pop();render();status('Undone.');};
  $('modifier-redo').onclick=()=>{if(!future.length)return;past.push(copy(state));state=future.pop();render();status('Redone.');};
  $('modifier-reset').onclick=()=>{cancel();commit({modifiers:[],edges:[]},'Scenario reset. Factual neurons were not changed. Undo restores the scenario.');};
  function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;}
  function renderResults(){
    values=E.evaluate(state,ids);$('modifier-results').replaceChildren();
    for(const [id,v] of Object.entries(values)){
      const row=document.createElement('div');row.className='modifier-result';
      const title=document.createElement('span');title.textContent=names.get(id);
      const number=document.createElement('strong');number.textContent=v.value.toFixed(2);
      const trace=document.createElement('small');
      trace.textContent=`1.00 + direct ${v.direct.toFixed(2)}${v.terms.map(t=>` + ${names.get(t.from)} (${t.delta.toFixed(2)})`).join('')}${v.clamped?' · bounded to 0–2':''}`;
      row.append(title,number,trace);$('modifier-results').append(row);
    }
    if(!Object.keys(values).length)$('modifier-results').textContent='No modeled neurons yet.';
  }
  function render(){
    $('modifier-list').replaceChildren();overlay.querySelectorAll('button').forEach(b=>b.remove());
    for(const m of state.modifiers){
      const card=document.createElement('div');card.className='modifier-card';card.dataset.modifier=m.id;
      const title=document.createElement('strong');title.textContent=`${m.id} → ${names.get(m.target)}`;
      const label=document.createElement('label');label.textContent='Scenario signal ';
      const output=document.createElement('output');output.textContent=m.gain.toFixed(2);
      const range=document.createElement('input');range.type='range';range.min='0';range.max='2';range.step='0.05';range.value=String(m.gain);range.setAttribute('aria-label',`${m.id} scenario signal`);
      let before=null;range.oninput=()=>{if(!before)before=copy(state);m.gain=Number(range.value);output.textContent=m.gain.toFixed(2);renderResults();};
      range.onchange=()=>{if(!before)return;const prev=before;before=null;   // a slide that ends where it began leaves both history stacks alone
        if(JSON.stringify(state)!==JSON.stringify(prev)){past.push(prev);if(past.length>50)past.shift();future=[];$('modifier-undo').disabled=false;$('modifier-redo').disabled=true;}};
      label.append(output,range);card.append(title,label,button('Focus target',()=>R.focus(m.target)),button('Remove',()=>{const n=copy(state);n.modifiers=n.modifiers.filter(x=>x.id!==m.id);commit(n,'Modifier removed. Explicit connections remain until removed or reset.');}));
      $('modifier-list').append(card);
      let moved=false;
      const handle=button(m.id,e=>{if(moved&&e.detail!==0){moved=false;return;}moved=false;refreshNodes();panel.hidden=false;expanded(true);card.scrollIntoView({block:'nearest'});range.focus();});
      handle.className='modifier-node';handle.dataset.modifier=m.id;handle.setAttribute('aria-label',`Modifier ${m.id}, target ${names.get(m.target)}. Arrow keys move.`);
      let drag=null;
      function finishDrag(e,aborted=false){
        if(!drag||e.pointerId!==drag.pointerId)return;
        const d=drag;drag=null;liveDrags.delete(d);   // pointerup/cancel may be followed by lostpointercapture
        if(aborted){m.x=d.origin[0];m.y=d.origin[1];moved=true;return;}   // rollback without changing either history stack
        if(d.moved||Math.hypot(e.clientX-d.x,e.clientY-d.y)>3){
          moved=true;
          const p=R.toWorld(e.clientX-d.grab[0],e.clientY-d.grab[1]);m.x=p[0];m.y=p[1];   // the release point counts: browsers coalesce pointermoves, so the last one may never arrive
          const originScreen=R.toScreen(d.origin[0],d.origin[1]);   // reproject: zoom, pan or resize can move the origin away from the original press point
          if(Math.hypot(e.clientX-d.grab[0]-originScreen[0],e.clientY-d.grab[1]-originScreen[1])<0.5){m.x=d.origin[0];m.y=d.origin[1];}   // a screen-space tolerance avoids round-trip drift at high zoom-out without discarding genuine viewport-relative moves
          if(JSON.stringify(state)!==JSON.stringify(d.before)){past.push(d.before);if(past.length>50)past.shift();future=[];$('modifier-undo').disabled=false;$('modifier-redo').disabled=true;}
        }
      }
      handle.onpointerdown=e=>{if(drag||!e.isPrimary||e.button!==0)return;e.stopPropagation();moved=false;const at=R.toScreen(m.x,m.y);drag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,grab:[e.clientX-at[0],e.clientY-at[1]],origin:[m.x,m.y],before:copy(state)};liveDrags.set(drag,m);   // the grab offset is kept in screen pixels: the handle is a fixed 40 px, so a zoom mid-drag must not slide it off the pointer
      handle.setPointerCapture(e.pointerId);};
      handle.onpointermove=e=>{if(!drag||e.pointerId!==drag.pointerId)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3)drag.moved=true;   // latched: a drag that returns to its start is still a drag
      if(!drag.moved)return;   // under the threshold the handle stays put, so a click never nudges it
      drag.last=[e.clientX,e.clientY];const p=R.toWorld(e.clientX-drag.grab[0],e.clientY-drag.grab[1]);m.x=p[0];m.y=p[1];};
      handle.onpointerup=e=>finishDrag(e);
      handle.onpointercancel=e=>finishDrag(e,true);
      handle.onlostpointercapture=e=>finishDrag(e,true);
      handle.onkeydown=e=>{const v={ArrowLeft:[-15,0],ArrowRight:[15,0],ArrowUp:[0,-15],ArrowDown:[0,15]}[e.key];if(!v)return;e.preventDefault();const n=copy(state),x=n.modifiers.find(x=>x.id===m.id);x.x+=v[0];x.y+=v[1];commit(n);overlay.querySelector(`[data-modifier="${m.id}"]`).focus();};
      overlay.append(handle);
    }
    $('modifier-edges').replaceChildren();
    state.edges.forEach((e,i)=>{const row=document.createElement('div');row.className='modifier-edge';const text=document.createElement('span');text.textContent=`${names.get(e.from)} → ${names.get(e.to)} × ${e.weight}`;row.append(text,button('Remove',()=>{const n=copy(state);n.edges.splice(i,1);commit(n,'Connection removed.');}));$('modifier-edges').append(row);});
    $('modifier-undo').disabled=!past.length;$('modifier-redo').disabled=!future.length;$('modifier-reset').disabled=!state.modifiers.length&&!state.edges.length;
    renderResults();
  }
  const liveDrags=new Map();   // canonical drag lifecycle; preserve this renderer’s integration
  function frame(){
    liveDrags.forEach((m,d)=>{if(!d.moved||!d.last)return;const p=R.toWorld(d.last[0]-d.grab[0],d.last[1]-d.grab[1]);m.x=p[0];m.y=p[1];});
    const paths=[];
    for(const m of state.modifiers){
      const p=R.toScreen(m.x,m.y),t=R.screenOf(m.target),h=overlay.querySelector(`[data-modifier="${m.id}"]`);
      h.style.left=p[0]+'px';h.style.top=p[1]+'px';h.hidden=false; // A folded/filtered target must not hide its placed controller.
      if(t)paths.push(`<path d="M${p[0]},${p[1]} L${t[0]},${t[1]}" stroke="#72dac4" stroke-dasharray="5 5"/>`);
    }
    for(const e of state.edges){const a=R.screenOf(e.from),b=R.screenOf(e.to);if(a&&b)paths.push(`<path d="M${a[0]},${a[1]} L${b[0]},${b[1]}" stroke="#d4ba80" stroke-dasharray="2 5"/>`);}
    for(const [id,v] of Object.entries(values)){const p=R.screenOf(id);if(p)paths.push(`<circle cx="${p[0]}" cy="${p[1]}" r="${12+v.value*8}" fill="none" stroke="${v.value<1?'#efb2b2':'#72dac4'}"/><text x="${p[0]+22}" y="${p[1]-14}" fill="#e8fff9" stroke="#0c1519" stroke-width="4" paint-order="stroke" font-size="12">${v.value.toFixed(2)}</text>`);}
    svg.innerHTML=paths.join('');requestAnimationFrame(frame);
  }
  render();requestAnimationFrame(frame);
  window.MINDBLOWN_MODIFIERS=Object.freeze({snapshot:()=>copy(state),results:()=>copy(values)});
  };
  if(available())init();
  else{const t0=Date.now(),timer=setInterval(()=>{if(available()){clearInterval(timer);init();}else if(Date.now()-t0>120000)clearInterval(timer);},100);}
})();
