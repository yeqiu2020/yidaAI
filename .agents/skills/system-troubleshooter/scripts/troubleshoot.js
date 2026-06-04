/**
 * System Troubleshooter CLI - V1.0.0
 * 系统问题处理中心命令行工具
 * 可被其他 Skill 调用，也可独立运行
 * 
 * 用法：
 *   node troubleshoot.js                    # 交互式诊断
 *   node troubleshoot.js encoding           # 处理编码问题
 *   node troubleshoot.js environment        # 处理环境问题
 *   node troubleshoot.js list               # 列出所有已知问题
 *   node troubleshoot.js show <问题ID>      # 显示特定问题详情
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 知识库路径
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '..', 'knowledge-base');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * 获取所有问题类型
 */
function getProblemCategories() {
  if (!fs.existsSync(KNOWLEDGE_BASE_PATH)) {
    return [];
  }
  
  return fs.readdirSync(KNOWLEDGE_BASE_PATH, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

/**
 * 获取特定类型下的所有问题
 */
function getProblemsByCategory(category) {
  const categoryPath = path.join(KNOWLEDGE_BASE_PATH, category);
  
  if (!fs.existsSync(categoryPath)) {
    return [];
  }
  
  return fs.readdirSync(categoryPath)
    .filter(file => file.endsWith('.md'))
    .map(file => ({
      id: `${category}/${file.replace('.md', '')}`,
      category: category,
      file: file,
      path: path.join(categoryPath, file)
    }));
}

/**
 * 读取问题详情
 */
function getProblemDetail(problemId) {
  const [category, name] = problemId.split('/');
  const filePath = path.join(KNOWLEDGE_BASE_PATH, category, `${name}.md`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 搜索问题
 */
function searchProblems(keyword) {
  const results = [];
  const categories = getProblemCategories();
  
  for (const category of categories) {
    const problems = getProblemsByCategory(category);
    
    for (const problem of problems) {
      const content = fs.readFileSync(problem.path, 'utf-8');
      
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        // 提取标题
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : problem.file;
        
        results.push({
          id: problem.id,
          title: title,
          category: category
        });
      }
    }
  }
  
  return results;
}

/**
 * 显示问题列表
 */
function listProblems() {
  console.log(`${colors.cyan}=== 已知问题列表 ===${colors.reset}\n`);
  
  const categories = getProblemCategories();
  
  if (categories.length === 0) {
    console.log('暂无记录的问题');
    return;
  }
  
  for (const category of categories) {
    console.log(`${colors.yellow}[${category}]${colors.reset}`);
    
    const problems = getProblemsByCategory(category);
    for (const problem of problems) {
      const content = fs.readFileSync(problem.path, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : problem.file;
      
      console.log(`  - ${problem.id}: ${title}`);
    }
    console.log('');
  }
}

/**
 * 显示问题详情
 */
function showProblem(problemId) {
  const detail = getProblemDetail(problemId);
  
  if (!detail) {
    console.log(`${colors.red}错误：找不到问题 ${problemId}${colors.reset}`);
    console.log(`使用 'list' 命令查看所有已知问题`);
    return;
  }
  
  console.log(detail);
}

/**
 * 处理编码问题
 */
function handleEncodingProblem() {
  console.log(`${colors.cyan}=== 处理编码问题 ===${colors.reset}\n`);
  
  // 尝试自动修复
  console.log('尝试自动修复...');
  
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
    console.log(`${colors.green}✅ 已设置 UTF-8 编码${colors.reset}\n`);
  } catch (e) {
    console.log(`${colors.yellow}⚠️  自动设置失败${colors.reset}\n`);
  }
  
  // 显示详细解决方案
  const detail = getProblemDetail('encoding/terminal-garbled');
  if (detail) {
    console.log('详细解决方案：');
    console.log(detail);
  } else {
    console.log('临时解决方案：');
    console.log('1. 执行: chcp 65001');
    console.log('2. 或执行: $OutputEncoding = [System.Text.Encoding]::UTF8');
    console.log('3. 然后重新运行脚本\n');
  }
}

/**
 * 交互式诊断
 */
function interactiveDiagnosis() {
  console.log(`${colors.cyan}=== 系统问题诊断中心 ===${colors.reset}\n`);
  console.log('请选择问题类型：');
  console.log('  1. 编码问题（乱码）');
  console.log('  2. 环境问题（Node.js/依赖）');
  console.log('  3. 执行问题（权限/命令）');
  console.log('  4. 网络问题（连接/API）');
  console.log('  5. 配置问题（JSON/路径）');
  console.log('  6. 查看所有已知问题');
  console.log('  0. 退出\n');
  
  // 这里可以添加交互逻辑
  // 目前显示帮助信息
  console.log(`${colors.gray}提示：使用命令行参数直接处理问题${colors.reset}`);
  console.log('  node troubleshoot.js encoding');
  console.log('  node troubleshoot.js list');
  console.log('  node troubleshoot.js show encoding/terminal-garbled');
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // 设置 UTF-8 编码
  if (process.platform === 'win32') {
    try {
      execSync('chcp 65001', { stdio: 'ignore' });
    } catch (e) {}
  }
  
  switch (command) {
    case 'encoding':
      handleEncodingProblem();
      break;
      
    case 'environment':
      console.log(`${colors.cyan}=== 处理环境问题 ===${colors.reset}\n`);
      console.log('请检查：');
      console.log('1. Node.js 是否安装: node -v');
      console.log('2. 环境变量是否配置');
      console.log('3. 依赖是否安装: npm install\n');
      break;
      
    case 'list':
      listProblems();
      break;
      
    case 'show':
      if (args[1]) {
        showProblem(args[1]);
      } else {
        console.log('用法: node troubleshoot.js show <问题ID>');
        console.log('例如: node troubleshoot.js show encoding/terminal-garbled');
      }
      break;
      
    case 'search':
      if (args[1]) {
        const results = searchProblems(args[1]);
        console.log(`${colors.cyan}=== 搜索结果: "${args[1]}" ===${colors.reset}\n`);
        
        if (results.length === 0) {
          console.log('未找到相关问题');
        } else {
          results.forEach(result => {
            console.log(`- ${result.id}: ${result.title}`);
          });
        }
      } else {
        console.log('用法: node troubleshoot.js search <关键词>');
      }
      break;
      
    default:
      interactiveDiagnosis();
  }
}

// 运行主函数
main();
