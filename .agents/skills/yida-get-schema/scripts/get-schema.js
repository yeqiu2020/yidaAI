/**
 * 宜搭表单 Schema 获取器
 * 版本: 1.0.0
 * 更新日期: 2026-03-12
 * 
 * 功能: 从宜搭平台获取指定表单的完整 Schema 结构
 * 用法: node get-schema.js <appType> <formUuid>
 * 示例: node get-schema.js APP_E0MZ4VB75ZMB1BIGNVT4 FORM-xxx
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==================== 配置 ====================

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const API_CLIENT_DIR = path.join(PROJECT_ROOT, '.agents', 'skills', 'yida-api-client', 'scripts');

// ==================== 工具函数 ====================

/**
 * 查找项目根目录
 * @returns {string} 项目根目录路径
 */
function findProjectRoot() {
  let currentDir = process.cwd();
  
  // 向上查找包含 .agents 目录的文件夹
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, '.agents'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  return PROJECT_ROOT;
}

/**
 * 获取登录态
 * @returns {Object} 包含 cookie 和 baseUrl 的登录态
 */
function getLoginState() {
  const projectRoot = findProjectRoot();
  const cookiesPath = path.join(projectRoot, '.cookies.json');
  
  if (!fs.existsSync(cookiesPath)) {
    throw new Error('未找到登录态文件，请先运行登录脚本');
  }
  
  const cookiesData = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
  
  return {
    cookies: cookiesData.cookies || cookiesData,
    baseUrl: cookiesData.base_url || 'https://www.aliwork.com'
  };
}

/**
 * 将 cookies 数组转换为字符串
 * @param {Array} cookies - cookies 数组
 * @returns {string} cookie 字符串
 */
function cookiesToString(cookies) {
  if (typeof cookies === 'string') return cookies;
  if (Array.isArray(cookies)) {
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }
  return '';
}

/**
 * 获取表单 Schema
 * @param {string} appType - 应用 ID
 * @param {string} formUuid - 表单 UUID
 * @returns {Promise<Object>} Schema 对象
 */
async function getFormSchema(appType, formUuid) {
  const loginState = getLoginState();
  const baseUrl = loginState.baseUrl;
  const cookieStr = cookiesToString(loginState.cookies);
  
  const url = `${baseUrl}/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json?formUuid=${formUuid}&schemaVersion=V5`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookieStr,
        'Accept': 'application/json',
        'Referer': `${baseUrl}/`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`获取 Schema 失败: ${data.errorMsg || '未知错误'}`);
    }
    
    return data.content || data.data;
  } catch (error) {
    throw new Error(`获取 Schema 失败: ${error.message}`);
  }
}

/**
 * 执行登录
 * @returns {boolean} 是否登录成功
 */
function doLogin() {
  try {
    const loginScript = path.join(API_CLIENT_DIR, 'login_manager.js');
    
    if (!fs.existsSync(loginScript)) {
      console.error('❌ 未找到登录脚本');
      return false;
    }
    
    console.log('🔐 需要登录，正在启动登录流程...');
    
    const result = execSync(`node "${loginScript}"`, {
      encoding: 'utf-8',
      stdio: 'inherit',
      timeout: 120000
    });
    
    return true;
  } catch (error) {
    console.error('❌ 登录失败:', error.message);
    return false;
  }
}

// ==================== 主函数 ====================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('用法: node get-schema.js <appType> <formUuid>');
    console.error('示例: node get-schema.js APP_E0MZ4VB75ZMB1BIGNVT4 FORM-xxx');
    process.exit(1);
  }
  
  const [appType, formUuid] = args;
  
  console.error(`🔍 正在获取表单 Schema...`);
  console.error(`   应用: ${appType}`);
  console.error(`   表单: ${formUuid}`);
  
  try {
    // 检查登录态
    const projectRoot = findProjectRoot();
    const cookiesPath = path.join(projectRoot, '.cookies.json');
    
    if (!fs.existsSync(cookiesPath)) {
      console.error('⚠️  未找到登录态，需要先登录');
      const loggedIn = doLogin();
      if (!loggedIn) {
        process.exit(1);
      }
    }
    
    // 获取 Schema
    const schema = await getFormSchema(appType, formUuid);
    
    // 输出到 stdout
    console.log(JSON.stringify(schema, null, 2));
    
  } catch (error) {
    // 如果是登录问题，尝试重新登录
    if (error.message.includes('登录') || error.message.includes('302') || error.message.includes('Unauthorized')) {
      console.error('⚠️  登录态失效，尝试重新登录...');
      const loggedIn = doLogin();
      if (loggedIn) {
        // 重试
        try {
          const schema = await getFormSchema(appType, formUuid);
          console.log(JSON.stringify(schema, null, 2));
          return;
        } catch (retryError) {
          console.error('❌ 重试失败:', retryError.message);
          process.exit(1);
        }
      }
    }
    
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();
