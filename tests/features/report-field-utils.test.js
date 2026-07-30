/**
 * 技能脚本回归测试：report 技能 report-lib 核心分支
 *
 * 背景：report 技能脚本高频改动且出现过历史缺陷（cubeCode 连字符未转换、
 * selectField 缺少 _value 后缀、聚合字段 dataType 错误等）。
 * 本测试直接 require 技能脚本真实导出，锁定以下关键行为分支：
 *   - normalizeCubeCode  连字符 → 下划线
 *   - normalizeFieldCode selectField 类字段 _value 后缀补全（不重复补）
 *   - inferDataType      按 fieldCode 前缀推断 dataType
 *   - buildFieldObj      聚合强制 DOUBLE / dateField 特殊属性 / measureType
 *   - normalizeField(Array) 多种输入格式标准化
 *   - getDefaultLayout   图表默认布局与兜底
 *   - validateChartConfig 各图表类型必填字段校验
 */

'use strict';

const {
  normalizeCubeCode,
  normalizeFieldCode,
  inferDataType,
  buildFieldObj,
  normalizeField,
  normalizeFieldArray,
  getDefaultLayout,
} = require('../../.agents/skills/report/scripts/report-lib/field-utils.js');

const {
  validateChartConfig,
} = require('../../.agents/skills/report/scripts/report-lib/chart-builder.js');

describe('report 技能：field-utils 核心分支', () => {
  describe('normalizeCubeCode()', () => {
    test('formUuid 连字符转换为下划线', () => {
      expect(normalizeCubeCode('FORM-CB89B060-90324A50')).toBe('FORM_CB89B060_90324A50');
    });

    test('已是下划线格式时保持不变', () => {
      expect(normalizeCubeCode('FORM_ABC123')).toBe('FORM_ABC123');
    });

    test('空值返回空字符串', () => {
      expect(normalizeCubeCode('')).toBe('');
      expect(normalizeCubeCode(null)).toBe('');
      expect(normalizeCubeCode(undefined)).toBe('');
    });
  });

  describe('normalizeFieldCode()', () => {
    test('selectField 自动追加 _value 后缀', () => {
      expect(normalizeFieldCode('selectField_abc')).toBe('selectField_abc_value');
    });

    test('radioField/checkboxField/multiSelectField/employeeField 同样追加', () => {
      expect(normalizeFieldCode('radioField_x')).toBe('radioField_x_value');
      expect(normalizeFieldCode('checkboxField_x')).toBe('checkboxField_x_value');
      expect(normalizeFieldCode('multiSelectField_x')).toBe('multiSelectField_x_value');
      expect(normalizeFieldCode('employeeField_x')).toBe('employeeField_x_value');
    });

    test('已带 _value 后缀不重复追加', () => {
      expect(normalizeFieldCode('selectField_abc_value')).toBe('selectField_abc_value');
    });

    test('非 select 类字段保持不变', () => {
      expect(normalizeFieldCode('textField_abc')).toBe('textField_abc');
      expect(normalizeFieldCode('numberField_abc')).toBe('numberField_abc');
    });

    test('空值原样返回', () => {
      expect(normalizeFieldCode('')).toBe('');
      expect(normalizeFieldCode(undefined)).toBe(undefined);
    });
  });

  describe('inferDataType()', () => {
    test('numberField 前缀推断为 NUMBER', () => {
      expect(inferDataType('numberField_abc')).toBe('NUMBER');
    });

    test('dateField 前缀推断为 DATE', () => {
      expect(inferDataType('dateField_abc')).toBe('DATE');
    });

    test('其他前缀与空值兜底 STRING', () => {
      expect(inferDataType('textField_abc')).toBe('STRING');
      expect(inferDataType('')).toBe('STRING');
      expect(inferDataType(undefined)).toBe('STRING');
    });
  });

  describe('buildFieldObj()', () => {
    test('聚合字段（COUNT）强制 DOUBLE 并携带 measureType', () => {
      const obj = buildFieldObj('FORM_A', 'textField_x', '数量', 'alias1', 'STRING', 'COUNT', 'NONE');
      expect(obj.dataType).toBe('DOUBLE');
      expect(obj.measureType).toBe('MEASURE_ATTRIBUTE');
      expect(obj.aggregateType).toBe('COUNT');
    });

    test('维度字段（NONE）不携带 measureType，dataType 保留原值', () => {
      const obj = buildFieldObj('FORM_A', 'textField_x', '名称', 'alias1', 'STRING', 'NONE', 'NONE');
      expect(obj.dataType).toBe('STRING');
      expect(obj.measureType).toBeUndefined();
    });

    test('dateField 附加时间粒度属性且 id 加数字后缀', () => {
      const obj = buildFieldObj('FORM_A', 'dateField_x', '日期', 'alias1', 'DATE', 'NONE', 'NONE');
      expect(obj.timeGranularityType).toBe('DAY');
      expect(obj.timeFormat).toBe('yyyy-MM-dd');
      expect(obj.id).toBe('dateField_x5');
    });

    test('selectField 的 fieldCode/id 自动带 _value 后缀', () => {
      const obj = buildFieldObj('FORM_A', 'selectField_x', '状态', 'alias1', 'STRING', 'NONE', 'NONE');
      expect(obj.fieldCode).toBe('selectField_x_value');
      expect(obj.id).toBe('selectField_x_value');
    });

    test('orderBy.reference 与 fieldKey 使用 alias', () => {
      const obj = buildFieldObj('FORM_A', 'textField_x', '名称', 'myAlias', 'STRING', 'NONE', 'DESC');
      expect(obj.fieldKey).toBe('myAlias');
      expect(obj.orderBy).toEqual({ type: 'DESC', reference: 'myAlias' });
    });
  });

  describe('normalizeField() / normalizeFieldArray()', () => {
    test('字符串输入展开为完整字段对象', () => {
      expect(normalizeField('numberField_x', 'SUM')).toEqual({
        fieldCode: 'numberField_x',
        aliasName: 'numberField_x',
        dataType: 'NUMBER',
        aggregateType: 'SUM',
      });
    });

    test('对象输入缺省属性自动补全，别名回退 label', () => {
      const r = normalizeField({ fieldCode: 'dateField_x', label: '创建日期' });
      expect(r.aliasName).toBe('创建日期');
      expect(r.dataType).toBe('DATE');
      expect(r.aggregateType).toBe('NONE');
    });

    test('对象已有属性优先于默认值', () => {
      const r = normalizeField({ fieldCode: 'textField_x', aliasName: '名称', aggregateType: 'COUNT' }, 'NONE');
      expect(r.aliasName).toBe('名称');
      expect(r.aggregateType).toBe('COUNT');
    });

    test('非法输入兜底为空字段对象', () => {
      expect(normalizeField(null)).toEqual({
        fieldCode: '', aliasName: '', dataType: 'STRING', aggregateType: 'NONE',
      });
    });

    test('normalizeFieldArray 支持 undefined/单对象/数组', () => {
      expect(normalizeFieldArray(undefined)).toEqual([]);
      expect(normalizeFieldArray('textField_x')).toHaveLength(1);
      expect(normalizeFieldArray(['textField_a', { fieldCode: 'numberField_b' }], 'SUM')).toHaveLength(2);
    });
  });

  describe('getDefaultLayout()', () => {
    test('已知图表类型返回预设布局', () => {
      expect(getDefaultLayout('table')).toEqual({ w: 6, h: 38 });
      expect(getDefaultLayout('indicator')).toEqual({ w: 6, h: 6 });
    });

    test('未知类型兜底 { w: 3, h: 22 }', () => {
      expect(getDefaultLayout('unknown-chart')).toEqual({ w: 3, h: 22 });
      expect(getDefaultLayout(undefined)).toEqual({ w: 3, h: 22 });
    });
  });
});

describe('report 技能：validateChartConfig 校验分支', () => {
  // warn() 通过 console.error 输出，静默避免测试日志噪音
  let errSpy;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  test('bar 图配置完整时校验通过', () => {
    expect(validateChartConfig({
      type: 'bar', title: '统计', cubeCode: 'FORM_A', xField: 'textField_x', yField: 'numberField_y',
    }, 0)).toBe(true);
  });

  test('缺少 cubeCode 校验失败', () => {
    expect(validateChartConfig({ type: 'bar', xField: 'a', yField: 'b' }, 0)).toBe(false);
  });

  test('bar/line/pie 缺少 xField 和 yField 校验失败', () => {
    expect(validateChartConfig({ type: 'pie', cubeCode: 'FORM_A' }, 0)).toBe(false);
  });

  test('table 缺少列定义校验失败，提供 columns 通过', () => {
    expect(validateChartConfig({ type: 'table', cubeCode: 'FORM_A' }, 0)).toBe(false);
    expect(validateChartConfig({ type: 'table', cubeCode: 'FORM_A', columns: ['textField_x'] }, 0)).toBe(true);
  });

  test('indicator 缺少 kpi 字段校验失败', () => {
    expect(validateChartConfig({ type: 'indicator', cubeCode: 'FORM_A' }, 0)).toBe(false);
    expect(validateChartConfig({ type: 'indicator', cubeCode: 'FORM_A', kpiField: 'numberField_x' }, 0)).toBe(true);
  });

  test('combo 缺少纵轴字段校验失败', () => {
    expect(validateChartConfig({ type: 'combo', cubeCode: 'FORM_A', xField: 'a' }, 0)).toBe(false);
    expect(validateChartConfig({ type: 'combo', cubeCode: 'FORM_A', xField: 'a', leftYFields: ['b'] }, 0)).toBe(true);
  });

  test('gauge 缺少数值字段校验失败', () => {
    expect(validateChartConfig({ type: 'gauge', cubeCode: 'FORM_A' }, 0)).toBe(false);
    expect(validateChartConfig({ type: 'gauge', cubeCode: 'FORM_A', valueField: 'numberField_x' }, 0)).toBe(true);
  });
});
