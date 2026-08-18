/**
 * 组织初始化登录管理器
 * 通过浏览器自动化完成宜搭平台的登录流程
 * 与 simulated-login 不同，此版本在组织选择环节等待用户手动操作
 *
 * 版本: v1.0.17
 * 更新日期: 2026-08-17
 * 修复: dashboard 页面被误判为"未知页面"导致空转循环的问题
 *       根因：handleLoginFlow 的已登录检测只检查 bodyText 关键词（"表单设计"/"我的应用"等），
 *       而宜搭新版 dashboard 页面内容为"AI宜搭 CLI"、"最近编辑"等，不匹配任何关键词，
 *       导致已登录到 qfhefh.aliwork.com/dashboard 的页面被判为 unknown 状态空转。
 *       修复：当 URL 已是有效组织域名（非 www.aliwork.com）时，直接判定为已登录。
 * 修复: Cookie 验证由 networkidle 改为 domcontentloaded，解决宜搭 SPA 持续后台请求导致"刷新应用信息"卡 30s 超时变慢的问题
 * 修复: Cookie 验证误用 networkidle 且超时即判失效，导致每次刷新应用信息都弹登录页面。
 *       改为与 api-client/login_manager.js 的 fetchPageInfo 一致的验证方式：
 *       networkidle 超时不报错 → 检查是否重定向到登录页 → 循环提取 csrf_token 判断登录态。
 * 修复: 新增 homepage 页面状态识别，在 www.aliwork.com 首页明确提示用户点击"登录注册"按钮
 *       修复首页被误判为"未知页面"的问题，每2秒持续检测并输出清晰的操作指引
 * 修复: 添加 UTF-8 编码支持，解决 Windows 终端中文乱码
 * 修复: 修复页面跳转后未正确检测登录成功状态的问题
 *       在捕获 Execution context was destroyed 异常后，增加重新检测页面状态的逻辑
 *       确保登录成功后能正确识别并返回，不会提前退出流程
 * 修复: 修复 handleLoginFlow 中第256行直接调用 document 导致 Node.js 崩溃退出的严重bug
 *       （原代码使用 document.querySelector('.module-agreement-button-co') 在 Node.js 环境下会直接报错退出）
 *       现已将 hasAgreementBtn 移到 page.evaluate() 内部统一获取，确保所有 DOM 查询都在浏览器环境中执行
 * 修复: 在 while 循环外层添加全局 try-catch，防止未捕获异常导致脚本崩溃
 * 修复: 添加try-catch处理页面跳转导致的Execution context was destroyed错误
 * 修复: 大幅增加每步输出信息，包括URL、标题、状态、页面内容、操作指导
 * 修复: 增加实时状态反馈，检测页面URL和状态变化并输出，提升用户体验
 * 修复: 优化循环检测间隔，从30秒缩短到2秒，让用户操作后能立即响应
 * 修复: 修复误判登录成功的问题，增加URL检查防止将www.aliwork.com首页误判为已登录
 * 修复: 排除docs.aliwork.com等官方站点作为有效的组织域名
 * 修复: 大幅延长用户操作等待时间，最大步骤数从30增加到300
 *       给用户充足时间（5-10分钟）完成登录和组织选择操作
 * 修复: 添加 base_url 有效性验证，防止保存错误的组织域名
 * 新增: 双重保险策略获取组织信息
 *   - 第1重: 访问组织设置页面 (/platformManage/basicInfo) 获取准确信息
 *   - 第2重: 从工作台页面获取组织名称
 *   - 第3重: 从当前页面提取信息作为备用
 */

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require('../../../../lib/core/utils');

// Windows 平台设置 UTF-8 代码页，解决中文乱码
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误，继续执行
  }
}

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 阶段二改造：Cookie 优先全局，兼容项目根
const GLOBAL_COOKIE_FILE = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
const COOKIE_FILE = fs.existsSync(GLOBAL_COOKIE_FILE) ? GLOBAL_COOKIE_FILE : path.join(PROJECT_ROOT, '.cookies.json');
const DEFAULT_BASE_URL = 'https://www.aliwork.com';
const LOGIN_URL = 'https://www.aliwork.com/workPlatform';

// 浏览器可执行文件路径（支持自定义 Playwright 浏览器位置）
const CHROMIUM_EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 
  path.join(PROJECT_ROOT, '.playwright-browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');

// ==================== 浏览器状态检测 ====================

/**
 * 检测错误是否表示浏览器已关闭
 * @param {Error} error - 错误对象
 * @returns {boolean}
 */
function isBrowserClosedError(error) {
  if (!error || !error.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('target closed') ||
    msg.includes('browser closed') ||
    msg.includes('target page, context or browser has been closed') ||
    msg.includes('protocol error') ||
    msg.includes('browser has been closed') ||
    msg.includes('context has been closed')
  );
}

// ==================== URL 验证工具 ====================

/**
 * 验证 base_url 是否是有效的宜搭组织域名
 * 有效的组织域名应该不是 www.aliwork.com，而是类似 xxx.aliwork.com 的格式
 * @param {string} baseUrl - 要验证的 URL
 * @returns {boolean} 是否有效
 */
function isValidOrgBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return false;
  }
  
  // 必须是 aliwork.com 域名
  if (!baseUrl.includes('.aliwork.com')) {
    console.log('    ⚠️ URL 不是宜搭域名:', baseUrl);
    return false;
  }
  
  // 提取域名前缀
  const domainPrefix = baseUrl.replace('https://', '').replace('.aliwork.com', '');
  
  // 排除无效的域名前缀（包括官方文档站点）
  const invalidPrefixes = ['www', 'login', 'auth', 'docs', 'help', 'support', 'developer', ''];
  if (invalidPrefixes.includes(domainPrefix)) {
    console.log('    ⚠️ URL 不包含有效的组织标识:', baseUrl);
    return false;
  }
  
  return true;
}

/**
 * 从页面中提取正确的 base_url
 * 会尝试多种方式获取，确保返回有效的组织域名
 * @param {Object} page - Playwright page 对象
 * @returns {Promise<string|null>} 有效的 base_url 或 null
 */
async function extractValidBaseUrl(page) {
  const url = page.url();
  console.log('    📄 当前页面 URL:', url);
  
  // 方法1: 直接从当前 URL 提取
  const urlMatch = url.match(/^(https:\/\/[^\/]+)/);
  if (urlMatch) {
    const extractedUrl = urlMatch[1];
    if (isValidOrgBaseUrl(extractedUrl)) {
      console.log('    ✅ 从当前 URL 提取到有效的 base_url:', extractedUrl);
      return extractedUrl;
    }
  }
  
  // 方法2: 从页面中的链接提取（如应用卡片链接）
  try {
    const appLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*=".aliwork.com"]');
      return link ? link.href : null;
    });
    
    if (appLink) {
      const linkMatch = appLink.match(/^(https:\/\/[^\/]+)/);
      if (linkMatch && isValidOrgBaseUrl(linkMatch[1])) {
        console.log('    ✅ 从页面链接提取到有效的 base_url:', linkMatch[1]);
        return linkMatch[1];
      }
    }
  } catch (e) {
    console.log('    ⚠️ 从页面链接提取失败:', e.message);
  }
  
  // 方法3: 检查页面是否包含组织信息
  try {
    const pageText = await page.evaluate(() => document.body.innerText);
    // 如果页面显示错误信息，说明当前 URL 不正确
    if (pageText.includes('应用不存在') || pageText.includes('无权限访问')) {
      console.log('    ⚠️ 页面显示错误或无权访问，当前 URL 可能不正确');
      return null;
    }
  } catch (e) {
    // 忽略错误
  }
  
  console.log('    ❌ 无法提取到有效的 base_url');
  return null;
}

// ==================== Cookie 管理 ====================

/**
 * 加载 Cookie 数据
 * Phase 6: 委托给 lib/core/utils.loadCookieData（统一实现）
 * @returns {Object|null} Cookie 数据对象或 null
 */
function loadCookieData() {
  return coreUtils.loadCookieData(PROJECT_ROOT, DEFAULT_BASE_URL);
}

/**
 * 保存 Cookie 数据
 * @param {Object} data - 包含 cookies、base_url、login_user 等的对象
 */
function saveCookieData(data) {
  try {
    const dataToSave = {
      ...data,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(dataToSave, null, 2));
    console.log('  ✅ 登录态已保存到 .cookies.json');
  } catch (e) {
    console.error('  ❌ 保存 Cookie 失败:', e.message);
  }
}

// ==================== 登录流程处理 ====================

/**
 * 处理宜搭登录授权流程
 * 自动处理各种登录页面，但在组织选择时等待用户手动操作
 * 
 * @param {Object} page - Playwright page 对象
 * @param {Object} browser - Playwright browser 对象（用于检测浏览器是否关闭）
 * @param {Object} config - 配置选项
 * @returns {Promise<Object>} {success, message, browserClosed}
 */
async function handleLoginFlow(page, browser, config = {}) {
  console.log('  🔐 开始处理登录流程...');
  console.log('  📋 系统会实时显示页面状态和指导信息，请按照提示操作');
  
  const maxSteps = 300; // 【重要】增加最大步骤数，给用户充足时间（5-10分钟）完成登录和组织选择
  let step = 0;
  let loginButtonPrompted = false;
  let orgSelectPrompted = false;
  let lastPageState = null;
  let lastUrl = '';
  
  while (step < maxSteps) {
    step++;
    
    // 等待2秒后检测
    await page.waitForTimeout(2000);
    
    let currentUrl;
    let pageInfo;
    
    // 【全局try-catch】处理页面跳转、上下文销毁等未预期异常，防止脚本崩溃
    try {
      // 获取当前URL和页面信息
      currentUrl = page.url();
      pageInfo = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        const title = document.title || '';
        
        // 检测各种页面元素
        const hasQrCode = document.querySelector('.login-qr-code, .qrcode, [class*="qr"]') !== null;
        const hasAvatar = document.querySelector('.base-comp-avatar-pic') !== null;
        const hasLoginBtn = document.querySelector('.module-confirm-button') !== null;
        const hasOrgCards = document.querySelectorAll('[class*="org"], [class*="corp"]').length > 0;
        const orgCount = document.querySelectorAll('.org-card, [class*="OrgCard"], [class*="org-item"]').length;
        const hasAgreementBtn = document.querySelector('.module-agreement-button-co') !== null;
        
        return {
          title,
          bodyText: bodyText.substring(0, 500), // 前500字符
          hasQrCode,
          hasAvatar,
          hasLoginBtn,
          hasOrgCards,
          orgCount,
          hasAgreementBtn,
          url: window.location.href
        };
      });
    } catch (e) {
      // 【新增】检测浏览器是否被关闭
      if (isBrowserClosedError(e)) {
        console.log('\n⚠️ ============================================');
        console.log('   🔴 检测到浏览器已被关闭！');
        console.log('   📌 请不要关闭浏览器窗口，保持浏览器打开');
        console.log('   👉 如果浏览器被误关，请重新打开并访问宜搭');
        console.log('   🔄 脚本将尝试重新连接浏览器...');
        console.log('   ============================================\n');
        return { success: false, message: '浏览器被关闭', browserClosed: true };
      }
      
      // 页面正在跳转或上下文被销毁，等待后重试
      if (e.message.includes('Execution context was destroyed') || e.message.includes('contextDestroyed')) {
        console.log(`\n⏳ 页面正在跳转中，等待上下文重建...`);
        await page.waitForTimeout(3000);
        
        // 【关键修复】页面跳转后，重新检测当前页面状态
        // 可能是登录成功后跳转到工作台，需要重新获取页面信息
        try {
          currentUrl = page.url();
          console.log(`   跳转后URL: ${currentUrl}`);
          
          // 检查是否已经跳转到工作台（登录成功）
          if (!currentUrl.includes('www.aliwork.com') && currentUrl.includes('.aliwork.com')) {
            // 可能是已登录状态，尝试获取页面内容确认
            const bodyText = await page.evaluate(() => document.body?.innerText || '');
            const title = await page.evaluate(() => document.title || '');
            
            console.log(`   跳转后标题: ${title}`);
            console.log(`   页面内容预览: ${bodyText.substring(0, 100).replace(/\n/g, ' ')}...`);
            
            // 检查是否已登录到工作台
            if (bodyText.includes('我的应用') || bodyText.includes('工作台') || 
                bodyText.includes('表单设计') || bodyText.includes('组件库') ||
                title.includes('工作台') || title.includes('我的应用')) {
              console.log(`\n✅ 检测到登录成功！已进入宜搭工作台`);
              console.log(`   URL: ${currentUrl}`);
              await page.waitForTimeout(3000);
              return { success: true, message: '登录成功' };
            }
          }
        } catch (retryError) {
          console.log(`   跳转后检测失败: ${retryError.message}`);
        }
        
        continue;
      } else {
        console.log(`\n 检测到异常: ${e.message}`);
        console.log(`   等待页面稳定后重试...`);
      }
      await page.waitForTimeout(3000);
      continue;
    }
    
    // 判断页面状态
    const bodyText = pageInfo.bodyText;
    let pageState = { type: 'unknown', message: '未知页面' };

    // 0. 【最高优先级】检查 URL 是否已是有效组织域名（非 www.aliwork.com 的 *.aliwork.com）
    //    这是最可靠的登录态判断：能访问组织域名说明登录已成功，不依赖页面内容关键词
    //    新版宜搭 dashboard 页面（含"AI宜搭 CLI"、"最近编辑"等）不会包含旧版关键词，
    //    但只要有有效组织域名就足以确认已登录
    if (!currentUrl.includes('//www.aliwork.com') && currentUrl.includes('.aliwork.com')) {
      const orgDomain = currentUrl.match(/^(https:\/\/[^\/]+)/);
      if (orgDomain && isValidOrgBaseUrl(orgDomain[1])) {
        pageState = { type: 'logged-in', message: `已登录到宜搭（${orgDomain[1]}）` };
      }
    }

    // 1. 检查是否已登录到组织工作台（内容关键词检测，作为兜底）
    const isWwwHomepage = currentUrl.includes('//www.aliwork.com');
    if (pageState.type === 'unknown' && !isWwwHomepage && (
        bodyText.includes('表单设计') || bodyText.includes('组件库') ||
        bodyText.includes('我的应用') ||
        (bodyText.includes('工作台') && !bodyText.includes('宜搭工作台'))
    )) {
      pageState = { type: 'logged-in', message: '已登录到宜搭工作台' };
    }
    // 2. 检查组织选择页面
    else if (bodyText.includes('选择你加入的组织') || bodyText.includes('选择组织')) {
      pageState = { 
        type: 'select-org', 
        message: '组织选择页面',
        orgCount: pageInfo.orgCount
      };
    }
    // 3. 检查立即登录页面
    else if (pageInfo.hasLoginBtn && bodyText.includes('立即登录')) {
      pageState = { 
        type: 'login-button', 
        message: '立即登录页面',
        hasQrCode: pageInfo.hasQrCode,
        hasAvatar: pageInfo.hasAvatar
      };
    }
    // 4. 检查二维码登录页面
    else if (pageInfo.hasQrCode || bodyText.includes('扫码登录')) {
      pageState = { 
        type: 'qr-login', 
        message: '二维码登录页面',
        hasAvatar: pageInfo.hasAvatar
      };
    }
    // 5. 检查协议页面
    else if (bodyText.includes('确定') && pageInfo.hasAgreementBtn) {
      pageState = { type: 'agreement', message: '协议同意页面' };
    }
    // 6. 检查宜搭首页（带登录注册按钮）
    else if (isWwwHomepage && (bodyText.includes('登录注册') || bodyText.includes('登录'))) {
      pageState = { 
        type: 'homepage', 
        message: '宜搭首页（未登录）'
      };
    }
    
    // 检测状态变化
    const stateChanged = lastPageState !== pageState.type;
    const urlChanged = lastUrl !== currentUrl;
    
    // 【每步都输出详细信息】
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📍 检测步骤 ${step}/${maxSteps} (已等待 ${step * 2} 秒)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🌐 当前URL: ${currentUrl}`);
    console.log(`� 页面标题: ${pageInfo.title || '无标题'}`);
    console.log(`� 页面状态: ${pageState.type} - ${pageState.message}`);
    
    if (stateChanged) {
      console.log(`🔄 状态变化: ${lastPageState || '初始'} → ${pageState.type}`);
    }
    
    // 输出页面关键内容
    console.log(`📝 页面内容预览:`);
    console.log(`   ${pageInfo.bodyText.substring(0, 150).replace(/\n/g, ' ')}...`);
    
    // 更新记录
    lastPageState = pageState.type;
    lastUrl = currentUrl;
    
    // 根据状态输出操作指导
    switch (pageState.type) {
      case 'logged-in':
        console.log(`\n✅ 登录成功！已进入宜搭工作台`);
        await page.waitForTimeout(3000);
        return { success: true, message: '登录成功' };
        
      case 'select-org':
        console.log(`\n🏢 【组织选择页面】`);
        console.log(`   检测到 ${pageState.orgCount || '多个'} 个组织`);
        console.log(`\n👉 请操作：在浏览器中点击选择您要初始化的组织`);
        console.log(`   选择后系统将自动继续...`);
        if (!orgSelectPrompted) {
          console.log(`\n💡 提示：如果没有看到组织列表，请检查是否已加入组织`);
          orgSelectPrompted = true;
        }
        break;
        
      case 'login-button':
        console.log(`\n🔑 【立即登录页面】`);
        if (pageState.hasQrCode) {
          console.log(`   检测到二维码登录方式`);
          console.log(`\n👉 请操作：使用钉钉扫码登录`);
        } else if (pageState.hasAvatar) {
          console.log(`   检测到头像授权登录`);
          console.log(`\n👉 请操作：点击头像授权登录`);
        } else {
          console.log(`\n👉 请操作：点击"立即登录"按钮`);
        }
        console.log(`\n⏸️  【终端挂起等待中】`);
        console.log(`   系统正在后台持续扫描（每2秒检测一次）`);
        console.log(`   请在浏览器中完成授权操作...`);
        console.log(`   完成后系统将自动继续，无需关闭此终端\n`);
        break;
        
      case 'qr-login':
        console.log(`\n📱 【二维码登录页面】`);
        if (pageState.hasAvatar) {
          console.log(`   检测到头像授权登录`);
          console.log(`\n👉 请操作：点击头像授权登录`);
        } else {
          console.log(`\n👉 请操作：使用钉钉扫码登录`);
        }
        console.log(`\n⏸️  【终端挂起等待中】`);
        console.log(`   系统正在后台持续扫描（每2秒检测一次）`);
        console.log(`   请在浏览器中完成授权操作...`);
        console.log(`   完成后系统将自动继续，无需关闭此终端\n`);
        break;
        
      case 'agreement':
        console.log(`\n📋 【协议同意页面】`);
        console.log(`\n👉 请操作：点击"确定"按钮同意协议`);
        // 自动点击
        try {
          await page.click('.module-agreement-button-co', { force: true, timeout: 5000 });
          console.log(`   ✅ 已自动点击确定`);
        } catch (e) {
          console.log(`   ⚠️ 自动点击失败，请手动点击`);
        }
        break;
        
      case 'homepage':
        console.log(`\n🏠 【宜搭首页】`);
        console.log(`   当前处于宜搭官网首页，尚未登录`);
        console.log(`\n👉 请在浏览器中点击右上角的"登录注册"按钮`);
        console.log(`   登录完成后，如果有多组织，请选择您要初始化的组织`);
        console.log(`\n⏸️  【等待用户操作中】`);
        console.log(`   系统正在后台持续扫描（每2秒检测一次）`);
        console.log(`   请在浏览器完成登录和组织的选择...`);
        console.log(`   完成后系统将自动继续，无需关闭此终端\n`);
        break;
        
      case 'unknown':
        console.log(`\n⚠️ 【未知页面】`);
        console.log(`   系统未能识别当前页面类型`);
        console.log(`\n💡 可能的情况：`);
        console.log(`   1. 页面正在加载中，请稍等`);
        console.log(`   2. 这是一个新的页面类型`);
        console.log(`   3. 网络连接有问题`);
        console.log(`\n👉 请操作：按照页面提示完成操作，系统会继续检测`);
        break;
    }
    
    console.log(`⏳ 2秒后再次检测...`);
  }
  
  console.log('\n⚠️ 登录流程达到最大步骤数，可能未完成');
  return { success: false, message: '登录流程未完成' };
}

// ==================== 主接口 ====================

/**
 * 从组织设置页面抓取组织名称和 Corp ID
 * 注意：宜搭页面持续有后台请求，不能用 networkidle 等待（会一直等到超时），
 * 必须用 domcontentloaded + 等待"组织名称"文本渲染完成
 * 页面结构为标签与值分行显示（如 "组织名称\n云途数字技术"），按行提取
 * @param {Object} page - Playwright 页面对象
 * @param {string} baseUrl - 组织域名
 * @returns {Promise<{corpName: string|null, corpId: string|null}>}
 */
async function fetchOrgInfoFromSettings(page, baseUrl) {
  const info = { corpName: null, corpId: null };
  const settingsUrl = `${baseUrl}/platformManage/basicInfo`;
  console.log('    📄 访问:', settingsUrl);
  await page.goto(settingsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // SPA 渲染需要时间，等待"组织名称"文本出现
  try {
    await page.waitForFunction(
      () => (document.body.innerText || '').includes('组织名称'),
      { timeout: 15000 }
    );
  } catch (e) {
    console.log('    ⚠️ 等待"组织名称"渲染超时，尝试直接提取');
  }
  const currentUrl = page.url();
  if (currentUrl.includes('error') || currentUrl.includes('login')) {
    console.log('    ⚠️ 组织设置页面加载失败，当前URL:', currentUrl);
    return info;
  }
  const extracted = await page.evaluate(() => {
    const result = { corpName: null, corpId: null };
    const rawText = document.body.innerText || '';
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
    // 标签与值分行：取标签行的下一行作为值
    const nameLabels = ['组织名称', '企业名称', '公司名称'];
    const nameIdx = lines.findIndex(l => nameLabels.includes(l));
    if (nameIdx >= 0 && lines[nameIdx + 1] && !nameLabels.includes(lines[nameIdx + 1])) {
      result.corpName = lines[nameIdx + 1];
    }
    // 兼容同行冒号格式（旧版页面）
    if (!result.corpName) {
      const m = rawText.match(/(?:组织名称|企业名称|公司名称)\s*[：:]\s*([^\n]+)/);
      if (m && m[1].trim()) result.corpName = m[1].trim();
    }
    // Corp ID：标签行的下一行
    const idIdx = lines.findIndex(l => /^corp\s*_?\s*id$/i.test(l));
    if (idIdx >= 0 && lines[idIdx + 1] && /^[a-zA-Z0-9_-]+$/.test(lines[idIdx + 1])) {
      result.corpId = lines[idIdx + 1];
    }
    if (!result.corpId) {
      const m = rawText.match(/corp\s*_?\s*id\s*[：:]\s*([a-zA-Z0-9_-]+)/i);
      if (m && m[1].trim()) result.corpId = m[1].trim();
    }
    return result;
  });
  if (extracted.corpName) {
    info.corpName = extracted.corpName;
    console.log('    ✅ 从设置页面获取到组织名称:', info.corpName);
  }
  if (extracted.corpId) {
    info.corpId = extracted.corpId;
    console.log('    ✅ 从设置页面获取到 Corp ID:', info.corpId);
  }
  return info;
}

/**
 * 确保拥有有效的登录态
 * 会自动验证现有 Cookie，如果无效则触发登录流程
 * 
 * @param {Object} options - 选项
 * @param {boolean} options.headless - 是否无头模式（默认 false）
 * @param {string} options.targetUrl - 目标 URL（默认工作台）
 * @returns {Promise<Object>} 登录态对象
 */
async function ensureLogin(options = {}) {
  const { headless = false, targetUrl = LOGIN_URL } = options;
  
  console.log('\n' + '='.repeat(50));
  console.log('  宜搭组织初始化登录管理器');
  console.log('='.repeat(50));
  
  // 1. 尝试加载现有 Cookie
  const existingData = loadCookieData();
  
  if (existingData?.cookies) {
    console.log(`  检测到本地 Cookie (${existingData.cookies.length} 个)`);
    
    // 【关键修复】首先验证 base_url 是否有效
    const savedBaseUrl = existingData.base_url;
    console.log('  🔍 检查已保存的 base_url:', savedBaseUrl);
    
    if (!isValidOrgBaseUrl(savedBaseUrl)) {
      console.log('  ⚠️ 已保存的 base_url 无效，需要重新登录');
      console.log('    原因: 之前的登录可能未正确选择组织');
    } else {
      console.log('  🔍 验证 Cookie 有效性...');
      
      // 2. 验证 Cookie 是否有效
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      
      try {
        await context.addCookies(existingData.cookies);
        const page = await context.newPage();
        
        const testUrl = `${savedBaseUrl}/myApp`;
        // 验证方式与 api-client/login_manager.js 的 fetchPageInfo 一致：
        // 1. domcontentloaded 加载页面（宜搭 SPA 有持续后台请求，networkidle 会等到 30-60s 超时，必须用 domcontentloaded）
        // 2. 检查是否被重定向到登录页
        // 3. 循环提取 csrf_token（隐藏 input，DOM 早期就存在，不依赖 SPA 渲染完成）
        // 【加速】历史：networkidle 每次刷新都卡满 30s 超时，导致"刷新登录态/刷新应用信息"变慢十几秒
        try {
          await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) {
          console.log(`  ⚠️ 页面加载超时（正常，宜搭有持续后台请求），继续验证...`);
        }

        // 检查是否被重定向到登录页
        const currentUrl = page.url();
        if (currentUrl.toLowerCase().includes('login') || currentUrl.toLowerCase().includes('sign')) {
          console.log('  ❌ 被重定向到登录页，Cookie 无效');
          // 不在这里 close browser，让 catch 块统一处理
          throw new Error('REDIRECTED_TO_LOGIN');
        }

        // 循环提取 csrf_token（最多 10 次，每次间隔 500ms）
        let isLoggedIn = false;
        for (let i = 0; i < 10; i++) {
          try {
            const csrfToken = await page.evaluate(() => {
              const input = document.querySelector("input[name='_csrf_token']");
              return input ? input.value : null;
            });
            if (csrfToken) {
              isLoggedIn = true;
              console.log(`  ✅ csrf_token 验证成功: ${csrfToken.substring(0, 20)}...`);
              break;
            }
          } catch (e) { /* ignore */ }
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!isLoggedIn) {
          console.log('  ⚠️ 未获取到 csrf_token，Cookie 可能已失效');
        }
        
        if (isLoggedIn) {
          console.log('  ✅ Cookie 有效，无需重新登录');
          // 登录态里组织名称缺失/无效时，趁浏览器可用补抓一次并回写（无需重新登录）
          const savedPrefix = savedBaseUrl.replace('https://', '').replace('.aliwork.com', '');
          const savedCorpName = (existingData.login_user?.corpName || '').trim();
          if (!savedCorpName || savedCorpName === '未知' || savedCorpName === savedPrefix) {
            console.log('  🔍 登录态中组织名称缺失，补抓组织信息...');
            try {
              const fetched = await fetchOrgInfoFromSettings(page, savedBaseUrl);
              if (fetched.corpName) {
                existingData.login_user = existingData.login_user || {};
                existingData.login_user.corpName = fetched.corpName;
                if (fetched.corpId && !existingData.corp_id) {
                  existingData.corp_id = fetched.corpId;
                }
                saveCookieData(existingData);
                console.log('  ✅ 已补抓组织名称并更新登录态:', fetched.corpName);
              } else {
                console.log('  ⚠️ 补抓组织名称失败，保持现状');
              }
            } catch (e) {
              console.log('  ⚠️ 补抓组织信息失败:', e.message);
            }
          }
          await browser.close();
          return existingData;
        } else {
          await browser.close();
          console.log('  ⚠️ Cookie 已失效，需要重新登录');
        }
      } catch (e) {
        await browser.close();
        console.log('  ⚠️ Cookie 验证失败:', e.message);
      }
    }
  } else {
    console.log('  未检测到本地 Cookie');
  }
  
  // 3. 需要重新登录
  console.log('\n🔐 开始交互式登录...');
  console.log(`  登录地址: ${targetUrl}`);
  
  let browser;
  try {
    console.log('  🚀 正在启动浏览器...');
    try {
      // 检查自定义浏览器路径是否存在
      const launchOptions = { 
        headless: false,
        timeout: 30000 // 30秒超时
      };
      
      // 如果自定义路径存在，则使用它
      if (fs.existsSync(CHROMIUM_EXECUTABLE_PATH)) {
        console.log('  📍 使用自定义浏览器路径:', CHROMIUM_EXECUTABLE_PATH);
        launchOptions.executablePath = CHROMIUM_EXECUTABLE_PATH;
      } else {
        console.log('  📍 使用 Playwright 默认浏览器路径');
      }
      
      browser = await chromium.launch(launchOptions);
      console.log('  ✅ 浏览器启动成功');
    } catch (launchError) {
      console.error('  ❌ 浏览器启动失败:', launchError.message);
      console.error('  💡 可能的原因：');
      console.error('     1. Playwright 浏览器未安装');
      console.error('     2. 系统资源不足');
      console.error('  🔧 解决方案：');
      console.error('     运行命令: npx playwright install chromium');
      throw new Error('浏览器启动失败');
    }
    
    let context = await browser.newContext();
    let page = await context.newPage();
    
    // 打开登录页面（使用 commit 最快速返回）
    console.log('  📄 正在打开登录页面，请稍候...');
    console.log('  🌐 目标URL:', targetUrl);
    try {
      // commit: 导航请求已提交给浏览器即返回，最快
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: 15000 });
      console.log('  ✅ 页面导航已提交');
      // 等待 DOM 加载
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(e => {
        console.log('  ⚠️ DOM 加载等待超时，但继续执行');
      });
      console.log('  📍 当前URL:', page.url());
      console.log('  📄 页面标题:', await page.title());
      // 等待2秒让页面渲染完成
      await page.waitForTimeout(2000);
    } catch (navError) {
      console.error('  ❌ 登录页面加载失败:', navError.message);
      console.error('  💡 可能的原因：');
      console.error('     1. 网络连接异常');
      console.error('     2. 宜搭服务器响应超时');
      try {
        console.error('  📍 当前URL:', page.url());
      } catch(e) {} // 有意忽略：页面可能已关闭，page.url() 会抛异常
      throw new Error('页面加载失败: ' + navError.message);
    }
    
    // 处理登录流程
    console.log('\n  ⏳ 进入登录状态检测循环（每2秒检测一次）...');
    console.log('  💡 请按照屏幕提示完成登录操作\n');
    const loginResult = await handleLoginFlow(page, browser, { headless });
    
    // 【新增】检测浏览器是否被关闭，如果是则尝试重新打开
    if (loginResult.browserClosed) {
      console.log('\n🔄 浏览器被关闭，尝试重新打开...');
      try {
        await browser.close().catch(() => {});
      } catch (e) {}
      
      // 重新打开浏览器
      const launchOptions = { 
        headless: false,
        timeout: 30000
      };
      if (fs.existsSync(CHROMIUM_EXECUTABLE_PATH)) {
        launchOptions.executablePath = CHROMIUM_EXECUTABLE_PATH;
      }
      
      browser = await chromium.launch(launchOptions);
      context = await browser.newContext();
      const newPage = await context.newPage();
      
      // 导航到登录页面
      await newPage.goto(targetUrl, { waitUntil: 'commit', timeout: 15000 });
      await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await newPage.waitForTimeout(2000);
      
      console.log('✅ 浏览器已重新打开，继续登录流程...');
      
      // 递归调用 handleLoginFlow 重新尝试
      const retryResult = await handleLoginFlow(newPage, browser, { headless });
      
      if (retryResult.browserClosed) {
        throw new Error('浏览器被重复关闭，请保持浏览器打开并重试');
      }
      
      if (!retryResult.success) {
        throw new Error('登录流程未完成');
      }
      
      // 使用新的 page 继续后续流程
      page = newPage;
    } else if (!loginResult.success) {
      throw new Error('登录流程未完成');
    }
    
    // 获取登录后的信息
    const cookies = await context.cookies();
    
    // 【关键修复】使用验证函数提取有效的 base_url
    console.log('\n  🔍 提取有效的组织域名...');
    let baseUrl = await extractValidBaseUrl(page);
    
    // 如果无法提取到有效的 base_url，尝试访问 /myApp 页面再次提取
    if (!baseUrl) {
      console.log('  🔄 尝试访问我的应用页面获取组织域名...');
      try {
        await page.goto('https://www.aliwork.com/myApp', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        baseUrl = await extractValidBaseUrl(page);
      } catch (e) {
        console.log('    ⚠️ 访问我的应用页面失败:', e.message);
      }
    }
    
    // 如果仍然无法获取有效的 base_url，抛出错误
    if (!baseUrl) {
      throw new Error('无法获取有效的组织域名，请确保已正确选择组织');
    }
    
    console.log('  ✅ 最终使用的 base_url:', baseUrl);
    
    // 从 baseUrl 中提取域名前缀
    const domainPrefix = baseUrl.replace('https://', '').replace('.aliwork.com', '');
    
    // ==================== 双重保险策略获取组织信息 ====================
    let orgInfo = {
      corpName: null,
      corpId: null
    };
    
    // 【第一重保险】访问组织设置页面获取信息
    console.log('\n  🔍 第1步：访问组织设置页面获取信息...');
    try {
      const settingsInfo = await fetchOrgInfoFromSettings(page, baseUrl);
      if (settingsInfo.corpName) {
        orgInfo.corpName = settingsInfo.corpName;
      }
      if (settingsInfo.corpId) {
        orgInfo.corpId = settingsInfo.corpId;
      }
    } catch (e) {
      console.log('    ⚠️ 访问组织设置页面失败:', e.message);
    }
    
    // 【第二重保险】如果设置页面没有获取到组织名称，从工作台页面获取
    if (!orgInfo.corpName) {
      console.log('\n  🔍 第2步：从工作台页面获取组织名称（备用方案）...');
      try {
        const workbenchUrl = `${baseUrl}/workPlatform`;
        console.log('    📄 访问:', workbenchUrl);
        await page.goto(workbenchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000);
        
        // 从工作台页面提取组织名称
        const workbenchInfo = await page.evaluate(() => {
          const info = { corpName: null };
          
          // 方法1: 从页面右上角的用户/组织信息区域获取
          const possibleSelectors = [
            '.header-org-name',
            '.org-name',
            '.organization-name',
            '.user-org',
            '.corp-name',
            '[class*="org"]',
            '[class*="corp"]',
            '.header-right .name',
            '.header-user-info .org',
            '.dropdown-trigger .org-name'
          ];
          
          for (const selector of possibleSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              const text = el.innerText || el.textContent;
              if (text && text.trim() && text.trim().length < 50) {
                info.corpName = text.trim();
                break;
              }
            }
          }
          
          // 方法2: 从页面标题获取
          if (!info.corpName) {
            const title = document.title;
            if (title && title.includes('-')) {
              const parts = title.split('-');
              if (parts.length >= 2) {
                info.corpName = parts[0].trim();
              }
            }
          }
          
          // 方法3: 从页面头部区域获取
          if (!info.corpName) {
            const header = document.querySelector('header, .header, .top-bar, .nav-bar');
            if (header) {
              const headerText = header.innerText || '';
              const lines = headerText.split('\n').map(l => l.trim()).filter(l => l);
              for (const line of lines) {
                if (line.length > 2 && line.length < 30 && 
                    !line.includes('开始') && !line.includes('应用') && 
                    !line.includes('中心') && !line.includes('帮助') &&
                    !line.includes('消息') && !line.includes('设置')) {
                  info.corpName = line;
                  break;
                }
              }
            }
          }
          
          return info;
        });
        
        if (workbenchInfo.corpName) {
          orgInfo.corpName = workbenchInfo.corpName;
          console.log('    ✅ 从工作台页面获取到组织名称:', orgInfo.corpName);
        }
      } catch (e) {
        console.log('    ⚠️ 从工作台页面获取失败:', e.message);
      }
    }
    
    console.log('\n  📋 组织信息获取结果:');
    console.log('    - 组织名称:', orgInfo.corpName || '未获取（将记为"未知"，保留配置文件原值）');
    console.log('    - Corp ID:', orgInfo.corpId || '未获取（将从Cookie获取）');
    
    // 从 cookies 中提取 corp_id（如果之前没有获取到或获取到的是无效值）
    let corpId = orgInfo.corpId || '';
    // 如果设置页面获取到的 Corp ID 是 "0" 或空，则使用 Cookie 中的值
    if (!corpId || corpId === '0') {
      const corpIdCookie = cookies.find(c => c.name === 'corp_id' || c.name === 'tianshu_corp_id');
      if (corpIdCookie && corpIdCookie.value && corpIdCookie.value !== '0') {
        corpId = corpIdCookie.value;
        console.log('    🔄 使用 Cookie 中的 Corp ID:', corpId);
      }
    }
    
    // 获取组织名称（优先使用双重保险策略获取的信息）
    let corpName = orgInfo.corpName;
    
    // 如果双重保险策略没有获取到，尝试从当前页面获取（第三重保险）
    if (!corpName) {
      console.log('\n  🔍 第3步：从当前页面获取组织名称（最终备用方案）...');
      try {
        const pageInfo = await page.evaluate(() => {
          // 尝试多种方式获取组织名称
          let name = null;
          
          // 方法1: 从页面标题获取
          const title = document.title;
          if (title && title.includes('-')) {
            name = title.split('-')[0].trim();
          }
          
          // 方法2: 从特定元素获取
          if (!name) {
            const corpNameEl = document.querySelector('.corp-name, .organization-name, [class*="corp"]');
            if (corpNameEl) {
              name = corpNameEl.textContent.trim();
            }
          }
          
          // 方法3: 从用户信息区域获取
          if (!name) {
            const userInfoEl = document.querySelector('.user-info, .account-info');
            if (userInfoEl) {
              const text = userInfoEl.textContent;
              const match = text.match(/([^|]+)\s*\|/);
              if (match) {
                name = match[1].trim();
              }
            }
          }
          
          return { corpName: name };
        });
        
        if (pageInfo.corpName) {
          corpName = pageInfo.corpName;
          console.log('    ✅ 从当前页面获取到组织名称:', corpName);
        }
      } catch (e) {
        console.log('    ⚠️ 从当前页面获取失败:', e.message);
      }
    }
    
    // 保存登录态
    // 注意：抓取失败时不能用域名前缀兜底，否则下游会把域名前缀当成真实组织名称写入配置文件
    if (!corpName) {
      console.log('\n  ⚠️ 三重保险均未获取到组织名称，将记录为"未知"（不会覆盖配置文件中已有的组织名称）');
    }
    const loginState = {
      cookies,
      base_url: baseUrl,
      corp_id: corpId,
      login_user: {
        userName: '未知',  // 暂时不获取用户名，专注于组织信息
        corpName: corpName || '未知' // 抓取失败时记为"未知"，由 init-org 保留原配置值，绝不用域名前缀兜底
      }
    };
    
    saveCookieData(loginState);
    
    console.log('\n✅ 登录流程完成！');
    console.log(`  当前页面: ${baseUrl}`);
    console.log(`  组织名称: ${corpName || '未获取到'}`);
    console.log(`  Corp ID: ${corpId || '未获取'}`);
    
    await browser.close();
    return loginState;
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// ==================== 导出 ====================

module.exports = {
  ensureLogin,
  loadCookieData,
  saveCookieData
};
