/**
 * schema_guard.js - 表单 Schema 推送守卫（机制级护栏）
 * 版本: v1.0.0 (2026-11-02)
 *
 * 背景（2026-11-01 踩坑）：
 *   通过 saveFormSchema 写入 {type:"mobile"} 字段校验后，运行时生效但设计器
 *   「校验」面板四项全空（UI 只渲染 required/minLength/maxLength/customValidate 四类），
 *   用户后续在设计器点「保存」时该项会被静默丢弃。
 *
 * 三道闸：
 *   闸1 assertValidationVisible(schema)        — 推送前拦截"UI 不可见"的校验类型
 *   闸2 backupBeforePush(schema, formDir, tag) — 推送前强制落盘备份
 *   闸3 assertPushResult(before, after, opts)  — 推送后回读断言：只有目标改动
 *
 * 紧急逃生口：环境变量 SCHEMA_GUARD_OFF=1 可跳过闸1（不推荐，仅平台结构变更时临时用），
 *             跳过时会在 stderr 打印显眼警告，便于事后审计。
 */

const fs = require('fs');
const path = require('path');

// ============ 配置 ============

/** 设计器校验面板可渲染的 type 白名单（写入即须可见） */
const VISIBLE_VALIDATION_TYPES = ['required', 'minLength', 'maxLength', 'customValidate'];

/** customValidate.param 必须是包含该标记的函数源码字符串（设计器代码框可见） */
const CUSTOM_FN_MARKER = 'function validateRule';

/** 回读比对时忽略的平台自动回写字段（出现在任意层级的 key） */
const PLATFORM_AUTO_KEYS = ['gmtModified', 'gmtCreate', 'originTitle', 'version'];

/** 校验项黑名单：运行时生效但设计器不渲染，禁止通过 API 写入 */
const INVISIBLE_VALIDATION_TYPES = [
  'mobile', 'email', 'url', 'minValue', 'maxValue',
  'idCard', 'phone', 'tel', 'number', 'integer', 'currency'
];

// ============ 工具函数 ============

function guardEnabled() {
  return process.env.SCHEMA_GUARD_OFF !== '1';
}

/**
 * 深度遍历 schema，收集所有携带 validation 数组的节点
 * @param {*} node - 任意节点
 * @param {Array} out - 收集结果 [{node, fieldId, label}]
 * @param {string} nearestId - 最近的祖先 fieldId
 * @private
 */
function collectValidationNodes(node, out, nearestId) {
  if (!node || typeof node !== 'object') return out;
  let currentId = nearestId;
  if (typeof node.fieldId === 'string' && node.fieldId) currentId = node.fieldId;
  if (Array.isArray(node.validation)) {
    out.push({
      fieldId: currentId || '(未知字段)',
      label: (node.label && (node.label.zh_CN || node.label)) || currentId || '(未命名)',
      validation: node.validation
    });
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child && typeof child === 'object') {
      collectValidationNodes(child, out, currentId);
    }
  }
  return out;
}

/**
 * 递归收集页面 JS 节点（__initMethods__.value），用于推送前后比对
 * @private
 */
function collectPageJs(node, out) {
  if (!node || typeof node !== 'object') return out;
  const im = node.__initMethods__;
  if (im && typeof im === 'object' && im.value !== undefined) {
    out.push(String(im.value));
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child && typeof child === 'object') {
      collectPageJs(child, out);
    }
  }
  return out;
}

// ============ 闸1：推送前校验可见性 ============

/**
 * 断言 schema 中所有字段校验均为设计器可见类型。不合法直接 throw，阻断推送。
 * @param {Object} schema - 待推送的完整 schema
 * @throws {Error} 发现 UI 不可见的校验类型或非法 customValidate.param 时抛出
 */
function assertValidationVisible(schema) {
  if (!guardEnabled()) {
    console.error('⚠️  [schema_guard] SCHEMA_GUARD_OFF=1，已跳过校验可见性检查（事后请审计！）');
    return;
  }
  const found = collectValidationNodes(schema, [], null);
  const problems = [];

  for (const item of found) {
    for (const rule of item.validation) {
      if (!rule || typeof rule !== 'object') {
        problems.push(`字段 ${item.fieldId}(${item.label}) 存在空校验项`);
        continue;
      }
      const type = rule.type;
      if (INVISIBLE_VALIDATION_TYPES.includes(type)) {
        problems.push(
          `字段 ${item.fieldId}(${item.label}) 使用了设计器不渲染的校验类型 "${type}"。` +
          `运行时虽生效，但设计器「校验」面板看不到，且用户保存时会被静默丢弃。` +
          `请改用 {type:"customValidate", param:"function validateRule(value){...}"}（完整写法见 api-client/SKILL.md §字段校验写入规范）`
        );
      } else if (!VISIBLE_VALIDATION_TYPES.includes(type)) {
        problems.push(
          `字段 ${item.fieldId}(${item.label}) 使用了未知校验类型 "${type}"，不在可见白名单 ` +
          `[${VISIBLE_VALIDATION_TYPES.join(', ')}] 内，禁止推送`
        );
      }
      if (type === 'customValidate') {
        const p = rule.param;
        const isFnString = typeof p === 'string' && p.includes(CUSTOM_FN_MARKER);
        if (!isFnString) {
          problems.push(
            `字段 ${item.fieldId}(${item.label}) 的 customValidate.param 必须是包含 ` +
            `"${CUSTOM_FN_MARKER}" 的函数源码字符串（设计器代码框按此渲染），` +
            `实际得到: ${typeof p} ${typeof p === 'object' ? JSON.stringify(p).slice(0, 80) : String(p).slice(0, 80)}`
          );
        }
      }
    }
  }

  if (problems.length) {
    const msg = `[schema_guard] 推送被拦截，${problems.length} 处校验配置不合法:\n  - ` +
      problems.join('\n  - ');
    console.error('🚫 ' + msg);
    const err = new Error(msg);
    err.code = 'SCHEMA_GUARD_VALIDATION_INVISIBLE';
    throw err;
  }
  console.error(`  ✅ [schema_guard 闸1] 校验可见性检查通过（${found.length} 个字段携带 validation）`);
}

// ============ 闸2：推送前备份 ============

/**
 * 推送前把线上 schema 备份到表单目录的 _备份/ 子目录。
 * @param {Object} schema - 线上原始 schema（推送前刚拉取的）
 * @param {string} formDir - 表单本地目录（如 项目/客户管理「分组」/客户信息「普通表单」）
 * @param {string} [tag] - 备份用途标记，默认 'before-push'
 * @returns {string} 备份文件绝对路径
 * @throws {Error} 备份写入失败时抛出，阻断推送
 */
function backupBeforePush(schema, formDir, tag) {
  const backupDir = path.join(formDir, '_备份');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(backupDir, `schema-${stamp}-${tag || 'before-push'}.json`);
  fs.writeFileSync(file, JSON.stringify(schema, null, 2), 'utf8');
  if (!fs.existsSync(file)) throw new Error('[schema_guard 闸2] 备份写入失败: ' + file);
  console.error(`  ✅ [schema_guard 闸2] 线上 schema 已备份: ${file}`);
  return file;
}

// ============ 闸3：推送后回读断言 ============

/**
 * 提取 schema 中所有叶子路径（用于 diff），忽略平台自动回写字段
 * @private
 */
function flattenLeaves(obj, prefix, out) {
  out = out || {};
  prefix = prefix || '';
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flattenLeaves(v, `${prefix}[${i}]`, out));
    return out;
  }
  for (const key of Object.keys(obj)) {
    if (PLATFORM_AUTO_KEYS.includes(key)) continue; // 平台自动回写，不参与 diff
    flattenLeaves(obj[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/**
 * 比较 before/after 两份 schema，返回变更路径清单
 * @returns {{added: string[], removed: string[], changed: string[]}}
 */
function diffSchema(before, after) {
  const a = flattenLeaves(before);
  const b = flattenLeaves(after);
  const added = [], removed = [], changed = [];
  for (const k of Object.keys(b)) {
    if (!(k in a)) added.push(k);
    else if (String(a[k]) !== String(b[k])) changed.push(k);
  }
  for (const k of Object.keys(a)) {
    if (!(k in b)) removed.push(k);
  }
  return { added, removed, changed };
}

/**
 * 推送后回读断言：
 *   1) 回读 schema 的校验项全部在可见白名单内（防平台/中途改写）
 *   2) 页面 JS（__initMethods__.value）未被改动
 *   3) 变更路径全部命中 allowPaths 白名单（最小改动原则；不传则仅打印 diff 供人工确认）
 * @param {Object} before - 推送前线上 schema
 * @param {Object} after - 推送后回读 schema
 * @param {Object} [opts]
 * @param {string[]} [opts.allowPaths] - 允许变更的路径前缀数组，如 ['props.textField_tml4okd3.props.validation']；
 *                                       路径以该前缀开头的变更视为允许。不传则跳过最小改动断言。
 * @returns {{diff: Object, pageJsChanged: boolean, violations: string[]}} 断言结果
 * @throws {Error} 任何断言不通过时抛出（violations 详情在 message 中）
 */
function assertPushResult(before, after, opts) {
  opts = opts || {};
  const violations = [];

  // 3-1 回读后的校验项仍须全部可见（防推送被平台降级改写）
  const found = collectValidationNodes(after, [], null);
  for (const item of found) {
    for (const rule of item.validation) {
      if (rule && typeof rule === 'object' && !VISIBLE_VALIDATION_TYPES.includes(rule.type)) {
        violations.push(
          `推送后字段 ${item.fieldId}(${item.label}) 出现不可见校验类型 "${rule.type}"，请立即用备份回滚`
        );
      }
    }
  }

  // 3-2 页面 JS 必须原样保留
  const jsBefore = collectPageJs(before, []);
  const jsAfter = collectPageJs(after, []);
  let pageJsChanged = false;
  if (jsBefore.length !== jsAfter.length) {
    pageJsChanged = true;
    violations.push(`页面 JS 节点数量变化: ${jsBefore.length} -> ${jsAfter.length}，疑似覆盖，请回滚`);
  } else {
    for (let i = 0; i < jsBefore.length; i++) {
      if (jsBefore[i] !== jsAfter[i]) {
        pageJsChanged = true;
        violations.push(`页面 JS 第 ${i + 1} 段内容被改动，请立即回滚`);
        break;
      }
    }
  }

  // 3-3 最小改动断言（传入 allowPaths 才启用）
  const diff = diffSchema(before, after);
  const total = diff.added.length + diff.removed.length + diff.changed.length;
  if (Array.isArray(opts.allowPaths)) {
    const ok = (p) => opts.allowPaths.some((prefix) => p === prefix || p.startsWith(prefix));
    for (const p of [...diff.added, ...diff.removed, ...diff.changed]) {
      if (!ok(p)) violations.push(`出现白名单外的变更路径: ${p}`);
    }
  }

  console.error(`  📊 [schema_guard 闸3] diff 统计: 新增${diff.added.length} 删除${diff.removed.length} 修改${diff.changed.length}`);
  if (diff.changed.length + diff.added.length <= 20) {
    [...diff.changed, ...diff.added].forEach(p => console.error(`     · ${p}`));
  }

  if (violations.length) {
    const msg = '[schema_guard 闸3] 回读断言失败:\n  - ' + violations.join('\n  - ');
    console.error('🚫 ' + msg);
    const err = new Error(msg);
    err.code = 'SCHEMA_GUARD_PUSH_ASSERT_FAILED';
    err.violations = violations;
    err.diff = diff;
    throw err;
  }
  console.error('  ✅ [schema_guard 闸3] 回读断言通过：页面 JS 未变' +
    (Array.isArray(opts.allowPaths) ? '，变更全部命中白名单' : '（未启用最小改动断言）'));
  return { diff, pageJsChanged, violations: [] };
}

module.exports = {
  VISIBLE_VALIDATION_TYPES,
  INVISIBLE_VALIDATION_TYPES,
  assertValidationVisible,
  backupBeforePush,
  assertPushResult,
  diffSchema
};
