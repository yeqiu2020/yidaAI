const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

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
      return m && parseInt(m[1], 10) === idx && f !== fileName;
    });
    if (duplicates.length > 0) {
      results.valid = false;
      results.errors.push(`序号 ${idx} 与已有文件冲突: ${duplicates.join(', ')}`);
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

const args = process.argv.slice(2);
const command = args[0];

if (command === 'check-prompt') {
  const targetDir = args[1];
  const proposedFileName = args[2] || null;
  const result = validatePromptFile(targetDir, proposedFileName);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'check-appid') {
  const value = args[1];
  const result = validateAppId(value);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'check-formuuid') {
  const value = args[1];
  const result = validateFormUuid(value);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'check-formula') {
  const formulaText = args.slice(1).join(' ');
  const result = validateFormulaFunctions(formulaText);
  console.log(JSON.stringify(result, null, 2));
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
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'check-before-write') {
  const targetPath = args[1];
  const result = validateBeforeWrite(targetPath);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'check-save-schema') {
  const formUuid = args[1];
  const isNewForm = args[2] === 'true';
  const result = validateSaveFormSchema(formUuid, isNewForm);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'check-content') {
  const content = args.slice(1).join(' ');
  const result = validateContentPlaceholders(content);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'check-cookie-path') {
  const cookiePath = args[1];
  const result = validateCookiePath(cookiePath);
  console.log(JSON.stringify(result, null, 2));
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
}

module.exports = {
  validatePromptFile, validateAppId, validateFormUuid,
  validateFormulaFunctions, validateAfterWrite, validateBeforeWrite,
  validateSaveFormSchema, validateContentPlaceholders, validateCookiePath
};
