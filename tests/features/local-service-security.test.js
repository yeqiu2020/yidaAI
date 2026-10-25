'use strict';
const fs=require('fs');
const path=require('path');
const http=require('http');
const {createStaticServer}=require('../../lib/local-service/static-server');
const {createSyncServer}=require('../../.agents/skills/form_creator/scripts/sync_server');
const {createSecurity}=require('../../lib/local-service/security');
const {requestJson}=require('../../lib/local-service/client');

function request(server,url,options={},body) {
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method:options.method||'GET',headers:options.headers||{}},res=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error',reject);if(body)req.write(body);req.end();
  });
}
const listen=s=>new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
const close=s=>new Promise(resolve=>s.close(resolve));

describe('本地服务真实 HTTP 边界（短生命周期、隔离假数据）',()=>{
  let dir,project,staticServer,syncServer;
  beforeAll(async()=>{
    const temp=path.resolve(__dirname,'../../temp-file');fs.mkdirSync(temp,{recursive:true});
    dir=fs.mkdtempSync(path.join(temp,'security-test-'));
    project=path.join(dir,'project');
    fs.mkdirSync(path.join(project,'.agents'),{recursive:true});
    fs.mkdirSync(path.join(project,'本地操作页面'),{recursive:true});
    fs.writeFileSync(path.join(project,'本地操作页面/index.html'),'<html><head></head><body>portal</body></html>');
    fs.writeFileSync(path.join(project,'组织及应用信息.md'),'fixture');
    fs.writeFileSync(path.join(project,'.cookies.json'),'FAKE_COOKIE');
    fs.writeFileSync(path.join(project,'README.md'),'public fixture');
    fs.mkdirSync(path.join(dir,'project-sibling'));
    fs.writeFileSync(path.join(dir,'project-sibling/sentinel.txt'),'FAKE_SIBLING');
    staticServer=createStaticServer(project);syncServer=createSyncServer({staticRoot:project});
    await Promise.all([listen(staticServer),listen(syncServer)]);
  });
  afterAll(async()=>{
    await Promise.all([close(staticServer),close(syncServer)]);
    fs.rmSync(dir,{recursive:true,force:true});
  });
  test('公开页面可读，自动注入客户端；监听限定回环',async()=>{
    const r=await request(staticServer,'/本地操作页面/index.html'.replace('本地操作页面',encodeURIComponent('本地操作页面')));
    expect(r.status).toBe(200);expect(r.text).toContain('/__yida_client.js');
    expect(staticServer.address().address).toBe('127.0.0.1');
    expect((await request(staticServer,'/__yida_client.js')).status).toBe(200);
  });
  test.each(['/.cookies.json','/../project-sibling/sentinel.txt','/%2e%2e/project-sibling/sentinel.txt','/.agents/skills/example.js','/package.json'])('拒绝凭证或越界路径 %s',async url=>{
    expect((await request(staticServer,url)).status).toBe(403);
  });
  test('畸形 URL 返回 400，后续健康检查仍正常',async()=>{
    expect((await request(staticServer,'/%')).status).toBe(400);
    expect((await request(staticServer,'/__yida_health')).status).toBe(200);
  });
  test('跨项目目录链接拒绝访问',async()=>{
    const link=path.join(project,'linked');
    fs.symlinkSync(path.join(dir,'project-sibling'),link,'junction');
    expect((await request(staticServer,'/linked/sentinel.txt')).status).toBe(403);
  });
  test('默认同步服务健康响应能结束并声明安全状态',async()=>{
    const r=await request(syncServer,'/health');
    expect(r.status).toBe(200);expect(JSON.parse(r.text)).toMatchObject({securityPatch:'enabled',bindAddress:'127.0.0.1',tokenRequired:true});
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
  test.each(['/push-form-actions','/local-files','/future-write-route'])('新增/已有写接口无 token 一律拒绝 %s',async route=>{
    expect((await request(syncServer,route,{method:'POST'},'{}')).status).toBe(403);
  });
  test.each(['/refresh-login','/restart-service','/ensure-service','/sync-app-to-local-stream'])('有副作用的 GET 也需要 token %s',async route=>{
    expect((await request(syncServer,route)).status).toBe(403);
  });
  test('正常获取 token 后可到达业务校验；凭证读接口拒绝',async()=>{
    const session=JSON.parse((await request(syncServer,'/get-session-token')).text);
    const r=await request(syncServer,'/push-form-actions',{method:'POST',headers:{'X-Session-Token':session.token}},'{}');
    expect(r.status).toBe(400);
    const secret=await request(syncServer,'/local-files?file=.cookies.json');
    expect(secret.status).not.toBe(200);expect(secret.text).not.toContain('FAKE_COOKIE');
  });
  test('Node CLI 公共客户端能够获取 token 并到达业务参数校验',async()=>{
    const response=await requestJson('http://127.0.0.1:'+syncServer.address().port,'/push-form-actions',{});
    expect(response.status).toBe(400);expect(response.json.error).toContain('缺少表单');
  });
  test('任意网站和 DNS rebinding Host 被拒绝，可信 Origin 精确回显',async()=>{
    expect((await request(syncServer,'/get-session-token',{headers:{Origin:'https://evil.example'}})).status).toBe(403);
    expect((await request(syncServer,'/health',{headers:{Host:'evil.example'}})).status).toBe(403);
    const r=await request(syncServer,'/health',{headers:{Origin:'http://127.0.0.1:8080'}});
    expect(r.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8080');
  });
});

test('nonce 绑定 token、一次性使用；过期 token 即时失效',()=>{
  let time=1000;const protect=createSecurity({now:()=>time,tokenTtl:100});
  function call(url,method='GET',headers={}){let status=200,body;const res={setHeader(){},writeHead(n){status=n;},end(s){body=s?JSON.parse(s):{};}};return {blocked:protect({url,method,headers},res),status,body};}
  const token=call('/get-session-token').body.token;
  const nonce=call('/request-clean-confirm','POST',{'x-session-token':token}).body.nonce;
  const headers={'x-session-token':token,'x-confirm-nonce':nonce};
  expect(call('/clean-data','POST',headers).blocked).toBe(false);
  expect(call('/clean-data','POST',headers).status).toBe(403);
  time+=101;
  expect(call('/push-form-actions','POST',headers).status).toBe(403);
});
