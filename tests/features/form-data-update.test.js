/**
 * form-data-update 护栏纯逻辑库离线单测
 * 对应《Skill体系优化方案_20261029.md》第六节验收用例（可离线模拟的部分）：
 *   ① 子表 > 50 行整表回写不丢行   ② 关联表单字段数组防护
 *   ③ 下拉选项值与显示值不一致     ⑤ 主表+子表混合更新
 *   （④ 服务端校验拦截为 CLI 网络层行为，走线上验收清单）
 * 运行: npx jest tests/features/form-data-update.test.js
 */

'use strict';

const lib = require('../../.agents/skills/form-data-update/scripts/fdu_lib.js');

// —— 测试工具：模拟"服务端按 payload 语义写入后的回读结果"（与写入管线同构） ——
function simulateAfter(before, payload, mutate) {
  const after = { main: lib.deepClone(before.main || {}), tables: lib.deepClone(before.tables || {}) };
  for (const [k, v] of Object.entries(payload)) {
    if (lib.isTableField(k)) after.tables[k] = lib.deepClone(v);
    else after.main[k] = lib.deepClone(v);
  }
  if (mutate) mutate(after);
  return after;
}

function buildBigTable(rowCount) {
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push({ rowId: `ROW-${String(i).padStart(3, '0')}`, textField_name: `商品${i}`, numberField_qty: i + 1 });
  }
  return rows;
}

// ============ parseInstValue（防护 1：读取形态） ============
describe('parseInstValue 兼容三种 instValue 形态', () => {
  test('数组形态 [{fieldId, fieldData:{value}}]', () => {
    const r = lib.parseInstValue([
      { fieldId: 'textField_a', fieldData: { value: 'x' } },
      { fieldId: 'tableField_t', fieldData: { value: [{ rowId: 'R1' }] } },
    ]);
    expect(r.main.textField_a).toBe('x');
    expect(r.tables.tableField_t).toEqual([{ rowId: 'R1' }]);
  });
  test('JSON 字符串形态', () => {
    const r = lib.parseInstValue(JSON.stringify({ textField_a: 'y' }));
    expect(r.main.textField_a).toBe('y');
  });
  test('instValue 缺失时仅允许 formData 兜底主表键（子表禁止 —— 防 50 行截断）', () => {
    const r = lib.parseInstValue(undefined, { textField_a: 'z', tableField_t: [{ rowId: 'FAKE' }] });
    expect(r.main.textField_a).toBe('z');
    expect(r.tables.tableField_t).toBeUndefined();
  });
});

// ============ 值规范化 ============
describe('normalizeAssociationValue 关联字段必须数组（2026-10-29 坑 2）', () => {
  test('合法数组通过', () => {
    const v = lib.normalizeAssociationValue('associationFormField_a', [{ instanceId: 'FINST-1', title: '甲' }]);
    expect(v).toEqual([{ instanceId: 'FINST-1', title: '甲' }]);
  });
  test('字符串化 JSON 数组自动解包', () => {
    const v = lib.normalizeAssociationValue('associationFormField_a', '[{"instanceId":"FINST-1","title":"甲"}]');
    expect(v).toEqual([{ instanceId: 'FINST-1', title: '甲' }]);
  });
  test('普通字符串 → 中止（写入会清空关联）', () => {
    expect(() => lib.normalizeAssociationValue('associationFormField_a', 'FINST-1')).toThrow(/清空/);
  });
  test('数组项缺 instanceId → 中止', () => {
    expect(() => lib.normalizeAssociationValue('associationFormField_a', [{ title: '甲' }])).toThrow(/instanceId/);
  });
});

describe('normalizeDateValue / normalizeNumberValue', () => {
  test('日期字符串转 13 位毫秒时间戳', () => {
    const ts = lib.normalizeDateValue('dateField_d', '2026-10-29');
    expect(String(ts).length).toBe(13);
  });
  test('非法日期字符串中止', () => {
    expect(() => lib.normalizeDateValue('dateField_d', '昨天')).toThrow(/日期格式错误/);
  });
  test('数字字符串自动转 Number，非数字中止', () => {
    expect(lib.normalizeNumberValue('numberField_n', '12.5')).toBe(12.5);
    expect(() => lib.normalizeNumberValue('numberField_n', '十二')).toThrow(/数字格式错误/);
  });
});

describe('normalizeSelectValue 下拉实际值/显示值（验收用例 3）', () => {
  const ctx = { selectField_s: '选项一', selectField_s_id: 'opt_001' };
  test('值未变 → 写快照 _id 实际值，标记 wrote:_id', () => {
    const r = lib.normalizeSelectValue('selectField_s', '选项一', ctx);
    expect(r).toEqual({ value: 'opt_001', wrote: '_id' });
  });
  test('新显示值 → 透传并标记 wrote:display（镜像交服务端重算）', () => {
    const r = lib.normalizeSelectValue('selectField_s', '选项二', ctx);
    expect(r).toEqual({ value: '选项二', wrote: 'display' });
  });
  test('快照无 _id 镜像 → raw 透传', () => {
    expect(lib.normalizeSelectValue('selectField_s', '选项一', {})).toEqual({ value: '选项一', wrote: 'raw' });
  });
});

// ============ changes 守卫 ============
describe('sortAndGuardChanges 形态守卫', () => {
  test('空 changes 中止', () => {
    expect(() => lib.sortAndGuardChanges({})).toThrow(/changes 必须是非空对象/);
  });
  test('主表+子表正确分拣', () => {
    const r = lib.sortAndGuardChanges({
      numberField_a: 1,
      tableField_t: [{ rowId: 'R1', numberField_q: 2 }],
    });
    expect(r.main).toEqual({ numberField_a: 1 });
    expect(r.tables.tableField_t).toEqual([{ rowId: 'R1', cols: { numberField_q: 2 } }]);
  });
  test('子表行缺 rowId 中止', () => {
    expect(() => lib.sortAndGuardChanges({ tableField_t: [{ numberField_q: 2 }] })).toThrow(/rowId/);
  });
  test('复杂控件列中止', () => {
    expect(() => lib.sortAndGuardChanges({ attachmentField_a: ['x'] })).toThrow(/复杂控件不支持/);
    expect(() => lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'R1', photoField_p: ['x'] }] })).toThrow(/复杂控件不支持/);
  });
  test('禁止直接传 _id 镜像键', () => {
    expect(() => lib.sortAndGuardChanges({ selectField_s_id: 'x' })).toThrow(/_id 镜像键/);
  });
  test('子表键值不是非空数组中止', () => {
    expect(() => lib.sortAndGuardChanges({ tableField_t: {} })).toThrow(/非空数组/);
  });
});

describe('guardComplexFieldsOnFullRewrite 整表回写前复杂控件守卫（防护 2）', () => {
  const before = { main: {}, tables: { tableField_t: [{ rowId: 'R1', attachmentField_att: [{ name: 'a.pdf' }] }] } };
  test('未改行含非空附件列 → 中止', () => {
    const sorted = lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'R1', numberField_q: 9 }] });
    expect(() => lib.guardComplexFieldsOnFullRewrite(before, sorted)).toThrow(/复杂控件中止/);
  });
  test('附件列为空 → 放行', () => {
    const before2 = { main: {}, tables: { tableField_t: [{ rowId: 'R1', attachmentField_att: '' }] } };
    const sorted = lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'R1', numberField_q: 9 }] });
    expect(() => lib.guardComplexFieldsOnFullRewrite(before2, sorted)).not.toThrow();
  });
});

// ============ buildUpdatePayload（防护 2/3 组装） ============
describe('buildUpdatePayload 整表回写与行补 rowId', () => {
  const before = {
    main: { textField_m: '旧', numberField_c: 5 },
    tables: { tableField_t: buildBigTable(60) }, // 验收用例 ①：>50 行
  };
  const sorted = lib.sortAndGuardChanges({
    numberField_c: 10,
    tableField_t: [{ rowId: 'ROW-010', numberField_qty: 999 }],
  });

  test('主表只含目标字段；子表整表 60 行全量回写', () => {
    const { payload } = lib.buildUpdatePayload(before, sorted);
    expect(Object.keys(payload).sort()).toEqual(['numberField_c', 'tableField_t']);
    expect(payload.tableField_t.length).toBe(60);
  });
  test('改动行 merge 且带 rowId，未改行原样保真', () => {
    const { payload } = lib.buildUpdatePayload(before, sorted);
    const touched = payload.tableField_t.find(r => r.rowId === 'ROW-010');
    expect(touched.numberField_qty).toBe(999);
    expect(touched.textField_name).toBe('商品10');
    const untouched = payload.tableField_t.find(r => r.rowId === 'ROW-000');
    expect(untouched).toEqual(before.tables.tableField_t[0]);
  });
  test('写前快照值不被污染（深拷贝隔离）', () => {
    const beforeCopy = lib.deepClone(before);
    lib.buildUpdatePayload(before, sorted);
    expect(before).toEqual(beforeCopy);
  });
  test('目标 rowId 不存在 → 中止（不支持新增行）', () => {
    const bad = lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'NOPE', numberField_qty: 1 }] });
    expect(() => lib.buildUpdatePayload(before, bad)).toThrow(/rowId 不存在/);
  });
  test('快照行缺 rowId → 中止（宁可失败不可丢行标识）', () => {
    const noRowId = { main: {}, tables: { tableField_t: [{ textField_x: 'a' }] } };
    const s = lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'x', textField_x: 'b' }] });
    expect(() => lib.buildUpdatePayload(noRowId, s)).toThrow(/rowId 缺失/);
  });
  test('行内下拉未变 → 写行内 _id 实际值', () => {
    const b = { main: {}, tables: { tableField_t: [{ rowId: 'R1', selectField_s: '选项一', selectField_s_id: 'opt_001' }] } };
    const s = lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'R1', selectField_s: '选项一' }] });
    const { payload, meta } = lib.buildUpdatePayload(b, s);
    expect(payload.tableField_t[0].selectField_s).toBe('opt_001');
    expect(meta.tableWrites.tableField_t.R1.selectField_s.wrote).toBe('_id');
  });
  test('产出台账条目（旧值/新值）', () => {
    const { ledgerEntries } = lib.buildUpdatePayload(before, sorted);
    const mainEntry = ledgerEntries.find(e => e.target === 'numberField_c');
    expect(mainEntry.oldValue).toBe(5);
    expect(mainEntry.newValue).toBe(10);
  });
});

// ============ assertAfterWrite（防护 5 逐字段断言） ============
describe('assertAfterWrite 逐字段断言', () => {
  const before = {
    main: {
      textField_m: '旧文本',
      selectField_s: '选项一', selectField_s_id: 'opt_001',
      numberField_c: 5,
      associationFormField_a: [{ instanceId: 'FINST-9', title: '关联单' }],
    },
    tables: { tableField_t: buildBigTable(3) },
  };

  test('场景：写入成功且无任何意外 → ok', () => {
    const sorted = lib.sortAndGuardChanges({ numberField_c: 10, tableField_t: [{ rowId: 'ROW-001', numberField_qty: 42 }] });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(true);
  });

  test('场景：目标字段写歪（服务端未按预期落值）→ target-mismatch', () => {
    const sorted = lib.sortAndGuardChanges({ numberField_c: 10 });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    after.main.numberField_c = 11;
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(false);
    expect(v.diffs[0].kind).toBe('target-mismatch');
  });

  test('场景：非目标字段被意外改动 → unexpected-change（一字不差）', () => {
    const sorted = lib.sortAndGuardChanges({ numberField_c: 10 });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    after.main.textField_m = '被别人改了';
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(false);
    expect(v.diffs.some(d => d.kind === 'unexpected-change' && d.path === 'main.textField_m')).toBe(true);
  });

  test('场景：非目标子表整表行数被动 → unexpected-change', () => {
    const sorted = lib.sortAndGuardChanges({ numberField_c: 10 });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    after.tables.tableField_t.pop();
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(false);
    expect(v.diffs[0].path).toBe('tables.tableField_t');
  });

  test('场景：键丢失/键新增 → key-lost / key-added', () => {
    const sorted = lib.sortAndGuardChanges({ numberField_c: 10 });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    delete after.main.textField_m;
    after.main.strayField = 'x';
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.diffs.some(d => d.kind === 'key-lost' && d.path === 'main.textField_m')).toBe(true);
    expect(v.diffs.some(d => d.kind === 'key-added' && d.path === 'main.strayField')).toBe(true);
  });

  test('验收用例③：下拉实际值写回，显示值被服务端重算 → warning 而非 diff；镜像键严格断言', () => {
    const sorted = lib.sortAndGuardChanges({ selectField_s: '选项一' }); // 值未变
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    expect(payload.selectField_s).toBe('opt_001'); // 实际写入的是实际值
    const after = simulateAfter(before, payload);
    after.main.selectField_s = '选项一（服务端重算）'; // 显示串重算
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBe(1);
    expect(v.diffs.length).toBe(0);
  });

  test('验收用例③变体：下拉写新显示值，_id 镜像重算 → warning 而非 diff', () => {
    const sorted = lib.sortAndGuardChanges({ selectField_s: '选项三' });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    after.main.selectField_s_id = 'opt_003'; // 服务端按显示值解析出的新实际值
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBe(1);
  });

  test('镜像键如果对不上（服务端行为异常）仍要 fail', () => {
    const sorted = lib.sortAndGuardChanges({ selectField_s: '选项一' });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    after.main.selectField_s_id = 'opt_污染';
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(false);
    expect(v.diffs[0].kind).toBe('target-mismatch');
  });

  test('验收用例②：关联字段数组写入后主键与镜像均严格比对', () => {
    const sorted = lib.sortAndGuardChanges({ associationFormField_a: [{ instanceId: 'FINST-8', title: '新关联' }] });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    expect(Array.isArray(payload.associationFormField_a)).toBe(true);
    const after = simulateAfter(before, payload);
    expect(lib.assertAfterWrite(before, after, payload, meta).ok).toBe(true);
    const after2 = simulateAfter(before, payload);
    after2.main.associationFormField_a = []; // 被清空 = 事故复现
    const v2 = lib.assertAfterWrite(before, after2, payload, meta);
    expect(v2.ok).toBe(false);
    expect(v2.diffs[0].kind).toBe('target-mismatch');
  });

  test('验收用例⑤：主表+子表混合更新，行数 3 行全量对齐', () => {
    const sorted = lib.sortAndGuardChanges({
      numberField_c: 10,
      tableField_t: [{ rowId: 'ROW-000', numberField_qty: 100 }, { rowId: 'ROW-002', textField_name: '改尾行' }],
    });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const after = simulateAfter(before, payload);
    const v = lib.assertAfterWrite(before, after, payload, meta);
    expect(v.ok).toBe(true);
    expect(after.tables.tableField_t.length).toBe(3);
  });

  test('验收用例①：子表 60 行整表回写，断言按 rowId 对齐不误报', () => {
    const before60 = { main: {}, tables: { tableField_t: buildBigTable(60) } };
    const sorted = lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'ROW-059', numberField_qty: 12345 }] });
    const { payload, meta } = lib.buildUpdatePayload(before60, sorted);
    const after = simulateAfter(before60, payload);
    // 模拟服务端回读行序打乱（按 rowId 对齐后仍应通过）
    after.tables.tableField_t.reverse();
    const v = lib.assertAfterWrite(before60, after, payload, meta);
    expect(v.ok).toBe(true);
    expect(after.tables.tableField_t.length).toBe(60);
  });

  test('写入后行数与载荷不一致 → row-count-mismatch', () => {
    const before3 = { main: {}, tables: { tableField_t: buildBigTable(3) } };
    const sorted = lib.sortAndGuardChanges({ tableField_t: [{ rowId: 'ROW-001', numberField_qty: 1 }] });
    const { payload, meta } = lib.buildUpdatePayload(before3, sorted);
    const after = simulateAfter(before3, payload);
    after.tables.tableField_t.pop(); // 丢了一行（截断事故复现）
    const v = lib.assertAfterWrite(before3, after, payload, meta);
    expect(v.ok).toBe(false);
    expect(v.diffs[0].kind).toBe('row-count-mismatch');
  });
});

// ============ assertSubRowCount（防护 1 交叉校验） ============
describe('assertSubRowCount totalCount 交叉校验', () => {
  test('累积行数 ≠ totalCount → 中止', () => {
    expect(() => lib.assertSubRowCount(buildBigTable(50), 171, 'tableField_t')).toThrow(/子表行数不一致/);
  });
  test('相等 → 通过', () => {
    expect(() => lib.assertSubRowCount(buildBigTable(171), 171, 'tableField_t')).not.toThrow();
  });
});

// ============ buildRollbackPayload（防护 6） ============
describe('buildRollbackPayload 反向回填计划', () => {
  test('恢复主表旧值与子表全量行', () => {
    const before = {
      main: { numberField_c: 5 },
      tables: { tableField_t: [{ rowId: 'R1', numberField_q: 1 }] },
    };
    const sorted = lib.sortAndGuardChanges({ numberField_c: 10, tableField_t: [{ rowId: 'R1', numberField_q: 2 }] });
    const { payload } = lib.buildUpdatePayload(before, sorted);
    const rb = lib.buildRollbackPayload(before, payload);
    expect(rb.payload.numberField_c).toBe(5);
    expect(rb.payload.tableField_t).toEqual([{ rowId: 'R1', numberField_q: 1 }]);
    expect(rb.touched).toBe(2);
  });
  test('回滚载荷走同一断言管线应通过（自洽性）', () => {
    const before = { main: { numberField_c: 5 }, tables: { tableField_t: buildBigTable(2) } };
    const sorted = lib.sortAndGuardChanges({ numberField_c: 10, tableField_t: [{ rowId: 'ROW-000', numberField_qty: 77 }] });
    const { payload, meta } = lib.buildUpdatePayload(before, sorted);
    const rb = lib.buildRollbackPayload(before, payload, meta);
    const after = simulateAfter(before, rb.payload); // 回滚写入成功后的世界 == 写前快照
    const v = lib.assertAfterWrite(before, after, rb.payload, rb.meta);
    expect(v.ok).toBe(true);
  });
});
