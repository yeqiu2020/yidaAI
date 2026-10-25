/**
 * lib/sync-server/action-code-sync.js — 表单动作代码同步（服务端内联版）
 *
 * 【背景】v3.1.0 初版 /sync-form-actions 端点通过 executeSync spawn 子进程
 * （sync_single_form.js --actions-only）实现，与用户报告的两次 IDE 卡死时间相关。
 * 为釜底抽薪消除该唯一新增链路，v3.2.0 改为服务端内联实现：
 * 读配置 → 读 .cookies.json → https 直调宜搭 getFormSchema API → 提取动作代码落盘。
 * 全程无子进程、无 Playwright，30s 网络超时，响应时间 < 2s（登录态有效时）。
 *
 * 创建日期：2026-09-28
 * v3.2.6: 推送同时更新 actions.module.compiled —— 运行时实际执行的是 compiled
 *         （'use strict' + exports.xxx 的 CJS 模块），只改 source 会出现
 *         「面板已更新、运行仍走旧代码」的假成功（2026-09-28 销售对账单实锤）
 * v3.2.7: 配套命名规范（用户定稿）——推送前备份固定名「动作代码_推送前备份.js」滚动覆盖；
 *         版本列表「动作代码_推送版.js」置顶（前端默认选中第一项）
 * v3.2.8: 审查修复——①备份落实固定名滚动覆盖（原实现写时间戳文件名且永不覆盖，与定稿矛盾）；
 *         ②版本列表过滤「推送前备份」文件，排序改用 mtimeMs 数值比较（格式化字符串非零填充，
 *         2026/10/1 会被排在 2026/9/28 之后）；③buildCompiled 覆盖 export const/let/var 与
 *         export {} 列表，推送前对生成的 compiled 再做一次 node --check（.cjs），
 *         未识别的 export 风格（如 export default）在推送前拦截，而非带病上线。
 * v4.0.0: 2026-09-30 用户授权扩展（规则 8 解除限制）——scope='all' 时一次性推送
 *         动作代码 + 推送配置.json 中声明的字段事件绑定/远程数据源/字段公式/字段校验规则，
 *         并同步重建 actions.list 函数注册表（只增不删）。原子操作实现在 schema-push.js。
 *         推送前新增全量 Schema 备份（Schema备份_推送前.json），推送后回读逐项验证
 *         （保存成功 ≠ 配置正确）。无 推送配置.json 时自动退化为仅推动作代码。
 */

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { readSystemConfig } = require('./config-reader');
const { findFormDir } = require('./form-scanner');
const { saveActionCodeToFormDir, extractActionCodeSource, CODE_DIR_NAME } = require('./action-code');
const schemaPush = require('./schema-push');

/** Cookie 域名匹配（照抄 sync_single_form.js 的实现，行为保持一致） */
function isCookieDomainMatch(cookieDomain, host) {
  if (!cookieDomain || !host) return false;
  const normalizedDomain = String(cookieDomain).replace(/^\./, '').toLowerCase();
  const normalizedHost = String(host).toLowerCase();
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

/**
 * 从 cookieData 构建请求 Cookie 头（与 sync_single_form.js loadCookies 逻辑一致）
 * 仅发送匹配目标域名的 Cookie，同名 Cookie 保留更具体域名
 */
function buildCookieHeader(cookieData, baseUrl) {
  const allCookies = Array.isArray(cookieData.cookies) ? cookieData.cookies : [];
  if (allCookies.length === 0) return '';

  let targetHost = '';
  try {
    if (baseUrl) targetHost = new URL(baseUrl).hostname;
  } catch (_) { /* ignore */ }

  const filtered = targetHost
    ? allCookies.filter(c => isCookieDomainMatch(c.domain, targetHost))
    : allCookies;
  const forRequest = filtered.length > 0 ? filtered : allCookies;

  const uniqueByName = new Map();
  for (const cookie of forRequest) {
    if (!cookie || !cookie.name) continue;
    const prev = uniqueByName.get(cookie.name);
    if (!prev) {
      uniqueByName.set(cookie.name, cookie);
    } else {
      const prevDomain = String(prev.domain || '').replace(/^\./, '');
      const currDomain = String(cookie.domain || '').replace(/^\./, '');
      if (currDomain.length > prevDomain.length) {
        uniqueByName.set(cookie.name, cookie);
      }
    }
  }

  return Array.from(uniqueByName.values())
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

/**
 * 读取项目登录态（多位置扫描 + 取最新修改的一份）
 *
 * 背景：Cookie 写入位置随刷新登录的入口不同而不同（v3.0.2 多项目隔离）：
 * - 应用目录（/refresh-login 带 projectDir 时）
 * - 项目根（历史默认）
 * - STATIC_ROOT 公共父目录（本地操作页面刷新未带项目参数时的 fallback）
 * 因此按「修改时间最新优先」选择，确保读到刚刷新的登录态。
 */
function loadProjectCookieData(projectDir) {
  // The selected project is the boundary; a newer credential in the common parent is unrelated.
  const appDir = path.resolve(projectDir);
  let projectRoot = appDir;
  while (!fs.existsSync(path.join(projectRoot, '组织及应用信息.md')) && !fs.existsSync(path.join(projectRoot, '.agents'))) {
    const parent = path.dirname(projectRoot);
    if (parent === projectRoot) { projectRoot = appDir; break; }
    projectRoot = parent;
  }
  let expectedHost = '';
  let expectedCorp = '';
  try {
    const text = fs.readFileSync(path.join(projectRoot, '组织及应用信息.md'), 'utf8');
    const domain = text.match(/完整域名(?:\*\*)?\s*\|\s*(https?:\/\/[^\s|]+)/);
    if (domain) expectedHost = new URL(domain[1]).hostname.toLowerCase();
    const corp = text.match(/corpId(?:\*\*)?\s*\|\s*(ding[\w]+)/i);
    if (corp) expectedCorp = corp[1];
  } catch (_) { /* Older projects may have no organization metadata. */ }
  const candidates = [...new Set([
    path.join(appDir, '.cookies.json'),
    path.join(projectRoot, '.cookies.json'),
    path.join(projectRoot, '.cache', 'cookies.json'),
  ])];
  const valid = [];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || !Array.isArray(data.cookies) || !data.cookies.length) continue;
      if (expectedHost && new URL(data.base_url).hostname.toLowerCase() !== expectedHost) continue;
      const inferred = require('../core/utils').extractInfoFromCookies(data.cookies);
      const corp = data.corp_id || inferred.corpId;
      if (expectedCorp && corp && corp !== expectedCorp) continue;
      valid.push({ data, mtime: fs.statSync(file).mtimeMs });
    } catch (_) { /* Invalid or unrelated credentials are not a usable fallback. */ }
  }
  valid.sort((a, b) => b.mtime - a.mtime);
  return valid.length ? valid[0].data : null;
}

/**
 * 调用宜搭 getFormSchema API（GET，30s 超时，不支持重试）
 */
function fetchFormSchema(appId, formUuid, { baseUrl, cookieStr, csrfToken }) {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}/alibaba/web/${appId}/_view/query/formdesign/getFormSchema.json?formUuid=${encodeURIComponent(formUuid)}&schemaVersion=V5`;
    const mod = url.startsWith('https:') ? https : http;

    const req = mod.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `${baseUrl}/`,
        'x-csrf-token': csrfToken || '',
        'Cookie': cookieStr || ''
      }
    }, (res) => {
      // v3.2.4: 必须 Buffer 收集后统一解码 — 字符串拼接会在 chunk 边界撕碎多字节中文字符
      // （3 字节汉字跨块时变 U+FFFD 乱码，且位置随机，2026-09-28 销售对账单坏字事故）
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        if (data.includes('<!DOCTYPE html>') || data.includes('<html')) {
          reject(new Error('LOGIN_REQUIRED: 登录态已过期，请先到「本地操作页面」点击"刷新登录"按钮'));
          return;
        }
        try {
          const result = JSON.parse(data);
          if (result.success && result.content) {
            resolve(result.content);
          } else {
            const errMsg = result.errorMsg || result.error || '获取Schema失败';
            if (String(errMsg).toUpperCase().includes('LOGIN FAILED')) {
              reject(new Error('LOGIN_REQUIRED: 登录已失效，请先到「本地操作页面」点击"刷新登录"按钮'));
              return;
            }
            reject(new Error(errMsg));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', err => reject(new Error(`请求失败: ${err.message}`)));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时（30秒）'));
    });
  });
}

/**
 * 同步单个表单的动作代码（服务端内联，无子进程）
 * @param {{projectDir: string, formName: string}} params
 * @returns {Promise<{success: boolean, formName?: string, hasActionCode?: boolean, actionCodePath?: string, actionCodeLength?: number, error?: string}>}
 */
async function syncFormActionCode({ projectDir, formName }) {
  // 1. 读系统配置清单
  const config = readSystemConfig(projectDir);
  if (!config || !config.appId) {
    return { success: false, error: '读取系统配置清单失败（缺少应用ID）' };
  }
  const form = (config.forms || []).find(f => f.name === formName);
  if (!form) {
    return { success: false, error: `系统配置清单中找不到表单「${formName}」` };
  }

  // 2. 读登录态
  const cookieData = loadProjectCookieData(projectDir);
  if (!cookieData || !Array.isArray(cookieData.cookies) || cookieData.cookies.length === 0) {
    return { success: false, error: 'LOGIN_REQUIRED: 登录已失效，请先到「本地操作页面」点击"刷新登录"按钮' };
  }
  const baseUrl = String(cookieData.base_url || '').replace(/\/$/, '');
  let csrfToken = cookieData.csrf_token || '';
  if (!csrfToken) {
    try {
      const { extractInfoFromCookies } = require('../core/utils');
      const info = extractInfoFromCookies(cookieData.cookies) || {};
      csrfToken = info.csrfToken || '';
    } catch (_) { /* ignore */ }
  }
  const cookieStr = buildCookieHeader(cookieData, baseUrl);

  // 3. 拉取 Schema（LOGIN_REQUIRED 等错误直接透传给前端）
  const schema = await fetchFormSchema(config.appId, form.uuid, { baseUrl, cookieStr, csrfToken });

  // 4. 定位表单目录并落盘动作代码
  const formDir = findFormDir(projectDir, formName, form.type, form.uuid);
  const result = saveActionCodeToFormDir(formDir, { formName, formUuid: form.uuid }, schema);

  return {
    success: true,
    formName,
    hasActionCode: result.hasCode,
    actionCodePath: result.filePath || '',
    actionCodeLength: result.codeLength || 0
  };
}

module.exports = { syncFormActionCode };

/**
 * 解析「获取上下文」公共步骤：配置 → 表单 → Cookie
 * @returns {{config, form, formDir, baseUrl, csrfToken, cookieStr}} 或 {error}
 */
function resolvePushContext(projectDir, formName) {
  const config = readSystemConfig(projectDir);
  if (!config || !config.appId) {
    return { error: '读取系统配置清单失败（缺少应用ID）' };
  }
  const form = (config.forms || []).find(f => f.name === formName);
  if (!form) {
    return { error: `系统配置清单中找不到表单「${formName}」` };
  }
  const cookieData = loadProjectCookieData(projectDir);
  if (!cookieData || !Array.isArray(cookieData.cookies) || cookieData.cookies.length === 0) {
    return { error: 'LOGIN_REQUIRED: 登录已失效，请先到「本地操作页面」点击"刷新登录"按钮' };
  }
  const baseUrl = String(cookieData.base_url || '').replace(/\/$/, '');
  let csrfToken = cookieData.csrf_token || '';
  if (!csrfToken) {
    try {
      const { extractInfoFromCookies } = require('../core/utils');
      const info = extractInfoFromCookies(cookieData.cookies) || {};
      csrfToken = info.csrfToken || '';
    } catch (_) { /* ignore */ }
  }
  const formDir = findFormDir(projectDir, formName, form.type, form.uuid);
  return {
    config, form, formDir,
    baseUrl, csrfToken,
    cookieStr: buildCookieHeader(cookieData, baseUrl)
  };
}

/**
 * 列出表单「代码」文件夹下的全部代码版本文件（供推送前选择）
 * @returns {{success: boolean, versions?: Array<{fileName, sizeKB, mtime}>, codeDir?: string, error?: string}}
 */
function listActionCodeVersions(projectDir, formName) {
  const ctx = resolvePushContext(projectDir, formName);
  if (ctx.error) return { success: false, error: ctx.error };
  if (!ctx.formDir) {
    return { success: false, error: `本地找不到表单「${formName}」的目录，请先在原型页同步一次表单` };
  }
  const codeDir = path.join(ctx.formDir, CODE_DIR_NAME);
  if (!fs.existsSync(codeDir)) {
    return { success: false, error: '该表单还没有「代码」文件夹，请先点「同步动作代码」拉取备份' };
  }
  const versions = fs.readdirSync(codeDir)
    .filter(f => f.endsWith('.js'))
    // v3.2.8: 推送前备份是「推送瞬间」的线上快照，不是可推送版本，过滤防止误选
    .filter(f => !f.includes('推送前备份'))
    .map(f => {
      const st = fs.statSync(path.join(codeDir, f));
      return {
        fileName: f,
        sizeKB: Math.round(st.size / 102.4) / 10,
        mtime: st.mtime.toLocaleString('zh-CN', { hour12: false }),
        mtimeMs: st.mtimeMs
      };
    })
    .sort((a, b) => {
      // v3.2.7: 推送版置顶（前端默认选中第一项），其余按修改时间倒序
      // v3.2.8: 排序用 mtimeMs 数值——格式化字符串非零填充（2026/9/28 vs 2026/10/1）跨月会排错
      const pa = a.fileName === '动作代码_推送版.js' ? 0 : 1;
      const pb = b.fileName === '动作代码_推送版.js' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return b.mtimeMs - a.mtimeMs;
    });
  return { success: true, versions, codeDir };
}

/**
 * 剥离同步文件中的自动生成元信息，得到纯宜搭代码（v3.2.5 重写）
 *
 * 剥离两类内容：
 *   1) 文件末尾尾注（新格式）：`// ==== 宜搭同步备份信息` 行起至文件末尾
 *   2) 文件头部块注释（旧格式/改造版手工复制的元信息块）：仅当块内容含同步元信息
 *      特征（表单UUID: / 同步时间: / 表单动作代码（ ）时才剥离。
 *      用户自己写的说明注释（版本号/功能说明等）不含这些特征，会原样保留——
 *      宜搭面板顶部就带说明注释，推送内容需与其保持一致。
 */
function stripHeaderComment(content) {
  let text = String(content || '').replace(/^\uFEFF/, '');

  // 1) 剥末尾尾注
  const footerIdx = text.lastIndexOf('// ==== 宜搭同步备份信息');
  if (footerIdx !== -1) {
    text = text.slice(0, footerIdx).replace(/\s+$/, '');
  }

  // 2) 剥头部元信息块（可连续多个，遇不含特征的块即停）
  let m;
  while ((m = text.match(/^\s*\/\*\*[\s\S]*?\*\//))) {
    if (!/表单UUID\s*:|同步时间\s*:|表单动作代码（/.test(m[0])) break;
    text = text.slice(m[0].length).replace(/^\s+/, '');
  }

  return text;
}

/**
 * 由 source 生成 compiled（v3.2.6 新增）
 * 按宜搭设计器保存时的编译形态转换：剥离 export 前缀 + 头部补 exports 声明
 */
function buildCompiled(source) {
  // v3.2.8: 除 export (async) function 外，覆盖 const/let/var 单标识符声明与 export { a, b as c }
  // 列表；仍未识别的 export 风格（如 export default）保留在 body 中，由推送前的
  // compiled node --check 兜底拦截（pushActionCode 第 4 步）。
  // function 声明有提升可前置导出；const/let 处于 TDZ，必须追加在 body 之后赋值。
  const bindings = [];
  const push = (local, exported, hoisted) => {
    if (!bindings.some(b => b.exported === exported)) bindings.push({ local, exported, hoisted });
  };
  let m;
  const reFn = /export\s+(async\s+)?function\s+(\w+)/g;
  while ((m = reFn.exec(source)) !== null) push(m[2], m[2], true);
  const reDecl = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = reDecl.exec(source)) !== null) push(m[1], m[1], false);
  const reList = /export\s*\{([^}]*)\}/g;
  while ((m = reList.exec(source)) !== null) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      const asMatch = seg.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asMatch) push(asMatch[1], asMatch[2], false);
      else if (/^[A-Za-z_$][\w$]*$/.test(seg)) push(seg, seg, false);
    }
  }
  const body = source
    .replace(/export\s+(?=(?:async\s+)?function\s+)/g, '')
    .replace(/export\s+(?=(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=)/g, '')
    .replace(/export\s*\{[^}]*\}\s*;?/g, '');
  const head = ["'use strict';", 'exports.__esModule = true;'];
  const tail = [];
  for (const b of bindings) (b.hoisted ? head : tail).push(`exports.${b.exported} = ${b.local};`);
  return head.join('\n') + '\n' + body + (tail.length ? '\n' + tail.join('\n') : '');
}

/**
 * 语法校验（node --check，ESM 模式；临时文件写入 temp-file 后即删）
 */
function syntaxCheck(code, projectDir, moduleType) {
  const { spawnSync } = require('child_process');
  const tmpDir = path.resolve(projectDir, '..', 'temp-file');
  fs.mkdirSync(tmpDir, { recursive: true });
  // v3.2.8: moduleType 'cjs' → .cjs（校验 buildCompiled 产物），默认 .mjs（校验 ES 源码）
  const ext = moduleType === 'cjs' ? '.cjs' : '.mjs';
  const tmpFile = path.join(tmpDir, `check-${Date.now()}-${process.pid}${ext}`);
  try {
    fs.writeFileSync(tmpFile, code, 'utf-8');
    const r = spawnSync(process.execPath, ['--check', tmpFile], { encoding: 'utf-8', timeout: 15000 });
    if (r.status === 0) return { ok: true };
    return { ok: false, error: ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(0, 6).join('\n') };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
  }
}

/**
 * 调用宜搭 saveFormSchema API（POST，30s 超时）
 * 仅在「推送动作代码」链路调用 — 遵循 2026-09-28 用户授权：
 * 仅替换 actions.module.source，其余 schema 原样回写，推送前强制备份
 */
function saveFormSchemaRemote(appId, formUuid, schema, { baseUrl, cookieStr, csrfToken }) {
  return new Promise((resolve, reject) => {
    // 宜搭 API 要求 form-urlencoded（与 api-client postRequest 行为一致），content 为 JSON 字符串参数
    const payload = new URLSearchParams({
      appType: appId,
      formUuid: formUuid,
      content: JSON.stringify(schema),
      schemaVersion: 'V5',
      prefix: '_view',
      _csrf_token: csrfToken || ''
    }).toString();
    const url = `${baseUrl}/alibaba/web/${appId}/_view/query/formdesign/saveFormSchema.json`;
    const u = new URL(url);
    const mod = url.startsWith('https:') ? https : http;

    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (url.startsWith('https:') ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `${baseUrl}/alibaba/web/${appId}/design/pageDesigner?formUuid=${formUuid}`,
        'x-csrf-token': csrfToken || '',
        'Cookie': cookieStr || ''
      }
    }, (res) => {
      // v3.2.4: 同上 — Buffer 收集统一解码，防止 chunk 边界撕碎中文字符
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        if (data.includes('<!DOCTYPE html>') || data.includes('<html')) {
          reject(new Error('LOGIN_REQUIRED: 登录态已过期，请先到「本地操作页面」点击"刷新登录"按钮'));
          return;
        }
        try {
          const result = JSON.parse(data);
          if (result.success) {
            resolve(result);
          } else {
            const errMsg = result.errorMsg || result.error || '保存Schema失败';
            if (String(errMsg).toUpperCase().includes('LOGIN FAILED')) {
              reject(new Error('LOGIN_REQUIRED: 登录已失效，请先到「本地操作页面」点击"刷新登录"按钮'));
              return;
            }
            reject(new Error(errMsg));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', err => reject(new Error(`请求失败: ${err.message}`)));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时（30秒）'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * 推送动作代码到宜搭（安全流程）：
 * 1. 拉取宜搭当前 Schema → 2. 推送前自动备份宜搭端现有代码 →
 * 3. 读取本地版本文件（剥头注释）→ 4. 语法校验 →
 * 5. 替换 actions.module.source 并同步重编 actions.module.compiled（运行时执行字段），其余 schema 原样回写 → 6. 保存
 *
 * v4.0.0 scope='all'（一键全量推送）在步骤 5 前追加：
 *   - 全量 Schema 备份（代码/Schema备份_推送前.json，滚动覆盖）
 *   - 读取并应用 代码/推送配置.json（事件绑定/远程数据源/公式/校验规则，任一校验不通过则整体中止、不保存）
 *   - actions.list 函数注册表从推送代码重建（只增不删）
 *   - 保存后重新拉取 Schema 回读，逐项核对落盘结果
 *
 * @param {{projectDir: string, formName: string, fileName: string, scope?: string}} params
 */
async function pushActionCode({ projectDir, formName, fileName, scope }, dependencies = {}) {
  const io = dependencies.fs || fs;
  const getSchema = dependencies.fetchFormSchema || fetchFormSchema;
  const saveSchema = dependencies.saveFormSchema || saveFormSchemaRemote;
  const checkSyntax = dependencies.syntaxCheck || syntaxCheck;
  // 安全校验：文件名必须是「代码」目录内的 .js 文件，禁止路径穿越
  if (!/^[\w\u4e00-\u9fa5（）()「」【】-]+\.js$/.test(fileName) || fileName.includes('..')) {
    return { success: false, error: `非法的文件名: ${fileName}` };
  }

  const ctx = (dependencies.resolveContext || resolvePushContext)(projectDir, formName);
  if (ctx.error) return { success: false, error: ctx.error };
  if (!ctx.formDir) {
    return { success: false, error: `本地找不到表单「${formName}」的目录` };
  }

  const codeDir = path.join(ctx.formDir, CODE_DIR_NAME);
  const pushFile = path.join(codeDir, fileName);
  if (!io.existsSync(pushFile)) {
    return { success: false, error: `找不到待推送文件: ${fileName}` };
  }

  // 1. 拉取宜搭当前 Schema
  const originalSchema = await getSchema(ctx.config.appId, ctx.form.uuid, {
    baseUrl: ctx.baseUrl, cookieStr: ctx.cookieStr, csrfToken: ctx.csrfToken
  });
  // Preserve the exact remote preimage before changing source, compiled, or the registry.
  const schema = JSON.parse(JSON.stringify(originalSchema));
  const schemaBackupFile = schemaPush.SCHEMA_BACKUP_NAME;
  io.mkdirSync(codeDir, { recursive: true });
  io.writeFileSync(path.join(codeDir, schemaBackupFile), JSON.stringify(originalSchema, null, 2), 'utf-8');

  // 2. 推送前自动备份宜搭端现有代码（v3.2.8 落实 v3.2.7 定稿：固定名滚动覆盖，不再堆积时间戳文件）
  const currentSource = extractActionCodeSource(schema);
  let backupFile = '';
  if (currentSource) {
    backupFile = '动作代码_推送前备份.js';
    io.writeFileSync(path.join(codeDir, backupFile), currentSource, 'utf-8');
  }

  // 3. 读取待推送代码（剥离同步头注释）
  const rawCode = io.readFileSync(pushFile, 'utf-8');
  const code = stripHeaderComment(rawCode);
  if (!code.trim()) {
    return { success: false, error: '待推送文件没有有效代码内容' };
  }

  // 4. 语法校验：source 按 ESM、生成的 compiled 按 CJS 各校验一道（v3.2.8）
  //    运行时执行的是 compiled——buildCompiled 未覆盖的 export 风格在这里拦截，不再带病上线
  const check = checkSyntax(code, projectDir, 'esm');
  if (!check.ok) {
    return { success: false, error: `语法校验未通过，已中止推送：\n${check.error}` };
  }
  const compiled = buildCompiled(code);
  const compiledCheck = checkSyntax(compiled, projectDir, 'cjs');
  if (!compiledCheck.ok) {
    return { success: false, error: `编译产物（compiled）校验未通过，已中止推送。请检查代码是否使用了暂不支持的导出风格（如 export default）：\n${compiledCheck.error}` };
  }

  // 5. 替换 source 并同步更新 compiled（运行时执行的是 compiled，v3.2.6 修复假成功问题）
  if (!schema.actions || typeof schema.actions !== 'object') {
    schema.actions = {};
  }
  if (!schema.actions.module || typeof schema.actions.module !== 'object') {
    schema.actions.module = {};
  }
  schema.actions.module.source = code;
  schema.actions.module.compiled = compiled;

  // 5.5 函数注册表重建（v4.0.0，只增不删）——actions.list 是设计器"绑定事件"下拉框的函数清单，
  //     旧链路只改 module，新增函数可能不进 list 导致绑定下拉找不到
  const actionsListReport = schemaPush.rebuildActionsList(schema, code);

  // 5.6 scope='all'：应用 推送配置.json（事件绑定/数据源/公式/校验），任一校验失败整体中止、不保存
  let configReport = null;
  let requestedConfig = {};
  if (scope === 'all') {
    let loaded;
    try {
      loaded = (dependencies.loadPushConfig || schemaPush.loadPushConfig)(ctx.formDir);
    } catch (e) {
      return { success: false, error: `推送配置校验未通过，已中止推送：${e.message}` };
    }
    if (loaded.exists) {
      const cfg = JSON.parse(JSON.stringify(loaded.config));
      requestedConfig = cfg;
      const exportNames = schemaPush.extractExportNames(code);
      try {
        // 各节为空数组时跳过对应应用器，避免在无该类配置的表单上凭空创建空结构
        const bindings = (cfg.bindings || []).length
          ? schemaPush.applyBindings(schema, cfg.bindings, exportNames) : { total: 0, added: 0, skipped: 0, details: [] };
        const dataSources = (cfg.dataSources || []).length
          ? schemaPush.applyDataSources(schema, cfg.dataSources, { formUuid: ctx.form.uuid })
          : { total: 0, added: 0, updated: 0, details: [] };
        const formulas = (cfg.formulas || []).length
          ? schemaPush.applyFormulas(schema, cfg.formulas) : { total: 0, applied: 0, cleared: 0, details: [] };
        const validations = (cfg.validations || []).length
          ? schemaPush.applyValidations(schema, cfg.validations) : { total: 0, applied: 0, details: [] };
        configReport = {
          found: true,
          configPath: path.relative(ctx.formDir, loaded.filePath),
          bindings, dataSources, formulas, validations
        };
      } catch (e) {
        return { success: false, error: `推送配置应用失败，已中止推送（宜搭端未被修改）：${e.message}` };
      }
    } else {
      configReport = { found: false, note: `未找到 代码/${schemaPush.PUSH_CONFIG_NAME}，本次仅推送动作代码与函数注册表` };
    }
  }

  // 6. 保存回宜搭
  await saveSchema(ctx.config.appId, ctx.form.uuid, schema, {
    baseUrl: ctx.baseUrl, cookieStr: ctx.cookieStr, csrfToken: ctx.csrfToken
  });

  // 7. 回读验证（v4.0.0）——保存成功 ≠ 配置正确，重新拉取并按推送配置原样逐项核对
  let verifyReport;
    try {
      const freshSchema = await getSchema(ctx.config.appId, ctx.form.uuid, {
        baseUrl: ctx.baseUrl, cookieStr: ctx.cookieStr, csrfToken: ctx.csrfToken
      });
      // Verify the submitted configuration, never a file that may have changed during the request.
      verifyReport = schemaPush.verifyPushedSchema(freshSchema, requestedConfig);
      const normalize = value => String(value || '').replace(/\r\n/g, '\n').trim();
      const freshActions = freshSchema.actions || {};
      const freshModule = freshActions.module || {};
      for (const [key, expected] of [['source', code], ['compiled', compiled]]) {
        verifyReport.checked++;
        if (normalize(freshModule[key]) !== normalize(expected)) verifyReport.failures.push(`动作代码 ${key} 回读不一致`);
      }
      const actualIds = new Set((freshActions.list || []).map(item => item.id));
      for (const item of schema.actions.list || []) {
        verifyReport.checked++;
        if (!actualIds.has(item.id)) verifyReport.failures.push(`动作函数注册表缺失: ${item.id}`);
      }
      verifyReport.ok = verifyReport.failures.length === 0;
    } catch (e) {
      verifyReport = { ok: false, checked: 0, failures: [`回读验证请求失败（保存本身可能已成功）: ${e.message}`] };
    }
  return {
    success: verifyReport.ok,
    saved: true,
    verified: verifyReport.ok,
    stage: verifyReport.ok ? 'verified' : 'verification_failed',
    ...(verifyReport.ok ? {} : { error: '宜搭已保存，但回读验证未通过，请核对线上版本后再处理：' + verifyReport.failures.join('；') }),
    formName,
    pushedFile: fileName,
    codeLength: code.length,
    backupFile,
    schemaBackupFile,
    actionsList: actionsListReport,
    config: configReport,
    verify: verifyReport
  };
}

module.exports.pushActionCode = pushActionCode;
module.exports.listActionCodeVersions = listActionCodeVersions;
module.exports.stripHeaderComment = stripHeaderComment;
module.exports.buildCompiled = buildCompiled;
module.exports.loadProjectCookieData = loadProjectCookieData;
