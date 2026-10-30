/**
 * 问题检测模块 - V1.0.0
 * 供所有 Skill 复用的问题检测和自动处理机制
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 问题类型定义
const PROBLEM_TYPES = {
  ENCODING: 'encoding',
  ENVIRONMENT: 'environment',
  EXECUTION: 'execution',
  NETWORK: 'network',
  CONFIG: 'config'
};

/**
 * 检测终端编码问题
 * @returns {Object|null} 问题信息或null
 */
function detectEncodingProblem() {
  // 检测当前编码设置
  try {
    const outputEncoding = process.env.OutputEncoding || '';
    const chcpResult = execSync('chcp', { encoding: 'utf-8', stdio: 'pipe' });
    const currentCodePage = chcpResult.match(/(\d+)/)?.[1] || '';
    
    // 如果代码页不是 65001 (UTF-8)，可能存在乱码风险
    if (currentCodePage && currentCodePage !== '65001') {
      return {
        type: PROBLEM_TYPES.ENCODING,
        subtype: 'terminal-garbled',
        severity: 'P2',
        description: '终端代码页不是 UTF-8，可能导致中文乱码',
        currentCodePage: currentCodePage,
        solution: '执行 chcp 65001 或设置 $OutputEncoding = [System.Text.Encoding]::UTF8'
      };
    }
  } catch (e) {
    // 忽略检测错误
  }
  
  return null;
}

/**
 * 检测 Node.js 环境问题
 * @returns {Object|null} 问题信息或null
 */
function detectNodeEnvironmentProblem() {
  try {
    execSync('node -v', { stdio: 'pipe' });
    return null;
  } catch (e) {
    return {
      type: PROBLEM_TYPES.ENVIRONMENT,
      subtype: 'node-not-found',
      severity: 'P0',
      description: 'Node.js 命令无法执行，可能未安装或环境变量未配置',
      solution: '检查 Node.js 安装或运行环境初始化脚本'
    };
  }
}

/**
 * 检测网络连接问题
 * @param {string} url - 测试连接的URL
 * @returns {Promise<Object|null>} 问题信息或null
 */
async function detectNetworkProblem(url = 'https://www.aliwork.com') {
  // 这里可以添加网络检测逻辑
  return null;
}

/**
 * 运行全面检测
 * @returns {Array} 检测到的问题列表
 */
function runDetection() {
  const problems = [];
  
  // 检测编码问题
  const encodingProblem = detectEncodingProblem();
  if (encodingProblem) {
    problems.push(encodingProblem);
  }
  
  // 检测环境问题
  const envProblem = detectNodeEnvironmentProblem();
  if (envProblem) {
    problems.push(envProblem);
  }
  
  return problems;
}

/**
 * 自动修复已知问题
 * @param {Object} problem - 问题对象
 * @returns {boolean} 是否修复成功
 */
function autoFix(problem) {
  if (problem.type === PROBLEM_TYPES.ENCODING && problem.subtype === 'terminal-garbled') {
    try {
      execSync('chcp 65001', { stdio: 'ignore' });
      console.log('✅ 已自动设置 UTF-8 编码');
      return true;
    } catch (e) {
      return false;
    }
  }
  
  // 其他问题无法自动修复
  return false;
}

/**
 * 调用 system-troubleshooter 处理问题
 * @param {Object} problem - 问题对象
 */
function callTroubleshooter(problem) {
  const troubleshooterPath = path.join(__dirname, '..', 'scripts', 'troubleshoot.js');
  
  if (fs.existsSync(troubleshooterPath)) {
    try {
      // 将问题信息传递给 troubleshooter
      process.env.TROUBLESHOOTER_PROBLEM = JSON.stringify(problem);
      execSync(`node "${troubleshooterPath}"`, { stdio: 'inherit' });
    } catch (e) {
      // 如果调用失败，显示手动解决方案
      showManualSolution(problem);
    }
  } else {
    showManualSolution(problem);
  }
}

/**
 * 显示手动解决方案
 * @param {Object} problem - 问题对象
 */
function showManualSolution(problem) {
  console.log('\n⚠️  检测到问题：' + problem.description);
  console.log('💡 解决方案：' + problem.solution);
  console.log('📚 详细说明：运行 "node .agents/skills/system-troubleshooter/scripts/troubleshoot.js"');
  console.log('   或说"系统问题"获取帮助\n');
}

/**
 * 主函数：检测并处理问题
 * @param {Object} options - 配置选项
 * @param {boolean} options.autoFix - 是否尝试自动修复
 * @param {boolean} options.callTroubleshooter - 是否调用 troubleshooter
 */
function detectAndHandle(options = {}) {
  const { autoFix: tryAutoFix = true, callTroubleshooter: tryCallTroubleshooter = false } = options;
  
  const problems = runDetection();
  
  if (problems.length === 0) {
    return { ok: true, problems: [] };
  }
  
  console.log(`\n🔍 检测到 ${problems.length} 个问题：\n`);
  
  for (const problem of problems) {
    console.log(`[${problem.severity}] ${problem.type}/${problem.subtype}`);
    console.log(`   ${problem.description}`);
    
    // 尝试自动修复
    if (tryAutoFix) {
      const fixed = autoFix(problem);
      if (fixed) {
        console.log('   ✅ 已自动修复');
        continue;
      }
    }
    
    // 调用 troubleshooter 或显示手动方案
    if (tryCallTroubleshooter) {
      callTroubleshooter(problem);
    } else {
      showManualSolution(problem);
    }
  }
  
  return { ok: false, problems };
}

module.exports = {
  PROBLEM_TYPES,
  detectEncodingProblem,
  detectNodeEnvironmentProblem,
  detectNetworkProblem,
  runDetection,
  autoFix,
  detectAndHandle
};
