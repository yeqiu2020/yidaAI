#!/usr/bin/env node
/**
 * push-rule.js — 通用业务关联规则推送脚本（v3.6.0: ClipboardItem + 令牌验证）
 *
 * 读取生成的 JSON 文件（{text, marks, isCmData}），通过 Playwright 浏览器自动化
 * 打开宜搭流程设计器，将 JSON 数据直接粘贴到 CodeMirror 公式编辑器中，
 * 自动保存并发布流程。
 *
 * 🔴 核心改进（v2）：不再逐个点击令牌，而是直接把 JSON 粘贴到 CodeMirror。
 * CodeMirror 原生支持 {text, marks, isCmData} 格式的粘贴，自动还原令牌结构。
 *
 * 🔴 关键修复（v2.0.5）：解决"重复创建5条相同规则"的严重 bug。
 *   1) 步骤2：先检查是否已有草稿，避免每次运行都创建新流程版本
 *   2) 步骤3.5：删除旧规则改用 element.click()（通过 page.evaluate）替代
 *      page.mouse.click()——宜搭 UI 基于 React，mouse.click 无法触发合成事件
 *      onClick，导致删除按钮点击无效，旧规则未被删除，最终堆积成5条相同规则。
 *
 * 🔴 幂等性硬规则加强（v2.0.6）：从机制上杜绝重复规则再发生。
 *   3) 步骤3.5：删除失败必须立即停止并退出（exit code 2），禁止继续添加新规则
 *      ——原 bug 根因：删除失败只打印警告，继续添加新规则，最终堆积
 *   4) 步骤15：最终验证必须断言规则数量==1，否则报错退出（exit code 3）
 *      ——原 bug 根因：只检查"规则名是否出现"就判定成功，5 条重复也能"验证通过"
 *
 * 🔴 节点配置硬规则（v2.0.7）：流程表单业务规则在流程结束时执行。
 *   5) 步骤5.5：显式选择节点类型为"结束"（默认是"开始"，会让规则在流程发起时就执行，跳过审批）
 *      ——未找到该选项时 exit code 4 退出
 *   6) 触发方式保持默认"任务完成执行"（无需修改）
 *   🔴 v2.2.0 变更：节点类型从"审批节点"改为"结束"（用户要求，2026-07-17）
 *      ——"结束"节点表示整个流程完成后触发规则，无需步骤5.7（具体审批节点）
 *
 * 🔴 重大修正（v2.1.0）：普通表单和流程表单走**完全独立**的两条配置路径。
 *   8) 普通表单通过 `pushNormalFormRule` 函数独立处理，走「表单设计→表单设置→表单事件→添加业务关联规则」路径
 *   9) 流程表单保持原有逻辑，走「流程设计→全局设置→节点提交规则→添加规则→关联操作」路径
 *  10) 普通表单的触发类型是「单据提交/单据删除/单据编辑」（无"开始/审批节点"概念），默认「单据提交」
 *  11) 普通表单保存即生效（无需发布流程）；流程表单必须保存+发布流程两步才生效
 *  12) v2.0.8-v2.0.9 错误地把普通表单也走流程设计路径，已纠正
 *
 * 用法：
 *   node push-rule.js --json <JSON文件路径> --md <MD文件路径> [选项]
 *
 * 参数说明：
 *   --json        JSON 文件路径（必需）
 *   --md          MD 文件路径（可选，从中自动提取 appType/formUuid/processCode/ruleName/targetForm）
 *   --app         应用ID（如未从 MD 提取则需提供）
 *   --form        表单UUID（如未从 MD 提取则需提供）
 *   --process     流程Code（可选，仅流程表单需要；不提供则为普通表单模式）
 *   --name        规则名称（如未从 MD 提取则需提供）
 *   --target-form 目标表单名称（如未从 MD 提取则需提供，默认"库存信息"）
 *
 * 🔴 修复（v2.0.9）：步骤2 中 `page.evaluate` 内使用了 Playwright 专有的 `:has-text()` 伪类选择器，
 *   但 `document.querySelector` 不支持该伪类，导致 SyntaxError 退出。修复方式：移除无效的
 *   querySelector 调用，仅保留遍历按钮检查 textContent 的逻辑（该逻辑本就存在，只是被
 *   前面的崩溃代码遮挡）。此 bug 影响普通表单和流程表单（共享代码路径）。
 *
 * 🔴 选择器修正（v2.1.1）：经浏览器实际验证（2026-07-17），普通表单 pushNormalFormRule 步骤 N2/N3/N4/N6 选择器错误：
 *   13) 步骤N2 改用 li.next-menu-item.next-nav-item（宜搭顶部菜单是 next-menu，不是 next-tabs-tab）。
 *       调试发现「表单设计」「流程设计」「页面设置」「页面发布」「数据管理」都是 LI.next-menu-item.next-nav-item，
 *       默认选中的菜单项 class 含 next-selected。普通表单默认进入「流程设计」视图，必须显式点击「表单设计」切换。
 *   14) 步骤N3 删除「展开表单设置面板」操作——经浏览器验证，「表单设置」不是折叠面板而是
 *       .setting-container-content-trigger 文本标签，点击「表单设计」菜单后右侧面板默认展开，无需点击展开。
 *       此前误点击了 lc-workbench-center（中间工作区），导致后续步骤全部失败。
 *   15) 步骤N4 删除「展开表单事件折叠面板」操作——「表单事件」是 .lc-field-head 内的 span.lc-title-txt
 *       （block-field 的标题），不是 .lc-accordion-field 折叠面板。下面的「添加业务关联规则」按钮直接可见。
 *   16) 步骤N6 增加 scrollIntoView 后再点击按钮（按钮位置 y=668，可能位于视口外）。
 *   17) findBrowserPath 兜底添加 D:\宜搭AI编程\软件及skills\chrome-win64\chrome-win64\chrome.exe
 *
 * 🔴 关键修正（v2.1.2）：v2.1.1 中 N3 只校验 trigger 存在但未点击 trigger，导致「表单事件」面板内容不渲染。
 *   18) 实测发现：点击「表单设计」菜单后右侧默认显示"页面属性"标签，必须显式点击 .setting-container-content-trigger
 *       才能切换到"表单设置"标签，切换后「表单事件」「添加业务关联规则」按钮才出现在 DOM 中。
 *       v2.1.1 的"无需点击展开"判断是错误的——「表单设置」是标签切换器，不是静态文本。
 *
 * 🔴 健壮性改进（v2.1.3）：v2.1.2 仍依赖固定 1500ms 等待 + 单次 DOM 查询，失败率较高。
 *   19) 改用 page.waitForFunction 等待「表单事件」元素出现（5s 超时），替代固定等待。
 *   20) 首次未出现时尝试再次点击 trigger 两次（toggle 切回再切回 表单设置 标签）。
 *   21) 仍未出现时转储 DOM 状态到 temp-file/n4-dom-state.json 供调试（含 triggers/lcTitles/lcFieldHeads/addButtons/assocEls）。
 *   22) exit code 6 表示表单事件面板未出现。
 *
 * 🔴 重大修正（v2.1.4）：经 v9 调试脚本 dump 实际对话框 innerHTML，发现普通表单「业务关联规则」对话框结构完全不同于文档描述。
 *   23) 实际结构：4 个 input 字段（label="标题"=规则名, label="单据提交"=提交公式, label="单据删除"=删除公式, label="单据编辑"=编辑公式）+ 3 个按钮（新建集成&自动化/取消/确定）。
 *   24) 无"触发类型" radio — 触发类型通过填写哪个公式 input 隐式确定（填写"单据提交"input 即代表提交时触发）。
 *   25) 无 textarea 公式输入区 — 点击「单据提交」input 会弹出独立的公式编辑器对话框（含 CodeMirror）。
 *   26) N7 重写：找 label="标题" 的 input，清空默认值"函数计算"，填入 RULE_NAME。
 *   27) N8 重写：找 label="单据提交" 的 input 并点击，用 waitForFunction 等待 CodeMirror 元素出现（10s 超时）。
 *   28) 失败时 dump CodeMirror 状态和对话框状态到 temp-file/n8-editor-state.json。
 *   29) exit code 7=标题输入框未找到, 8=单据提交 input 未找到, 9=公式编辑器未出现。
 *
 * 🔴 关键修正（v2.1.5）：v10 调试脚本证实点击 input 后不会弹出独立对话框，而是 input 自身变成 inline CodeMirror 编辑器。
 *   30) CodeMirror 单行编辑器高度只有 29px（不是预期的对话框高度），原检查 r.height > 50 错误地判定为未出现。
 *   31) 高度阈值改为 r.height > 20，并增加首次失败后再次点击 input 的兜底重试逻辑。
 *   32) 失败时 dump 含 class 的完整 CodeMirror 状态（含 CodeMirror-focused 类标记当前聚焦的编辑器）。
 *
 * 🔴 关键修正（v2.1.6）：v2.1.5 运行发现 N10 误点规则对话框的「确定」（.next-dialog 选择器匹配 vs-advanceRule-dialog），
 *   但公式未"提交"到 React 状态，导致 N11 校验失败、对话框不关闭。
 *   33) N10 重写：不再点击「确定」（无独立公式编辑器对话框），改为点击对话框标题或「标题」input 触发 CodeMirror blur，
 *       让 React 同步 CodeMirror 值到 input 状态。
 *   34) N11 增强：点击「确定」后若对话框未关闭，捕获验证错误信息（error/invalid/warning 元素）、input 值、CodeMirror 值，
 *       保存到 temp-file/n11-validation-error.json 供调试。
 *   35) 移除原 N10 的 isFormulaEditorOpen 检查（无独立公式编辑器对话框，检查无意义）。
 *
 * 🔴 关键修正（v2.1.7）：v2.1.6 运行发现公式校验通过（无错误消息、input 有值），但对话框仍不关闭。
 *   36) 根因：inline CodeMirror 处于聚焦状态时，第一次点击「确定」只触发了 CodeMirror 的 blur/commit（移除编辑器、
 *       同步值到 input），click 事件被消耗，不会触发保存。需要第二次点击「确定」才真正保存规则。
 *   37) N11 重写为双击模式：第一次点击提交 CodeMirror，检查 CodeMirror 是否仍存在，若存在则第二次点击保存。
 *       若 CodeMirror 已不在但对话框仍打开，也再点击一次确定（兜底）。
 *
 * 🔴 关键修正（v2.1.9）：修复发布后二次验证无法重新打开全局设置面板的问题。
 *   38) 根因：发布后页面显示启用中的只读版本，直接点击「全局设置」经常无法打开编辑面板，导致规则存在但验证报
 *       「规则未在页面中找到」。修复方式：验证时先点击「创建新流程」生成新草稿（自动复制已发布版本的规则），再
 *       打开全局设置，即可在表格中看到规则。同时增强「全局设置」按钮定位（优先点击顶部工具栏按钮，避免点到面板
 *       标题），并在验证失败时以非 0 退出码停止。
 *   39) 验证表格增加读取「节点类型」和「规则类型」列，确保规则配置为「结束 + 关联操作」。
 *
 * 🔴 节点类型变更（v2.2.0）：流程表单节点类型从"审批节点"改为"结束"节点（用户要求，2026-07-17）。
 *   40) 步骤5.5：将节点类型选择从"审批节点"改为"结束"（在 #nodeType radio 组中选 label 为"结束"的选项）
 *   41) 删除步骤5.7（选择具体审批节点下拉框）——这一步仅适用于"审批节点"类型，"结束"节点无需该配置
 *   42) 验证逻辑：ruleCheck.nodeType 校验从 !== '审批节点' 改为 !== '结束'
 *   43) 业务含义变更：规则在整个流程结束后触发，而非某个审批节点同意后触发
 *
 * 🔴 关键修正（v2.2.1）：实际验证发现"结束"节点同样要求选择"节点动作"，否则保存时提示"节点动作不能为空"。
 *   44) 新增步骤5.6：在 #activityAction checkbox 组中勾选"同意"（流程正常结束对应审批通过/同意动作）
 *   45) 未找到"同意"选项时以 exit code 5 退出
 *
 * 🔴 循环创建根因修复（v2.2.2）：步骤15验证时不再创建新流程版本。
 *   旧逻辑（v2.1.9）在验证时点击「创建新流程」生成新草稿，导致：
 *   1) 每次运行都遗留一个未发布的草稿版本
 *   2) 下次运行发现草稿后又要删除旧规则→重新添加→发布→验证时又创建草稿…
 *   3) 形成无限循环，版本号不断递增（V2→V3→V4→…）
 *   修复：发布后直接在当前页面验证规则是否存在，不创建新版本。
 *   如果全局设置面板不可用，就用页面文本匹配兜底验证。
 *
 * 🔴 React 合成事件根因修复（v2.2.3）：流程表单推送时，步骤2「创建新流程」
 *   和步骤15验证时的「全局设置」按钮点击偶尔失效。**根因**：原代码使用 Playwright
 *   的 `page.click()`（原生鼠标事件）点击宜搭 React 按钮，无法触发 React 合成事件
 *   onClick，导致创建新版本或打开全局设置失败，最终验证找不到规则。**修复**：均改为
 *   `page.evaluate(() => el.click())` 调用 DOM 原生 click()；同时放宽全局设置按钮选择器
 *   并增加等待时间，确保验证阶段能正确打开面板并读取规则表格。
 *
 * 版本：v2.2.3（2026-07-27）
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PLAYWRIGHT_CORE_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'js-action-tester', 'node_modules', 'playwright-core');
const coreUtils = require('../../../../lib/core/utils');

// ============ 1. 参数解析 ============

/**
 * 🔴 通用保存按钮文本匹配（根因修复 2026-07-22）
 * 宜搭按钮文本可能是 "保存" 或 "保 存"（字符间有空格），必须兼容两种情况。
 * 原根因：脚本用 === '保存' 精确匹配，匹配不到 "保 存"，导致规则添加但未保存。
 */
function isSaveButtonText(text) {
  if (!text) return false;
  // 去除所有空格后比较，兼容 "保存" / "保 存" / "保　存"（全角空格）等
  return text.replace(/[\s\u3000]/g, '') === '保存';
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
}

// ============ 2. 从 MD 文件提取元数据 ============

function parseMdMetadata(mdPath) {
  if (!mdPath || !fs.existsSync(mdPath)) return {};
  const content = fs.readFileSync(mdPath, 'utf-8');
  const meta = {};

  const formMatch = content.match(/触发表单UUID\s*\|\s*(FORM-[A-Z0-9]+)/);
  if (formMatch) meta.formUuid = formMatch[1];

  const processMatch = content.match(/(?:流程Code|processCode)\s*\|\s*(TPROC--[A-Z0-9]+)/i);
  if (processMatch) meta.processCode = processMatch[1];

  const titleMatch = content.match(/^#\s+业务关联规则：(.+)$/m);
  if (titleMatch) meta.ruleName = titleMatch[1].trim();

  const targetMatch = content.match(/目标表单\s*\|\s*(.+?)（/);
  if (targetMatch) {
    meta.targetForm = targetMatch[1].trim();
    // 提取目标表单类型（括号中的类型，如"采购订单（流程表单）" → "流程表单"）
    const typeMatch = content.match(new RegExp(`目标表单\\s*\\|\\s*${meta.targetForm}（(.+?)）`));
    if (typeMatch) meta.targetFormType = typeMatch[1].trim();
  }

  const triggerMatch = content.match(/触发事件\s*\|\s*(单据提交|单据编辑|单据删除)/);
  if (triggerMatch) meta.triggerType = triggerMatch[1].trim();

  return meta;
}

// ============ 3. 从系统配置清单读取应用ID ============

function readAppIdFromConfig(projectDir) {
  const configPath = path.join(projectDir, '系统配置清单.md');
  if (!fs.existsSync(configPath)) return null;
  const content = fs.readFileSync(configPath, 'utf-8');
  const match = content.match(/APP[_\\]+([A-Z0-9]+)/);
  if (match) return 'APP_' + match[1].replace(/\\/g, '');
  return null;
}

// ============ 4. Playwright 工具函数 ============

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
    // 兜底：检查父目录下的「软件及skills」目录（chrome 离线安装包位置）
    const softwareDir = path.join(parentDir, '软件及skills', 'chrome-win64', 'chrome-win64', 'chrome.exe');
    candidates.push(softwareDir);
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

// ============ 4.5 全自动粘贴 CodeMirror（v3.7.0 核心修复） ============

/**
 * 校验 CodeMirror 是否已正确识别粘贴的令牌
 *
 * 🔴 关键：不能只用 value.includes('UPSERT') 判断——如果粘贴的是原始 JSON 文本
 *   （{"text":"UPSERT...）也会包含 UPSERT，造成假阳性（这是历史 v3.6.x 的验证 bug）。
 *   真正的成功标志：value 不是原始 JSON（不含 isCmData/不以 {"text" 开头），
 *   且 CodeMirror 已生成 marks（getAllMarks 数量 >= 期望令牌数）。
 *
 * @returns {Promise<{ok:boolean, value:string, marks:number, looksLikeRawJson:boolean, expected:number}>}
 */
async function verifyCmTokens(page, expected) {
  return await page.evaluate((exp) => {
    const cms = document.querySelectorAll('.CodeMirror');
    let cm = null;
    for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
    if (!cm) return { ok: false, reason: 'no-cm', value: null, marks: 0, looksLikeRawJson: false, expected: exp };
    const value = cm.getValue() || '';
    const markCount = cm.getAllMarks ? cm.getAllMarks().length : 0;
    const trimmed = value.trim();
    const looksLikeRawJson = value.includes('isCmData') || trimmed.startsWith('{"text"') || trimmed.startsWith('{ "text"');
    // 🔴 根因修复（2026-07-22）：mark 数量必须严格等于期望值
    // 原代码用 >= 导致多余 mark 被忽略，多余 mark 会覆盖逗号/括号，破坏公式结构
    const ok = !looksLikeRawJson && /UPSERT|UPDATE|INSERT|DELETE/.test(value) && markCount === exp;
    return { ok, value, marks: markCount, looksLikeRawJson, expected: exp };
  }, expected);
}

/**
 * 全自动将 {text, marks, isCmData} 粘贴到宜搭公式编辑器的 CodeMirror。
 *
 * 🔴 原理（与用户手动 Ctrl+V 完全一致）：
 *   1. 把扁平 JSON 字符串通过 execCommand('copy') 写入真实系统剪贴板
 *   2. 聚焦 CodeMirror 隐藏输入框，触发真实 Ctrl+V
 *   3. 宜搭 CodeMirror 的 paste 处理器读取剪贴板 text/plain，检测 isCmData，
 *      自动还原令牌结构（这正是手动粘贴能成功的机制）
 *
 * 兜底：若真实 Ctrl+V 未能生成令牌（聚焦异常等），改用合成 ClipboardEvent
 *   （clipboardData 携带 text/plain）直接派发到 CodeMirror 输入元素。
 *
 * @returns {Promise<{ok:boolean, value:string, marks:number, expected:number, via:string}>}
 */
async function autoPasteCmData(page, jsonData) {
  const jsonString = JSON.stringify(jsonData);
  const expected = (jsonData.marks || []).length;

  // 1) 清空编辑器
  await focusCM(page);
  await page.evaluate(() => {
    const cms = document.querySelectorAll('.CodeMirror');
    for (const c of cms) { if (c.CodeMirror) c.CodeMirror.setValue(''); }
  });
  await page.waitForTimeout(150);

  // 2) 写入真实系统剪贴板（execCommand copy 在有头浏览器中可靠）
  await page.evaluate((str) => {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }, jsonString);
  await page.waitForTimeout(150);

  // 3) 真实 Ctrl+V（与手动粘贴完全一致）
  await focusCM(page);
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(80);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(900);

  // 🔴 根因修复（2026-07-22）：清理宜搭 paste 处理器产生的多余 mark
  // 宜搭 CodeMirror 的 paste 处理器会额外标记逗号、引号等字符，导致 mark 数量超过预期
  // 这些多余的 mark 会覆盖公式中的关键字符，破坏公式结构
  await page.evaluate((exp) => {
    const cms = document.querySelectorAll('.CodeMirror');
    let cm = null;
    for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
    if (!cm) return;
    const marks = cm.getAllMarks();
    if (marks.length <= exp) return; // mark 数量正常，无需清理
    // 移除文本内容为非令牌格式的 mark（如逗号、括号、引号等）
    // 🔴 修正：真实令牌的文本边界包含零宽空格（ZWS），通过 ZWS 边界识别令牌，避免误清中文显示名
    for (const mark of marks) {
      const pos = mark.find();
      if (pos) {
        const text = cm.getRange(pos.from, pos.to);
        const isToken = text.startsWith('\u200b') && text.endsWith('\u200b');
        if (!isToken) {
          mark.clear();
        }
      }
    }
  }, expected);
  await page.waitForTimeout(200);

  let check = await verifyCmTokens(page, expected);
  if (check.ok) { check.via = 'ctrl+v'; return check; }

  // 4) 兜底：合成 ClipboardEvent（clipboardData 携带 text/plain）
  await page.evaluate((str) => {
    const cms = document.querySelectorAll('.CodeMirror');
    let cm = null;
    for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
    if (!cm) return;
    cm.focus();
    cm.setValue('');
    const dt = new DataTransfer();
    dt.setData('text/plain', str);
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    let input = null;
    try { input = cm.getInputField && cm.getInputField(); } catch (e) {}
    if (!input) input = document.querySelector('.CodeMirror textarea') || document.querySelector('.CodeMirror');
    if (input) input.dispatchEvent(ev);
  }, jsonString);
  await page.waitForTimeout(900);

  // 🔴 根因修复（2026-07-22）：清理宜搭 paste 处理器产生的多余 mark
  await page.evaluate((exp) => {
    const cms = document.querySelectorAll('.CodeMirror');
    let cm = null;
    for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
    if (!cm) return;
    const marks = cm.getAllMarks();
    if (marks.length <= exp) return;
    for (const mark of marks) {
      const pos = mark.find();
      if (pos) {
        const text = cm.getRange(pos.from, pos.to);
        const isToken = /^(FORM-[A-Z0-9]+\/)?(textField_|numberField_|selectField_|dateField_|textareaField_|associationFormField_|employeeField_|departmentSelectField_|addressField_|serialNumberField_|tableField_|attachmentField_|radioField_|checkboxField_)/.test(text);
        if (!isToken) {
          mark.clear();
        }
      }
    }
  }, expected);
  await page.waitForTimeout(200);

  check = await verifyCmTokens(page, expected);
  check.via = check.ok ? 'clipboardEvent' : 'failed';
  return check;
}


// ============ 5. 对话框状态检测 ============

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

// ============ 6. 核心：将 JSON 数据粘贴到 CodeMirror ============

/**
 * 将 {text, marks, isCmData} JSON 数据粘贴到 CodeMirror 编辑器
 *
 * 原理：CodeMirror 的粘贴事件处理器会检查剪贴板内容是否为 {text, marks, isCmData} 格式，
 * 如果是则直接还原令牌结构，无需逐个点击字段列表插入令牌。
 *
 * @param {Page} page - Playwright 页面对象
 * @param {object} cmData - {text, marks, isCmData} 数据
 * @returns {Promise<boolean>} 是否粘贴成功
 */
async function pasteFormulaToCM(page, cmData) {
  const jsonString = JSON.stringify(cmData);

  // 🔴 修正（v2.2.2）：优先使用方式3（直接操作 CodeMirror 内部状态），
  // 因为方式1（ClipboardEvent）虽然返回 true，但 marks 经常无法被正确解析，
  // 导致公式显示"无效字段"且校验失败。
  const success = await page.evaluate((jsonStr) => {
    const cms = document.querySelectorAll('.CodeMirror');
    let cm = null;
    for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
    if (!cm) return false;

    cm.focus();

    // 方式3：直接操作 CodeMirror 内部状态（优先使用）
    // 清空编辑器
    cm.setValue('');

    // 设置值
    cm.replaceSelection(jsonStr.text || '');

    // 如果有 marks，设置 marks
    if (jsonStr.marks && jsonStr.marks.length > 0) {
      for (const mark of jsonStr.marks) {
        try {
          const from = { line: mark.from.line, ch: mark.from.ch };
          const to = { line: mark.to.line, ch: mark.to.ch };
          cm.markText(from, to, {
            atomic: true,
            readOnly: false,
            attributes: { 'data-field-id': mark.value }
          });
        } catch (e) {}
      }
    }

    return cm.getValue().length > 10;
  }, JSON.parse(jsonString));

  if (success) return true;

  // 方式1：通过 evaluate 设置剪贴板 + 模拟粘贴事件（降级方案）
  const fallbackSuccess = await page.evaluate(async (jsonStr) => {
    const cms = document.querySelectorAll('.CodeMirror');
    let cm = null;
    for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
    if (!cm) return false;

    cm.focus();

    // 构造 ClipboardEvent 并触发粘贴
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', JSON.stringify(jsonStr));

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboardData
    });

    // 找到 CodeMirror 的输入元素并触发粘贴
    const cmDom = document.querySelector('.CodeMirror');
    if (cmDom) {
      const inputField = cmDom.querySelector('textarea') || cmDom;
      inputField.dispatchEvent(pasteEvent);
      await new Promise(r => setTimeout(r, 500));
      const val = cm.getValue();
      if (val && val.length > 10) return true;
    }
    return false;
  }, JSON.parse(jsonString));

  if (fallbackSuccess) return true;

  // 方式4：通过 Playwright 的 clipboard API + 键盘粘贴（兜底方案）
  await focusCM(page);
  await page.evaluate((jsonStr) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonStr);
    }
  }, jsonString);
  await page.waitForTimeout(200);

  await page.keyboard.press('Control+a');
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);

  const val = await getCMValue(page);
  return val && val.length > 10;
}

// ============ 7. 普通表单推送函数（v2.0.9 新增） ============

/**
 * 普通表单业务规则推送：走「表单设计→表单设置→表单事件→添加业务关联规则」路径
 *
 * 与流程表单的关键差异：
 * 1. URL 不含 processCode 参数
 * 2. 不点击「流程设计」Tab，直接在表单设计页找「表单设置」面板
 * 3. 在「表单事件」折叠面板中找「添加业务关联规则」按钮（class vs-list-adder）
 * 4. 弹出的对话框（class vs-advanceRule-dialog）中选择触发类型：单据提交/删除/编辑
 * 5. 无节点类型选择（不选"开始/审批节点"）
 * 6. 保存时只需点击「保存」按钮保存表单设计，无需「发布流程」
 */
async function pushNormalFormRule({
  page, browser, context, screenshotDir,
  APP_ID, FORM_UUID, RULE_NAME, TARGET_FORM,
  jsonData, baseUrl, cookieData, TRIGGER_TYPE
}) {
  console.log('\n=== 普通表单业务规则推送开始 ===\n');

  // 步骤N1: 导航到表单设计器（普通表单用 pageDesigner，不是 newDesigner）
  // 🔴 根因修复（2026-07-22）：普通表单必须用 pageDesigner（表单设计器），newDesigner 是流程设计器
  const designerUrl = `${baseUrl}/dingtalk/web/${APP_ID}/design/pageDesigner?formUuid=${FORM_UUID}`;
  console.log(`📍 步骤N1: 导航到普通表单设计器（pageDesigner）...`);
  console.log(`   URL: ${designerUrl}`);
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
  console.log('   ✅ 表单设计页已加载');
  await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step1-loaded.png') });

  // 步骤N2: 切换到「表单设计」菜单（顶部 next-menu，不是 Tab）
  // 🔴 v2.1.1 修正：宜搭设计器顶部使用 .next-menu-item.next-nav-item 作为导航菜单（不是 .next-tabs-tab）。
  //   调试发现：「表单设计」「流程设计」「页面设置」「页面发布」「数据管理」均为 LI.next-menu-item.next-nav-item，
  //   默认选中的菜单项 class 含 next-selected。普通表单默认进入「流程设计」视图，必须显式点击「表单设计」切换。
  console.log(`\n📍 步骤N2: 切换到「表单设计」菜单...`);
  const tabClicked = await page.evaluate(() => {
    // 优先：顶部 next-menu 中的菜单项
    const menuItems = document.querySelectorAll('li.next-menu-item.next-nav-item, .next-menu-item.next-nav-item');
    for (const item of menuItems) {
      const text = item.textContent?.trim() || '';
      if (text === '表单设计') {
        const r = item.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          item.click(); // 用 element.click() 触发 React 合成事件（硬规则11）
          return { ok: true, text, via: 'next-menu-item' };
        }
      }
    }
    // 兜底：旧版 Tab 选择器
    const tabs = document.querySelectorAll('.lc-tabs-tab, .next-tabs-tab, [role="tab"], .ant-tabs-tab');
    for (const tab of tabs) {
      const text = tab.textContent?.trim() || '';
      if (text === '表单设计' || text.includes('表单设计')) {
        const r = tab.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          tab.click();
          return { ok: true, text, via: 'tabs-tab' };
        }
      }
    }
    return { ok: false };
  });
  if (tabClicked.ok) {
    console.log(`   ✅ 已点击「表单设计」菜单（via: ${tabClicked.via}）`);
  } else {
    console.log('   ⚠️ 未找到「表单设计」菜单（可能已是默认视图）');
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step2-tab.png') });

  // 步骤N3: 点击「表单设置」标签切换器，展开表单设置面板内容
  // 🔴 v2.1.1 修正：经浏览器实际验证（2026-07-17），「表单设置」不是折叠面板，
  //   而是 .setting-container-content-trigger 文本标签。点击「表单设计」菜单后右侧面板默认显示"页面属性"标签，
  //   必须显式点击 .setting-container-content-trigger 才能切换到"表单设置"标签，
  //   切换后才会显示「表单事件」(lc-field-head)、「添加业务关联规则」按钮 (button.vs-list-adder)。
  //   此前的实现误把「表单设置」当作折叠面板去点击，结果点击了 lc-workbench-center（中间工作区），导致后续步骤全部失败。
  //   v2.1.2 进一步修正：仅校验 trigger 存在但未点击 trigger 是错误的——
  //     实测发现点击 trigger 前「表单事件」根本不在 DOM 中，必须显式点击 trigger 才能切换标签显示这些元素。
  console.log(`\n📍 步骤N3: 点击「表单设置」标签切换器...`);
  const settingsClicked = await page.evaluate(() => {
    // 「表单设置」标签切换器是 .setting-container-content-trigger（不含 .page-properties 类）
    const triggers = document.querySelectorAll('.setting-container-content-trigger');
    for (const trigger of triggers) {
      const text = trigger.textContent?.trim() || '';
      if (text === '表单设置') {
        const r = trigger.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          trigger.click(); // 用 element.click() 触发 React 合成事件（硬规则11）
          return { ok: true, text, rect: { x: Math.round(r.x), y: Math.round(r.y) } };
        }
      }
    }
    return { ok: false, reason: 'no-trigger' };
  });
  if (settingsClicked.ok) {
    console.log(`   ✅ 已点击「表单设置」标签切换器（位置 x=${settingsClicked.rect.x}, y=${settingsClicked.rect.y}）`);
  } else {
    console.log(`   ⚠️ 未找到「表单设置」标签切换器（${settingsClicked.reason}）`);
  }
  await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step3-settings.png') });

  // 步骤N4: 校验「表单事件」面板已可见
  // 🔴 v2.1.2 修正：「表单事件」是 .lc-field-head 内的 span.lc-title-txt（block-field 的标题），
  //   不是 .lc-accordion-field 折叠面板。下面的「添加业务关联规则」按钮直接可见。
  // 🔴 v2.1.3 改进：用 page.waitForFunction 替代固定等待，可靠性更高。
  //   若首次未出现，尝试再次点击 trigger（toggle 行为：可能当前已在「表单设置」标签，需切回再切回）。
  //   仍未出现则转储 DOM 状态到 temp-file/n4-dom-state.json 供调试。
  console.log(`\n📍 步骤N4: 等待「表单事件」面板出现...`);
  const waitForEventPanel = async () => {
    try {
      await page.waitForFunction(() => {
        const titles = document.querySelectorAll('span.lc-title-txt, .lc-field-head');
        for (const t of titles) {
          if (t.textContent?.trim() === '表单事件') {
            const r = t.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return true;
          }
        }
        return false;
      }, { timeout: 5000 });
      return true;
    } catch (e) { return false; }
  };

  let eventVisibleOk = await waitForEventPanel();

  if (!eventVisibleOk) {
    // 首次未出现，再次点击 trigger（toggle 行为兜底）
    console.log('   ⚠️ 首次未出现「表单事件」，尝试再次点击 trigger（兜底 toggle）');
    await page.evaluate(() => {
      const triggers = document.querySelectorAll('.setting-container-content-trigger');
      for (const t of triggers) {
        if (t.textContent?.trim() === '表单设置') { t.click(); return; }
      }
    });
    await page.waitForTimeout(500);
    // 再次点击（切回 表单设置）
    await page.evaluate(() => {
      const triggers = document.querySelectorAll('.setting-container-content-trigger');
      for (const t of triggers) {
        if (t.textContent?.trim() === '表单设置') { t.click(); return; }
      }
    });
    eventVisibleOk = await waitForEventPanel();
  }

  if (eventVisibleOk) {
    // 滚动到可见区域中心
    const y = await page.evaluate(() => {
      const titles = document.querySelectorAll('span.lc-title-txt');
      for (const t of titles) {
        if (t.textContent?.trim() === '表单事件') {
          t.scrollIntoView({ behavior: 'instant', block: 'center' });
          return Math.round(t.getBoundingClientRect().y);
        }
      }
      return null;
    });
    console.log(`   ✅ 「表单事件」面板已可见（y=${y}）`);
  } else {
    // 仍未出现，转储 DOM 状态到文件供调试
    console.log('   ❌ 仍未出现「表单事件」面板，转储 DOM 状态到 temp-file/n4-dom-state.json');
    const domState = await page.evaluate(() => {
      return {
        url: location.href,
        title: document.title,
        bodyTextSample: (document.body?.innerText || '').substring(0, 1500),
        triggers: Array.from(document.querySelectorAll('.setting-container-content-trigger')).map(t => ({
          text: t.textContent?.trim(),
          classList: t.className,
          rect: (() => { const r = t.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()
        })),
        lcTitles: Array.from(document.querySelectorAll('span.lc-title-txt')).map(t => ({
          text: t.textContent?.trim(),
          visible: t.getBoundingClientRect().width > 0,
          y: Math.round(t.getBoundingClientRect().y)
        })),
        lcFieldHeads: Array.from(document.querySelectorAll('.lc-field-head')).map(h => ({
          text: h.textContent?.trim().substring(0, 100),
          classList: h.className
        })),
        addButtons: Array.from(document.querySelectorAll('button.vs-list-adder, button.next-btn.next-small')).map(b => ({
          text: b.textContent?.trim(),
          visible: b.getBoundingClientRect().width > 0
        })),
        // 检查是否有任何 "advanceRule" 或 "associationRule" 相关元素
        assocEls: Array.from(document.querySelectorAll('[class*="advanceRule"], [class*="associationRule"], [class*="form-event"]')).map(e => ({
          tag: e.tagName,
          classList: e.className,
          text: e.textContent?.trim().substring(0, 100)
        }))
      };
    });
    const tempFileDir = path.join(PROJECT_ROOT, 'temp-file');
    if (!fs.existsSync(tempFileDir)) fs.mkdirSync(tempFileDir, { recursive: true });
    fs.writeFileSync(path.join(tempFileDir, 'n4-dom-state.json'), JSON.stringify(domState, null, 2), 'utf-8');
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step4-fail.png') });
    console.log(`   DOM 状态已保存：${path.join(tempFileDir, 'n4-dom-state.json')}`);
    await browser.close();
    process.exit(6); // exit code 6: 表单事件面板未出现
  }
  await page.waitForTimeout(500); // 等待 scrollIntoView 完成
  await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step4-events.png') });

  // 步骤N5: 删除已存在的同名规则（幂等性硬规则10）
  console.log(`\n📍 步骤N5: 检查并删除已存在的同名规则...`);
  const existingCount = await page.evaluate((ruleName) => {
    const text = document.body?.innerText || '';
    const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(escaped, 'g'));
    return matches ? matches.length : 0;
  }, RULE_NAME);

  if (existingCount > 0) {
    console.log(`   ⚠️ 已存在 ${existingCount} 条同名规则，开始删除...`);

    let rulesDeleted = 0;
    let maxDeleteAttempts = 20;
    while (maxDeleteAttempts-- > 0) {
      const currentCount = await page.evaluate((ruleName) => {
        const text = document.body?.innerText || '';
        const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = text.match(new RegExp(escaped, 'g'));
        return matches ? matches.length : 0;
      }, RULE_NAME);
      if (currentCount === 0) break;

      // 找到「表单事件」面板中名为 RULE_NAME 的规则行的删除按钮
      const deleteResult = await page.evaluate((ruleName) => {
        // 在表单事件面板中查找规则行
        const eventPanel = Array.from(document.querySelectorAll('.lc-field.lc-accordion-field, .next-collapse-item'))
          .find(p => (p.textContent || '').includes('表单事件'));

        // 查找包含规则名的行
        // 🔴 v3.6.2 修正：宜搭普通表单规则行的真实类名是 .vs-listitem（无连字符），历史代码写成 .vs-list-item 导致行匹配失败、删除按钮找不到（2026-07-28 实测）
        const rows = (eventPanel || document).querySelectorAll('tr, .vs-listitem, .vs-list-item, .next-list-item, [class*="rule-item"]');
        let lastMatchedRow = null;
        for (const row of rows) {
          if ((row.textContent || '').includes(ruleName)) lastMatchedRow = row;
        }
        if (!lastMatchedRow) {
          // 兜底：查找所有 div/span 包含规则名
          const all = document.querySelectorAll('div, span, li');
          for (const el of all) {
            if ((el.textContent || '').trim() === ruleName) {
              lastMatchedRow = el.closest('tr, .vs-listitem, .vs-list-item, .next-list-item, [class*="rule-item"]') || el.parentElement;
              if (lastMatchedRow) break;
            }
          }
        }
        if (!lastMatchedRow) return null;

        // 在行内查找删除按钮：优先 div.vs-action-remove（实测确认的删除按钮），兼容旧选择器
        // 🔴 注意：禁止命中 svg 元素（svg 无 .click() 方法），只选 HTMLElement
        const btns = lastMatchedRow.querySelectorAll('div.vs-action-remove, span.icon-button, [class*="action-icon"], [class*="icon-btn"], [class*="delete"], [class*="remove"]');
        for (const btn of btns) {
          if (btn.tagName.toLowerCase() === 'svg') continue;
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            btn.setAttribute('data-push-normal-delete', 'true');
            return { ok: true };
          }
        }
        return null;
      }, RULE_NAME);

      if (!deleteResult || !deleteResult.ok) {
        console.log('   ⚠️ 未找到删除按钮，停止删除');
        break;
      }

      // 使用 element.click() 触发 React 合成事件（硬规则11）
      await page.evaluate(() => {
        const el = document.querySelector('[data-push-normal-delete="true"]');
        if (el) el.click();
      });
      await page.waitForTimeout(1500);

      // 处理确认弹窗
      await page.evaluate(() => {
        const dialogSels = ['.next-dialog', '.next-overlay-wrapper', '.sf-dialog', '[class*="dialog"]', '[class*="confirm"]'];
        for (const sel of dialogSels) {
          const dlgs = document.querySelectorAll(sel);
          for (const dlg of dlgs) {
            const r = dlg.getBoundingClientRect();
            if (r.width < 200 || r.height < 80) continue;
            const btns = dlg.querySelectorAll('button, .next-btn');
            for (const b of btns) {
              const t = b.textContent?.trim() || '';
              if (['确定', '删除', '确认', '确认删除', '是'].includes(t)) {
                const br = b.getBoundingClientRect();
                if (br.width > 0 && br.height > 0) {
                  b.click();
                  return true;
                }
              }
            }
          }
        }
        return false;
      });
      await page.waitForTimeout(1500);

      // 验证是否真的删除了
      const newCount = await page.evaluate((ruleName) => {
        const text = document.body?.innerText || '';
        const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = text.match(new RegExp(escaped, 'g'));
        return matches ? matches.length : 0;
      }, RULE_NAME);

      // 🔴 幂等性硬规则：删除失败必须立即停止
      if (newCount >= currentCount) {
        console.log(`   ❌ 删除失败：规则数量未减少（删除前 ${currentCount}，删除后 ${newCount}）`);
        console.log('   ❌ 根据幂等性硬规则，停止执行并等待人工清理');
        await page.screenshot({ path: path.join(screenshotDir, 'push-normal-delete-failed.png') });
        await browser.close();
        process.exit(2);
      }

      rulesDeleted++;
      console.log(`   ✅ 已删除第 ${rulesDeleted} 条旧规则（剩余 ${newCount}）`);

      if (rulesDeleted > 20) {
        console.log('   ⚠️ 删除次数过多，停止');
        break;
      }
    }
    console.log(`   📊 共删除 ${rulesDeleted} 条旧规则`);
  } else {
    console.log(`   ✅ 未找到同名规则，直接添加新规则`);
  }

  // 步骤N6: 点击「添加业务关联规则」按钮
  // 🔴 v2.1.1 修正：按钮位置 y=668（在右侧设置面板中），可能需要 scrollIntoView 后才能点击。
  //   按钮选择器：button.vs-list-adder.next-btn.next-small.next-btn-normal，文本「添加业务关联规则」
  //   父容器：.vs-associationRule（位于「公式执行属性：associationRules」div.lc-field.lc-block-field 内）
  console.log(`\n📍 步骤N6: 点击「添加业务关联规则」按钮...`);
  const addBtnFound = await page.evaluate(() => {
    // 优先：用 vs-list-adder 类找按钮
    const candidates = document.querySelectorAll('button.vs-list-adder, button.next-btn.next-small');
    for (const btn of candidates) {
      const text = btn.textContent?.trim() || '';
      if (text === '添加业务关联规则' || text.includes('添加业务关联规则')) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // 先滚动到可见区域（按钮可能位于页面下方）
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          // 等待浏览器重排后再点击
          return { ok: true, text, needClick: true };
        }
      }
    }
    return { ok: false };
  });

  if (addBtnFound.ok) {
    // 等待 scrollIntoView 重排完成
    await page.waitForTimeout(500);
    // 实际点击（再次定位以避免位置已变化）
    const clickResult = await page.evaluate(() => {
      const candidates = document.querySelectorAll('button.vs-list-adder, button.next-btn.next-small');
      for (const btn of candidates) {
        const text = btn.textContent?.trim() || '';
        if (text === '添加业务关联规则' || text.includes('添加业务关联规则')) {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            btn.click(); // 用 element.click() 触发 React 合成事件（硬规则11）
            return { ok: true, text };
          }
        }
      }
      return { ok: false };
    });
    if (!clickResult.ok) {
      console.error('   ❌ 找到按钮但二次定位点击失败');
      await page.screenshot({ path: path.join(screenshotDir, 'push-normal-add-btn-missing.png') });
      await browser.close();
      process.exit(1);
    }
    console.log(`   ✅ 已点击「添加业务关联规则」按钮`);
  } else {
    console.error('   ❌ 未找到「添加业务关联规则」按钮');
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-add-btn-missing.png') });
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step6-dialog.png') });

  // 步骤N7: 输入规则名称到「标题」字段
  // 🔴 v2.1.4 重大发现：经浏览器实际验证（2026-07-17），普通表单「业务关联规则」对话框结构完全不同于文档描述。
  //   实际结构（dump 自 v9-dialog-state.json）：
  //   - 4 个 input 字段（无 radio、无 textarea）
  //   - label="标题" 的 input：规则名称（默认值"函数计算"，需清空后填入 RULE_NAME）
  //   - label="单据提交" 的 input：提交时触发的公式（点击会打开 CodeMirror 编辑器）
  //   - label="单据删除" 的 input：删除时触发的公式
  //   - label="单据编辑" 的 input：编辑时触发的公式
  //   - 3 个按钮：「新建集成&自动化」「取消」「确定」
  //   - 无"触发类型" radio — 触发类型通过填写哪个公式 input 隐式确定
  console.log(`\n📍 步骤N7: 输入规则名称到「标题」字段...`);
  const nameInputFilled = await page.evaluate((ruleName) => {
    const dialog = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
    if (!dialog) return { ok: false, reason: 'no-dialog' };

    // 遍历所有 .next-form-item，找 label 为「标题」的项
    const formItems = dialog.querySelectorAll('.next-form-item');
    for (const fi of formItems) {
      const labelEl = fi.querySelector('.next-form-item-label label, .next-form-item-label');
      const labelText = labelEl?.textContent?.trim() || '';
      if (labelText === '标题') {
        const input = fi.querySelector('input');
        if (!input) continue;
        input.focus();
        // 清空
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // 设置新值
        nativeSetter.call(input, ruleName);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, label: labelText, value: input.value };
      }
    }
    return { ok: false, reason: 'no-title-input' };
  }, RULE_NAME);
  console.log(`   规则名称输入: ${nameInputFilled.ok ? `✅ (${nameInputFilled.value})` : `❌ (${nameInputFilled.reason})`}`);
  if (!nameInputFilled.ok) {
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step7-fail.png') });
    await browser.close();
    process.exit(7); // exit code 7: 标题输入框未找到
  }
  await page.waitForTimeout(500);

  // 🔴 步骤N8: 根据触发类型点击对应的公式 input 打开公式编辑器
  // 普通表单的业务关联规则对话框有 3 个公式 input：
  //   label="单据提交" → 提交时触发
  //   label="单据删除" → 删除时触发
  //   label="单据编辑" → 编辑时触发
  // 触发类型通过 TRIGGER_TYPE 参数指定（默认"单据提交"）
  const triggerLabel = TRIGGER_TYPE || '单据提交';
  console.log(`\n📍 步骤N8: 点击「${triggerLabel}」input 打开公式编辑器...`);
  const formulaInputClicked = await page.evaluate((label) => {
    const dialog = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
    if (!dialog) return { ok: false, reason: 'no-dialog' };

    const formItems = dialog.querySelectorAll('.next-form-item');
    for (const fi of formItems) {
      const labelEl = fi.querySelector('.next-form-item-label label, .next-form-item-label');
      const labelText = labelEl?.textContent?.trim() || '';
      if (labelText === label) {
        const input = fi.querySelector('input');
        if (!input) continue;
        input.scrollIntoView({ behavior: 'instant', block: 'center' });
        input.click();
        return { ok: true, label: labelText };
      }
    }
    return { ok: false, reason: `no-${label}-input` };
  }, triggerLabel);
  console.log(`   点击「${triggerLabel}」input: ${formulaInputClicked.ok ? '✅' : `❌ (${formulaInputClicked.reason})`}`);
  if (!formulaInputClicked.ok) {
    await browser.close();
    process.exit(8); // exit code 8: 单据提交 input 未找到
  }

  // 等待 CodeMirror 编辑器出现
  // 🔴 v2.1.5 关键发现：点击「单据提交」input 后，input 自身会变成 inline CodeMirror 编辑器
  //   （不打开独立对话框）。CodeMirror 高度只有 29px（单行编辑器），不能用 r.height > 50 判断。
  //   CodeMirror class 含 CodeMirror-focused（当前聚焦的编辑器）。
  console.log('   等待 CodeMirror 编辑器出现...');
  let formulaEditorReady = false;
  try {
    await page.waitForFunction(() => {
      const cms = document.querySelectorAll('.CodeMirror');
      for (const cm of cms) {
        if (cm.CodeMirror) {
          const r = cm.getBoundingClientRect();
          // 高度阈值降到 20（单行 CodeMirror 可能只有 29px）
          if (r.width > 100 && r.height > 20) return true;
        }
      }
      return false;
    }, { timeout: 10000 });
    formulaEditorReady = true;
    console.log('   ✅ CodeMirror 编辑器已出现');
  } catch (e) {
    console.log('   ⚠️ 首次等待 CodeMirror 超时，尝试再次点击 input');
    // 再次点击 input（兜底）
    await page.evaluate(() => {
      const dialog = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
      if (!dialog) return;
      const formItems = dialog.querySelectorAll('.next-form-item');
      for (const fi of formItems) {
        const labelEl = fi.querySelector('.next-form-item-label label, .next-form-item-label');
        if (labelEl?.textContent?.trim() === '单据提交') {
          const input = fi.querySelector('input');
          if (input) { input.click(); return; }
          // 也尝试点击 CodeMirror 本身
          const cm = fi.querySelector('.CodeMirror');
          if (cm) { cm.click(); return; }
        }
      }
    });
    try {
      await page.waitForFunction(() => {
        const cms = document.querySelectorAll('.CodeMirror');
        for (const cm of cms) {
          if (cm.CodeMirror) {
            const r = cm.getBoundingClientRect();
            if (r.width > 100 && r.height > 20) return true;
          }
        }
        return false;
      }, { timeout: 5000 });
      formulaEditorReady = true;
      console.log('   ✅ 二次尝试后 CodeMirror 编辑器已出现');
    } catch (e2) {
      console.log('   ❌ 二次尝试后 CodeMirror 仍未出现');
    }
  }
  if (!formulaEditorReady) {
    // dump 状态供调试
    const editorState = await page.evaluate(() => {
      return {
        codeMirrors: Array.from(document.querySelectorAll('.CodeMirror')).map(cm => ({
          hasInstance: !!cm.CodeMirror,
          class: (cm.className || '').substring(0, 100),
          rect: (() => { const r = cm.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()
        })),
        visibleDialogs: Array.from(document.querySelectorAll('.next-dialog, [role="dialog"]')).filter(d => {
          const r = d.getBoundingClientRect();
          return r.width > 100;
        }).map(d => {
          const r = d.getBoundingClientRect();
          return { class: d.className, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
        })
      };
    });
    const tempFileDir = path.join(PROJECT_ROOT, 'temp-file');
    if (!fs.existsSync(tempFileDir)) fs.mkdirSync(tempFileDir, { recursive: true });
    fs.writeFileSync(path.join(tempFileDir, 'n8-editor-state.json'), JSON.stringify(editorState, null, 2), 'utf-8');
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-step8-editor-timeout.png') });
    console.log(`   DOM 状态已保存：${path.join(tempFileDir, 'n8-editor-state.json')}`);
    await browser.close();
    process.exit(9); // exit code 9: 公式编辑器未出现
  }
  await page.waitForTimeout(800); // 等 CodeMirror 完全渲染
  await focusCM(page);

  // 步骤N9: 将 JSON 数据粘贴到 CodeMirror
  console.log(`\n📍 步骤N9: 将公式 JSON 粘贴到 CodeMirror...`);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // 🔴 v3.8.0: 优先使用 autoPasteCmData（execCommand copy + Ctrl+V + ClipboardEvent 兜底）
  // 普通表单的 inline CodeMirror 与流程表单的独立编辑器使用相同的粘贴机制
  let pasteSuccess = false;
  const expectedTokens = (jsonData.marks || []).length;

  console.log('   尝试方式1: autoPasteCmData (execCommand copy + Ctrl+V)...');
  const autoPasteResult = await autoPasteCmData(page, jsonData);
  console.log(`   方式1 结果: ok=${autoPasteResult.ok}, via=${autoPasteResult.via}, marks=${autoPasteResult.marks}/${expectedTokens}`);
  if (autoPasteResult.ok) {
    pasteSuccess = true;
    console.log('   ✅ 方式1粘贴成功');
  }

  let cmVal = await getCMValue(page);
  console.log(`   CodeMirror值: "${cmVal?.substring(0, 100)}..."`);

  // 方式2: clipboard API + Ctrl+V（降级）
  if (!pasteSuccess) {
    console.log('   尝试方式2: clipboard API + Ctrl+V...');
    await page.evaluate((jsonStr) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(jsonStr);
      }
    }, JSON.stringify(jsonData));
    await page.waitForTimeout(300);
    await focusCM(page);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);

    cmVal = await getCMValue(page);
    console.log(`   方式2 结果: "${cmVal?.substring(0, 80)}..."`);
    if (cmVal && cmVal.length > 20 && /UPSERT|UPDATE|INSERT|DELETE/.test(cmVal)) {
      pasteSuccess = true;
      console.log('   ✅ 方式2粘贴成功');
    }
  }

  // 方式3: 直接操作 CodeMirror 内部状态（ClipboardEvent）
  if (!pasteSuccess) {
    console.log('   尝试方式3: 直接操作 CodeMirror...');
    pasteSuccess = await page.evaluate((cmData) => {
      const cms = document.querySelectorAll('.CodeMirror');
      let cm = null;
      for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
      if (!cm) return false;
      cm.focus();
      cm.setValue('');
      const dt = new DataTransfer();
      dt.setData('text/plain', JSON.stringify(cmData));
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: dt
      });
      const cmDom = document.querySelector('.CodeMirror');
      const inputField = cmDom?.querySelector('textarea');
      if (inputField) inputField.dispatchEvent(pasteEvent);
      return cm.getValue().length > 10;
    }, jsonData);
    await page.waitForTimeout(500);
    cmVal = await getCMValue(page);
    console.log(`   方式3 结果: "${cmVal?.substring(0, 80)}..."`);
    if (pasteSuccess && cmVal && /UPSERT|UPDATE|INSERT|DELETE/.test(cmVal)) {
      console.log('   ✅ 方式3粘贴成功');
    } else {
      pasteSuccess = false;
    }
  }

  // 方式4: setValue + markText
  if (!pasteSuccess) {
    console.log('   尝试方式4: setValue + markText...');
    pasteSuccess = await page.evaluate((cmData) => {
      const cms = document.querySelectorAll('.CodeMirror');
      let cm = null;
      for (const c of cms) { if (c.CodeMirror) { cm = c.CodeMirror; break; } }
      if (!cm) return false;
      cm.focus();
      cm.setValue('');
      const text = cmData.text || '';
      cm.replaceRange(text, { line: 0, ch: 0 });
      if (cmData.marks && cmData.marks.length > 0) {
        for (const mark of cmData.marks) {
          try {
            cm.markText(
              { line: mark.from.line, ch: mark.from.ch },
              { line: mark.to.line, ch: mark.to.ch },
              { atomic: true, readOnly: false,
                attributes: { 'data-field': mark.value } }
            );
          } catch (e) {}
        }
      }
      return cm.getValue().length > 10;
    }, jsonData);
    await page.waitForTimeout(500);
    cmVal = await getCMValue(page);
    console.log(`   方式3 结果: "${cmVal?.substring(0, 80)}..."`);
    if (pasteSuccess && cmVal && /UPSERT|UPDATE|INSERT|DELETE/.test(cmVal)) {
      console.log('   ✅ 方式3设置成功');
    } else {
      pasteSuccess = false;
    }
  }

  if (!pasteSuccess) {
    console.log('   ❌ 所有粘贴方式均失败');
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-paste-failed.png') });
  }
  console.log(`\n   ✅ 最终公式: "${cmVal}"`);

  // 步骤N10: 提交公式（触发 blur 让 React 同步 CodeMirror 值到 input）
  // 🔴 v2.1.6 关键修正：v2.1.4/v2.1.5 发现普通表单无独立的公式编辑器对话框，
  //   CodeMirror 是 inline 的。粘贴后需触发 blur 让 React 同步状态，否则点击「确定」时校验失败。
  //   方法：点击对话框标题（.next-dialog-header）或「标题」input，让 CodeMirror 失焦。
  console.log(`\n📍 步骤N10: 提交公式（触发 CodeMirror blur）...`);

  // 先验证 CodeMirror 当前值
  const cmValBeforeCommit = await getCMValue(page);
  console.log(`   提交前 CodeMirror 值: "${cmValBeforeCommit?.substring(0, 80)}..."`);

  // 方式1: 点击对话框标题（.next-dialog-header）触发 blur
  console.log('   尝试方式1: 点击对话框标题...');
  const titleClicked = await page.evaluate(() => {
    const dialog = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
    if (!dialog) return false;
    const header = dialog.querySelector('.next-dialog-header, .next-dialog-title');
    if (header) {
      header.click();
      return true;
    }
    return false;
  });

  if (titleClicked) {
    console.log('   ✅ 已点击对话框标题');
  } else {
    console.log('   ⚠️ 未找到对话框标题，尝试点击「标题」input...');
    // 方式2: 点击「标题」input 触发 CodeMirror blur
    await page.evaluate(() => {
      const dialog = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
      if (!dialog) return;
      const formItems = dialog.querySelectorAll('.next-form-item');
      for (const fi of formItems) {
        const labelEl = fi.querySelector('.next-form-item-label label, .next-form-item-label');
        if (labelEl?.textContent?.trim() === '标题') {
          const input = fi.querySelector('input');
          if (input) { input.click(); return; }
        }
      }
    });
    console.log('   ✅ 已点击「标题」input');
  }

  await page.waitForTimeout(1500); // 等 React 状态同步

  // 验证公式是否已提交（检查 CodeMirror 值是否仍在，以及 input 值是否更新）
  const commitState = await page.evaluate(() => {
    const dialog = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
    if (!dialog) return { ok: false, reason: 'no-dialog' };

    // 检查所有 input 的值
    const inputs = Array.from(dialog.querySelectorAll('input')).map((inp, idx) => ({
      idx,
      value: inp.value,
      valueLen: (inp.value || '').length,
      visible: inp.getBoundingClientRect().width > 0
    }));

    // 检查 CodeMirror 值
    const codeMirrors = Array.from(document.querySelectorAll('.CodeMirror')).map(cm => ({
      hasInstance: !!cm.CodeMirror,
      value: cm.CodeMirror ? cm.CodeMirror.getValue() : null,
      valueLen: cm.CodeMirror ? cm.CodeMirror.getValue().length : 0,
      class: (cm.className || '').includes('CodeMirror-focused') ? 'focused' : 'not-focused'
    }));

    return { inputs, codeMirrors };
  });
  console.log(`   提交后状态: inputs=${JSON.stringify(commitState.inputs?.map(i => ({idx:i.idx, len:i.valueLen})))} codeMirrors=${JSON.stringify(commitState.codeMirrors?.map(c => ({len:c.valueLen, focus:c.class})))}`);

  // 步骤N11: 点击规则对话框「确定」保存规则
  // 🔴 v2.1.6: 移除原来的 N10 点击确定逻辑（误点了规则对话框的确定），
  //   现在统一在 N11 点击确定保存规则，并捕获验证错误信息。
  // 🔴 v2.1.7: 双击模式 — 第一次点击「确定」会先提交 inline CodeMirror（移除编辑器、同步值到 input），
  //   但不会保存规则。需要第二次点击「确定」才真正保存规则。
  //   原因：inline CodeMirror 处于聚焦状态时，点击按钮先触发 blur/commit，click 事件被消耗。
  console.log(`\n📍 步骤N11: 点击规则对话框「确定」保存规则...`);

  // 辅助函数：点击对话框中的「确定」按钮
  const clickConfirmButton = async () => {
    return await page.evaluate(() => {
      const dlg = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2, .node-rule-setting-dlg');
      if (!dlg) return { ok: false, reason: 'no-dialog' };
      const buttons = dlg.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === '确定') {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && !btn.disabled) {
            btn.click();
            return { ok: true };
          }
        }
      }
      return { ok: false, reason: 'no-button' };
    });
  };

  // 辅助函数：检查 CodeMirror 是否仍存在
  const checkCodeMirrorExists = async () => {
    return await page.evaluate(() => {
      const cms = document.querySelectorAll('.CodeMirror');
      let count = 0;
      for (const cm of cms) {
        if (cm.CodeMirror) {
          const r = cm.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) count++;
        }
      }
      return count;
    });
  };

  // 辅助函数：检查对话框是否仍打开
  const checkDialogOpen = async () => {
    return await page.evaluate(() => {
      const dlg = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
      if (!dlg) return false;
      const r = dlg.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  };

  // 第一次点击「确定」（提交 CodeMirror）
  let clickResult = await clickConfirmButton();
  console.log(`   第1次点击确定: ${clickResult.ok ? '✅' : '❌ (' + clickResult.reason + ')'}`);
  await page.waitForTimeout(2000);

  // 检查 CodeMirror 是否仍存在
  let cmCount = await checkCodeMirrorExists();
  console.log(`   CodeMirror 数量: ${cmCount}`);

  // 如果 CodeMirror 仍存在，说明第一次点击被消耗（用于提交 CodeMirror）
  // 需要第二次点击「确定」来保存规则
  if (cmCount > 0) {
    console.log('   ⚠️ CodeMirror 仍存在，第一次点击被用于提交，需第二次点击保存');
    await page.waitForTimeout(500);
    clickResult = await clickConfirmButton();
    console.log(`   第2次点击确定: ${clickResult.ok ? '✅' : '❌ (' + clickResult.reason + ')'}`);
    await page.waitForTimeout(3000);
  } else {
    // CodeMirror 已不在，可能第一次点击既提交了又保存了
    // 但对话框可能仍未关闭，再等一下检查
    console.log('   ✅ CodeMirror 已提交，检查对话框状态...');
    await page.waitForTimeout(1000);
  }

  // 检查对话框是否关闭
  let dialogOpen = await checkDialogOpen();
  if (dialogOpen && cmCount === 0) {
    // CodeMirror 已提交但对话框仍打开，尝试再次点击确定
    console.log('   ⚠️ 对话框仍打开，尝试再次点击确定...');
    await clickConfirmButton();
    await page.waitForTimeout(3000);
    dialogOpen = await checkDialogOpen();
  }

  if (dialogOpen) {
    console.log('   ⚠️ 规则对话框未关闭（校验可能失败）');
    // 🔴 v2.1.6: 捕获验证错误信息（之前缺失，导致无法定位问题）
    const errInfo = await page.evaluate(() => {
      const dialog = document.querySelector('.vs-advanceRule-dialog, .next-dialog.next-dialog-v2');
      if (!dialog) return { found: false };
      // 查找错误消息元素
      const errorEls = Array.from(dialog.querySelectorAll('[class*="error"], [class*="invalid"], [class*="warning"], .next-form-item-help, .next-message, .next-toast'));
      const errors = errorEls.map(e => ({
        text: (e.textContent || '').trim().substring(0, 200),
        class: (e.className || '').substring(0, 100)
      })).filter(e => e.text);
      // 查找所有 input 值
      const inputs = Array.from(dialog.querySelectorAll('input')).map(inp => ({
        value: (inp.value || '').substring(0, 50),
        visible: inp.getBoundingClientRect().width > 0
      }));
      // 查找 CodeMirror 值
      const cms = Array.from(document.querySelectorAll('.CodeMirror')).map(cm => ({
        value: cm.CodeMirror ? cm.CodeMirror.getValue().substring(0, 50) : null,
        focused: (cm.className || '').includes('CodeMirror-focused')
      }));
      return { found: true, errors, inputs, codeMirrors: cms };
    });
    console.log(`   📋 错误消息: ${JSON.stringify(errInfo.errors || [])}`);
    console.log(`   📋 input 值: ${JSON.stringify(errInfo.inputs || [])}`);
    console.log(`   📋 CodeMirror 值: ${JSON.stringify(errInfo.codeMirrors || [])}`);
    // 保存错误状态到文件
    const tempFileDir = path.join(PROJECT_ROOT, 'temp-file');
    if (!fs.existsSync(tempFileDir)) fs.mkdirSync(tempFileDir, { recursive: true });
    fs.writeFileSync(path.join(tempFileDir, 'n11-validation-error.json'), JSON.stringify(errInfo, null, 2), 'utf-8');
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-rule-dialog-error.png') });
    // 🔴 fail-fast：规则对话框校验失败必须停止
    console.log('   ❌ 规则对话框校验失败，根据 fail-fast 原则停止执行');
    await browser.close();
    process.exit(7);
  } else {
    console.log('   ✅ 规则对话框已关闭（规则保存成功）');
  }

  // 步骤N12: 点击「保存」保存表单设计（普通表单无需发布流程）
  // 🔴 根因修复（2026-07-22）：宜搭按钮文本可能是 "保 存"（带空格），必须用 isSaveButtonText 匹配
  console.log(`\n📍 步骤N12: 点击「保存」保存表单设计...`);
  const saveBtnFound = await page.evaluate(() => {
    // 🔴 保存按钮匹配函数（内联到 evaluate 中，因为 evaluate 在浏览器上下文执行）
    const isSaveText = (t) => t && t.replace(/[\s\u3000]/g, '') === '保存';
    const all = document.querySelectorAll('button, .next-btn, [class*="btn"], [class*="button"]');
    for (const btn of all) {
      const text = btn.textContent?.trim() || '';
      const title = btn.getAttribute('title') || '';
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const className = btn.className || '';
      if (isSaveText(text) || isSaveText(title) || isSaveText(ariaLabel) || className.includes('save')) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          btn.click(); // element.click() 触发 React 合成事件
          return { ok: true, text: text || title || ariaLabel || className };
        }
      }
    }
    return { ok: false };
  });
  if (saveBtnFound.ok) {
    console.log(`   ✅ 已点击「保存」按钮 (${saveBtnFound.text || '保存'})`);
    await page.waitForTimeout(3000);
  } else {
    console.log('   ⚠️ 未找到「保存」按钮，尝试查找顶部工具栏...');
    const toolbarSaveResult = await page.evaluate(() => {
      const isSaveText = (t) => t && t.replace(/[\s\u3000]/g, '') === '保存';
      const toolbar = document.querySelector('.lc-header-toolbar, .form-toolbar, [class*="toolbar"]');
      if (toolbar) {
        const btns = toolbar.querySelectorAll('button, [role="button"]');
        for (const btn of btns) {
          const text = btn.textContent?.trim() || '';
          if (isSaveText(text)) {
            const r = btn.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              btn.click();
              return { ok: true, text: text || 'toolbar-btn' };
            }
          }
        }
      }
      return { ok: false };
    });
    if (toolbarSaveResult.ok) {
      console.log(`   ✅ 已点击顶部工具栏按钮 (${toolbarSaveResult.text})`);
      await page.waitForTimeout(3000);
    } else {
      console.log('   ⚠️ 仍未找到保存按钮，请手动保存');
      await page.screenshot({ path: path.join(screenshotDir, 'push-normal-save-missing.png') });
    }
  }

  // 步骤N13: 最终验证（检查规则是否已写入）
  console.log(`\n📍 步骤N13: 最终验证规则是否已写入...`);
  await page.waitForTimeout(2000);

  const ruleExists = await page.evaluate((ruleName) => {
    return (document.body?.innerText || '').includes(ruleName);
  }, RULE_NAME);

  // 🔴 幂等性硬规则：最终断言规则数量必须==1
  const finalRuleCount = await page.evaluate((ruleName) => {
    const text = document.body?.innerText || '';
    const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(escaped, 'g'));
    return matches ? matches.length : 0;
  }, RULE_NAME);

  console.log(`\n📊 ────────────────────────────────`);
  console.log(`📊 表单类型: 普通表单`);
  console.log(`📊 规则名称: ${RULE_NAME}`);
  console.log(`📊 规则存在: ${ruleExists ? '✅' : '❌'}`);
  console.log(`📊 规则数量: ${finalRuleCount}（必须 == 1）`);
  console.log(`📊 当前URL: ${page.url()}`);
  console.log(`📊 ────────────────────────────────`);

  if (!ruleExists) {
    console.log('\n❌ 验证失败：规则未在页面中找到');
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-rule-missing.png') });
  } else if (finalRuleCount > 1) {
    console.log(`\n❌ 检测到 ${finalRuleCount} 条重复规则`);
    console.log('❌ 根据幂等性硬规则，禁止标记为"已配置"');
    await page.screenshot({ path: path.join(screenshotDir, 'push-normal-duplicate-rules.png') });
    await browser.close();
    process.exit(3);
  } else {
    console.log(`\n✅ 业务关联规则"${RULE_NAME}"已成功配置到普通表单`);
    console.log(`✅ 幂等性校验通过：规则数量 = 1`);
    console.log(`✅ 普通表单保存即生效，无需发布流程`);
  }

  await page.screenshot({ path: path.join(screenshotDir, 'push-normal-final.png') });
  console.log(`\n📄 最终截图已保存: .playwright-cli/push-normal-final.png`);

  console.log('\n✅ 浏览器保持打开 10 秒...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('\n=== 普通表单业务规则推送完成 ===');
}

// ============ 8. 主函数 ============

async function main() {
  const opts = parseArgs();

  // --- 参数校验与元数据提取 ---
  const jsonPath = opts.json;
  if (!jsonPath) {
    console.error('❌ 缺少必需参数 --json <JSON文件路径>');
    process.exit(1);
  }

  const jsonAbsPath = path.resolve(jsonPath);
  if (!fs.existsSync(jsonAbsPath)) {
    console.error(`❌ JSON 文件不存在: ${jsonAbsPath}`);
    process.exit(1);
  }

  // 读取 JSON 文件
  const jsonData = JSON.parse(fs.readFileSync(jsonAbsPath, 'utf-8'));
  if (!jsonData.text || !jsonData.marks) {
    console.error('❌ JSON 文件格式错误：缺少 text 或 marks 字段');
    process.exit(1);
  }

  // 从 MD 文件提取元数据
  const mdPath = opts.md || jsonAbsPath.replace(/\.json$/, '.md');
  const mdMeta = parseMdMetadata(mdPath);

  // 合并参数
  const RULE_NAME = opts.name || mdMeta.ruleName || path.basename(jsonPath, '.json');
  const FORM_UUID = opts.form || mdMeta.formUuid;
  const PROCESS_CODE = opts.process || mdMeta.processCode;
  const TARGET_FORM = opts['target-form'] || mdMeta.targetForm || '库存信息';

  // 应用ID
  let APP_ID = opts.app;
  if (!APP_ID) {
    APP_ID = readAppIdFromConfig(PROJECT_ROOT);
    if (!APP_ID) {
      let dir = path.dirname(jsonAbsPath);
      for (let i = 0; i < 5; i++) {
        APP_ID = readAppIdFromConfig(dir);
        if (APP_ID) break;
        dir = path.dirname(dir);
      }
    }
  }

  if (!APP_ID) { console.error('❌ 无法确定应用ID，请通过 --app 参数指定'); process.exit(1); }
  if (!FORM_UUID) { console.error('❌ 无法确定表单UUID，请通过 --form 参数指定'); process.exit(1); }

  // 🔴 安全检测：目标表单不能是流程表单（宜搭平台限制）
  if (mdMeta.targetFormType === '流程表单') {
    console.error(`\n❌ 宜搭平台限制：业务关联规则的目标表单「${mdMeta.targetForm}」是流程表单，无法使用业务关联规则。`);
    console.error('   请使用集成自动化（integration）代替。');
    process.exit(10);
  }

  // 🔴 普通表单支持（v2.0.9 修正）：processCode 可选，不提供则为普通表单模式
  // 普通表单走「表单设计→表单设置→表单事件→添加业务关联规则」路径，与流程表单完全不同
  const IS_NORMAL_FORM = !PROCESS_CODE;
  if (IS_NORMAL_FORM) {
    console.log('  ℹ️ 未提供流程Code，判定为普通表单模式');
    console.log('  ℹ️ 普通表单走「表单设计→表单设置→表单事件→添加业务关联规则」路径');
    console.log(`  ℹ️ 触发类型：${mdMeta.triggerType || '单据提交（默认）'}`);
    console.log('  ℹ️ 保存即生效，无需发布流程');
  }

  // --- 打印参数 ---
  console.log('=== 推送业务关联规则到宜搭 ===\n');
  console.log(`  JSON 文件: ${jsonAbsPath}`);
  console.log(`  应用ID: ${APP_ID}`);
  console.log(`  表单UUID: ${FORM_UUID}`);
  console.log(`  表单类型: ${IS_NORMAL_FORM ? '普通表单（无 processCode）' : '流程表单'}`);
  if (!IS_NORMAL_FORM) console.log(`  流程Code: ${PROCESS_CODE}`);
  console.log(`  规则名称: ${RULE_NAME}`);
  console.log(`  目标表单: ${TARGET_FORM}`);
  console.log(`  公式文本: ${jsonData.text.substring(0, 80)}...`);
  console.log(`  令牌数量: ${jsonData.marks.length}\n`);

  // --- Playwright 自动化 ---
  const { loadCookieData, resolveBaseUrl } = coreUtils;
  const cookieData = loadCookieData(PROJECT_ROOT);
  if (!cookieData) { console.error('❌ 未找到登录态，请先执行登录'); process.exit(1); }
  const baseUrl = resolveBaseUrl(cookieData);
  console.log(`✅ 登录态就绪 (${baseUrl})`);

  const pwCorePath = resolvePlaywrightCore();
  const { chromium } = require(pwCorePath);
  const executablePath = findBrowserPath();
  const launchOptions = { headless: false };
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write']
  });

  const domain = new URL(baseUrl).hostname;
  const browserCookies = (cookieData.cookies || []).map(c => ({
    name: c.name, value: c.value, domain: c.domain || domain, path: c.path || '/',
    expires: c.expires || -1, httpOnly: c.httpOnly || false, secure: c.secure || false, sameSite: c.sameSite || 'Lax'
  }));
  await context.addCookies(browserCookies);

  const page = await context.newPage();
  const screenshotDir = path.join(PROJECT_ROOT, '.playwright-cli');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // 🔴 普通表单分支（v2.0.9）：完全独立的处理路径
  // 走「表单设计→表单设置→表单事件→添加业务关联规则」，不走流程设计
  if (IS_NORMAL_FORM) {
    await pushNormalFormRule({
      page, browser, context, screenshotDir,
      APP_ID, FORM_UUID, RULE_NAME, TARGET_FORM,
      jsonData, baseUrl, cookieData, TRIGGER_TYPE: mdMeta.triggerType
    });
    return; // 普通表单流程结束，直接返回（避免执行流程表单代码）
  }

  // 步骤1: 导航到设计器
  // 🔴 根因修复（2026-07-22）：普通表单用 pageDesigner（表单设计器），流程表单用 newDesigner（流程设计器）
  const designerUrl = IS_NORMAL_FORM
    ? `${baseUrl}/dingtalk/web/${APP_ID}/design/pageDesigner?formUuid=${FORM_UUID}`
    : `${baseUrl}/dingtalk/web/${APP_ID}/design/newDesigner?processCode=${PROCESS_CODE}&formUuid=${FORM_UUID}`;
  console.log(`\n📍 步骤1: 导航到${IS_NORMAL_FORM ? '普通' : '流程'}表单设计器...`);
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
  console.log('   ✅ 页面已加载');

  // 步骤2: 创建新流程版本（仅在没有草稿时才创建）
  console.log(`\n📍 步骤2: 检查是否需要创建新流程版本...`);
  const hasDraft = await page.evaluate(() => {
    // 🔴 修复：不能在 document.querySelector 中使用 Playwright 的 :has-text() 伪类
    // 改为遍历所有按钮检查 textContent（与下方实际检测逻辑一致）
    const allBtns = document.querySelectorAll('button, span[role="button"]');
    for (const b of allBtns) {
      if (b.textContent?.trim() === '创建新流程') {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? false : true; // false=需要创建, true=已有草稿
      }
    }
    return true; // 找不到按钮，假设已有草稿
  });
  if (!hasDraft) {
    try {
      // 🔴 修复：使用 element.click() 触发 React 合成事件
      const clicked = await page.evaluate(() => {
        const allBtns = document.querySelectorAll('button, span[role="button"]');
        for (const b of allBtns) {
          if (b.textContent?.trim() === '创建新流程') {
            b.click();
            return true;
          }
        }
        return false;
      });
      if (!clicked) {
        console.log('   ⚠️ 未找到"创建新流程"按钮，可能已有草稿');
      } else {
        await page.waitForTimeout(8000);
        console.log('   ✅ 已创建新版本');
      }
    } catch (e) {
      console.log('   ⚠️ 创建失败，可能已有草稿');
    }
  } else {
    console.log('   ✅ 已有草稿，无需创建新版本');
  }

  // 步骤3: 点击全局设置
  console.log(`\n📍 步骤3: 点击全局设置...`);
  // 🔴 修复：使用 element.click() 触发 React 合成事件
  await page.evaluate(() => {
    const allBtns = document.querySelectorAll('button, span[role="button"]');
    for (const b of allBtns) {
      if (b.textContent?.trim() === '全局设置') {
        b.click();
        return;
      }
    }
  });
  await page.waitForTimeout(3000);
  console.log('   ✅');

  // 步骤3.5: 检查是否已有同名规则，如有则删除后重新添加
  // 🔴 关键修复：使用 element.click() 而非 mouse.click() 来触发 React 合成事件
  // 删除按钮是每行最右边的 span.icon-button（内含 img.sf-table-action-icon）
  const skipAddRule = await page.evaluate((ruleName) => {
    const allText = document.body?.innerText || '';
    return allText.includes(ruleName);
  }, RULE_NAME);

  if (skipAddRule) {
    console.log(`   ⚠️ 草稿中已存在规则"${RULE_NAME}"，将先删除后重新添加`);

    // 删除所有同名规则（从最后一行开始往前删）
    let rulesDeleted = 0;
    let maxDeleteAttempts = 20;
    while (maxDeleteAttempts-- > 0) {
      // 检查当前规则数量
      const currentCount = await page.evaluate((ruleName) => {
        const matches = (document.body?.innerText || '').match(new RegExp(ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
        return matches ? matches.length : 0;
      }, RULE_NAME);
      if (currentCount === 0) break;

      // 为最后一行的按钮打标记
      const markedBtn = await page.evaluate((ruleName) => {
        const rows = document.querySelectorAll('tr');
        let lastMatchedRow = null;
        for (const row of rows) {
          if ((row.textContent || '').includes(ruleName)) lastMatchedRow = row;
        }
        if (!lastMatchedRow) return null;

        const tds = lastMatchedRow.querySelectorAll('td');
        let actionCell = tds.length > 0 ? tds[tds.length - 1] : lastMatchedRow;
        const btns = actionCell.querySelectorAll('span.icon-button, [class*="action-icon"], [class*="icon-btn"]');
        const sorted = Array.from(btns).sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (ra.left + ra.width / 2) - (rb.left + rb.width / 2);
        });
        // 取最右边的按钮作为删除按钮
        if (sorted.length > 0) {
          const delBtn = sorted[sorted.length - 1];
          const r = delBtn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            delBtn.setAttribute('data-push-rule-delete', 'true');
            return { ok: true };
          }
        }
        return null;
      }, RULE_NAME);

      if (!markedBtn || !markedBtn.ok) {
        console.log('   ⚠️ 未找到删除按钮，停止删除');
        break;
      }

      // 使用 element.click() 触发 React 合成事件（mouse.click 无效）
      await page.evaluate(() => {
        const el = document.querySelector('[data-push-rule-delete="true"]');
        if (el) el.click();
      });
      await page.waitForTimeout(1500);

      // 处理确认弹窗（使用 element.click() 而非 mouse.click）
      const confirmClicked = await page.evaluate(() => {
        const dialogSels = ['.next-dialog', '.next-overlay-wrapper', '.sf-dialog', '[class*="dialog"]', '[class*="confirm"]'];
        for (const sel of dialogSels) {
          const dlgs = document.querySelectorAll(sel);
          for (const dlg of dlgs) {
            const r = dlg.getBoundingClientRect();
            if (r.width < 200 || r.height < 80) continue;
            const btns = dlg.querySelectorAll('button, .next-btn');
            for (const b of btns) {
              const t = b.textContent?.trim() || '';
              if (['确定', '删除', '确认', '确认删除', '是'].includes(t)) {
                const br = b.getBoundingClientRect();
                if (br.width > 0 && br.height > 0) {
                  b.click();
                  return true;
                }
              }
            }
          }
        }
        return false;
      });
      await page.waitForTimeout(1500);

      // 验证是否真的删除了
      const newCount = await page.evaluate((ruleName) => {
        const matches = (document.body?.innerText || '').match(new RegExp(ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
        return matches ? matches.length : 0;
      }, RULE_NAME);

      // 🔴 幂等性硬规则：删除失败必须立即停止，禁止继续添加新规则
      // 原 bug 根因：mouse.click 对 React 无效，规则数量没减少，但脚本只打印警告继续执行，导致堆积成 5 条
      if (newCount >= currentCount) {
        console.log(`   ❌ 删除失败：规则数量未减少（删除前 ${currentCount}，删除后 ${newCount}）`);
        console.log('   ❌ 根据幂等性硬规则，停止执行并等待人工清理');
        console.log('   ❌ 禁止继续添加新规则，否则会产生重复');
        await page.screenshot({ path: path.join(screenshotDir, 'push-delete-failed.png') });
        await browser.close();
        process.exit(2);
      }

      if (newCount > 0) {
        // 还有剩余，继续删
        rulesDeleted++;
        console.log(`   ✅ 已删除第 ${rulesDeleted} 条旧规则（剩余 ${newCount}）`);
      } else {
        rulesDeleted++;
        console.log(`   ✅ 已删除第 ${rulesDeleted} 条旧规则（剩余 0）`);
        break;
      }

      // 安全检查：如果删除次数超过初始规则数+5，说明有死循环
      if (rulesDeleted > 20) {
        console.log('   ⚠️ 删除次数过多，停止');
        break;
      }
    }
    console.log(`   📊 共删除 ${rulesDeleted} 条旧规则`);
  } else {
    console.log(`   草稿中未找到规则"${RULE_NAME}"，将继续添加`);
  }

    // 步骤4: 点击添加规则
    console.log(`\n📍 步骤4: 点击添加规则...`);
    const addRuleFound = await page.evaluate(() => {
      const els = document.querySelectorAll('span, div, button, a');
      for (const el of els) {
        if (el.textContent?.trim() === '添加规则') {
          const r = el.getBoundingClientRect();
          if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      return null;
    });
    if (!addRuleFound) { console.error('   ❌ 未找到添加规则按钮'); await browser.close(); process.exit(1); }
    await page.mouse.click(addRuleFound.x, addRuleFound.y);
    await page.waitForTimeout(3000);
    console.log('   ✅');

    // 步骤5: 填写规则名称
    console.log(`\n📍 步骤5: 填写规则名称: ${RULE_NAME}`);
    const nameInput = await page.$('.next-input.i18nInput input');
    if (nameInput) { await nameInput.click(); await nameInput.fill(RULE_NAME); }
    await page.waitForTimeout(500);
    console.log('   ✅');

    // 步骤5.5: 🔴 选择节点类型为"结束"（默认是"开始"，必须显式切换）
    // 业务含义：流程走到结束节点时，业务规则才执行（整个流程完成后触发）
    // 🔴 v2.2.0 变更：从"审批节点"改为"结束"节点（用户要求，2026-07-17）
    // 🔴 遵循硬规则11：React 合成事件必须用 element.click() 触发，禁止 mouse.click
    // 🔴 普通表单（v2.0.8）：跳过此步骤，保持默认"开始"节点类型
    //    普通表单无审批流程，"开始"节点表示表单提交时即触发规则，符合业务场景
    // 🔴 "结束"节点无需步骤5.6（同意动作）和步骤5.7（具体审批节点下拉框），
    //    这两步仅适用于"审批节点"类型
    if (IS_NORMAL_FORM) {
      console.log(`\n📍 步骤5.5: 普通表单模式，跳过节点类型选择（保持默认"开始"）`);
    } else {
      console.log(`\n📍 步骤5.5: 选择节点类型为"结束"...`);
      const nodeTypeResult = await page.evaluate(() => {
        const labels = document.querySelectorAll('#nodeType .next-radio-wrapper');
        for (const label of labels) {
          const labelText = label.querySelector('.next-radio-label')?.textContent?.trim();
          if (labelText === '结束') {
            const isChecked = label.classList.contains('checked') ||
                              !!label.querySelector('.next-radio.checked');
            if (isChecked) return { ok: true, alreadySelected: true };
            // 用 element.click() 触发 React 合成事件（硬规则11）
            label.click();
            return { ok: true, alreadySelected: false };
          }
        }
        return { ok: false };
      });
      if (!nodeTypeResult.ok) {
        console.error('   ❌ 未找到"结束"选项，停止推送');
        await page.screenshot({ path: path.join(screenshotDir, 'push-node-type-missing.png') });
        await browser.close();
        process.exit(4);
      }
      console.log(`   ${nodeTypeResult.alreadySelected ? '已默认选中结束 ✅' : '✅ 已切换到结束'}`);
      await page.waitForTimeout(500);

      // 步骤5.6: 🔴 选择节点动作（结束节点也必填）
      // 实际验证（2026-07-17）：结束节点同样要求选择"节点动作"，默认三个选项（同意/拒绝/撤销/终止）全未勾选
      // 业务含义：流程正常结束（审批通过）对应"同意"动作，规则在流程通过后触发
      console.log(`\n📍 步骤5.6: 选择节点动作为"同意"...`);
      const nodeActionResult = await page.evaluate(() => {
        const wrappers = document.querySelectorAll('#activityAction .next-checkbox-wrapper');
        for (const wrapper of wrappers) {
          const labelText = wrapper.querySelector('.next-checkbox-label')?.textContent?.trim();
          if (labelText === '同意') {
            const isChecked = wrapper.classList.contains('checked') ||
                              !!wrapper.querySelector('.next-checkbox.checked');
            if (isChecked) return { ok: true, alreadySelected: true };
            wrapper.click();
            return { ok: true, alreadySelected: false };
          }
        }
        return { ok: false };
      });
      if (!nodeActionResult.ok) {
        console.error('   ❌ 未找到"同意"节点动作，停止推送');
        await page.screenshot({ path: path.join(screenshotDir, 'push-node-action-missing.png') });
        await browser.close();
        process.exit(5);
      }
      console.log(`   ${nodeActionResult.alreadySelected ? '已默认选中同意 ✅' : '✅ 已选中同意'}`);
      await page.waitForTimeout(500);
    }

    // 步骤6: 打开公式编辑器
    console.log(`\n📍 步骤6: 打开公式编辑器...`);
    const formulaTextarea = await page.$('.node-rule-setting-formulaArea textarea');
    if (formulaTextarea) { await formulaTextarea.click(); }
    await page.waitForTimeout(2000);
    await focusCM(page);
    console.log('   ✅');

    // 步骤7: 🔴 核心步骤 — 将公式 JSON 全自动粘贴到 CodeMirror（v3.7.0: 恢复全自动）
    // 🔴 根因修复：v3.6.2 的"半自动模式"依赖用户手动 Ctrl+V，彻底破坏了自动化。
    //   实测证明：只要 JSON 正确（无花括号、marks 位置准确），真实 Ctrl+V 与手动粘贴完全一致，
    //   宜搭 CodeMirror 的 paste 处理器会自动还原令牌。autoPasteCmData 复现了这一机制。
    console.log(`\n📍 步骤7: 全自动粘贴公式 JSON 到 CodeMirror...`);
    console.log(`   JSON 数据: ${JSON.stringify(jsonData).substring(0, 100)}...`);

    const pasteResult = await autoPasteCmData(page, jsonData);
    let cmVal = pasteResult.value;
    console.log(`   粘贴方式: ${pasteResult.via} | 令牌数: ${pasteResult.marks}/${pasteResult.expected}`);
    console.log(`   粘贴后公式: "${cmVal?.substring(0, 80)}..."`);
    const pasteSuccess = pasteResult.ok;
    if (!pasteSuccess) {
      console.log(`   ❌ 粘贴未成功（令牌未正确还原${pasteResult.looksLikeRawJson ? '，检测到粘贴的是原始 JSON 文本' : ''}）`);
      await page.screenshot({ path: path.join(screenshotDir, 'push-paste-failed.png') });
    } else {
      console.log(`   ✅ 粘贴成功，令牌已还原`);
    }

    // 步骤8: 点击公式编辑器"确定"
    console.log(`\n📍 步骤8: 点击公式编辑器"确定"...`);
    const formulaOk = await page.evaluate(() => {
      const dlg = document.querySelector('.sf-formula-edit-dialog, .node-rule-formulaEdit-dlg');
      if (!dlg) return null;
      const buttons = dlg.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === '确定') {
          const r = btn.getBoundingClientRect();
          if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
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
          return dlg ? dlg.textContent?.substring(0, 500) || '' : '';
        });
        console.log(`   错误信息: ${errText.substring(0, 200)}`);
        await page.screenshot({ path: path.join(screenshotDir, 'push-formula-error.png') });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    }

    // 步骤9: 验证 TEXTAREA 值
    const taValue = await page.evaluate(() => {
      const ta = document.querySelector('.node-rule-setting-formulaArea textarea');
      return ta ? ta.value?.substring(0, 100) : null;
    });
    console.log(`\n   TEXTAREA 值: "${taValue}..."`);

    // 步骤10: 点击规则对话框"确定"
    // 🔴 修正：使用 element.click() 触发 React 合成事件（硬规则11），mouse.click 可能导致点击无效
    console.log(`\n📍 步骤10: 点击规则对话框"确定"...`);
    const ruleOkClicked = await page.evaluate(() => {
      const dlg = document.querySelector('.node-rule-setting-dlg');
      if (!dlg) return { ok: false, reason: 'no-dialog' };
      const buttons = dlg.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === '确定') {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && !btn.disabled) {
            btn.click();
            return { ok: true };
          }
        }
      }
      return { ok: false, reason: 'no-button' };
    });

    if (ruleOkClicked.ok) {
      await page.waitForTimeout(3000);
      const ruleDialogOpen = await isRuleDialogOpen(page);
      console.log(`   规则对话框关闭: ${!ruleDialogOpen ? '✅' : '❌ 仍然开着'}`);
      if (ruleDialogOpen) {
        const errText = await page.evaluate(() => {
          const dlg = document.querySelector('.node-rule-setting-dlg');
          if (!dlg) return '';
          const err = dlg.querySelector('.next-form-item-error, .next-message-error, .sf-error, [class*="error"], [class*="Error"]');
          return err ? err.textContent?.trim().substring(0, 300) || '' : dlg.textContent?.trim().substring(0, 500);
        });
        console.log(`   规则对话框未关闭，捕获内容: ${errText}`);
        await page.screenshot({ path: path.join(screenshotDir, 'push-rule-dialog-error.png') });
      }
    } else {
      console.log(`   ❌ 无法点击规则对话框确定: ${ruleOkClicked.reason}`);
    }

    // 步骤11: 检查规则是否在表格中
    const ruleInTable = await page.evaluate((ruleName) => {
      const text = document.body?.innerText || '';
      return text.includes(ruleName);
    }, RULE_NAME);
    console.log(`   规则在表格中: ${ruleInTable ? '✅' : '❌'}`);

  // 步骤12: 保存全局设置（点击面板底部"保存"）...
  // 🔴 根因修复（2026-07-22）：宜搭按钮文本可能是 "保 存"（带空格），必须用 isSaveText 匹配
  console.log(`\n📍 步骤12: 保存全局设置（点击面板底部"保存"）...`);
  const footerSaveBtn = await page.evaluate(() => {
    const isSaveText = (t) => t && t.replace(/[\s\u3000]/g, '') === '保存';
    const footer = document.querySelector('.simple-flow-settings-footer');
    if (!footer) return null;
    const buttons = footer.querySelectorAll('button');
    for (const btn of buttons) {
      if (isSaveText(btn.textContent?.trim())) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });

  if (footerSaveBtn) {
    await page.mouse.click(footerSaveBtn.x, footerSaveBtn.y);
    await page.waitForTimeout(3000);
    console.log('   ✅ 已点击保存');
  } else {
    console.log('   ⚠️ 未找到面板底部"保存"按钮，尝试强制点击...');
    await page.evaluate(() => {
      const isSaveText = (t) => t && t.replace(/[\s\u3000]/g, '') === '保存';
      const footer = document.querySelector('.simple-flow-settings-footer');
      if (!footer) return;
      const buttons = footer.querySelectorAll('button');
      for (const btn of buttons) {
        if (isSaveText(btn.textContent?.trim())) { btn.click(); return; }
      }
    });
    await page.waitForTimeout(3000);
  }

  // 步骤13: 保存流程设计（点击顶部"保存"）
  // 🔴 根因修复（2026-07-22）：宜搭按钮文本可能是 "保 存"（带空格），必须用 isSaveText 匹配
  console.log(`\n📍 步骤13: 保存流程设计（点击顶部"保存"）...`);
  await page.waitForTimeout(1000);
  const topSaveBtn = await page.evaluate(() => {
    const isSaveText = (t) => t && t.replace(/[\s\u3000]/g, '') === '保存';
    const buttons = document.querySelectorAll('button.simple-flow-canvas-save-button');
    for (const btn of buttons) {
      if (isSaveText(btn.textContent?.trim())) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });

  if (topSaveBtn) {
    await page.mouse.click(topSaveBtn.x, topSaveBtn.y);
    await page.waitForTimeout(3000);
    console.log('   ✅ 已保存流程');
  } else {
    console.log('   ⚠️ 未找到顶部"保存"按钮');
  }

  // 步骤14: 发布流程
  console.log(`\n📍 步骤14: 发布流程...`);
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
    await page.mouse.click(publishBtn.x, publishBtn.y);
    console.log('   已点击发布，等待确认弹窗...');

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
        console.log(`   找到确认按钮 (尝试 ${attempt + 1})`);
        await page.mouse.click(confirmBtn.x, confirmBtn.y);
        await page.waitForTimeout(5000);
        console.log('   ✅ 已确认发布');
        published = true;
        break;
      }
      console.log(`   尝试 ${attempt + 1}/5: 未找到确认弹窗，继续等待...`);
    }
    if (!published) {
      console.log('   ⚠️ 未找到发布确认弹窗，可能已直接发布或需要手动确认');
      await page.screenshot({ path: path.join(screenshotDir, 'push-publish-no-confirm.png') });
    }
  } else {
    console.log('   ⚠️ 未找到"发布流程"按钮');
    await page.screenshot({ path: path.join(screenshotDir, 'push-publish-no-button.png') });
  }

  // 步骤15: 最终验证（发布后页面会刷新/收起面板，需重新打开全局设置确认规则）
  console.log(`\n📍 步骤15: 最终验证...`);
  await page.waitForTimeout(3000);

  // 先读取页面上的流程版本信息
  const pageText = await page.evaluate(() => document.body?.innerText || '');
  const isEnabled = pageText.includes('启用中');
  const versionMatch = pageText.match(/流程版本V(\d+)/);
  const versionStr = versionMatch ? `V${versionMatch[1]}` : '?';

  if (!isEnabled) {
    console.log(`\n⚠️ 流程未启用，可能发布失败`);
  }

  // 🔴 v2.2.2 修正（2026-07-25）：验证时不再创建新流程版本！
  //   旧逻辑（v2.1.9）在验证时点击「创建新流程」生成新草稿，导致：
  //   1) 每次运行都遗留一个未发布的草稿版本
  //   2) 下次运行发现草稿后又要删除旧规则→重新添加→发布→验证时又创建草稿…
  //   3) 形成无限循环，版本号不断递增（V2→V3→V4→…）
  //   正确做法：点击「全局设置」后会弹出对话框，有「创建新流程」和「继续查看」两个按钮，
  //   验证时点「继续查看」即可直接查看已发布版本中的规则，不需要创建新版本。
  console.log('   验证已发布规则（点「继续查看」查看，不创建新版本）...');

  // 先关闭可能存在的发布成功/确认弹窗（避免 backdrop 拦截点击）
  await page.evaluate(() => {
    const dialogSels = ['.next-dialog', '.next-overlay-wrapper', '.sf-dialog', '[class*="dialog"]', '[class*="confirm"]'];
    for (const sel of dialogSels) {
      const dlgs = document.querySelectorAll(sel);
      for (const dlg of dlgs) {
        const r = dlg.getBoundingClientRect();
        if (r.width < 200 || r.height < 80) continue;
        const btns = dlg.querySelectorAll('button, .next-btn');
        for (const b of btns) {
          const t = b.textContent?.trim() || '';
          if (['确定', '关闭', '知道了', '好的'].includes(t)) {
            const br = b.getBoundingClientRect();
            if (br.width > 0 && br.height > 0) { b.click(); return; }
          }
        }
      }
    }
  });
  await page.waitForTimeout(2000);

  // 点击「全局设置」
  let ruleCheck = { count: 0, nodeType: null, ruleType: null };
  // 🔴 修复：使用更通用的选择器查找全局设置按钮，并触发 React 合成事件
  const globalSettingsClicked = await page.evaluate(() => {
    const allBtns = document.querySelectorAll('button, span[role="button"], .next-btn, [class*="global-setting"], [class*="globalSetting"]');
    for (const btn of allBtns) {
      const t = btn.textContent?.trim() || '';
      // 兼容 "全局设置" 和带图标的情况（textContent 可能只包含文本）
      if (t === '全局设置' || t.includes('全局设置')) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && !btn.disabled) {
          btn.click();
          return { ok: true, source: 'common' };
        }
      }
    }
    return { ok: false };
  });

  if (globalSettingsClicked.ok) {
    console.log(`   ✅ 已点击「全局设置」(${globalSettingsClicked.source})`);
    await page.waitForTimeout(3000);

    // 🔴 关键：点击「全局设置」后会弹出对话框，有「创建新流程」和「继续查看」两个按钮
    // 验证时点「继续查看」即可查看已发布版本的规则，不创建新版本
    const viewOnlyClicked = await page.evaluate(() => {
      const allBtns = document.querySelectorAll('button, span[role="button"], .next-btn');
      for (const btn of allBtns) {
        const t = btn.textContent?.trim() || '';
        if (t === '继续查看') {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            btn.click();
            return { ok: true };
          }
        }
      }
      return { ok: false };
    });

    if (viewOnlyClicked.ok) {
      console.log('   ✅ 已点击「继续查看」（查看已发布版本，不创建新草稿）');
    } else {
      console.log('   ⚠️ 未找到「继续查看」按钮（可能流程未启用，无需弹窗）');
    }
    await page.waitForTimeout(4000);

    // 等待全局设置面板渲染（10s 超时，不阻塞）
    await page.waitForFunction(() => {
      const panel = document.querySelector('.sf-global-setting');
      if (!panel) return false;
      const r = panel.getBoundingClientRect();
      return r.width > 300 && r.height > 300;
    }, { timeout: 10000 }).catch(() => {
      console.log('   ⚠️ 等待全局设置面板超时，将使用页面文本兜底验证');
    });

    // 在节点提交规则表格中精确查找规则
    ruleCheck = await page.evaluate((ruleName) => {
      const rows = document.querySelectorAll('.simple-flow-global-setting-node-submit-rule-table .next-table-tbody tr, .next-table-tbody tr');
      let count = 0;
      let nodeType = null;
      let ruleType = null;
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const nameCell = cells[0].textContent?.trim() || '';
          const normalizedName = nameCell.replace(/^\d+/, '');
          if (normalizedName === ruleName) {
            count++;
            ruleType = cells[1]?.textContent?.trim() || null;
            nodeType = cells[2]?.textContent?.trim() || null;
          }
        }
      }
      return { count, nodeType, ruleType };
    }, RULE_NAME);
  } else {
    console.log('   ⚠️ 未找到「全局设置」按钮，将使用页面文本兜底验证');
  }

  // 兜底：如果表格未命中，用页面文本匹配统计数量
  const finalRuleCount = ruleCheck.count > 0 ? ruleCheck.count : await page.evaluate((ruleName) => {
    const bodyText = document.body?.innerText || '';
    const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = bodyText.match(new RegExp(escaped, 'g'));
    return matches ? matches.length : 0;
  }, RULE_NAME);

  const ruleExists = finalRuleCount > 0;

  console.log(`\n📊 ────────────────────────────────`);
  console.log(`📊 流程状态: ${versionStr} ${isEnabled ? '(启用中 ✅)' : '(未启用 ❌)'}`);
  console.log(`📊 规则名称: ${RULE_NAME}`);
  console.log(`📊 规则存在: ${ruleExists ? '✅' : '❌'}`);
  console.log(`📊 规则数量: ${finalRuleCount}（必须 == 1）`);
  if (ruleCheck.ruleType) console.log(`📊 规则类型: ${ruleCheck.ruleType}`);
  if (ruleCheck.nodeType) console.log(`📊 节点类型: ${ruleCheck.nodeType}`);
  console.log(`📊 当前URL: ${page.url()}`);
  console.log(`📊 ────────────────────────────────`);

  if (!ruleExists) {
    console.log('\n❌ 验证失败：规则未在页面中找到');
    await page.screenshot({ path: path.join(screenshotDir, 'push-rule-missing.png') });
    await browser.close();
    process.exit(3);
  } else if (finalRuleCount > 1) {
    // 🔴 检测到重复规则：禁止标记为成功，必须停止等待人工清理
    console.log(`\n❌ 检测到 ${finalRuleCount} 条重复规则（规则名: ${RULE_NAME}）`);
    console.log('❌ 根据幂等性硬规则，禁止标记为"已配置"');
    console.log('❌ 请人工清理重复规则至只剩 1 条后重新运行，或检查步骤3.5删除逻辑是否生效');
    await page.screenshot({ path: path.join(screenshotDir, 'push-duplicate-rules-detected.png') });
    await browser.close();
    process.exit(3);
  } else if (!isEnabled) {
    console.log('\n⚠️ 警告：规则已创建但流程未启用');
  } else if (ruleCheck.nodeType && ruleCheck.nodeType !== '结束') {
    console.log(`\n❌ 规则节点类型错误: ${ruleCheck.nodeType}（必须为「结束」）`);
    await page.screenshot({ path: path.join(screenshotDir, 'push-wrong-node-type.png') });
    await browser.close();
    process.exit(7);
  } else {
    console.log(`\n✅ 业务关联规则"${RULE_NAME}"已成功配置到流程版本 ${versionStr}（启用中）`);
    console.log(`✅ 幂等性校验通过：规则数量 = 1`);
    if (ruleCheck.nodeType) console.log(`✅ 节点类型校验通过：${ruleCheck.nodeType}`);
  }

  await page.screenshot({ path: path.join(screenshotDir, 'push-final.png') });
  console.log(`\n📄 最终截图已保存: .playwright-cli/push-final.png`);

  console.log('\n✅ 浏览器保持打开 10 秒...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('\n=== 推送完成 ===');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});
