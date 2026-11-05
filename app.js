/* Bergvik Slips. The publishable key below is safe in the browser: every table and file is protected by server-side rules. */
const SB_URL='https://ikzoevykxlzubytklzgc.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrem9ldnlreGx6dWJ5dGtsemdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MTQ5NjYsImV4cCI6MjEwOTE5MDk2Nn0.L6tJqcuSAvVq4MWrb2h_lXIbFDVilSzjTl5N6jlMqTI';
const sb=supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'bergvik-slips-auth'}});
const L=window.SlipLogic;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rand=n=>n==null?'':'R'+Number(n).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=(n,c)=>c==='ZAR'||!c?rand(n):c+' '+Number(n).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const monthOf=d=>d.slice(0,7)+'-01';
const monthName=m=>new Date(m+'T00:00:00').toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),3500)}
const friendly=e=>{const m=e?.message||String(e);return /Failed to fetch|NetworkError|Load failed/i.test(m)?'No connection. Try again.':m};

const CURRENCIES=[['USD','USD (US Dollar)'],['EUR','EUR (Euro)'],['GBP','GBP (British Pound)'],['KES','KES (Kenyan Shilling)'],['BWP','BWP (Botswana Pula)'],['AED','AED (UAE Dirham)'],['AUD','AUD (Australian Dollar)'],['SEK','SEK (Swedish Krona)']];
/* Month-end happens early in the next month, so the first 10 days open on last month */
function defaultMonth(){const t=today(),[y,m,d]=t.split('-').map(Number);if(d>10)return monthOf(t);const p=new Date(Date.UTC(y,m-2,1));return p.toISOString().slice(0,10)}
const importLabel=()=>`Import and match to ${monthName(S.month)}`;
const S={me:null,view:'capture',cards:[],cats:[],opts:[],month:defaultMonth(),draft:null};
const isFin=()=>S.me?.role==='finance';

/* ---------- boot and login ---------- */
async function boot(){
  window.addEventListener('online',()=>{document.body.classList.remove('offline');flushOutbox()});
  window.addEventListener('offline',()=>document.body.classList.add('offline'));
  if(!navigator.onLine)document.body.classList.add('offline');
  setInterval(flushOutbox,20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){flushOutbox();if(S.me)loadRefs().catch(()=>{})}});
  try{if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js')}catch{}
  const {data}=await sb.auth.getSession();
  if(data.session)await enter();else loginView();
}
function loginView(msg){
  $('#app').innerHTML=`<form class="login" id="lf"><img class="login-logo" src="logo.jpg" alt="Bergvik. Creating new dimensions."><h1>Slips</h1><p>Capture company card slips as you pay.</p>
  ${msg?`<div class="note bad">${esc(msg)}</div>`:''}
  <div class="field"><label class="lbl" for="em">Email</label><input id="em" type="email" autocomplete="username" required></div>
  <div class="field"><label class="lbl" for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
  <button class="btn full" id="lb">Sign in</button><p class="muted" style="margin-top:1rem">Forgot your password? Ask finance to reset it.</p></form>`;
  $('#lf').onsubmit=async e=>{e.preventDefault();$('#lb').disabled=true;
    const {error}=await sb.auth.signInWithPassword({email:$('#em').value.trim(),password:$('#pw').value});
    if(error)return loginView(/invalid/i.test(error.message)?'Wrong email or password.':friendly(error));
    enter()};
}
async function enter(){
  const {data:u}=await sb.auth.getUser();
  const {data:me,error}=await sb.from('profiles').select('*').eq('id',u.user?.id).maybeSingle();
  if(error&&!navigator.onLine){const c=store.get('slips-cache',null);if(c){Object.assign(S,c);return shell()}}
  if(!me||!me.active){await sb.auth.signOut();return loginView('This account is not active. Ask finance for access.')}
  S.me=me;
  if(me.must_change_password)return pwView();
  await loadRefs();S.view=isFin()&&matchMedia('(min-width:761px)').matches?'month':'capture';shell();flushOutbox();
}
function pwView(){
  $('#app').innerHTML=`<form class="login" id="pf"><img class="login-logo" src="logo.jpg" alt="Bergvik. Creating new dimensions."><h1>Choose a password</h1><p>Replace your temporary password. Use at least 10 characters.</p><div id="pe"></div>
  <div class="field"><label class="lbl" for="p1">New password</label><input id="p1" type="password" minlength="10" autocomplete="new-password" required></div>
  <div class="field"><label class="lbl" for="p2">Repeat it</label><input id="p2" type="password" minlength="10" autocomplete="new-password" required></div><button class="btn full">Save password</button></form>`;
  $('#pf').onsubmit=async e=>{e.preventDefault();const a=$('#p1').value;
    if(a!==$('#p2').value){$('#pe').innerHTML='<div class="note bad">The passwords do not match.</div>';return}
    const {error}=await sb.auth.updateUser({password:a});
    if(error){$('#pe').innerHTML=`<div class="note bad">${esc(friendly(error))}</div>`;return}
    await sb.rpc('password_changed');S.me.must_change_password=false;enter()};
}
async function loadRefs(){
  const [c,k,o]=await Promise.all([
    sb.from('cards').select('*').eq('active',true).order('label'),
    sb.from('categories').select('*').eq('active',true).order('sort'),
    sb.from('options').select('*').order('name')]);
  S.cards=c.data||[];S.cats=k.data||[];S.opts=o.data||[];
  store.set('slips-cache',{me:S.me,cards:S.cards,cats:S.cats,opts:S.opts});
}
const myCards=()=>S.cards.filter(c=>c.holder_id===S.me.id);
const opts=k=>S.opts.filter(o=>o.kind===k&&o.active);
const optName=id=>S.opts.find(o=>o.id===id)?.name||'';

/* ---------- layout ---------- */
function shell(){
  const items=[['capture','Capture'],['mine','My slips']];
  if(isFin())items.push(['month','Month'],['people','People & cards'],['lists','Lists']);
  const b=items.map(([k,l])=>`<button data-go="${k}" class="${S.view===k?'on':''}">${l}</button>`).join('');
  $('#app').innerHTML=`<header class="top"><span class="logo-chip"><img src="logo-mark.jpg" alt="Bergvik"></span><h1>Slips</h1><nav class="nav">${b}</nav><span class="who">${esc(S.me.full_name)}</span><button id="so">Sign out</button></header><main id="m"></main><nav class="tabs">${b}</nav>`;
  $$('[data-go]').forEach(x=>x.onclick=()=>{S.view=x.dataset.go;shell()});
  $('#so').onclick=async()=>{await sb.auth.signOut();location.reload()};
  ({capture:captureView,mine:mineView,month:monthView,people:peopleView,lists:listsView}[S.view])();
}

/* ---------- photo handling ---------- */
const MAX_EDGE=2000;
async function toImage(file){
  const bmp=await createImageBitmap(file);
  const r=Math.min(1,MAX_EDGE/Math.max(bmp.width,bmp.height));
  const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*r);cv.height=Math.round(bmp.height*r);
  cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);
  const blob=await new Promise(ok=>cv.toBlob(ok,'image/jpeg',.85));
  return {blob,cv,w:bmp.width,h:bmp.height};
}
/* Instant checks: tuned limits should be reviewed against about 50 real slips. */
function quality(cv,w,h){
  const issues=[];
  if(Math.min(w,h)<700)issues.push('The image is too small. Move closer.');
  const W=480,H=Math.max(1,Math.round(cv.height*W/cv.width)),c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(cv,0,0,W,H);
  const d=x.getImageData(0,0,W,H).data,g=new Float32Array(W*H);let sum=0;
  for(let i=0;i<W*H;i++){const v=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];g[i]=v;sum+=v}
  const mean=sum/(W*H);let lapS=0,lapQ=0,n=0;
  for(let y=1;y<H-1;y+=2)for(let i=1;i<W-1;i+=2){const p=y*W+i,l=4*g[p]-g[p-1]-g[p+1]-g[p-W]-g[p+W];lapS+=l;lapQ+=l*l;n++}
  const sharp=n?lapQ/n-(lapS/n)**2:0;
  if(mean<70)issues.push('The photo is too dark. Find more light.');
  if(sharp<35)issues.push('The photo looks blurry. Hold steady and tap to focus.');
  return {issues,sharp:Math.round(sharp),mean:Math.round(mean)};
}
const b64=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(blob)});

/* ---------- capture ---------- */
const newDraft=()=>({id:crypto.randomUUID(),mode:'purchase',files:[],slip_date:today(),supplier:'',total:'',currency:'ZAR',vat_amount:'',
  category_id:'',cost_to:store.get('slips-costto','department'),department_id:store.get('slips-dept',''),project_name:'',client_name:'',purpose:'',notes:'',
  no_slip:false,no_slip_reason:'',cash_change_returned:'',quality_flag:false,ai_read:false,foreign:false,card_id:'',retakes:0,notices:[],reading:false});
function captureView(){
  const m=$('#m');m.className='';
  const ed=S.draft?.editing,fl=S.draft?.fromLine;
  const cards=fl?[fl.card]:ed?S.cards.filter(c=>c.id===S.draft.card_id||(c.holder_id===ed.user_id&&ed.user_id===S.me.id)):myCards();
  if(ed&&!cards.length)cards.push({id:S.draft.card_id,label:'Card on this slip',last4:'saved'});
  if(!cards.length){m.innerHTML='<div class="card"><h2>No card assigned</h2><p class="muted">Ask finance to link your company card to your account.</p></div>';return}
  if(!S.draft)S.draft=newDraft();
  const d=S.draft; if(!d.card_id)d.card_id=store.get('slips-card','')&&cards.some(c=>c.id===store.get('slips-card',''))?store.get('slips-card',''):cards[0].id;
  const cash=d.mode==='cash', cat=S.cats.find(c=>c.id===d.category_id);
  m.innerHTML=`<div id="outbox"></div>
  ${ed?`<div class="note info">Editing <b>${esc(ed.ref)}</b>. Change what’s wrong, then save.<button type="button" class="btn sm ghost" id="ec" style="margin-left:.5rem">Cancel</button></div>`:''}
  ${fl?`<div class="note info">Adding the slip for <b>${esc(fl.person)}</b> (${rand(fl.amount)}, ${esc(fl.description)}). It links to this statement line when you save.<button type="button" class="btn sm ghost" id="ec" style="margin-left:.5rem">Cancel</button></div>`:''}
  ${d.no_slip||cash?'':`<div class="big"><label class="a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/></svg>${d.files.length?'Add a photo':'Take photo'}<input id="cam" class="hide" type="file" accept="image/*" capture="environment"></label>
  <label class="b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>Upload PDF or file<input id="fil" class="hide" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label></div>`}
  ${ed||fl?'':`<div class="link-row" style="margin-bottom:.8rem"><button id="ns" class="${d.no_slip?'on':''}">I have no slip</button><button id="cw" class="${cash?'on':''}">Cash withdrawal</button></div>`}
  ${ed&&d.existing?.length?`<p class="muted" style="margin-bottom:.8rem">${d.existing.length} saved image${d.existing.length>1?'s':''} kept with this slip.</p>`:''}
  <div class="thumbs">${d.files.map((f,i)=>`<div class="thumb">${f.url?`<img src="${f.url}" alt="Slip page ${i+1}">`:'PDF'}<button data-rm="${i}" aria-label="Remove">×</button></div>`).join('')}</div>
  ${d.reading?'<div class="note info"><span class="spin"></span> Reading the slip…</div>':''}
  ${d.notices.map(n=>`<div class="note ${n[0]}">${esc(n[1])}</div>`).join('')}
  <form id="sf" novalidate><div class="card">
   ${cards.length>1?`<div class="field"><label class="lbl" for="f_card">Card</label><select id="f_card">${cards.map(c=>`<option value="${c.id}" ${c.id===d.card_id?'selected':''}>${esc(c.label)} (${c.last4})</option>`).join('')}</select></div>`:`<p class="muted" style="margin-bottom:.8rem">Card: ${esc(cards[0].label)} (${cards[0].last4})</p>`}
   ${d.no_slip?`<div class="field"><label class="lbl" for="f_nsr">Why is there no slip?</label><textarea id="f_nsr" data-k="no_slip_reason" required>${esc(d.no_slip_reason)}</textarea></div>`:''}
   <div class="row"><div class="field"><label class="lbl" for="f_date">Date</label><input id="f_date" data-k="slip_date" type="date" max="${today()}" value="${esc(d.slip_date)}" required></div>
   <div class="field"><label class="lbl" for="f_total">${cash?'Amount drawn':'Total paid'} ${d.foreign?'':'(R)'}</label><input id="f_total" data-k="total" type="number" inputmode="decimal" step="0.01" min="0.01" value="${esc(d.total)}" required></div></div>
   ${cash?'':`<div class="field"><label class="lbl" for="f_sup">Supplier</label><input id="f_sup" data-k="supplier" type="text" value="${esc(d.supplier)}" required autocomplete="off"></div>
   <label class="muted" style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem;min-height:32px"><input id="f_for" type="checkbox" ${d.foreign?'checked':''}> Paid in a foreign currency</label>
   ${d.foreign?`<div class="field"><label class="lbl" for="f_cur">Currency</label><select id="f_cur">${[...new Set([...CURRENCIES.map(c=>c[0]),d.currency])].map(c=>`<option value="${esc(c)}" ${c===d.currency?'selected':''}>${esc(CURRENCIES.find(x=>x[0]===c)?.[1]||c)}</option>`).join('')}</select><p class="muted" style="margin-top:.3rem">Enter the amount on the receipt. Finance gets the rand amount from the statement.</p></div>`:''}
   <div class="field"><label class="lbl" for="f_cat">What was it for?</label><select id="f_cat" required><option value="">Choose…</option>${S.cats.map(c=>`<option value="${c.id}" ${c.id===d.category_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
   ${cat?.needs_client?nameField('client','f_cl','Client name',d.client_name):''}
   ${cat?.needs_purpose?`<div class="field"><label class="lbl" for="f_pur">${cat.needs_client?'Who attended, and why?':'What was this for?'}</label><textarea id="f_pur" data-k="purpose">${esc(d.purpose)}</textarea></div>`:''}
   <label class="lbl">Charge to</label><div class="seg"><button type="button" data-ct="department" class="${d.cost_to==='department'?'on':''}">Department</button><button type="button" data-ct="project" class="${d.cost_to==='project'?'on':''}">Project</button></div>
   ${d.cost_to==='department'?`<div class="field"><select id="f_dep" aria-label="Department"><option value="">Choose a department…</option>${opts('department').map(o=>`<option value="${o.id}" ${o.id===d.department_id?'selected':''}>${esc(o.name)}</option>`).join('')}</select></div>`
   :nameField('project','f_prj','Project name',d.project_name)}
   <div class="field"><label class="lbl" for="f_vat">VAT on slip (optional)</label><input id="f_vat" data-k="vat_amount" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(d.vat_amount)}"></div>`}
   ${cash?`<div class="field"><label class="lbl" for="f_pur">What is the cash for?</label><textarea id="f_pur" data-k="purpose">${esc(d.purpose)}</textarea></div><div class="field"><label class="lbl" for="f_chg">Change returned (R)</label><input id="f_chg" data-k="cash_change_returned" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(d.cash_change_returned)}"></div>`:''}
   <div class="field"><label class="lbl" for="f_notes">Notes (optional)</label><input id="f_notes" data-k="notes" type="text" value="${esc(d.notes)}"></div>
   <div id="se"></div><button class="btn full green" id="sv">${ed?'Save changes':'Save slip'}</button></div></form>`;
  $$('[data-k]',m).forEach(i=>i.oninput=()=>{d[i.dataset.k]=i.value;if(i.dataset.k==='supplier')suggest(d);if(i.dataset.k==='total')notices(d,true)});
  const on=(id,fn)=>{const e=$(id,m);if(e)e.onchange=fn};
  on('#cam',e=>addFile(e.target.files[0],true));on('#fil',e=>addFile(e.target.files[0],false));
  on('#f_card',e=>{d.card_id=e.target.value});on('#f_cur',e=>{d.currency=e.target.value});
  on('#f_for',e=>{d.foreign=e.target.checked;d.currency=d.foreign?'USD':'ZAR';captureView()});
  on('#f_cat',e=>{d.category_id=e.target.value;captureView()});
  on('#f_dep',e=>{d.department_id=e.target.value});
  wireName('client','f_cl','client_name');wireName('project','f_prj','project_name');
  $$('[data-ct]',m).forEach(b=>b.onclick=()=>{d.cost_to=b.dataset.ct;captureView()});
  $$('[data-rm]',m).forEach(b=>b.onclick=()=>{d.files.splice(+b.dataset.rm,1);captureView()});
  if(ed||fl)$('#ec').onclick=()=>{const v=d.returnView;S.draft=null;S.view=v;shell()};
  else{$('#ns').onclick=()=>{d.no_slip=!d.no_slip;d.mode='purchase';d.files=[];d.notices=[];captureView()};
  $('#cw').onclick=()=>{d.mode=cash?'purchase':'cash';d.no_slip=false;d.notices=[];d.supplier=cash?'':'Cash withdrawal';captureView()}}
  $('#sf').onsubmit=saveSlip;
  renderOutbox();
}
function nameField(kind,id,label,val){return `<div class="field"><label class="lbl" for="${id}">${label}</label><input id="${id}" type="text" maxlength="80" autocomplete="off" value="${esc(val)}" placeholder="Start typing"><div class="sugg" id="${id}_s" role="listbox"></div></div>`}
function wireName(kind,id,key){
  const i=$('#'+id);if(!i)return;const box=$('#'+id+'_s'),d=S.draft;
  const show=()=>{const names=opts(kind).map(o=>o.name),list=L.suggestNames(i.value,names).filter(n=>!L.sameName(n,i.value));
    box.innerHTML=list.map(n=>`<button type="button" role="option" data-n="${esc(n)}">${esc(n)}</button>`).join('');
    $$('button',box).forEach(b=>b.onpointerdown=e=>{e.preventDefault();i.value=b.dataset.n;d[key]=b.dataset.n;d._nameOk=false;box.innerHTML=''})};
  i.oninput=()=>{d[key]=i.value;d._nameOk=false;show()};i.onfocus=show;i.onblur=()=>setTimeout(()=>{box.innerHTML=''},150);
}
async function ensureOption(kind,name){
  name=name.trim().replace(/\s+/g,' ');
  const hit=S.opts.find(o=>o.kind===kind&&L.sameName(o.name,name));if(hit)return hit.id;
  const {data,error}=await sb.from('options').insert({kind,name}).select().single();
  if(!error){S.opts.push(data);return data.id}
  if(!/duplicate|unique/i.test(error.message))throw error;
  const r=await sb.from('options').select('*').eq('kind',kind);if(r.error)throw r.error;
  const m=r.data.find(o=>L.sameName(o.name,name));if(!m)throw error;return m.id;
}
function ask(label){return new Promise(ok=>{
  const w=document.createElement('div');w.className='modal';w.innerHTML=`<div><form><label class="lbl" for="a1">${esc(label)}</label><div class="field"><input id="a1" type="text" required></div><div class="row"><button type="button" class="btn ghost" id="a0">Cancel</button><button class="btn">Save</button></div></form></div>`;
  document.body.append(w);$('#a1',w).focus();
  $('#a0',w).onclick=()=>{w.remove();ok('')};$('form',w).onsubmit=e=>{e.preventDefault();const v=$('#a1',w).value.trim();w.remove();ok(v)}})}
function suggest(d){
  if(d.category_id)return;const s=d.supplier.toLowerCase();
  const learned=store.get('slips-learn',{});let id=Object.entries(learned).find(([k])=>s.includes(k))?.[1];
  if(!id){const rules=[[/engen|shell|\bbp\b|caltex|sasol|astron|totalenergies/,'Fuel'],[/google ads|facebook|meta ads|linkedin/,'Advertising & promotions'],[/adobe|microsoft|glide|openai|anthropic|zoom/,'Software'],[/toll|sanral|parking/,'Parking & tolls']];
    const r=rules.find(([re])=>re.test(s));if(r)id=S.cats.find(c=>c.name===r[1])?.id}
  if(id&&S.cats.some(c=>c.id===id)){d.category_id=id;const f=$('#f_cat');if(f)f.value=id}
}
function notices(d,rerender){
  const n=(d.notices||[]).filter(x=>x[2]!=='big');
  if(d.currency==='ZAR'&&+d.total>5000)n.push(['warn','Over R5,000: SARS expects a full tax invoice showing Bergvik’s name, address and VAT number. Please ask the supplier for one.','big']);
  const had=(d.notices||[]).some(x=>x[2]==='big'),has=n.some(x=>x[2]==='big');d.notices=n;
  if(rerender&&had!==has){const a=document.activeElement?.id;captureView();if(a){const e=$('#'+a);if(e){e.focus();try{const v=e.value;e.value='';e.value=v}catch{}}}}
}
async function addFile(file,fromCamera){
  if(!file)return;const d=S.draft;
  if(file.size>25e6){toast('That file is too big. The limit is 25 MB.');return}
  if(file.type==='application/pdf'){
    if(file.size>1e7){toast('PDFs must be under 10 MB.');return}
    d.files.push({blob:file,mime:'application/pdf',ext:'pdf'});captureView();if(d.files.length===1&&!d.editing)readSlip(d,file,'application/pdf');return}
  let img;try{img=await toImage(file)}catch{toast('That file could not be opened. Try a JPG, PNG or PDF.');return}
  const q=quality(img.cv,img.w,img.h);
  if(q.issues.length&&fromCamera&&d.retakes<2){d.retakes++;d.notices=[['bad',q.issues.join(' ')+' Please retake it.']];captureView();return}
  if(q.issues.length){d.quality_flag=true;d.notices=[['warn','This image may be hard to read. Finance will see a quality flag.']]}else d.notices=[];
  d.files.push({blob:img.blob,mime:'image/jpeg',ext:'jpg',url:URL.createObjectURL(img.blob)});captureView();
  if(d.files.length===1&&!d.editing)readSlip(d,img.blob,'image/jpeg');
}
async function readSlip(d,blob,mime){
  if(!navigator.onLine)return;
  d.reading=true;captureView();
  try{
    const {data,error}=await sb.functions.invoke('read-slip',{body:{data_base64:await b64(blob),media_type:mime}});
    d.reading=false;
    if(error||!data?.fields){captureView();return}
    if(S.draft!==d)return;
    const f=data.fields;
    if(f.readable===false&&mime==='image/jpeg'&&d.retakes<2){d.retakes++;d.files.pop();d.notices=[['bad','The date, supplier or total can’t be read. Please retake the photo.']];captureView();return}
    if(f.readable===false)d.quality_flag=true;
    if(f.supplier&&!d.supplier)d.supplier=f.supplier;
    const fd=L.fixDayMonth(f.slip_date,today());if(fd.date&&fd.date<=today())d.slip_date=fd.date;
    if(f.total&&!d.total)d.total=f.total.toFixed(2);
    if(f.currency&&f.currency!=='ZAR'&&!d.fromLine){d.currency=f.currency.toUpperCase();d.foreign=true}
    if(f.vat_amount!=null&&!d.vat_amount)d.vat_amount=Number(f.vat_amount).toFixed(2);
    d.ai_read=true;suggest(d);notices(d);
    d.notices.push(['info','Filled in from the slip. Please check the date and amount.']);
    if(f.is_card_terminal_slip_only)d.notices.push(['warn','This looks like a card-machine slip. Finance needs the till slip or tax invoice, so please add that too.']);
  }catch{d.reading=false}
  if(S.view==='capture')captureView();
}
function buildSlip(d){
  const cash=d.mode==='cash',num=v=>v===''||v==null?null:Number(v);
  return {id:d.id,card_id:d.card_id,kind:cash?'cash_withdrawal':'purchase',slip_date:d.slip_date,supplier:cash?'Cash withdrawal':d.supplier.trim(),total:num(d.total),currency:cash?'ZAR':d.currency,
   vat_amount:cash?null:num(d.vat_amount),category_id:cash?null:d.category_id||null,
   department_id:!cash&&d.cost_to==='department'?d.department_id||null:null,project_id:null,client_id:null,_project_name:!cash&&d.cost_to==='project'?d.project_name.trim():'',_client_name:!cash&&S.cats.find(c=>c.id===d.category_id)?.needs_client?d.client_name.trim():'',
   purpose:d.purpose.trim()||null,notes:d.notes.trim()||null,no_slip:d.no_slip,no_slip_reason:d.no_slip?d.no_slip_reason.trim():null,
   cash_change_returned:cash?num(d.cash_change_returned):null,quality_flag:d.quality_flag,ai_read:d.ai_read};
}
function validate(d){
  const cat=S.cats.find(c=>c.id===d.category_id),cash=d.mode==='cash';
  if(!d.slip_date)return 'Enter the date.';if(!(+d.total>0))return 'Enter the amount.';
  if(d.slip_date>today())return 'The date can’t be in the future.';
  if(d.no_slip&&!d.no_slip_reason.trim())return 'Say why there is no slip.';
  if(cash)return d.purpose.trim()?null:'Say what the cash is for.';
  if(!d.no_slip&&!d.files.length&&!d.existing?.length)return 'Add a photo or file of the slip, or choose “I have no slip”.';
  if(!d.supplier.trim())return 'Enter the supplier.';if(!cat)return 'Choose what it was for.';
  if(cat.needs_client&&!d.client_name.trim())return 'Enter the client name.';
  if(cat.needs_purpose&&!d.purpose.trim())return cat.needs_client?'Say who attended and why.':'Say what this was for.';
  if(d.cost_to==='department'&&!d.department_id)return 'Choose a department.';
  if(d.cost_to==='project'&&!d.project_name.trim())return 'Enter the project name.';
  return null;
}
async function uploadAndSave(rec0,files){
  const rows=[],{_project_name:pn,_client_name:cn,...rec}=rec0,uid=rec.user_id||S.me.id;
  if(pn)rec.project_id=await ensureOption('project',pn);
  if(cn)rec.client_id=await ensureOption('client',cn);
  for(let i=0;i<files.length;i++){const f=files[i],path=`${uid}/${rec.id}/${i+1}.${f.ext}`;
    const {error}=await sb.storage.from('slips').upload(path,f.blob,{contentType:f.mime,upsert:false});
    if(error&&!/exists|Duplicate/i.test(error.message))throw error;
    rows.push({slip_id:rec.id,path,mime:f.mime,size_bytes:f.blob.size,page_no:i+1})}
  const {data,error}=await sb.from('slips').insert(rec).select('ref').maybeSingle();
  if(error&&!/duplicate key/i.test(error.message))throw error;
  if(rows.length){const r=await sb.from('slip_files').upsert(rows,{onConflict:'path',ignoreDuplicates:true});if(r.error)throw r.error}
  return data?.ref;
}
async function saveEdit(d,rec0,files){
  if(!navigator.onLine)throw new TypeError('Failed to fetch');
  const {id,_project_name:pn,_client_name:cn,...rec}=rec0,rows=[];
  if(pn)rec.project_id=await ensureOption('project',pn);
  if(cn)rec.client_id=await ensureOption('client',cn);
  const start=d.existing?.length||0;
  for(let i=0;i<files.length;i++){const f=files[i],path=`${S.me.id}/${id}/${start+i+1}-${Date.now()}.${f.ext}`;
    const {error}=await sb.storage.from('slips').upload(path,f.blob,{contentType:f.mime,upsert:false});if(error)throw error;
    rows.push({slip_id:id,path,mime:f.mime,size_bytes:f.blob.size,page_no:start+i+1})}
  const {error}=await sb.from('slips').update(rec).eq('id',id).select('id').single();if(error)throw error;
  if(rows.length){const r=await sb.from('slip_files').insert(rows);if(r.error)throw r.error}
}
function slipForLine(l,M){
  const k=M.cards.find(c=>c.id===l.card_id),dr=newDraft(),date=l.txn_date||l.post_date;
  S.draft=Object.assign(dr,{fromLine:{id:l.id,holder:k.holder_id,person:personOf(M,k.holder_id),amount:l.amount,description:l.description.replace(/\s+/g,' ').trim(),card:{id:k.id,label:k.label,last4:k.last4}},
    returnView:'month',card_id:k.id,slip_date:date,total:String(l.amount),supplier:L.parseDescriptor(l.description,l.post_date).merchant.replace(/\s+/g,' ')});
  S.view='capture';shell();
}
function editSlip(s,returnView){
  const dr=newDraft();
  S.draft=Object.assign(dr,{id:s.id,editing:s,returnView,existing:s.slip_files||[],mode:s.kind==='cash_withdrawal'?'cash':'purchase',card_id:s.card_id,slip_date:s.slip_date,supplier:s.supplier,total:String(s.total),currency:s.currency,foreign:s.currency!=='ZAR',
    vat_amount:s.vat_amount??'',category_id:s.category_id||'',cost_to:s.project_id?'project':'department',department_id:s.department_id||'',project_name:optName(s.project_id),client_name:optName(s.client_id),purpose:s.purpose||'',notes:s.notes||'',
    no_slip:s.no_slip,no_slip_reason:s.no_slip_reason||'',cash_change_returned:s.cash_change_returned??'',quality_flag:s.quality_flag,ai_read:s.ai_read,_nameOk:true});
  S.view='capture';shell();
}
const isNet=e=>/Failed to fetch|NetworkError|Load failed|fetch/i.test(e?.message||'');
async function saveSlip(e){
  e.preventDefault();const d=S.draft,err=validate(d),se=$('#se');
  if(err){se.innerHTML=`<div class="note bad">${esc(err)}</div>`;return}
  if(!d._nameOk&&d.mode!=='cash'){
    const cat=S.cats.find(c=>c.id===d.category_id);
    for(const [kind,key,on] of [['project','project_name',d.cost_to==='project'],['client','client_name',cat?.needs_client]]){
      const near=on?L.closestName(d[key],opts(kind).map(o=>o.name)):null;
      if(near){se.innerHTML=`<div class="note warn">Did you mean <b>${esc(near)}</b>?<div class="row" style="margin-top:.5rem"><button type="button" class="btn sm" id="nu">Use ${esc(near)}</button><button type="button" class="btn sm ghost" id="nk">Keep what I typed</button></div></div>`;
        $('#nu').onclick=()=>{d[key]=near;d._nameOk=true;captureView();$('#sf').requestSubmit()};
        $('#nk').onclick=()=>{d._nameOk=true;$('#sf').requestSubmit()};return}
    }
  }
  const btn=$('#sv');btn.disabled=true;btn.innerHTML='<span class="spin"></span> Saving';
  const rec=buildSlip(d),files=d.files.map(({blob,mime,ext})=>({blob,mime,ext}));
  store.set('slips-card',d.card_id);store.set('slips-costto',d.cost_to);if(d.department_id)store.set('slips-dept',d.department_id);
  if(d.supplier&&d.category_id){const l=store.get('slips-learn',{});l[d.supplier.trim().toLowerCase().split(/\s+/)[0]]=d.category_id;store.set('slips-learn',l)}
  if(d.fromLine){
    try{
      if(!navigator.onLine)throw new TypeError('Failed to fetch');
      rec.user_id=d.fromLine.holder;const ref=await uploadAndSave(rec,files);
      const {error}=await sb.rpc('link_line',{p_line:d.fromLine.id,p_slip:rec.id});if(error)throw error;
      toast(`${ref||'Slip'} saved and linked`);loadRefs().catch(()=>{});
      const v=d.returnView;S.draft=null;S.view=v;shell();
    }catch(x){btn.disabled=false;btn.textContent='Save slip';se.innerHTML=`<div class="note bad">${esc(isNet(x)?'No connection. The slip isn’t saved yet, so try again when you have signal.':friendly(x))}</div>`}
    return;
  }
  if(d.editing){
    try{
      await saveEdit(d,rec,files);toast(`${d.editing.ref} updated`);loadRefs().catch(()=>{});
      const v=d.returnView;S.draft=null;S.view=v;shell();
    }catch(x){btn.disabled=false;btn.textContent='Save changes';se.innerHTML=`<div class="note bad">${esc(isNet(x)?'No connection. Your changes aren’t saved yet, so try again when you have signal.':friendly(x))}</div>`}
    return;
  }
  try{
    if(!navigator.onLine)throw new TypeError('Failed to fetch');
    const ref=await uploadAndSave(rec,files);toast(`Saved as ${ref||'slip'}`);loadRefs().catch(()=>{});
  }catch(x){
    if(!isNet(x)){btn.disabled=false;btn.textContent='Save slip';se.innerHTML=`<div class="note bad">${esc(friendly(x))}</div>`;return}
    await outboxAdd({rec,files});toast('Saved on this phone. It will upload when you have signal.');
  }
  S.draft=null;captureView();
}

/* Offline queue */
function idb(){return new Promise((ok,no)=>{const r=indexedDB.open('slips-outbox',1);r.onupgradeneeded=()=>r.result.createObjectStore('q',{keyPath:'rec.id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function outboxTx(mode,fn){const db=await idb();return new Promise((ok,no)=>{const t=db.transaction('q',mode),r=fn(t.objectStore('q'));t.oncomplete=()=>ok(r?.result);t.onerror=()=>no(t.error)})}
const outboxAdd=x=>outboxTx('readwrite',s=>s.put(x));
const outboxAll=()=>outboxTx('readonly',s=>s.getAll());
const outboxDel=id=>outboxTx('readwrite',s=>s.delete(id));
async function renderOutbox(){try{const q=await outboxAll(),e=$('#outbox');if(e)e.innerHTML=q.length?`<div class="note warn">${q.length} slip${q.length>1?'s':''} waiting to upload from this phone.</div>`:''}catch{}}
let flushing=false;
async function flushOutbox(){
  if(flushing||!navigator.onLine||!S.me)return;flushing=true;
  try{for(const x of await outboxAll()){try{await uploadAndSave(x.rec,x.files);await outboxDel(x.rec.id)}catch(e){if(isNet(e))break;toast('A saved slip could not upload: '+friendly(e))}}}catch{}
  flushing=false;renderOutbox();
}

/* ---------- my slips ---------- */
const stPill=s=>s.status==='matched'?'<span class="pill g">On statement</span>':s.status==='voided'?'<span class="pill n">Voided</span>':s.no_slip?'<span class="pill o">No slip</span>':'<span class="pill b">Captured</span>';
async function mineView(){
  const m=$('#m');m.className='';m.innerHTML='<div class="card"><span class="spin"></span></div>';
  const {data,error}=await sb.from('slips').select('*,slip_files(path,mime)').eq('user_id',S.me.id).order('slip_date',{ascending:false}).limit(200);
  if(error){m.innerHTML=`<div class="note bad">${esc(friendly(error))}</div>`;return}
  if(!data.length){m.innerHTML='<div class="card"><h2>No slips yet</h2><p class="muted">Slips you capture appear here.</p></div>';return}
  const groups={};data.forEach(s=>(groups[s.period]??=[]).push(s));
  m.innerHTML=Object.entries(groups).map(([p,l])=>`<div class="card"><h2>${monthName(p)}</h2>${l.map(s=>`<div class="item" data-s="${s.id}" role="button" tabindex="0" style="cursor:pointer"><div class="m"><div class="t">${esc(s.supplier)}</div><div class="s">${esc(s.ref)} · ${esc(s.slip_date)} ${stPill(s)}</div></div><div class="amt">${money(s.total,s.currency)}</div></div>`).join('')}</div>`).join('');
  $$('[data-s]',m).forEach(x=>x.onclick=()=>slipModal(data.find(s=>s.id===x.dataset.s),mineView));
}
async function slipModal(s,after){
  const w=document.createElement('div');w.className='modal';document.body.append(w);
  const close=()=>w.remove();w.onclick=e=>{if(e.target===w)close()};
  const files=s.slip_files||[];const urls=files.length?(await sb.storage.from('slips').createSignedUrls(files.map(f=>f.path),600)).data||[]:[];
  const cat=S.cats.find(c=>c.id===s.category_id);
  const line=(a,b)=>b?`<div class="muted"><b>${a}:</b> ${esc(b)}</div>`:'';
  const editable=s.status==='captured'&&(isFin()||s.user_id===S.me.id),canUnlink=s.status==='matched'&&isFin()&&!!s.statement_line_id;
  w.innerHTML=`<div><h2>${esc(s.supplier)} <span class="muted">${esc(s.ref)}</span></h2><p style="font-weight:700;margin-bottom:.4rem">${money(s.total,s.currency)}${s.currency!=='ZAR'?` ${s.amount_zar?'= '+rand(s.amount_zar):'(rand amount from statement)'}`:''}</p>
  ${line('Date',s.slip_date)}${line('Category',cat?.name)}${line('Department',optName(s.department_id))}${line('Project',optName(s.project_id))}${line('Client',optName(s.client_id))}${line('Who / why',s.purpose)}${line('VAT',s.vat_amount!=null?rand(s.vat_amount):'')}${line('No slip because',s.no_slip_reason)}${line('Change returned',s.cash_change_returned!=null?rand(s.cash_change_returned):'')}${line('Notes',s.notes)}
  <div style="margin:.7rem 0">${urls.map((u,i)=>files[i].mime==='application/pdf'?`<a class="btn ghost sm" href="${esc(u.signedUrl)}" target="_blank" rel="noopener">Open PDF</a>`:`<img src="${esc(u.signedUrl)}" alt="Slip photo">`).join('')}</div>
  <div class="row"><button class="btn ghost" id="mc">Close</button>${editable||canUnlink?'<button class="btn" id="me">Edit</button>':''}${editable?'<button class="btn red" id="mv">Void</button>':''}${canUnlink?'<button class="btn ghost" id="mu">Unlink</button>':''}</div>${s.status==='matched'&&!isFin()?'<p class="muted" style="margin-top:.6rem">This slip is matched to a statement, so only finance can change it.</p>':''}${canUnlink?'<p class="muted" style="margin-top:.6rem">Unlink takes this slip off its statement line, so you can link it to the right one.</p>':''}</div>`;
  $('#mc',w).onclick=close;
  const ee=$('#me',w);if(ee)ee.onclick=()=>{const v=S.view;close();editSlip(s,v)};
  const uu=$('#mu',w);if(uu)uu.onclick=async()=>{uu.disabled=true;const {error}=await sb.rpc('unlink_line',{p_line:s.statement_line_id});if(error){toast(friendly(error));uu.disabled=false;return}close();toast(`${s.ref} unlinked. It’s back in the unmatched slips.`);after?.()};
  const v=$('#mv',w);if(v)v.onclick=async()=>{v.disabled=true;const {error}=await sb.from('slips').update({status:'voided'}).eq('id',s.id);if(error){toast(friendly(error));v.disabled=false;return}close();toast(`${s.ref} voided`);after?.()};
}

/* ---------- finance: month ---------- */
async function loadMonth(){
  const p=S.month;await loadRefs();
  const [sl,st,lock,people,allCards]=await Promise.all([
    sb.from('slips').select('*,slip_files(path,mime,page_no)').or(`period.eq.${p},status.eq.captured`).neq('status','voided').order('slip_date'),
    sb.from('statements').select('id,file_name,statement_lines(*)').eq('period',p),
    sb.from('periods').select('*').eq('month',p).maybeSingle(),
    sb.from('profiles').select('*'),sb.from('cards').select('*')]);
  for(const r of [sl,st,people,allCards])if(r.error)throw r.error;
  const lines=st.data.flatMap(x=>x.statement_lines).sort((a,b)=>(b.post_date||'').localeCompare(a.post_date||'')||a.row_no-b.row_no);
  return {all:sl.data,slips:sl.data.filter(s=>s.period===p),lines,statements:st.data,locked:lock.data,people:people.data,cards:allCards.data};
}
const personOf=(M,id)=>M.people.find(x=>x.id===id)?.full_name||'';
const cardOf=(M,id)=>{const c=M.cards.find(x=>x.id===id);return c?`${c.label} (${c.last4})`:''};
async function monthView(){
  const m=$('#m');m.className='wide';m.innerHTML='<div class="card"><span class="spin"></span></div>';
  let M;try{M=await loadMonth()}catch(e){m.innerHTML=`<div class="note bad">${esc(friendly(e))}</div>`;return}
  S.M=M;const locked=!!M.locked;
  const holder=id=>M.cards.find(k=>k.id===id)?.holder_id;
  if(S.who&&!M.people.some(p=>p.id===S.who))S.who=null;
  const who=S.who,Ls=who?M.lines.filter(l=>holder(l.card_id)===who):M.lines,Ss=who?M.slips.filter(s=>s.user_id===who):M.slips;
  const un=Ls.filter(l=>l.status==='unmatched'),poss=Ls.filter(l=>l.status==='possible');
  const onStmt=new Set(M.lines.map(l=>l.card_id));
  const notOn=Ss.filter(s=>s.status==='captured'&&onStmt.has(s.card_id));
  const noSlip=Ss.filter(s=>s.no_slip),noFile=Ss.filter(s=>!s.no_slip&&s.kind==='purchase'&&!s.slip_files.length),flag=Ss.filter(s=>s.quality_flag);
  const fx=Ss.filter(s=>s.currency!=='ZAR'&&s.amount_zar==null);
  const total=Ss.reduce((a,s)=>a+Number(s.amount_zar||0),0);
  const rows=M.people.filter(p=>M.cards.some(k=>k.holder_id===p.id&&k.active)||M.slips.some(s=>s.user_id===p.id)||M.lines.some(l=>holder(l.card_id)===p.id)).map(p=>{
    const sl=M.slips.filter(s=>s.user_id===p.id),ln=M.lines.filter(l=>holder(l.card_id)===p.id),live=ln.filter(l=>l.status!=='ignored');
    return {p,slips:sl.length,value:sl.reduce((a,s)=>a+Number(s.amount_zar||0),0),hasStmt:ln.length>0,matched:live.filter(l=>l.status==='matched').length,lines:live.length,missing:live.filter(l=>l.status==='unmatched').length,review:live.filter(l=>l.status==='possible').length}
  }).sort((a,b)=>a.p.full_name.localeCompare(b.p.full_name));
  const stat=r=>!r.hasStmt?'<span class="pill n">No statement</span>':r.missing||r.review?'<span class="pill o">Needs attention</span>':'<span class="pill g">Complete</span>';
  const peopleCard=`<div class="card"><h2>Cardholders</h2><div class="tw"><table class="people"><thead><tr><th>Person</th><th>Status</th><th class="n">Slips</th><th class="n">Rand value</th><th class="n">Lines matched</th><th class="n">No slip</th><th class="n">To review</th></tr></thead><tbody>
  ${rows.map(r=>`<tr data-who="${r.p.id}" tabindex="0" role="button" class="${who===r.p.id?'sel':''}"><td>${esc(r.p.full_name)}</td><td>${stat(r)}</td><td class="n">${r.slips}</td><td class="n">${rand(r.value)}</td><td class="n">${r.hasStmt?`${r.matched} / ${r.lines}`:'–'}</td><td class="n">${r.hasStmt?r.missing:'–'}</td><td class="n">${r.hasStmt?r.review:'–'}</td></tr>`).join('')||'<tr><td colspan="7" class="muted">No cardholders yet.</td></tr>'}
  </tbody></table></div>${who?`<div class="note info" style="margin:.7rem 0 0">Showing <b>${esc(personOf(M,who))}</b> only. <button class="btn sm ghost" id="wa">Show everyone</button></div>`:'<p class="muted" style="margin-top:.5rem">Tap a person to see only their slips.</p>'}</div>`;
  m.innerHTML=`<div class="bar"><div><label class="lbl" for="mp">Month</label><input id="mp" type="month" value="${S.month.slice(0,7)}"></div><span class="sp"></span>
  ${locked?'<span class="pill r">Locked</span>':`<button class="btn ghost" id="up">Upload statement</button>`}<button class="btn" id="xl">Export Excel + photos</button>
  <button class="btn ${locked?'ghost':'red'}" id="lk">${locked?'Unlock month':'Lock month'}</button></div><div id="wiz"></div>
  <div class="tiles"><div class="tile"><b>${Ss.length}</b><span>Slips this month</span></div><div class="tile"><b>${rand(total)}</b><span>Rand value captured</span></div>
  <div class="tile"><b>${Ls.filter(l=>l.status==='matched').length} / ${Ls.filter(l=>l.status!=='ignored').length}</b><span>Statement lines matched</span></div>
  <div class="tile"><b>${un.length}</b><span>On statement, no slip</span></div><div class="tile"><b>${poss.length}</b><span>Need your review</span></div></div>
  ${peopleCard}
  ${!M.statements.length?'<div class="note info">No statement uploaded for this month yet. Slips show under the month they were dated until a statement matches them.</div>':''}
  ${poss.length?card('Possible matches: confirm or reject',poss.map(l=>lineRow(l,M,true)).join('')):''}
  ${un.length?card('On the statement with no slip',un.map(l=>lineRow(l,M)).join('')):''}
  ${notOn.length?card('Captured but not on this statement yet',notOn.map(s=>slipRow(s,M)).join('')):''}
  ${fx.length?card('Foreign spend waiting for a rand amount',fx.map(s=>slipRow(s,M)).join('')):''}
  ${noSlip.length?card('No slip: reason given',noSlip.map(s=>slipRow(s,M,s.no_slip_reason)).join('')):''}
  ${noFile.length?card('Missing an image',noFile.map(s=>slipRow(s,M)).join('')):''}
  ${flag.length?card('Image quality flagged',flag.map(s=>slipRow(s,M)).join('')):''}
  ${card('All slips',Ss.map(s=>slipRow(s,M)).join('')||'<p class="muted">Nothing captured for this month.</p>')}`;
  $('#mp').onchange=e=>{if(e.target.value){S.month=e.target.value+'-01';monthView()}};
  $$('[data-who]',m).forEach(r=>r.onclick=()=>{S.who=S.who===r.dataset.who?null:r.dataset.who;monthView()});
  const wa=$('#wa');if(wa)wa.onclick=()=>{S.who=null;monthView()};
  const up=$('#up');if(up)up.onclick=()=>statementWizard(M);
  $('#xl').onclick=()=>exportMonth(M);
  $('#lk').onclick=async()=>{
    if(locked){const {error}=await sb.from('periods').delete().eq('month',S.month);if(error)toast(friendly(error));else toast('Month unlocked')}
    else{const {error}=await sb.from('periods').insert({month:S.month,locked_by:S.me.id});if(error)toast(friendly(error));else toast('Month locked. Late slips roll to the next open month.')}
    monthView()};
  $$('[data-slip]',m).forEach(x=>x.onclick=()=>slipModal(M.all.find(s=>s.id===x.dataset.slip),monthView));
  $$('[data-link]',m).forEach(b=>b.onclick=async()=>{const [l,s]=b.dataset.link.split('|');const {error}=await sb.rpc('link_line',{p_line:l,p_slip:s});if(error)toast(friendly(error));monthView()});
  $$('[data-reject]',m).forEach(b=>b.onclick=async()=>{const {error}=await sb.from('statement_lines').update({status:'unmatched'}).eq('id',b.dataset.reject);if(error)toast(friendly(error));monthView()});
  $$('[data-ignore]',m).forEach(b=>b.onclick=async()=>{const reason=await ask('Why does this line need no slip? (e.g. bank fee)');if(!reason)return;const {error}=await sb.from('statement_lines').update({status:'ignored',ignore_reason:reason}).eq('id',b.dataset.ignore);if(error)toast(friendly(error));monthView()});
  $$('[data-pick]',m).forEach(b=>b.onclick=()=>pickSlip(b.dataset.pick,M));
  $$('[data-add]',m).forEach(b=>b.onclick=()=>slipForLine(M.lines.find(x=>x.id===b.dataset.add),M));
}
const card=(t,b)=>`<div class="card"><h2>${esc(t)}</h2><div class="tw">${b}</div></div>`;
function lineRow(l,M,cands){
  const c=cands?candidates(l,M):[];
  return `<div class="item" style="flex-wrap:wrap"><div class="m" style="min-width:220px"><div class="t">${esc(l.description)}</div><div class="s">${esc(l.txn_date||l.post_date)} · ${esc(cardOf(M,l.card_id)||'Card not recognised')} ${l.card_id?'· '+esc(personOf(M,M.cards.find(k=>k.id===l.card_id)?.holder_id)):''}</div></div><div class="amt">${rand(l.amount)}</div>
  <div style="display:flex;gap:.4rem;flex-wrap:wrap">${c.map(s=>`<button class="btn sm green" data-link="${l.id}|${s.id}">Match ${esc(s.ref)} (${esc(s.supplier)}, ${money(s.total,s.currency)})</button>`).join('')}
  ${cands?`<button class="btn sm ghost" data-reject="${l.id}">Not a match</button>`:`${l.card_id?`<button class="btn sm" data-add="${l.id}">Add slip</button>`:''}<button class="btn sm ghost" data-pick="${l.id}">Link existing slip</button><button class="btn sm ghost" data-ignore="${l.id}">No slip needed</button>`}</div></div>`;
}
function candidates(l,M){const r=L.matchLines([{...l,merchant:L.parseDescriptor(l.description,l.post_date).merchant,status:'unmatched'}],M.all)[l.id];return (r?.candidates||(r?.slip_id?[r.slip_id]:[])).map(id=>M.all.find(s=>s.id===id)).filter(Boolean)}
function slipRow(s,M,sub){return `<div class="item" data-slip="${s.id}" role="button" tabindex="0" style="cursor:pointer"><div class="m"><div class="t">${esc(s.supplier)}</div><div class="s">${esc(s.ref)} · ${esc(s.slip_date)} · ${esc(personOf(M,s.user_id))} ${stPill(s)} ${s.quality_flag?'<span class="pill o">Check image</span>':''}${sub?`<br>${esc(sub)}`:''}</div></div><div class="amt">${money(s.total,s.currency)}</div></div>`}
function pickSlip(lineId,M){
  const l=M.lines.find(x=>x.id===lineId),holder=M.cards.find(k=>k.id===l.card_id)?.holder_id;
  const list=M.all.filter(s=>s.status==='captured'&&(!holder||s.user_id===holder)).sort((a,b)=>(Math.abs(+a.total-l.amount)-Math.abs(+b.total-l.amount)));
  const other=s=>s.card_id!==l.card_id?` · ${esc(cardOf(M,s.card_id))}`:'';
  const w=document.createElement('div');w.className='modal';document.body.append(w);
  w.innerHTML=`<div><h2>Link a slip to ${rand(l.amount)}</h2><p class="muted" style="margin-bottom:.5rem">${esc(l.description)}</p>${list.map(s=>`<div class="item"><div class="m"><div class="t">${esc(s.supplier)}</div><div class="s">${esc(s.ref)} · ${esc(s.slip_date)}${other(s)}</div></div><div class="amt">${money(s.total,s.currency)}</div><button class="btn sm" data-p="${s.id}">Link</button></div>`).join('')||`<p class="muted">${holder?esc(personOf(M,holder)):'This person'} has no unmatched slips.</p>`}<div class="row" style="margin-top:.7rem"><button class="btn ghost" id="pc">Close</button>${l.card_id?'<button class="btn" id="pa">Add a new slip</button>':''}</div></div>`;
  $('#pc',w).onclick=()=>w.remove();
  const pa=$('#pa',w);if(pa)pa.onclick=()=>{w.remove();slipForLine(l,M)};
  $$('[data-p]',w).forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc('link_line',{p_line:lineId,p_slip:b.dataset.p});if(error){toast(friendly(error));return}w.remove();monthView()});
}

/* Statement upload */
async function loadExcelJS(){if(window.ExcelJS)return;await new Promise((ok,no)=>{const s=document.createElement('script');s.src='vendor/exceljs.min.js';s.onload=ok;s.onerror=no;document.head.append(s)})}
async function fileSheets(file){
  if(/\.pdf$/i.test(file.name))throw new Error('Please download the statement as CSV or Excel. PDF statements aren’t supported yet.');
  if(/\.xlsx$/i.test(file.name)){await loadExcelJS();const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
    return wb.worksheets.filter(ws=>ws.state!=='hidden'&&ws.state!=='veryHidden').map(ws=>{const rows=[];ws.eachRow({includeEmpty:false},r=>{const a=[];r.eachCell({includeEmpty:true},(c,i)=>{let v=c.value;if(v&&typeof v==='object'&&!(v instanceof Date))v=v.result??v.text??(v.richText?v.richText.map(t=>t.text).join(''):'');a[i-1]=v??''});rows.push(a)});return {name:ws.name,rows}})}
  if(/\.xls$/i.test(file.name))throw new Error('Please save the file as .xlsx or .csv first.');
  return [{name:file.name,rows:L.parseCSV(await file.text())}];
}
function statementWizard(M){
  const w=$('#wiz'),saved=store.get('slips-stmt-map',null);
  w.innerHTML=`<div class="card"><h2>Upload a statement for ${monthName(S.month)}</h2><p class="muted" style="margin-bottom:.7rem">CSV or Excel. Matching runs on card, amount and date.</p><div class="field"><input id="sfile" type="file" accept=".csv,.txt,.xlsx" aria-label="Statement file"></div><div id="s2"></div></div>`;
  $('#sfile').onchange=async e=>{const f=e.target.files[0];if(!f)return;let sheets;
    try{sheets=await fileSheets(f)}catch(x){$('#s2').innerHTML=`<div class="note bad">${esc(friendly(x))}</div>`;return}
    const usable=sheets.filter(t=>t.rows.length>=2&&L.isStatementRows(t.rows));
    if(usable.length>1)return tabsWizard(f,usable,sheets.length,M);
    const rows=(usable[0]||sheets[0])?.rows||[];
    if(rows.length<2){$('#s2').innerHTML='<div class="note bad">No rows found in that file.</div>';return}
    const h=L.findHeaderRow(rows),head=rows[h].map((c,i)=>String(c||`Column ${i+1}`)),g=L.guessColumns(head);
    const sig=head.join('|'),map=saved?.sig===sig?saved.map:g,body=rows.slice(h+1);
    const sel=(k,l,opt)=>`<div class="field"><label class="lbl" for="c_${k}">${l}</label><select id="c_${k}">${opt?'<option value="">Not in file</option>':''}${head.map((c,i)=>`<option value="${i}" ${map[k]===i?'selected':''}>${esc(c)}</option>`).join('')}</select></div>`;
    const active=M.cards.filter(c=>c.active),fileLast4=L.accountLast4(rows,h,f.name),fileCard=active.find(c=>c.last4===fileLast4||c.statement_last4===fileLast4);
    $('#s2').innerHTML=`<div class="row">${sel('date','Date column')}${sel('description','Description column')}</div><div class="row">${sel('amount','Amount column',1)}${sel('debit','Debit column',1)}${sel('credit','Credit column',1)}</div>
    <div class="field"><label class="lbl" for="c_card">Which card is this statement for?</label><select id="c_card"><option value="">${fileLast4?'Choose a card…':'Work it out from each line'}</option>${active.map(c=>`<option value="${c.id}" ${c.id===fileCard?.id?'selected':''}>${esc(c.label)} (${c.last4}), ${esc(personOf(M,c.holder_id))}</option>`).join('')}</select></div>
    ${fileLast4&&!fileCard?`<div class="note warn">This file’s number ends in ${esc(fileLast4)}, and no card has that number yet. Choose the card above and the app will remember this number for next time.</div>`:fileCard?`<div class="note ok">Card found in the file: statement number ending in ${esc(fileLast4)}.</div>`:''}
    <div id="s3"></div><button class="btn" id="si">${esc(importLabel())}</button>`;
    $('#si').onclick=()=>doImport(f,body,head,sig,M,fileLast4&&!fileCard?fileLast4:null)};
}
const col=id=>{const v=$(id).value;return v===''?null:+v};
function tabsWizard(file,tabs,total,M){
  const active=M.cards.filter(c=>c.active).map(c=>({...c,holder_name:personOf(M,c.holder_id)}));
  const parts=tabs.map(t=>{const h=L.findHeaderRow(t.rows),map=L.guessColumns(t.rows[h].map(String)),lines=L.normaliseRows(t.rows.slice(h+1),map),found=L.cardForSheet(t.name,t.rows,h,active);return {name:t.name,lines,found}});
  $('#s2').innerHTML=`<p class="muted" style="margin-bottom:.5rem">This workbook has ${tabs.length} statement tabs${total>tabs.length?` (${total-tabs.length} other tab${total-tabs.length>1?'s':''} skipped)`:''}. Check the card for each tab.</p>
  <div class="tw"><table><thead><tr><th>Tab</th><th class="n">Lines</th><th class="n">Rand total</th><th>Card</th></tr></thead><tbody>
  ${parts.map((p,i)=>`<tr><td>${esc(p.name)}</td><td class="n">${p.lines.length}</td><td class="n">${rand(p.lines.filter(l=>!l.is_credit).reduce((a,l)=>a+l.amount,0))}</td><td><select id="tab${i}" aria-label="Card for ${esc(p.name)}"><option value="">Choose a card…</option><option value="skip">Skip this tab</option>${active.map(c=>`<option value="${c.id}" ${c.id===p.found.card?.id?'selected':''}>${esc(c.holder_name)}: ${esc(c.label)} (${c.last4})</option>`).join('')}</select>${p.found.last4&&!p.found.card?`<div class="muted" style="color:var(--orange)">Number ending in ${esc(p.found.last4)} isn’t on a card yet. Choose the card and it will be remembered.</div>`:''}</td></tr>`).join('')}
  </tbody></table></div><div id="s3" style="margin-top:.6rem"></div><button class="btn" id="si" style="margin-top:.5rem">${esc(importLabel())}</button>`;
  $('#si').onclick=()=>{
    const picks=parts.map((p,i)=>({p,v:$('#tab'+i).value}));
    if(picks.some(x=>!x.v)){$('#s3').innerHTML='<div class="note bad">Choose a card for every tab, or choose Skip this tab. Nothing was imported.</div>';return}
    const chosen=picks.filter(x=>x.v!=='skip');
    const seen=chosen.map(x=>x.v);if(new Set(seen).size<seen.length){$('#s3').innerHTML='<div class="note bad">Two tabs are set to the same card. Check them, then import again.</div>';return}
    const lines=chosen.flatMap(x=>x.p.lines.map(l=>({...l,card_id:x.v})));
    if(!lines.length){$('#s3').innerHTML='<div class="note bad">No transactions to import.</div>';return}
    const news=chosen.filter(x=>x.p.found.last4&&!x.p.found.card);
    Promise.all(news.map(x=>rememberNumber(x.v,x.p.found.last4))).then(()=>runImport(file.name,lines,$('#si'))).catch(x=>{$('#s3').innerHTML=`<div class="note bad">${esc(/unique|duplicate/i.test(x.message)?'Another card already uses that statement number.':friendly(x))}</div>`})};
}
async function rememberNumber(cardId,no){if(!cardId||!no)return;const {error}=await sb.from('cards').update({statement_last4:no}).eq('id',cardId);if(error)throw error}
async function doImport(file,body,head,sig,M,newNo){
  const map={date:col('#c_date'),description:col('#c_description'),amount:col('#c_amount'),debit:col('#c_debit'),credit:col('#c_credit')};
  if(map.amount==null&&map.debit==null){$('#s3').innerHTML='<div class="note bad">Choose an amount or debit column.</div>';return}
  const lines=L.normaliseRows(body,map);if(!lines.length){$('#s3').innerHTML='<div class="note bad">No valid rows. Check the columns above.</div>';return}
  store.set('slips-stmt-map',{sig,map});
  const forced=$('#c_card').value||null,btn=$('#si');btn.disabled=true;btn.textContent='Importing…';
  const byLast4=Object.fromEntries(M.cards.filter(c=>c.active).flatMap(c=>[[c.last4,c.id],...(c.statement_last4?[[c.statement_last4,c.id]]:[])]));
  lines.forEach(l=>{l.card_id=forced||byLast4[l.last4]||null});
  if(lines.some(l=>!l.card_id&&!l.is_credit)){btn.disabled=false;btn.textContent=importLabel();$('#s3').innerHTML='<div class="note bad">Choose which card this statement is for. Nothing was imported.</div>';return}
  try{await rememberNumber(forced,newNo)}catch(x){btn.disabled=false;btn.textContent=importLabel();$('#s3').innerHTML=`<div class="note bad">${esc(/unique|duplicate/i.test(x.message)?'Another card already uses that statement number.':friendly(x))}</div>`;return}
  runImport(file.name,lines,btn);
}
async function runImport(fileName,lines,btn){
  btn.disabled=true;btn.textContent='Importing…';
  const keys=L.dedupeKeys(lines);
  try{
    const {data:st,error:e1}=await sb.from('statements').insert({period:S.month,file_name:fileName}).select().single();if(e1)throw e1;
    const rows=lines.map((l,i)=>({statement_id:st.id,row_no:l.row_no,card_id:l.card_id,txn_date:l.txn_date,post_date:l.post_date,description:l.description,amount:l.amount,foreign_amount:l.foreign_amount,
      status:l.is_credit?'ignored':'unmatched',ignore_reason:l.is_credit?'Credit or payment':null,dedupe_key:keys[i]}));
    const {data:ins,error:e2}=await sb.from('statement_lines').upsert(rows,{onConflict:'dedupe_key',ignoreDuplicates:true}).select();if(e2)throw e2;
    const dup=rows.length-ins.length;
    const full=ins.map(r=>({...r,merchant:L.parseDescriptor(r.description,r.post_date).merchant}));
    const {data:live,error:e3}=await sb.from('slips').select('*').eq('status','captured');if(e3)throw e3;
    const res=L.matchLines(full,live);let auto=0,pos=0;
    for(const [id,r] of Object.entries(res)){
      if(r.status==='matched'){const {error}=await sb.rpc('link_line',{p_line:id,p_slip:r.slip_id});if(error)throw error;auto++}
      else{const {error}=await sb.from('statement_lines').update({status:'possible'}).eq('id',id);if(error)throw error;pos++}}
    const unk=ins.filter(r=>!r.card_id&&r.status!=='ignored').length;
    toast(`${ins.length} lines imported, ${auto} matched, ${pos} to review${dup?`, ${dup} duplicates skipped`:''}${unk?`, ${unk} with no known card`:''}`);
    monthView();
  }catch(x){btn.disabled=false;btn.textContent=importLabel();$('#s3').innerHTML=`<div class="note bad">${esc(friendly(x))}</div>`}
}

/* Export: one sheet per card in the existing report layout, a flat list, and exceptions, plus every image */
const safe=s=>String(s||'').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,40);
function saveBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),6e4)}
async function buildWorkbook(M,cats,fileName){
  await loadExcelJS();const wb=new ExcelJS.Workbook();wb.creator='Bergvik Slips';
  const hdr=c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDCE6F1'}};c.alignment={wrapText:true,vertical:'middle',horizontal:'center'};c.border={bottom:{style:'thin'}}};
  const NUM='#,##0.00;[Red]-#,##0.00',statDate=s=>{const l=M.lines.find(x=>x.id===s.statement_line_id);return l?.post_date||s.slip_date};
  const fixed=cats.filter(c=>c.name!=='Other');
  const byCard={};M.slips.forEach(s=>(byCard[s.card_id]??=[]).push(s));
  for(const [cid,list] of Object.entries(byCard)){
    const k=M.cards.find(c=>c.id===cid),name=personOf(M,k?.holder_id);
    let title=`${name} ${k?.last4||''}`.replace(/[\\/*?:[\]]/g,'').slice(0,31),n=2;while(wb.getWorksheet(title))title=title.slice(0,29)+' '+n++;
    const ws=wb.addWorksheet(title);
    const base=5,cols=base+fixed.length+3;
    ws.mergeCells(1,1,1,cols);ws.getCell(1,1).value='MONTHLY CARD EXPENSE REPORT';ws.getCell(1,1).font={bold:true,size:14};ws.getCell(1,1).alignment={horizontal:'center'};
    ws.getCell('A3').value='Name & Surname:';ws.getCell('C3').value=name;ws.getCell('A4').value='Bank & Card Number:';ws.getCell('C4').value=`${k?.label||''} (**** ${k?.last4||''})`;
    ws.getCell('A5').value='Date:';ws.getCell('C5').value=monthName(S.month);
    const heads=['Slip No.','Date','Card Cash Withdrawal','Card','Project / Department',...fixed.map(c=>`${c.gl_code?c.gl_code+' ':''}${c.name}`),'Other','Description','If cash, change'];
    const hr=ws.getRow(7);hr.values=heads;hr.height=48;hr.eachCell(hdr);
    let r=8;list.sort((a,b)=>statDate(a).localeCompare(statDate(b))).forEach(s=>{
      const row=ws.getRow(r++),cat=cats.find(c=>c.id===s.category_id),amt=s.amount_zar!=null?Number(s.amount_zar):null;
      row.getCell(1).value=s.ref;row.getCell(2).value=new Date(statDate(s)+'T00:00:00Z');row.getCell(2).numFmt='dd-mmm-yy';
      if(s.kind==='cash_withdrawal')row.getCell(3).value=amt;
      row.getCell(4).value=s.supplier;row.getCell(5).value=[optName(s.project_id),optName(s.department_id)].filter(Boolean).join(' / ');
      const idx=fixed.findIndex(c=>c.id===s.category_id);
      if(s.kind==='purchase')row.getCell(idx>=0?base+1+idx:base+fixed.length+1).value=amt;
      const desc=[optName(s.client_id),s.purpose,s.no_slip?`NO SLIP: ${s.no_slip_reason}`:'',s.notes,s.currency!=='ZAR'?`${s.currency} ${s.total}${amt==null?' (rand amount pending)':''}`:''].filter(Boolean).join(' | ');
      row.getCell(base+fixed.length+2).value=desc;row.getCell(base+fixed.length+3).value=s.cash_change_returned;
      for(const i of [3,...fixed.map((_,j)=>base+1+j),base+fixed.length+1,base+fixed.length+3])row.getCell(i).numFmt=NUM;
    });
    const tr=ws.getRow(r);tr.getCell(4).value='TOTAL';tr.font={bold:true};
    for(const i of [3,...fixed.map((_,j)=>base+1+j),base+fixed.length+1,base+fixed.length+3]){const L0=ws.getColumn(i).letter;tr.getCell(i).value={formula:`SUM(${L0}8:${L0}${Math.max(8,r-1)})`};tr.getCell(i).numFmt=NUM;tr.getCell(i).border={top:{style:'thin'},bottom:{style:'double'}}}
    ws.columns.forEach((c,i)=>{c.width=i===3?30:i===base+fixed.length+1?42:i===1?11:i===4?20:i===0?10:14});
    ws.views=[{state:'frozen',ySplit:7}];ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  }
  const all=wb.addWorksheet('All spending');
  const ah=['Slip No.','Slip date','Statement date','Person','Card','Type','Supplier','Category','GL code','Department','Project','Client','Who / why','Currency','Slip amount','Rand amount','VAT','Status','No slip reason','Quality flag','Image files'];
  all.getRow(1).values=ah;all.getRow(1).eachCell(hdr);
  M.slips.forEach(s=>{const c=cats.find(x=>x.id===s.category_id);all.addRow([s.ref,s.slip_date,s.statement_line_id?statDate(s):'',personOf(M,s.user_id),cardOf(M,s.card_id),s.kind==='cash_withdrawal'?'Cash withdrawal':'Purchase',s.supplier,c?.name||'',c?.gl_code||'',optName(s.department_id),optName(s.project_id),optName(s.client_id),s.purpose||'',s.currency,Number(s.total),s.amount_zar!=null?Number(s.amount_zar):null,s.vat_amount!=null?Number(s.vat_amount):null,s.status==='matched'?'Matched to statement':'Not matched',s.no_slip_reason||'',s.quality_flag?'Yes':'',fileName(s).join(', ')])});
  [15,16,17].forEach(i=>all.getColumn(i).numFmt=NUM);all.views=[{state:'frozen',ySplit:1}];all.autoFilter={from:'A1',to:{row:1,column:ah.length}};
  all.columns.forEach((c,i)=>c.width=[10,11,12,20,24,14,26,22,10,18,18,18,30,8,12,12,10,18,28,8,30][i]);
  const ex=wb.addWorksheet('Exceptions');ex.getRow(1).values=['Issue','Date','Person / card','Detail','Rand amount'];ex.getRow(1).eachCell(hdr);
  const add=(a,b,c,d,e)=>ex.addRow([a,b,c,d,e]);
  M.lines.filter(l=>l.status==='unmatched'&&!l.is_credit).forEach(l=>add('On statement, no slip',l.txn_date||l.post_date,cardOf(M,l.card_id),l.description,Number(l.amount)));
  M.lines.filter(l=>l.status==='possible').forEach(l=>add('Possible match not confirmed',l.txn_date||l.post_date,cardOf(M,l.card_id),l.description,Number(l.amount)));
  M.lines.filter(l=>l.status==='ignored'&&l.ignore_reason!=='Credit or payment').forEach(l=>add('Marked no slip needed',l.post_date,cardOf(M,l.card_id),`${l.description}: ${l.ignore_reason}`,Number(l.amount)));
  M.slips.filter(s=>s.no_slip).forEach(s=>add('No slip',s.slip_date,personOf(M,s.user_id),`${s.ref} ${s.supplier}: ${s.no_slip_reason}`,s.amount_zar!=null?Number(s.amount_zar):null));
  M.slips.filter(s=>s.status==='captured'&&M.lines.some(l=>l.card_id===s.card_id)).forEach(s=>add('Captured, not on statement',s.slip_date,personOf(M,s.user_id),`${s.ref} ${s.supplier}`,s.amount_zar!=null?Number(s.amount_zar):null));
  M.slips.filter(s=>s.currency!=='ZAR'&&s.amount_zar==null).forEach(s=>add('Foreign, rand amount pending',s.slip_date,personOf(M,s.user_id),`${s.ref} ${s.supplier} ${s.currency} ${s.total}`,null));
  ex.getColumn(5).numFmt=NUM;ex.columns.forEach((c,i)=>c.width=[30,12,28,60,14][i]);
  return wb;
}
async function exportMonth(M){
  const btn=$('#xl'),label=btn.textContent;btn.disabled=true;
  try{
    if(!window.JSZip)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='vendor/jszip.min.js';s.onload=ok;s.onerror=no;document.head.append(s)});
    const {data:cats,error}=await sb.from('categories').select('*').order('sort');if(error)throw error;
    const nameOf=(s,f,many)=>`${s.ref}_${s.slip_date}_${safe(s.supplier)}${many?'_'+f.page_no:''}.${f.path.split('.').pop()}`;
    const fileName=s=>s.slip_files.map(f=>nameOf(s,f,s.slip_files.length>1));
    const tag=S.month.slice(0,7),zip=new JSZip(),failed=[];
    const jobs=M.slips.flatMap(s=>s.slip_files.map(f=>({s,f})));
    let done=0;
    for(let i=0;i<jobs.length;i+=6)await Promise.all(jobs.slice(i,i+6).map(async({s,f})=>{
      const {data,error}=await sb.storage.from('slips').download(f.path);
      if(error||!data){failed.push(s.ref);return}
      zip.file(`Slips/${safe(personOf(M,s.user_id))}/${nameOf(s,f,s.slip_files.length>1)}`,data);
      btn.textContent=`Downloading ${++done} of ${jobs.length}`}));
    if(failed.length)throw new Error('Export stopped. These images could not be downloaded: '+failed.join(', '));
    const wb=await buildWorkbook(M,cats,fileName);
    zip.file(`Bergvik_Card_Expenses_${tag}.xlsx`,await wb.xlsx.writeBuffer());
    btn.textContent='Building ZIP…';
    saveBlob(await zip.generateAsync({type:'blob'}),`Bergvik_Card_Expenses_${tag}.zip`);
    toast(`Exported ${M.slips.length} slips and ${jobs.length} images`);
  }catch(e){toast(friendly(e))}
  btn.disabled=false;btn.textContent=label;
}

/* ---------- finance: people and cards ---------- */
const genPass=()=>'Slip-'+[...crypto.getRandomValues(new Uint32Array(3))].map(n=>n.toString(36)).join('').slice(0,12);
async function adminCall(body){const {data,error}=await sb.functions.invoke('manage-users',{body});
  if(error){let m=error.message;try{m=(await error.context.json()).error||m}catch{}throw new Error(m)}return data}
function showPass(email,p){const w=document.createElement('div');w.className='modal';document.body.append(w);
  w.innerHTML=`<div><h2>Temporary password</h2><p class="muted">Give this to ${esc(email)} directly. It is shown once, and they must change it at first sign-in.</p><p style="font-size:1.2rem;font-weight:700;margin:.8rem 0;word-break:break-all">${esc(p)}</p><button class="btn full">Done</button></div>`;
  $('button',w).onclick=()=>{w.remove();peopleView()}}
async function peopleView(){
  const m=$('#m');m.className='wide';m.innerHTML='<div class="card"><span class="spin"></span></div>';
  const [p,c]=await Promise.all([sb.from('profiles').select('*').order('full_name'),sb.from('cards').select('*').order('label')]);
  if(p.error||c.error){m.innerHTML=`<div class="note bad">${esc(friendly(p.error||c.error))}</div>`;return}
  m.innerHTML=`<div class="card"><h2>Add a person</h2><form id="ap"><div class="row"><div class="field"><label class="lbl" for="np">Full name</label><input id="np" type="text" required></div><div class="field"><label class="lbl" for="ne">Email</label><input id="ne" type="email" required></div>
  <div class="field"><label class="lbl" for="nr">Access</label><select id="nr"><option value="cardholder">Cardholder</option><option value="finance">Finance</option></select></div></div><button class="btn">Add person</button></form></div>
  <div class="card"><h2>People</h2><div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Cards</th><th></th></tr></thead><tbody>
  ${p.data.map(u=>`<tr><td>${esc(u.full_name)} ${u.active?'':'<span class="pill n">Inactive</span>'}</td><td>${esc(u.email)}</td><td>${u.role==='finance'?'Finance':'Cardholder'}</td>
  <td>${c.data.filter(k=>k.holder_id===u.id&&k.active).map(k=>`${esc(k.label)} (${k.last4})${k.statement_last4?` <span class="muted">statement ${k.statement_last4}</span>`:''} <button class="btn sm ghost" data-rc="${k.id}">Remove</button>`).join('<br>')||'<span class="muted">None</span>'}</td>
  <td style="white-space:nowrap">${u.active?`<button class="btn sm ghost" data-ac="${u.id}">Add card</button> <button class="btn sm ghost" data-rp="${u.id}">Reset password</button> <button class="btn sm ghost" data-ar="${u.id}" data-r="${u.role}">${u.role==='finance'?'Make cardholder':'Make finance'}</button> <button class="btn sm red" data-da="${u.id}">Deactivate</button>`:`<button class="btn sm ghost" data-re="${u.id}">Reactivate</button>`}</td></tr>`).join('')}
  </tbody></table></div></div>`;
  const run=async(fn,ok)=>{try{await fn();if(ok)toast(ok);peopleView()}catch(e){toast(friendly(e))}};
  $('#ap').onsubmit=async e=>{e.preventDefault();const t=genPass(),email=$('#ne').value.trim();
    try{await adminCall({action:'create',email,full_name:$('#np').value.trim(),role:$('#nr').value,temp_password:t});showPass(email,t)}catch(x){toast(friendly(x))}};
  $$('[data-ac]',m).forEach(b=>b.onclick=()=>cardForm(b.dataset.ac));
  $$('[data-rc]',m).forEach(b=>b.onclick=()=>run(async()=>{const {error}=await sb.from('cards').update({active:false}).eq('id',b.dataset.rc);if(error)throw error;await loadRefs()},'Card removed. Its history is kept.'));
  $$('[data-rp]',m).forEach(b=>b.onclick=async()=>{const t=genPass(),u=p.data.find(x=>x.id===b.dataset.rp);try{await adminCall({action:'reset_password',id:u.id,temp_password:t});showPass(u.email,t)}catch(e){toast(friendly(e))}});
  $$('[data-ar]',m).forEach(b=>b.onclick=()=>run(()=>adminCall({action:'update',id:b.dataset.ar,role:b.dataset.r==='finance'?'cardholder':'finance'}),'Access updated'));
  $$('[data-da]',m).forEach(b=>b.onclick=()=>run(()=>adminCall({action:'update',id:b.dataset.da,active:false}),'Deactivated. Their cards are off and their slips are kept.'));
  $$('[data-re]',m).forEach(b=>b.onclick=()=>run(()=>adminCall({action:'update',id:b.dataset.re,active:true}),'Reactivated'));
}
function cardForm(holder){
  const w=document.createElement('div');w.className='modal';document.body.append(w);
  w.innerHTML=`<div><h2>Add a card</h2><form><div class="field"><label class="lbl" for="kl">Card name</label><input id="kl" type="text" placeholder="FNB Cheque Card" required></div><div class="field"><label class="lbl" for="k4">Last 4 digits on the card</label><input id="k4" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></div><div class="field"><label class="lbl" for="k5">Last 4 digits on the bank statement (optional)</label><input id="k5" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4"><p class="muted" style="margin-top:.3rem">Only if the statement shows a different number. The app also learns this the first time you upload that card’s statement.</p></div><div id="ke"></div><div class="row"><button type="button" class="btn ghost" id="kc">Cancel</button><button class="btn">Add card</button></div></form></div>`;
  $('#kc',w).onclick=()=>w.remove();
  $('form',w).onsubmit=async e=>{e.preventDefault();const {error}=await sb.from('cards').insert({holder_id:holder,label:$('#kl',w).value.trim(),last4:$('#k4',w).value,statement_last4:$('#k5',w).value||null});
    if(error){$('#ke',w).innerHTML=`<div class="note bad">${esc(/duplicate|unique/.test(error.message)?'Another active card already uses those digits.':friendly(error))}</div>`;return}
    w.remove();await loadRefs();peopleView()};
}

/* ---------- finance: lists ---------- */
async function listsView(){
  const m=$('#m');m.className='wide';m.innerHTML='<div class="card"><span class="spin"></span></div>';
  const [k,o]=await Promise.all([sb.from('categories').select('*').order('sort'),sb.from('options').select('*').order('name')]);
  const opt=(kind,title)=>`<div class="card"><h2>${title}</h2><form data-add="${kind}" class="row" style="margin-bottom:.6rem"><input type="text" aria-label="New ${kind}" placeholder="Add…" required><button class="btn" style="flex:0 0 auto">Add</button></form>${o.data.filter(x=>x.kind===kind).map(x=>`<div class="item"><div class="m"><div class="t">${esc(x.name)}</div></div>${x.active?`<button class="btn sm ghost" data-of="${x.id}" data-v="false">Hide</button>`:`<span class="pill n">Hidden</span> <button class="btn sm ghost" data-of="${x.id}" data-v="true">Show</button>`}</div>`).join('')||'<p class="muted">Nothing yet.</p>'}</div>`;
  m.innerHTML=`<div class="card"><h2>Categories</h2><div class="tw"><table><thead><tr><th>Name</th><th>GL code</th><th>Client needed</th><th>Note needed</th><th>Shown</th></tr></thead><tbody>
  ${k.data.map(c=>`<tr data-c="${c.id}"><td><input type="text" aria-label="Name" data-f="name" value="${esc(c.name)}"></td><td><input type="text" aria-label="GL code" data-f="gl_code" value="${esc(c.gl_code)}" style="min-width:110px"></td><td><input type="checkbox" aria-label="Client needed" data-f="needs_client" ${c.needs_client?'checked':''}></td><td><input type="checkbox" aria-label="Note needed" data-f="needs_purpose" ${c.needs_purpose?'checked':''}></td><td><input type="checkbox" aria-label="Shown" data-f="active" ${c.active?'checked':''}></td></tr>`).join('')}
  </tbody></table></div><form id="ac" class="row" style="margin-top:.7rem"><input type="text" placeholder="New category" aria-label="New category" required><input type="text" placeholder="GL code" aria-label="GL code"><button class="btn" style="flex:0 0 auto">Add</button></form></div>
  ${opt('department','Departments')}${opt('project','Projects')}${opt('client','Clients')}`;
  const done=async e=>{if(e)toast(/duplicate/.test(e.message)?'That name already exists.':friendly(e));await loadRefs();listsView()};
  $$('[data-f]',m).forEach(i=>i.onchange=async()=>{const id=i.closest('tr').dataset.c,f=i.dataset.f,v=i.type==='checkbox'?i.checked:(i.value.trim()||null);
    if(f==='name'&&!v){toast('A category needs a name.');return listsView()}
    const {error}=await sb.from('categories').update({[f]:v}).eq('id',id);if(error)return done(error);await loadRefs();toast('Saved')});
  $$('[data-add]',m).forEach(f=>f.onsubmit=async e=>{e.preventDefault();const {error}=await sb.from('options').insert({kind:f.dataset.add,name:$('input',f).value.trim()});done(error)});
  $$('[data-of]',m).forEach(b=>b.onclick=async()=>{const {error}=await sb.from('options').update({active:b.dataset.v==='true'}).eq('id',b.dataset.of);done(error)});
  $('#ac').onsubmit=async e=>{e.preventDefault();const [a,b]=$$('input',e.target);const {error}=await sb.from('categories').insert({name:a.value.trim(),gl_code:b.value.trim()||null});done(error)};
}

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('[role=button]'))e.target.click()});
boot().catch(e=>loginView(friendly(e)));
