/**
 * 提示词生成器 - 生成规范的功能提示词
 * 版本: v1.0.0
 * 创建日期: 2026-03-15
 */

const fs = require('fs');
const path = require('path');

/**
 * 提示词计数器（用于生成编号）
 */
let promptCounter = 0;

/**
 * 生成提示词编号
 * @returns {string}
 */
function generatePromptId() {
  promptCounter++;
  return String(promptCounter).padStart(3, '0');
}

/**
 * 重置计数器
 */
function resetCounter() {
  promptCounter = 0;
}

/**
 * 设置计数器起始值
 * @param {number} start 
 */
function setCounter(start) {
  promptCounter = start;
}

/**
 * 生成公式类提示词
 * @param {Object} params 
 * @returns {string}
 */
function generateFormulaPrompt(params) {
  const {
    formulaType,      // 表单公式/报表公式/自动化公式
    requirement,      // 需求描述
    fields,           // 字段列表
    relatedForm,      // 关联表单（可选）
    status = '⏳ 待生成'
  } = params;
  
  const promptId = generatePromptId();
  const now = new Date().toLocaleString('zh-CN');
  
  let content = `**【提示词-${promptId}】${extractSummary(requirement)}**
- **需求**: ${requirement}
`;
  
  // 添加字段信息
  if (fields && fields.length > 0) {
    content += `- **字段**:\n`;
    for (const field of fields) {
      if (field.isSubtable && field.subtable) {
        // 子表字段
        content += `  - ${field.subtable.name}（子表）: ${field.subtable.id}\n`;
        if (field.field) {
          content += `    - ${field.field.name}：${field.field.id}\n`;
        }
      } else {
        // 普通字段
        content += `  - ${field.name}：${field.id}\n`;
      }
    }
  }
  
  // 添加关联表单信息
  if (relatedForm) {
    content += `- **关联表单**: ${relatedForm.name}\n`;
    content += `  - 表单UUID: ${relatedForm.uuid}\n`;
  }
  
  content += `- **状态**: ${status}\n`;
  content += `- **创建时间**: ${now}\n\n`;
  
  // 添加警告
  content += generateWarning();
  
  return content;
}

/**
 * 生成代码类提示词
 * @param {Object} params 
 * @returns {string}
 */
function generateCodePrompt(params) {
  const {
    codeType,         // 表单动作代码/跨表单代码/字段校验代码/自定义页面代码
    requirement,      // 需求描述
    triggerTiming,    // 触发时机
    fields,           // 字段列表
    relatedForm,      // 关联表单（跨表单时需要）
    status = '⏳ 待生成'
  } = params;
  
  const promptId = generatePromptId();
  const now = new Date().toLocaleString('zh-CN');
  
  let content = `**【提示词-${promptId}】${extractSummary(requirement)}**
- **需求**: ${requirement}\n`;
  
  if (triggerTiming) {
    content += `- **触发时机**: ${triggerTiming}\n`;
  }
  
  // 添加字段信息
  if (fields && fields.length > 0) {
    content += `- **字段**:\n`;
    for (const field of fields) {
      if (field.isSubtable && field.subtable) {
        content += `  - ${field.subtable.name}（子表）: ${field.subtable.id}\n`;
        if (field.field) {
          content += `    - ${field.field.name}：${field.field.id}\n`;
        }
      } else {
        content += `  - ${field.name}：${field.id}\n`;
      }
    }
  }
  
  // 添加关联表单信息
  if (relatedForm) {
    content += `- **关联表单**: ${relatedForm.name}\n`;
    content += `  - 应用ID: ${relatedForm.appId || '同应用'}\n`;
    content += `  - 表单UUID: ${relatedForm.uuid}\n`;
  }
  
  content += `- **状态**: ${status}\n`;
  content += `- **创建时间**: ${now}\n\n`;
  
  content += generateWarning();
  
  return content;
}

/**
 * 生成表单类提示词
 * @param {Object} params 
 * @returns {string}
 */
function generateFormPrompt(params) {
  const {
    formType,         // 字段联动/子表操作/表单布局/数据初始化
    requirement,
    fields,
    status = '⏳ 待生成'
  } = params;
  
  const promptId = generatePromptId();
  const now = new Date().toLocaleString('zh-CN');
  
  let content = `**【提示词-${promptId}】${extractSummary(requirement)}**
- **需求**: ${requirement}\n`;
  
  if (fields && fields.length > 0) {
    content += `- **字段**:\n`;
    for (const field of fields) {
      content += `  - ${field.name}：${field.id}\n`;
    }
  }
  
  content += `- **状态**: ${status}\n`;
  content += `- **创建时间**: ${now}\n\n`;
  
  content += generateWarning();
  
  return content;
}

/**
 * 生成字段ID核对警告
 * @returns {string}
 */
function generateWarning() {
  return `⚠️ **【重要】请仔细核对以上字段ID是否正确！错误的ID会导致公式/代码生成失败或运行异常！**
⚠️ **如发现ID有误，请手动修改为正确的ID后再进行生成操作。**

---

`;
}

/**
 * 从需求描述中提取摘要
 * @param {string} requirement 
 * @returns {string}
 */
function extractSummary(requirement) {
  // 取前20个字符作为摘要
  if (requirement.length <= 20) {
    return requirement;
  }
  return requirement.substring(0, 20) + '...';
}

/**
 * 生成完整的提示词文件内容
 * @param {Object} params 
 * @returns {string}
 */
function generateFullPromptFile(params) {
  const {
    formName,
    prompts = [],     // 提示词列表
    statistics = {}   // 统计信息
  } = params;
  
  const today = new Date().toISOString().split('T')[0];
  
  let content = `# ${formName} - 功能提示词

> 生成日期: ${today}
> 最后更新: ${today}

---

## 📋 提示词列表

`;
  
  // 按类型分组
  const grouped = groupPromptsByType(prompts);
  
  // 公式类
  if (grouped.formula && grouped.formula.length > 0) {
    content += `### 一、公式类\n\n`;
    
    const subTypes = groupBySubType(grouped.formula);
    if (subTypes['表单公式']) {
      content += `#### 1.1 表单公式\n\n${subTypes['表单公式'].join('\n')}\n`;
    }
    if (subTypes['报表公式']) {
      content += `#### 1.2 报表公式\n\n${subTypes['报表公式'].join('\n')}\n`;
    }
    if (subTypes['自动化公式']) {
      content += `#### 1.3 自动化公式\n\n${subTypes['自动化公式'].join('\n')}\n`;
    }
  }
  
  // 代码类
  if (grouped.code && grouped.code.length > 0) {
    content += `### 二、代码类\n\n`;
    
    const subTypes = groupBySubType(grouped.code);
    if (subTypes['表单动作代码']) {
      content += `#### 2.1 表单动作代码\n\n${subTypes['表单动作代码'].join('\n')}\n`;
    }
    if (subTypes['跨表单代码']) {
      content += `#### 2.2 跨表单代码\n\n${subTypes['跨表单代码'].join('\n')}\n`;
    }
    if (subTypes['字段校验代码']) {
      content += `#### 2.3 字段校验代码\n\n${subTypes['字段校验代码'].join('\n')}\n`;
    }
    if (subTypes['自定义页面代码']) {
      content += `#### 2.4 自定义页面代码\n\n${subTypes['自定义页面代码'].join('\n')}\n`;
    }
  }
  
  // 表单类
  if (grouped.form && grouped.form.length > 0) {
    content += `### 三、表单类\n\n`;
    content += grouped.form.join('\n');
  }
  
  // 流程类
  if (grouped.flow && grouped.flow.length > 0) {
    content += `### 四、流程类\n\n`;
    content += grouped.flow.join('\n');
  }
  
  // 统计信息
  content += generateStatistics(statistics);
  
  // 使用说明
  content += generateInstructions();
  
  return content;
}

/**
 * 按类型分组
 * @param {Array} prompts 
 * @returns {Object}
 */
function groupPromptsByType(prompts) {
  const groups = {
    formula: [],
    code: [],
    form: [],
    flow: []
  };
  
  for (const prompt of prompts) {
    const type = prompt.type || 'formula';
    if (groups[type]) {
      groups[type].push(prompt);
    }
  }
  
  return groups;
}

/**
 * 按子类型分组
 * @param {Array} prompts 
 * @returns {Object}
 */
function groupBySubType(prompts) {
  const groups = {};
  
  for (const prompt of prompts) {
    const subType = prompt.subType || '其他';
    if (!groups[subType]) {
      groups[subType] = [];
    }
    groups[subType].push(prompt.content);
  }
  
  return groups;
}

/**
 * 生成统计信息表格
 * @param {Object} stats 
 * @returns {string}
 */
function generateStatistics(stats) {
  return `
---

## 📊 统计信息

| 类型 | 总数 | 待生成 | 已完成 | 失败 |
|------|------|--------|--------|------|
| 表单公式 | ${stats.formulaForm || 0} | ${stats.formulaFormPending || 0} | ${stats.formulaFormDone || 0} | ${stats.formulaFormFail || 0} |
| 报表公式 | ${stats.formulaReport || 0} | ${stats.formulaReportPending || 0} | ${stats.formulaReportDone || 0} | ${stats.formulaReportFail || 0} |
| 表单动作代码 | ${stats.codeAction || 0} | ${stats.codeActionPending || 0} | ${stats.codeActionDone || 0} | ${stats.codeActionFail || 0} |
| 跨表单代码 | ${stats.codeCross || 0} | ${stats.codeCrossPending || 0} | ${stats.codeCrossDone || 0} | ${stats.codeCrossFail || 0} |
| **合计** | **${stats.total || 0}** | **${stats.totalPending || 0}** | **${stats.totalDone || 0}** | **${stats.totalFail || 0}** |

`;
}

/**
 * 生成使用说明
 * @returns {string}
 */
function generateInstructions() {
  return `---

## 📝 使用说明

### 状态说明
- ⏳ **待生成**: 提示词已创建，等待生成公式/代码
- 🔄 **生成中**: 正在生成公式/代码
- ✅ **已完成**: 公式/代码已生成并保存
- ❌ **失败**: 生成失败，需要检查提示词或字段ID

### 操作步骤
1. 核对提示词中的字段ID是否正确
2. 确认无误后，调用对应的生成 Skill
3. 生成完成后，本文件会自动更新状态

### 注意事项
- ⚠️ 务必核对字段ID，这是最常见的错误来源
- ⚠️ 涉及跨表单操作时，需确认关联表单ID
- ⚠️ 子表字段需同时核对子表ID和子表字段ID
`;
}

/**
 * 追加提示词到现有文件
 * @param {string} filePath 
 * @param {string} newPrompt 
 * @returns {boolean}
 */
function appendPromptToFile(filePath, newPrompt) {
  try {
    let content = '';
    
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
      
      // 更新最后更新时间
      content = content.replace(
        /> 最后更新: \d{4}-\d{2}-\d{2}/,
        `> 最后更新: ${new Date().toISOString().split('T')[0]}`
      );
      
      // 在统计信息前插入新提示词
      const statsIndex = content.indexOf('## 📊 统计信息');
      if (statsIndex > 0) {
        content = content.slice(0, statsIndex) + newPrompt + '\n' + content.slice(statsIndex);
      } else {
        content += '\n' + newPrompt;
      }
    } else {
      // 文件不存在，创建新文件
      return false;
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('追加提示词失败:', error);
    return false;
  }
}

/**
 * 更新提示词状态
 * @param {string} filePath 
 * @param {string} promptId 
 * @param {string} newStatus 
 * @returns {boolean}
 */
function updatePromptStatus(filePath, promptId, newStatus) {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // 查找并替换状态
    const pattern = new RegExp(`(【提示词-${promptId}】[\\s\\S]*?- \\*\\*状态\\*\\*: )[^\\n]+`, 'g');
    content = content.replace(pattern, `$1${newStatus}`);
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('更新状态失败:', error);
    return false;
  }
}

module.exports = {
  generateFormulaPrompt,
  generateCodePrompt,
  generateFormPrompt,
  generateFullPromptFile,
  appendPromptToFile,
  updatePromptStatus,
  generatePromptId,
  resetCounter,
  setCounter
};
