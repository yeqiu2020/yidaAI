/* Shared local-service client, injected by the static server into all generated HTML. */
(function (global) {
  'use strict';
  if (global.YidaLocalClient) return;
  var originalFetch=global.fetch.bind(global);
  var sessions=new Map();
  var pending=new Map();
  var mutatingGets=new Set(['/restart-service','/ensure-service','/refresh-login','/refresh-org-apps','/sync-app-to-local-stream','/__yida_start_service']);
  function local(url) { return /^(127\.0\.0\.1|localhost)$/.test(url.hostname) && ['8080','3457'].includes(url.port); }
  async function token(origin) {
    var cached=sessions.get(origin);
    if(cached && cached.until>Date.now()) return cached.value;
    if(!pending.has(origin)) pending.set(origin,(async function(){
      var response=await originalFetch(origin+'/get-session-token',{cache:'no-store'});
      var result=await response.json();
      if(!response.ok || !result.token) throw new Error(result.error || '本地服务会话获取失败');
      sessions.set(origin,{value:result.token,until:Date.now()+Math.max(1000,result.expiresIn-30000)});
      return result.token;
    })().finally(function(){pending.delete(origin);}));
    return pending.get(origin);
  }
  async function serviceFetch(input,init) {
    var url=new URL(typeof input==='string' || input instanceof URL ? input : input.url,global.location.href);
    if(!local(url)) return originalFetch(input,init);
    var options=Object.assign({},init);
    var method=String(options.method || input.method || 'GET').toUpperCase();
    var headers=new Headers(options.headers || input.headers || {});
    url.searchParams.set('pageUrl',global.location.href);
    if(!['GET','HEAD'].includes(method) || mutatingGets.has(url.pathname)) {
      headers.set('X-Session-Token',await token(url.origin));
      if(url.pathname==='/clean-data') {
        var confirmation=await originalFetch(url.origin+'/request-clean-confirm',{method:'POST',headers:{'X-Session-Token':headers.get('X-Session-Token')}});
        var nonce=await confirmation.json();
        if(!confirmation.ok || !nonce.nonce) throw new Error(nonce.error || '清空数据确认失败');
        headers.set('X-Confirm-Nonce',nonce.nonce);
      }
    }
    options.headers=headers;
    var response=await originalFetch(input instanceof Request ? new Request(url,input) : url,options);
    if(response.status===403) {
      // A rejected request was not executed; invalidate for the next user action, never replay a write.
      try { var error=await response.clone().json(); if(error.code==='SESSION_TOKEN_REQUIRED') sessions.delete(url.origin); } catch (_) {}
    }
    return response;
  }
  async function eventSource(input) {
    var url=new URL(input,global.location.href);
    url.searchParams.set('pageUrl',global.location.href);
    url.searchParams.set('token',await token(url.origin));
    return new EventSource(url.href);
  }
  global.YidaLocalClient={fetch:serviceFetch,eventSource:eventSource,token:token};
  global.fetch=serviceFetch;
})(window);
