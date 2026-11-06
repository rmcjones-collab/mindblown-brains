/* In-memory, reversible controller overlay; does not mutate the factual dataset. */
(() => {
  'use strict';
  const R=window.MINDBLOWN_RENDERER,E=window.MindBlownModifierEngine;
  if(!R||!E||!document.getElementById('lobes'))return;
  const nodes=R.nodes(), ids=nodes.map(n=>n.id), names=new Map(nodes.map(n=>[n.id,n.title]));
  const copy=o=>JSON.parse(JSON.stringify(o));
  let state={modifiers:[],edges:[]}, past=[],future=[],values={},serial=0,placing=false,active=null;
  let lastMarkup='';
  const panel=document.createElement('section');panel.id='modifier-panel';panel.className='modifier-panel';
  panel.setAttribute('aria-label','Modifier scenario');
  panel.innerHTML=`<header><div><small>SCENARIO MODE</small><h2>Modifier brains</h2></div><button type="button" id="modifier-close" aria-label="Close modifiers">×</button></header>
    <p>Place a controller on this brain. Adjust a <strong>scenario signal</strong>, not a sourced fact.</p>
    <label>Target neuron<select id="modifier-target"></select></label>
    <div class="modifier-actions"><button id="modifier-place" type="button">Place on canvas</button><button id="modifier-beside" type="button">Place beside target</button></div>
    <p id="modifier-status" role="status" aria-live="polite">Choose a target, then place a modifier. Session only; save a layout to keep it.</p>
    <div id="modifier-list"></div>
    <details id="modifier-dependencies"><summary>Modeled connections</summary><p>Knowledge links are not causal. Add your own directed dependencies to propagate the scenario signal.</p>
    <label>From neuron<select id="modifier-from"></select></label><label>To neuron<select id="modifier-to"></select></label>
    <label>Influence (−1 to 1)<input id="modifier-weight" type="number" value="0.5" min="-1" max="1" step="0.1"></label>
    <button id="modifier-add-edge" type="button">Add modeled connection</button><div id="modifier-edges"></div></details>
    <details open><summary>Scenario results</summary><p>Baseline 1.00, bounded 0–2. Unlisted neurons are <strong>not modeled</strong>.</p><div id="modifier-results"></div></details>
    <div class="modifier-actions"><button id="modifier-undo" type="button">Undo</button><button id="modifier-redo" type="button">Redo</button><button id="modifier-reset" type="button">Reset scenario</button></div>`;
  panel.hidden=true;document.body.append(panel);
  const $=id=>document.getElementById(id);
  for(const id of ['modifier-target','modifier-from','modifier-to']){
    for(const n of nodes){const o=document.createElement('option');o.value=n.id;o.textContent=n.title;$(id).append(o);}
  }
  if(nodes.length>1)$('modifier-to').selectedIndex=1;
  // the launch button sits in the rail's Brains group (app.js MINDBLOWN_RAIL); pages without the rail keep it at the top of the Lobes switches
  const RAIL=window.MINDBLOWN_RAIL,ICON_MOD=RAIL?RAIL.svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.2 2.6"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>'):'';
  const launch=RAIL?RAIL.brainButton({id:'modifiers-open',label:'Place Modifier Brain',title:'Place Modifier Brain: a controller brain that strengthens, weakens or gates another brain (research scenario)',icon:ICON_MOD}):document.createElement('button');
  if(!RAIL){launch.type='button';launch.id='modifiers-open';launch.className='panel-action';launch.textContent='Place Modifier Brain';document.querySelector('#lobes .switches').prepend(launch);}
  launch.setAttribute('aria-expanded','false');
  const overlay=document.createElement('div');overlay.id='modifier-overlay';document.body.append(overlay);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('aria-hidden','true');overlay.append(svg);
  const status=text=>$('modifier-status').textContent=text;
  document.addEventListener('mindblown:flyout',()=>{if(!panel.hidden){panel.hidden=true;launch.setAttribute('aria-expanded','false');cancel();}});
  function open(){RAIL&&RAIL.closeFlyout();panel.hidden=false;launch.setAttribute('aria-expanded','true');const selected=R.selected();if(selected)$('modifier-target').value=selected;$('modifier-target').focus();}
  function close(){panel.hidden=true;launch.setAttribute('aria-expanded','false');cancel();launch.focus();}
  launch.onclick=()=>panel.hidden?open():close();$('modifier-close').onclick=close;   // the rail button toggles, like the other flyouts
  function cancel(){placing=false;$('modifier-place').textContent='Place on canvas';document.body.classList.remove('modifier-placing');}
  function commit(next,message){
    try{E.evaluate(next,ids);}catch(e){status(e.message);return false;}
    past.push(copy(state));if(past.length>50)past.shift();future=[];state=next;render();if(message)status(message);return true;
  }
  function nextModifierId(){
    const used=new Set(state.modifiers.map(m=>m.id));
    // At most 12 IDs are occupied. Wrap before incrementing past the safe-integer
    // boundary and skip occupied IDs, including after restoring a maximum ID.
    do{serial=serial>=Number.MAX_SAFE_INTEGER?1:serial+1;}while(used.has('M'+serial));
    return 'M'+serial;
  }
  function place(point){
    if(state.modifiers.length>=12){status('Remove a modifier before adding another (limit 12).');cancel();return;}
    const target=$('modifier-target').value;
    const next=copy(state);next.modifiers.push({id:nextModifierId(),target,gain:1,x:point[0],y:point[1]});
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
      range.onchange=()=>{if(before){past.push(before);future=[];before=null;$('modifier-undo').disabled=false;$('modifier-redo').disabled=true;}};
      label.append(output,range);card.append(title,label,button('Focus target',()=>R.focus(m.target)),button('Remove',()=>{const n=copy(state);n.modifiers=n.modifiers.filter(x=>x.id!==m.id);commit(n,'Modifier removed. Explicit connections remain until removed or reset.');}));
      $('modifier-list').append(card);
      let moved=false;   // a drag that moved the handle must not also open the panel on release
      const handle=button(m.id,e=>{if(moved&&e.detail!==0){moved=false;return;}moved=false;active=m.id;panel.hidden=false;launch.setAttribute('aria-expanded','true');card.scrollIntoView({block:'nearest'});range.focus();});
      handle.className='modifier-node';handle.dataset.modifier=m.id;handle.setAttribute('aria-label',`Modifier ${m.id}, target ${names.get(m.target)}. Arrow keys move.`);
      let drag=null;
      function finishDrag(e,aborted=false){
        if(!drag||e.pointerId!==drag.pointerId)return;
        const d=drag;drag=null;liveDrags.delete(d);   // pointerup/cancel may be followed by lostpointercapture
        if(aborted){m.x=d.origin[0];m.y=d.origin[1];moved=true;return;}   // rollback without changing either history stack
        if(d.moved||Math.hypot(e.clientX-d.x,e.clientY-d.y)>3){
          moved=true;
          const p=R.toWorld(e.clientX-d.grab[0],e.clientY-d.grab[1]);m.x=p[0];m.y=p[1];   // the release point counts: browsers coalesce pointermoves, so the last one may never arrive
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
  // every handle being dragged (a mouse and a pen are each primary, so two can move at once): frame() re-places it from the last pointer position, so a zoom, pan or resize between pointermoves
  // keeps it under the pointer at its grab offset rather than carrying it with the world until the pointer next moves
  const liveDrags=new Map();   // drag -> modifier
  function frame(){
    liveDrags.forEach((m,d)=>{if(!d.moved||!d.last)return;const p=R.toWorld(d.last[0]-d.grab[0],d.last[1]-d.grab[1]);m.x=p[0];m.y=p[1];});
    if(!state.modifiers.length&&!state.edges.length){
      if(lastMarkup){svg.innerHTML='';lastMarkup='';}
      requestAnimationFrame(frame);return;
    }
    const paths=[];
    for(const m of state.modifiers){
      const p=R.toScreen(m.x,m.y),t=R.screenOf(m.target),h=overlay.querySelector(`[data-modifier="${m.id}"]`);
      h.style.left=p[0]+'px';h.style.top=p[1]+'px';h.hidden=false; // A folded/filtered target must not hide its placed controller.
      if(t)paths.push(`<path d="M${p[0]},${p[1]} L${t[0]},${t[1]}" stroke="#72dac4" stroke-dasharray="5 5"/>`);
    }
    for(const e of state.edges){const a=R.screenOf(e.from),b=R.screenOf(e.to);if(a&&b)paths.push(`<path d="M${a[0]},${a[1]} L${b[0]},${b[1]}" stroke="#d4ba80" stroke-dasharray="2 5"/>`);}
    for(const [id,v] of Object.entries(values)){const p=R.screenOf(id);if(p)paths.push(`<circle cx="${p[0]}" cy="${p[1]}" r="${12+v.value*8}" fill="none" stroke="${v.value<1?'#efb2b2':'#72dac4'}"/><text x="${p[0]+22}" y="${p[1]-14}" fill="#e8fff9" stroke="#0c1519" stroke-width="4" paint-order="stroke" font-size="12">${v.value.toFixed(2)}</text>`);}
    const markup=paths.join('');
    if(markup!==lastMarkup){svg.innerHTML=markup;lastMarkup=markup;}
    requestAnimationFrame(frame);
  }
  render();requestAnimationFrame(frame);
  // Saved layouts (app.js) carry the scenario: restore() takes an untrusted snapshot, keeps only well-formed controllers on this brain's
  // neurons (at most 12) and well-formed connections, and commits it as one undoable step. Returns false when the snapshot is malformed, oversized, cyclic or has entries but none valid.
  function restore(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.modifiers)||!Array.isArray(raw.edges))return false;
    const fin=v=>typeof v==='number'&&Number.isFinite(v),known=new Set(ids);
    const mods=raw.modifiers.filter(m=>m&&typeof m.id==='string'&&/^M\d{1,16}$/.test(m.id)&&Number.isSafeInteger(+m.id.slice(1))&&known.has(m.target)&&fin(m.gain)&&m.gain>=0&&m.gain<=2&&fin(m.x)&&fin(m.y))
      .slice(0,12).map(m=>({id:m.id,target:m.target,gain:m.gain,x:m.x,y:m.y}));
    const seen=new Set(),edges=[];
    const maxEdges=Math.min(ids.length*(ids.length-1)/2,20000);if(raw.edges.length>maxEdges)return false;   // more than the largest acyclic set over this brain's neurons: refused rather than cut short
    for(const e of raw.edges){if(!e||!known.has(e.from)||!known.has(e.to)||!fin(e.weight)||Math.abs(e.weight)>1)continue;const k=e.from+'\u0000'+e.to;if(seen.has(k))continue;seen.add(k);edges.push({from:e.from,to:e.to,weight:e.weight});}
    if(new Set(mods.map(m=>m.id)).size!==mods.length)return false;
    if((raw.modifiers.length||raw.edges.length)&&!(mods.length||edges.length))return false;   // entries offered but none valid: keep the current scenario
    if(!commit({modifiers:mods,edges},mods.length||edges.length?'Scenario restored from the saved layout.':''))return false;
    serial=Math.max(serial,...mods.map(m=>+m.id.slice(1)));cancel();
    return true;
  }
  window.MINDBLOWN_MODIFIERS=Object.freeze({snapshot:()=>copy(state),results:()=>copy(values),restore});
})();
