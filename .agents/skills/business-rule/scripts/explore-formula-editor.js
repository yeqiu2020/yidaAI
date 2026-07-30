#!/usr/bin/env node
/**
 * 探索业务规则公式编辑器 v10
 * 
 * 已知：节点提交规则在「全局设置」面板中
 * 本脚本：点击「添加规则」按钮，探索弹出的公式编辑器
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
  console.log('=== 探索业务规则公式编辑器 v10 ===\n');

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

  // 步骤1: 导航到流程设计器
  const designerUrl = `${baseUrl}/dingtalk/web/${APP_ID}/design/newDesigner?processCode=${PROCESS_CODE}&formUuid=${FORM_UUID}`;
  console.log(`\n📍 步骤1: 导航到流程设计器...`);
  await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
  
  // 检查登录状态
  if (page.url().includes('login.dingtalk') || page.url().includes('oauth2')) {
    console.log('   ⚠️ Cookie已过期，触发登录...');
    const { handleLoginFlow, saveCookieData } = require('../../../../lib/core/login-manager');
    const loginResult = await handleLoginFlow(page, { headless: false });
    if (!loginResult.success) { console.error('❌ 登录失败'); await browser.close(); process.exit(1); }
    const newCookies = await context.cookies();
    saveCookieData({ cookies: newCookies, base_url: baseUrl, csrf_token: cookieData.csrf_token, corp_id: cookieData.corp_id });
    await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
  }
  
  await page.screenshot({ path: path.join(screenshotDir, 'v10-01-loaded.png') });

  // 步骤2: 点击"创建新流程"（如果需要）
  console.log(`\n📍 步骤2: 尝试点击"创建新流程"...`);
  try {
    await page.click('button:has-text("创建新流程")', { timeout: 5000 });
    console.log('   ✅ 已点击"创建新流程"');
    await page.waitForTimeout(6000);
  } catch (e) {
    console.log('   ⚠️ 未找到"创建新流程"（可能已有草稿）');
  }

  // 步骤3: 点击"全局设置"
  console.log(`\n📍 步骤3: 点击"全局设置"...`);
  try {
    await page.click('text=全局设置', { timeout: 10000 });
    console.log('   ✅ 已点击"全局设置"');
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('   ⚠️ 未找到"全局设置"');
  }
  await page.screenshot({ path: path.join(screenshotDir, 'v10-03-global-settings.png') });

  // 步骤4: 找到并点击"添加规则"按钮
  console.log(`\n📍 步骤4: 查找并点击"添加规则"按钮...`);
  
  // 从 v9 探索结果知道"添加规则"在 y≈353 的位置
  // 使用精确查找
  const addRuleButton = await page.evaluate(() => {
    const allElements = document.querySelectorAll('span, div, button, a, p');
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      if (text === '添加规则' || text === '添加规则') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            text: text,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            tag: el.tagName,
            className: el.className?.toString()?.substring(0, 60) || '',
          };
        }
      }
    }
    return null;
  });
  
  if (addRuleButton) {
    console.log(`   ✅ 找到"添加规则"按钮: pos=(${addRuleButton.x}, ${addRuleButton.y}) tag=${addRuleButton.tag}`);
    console.log(`   点击...`);
    await page.mouse.click(addRuleButton.x, addRuleButton.y);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotDir, 'v10-04-after-add-rule.png') });
    
    // 检查弹出的内容
    const popupText = await page.evaluate(() => document.body?.innerText?.substring(0, 4000) || '');
    console.log(`\n📄 点击"添加规则"后页面文本:\n${popupText.substring(0, 2000)}`);
    
    // 查找弹窗中的元素
    const popupElements = await page.evaluate(() => {
      const results = [];
      // 查找弹窗/对话框
      const dialogs = document.querySelectorAll('[class*="dialog"], [class*="Dialog"], [class*="modal"], [class*="Modal"], [class*="popup"], [class*="Popup"], [role="dialog"]');
      for (const dialog of dialogs) {
        const rect = dialog.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          const text = dialog.textContent?.trim() || '';
          results.push({
            tag: dialog.tagName,
            className: dialog.className?.toString()?.substring(0, 80) || '',
            text: text.substring(0, 500),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }
      
      // 也查找所有可见的文本元素
      const allText = [];
      document.querySelectorAll('span, div, label, p, h4, h5, h6, button, a').forEach(el => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && text.length < 80 && rect.width > 0 && rect.height > 0) {
          allText.push({
            text: text.substring(0, 80),
            tag: el.tagName,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          });
        }
      });
      
      return { dialogs: results, allText: allText.slice(0, 50) };
    });
    
    console.log(`\n   弹窗数量: ${popupElements.dialogs.length}`);
    popupElements.dialogs.forEach((d, i) => {
      console.log(`   [${i}] <${d.tag}> class="${d.className}" pos=(${d.x},${d.y}) size=${d.w}x${d.h}`);
      console.log(`        text: ${d.text.substring(0, 200)}`);
    });
    
    console.log(`\n   页面文本元素 (前30个):`);
    popupElements.allText.slice(0, 30).forEach((el, i) => {
      console.log(`   [${i}] y=${el.y} x=${el.x} "${el.text}"`);
    });
    
    // 检查是否有公式编辑器
    const hasFormulaEditor = popupText.includes('UPSERT') || popupText.includes('INSERT') || 
                            popupText.includes('UPDATE') || popupText.includes('DELETE') ||
                            popupText.includes('公式') || popupText.includes('函数') ||
                            popupText.includes('高级函数');
    
    if (hasFormulaEditor) {
      console.log(`\n   ✅ 检测到公式编辑器！`);
    }
    
    // 检查是否有选择类型的选项（可能是先选择规则类型）
    const hasTypeSelection = popupText.includes('业务关联') || popupText.includes('集成') || 
                            popupText.includes('自动化') || popupText.includes('选择') ||
                            popupText.includes('类型');
    
    if (hasTypeSelection) {
      console.log(`\n   ⚠️ 可能需要先选择规则类型`);
    }
    
    // 如果弹出了选择类型的对话框，尝试点击"业务关联规则"或类似选项
    const typeOptions = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('span, div, button, a, p, label').forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && text.length < 40) {
          if (text.includes('业务关联') || text.includes('公式执行') || 
              text.includes('关联操作') || text.includes('关联规则') ||
              text.includes('跨表') || text.includes('高级函数') ||
              text.includes('UPSERT') || text.includes('INSERT')) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              results.push({
                text: text,
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                tag: el.tagName,
              });
            }
          }
        }
      });
      return results;
    });
    
    if (typeOptions.length > 0) {
      console.log(`\n   找到 ${typeOptions.length} 个类型选项:`);
      typeOptions.forEach((el, i) => {
        console.log(`   [${i}] "${el.text}" at (${el.x}, ${el.y})`);
      });
      
      // 点击第一个选项
      const target = typeOptions[0];
      console.log(`\n   点击 "${target.text}" at (${target.x}, ${target.y})...`);
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotDir, 'v10-05-after-type-select.png') });
      
      const afterTypeText = await page.evaluate(() => document.body?.innerText?.substring(0, 4000) || '');
      console.log(`\n📄 选择类型后页面文本:\n${afterTypeText.substring(0, 2000)}`);
    }
    
    // 再次查找公式编辑器相关元素
    const formulaEditorElements = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = el.className?.toString() || '';
        if (text.length > 0 && text.length < 60) {
          if (text.includes('UPSERT') || text.includes('INSERT') || text.includes('UPDATE') || text.includes('DELETE') ||
              text.includes('公式') || text.includes('函数') || text.includes('高级函数') ||
              text.includes('令牌') || text.includes('字段') || text.includes('表单') ||
              text.includes('目标') || text.includes('条件') || text.includes('子条件') ||
              className.includes('codemirror') || className.includes('CodeMirror') ||
              className.includes('editor') || className.includes('Editor') ||
              className.includes('formula') || className.includes('Formula')) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              results.push({
                text: text.substring(0, 60),
                tag: el.tagName,
                className: className.substring(0, 60),
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
              });
            }
          }
        }
      });
      return results.slice(0, 30);
    });
    
    console.log(`\n   公式编辑器相关元素: ${formulaEditorElements.length} 个`);
    formulaEditorElements.forEach((el, i) => {
      console.log(`   [${i}] "${el.text}" <${el.tag}> class="${el.className}" pos=(${el.x},${el.y}) size=${el.w}x${el.h}`);
    });
    
    // 导出完整的弹窗内容
    const fullPopupContent = await page.evaluate(() => {
      // 获取所有可见元素
      const results = [];
      document.querySelectorAll('span, div, label, p, h1, h2, h3, h4, h5, h6, button, a, li, td, th, input, textarea, select').forEach(el => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        const className = el.className?.toString() || '';
        const tag = el.tagName;
        
        if (rect.width > 0 && rect.height > 0 && (text.length > 0 || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) {
          results.push({
            tag,
            text: text.substring(0, 80),
            className: className.substring(0, 80),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      });
      return results;
    });
    
    const popupPath = path.join(screenshotDir, 'v10-popup-content.json');
    fs.writeFileSync(popupPath, JSON.stringify(fullPopupContent, null, 2));
    console.log(`\n   📄 弹窗完整内容已保存到: ${popupPath}`);
    
  } else {
    console.log('   ⚠️ 未找到"添加规则"按钮');
    
    // 尝试备用方式 - 查找所有包含"添加"的按钮
    const addButtons = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('span, div, button, a').forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.includes('添加') && text.length < 20) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            results.push({
              text: text,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              tag: el.tagName,
            });
          }
        }
      });
      return results;
    });
    
    console.log(`   找到 ${addButtons.length} 个"添加"按钮:`);
    addButtons.forEach((el, i) => {
      console.log(`   [${i}] "${el.text}" at (${el.x}, ${el.y})`);
    });
  }

  // 最终截图
  await page.screenshot({ path: path.join(screenshotDir, 'v10-06-final.png') });
  
  // 最终页面文本
  const finalText = await page.evaluate(() => document.body?.innerText || '');
  fs.writeFileSync(path.join(screenshotDir, 'v10-final-text.txt'), finalText);
  console.log(`\n📄 最终页面文本:\n${finalText.substring(0, 1500)}`);

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
