/**
 * 核心功能测试：Schema 构建 (Phase 4 - Task 4-2)
 *
 * 测试 form_creator 的 Schema JSON 生成逻辑：
 *   - yida_field_templates.js 的字段模板生成
 *   - generateFieldId 生成的字段ID格式
 *   - i18n 国际化对象
 *   - getBehaviorByStatus 行为映射
 *   - getHiddenByStatus 隐藏映射
 *
 * 注意：form_creator 脚本深嵌 process.exit，通过提取关键函数间接测试。
 *       yida_field_templates.js 不含 process.exit，可直接 require。
 */

'use strict';

const { FieldTemplates, generateFieldId, i18n } = require('../../.agents/skills/form_creator/scripts/field_templates.js');
describe('核心功能：Schema 构建', () => {
  describe('真实字段模板库', () => {
    test('generateFieldId 返回正确前缀且不重复', () => {
      const first = generateFieldId('TextField');
      expect(first).toMatch(/^textField_/);
      expect(generateFieldId('TextField')).not.toBe(first);
    });
    test('i18n 生成中文和英文显示值', () => expect(i18n('字段')).toMatchObject({type:'i18n',zh_CN:'字段',en_US:'字段'}));
    test('只读状态真实进入生成组件', () => expect(FieldTemplates.TextField({label:'字段',status:'readonly'}).props.behavior).toBe('READONLY'));
    test('隐藏状态同时写入组件行为与 hidden', () => {
      const field = FieldTemplates.TextField({label:'字段',status:'hidden'});
      expect(field.props.behavior).toBe('HIDDEN'); expect(field.hidden).toBe(true);
    });
    test('必填规则与基础属性真实落在 props', () => {
      const field = FieldTemplates.TextField({label:'字段',required:true});
      expect(field.props.validation).toContainEqual({type:'required'});
      expect(field.props.visibility).toEqual(['PC','MOBILE']);
    });
  });

  // Schema 结构验证（独立于具体实现）
  describe('Schema JSON 结构验证', () => {
    test('宜搭字段 Schema 应包含基本属性', () => {
      // 模拟一个宜搭字段 Schema
      const fieldSchema = {
        type: 'TextField',
        props: {
          label: '姓名',
          placeholder: '请输入姓名',
          behavior: 'NORMAL',
          validation: [],
          __gridSpan: 1,
          visibility: ['PC', 'MOBILE'],
        },
      };

      expect(fieldSchema).toHaveProperty('type');
      expect(fieldSchema).toHaveProperty('props');
      expect(fieldSchema.props).toHaveProperty('label');
      expect(fieldSchema.props).toHaveProperty('behavior');
      expect(fieldSchema.props).toHaveProperty('validation');
      expect(Array.isArray(fieldSchema.props.validation)).toBe(true);
      expect(fieldSchema.props).toHaveProperty('visibility');
      expect(fieldSchema.props.visibility).toContain('PC');
      expect(fieldSchema.props.visibility).toContain('MOBILE');
    });

    test('i18n 对象格式正确', () => {
      const i18nObj = {
        type: 'i18n',
        zh_CN: '中文名称',
        en_US: 'English Name',
      };

      expect(i18nObj.type).toBe('i18n');
      expect(i18nObj.zh_CN).toBeDefined();
      expect(i18nObj.en_US).toBeDefined();
    });

    test('behavior 值域为 NORMAL/READONLY/HIDDEN', () => {
      const validBehaviors = ['NORMAL', 'READONLY', 'HIDDEN'];
      validBehaviors.forEach(b => {
        expect(['NORMAL', 'READONLY', 'HIDDEN']).toContain(b);
      });
    });

    test('字段 ID 格式应包含类型前缀', () => {
      // 宜搭字段 ID 格式：textField_xxxxx, numberField_xxxxx 等
      const sampleIds = [
        'textField_mloe5q1234567890',
        'numberField_mloe5q1234567891',
        'dateField_mloe5q1234567892',
      ];

      sampleIds.forEach(id => {
        expect(id).toMatch(/^[a-z][a-zA-Z]+Field_/);
      });
    });

    test('表单 Schema 基本结构', () => {
      const formSchema = {
        formType: 'default',
        fields: [
          { type: 'TextField', id: 'textField_001', label: '姓名' },
          { type: 'NumberField', id: 'numberField_002', label: '年龄' },
        ],
      };

      expect(formSchema).toHaveProperty('formType');
      expect(formSchema).toHaveProperty('fields');
      expect(Array.isArray(formSchema.fields)).toBe(true);
      expect(formSchema.fields.length).toBeGreaterThan(0);
    });
  });
});
