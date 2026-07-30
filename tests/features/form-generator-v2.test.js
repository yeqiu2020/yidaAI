/**
 * 技能脚本回归测试：form_creator 技能 form_generator_v2 核心分支
 *
 * 背景：form_creator 技能脚本高频改动且出现过历史缺陷（公式 marks 位置错位、
 * 零宽空格包裹缺失、占位符替换不全等）。
 * 本测试直接 require 技能脚本真实导出，锁定以下关键行为分支：
 *   - wrapWithZeroWidthSpace     字段名零宽空格包裹
 *   - calculateFormulaMarks      marks 位置计算（多次出现/排序/无匹配）
 *   - validateMarks              marks 位置回验（正确/错位/未知字段）
 *   - replaceFormulaPlaceholders 占位符全局替换 + 与 marks 计算的闭环
 *   - generateFieldId            字段ID前缀小驼峰且唯一
 *   - FieldTemplates             字段状态 → behavior 映射
 *   - FormGeneratorV2            不支持的字段类型抛错
 */

'use strict';

const {
  FormGeneratorV2,
  FieldTemplates,
  generateFieldId,
  wrapWithZeroWidthSpace,
  calculateFormulaMarks,
  validateMarks,
  replaceFormulaPlaceholders,
} = require('../../.agents/skills/form_creator/scripts/form_generator_v2.js');

const ZWSP = '\u200B';

describe('form_creator 技能：公式 marks 核心分支', () => {
  // validateMarks/generateField 通过 console 输出过程日志，静默避免噪音
  let logSpy, errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  describe('wrapWithZeroWidthSpace()', () => {
    test('字段名前后包裹零宽空格 \\u200B', () => {
      expect(wrapWithZeroWidthSpace('总价')).toBe(`${ZWSP}总价${ZWSP}`);
    });
  });

  describe('calculateFormulaMarks()', () => {
    const fields = [
      { label: '单价', fieldId: 'numberField_price' },
      { label: '数量', fieldId: 'numberField_qty' },
    ];

    test('单个字段引用：from/to/fieldId 正确', () => {
      const text = `MULTIPLY(${ZWSP}单价${ZWSP},2)`;
      const marks = calculateFormulaMarks(text, fields);
      expect(marks).toHaveLength(1);
      expect(marks[0].fieldId).toBe('numberField_price');
      expect(text.substring(marks[0].from, marks[0].to)).toBe(`${ZWSP}单价${ZWSP}`);
    });

    test('多字段多次出现：全部命中且按 from 升序排列', () => {
      const text = `SUM(${ZWSP}单价${ZWSP},${ZWSP}数量${ZWSP},${ZWSP}单价${ZWSP})`;
      const marks = calculateFormulaMarks(text, fields);
      expect(marks).toHaveLength(3);
      for (let i = 1; i < marks.length; i++) {
        expect(marks[i].from).toBeGreaterThan(marks[i - 1].from);
      }
      expect(marks.filter((m) => m.fieldId === 'numberField_price')).toHaveLength(2);
    });

    test('未包裹零宽空格的字段名不产生 marks', () => {
      const marks = calculateFormulaMarks('MULTIPLY(单价,数量)', fields);
      expect(marks).toEqual([]);
    });

    test('空字段列表返回空数组', () => {
      const marks = calculateFormulaMarks(`${ZWSP}单价${ZWSP}`, []);
      expect(marks).toEqual([]);
    });
  });

  describe('validateMarks()', () => {
    const fields = [{ label: '单价', fieldId: 'numberField_price' }];
    const text = `MULTIPLY(${ZWSP}单价${ZWSP},2)`;

    test('由 calculateFormulaMarks 生成的 marks 验证通过', () => {
      const marks = calculateFormulaMarks(text, fields);
      expect(validateMarks(text, marks, fields)).toBe(true);
    });

    test('位置错位的 mark 验证失败', () => {
      const marks = calculateFormulaMarks(text, fields);
      const shifted = [{ ...marks[0], from: marks[0].from + 1, to: marks[0].to + 1 }];
      expect(validateMarks(text, shifted, fields)).toBe(false);
    });

    test('未知 fieldId 验证失败', () => {
      const marks = [{ from: 0, to: 4, fieldId: 'numberField_unknown', fieldName: '单价' }];
      expect(validateMarks(text, marks, fields)).toBe(false);
    });
  });

  describe('replaceFormulaPlaceholders()', () => {
    const fields = [
      { label: '单价', fieldId: 'numberField_price' },
      { label: '数量', fieldId: 'numberField_qty' },
    ];

    test('占位符替换为零宽空格包裹的字段名', () => {
      const result = replaceFormulaPlaceholders('MULTIPLY({单价},{数量})', fields);
      expect(result).toBe(`MULTIPLY(${ZWSP}单价${ZWSP},${ZWSP}数量${ZWSP})`);
    });

    test('同一占位符多次出现全部替换', () => {
      const result = replaceFormulaPlaceholders('SUM({单价},{单价})', fields);
      expect(result.match(new RegExp(`${ZWSP}单价${ZWSP}`, 'g'))).toHaveLength(2);
      expect(result).not.toContain('{单价}');
    });

    test('闭环：替换 → 计算 marks → 验证通过', () => {
      const text = replaceFormulaPlaceholders('IF(GT({数量},0),MULTIPLY({单价},{数量}),0)', fields);
      const marks = calculateFormulaMarks(text, fields);
      expect(marks).toHaveLength(3);
      expect(validateMarks(text, marks, fields)).toBe(true);
    });
  });

  describe('generateFieldId()', () => {
    test('前缀为类型名的小驼峰形式', () => {
      expect(generateFieldId('TextField')).toMatch(/^textField_/);
      expect(generateFieldId('NumberField')).toMatch(/^numberField_/);
    });

    test('连续调用生成的ID不重复', () => {
      const ids = new Set([generateFieldId('TextField'), generateFieldId('TextField'), generateFieldId('TextField')]);
      expect(ids.size).toBe(3);
    });
  });

  describe('FieldTemplates 字段状态映射', () => {
    test('默认状态 behavior 为 NORMAL', () => {
      const f = FieldTemplates.TextField({ label: '姓名' });
      expect(f.componentName).toBe('TextField');
      expect(f.props.label.zh_CN).toBe('姓名');
      expect(f.props.behavior).toBe('NORMAL');
    });

    test('readonly 状态映射为 READONLY', () => {
      const f = FieldTemplates.TextField({ label: '姓名', status: 'readonly' });
      expect(f.props.behavior).toBe('READONLY');
    });

    test('hidden 状态映射为 HIDDEN', () => {
      const f = FieldTemplates.TextField({ label: '姓名', status: 'hidden' });
      expect(f.props.behavior).toBe('HIDDEN');
    });

    test('生成的字段携带 fieldId', () => {
      const f = FieldTemplates.TextField({ label: '姓名' });
      expect(f.props.fieldId).toMatch(/^textField_/);
    });
  });

  describe('FormGeneratorV2.generateField()', () => {
    test('支持的字段类型正常生成并登记字段信息', () => {
      const gen = new FormGeneratorV2();
      const field = gen.generateField({ type: 'TextField', label: '姓名' }, 0);
      expect(field.componentName).toBe('TextField');
      expect(gen.generatedFields).toHaveLength(1);
      expect(gen.generatedFields[0].label).toBe('姓名');
    });

    test('不支持的字段类型抛出错误', () => {
      const gen = new FormGeneratorV2();
      expect(() => gen.generateField({ type: 'MagicField', label: 'x' }, 0)).toThrow('不支持的字段类型');
    });
  });
});
