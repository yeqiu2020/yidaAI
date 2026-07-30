#!/usr/bin/env node
/**
 * 探索宜搭业务规则配置界面 v8
 * 
 * 完整链路：
 * 1. 检查/刷新登录态
 * 2. 打开流程设计器
 * 3. 创建新流程版本
 * 4. 点击流程节点 → 查找「节点提交规则」→「关联操作」
 * 5. 截图 + 导出页面结构
 * 
 * 参考 flow-settings 的浏览器自动化模式
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PLAYWRIGHT_CORE_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'js-action-tester', 'node_modules', 'playwright-core');
const coreUtils = require('../../../../lib/core/utils');

// 从组织及应用信息.md 读取的真实值
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
  console.log('=== 探索宜搭业务规则配置界面 v8 ===\n');

  const { loadCookieData, resolveBaseUrl } = coreUtils;
  let cookieData = loadCookieData(PROJECT_ROOT);
  
  if (!cookieData) {
    console.error('❌ 未找到登录态，正在触发登录...');
    const { ensureLogin } = require('../../../../lib/core/login-manager');
    cookieData = await ensureLogin({ headless: false });
    if (!cookieData) {
      console.error('❌ 登录失败');
      process.exit(1);
    }
  }
  
  const baseUrl = resolveBaseUrl(cookieData);
  console.log(`✅ 登录态就绪 (${baseUrl})`);
  console.log(`   Cookie数量: ${cookieData.cookies?.length || 0}`);

  const pwCorePath = resolvePlaywrightCore();
  if (!pwCorePath) {
    console.error('❌ 未找到 playwright-core');
    process.exit(1);
  }
  const { chromium } = require(pwCorePath);
  const executablePath = findBrowserPath();
  const launchOptions = { headless: false };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
    console.log(`   浏览器路径: ${executablePath}`);
  }

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
  console.log(`✅ 已加载 ${browserCookies.length} 个 Cookie`);

  const page = await context.newPage();
  const screenshotDir = path.join(PROJECT_ROOT, '.playwright-cli');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // ========== 步骤1: 导航到流程设计器 ==========
  const designerUrl = `${baseUrl}/dingtalk/web/${APP_ID}/design/newDesigner?processCode=${PROCESS_CODE}&formUuid=${FORM_UUID}`;
  console.log(`\n📍 步骤1: 导航到流程设计器...`);
  console.log(`   URL: ${designerUrl}`);
  await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
  
  // 检查是否被重定向到登录页
  const currentUrl = page.url();
  if (currentUrl.includes('login.dingtalk') || currentUrl.includes('oauth2') || currentUrl.includes('signin')) {
    console.log('   ⚠️ Cookie已过期，页面跳转到登录页');
    console.log('   📍 触发登录流程...');
    
    // 使用 login-manager 的 handleLoginFlow
    const { handleLoginFlow } = require('../../../../lib/core/login-manager');
    const loginResult = await handleLoginFlow(page, { headless: false });
    if (!loginResult.success) {
      console.error('❌ 登录失败');
      await browser.close();
      process.exit(1);
    }
    
    // 登录成功后保存新的 cookie
    const newCookies = await context.cookies();
    const { saveCookieData } = require('../../../../lib/core/login-manager');
    const newBaseUrl = page.url().match(/^(https:\/\/[^\/]+)/)?.[1] || baseUrl;
    saveCookieData({
      cookies: newCookies,
      base_url: newBaseUrl,
      csrf_token: cookieData.csrf_token,
      corp_id: cookieData.corp_id,
    });
    console.log('   ✅ 登录成功，Cookie已更新');
    
    // 重新导航到设计器
    await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
  }
  
  console.log(`   页面标题: "${await page.title()}"`);
  await page.screenshot({ path: path.join(screenshotDir, 'v8-01-designer-loaded.png') });

  // ========== 步骤2: 点击"创建新流程" ==========
  console.log(`\n📍 步骤2: 点击"创建新流程"...`);
  let createdNewFlow = false;
  try {
    await page.click('button:has-text("创建新流程")', { timeout: 10000 });
    console.log('   ✅ 已点击"创建新流程"');
    createdNewFlow = true;
  } catch (e) {
    try {
      await page.locator('text=创建新流程').first().click({ timeout: 10000 });
      console.log('   ✅ 已点击"创建新流程"（备用选择器）');
      createdNewFlow = true;
    } catch (e2) {
      console.log('   ⚠️ 未找到"创建新流程"按钮（可能已经是新版本或未启用）');
    }
  }
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(screenshotDir, 'v8-02-new-flow.png') });

  // ========== 步骤3: 查找并点击流程节点 ==========
  console.log(`\n📍 步骤3: 查找流程图中的节点...`);
  
  // 先获取页面所有文本，看看当前状态
  const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || '');
  console.log(`   页面文本（前500字）:\n${pageText.substring(0, 500)}`);

  // 查找流程图中的节点元素
  const nodeElements = await page.evaluate(() => {
    const results = [];
    // 查找所有可能代表节点的元素
    const selectors = [
      '[class*="node"]', '[class*="Node"]', '[class*="task"]', '[class*="Task"]',
      '[class*="activity"]', '[class*="Activity"]', '[class*="step"]', '[class*="Step"]',
      'svg g[class]', '[data-node-id]', '[data-node-type]',
      '.bpmn-node', '.flow-node', '.process-node'
    ];
    
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        if (rect.width > 30 && rect.height > 15 && rect.left > 50) {
          results.push({
            text: text.substring(0, 50),
            tag: el.tagName,
            className: el.className?.toString()?.substring(0, 80) || '',
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            selector: sel
          });
        }
      }
    }
    // 去重（相同位置只保留一个）
    const seen = new Set();
    return results.filter(r => {
      const key = `${r.x},${r.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 30);
  });
  
  console.log(`   找到 ${nodeElements.length} 个节点元素:`);
  nodeElements.forEach((el, i) => {
    console.log(`   [${i}] "${el.text}" (${el.tag}) pos=(${el.x},${el.y}) size=${el.w}x${el.h} sel=${el.selector}`);
  });

  // 点击第一个看起来像节点的元素
  const nodeCandidates = nodeElements.filter(n => 
    n.w > 40 && n.h > 20 && n.x > 100 && n.x < 1300 && n.y > 80 && n.y < 800
  );
  
  if (nodeCandidates.length > 0) {
    // 优先点击包含"开始"或"发起"文本的节点
    const startNode = nodeCandidates.find(n => n.text.includes('开始') || n.text.includes('发起'));
    const targetNode = startNode || nodeCandidates[0];
    
    console.log(`\n   点击节点 "${targetNode.text}" at (${targetNode.x}, ${targetNode.y})...`);
    await page.mouse.click(targetNode.x, targetNode.y);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(screenshotDir, 'v8-03-node-clicked.png') });
    
    const nodeText = await page.evaluate(() => document.body?.innerText?.substring(0, 4000) || '');
    console.log(`\n📄 点击节点后页面文本:\n${nodeText.substring(0, 2000)}`);
    
    // ========== 步骤4: 在节点设置面板中查找"节点提交规则"或"关联操作" ==========
    console.log(`\n📍 步骤4: 查找"节点提交规则"和"关联操作"...`);
    
    const keywords = ['节点提交', '提交规则', '关联操作', '关联规则', '业务关联', '公式执行', '表单事件', '高级函数', 'UPSERT', 'INSERT', 'UPDATE', 'DELETE', '提交规则', '关联', '规则'];
    const foundElements = await page.evaluate((kws) => {
      const allElements = document.querySelectorAll('span, div, button, a, p, label, li, td, th, h1, h2, h3, h4, h5, h6');
      const results = [];
      for (const el of allElements) {
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && text.length < 80) {
          for (const kw of kws) {
            if (text.includes(kw)) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                results.push({
                  text: text.substring(0, 80),
                  tag: el.tagName,
                  className: el.className?.toString()?.substring(0, 60) || '',
                  x: Math.round(rect.left + rect.width / 2),
                  y: Math.round(rect.top + rect.height / 2),
                  visible: rect.width > 0 && rect.height > 0,
                  keyword: kw
                });
                break;
              }
            }
          }
        }
      }
      return results;
    }, keywords);
    
    console.log(`   找到 ${foundElements.length} 个相关元素:`);
    foundElements.forEach((el, i) => {
      console.log(`   [${i}] "${el.text}" (${el.tag}) keyword=${el.keyword} pos=(${el.x},${el.y})`);
    });

    // 尝试点击"节点提交规则"
    const submitRuleElements = foundElements.filter(e => 
      e.keyword === '节点提交' || e.keyword === '提交规则' || 
      (e.keyword === '关联' && e.text.includes('提交'))
    );
    
    if (submitRuleElements.length > 0) {
      const target = submitRuleElements[0];
      console.log(`\n   点击"${target.text}" at (${target.x}, ${target.y})...`);
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotDir, 'v8-04-submit-rule.png') });
      
      const ruleText = await page.evaluate(() => document.body?.innerText?.substring(0, 4000) || '');
      console.log(`\n📄 节点提交规则面板文本:\n${ruleText.substring(0, 2000)}`);
      
      // 查找"关联操作"或"添加规则"
      const assocElements = await page.evaluate(() => {
        const allElements = document.querySelectorAll('span, div, button, a, p, label, li, td, th');
        const results = [];
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          if (text.length > 0 && text.length < 80) {
            if (text.includes('关联操作') || text.includes('关联规则') || 
                text.includes('添加规则') || text.includes('添加关联') ||
                text.includes('业务关联') || text.includes('公式') ||
                text.includes('添加') || text.includes('设置')) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                results.push({
                  text: text.substring(0, 80),
                  tag: el.tagName,
                  className: el.className?.toString()?.substring(0, 60) || '',
                  x: Math.round(rect.left + rect.width / 2),
                  y: Math.round(rect.top + rect.height / 2),
                  visible: true
                });
              }
            }
          }
        }
        return results;
      });
      
      console.log(`\n   找到 ${assocElements.length} 个关联操作/添加规则元素:`);
      assocElements.forEach((el, i) => {
        console.log(`   [${i}] "${el.text}" (${el.tag}) pos=(${el.x},${el.y})`);
      });
      
      // 点击"关联操作"
      const assocTarget = assocElements.find(e => 
        e.text.includes('关联操作') || e.text.includes('关联规则')
      );
      
      if (assocTarget) {
        console.log(`\n   点击"${assocTarget.text}" at (${assocTarget.x}, ${assocTarget.y})...`);
        await page.mouse.click(assocTarget.x, assocTarget.y);
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(screenshotDir, 'v8-05-assoc-op.png') });
        
        const formulaText = await page.evaluate(() => document.body?.innerText?.substring(0, 4000) || '');
        console.log(`\n📄 关联操作/公式编辑器文本:\n${formulaText.substring(0, 2000)}`);
        
        // 导出页面结构（用于分析 DOM）
        const pageStructure = await page.evaluate(() => {
          function dumpStructure(el, depth = 0, maxDepth = 5) {
            if (depth > maxDepth) return null;
            const result = {
              tag: el.tagName,
              class: el.className?.toString()?.substring(0, 60) || '',
              text: el.textContent?.trim()?.substring(0, 40) || '',
              children: []
            };
            for (const child of el.children) {
              const childResult = dumpStructure(child, depth + 1, maxDepth);
              if (childResult) result.children.push(childResult);
            }
            return result;
          }
          // 只导出右侧面板区域
          const rightPanel = document.querySelector('[class*="right"], [class*="panel"], [class*="setting"], [class*="Property"]');
          if (rightPanel) return dumpStructure(rightPanel, 0, 4);
          return null;
        });
        
        if (pageStructure) {
          const structPath = path.join(screenshotDir, 'v8-assoc-op-structure.json');
          fs.writeFileSync(structPath, JSON.stringify(pageStructure, null, 2));
          console.log(`   📄 页面结构已保存到: ${structPath}`);
        }
      } else {
        // 尝试点击"添加规则"或"添加"
        const addTarget = assocElements.find(e => 
          e.text.includes('添加规则') || e.text.includes('添加关联') || 
          (e.text.includes('添加') && !e.text.includes('添加字段'))
        );
        
        if (addTarget) {
          console.log(`\n   点击"${addTarget.text}" at (${addTarget.x}, ${addTarget.y})...`);
          await page.mouse.click(addTarget.x, addTarget.y);
          await page.waitForTimeout(3000);
          await page.screenshot({ path: path.join(screenshotDir, 'v8-06-add-rule.png') });
          
          const addText = await page.evaluate(() => document.body?.innerText?.substring(0, 4000) || '');
          console.log(`\n📄 添加规则后页面文本:\n${addText.substring(0, 2000)}`);
        }
      }
    } else {
      console.log('\n   ⚠️ 未找到"节点提交规则"');
      
      // 尝试在页面中查找所有可点击的 tab/标签
      const tabs = await page.evaluate(() => {
        const allElements = document.querySelectorAll('[class*="tab"], [class*="Tab"], [role="tab"], [class*="collapse"], [class*="panel-item"], [class*="section"]');
        const results = [];
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          if (text.length > 0 && text.length < 60) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              results.push({
                text: text.substring(0, 60),
                tag: el.tagName,
                className: el.className?.toString()?.substring(0, 60) || '',
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
              });
            }
          }
        }
        return results.slice(0, 30);
      });
      
      console.log(`\n   页面中的 Tab/折叠面板:`);
      tabs.forEach((el, i) => {
        console.log(`   [${i}] "${el.text}" (${el.tag}) pos=(${el.x},${el.y})`);
      });
      
      // 逐个点击 tab，看哪个展开后有"节点提交规则"
      for (let i = 0; i < Math.min(tabs.length, 15); i++) {
        const tab = tabs[i];
        if (tab.text.includes('提交') || tab.text.includes('规则') || tab.text.includes('关联') || 
            tab.text.includes('操作') || tab.text.includes('高级') || tab.text.includes('更多')) {
          console.log(`\n   尝试点击 Tab[${i}]: "${tab.text}" at (${tab.x}, ${tab.y})...`);
          await page.mouse.click(tab.x, tab.y);
          await page.waitForTimeout(2000);
          await page.screenshot({ path: path.join(screenshotDir, `v8-04b-tab-${i}.png`) });
          
          const tabText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '');
          if (tabText.includes('节点提交') || tabText.includes('关联操作') || tabText.includes('提交规则')) {
            console.log(`   ✅ 在 Tab[${i}] 中找到了相关内容！`);
            console.log(`   ${tabText.substring(0, 500)}`);
            break;
          }
        }
      }
    }
  } else {
    console.log('   ⚠️ 未找到流程节点');
    
    // 导出整个页面的可见文本和结构
    const fullText = await page.evaluate(() => document.body?.innerText || '');
    const textPath = path.join(screenshotDir, 'v8-full-page-text.txt');
    fs.writeFileSync(textPath, fullText);
    console.log(`   📄 页面全文已保存到: ${textPath}`);
  }

  // ========== 步骤5: 也尝试"全局设置"路径（可能业务规则在那里） ==========
  console.log(`\n📍 步骤5: 尝试"全局设置"路径...`);
  try {
    const globalSettings = await page.$('text=全局设置');
    if (globalSettings) {
      await globalSettings.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotDir, 'v8-07-global-settings.png') });
      
      const globalText = await page.evaluate(() => document.body?.innerText?.substring(0, 4000) || '');
      console.log(`\n📄 全局设置面板文本:\n${globalText.substring(0, 2000)}`);
      
      // 查找全局设置中所有配置项
      const configItems = await page.evaluate(() => {
        const allElements = document.querySelectorAll('span, div, label, p, li, td, th, h4, h5, h6');
        const results = [];
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          if (text.length > 2 && text.length < 60) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.left > 800) { // 右侧面板
              results.push({
                text: text.substring(0, 60),
                tag: el.tagName,
                y: Math.round(rect.top),
              });
            }
          }
        }
        return results.slice(0, 50);
      });
      
      console.log(`\n   右侧面板配置项:`);
      configItems.forEach((el, i) => {
        console.log(`   [${i}] y=${el.y} "${el.text}" (${el.tag})`);
      });
    }
  } catch (e) {
    console.log(`   ⚠️ 全局设置路径失败: ${e.message}`);
  }

  // ========== 步骤6: 尝试"表单设计"路径 ==========
  console.log(`\n📍 步骤6: 尝试"表单设计"路径...`);
  try {
    const formDesignTab = await page.$('text=表单设计');
    if (formDesignTab) {
      await formDesignTab.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: path.join(screenshotDir, 'v8-08-form-design.png') });
      
      // 查找"表单设置"
      const formSettings = await page.$('text=表单设置');
      if (formSettings) {
        console.log('   ✅ 找到"表单设置"，点击...');
        await formSettings.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(screenshotDir, 'v8-09-form-settings.png') });
        
        // 查找"表单事件"或"公式执行"或"业务关联规则"
        const eventKeywords = ['表单事件', '公式执行', '业务关联', '关联规则', '提交规则'];
        for (const kw of eventKeywords) {
          const el = await page.$(`text=${kw}`);
          if (el) {
            console.log(`   ✅ 找到"${kw}"，点击...`);
            await el.click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: path.join(screenshotDir, `v8-10-${kw}.png`) });
            
            const eventText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || '');
            console.log(`\n📄 ${kw}面板文本:\n${eventText.substring(0, 1500)}`);
            break;
          }
        }
      }
    }
  } catch (e) {
    console.log(`   ⚠️ 表单设计路径失败: ${e.message}`);
  }

  // 保存最终页面状态
  const finalText = await page.evaluate(() => document.body?.innerText || '');
  const finalTextPath = path.join(screenshotDir, 'v8-final-page-text.txt');
  fs.writeFileSync(finalTextPath, finalText);
  console.log(`\n📄 最终页面文本已保存到: ${finalTextPath}`);

  console.log('\n✅ 浏览器保持打开 60 秒供观察...');
  await page.waitForTimeout(60000);
  await browser.close();
  console.log('\n=== 探索完成 ===');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});
