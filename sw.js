// Network first, so staff always get the latest version. The cached copy only opens the app with no signal.
const C='slips-v2', FILES=['./','./index.html','./app.js','./logic.js','./styles.css','./manifest.json','./logo.jpg','./logo-mark.jpg','./vendor/supabase.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const k=r.clone();caches.open(C).then(c=>c.put(e.request,k))}return r}).catch(()=>caches.match(e.request)));
});
