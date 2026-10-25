'use strict';

const http = require('http');

function exchange(url, options = {}, body) {
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('只允许连接本机宜搭服务');
  return new Promise((resolve,reject)=>{
    const req=http.request(url,{...options,timeout:options.timeout || 10000},res=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>{
        const text=Buffer.concat(chunks).toString('utf8');
        try {resolve({status:res.statusCode,json:JSON.parse(text)});}
        catch (_) {resolve({status:res.statusCode,json:null,text});}
      });
    });
    req.on('error',reject);
    req.on('timeout',()=>req.destroy(new Error('本地服务请求超时')));
    if(body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

async function requestJson(base, route, body, method='POST', options={}) {
  const url=new URL(route,base);
  const session=await exchange(new URL('/get-session-token',url),{method:'GET'});
  if(session.status!==200 || !session.json || !session.json.token) throw new Error('本地服务尚未启用当前鉴权协议，请重启服务');
  const headers={'Content-Type':'application/json','X-Session-Token':session.json.token};
  if(url.pathname==='/clean-data') {
    const confirmation=await exchange(new URL('/request-clean-confirm',url),{method:'POST',headers});
    if(!confirmation.json || !confirmation.json.nonce) throw new Error('清空数据确认失败');
    headers['X-Confirm-Nonce']=confirmation.json.nonce;
  }
  return exchange(url,{method,headers,timeout:options.timeout},body);
}
module.exports={requestJson};
