'use strict';
const {descriptionFromSkill,inspectSkillText}=require('../../lib/core/skill-metadata');
const {explicitIntent}=require('../../lib/core/skill-routing');
const path=require('path');

test('描述支持 CRLF、引号与 YAML 折叠，索引漂移直接报错',()=>{
  expect(descriptionFromSkill('---\r\ndescription: "你好"\r\n---')).toBe('你好');
  expect(descriptionFromSkill('---\ndescription: >\n  第一行\n  第二行\nname: demo\n---')).toBe('第一行 第二行');
  expect(inspectSkillText({description:'旧描述'},'---\ndescription: 新描述\n---',()=>true).join(' ')).toContain('不一致');
});
test('过期脚本命令会导致 Skill 校验失败',()=>{
  const text='---\ndescription: demo\n---\nnode .agents/candidates/demo/scripts/run.js';
  expect(inspectSkillText({description:'demo'},text,()=>false).join(' ')).toContain('入口不存在');
});
test('路径校验器接受明确指定项目根下的 Cookie 路径',()=>{
  const old=process.env.YIDA_PROJECT_ROOT;
  const root=path.resolve(__dirname,'../..');
  try {
    process.env.YIDA_PROJECT_ROOT=root;
    expect(require('../../scripts/ai-validator').validateCookiePath(path.join(root,'.cookies.json')).valid).toBe(true);
  } finally {
    if(old===undefined)delete process.env.YIDA_PROJECT_ROOT;else process.env.YIDA_PROJECT_ROOT=old;
  }
});
test.each([
  ['请创建审批结束后通知财务的逻辑流','integration'],
  ['清空应用里已经过期的表单数据','data-clean'],
  ['写一个计算含税金额的公式','formula-generator'],
  ['编写手机号格式校验代码','code-expert'],
  ['这个表单公式为什么不生效','yida-consultant'],
  ['做一个ECharts经营大屏','custom-page'],
  ['在宜搭新建一个应用','api-client'],
])('高风险意图边界：%s', (text,expected)=>expect(explicitIntent(text)).toBe(expected));
