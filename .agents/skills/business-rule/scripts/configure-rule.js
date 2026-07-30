#!/usr/bin/env node
/**
 * 配置业务关联规则（流程表单）
 * 
 * 通过 Playwright 浏览器自动化在流程设计器的全局设置→节点提交规则中
 * 添加一条关联操作规则，并构建 UPSERT/UPDATE/INSERT/DELETE 公式。
 * 
 * 用法：
 *   node configure-rule.js --app APP_XXX --form FORM-XXX --process TPROC--XXX \
 *     --name "规则名称" --function UPSERT \
 *     --target-form "库存信息" \
 *     --fields "库存信息,stock;仓库名称,stock;仓库名称,current_warehouse;产品名称,stock;产品名称,detail;库存数量,stock;入库数量,detail"
 * 
 * 核心流程（经 v19 实际验证通过）：
 * 1. 导航到流程设计器
 * 2. 创建新流程版本
 * 3. 点击全局设置
 * 4. 点击添加规则
 * 5. 填写规则名称
 * 6. 打开公式编辑器
 * 7. 键盘输入函数名 + 点击字段列表插入令牌
 * 8. 点击公式编辑器"确定"
 * 9. 点击规则对话框"确定"
 * 10. 点击全局设置面板底部"保存"
 * 11. 点击顶部工具栏"保存"
 * 12. 点击"发布流程"
 * 
 * 版本：v19（2025-07-14 验证通过）
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PLAYWRIGHT_CORE_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'js-action-tester', 'node_modules', 'playwright-core');
const coreUtils = require('../../../../lib/core/utils');

// ============ 工具函数 ============

function resolvePlaywrightCore() {
  const candidates = [];
  if (fs.existsSync(PLAYWRIGHT_CORE_PATH)) candidates.push(PLAYWRIGHT_CORE_PATH);
  try { const g = require.resolve('playwright-core'); if (g && !candidates.includes(g)) candidates.push(g); } catch (e) {}
  for (const p of candidates) {
    try { const { chromium } = require(p); if (chromium?.executablePath) { const bp = chromium.executablePath(); if (bp && fs.existsSync(bp)) return p; } } catch (e) {}
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

async function focusCM(page) {
  await page.evaluate(() => {
    const cms = document.querySelectorAll('.CodeMirror');
    for (const cm of cms) { if (cm.CodeMirror) { cm.CodeMirror.focus(); return; } }
  });
  await page.waitForTimeout(150);
}

async function getCMValue(page) {
  return await page.evaluate(() => {
    const cms = document.querySelectorAll('.CodeMirror');
    for (const cm of cms) { if (cm.CodeMirror) return cm.CodeMirror.getValue(); }
    return null;
  });
}

async function typeText(page, text) {
  await focusCM(page);
  await page.keyboard.type(text);
  await page.waitForTimeout(200);
}

/**
 * 点击字段列表中的字段令牌
 * @param {Page} page - Playwright page
 * @param {string} fieldName - 字段显示名（如 "仓库名称"）
 * @param {string} context - 查找上下文：stock(目标表字段) | detail(子表字段) | current_warehouse(当前表仓库字段) | current(当前表普通字段)
 * @param {string} targetFormName - 目标表单名称（如 "库存信息"），用于 stock 上下文定位分组
 */
async function clickFieldToken(page, fieldName, context, targetFormName = '库存信息') {
  const beforeValue = await getCMValue(page);

  for (let attempt = 0; attempt < 3; attempt++) {
    // 步骤1: 如果是目标表字段，先确保目标表分组已展开
    if (context === 'stock' || context === 'target_form') {
      await page.evaluate((formName) => {
        // 🔴 关键修正：容器选择器是 .formula-pane-content（不是 .formula-pane-vars）
        const container = document.querySelector('.formula-pane-content');
        if (!container) return;

        // 通过 title 属性精确定位目标表分组标题
        const formTitle = container.querySelector(`.formula-pane-var-form[title="${formName}"]`);
        if (!formTitle) return;

        const group = formTitle.closest('.formula-pane-var');
        if (!group) return;

        const list = group.querySelector('.formula-pane-var-list');
        if (!list) return;

        // 🔴 关键修正：检查 list_hide 类判断收起状态（不是检查字段可见性）
        if (list.classList.contains('list_hide')) {
          // 点击箭头展开（优先），兜底点击表单名称
          const arrow = group.querySelector('.formula-pane-var-arrow');
          const clickTarget = arrow || formTitle;
          const rect = clickTarget.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            clickTarget.click();
          }
        }
      }, targetFormName);
      await page.waitForTimeout(800);
    }

    // 步骤2: 在特定分组内查找并点击字段
    const pos = await page.evaluate(({fname, ctx, targetForm}) => {
      // 🔴 关键修正：容器选择器是 .formula-pane-content
      const container = document.querySelector('.formula-pane-content');
      if (!container) return null;

      // 确定在哪个分组内查找
      let targetGroup = null;
      if (ctx === 'stock' || ctx === 'target_form') {
        // 目标表字段：在目标表分组内查找
        const formTitle = container.querySelector(`.formula-pane-var-form[title="${targetForm}"]`);
        if (formTitle) targetGroup = formTitle.closest('.formula-pane-var');
      } else {
        // detail / current_warehouse / current：在当前表单分组内查找
        const formTitle = container.querySelector('.formula-pane-var-form[title="当前表单提交后的值"]');
        if (formTitle) targetGroup = formTitle.closest('.formula-pane-var');
      }

      if (!targetGroup) return null;

      const list = targetGroup.querySelector('.formula-pane-var-list');
      if (!list) return null;

      // 🔴 关键修正：在特定分组的 ul 内查找字段（不是全局遍历）
      const links = list.querySelectorAll('a.formula-var-item');
      for (const el of links) {
        const title = el.getAttribute('title') || '';

        let matched = false;
        if (ctx === 'stock' || ctx === 'target_form') {
          // 目标表字段：title 精确匹配
          matched = title === fname;
        } else if (ctx === 'detail') {
          // 子表字段：title 以 "入库明细." 等前缀开头
          matched = title === '入库明细.' + fname ||
                    title === '出库明细.' + fname ||
                    title === '退货明细.' + fname;
        } else if (ctx === 'current_warehouse' || ctx === 'current') {
          // 当前表字段：title 精确匹配
          matched = title === fname;
        }

        if (matched) {
          el.scrollIntoView({ block: 'center' });
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          }
        }
      }
      return null;
    }, {fname: fieldName, ctx: context, targetForm: targetFormName});

    if (pos) {
      await focusCM(page);
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(400);

      const afterValue = await getCMValue(page);
      if (afterValue !== beforeValue) return true;
      console.log(`   ⚠️ 点击未改变 CM 值，重试 ${attempt + 1}/3...`);
    } else {
      console.log(`   ⚠️ 未找到 ${fieldName} (${context})，重试 ${attempt + 1}/3...`);
    }
  }
  return false;
}

// ============ 对话框状态检测 ============

async function isFormulaEditorOpen(page) {
  return await page.evaluate(() => {
    const dlg = document.querySelector('.sf-formula-edit-dialog, .node-rule-formulaEdit-dlg');
    if (!dlg) return false;
    const r = dlg.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

async function isRuleDialogOpen(page) {
  return await page.evaluate(() => {
    const dlg = document.querySelector('.node-rule-setting-dlg');
    if (!dlg) return false;
    const r = dlg.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

async function isGlobalSettingsOpen(page) {
  return await page.evaluate(() => {
    const pane = document.querySelector('.sf-global-setting');
    if (!pane) return false;
    const r = pane.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

// ============ 主函数 ============

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  
  const APP_ID = opts.app || 'APP_NZEJ00HQWKPDUP4BQP8E';
  const FORM_UUID = opts.form || 'FORM-EE4298C2EA1B43F59E431F8EDBFB29A62AEA';
  const PROCESS_CODE = opts.process || 'TPROC--V0A667D1KCF75N7EHUYD2DJ4OV512ZNS9NIRM0';
  const RULE_NAME = opts.name || '采购入库-增加库存';
  
  console.log('=== 配置业务关联规则 ===\n');
  console.log(`  应用ID: ${APP_ID}`);
  console.log(`  表单UUID: ${FORM_UUID}`);
  console.log(`  流程Code: ${PROCESS_CODE}`);
  console.log(`  规则名称: ${RULE_NAME}\n`);

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
    name: c.name, value: c.value, domain: c.domain || domain, path: c.path || '/',
    expires: c.expires || -1, httpOnly: c.httpOnly || false, secure: c.secure || false, sameSite: c.sameSite || 'Lax'
  }));
  await context.addCookies(browserCookies);

  const page = await context.newPage();
  const screenshotDir = path.join(PROJECT_ROOT, '.playwright-cli');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // 步骤1: 导航到流程设计器
  const designerUrl = `${baseUrl}/dingtalk/web/${APP_ID}/design/newDesigner?processCode=${PROCESS_CODE}&formUuid=${FORM_UUID}`;
  console.log(`\n📍 导航到流程设计器...`);
  await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
  
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

  // 步骤2: 创建新流程版本
  console.log(`\n📍 创建新流程版本...`);
  try { await page.click('button:has-text("创建新流程")', { timeout: 5000 }); await page.waitForTimeout(6000); console.log('   ✅'); } catch (e) { console.log('   ⚠️ 已有草稿'); }

  // 步骤3: 点击全局设置
  console.log(`\n📍 点击全局设置...`);
  await page.click('text=全局设置', { timeout: 10000 });
  await page.waitForTimeout(3000);

  // 步骤3.5: 检查草稿中是否已有同名规则（避免重复添加）
  let cmVal = null;
  const skipAddRule = await page.evaluate((ruleName) => {
    const allText = document.body?.innerText || '';
    return allText.includes(ruleName);
  }, RULE_NAME);
  if (skipAddRule) {
    console.log(`   ⚠️ 草稿中已存在规则"${RULE_NAME}"，跳过添加步骤，直接保存+发布`);
  } else {
    console.log(`   草稿中未找到规则"${RULE_NAME}"，将继续添加`);
  }

  // 步骤4: 点击添加规则
  if (!skipAddRule) {
  console.log(`\n📍 点击添加规则...`);
  const addRuleFound = await page.evaluate(() => {
    const els = document.querySelectorAll('span, div, button, a');
    for (const el of els) { if (el.textContent?.trim() === '添加规则') { const r = el.getBoundingClientRect(); if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } }
    return null;
  });
  if (!addRuleFound) { console.error('   ❌ 未找到添加规则按钮'); await browser.close(); process.exit(1); }
  await page.mouse.click(addRuleFound.x, addRuleFound.y);
  await page.waitForTimeout(3000);

  // 步骤5: 填写规则名称
  console.log(`\n📍 填写规则名称: ${RULE_NAME}`);
  const nameInput = await page.$('.next-input.i18nInput input');
  if (nameInput) { await nameInput.click(); await nameInput.fill(RULE_NAME); }
  await page.waitForTimeout(500);

  // 步骤6: 打开公式编辑器
  console.log(`\n📍 打开公式编辑器...`);
  const formulaTextarea = await page.$('.node-rule-setting-formulaArea textarea');
  if (formulaTextarea) { await formulaTextarea.click(); }
  await page.waitForTimeout(2000);
  await focusCM(page);

  // 步骤7: 构建公式（默认 UPSERT 采购入库→库存信息）
  // 如需自定义公式步骤，可通过 --formula-steps 参数传入 JSON
  console.log(`\n📍 构建公式...`);
  const logStep = (step, desc) => console.log(`   [${step}] ${desc}`);
  
  // 默认公式步骤：UPSERT(库存信息, AND(EQ(库存信息.仓库名称, 仓库名称), EQ(库存信息.产品名称, 入库明细.产品名称)), "", 
  //   库存信息.仓库名称, 仓库名称, 库存信息.产品名称, 入库明细.产品名称, 
  //   库存信息.库存数量, 库存信息.库存数量 + 入库明细.入库数量)
  const formulaSteps = opts['formula-steps'] ? JSON.parse(opts['formula-steps']) : [
    { type: 'type', text: 'UPSERT(' },
    { type: 'click', field: '库存信息', context: 'stock' },
    { type: 'type', text: ',AND(EQ(' },
    { type: 'click', field: '仓库名称', context: 'stock' },
    { type: 'type', text: ',' },
    { type: 'click', field: '仓库名称', context: 'current_warehouse' },
    { type: 'type', text: '),EQ(' },
    { type: 'click', field: '产品名称', context: 'stock' },
    { type: 'type', text: ',' },
    { type: 'click', field: '产品名称', context: 'detail' },
    { type: 'type', text: ')),"",' },
    { type: 'click', field: '仓库名称', context: 'stock' },
    { type: 'type', text: ',' },
    { type: 'click', field: '仓库名称', context: 'current_warehouse' },
    { type: 'type', text: ',' },
    { type: 'click', field: '产品名称', context: 'stock' },
    { type: 'type', text: ',' },
    { type: 'click', field: '产品名称', context: 'detail' },
    { type: 'type', text: ',' },
    { type: 'click', field: '库存数量', context: 'stock' },
    { type: 'type', text: ',' },
    { type: 'click', field: '库存数量', context: 'stock' },
    { type: 'type', text: '+' },
    { type: 'click', field: '入库数量', context: 'detail' },
    { type: 'type', text: ')' },
  ];
  
  for (let i = 0; i < formulaSteps.length; i++) {
    const step = formulaSteps[i];
    logStep(i + 1, step.type === 'type' ? `输入 ${step.text}` : `点击 ${step.field} (${step.context})`);
    if (step.type === 'type') {
      await typeText(page, step.text);
    } else if (step.type === 'click') {
      await clickFieldToken(page, step.field, step.context);
    }
  }
  
  cmVal = await getCMValue(page);
  console.log(`\n   ✅ 最终公式: "${cmVal}"`);

  // 步骤8: 点击公式编辑器"确定"
  console.log(`\n📍 点击公式编辑器"确定"...`);
  const formulaOk = await page.evaluate(() => {
    const dlg = document.querySelector('.sf-formula-edit-dialog, .node-rule-formulaEdit-dlg');
    if (!dlg) return null;
    const buttons = dlg.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.trim() === '确定') { const r = btn.getBoundingClientRect(); if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    }
    return null;
  });
  
  if (formulaOk) {
    await page.mouse.click(formulaOk.x, formulaOk.y);
    await page.waitForTimeout(2000);
    const editorOpen = await isFormulaEditorOpen(page);
    console.log(`   公式编辑器关闭: ${!editorOpen ? '✅' : '❌ 仍然开着'}`);
    
    if (editorOpen) {
      const errText = await page.evaluate(() => {
        const dlg = document.querySelector('.sf-formula-edit-dialog, .node-rule-formulaEdit-dlg');
        return dlg ? dlg.textContent?.substring(0, 300) || '' : '';
      });
      console.log(`   错误信息: ${errText}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  }

  // 步骤9: 验证 TEXTAREA 值
  const taValue = await page.evaluate(() => {
    const ta = document.querySelector('.node-rule-setting-formulaArea textarea');
    return ta ? ta.value?.substring(0, 100) : null;
  });
  console.log(`\n📍 TEXTAREA 值: "${taValue}..."`);

  // 步骤10: 点击规则对话框"确定"
  console.log(`\n📍 点击规则对话框"确定"...`);
  const ruleOk = await page.evaluate(() => {
    const dlg = document.querySelector('.node-rule-setting-dlg');
    if (!dlg) return null;
    const buttons = dlg.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.trim() === '确定') {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  
  if (ruleOk) {
    console.log(`   找到"确定"按钮: x=${ruleOk.x}, y=${ruleOk.y}`);
    await page.mouse.click(ruleOk.x, ruleOk.y);
    await page.waitForTimeout(3000);
    
    const ruleDialogOpen = await isRuleDialogOpen(page);
    console.log(`   规则对话框关闭: ${!ruleDialogOpen ? '✅' : '❌ 仍然开着'}`);
    
    if (ruleDialogOpen) {
      const dialogText = await page.evaluate(() => {
        const dlg = document.querySelector('.node-rule-setting-dlg');
        return dlg ? dlg.textContent?.substring(0, 300) || '' : '';
      });
      console.log(`   对话框文本: ${dialogText}`);
    }
  }

  // 步骤11: 检查规则是否在表格中
  console.log(`\n📍 检查规则表格...`);
  const ruleInTable = await page.evaluate((ruleName) => {
    const text = document.body?.innerText || '';
    return text.includes(ruleName);
  }, RULE_NAME);
  console.log(`   规则在表格中: ${ruleInTable ? '✅' : '❌'}`);

  } // end if (!skipAddRule)

  // 步骤12: 保存全局设置（点击面板底部"保存"）
  console.log(`\n📍 保存全局设置（点击面板底部"保存"）...`);
  const footerSaveBtn = await page.evaluate(() => {
    const footer = document.querySelector('.simple-flow-settings-footer');
    if (!footer) return null;
    const buttons = footer.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.trim() === '保存') {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  
  if (footerSaveBtn) {
    console.log(`   找到面板底部"保存"按钮: x=${footerSaveBtn.x}, y=${footerSaveBtn.y}`);
    await page.mouse.click(footerSaveBtn.x, footerSaveBtn.y);
    await page.waitForTimeout(3000);
    console.log('   ✅ 已点击保存');
  } else {
    console.log(`   ⚠️ 未找到面板底部"保存"按钮，尝试强制点击...`);
    await page.evaluate(() => {
      const footer = document.querySelector('.simple-flow-settings-footer');
      if (!footer) return;
      const buttons = footer.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === '保存') { btn.click(); return; }
      }
    });
    await page.waitForTimeout(3000);
  }
  
  const gsOpen = await isGlobalSettingsOpen(page);
  console.log(`   全局设置面板关闭: ${!gsOpen ? '✅' : '⚠️ 仍然开着'}`);

  // 步骤13: 保存流程设计（点击顶部"保存"）
  console.log(`\n📍 保存流程设计（点击顶部"保存"）...`);
  await page.waitForTimeout(1000);
  const topSaveBtn = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button.simple-flow-canvas-save-button');
    for (const btn of buttons) {
      if (btn.textContent?.trim() === '保存') {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  
  if (topSaveBtn) {
    console.log(`   找到顶部"保存"按钮: x=${topSaveBtn.x}, y=${topSaveBtn.y}`);
    await page.mouse.click(topSaveBtn.x, topSaveBtn.y);
    await page.waitForTimeout(3000);
    console.log('   ✅ 已保存流程');
  } else {
    console.log(`   ⚠️ 未找到顶部"保存"按钮`);
  }

  // 步骤14: 发布流程
  console.log(`\n📍 发布流程...`);
  const publishBtn = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.trim() === '发布流程') {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  
  if (publishBtn) {
    console.log(`   找到"发布流程"按钮: x=${publishBtn.x}, y=${publishBtn.y}`);
    await page.mouse.click(publishBtn.x, publishBtn.y);
    console.log('   已点击发布，等待确认弹窗...');

    // 发布确认弹窗可能需要更长等待时间，且按钮文本可能多种
    let published = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(2000);
      const confirmBtn = await page.evaluate(() => {
        const candidates = document.querySelectorAll('button, span.next-btn-primary, a.next-btn-primary, .next-dialog-footer button');
        for (const btn of candidates) {
          const text = btn.textContent?.trim() || '';
          if (['确定', '确认发布', '确认', '发布', '确定发布', '确定发布流程'].includes(text)) {
            const r = btn.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
        return null;
      });
      if (confirmBtn) {
        console.log(`   找到确认按钮 (尝试 ${attempt+1}): x=${confirmBtn.x}, y=${confirmBtn.y}`);
        await page.mouse.click(confirmBtn.x, confirmBtn.y);
        await page.waitForTimeout(5000);
        console.log('   ✅ 已确认发布');
        published = true;
        break;
      }
      console.log(`   尝试 ${attempt+1}/5: 未找到确认弹窗，继续等待...`);
    }
    if (!published) {
      console.log('   ⚠️ 未找到发布确认弹窗，可能已直接发布或需要手动确认');
      // 截图当前页面，便于分析
      await page.screenshot({ path: path.join(screenshotDir, 'publish-no-confirm.png') });
      console.log(`   📄 已截图: publish-no-confirm.png`);
    }
  } else {
    console.log(`   ⚠️ 未找到"发布流程"按钮`);
    await page.screenshot({ path: path.join(screenshotDir, 'publish-no-button.png') });
  }

  // 步骤15: 最终验证
  console.log(`\n📍 最终验证...`);
  const finalText = await page.evaluate(() => document.body?.innerText || '');
  const isEnabled = finalText.includes('启用中');
  const versionMatch = finalText.match(/流程版本V(\d+)/);
  
  console.log(`\n📊 流程状态: ${versionMatch ? `V${versionMatch[1]}` : '?'} ${isEnabled ? '(启用中 ✅)' : '(未启用 ❌)'}`);
  console.log(`📊 规则名称: ${RULE_NAME}`);
  console.log(`📊 公式: ${cmVal?.substring(0, 80)}...`);
  console.log(`\n🔗 当前URL: ${page.url()}`);

  console.log('\n✅ 浏览器保持打开 15 秒...');
  await page.waitForTimeout(15000);
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(err => { console.error('❌ 错误:', err.message); console.error(err.stack); process.exit(1); });
