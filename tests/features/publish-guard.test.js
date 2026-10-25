'use strict';
const fs=require('fs'),path=require('path');
const guard=require('../../.agents/skills/publish-guard/scripts/publish-guard');
const expected={type:'native',source:'export function renderJsx() { return null; }',compiled:'NEW_COMPILED',functions:['renderJsx']};
const old={actions:{module:{source:'OLD_SOURCE',compiled:'OLD_COMPILED'},list:[]},componentsTree:[]};
const fresh={actions:{module:{source:expected.source,compiled:expected.compiled},list:[{id:'renderJsx'}]},componentsTree:[]};
let dir,code;
beforeAll(()=>{
  const temp=path.resolve(__dirname,'../../temp-file');fs.mkdirSync(temp,{recursive:true});
  dir=fs.mkdtempSync(path.join(temp,'guard-test-'));code=path.join(dir,'page.js');fs.writeFileSync(code,expected.source);
});
afterAll(()=>fs.rmSync(dir,{recursive:true,force:true}));
beforeEach(()=>jest.spyOn(console,'log').mockImplementation(()=>{}));
afterEach(()=>jest.restoreAllMocks());

test('无基线不能把已有页面视为无冲突',async()=>{
  const r=await guard.cmdCheck('OFFLINE','OFFLINE',{fetchSchema:async()=>old,loadCache:()=>null});
  expect(r.passed).toBe(false);expect(r.reason).toContain('基线');
});
test('组件数量相同但属性变化、source 清空或 compiled 改动都构成冲突',()=>{
  const a={actions:old.actions,componentsTree:[{props:{title:'before'}}]};
  const b={actions:old.actions,componentsTree:[{props:{title:'after'}}]};
  expect(guard.diffSchemas(guard.summarizeSchema(a),guard.summarizeSchema(b)).isUnsynced).toBe(true);
  expect(guard.diffSchemas(guard.summarizeSchema(old),guard.summarizeSchema({actions:{module:{source:'',compiled:'changed'}}})).isUnsynced).toBe(true);
});
test('旧代码非空不能通过本次健康检查；compiled 与函数表也必须一致',()=>{
  expect(guard.verifyPublishedSchema(old,expected).passed).toBe(false);
  expect(guard.verifyPublishedSchema(fresh,expected).passed).toBe(true);
  const wrong=JSON.parse(JSON.stringify(fresh));wrong.actions.module.compiled='OLD_COMPILED';
  expect(guard.verifyPublishedSchema(wrong,expected).passed).toBe(false);
});
test('Canvas 不依赖空 actions.source，核对运行代码与 importedModules',()=>{
  const schema={pages:[{componentsTree:[{componentName:'YidaCodeCanvas',props:{code:'runtime',runtimeCode:'runtime',importedModules:['react']}}]}]};
  expect(guard.verifyPublishedSchema(schema,{type:'canvas',runtimeCode:'runtime',importedModules:['react']}).passed).toBe(true);
  expect(guard.verifyPublishedSchema(schema,{type:'canvas',runtimeCode:'old-runtime',importedModules:['react']}).passed).toBe(false);
});
test('回读失败不推进基线，也不误报发布完整成功',async()=>{
  const saveCache=jest.fn();const publish=jest.fn(async()=>({success:true}));
  const r=await guard.cmdPublish('OFFLINE','OFFLINE',code,false,{compileExpected:()=>expected,fetchSchema:async()=>old,loadCache:()=>({schema:old}),publish,saveCache});
  expect(r).toMatchObject({passed:false,saved:true,verified:false});
  expect(saveCache).not.toHaveBeenCalled();expect(publish).toHaveBeenCalledTimes(1);
});
test('回读成功才推进基线，明确等待内置浏览器运行验收',async()=>{
  let published=false;const saveCache=jest.fn();
  const r=await guard.cmdPublish('OFFLINE','OFFLINE',code,false,{
    compileExpected:()=>expected,fetchSchema:async()=>published?fresh:old,loadCache:()=>({schema:old}),
    publish:async()=>{published=true;return {success:true};},saveCache,
  });
  expect(r).toMatchObject({passed:true,saved:true,verified:true,runtimeVerified:false,nextAction:'in_app_browser_validation'});
  expect(saveCache).toHaveBeenCalledTimes(1);
});
test('检查后线上变化则拒绝写入，即使本次显式强制也要重新检查',async()=>{
  const fetchSchema=jest.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(fresh);const publish=jest.fn();
  const r=await guard.cmdPublish('OFFLINE','OFFLINE',code,true,{compileExpected:()=>expected,fetchSchema,publish});
  expect(r.passed).toBe(false);expect(publish).not.toHaveBeenCalled();
});
test('真实 Native 编译器编译错误时中止，禁止原始 JSX 降级上线',()=>{
  const publisher=require('../../.agents/skills/custom-page/scripts/publish-page');
  expect(()=>publisher.compileSource('export function broken( {')).toThrow('编译失败');
});
