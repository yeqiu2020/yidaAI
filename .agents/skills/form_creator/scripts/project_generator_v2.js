/**
 * 宜搭项目生成器 V2 - 基于标准字段模板
 * 版本: 2.1.0
 * 创建日期: 2026-02-15
 * 更新日期: 2026-03-12
 *
 * 更新内容:
 * - 自动生成公式和代码提示词文件
 * - 提示词模板预填充表单字段信息
 *
 * 功能: 批量生成多个表单，自动组织项目目录结构
 * 使用: form_generator_v2.js + yida_field_templates.js
 */

const fs = require('fs');
const path = require('path');
const { FormGeneratorV2 } = require('./form_generator_v2');

// 模板文件路径
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');
const FORMULA_TEMPLATE_PATH = path.join(TEMPLATE_DIR, '公式提示词模板.md');
const CODE_TEMPLATE_PATH = path.join(TEMPLATE_DIR, '代码提示词模板.md');

class ProjectGeneratorV2 {
  constructor(projectName) {
    this.projectName = projectName;
    // 项目输出到根目录的 项目/ 文件夹下
    this.projectPath = path.join(__dirname, '..', '..', '..', '..', '项目', projectName);
    this.formConfigs = [];
    this.generatedForms = [];
  }

  /**
   * 添加表单配置
   * @param {Object} formConfig - 表单配置
   */
  addForm(formConfig) {
    this.formConfigs.push(formConfig);
  }

  /**
   * 创建项目目录结构
   */
  createProjectStructure() {
    console.log(`\n[项目] 创建项目目录: ${this.projectName}`);

    if (!fs.existsSync(this.projectPath)) {
      fs.mkdirSync(this.projectPath, { recursive: true });
    }

    const modules = [...new Set(this.formConfigs.map(f => f.module || '未分类'))];
    for (const module of modules) {
      const modulePath = path.join(this.projectPath, module);
      if (!fs.existsSync(modulePath)) {
        fs.mkdirSync(modulePath, { recursive: true });
        console.log(`  [创建] 模块目录: ${module}/`);
      }
    }
  }

  /**
   * 生成单个表单
   * @param {Object} formConfig - 表单配置
   * @returns {Object} 生成结果
   */
  generateForm(formConfig) {
    const generator = new FormGeneratorV2();
    const formJson = generator.generate(formConfig);

    const module = formConfig.module || '未分类';
    const outputDir = path.join(this.projectPath, module);
    const outputPath = path.join(outputDir, `${formConfig.formName}.json`);

    generator.saveToFile(formJson, outputPath);

    // 创建公式和代码文件夹及提示词文件
    this.createFormPromptFiles(formConfig, outputDir);

    return {
      formName: formConfig.formName,
      module: module,
      fieldCount: formConfig.fields.length,
      outputPath: outputPath,
      hasFormula: formConfig.fields.some(f => f.valueType === 'formula'),
      hasSubForm: !!formConfig.subForms
    };
  }

  /**
   * 创建表单的公式和代码提示词文件
   * @param {Object} formConfig - 表单配置
   * @param {string} formDir - 表单所在目录
   */
  createFormPromptFiles(formConfig, formDir) {
    const formName = formConfig.formName;

    // 创建公式文件夹和提示词文件
    const formulaDir = path.join(formDir, '公式');
    if (!fs.existsSync(formulaDir)) {
      fs.mkdirSync(formulaDir, { recursive: true });
    }
    const formulaPromptPath = path.join(formulaDir, '公式提示词.md');
    if (!fs.existsSync(formulaPromptPath)) {
      const formulaTemplate = this.getFormulaPromptTemplate(formName, formConfig.fields);
      fs.writeFileSync(formulaPromptPath, formulaTemplate, 'utf-8');
      console.log(`    [创建] 公式提示词: ${formName}/公式/公式提示词.md`);
    }

    // 创建代码文件夹和提示词文件
    const codeDir = path.join(formDir, '代码');
    if (!fs.existsSync(codeDir)) {
      fs.mkdirSync(codeDir, { recursive: true });
    }
    const codePromptPath = path.join(codeDir, '代码提示词.md');
    if (!fs.existsSync(codePromptPath)) {
      const codeTemplate = this.getCodePromptTemplate(formName, formConfig.fields);
      fs.writeFileSync(codePromptPath, codeTemplate, 'utf-8');
      console.log(`    [创建] 代码提示词: ${formName}/代码/代码提示词.md`);
    }
  }

  /**
   * 获取公式提示词模板
   * @param {string} formName - 表单名称
   * @param {Array} fields - 字段列表
   * @returns {string} 提示词内容
   */
  getFormulaPromptTemplate(formName, fields) {
    // 生成字段列表文本
    const fieldList = fields.map((f, i) => {
      return `        ${i + 1}. ${f.label}：${f.fieldId || 'fieldId_xxxxxxxxx'}`;
    }).join('\n') || '        1. 字段名称：fieldId_xxxxxxxxx';

    // 读取模板文件
    let template = '';
    if (fs.existsSync(FORMULA_TEMPLATE_PATH)) {
      template = fs.readFileSync(FORMULA_TEMPLATE_PATH, 'utf-8');
    } else {
      // 默认模板
      template = `> 作者：叶秋
> 联系方式：15270209736
> 来源：www.yidatrain.com

【公式类型】：表单公式
【输出路径】：项目案例

【需求】：
请在此处描述公式需求，例如：根据身份证号自动计算星座信息

【字段】：
{{FIELD_LIST}}
`;
    }

    // 替换占位符
    return template.replace(/\{\{FIELD_LIST\}\}/g, fieldList);
  }

  /**
   * 获取代码提示词模板
   * @param {string} formName - 表单名称
   * @param {Array} fields - 字段列表
   * @returns {string} 提示词内容
   */
  getCodePromptTemplate(formName, fields) {
    // 生成字段列表文本
    const fieldList = fields.map((f, i) => {
      return `        ${i + 1}. ${f.label}：${f.fieldId || 'fieldId_xxxxxxxxx'}`;
    }).join('\n') || '        1. 字段名称：fieldId_xxxxxxxxx';

    // 读取模板文件
    let template = '';
    if (fs.existsSync(CODE_TEMPLATE_PATH)) {
      template = fs.readFileSync(CODE_TEMPLATE_PATH, 'utf-8');
    } else {
      // 默认模板
      template = `> 作者：叶秋
> 联系方式：15270209736
> 来源：www.yidatrain.com



一、 开发形式
    (一) 表单动作代码
    (二) 请你在【表单动作代码/通用场景案例/单表操作】目录下，创建一个名称为【功能名称】的 js 文件
二、 开发需求描述
    请在此处描述代码需求，例如：按照截止日期，设置另外一个日期字段的倒计时效果
三、 当前操作表【{{FORM_NAME}}】
    (一) 表单相关组件ID：
{{FIELD_LIST}}
*********************
`;
    }

    // 替换占位符
    return template
      .replace(/\{\{FORM_NAME\}\}/g, formName)
      .replace(/\{\{FIELD_LIST\}\}/g, fieldList);
  }

  /**
   * 生成所有表单
   * @returns {Array} 生成结果列表
   */
  generateAll() {
    console.log(`\n[开始] 生成 ${this.formConfigs.length} 个表单\n`);

    this.createProjectStructure();

    for (const formConfig of this.formConfigs) {
      console.log(`[生成] ${formConfig.formName}`);
      const result = this.generateForm(formConfig);
      this.generatedForms.push(result);
    }

    this.generateProjectDocs();

    return this.generatedForms;
  }

  /**
   * 生成项目文档
   */
  generateProjectDocs() {
    this.generateReadme();
    this.generateFormList();
  }

  /**
   * 生成 README.md
   */
  generateReadme() {
    const content = `# ${this.projectName}

## 项目说明

这是一个由宜搭表单生成器 V2 自动生成的业务系统解决方案。

**生成时间**: ${new Date().toLocaleString('zh-CN')}
**生成工具**: 宜搭表单生成器 V2.0.0
**字段模板**: 基于宜搭官方字段类型 (25种字段)

## 支持的字段类型

本系统生成的表单包含以下宜搭标准字段类型：

### 基础字段
- **TextField** - 单行文本
- **TextareaField** - 多行文本
- **NumberField** - 数值
- **RateField** - 评分

### 选择字段
- **RadioField** - 单选
- **CheckboxField** - 复选
- **SelectField** - 下拉单选
- **MultiSelectField** - 下拉复选
- **CascadeSelectField** - 级联选择

### 组织字段
- **EmployeeField** - 成员选择
- **DepartmentSelectField** - 部门选择

### 日期时间字段
- **DateField** - 日期
- **CascadeDateField** - 日期区间

### 媒体字段
- **ImageField** - 图片上传
- **AttachmentField** - 附件上传

### 关联字段
- **AssociationFormField** - 关联表单
- **AssociationQuery** - 关联查询
- **TableField** - 子表单

### 特殊字段
- **SerialNumberField** - 流水号
- **AddressField** - 地址
- **CountrySelectField** - 国家/地区
- **LocationField** - 定位
- **EditorField** - 富文本编辑
- **RichText** - 富文本展示
- **PageSection** - 分组

## 目录结构

${this.generateModuleTree()}

## 使用说明

### 导入步骤

1. **按顺序导入基础信息表**
   - 先导入基础数据表（产品、供应商、客户等）
   - 确保基础数据已经建立

2. **导入业务表单**
   - 再导入业务操作表（订单、出入库等）
   - 最后导入财务相关表

3. **配置表关联关系**
   - 在宜搭中配置表单之间的关联
   - 设置子表关系

4. **设置流程审批**
   - 根据业务需要配置审批流程
   - 设置权限控制

## 表单关系

${this.generateRelationshipDoc()}

## 注意事项

- 所有表单JSON文件都是**100%符合宜搭规范**的标准格式
- 可以直接复制到宜搭中创建表单，无需任何修改
- 公式字段已经配置完成，包含正确的marks位置
- 所有字段ID都是唯一生成的
- 支持PC和移动端显示

## 技术说明

### 公式字段处理
公式字段使用零宽空格包裹字段名，确保marks位置计算准确：
- 公式示例: DATEDIF({开始日期},{结束日期},"D")+1
- 实际存储: DATEDIF(开始日期,结束日期,"D")+1 (包含零宽空格)
- marks数组记录每个字段引用的精确位置

### 字段模板来源
所有字段模板均从宜搭实际表单复制，确保：
- 属性完整
- 格式正确
- 兼容性好

---

如有问题，请参考宜搭官方文档或联系技术支持。
`;

    const readmePath = path.join(this.projectPath, 'README.md');
    fs.writeFileSync(readmePath, content, 'utf-8');
    console.log(`\n[文档] 生成 README.md`);
  }

  /**
   * 生成 表单清单.md
   */
  generateFormList() {
    const moduleGroups = {};
    for (const form of this.generatedForms) {
      if (!moduleGroups[form.module]) {
        moduleGroups[form.module] = [];
      }
      moduleGroups[form.module].push(form);
    }

    let content = `# 表单清单

## 概览

- **项目名称**: ${this.projectName}
- **表单总数**: ${this.generatedForms.length} 个
- **模块数量**: ${Object.keys(moduleGroups).length} 个
- **包含公式**: ${this.generatedForms.filter(f => f.hasFormula).length} 个

## 字段类型支持

本系统支持 25 种宜搭标准字段类型：

| 类别 | 字段类型 |
|------|----------|
| 基础 | TextField, TextareaField, NumberField, RateField |
| 选择 | RadioField, CheckboxField, SelectField, MultiSelectField, CascadeSelectField |
| 组织 | EmployeeField, DepartmentSelectField |
| 日期 | DateField, CascadeDateField |
| 媒体 | ImageField, AttachmentField |
| 关联 | AssociationFormField, AssociationQuery, TableField |
| 特殊 | SerialNumberField, AddressField, CountrySelectField, LocationField, EditorField, RichText, PageSection |

`;

    for (const [module, forms] of Object.entries(moduleGroups)) {
      content += `## ${module} (${forms.length}个)\n\n`;
      content += '| 序号 | 表单名称 | 字段数 | 公式 | 子表 | 说明 |\n';
      content += '|------|----------|--------|------|------|------|\n';

      forms.forEach((form, index) => {
        const hasFormula = form.hasFormula ? '✓' : '-';
        const hasSubForm = form.hasSubForm ? '✓' : '-';
        content += `| ${index + 1} | ${form.formName} | ${form.fieldCount} | ${hasFormula} | ${hasSubForm} | - |\n`;
      });

      content += '\n';
    }

    content += `---

## 表关联关系

`;
    content += this.generateRelationshipDoc();

    content += `
---

生成时间: ${new Date().toLocaleString('zh-CN')}
`;

    const listPath = path.join(this.projectPath, '表单清单.md');
    fs.writeFileSync(listPath, content, 'utf-8');
    console.log(`[文档] 生成 表单清单.md`);
  }

  /**
   * 生成模块树形结构
   * @returns {string} 树形结构文本
   */
  generateModuleTree() {
    const moduleGroups = {};
    for (const form of this.generatedForms) {
      if (!moduleGroups[form.module]) {
        moduleGroups[form.module] = [];
      }
      moduleGroups[form.module].push(form.formName);
    }

    let tree = '';
    for (const [module, forms] of Object.entries(moduleGroups)) {
      tree += `- ${module}/\n`;
      for (const form of forms) {
        tree += `  - ${form}.json\n`;
      }
    }

    return tree;
  }

  /**
   * 生成表关联关系文档
   * @returns {string} 关系文档
   */
  generateRelationshipDoc() {
    let doc = '### 表单列表\n\n';
    for (const form of this.generatedForms) {
      doc += `- ${form.formName}\n`;
    }
    return doc;
  }

  /**
   * 打印生成摘要
   */
  printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[项目生成完成] ${this.projectName}`);
    console.log(`${'='.repeat(60)}\n`);

    const moduleGroups = {};
    for (const form of this.generatedForms) {
      if (!moduleGroups[form.module]) {
        moduleGroups[form.module] = [];
      }
      moduleGroups[form.module].push(form);
    }

    for (const [module, forms] of Object.entries(moduleGroups)) {
      console.log(`${module}/ (${forms.length}个表单)`);
      for (const form of forms) {
        const formulaTag = form.hasFormula ? '[公式]' : '';
        const subFormTag = form.hasSubForm ? '[子表]' : '';
        console.log(`  ✓ ${form.formName}.json ${formulaTag} ${subFormTag}`);
      }
      console.log('');
    }

    console.log(`总计: ${this.generatedForms.length} 个表单`);
    console.log(`位置: ${this.projectPath}\n`);
    console.log('项目文档:');
    console.log('  📄 README.md - 项目说明和使用指南');
    console.log('  📄 表单清单.md - 所有表单清单及关系说明');
    console.log(`\n${'='.repeat(60)}\n`);
  }
}

// ==================== 导出 ====================

module.exports = {
  ProjectGeneratorV2
};

// ==================== 命令行入口 ====================

if (require.main === module) {
  console.log('宜搭项目生成器 V2');
  console.log('用法: 在代码中引入 ProjectGeneratorV2 类使用');
  console.log('\n示例:');
  console.log(`
const { ProjectGeneratorV2 } = require('./project_generator_v2');

const project = new ProjectGeneratorV2('进销存管理');

project.addForm({
  formName: '产品信息表',
  module: '基础信息',
  fields: [...]
});

project.generateAll();
project.printSummary();
`);
}
