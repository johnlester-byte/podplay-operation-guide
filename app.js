/* =====================================================================
   CSA OPERATION GUIDE  —  app script  (everything runs in this one file)
   ---------------------------------------------------------------------
   There is NO server. The whole site is data + a bit of JavaScript.

   Three data objects are injected at the top:
     DOCS    : array of guides. Each guide looks like:
                 { cat:"Tech Support", title:"Restarting a Device",
                   html:"<p>...</p>",          // the guide body
                   text:"plain text for search",
                   updated:"2026-06-13", steps:5,
                   toc:[{id,label}], _id:0 }    // _id is added at load
     CATMETA : per-category icon / colour / description
     ORDER   : the order the categories are shown in

   User settings are saved in the browser (localStorage) so they survive a
   refresh, and nothing leaves the computer:
     og_theme  = "light"/"dark"      og_favs   = [guide ids]
     og_recent = [guide ids]         og_steps_<id> = [checked step numbers]
     og_edits  = { id: {html,text,steps,toc} }   og_editpw = edit password

   Jump to a section using the  // ---- name ----  markers below.
   ===================================================================== */
// ===== Supabase live-publish config — paste your project's two values here =====
const SUPA_URL = 'https://yajmnemjetoodnykxvsa.supabase.co';
const SUPA_KEY = 'sb_publishable_51rDCX6nLifV6rKoOujUMA_5dO1qMNA';
const SUPA_ON  = !!(SUPA_URL && SUPA_KEY);
let sb = null;
DOCS.forEach((d,i)=>d._id=i);
// admin-created guides saved on this device (deduped by nid; baked into the file on Download)
try{(JSON.parse(localStorage.getItem('og_newdocs'))||[]).forEach(d=>{if(!DOCS.some(x=>x.nid&&x.nid===d.nid)){d._id=DOCS.length;DOCS.push(d);}});}catch(e){}
// appearance (font + colours). BAKED_APPEARANCE is rewritten on Download so the public sees it.
let BAKED_APPEARANCE={};
let appearance;try{appearance=JSON.parse(localStorage.getItem('og_appearance'));}catch(e){}
if(!appearance)appearance=BAKED_APPEARANCE;
let deleted=[];try{deleted=JSON.parse(localStorage.getItem('og_deleted'))||[];}catch(e){}
deleted.forEach(nid=>{const d=DOCS.find(x=>x.nid===nid);if(d)d.deleted=true;});
let edits={};try{edits=JSON.parse(localStorage.getItem("og_edits"))||{};}catch(e){}
Object.keys(edits).forEach(k=>{const d=DOCS[+k];const e=edits[k];if(d&&e){if(e.title)d.title=e.title;d.html=e.html;d.text=e.text;d.steps=e.steps;d.toc=e.toc;}});
const byCat={};
function rebuildByCat(){ORDER.forEach(c=>byCat[c]=[]);DOCS.forEach(d=>{(byCat[d.cat]=byCat[d.cat]||[]).push(d);});}
ORDER.forEach(c=>byCat[c]=[]);
DOCS.forEach(d=>{(byCat[d.cat]=byCat[d.cat]||[]).push(d)});

// ---- storage (file:// safe) ----
// Thin wrapper over localStorage. If the browser blocks it, we fall back to a
// plain in-memory object so the page still works (settings just won't persist).
const mem={};
const store={
  get(k,def){try{const v=localStorage.getItem(k);return v==null?def:JSON.parse(v);}catch(e){return k in mem?mem[k]:def;}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){mem[k]=v;return false;}}
};
let favs=store.get("og_favs",[]);
let recent=store.get("og_recent",[]);

const content=document.getElementById('content');
const main=document.getElementById('main');
const searchEl=document.getElementById('search');

document.getElementById('brandsub').textContent=DOCS.length+' guides';

// ---- sidebar nav ----  Builds the left category list from DOCS.
function buildNav(){
  const nav=document.getElementById('nav');nav.innerHTML='';
  ORDER.forEach(cat=>{
    const items=vis(byCat[cat]||[]);const m=CATMETA[cat]||{};
    if(!items.length)return;
    const wrap=document.createElement('div');wrap.className='cat';wrap.dataset.cat=cat;
    wrap.innerHTML='<div class="cat-head"><span class="dot" style="background:'+(m.color||'#999')+'"></span><span>'+cat+'</span><span class="count">'+items.length+'</span></div>';
    items.forEach(d=>{
      const a=document.createElement('div');a.className='nav-item'+(d.archived?' arch':'');a.dataset.id=d._id;
      a.innerHTML='<span class="t">'+esc(d.title)+'</span>'+(d.archived?'<span class="fav" title="Hidden">&#128584;</span>':(favs.includes(d._id)?'<span class="fav">&#9733;</span>':''));
      a.onclick=()=>go('g-'+d._id);wrap.appendChild(a);
    });
    nav.appendChild(wrap);
  });
}
function setActive(id){document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.id==id));}
function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function monoTitle(s){return (s||'').replace(/[^A-Za-z0-9]/g,'').slice(0,2).toUpperCase();}

// ---- highlight (regex-free) ----
// Wraps the searched words in <mark> tags. Done by hand (not regex) so we never
// accidentally break the HTML tags inside a guide.
function hl(s,terms){
  let ranges=[];const low=s.toLowerCase();
  terms.forEach(t=>{if(!t)return;let i=0;while((i=low.indexOf(t,i))>=0){ranges.push([i,i+t.length]);i+=t.length;}});
  if(!ranges.length)return esc(s);
  ranges.sort((a,b)=>a[0]-b[0]);let mg=[ranges[0].slice()];
  for(let k=1;k<ranges.length;k++){const l=mg[mg.length-1];if(ranges[k][0]<=l[1])l[1]=Math.max(l[1],ranges[k][1]);else mg.push(ranges[k].slice());}
  let out="",p=0;mg.forEach(([a,b])=>{out+=esc(s.slice(p,a))+"<mark>"+esc(s.slice(a,b))+"</mark>";p=b;});return out+esc(s.slice(p));
}
function snippet(text,terms){
  const low=text.toLowerCase();let pos=-1;
  for(const t of terms){const p=low.indexOf(t);if(p>=0){pos=p;break;}}
  if(pos<0)pos=0;const st=Math.max(0,pos-60);
  return hl((st>0?'…':'')+text.slice(st,st+220)+(text.length>st+220?'…':''),terms);
}

// ---- favorites ----  Star / un-star guides (saved in og_favs).
function isFav(id){return favs.includes(id);}
function toggleFav(id){id=+id;const i=favs.indexOf(id);if(i>=0)favs.splice(i,1);else favs.push(id);store.set('og_favs',favs);buildNav();}
function pushRecent(id){id=+id;recent=recent.filter(x=>x!==id);recent.unshift(id);recent=recent.slice(0,8);store.set('og_recent',recent);}

// ---- views ----  The 'pages': home, a single category, favourites, recent.
function setQL(v){document.querySelectorAll('.ql').forEach(q=>q.classList.toggle('active',q.dataset.view===v));}

function home(){
  setActive(-1);setQL('home');main.scrollTop=0;
  let h='<div class="hc-eyebrow">Help Center</div><h1 class="hc-title">How can we help?</h1><p class="hc-sub">Internal support & setup guides. Search above, or jump into a section.</p>';
  const vr=recent.filter(id=>DOCS[id]&&!DOCS[id].deleted&&(admin||!DOCS[id].archived));
  if(vr.length){h+='<div class="section-label">Recently Viewed</div><div class="rv-grid">';
    vr.forEach(id=>{const d=DOCS[id];const m=CATMETA[d.cat]||{};h+='<div class="rv-card" data-id="'+id+'"><span class="mono-chip" style="background:'+(m.tint||'#eef')+';color:'+(m.color||'#333')+'">'+monoTitle(d.title)+'</span><span class="rv-title">'+esc(d.title)+'</span></div>';});h+='</div>';}
  h+='<div class="section-label">Browse by Category</div><div class="cat-grid">';
  ORDER.forEach(cat=>{const m=CATMETA[cat]||{};const items=vis(byCat[cat]||[]);if(!items.length)return;
    h+='<div class="cat-card" data-cat="'+esc(cat)+'" style="border-top-color:'+(m.color||'#2563eb')+'"><div class="cc-top"><span class="mono-chip lg" style="background:'+(m.tint||'#eef')+';color:'+(m.color||'#333')+'">'+(m.mono||monoTitle(cat))+'</span><span class="cc-count">'+items.length+' guides</span></div><h3>'+esc(cat)+'</h3><p>'+esc(m.desc||'')+'</p></div>';});
  h+='</div>';content.innerHTML=h;
  content.querySelectorAll('.rv-card[data-id]').forEach(e=>e.onclick=()=>go('g-'+e.dataset.id));
  content.querySelectorAll('.cat-card[data-cat]').forEach(e=>e.onclick=()=>showCat(e.dataset.cat));
}
function showCat(cat){
  setActive(-1);main.scrollTop=0;const items=vis(byCat[cat]||[]);const m=CATMETA[cat]||{};
  let h='<div class="crumb"><span onclick="go(\'home\')">Home</span> &rsaquo; '+esc(cat)+'</div>';
  h+='<div class="hero"><h2>'+m.icon+' '+esc(cat)+'</h2><p>'+esc(m.desc)+' · '+items.length+' guides</p></div><div class="mini">';
  items.forEach(d=>{h+='<div class="m" data-id="'+d._id+'"><span class="pill" style="background:'+m.color+'"></span>'+esc(d.title)+(isFav(d._id)?' &#9733;':'')+'</div>';});
  h+='</div>';content.innerHTML=h;
  content.querySelectorAll('.m[data-id]').forEach(e=>e.onclick=()=>go('g-'+e.dataset.id));
}
function favView(){
  setActive(-1);setQL('fav');main.scrollTop=0;
  let h='<div class="hero"><h2>&#9733; Favorites</h2><p>'+favs.length+' saved guide'+(favs.length!=1?'s':'')+'</p></div>';
  if(!favs.length)h+='<div class="empty">No favorites yet. Open any guide and click <b>&#9734; Save</b> to add it here.</div>';
  else{h+='<div class="mini">';favs.forEach(id=>{const d=DOCS[id];if(d&&!d.deleted&&(admin||!d.archived))h+='<div class="m" data-id="'+id+'"><span class="pill" style="background:'+CATMETA[d.cat].color+'"></span>'+esc(d.title)+'</div>';});h+='</div>';}
  content.innerHTML=h;content.querySelectorAll('.m[data-id]').forEach(e=>e.onclick=()=>go('g-'+e.dataset.id));
}
function recentView(){
  setActive(-1);setQL('recent');main.scrollTop=0;
  let h='<div class="hero"><h2>&#128336; Recently Viewed</h2></div>';
  if(!recent.length)h+='<div class="empty">Nothing viewed yet.</div>';
  else{h+='<div class="mini">';recent.forEach(id=>{const d=DOCS[id];if(d&&!d.deleted&&(admin||!d.archived))h+='<div class="m" data-id="'+id+'"><span class="pill" style="background:'+CATMETA[d.cat].color+'"></span>'+esc(d.title)+'</div>';});h+='</div>';}
  content.innerHTML=h;content.querySelectorAll('.m[data-id]').forEach(e=>e.onclick=()=>go('g-'+e.dataset.id));
}

// ---- article ----
// openDoc() renders one guide: title, meta buttons (Save/Print/Copy/Edit),
// step-progress bar, the body, the "On this page" list, related guides, prev/next.
let curId=null;
function openDoc(id,terms){
  id=+id;const d=DOCS[id];if(!d)return;if(d.deleted||(d.archived&&!admin)){go('home');return;}curId=id;setActive(id);setQL('');main.scrollTop=0;pushRecent(id);
  const m=CATMETA[d.cat]||{};const sib=vis(byCat[d.cat]);const idx=sib.indexOf(d);const prev=sib[idx-1],next=sib[idx+1];
  let bodyHtml=d.html;
  if(terms&&terms.length){bodyHtml=highlightHtml(bodyHtml,terms);}
  let h='<div class="crumb"><span onclick="go(\'home\')">Home</span> &rsaquo; <span onclick="showCat(\''+esc(d.cat).replace(/'/g,"")+'\')">'+esc(d.cat)+'</span></div>';
  h+=(admin&&d.archived)?'<div class="arch-note">&#128584; This guide is <b>hidden</b> from public viewers. Click <b>Unhide</b> to show it again.</div>':'';
  h+='<div class="doc-head"><h2 id="docTitle">'+esc(d.title)+'</h2></div>';
  h+='<div class="metarow"><span class="tagchip" style="background:'+(m.tint||m.color)+';color:'+m.color+'">'+esc(d.cat)+'</span>'+
     '<span>Updated '+fmtDate(d.updated)+'</span>'+(d.steps?'<span>'+d.steps+' steps</span>':'')+
     '<button class="abtn fav-star" id="favBtn">'+(isFav(id)?'&#9733; Saved':'&#9734; Save')+'</button>'+
     '<button class="abtn" onclick="window.print()">&#128424; Print / PDF</button>'+
     (admin?'<button class="abtn" id="editBtn">&#9998; Edit</button><button class="abtn" id="archBtn">'+(d.archived?'Unhide':'Hide')+'</button>'+(edits[id]?'<span class="edited-badge">edited</span>':''):'')+'</div>';
  // progress bar if steps
  if(d.steps){h+='<div class="progress"><div class="bar"><i id="pbar"></i></div><span class="lbl" id="plbl"></span><button id="resetSteps">Reset</button></div>';}
  h+='<div class="doc-wrap"><div class="doc-body" id="docBody">'+bodyHtml+'</div>';
  if(d.toc&&d.toc.length>=2){h+='<div class="toc"><h4>On this page</h4>';d.toc.forEach(t=>{h+='<a data-anchor="'+t.id+'">'+esc(t.label)+'</a>';});h+='</div>';}
  h+='</div>';
  // related
  const rel=sib.filter(x=>x._id!==id).slice(0,5);
  if(rel.length){h+='<div class="related"><div class="section-label">Related in '+esc(d.cat)+'</div><div class="mini">';
    rel.forEach(r=>{h+='<div class="m" data-id="'+r._id+'"><span class="pill" style="background:'+m.color+'"></span>'+esc(r.title)+'</div>';});h+='</div></div>';}
  h+='<div class="nav-foot">';
  h+=prev?'<button onclick="go(\'g-'+prev._id+'\')"><span class="lbl">&larr; Previous</span>'+esc(prev.title)+'</button>':'<span></span>';
  h+=next?'<button onclick="go(\'g-'+next._id+'\')" style="text-align:right;margin-left:auto"><span class="lbl">Next &rarr;</span>'+esc(next.title)+'</button>':'';
  h+='</div>';
  content.innerHTML=h;
  // wire favorites
  const fb=document.getElementById('favBtn');if(fb)fb.onclick=()=>{toggleFav(id);fb.innerHTML=isFav(id)?'&#9733; Saved':'&#9734; Save';};
  const eb=document.getElementById('editBtn');if(eb)eb.onclick=()=>enterEdit(id);
  const ab=document.getElementById('archBtn');if(ab)ab.onclick=()=>{const y=main.scrollTop;toggleArch(id);openDoc(id);main.scrollTop=y;};
  content.querySelectorAll('.toc a').forEach(a=>a.onclick=()=>{const t=document.getElementById(a.dataset.anchor);if(t)t.scrollIntoView({behavior:'smooth',block:'start'});});
  content.querySelectorAll('.related .m[data-id]').forEach(e=>e.onclick=()=>go('g-'+e.dataset.id));
  // steps
  if(d.steps)initSteps(id);
  if(terms&&terms.length){const fm=document.querySelector('#docBody mark');if(fm)setTimeout(()=>fm.scrollIntoView({behavior:'smooth',block:'center'}),60);}
}
function fmtDate(s){if(!s)return'';const[y,mo,da]=s.split('-');const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return M[+mo-1]+' '+(+da)+', '+y;}

// highlight inside rendered html without touching tags
function highlightHtml(htmlStr,terms){
  const tmp=document.createElement('div');tmp.innerHTML=htmlStr;
  const walker=document.createTreeWalker(tmp,NodeFilter.SHOW_TEXT);
  const texts=[];while(walker.nextNode())texts.push(walker.currentNode);
  texts.forEach(node=>{
    const val=node.nodeValue;const low=val.toLowerCase();let hit=false;
    for(const t of terms){if(t&&low.includes(t)){hit=true;break;}}
    if(!hit)return;
    const span=document.createElement('span');span.innerHTML=hl(val,terms);
    node.parentNode.replaceChild(span,node);
  });
  return tmp.innerHTML;
}

// ---- step checklists ----
// Each "Step N" line has a checkbox. Ticked steps are remembered per guide in
// og_steps_<id> and shown as a progress bar.
function initSteps(id){
  const key='og_steps_'+id;let checked=store.get(key,[]);
  const boxes=document.querySelectorAll('#docBody input[type=checkbox][data-step]');
  function refresh(){
    let done=0;boxes.forEach(b=>{const i=+b.dataset.step;const on=checked.includes(i);b.checked=on;
      b.closest('p.step').classList.toggle('done',on);if(on)done++;});
    const bar=document.getElementById('pbar'),lbl=document.getElementById('plbl');
    if(bar)bar.style.width=(boxes.length?done/boxes.length*100:0)+'%';
    if(lbl)lbl.textContent=done+' / '+boxes.length+' steps done';
  }
  boxes.forEach(b=>b.onchange=()=>{const i=+b.dataset.step;if(b.checked){if(!checked.includes(i))checked.push(i);}else checked=checked.filter(x=>x!==i);store.set(key,checked);refresh();});
  const rs=document.getElementById('resetSteps');if(rs)rs.onclick=()=>{checked=[];store.set(key,checked);refresh();};
  refresh();
}

// ---- search ----  Filters the sidebar live and lists ranked results.
let st;
searchEl.addEventListener('input',e=>{clearTimeout(st);const q=e.target.value.trim();
  filterNav(q);st=setTimeout(()=>q?go('q-'+encodeURIComponent(q)):go('home'),130);});
function filterNav(q){
  const ql=q.toLowerCase();
  document.querySelectorAll('.nav-item').forEach(n=>{const d=DOCS[n.dataset.id];
    n.classList.toggle('hidden',q&&!(d.title+' '+d.text).toLowerCase().includes(ql));});
}
function search(q){
  setActive(-1);setQL('');main.scrollTop=0;
  const terms=q.toLowerCase().split(/\s+/).filter(Boolean);
  const res=[];
  DOCS.forEach(d=>{if(d.deleted||(!admin&&d.archived))return;const hay=(d.title+' '+d.text).toLowerCase();let ok=true,score=0;
    terms.forEach(t=>{if(!hay.includes(t))ok=false;if(d.title.toLowerCase().includes(t))score+=5;score+=hay.split(t).length-1;});
    if(ok)res.push({d,score});});
  res.sort((a,b)=>b.score-a.score);
  let h='<div class="sr-head">'+res.length+' result'+(res.length!=1?'s':'')+' for &ldquo;'+esc(q)+'&rdquo;</div>';
  if(!res.length)h+='<div class="empty">No guides matched. Try different keywords.</div>';
  res.forEach(({d})=>{const c=CATMETA[d.cat]||{};
    h+='<div class="sr" data-id="'+d._id+'" data-q="'+esc(q)+'"><div class="cat" style="color:'+c.color+'">'+esc(d.cat)+'</div><h4>'+hl(d.title,terms)+'</h4><div class="snip">'+snippet(d.text,terms)+'</div></div>';});
  content.innerHTML=h;
  content.querySelectorAll('.sr').forEach(s=>s.onclick=()=>openDoc(s.dataset.id,terms));
}

// ---- router ----
// The part after # in the URL decides what to show (e.g. #g-3 = guide 3,
// #q-wifi = search "wifi"). That makes links shareable and Back/Forward work.
function go(route){if(location.hash==='#'+route)route_apply(route);else location.hash=route;}
function route_apply(r){
  if(r.startsWith('g-'))return openDoc(r.slice(2));
  if(r.startsWith('q-')){const q=decodeURIComponent(r.slice(2));searchEl.value=q;filterNav(q);return search(q);}
  if(r==='fav')return favView();
  if(r==='recent')return recentView();
  if(r==='manage')return manageView();
  if(r==='appearance')return appearanceView();
  return home();
}
window.addEventListener('hashchange',()=>route_apply((location.hash||'#home').slice(1)));

// quicklinks
document.querySelectorAll('.ql').forEach(q=>q.onclick=()=>{if(q.dataset.view==='new')return newGuideFlow();go(q.dataset.view);});
const brandHome=document.getElementById('brandHome');if(brandHome)brandHome.onclick=()=>go('home');

// back to top
main.addEventListener('scroll',()=>{document.getElementById('toTop').classList.toggle('show',main.scrollTop>400);});
document.getElementById('toTop').onclick=()=>main.scrollTo({top:0,behavior:'smooth'});

// keyboard
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&document.activeElement!==searchEl){e.preventDefault();searchEl.focus();return;}
  if(e.key==='Escape'){if(document.activeElement===searchEl){searchEl.value='';filterNav('');}go('home');searchEl.blur();return;}
  if(document.activeElement===searchEl)return;
  if(curId!=null&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    const d=DOCS[curId];const sib=byCat[d.cat];const idx=sib.indexOf(d);
    const t=e.key==='ArrowLeft'?sib[idx-1]:sib[idx+1];if(t){curId=null;go('g-'+t._id);}
  }
});

// ---- edit mode ----
// Password-gated editing right in the browser. Uses the browser's built-in
// rich-text editing (contentEditable). Saved changes go to og_edits and are
// re-applied every time the file is opened on this computer.
function askModal(title,desc,label){
  return new Promise(res=>{
    const m=document.createElement('div');m.className='modal';
    m.innerHTML='<div class="box"><h3>'+title+'</h3>'+(desc?'<p>'+desc+'</p>':'')+
      '<input type="password" placeholder="'+(label||'')+'"><div class="row"><button class="cancel">Cancel</button><button class="primary ok">OK</button></div></div>';
    document.body.appendChild(m);
    const inp=m.querySelector('input');setTimeout(()=>inp.focus(),30);
    function done(v){m.remove();res(v);}
    m.querySelector('.cancel').onclick=()=>done(null);
    m.querySelector('.ok').onclick=()=>done(inp.value);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')done(inp.value);if(e.key==='Escape')done(null);});
    m.addEventListener('mousedown',e=>{if(e.target===m)done(null);});
  });
}
// Pre-set edit password. (Anyone who opens the file can read it here, so treat
// it as a "keep honest people out" lock, not real security.)
const DEFAULT_PW='brunomars';
async function ensurePw(){
  const pw=store.get('og_editpw',DEFAULT_PW);   // a saved override would win, but none is set
  const ent=await askModal('Enter edit password','','Password');
  if(ent===null)return false;                   // user pressed Cancel
  if(ent!==pw){alert('Incorrect password.');return false;}
  return true;
}
async function enterEdit(id){
  id=+id;curId=id;   // password gate removed
  const body=document.getElementById('docBody');if(!body)return;
  body.innerHTML=DOCS[id].html;
  body.classList.add('editing');body.setAttribute('contenteditable','true');
  body.querySelectorAll('input[type=checkbox]').forEach(c=>c.disabled=true);
  // Also let the page title itself be edited.
  const titleEl=document.getElementById('docTitle');if(titleEl){titleEl.setAttribute('contenteditable','true');titleEl.classList.add('editing-title');}
  const bar=document.createElement('div');bar.className='editbar';
  bar.innerHTML='<strong style="font-size:13px">&#9998; Editing</strong><span class="sep"></span>'+
    '<button data-cmd="bold"><b>B</b></button>'+
    '<button data-cmd="italic"><i>I</i></button>'+
    '<button data-cmd="insertUnorderedList">&#8226; List</button>'+
    '<button data-block="p">Normal text</button>'+
    '<button data-block="h2">Heading</button>'+
    '<button data-cmd="removeFormat">Clear style</button>'+
    '<button id="edImg">&#128247; Image</button>'+
    '<span class="sep"></span>'+
    '<button class="save" id="edSave">&#10003; Save</button>'+
    '<button id="edCancel">Cancel</button>'+
    '<span class="note">You can edit the title and any text. Tip: click an oversized line, then &ldquo;Normal text&rdquo;.</span>';
  content.insertBefore(bar,content.firstChild);
  bar.querySelectorAll('button[data-cmd]').forEach(b=>b.onmousedown=e=>{e.preventDefault();document.execCommand(b.dataset.cmd,false,null);});
  bar.querySelectorAll('button[data-block]').forEach(b=>b.onmousedown=e=>{e.preventDefault();document.execCommand('formatBlock',false,b.dataset.block);});
  document.getElementById('edSave').onclick=()=>saveEdit(id);
  document.getElementById('edCancel').onclick=()=>openDoc(id);
  // Image button: pick a file, read it as a base64 data URL, drop it in at the cursor.
  const fileInp=document.createElement('input');fileInp.type='file';fileInp.accept='image/*';fileInp.style.display='none';bar.appendChild(fileInp);
  document.getElementById('edImg').onclick=()=>fileInp.click();
  fileInp.onchange=()=>{const f=fileInp.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{body.focus();document.execCommand('insertImage',false,r.result);};r.readAsDataURL(f);fileInp.value='';};
  main.scrollTo({top:0,behavior:'smooth'});
}
function saveEdit(id){
  id=+id;const body=document.getElementById('docBody');if(!body)return;
  const tmp=document.createElement('div');tmp.innerHTML=body.innerHTML;
  tmp.querySelectorAll('mark').forEach(mk=>{const f=document.createDocumentFragment();while(mk.firstChild)f.appendChild(mk.firstChild);mk.replaceWith(f);});
  tmp.querySelectorAll('input[type=checkbox]').forEach(c=>{c.disabled=false;c.checked=false;c.removeAttribute('checked');});
  const steps=tmp.querySelectorAll('p.step');const toc=[];
  steps.forEach((p,i)=>{let sid=p.id||('step-'+i);p.id=sid;const s=p.querySelector('strong');toc.push({id:sid,label:(s?s.textContent:('Step '+(i+1))).replace(/\s+/g,' ').trim()});});
  const d=DOCS[id];
  const titleEl=document.getElementById('docTitle');
  if(titleEl){const nt=titleEl.textContent.replace(/\s+/g,' ').trim();if(nt)d.title=nt;}
  d.html=tmp.innerHTML;
  d.text=(tmp.textContent||'').replace(/\s+/g,' ').trim();
  d.toc=toc;d.steps=steps.length;
  edits[id]={title:d.title,html:d.html,text:d.text,steps:d.steps,toc:d.toc};
  const ok=store.set('og_edits',edits);
  buildNav();openDoc(id);
  if(!ok)alert('Saved for this session only — browser storage is full (image-heavy edits fill it fast). Use the ⬇ Export button to keep changes permanently.');
}
// ---- admin login (gates editing; public can always read) ----
// NOTE: this is a STATIC page, so the password below is visible in the source and
// any edits an admin makes stay in their own browser. To change what the public
// sees you must: log in -> edit -> Download -> re-upload index.html to GitHub.
const ADMIN_PW='brunomars';                 // <-- change this string to set the admin password
let admin=store.get('og_admin',false)===true;
// ---- archive / hide (admins can hide a guide from the public without deleting it) ----
let archived=store.get('og_archived',null);
if(archived===null){archived=DOCS.filter(d=>d.archived).map(d=>d.nid);}   // seed from baked-in flags
archived.forEach(nid=>{const d=DOCS.find(x=>x.nid===nid);if(d)d.archived=true;});
function vis(list){return list.filter(d=>!d.deleted&&(admin||!d.archived));}        // what the current viewer may see
function deleteGuide(id){id=+id;const d=DOCS[id];if(!d)return false;
  if(!confirm('Permanently delete \u201c'+d.title+'\u201d? It will be removed from the published site after your next Download. This cannot be undone.'))return false;
  d.deleted=true;
  if(d.nid&&!deleted.includes(d.nid))deleted.push(d.nid);store.set('og_deleted',deleted);
  favs=favs.filter(x=>x!==id);store.set('og_favs',favs);
  recent=recent.filter(x=>x!==id);store.set('og_recent',recent);
  if(d.nid&&d.nid[0]==='n'){let nd=[];try{nd=JSON.parse(localStorage.getItem('og_newdocs'))||[];}catch(e){}nd=nd.filter(x=>x.nid!==d.nid);try{localStorage.setItem('og_newdocs',JSON.stringify(nd));}catch(e){}}
  buildNav();return true;}
function toggleArch(id){id=+id;const d=DOCS[id];if(!d)return;d.archived=!d.archived;
  if(d.archived){if(!archived.includes(d.nid))archived.push(d.nid);}else{archived=archived.filter(x=>x!==d.nid);}
  store.set('og_archived',archived);buildNav();}
function manageView(){
  if(!admin)return home();
  setActive(-1);setQL('manage');main.scrollTop=0;
  let h='<div class="hero"><h2>Manage Guides</h2><p>Hiding a guide removes it from public viewers without deleting it \u2014 you can unhide it anytime. Changes save on this device, so click <b>Download</b> (top-right) and re-upload to publish them live.</p></div>';
  ORDER.forEach(cat=>{const items=(byCat[cat]||[]).filter(d=>!d.deleted);if(!items.length)return;
    const active=items.filter(d=>!d.archived).length;
    h+='<div class="section-label">'+esc(cat)+' &middot; '+active+' visible / '+items.length+' total</div><div class="mng-list">';
    items.forEach(d=>{h+='<div class="mng-row'+(d.archived?' arch':'')+'"><span class="mng-t" data-id="'+d._id+'">'+esc(d.title)+'</span><span class="mng-status">'+(d.archived?'Hidden':'Visible')+'</span><button class="abtn mng-btn" data-arch="'+d._id+'">'+(d.archived?'Unhide':'Hide')+'</button><button class="abtn mng-del" data-del="'+d._id+'">Delete</button></div>';});
    h+='</div>';});
  h+='<div class="mng-save"><button class="abtn save" id="mng-save">'+(SUPA_ON?'&#128190; Save changes':'&#11015; Save &amp; Download')+'</button><span class="mng-note">'+(SUPA_ON?'Saves all your changes (hide / delete / edits / new guides / appearance) live for everyone, instantly.':'Downloads the updated <b>index.html</b> — drag it into GitHub (Add file &rarr; Upload files &rarr; Commit) to publish.')+'</span></div>';
  content.innerHTML=h;
  const ms=document.getElementById('mng-save');if(ms)ms.onclick=(SUPA_ON?publishToSupabase:exportFile);
  content.querySelectorAll('.mng-t[data-id]').forEach(e=>e.onclick=()=>go('g-'+e.dataset.id));
  content.querySelectorAll('.mng-btn[data-arch]').forEach(b=>b.onclick=()=>{const y=main.scrollTop;toggleArch(b.dataset.arch);manageView();main.scrollTop=y;});
  content.querySelectorAll('.mng-del[data-del]').forEach(b=>b.onclick=()=>{const y=main.scrollTop;if(deleteGuide(b.dataset.del)){manageView();main.scrollTop=y;}});
}
function exportFile(){
  // Serialise the current (possibly edited) guides back into a full HTML file named
  // index.html, ready to drop into the GitHub repo so Vercel republishes it.
  const data=JSON.stringify(DOCS.filter(d=>!d.deleted)).replace(/<\//g,'<\\/');
  let src='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  src=src.replace(/const DOCS = \[[\s\S]*?\];\s*\r?\nconst CATMETA/, ()=>'const DOCS = '+data+';\nconst CATMETA');
  src=src.replace(/let BAKED_APPEARANCE=\{[\s\S]*?\};/, ()=>'let BAKED_APPEARANCE='+JSON.stringify(appearance||{})+';');
  const blob=new Blob([src],{type:'text/html'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='index.html';
  document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(a.href);},1000);
}
function renderAdminBar(){
  const b=document.getElementById('adminBar');if(!b)return;
  document.body.classList.toggle('is-admin',admin);
  if(admin){
    b.innerHTML='<button id="newBtn">&#10133; New Guide</button>'+
      '<div class="ab-menu"><button id="setBtn">&#9881; Settings &#9662;</button>'+
        '<div class="ab-drop" id="setDrop">'+
          '<button data-go="manage">Manage Guides</button>'+
          '<button data-go="appearance">Appearance</button>'+
        '</div></div>'+
      '<button id="logoutBtn">Logout</button>';
    document.getElementById('newBtn').onclick=()=>newGuideFlow();
    const setBtn=document.getElementById('setBtn'),setDrop=document.getElementById('setDrop');
    setBtn.onclick=e=>{e.stopPropagation();setDrop.classList.toggle('open');};
    setDrop.querySelectorAll('button[data-go]').forEach(x=>x.onclick=()=>{setDrop.classList.remove('open');go(x.dataset.go);});
    document.addEventListener('click',()=>setDrop.classList.remove('open'));
    document.getElementById('logoutBtn').onclick=()=>{admin=false;store.set('og_admin',false);renderAdminBar();route_apply((location.hash||'#home').slice(1));};
  }else{
    b.innerHTML='<button id="loginBtn">&#128273; Admin</button>';
    document.getElementById('loginBtn').onclick=async()=>{
      const p=await askModal('Admin login','Enter the admin password to enable editing. Viewing stays open to everyone.','Password');
      if(p===null)return;
      if(p!==ADMIN_PW){alert('Incorrect password.');return;}
      admin=true;store.set('og_admin',true);renderAdminBar();route_apply((location.hash||'#home').slice(1));
    };
  }
}
// ---- appearance (font + colours; admin) ----
function applyAppearance(){
  const a=appearance||{};
  let link=document.getElementById('og-font');
  if(a.font&&a.font!=='system'){
    if(!link){link=document.createElement('link');link.id='og-font';link.rel='stylesheet';document.head.appendChild(link);}
    link.href='https://fonts.googleapis.com/css2?family='+a.font.replace(/ /g,'+')+':wght@400;500;600;700&display=swap';
  }else if(link){link.remove();}
  let css=':root{';
  if(a.accent)css+='--accent:'+a.accent+';--accent-soft:'+a.accent+'1f;';
  if(a.sidebar)css+='--sidebar:'+a.sidebar+';';
  if(a.bg)css+='--bg:'+a.bg+';';
  if(a.ink)css+='--ink:'+a.ink+';';
  css+='}';
  if(a.font&&a.font!=='system')css+='body{font-family:"'+a.font+'",-apple-system,BlinkMacSystemFont,sans-serif}';
  if(a.banner)css+='.banner{background:'+a.banner+';color:var(--banner-ink)}';
  let st=document.getElementById('og-custom');
  if(!st){st=document.createElement('style');st.id='og-custom';document.head.appendChild(st);}
  st.textContent=css;
}
function saveAppr(){store.set('og_appearance',appearance);applyAppearance();}
function appearanceView(){
  if(!admin)return home();
  setActive(-1);setQL('appearance');main.scrollTop=0;
  const a=appearance||{};
  const fonts=['system','Inter','Roboto','Open Sans','Lato','Poppins','Montserrat','Nunito','Work Sans','Source Sans 3','Merriweather','Lora'];
  let h='<div class="hero"><h2>Appearance</h2><p>Change the site font and colours. Previews instantly. Click <b>Save changes</b> to keep them, then <b>Download</b> (top-right) and re-upload to publish. (Fonts need an internet connection.)</p></div>';
  h+='<div class="appr"><label>Font<select id="ap-font">'+fonts.map(f=>'<option value="'+f+'"'+((a.font||'system')===f?' selected':'')+'>'+(f==='system'?'System default':f)+'</option>').join('')+'</select></label>';
  function row(k,lbl,def){return '<label>'+lbl+'<input type="color" data-k="'+k+'" value="'+(a[k]||def)+'"></label>';}
  h+=row('accent','Accent / Links','#6b7a3f')+row('sidebar','Sidebar Background','#f7f7f2')+row('bg','Page Background','#ffffff')+row('ink','Text Colour','#33352b')+row('banner','Banner Background','#e8ead8');
  h+='</div><div style="margin-top:18px;display:flex;gap:8px"><button class="abtn save" id="ap-save">Save Changes</button><button class="abtn" id="ap-reset">Reset to Default</button></div>';
  content.innerHTML=h;
  document.getElementById('ap-font').onchange=e=>{appearance.font=e.target.value;applyAppearance();};
  content.querySelectorAll('input[type=color][data-k]').forEach(inp=>inp.oninput=()=>{appearance[inp.dataset.k]=inp.value;applyAppearance();});
  document.getElementById('ap-save').onclick=()=>{store.set('og_appearance',appearance);applyAppearance();const b=document.getElementById('ap-save');b.textContent='Saved \u2713';setTimeout(()=>{b.textContent='Save Changes';},1500);};
  document.getElementById('ap-reset').onclick=()=>{appearance={};store.set('og_appearance',appearance);applyAppearance();appearanceView();};
}
// ---- new guide from a .docx upload (admin) ----
function loadMammoth(){return new Promise((res,rej)=>{
  if(window.mammoth)return res(window.mammoth);
  const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.9.0/mammoth.browser.min.js';
  s.onload=()=>res(window.mammoth);s.onerror=()=>rej();document.head.appendChild(s);});}
function injectSteps(html){
  const div=document.createElement('div');div.innerHTML=html;let i=0;const toc=[];
  div.querySelectorAll('p').forEach(p=>{const strong=p.querySelector('strong');
    if(strong&&/^Step\s+\d+/i.test(strong.textContent.trim())){
      p.classList.add('step');p.id='step-'+i;
      const label=document.createElement('label');label.className='stepchk';label.innerHTML='<input type="checkbox" data-step="'+i+'"><span class="box"></span>';
      p.insertBefore(label,p.firstChild);
      toc.push({id:'step-'+i,label:strong.textContent.replace(/\s+/g,' ').trim()});i++;}});
  return {html:div.innerHTML,toc:toc,steps:i};
}
function pickCat(){return new Promise(res=>{
  const m=document.createElement('div');m.className='modal';
  m.innerHTML='<div class="box"><h3>New Guide</h3><p>Pick a category, then upload a Word (.docx) file or start a blank guide you type yourself.</p><select id="pc-sel" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;margin-bottom:14px;background:var(--panel);color:var(--ink)">'+ORDER.map(c=>'<option>'+c+'</option>').join('')+'</select><div class="row"><button class="cancel">Cancel</button><button id="pc-blank">Start Blank</button><button class="primary ok">Upload .docx…</button></div></div>';
  document.body.appendChild(m);
  function done(v){m.remove();res(v);}
  const sel=()=>m.querySelector('#pc-sel').value;
  m.querySelector('.cancel').onclick=()=>done(null);
  m.querySelector('#pc-blank').onclick=()=>done({cat:sel(),mode:'blank'});
  m.querySelector('.ok').onclick=()=>done({cat:sel(),mode:'docx'});
  m.addEventListener('mousedown',e=>{if(e.target===m)done(null);});
});}
function persistNew(d){let nd=[];try{nd=JSON.parse(localStorage.getItem('og_newdocs'))||[];}catch(e){}
  const c=Object.assign({},d);delete c._id;
  const ix=nd.findIndex(x=>x.nid===d.nid);if(ix>=0)nd[ix]=c;else nd.push(c);
  try{localStorage.setItem('og_newdocs',JSON.stringify(nd));}catch(e){alert('Imported, but browser storage is full — Download soon to keep it.');}}
async function newGuideFlow(){
  if(!admin)return;
  const choice=await pickCat();if(!choice)return;const cat=choice.cat;
  if(choice.mode==='blank'){
    let d={cat:cat,title:'New Guide',file:'',html:'<p><strong>New guide</strong></p><p><strong>Purpose:</strong></p><p>Describe what this guide is for.</p><p><strong>Step 1: First step</strong></p><p>Describe the step here.</p>',updated:new Date().toISOString().slice(0,10),nid:'n'+Date.now()};
    const built=injectSteps(d.html);d.html=built.html;d.toc=built.toc;d.steps=built.steps;
    const tmp=document.createElement('div');tmp.innerHTML=d.html;d.text=(tmp.textContent||'').replace(/\s+/g,' ').trim();
    d._id=DOCS.length;DOCS.push(d);byCat[cat]=byCat[cat]||[];byCat[cat].push(d);
    persistNew(d);buildNav();openDoc(d._id);enterEdit(d._id);return;
  }
  const inp=document.createElement('input');inp.type='file';inp.accept='.docx';inp.style.display='none';document.body.appendChild(inp);
  inp.onchange=async()=>{const f=inp.files[0];inp.remove();if(!f)return;
    let M;try{M=await loadMammoth();}catch(e){alert('Could not load the .docx converter (needs internet). Please try again online.');return;}
    let res;try{const buf=await f.arrayBuffer();
      res=await M.convertToHtml({arrayBuffer:buf},{convertImage:M.images.imgElement(function(img){return img.read('base64').then(function(b64){return {src:'data:'+img.contentType+';base64,'+b64};});})});
    }catch(e){alert('Sorry, that .docx could not be read.');return;}
    const built=injectSteps(res.value);
    const tmp=document.createElement('div');tmp.innerHTML=built.html;
    const d={cat:cat,title:f.name.replace(/\.docx$/i,''),file:f.name,html:built.html,text:(tmp.textContent||'').replace(/\s+/g,' ').trim(),updated:new Date().toISOString().slice(0,10),steps:built.steps,toc:built.toc,nid:'n'+Date.now()};
    d._id=DOCS.length;DOCS.push(d);byCat[cat]=byCat[cat]||[];byCat[cat].push(d);
    persistNew(d);buildNav();openDoc(d._id);
    alert('Imported "'+d.title+'" into '+cat+'. Review it, click Edit to fix any formatting, then Download to publish.');
  };
  inp.click();
}
applyAppearance();
// ---- live publish via Supabase (optional; active once SUPA_URL/SUPA_KEY are set) ----
function rebuildByCatSafe(){if(typeof rebuildByCat==='function')rebuildByCat();}
function applyOverrides(o){
  if(!o)return;
  (o.newdocs||[]).forEach(d=>{if(!DOCS.some(x=>x.nid===d.nid)){d._id=DOCS.length;DOCS.push(d);}});
  const ped=o.edits||{};Object.keys(ped).forEach(k=>{const d=DOCS[+k];const e=ped[k];if(d&&e){if(e.title)d.title=e.title;d.html=e.html;d.text=e.text;d.steps=e.steps;d.toc=e.toc;}});
  (o.archived||[]).forEach(nid=>{const d=DOCS.find(x=>x.nid===nid);if(d)d.archived=true;});
  (o.deleted||[]).forEach(nid=>{const d=DOCS.find(x=>x.nid===nid);if(d)d.deleted=true;});
  if(o.appearance&&(!appearance||!Object.keys(appearance).length)){appearance=o.appearance;applyAppearance();}
  // re-apply this device's local (unsaved) changes on top so they win
  Object.keys(edits).forEach(k=>{const d=DOCS[+k];const e=edits[k];if(d&&e){if(e.title)d.title=e.title;d.html=e.html;d.text=e.text;d.steps=e.steps;d.toc=e.toc;}});
  archived.forEach(nid=>{const d=DOCS.find(x=>x.nid===nid);if(d)d.archived=true;});
  deleted.forEach(nid=>{const d=DOCS.find(x=>x.nid===nid);if(d)d.deleted=true;});
  rebuildByCatSafe();
}
function currentOverrides(){
  let nd=[];try{nd=JSON.parse(localStorage.getItem('og_newdocs'))||[];}catch(e){}
  return {edits:edits,archived:archived,deleted:deleted,appearance:appearance,newdocs:nd};
}
function loadSupabase(){return new Promise((res,rej)=>{
  if(window.supabase)return res();
  const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload=()=>res();s.onerror=()=>rej();document.head.appendChild(s);});}
async function publishToSupabase(){
  let key=sessionStorage.getItem('og_pubkey');
  if(!key){key=await askModal('Save to live site','Enter your publish password to save these changes for everyone.','Publish password');if(!key)return;}
  const btn=document.getElementById('mng-save');if(btn){btn.textContent='Saving…';btn.disabled=true;}
  try{
    if(!sb){await loadSupabase();sb=window.supabase.createClient(SUPA_URL,SUPA_KEY);}
    const {error}=await sb.rpc('publish_overrides',{pass:key,payload:currentOverrides()});
    if(error){sessionStorage.removeItem('og_pubkey');alert('Save failed: '+(error.message||'check your publish password.'));}
    else{sessionStorage.setItem('og_pubkey',key);alert('Saved! Your changes are live for everyone now.');}
  }catch(e){alert('Could not reach the database — check your internet or Supabase setup.');}
  if(btn){btn.textContent='\uD83D\uDCBE Save changes';btn.disabled=false;}
}
function startApp(){renderAdminBar();buildNav();route_apply((location.hash||'#home').slice(1));}
if(SUPA_ON){
  loadSupabase()
    .then(()=>{sb=window.supabase.createClient(SUPA_URL,SUPA_KEY);return sb.from('overrides').select('data').eq('id',1).single();})
    .then(r=>{if(r&&r.data&&r.data.data)applyOverrides(r.data.data);})
    .catch(()=>{})
    .finally(startApp);
}else{startApp();}
