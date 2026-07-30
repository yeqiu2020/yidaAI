/**
 * 回归测试：v2.20.0 validateAssociationTargets（FORM-TEMP占位符根因修复）
 *
 * 背景：进销存3事故——字段清单中"被填充的只读关联字段"说明列只写"-"，
 * 导致 associationForm 缺失 → schema_builder 静默兜底生成 FORM-TEMP 占位符 →
 * 线上点击关联字段"新增"报"表单不存在"。详见 references/faq.md 问题14。
 *
 * 运行方式：node .agents/skills/form_creator/tests/test_validate_assoc.js
 * 修改 create_from_markdown.js 关联字段解析/校验逻辑后必须重跑本测试。
 *
 * 场景1（事故复刻）：被填充只读关联字段说明列为"-" → 应按字段名推断补全，且拓扑排序正确
 * 场景2：无法推断（字段名与任何表单名不沾边） → 应中止（process.exit(1)）并输出修复指引
 * 场景3：说明列有"关联-->目标表"标记 → 正常通过，不产生推断告警
 */
const path = require('path');
const mod = require(path.resolve(__dirname, '../scripts/create_from_markdown.js'));
const { parseMarkdown, convertFormToConfig, validateAssociationTargets, topologicalSort } = mod;

// ============ 场景1：事故复刻——说明列"-"，应推断成功 ============
const md1 = `# 测试系统

## 一、基础信息

### (1) 供应商信息「普通表单」

| 字段名称 | 字段类型 | 说明 | 状态 | 必填 |
|---------|---------|------|------|------|
| 供应商名称 | 单行文本 | - | 正常 | 是 |

## 二、采购管理

### (2) 采购入库「流程表单」

| 字段名称 | 字段类型 | 说明 | 状态 | 必填 |
|---------|---------|------|------|------|
| 选择采购订单 | 关联表单 | 关联-->采购订单；填充：关联供应商=供应商 | 正常 | 是 |
| 关联供应商 | 关联表单 | - | 只读 | 否 |

### (3) 采购订单「流程表单」

| 字段名称 | 字段类型 | 说明 | 状态 | 必填 |
|---------|---------|------|------|------|
| 采购订单号 | 流水号 | 前缀:CG | 正常 | 否 |
| 供应商 | 关联表单 | 关联-->供应商信息 | 正常 | 是 |
`;

console.log('========== 场景1：说明列"-"，按字段名推断 ==========');
const info1 = parseMarkdown(md1);
let configs1 = info1.forms.map(convertFormToConfig);
validateAssociationTargets(configs1);
const rukuForm = configs1.find(c => c.formName === '采购入库');
const assocSupplier = rukuForm.fields.find(f => f.label === '关联供应商');
if (assocSupplier.associationForm === '供应商信息') {
  console.log('✅ 场景1通过：关联供应商 → 推断目标表 = 供应商信息');
} else {
  console.error(`❌ 场景1失败：关联供应商.associationForm = ${assocSupplier.associationForm}`);
  process.exit(1);
}
// 推断补全后应能参与拓扑排序：供应商信息必须排在采购入库之前
const sorted1 = topologicalSort(configs1);
const order = sorted1.map(c => c.formName);
if (order.indexOf('供应商信息') < order.indexOf('采购入库')) {
  console.log(`✅ 场景1拓扑排序正确：${order.join(' → ')}`);
} else {
  console.error(`❌ 场景1拓扑排序错误：${order.join(' → ')}`);
  process.exit(1);
}

// ============ 场景3：全部有标记，正常通过 ============
console.log('\n========== 场景3：说明列标记完整，直接通过 ==========');
const md3 = md1.replace('| 关联供应商 | 关联表单 | - | 只读 | 否 |', '| 关联供应商 | 关联表单 | 关联-->供应商信息 | 只读 | 否 |');
const configs3 = parseMarkdown(md3).forms.map(convertFormToConfig);
validateAssociationTargets(configs3);
console.log('✅ 场景3通过：无告警无中止');

// ============ 场景2：无法推断，应 exit(1)（放最后，子进程验证） ============
console.log('\n========== 场景2：无法推断目标表，应中止 ==========');
const { spawnSync } = require('child_process');
const md2 = md1.replace('| 关联供应商 | 关联表单 | - | 只读 | 否 |', '| 神秘字段 | 关联表单 | - | 只读 | 否 |');
const childScript = `
const path = require('path');
const mod = require(${JSON.stringify(path.resolve(__dirname, '../scripts/create_from_markdown.js'))});
const info = mod.parseMarkdown(${JSON.stringify(md2)});
const configs = info.forms.map(mod.convertFormToConfig);
mod.validateAssociationTargets(configs);
console.log('NOT-REACHED');
`;
const r = spawnSync(process.execPath, ['-e', childScript], { encoding: 'utf8' });
if (r.status === 1 && !String(r.stdout).includes('NOT-REACHED') && String(r.stderr + r.stdout).includes('建表前校验失败')) {
  console.log('✅ 场景2通过：无法推断时以退出码1中止，且输出修复指引');
} else {
  console.error(`❌ 场景2失败：exit=${r.status}\nstdout=${r.stdout}\nstderr=${r.stderr}`);
  process.exit(1);
}

console.log('\n🎉 全部3个场景测试通过');
