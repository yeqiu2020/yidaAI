#!/usr/bin/env node
/**
 * 探索宜搭流程设计器画布 v9
 * 
 * 专注意图：找到流程画布中的节点并点击，然后查找"节点提交规则"
 * 
 * 策略：
 * 1. 进入流程设计器（已有 V4 草稿）
 * 2. 转储画布区域的完整 DOM 结构
 * 3. 检查是否有 iframe
 * 4. 尝试多种方式找到并点击节点
 * 5. 在节点设置面板中查找"节点提交规则"和"关联操作"
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PLAYWRIGHT_CORE_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'js-action-tester', 'node_modules', 'playwright-core');
const coreUtils = require('../../../../lib/core/utils');

const APP_ID = 'APP_NZEJ00HQWKPDUP4BQP8E';
const FORM_UUID = 'FORM-EE4298C2EA1B43F59E431F8EDBFB29A62AEA';
const PROCESS_CODE = 'TPROC--V0A667D1KCF75N7EHUYD2DJ4OV512ZNS9NIRM0';

function resolvePlaywrightCore() {
  const candidates = [];
  if (fs.existsSync(PLAYWRIGHT_CORE_PATH)) candidates.push(PLAYWRIGHT_CORE_PATH);
  try {
    const g = require.resolve('playwright-core');
    if (g && !candidates.includes(g)) candidates.push(g);
  } catch (e) {}
  for (const p of candidates) {
    try {
      const { chromium } = require(p);
      if (chromium?.executablePath) {
        const bp = chromium.executablePath();
        if (bp && fs.existsSync(bp)) return p;
      }
    } catch (e) {}
  }
  return candidates[0] || null;
}

function findBrowserPath() {
  const candidates = [
    path.join(PROJECT_ROOT, '.playwright-browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe'),
    path.join(PROJECT_ROOT, '.playwright-browsers', 'chromium_headless_shell-1217', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ];
  const parentDir = path.dirname(PROJECT_ROOT);
  if (fs.existsSync(parentDir)) {
    const siblings = fs.readdirSync(parentDir).filter(d => d.startsWith('宜搭AI助手'));
    for (const s of siblings) {
      candidates.push(path.join(parentDir, s, '.playwright-browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe'));
      candidates.push(path.join(parentDir, s, '.playwright-browsers', 'chromium_headless_shell-1217', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'));
    }
  }
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

async function main() {
  console.log('=== 探索宜搭流程设计器画布 v9 ===\n');

  const { loadCookieData, resolveBaseUrl } = coreUtils;
  const cookieData = loadCookieData(PROJECT_ROOT);
  if (!cookieData) { console.error('❌ 未找到登录态'); process.exit(1); }
  const baseUrl = resolveBaseUrl(cookieData);
  console.log(`✅ 登录态就绪 (${baseUrl})`);

  const pwCorePath = resolvePlaywrightCore();
  const { chromium } = require(pwCorePath);
  const executablePath = findBrowserPath();
  const launchOptions = { headless: false };
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const domain = new URL(baseUrl).hostname;
  const browserCookies = (cookieData.cookies || []).map(c => ({
    name: c.name, value: c.value,
    domain: c.domain || domain, path: c.path || '/',
    expires: c.expires || -1, httpOnly: c.httpOnly || false,
    secure: c.secure || false, sameSite: c.sameSite || 'Lax'
  }));
  await context.addCookies(browserCookies);

  const page = await context.newPage();
  const screenshotDir = path.join(PROJECT_ROOT, '.playwright-cli');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // ========== 步骤1: 导航到流程设计器 ==========
  const designerUrl = `${baseUrl}/dingtalk/web/${APP_ID}/design/newDesigner?processCode=${PROCESS_CODE}&formUuid=${FORM_UUID}`;
  console.log(`\n📍 步骤1: 导航到流程设计器...`);
  await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
  
  // 检查登录状态
  const currentUrl = page.url();
  if (currentUrl.includes('login.dingtalk') || currentUrl.includes('oauth2')) {
    console.log('   ⚠️ Cookie已过期，需要重新登录');
    const { handleLoginFlow } = require('../../../../lib/core/login-manager');
    const loginResult = await handleLoginFlow(page, { headless: false });
    if (!loginResult.success) {
      console.error('❌ 登录失败');
      await browser.close();
      process.exit(1);
    }
    // 保存新cookie
    const newCookies = await context.cookies();
    const { saveCookieData } = require('../../../../lib/core/login-manager');
    saveCookieData({
      cookies: newCookies,
      base_url: baseUrl,
      csrf_token: cookieData.csrf_token,
      corp_id: cookieData.corp_id,
    });
    await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
  }
  
  await page.screenshot({ path: path.join(screenshotDir, 'v9-01-loaded.png') });

  // ========== 步骤2: 点击"创建新流程"（如果需要） ==========
  console.log(`\n📍 步骤2: 尝试点击"创建新流程"...`);
  try {
    await page.click('button:has-text("创建新流程")', { timeout: 5000 });
    console.log('   ✅ 已点击"创建新流程"');
    await page.waitForTimeout(6000);
  } catch (e) {
    console.log('   ⚠️ 未找到"创建新流程"按钮（可能已有草稿版本）');
  }
  await page.screenshot({ path: path.join(screenshotDir, 'v9-02-flow-ready.png') });

  // ========== 步骤3: 转储画布区域的完整 DOM ==========
  console.log(`\n📍 步骤3: 转储画布区域 DOM 结构...`);
  
  // 检查是否有 iframe
  const iframes = await page.evaluate(() => {
    const frames = document.querySelectorAll('iframe');
    return Array.from(frames).map(f => ({
      src: f.src?.substring(0, 100) || '',
      id: f.id,
      className: f.className?.toString()?.substring(0, 60) || '',
      width: f.offsetWidth,
      height: f.offsetHeight
    }));
  });
  console.log(`   iframe 数量: ${iframes.length}`);
  iframes.forEach((f, i) => console.log(`   [${i}] src=${f.src} id=${f.id} size=${f.width}x${f.height}`));

  // 转储中心区域（画布）的所有元素
  const canvasElements = await page.evaluate(() => {
    const results = [];
    // 查找画布容器 - 通常在左侧面板和右侧面板之间
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      // 画布区域：x 在 200-1200 之间，y 在 60-800 之间
      if (rect.left > 180 && rect.right < 1300 && rect.top > 50 && rect.bottom < 850) {
        const text = el.textContent?.trim() || '';
        const tag = el.tagName;
        const className = el.className?.toString() || '';
        const id = el.id || '';
        
        // 只关注可能代表节点的元素
        if (
          (className.includes('node') || className.includes('Node') ||
           className.includes('task') || className.includes('Task') ||
           className.includes('activity') || className.includes('step') ||
           className.includes('start') || className.includes('Start') ||
           className.includes('begin') || className.includes('Begin') ||
           className.includes('item') || className.includes('Item') ||
           className.includes('card') || className.includes('Card') ||
           tag === 'svg' || tag === 'SVG' ||
           (text.length > 0 && text.length < 30)) &&
          rect.width > 20 && rect.height > 10
        ) {
          results.push({
            tag,
            id: id.substring(0, 30),
            className: className.substring(0, 80),
            text: text.substring(0, 40),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            cx: Math.round(rect.left + rect.width / 2),
            cy: Math.round(rect.top + rect.height / 2),
          });
        }
      }
    }
    // 去重
    const seen = new Set();
    return results.filter(r => {
      const key = `${r.cx},${r.cy}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 50);
  });
  
  console.log(`   画布区域找到 ${canvasElements.length} 个元素:`);
  canvasElements.forEach((el, i) => {
    console.log(`   [${i}] <${el.tag}> "${el.text}" class="${el.className}" pos=(${el.cx},${el.cy}) size=${el.w}x${el.h}`);
  });

  // 转储更完整的中心区域 HTML
  const centerHtml = await page.evaluate(() => {
    // 找到画布容器
    const candidates = [
      document.querySelector('[class*="canvas"]'),
      document.querySelector('[class*="Canvas"]'),
      document.querySelector('[class*="flow"]'),
      document.querySelector('[class*="Flow"]'),
      document.querySelector('[class*="designer"]'),
      document.querySelector('[class*="Designer"]'),
      document.querySelector('[class*="graph"]'),
      document.querySelector('[class*="Graph"]'),
      document.querySelector('[class*="bpmn"]'),
      document.querySelector('[class*="BPMN"]'),
      document.querySelector('[class*="x6"]'), // AntV X6
      document.querySelector('[class*="reactflow"]'),
    ].filter(Boolean);
    
    if (candidates.length === 0) {
      // 如果找不到特定容器，返回页面上所有 class 包含关键词的元素
      const all = document.querySelectorAll('[class*="canvas"], [class*="flow"], [class*="graph"], [class*="node"], [class*="edge"]');
      return {
        found: 'fallback',
        count: all.length,
        elements: Array.from(all).slice(0, 20).map(el => ({
          tag: el.tagName,
          className: el.className?.toString()?.substring(0, 80) || '',
          text: el.textContent?.trim()?.substring(0, 40) || '',
          rect: {
            x: Math.round(el.getBoundingClientRect().left),
            y: Math.round(el.getBoundingClientRect().top),
            w: Math.round(el.getBoundingClientRect().width),
            h: Math.round(el.getBoundingClientRect().height),
          }
        }))
      };
    }
    
    return {
      found: 'targeted',
      count: candidates.length,
      elements: candidates.map(el => ({
        tag: el.tagName,
        className: el.className?.toString()?.substring(0, 80) || '',
        text: el.textContent?.trim()?.substring(0, 100) || '',
        rect: {
          x: Math.round(el.getBoundingClientRect().left),
          y: Math.round(el.getBoundingClientRect().top),
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
        },
        childCount: el.children.length,
        innerHTML: el.innerHTML?.substring(0, 500) || '',
      }))
    };
  });
  
  console.log(`\n   画布容器搜索结果:`);
  console.log(`   found: ${centerHtml.found}, count: ${centerHtml.count}`);
  centerHtml.elements?.forEach((el, i) => {
    console.log(`   [${i}] <${el.tag}> class="${el.className}" text="${el.text}" rect=${JSON.stringify(el.rect)}`);
    if (el.innerHTML) console.log(`        HTML: ${el.innerHTML.substring(0, 200)}`);
  });

  // ========== 步骤4: 尝试点击画布中的元素 ==========
  console.log(`\n📍 步骤4: 尝试点击画布中的节点...`);
  
  // 策略1: 点击中心区域文本不为空的元素
  const textElements = canvasElements.filter(e => e.text.length > 0 && e.text.length < 20 && e.w > 40 && e.h > 15);
  if (textElements.length > 0) {
    console.log(`   策略1: 点击有文本的元素 (${textElements.length} 个候选)`);
    for (let i = 0; i < Math.min(textElements.length, 5); i++) {
      const el = textElements[i];
      console.log(`   尝试点击 [${i}] "${el.text}" at (${el.cx}, ${el.cy})...`);
      await page.mouse.click(el.cx, el.cy);
      await page.waitForTimeout(2000);
      
      // 检查右侧面板是否出现了新内容
      const rightPanelText = await page.evaluate(() => {
        const rightPanel = document.querySelector('[class*="right"], [class*="panel"], [class*="property"], [class*="Property"], [class*="setting"], [class*="Setting"]');
        if (!rightPanel) return '';
        // 获取右侧区域（x > 900）的所有文本
        const allText = [];
        document.querySelectorAll('span, div, label, p, h4, h5, h6').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.left > 850 && rect.width > 0 && rect.height > 0) {
            const text = el.textContent?.trim();
            if (text && text.length < 60) allText.push(text);
          }
        });
        return allText.join('\n').substring(0, 2000);
      });
      
      if (rightPanelText.length > 50) {
        console.log(`   右侧面板出现内容!`);
        console.log(`   ${rightPanelText.substring(0, 500)}`);
        
        if (rightPanelText.includes('节点提交') || rightPanelText.includes('提交规则') || 
            rightPanelText.includes('关联操作') || rightPanelText.includes('关联规则')) {
          console.log(`   ✅ 找到业务规则相关内容！`);
          await page.screenshot({ path: path.join(screenshotDir, `v9-04-click-${i}-found.png`) });
          break;
        }
      }
    }
  }
  
  // 策略2: 如果画布搜索没找到，尝试在整个页面中搜索关键词
  console.log(`\n   策略2: 全页面搜索关键词...`);
  const allPageText = await page.evaluate(() => document.body?.innerText || '');
  const keywords = ['节点提交', '提交规则', '关联操作', '关联规则', '业务关联', '公式执行', '开始节点', '发起人', '审批'];
  for (const kw of keywords) {
    if (allPageText.includes(kw)) {
      console.log(`   ✅ 页面中包含关键词: "${kw}"`);
    }
  }

  // 策略3: 尝试使用 Tab 键导航到节点
  console.log(`\n   策略3: 尝试键盘 Tab 导航...`);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(screenshotDir, 'v9-04b-tab-nav.png') });
  
  const afterTabText = await page.evaluate(() => {
    const allText = [];
    document.querySelectorAll('span, div, label, p, h4, h5, h6').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.left > 850 && rect.width > 0 && rect.height > 0) {
        const text = el.textContent?.trim();
        if (text && text.length < 60) allText.push(text);
      }
    });
    return allText.join('\n').substring(0, 2000);
  });
  if (afterTabText.length > 50) {
    console.log(`   Tab 后右侧面板内容:\n${afterTabText.substring(0, 500)}`);
  }

  // 策略4: 尝试点击全局设置中是否有"节点提交规则"
  console.log(`\n   策略4: 检查全局设置面板...`);
  try {
    const globalSettings = await page.$('text=全局设置');
    if (globalSettings) {
      await globalSettings.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotDir, 'v9-05-global-settings.png') });
      
      // 转储全局设置面板的完整内容
      const globalSettingsText = await page.evaluate(() => {
        const allText = [];
        document.querySelectorAll('span, div, label, p, h4, h5, h6, li, td, th').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.left > 200 && rect.width > 0 && rect.height > 0) {
            const text = el.textContent?.trim();
            if (text && text.length > 1 && text.length < 80) allText.push({
              text: text.substring(0, 80),
              x: Math.round(rect.left),
              y: Math.round(rect.top),
            });
          }
        });
        return allText;
      });
      
      console.log(`   全局设置面板内容 (${globalSettingsText.length} 项):`);
      globalSettingsText.forEach((item, i) => {
        if (i < 60) console.log(`   [${i}] y=${item.y} x=${item.x} "${item.text}"`);
      });
      
      // 保存完整内容
      fs.writeFileSync(
        path.join(screenshotDir, 'v9-global-settings-content.json'),
        JSON.stringify(globalSettingsText, null, 2)
      );
    }
  } catch (e) {
    console.log(`   ⚠️ 全局设置检查失败: ${e.message}`);
  }

  // ========== 步骤5: 尝试在全局设置中查找"提交规则"相关配置 ==========
  console.log(`\n📍 步骤5: 在全局设置中查找提交规则...`);
  
  // 查找所有包含"提交"、"规则"、"关联"的元素
  const ruleElements = await page.evaluate(() => {
    const results = [];
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      if (text.length > 0 && text.length < 80) {
        if (text.includes('提交') || text.includes('规则') || text.includes('关联') ||
            text.includes('公式') || text.includes('函数') || text.includes('事件') ||
            text.includes('UPSERT') || text.includes('INSERT') || text.includes('UPDATE')) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            results.push({
              text: text.substring(0, 80),
              tag: el.tagName,
              className: el.className?.toString()?.substring(0, 60) || '',
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            });
          }
        }
      }
    }
    return results.slice(0, 30);
  });
  
  console.log(`   找到 ${ruleElements.length} 个规则相关元素:`);
  ruleElements.forEach((el, i) => {
    console.log(`   [${i}] "${el.text}" (${el.tag}) pos=(${el.x},${el.y}) size=${el.w}x${el.h}`);
  });

  // ========== 步骤6: 尝试网络请求分析 ==========
  console.log(`\n📍 步骤6: 拦截网络请求，查找流程设计API...`);
  
  // 先设置请求拦截
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('processdesign') || url.includes('processDesign') || 
        url.includes('flowDesign') || url.includes('flowdesign') ||
        url.includes('getProcess') || url.includes('saveProcess')) {
      apiCalls.push({ method: req.method(), url: url.substring(0, 150) });
    }
  });
  
  // 重新加载页面以捕获API调用
  console.log('   重新加载页面以捕获API请求...');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(10000);
  
  console.log(`   捕获到 ${apiCalls.length} 个流程设计相关API请求:`);
  apiCalls.forEach((call, i) => {
    console.log(`   [${i}] ${call.method} ${call.url}`);
  });
  
  // 保存API调用日志
  fs.writeFileSync(
    path.join(screenshotDir, 'v9-api-calls.json'),
    JSON.stringify(apiCalls, null, 2)
  );
  
  // 最终截图
  await page.screenshot({ path: path.join(screenshotDir, 'v9-06-final.png') });
  
  // 最终页面文本
  const finalText = await page.evaluate(() => document.body?.innerText || '');
  fs.writeFileSync(path.join(screenshotDir, 'v9-final-text.txt'), finalText);
  
  console.log(`\n📄 最终页面文本:\n${finalText.substring(0, 1000)}`);

  console.log('\n✅ 浏览器保持打开 30 秒...');
  await page.waitForTimeout(30000);
  await browser.close();
  console.log('\n=== 探索完成 ===');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});
