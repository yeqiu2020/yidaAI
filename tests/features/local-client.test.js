'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../本地操作页面/js/local-client.js'),'utf8');
const {MUTATING_GETS}=require('../../lib/local-service/security');

function setup(options={}) {
  const calls=[];
  const originalFetch=jest.fn(async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);
    calls.push({url,init});
    if(url.pathname==='/get-session-token')return Response.json({token:'FIXTURE_TOKEN',expiresIn:100000});
    if(url.pathname==='/request-clean-confirm')return Response.json({nonce:'FIXTURE_NONCE'});
    if(options.denied)return Response.json({code:'SESSION_TOKEN_REQUIRED'},{status:403});
    return Response.json({success:true});
  });
  const window={fetch:originalFetch,location:{href:'http://127.0.0.1:8080/project/portal.html'}};
  const EventSource=jest.fn(function(url){this.url=url;});
  vm.runInNewContext(source,{window,URL,Request,Response,Headers,Map,Set,EventSource});
  return {window,calls,originalFetch,EventSource};
}

test('同一服务并发写请求共用会话，添加 pageUrl 和 token',async()=>{
  const f=setup();
  await Promise.all([f.window.fetch('http://127.0.0.1:3457/local-files',{method:'POST',body:'{}'}),f.window.fetch('http://127.0.0.1:3457/push-form-actions',{method:'POST',body:'{}'})]);
  expect(f.calls.filter(c=>c.url.pathname==='/get-session-token')).toHaveLength(1);
  const write=f.calls.find(c=>c.url.pathname==='/local-files');
  expect(write.init.headers.get('X-Session-Token')).toBe('FIXTURE_TOKEN');
  expect(write.url.searchParams.get('pageUrl')).toBe(f.window.location.href);
});
test('只读健康请求不申请会话，外部请求完全保持原调用',async()=>{
  const f=setup();await f.window.fetch('http://127.0.0.1:3457/health');
  expect(f.calls).toHaveLength(1);
  const init={method:'GET'};await f.window.fetch('https://example.invalid/data',init);
  expect(f.originalFetch).toHaveBeenLastCalledWith('https://example.invalid/data',init);
});
test('SSE 与有副作用 GET 获取 token；清空数据使用 nonce',async()=>{
  const f=setup();const es=await f.window.YidaLocalClient.eventSource('http://127.0.0.1:3457/refresh-org-apps');
  expect(new URL(es.url).searchParams.get('token')).toBe('FIXTURE_TOKEN');
  await f.window.fetch('http://127.0.0.1:3457/clean-data',{method:'POST',body:'{}'});
  expect(f.calls.find(c=>c.url.pathname==='/clean-data').init.headers.get('X-Confirm-Nonce')).toBe('FIXTURE_NONCE');
});
test('失效会话的写请求不自动重放，下一次明确操作获取新会话',async()=>{
  const f=setup({denied:true});
  const response=await f.window.fetch('http://127.0.0.1:3457/push-form-actions',{method:'POST',body:'{}'});
  expect(response.status).toBe(403);
  expect(f.calls.filter(c=>c.url.pathname==='/push-form-actions')).toHaveLength(1);
  await f.window.fetch('http://127.0.0.1:3457/push-form-actions',{method:'POST',body:'{}'});
  expect(f.calls.filter(c=>c.url.pathname==='/get-session-token')).toHaveLength(2);
});

test.each([...MUTATING_GETS])('客户端覆盖服务端所有有副作用的 GET：%s',async route=>{
  const f=setup();await f.window.fetch('http://127.0.0.1:3457'+route);
  expect(f.calls.find(c=>c.url.pathname===route).init.headers.get('X-Session-Token')).toBe('FIXTURE_TOKEN');
});
