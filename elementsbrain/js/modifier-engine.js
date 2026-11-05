/* Scenario-only signal model. Knowledge edges are NEVER imported as dependencies. */
(function(root) {
  'use strict';
  function evaluate(state, ids) {
    const allowed=new Set(ids), modeled=new Set(), incoming=new Map(), outgoing=new Map();
    const degree=new Map(), result={}, clamp=n=>Math.max(0,Math.min(2,n));
    for(const m of state.modifiers) {
      if(!allowed.has(m.target)||!Number.isFinite(m.gain)||m.gain<0||m.gain>2) throw Error('Invalid modifier target or gain.');
      modeled.add(m.target);
    }
    const seen=new Set();
    for(const e of state.edges) {
      if(!allowed.has(e.from)||!allowed.has(e.to)||!Number.isFinite(e.weight)||Math.abs(e.weight)>1) throw Error('Invalid scenario connection.');
      const key=JSON.stringify([e.from,e.to]); if(seen.has(key)) throw Error('That connection already exists.'); seen.add(key);
      modeled.add(e.from);modeled.add(e.to);
      if(!incoming.has(e.to)) incoming.set(e.to,[]); incoming.get(e.to).push(e);
      if(!outgoing.has(e.from)) outgoing.set(e.from,[]); outgoing.get(e.from).push(e);
    }
    modeled.forEach(id=>degree.set(id,(incoming.get(id)||[]).length));
    const queue=[...modeled].filter(id=>!degree.get(id));
    for(let i=0;i<queue.length;i++){
      const id=queue[i], direct=state.modifiers.filter(m=>m.target===id).reduce((s,m)=>s+m.gain-1,0);
      const terms=(incoming.get(id)||[]).map(e=>({from:e.from,weight:e.weight,delta:(result[e.from].value-1)*e.weight}));
      const raw=1+direct+terms.reduce((s,e)=>s+e.delta,0);
      result[id]={value:clamp(raw),raw,direct,terms,clamped:raw!==clamp(raw)};
      for(const e of outgoing.get(id)||[]){degree.set(e.to,degree.get(e.to)-1);if(!degree.get(e.to))queue.push(e.to);}
    }
    if(queue.length!==modeled.size) throw Error('Cycles are not supported. Reverse or remove a connection first.');
    return result;
  }
  const api=Object.freeze({evaluate});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MindBlownModifierEngine=api;
})(typeof window==='object'?window:globalThis);
