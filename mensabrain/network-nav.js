/* Shared public catalog. Private destinations belong ONLY to the Owner Menu app. */
(() => {
 'use strict';
 if(window.MINDBLOWN_EMBEDDED)return; // Build's modal uses its parent site's navigation.
 const catalog=[
  ['Home','https://rmcjones-collab.github.io/mindblown-demo/index.html'],['Projects','https://rmcjones-collab.github.io/mindblown-demo/index.html#projects'],
  ['Life','https://rmcjones-collab.github.io/mindblown-demo/life.html'],['Programming','https://rmcjones-collab.github.io/mindblown-demo/programming.html'],
  ['Build','https://rmcjones-collab.github.io/mindblown-demo/build.html'],['Brain 42','https://rmcjones-collab.github.io/mindblown-brains/brain42/'],
  ['The Guide','https://rmcjones-collab.github.io/mindblown-brains/hgtg/'],['Elements','https://rmcjones-collab.github.io/mindblown-brains/elementsbrain/'],
  ['Atomic','https://rmcjones-collab.github.io/mindblown-brains/atomicbrain/'],['Molecular','https://rmcjones-collab.github.io/mindblown-brains/molecularbrain/'],
  ['Cellular','https://rmcjones-collab.github.io/mindblown-brains/cellularbrain/'],['Human Genome','https://rmcjones-collab.github.io/mindblown-brains/humangenome/'],
  ['Biosphere','https://rmcjones-collab.github.io/mindblown-brains/biospherebrain/'],['SETI','https://rmcjones-collab.github.io/mindblown-brains/setibrain/'],
  ['Deep Answers','https://rmcjones-collab.github.io/mindblown-brains/deepanswers/'],['GTA Network','https://rmcjones-collab.github.io/mindblown-brains/gtabrain/'],
  ['AI Hub','https://hubbrain.pplx.app'],['Universim','https://universim.pplx.app'],
  ['Modifiers Lab','https://modbrain.pplx.app']
 ];
 const owner=['Owner menu','https://www.perplexity.ai/computer/a/31a9ffb6-619a-4904-bd49-59ca1c658585'];
 window.MINDBLOWN_PUBLIC_CATALOG=catalog.map(([label,href])=>({label,href}));
 const style=document.createElement('style');style.textContent=`
 #lobes{display:block;max-height:calc(100dvh - 170px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#58737b transparent}
 #lobe-list{max-height:none;overflow:visible;flex:none}
 #top .stats{white-space:nowrap;max-width:none}
 @media(max-width:900px){#lobes{max-height:46dvh}}
 @media(min-width:901px){#top{grid-template-columns:minmax(280px,1fr) minmax(180px,400px) auto}#top .brand,#top .brand .home,#top .brand .brand-text{min-width:0}#top .brand .title,#top .brand .sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#top .brand .sub{max-width:min(35vw,450px)}}
 .network-picker{position:relative;flex:none!important;display:block!important;width:max-content!important;max-width:100%;padding:0!important;margin-left:0!important;border:0!important;border-radius:0!important;background:none!important;backdrop-filter:none!important}
 .network-picker .nav-btn{display:flex;align-items:center;gap:9px;max-width:190px;padding:8px 11px;background:#17252c;border:1px solid #4c626a;border-radius:8px;color:#e6f0f2;font:12px system-ui;cursor:pointer}
 .network-picker .nav-btn .cur{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .network-picker .nav-menu{position:absolute;top:42px;left:0;right:auto;width:240px;min-width:0;max-width:calc(100vw - 24px);max-height:min(65dvh,500px);overflow:auto;overscroll-behavior:contain;list-style:none;padding:6px;margin:0;background:#101e26;border:1px solid #4c626a;border-radius:9px;z-index:100;box-shadow:0 15px 40px #0008}
 .network-picker.flip .nav-menu{left:auto;right:0}
 .network-picker .nav-menu[hidden]{display:none!important}
 .network-picker .nav-menu a{display:block;padding:10px 12px;color:#d4e5ea;text-decoration:none;font:12px/1.3 system-ui;white-space:normal;border-radius:5px}
 .network-picker .nav-menu a:hover,.network-picker .nav-menu a:focus-visible{background:#29414b;outline:2px solid #a2dccc;outline-offset:-2px}
 .network-picker .nav-menu a.on{background:#26463f;color:#eafff6}
 .network-picker .nav-menu .sep{height:1px;background:#3e545c;margin:7px 4px}
 .network-picker .nav-menu .group{margin:0;padding:8px 12px 5px;color:#9fbac5;font:10px system-ui;text-transform:uppercase;letter-spacing:.08em}
 .topbar .network-picker{margin-left:auto;margin-right:12px}
 @media(max-width:700px){.topbar:has(.network-picker) .preview-status{display:none}.network-picker .nav-btn{max-width:135px}}
 `;
 document.head.append(style);
 function anchor([label,href],on=false){
  const a=document.createElement('a');a.textContent=label;a.href=href;a.setAttribute('role','menuitem');
  if(on){a.className='on';a.setAttribute('aria-current','page');}
  if(href===owner[1]){a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';a.title='Private Owner menu in Perplexity';}
  return a;
 }
 function install(){
  const home=document.querySelector('[data-project-menu]');
  const localDemo=!!home||!!document.querySelector('script[src="./brain-nav.js"]');
  const demoRoutes=['index.html','projects.html','life.html','programming.html','build.html'];
  const localCatalog=catalog.map(([l,h],i)=>[l,localDemo&&i<5?demoRoutes[i]:h]);
  if(home){
   const here=location.pathname.split('/').pop()||'index.html';
   home.replaceChildren(...localCatalog.map(x=>anchor(x,x[1]===here)),anchor(owner));
  }
  document.querySelectorAll('[data-public-networks]').forEach(el=>{
   const label=document.createElement('span');label.textContent='Public networks';el.replaceChildren(label,...catalog.slice(5).map(x=>anchor(x)));
  });
  let old=document.querySelector('nav.brains');
  if(!old&&!home){const header=document.querySelector('.topbar, #top, header');if(header){old=document.createElement('nav');old.className='brains';const brand=header.querySelector('.brand');(brand?.tagName==='DIV'?brand:header).append(old);}}
  if(!old){
   if(!home){const observer=new MutationObserver(()=>{if(document.querySelector('.topbar, #top, header')){observer.disconnect();install();}});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),15000);}
   return;
  }
  const locals=[...old.querySelectorAll('a')].filter(a=>/^(?:\.\/)?[^:/#]+\.html(?:[?#].*)?$/.test(a.getAttribute('href')||'')).map(a=>({label:a.textContent.trim(),href:a.getAttribute('href'),on:a.classList.contains('on')}));
  for(const select of old.querySelectorAll('select'))for(const o of select.options)if(o.value)locals.push({label:o.textContent.trim(),href:o.value,on:o.selected&&select.classList.contains('on')});
  const entries=localDemo?localCatalog.map(([label,href])=>({label,href,on:href===(location.pathname.split('/').pop()||'index.html')})):locals;
  if(!localDemo){if(entries.length)entries.unshift({heading:'This site'});entries.push({heading:'Public networks'},...catalog.map(([label,href])=>({label,href})));}
  entries.push({sep:true},{label:owner[0],href:owner[1]});
  const nav=document.createElement('nav');nav.className='brains dd network-picker';nav.setAttribute('aria-label','MindBlown network');
  const b=document.createElement('button');b.className='nav-btn';b.type='button';b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');
  const current=entries.find(x=>x.on);b.innerHTML='<span class="cur"></span><span aria-hidden="true">▾</span>';b.firstChild.textContent=current?.label||'Networks';
  const menu=document.createElement('ul');menu.className='nav-menu';menu.setAttribute('role','menu');menu.hidden=true;
  for(const x of entries){const li=document.createElement('li');li.setAttribute('role',x.sep?'separator':'none');if(x.sep)li.className='sep';else if(x.heading){li.className='group';li.textContent=x.heading;}else li.append(anchor([x.label,x.href],x.on));menu.append(li);}
  nav.append(b,menu);old.replaceWith(nav);
  function show(on){menu.hidden=!on;b.setAttribute('aria-expanded',String(on));nav.classList.toggle('open',on);if(on){nav.classList.remove('flip');nav.classList.toggle('flip',menu.getBoundingClientRect().right>innerWidth-10);menu.querySelector('a.on,a')?.focus();}}
  b.onclick=()=>show(menu.hidden);
  document.addEventListener('click',e=>{if(!nav.contains(e.target))show(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){show(false);b.focus();}});
  nav.addEventListener('keydown',e=>{const links=[...menu.querySelectorAll('a')],i=links.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(menu.hidden)show(true);else links[(i+(e.key==='ArrowDown'?1:-1)+links.length)%links.length]?.focus();}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
