const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COOKIE_FILE = path.join(PROJECT_ROOT, '.cookies.json');
const FORM_MANAGER_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'api-client', 'scripts', 'form_manager.js');
const API_CLIENT_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'api-client', 'scripts', 'api_client.js');
const PLAYWRIGHT_CORE_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'js-action-tester', 'node_modules', 'playwright-core');

// Phase 6: Cookie 加载统一委托给 lib/core/utils
const coreUtils = require('../../../../lib/core/utils');

/**
 * 获取 playwright-core 模块路径
 * 优先返回能找到浏览器的路径（本地或全局）
 * @returns {string|null} 模块路径或 null
 */
function resolvePlaywrightCore() {
  const candidates = [];

  // 本地路径
  if (fs.existsSync(PLAYWRIGHT_CORE_PATH)) {
    candidates.push(PLAYWRIGHT_CORE_PATH);
  }

  // 全局路径
  try {
    const globalPath = require.resolve('playwright-core');
    if (globalPath && !candidates.includes(globalPath)) {
      candidates.push(globalPath);
    }
  } catch (e) {
    // 忽略
  }

  // 优先返回能找到浏览器的路径
  for (const pwPath of candidates) {
    try {
      const { chromium } = require(pwPath);
      if (chromium && chromium.executablePath) {
        const browserPath = chromium.executablePath();
        if (browserPath && fs.existsSync(browserPath)) {
          return pwPath;
        }
      }
    } catch (e) {
      // 忽略错误，尝试下一个
    }
  }

  // 如果都找不到浏览器，返回第一个可用的路径（让后续报错更清晰）
  return candidates[0] || null;
}

const FLOW_SETTING_DEFS = {
  autoApprovalInitiatorMerge: { type: 'boolean', desc: '所有发起人合并', group: 'autoApproval', uiLabel: '所有发起人合并' },
  autoApprovalAdjacentMerge: { type: 'boolean', desc: '相邻审批人合并', group: 'autoApproval', uiLabel: '相邻审批人合并' },
  autoApprovalDeduplicate: { type: 'boolean', desc: '审批人自动去重', group: 'autoApproval', uiLabel: '审批人自动去重' },
  allowWithdraw: { type: 'boolean', desc: '允许撤回', group: 'basic' },
  allowCollaboration: { type: 'boolean', desc: '允许协作', group: 'basic' },
  allowTemporaryStorage: { type: 'boolean', desc: '允许暂存', group: 'basic' },
  noRecordRecall: { type: 'boolean', desc: '无痕回收', group: 'basic' },
  stopAssociationRulesIfFailed: { type: 'boolean', desc: '关联规则失败时是否停止', group: 'basic' }
};

function findBrowserPath(pwCorePath) {
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
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 尝试使用 Playwright 全局安装的浏览器
  try {
    const pwPath = pwCorePath || PLAYWRIGHT_CORE_PATH;
    const { chromium } = require(pwPath);
    if (chromium && chromium.executablePath) {
      const globalPath = chromium.executablePath();
      if (globalPath && fs.existsSync(globalPath)) {
        return globalPath;
      }
    }
  } catch (e) {
    // 忽略错误，继续返回 null
  }

  return null;
}

function getAuthRef() {
  const { resolveCorpId } = require(API_CLIENT_PATH);
  const { loadCookieData, resolveBaseUrl } = coreUtils;
  const cookieData = loadCookieData();
  if (!cookieData) {
    console.error('  ❌ 未找到登录态，请先登录');
    process.exit(1);
  }
  return {
    cookieData,
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    corpId: resolveCorpId(cookieData)
  };
}

async function getFlowForms(authRef, appType) {
  console.error(`\n📋 获取应用下的流程表单列表...`);
  const { getAppForms } = require(FORM_MANAGER_PATH);
  const allForms = await getAppForms(authRef, appType);
  const flowForms = allForms.filter(f => {
    const formType = f.formType || f.type || '';
    return formType === 'process' || formType.includes('流程');
  });
  console.error(`  ✅ 找到 ${flowForms.length} 个流程表单（共 ${allForms.length} 个表单）`);
  return flowForms;
}

async function getProcessDesign(authRef, appType, processCode, formUuid) {
  console.error(`\n📋 获取流程设计...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   流程Code: ${processCode}`);
  console.error(`   表单UUID: ${formUuid}`);

  const { getRequest, postRequest, requestWithAutoLogin } = require(API_CLIENT_PATH);

  const apiPatterns = [
    {
      method: 'GET',
      path: `/dingtalk/web/${appType}/query/processdesign/getProcessDesign.json`,
      params: { processCode, formUuid, _locale_time_zone_offset: '28800000' }
    },
    {
      method: 'GET',
      path: `/aliwork/web/${appType}/query/process/getProcessDefinition.json`,
      params: { processCode, formUuid, _locale_time_zone_offset: '28800000' }
    },
    {
      method: 'GET',
      path: `/dingtalk/web/${appType}/query/process/getProcessDefinition.json`,
      params: { processCode, formUuid, _locale_time_zone_offset: '28800000' }
    },
    {
      method: 'POST',
      path: `/dingtalk/web/${appType}/query/processdesign/getProcessDesign.json`,
      params: { processCode, formUuid, _locale_time_zone_offset: '28800000' }
    }
  ];

  for (let i = 0; i < apiPatterns.length; i++) {
    const pattern = apiPatterns[i];
    console.error(`   尝试模式 ${i + 1}/${apiPatterns.length}: ${pattern.method} ${pattern.path}`);

    try {
      const result = await requestWithAutoLogin((auth) => {
        const params = { ...pattern.params, _csrf_token: auth.csrfToken };
        if (pattern.method === 'GET') {
          return getRequest(auth.baseUrl, pattern.path, params, auth.cookies);
        } else {
          return postRequest(auth.baseUrl, pattern.path, params, auth.cookies);
        }
      }, authRef);

      if (result?.success && result.content) {
        const contentKeys = Object.keys(result.content);
        if (contentKeys.length === 0) {
          console.error(`   ⚠️ 模式 ${i + 1} 返回空内容（流程已启用，API只读）`);
          return { data: result.content, apiPattern: pattern, isEmpty: true };
        }
        console.error(`  ✅ 获取成功（模式 ${i + 1}）`);
        console.error(`     响应键: ${contentKeys.join(', ')}`);
        return { data: result.content, apiPattern: pattern, isEmpty: false };
      } else {
        console.error(`   ⚠️ 模式 ${i + 1} 失败: ${result?.errorMsg || '无内容'}`);
      }
    } catch (e) {
      console.error(`   ⚠️ 模式 ${i + 1} 异常: ${e.message}`);
    }
  }

  console.error(`  ❌ 所有API模式均失败`);
  return null;
}

async function saveProcessDesign(authRef, appType, processDesign, apiPattern) {
  console.error(`\n🔄 保存流程设计...`);

  const { postRequest, requestWithAutoLogin } = require(API_CLIENT_PATH);

  const savePatterns = [
    `/dingtalk/web/${appType}/query/processdesign/saveProcessDesign.json`,
    `/dingtalk/web/${appType}/query/processdesign/updateProcessDesign.json`,
    `/aliwork/web/${appType}/query/process/saveProcessDefinition.json`,
    `/dingtalk/web/${appType}/query/process/saveProcessDefinition.json`
  ];

  for (let i = 0; i < savePatterns.length; i++) {
    const savePath = savePatterns[i];
    console.error(`   尝试保存模式 ${i + 1}/${savePatterns.length}: POST ${savePath}`);

    try {
      const result = await requestWithAutoLogin((auth) => {
        return postRequest(
          auth.baseUrl,
          savePath,
          {
            _csrf_token: auth.csrfToken,
            _locale_time_zone_offset: '28800000',
            processDesign: JSON.stringify(processDesign),
            processCode: processDesign.processCode || processDesign.props?.processCode || '',
            formUuid: processDesign.bindingForm || ''
          },
          auth.cookies
        );
      }, authRef);

      if (result?.success) {
        console.error(`  ✅ 保存成功（模式 ${i + 1}）`);
        return result;
      } else {
        console.error(`   ⚠️ 保存模式 ${i + 1} 失败: ${result?.errorMsg || '未知错误'}`);
      }
    } catch (e) {
      console.error(`   ⚠️ 保存模式 ${i + 1} 异常: ${e.message}`);
    }
  }

  console.error(`  ❌ 所有保存模式均失败`);
  return null;
}

function extractFlowSettings(processDesign) {
  const settings = {};
  const props = processDesign.props || processDesign.processProps || {};

  for (const [key, def] of Object.entries(FLOW_SETTING_DEFS)) {
    if (props[key] !== undefined) {
      settings[key] = props[key];
    }
  }

  if (props.autoApprovalRule !== undefined) {
    const rule = props.autoApprovalRule;
    if (typeof rule === 'string') {
      settings.autoApprovalInitiatorMerge = rule.includes('initiator') || rule.includes('发起人');
      settings.autoApprovalAdjacentMerge = rule.includes('adjacent') || rule.includes('相邻');
      settings.autoApprovalDeduplicate = rule.includes('deduplicate') || rule.includes('去重');
    } else if (typeof rule === 'object') {
      if (rule.initiatorMerge !== undefined) settings.autoApprovalInitiatorMerge = rule.initiatorMerge;
      if (rule.adjacentMerge !== undefined) settings.autoApprovalAdjacentMerge = rule.adjacentMerge;
      if (rule.deduplicate !== undefined) settings.autoApprovalDeduplicate = rule.deduplicate;
    }
  }

  return settings;
}

function applyFlowSettings(processDesign, settings) {
  if (!processDesign.props && !processDesign.processProps) {
    processDesign.props = {};
  }
  const props = processDesign.props || processDesign.processProps;

  for (const [key, value] of Object.entries(settings)) {
    if (!FLOW_SETTING_DEFS[key]) {
      console.error(`   ⚠️ 未知配置项: ${key}，跳过`);
      continue;
    }

    const def = FLOW_SETTING_DEFS[key];
    if (def.group === 'autoApproval') {
      if (!props.autoApprovalRule || typeof props.autoApprovalRule !== 'object') {
        props.autoApprovalRule = props.autoApprovalRule || {};
      }
      if (typeof props.autoApprovalRule === 'string') {
        const ruleObj = {};
        ruleObj.initiatorMerge = props.autoApprovalRule.includes('initiator') || props.autoApprovalRule.includes('发起人');
        ruleObj.adjacentMerge = props.autoApprovalRule.includes('adjacent') || props.autoApprovalRule.includes('相邻');
        ruleObj.deduplicate = props.autoApprovalRule.includes('deduplicate') || props.autoApprovalRule.includes('去重');
        props.autoApprovalRule = ruleObj;
      }
      const ruleKeyMap = {
        autoApprovalInitiatorMerge: 'initiatorMerge',
        autoApprovalAdjacentMerge: 'adjacentMerge',
        autoApprovalDeduplicate: 'deduplicate'
      };
      props.autoApprovalRule[ruleKeyMap[key]] = value;
      console.error(`   → autoApprovalRule.${ruleKeyMap[key]}: ${value} (${def.desc})`);
    } else {
      props[key] = value;
      console.error(`   → ${key}: ${value} (${def.desc})`);
    }
  }

  return processDesign;
}

async function cmdSetAutoApprovalBrowser(appType, formUuid, processCode, rules) {
  console.error(`\n🖥️ 使用浏览器自动化设置自动审批规则...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   表单UUID: ${formUuid}`);
  console.error(`   流程Code: ${processCode}`);
  console.error(`   规则: ${JSON.stringify(rules)}`);

  const pwCorePath = resolvePlaywrightCore();
  if (!pwCorePath) {
    console.log(JSON.stringify({ success: false, message: '未找到 playwright-core，请确保已安装 Playwright（运行: npm install -g playwright-core 或 npx playwright install chromium）' }));
    return;
  }
  console.error(`   Playwright路径: ${pwCorePath}`);

  const executablePath = findBrowserPath(pwCorePath);
  if (!executablePath) {
    console.log(JSON.stringify({ success: false, message: '未找到浏览器可执行文件，请确保已安装 Playwright 浏览器（运行: npx playwright install chromium）' }));
    return;
  }
  console.error(`   浏览器路径: ${executablePath}`);

  const { loadCookieData, resolveBaseUrl } = coreUtils;
  const cookieData = loadCookieData();
  if (!cookieData) {
    console.log(JSON.stringify({ success: false, message: '未找到登录态，请先登录' }));
    return;
  }
  const baseUrl = resolveBaseUrl(cookieData);

  const { chromium } = require(pwCorePath);

  const launchOptions = { headless: false };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const domain = new URL(baseUrl).hostname;
  const browserCookies = (cookieData.cookies || []).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain || domain,
    path: c.path || '/',
    expires: c.expires || -1,
    httpOnly: c.httpOnly || false,
    secure: c.secure || false,
    sameSite: c.sameSite || 'Lax'
  }));
  await context.addCookies(browserCookies);

  const page = await context.newPage();

  try {
    console.error(`\n   📍 步骤1: 导航到流程设计页面...`);
    const designerUrl = `${baseUrl}/dingtalk/web/${appType}/design/newDesigner?processCode=${processCode}&formUuid=${formUuid}`;
    await page.goto(designerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
    console.error('   ✅ 页面加载完成');

    console.error(`   📍 步骤2: 点击"创建新流程"按钮...`);
    try {
      await page.click('button:has-text("创建新流程")', { timeout: 10000 });
      console.error('   ✅ 已点击"创建新流程"');
    } catch (e) {
      try {
        await page.locator('text=创建新流程').first().click({ timeout: 10000 });
        console.error('   ✅ 已点击"创建新流程"（备用选择器）');
      } catch (e2) {
        console.log(JSON.stringify({ success: false, message: '未找到"创建新流程"按钮，请检查流程是否已启用' }));
        await browser.close();
        return;
      }
    }
    await page.waitForTimeout(6000);

    console.error(`   📍 步骤3: 点击"全局设置"...`);
    try {
      await page.click('text=全局设置', { timeout: 10000 });
      console.error('   ✅ 已点击"全局设置"');
    } catch (e) {
      console.log(JSON.stringify({ success: false, message: '未找到"全局设置"入口' }));
      await browser.close();
      return;
    }
    await page.waitForTimeout(3000);

    console.error(`   📍 步骤4: 勾选自动审批规则复选框...`);
    const checkboxes = await page.evaluate(() => {
      const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
      const result = [];
      for (const cb of allCheckboxes) {
        const rect = cb.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const label = cb.closest('label, [class*="checkbox"], [class*="Checkbox"]');
        const labelText = label ? label.textContent.trim() : '';
        result.push({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          checked: cb.checked,
          label: labelText.substring(0, 50)
        });
      }
      return result;
    });

    console.error(`   找到 ${checkboxes.length} 个可见复选框`);
    checkboxes.forEach((cb, i) => {
      console.error(`     [${i}] checked=${cb.checked} label="${cb.label}"`);
    });

    // 自动审批规则对应前3个可见复选框
    const ruleMapping = [
      { key: 'initiatorMerge', name: '所有发起人合并' },
      { key: 'adjacentMerge', name: '相邻审批人合并' },
      { key: 'deduplicate', name: '审批人自动去重' }
    ];
    
    console.error(`   配置规则: 发起人合并=${rules.initiatorMerge}, 相邻合并=${rules.adjacentMerge}, 去重=${rules.deduplicate}`);
    
    for (let i = 0; i < Math.min(3, checkboxes.length); i++) {
      const cb = checkboxes[i];
      const rule = ruleMapping[i];
      const shouldCheck = rules[rule.key];
      
      if (cb.checked !== shouldCheck) {
        console.error(`     → ${shouldCheck ? '勾选' : '取消勾选'}"${rule.name}" at (${Math.round(cb.x)}, ${Math.round(cb.y)})`);
        await page.mouse.click(cb.x, cb.y);
        await page.waitForTimeout(500);
      } else {
        console.error(`     ✓ "${rule.name}" 已是${shouldCheck ? '勾选' : '未勾选'}状态`);
      }
    }
    console.error('   ✅ 自动审批规则复选框已配置');

    console.error(`   📍 步骤5: 点击"保存"...`);
    try {
      await page.click('button:has-text("保存")', { timeout: 10000 });
      console.error('   ✅ 已点击"保存"');
    } catch (e) {
      try {
        await page.locator('text=保存').first().click({ timeout: 10000 });
        console.error('   ✅ 已点击"保存"（备用选择器）');
      } catch (e2) {
        console.log(JSON.stringify({ success: false, message: '未找到"保存"按钮' }));
        await browser.close();
        return;
      }
    }
    await page.waitForTimeout(3000);

    console.error(`   📍 步骤6: 点击"发布流程"...`);
    try {
      await page.locator('button:has-text("发布流程")').first().click({ timeout: 10000 });
      console.error('   ✅ 已点击"发布流程"');
    } catch (e) {
      try {
        await page.locator('text=发布流程').first().click({ timeout: 10000 });
        console.error('   ✅ 已点击"发布流程"（备用选择器）');
      } catch (e2) {
        console.log(JSON.stringify({ success: false, message: '未找到"发布流程"按钮' }));
        await browser.close();
        return;
      }
    }
    await page.waitForTimeout(5000);

    try {
      const confirmBtn = await page.locator('button:has-text("确定"), button:has-text("确认")').first();
      if (await confirmBtn.isVisible({ timeout: 3000 })) {
        console.error('   → 检测到确认弹窗，点击确认...');
        await confirmBtn.click({ timeout: 5000 });
        await page.waitForTimeout(3000);
      }
    } catch (e) {} // 有意忽略：确认弹窗可能不存在

    console.log(JSON.stringify({
      success: true,
      message: '流程设置成功（浏览器自动化方式）',
      method: 'browser',
      appType, formUuid, processCode, rules
    }, null, 2));

  } catch (err) {
    console.log(JSON.stringify({ success: false, message: `浏览器自动化失败: ${err.message}` }));
  } finally {
    await browser.close();
  }
}

async function cmdListFlowForms(appType) {
  const authRef = getAuthRef();
  const forms = await getFlowForms(authRef, appType);

  const result = forms.map((f, i) => ({
    index: i,
    formUuid: f.formUuid,
    title: f.title?.zh_CN || f.title || '未命名',
    formType: f.formType || f.type || 'unknown',
    processCode: f.processCode || null
  }));

  console.log(JSON.stringify({ success: true, appType, flowFormCount: result.length, flowForms: result }, null, 2));
  return result;
}

async function cmdGetSettings(appType, formUuid, processCode) {
  const authRef = getAuthRef();

  if (!processCode) {
    const forms = await getFlowForms(authRef, appType);
    const form = forms.find(f => f.formUuid === formUuid);
    if (form) {
      processCode = form.processCode;
    }
    if (!processCode) {
      console.log(JSON.stringify({ success: false, message: '未找到流程Code，请通过 --processCode 参数指定' }));
      return;
    }
  }

  const designResult = await getProcessDesign(authRef, appType, processCode, formUuid);
  if (!designResult) {
    console.log(JSON.stringify({ success: false, message: '获取流程设计失败' }));
    return;
  }

  if (designResult.isEmpty) {
    console.log(JSON.stringify({
      success: false,
      message: '流程已启用，API返回空内容（只读状态）。请使用 set-auto-approval-browser 命令通过浏览器自动化方式设置',
      appType, formUuid, processCode
    }));
    return;
  }

  const settings = extractFlowSettings(designResult.data);
  console.log(JSON.stringify({
    success: true,
    appType,
    formUuid,
    processCode,
    settings,
    rawPropsKeys: Object.keys(designResult.data.props || designResult.data.processProps || {})
  }, null, 2));
}

async function cmdSetAutoApproval(appType, formUuid, processCode, rules) {
  const authRef = getAuthRef();

  if (!processCode) {
    const forms = await getFlowForms(authRef, appType);
    const form = forms.find(f => f.formUuid === formUuid);
    if (form) processCode = form.processCode;
    if (!processCode) {
      console.log(JSON.stringify({ success: false, message: '未找到流程Code' }));
      return;
    }
  }

  const designResult = await getProcessDesign(authRef, appType, processCode, formUuid);
  if (!designResult) {
    console.log(JSON.stringify({ success: false, message: '获取流程设计失败' }));
    return;
  }

  if (designResult.isEmpty) {
    console.error('\n⚠️ 流程已启用，API返回空内容，自动降级为浏览器自动化方式...');
    await cmdSetAutoApprovalBrowser(appType, formUuid, processCode, rules);
    return;
  }

  const settings = {};
  if (rules.initiatorMerge !== undefined) settings.autoApprovalInitiatorMerge = rules.initiatorMerge;
  if (rules.adjacentMerge !== undefined) settings.autoApprovalAdjacentMerge = rules.adjacentMerge;
  if (rules.deduplicate !== undefined) settings.autoApprovalDeduplicate = rules.deduplicate;

  applyFlowSettings(designResult.data, settings);

  const saveResult = await saveProcessDesign(authRef, appType, designResult.data, designResult.apiPattern);
  if (saveResult?.success) {
    console.log(JSON.stringify({
      success: true,
      message: '自动审批规则设置成功',
      method: 'api',
      appType, formUuid, processCode, rules
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      success: false,
      message: `保存失败: ${saveResult?.errorMsg || '未知错误'}`,
      appType, formUuid, processCode
    }, null, 2));
  }
}

async function cmdBatchAutoApproval(appType, rules) {
  const authRef = getAuthRef();
  const forms = await getFlowForms(authRef, appType);

  if (forms.length === 0) {
    console.log(JSON.stringify({ success: true, message: '没有流程表单需要配置', appType }));
    return;
  }

  console.error(`\n🔄 批量设置自动审批规则...`);
  console.error(`   目标表单数: ${forms.length}`);
  console.error(`   规则: ${JSON.stringify(rules)}`);

  const results = [];
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const formTitle = form.title?.zh_CN || form.title || '未命名';
    const processCode = form.processCode;
    const formUuid = form.formUuid;

    console.error(`\n--- [${i + 1}/${forms.length}] ${formTitle} ---`);

    if (!processCode) {
      console.error(`  ⚠️ 无流程Code，跳过`);
      results.push({ formUuid, formTitle, success: false, message: '无流程Code' });
      continue;
    }

    const designResult = await getProcessDesign(authRef, appType, processCode, formUuid);
    if (!designResult) {
      results.push({ formUuid, formTitle, success: false, message: '获取流程设计失败' });
      continue;
    }

    if (designResult.isEmpty) {
      console.error(`  ⚠️ 流程已启用，使用浏览器自动化方式...`);
      await cmdSetAutoApprovalBrowser(appType, formUuid, processCode, rules);
      results.push({ formUuid, formTitle, processCode, success: true, method: 'browser', message: '浏览器自动化方式设置' });
      continue;
    }

    const settings = {};
    if (rules.initiatorMerge !== undefined) settings.autoApprovalInitiatorMerge = rules.initiatorMerge;
    if (rules.adjacentMerge !== undefined) settings.autoApprovalAdjacentMerge = rules.adjacentMerge;
    if (rules.deduplicate !== undefined) settings.autoApprovalDeduplicate = rules.deduplicate;

    applyFlowSettings(designResult.data, settings);

    const saveResult = await saveProcessDesign(authRef, appType, designResult.data, designResult.apiPattern);
    results.push({
      formUuid, formTitle, processCode,
      success: saveResult?.success || false,
      method: 'api',
      message: saveResult?.success ? '设置成功' : `保存失败: ${saveResult?.errorMsg || '未知错误'}`
    });
  }

  const successCount = results.filter(r => r.success).length;
  console.error(`\n📊 批量设置完成: ${successCount}/${results.length} 成功`);

  console.log(JSON.stringify({
    success: true,
    appType,
    total: results.length,
    successCount,
    failCount: results.length - successCount,
    results
  }, null, 2));
}

async function cmdSet(appType, formUuid, processCode, settingsStr) {
  const authRef = getAuthRef();

  if (!processCode) {
    const forms = await getFlowForms(authRef, appType);
    const form = forms.find(f => f.formUuid === formUuid);
    if (form) processCode = form.processCode;
    if (!processCode) {
      console.log(JSON.stringify({ success: false, message: '未找到流程Code' }));
      return;
    }
  }

  const designResult = await getProcessDesign(authRef, appType, processCode, formUuid);
  if (!designResult) {
    console.log(JSON.stringify({ success: false, message: '获取流程设计失败' }));
    return;
  }

  const settings = {};
  const pairs = settingsStr.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=').map(s => s.trim());
    if (FLOW_SETTING_DEFS[key]) {
      settings[key] = value === 'true' ? true : value === 'false' ? false : value;
    } else {
      console.error(`  ⚠️ 未知配置项: ${key}`);
    }
  }

  if (Object.keys(settings).length === 0) {
    console.error('  ❌ 没有有效的配置项');
    return;
  }

  applyFlowSettings(designResult.data, settings);

  const saveResult = await saveProcessDesign(authRef, appType, designResult.data, designResult.apiPattern);
  if (saveResult?.success) {
    console.log(JSON.stringify({
      success: true,
      message: '流程设置更新成功',
      appType, formUuid, processCode,
      updated: Object.keys(settings)
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      success: false,
      message: `设置失败: ${saveResult?.errorMsg || '未知错误'}`,
      appType, formUuid, processCode
    }, null, 2));
  }
}

async function cmdDiscoverApi(appType, formUuid, processCode) {
  console.error(`\n🔍 API发现模式 - 使用浏览器捕获流程设计API...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   表单UUID: ${formUuid}`);
  console.error(`   流程Code: ${processCode}`);

  const { loadCookieData, resolveBaseUrl } = coreUtils;
  const cookieData = loadCookieData();
  if (!cookieData) {
    console.error('  ❌ 未找到登录态，请先登录');
    return;
  }

  const baseUrl = resolveBaseUrl(cookieData);

  const pwCorePath = resolvePlaywrightCore();
  if (!pwCorePath) {
    console.error('  ❌ 未找到 playwright-core，请确保已安装 Playwright');
    return;
  }

  const { chromium } = require(pwCorePath);

  const executablePath = findBrowserPath(pwCorePath);
  if (!executablePath) {
    console.error('  ❌ 未找到浏览器可执行文件');
    return;
  }

  const launchOptions = { headless: true };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext();

  const cookieArray = cookieData.cookies || [];
  const domain = new URL(baseUrl).hostname;
  const browserCookies = cookieArray.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain || domain,
    path: c.path || '/',
    expires: c.expires || -1,
    httpOnly: c.httpOnly || false,
    secure: c.secure || false,
    sameSite: c.sameSite || 'Lax'
  }));
  await context.addCookies(browserCookies);

  const page = await context.newPage();

  const capturedApis = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('process') || url.includes('Process') || url.includes('flow') || url.includes('Flow')) {
      capturedApis.push({
        url,
        method: request.method(),
        headers: request.headers(),
        postData: request.postData()
      });
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('process') || url.includes('Process') || url.includes('flow') || url.includes('Flow')) {
      try {
        const body = await response.text();
        capturedApis.push({
          url,
          status: response.status(),
          responseBody: body.substring(0, 2000)
        });
      } catch (e) {} // 有意忽略：响应体可能非文本或已 consumed
    }
  });

  const designerUrl = `${baseUrl}/alibaba/web/${appType}/design/processDesigner?formUuid=${formUuid}&processCode=${processCode}`;
  console.error(`   导航到: ${designerUrl}`);

  try {
    await page.goto(designerUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.error(`   ⚠️ 页面加载超时，继续分析已捕获的请求`);
  }

  await page.waitForTimeout(3000);

  console.log(JSON.stringify({
    success: true,
    capturedApiCount: capturedApis.length,
    apis: capturedApis
  }, null, 2));

  await browser.close();
}

function cmdListSettings() {
  console.log(JSON.stringify({ success: true, settings: FLOW_SETTING_DEFS }, null, 2));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { command: '', params: {} };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app' || args[i] === '--appType') {
      parsed.params.appType = args[++i];
    } else if (args[i] === '--form' || args[i] === '--formUuid') {
      parsed.params.formUuid = args[++i];
    } else if (args[i] === '--processCode') {
      parsed.params.processCode = args[++i];
    } else if (args[i] === '--initiatorMerge') {
      parsed.params.initiatorMerge = args[++i] !== 'false';
    } else if (args[i] === '--adjacentMerge') {
      parsed.params.adjacentMerge = args[++i] !== 'false';
    } else if (args[i] === '--deduplicate') {
      parsed.params.deduplicate = args[++i] !== 'false';
    } else if (args[i] === '--enable-all') {
      parsed.params.initiatorMerge = true;
      parsed.params.adjacentMerge = true;
      parsed.params.deduplicate = true;
    } else if (args[i] === '--disable-all') {
      parsed.params.initiatorMerge = false;
      parsed.params.adjacentMerge = false;
      parsed.params.deduplicate = false;
    } else if (args[i] === '--settings') {
      parsed.params.settings = args[++i];
    } else if (!args[i].startsWith('--')) {
      parsed.command = args[i];
    }
  }
  return parsed;
}

async function main() {
  const { command, params } = parseArgs();

  console.error('============================================================');
  console.error('  流程配置工具 v2.0');
  console.error('============================================================');

  switch (command) {
    case 'list-flow-forms': {
      if (!params.appType) {
        console.error('用法: list-flow-forms --app <appType>');
        process.exit(1);
      }
      await cmdListFlowForms(params.appType);
      break;
    }
    case 'get-settings': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: get-settings --app <appType> --form <formUuid> [--processCode <code>]');
        process.exit(1);
      }
      await cmdGetSettings(params.appType, params.formUuid, params.processCode);
      break;
    }
    case 'set-auto-approval': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: set-auto-approval --app <appType> --form <formUuid> [--processCode <code>] [--initiatorMerge true] [--adjacentMerge true] [--deduplicate true] [--enable-all] [--disable-all]');
        process.exit(1);
      }
      const rules = {};
      if (params.initiatorMerge !== undefined) rules.initiatorMerge = params.initiatorMerge;
      if (params.adjacentMerge !== undefined) rules.adjacentMerge = params.adjacentMerge;
      if (params.deduplicate !== undefined) rules.deduplicate = params.deduplicate;
      if (Object.keys(rules).length === 0) {
        console.error('  ❌ 请至少指定一个自动审批规则');
        console.error('  可用选项: --initiatorMerge, --adjacentMerge, --deduplicate, --enable-all, --disable-all');
        process.exit(1);
      }
      await cmdSetAutoApproval(params.appType, params.formUuid, params.processCode, rules);
      break;
    }
    case 'set-auto-approval-browser': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: set-auto-approval-browser --app <appType> --form <formUuid> [--processCode <code>] [--initiatorMerge true] [--adjacentMerge true] [--deduplicate true] [--enable-all] [--disable-all]');
        process.exit(1);
      }
      const rules = {};
      if (params.initiatorMerge !== undefined) rules.initiatorMerge = params.initiatorMerge;
      if (params.adjacentMerge !== undefined) rules.adjacentMerge = params.adjacentMerge;
      if (params.deduplicate !== undefined) rules.deduplicate = params.deduplicate;
      if (Object.keys(rules).length === 0) {
        console.error('  ❌ 请至少指定一个自动审批规则');
        console.error('  可用选项: --initiatorMerge, --adjacentMerge, --deduplicate, --enable-all, --disable-all');
        process.exit(1);
      }
      await cmdSetAutoApprovalBrowser(params.appType, params.formUuid, params.processCode, rules);
      break;
    }
    case 'batch-auto-approval': {
      if (!params.appType) {
        console.error('用法: batch-auto-approval --app <appType> [--initiatorMerge true] [--adjacentMerge true] [--deduplicate true] [--enable-all] [--disable-all]');
        process.exit(1);
      }
      const rules = {};
      if (params.initiatorMerge !== undefined) rules.initiatorMerge = params.initiatorMerge;
      if (params.adjacentMerge !== undefined) rules.adjacentMerge = params.adjacentMerge;
      if (params.deduplicate !== undefined) rules.deduplicate = params.deduplicate;
      if (Object.keys(rules).length === 0) {
        console.error('  ❌ 请至少指定一个自动审批规则');
        process.exit(1);
      }
      await cmdBatchAutoApproval(params.appType, rules);
      break;
    }
    case 'set': {
      if (!params.appType || !params.formUuid || !params.settings) {
        console.error('用法: set --app <appType> --form <formUuid> --settings "key1=val1,key2=val2"');
        process.exit(1);
      }
      await cmdSet(params.appType, params.formUuid, params.processCode, params.settings);
      break;
    }
    case 'discover-api': {
      if (!params.appType || !params.formUuid || !params.processCode) {
        console.error('用法: discover-api --app <appType> --form <formUuid> --processCode <code>');
        process.exit(1);
      }
      await cmdDiscoverApi(params.appType, params.formUuid, params.processCode);
      break;
    }
    case 'list-settings': {
      cmdListSettings();
      break;
    }
    default:
      console.error('可用命令:');
      console.error('  list-flow-forms              列出应用下所有流程表单');
      console.error('  get-settings                  获取流程配置');
      console.error('  set-auto-approval             设置自动审批规则（API优先，已启用流程自动降级为浏览器方式）');
      console.error('  set-auto-approval-browser     设置自动审批规则（强制使用浏览器自动化）');
      console.error('  batch-auto-approval           批量设置自动审批规则（自动选择API或浏览器方式）');
      console.error('  set                           通用设置（key=value格式）');
      console.error('  discover-api                  发现流程设计API端点（使用浏览器捕获）');
      console.error('  list-settings                 列出所有可配置项');
      console.error('');
      console.error('示例:');
      console.error('  node flow-settings.js set-auto-approval --app APP_XXX --form FORM-XXX --enable-all');
      console.error('  node flow-settings.js set-auto-approval-browser --app APP_XXX --form FORM-XXX --enable-all');
      console.error('  node flow-settings.js batch-auto-approval --app APP_XXX --enable-all');
      console.error('  node flow-settings.js list-flow-forms --app APP_XXX');
      console.error('  node flow-settings.js get-settings --app APP_XXX --form FORM-XXX');
      console.error('  node flow-settings.js list-settings');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行失败:', err.message);
    process.exit(1);
  });
}
