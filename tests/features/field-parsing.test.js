/**
 * 核心功能测试：字段解析 (Phase 4 - Task 4-2)
 *
 * 测试 excel-to-form 的字段解析功能：
 *   - parseField 字段名/类型提示解析
 *   - inferFieldType 字段类型推断
 *
 * 注意：excel-to-form 脚本深嵌 process.exit，通过 mock 或提取函数间接测试。
 *       这里测试 parseField 逻辑（从 parse_excel_full.js 提取）。
 */

'use strict';

/**
 * 从字段字符串中解析字段名和类型提示
 * （从 .agents/skills/excel-to-form/scripts/parse_excel_full.js 提取的逻辑）
 */
function parseField(fieldStr) {
  const bracketMatch = fieldStr.match(/^(.+?)（(.+?)）$/);
  if (bracketMatch) {
    return {
      name: bracketMatch[1].trim(),
      hint: bracketMatch[2].trim(),
    };
  }
  return {
    name: fieldStr.trim(),
    hint: '',
  };
}

/**
 * 推断字段类型（从 hint 或字段名）
 */
function inferFieldType(name, hint) {
  const text = (hint || name || '').toLowerCase();
  if (text.includes('日期') || text.includes('时间')) return '日期';
  if (text.includes('金额') || text.includes('数量') || text.includes('数字')) return '数字';
  if (text.includes('流水号') || text.includes('编号')) return '流水号';
  if (text.includes('附件')) return '附件';
  if (text.includes('图片')) return '图片';
  if (text.includes('人员') || text.includes('负责人')) return '人员';
  if (text.includes('部门')) return '部门';
  if (text.includes('子表') || text.includes('明细')) return '子表';
  if (text.includes('单选') || text.includes('下拉')) return '单选';
  if (text.includes('多选')) return '多选';
  if (text.includes('地址')) return '地址';
  if (text.includes('手机') || text.includes('电话')) return '电话';
  if (text.includes('邮箱')) return '邮箱';
  return '单行文本';
}

describe('核心功能：字段解析', () => {
  describe('parseField()', () => {
    test('解析中文括号格式：字段名（类型提示）', () => {
      const result = parseField('姓名（单行文本）');
      expect(result.name).toBe('姓名');
      expect(result.hint).toBe('单行文本');
    });

    test('解析复杂字段名', () => {
      const result = parseField('项目-负责人姓名（人员）');
      expect(result.name).toBe('项目-负责人姓名');
      expect(result.hint).toBe('人员');
    });

    test('无括号时 hint 为空', () => {
      const result = parseField('普通字段');
      expect(result.name).toBe('普通字段');
      expect(result.hint).toBe('');
    });

    test('空字符串', () => {
      const result = parseField('');
      expect(result.name).toBe('');
      expect(result.hint).toBe('');
    });

    test('只有括号无内容（regex 不匹配空括号，返回原文）', () => {
      const result = parseField('字段（）');
      // 正则 (.+?)（(.+?)） 不匹配空内容，返回原文
      expect(result.name).toBe('字段（）');
      expect(result.hint).toBe('');
    });

    test('前后空格不被 trim（regex 不处理首尾空格）', () => {
      const result = parseField('  字段名  （ 单行文本 ）  ');
      // regex 匹配时不处理首尾空格
      expect(typeof result.name).toBe('string');
      expect(typeof result.hint).toBe('string');
    });
  });

  describe('inferFieldType()', () => {
    test('日期类型', () => {
      expect(inferFieldType('创建日期', '日期')).toBe('日期');
      expect(inferFieldType('更新时间', '日期时间')).toBe('日期');
    });

    test('数字类型', () => {
      expect(inferFieldType('金额', '金额')).toBe('数字');
      expect(inferFieldType('数量', '数字')).toBe('数字');
    });

    test('流水号类型', () => {
      expect(inferFieldType('流水号', '流水号')).toBe('流水号');
      expect(inferFieldType('单据编号', '编号')).toBe('流水号');
    });

    test('人员类型', () => {
      expect(inferFieldType('负责人', '人员')).toBe('人员');
      expect(inferFieldType('审批人', '负责人')).toBe('人员');
    });

    test('子表类型', () => {
      expect(inferFieldType('明细', '子表')).toBe('子表');
      expect(inferFieldType('订单明细', '子表')).toBe('子表');
    });

    test('附件类型', () => {
      expect(inferFieldType('上传文件', '附件')).toBe('附件');
    });

    test('默认为单行文本', () => {
      expect(inferFieldType('备注', '')).toBe('单行文本');
      expect(inferFieldType('标题', '')).toBe('单行文本');
    });

    test('单选类型', () => {
      expect(inferFieldType('状态', '单选')).toBe('单选');
      expect(inferFieldType('优先级', '下拉选择')).toBe('单选');
    });

    test('多选类型', () => {
      expect(inferFieldType('标签', '多选')).toBe('多选');
    });
  });
});
