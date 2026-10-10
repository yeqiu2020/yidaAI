#!/usr/bin/env node
/**
 * integration-designer-fix.js
 *
 * 通过 Playwright 打开集成自动化设计器，点击节点触发重渲染，然后保存。
 * 用途：修复 CycleContainer 内 InitiateApprovalNode 设计器面板首次渲染空白的问题。
 *
 * 原理：CycleContainer 内子节点首次点击时未调用 getFormVariables.json API，
 *   导致设置面板字段赋值/发起人渲染为空。点击前置 GetBatchDataNode 触发正常
 *   初始化后，再点回 InitiateApprovalNode 即可正确渲染。保存后设计器格式成为权威版本。
 *
 * 用法:
 *   node integration-designer-fix.js <appType> <processCode> [--save] [--screenshot]
 *
 * 参数:
 *   appType      应用ID（如 APP_XK966O71UT383IQEK2A0QA0GA4）
 *   processCode  逻辑流编码（如 LPROC-XXXX）
 *   --save       点击保存按钮（默认仅触发重渲染不保存）
 *   --screenshot 保存截图到脚本目录
 *
 * 依赖: .cookies.json（通过 simulated-login 生成）、playwright
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── 工具函数 ──────────────────────────────────────────

function loadCookieData(projectRoot) {
  const root = projectRoot || path.resolve(__dirname, '..', '..', '..', '..');
  const cookieFile = path.join(root, '.cookies.json');
  if (!fs.existsSync(cookieFile)) return null;
  try {
    const raw = fs.readFileSync(cookieFile, 'utf-8').trim();
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data;
  } catch (e) {
    return null;
  }
}

function resolveBaseUrl(cookieData) {
  if (!cookieData) return 'https://www.aliwork.com';
  return cookieData.base_url || cookieData.baseUrl || 'https://www.aliwork.com';
}

function extractCookies(cookieData) {
  if (!cookieData) return [];
  if (Array.isArray(cookieData)) return cookieData;
  if (Array.isArray(cookieData.cookies)) return cookieData.cookies;
  return [];
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const appType = args[0];
  const processCode = args[1];
  const doSave = args.includes('--save');
  const doScreenshot = args.includes('--screenshot');

  if (!appType || !processCode) {
    console.error('用法: node integration-designer-fix.js <appType> <processCode> [--save] [--screenshot]');
    console.error('示例: node integration-designer-fix.js APP_XK966O71UT383IQEK2A0QA0GA4 LPROC-XXXX --save');
    process.exit(1);
  }

  // 加载登录态
  const cookieData = loadCookieData();
  if (!cookieData) {
    console.error('❌ 未找到 .cookies.json，请先运行 simulated-login 登录');
    process.exit(1);
  }

  const baseUrl = resolveBaseUrl(cookieData);
  const cookies = extractCookies(cookieData);
  const designerUrl = `${baseUrl}/alibaba/web/${appType}/design/newDesigner.html?processCode=${processCode}&isLogic=true`;

  console.log('═'.repeat(60));
  console.log('集成自动化设计器修复');
  console.log('═'.repeat(60));
  console.log(`应用ID:     ${appType}`);
  console.log(`逻辑流编码: ${processCode}`);
  console.log(`设计器URL:  ${designerUrl}`);
  console.log(`保存:       ${doSave ? '是' : '否（仅触发重渲染）'}`);
  console.log('═'.repeat(60));

  // 启动浏览器
  console.log('\n🌐 启动浏览器...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log(`  ✅ 已加载 ${cookies.length} 个 Cookie`);
  } else {
    console.error('  ⚠️ Cookie 为空，可能需要重新登录');
  }

  const page = await context.newPage();

  // 监听控制台日志
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('getFormVariables') || text.includes('error')) {
      console.log(`  [浏览器控制台] ${text.substring(0, 200)}`);
    }
  });

  // 监听网络请求
  let getFormVariablesCalled = false;
  page.on('request', req => {
    if (req.url().includes('getFormVariables')) {
      getFormVariablesCalled = true;
      console.log(`  [网络] getFormVariables.json 请求已发出`);
    }
  });

  // 导航到设计器
  console.log('\n📍 导航到设计器...');
  try {
    await page.goto(designerUrl, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    console.log(`  ⚠️ 页面加载超时，继续尝试...`);
  }

  // 检查是否被重定向到登录页（注意：newDesigner.html 含 "sign" 子串，不能用 includes('sign')）
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('passport') || currentUrl.includes('login.aliwork')) {
    console.error('❌ 登录态已过期，请重新运行 simulated-login');
    console.error('   当前URL: ' + currentUrl);
    await browser.close();
    process.exit(1);
  }

  // 等待设计器加载
  console.log('⏳ 等待设计器加载...');
  await page.waitForTimeout(15000);

  // 检查 canvasEngineAPI 是否可用
  const hasCanvas = await page.evaluate(() => {
    return typeof window.canvasEngineAPI !== 'undefined' && typeof window.logicSchema !== 'undefined';
  });

  if (!hasCanvas) {
    console.error('❌ 设计器未正确加载（canvasEngineAPI 或 logicSchema 不可用）');
    console.error('   可能原因：1) 登录态过期 2) processCode 错误 3) 页面加载未完成');
    if (doScreenshot) {
      const ssPath = path.join(__dirname, `designer-error-${processCode}.png`);
      await page.screenshot({ path: ssPath, fullPage: true });
      console.error(`   截图已保存: ${ssPath}`);
    }
    await browser.close();
    process.exit(1);
  }

  console.log('✅ 设计器已加载');

  // 获取节点树
  const schema = await page.evaluate(() => window.logicSchema);
  if (!schema) {
    console.error('❌ 无法获取 logicSchema');
    await browser.close();
    process.exit(1);
  }

  // 递归收集所有节点
  const allNodes = [];
  function collectNodes(node, depth) {
    if (!node) return;
    allNodes.push({ node, depth });
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => collectNodes(child, depth + 1));
    }
  }
  collectNodes(schema, 0);

  console.log(`\n📋 画布节点树（共 ${allNodes.length} 个节点）:`);
  allNodes.forEach(({ node, depth }) => {
    const indent = '  '.repeat(depth);
    const name = node.props?.name || node.name || '';
    const comp = node.componentName || node.type || '';
    const nid = node.id || '';
    console.log(`${indent}- [${comp}] ${name} (${nid})`);
  });

  // 查找 GetBatchDataNode 和 InitiateApprovalNode
  const getBatchNode = allNodes.find(({ node }) =>
    node.componentName === 'GetBatchDataNode' ||
    node.props?.nodeName === 'GetBatchDataNode'
  );
  const initiateApprovalNode = allNodes.find(({ node }) =>
    node.componentName === 'InitiateApprovalNode' ||
    node.props?.nodeName === 'InitiateApprovalNode'
  );

  if (!getBatchNode) {
    console.error('\n❌ 未找到获取多条数据节点（GetBatchDataNode）');
    console.error('   此脚本仅适用于包含获取多条数据 + 发起审批节点的循环容器流');
    await browser.close();
    process.exit(1);
  }

  if (!initiateApprovalNode) {
    console.error('\n❌ 未找到发起审批节点（InitiateApprovalNode）');
    await browser.close();
    process.exit(1);
  }

  console.log(`\n✅ 找到目标节点:`);
  console.log(`  获取多条数据: ${getBatchNode.node.id}`);
  console.log(`  发起审批:     ${initiateApprovalNode.node.id}`);

  // 步骤1: 在 iframe 内点击"获取多条数据"节点（触发 getFormVariables.json）
  // ⚠️ 关键：设计器画布在 iframe（lc-simulator-content-frame）内，必须通过 contentDocument
  //   查找节点坐标再用 mouse.click 点击。仅用 canvasEngineAPI.emit 不会触发 getFormVariables.json。
  console.log('\n📍 步骤1: 在 iframe 内点击"获取多条数据"节点...');

  async function findAndClickNodeInIframe(nodeTitle) {
    const nodeInfo = await page.evaluate((title) => {
      const iframe = document.querySelector('iframe.lc-simulator-content-frame');
      if (!iframe || !iframe.contentDocument) return { found: false };
      const doc = iframe.contentDocument;
      const titles = doc.querySelectorAll('.flow-node-title');
      for (let i = 0; i < titles.length; i++) {
        if (titles[i].textContent?.trim() === title) {
          const nodeEl = titles[i].closest('.flow-node') || titles[i].closest('.flow-node-container') || titles[i].parentElement;
          const rect = nodeEl.getBoundingClientRect();
          const iframeRect = iframe.getBoundingClientRect();
          return {
            found: true,
            x: iframeRect.x + rect.x + rect.width / 2,
            y: iframeRect.y + rect.y + rect.height / 2,
          };
        }
      }
      return { found: false };
    }, nodeTitle);

    if (nodeInfo && nodeInfo.found) {
      console.log(`  找到"${nodeTitle}": x=${Math.round(nodeInfo.x)} y=${Math.round(nodeInfo.y)}`);
      await page.mouse.click(nodeInfo.x, nodeInfo.y);
      console.log(`  ✅ 已点击`);
      return true;
    } else {
      console.log(`  ⚠️ 未找到"${nodeTitle}"节点，尝试 canvasEngineAPI.emit 回退`);
      // 回退：通过 canvasEngineAPI 选中
      const allNodes = [];
      (function collect(n) { if (!n) return; allNodes.push(n); if (n.children) n.children.forEach(collect); })(schema);
      const targetNode = allNodes.find(n =>
        n.componentName === 'GetBatchDataNode' && nodeTitle === '获取多条数据' ||
        n.componentName === 'InitiateApprovalNode' && nodeTitle === '发起审批'
      );
      if (targetNode) {
        await page.evaluate((nodeObj) => {
          const api = window.canvasEngineAPI;
          if (api && api.editor) api.editor.emit('SIMPLE_FLOW_EDITOR_MATERIAL_SELECT', nodeObj);
        }, targetNode);
        console.log(`  ✅ canvasEngineAPI.emit 已执行`);
        return true;
      }
      return false;
    }
  }

  getFormVariablesCalled = false;
  await findAndClickNodeInIframe('获取多条数据');
  await page.waitForTimeout(5000);
  console.log(`  ${getFormVariablesCalled ? '✅' : '⚠️'} getFormVariables.json ${getFormVariablesCalled ? '已调用' : '未检测到（可能已缓存）'}`);

  // 步骤2: 点击"发起审批"节点（此时应能正确渲染）
  console.log('📍 步骤2: 在 iframe 内点击"发起审批"节点...');
  getFormVariablesCalled = false;
  await findAndClickNodeInIframe('发起审批');
  await page.waitForTimeout(5000);
  console.log(`  ${getFormVariablesCalled ? '✅' : '⚠️'} getFormVariables.json ${getFormVariablesCalled ? '已调用' : '未检测到（可能已缓存）'}`);

  // 检查设置面板是否已渲染字段
  const panelInfo = await page.evaluate(() => {
    // 在主页面和 iframe 内都检查
    const mainBody = document.body.innerText;
    let iframeBody = '';
    const iframe = document.querySelector('iframe.lc-simulator-content-frame');
    if (iframe && iframe.contentDocument) {
      iframeBody = iframe.contentDocument.body?.innerText || '';
    }
    const allText = mainBody + '\n' + iframeBody;
    return {
      hasFieldSetting: allText.includes('字段设置') || allText.includes('字段赋值'),
      hasTargetField: allText.includes('目标字段'),
      hasInitiator: allText.includes('发起人'),
      hasCurrentLoop: allText.includes('当前循环'),
    };
  });

  console.log(`  📊 设置面板状态: ${JSON.stringify(panelInfo)}`);

  // 步骤3: 保存（可选）
  // ⚠️ v2.8.2 正确保存流程（经实测验证）：
  //   1. 点击设置面板右下角"保存"按钮（通过 React onClick，把面板修改应用到画布）
  //   2. 检查是否有错误弹窗（如发起人未设置等）
  //   3. 点击空白处退出节点
  //   4. 点击右上角"发布"按钮（通过 React onClick，触发 saveProcess API 持久化）
  //   5. 检查是否有错误弹窗
  //   6. 等待 saveProcess API 响应确认
  if (doSave) {
    console.log('\n📍 步骤3: 保存逻辑流...');

    // 监听 saveProcess 网络请求
    let saveProcessCalled = false;
    let saveProcessResponse = null;
    page.on('response', async resp => {
      if (resp.url().includes('saveProcess') || resp.url().includes('saveLogicFlow')) {
        saveProcessCalled = true;
        try { saveProcessResponse = await resp.json(); } catch(e) { saveProcessResponse = { status: resp.status() }; }
        console.log(`  [网络] saveProcess 响应: ${resp.status()}`);
      }
    });

    // 3a: 点击设置面板右下角"保存"按钮（通过 React onClick）
    console.log('  3a: 点击面板"保存"按钮...');
    const panelSaveResult = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === '保存' && !btn.className.includes('simple-flow-canvas-save-button')) {
          const reactKey = Object.keys(btn).find(k => k.startsWith('__reactEventHandlers') || k.startsWith('__reactProps'));
          if (reactKey) {
            const handlers = btn[reactKey];
            if (handlers && typeof handlers.onClick === 'function') {
              try {
                handlers.onClick({ type: 'click', target: btn, currentTarget: btn, preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: new MouseEvent('click') });
                return { success: true, method: 'React onClick' };
              } catch(e) { return { success: false, error: e.message }; }
            }
          }
          btn.click();
          return { success: true, method: 'direct click' };
        }
      }
      return { success: false, error: 'panel save button not found' };
    });
    console.log(`  面板保存: ${JSON.stringify(panelSaveResult)}`);
    await page.waitForTimeout(3000);

    // 3b: 检查错误弹窗
    const errorDialog = await page.evaluate(() => {
      const selectors = ['.next-dialog', '.next-modal', '.next-message', '.next-toast', '[class*="toast"]', '[class*="notice"]'];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = el.textContent?.trim();
          if (text && text.length > 5 && el.offsetParent !== null) return { found: true, text: text.substring(0, 300) };
        }
      }
      return { found: false };
    });
    if (errorDialog.found) {
      console.log(`  ❌ 面板保存后出现错误弹窗: ${errorDialog.text}`);
      const ssPath = path.join(__dirname, `designer-error-${processCode}.png`);
      await page.screenshot({ path: ssPath });
      console.log(`  📸 错误截图: ${ssPath}`);
    } else {
      console.log('  ✅ 面板保存无错误弹窗');
    }

    // 3c: 点击空白处退出节点
    console.log('  3c: 点击空白处退出节点...');
    const iframeRect = await page.evaluate(() => {
      const iframe = document.querySelector('iframe.lc-simulator-content-frame');
      if (!iframe) return null;
      const r = iframe.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (iframeRect) {
      await page.mouse.click(iframeRect.x + 30, iframeRect.y + iframeRect.h - 30);
    }
    await page.waitForTimeout(2000);

    // 3d: 点击右上角"发布"按钮（通过 React onClick）
    console.log('  3d: 点击"发布"按钮...');
    const publishResult = await page.evaluate(() => {
      const btn = document.querySelector('button.simple-flow-canvas-save-button.next-btn-primary');
      if (!btn) return { success: false, error: 'publish button not found' };
      const reactKey = Object.keys(btn).find(k => k.startsWith('__reactEventHandlers') || k.startsWith('__reactProps'));
      if (reactKey) {
        const handlers = btn[reactKey];
        if (handlers && typeof handlers.onClick === 'function') {
          try {
            handlers.onClick({ type: 'click', target: btn, currentTarget: btn, preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: new MouseEvent('click') });
            return { success: true, method: 'React onClick' };
          } catch(e) { return { success: false, error: e.message }; }
        }
      }
      btn.click();
      return { success: true, method: 'direct click' };
    });
    console.log(`  发布: ${JSON.stringify(publishResult)}`);

    // 等待可能的确认弹窗
    await page.waitForTimeout(2000);
    const confirmResult = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const text = btn.textContent?.trim();
        if ((text === '确定' || text === '确认' || text === 'OK') && btn.offsetParent !== null) {
          const reactKey = Object.keys(btn).find(k => k.startsWith('__reactEventHandlers') || k.startsWith('__reactProps'));
          if (reactKey && btn[reactKey]?.onClick) {
            btn[reactKey].onClick({ type: 'click', target: btn, currentTarget: btn, preventDefault: () => {}, stopPropagation: () => {} });
            return { found: true, text };
          }
          btn.click();
          return { found: true, text };
        }
      }
      return { found: false };
    });
    if (confirmResult.found) console.log(`  确认弹窗: 已点击"${confirmResult.text}"`);

    // 3e: 检查发布后错误弹窗
    await page.waitForTimeout(3000);
    const publishError = await page.evaluate(() => {
      const selectors = ['.next-dialog', '.next-modal', '.next-message', '.next-toast', '[class*="toast"]', '[class*="notice"]'];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = el.textContent?.trim();
          if (text && text.length > 5 && el.offsetParent !== null) return { found: true, text: text.substring(0, 300) };
        }
      }
      return { found: false };
    });
    if (publishError.found) {
      console.log(`  ❌ 发布后出现错误弹窗: ${publishError.text}`);
      const ssPath = path.join(__dirname, `designer-publish-error-${processCode}.png`);
      await page.screenshot({ path: ssPath });
      console.log(`  📸 错误截图: ${ssPath}`);
    }

    // 等待 saveProcess API 响应
    for (let i = 0; i < 15; i++) {
      if (saveProcessCalled) break;
      await page.waitForTimeout(1000);
    }

    if (saveProcessCalled) {
      const success = saveProcessResponse && (saveProcessResponse.success === true || saveProcessResponse.success === 'true');
      console.log(`  ${success ? '✅✅✅ saveProcess API 发布成功!' : '⚠️ saveProcess 响应: ' + JSON.stringify(saveProcessResponse).substring(0, 200)}`);
    } else {
      console.log('  ⚠️ 未检测到 saveProcess API 请求，保存可能未生效');
    }
  } else {
    console.log('\n⏭️ 跳过保存（未指定 --save）');
  }

  // 截图
  if (doScreenshot) {
    const ssPath = path.join(__dirname, `designer-fix-${processCode}.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log(`\n📸 截图已保存: ${ssPath}`);
  }

  // 等待用户观察（非 headless 模式）
  if (!doSave) {
    console.log('\n⏸️ 浏览器保持打开，请在设计器中确认字段已正确渲染。');
    console.log('   确认后可手动保存，或关闭浏览器结束脚本。');
    console.log('   按 Ctrl+C 退出脚本。');
    await page.waitForTimeout(600000); // 等待 10 分钟
  }

  await browser.close();
  console.log('\n✅ 设计器修复完成');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});
