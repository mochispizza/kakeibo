/* 家計簿PWA サービスワーカー
 * - アプリ本体のファイルを端末に保存し、電波がなくても開けるようにする
 * - 開けるときは常に最新版を取りに行く(ネットワーク優先。遅いときだけ保存分を先に出す)
 * - 他のアプリから「共有」された写真を受け取り、アプリに渡す
 * Apps Script や Claude への通信には一切関わらない(同じ場所のファイルだけ扱う)。 */
var VERSION='4497757fe0';
var CACHE='kk-static-'+VERSION;
var PRECACHE=['./','./index.html','./three.min.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(PRECACHE);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil((async function(){
    var keys=await caches.keys();
    for(var i=0;i<keys.length;i++){if(keys[i].indexOf('kk-static-')===0&&keys[i]!==CACHE)await caches.delete(keys[i]);}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',function(e){
  var req=e.request,url=new URL(req.url);
  if(req.method==='POST'&&url.origin===location.origin&&/\/share-target$/.test(url.pathname)){e.respondWith(handleShare(req));return;}
  if(req.method!=='GET'||url.origin!==location.origin)return;
  e.respondWith(networkFirst(e));
});

async function networkFirst(e){
  var req=e.request,url=new URL(req.url);
  var key=req.mode==='navigate'?new Request(url.origin+url.pathname):req;
  var cache=await caches.open(CACHE);
  var net=fetch(req).then(function(res){
    if(res&&res.ok&&res.type==='basic')cache.put(key,res.clone());
    return res;
  });
  var hit=await cache.match(key);
  if(!hit&&req.mode==='navigate')hit=await cache.match('./index.html');
  if(!hit)return net;
  try{
    return await Promise.race([net,new Promise(function(_,rej){setTimeout(rej,3500);})]);
  }catch(_){
    e.waitUntil(net.catch(function(){}));
    return hit;
  }
}

async function handleShare(req){
  var n=0;
  try{
    var fd=await req.formData();
    await caches.delete('kk-shared');
    var c=await caches.open('kk-shared');
    var files=fd.getAll('photos').filter(function(f){return f&&typeof f==='object'&&f.type&&f.type.indexOf('image/')===0;}).slice(0,5);
    for(var i=0;i<files.length;i++){
      await c.put(new Request(self.registration.scope+'__shared__/'+i),new Response(files[i],{headers:{'Content-Type':files[i].type,'X-Name':encodeURIComponent(files[i].name||('shared'+i+'.jpg'))}}));
    }
    var meta={title:String(fd.get('title')||''),text:String(fd.get('text')||''),url:String(fd.get('url')||'')};
    await c.put(new Request(self.registration.scope+'__shared__/meta'),new Response(JSON.stringify(meta),{headers:{'Content-Type':'application/json'}}));
    n=files.length;
  }catch(err){}
  return Response.redirect(self.registration.scope+'?shared='+n,303);
}
