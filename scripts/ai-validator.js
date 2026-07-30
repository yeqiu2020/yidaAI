const fs = require('fs');
const path = require('path');

/**
 * ai-validator.js
 * 版本: v1.8.0
 * 更新记录:
 * - v1.8.0 (2026-07-30): 【新增】CLI 校验失败时以非零退出码结束（printResult），使 git pre-commit 钩子 / npm 脚本 / CI 可确定性拦截违规；被 require 引用时不再执行 CLI 分发
 * - v1.7.0 (2026-07-24): 【新增】check-formula-refs 命令，校验公式JSON的字段引用与marks一致性（占位符数与marks数对齐、无残留invalid:true、value非占位符），可选传字段集做存在性校验；堵住弱模型手写/编辑公式JSON时marks错乱导致的运行失败
 * - v1.6.3 (2026-07-19): 【修复】check-after-write 序号冲突校验允许同序号的提示词文件与代码JS文件共存（如 2.xxx提示词.md 与 2.xxx.js）
 * - v1.6.2 (2026-07-18): 【修复】check-after-write 序号冲突校验允许同序号的提示词文件与公式JSON文件共存（如 1.xxx提示词.md 与 1.xxx.json）
 * - v1.6.1 (2026-07-15): 【修复】字段清单结构校验排除使用说明区域逻辑兼容 *** 分隔符；数据标题字段校验支持多字段组合（如"产品分类--产品名称"）
 * - v1.6.0 (2026-07-15): 【新增】check-fill-rule-syntax 命令，校验填充规则的"="格式和分隔符语法；统一所有填充规则分隔符为 FILLING_PAIR_SEPARATOR 常量；修复 collectFillTargetsInSection 和 checkFillRulesInSection 分隔符不一致问题
 * - v1.5.0 (2026-07-15): 【统一】所有填充规则解析处使用统一 FILLING_PAIR_SEPARATOR 正则常量，与 create_from_markdown.js 保持一致，避免校验器比执行器更宽容导致"校验通过但运行失败"
 * - v1.4.0 (2026-07-13): 【新增】check-serial-prefixes 命令，校验流水号前缀必须为2位大写字母
 * - v1.3.0 (2026-07-12): 【新增】check-fill-targets 命令，校验关联表单填充规则的目标字段是否存在于表单中，防止被填充字段遗漏
 * - v1.2.0 (2026-07-09): 【新增】check-association-fields 命令，校验字段清单中是否缺少关联表单字段，防止excel-to-form步骤3.5被遗漏
 * - v1.1.0 (2026-07-05): 【修复】字段清单结构校验排除使用说明区域，避免"**数据标题：**"示例被误统计
 * - v1.0.0: 初始版本
 */

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// 填充规则分隔符正则常量（穷举兼容所有可能符号）
// 规范：字段清单中多个"当前字段=源字段"对之间推荐用顿号"、"分隔
// 但解析时必须穷举兼容：顿号、中文逗号，英文逗号,中文分号；英文分号;
// 此常量必须与 create_from_markdown.js 中的 FILLING_PAIR_SEPARATOR 保持一致
// 历史教训：v1.5.0之前 collectFillTargetsInSection 用 /[,，、；;]/，
//          checkFillRulesInSection 用 /[,，、；;]/，create_from_markdown.js 用 /[，、]/，
//          三处不一致导致"校验通过但运行失败"
const FILLING_PAIR_SEPARATOR = /[、，,；;]/;

function validatePromptFile(targetDir, proposedFileName) {
  const results = { valid: true, errors: [], warnings: [], info: {} };

  if (!fs.existsSync(targetDir)) {
    results.warnings.push(`目标目录不存在: ${targetDir}，将自动创建`);
    results.info.nextIndex = 1;
    results.info.existingFiles = [];
    return results;
  }

  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
  results.info.existingFiles = files;

  const indexPattern = /^(\d+)\./;
  let maxIndex = 0;
  const usedIndices = [];
  const usedNames = [];

  files.forEach(file => {
    const match = file.match(indexPattern);
    if (match) {
      const idx = parseInt(match[1], 10);
      usedIndices.push(idx);
      usedNames.push(file);
      if (idx > maxIndex) maxIndex = idx;
    }
  });

  results.info.maxIndex = maxIndex;
  results.info.nextIndex = maxIndex + 1;
  results.info.usedIndices = usedIndices.sort((a, b) => a - b);

  if (proposedFileName) {
    if (files.includes(proposedFileName)) {
      results.valid = false;
      results.errors.push(`文件已存在，严禁覆盖: ${proposedFileName}`);
    }

    const proposedMatch = proposedFileName.match(indexPattern);
    if (proposedMatch) {
      const proposedIndex = parseInt(proposedMatch[1], 10);
      if (usedIndices.includes(proposedIndex)) {
        results.valid = false;
        results.errors.push(`序号 ${proposedIndex} 已被占用（${usedNames.find(n => n.startsWith(proposedIndex + '.'))}），请使用序号 ${results.info.nextIndex}`);
      }
    }

    const proposedPath = path.join(targetDir, proposedFileName);
    if (fs.existsSync(proposedPath)) {
      results.valid = false;
      results.errors.push(`文件已存在于磁盘，严禁覆盖: ${proposedFileName}`);
    }
  }

  return results;
}

function validateAppId(value) {
  const results = { valid: true, errors: [] };
  const placeholders = ['{APP_ID}', '{APPID}', 'APP_XXX', '需从系统配置获取', '待填写', 'TODO', 'PLACEHOLDER'];

  if (!value || value.trim() === '') {
    results.valid = false;
    results.errors.push('应用ID为空，必须从系统配置清单.md读取真实值');
    return results;
  }

  placeholders.forEach(ph => {
    if (value.includes(ph)) {
      results.valid = false;
      results.errors.push(`应用ID包含占位符 "${ph}"，必须填入真实值`);
    }
  });

  return results;
}

function validateFormUuid(value) {
  const results = { valid: true, errors: [] };
  const placeholders = ['{FORM_UUID}', '{FORMUUID}', 'FORM-XXX', '需从系统配置获取', '待填写', 'TODO', 'PLACEHOLDER'];

  if (!value || value.trim() === '') {
    results.valid = false;
    results.errors.push('表单UUID为空，必须从系统配置清单.md读取真实值');
    return results;
  }

  placeholders.forEach(ph => {
    if (value.includes(ph)) {
      results.valid = false;
      results.errors.push(`表单UUID包含占位符 "${ph}"，必须填入真实值`);
    }
  });

  return results;
}

function validateFormulaFunctions(formulaText) {
  const results = { valid: true, errors: [], warnings: [] };
  const knownFunctions = [
    'IF', 'AND', 'OR', 'NOT', 'CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'LEN',
    'FIND', 'SEARCH', 'SUBSTITUTE', 'REPLACE', 'TRIM', 'UPPER', 'LOWER',
    'VALUE', 'TEXT', 'DATE', 'NOW', 'TODAY', 'DATEDIF', 'YEAR', 'MONTH',
    'DAY', 'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'ROUND', 'ROUNDUP',
    'ROUNDDOWN', 'INT', 'MOD', 'ABS', 'POWER', 'SUM', 'AVERAGE', 'COUNT',
    'MAX', 'MIN', 'COUNTIF', 'SUMIF', 'AVERAGEIF', 'LOOKUP', 'VLOOKUP',
    'INDEX', 'MATCH', 'GETUSERID', 'GETUSERNAME', 'GETDEPARTMENT',
    'RECURRENCE', 'MAPARRAY', 'ARRAYGET', 'STRING', 'NUMBER', 'BOOLEAN',
    'DATETONUMBER', 'NUMBERTODATE', 'TIMESTAMP', 'UUID', 'EMPTY',
    'ISEMPTY', 'NOTEMPTY', 'EQ', 'NE', 'GT', 'GE', 'LT', 'LE',
    'CONTAINS', 'NOTCONTAINS', 'STARTSWITH', 'ENDSWITH',
    'REGTEST', 'GETRECORDS', 'GETRECORD', 'CREATERECORD', 'UPDATERECORD',
    'DELETERECORD'
  ];

  const funcPattern = /\b([A-Z]{2,})\s*\(/g;
  let match;
  while ((match = funcPattern.exec(formulaText)) !== null) {
    const funcName = match[1];
    if (!knownFunctions.includes(funcName)) {
      results.warnings.push(`函数 ${funcName} 不在已知函数列表中，请确认来源是否为官方文档`);
    }
  }

  return results;
}

/**
 * 校验公式 JSON 的字段引用与 marks 一致性（v1.7.0 新增）
 * 宜搭公式 text 中的字段引用用零宽字符 U+200B 成对包裹，每个引用在 marks[] 中对应一项：
 *   mark.value 为真实 fieldId，mark.invalid=true 表示该字段不存在/已删除。
 * 弱模型手写或编辑公式 JSON 时最常见的翻车是：marks 与 text 中的占位符数量不对齐、
 * 残留 invalid:true、或 value 仍是占位符——这些都会导致公式在宜搭里解析错乱/失效。
 * 可选第二参数 fieldSource：传入表单 Schema / 字段清单 JSON 文件路径时，额外校验每个 fieldId 是否真实存在。
 */
function validateFormulaReferences(filePath, fieldSource) {
  const results = { valid: true, errors: [], warnings: [], info: {} };
  const ZW = '\u200B';

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`公式文件不存在: ${filePath}`);
    return results;
  }

  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    results.valid = false;
    results.errors.push(`公式 JSON 解析失败: ${e.message}`);
    return results;
  }

  const text = typeof obj.text === 'string' ? obj.text : '';
  const marks = Array.isArray(obj.marks) ? obj.marks : [];

  if (!text) {
    results.valid = false;
    results.errors.push('公式缺少 text 字段或 text 为空');
    return results;
  }

  // 1. 零宽分隔符必须成对（每个字段引用由一对 U+200B 包裹）
  let zwCount = 0;
  for (const ch of text) if (ch === ZW) zwCount++;
  if (zwCount % 2 !== 0) {
    results.valid = false;
    results.errors.push(`公式 text 中零宽分隔符(U+200B)数量为奇数(${zwCount})，字段引用未成对包裹，公式会解析错乱`);
  }
  const refCount = Math.floor(zwCount / 2);
  results.info.refCount = refCount;
  results.info.markCount = marks.length;

  // 2. 引用数与 marks 数必须一致（弱模型最常见翻车点）
  if (refCount !== marks.length) {
    results.valid = false;
    results.errors.push(`字段引用数(${refCount})与 marks 数(${marks.length})不一致，marks 未与占位符对齐，公式必然失效`);
  }

  // 3. 可选：加载表单字段集合用于存在性校验（仅在显式传入时启用）
  let allowed = null;
  if (fieldSource) {
    if (!fs.existsSync(fieldSource)) {
      results.warnings.push(`字段来源文件不存在，跳过存在性校验: ${fieldSource}`);
    } else {
      const raw = fs.readFileSync(fieldSource, 'utf-8');
      const ids = raw.match(/[a-zA-Z]+Field_[a-z0-9]+/g) || [];
      allowed = new Set(ids);
      if (allowed.size === 0) {
        results.warnings.push('字段来源文件中未解析到任何 fieldId，跳过存在性校验');
        allowed = null;
      }
    }
  }

  // 4. 逐个 mark 校验：value 非空/非占位符、无 invalid:true、位置区间合法、（可选）存在于字段集
  const placeholderPat = /(待填写|TODO|PLACEHOLDER|XXX|fieldId|组件ID)/i;
  marks.forEach((m, i) => {
    const v = m && typeof m.value === 'string' ? m.value : '';
    if (!v) {
      results.valid = false;
      results.errors.push(`第 ${i + 1} 个 mark 的 value 为空，字段引用缺少对应 fieldId`);
    } else {
      if (placeholderPat.test(v)) {
        results.valid = false;
        results.errors.push(`第 ${i + 1} 个字段引用的 value "${v}" 是占位符，必须替换为真实 fieldId`);
      } else if (v.indexOf('_') === -1) {
        results.warnings.push(`第 ${i + 1} 个字段引用的 value "${v}" 不含下划线，可能不是合法 fieldId，请确认`);
      }
      if (allowed && !allowed.has(v)) {
        results.valid = false;
        results.errors.push(`字段引用 "${v}" 不存在于提供的表单字段集合中`);
      }
    }
    if (m && m.invalid === true) {
      results.valid = false;
      results.errors.push(`第 ${i + 1} 个字段引用 "${v}" 标记为 invalid:true，该字段在表单中不存在或已被删除`);
    }
    if (m && m.from && m.to && typeof m.from.ch === 'number' && typeof m.to.ch === 'number' && m.to.ch <= m.from.ch) {
      results.warnings.push(`第 ${i + 1} 个 mark 的位置区间无效(from.ch=${m.from.ch} >= to.ch=${m.to.ch})`);
    }
  });

  return results;
}

function validateAfterWrite(filePath) {
  const results = { valid: true, errors: [], warnings: [] };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const placeholders = ['{APP_ID}', '{FORM_UUID}', '需从系统配置获取', '待填写', 'TODO', 'PLACEHOLDER', 'FORM-XXX', 'APP_XXX'];
  placeholders.forEach(ph => {
    if (content.includes(ph)) {
      results.valid = false;
      results.errors.push(`文件包含占位符 "${ph}"，必须替换为真实值`);
    }
  });

  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
  const indexPattern = /^(\d+)\./;
  const match = fileName.match(indexPattern);
  if (match) {
    const idx = parseInt(match[1], 10);
    const duplicates = files.filter(f => {
      const m = f.match(indexPattern);
      if (!m || parseInt(m[1], 10) !== idx || f === fileName) return false;
      // 允许同序号的提示词文件与公式JSON文件/代码JS文件共存
      // 例如：1.xxx提示词.md 与 1.xxx.json；2.xxx提示词.md 与 2.xxx.js
      const currentIsPrompt = fileName.endsWith('提示词.md');
      const currentIsFormula = fileName.endsWith('.json') && !fileName.endsWith('提示词.md');
      const currentIsCode = fileName.endsWith('.js');
      const otherIsPrompt = f.endsWith('提示词.md');
      const otherIsFormula = f.endsWith('.json') && !f.endsWith('提示词.md');
      const otherIsCode = f.endsWith('.js');
      if ((currentIsPrompt && (otherIsFormula || otherIsCode)) ||
          ((currentIsFormula || currentIsCode) && otherIsPrompt)) return false;
      return true;
    });
    if (duplicates.length > 0) {
      results.valid = false;
      results.errors.push(`序号 ${idx} 与已有文件冲突: ${duplicates.join(', ')}`);
    }
  }

  // 自动校验字段清单结构（参照 flow-to-form/references/字段清单模板.md）
  if (fileName.includes('字段清单')) {
    const structureResult = validateFieldListStructure(filePath);
    if (!structureResult.valid) {
      results.valid = false;
      results.errors.push(...structureResult.errors);
    }
    if (structureResult.info) {
      results.info = structureResult.info;
    }
  }

  return results;
}

function validateBeforeWrite(targetPath) {
  const results = { valid: true, errors: [], warnings: [] };

  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    const ext = path.extname(targetPath).toLowerCase();
    const isPromptFile = /^\d+\./.test(path.basename(targetPath));

    if (isPromptFile && (ext === '.md' || ext === '.json')) {
      results.valid = false;
      results.errors.push(`提示词文件已存在，严禁覆盖: ${targetPath}（规则20：每个提示词必须是独立文件）`);
    } else {
      results.warnings.push(`文件已存在，将被覆盖: ${targetPath}，请确认是否为预期行为`);
    }
  }

  return results;
}

function validateSaveFormSchema(formUuid, isNewForm) {
  const results = { valid: true, errors: [], warnings: [] };

  if (!isNewForm) {
    results.valid = false;
    results.errors.push(`禁止对已有表单调用 saveFormSchema（规则25），表单UUID: ${formUuid}。已有应用的公式/代码/字段只能通过复制粘贴方式手动操作`);
  }

  return results;
}

function validateContentPlaceholders(content) {
  const results = { valid: true, errors: [], warnings: [] };
  const placeholders = ['{APP_ID}', '{FORM_UUID}', '需从系统配置获取', '待填写', 'TODO', 'PLACEHOLDER', 'FORM-XXX', 'APP_XXX', 'CONFIG.TARGET_FORM'];

  placeholders.forEach(ph => {
    if (content.includes(ph)) {
      results.valid = false;
      results.errors.push(`内容包含占位符 "${ph}"，必须替换为真实值（规则24）`);
    }
  });

  return results;
}

function validateCookiePath(cookieFilePath) {
  const results = { valid: true, errors: [], warnings: [] };
  const expectedPath = path.join(PROJECT_ROOT, '.cookies.json');
  const normalizedInput = path.resolve(cookieFilePath);

  if (normalizedInput !== expectedPath) {
    results.valid = false;
    results.errors.push(`Cookie路径错误: ${cookieFilePath}，必须使用项目根目录: ${expectedPath}（规则26）`);
  }

  return results;
}

function validateFieldListStructure(filePath) {
  const results = { valid: true, errors: [], warnings: [] };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // 仅对"字段清单.md"进行结构校验
  if (!fileName.includes('字段清单')) {
    return results;
  }

  // 1. 校验前置说明
  if (!content.includes('## 📋 字段清单使用说明')) {
    results.valid = false;
    results.errors.push('缺少"## 📋 字段清单使用说明"前置说明（参照 flow-to-form/references/字段清单模板.md）');
  }

  // 2. 统计表单数量（通过 "### (" 匹配）
  const formMatches = content.match(/### \([一二三四五六七八九十]+\)/g) || [];
  const formCount = formMatches.length;

  if (formCount === 0) {
    results.valid = false;
    results.errors.push('未检测到任何表单定义');
    return results;
  }

  // 3. 校验数据标题行数量（排除使用说明中的示例）
  // 使用说明结束于第一个模块标题 "## 一、" 之前，兼容 *** 或 --- 等分隔符
  const guideEndMatch = content.match(/## 📋 字段清单使用说明[\s\S]*?(?=\n## [一二三四五六七八九十]+、)/);
  const contentForStructureCheck = guideEndMatch ? content.substring(guideEndMatch.index + guideEndMatch[0].length) : content;
  const dataTitleMatches = contentForStructureCheck.match(/\*\*数据标题：/g) || [];
  if (dataTitleMatches.length !== formCount) {
    results.valid = false;
    results.errors.push(`数据标题行数量(${dataTitleMatches.length})与表单数量(${formCount})不一致，每个表单必须有"**数据标题：XXX**"行`);
  }

  // 4. 校验主表名称标识数量（格式：**主表：{表单名称}**）
  const mainTableMatches = contentForStructureCheck.match(/\*\*主表：/g) || [];
  if (mainTableMatches.length !== formCount) {
    results.valid = false;
    results.errors.push(`"**主表：{表单名称}**"标识数量(${mainTableMatches.length})与表单数量(${formCount})不一致，每个表单必须有主表名称标识`);
  }

  // 5. 校验文件链接格式
  if (!content.includes('**文件链接**:')) {
    results.valid = false;
    results.errors.push('缺少"**文件链接**: [规则清单.md](./规则清单.md)"格式的文件链接');
  }

  const fileLinkMatches = content.match(/\*\*文件链接\*\*:/g) || [];
  if (fileLinkMatches.length > 1) {
    results.valid = false;
    results.errors.push(`"**文件链接**:" 出现 ${fileLinkMatches.length} 次，字段清单末尾只能保留一个文件链接`);
  }

  const dataTitleResult = validateDataTitleFields(content);
  if (!dataTitleResult.valid) {
    results.valid = false;
    results.errors.push(...dataTitleResult.errors);
  }

  if (results.valid) {
    results.info = { formCount, dataTitleCount: dataTitleMatches.length, mainTableCount: mainTableMatches.length };
  }

  return results;
}

function validateDataTitleFields(content) {
  const results = { valid: true, errors: [] };
  const formSections = content.split(/### \([一二三四五六七八九十]+\)/);

  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];
    const mainFormMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!mainFormMatch) continue;

    const formName = mainFormMatch[1];
    const dataTitleMatch = section.match(/\*\*数据标题：(.+?)\*\*/);
    if (!dataTitleMatch) continue;

    const dataTitle = dataTitleMatch[1].replace(/（.*$/, '').trim();
    if (!dataTitle || dataTitle.includes('需手动指定')) continue;

    const mainContent = section.split(/\*\*子表：/)[0];
    const mainFields = extractFieldNames(mainContent);

    // 支持多字段组合数据标题（如"产品分类--产品名称"），按非词字符拆分后逐个校验
    const titleFields = dataTitle.match(/[\p{L}\p{N}_]+/gu) || [];
    for (const field of titleFields) {
      if (!mainFields.includes(field)) {
        results.valid = false;
        results.errors.push(`[${formName}] 数据标题字段"${field}"不存在于主表字段中`);
      }
    }
  }

  return results;
}

/**
 * 校验字段清单中是否缺少关联表单字段（v1.2.0新增）
 * 基于常见关联场景，检查每个表单中应有关联表单字段是否确实为"关联表单"类型
 * 此校验不强制要求所有场景必须有关联字段，而是提示AI检查可能的遗漏
 */
function validateAssociationFields(filePath) {
  const results = { valid: true, errors: [], warnings: [], info: { checkedCount: 0, suspectFields: [] } };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // 仅对"字段清单.md"进行校验
  if (!fileName.includes('字段清单')) {
    return results;
  }

  // 提取所有表单名（用于判断关联目标是否存在）
  const formNameMatches = content.match(/\*\*主表：(.+?)\*\*/g) || [];
  const formNames = formNameMatches.map(m => m.replace(/\*\*主表：/, '').replace(/\*\*/, ''));
  const fillTargetFields = collectFillTargetFields(content);
  const formSections = content.split(/### \([一二三四五六七八九十]+\)/);
  
  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];
    
    // 提取表单名
    const formNameMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!formNameMatch) continue;
    const currentFormName = formNameMatch[1];
    const sectionParts = section.split(/\*\*子表：(.+?)\*\*/);
    inspectAssociationSection(sectionParts[0], currentFormName, formNames, fillTargetFields, results);

    for (let j = 1; j < sectionParts.length; j += 2) {
      const subTableName = sectionParts[j];
      const subTableContent = sectionParts[j + 1] || '';
      inspectAssociationSection(subTableContent, `${currentFormName}.${subTableName}`, formNames, fillTargetFields, results);
    }
  }

  // 统计发现的可疑字段数
  if (results.info.suspectFields.length > 0) {
    const existingTargets = results.info.suspectFields.filter(f => f.targetExists).length;
    results.warnings.unshift(
      `⚠️ 发现 ${results.info.suspectFields.length} 个可疑字段可能缺少关联表单类型（其中 ${existingTargets} 个目标表单已存在，建议人工或AI确认）`
    );
  }

  return results;
}

function inspectAssociationSection(tableContent, scopeName, formNames, fillTargetFields, results) {
  const tableRows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];

  for (const row of tableRows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;

    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 3) continue;

    const fieldName = cells[0] || '';
    const fieldType = cells[1] || '';
    const fieldDesc = cells[2] || '';

    if (['创建人', '创建时间'].includes(fieldName)) continue;
    if (fieldType === '流水号') continue;
    if (fieldType === '数值' && /(上限|下限|数量|金额|余额|额度|比例|比率|税率|单价|总额|合计)$/.test(fieldName)) continue;
    if (!fieldName.includes('关联订单') && /(编号|单号|流水号)$/.test(fieldName)) continue;
    if (fillTargetFields.has(makeScopedFieldKey(scopeName, fieldName))) continue;

    const matchedTargetForm = findPotentialAssociationTarget(fieldName, scopeName, formNames);
    if (matchedTargetForm && fieldType !== '关联表单' && !fieldDesc.includes('关联-->')) {
      results.info.checkedCount++;
      results.info.suspectFields.push({
        formName: scopeName,
        fieldName,
        currentType: fieldType,
        expectedType: '关联表单',
        reason: `字段名与表单"${matchedTargetForm}"存在名称匹配`,
        targetExists: true
      });
      results.warnings.push(
        `可疑字段 [${scopeName}.${fieldName}]：当前类型为"${fieldType}"，字段名与表单"${matchedTargetForm}"存在名称匹配，可能应由AI确认是否为关联表单`
      );
    }
  }
}

function normalizeAssociationName(name) {
  return String(name || '')
    .replace(/[《》「」"'“”‘’\s]/g, '')
    .replace(/信息$|档案$|列表$|清单$|表$/g, '');
}

function findPotentialAssociationTarget(fieldName, currentFormName, formNames) {
  const normalizedFieldName = normalizeAssociationName(fieldName);
  if (normalizedFieldName.length < 2) return null;

  return formNames.find(formName => {
    if (formName === currentFormName) return false;
    const normalizedFormName = normalizeAssociationName(formName);
    if (normalizedFormName.length < 2) return false;
    return normalizedFieldName === normalizedFormName ||
      fieldName.includes(formName) ||
      formName.includes(fieldName) ||
      normalizedFieldName.includes(normalizedFormName) ||
      normalizedFormName.includes(normalizedFieldName);
  }) || null;
}

function makeScopedFieldKey(scopeName, fieldName) {
  return `${scopeName}::${fieldName}`;
}

function collectFillTargetFields(content) {
  const targets = new Set();
  const formSections = content.split(/### \([一二三四五六七八九十]+\)/);

  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];
    const mainFormMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!mainFormMatch) continue;

    const mainFormName = mainFormMatch[1];
    const subTableSplits = section.split(/\*\*子表：(.+?)\*\*/);
    collectFillTargetsInSection(subTableSplits[0], mainFormName, targets);

    for (let j = 1; j < subTableSplits.length; j += 2) {
      const subTableName = subTableSplits[j];
      const subTableContent = subTableSplits[j + 1] || '';
      collectFillTargetsInSection(subTableContent, `${mainFormName}.${subTableName}`, targets);
    }
  }

  return targets;
}

function collectFillTargetsInSection(tableContent, scopeName, targets) {
  const rows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];

  for (const row of rows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;

    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 3) continue;

    const fieldType = cells[1] || '';
    const fieldDesc = cells[2] || '';
    if (fieldType !== '关联表单' && !fieldDesc.includes('关联-->')) continue;
    if (!fieldDesc.includes('填充：')) continue;

    const fillMatch = fieldDesc.match(/填充：(.+)/);
    if (!fillMatch) continue;

    fillMatch[1]
      .split(FILLING_PAIR_SEPARATOR)
      .map(rule => rule.trim())
      .filter(Boolean)
      .forEach(rule => {
        const targetFieldName = rule.split('=')[0].trim();
        if (targetFieldName) {
          targets.add(makeScopedFieldKey(scopeName, targetFieldName));
        }
      });
  }
}

/**
 * 校验关联表单填充规则的目标字段是否存在于表单中
 * 解决问题：AI添加填充规则后，未同步添加被填充字段，导致填充无处落地
 */
function validateFillTargets(filePath) {
  const results = { valid: true, errors: [], warnings: [], info: { checkedCount: 0, missingFields: [] } };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  if (!fileName.includes('字段清单')) {
    return results;
  }

  // 解析每个表单区域（主表+子表）
  const formSections = content.split(/### \(/);

  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];

    // 提取主表名
    const mainFormMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!mainFormMatch) continue;
    const mainFormName = mainFormMatch[1];

    // 将 section 拆分为主表部分和子表部分
    const subTableSplits = section.split(/\*\*子表：(.+?)\*\*/);
    // subTableSplits[0] = 主表内容, [1] = 子表1名称, [2] = 子表1内容, ...

    // 收集主表字段
    const mainFields = extractFieldNames(subTableSplits[0]);

    // 检查主表中的关联字段及其填充规则
    checkFillRulesInSection(subTableSplits[0], mainFormName, mainFields, results);

    // 收集并检查子表
    for (let j = 1; j < subTableSplits.length; j += 2) {
      const subTableName = subTableSplits[j];
      const subTableContent = subTableSplits[j + 1] || '';
      const subFields = extractFieldNames(subTableContent);
      checkFillRulesInSection(subTableContent, mainFormName + '.' + subTableName, subFields, results);
    }
  }

  if (results.info.missingFields.length > 0) {
    results.valid = false;
    results.errors.unshift(
      `❌ 发现 ${results.info.missingFields.length} 个填充目标字段缺失！每个关联字段的填充规则必须有对应的被填充字段来接收数据。`
    );
  } else {
    results.warnings.push('✅ 所有关联表单的填充目标字段均已存在，无遗漏。');
  }

  return results;
}

/**
 * 从Markdown表格内容中提取所有字段名
 */
function extractFieldNames(tableContent) {
  const names = [];
  const rows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];
  for (const row of rows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;
    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length > 0) {
      names.push(cells[0]);
    }
  }
  return names;
}

/**
 * 检查一个区域（主表或子表）中的关联字段填充规则，验证目标字段是否存在
 */
function checkFillRulesInSection(tableContent, formName, existingFields, results) {
  const rows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];

  for (const row of rows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;

    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 3) continue;

    const fieldName = cells[0] || '';
    const fieldType = cells[1] || '';
    const fieldDesc = cells[2] || '';

    // 只处理包含填充规则的关联表单字段
    if (fieldType !== '关联表单' && !fieldDesc.includes('关联-->')) continue;
    if (!fieldDesc.includes('填充：')) continue;

    results.info.checkedCount++;

    // 解析填充规则：格式为 "关联-->目标表单；填充：字段A=源A，字段B=源B"
    const fillMatch = fieldDesc.match(/填充：(.+)/);
    if (!fillMatch) continue;

    const fillPart = fillMatch[1];
    const fillPairs = fillPart.split(FILLING_PAIR_SEPARATOR);

    for (const pair of fillPairs) {
      const pairTrimmed = pair.trim();
      const eqMatch = pairTrimmed.match(/^(.+?)=(.+)$/);
      if (!eqMatch) continue;

      const targetFieldName = eqMatch[1].trim(); // 当前表单中的被填充字段名
      // sourceFieldName = eqMatch[2].trim() // 源表单中的字段名（不需要校验）

      // 检查被填充字段是否存在于当前表单的字段列表中
      if (!existingFields.includes(targetFieldName)) {
        results.info.missingFields.push({
          formName: formName,
          associationField: fieldName,
          missingTargetField: targetFieldName,
          fillRule: pairTrimmed
        });
        results.errors.push(
          `[${formName}] 关联字段"${fieldName}"的填充规则"${pairTrimmed}"中，目标字段"${targetFieldName}"在当前表单中不存在！需添加该被填充字段（类型通常为单行文本/数值/地址等，状态为只读）`
        );
      }
    }
  }
}

function validateDuplicateFields(filePath) {
  const results = { valid: true, errors: [], warnings: [], info: { duplicateFields: [] } };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  if (!fileName.includes('字段清单')) {
    return results;
  }

  const formSections = content.split(/### \([一二三四五六七八九十]+\)/);
  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];
    const mainFormMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!mainFormMatch) continue;

    const mainFormName = mainFormMatch[1];
    const sectionParts = section.split(/\*\*子表：(.+?)\*\*/);
    collectDuplicateFieldsInSection(sectionParts[0], mainFormName, results);

    for (let j = 1; j < sectionParts.length; j += 2) {
      const subTableName = sectionParts[j];
      const subTableContent = sectionParts[j + 1] || '';
      collectDuplicateFieldsInSection(subTableContent, `${mainFormName}.${subTableName}`, results);
    }
  }

  if (results.info.duplicateFields.length > 0) {
    results.valid = false;
    results.errors.unshift(`❌ 发现 ${results.info.duplicateFields.length} 个重复字段。同一主表或子表内字段名必须唯一。`);
  } else {
    results.warnings.push('✅ 未发现重复字段。');
  }

  return results;
}

function collectDuplicateFieldsInSection(tableContent, scopeName, results) {
  const rows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];
  const seen = new Set();

  for (const row of rows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;

    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 1) continue;

    const fieldName = cells[0] || '';
    if (!fieldName) continue;

    if (seen.has(fieldName)) {
      results.info.duplicateFields.push({ scopeName, fieldName });
      results.errors.push(`[${scopeName}] 字段"${fieldName}"重复。请删除重复行，或为不同来源的被填充字段加前缀区分。`);
    } else {
      seen.add(fieldName);
    }
  }
}

function validateReadonlyFields(filePath) {
  const results = { valid: true, errors: [], warnings: [], info: { suspiciousReadonlyFields: [] } };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  if (!fileName.includes('字段清单')) {
    return results;
  }

  const fillTargetFields = collectFillTargetFields(content);
  const formSections = content.split(/### \([一二三四五六七八九十]+\)/);

  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];
    const mainFormMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!mainFormMatch) continue;

    const mainFormName = mainFormMatch[1];
    const sectionParts = section.split(/\*\*子表：(.+?)\*\*/);
    checkReadonlyFieldsInSection(sectionParts[0], mainFormName, fillTargetFields, results);

    for (let j = 1; j < sectionParts.length; j += 2) {
      const subTableName = sectionParts[j];
      const subTableContent = sectionParts[j + 1] || '';
      checkReadonlyFieldsInSection(subTableContent, `${mainFormName}.${subTableName}`, fillTargetFields, results);
    }
  }

  if (results.info.suspiciousReadonlyFields.length > 0) {
    results.valid = false;
    results.errors.unshift(`❌ 发现 ${results.info.suspiciousReadonlyFields.length} 个可疑只读字段。只读字段应是系统字段、公式字段或明确的填充目标。`);
  } else {
    results.warnings.push('✅ 未发现来源不明的只读字段。');
  }

  return results;
}

function checkReadonlyFieldsInSection(tableContent, scopeName, fillTargetFields, results) {
  const rows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];

  for (const row of rows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;

    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 4) continue;

    const fieldName = cells[0] || '';
    const fieldType = cells[1] || '';
    const fieldDesc = cells[2] || '';
    const fieldStatus = cells[3] || '';

    if (fieldStatus !== '只读') continue;
    if (['创建人', '创建时间'].includes(fieldName)) continue;
    if (fieldType === '流水号') continue;
    if (fieldDesc.includes('公式')) continue;
    if (fillTargetFields.has(makeScopedFieldKey(scopeName, fieldName))) continue;

    results.info.suspiciousReadonlyFields.push({ scopeName, fieldName, fieldType });
    results.errors.push(`[${scopeName}] 字段"${fieldName}"为只读，但不是系统字段、公式字段，也不是任何填充规则的目标字段`);
  }
}

function validateSerialPrefixes(filePath) {
  const results = { valid: true, errors: [], warnings: [], info: { serialFields: [], invalidPrefixes: [] } };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  if (!fileName.includes('字段清单')) {
    return results;
  }

  const formSections = content.split(/### \([一二三四五六七八九十]+\)/);
  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];
    const mainFormMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!mainFormMatch) continue;

    const mainFormName = mainFormMatch[1];
    const sectionParts = section.split(/\*\*子表：(.+?)\*\*/);
    checkSerialPrefixesInSection(sectionParts[0], mainFormName, results);

    for (let j = 1; j < sectionParts.length; j += 2) {
      const subTableName = sectionParts[j];
      const subTableContent = sectionParts[j + 1] || '';
      checkSerialPrefixesInSection(subTableContent, `${mainFormName}.${subTableName}`, results);
    }
  }

  if (results.info.invalidPrefixes.length > 0) {
    results.valid = false;
    results.errors.unshift(`❌ 发现 ${results.info.invalidPrefixes.length} 个流水号前缀不合规。默认前缀必须为2位大写拼音首字母。`);
  } else {
    results.warnings.push('✅ 所有流水号前缀均为2位大写字母。');
  }

  return results;
}

function checkSerialPrefixesInSection(tableContent, scopeName, results) {
  const rows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];

  for (const row of rows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;

    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 3) continue;

    const fieldName = cells[0] || '';
    const fieldType = cells[1] || '';
    const fieldDesc = cells[2] || '';
    if (fieldType !== '流水号') continue;

    const prefixMatch = fieldDesc.match(/前缀[:：]\s*([A-Za-z\u4e00-\u9fa5]+)/);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const item = { scopeName, fieldName, prefix };
    results.info.serialFields.push(item);

    if (!/^[A-Z]{2}$/.test(prefix)) {
      results.info.invalidPrefixes.push(item);
      results.errors.push(`[${scopeName}] 流水号字段"${fieldName}"前缀"${prefix || '未填写'}"不合规，应为2位大写字母，例如：XS、CG、KC`);
    }
  }
}

/**
 * 校验关联表单填充规则的语法
 * 检查项：
 * 1. 填充规则必须包含"="号，且等号两边都有内容
 * 2. 警告使用了非推荐分隔符（推荐顿号"、"）
 * 3. 警告"当前字段=源字段"中当前字段与源字段名相同的简单映射（非错误，仅提示）
 * 解决问题：v1.5.0之前存在分隔符不一致导致"校验通过但运行失败"
 * @param {string} filePath - 字段清单文件路径
 */
function validateFillRuleSyntax(filePath) {
  const results = { valid: true, errors: [], warnings: [], info: { checkedRules: 0, invalidRules: [], nonStandardSeparators: [] } };

  if (!fs.existsSync(filePath)) {
    results.valid = false;
    results.errors.push(`文件不存在: ${filePath}`);
    return results;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  if (!fileName.includes('字段清单')) {
    return results;
  }

  // 推荐分隔符：顿号
  // 兼容分隔符：、，,；;
  // 不识别的分隔符：空格、|、/、\等（会触发警告）
  const NON_RECOMMENDED_SEPARATORS = /[\s|/\\]+/;

  const formSections = content.split(/### \([一二三四五六七八九十]+\)/);
  for (let i = 1; i < formSections.length; i++) {
    const section = formSections[i];
    const mainFormMatch = section.match(/\*\*主表：(.+?)\*\*/);
    if (!mainFormMatch) continue;

    const mainFormName = mainFormMatch[1];
    const sectionParts = section.split(/\*\*子表：(.+?)\*\*/);
    checkFillRuleSyntaxInSection(sectionParts[0], mainFormName, results, NON_RECOMMENDED_SEPARATORS);

    for (let j = 1; j < sectionParts.length; j += 2) {
      const subTableName = sectionParts[j];
      const subTableContent = sectionParts[j + 1] || '';
      checkFillRuleSyntaxInSection(subTableContent, `${mainFormName}.${subTableName}`, results, NON_RECOMMENDED_SEPARATORS);
    }
  }

  if (results.info.invalidRules.length > 0) {
    results.valid = false;
    results.errors.unshift(`❌ 发现 ${results.info.invalidRules.length} 条无效的填充规则语法。每条规则必须为"当前字段=源字段"格式，等号两边都有内容。`);
  } else {
    results.warnings.push(`✅ 已校验 ${results.info.checkedRules} 条填充规则，语法全部正确。`);
  }

  if (results.info.nonStandardSeparators.length > 0 && results.valid) {
    results.warnings.push(`⚠️  发现 ${results.info.nonStandardSeparators.length} 处使用了非推荐分隔符（推荐顿号"、"）。当前仍可解析，但建议统一为顿号避免歧义。`);
  }

  return results;
}

function checkFillRuleSyntaxInSection(tableContent, scopeName, results, nonRecommendedRegex) {
  const rows = tableContent.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];

  for (const row of rows) {
    if (row.includes('字段名称') && row.includes('字段类型')) continue;
    if (/^[\s|:-]+$/.test(row)) continue;

    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 3) continue;

    const fieldName = cells[0] || '';
    const fieldType = cells[1] || '';
    const fieldDesc = cells[2] || '';

    if (fieldType !== '关联表单' && !fieldDesc.includes('关联-->')) continue;
    if (!fieldDesc.includes('填充：')) continue;

    const fillMatch = fieldDesc.match(/填充：(.+)/);
    if (!fillMatch) continue;

    const fillPart = fillMatch[1];
    // 检查是否使用了非推荐分隔符
    // 推荐分隔符是顿号"、"或中文逗号"，"，但解析器穷举兼容、，,；;
    // 如果出现空格、|、/、\等，说明可能存在分隔符问题
    if (nonRecommendedRegex.test(fillPart) && !/[、，,；;]/.test(fillPart)) {
      results.info.nonStandardSeparators.push({ scopeName, fieldName, fillPart });
    }

    const pairs = fillPart.split(FILLING_PAIR_SEPARATOR);
    for (const pair of pairs) {
      const pairTrimmed = pair.trim();
      if (!pairTrimmed) continue;

      results.info.checkedRules++;

      // 必须有且仅有一个"="号
      const eqIndex = pairTrimmed.indexOf('=');
      if (eqIndex === -1) {
        results.info.invalidRules.push({ scopeName, fieldName, rule: pairTrimmed, reason: '缺少"="号' });
        results.errors.push(`[${scopeName}] 关联字段"${fieldName}"的填充规则"${pairTrimmed}"缺少"="号，正确格式为"当前字段=源字段"`);
        continue;
      }

      const currentLabel = pairTrimmed.substring(0, eqIndex).trim();
      const sourceLabel = pairTrimmed.substring(eqIndex + 1).trim();

      if (!currentLabel) {
        results.info.invalidRules.push({ scopeName, fieldName, rule: pairTrimmed, reason: '"="号左边（当前字段名）为空' });
        results.errors.push(`[${scopeName}] 关联字段"${fieldName}"的填充规则"${pairTrimmed}"中"="号左边为空，缺少当前字段名`);
        continue;
      }
      if (!sourceLabel) {
        results.info.invalidRules.push({ scopeName, fieldName, rule: pairTrimmed, reason: '"="号右边（源字段名）为空' });
        results.errors.push(`[${scopeName}] 关联字段"${fieldName}"的填充规则"${pairTrimmed}"中"="号右边为空，缺少源字段名`);
        continue;
      }
      // 检查是否有多个"="号（可能是格式错误）
      if (pairTrimmed.indexOf('=', eqIndex + 1) !== -1) {
        results.info.invalidRules.push({ scopeName, fieldName, rule: pairTrimmed, reason: '包含多个"="号' });
        results.errors.push(`[${scopeName}] 关联字段"${fieldName}"的填充规则"${pairTrimmed}"包含多个"="号，每条规则只能有一个等号`);
      }
    }
  }
}

/**
 * CLI 统一输出：打印校验结果 JSON，校验失败时设置非零退出码。
 * 这是硬规则3-4能被 pre-commit 钩子 / CI 确定性拦截的前提：
 * v1.8.0 之前所有命令恒以 0 退出，shell 触发器无法感知失败。
 */
function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
  if (result && result.valid === false) {
    process.exitCode = 1;
  }
}

const IS_CLI = require.main === module;
const args = IS_CLI ? process.argv.slice(2) : [];
const command = args[0];

if (!IS_CLI) {
  // 被 require 引用时只导出函数，不执行 CLI 分发
} else if (command === 'check-prompt') {
  const targetDir = args[1];
  const proposedFileName = args[2] || null;
  const result = validatePromptFile(targetDir, proposedFileName);
  printResult(result);
} else if (command === 'check-appid') {
  const value = args[1];
  const result = validateAppId(value);
  printResult(result);
} else if (command === 'check-formuuid') {
  const value = args[1];
  const result = validateFormUuid(value);
  printResult(result);
} else if (command === 'check-formula') {
  const formulaText = args.slice(1).join(' ');
  const result = validateFormulaFunctions(formulaText);
  printResult(result);
} else if (command === 'check-formula-refs') {
  const filePath = args[1];
  const fieldSource = args[2] || null;
  const result = validateFormulaReferences(filePath, fieldSource);
  printResult(result);
} else if (command === 'scan-dir') {
  const targetDir = args[1];
  if (!fs.existsSync(targetDir)) {
    console.log(JSON.stringify({ maxIndex: 0, nextIndex: 1, files: [] }, null, 2));
  } else {
    const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
    let maxIndex = 0;
    files.forEach(f => {
      const m = f.match(/^(\d+)\./);
      if (m) { const idx = parseInt(m[1], 10); if (idx > maxIndex) maxIndex = idx; }
    });
    console.log(JSON.stringify({ maxIndex, nextIndex: maxIndex + 1, files }, null, 2));
  }
} else if (command === 'check-after-write') {
  const filePath = args[1];
  const result = validateAfterWrite(filePath);
  printResult(result);
} else if (command === 'check-before-write') {
  const targetPath = args[1];
  const result = validateBeforeWrite(targetPath);
  printResult(result);
} else if (command === 'check-save-schema') {
  const formUuid = args[1];
  const isNewForm = args[2] === 'true';
  const result = validateSaveFormSchema(formUuid, isNewForm);
  printResult(result);
} else if (command === 'check-content') {
  const content = args.slice(1).join(' ');
  const result = validateContentPlaceholders(content);
  printResult(result);
} else if (command === 'check-cookie-path') {
  const cookiePath = args[1];
  const result = validateCookiePath(cookiePath);
  printResult(result);
} else if (command === 'check-field-list-structure') {
  const filePath = args[1];
  const result = validateFieldListStructure(filePath);
  printResult(result);
} else if (command === 'check-association-fields') {
  const filePath = args[1];
  const result = validateAssociationFields(filePath);
  printResult(result);
} else if (command === 'check-fill-targets') {
  const filePath = args[1];
  const result = validateFillTargets(filePath);
  printResult(result);
} else if (command === 'check-duplicate-fields') {
  const filePath = args[1];
  const result = validateDuplicateFields(filePath);
  printResult(result);
} else if (command === 'check-readonly-fields') {
  const filePath = args[1];
  const result = validateReadonlyFields(filePath);
  printResult(result);
} else if (command === 'check-serial-prefixes') {
  const filePath = args[1];
  const result = validateSerialPrefixes(filePath);
  printResult(result);
} else if (command === 'check-fill-rule-syntax') {
  const filePath = args[1];
  const result = validateFillRuleSyntax(filePath);
  printResult(result);
} else if (command === 'check-all') {
  // 一次执行字段清单的全部 6 项校验并汇总输出，替代逐条串行执行
  const filePath = args[1];
  const checks = [
    ['check-after-write', validateAfterWrite],
    ['check-duplicate-fields', validateDuplicateFields],
    ['check-association-fields', validateAssociationFields],
    ['check-fill-targets', validateFillTargets],
    ['check-readonly-fields', validateReadonlyFields],
    ['check-serial-prefixes', validateSerialPrefixes]
  ];
  const summary = { file: filePath, passed: true, checks: {} };
  for (const [name, fn] of checks) {
    try {
      const result = fn(filePath) || {};
      const errors = result.errors || [];
      const warnings = result.warnings || [];
      summary.checks[name] = { pass: errors.length === 0, errors, warnings };
      if (errors.length > 0) summary.passed = false;
    } catch (e) {
      summary.checks[name] = { pass: false, errors: [`校验执行异常: ${e.message}`], warnings: [] };
      summary.passed = false;
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) {
    process.exitCode = 1;
  }
} else {
  console.log('用法: node ai-validator.js <command> [args]');
  console.log('');
  console.log('  文件操作校验:');
  console.log('    scan-dir <目录>               — 扫描目录返回最大序号');
  console.log('    check-prompt <目录> [文件名]  — 校验提示词文件是否可安全创建');
  console.log('    check-before-write <文件路径> — 写入前校验是否覆盖已有文件');
  console.log('    check-after-write <文件路径>  — 写入后校验文件内容是否合规');
  console.log('');
  console.log('  ID/UUID校验:');
  console.log('    check-appid <值>              — 校验应用ID是否为真实值');
  console.log('    check-formuuid <值>           — 校验表单UUID是否为真实值');
  console.log('    check-content <内容>          — 校验内容是否包含占位符');
  console.log('');
  console.log('  API安全校验:');
  console.log('    check-save-schema <UUID> <isNew> — 校验saveFormSchema调用是否安全');
  console.log('    check-cookie-path <路径>      — 校验Cookie路径是否正确');
  console.log('');
  console.log('  公式校验:');
  console.log('    check-formula <公式文本>       — 校验公式函数是否有来源');
  console.log('    check-formula-refs <公式JSON路径> [字段来源JSON] — 校验公式字段引用与marks一致性、无效引用、占位符（v1.7.0新增）');
  console.log('');
  console.log('  字段清单结构校验:');
  console.log('    check-field-list-structure <文件路径> — 校验字段清单结构是否符合模板要求');
  console.log('    check-association-fields <文件路径>  — 校验字段清单中是否缺少关联表单字段（v1.2.0新增）');
  console.log('    check-fill-targets <文件路径>        — 校验关联字段填充规则的目标字段是否存在（v1.3.0新增）');
  console.log('    check-duplicate-fields <文件路径>    — 校验同一主表/子表内是否存在重复字段');
  console.log('    check-readonly-fields <文件路径>     — 校验只读字段是否有系统/公式/填充来源');
  console.log('    check-serial-prefixes <文件路径>    — 校验流水号前缀是否为2位大写字母');
  console.log('    check-fill-rule-syntax <文件路径>   — 校验关联表单填充规则语法（=号、分隔符）（v1.6.0新增）');
  console.log('    check-all <文件路径>                — 一次执行字段清单全部 6 项校验并汇总（推荐）');
}

module.exports = {
  validatePromptFile, validateAppId, validateFormUuid,
  validateFormulaFunctions, validateFormulaReferences, validateAfterWrite, validateBeforeWrite,
  validateSaveFormSchema, validateContentPlaceholders, validateCookiePath,
  validateFieldListStructure, validateAssociationFields, validateFillTargets,
  validateDuplicateFields, validateReadonlyFields, validateSerialPrefixes,
  validateFillRuleSyntax
};
