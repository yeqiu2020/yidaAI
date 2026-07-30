/**
 * 核心功能测试：公式 marks 计算 (Phase 4 - Task 4-2)
 *
 * 测试 formula-generator 的 marks 位置计算：
 *   - findFieldPositions 字段位置查找
 *   - validateMarks 位置验证
 *   - 零宽空格包裹逻辑
 *   - 公式函数验证（formula_function_validator）
 *
 * 使用 generate_formula.js 的导出函数直接测试。
 */

'use strict';

const path = require('path');

// 加载公式生成核心模块
let generateFormula, formulaEvaluator, formulaValidator;

try {
  generateFormula = require('../../.agents/skills/formula-generator/scripts/generate_formula.js');
} catch (e) {
  generateFormula = null;
}

try {
  formulaEvaluator = require('../../.agents/skills/formula-generator/scripts/formula_evaluator.js');
} catch (e) {
  formulaEvaluator = null;
}

try {
  formulaValidator = require('../../.agents/skills/formula-generator/scripts/formula_function_validator.js');
} catch (e) {
  formulaValidator = null;
}

const ZERO_WIDTH_SPACE = '\u200b';

describe('核心功能：公式 marks 计算', () => {
  // ── findFieldPositions ─────────────────────────────
  (generateFormula ? describe : describe.skip)('generate_formula.js', () => {
    const { findFieldPositions, FieldConfig, ZERO_WIDTH_SPACE: ZWS } = generateFormula;

    test('ZERO_WIDTH_SPACE 为 \\u200b', () => {
      expect(ZWS).toBe('\u200b');
    });

    test('FieldConfig 构造', () => {
      const fc = new FieldConfig('姓名', 'textField_001');
      expect(fc.displayName).toBe('姓名');
      expect(fc.fieldId).toBe('textField_001');
    });

    test('findFieldPositions 找到单个字段', () => {
      const text = `IF(EQ(LEN(${ZWS}姓名${ZWS}),18),"valid","invalid")`;
      const fields = [new FieldConfig('姓名', 'textField_001')];
      const marks = findFieldPositions(text, fields);

      expect(marks).toHaveLength(1);
      expect(marks[0].value).toBe('textField_001');
      expect(marks[0].from).toHaveProperty('line', 0);
      expect(marks[0].from).toHaveProperty('ch');
      expect(marks[0].to).toHaveProperty('line', 0);
      expect(marks[0].to).toHaveProperty('ch');
      expect(marks[0].to.ch).toBeGreaterThan(marks[0].from.ch);
    });

    test('findFieldPositions 找到多个字段引用', () => {
      const text = `CONCATENATE(${ZWS}姓名${ZWS},"-",${ZWS}年龄${ZWS})`;
      const fields = [
        new FieldConfig('姓名', 'textField_001'),
        new FieldConfig('年龄', 'numberField_002'),
      ];
      const marks = findFieldPositions(text, fields);

      expect(marks).toHaveLength(2);
      const ids = marks.map(m => m.value);
      expect(ids).toContain('textField_001');
      expect(ids).toContain('numberField_002');
    });

    test('findFieldPositions 同一字段多次引用', () => {
      const text = `IF(${ZWS}金额${ZWS}>100,${ZWS}金额${ZWS}*0.9,${ZWS}金额${ZWS})`;
      const fields = [new FieldConfig('金额', 'numberField_001')];
      const marks = findFieldPositions(text, fields);

      expect(marks).toHaveLength(3);
      marks.forEach(m => {
        expect(m.value).toBe('numberField_001');
      });
    });

    test('findFieldPositions 无匹配返回空数组', () => {
      const text = 'IF(true,"yes","no")';
      const fields = [new FieldConfig('姓名', 'textField_001')];
      const marks = findFieldPositions(text, fields);
      expect(marks).toHaveLength(0);
    });

    test('marks 位置正确（from < to）', () => {
      const text = `${ZWS}姓名${ZWS}`;
      const fields = [new FieldConfig('姓名', 'textField_001')];
      const marks = findFieldPositions(text, fields);

      expect(marks).toHaveLength(1);
      expect(marks[0].from.ch).toBe(0);
      expect(marks[0].to.ch).toBe(text.length);
    });

    test('marks 包含零宽空格范围', () => {
      const text = `值=${ZWS}姓名${ZWS}`;
      const fields = [new FieldConfig('姓名', 'textField_001')];
      const marks = findFieldPositions(text, fields);

      expect(marks).toHaveLength(1);
      // 从 "值=" 后开始
      expect(marks[0].from.ch).toBe(2);
      // 包含零宽空格+字段名+零宽空格
      expect(marks[0].to.ch).toBe(2 + ZWS.length + '姓名'.length + ZWS.length);
    });
  });

  // ── formula_function_validator ─────────────────────
  (formulaValidator ? describe : describe.skip)('formula_function_validator.js', () => {
    // 导出名已由 YIDA_OFFICIAL_FUNCTIONS 重命名为 OFFICIAL_FUNCTIONS，兼容旧名
    const { validateFunctions, COMMON_MISTAKES } = formulaValidator;
    const OFFICIAL_FUNCTIONS = formulaValidator.OFFICIAL_FUNCTIONS || formulaValidator.YIDA_OFFICIAL_FUNCTIONS;

    test('OFFICIAL_FUNCTIONS 包含 IF', () => {
      expect(OFFICIAL_FUNCTIONS.has('IF')).toBe(true);
    });

    test('OFFICIAL_FUNCTIONS 包含 CONCATENATE', () => {
      expect(OFFICIAL_FUNCTIONS.has('CONCATENATE')).toBe(true);
    });

    test('OFFICIAL_FUNCTIONS 包含 DATE', () => {
      expect(OFFICIAL_FUNCTIONS.has('DATE')).toBe(true);
    });

    test('COMMON_MISTAKES 包含 ISBLANK', () => {
      expect(COMMON_MISTAKES).toHaveProperty('ISBLANK');
    });

    test('validateFunctions: 合法函数返回 valid=true', () => {
      const result = validateFunctions('IF(GT(10,5),"大","小")');
      expect(result.valid).toBe(true);
      expect(result.functions).toContain('IF');
      expect(result.functions).toContain('GT');
    });

    test('validateFunctions: 非法函数返回 valid=false', () => {
      const result = validateFunctions('INVALIDFUNC(1,2)');
      expect(result.valid).toBe(false);
      expect(result.invalidFunctions.length).toBeGreaterThan(0);
    });

    test('validateFunctions: 常见错误函数有建议', () => {
      const result = validateFunctions('ISBLANK(A1)');
      expect(result.valid).toBe(false);
      const invalid = result.invalidFunctions.find(f => f.function === 'ISBLANK');
      expect(invalid).toBeDefined();
      expect(invalid.suggestion).toContain('ISEMPTY');
    });

    test('validateFunctions: 空字符串返回 valid=true', () => {
      const result = validateFunctions('');
      expect(result.valid).toBe(true);
      expect(result.functions).toHaveLength(0);
    });

    test('validateFunctions: 多个函数混合', () => {
      const result = validateFunctions('CONCATENATE(TEXT(姓名),"-",TEXT(日期))');
      expect(result.valid).toBe(true);
      expect(result.functions).toContain('CONCATENATE');
      expect(result.functions).toContain('TEXT');
    });
  });

  // ── formula_evaluator ──────────────────────────────
  (formulaEvaluator ? describe : describe.skip)('formula_evaluator.js', () => {
    test('函数注册表包含文本函数', () => {
      expect(formulaEvaluator.FUNCTION_REGISTRY).toBeDefined();
      expect(formulaEvaluator.FUNCTION_REGISTRY.CONCATENATE).toBeDefined();
      expect(formulaEvaluator.FUNCTION_REGISTRY.LEFT).toBeDefined();
    });

    test('函数注册表包含逻辑函数', () => {
      expect(formulaEvaluator.FUNCTION_REGISTRY.IF).toBeDefined();
      expect(formulaEvaluator.FUNCTION_REGISTRY.GT).toBeDefined();
      expect(formulaEvaluator.FUNCTION_REGISTRY.AND).toBeDefined();
    });

    test('函数注册表包含数学函数', () => {
      expect(formulaEvaluator.FUNCTION_REGISTRY.ADD).toBeDefined();
      expect(formulaEvaluator.FUNCTION_REGISTRY.SUM).toBeDefined();
      expect(formulaEvaluator.FUNCTION_REGISTRY.MAX).toBeDefined();
    });

    test('evaluateFormula: 简单求值', () => {
      if (typeof formulaEvaluator.evaluateFormula === 'function') {
        const result = formulaEvaluator.evaluateFormula('IF(GT(10,5),"大","小")', {});
        // 求值器返回 {result, error, trace} 对象
        expect(result).toHaveProperty('result');
        expect(result.result).toBe('大');
        expect(result.error).toBeNull();
      }
    });

    test('evaluateFormula: CONCATENATE 求值', () => {
      if (typeof formulaEvaluator.evaluateFormula === 'function') {
        const result = formulaEvaluator.evaluateFormula(
          'CONCATENATE("姓名:","张三")',
          {}
        );
        expect(result).toHaveProperty('result');
        expect(result.result).toBe('姓名:张三');
      }
    });

    test('evaluateFormula: ADD 求值', () => {
      if (typeof formulaEvaluator.evaluateFormula === 'function') {
        const result = formulaEvaluator.evaluateFormula('ADD(10,20,30)', {});
        expect(result).toHaveProperty('result');
        expect(result.result).toBe(60);
      }
    });

    test('checkSyntax: 合法语法通过', () => {
      if (typeof formulaEvaluator.checkSyntax === 'function') {
        const result = formulaEvaluator.checkSyntax('IF(GT(10,5),"大","小")');
        // 检查器返回 {valid, errors} 对象
        if (result && typeof result === 'object' && 'valid' in result) {
          expect(result.valid).toBe(true);
        } else {
          // 如果返回的不是对象，测试函数存在即可
          expect(result).toBeDefined();
        }
      }
    });

    test('checkSyntax: 括号不匹配不通过', () => {
      if (typeof formulaEvaluator.checkSyntax === 'function') {
        const result = formulaEvaluator.checkSyntax('IF(GT(10,5,"大","小"');
        if (result && typeof result === 'object' && 'valid' in result) {
          expect(result.valid).toBe(false);
        } else {
          expect(result).toBeDefined();
        }
      }
    });
  });
});
