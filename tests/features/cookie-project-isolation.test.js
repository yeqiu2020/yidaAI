'use strict';
const fs=require('fs'),path=require('path');
const {loadProjectCookieData}=require('../../lib/sync-server/action-code-sync');

test('更新的公共父目录或其他组织 Cookie 不得覆盖本项目登录态',()=>{
  const temp=path.resolve(__dirname,'../../temp-file');fs.mkdirSync(temp,{recursive:true});
  const dir=fs.mkdtempSync(path.join(temp,'cookie-isolation-'));
  try {
    const project=path.join(dir,'project'),app=path.join(project,'app');fs.mkdirSync(app,{recursive:true});
    fs.writeFileSync(path.join(project,'组织及应用信息.md'),'| 完整域名 | https://a.aliwork.com |\n| corpId | dingA |');
    const state=(url,corp)=>({base_url:url,corp_id:corp,cookies:[{name:'fixture',value:'FAKE'}]});
    fs.writeFileSync(path.join(project,'.cookies.json'),JSON.stringify(state('https://a.aliwork.com','dingA')));
    fs.writeFileSync(path.join(dir,'.cookies.json'),JSON.stringify(state('https://b.aliwork.com','dingB')));
    fs.writeFileSync(path.join(app,'.cookies.json'),JSON.stringify(state('https://b.aliwork.com','dingB')));
    expect(loadProjectCookieData(app).corp_id).toBe('dingA');
    fs.unlinkSync(path.join(project,'.cookies.json'));
    expect(loadProjectCookieData(app)).toBeNull();
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
