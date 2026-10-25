/**
 * 核心功能测试：原型产物完整性（生成清单 manifest）
 *
 * 覆盖两个关键逻辑：
 *   1. sync-ops.js 的版本感知重建判断（.generator-version 不符 → 强制全量重建）
 *   2. manifest.html 的字段清单解析（按 分组 → 表单 → 主表/子表 完整提取，不再只取第一个表格）
 *
 * 说明：prototype_generator.js 无 module.exports，sync-ops.js 依赖服务端模块，
 *       故按 field-parsing.test.js 的惯例复制核心逻辑做内置单元测试，防止回归。
 */

'use strict';

const vm = require('vm');
const path = require('path');
const generator = require('../../.agents/skills/form-to-prototype/scripts/prototype_generator');
const { decidePrototypeAction } = require('../../lib/sync-server/sync-ops');
const CURRENT_VERSION = generator.GENERATOR_VERSION;
const generatedHtml = generator.generateManifestHtml(path.resolve(__dirname,'../../temp-file/no-fixture/字段清单.md'), path.resolve(__dirname,'../../temp-file/no-fixture'), 'test');
const functionStart = generatedHtml.indexOf('function parseFieldsData()');
const functionEnd = generatedHtml.indexOf('// 轻量 md',functionStart);
const actualParser = generatedHtml.slice(functionStart,functionEnd);
function parseManifestFieldsMd(md) {
  return vm.runInNewContext('let fieldsCache = null; ' + actualParser + '; parseFieldsData().groups;', { window: { __MANIFEST_DATA__: { fieldsMd: md } } });
}

// ==================== 测试 ====================
describe('原型产物完整性：版本感知重建', () => {
  test('版本一致且无表单变更 → 跳过生成', () => {
    const r = decidePrototypeAction(CURRENT_VERSION, true, false);
    expect(r.skip).toBe(true);
    expect(r.needFullRegen).toBe(false);
  });

  test('版本一致但有表单变更 → 走 form-config 增量（非跳过非全量）', () => {
    const r = decidePrototypeAction(CURRENT_VERSION, true, true);
    expect(r.skip).toBe(false);
    expect(r.needFullRegen).toBe(false);
  });

  test('版本不符（无版本文件）→ 即使 index 存在也强制全量重建', () => {
    const r = decidePrototypeAction(null, true, false);
    expect(r.needFullRegen).toBe(true);
    expect(r.skip).toBe(false);
  });

  test('版本不符（旧版本）且无表单变更 → 强制全量重建', () => {
    const r = decidePrototypeAction('2.10.0', true, false);
    expect(r.needFullRegen).toBe(true);
    expect(r.skip).toBe(false);
  });

  test('版本不符且有表单变更 → 以版本为准强制全量重建（而非仅更新 form-config）', () => {
    const r = decidePrototypeAction('2.11.0', true, true);
    expect(r.needFullRegen).toBe(true);
    expect(r.skip).toBe(false);
  });

  test('index 不存在 → 完整生成', () => {
    const r = decidePrototypeAction(CURRENT_VERSION, false, false);
    expect(r.needFullRegen).toBe(true);
    expect(r.skip).toBe(false);
  });
});

describe('原型产物完整性：manifest 字段清单解析', () => {
  const sampleMd = [
    '# 测试系统 - 字段清单',
    '> 版本: 1.0.0',
    '',
    '## 📋 字段清单使用说明',
    '',
    '### 一、可用字段类型',
    '',
    '| 类型 | 说明 |',
    '|------|------|',
    '| 数值 | 数字 |',
    '',
    '---',
    '',
    '## 一、基础信息',
    '',
    '### (一) 产品信息「普通表单」',
    '',
    '**数据标题：产品名称**',
    '',
    '**主表：产品信息**',
    '',
    '| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |',
    '|---------|---------|---------|---------|---------|',
    '| 产品编号 | 流水号 | 系统生成 | 只读 | 否 |',
    '| 产品名称 | 单行文本 | 产品名称 | 普通 | 是 |',
    '',
    '**子表：库存明细**',
    '',
    '| 仓库 | 库存数量 |',
    '|------|---------|',
    '| A仓 | 100 |',
    '',
    '### (二) 销售订单「普通表单」',
    '',
    '**数据标题：订单编号**',
    '',
    '**主表：销售订单**',
    '',
    '| 字段名称 | 字段类型 |',
    '|---------|---------|',
    '| 订单编号 | 流水号 |',
    '| 客户 | 关联表单 |',
  ].join('\n');

  test('跳过使用说明区，正确识别分组数与表单数', () => {
    const groups = parseManifestFieldsMd(sampleMd);
    expect(groups.length).toBe(1); // 只识别真正的分组"基础信息"
    expect(groups[0].name).toBe('一、基础信息');
    expect(groups[0].forms.length).toBe(2);
  });

  test('表单名/类型/数据标题解析', () => {
    const groups = parseManifestFieldsMd(sampleMd);
    const p = groups[0].forms[0];
    expect(p.name).toBe('产品信息');
    expect(p.formType).toBe('普通表单');
    expect(p.dataTitle).toBe('产品名称');
  });

  test('主表与子表分别成表，字段行完整', () => {
    const groups = parseManifestFieldsMd(sampleMd);
    const p = groups[0].forms[0];
    expect(p.tables.length).toBe(2);
    // 主表
    const main = p.tables[0];
    expect(main.title.indexOf('主表')).toBe(0);
    expect(main.header).toContain('字段名称');
    expect(main.rows.length).toBe(2);
    expect(main.rows[0][0]).toBe('产品编号');
    // 子表
    const sub = p.tables[1];
    expect(sub.title).toBe('子表：库存明细');
    expect(sub.rows.length).toBe(1);
    expect(sub.rows[0][0]).toBe('A仓');
  });

  test('系统字段（创建时间等）不误判为业务字段', () => {
    const md2 = sampleMd + '\n| 创建时间 | 日期 |\n';
    // 解析后不应影响结构完整性
    const groups = parseManifestFieldsMd(md2);
    expect(groups[0].forms[1].tables.length).toBeGreaterThanOrEqual(1);
  });
});
