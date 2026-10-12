/**
 * tests/schema-push.test.js — schema-push.js 回归测试（v4.0.0 全量推送能力）
 *
 * 夹具：tests/fixtures/schema-push_采购订单线上Schema.json
 *       （2026-09-30 从宜搭 getFormSchema.json(V5) 拉取的真实设计器 Schema，
 *        含设计器手写的绑定/数据源/公式/校验金标准结构，防止推送结构与设计器漂移）
 *
 * 运行：npx jest tests/schema-push.test.js（无网络依赖，纯内存）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const schemaPush = require('../lib/sync-server/schema-push');

const FIXTURE = path.join(__dirname, 'fixtures', 'schema-push_采购订单线上Schema.json');

const CODE = `
export function didMount() {}
export function onTestChange(value) { console.log(value); }
const helper = 1;
export { helper as helperFn };
`;

function freshSchema() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'));
}

describe('schema-push extractExportNames', () => {
  test('识别 export function / const / export{} 三种导出', () => {
    const names = schemaPush.extractExportNames(CODE);
    expect(names.sort()).toEqual(['didMount', 'helperFn', 'onTestChange']);
  });
});

describe('schema-push rebuildActionsList', () => {
  test('只增不删：保留原条目、追加新导出、不重复', () => {
    const schema = freshSchema();
    const before = schema.actions.list.map(x => x.id);
    const r = schemaPush.rebuildActionsList(schema, CODE);
    const after = schema.actions.list.map(x => x.id);
    expect(before.every(id => after.includes(id))).toBe(true);
    expect(r.addedNames).toContain('onTestChange');
    expect(r.addedNames).toContain('helperFn');
    expect(r.addedNames).not.toContain('didMount');
    // 幂等
    const r2 = schemaPush.rebuildActionsList(schema, CODE);
    expect(r2.addedNames).toEqual([]);
  });
});

describe('schema-push applyBindings', () => {
  test('按 fieldId 新增 actionRef 绑定并幂等', () => {
    const schema = freshSchema();
    const r1 = schemaPush.applyBindings(schema, [
      { field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }
    ], schemaPush.extractExportNames(CODE));
    expect(r1.added).toBe(1);
    const { component } = schemaPush.findComponent(schemaPush.getComponentsTree(schema), 'textField_kk91ezq9');
    const ev = component.props.onChange.events;
    expect(ev[ev.length - 1].name).toBe('onTestChange');
    expect(ev[ev.length - 1].type).toBe('actionRef');
    expect(ev[ev.length - 1].uuid).toMatch(/^\d+_\d+$/);
    const r2 = schemaPush.applyBindings(schema, [
      { field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }
    ], schemaPush.extractExportNames(CODE));
    expect(r2.added).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  test('新建事件容器补全金标准形态：type=JSExpression + value=execEventFlow（运行时可触发）', () => {
    const schema = freshSchema();
    schemaPush.applyBindings(schema, [
      { field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }
    ], schemaPush.extractExportNames(CODE));
    const { component } = schemaPush.findComponent(schemaPush.getComponentsTree(schema), 'textField_kk91ezq9');
    const container = component.props.onChange;
    expect(container.type).toBe('JSExpression');
    expect(container.value).toBe('this.utils.legaoBuiltin.execEventFlow.bind(this, [this.onTestChange])');
    // 已有 value 的容器不被覆盖（设计器手配金标准保持原样）
    const schema2 = freshSchema();
    schemaPush.applyBindings(schema2, [
      { field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }
    ], schemaPush.extractExportNames(CODE));
    const c2 = schemaPush.findComponent(schemaPush.getComponentsTree(schema2), 'textField_kk91ezq9').component;
    const designerValue = 'this.utils.legaoBuiltin.execEventFlow.bind(this, [this.onDesignerFn])';
    c2.props.onChange.value = designerValue;
    schemaPush.applyBindings(schema2, [
      { field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }
    ], schemaPush.extractExportNames(CODE));
    expect(c2.props.onChange.value).toBe(designerValue);
    // verifyPushedSchema 对 value 缺失的绑定报失败
    delete c2.props.onChange.value;
    const v = schemaPush.verifyPushedSchema(schema2, {
      bindings: [{ field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }]
    });
    expect(v.ok).toBe(false);
    expect(v.failures.join()).toMatch(/事件流 value 缺失/);
  });

  test('中文名定位成功；歧义/未知函数/非法事件名被拦截', () => {
    const schema = freshSchema();
    const r = schemaPush.applyBindings(schema, [
      { field: '采购员', event: 'onChange', fn: 'onTestChange' }
    ], ['onTestChange']);
    expect(r.details[0].matchedBy).toBe('label');
    // 「产品名称」主表子表各一个 → 歧义拦截
    expect(() => schemaPush.applyBindings(schema, [
      { field: '产品名称', event: 'onChange', fn: 'onTestChange' }
    ], ['onTestChange'])).toThrow(/改用字段ID/);
    // 引用不存在的导出函数 → 拦截
    expect(() => schemaPush.applyBindings(schema, [
      { field: '采购员', event: 'onChange', fn: 'onNotExist' }
    ], ['onTestChange'])).toThrow(/导出函数中不存在/);
    // 事件名不合法 → 拦截
    expect(() => schemaPush.applyBindings(schema, [
      { field: '采购员', event: 'change', fn: 'onTestChange' }
    ], ['onTestChange'])).toThrow(/事件名不合法/);
  });
});

describe('schema-push applyDataSources', () => {
  const meta = { formUuid: 'FORM-TEST' };

  test('新增 REMOTE 条目，结构与设计器金标准一致', () => {
    const schema = freshSchema();
    const r1 = schemaPush.applyDataSources(schema, [
      { name: 'getTestOrder', description: '测试', url: '/dingtalk/web/APP_X/v1/form/getFormDataById.json', method: 'GET', isInit: false }
    ], meta);
    expect(r1.added).toBe(1);
    const online = schemaPush.getComponentsTree(schema)[0].dataSource.online;
    const ds = online.find(d => d.name === 'getTestOrder');
    expect(ds.dpType).toBe('REMOTE');
    expect(ds.protocal).toBe('REMOTE');
    expect(ds.type).toBe('legao');
    expect(ds.requestHandler.value).toBe('this.utils.legaoBuiltin.dataSourceHandler');
    expect(ds.options.url).toBe('/dingtalk/web/APP_X/v1/form/getFormDataById.json');
    expect(ds.dataHandler.source).toContain('this.setState({getTestOrder: data})');
    expect(ds.isInit).toBe(false);
    expect(ds.id).toMatch(/^[A-Z0-9]{39}$/);
  });

  test('同名整条替换并保留原 id', () => {
    const schema = freshSchema();
    schemaPush.applyDataSources(schema, [
      { name: 'getTestOrder', url: '/a/b.json', method: 'GET' }
    ], meta);
    const online = schemaPush.getComponentsTree(schema)[0].dataSource.online;
    const idBefore = online.find(d => d.name === 'getTestOrder').id;
    const r2 = schemaPush.applyDataSources(schema, [
      { name: 'getTestOrder', url: '/c/d.json', method: 'POST' }
    ], meta);
    expect(r2.updated).toBe(1);
    const ds = online.find(d => d.name === 'getTestOrder');
    expect(ds.id).toBe(idBefore);
    expect(ds.options.url).toBe('/c/d.json');
  });

  test('外链 url / 非法名称被拦截', () => {
    const schema = freshSchema();
    expect(() => schemaPush.applyDataSources(schema, [
      { name: 'bad', url: 'https://evil.com/api' }
    ], meta)).toThrow(/相对路径/);
    expect(() => schemaPush.applyDataSources(schema, [
      { name: '1bad name', url: '/x' }
    ], meta)).toThrow(/名称不合法/);
  });
});

describe('schema-push applyFormulas', () => {
  test('双写 props.formula 与 complexValue 并保持一致', () => {
    const schema = freshSchema();
    const r = schemaPush.applyFormulas(schema, [
      { field: 'numberField_mi759mvg', formula: '#{numberField_mhuhad5z}*#{numberField_l884dlrr}' }
    ]);
    expect(r.applied).toBe(1);
    const { component } = schemaPush.findComponent(schemaPush.getComponentsTree(schema), 'numberField_mi759mvg');
    expect(component.props.formula).toBe('#{numberField_mhuhad5z}*#{numberField_l884dlrr}');
    expect(component.props.complexValue.complexType).toBe('formula');
    expect(component.props.complexValue.formula).toBe(component.props.formula);
    // 2026-10-01 实测事故：valueType 缺失时设计器不渲染公式（默认值面板仍显示自定义空输入）
    expect(component.props.valueType).toBe('formula');
  });

  test('引用不存在字段 / FETCH 联动公式被拦截；空串清除公式', () => {
    const schema = freshSchema();
    expect(() => schemaPush.applyFormulas(schema, [
      { field: 'numberField_mi759mvg', formula: '#{numberField_notexist}+1' }
    ])).toThrow(/不存在的字段/);
    expect(() => schemaPush.applyFormulas(schema, [
      { field: 'numberField_mi759mvg', formula: 'FETCHDISTINCTDATA("FORM-X","f",false)' }
    ])).toThrow(/暂不支持 API 推送/);
    const r2 = schemaPush.applyFormulas(schema, [{ field: 'numberField_mi759mvg', formula: '' }]);
    expect(r2.cleared).toBe(1);
    const { component } = schemaPush.findComponent(schemaPush.getComponentsTree(schema), 'numberField_mi759mvg');
    expect(component.props.complexValue.complexType).toBe('custom');
    expect(component.props.formula).toBe('');
    expect(component.props.valueType).toBe('custom');
  });
});

describe('schema-push applyValidations', () => {
  test('replace 整组替换 / merge 按 type 合并 / 空数组清除 / 非法规则拦截', () => {
    const schema = freshSchema();
    // selectField_mumbv715「业务所属公司」原有 [{required}]
    const r1 = schemaPush.applyValidations(schema, [
      { field: 'selectField_mumbv715', rules: [{ type: 'required' }, { type: 'maxLength', param: '25' }] }
    ]);
    expect(r1.applied).toBe(1);
    const tree = schemaPush.getComponentsTree(schema);
    let rules = schemaPush.findComponent(tree, 'selectField_mumbv715').component.props.validation;
    expect(rules.map(x => x.type)).toEqual(['required', 'maxLength']);

    schemaPush.applyValidations(schema, [
      { field: 'selectField_mumbv715', rules: [{ type: 'min', param: '1' }], mode: 'merge' }
    ]);
    rules = schemaPush.findComponent(tree, 'selectField_mumbv715').component.props.validation;
    expect(rules.map(x => x.type)).toEqual(['required', 'maxLength', 'min']);

    schemaPush.applyValidations(schema, [{ field: 'selectField_mumbv715', rules: [] }]);
    expect(schemaPush.findComponent(tree, 'selectField_mumbv715').component.props.validation).toBeUndefined();

    expect(() => schemaPush.applyValidations(schema, [
      { field: 'selectField_mumbv715', rules: [{ foo: 1 }] }
    ])).toThrow(/校验规则不合法/);
  });
});

describe('schema-push customValidate（自定义函数校验）', () => {
  // 金标准：2026-10-01 用户在设计器手配自定义校验后保存的线上 Schema 逐字节捕获
  const GOLDEN = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'schema-push_自定义校验金标准.json'), 'utf-8'));

  test('buildCustomValidateRule 复刻金标准结构（编译包装模板逐字符对齐）', () => {
    const entry = schemaPush.buildCustomValidateRule({
      type: 'customValidate',
      code: GOLDEN.param.source,
      message: GOLDEN.message.zh_CN
    });
    expect(entry.type).toBe('customValidate');
    expect(entry.param.source).toBe(GOLDEN.param.source);
    expect(entry.param.type).toBe('js');
    expect(entry.param.error).toEqual({});
    expect(entry.message).toEqual(GOLDEN.message);
    // 设计器保存的 compiled = 模板前缀 + 设计器归一化后的 source + 模板后缀；
    // 模板前后缀必须逐字符一致，source 空白差异属设计器归一化（语义等价）
    expect(GOLDEN.param.compiled.startsWith(schemaPush.CUSTOM_VALIDATE_PREFIX)).toBe(true);
    expect(GOLDEN.param.compiled.endsWith(schemaPush.CUSTOM_VALIDATE_SUFFIX)).toBe(true);
    expect(entry.param.compiled).toBe(schemaPush.compileCustomValidate(GOLDEN.param.source));
  });

  test('applyValidations merge 追加 customValidate 保留既有规则；replace 整组替换', () => {
    const schema = freshSchema();
    const rule = { type: 'customValidate', code: GOLDEN.param.source, message: '测试提示' };
    const r1 = schemaPush.applyValidations(schema, [
      { field: 'textField_kk91ezq9', rules: [rule], mode: 'merge' }
    ]);
    expect(r1.applied).toBe(1);
    const tree = schemaPush.getComponentsTree(schema);
    let rules = schemaPush.findComponent(tree, 'textField_kk91ezq9').component.props.validation;
    // textField_kk91ezq9 原有 [{required}]，merge 后追加 customValidate
    expect(rules.map(x => x.type)).toEqual(['required', 'customValidate']);
    expect(rules[1].param.source).toBe(GOLDEN.param.source);
    expect(rules[1].message.zh_CN).toBe('测试提示');

    schemaPush.applyValidations(schema, [{ field: 'textField_kk91ezq9', rules: [rule] }]);
    rules = schemaPush.findComponent(tree, 'textField_kk91ezq9').component.props.validation;
    expect(rules.map(x => x.type)).toEqual(['customValidate']);
  });

  test('缺 code / 缺 message / 函数名不是 validateRule / 语法错误 均被拦截', () => {
    const schema = freshSchema();
    expect(() => schemaPush.applyValidations(schema, [
      { field: 'textField_kk91ezq9', rules: [{ type: 'customValidate', message: 'x' }] }
    ])).toThrow(/缺少 code/);
    expect(() => schemaPush.applyValidations(schema, [
      { field: 'textField_kk91ezq9', rules: [{ type: 'customValidate', code: GOLDEN.param.source }] }
    ])).toThrow(/缺少 message/);
    expect(() => schemaPush.applyValidations(schema, [
      { field: 'textField_kk91ezq9', rules: [{ type: 'customValidate', code: 'function check(value) { return true; }', message: 'x' }] }
    ])).toThrow(/validateRule/);
    expect(() => schemaPush.applyValidations(schema, [
      { field: 'textField_kk91ezq9', rules: [{ type: 'customValidate', code: 'function validateRule(value) { return value ===; }', message: 'x' }] }
    ])).toThrow(/语法校验未通过/);
  });

  test('verifyPushedSchema 核对 customValidate 代码与提示语落盘', () => {
    const schema = freshSchema();
    const rule = { type: 'customValidate', code: GOLDEN.param.source, message: GOLDEN.message.zh_CN };
    schemaPush.applyValidations(schema, [{ field: 'textField_kk91ezq9', rules: [rule] }]);

    const ok = schemaPush.verifyPushedSchema(schema, { validations: [{ field: 'textField_kk91ezq9', rules: [rule] }] });
    expect(ok.ok).toBe(true);

    const bad = schemaPush.verifyPushedSchema(schema, {
      validations: [{ field: 'textField_kk91ezq9', rules: [{ ...rule, code: 'function validateRule(value) { return false; }' }] }]
    });
    expect(bad.ok).toBe(false);
    expect(bad.failures.join()).toMatch(/自定义校验代码不一致/);
  });
});

describe('schema-push verifyPushedSchema', () => {
  test('已落盘项全部命中；未落盘项报失败', () => {
    const schema = freshSchema();
    schemaPush.applyBindings(schema, [
      { field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }
    ], schemaPush.extractExportNames(CODE));
    schemaPush.applyDataSources(schema, [
      { name: 'getTestOrder', url: '/c/d.json', method: 'POST' }
    ], { formUuid: 'FORM-TEST' });
    schemaPush.applyFormulas(schema, [{ field: 'numberField_mi759mvg', formula: '' }]);

    const v = schemaPush.verifyPushedSchema(schema, {
      bindings: [{ field: 'textField_kk91ezq9', event: 'onChange', fn: 'onTestChange' }],
      dataSources: [{ name: 'getTestOrder', url: '/c/d.json', method: 'POST' }],
      formulas: [{ field: 'numberField_mi759mvg', formula: '' }],
      validations: []
    });
    expect(v.ok).toBe(true);
    expect(v.failures).toEqual([]);

    const v2 = schemaPush.verifyPushedSchema(schema, {
      bindings: [{ field: 'textField_kk91ezq9', event: 'onChange', fn: 'onGhost' }],
      dataSources: [], formulas: [], validations: []
    });
    expect(v2.ok).toBe(false);
  });
});

describe('schema-push findComponent', () => {
  test('未命中时错误信息附带可用字段提示', () => {
    const schema = freshSchema();
    expect(() => schemaPush.findComponent(
      schemaPush.getComponentsTree(schema), '不存在的字段')).toThrow(/可用字段/);
  });
});

describe('schema-push loadPushConfig', () => {
  test('配置文件不存在时返回 exists:false，不抛错', () => {
    const r = schemaPush.loadPushConfig(path.join(__dirname, 'fixtures', '不存在的目录'));
    expect(r.exists).toBe(false);
  });
});
