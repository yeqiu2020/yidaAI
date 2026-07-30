#!/usr/bin/env node
/**
 * 宜搭表单实体关系图（ER Diagram）生成器
 *
 * 功能：
 *   ① 从本地 Schema JSON 文件 / 目录 / 在线 API 获取表单 Schema
 *   ② 解析每个表单的实体和关系（子表 1:N、关联表单 N:1）
 *   ③ 生成 mermaid ER 图 + JSON 结构化数据 + Markdown 分析报告
 *   ④ 检测孤立表单和循环依赖
 *
 * 用法:
 *   node generate-er.js --file <schema.json>
 *   node generate-er.js --files <a.json>,<b.json>
 *   node generate-er.js --dir <schema-dir>
 *   node generate-er.js --appType <appType> --forms <uuid1>,<uuid2>
 *   node generate-er.js --help
 *
 * 风险等级: R1（只读，不修改线上数据）
 *
 * 创建日期: 2026-07-10 (Phase 5-0)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, '.cache', 'er-diagram');

// ── 实体与关系解析 ───────────────────────────────────────

/**
 * 从 Schema 中提取表单名称
 * 兼容多种 Schema 结构
 */
function extractFormName(schema) {
  if (!schema) return '未知表单';
  // 尝试多种可能的字段名
  if (schema.name) return schema.name;
  if (schema.title) return typeof schema.title === 'string' ? schema.title : (schema.title.zh_CN || schema.title.text || '未知表单');
  if (schema.formName) return schema.formName;
  if (schema.label) return schema.label;
  return '未知表单';
}

/**
 * 从 Schema 中提取 formUuid
 */
function extractFormUuid(schema) {
  if (!schema) return '';
  if (schema.formUuid) return schema.formUuid;
  if (schema.formId) return schema.formId;
  if (schema.id) return schema.id;
  return '';
}

/**
 * 从 Schema 中提取字段列表
 * 兼容多种 Schema 结构
 */
function extractFields(schema) {
  if (!schema) return [];

  // 尝试多种可能的字段名
  if (Array.isArray(schema.fields)) return schema.fields;
  if (Array.isArray(schema.fieldList)) return schema.fieldList;
  if (Array.isArray(schema.children)) return schema.children;

  // 宜搭 V5 导出：顶层 componentsTree（数组形式）
  if (Array.isArray(schema.componentsTree)) return flattenComponents(schema.componentsTree);

  // 嵌套在 pages > components 中（V5 Schema）
  if (schema.pages && Array.isArray(schema.pages)) {
    for (const page of schema.pages) {
      if (page.componentsTree && Array.isArray(page.componentsTree)) {
        return flattenComponents(page.componentsTree);
      }
      if (page.fieldList && Array.isArray(page.fieldList)) {
        return page.fieldList;
      }
    }
  }

  // 嵌套在 content 中（API 响应）
  if (schema.content) {
    return extractFields(schema.content);
  }

  return [];
}

/**
 * 递归展平组件树，提取叶子字段
 */
function flattenComponents(components) {
  const result = [];
  if (!Array.isArray(components)) return result;

  for (const comp of components) {
    if (!comp) continue;
    // 如果组件有 fieldType 或 type 且是字段类型，加入结果
    const fieldType = comp.fieldType || comp.type || comp.componentName;
    if (fieldType && isFormFieldType(fieldType)) {
      result.push(comp);
    }
    // 递展子组件
    if (comp.children && Array.isArray(comp.children)) {
      result.push(...flattenComponents(comp.children));
    }
    // 子表字段可能有 subFields / fields
    if (comp.subFields && Array.isArray(comp.subFields)) {
      result.push(...flattenComponents(comp.subFields));
    }
    if (comp.props && comp.props.children && Array.isArray(comp.props.children)) {
      result.push(...flattenComponents(comp.props.children));
    }
  }

  return result;
}

/**
 * 判断是否为表单字段类型（非布局组件）
 */
function isFormFieldType(type) {
  if (!type || typeof type !== 'string') return false;
  const lower = type.toLowerCase();
  const formFieldTypes = [
    'textfield', 'numberfield', 'selectfield', 'multiselectfield',
    'datefield', 'datetimefield', 'radiofield', 'checkboxfield',
    'textareafield', 'tablefield', 'attachmentfield', 'employeefield',
    'departmentfield', 'associationformfield', 'subformfield',
    'addressfield', 'cascadeselectfield', 'richtextfield',
    'moneyfield', 'ratefield', 'switchfield', 'locationfield',
    'statfield', 'formulafield', 'autonumberfield',
    'serialnumberfield', 'imagesfield', 'departmentselectfield',
  ];
  return formFieldTypes.some(t => lower.includes(t));
}

/**
 * 解析 i18n 字段值，优先返回 zh_CN
 */
function resolveI18n(v) {
  if (v && typeof v === 'object') {
    if (typeof v.zh_CN !== 'undefined') return v.zh_CN;
    if (typeof v.text !== 'undefined') return v.text;
    if (typeof v.en_US !== 'undefined') return v.en_US;
  }
  return v;
}

/**
 * 获取字段的 fieldId
 */
function extractFieldId(field) {
  if (!field) return '';
  return field.fieldId || field.id || field.fieldName || '';
}

/**
 * 获取字段的 label
 */
function extractFieldLabel(field) {
  if (!field) return '';
  if (field.label) return resolveI18n(field.label) || '';
  if (field.title) return typeof field.title === 'string' ? field.title : (resolveI18n(field.title) || '');
  if (field.props && field.props.label) return resolveI18n(field.props.label) || '';
  return extractFieldId(field) || '未命名字段';
}

/**
 * 获取字段的类型
 */
function extractFieldType(field) {
  if (!field) return '';
  return field.fieldType || field.type || field.componentName || '';
}

/**
 * 从关联表单字段中提取被关联的 formUuid
 */
function extractAssociatedFormUuid(field) {
  if (!field) return '';
  // 尝试多种可能的结构
  if (field.props) {
    // 宜搭 V5：关联表单信息嵌套在 associationForm.formUuid
    if (field.props.associationForm && field.props.associationForm.formUuid) {
      return field.props.associationForm.formUuid;
    }
    if (field.props.formUuid) return field.props.formUuid;
    if (field.props.associateFormUuid) return field.props.associateFormUuid;
    if (field.props.formUuids && Array.isArray(field.props.formUuids) && field.props.formUuids.length > 0) {
      return field.props.formUuids[0];
    }
  }
  if (field.formUuid) return field.formUuid;
  if (field.associateFormUuid) return field.associateFormUuid;
  if (field.config && field.config.formUuid) return field.config.formUuid;

  // 可能在 field.relateFormUuid
  if (field.relateFormUuid) return field.relateFormUuid;

  return '';
}

/**
 * 从关联表单字段中提取被关联的表单名称
 */
function extractAssociatedFormName(field) {
  if (!field) return '';
  if (field.props) {
    // 宜搭 V5：关联表单标题在 associationForm.formTitle（可能为 i18n 对象）
    if (field.props.associationForm && field.props.associationForm.formTitle) {
      return resolveI18n(field.props.associationForm.formTitle) || '';
    }
    if (field.props.formName) return resolveI18n(field.props.formName) || '';
    if (field.props.associateFormName) return resolveI18n(field.props.associateFormName) || '';
  }
  if (field.formName) return field.formName;
  if (field.associateFormName) return field.associateFormName;
  return '';
}

/**
 * 解析单个 Schema，提取实体信息和关系列表
 *
 * @param {Object} schema - 表单 Schema 对象
 * @returns {{ entity: Object, relations: Array }}
 */
function parseSchema(schema) {
  const formUuid = extractFormUuid(schema);
  const formName = extractFormName(schema);
  const fields = extractFields(schema);

  const fieldList = [];
  const relations = [];

  for (const field of fields) {
    const fieldType = extractFieldType(field);
    const fieldId = extractFieldId(field);
    const fieldLabel = extractFieldLabel(field);

    const fieldInfo = {
      fieldId,
      label: fieldLabel,
      type: fieldType,
    };

    // 检测子表字段（tableField / subFormField）
    if (fieldType.toLowerCase().includes('tablefield') || fieldType.toLowerCase().includes('subformfield')) {
      // 子表是 1:N 关系：当前表单(1) → 子表(N)
      // 子表本身不是一个独立的表单实体，而是当前表单的一部分
      // 但如果子表有自己的关联表单，也需要记录
      fieldInfo.isSubTable = true;

      // 尝试提取子表的子字段
      const subFields = field.subFields || field.children ||
        (field.props && field.props.children) || (field.props && field.props.subFields) || [];
      if (Array.isArray(subFields) && subFields.length > 0) {
        fieldInfo.subFieldCount = subFields.length;

        // 检查子表字段中是否有关联表单
        for (const subField of subFields) {
          const subFieldType = extractFieldType(subField).toLowerCase();
          if (subFieldType.includes('associationformfield') || subFieldType.includes('relatefield')) {
            const assocUuid = extractAssociatedFormUuid(subField);
            const assocName = extractAssociatedFormName(subField);
            if (assocUuid) {
              relations.push({
                from: formUuid,
                fromName: formName,
                to: assocUuid,
                toName: assocName || assocUuid,
                type: 'association',
                direction: 'N:1',
                viaField: `${fieldLabel}.${extractFieldLabel(subField)}`,
                fieldId: extractFieldId(subField),
              });
            }
          }
        }
      }
    }

    // 检测关联表单字段（associationFormField / relateField）
    if (fieldType.toLowerCase().includes('associationformfield') || fieldType.toLowerCase().includes('relatefield')) {
      const assocUuid = extractAssociatedFormUuid(field);
      const assocName = extractAssociatedFormName(field);
      if (assocUuid) {
        relations.push({
          from: formUuid,
          fromName: formName,
          to: assocUuid,
          toName: assocName || assocUuid,
          type: 'association',
          direction: 'N:1',
          viaField: fieldLabel,
          fieldId,
        });
        fieldInfo.associatesTo = assocUuid;
      }
    }

    fieldList.push(fieldInfo);
  }

  const entity = {
    formUuid,
    name: formName,
    fieldCount: fieldList.length,
    fields: fieldList,
  };

  return { entity, relations };
}

// ── 循环依赖检测 ───────────────────────────────────────

/**
 * 使用 DFS 检测循环依赖
 *
 * @param {Array} relations - 所有关联关系
 * @param {Map<string, string>} uuidToName - formUuid 到表单名称的映射
 * @returns {Array} 检测到的循环路径
 */
function detectCircularDependencies(relations, uuidToName) {
  // 构建邻接表（仅关联关系）
  const graph = new Map();
  for (const rel of relations) {
    if (rel.type === 'association') {
      if (!graph.has(rel.from)) graph.set(rel.from, []);
      graph.get(rel.from).push(rel.to);
    }
  }

  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const path = [];

  function dfs(node) {
    if (recursionStack.has(node)) {
      // 找到循环
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      const cycleNames = cycle.map(uuid => uuidToName.get(uuid) || uuid);
      cycles.push({
        path: cycle,
        pathNames: cycleNames,
        description: cycleNames.join(' → '),
      });
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const [uuid] of graph) {
    if (!visited.has(uuid)) {
      dfs(uuid);
    }
  }

  return cycles;
}

// ── 孤立表单检测 ───────────────────────────────────────

/**
 * 检测孤立表单（没有被任何其他表单引用的表单）
 *
 * @param {Array} entities - 所有实体
 * @param {Array} relations - 所有关联关系
 * @returns {Array} 孤立表单列表
 */
function detectIsolatedForms(entities, relations) {
  const referenced = new Set();

  // 被关联的表单
  for (const rel of relations) {
    if (rel.type === 'association') {
      referenced.add(rel.to);
    }
  }

  // 有关联出去的表单也算被连接
  for (const rel of relations) {
    if (rel.type === 'association') {
      referenced.add(rel.from);
    }
  }

  const isolated = entities.filter(e => !referenced.has(e.formUuid));
  return isolated;
}

// ── Mermaid ER 图生成 ──────────────────────────────────

/**
 * 生成 Mermaid ER 图
 *
 * 使用 erDiagram 语法：
 *   erDiagram
 *     FORM_A ||--o{ FORM_C : "子表"
 *     FORM_A }o--|| FORM_B : "关联表单"
 *
 * 关系符号说明：
 *   ||--o{ : 一对多（1:N）—— 用于子表
 *   }o--|| : 多对一（N:1）—— 用于关联表单
 */
function generateMermaid(entities, relations, uuidToName) {
  const lines = [];
  lines.push('erDiagram');

  // 实体定义（包含字段）
  for (const entity of entities) {
    const safeName = sanitizeMermaidName(entity.name || entity.formUuid);
    lines.push(`    ${safeName} {`);
    for (const field of entity.fields.slice(0, 20)) { // 限制字段数量防止图过大
      const fieldType = mapFieldTypeForMermaid(field.type);
      const fieldLabel = sanitizeMermaidName(field.label || field.fieldId || '');
      lines.push(`        ${fieldType} ${fieldLabel}`);
    }
    if (entity.fields.length > 20) {
      lines.push(`        string "...等${entity.fields.length - 20}个字段"`);
    }
    lines.push('    }');
  }

  lines.push('');

  // 关系定义
  for (const rel of relations) {
    const fromName = sanitizeMermaidName(uuidToName.get(rel.from) || rel.fromName || rel.from);
    const toName = sanitizeMermaidName(uuidToName.get(rel.to) || rel.toName || rel.to);
    const relLabel = sanitizeMermaidName(rel.viaField || rel.type);

    if (rel.type === 'association') {
      // 关联表单：N:1，当前表(多) → 被关联表(一)
      // }o--|| 表示多对一
      lines.push(`    ${fromName} }o--|| ${toName} : "${relLabel}"`);
    }
  }

  return lines.join('\n');
}

/**
 * 将字段类型映射为 Mermaid 支持的类型名
 */
function mapFieldTypeForMermaid(type) {
  if (!type) return 'string';
  const t = type.toLowerCase();
  if (t.includes('text')) return 'string';
  if (t.includes('number') || t.includes('money')) return 'int';
  if (t.includes('date') || t.includes('time')) return 'datetime';
  if (t.includes('select') || t.includes('radio') || t.includes('checkbox')) return 'enum';
  if (t.includes('table') || t.includes('subform')) return 'table';
  if (t.includes('association') || t.includes('relate')) return 'ref';
  if (t.includes('attachment')) return 'blob';
  if (t.includes('employee') || t.includes('department')) return 'ref';
  return 'string';
}

/**
 * 净化名称用于 Mermaid（去除特殊字符）
 */
function sanitizeMermaidName(name) {
  if (!name) return 'unknown';
  return String(name)
    .replace(/[\s\-\.\/\\]/g, '_')
    .replace(/[^\w\u4e00-\u9fff]/g, '')
    .substring(0, 50);
}

// ── JSON 输出生成 ──────────────────────────────────────

/**
 * 生成 JSON 格式的 ER 数据
 */
function generateJson(entities, relations, cycles, isolated) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      entityCount: entities.length,
      relationCount: relations.length,
      circularDependencyCount: cycles.length,
      isolatedFormCount: isolated.length,
    },
    entities: entities.map(e => ({
      formUuid: e.formUuid,
      name: e.name,
      fieldCount: e.fieldCount,
      fields: e.fields.map(f => ({
        fieldId: f.fieldId,
        label: f.label,
        type: f.type,
        isSubTable: f.isSubTable || false,
        associatesTo: f.associatesTo || null,
      })),
    })),
    relations: relations.map(r => ({
      from: r.from,
      fromName: r.fromName,
      to: r.to,
      toName: r.toName,
      type: r.type,
      direction: r.direction,
      viaField: r.viaField,
      fieldId: r.fieldId,
    })),
    circularDependencies: cycles,
    isolatedForms: isolated.map(e => ({
      formUuid: e.formUuid,
      name: e.name,
      fieldCount: e.fieldCount,
    })),
  };
}

// ── Markdown 报告生成 ──────────────────────────────────

/**
 * 生成 Markdown 分析报告
 */
function generateReport(entities, relations, cycles, isolated, uuidToName) {
  const lines = [];

  lines.push('# ER 图分析报告');
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('');

  // 概览
  lines.push('## 概览');
  lines.push('');
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|------|------|`);
  lines.push(`| 表单（实体）数量 | ${entities.length} |`);
  lines.push(`| 关联关系数量 | ${relations.length} |`);
  lines.push(`| 循环依赖数量 | ${cycles.length} |`);
  lines.push(`| 孤立表单数量 | ${isolated.length} |`);
  lines.push('');

  // 实体清单
  lines.push('## 实体清单');
  lines.push('');
  lines.push(`| # | 表单名称 | formUuid | 字段数 |`);
  lines.push(`|---|---------|----------|--------|`);
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    lines.push(`| ${i + 1} | ${e.name} | ${e.formUuid} | ${e.fieldCount} |`);
  }
  lines.push('');

  // 关系清单
  if (relations.length > 0) {
    lines.push('## 关系清单');
    lines.push('');
    lines.push(`| # | 来源表单 | 方向 | 目标表单 | 关系类型 | 经由字段 |`);
    lines.push(`|---|---------|------|---------|---------|---------|`);
    for (let i = 0; i < relations.length; i++) {
      const r = relations[i];
      const toName = uuidToName.get(r.to) || r.toName || r.to;
      lines.push(`| ${i + 1} | ${r.fromName} | ${r.direction} | ${toName} | ${r.type === 'association' ? '关联表单' : '子表'} | ${r.viaField} |`);
    }
    lines.push('');
  }

  // 循环依赖
  if (cycles.length > 0) {
    lines.push('## ⚠️ 循环依赖检测');
    lines.push('');
    lines.push(`检测到 ${cycles.length} 个循环依赖：`);
    lines.push('');
    for (let i = 0; i < cycles.length; i++) {
      const c = cycles[i];
      lines.push(`${i + 1}. **${c.description}**`);
    }
    lines.push('');
    lines.push('> 循环依赖可能导致数据建模隐患，建议审查表单关联关系。');
    lines.push('');
  } else {
    lines.push('## ✅ 循环依赖检测');
    lines.push('');
    lines.push('未检测到循环依赖。');
    lines.push('');
  }

  // 孤立表单
  if (isolated.length > 0) {
    lines.push('## 📋 孤立表单检测');
    lines.push('');
    lines.push(`检测到 ${isolated.length} 个孤立表单（未被任何表单关联）：`);
    lines.push('');
    lines.push(`| # | 表单名称 | formUuid | 字段数 |`);
    lines.push(`|---|---------|----------|--------|`);
    for (let i = 0; i < isolated.length; i++) {
      const e = isolated[i];
      lines.push(`| ${i + 1} | ${e.name} | ${e.formUuid} | ${e.fieldCount} |`);
    }
    lines.push('');
    lines.push('> 孤立表单可能是废表，建议人工确认是否需要清理。');
    lines.push('');
  } else {
    lines.push('## ✅ 孤立表单检测');
    lines.push('');
    lines.push('未检测到孤立表单。');
    lines.push('');
  }

  // Mermaid 图
  lines.push('## ER 关系图');
  lines.push('');
  lines.push('```mermaid');
  lines.push(generateMermaid(entities, relations, uuidToName));
  lines.push('```');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*本报告由 er-diagram 候选 Skill 自动生成（Phase 5-0）*');

  return lines.join('\n');
}

// ── Schema 加载 ────────────────────────────────────────

/**
 * 从本地文件加载 Schema
 */
function loadSchemaFromFile(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Schema 文件不存在: ${absPath}`);
  }
  const content = fs.readFileSync(absPath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Schema 文件 JSON 解析失败: ${absPath} - ${e.message}`);
  }
}

/**
 * 从目录加载所有 Schema JSON 文件
 */
function loadSchemasFromDir(dirPath) {
  const absPath = path.resolve(dirPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`目录不存在: ${absPath}`);
  }

  const schemas = [];
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const schema = loadSchemaFromFile(fullPath);
          // 验证是否为表单 Schema（有 fields / fieldList / formUuid 等）
          if (schema && (schema.fields || schema.fieldList || schema.formUuid ||
            (schema.content && (schema.content.fields || schema.content.fieldList || schema.content.formUuid)))) {
            schemas.push(schema);
          }
        } catch {
          // 跳过非 JSON 或解析失败的文件
        }
      }
    }
  }
  scan(absPath);
  return schemas;
}

/**
 * 从线上获取 Schema（需要登录态）
 */
async function fetchSchemaOnline(appType, formUuid) {
  let httpGet;
  try {
    const httpModule = require(path.join(PROJECT_ROOT, 'lib', 'core', 'http.js'));
    httpGet = httpModule.httpGet;
  } catch {
    throw new Error('无法加载 lib/core/http.js，请确认公共库已安装');
  }

  const apiPath = `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json?formUuid=${formUuid}&schemaVersion=V5`;
  const result = await httpGet(apiPath);

  if (!result.success) {
    throw new Error(`获取 Schema 失败: ${result.errorMsg || '未知错误'} (formUuid: ${formUuid})`);
  }

  return result.content || result.data;
}

// ── 主流程 ─────────────────────────────────────────────

/**
 * 解析命令行参数
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    file: null,
    files: null,
    dir: null,
    appType: null,
    forms: null,
    output: DEFAULT_OUTPUT_DIR,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        opts.file = args[++i];
        break;
      case '--files':
        opts.files = args[++i];
        break;
      case '--dir':
        opts.dir = args[++i];
        break;
      case '--appType':
        opts.appType = args[++i];
        break;
      case '--forms':
        opts.forms = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        // 忽略未知参数
        break;
    }
  }

  return opts;
}

function printUsage() {
  console.log(`
宜搭表单实体关系图（ER Diagram）生成器

用法:
  node generate-er.js --file <schema.json>
  node generate-er.js --files <a.json>,<b.json>,<c.json>
  node generate-er.js --dir <schema-dir>
  node generate-er.js --appType <appType> --forms <uuid1>,<uuid2>
  node generate-er.js --dir <schema-dir> --output <output-dir>

参数:
  --file <path>        单个 Schema JSON 文件
  --files <paths>      多个 Schema JSON 文件（逗号分隔）
  --dir <path>         目录下所有 Schema JSON 文件
  --appType <appType>  应用 ID（在线获取模式）
  --forms <uuids>      表单 UUID 列表（逗号分隔，配合 --appType）
  --output <path>      输出目录（默认 .cache/er-diagram/）
  --help               显示帮助

输出文件:
  er-diagram.mmd       Mermaid ER 图
  er-diagram.json      JSON 结构化数据
  er-report.md         Markdown 分析报告

风险等级: R1（只读，不修改线上数据）
`);
}

/**
 * 主函数
 */
async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  // 验证参数
  if (!opts.file && !opts.files && !opts.dir && !opts.appType) {
    printUsage();
    process.exit(1);
  }

  console.log('=== ER 图生成器 ===');
  console.log('');

  // 加载 Schema
  let schemas = [];

  if (opts.file) {
    console.log(`加载 Schema 文件: ${opts.file}`);
    schemas.push(loadSchemaFromFile(opts.file));
  } else if (opts.files) {
    const filePaths = opts.files.split(',').map(s => s.trim()).filter(Boolean);
    console.log(`加载 ${filePaths.length} 个 Schema 文件...`);
    for (const fp of filePaths) {
      schemas.push(loadSchemaFromFile(fp));
    }
  } else if (opts.dir) {
    console.log(`扫描目录: ${opts.dir}`);
    schemas = loadSchemasFromDir(opts.dir);
    console.log(`找到 ${schemas.length} 个 Schema 文件`);
  } else if (opts.appType && opts.forms) {
    const formUuids = opts.forms.split(',').map(s => s.trim()).filter(Boolean);
    console.log(`在线获取 ${formUuids.length} 个表单 Schema...`);
    console.log(`应用 ID: ${opts.appType}`);
    for (const uuid of formUuids) {
      try {
        const schema = await fetchSchemaOnline(opts.appType, uuid);
        schemas.push(schema);
        console.log(`  ✅ ${uuid}`);
      } catch (err) {
        console.error(`  ❌ ${uuid}: ${err.message}`);
      }
    }
  }

  if (schemas.length === 0) {
    console.error('未找到任何 Schema，请检查输入参数。');
    process.exit(1);
  }

  console.log(`\n共加载 ${schemas.length} 个表单 Schema`);

  // 解析 Schema
  console.log('\n解析 Schema...');
  const entities = [];
  const relations = [];
  const uuidToName = new Map();

  for (const schema of schemas) {
    try {
      const { entity, relations: entityRelations } = parseSchema(schema);
      entities.push(entity);
      relations.push(...entityRelations);
      uuidToName.set(entity.formUuid, entity.name);
      console.log(`  ✅ ${entity.name} (${entity.formUuid}) - ${entity.fieldCount} 字段, ${entityRelations.length} 关系`);
    } catch (err) {
      console.error(`  ❌ 解析失败: ${err.message}`);
    }
  }

  if (entities.length === 0) {
    console.error('未能从 Schema 中解析出任何实体。');
    process.exit(1);
  }

  // 补充关系中的表单名称（被关联表单可能不在输入列表中）
  for (const rel of relations) {
    if (!uuidToName.has(rel.to)) {
      uuidToName.set(rel.to, rel.toName || rel.to);
    }
  }

  // 检测循环依赖
  console.log('\n检测循环依赖...');
  const cycles = detectCircularDependencies(relations, uuidToName);
  if (cycles.length > 0) {
    console.log(`  ⚠️ 检测到 ${cycles.length} 个循环依赖`);
    for (const c of cycles) {
      console.log(`     ${c.description}`);
    }
  } else {
    console.log('  ✅ 未检测到循环依赖');
  }

  // 检测孤立表单
  console.log('\n检测孤立表单...');
  const isolated = detectIsolatedForms(entities, relations);
  if (isolated.length > 0) {
    console.log(`  📋 检测到 ${isolated.length} 个孤立表单`);
    for (const e of isolated) {
      console.log(`     ${e.name} (${e.formUuid})`);
    }
  } else {
    console.log('  ✅ 未检测到孤立表单');
  }

  // 生成输出
  console.log('\n生成输出文件...');
  const outputDir = path.resolve(opts.output);
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Mermaid ER 图
  const mermaidContent = generateMermaid(entities, relations, uuidToName);
  const mermaidPath = path.join(outputDir, 'er-diagram.mmd');
  fs.writeFileSync(mermaidPath, mermaidContent, 'utf-8');
  console.log(`  ✅ Mermaid ER 图: ${mermaidPath}`);

  // 2. JSON 结构化数据
  const jsonContent = generateJson(entities, relations, cycles, isolated);
  const jsonPath = path.join(outputDir, 'er-diagram.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2), 'utf-8');
  console.log(`  ✅ JSON 数据: ${jsonPath}`);

  // 3. Markdown 分析报告
  const reportContent = generateReport(entities, relations, cycles, isolated, uuidToName);
  const reportPath = path.join(outputDir, 'er-report.md');
  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  console.log(`  ✅ 分析报告: ${reportPath}`);

  // 汇总
  console.log('\n=== 生成完成 ===');
  console.log(`实体数: ${entities.length}`);
  console.log(`关系数: ${relations.length}`);
  console.log(`循环依赖: ${cycles.length}`);
  console.log(`孤立表单: ${isolated.length}`);
  console.log(`输出目录: ${outputDir}`);
}

// 模块导出（供测试和外部调用）
module.exports = {
  parseSchema,
  extractFormName,
  extractFormUuid,
  extractFields,
  extractFieldId,
  extractFieldLabel,
  extractFieldType,
  extractAssociatedFormUuid,
  detectCircularDependencies,
  detectIsolatedForms,
  generateMermaid,
  generateJson,
  generateReport,
  loadSchemaFromFile,
  loadSchemasFromDir,
};

// 命令行入口
if (require.main === module) {
  main().catch(err => {
    console.error('ER 图生成失败:', err.message);
    process.exit(1);
  });
}
