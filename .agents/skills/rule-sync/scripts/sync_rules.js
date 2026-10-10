/**
 * 宜搭规则同步脚本 - 主入口
 * 版本: 1.0.1
 * 更新日期: 2026-03-11
 * 
 * 功能: 从宜搭平台同步业务规则数据，包括公式、联动规则、校验规则、动作代码、集成自动化流程
 * 
 * 使用方式:
 * 1. 同步规则（从系统配置清单读取应用ID）:
 *    node sync_rules.js
 * 
 * 2. 指定输出目录:
 *    node sync_rules.js --output ./进销存管理
 * 
 * 3. 指定应用ID:
 *    node sync_rules.js --appId APP_XXX --output ./进销存管理
 */

const fs = require('fs');
const path = require('path');

// Phase 6: Cookie 加载统一委托给 lib/core/utils
const coreUtils = require('../../../../lib/core/utils');
const { loadCookieData, resolveBaseUrl } = coreUtils;

// 引入 api-client 的模块（业务函数）
const {
  triggerLogin,
  resolveCorpId,
  requestWithAutoLogin,
  buildApiPath
} = require('../../api-client/scripts/api_client.js');

const { 
  getFormSchema,
  getAutomationFlowList,
  getConnectorList,
  getAutomationFlowDetail
} = require('../../api-client/scripts/form_manager.js');

/**
 * 从系统配置清单中解析应用ID
 */
function parseAppIdFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  const content = fs.readFileSync(configPath, 'utf-8');
  const appIdMatch = content.match(/\|\s*(?:\*\*)?应用ID(?:\*\*)?\s*\|\s*(APP[_-][A-Z0-9]+)\s*\|/);
  return appIdMatch ? appIdMatch[1] : null;
}

/**
 * 从系统配置清单中解析表单列表
 * 支持格式: | 序号 | 页面名称「类型」 | 页面编码（表单UUID） |
 */
function parseFormsFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  const content = fs.readFileSync(configPath, 'utf-8');
  const forms = [];
  
  // 匹配表单列表表格行
  // 格式: | 1 | 产品信息「普通表单」 | FORM-XXX |
  const formRegex = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*「([^|]+?)」\s*\|\s*([A-Z0-9-]+)\s*\|/g;
  let match;
  
  while ((match = formRegex.exec(content)) !== null) {
    const typeStr = match[3].trim();
    forms.push({
      index: parseInt(match[1]),
      name: match[2].trim(),
      type: typeStr.includes('流程') ? '流程' : '表单',
      formUuid: match[4].trim()
    });
  }
  
  return forms.length > 0 ? forms : null;
}

/**
 * 从Schema中提取公式信息
 */
function extractFormulasFromSchema(schema, formName) {
  const formulas = [];
  
  if (!schema || !schema.componentsTree) {
    return formulas;
  }
  
  function traverseComponents(components) {
    if (!Array.isArray(components)) return;
    
    components.forEach(component => {
      if (component.props) {
        const formula = component.props.formula;
        const label = component.props.label?.zh_CN || component.props.label;
        const fieldId = component.props.fieldId;
        
        // 检查是否有公式（不为空且不只是空白字符）
        if (formula && formula.trim() && formula.trim() !== '') {
          formulas.push({
            formName: formName,
            fieldName: label || fieldId || '未知字段',
            fieldId: fieldId,
            formula: formula.trim(),
            componentType: component.componentName
          });
        }
      }
      
      // 递归遍历子组件
      if (component.children) {
        traverseComponents(component.children);
      }
    });
  }
  
  traverseComponents(schema.componentsTree);
  return formulas;
}

/**
 * 从Schema中提取联动规则
 */
function extractLinkageRulesFromSchema(schema, formName) {
  const rules = [];
  
  if (!schema || !schema.componentsTree) {
    return rules;
  }
  
  function traverseComponents(components) {
    if (!Array.isArray(components)) return;
    
    components.forEach(component => {
      if (component.props) {
        const linkage = component.props.linkage;
        const variable = component.props.variable;
        const label = component.props.label?.zh_CN || component.props.label;
        const fieldId = component.props.fieldId;
        
        // 检查是否有联动规则
        if ((linkage && linkage.trim() && linkage.trim() !== '') || 
            (variable && variable.trim() && variable.trim() !== '')) {
          rules.push({
            formName: formName,
            fieldName: label || fieldId || '未知字段',
            fieldId: fieldId,
            linkage: linkage || '',
            variable: variable || '',
            componentType: component.componentName
          });
        }
      }
      
      if (component.children) {
        traverseComponents(component.children);
      }
    });
  }
  
  traverseComponents(schema.componentsTree);
  return rules;
}

/**
 * 从Schema中提取校验规则
 */
function extractValidationRulesFromSchema(schema, formName) {
  const rules = [];
  
  if (!schema || !schema.componentsTree) {
    return rules;
  }
  
  function traverseComponents(components) {
    if (!Array.isArray(components)) return;
    
    components.forEach(component => {
      if (component.props) {
        const validation = component.props.validation;
        const label = component.props.label?.zh_CN || component.props.label;
        const fieldId = component.props.fieldId;
        
        // 检查是否有校验规则
        if (validation && Array.isArray(validation) && validation.length > 0) {
          validation.forEach(rule => {
            if (rule.type) {
              rules.push({
                formName: formName,
                fieldName: label || fieldId || '未知字段',
                fieldId: fieldId,
                validationType: rule.type,
                validationRule: rule.pattern || rule.message || '',
                componentType: component.componentName
              });
            }
          });
        }
      }
      
      if (component.children) {
        traverseComponents(component.children);
      }
    });
  }
  
  traverseComponents(schema.componentsTree);
  return rules;
}

/**
 * 从Schema中提取动作代码
 */
function extractActionsFromSchema(schema, formName) {
  const actions = [];
  
  if (!schema || !schema.actions) {
    return actions;
  }
  
  const actionTypes = ['didMount', 'onChange', 'onSubmit', 'onValidate'];
  
  actionTypes.forEach(actionType => {
    const action = schema.actions[actionType];
    if (action && action.source && action.source.trim() !== '') {
      // 过滤掉默认的空实现
      const source = action.source.trim();
      if (!source.includes('/*set actions code here*/') && 
          !source.includes('function didMount() {}') &&
          source.length > 50) {  // 简单过滤掉空函数
        actions.push({
          formName: formName,
          actionType: actionType,
          source: source,
          compiled: action.compiled || ''
        });
      }
    }
  });
  
  return actions;
}

/**
 * 解析自动化流程触发器信息
 */
function parseTriggerInfo(trigger) {
  if (!trigger) return '未知触发器';
  
  const typeMap = {
    'form': '表单事件',
    'schedule': '定时触发',
    'webhook': 'Webhook',
    'manual': '手动触发'
  };
  
  const type = typeMap[trigger.type] || trigger.type;
  const formName = trigger.formName || '';
  const event = trigger.event || '';
  
  return `${type}${formName ? ` - ${formName}` : ''}${event ? ` (${event})` : ''}`;
}

/**
 * 解析自动化流程动作信息
 */
function parseActionInfo(actions) {
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return '无动作';
  }
  
  return actions.map(a => {
    const typeMap = {
      'notification': '发送通知',
      'updateData': '更新数据',
      'createData': '新增数据',
      'deleteData': '删除数据',
      'callApi': '调用接口',
      'approval': '发起审批'
    };
    return typeMap[a.type] || a.type;
  }).join(', ');
}

/**
 * 生成系统规则清单Markdown
 */
function generateRulesMarkdown(appName, formulas, linkageRules, validationRules, actions, automationFlows = []) {
  let md = `# ${appName} - 系统规则清单\n\n`;
  md += `> 生成日期: ${new Date().toLocaleString()}\n`;
  md += `> 数据来源: 宜搭平台\n\n`;
  
  // 0. 集成自动化流程（新增）
  md += `## 🔄 集成自动化流程\n\n`;
  if (automationFlows.length > 0) {
    md += `| 流程名称 | 触发器 | 执行动作 | 状态 |\n`;
    md += `|---------|--------|---------|------|\n`;
    automationFlows.forEach(f => {
      const trigger = parseTriggerInfo(f.trigger);
      const action = parseActionInfo(f.actions);
      const status = f.status === 'enabled' ? '✅ 启用' : '❌ 禁用';
      md += `| ${f.name} | ${trigger} | ${action} | ${status} |\n`;
    });
    md += `\n**共 ${automationFlows.length} 个自动化流程**\n\n`;
    
    // 详细流程信息
    md += `### 流程详情\n\n`;
    automationFlows.forEach((f, index) => {
      md += `#### ${index + 1}. ${f.name}\n\n`;
      md += `- **流程ID**: ${f.id}\n`;
      md += `- **状态**: ${f.status === 'enabled' ? '启用' : '禁用'}\n`;
      md += `- **触发器**: ${parseTriggerInfo(f.trigger)}\n`;
      md += `- **执行动作**: ${parseActionInfo(f.actions)}\n`;
      if (f.description) {
        md += `- **描述**: ${f.description}\n`;
      }
      md += '\n';
    });
  } else {
    md += `> 未找到配置的自动化流程\n\n`;
  }
  
  // 1. 表单公式清单
  md += `## 📐 表单公式清单\n\n`;
  if (formulas.length > 0) {
    md += `| 表单名称 | 字段名称 | 公式内容 | 字段类型 |\n`;
    md += `|---------|---------|---------|---------|\n`;
    formulas.forEach(f => {
      // 转义公式中的管道符
      const safeFormula = f.formula.replace(/\|/g, '\\|');
      md += `| ${f.formName} | ${f.fieldName} | ${safeFormula} | ${f.componentType} |\n`;
    });
    md += `\n**共 ${formulas.length} 个公式字段**\n\n`;
  } else {
    md += `> 未找到配置的公式字段\n\n`;
  }
  
  // 2. 字段联动规则
  md += `## 🔗 字段联动规则\n\n`;
  if (linkageRules.length > 0) {
    md += `| 表单名称 | 字段名称 | 联动标识 | 变量标识 | 字段类型 |\n`;
    md += `|---------|---------|---------|---------|---------|\n`;
    linkageRules.forEach(r => {
      md += `| ${r.formName} | ${r.fieldName} | ${r.linkage || '-'} | ${r.variable || '-'} | ${r.componentType} |\n`;
    });
    md += `\n**共 ${linkageRules.length} 个联动规则**\n\n`;
  } else {
    md += `> 未找到配置的联动规则\n\n`;
  }
  
  // 3. 字段校验规则
  md += `## ✅ 字段校验规则\n\n`;
  if (validationRules.length > 0) {
    md += `| 表单名称 | 字段名称 | 校验类型 | 校验规则 | 字段类型 |\n`;
    md += `|---------|---------|---------|---------|---------|\n`;
    validationRules.forEach(r => {
      const safeRule = r.validationRule.replace(/\|/g, '\\|');
      md += `| ${r.formName} | ${r.fieldName} | ${r.validationType} | ${safeRule || '-'} | ${r.componentType} |\n`;
    });
    md += `\n**共 ${validationRules.length} 个校验规则**\n\n`;
  } else {
    md += `> 未找到配置的校验规则\n\n`;
  }
  
  // 4. 表单动作代码
  md += `## 💻 表单动作代码\n\n`;
  if (actions.length > 0) {
    actions.forEach(a => {
      md += `### ${a.formName} - ${a.actionType}\n\n`;
      md += '```javascript\n';
      md += a.source;
      md += '\n```\n\n';
    });
    md += `**共 ${actions.length} 个动作代码**\n\n`;
  } else {
    md += `> 未找到配置的动作代码\n\n`;
  }
  
  // 统计信息
  md += `---\n\n`;
  md += `## 📊 统计信息\n\n`;
  md += `| 规则类型 | 数量 |\n`;
  md += `|---------|------|\n`;
  md += `| 公式字段 | ${formulas.length} |\n`;
  md += `| 联动规则 | ${linkageRules.length} |\n`;
  md += `| 校验规则 | ${validationRules.length} |\n`;
  md += `| 动作代码 | ${actions.length} |\n`;
  
  return md;
}

/**
 * 同步规则主函数
 */
async function syncRules(options = {}) {
  const {
    appId: providedAppId,
    outputDir = './'
  } = options;
  
  console.log('='.repeat(60));
  console.log('  宜搭规则同步工具');
  console.log('  版本: 1.0.1');
  console.log('='.repeat(60));
  
  // 1. 确定应用ID
  let appId = providedAppId;
  const configPath = path.join(outputDir, '系统配置清单.md');
  
  if (!appId) {
    console.log('\n📖 尝试从系统配置清单读取应用ID...');
    appId = parseAppIdFromConfig(configPath);
    
    if (appId) {
      console.log(`   ✅ 找到应用ID: ${appId}`);
    } else {
      throw new Error('未提供应用ID，且无法从系统配置清单解析');
    }
  } else {
    console.log(`\n📱 应用ID: ${appId}`);
  }
  
  // 2. 获取表单列表
  console.log('\n📋 从系统配置清单读取表单列表...');
  const forms = parseFormsFromConfig(configPath);
  
  if (!forms || forms.length === 0) {
    throw new Error('无法从系统配置清单读取表单列表，请先运行 config-sync');
  }
  
  console.log(`   ✅ 找到 ${forms.length} 个表单`);
  forms.forEach(f => {
    console.log(`      ${f.index}. ${f.name}「${f.type}」- ${f.formUuid}`);
  });
  
  // 3. 获取登录态
  console.log('\n🔑 检查登录态...');
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.log('   ⚠️  未找到登录态，需要登录');
    cookieData = triggerLogin();
  }
  
  const authRef = {
    cookieData,
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    corpId: resolveCorpId(cookieData)
  };
  
  console.log(`   ✅ 登录态就绪 (${authRef.baseUrl})`);
  
  // 4. 遍历所有表单，提取规则
  console.log('\n🔍 开始提取规则数据...\n');
  
  const allFormulas = [];
  const allLinkageRules = [];
  const allValidationRules = [];
  const allActions = [];
  
  for (const form of forms) {
    console.log(`📄 处理表单: ${form.name}`);
    
    try {
      // 获取表单Schema
      const schema = await getFormSchema(authRef, appId, form.formUuid);
      
      if (!schema) {
        console.log(`   ⚠️  无法获取Schema，跳过`);
        continue;
      }
      
      // 提取公式
      const formulas = extractFormulasFromSchema(schema, form.name);
      if (formulas.length > 0) {
        console.log(`   ✅ 找到 ${formulas.length} 个公式`);
        allFormulas.push(...formulas);
      }
      
      // 提取联动规则
      const linkageRules = extractLinkageRulesFromSchema(schema, form.name);
      if (linkageRules.length > 0) {
        console.log(`   ✅ 找到 ${linkageRules.length} 个联动规则`);
        allLinkageRules.push(...linkageRules);
      }
      
      // 提取校验规则
      const validationRules = extractValidationRulesFromSchema(schema, form.name);
      if (validationRules.length > 0) {
        console.log(`   ✅ 找到 ${validationRules.length} 个校验规则`);
        allValidationRules.push(...validationRules);
      }
      
      // 提取动作代码
      const actions = extractActionsFromSchema(schema, form.name);
      if (actions.length > 0) {
        console.log(`   ✅ 找到 ${actions.length} 个动作代码`);
        allActions.push(...actions);
      }
      
      if (formulas.length === 0 && linkageRules.length === 0 && 
          validationRules.length === 0 && actions.length === 0) {
        console.log(`   ℹ️  未找到规则数据`);
      }
      
    } catch (error) {
      console.log(`   ❌ 处理失败: ${error.message}`);
    }
    
    console.log('');
  }
  
  // 5. 获取集成自动化流程
  console.log('\n🔄 获取集成自动化流程...');
  let automationFlows = [];
  try {
    const flowList = await getAutomationFlowList(authRef, appId);
    
    for (const flow of flowList) {
      try {
        // 获取流程详情
        const flowDetail = await getAutomationFlowDetail(authRef, appId, flow.id || flow.flowId);
        if (flowDetail) {
          automationFlows.push({
            id: flow.id || flow.flowId,
            name: flow.name || flow.flowName || '未命名流程',
            status: flow.status || 'unknown',
            trigger: flowDetail.trigger || flow.trigger,
            actions: flowDetail.actions || flow.actions,
            description: flow.description || flowDetail.description
          });
        }
      } catch (e) {
        console.log(`   ⚠️  获取流程详情失败: ${flow.name || flow.id}`);
      }
    }
    
    console.log(`   ✅ 成功获取 ${automationFlows.length} 个自动化流程详情`);
  } catch (error) {
    console.log(`   ⚠️  获取自动化流程失败: ${error.message}`);
  }
  
  // 6. 生成规则清单
  console.log('\n📝 生成系统规则清单...');
  
  // 从系统配置清单获取应用名称
  let appName = '未知应用';
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const appNameMatch = configContent.match(/#\s*(.+?)\s*-\s*系统配置清单/);
    if (appNameMatch) {
      appName = appNameMatch[1].trim();
    }
  }
  
  const markdown = generateRulesMarkdown(
    appName,
    allFormulas,
    allLinkageRules,
    allValidationRules,
    allActions,
    automationFlows
  );
  
  // 7. 保存文件
  const outputPath = path.join(outputDir, '系统规则清单.md');
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  
  console.log(`   ✅ 已保存: ${outputPath}`);
  
  // 8. 输出统计
  console.log('\n' + '='.repeat(60));
  console.log('  同步完成');
  console.log('='.repeat(60));
  console.log(`  自动化流程: ${automationFlows.length}`);
  console.log(`  公式字段: ${allFormulas.length}`);
  console.log(`  联动规则: ${allLinkageRules.length}`);
  console.log(`  校验规则: ${allValidationRules.length}`);
  console.log(`  动作代码: ${allActions.length}`);
  console.log('='.repeat(60));
  
  return {
    success: true,
    appId: appId,
    appName: appName,
    outputPath: outputPath,
    stats: {
      automationFlows: automationFlows.length,
      formulas: allFormulas.length,
      linkageRules: allLinkageRules.length,
      validationRules: allValidationRules.length,
      actions: allActions.length
    }
  };
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const options = {
    appId: null,
    outputDir: './'
  };
  
  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--appId' && i + 1 < args.length) {
      options.appId = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      options.outputDir = args[i + 1];
      i++;
    }
  }
  
  try {
    const result = await syncRules(options);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}`);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { syncRules };
