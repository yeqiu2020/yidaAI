/**
 * 作者：叶秋
 * 联系方式：
 * 来源：www.yidatrain.com
 * 宜搭公式生成器 - AI调用包装器
 * 版本: 4.0.1
 *
 * 提供简化的函数接口供AI直接调用
 * 强制进行函数验证，确保所有函数都存在于宜搭官方文档
 * 强制检查Node.js环境，如未安装则自动安装
 * 自动清理临时脚本文件
 * 支持智能输出路径（项目案例/场景案例）
 * 修复：CLI方式自动为字段名添加零宽空格
 * 修复：避免重复添加零宽空格，支持检测已有零宽空格的字段名
 * 修复：自动清理temp_formula.txt等临时文件
 * 修复：CLI执行后立即清理临时公式文件，避免IDE文件监控弹窗
 * 修复：支持查找包含"提示词"的.md文件（如公式提示词.md、提示词.md等）
 * 修复：子表字段 marks 位置计算 - 必须将 "子表名.字段名" 作为整体标记
 * 修复：改进零宽空格添加逻辑，使用更可靠的字符串替换方式
 */

const { generateAndSaveFormula, FieldConfig, ZERO_WIDTH_SPACE } = require('./generate_formula.js');
const { validateFormulaStrict } = require('./formula_function_validator.js');
const { ensureNodeJsEnvironment, getEnvironmentReport } = require('./nodejs_env_checker.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * 获取提示词文件所在目录
 * 通过遍历调用栈查找包含"提示词"的.md文件
 * @returns {string|null} 提示词文件所在目录路径
 */
function getPromptFileDirectory() {
  // 获取当前工作目录
  const cwd = process.cwd();
  
  // 尝试在当前工作目录及其子目录中查找包含"提示词"的.md文件
  function findPromptFile(dir, depth = 0) {
    if (depth > 3) return null; // 限制搜索深度
    
    try {
      const files = fs.readdirSync(dir);
      
      // 检查当前目录是否有包含"提示词"的.md文件（如：公式提示词.md、提示词.md等）
      const promptFile = files.find(file => file.includes('提示词') && file.endsWith('.md'));
      if (promptFile) {
        return dir;
      }
      
      // 递归检查子目录
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !file.startsWith('.') && !file.startsWith('node_modules')) {
          const result = findPromptFile(fullPath, depth + 1);
          if (result) return result;
        }
      }
    } catch (err) {
      return null;
    }
    return null;
  }
  
  return findPromptFile(cwd);
}

/**
 * 解析输出路径配置
 * @param {string} outputConfig - 输出路径配置（"项目案例"、"场景案例"或具体路径）
 * @param {string} formulaName - 公式名称
 * @returns {Object} 解析后的路径配置
 */
function resolveOutputPath(outputConfig, formulaName) {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  
  // 如果没有配置，默认只保存到场景案例库
  if (!outputConfig) {
    return {
      projectPath: null,
      caseLibraryPath: path.join(projectRoot, "02宜搭场景案例库", "宜搭公式", "其他", `${formulaName}.json`)
    };
  }
  
  // 配置为"项目案例" - 保存到当前提示词所在表单目录
  if (outputConfig === '项目案例') {
    const promptDir = getPromptFileDirectory();
    if (promptDir) {
      const formulaDir = path.join(promptDir, '公式');
      return {
        projectPath: path.join(formulaDir, `${formulaName}.json`),
        caseLibraryPath: null // 项目案例模式下不自动保存到场景库
      };
    } else {
      console.warn('⚠️ 未找到提示词.md文件，将保存到默认位置');
      return {
        projectPath: null,
        caseLibraryPath: path.join(projectRoot, "02宜搭场景案例库", "宜搭公式", "其他", `${formulaName}.json`)
      };
    }
  }
  
  // 配置为"场景案例" - 保存到场景案例库
  if (outputConfig === '场景案例') {
    return {
      projectPath: null,
      caseLibraryPath: path.join(projectRoot, "02宜搭场景案例库", "宜搭公式", "其他", `${formulaName}.json`)
    };
  }
  
  // 配置为具体路径 - 直接使用
  return {
    projectPath: outputConfig,
    caseLibraryPath: null
  };
}

/**
 * AI调用的主函数
 * @param {Object} config - 公式配置
 * @param {string} config.formulaName - 公式名称
 * @param {string} config.category - 分类目录（日期计算/文本处理/逻辑判断/数学计算/身份证处理/子表处理/其他）
 * @param {string} config.formulaText - 公式文本（已包含零宽空格包裹的字段名）
 * @param {Array<{displayName: string, fieldId: string}>} config.fields - 字段配置数组
 * @param {string} [config.outputPath] - 输出路径配置："项目案例"、"场景案例"或具体路径
 * @param {string} [config.category] - 分类目录（用于场景案例库保存）
 * @throws {Error} - 函数验证失败时抛出错误
 */
async function generateYidaFormula(config) {
  const { formulaName, category, formulaText, fields, outputPath: outputConfig } = config;

  // 验证参数
  if (!formulaName || !formulaText || !fields) {
    throw new Error('缺少必需参数: formulaName, formulaText, fields');
  }

  // ========== 强制Node.js环境检查 ==========
  console.log('\n' + '='.repeat(50));
  console.log('🚀 宜搭公式生成器 v3.2.0');
  console.log('='.repeat(50) + '\n');
  
  const envReady = await ensureNodeJsEnvironment();
  if (!envReady) {
    const report = getEnvironmentReport();
    console.error(report);
    throw new Error(
      '\n❌ Node.js环境检查失败！\n\n' +
      '公式生成必须使用Node.js程序计算marks位置，\n' +
      '手工计算或Python计算都是严格禁止的！\n\n' +
      '请确保Node.js正确安装后重试。\n'
    );
  }
  // ==========================================

  // ========== 强制函数验证 ==========
  // 去除零宽空格后进行验证
  const cleanFormula = formulaText.replace(new RegExp(ZERO_WIDTH_SPACE, 'g'), '');
  console.log('🔍 正在验证公式函数...');
  validateFormulaStrict(cleanFormula);
  console.log('✅ 函数验证通过\n');
  // ==================================

  // 创建字段配置对象
  const fieldConfigs = fields.map(f => new FieldConfig(f.displayName, f.fieldId));

  // 解析输出路径配置
  const { projectPath, caseLibraryPath } = resolveOutputPath(outputConfig, formulaName);
  const results = [];

  // 1. 保存到项目目录（如果配置了）
  if (projectPath) {
    const projectResult = generateAndSaveFormula(formulaText, fieldConfigs, projectPath);
    results.push({ path: projectPath, marksCount: projectResult.marks.length, type: '项目案例' });
    console.log(`✅ 公式已保存到项目目录: ${projectPath}`);
  }

  // 2. 保存到场景案例库（如果配置了）
  if (caseLibraryPath && category) {
    const finalCasePath = path.join(path.dirname(caseLibraryPath), category, `${formulaName}.json`);
    const caseResult = generateAndSaveFormula(formulaText, fieldConfigs, finalCasePath);
    results.push({ path: finalCasePath, marksCount: caseResult.marks.length, type: '场景案例' });
    console.log(`✅ 公式已保存到场景案例库: ${finalCasePath}`);
  }

  // 自动清理临时脚本文件
  cleanupTempScripts();

  console.log('\n' + '='.repeat(50));
  console.log('✅ 公式生成成功！');
  console.log('='.repeat(50));

  const primaryPath = projectPath || caseLibraryPath;
  return {
    success: true,
    results,
    primaryPath,
    message: `公式已生成到 ${results.length} 个位置`
  };
}

/**
 * 构建公式文本的辅助函数
 * @param {string} template - 公式模板（使用 {字段名} 占位符）
 * @param {Array<string>} fieldNames - 字段名数组
 * @returns {string} 包含零宽空格的公式文本
 */
function buildFormulaText(template, fieldNames) {
  let text = template;
  
  fieldNames.forEach(fieldName => {
    const placeholder = `{${fieldName}}`;
    const wrapped = `${ZERO_WIDTH_SPACE}${fieldName}${ZERO_WIDTH_SPACE}`;
    text = text.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), wrapped);
  });
  
  return text;
}

/**
 * 清理CLI临时公式文件
 * 删除通过 --formulaFile 参数指定的临时文件
 * @param {string} filePath - 临时文件路径
 */
function cleanupCliTempFile(filePath) {
  try {
    // 只清理在项目目录中的临时文件（系统临时目录的由系统管理）
    const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const absolutePath = path.resolve(filePath);
    
    // 检查文件是否在项目目录中
    if (absolutePath.startsWith(projectRoot)) {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log(`🗑️  已自动清理临时文件: ${path.basename(filePath)}`);
      }
    }
  } catch (err) {
    // 静默处理清理错误，不影响主流程
    console.warn(`⚠️  清理临时文件失败: ${err.message}`);
  }
}

/**
 * 自动清理临时脚本文件
 * 删除当前目录下以 generate_ 开头、以 .js 结尾的临时文件
 * 删除 temp_formula*.txt 格式的临时公式文件
 * 保护核心文件不被删除
 */
function cleanupTempScripts() {
  // 核心文件保护列表（这些文件不会被删除）
  const protectedFiles = [
    'generate_formula.js',           // 核心生成器文件
    'formula_generator_wrapper.js',  // 包装器文件
    'formula_function_validator.js', // 函数验证器
    'formula_builder.js',            // 公式构建器
    'nodejs_env_checker.js',         // Node.js环境检查器
  ];

  try {
    // 清理项目根目录下的临时脚本
    const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const files = fs.readdirSync(projectRoot);

    files.forEach(file => {
      // 匹配 generate_*.js 格式的临时脚本
      if (file.startsWith('generate_') && file.endsWith('.js')) {
        // 跳过受保护的文件
        if (protectedFiles.includes(file)) {
          console.log(`🛡️  保护核心文件: ${file}`);
          return;
        }

        const filePath = path.join(projectRoot, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️  已删除临时脚本: ${file}`);
        } catch (err) {
          console.warn(`⚠️  无法删除文件 ${file}: ${err.message}`);
        }
      }

      // 匹配 temp_formula*.txt 格式的临时公式文件
      if (file.startsWith('temp_formula') && file.endsWith('.txt')) {
        const filePath = path.join(projectRoot, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️  已删除临时公式文件: ${file}`);
        } catch (err) {
          console.warn(`⚠️  无法删除文件 ${file}: ${err.message}`);
        }
      }
    });
  } catch (err) {
    console.warn(`⚠️  清理临时脚本时出错: ${err.message}`);
  }
}

// ==================== CLI 支持 ====================

/**
 * 解析命令行参数
 * @returns {Object} 解析后的参数
 */
function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      options[key] = value;
      if (value !== true) i++;
    }
  }

  return options;
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
宜搭公式生成器 - CLI 使用说明
版本: 3.8.0

使用方法:
  node formula_generator_wrapper.js [选项]

选项:
  --config <文件路径>        JSON配置文件路径（推荐用于复杂公式）
  --formulaName <名称>       公式名称（必需）
  --category <分类>          分类目录（必需：日期计算/文本处理/逻辑判断/数学计算/身份证处理/子表处理/其他）
  --fields <字段配置>        字段配置，格式: "显示名:字段ID,显示名2:字段ID2"（可选，纯系统函数公式可不传）
  --formulaFile <文件路径>   公式文本文件路径（解决命令行引号问题）
  --formulaBase64 <base64>   Base64编码的公式文本（解决零宽空格问题）
  --outputPath <路径>        输出路径（项目案例/场景案例/具体路径）
  --help                     显示此帮助信息

示例:
  1. 使用配置文件:
     node formula_generator_wrapper.js --config ./formula-config.json

  2. 使用公式文件（自动添加零宽空格）:
     node formula_generator_wrapper.js --formulaName="测试公式" --category="文本处理" --fields="姓名:textField_123" --formulaFile="./formula.txt"
     # 注：公式文件中直接写字段名即可，如：CONCATENATE("姓名:",姓名)

  3. 纯系统函数公式（无字段引用，如 NOW(), TODAY()）:
     node formula_generator_wrapper.js --formulaName="日期校验" --category="逻辑判断" --formulaFile="./formula.txt"
     # 注：不需要 --fields 参数

  4. 使用Base64编码（已包含零宽空格）:
     node formula_generator_wrapper.js --formulaName="测试公式" --category="文本处理" --fields="姓名:textField_123" --formulaBase64="SUYoTEVOKO..."

配置文件格式 (formula-config.json):
  {
    "formulaName": "公式名称",
    "category": "分类目录",
    "formulaText": "公式文本（含零宽空格）",
    "fields": [],  // 纯系统函数公式可传空数组
    "outputPath": "项目案例"
  }
`);
}

/**
 * 解析字段配置字符串
 * @param {string} fieldsStr - 字段配置字符串，格式: "显示名:字段ID,显示名2:字段ID2"
 * @returns {Array} 字段配置数组
 */
function parseFields(fieldsStr) {
  // 处理 undefined、null、布尔值true（空参数默认值）、空字符串、纯空格等情况
  if (!fieldsStr || fieldsStr === true || String(fieldsStr).trim() === '') {
    return [];
  }
  
  return fieldsStr.split(',').map(field => {
    const parts = field.split(':');
    if (parts.length !== 2) {
      throw new Error(`字段配置格式错误: ${field}，正确格式: 显示名:字段ID`);
    }
    return {
      displayName: parts[0].trim(),
      fieldId: parts[1].trim()
    };
  });
}

/**
 * 从文件读取公式文本
 * @param {string} filePath - 文件路径
 * @returns {string} 公式文本
 */
function readFormulaFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`公式文件不存在: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

/**
 * CLI 主函数
 */
async function runCli() {
  const args = parseCliArgs();

  // 显示帮助
  if (args.help || Object.keys(args).length === 0) {
    showHelp();
    process.exit(0);
  }

  try {
    let config;

    // 方式1: 使用配置文件
    if (args.config) {
      if (!fs.existsSync(args.config)) {
        throw new Error(`配置文件不存在: ${args.config}`);
      }
      config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
      console.log(`📄 从配置文件加载: ${args.config}`);
    }
    // 方式2: 使用命令行参数
    else {
      // 验证必需参数
      if (!args.formulaName) {
        throw new Error('缺少必需参数: --formulaName');
      }
      if (!args.category) {
        throw new Error('缺少必需参数: --category');
      }
      // --fields 变为可选参数，支持纯系统函数公式（如 NOW(), TODAY() 等）

      let formulaText;
      const parsedFields = parseFields(args.fields);
      const fieldNames = parsedFields.map(f => f.displayName);

      // 从文件读取公式
      if (args.formulaFile) {
        let rawFormulaText = readFormulaFromFile(args.formulaFile);
        // 自动为字段名添加零宽空格（使用更可靠的字符串替换方式）
        fieldNames.forEach(fieldName => {
          const wrapped = `${ZERO_WIDTH_SPACE}${fieldName}${ZERO_WIDTH_SPACE}`;
          
          // 方法1: 先检查是否已经包含零宽空格，如果存在则先移除
          const patternWithZws = `${ZERO_WIDTH_SPACE}${fieldName}${ZERO_WIDTH_SPACE}`;
          const patternWithLeftZws = `${ZERO_WIDTH_SPACE}${fieldName}`;
          const patternWithRightZws = `${fieldName}${ZERO_WIDTH_SPACE}`;
          
          // 方法2: 使用字符串分割和连接，避免正则表达式问题
          let result = '';
          let remaining = rawFormulaText;
          let index = remaining.indexOf(fieldName);
          
          while (index !== -1) {
            // 检查前后是否已经有零宽空格
            const hasLeftZws = index > 0 && remaining.charAt(index - 1) === ZERO_WIDTH_SPACE;
            const hasRightZws = index + fieldName.length < remaining.length && 
                               remaining.charAt(index + fieldName.length) === ZERO_WIDTH_SPACE;
            
            // 添加前面的内容
            result += remaining.substring(0, index);
            
            // 根据情况添加字段名（带或不带零宽空格）
            if (hasLeftZws && hasRightZws) {
              // 已经有完整的零宽空格包裹，保持不变
              result += remaining.substring(index, index + fieldName.length);
            } else if (hasLeftZws) {
              // 只有左边有零宽空格，添加右边
              result += fieldName + ZERO_WIDTH_SPACE;
            } else if (hasRightZws) {
              // 只有右边有零宽空格，添加左边
              result += ZERO_WIDTH_SPACE + fieldName;
            } else {
              // 完全没有零宽空格，添加完整的包裹
              result += wrapped;
            }
            
            // 继续处理剩余部分
            remaining = remaining.substring(index + fieldName.length);
            index = remaining.indexOf(fieldName);
          }
          result += remaining;
          rawFormulaText = result;
        });
        formulaText = rawFormulaText;
        console.log(`📄 从文件加载公式: ${args.formulaFile}`);
        console.log(`📝 已自动为 ${fieldNames.length} 个字段添加零宽空格`);
      }
      // 从Base64解码公式
      else if (args.formulaBase64) {
        formulaText = Buffer.from(args.formulaBase64, 'base64').toString('utf8');
        console.log('📄 从Base64解码公式');
      }
      else {
        throw new Error('必须提供 --formulaFile 或 --formulaBase64 参数');
      }

      config = {
        formulaName: args.formulaName,
        category: args.category,
        formulaText: formulaText,
        fields: parsedFields,
        outputPath: args.outputPath || '场景案例'
      };
    }

    // 生成公式
    const result = await generateYidaFormula(config);
    
    console.log('\n✅ CLI 执行成功！');
    console.log(`📁 文件路径: ${result.primaryPath}`);
    
    // 清理CLI使用的临时公式文件
    if (args.formulaFile) {
      cleanupCliTempFile(args.formulaFile);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ CLI 执行失败:', error.message);
    process.exit(1);
  }
}

// 如果是直接运行此文件（非被require），则执行CLI
if (require.main === module) {
  runCli();
}

module.exports = {
  generateYidaFormula,
  buildFormulaText,
  ZERO_WIDTH_SPACE,
  cleanupTempScripts,
  ensureNodeJsEnvironment,
  getEnvironmentReport,
  // CLI相关导出
  runCli,
  parseCliArgs,
  parseFields
};
