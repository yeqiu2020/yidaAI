'use strict';
const path=require('path');
const {pushActionCode}=require('../../lib/sync-server/action-code-sync');

function fixture(options={}) {
  const original={actions:{module:{source:'export function oldAction() {}',compiled:'OLD_COMPILED'},list:[{id:'oldAction',title:'oldAction'}]},componentsTree:[]};
  const originalJson=JSON.stringify(original);
  const writes=new Map();let saved;
  const deps={
    fs:{existsSync:()=>true,mkdirSync(){},writeFileSync:(p,data)=>writes.set(path.basename(p),data),readFileSync:()=> 'export function newAction() {}'},
    resolveContext:()=>({config:{appId:'OFFLINE'},form:{uuid:'OFFLINE'},formDir:'offline',baseUrl:'offline'}),
    syntaxCheck:()=>({ok:true}),
    loadPushConfig:()=>({exists:false}),
    fetchFormSchema:jest.fn(async()=>saved ? (options.staleReadback ? original : saved) : original),
    saveFormSchema:jest.fn(async(a,f,schema)=>{saved=JSON.parse(JSON.stringify(schema));}),
  };
  return {original,originalJson,writes,deps};
}
const params={projectDir:'offline',formName:'离线表单',fileName:'动作代码_推送版.js',scope:'all'};

test('全量备份为真正原始 Schema；工作对象变更不污染原始响应',async()=>{
  const f=fixture();const r=await pushActionCode(params,f.deps);
  expect(f.writes.get('Schema备份_推送前.json')).toBe(JSON.stringify(f.original,null,2));
  expect(JSON.stringify(f.original)).toBe(f.originalJson);
  expect(f.writes.get('动作代码_推送前备份.js')).toContain('oldAction');
  expect(r).toMatchObject({success:true,saved:true,verified:true});
  expect(f.deps.fetchFormSchema).toHaveBeenCalledTimes(2);
});
test('仅代码推送没有配置文件也回读 source、compiled 和函数表',async()=>{
  const f=fixture();const r=await pushActionCode({...params,scope:'code'},f.deps);
  expect(r.verify.checked).toBeGreaterThanOrEqual(4);
  expect(r.verified).toBe(true);expect(f.deps.fetchFormSchema).toHaveBeenCalledTimes(2);
});
test('保存成功但回读仍旧时明确返回 saved=true、success=false',async()=>{
  const f=fixture({staleReadback:true});const r=await pushActionCode(params,f.deps);
  expect(r).toMatchObject({success:false,saved:true,verified:false,stage:'verification_failed'});
  expect(r.verify.failures.join(' ')).toMatch(/source.*compiled.*newAction/);
  expect(r.error).toContain('已保存');
});
test('回读网络失败不会误报未保存，也不会自动重复写',async()=>{
  const f=fixture();f.deps.fetchFormSchema.mockImplementationOnce(async()=>f.original).mockRejectedValueOnce(new Error('offline readback'));
  const r=await pushActionCode(params,f.deps);
  expect(r).toMatchObject({saved:true,verified:false,success:false});
  expect(f.deps.saveFormSchema).toHaveBeenCalledTimes(1);
});
test('语法/推送配置失败不调用保存；备份写入失败也阻止保存',async()=>{
  const f=fixture();f.deps.syntaxCheck=()=>({ok:false,error:'bad syntax'});
  expect((await pushActionCode(params,f.deps)).success).toBe(false);
  expect(f.deps.saveFormSchema).not.toHaveBeenCalled();
  const g=fixture();g.deps.fs.writeFileSync=()=>{throw new Error('disk full');};
  await expect(pushActionCode(params,g.deps)).rejects.toThrow('disk full');
  expect(g.deps.saveFormSchema).not.toHaveBeenCalled();
});
