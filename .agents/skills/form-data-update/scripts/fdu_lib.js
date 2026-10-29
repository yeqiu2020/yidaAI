/**
 * form-data-update 纯逻辑库（护栏核心，无任何 IO，可离线单测）
 * 版本: v1.0.0
 * 依据: 《Skill体系优化方案_20261029.md》第六节 —— form-data-update 护栏封装
 *       对应 7 条强制防护中的值规范化 / 守卫 / payload 构建 / 回读断言 / 回滚计划的纯逻辑部分。
 *
 * 全量读取形态（本库所有函数的统一数据形态，下称 fullRead）:
 *   {
 *     main:   { <fieldId>: value, ... , "<selectField>_id": 实际值, ... },   // 主表扁平 map
 *     tables: { <tableFieldId>: [ { rowId, <colId>: value, ... }, ... ] }   // 子表全量行
 *   }
 * 该形态由 CLI 的 readFullInstance 用「getFormDataById(instValue) + listTableData 分页」
 * 同一管线产出；写入前后各读一次（R1/R2），断言对比基于同源两次读取，天然消除格式噪声。
 */

'use strict';

const FDU_VERSION = '1.0.0';

// ============ 常量 ============

/** 复杂控件前缀：子表整表回写时行内非空即中止（读取形态与写入形态不同构，无法保真） */
const COMPLEX_FIELD_PREFIXES = ['attachmentField', 'photoField', 'imageField', 'signatureField'];
const TABLE_PREFIX = 'tableField';
const ASSOC_PREFIX = 'associationFormField';
const SELECT_PREFIX = 'selectField';
const DATE_PREFIX = 'dateField';
const NUMBER_PREFIX = 'numberField';
/** 子表分页接口 pageSize 硬上限（事实层：传 100 会报参数校验失败） */
const SUB_PAGE_SIZE = 50;

// ============ 通用工具 ============

function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

function deepClone(v) {
  if (v === undefined || v === null) return v;
  return JSON.parse(JSON.stringify(v));
}

/**
 * 深比较 —— 键集合级：多余键、缺失键、值不等都算差异。
 * 这是防护 5「除目标字段外必须一字不差」的比较基准，不允许"只比共有键"的宽松实现。
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return isNaN(a) && isNaN(b) ? true : a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { if (!deepEqual(a[i], b[i])) return false; }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a); const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

// ============ 字段类型判定 ============

function isTableField(fieldId) { return typeof fieldId === 'string' && fieldId.startsWith(TABLE_PREFIX); }
function isAssocField(fieldId) { return typeof fieldId === 'string' && fieldId.startsWith(ASSOC_PREFIX); }
function isSelectField(fieldId) { return typeof fieldId === 'string' && fieldId.startsWith(SELECT_PREFIX); }
function isDateField(fieldId) { return typeof fieldId === 'string' && fieldId.startsWith(DATE_PREFIX); }
function isNumberField(fieldId) { return typeof fieldId === 'string' && fieldId.startsWith(NUMBER_PREFIX); }
function isComplexField(fieldId) { return COMPLEX_FIELD_PREFIXES.some(p => typeof fieldId === 'string' && fieldId.startsWith(p)); }

// ============ 值规范化（防护 2/3 的值形态部分） ============

/**
 * 关联表单字段值规范化 —— 防护 2：associationFormField_* 必须以数组回写，
 * 写入字符串会把关联置空。字符串化的 JSON 数组允许（自动解包），其余一律中止。
 * @returns {Array} 对象数组，每项必须含 instanceId
 */
function normalizeAssociationValue(fieldId, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isPlainObject(item) || !item.instanceId) {
        throw new Error(`[关联字段格式错误] ${fieldId} 的数组项必须是含 instanceId 的对象（如 [{"instanceId":"FINST-xxx","title":"显示名"}]），当前项: ${JSON.stringify(item)}`);
      }
    }
    return deepClone(value);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('[')) {
      let parsed;
      try { parsed = JSON.parse(s); } catch (e) {
        throw new Error(`[关联字段格式错误] ${fieldId} 是"字符串化 JSON"但解析失败（${e.message}）。请传对象数组，切勿自行 JSON.stringify 后当字符串传。`);
      }
      return normalizeAssociationValue(fieldId, parsed);
    }
    // 非数组字符串直接写入 = 服务端把关联当字符串处理 = 关联被置空（2026-10-29 事故坑 2）
    throw new Error(`[关联字段格式错误] ${fieldId} 传入了非数组字符串，服务端会把它当成普通字符串导致关联关系被清空。必须传对象数组 [{instanceId, title}]。`);
  }
  throw new Error(`[关联字段格式错误] ${fieldId} 只接受对象数组，当前类型: ${typeof value}`);
}

/** 日期字段：YYYY-MM-DD / YYYY-MM-DD HH:mm[:ss] 字符串 → 13 位本地时区毫秒时间戳（事实层：API 直写日期必须毫秒时间戳） */
function normalizeDateValue(fieldId, value) {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{13}$/.test(s)) return Number(s);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
    }
    throw new Error(`[日期格式错误] ${fieldId} 只接受 13 位毫秒时间戳或 YYYY-MM-DD[ HH:mm[:ss]]，当前: "${value}"`);
  }
  if (value === null || value === '') return value;
  throw new Error(`[日期格式错误] ${fieldId} 无法识别的值类型: ${typeof value}`);
}

/** 数字字段：可转数字的字符串自动转 Number；空串允许（清空语义）；其余中止 */
function normalizeNumberValue(fieldId, value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return '';
    if (!isNaN(Number(s))) return Number(s);
    throw new Error(`[数字格式错误] ${fieldId} 无法转成数字: "${value}"`);
  }
  if (value === null) return value;
  throw new Error(`[数字格式错误] ${fieldId} 无法识别的值类型: ${typeof value}`);
}

/**
 * 下拉字段规范化 —— 防护 3：下拉字段优先取 <field>_id（选项实际值），避免显示值破坏选项映射。
 * 规则（ctxMain/ctxRow 为写入前快照上下文）:
 *   - 值与快照显示值相同（即用户其实没改这个字段）→ 写快照的 _id 实际值（保映射不变）
 *   - 值是新的（用户要换选项）→ 透传显示值，由服务端解析；写入后回读断言兜底，
 *     并在 meta 中标记 wrote:'display'，断言时该字段的 _id 镜像按"服务端重算"宽容处理
 */
function normalizeSelectValue(fieldId, value, ctx) {
  const idKey = `${fieldId}_id`;
  const snap = ctx || {};
  if (Object.prototype.hasOwnProperty.call(snap, idKey) && snap[idKey] !== undefined && snap[idKey] !== null) {
    if (deepEqual(value, snap[fieldId])) {
      return { value: deepClone(snap[idKey]), wrote: '_id' };
    }
    return { value: deepClone(value), wrote: 'display' };
  }
  return { value: deepClone(value), wrote: 'raw' };
}

/**
 * 主表/子表单元格写入值统一规范化入口
 * @returns {{value:any, wrote?:string}} wrote 仅下拉字段有
 */
function normalizeCellValue(fieldId, value, ctx) {
  if (isAssocField(fieldId)) return { value: normalizeAssociationValue(fieldId, value) };
  if (isDateField(fieldId)) return { value: normalizeDateValue(fieldId, value) };
  if (isNumberField(fieldId)) return { value: normalizeNumberValue(fieldId, value) };
  if (isSelectField(fieldId)) return normalizeSelectValue(fieldId, value, ctx);
  return { value: deepClone(value === undefined ? null : value) };
}

// ============ instValue 解析（防护 1 的纯逻辑部分） ============

/**
 * 解析 getFormDataById / getInstanceById 返回记录中的 instValue 为 fullRead 的 main/tables。
 * instValue 三种历史形态兼容：JSON 字符串 / [{fieldId, fieldData:{value}}] 数组 / 扁平对象。
 * 🔴 防护 1：禁止用 formData 判断子表行数（formData 只含前 50 行）；本函数只处理 instValue。
 * @param {any} rawInstValue - 记录的 instValue 原始值
 * @param {object} formDataFallback - 记录自带的 formData（仅当 instValue 缺失时兜底，主表键仍可用）
 * @returns {{main:object, tables:object}}
 */
function parseInstValue(rawInstValue, formDataFallback) {
  let raw = rawInstValue;
  if (typeof raw === 'string' && raw.trim() !== '') {
    try { raw = JSON.parse(raw); } catch (e) { raw = undefined; }
  }
  const main = {}; const tables = {};

  const absorb = (fieldId, value) => {
    if (!fieldId) return;
    if (isTableField(fieldId)) {
      tables[fieldId] = Array.isArray(value) ? deepClone(value) : [];
    } else {
      main[fieldId] = value === undefined ? null : deepClone(value);
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && item.fieldId) absorb(item.fieldId, item.fieldData ? item.fieldData.value : null);
    }
  } else if (isPlainObject(raw)) {
    for (const [k, v] of Object.entries(raw)) absorb(k, v);
  }

  // instValue 缺失/为空时才允许用 formData 兜底主表键（子表键禁止 —— 防护 1）
  if (Object.keys(main).length === 0 && Object.keys(tables).length === 0 && isPlainObject(formDataFallback)) {
    for (const [k, v] of Object.entries(formDataFallback)) {
      if (!isTableField(k)) main[k] = deepClone(v);
    }
  }
  return { main, tables };
}

/**
 * 子表分页读取结果交叉校验 —— 防护 1：以 totalCount 为准，分页累积行数必须一致。
 * @param {Array} accumulatedRows - 分页累积的全部行
 * @param {number} totalCount - 接口报告的总行数
 * @param {string} tableFieldId - 表单的 tableField ID
 */
function assertSubRowCount(accumulatedRows, totalCount, tableFieldId) {
  if (!Array.isArray(accumulatedRows)) {
    throw new Error(`[子表读取失败] ${tableFieldId} 分页结果不是数组`);
  }
  if (accumulatedRows.length !== Number(totalCount)) {
    throw new Error(
      `[子表行数不一致] ${tableFieldId}: 分页累积 ${accumulatedRows.length} 行 ≠ totalCount ${totalCount}。` +
      `可能原因：读取过程中数据被并发修改，或分页 pageSize 超上限被静默截断。禁止继续写入，请重试。`
    );
  }
}

// ============ changes 形态守卫与分拣 ============

/**
 * 把用户 changes 分拣为 {main:{fid:v}, tables:{tf:[{rowId, cols:{fid:v}}]}}，同时做形态守卫。
 * 触发中止（throw）的情形：
 *   - changes 为空 / 不是对象
 *   - 子表键的值不是非空数组、行缺 rowId、行没有任何要改的列
 *   - 任何复杂控件列（附件/图片/签名）出现在改动目标里 —— 本工具不支持写入此类控件
 * @param {object} changes - { fieldId: value | tableFieldId: [{rowId, colId: value}] }
 */
function sortAndGuardChanges(changes) {
  if (!isPlainObject(changes) || Object.keys(changes).length === 0) {
    throw new Error('[changes 非法] changes 必须是非空对象: { 字段ID: 值 } 或 { 子表ID: [{rowId, 列ID: 值}] }');
  }
  const main = {}; const tables = {};
  for (const [key, val] of Object.entries(changes)) {
    if (key.endsWith('_id')) {
      throw new Error(`[禁止直接传 _id 镜像键] ${key}：请用不带 _id 后缀的字段ID，本工具自动处理实际值/显示值与镜像同步`);
    }
    if (isTableField(key)) {
      if (!Array.isArray(val) || val.length === 0) {
        throw new Error(`[子表改动非法] ${key} 必须是非空数组 [{rowId, 列ID: 值}]`);
      }
      const rows = [];
      for (const r of val) {
        if (!isPlainObject(r) || typeof r.rowId !== 'string' || r.rowId.trim() === '') {
          throw new Error(`[子表改动非法] ${key} 的每一行都必须带非空 rowId 字符串（行标识），当前: ${JSON.stringify(r)}`);
        }
        const cols = {};
        for (const [ck, cv] of Object.entries(r)) {
          if (ck === 'rowId') continue;
          if (ck.endsWith('_id')) {
            throw new Error(`[禁止直接传 _id 镜像键] ${key} 行 ${r.rowId} 的列 ${ck}：请用不带 _id 后缀的列ID，本工具自动处理`);
          }
          if (isComplexField(ck)) {
            throw new Error(`[复杂控件不支持] 子表列 ${ck}（附件/图片/签名类）不支持通过本工具写入，已中止。请到页面手动操作。`);
          }
          cols[ck] = cv;
        }
        if (Object.keys(cols).length === 0) {
          throw new Error(`[子表改动非法] ${key} 的行 ${r.rowId} 除 rowId 外没有任何要修改的列`);
        }
        rows.push({ rowId: r.rowId, cols });
      }
      tables[key] = rows;
    } else {
      if (isComplexField(key)) {
        throw new Error(`[复杂控件不支持] 主表字段 ${key}（附件/图片/签名类）不支持通过本工具写入，已中止。请到页面手动操作。`);
      }
      main[key] = val;
    }
  }
  if (Object.keys(main).length === 0 && Object.keys(tables).length === 0) {
    throw new Error('[changes 非法] 分拣后没有任何有效改动');
  }
  return { main, tables };
}

/**
 * 复杂控件守卫 —— 防护 2：子表整表回写时，未改行的复杂控件列若有值，
 * 回写后该列会被原样带上（保真），但读取形态与写入形态不同构，无法保证不被破坏 → 直接中止。
 * @param {object} before - fullRead
 * @param {object} sorted - sortAndGuardChanges 的产出
 */
function guardComplexFieldsOnFullRewrite(before, sorted) {
  for (const tfId of Object.keys(sorted.tables)) {
    const rows = (before.tables && before.tables[tfId]) || [];
    for (const row of rows) {
      for (const colKey of Object.keys(row)) {
        if (colKey === 'rowId') continue;
        if (isComplexField(colKey) && row[colKey] !== null && row[colKey] !== undefined && row[colKey] !== '') {
          throw new Error(
            `[复杂控件中止] 子表 ${tfId} 的行 ${row.rowId} 中复杂控件列 ${colKey} 非空。` +
            `整表回写无法保证该控件保真（读取/写入形态不同构），已中止。请改用页面操作，或把该子表的修改改为逐条新增行方案。`
          );
        }
      }
    }
  }
}

// ============ payload 构建（防护 2/3 的组装部分） ============

/**
 * 构建写入载荷 updateFormDataJson。
 * 语义：
 *   - 主表：只包含目标字段（不整主表回写，缩小风险面）
 *   - 子表：整表回写 —— 全量行数组，改动的行 merge 用户改动，未改的行原样深拷贝；行自动携带 rowId
 * 🔴 行缺 rowId 直接中止（宁可失败不可丢行/丢行标识）。
 *
 * @param {object} before - 写入前 fullRead（R1）
 * @param {object} sorted - sortAndGuardChanges 产出
 * @returns {{payload:object, meta:object, ledgerEntries:Array}}
 *   meta.mainWrites:  { fid: { wrote: '_id'|'display'|'raw' } }（下拉语义，断言镜像宽容用）
 *   meta.tableWrites: { tfId: { rowId: [colId, ...] } }
 */
function buildUpdatePayload(before, sorted) {
  if (!isPlainObject(before) || !isPlainObject(before.main)) {
    throw new Error('[快照缺失] before.main 不存在，禁止构建写入载荷');
  }
  const payload = {}; const meta = { mainWrites: {}, tableWrites: {} }; const ledgerEntries = [];

  // —— 主表目标字段 ——
  for (const [fid, rawVal] of Object.entries(sorted.main)) {
    const norm = normalizeCellValue(fid, rawVal, before.main);
    payload[fid] = norm.value;
    if (norm.wrote) meta.mainWrites[fid] = { wrote: norm.wrote };
    ledgerEntries.push({ target: fid, oldValue: deepClone(before.main[fid]), newValue: deepClone(norm.value) });
  }

  // —— 子表整表回写 ——
  for (const [tfId, wantedRows] of Object.entries(sorted.tables)) {
    const beforeRows = (before.tables && before.tables[tfId]) || null;
    if (!Array.isArray(beforeRows)) {
      throw new Error(`[子表不存在] 快照中没有子表 ${tfId} 的行数据（tables 未采集或表单中无此子表），禁止盲写`);
    }
    const byRowId = new Map(beforeRows.map(r => [String(r.rowId), r]));
    meta.tableWrites[tfId] = {};
    const outRows = beforeRows.map(row => {
      if (row.rowId === undefined || row.rowId === null || String(row.rowId).trim() === '') {
        throw new Error(`[rowId 缺失] 子表 ${tfId} 存在没有 rowId 的行，整表回写会丢行标识，已中止。请先用页面编辑保存一次该记录（可让存量行补上标识），再重试。`);
      }
      const rowId = String(row.rowId);
      const wanted = wantedRows.find(w => String(w.rowId) === rowId);
      if (!wanted) return deepClone(row); // 未改行：原样保真
      const merged = deepClone(row);
      merged.rowId = row.rowId; // 防护 2：行内必须带 rowId
      for (const [colId, rawVal] of Object.entries(wanted.cols)) {
        const norm = normalizeCellValue(colId, rawVal, row);
        merged[colId] = norm.value;
        if (norm.wrote) {
          meta.tableWrites[tfId][rowId] = meta.tableWrites[tfId][rowId] || {};
          meta.tableWrites[tfId][rowId][colId] = { wrote: norm.wrote };
        }
        ledgerEntries.push({ target: `${tfId}.${rowId}.${colId}`, oldValue: deepClone(row[colId]), newValue: deepClone(norm.value) });
      }
      return merged;
    });
    for (const w of wantedRows) {
      if (!byRowId.has(String(w.rowId))) {
        throw new Error(`[rowId 不存在] 子表 ${tfId} 中找不到行 ${w.rowId}（快照共 ${beforeRows.length} 行）。本工具不支持新增子表行，请用 data-tester 提交或页面操作。`);
      }
    }
    payload[tfId] = outRows;
  }

  return { payload, meta, ledgerEntries };
}

// ============ 写后断言（防护 5）与镜像规则 ============

/**
 * 下拉字段的断言形态感知（验收用例 3：选项实际值与显示值不一致）：
 *   - wrote:'_id'（把快照 _id 实际值写回主键）→ 断言落在 _id 镜像键上（镜像恒等于实际值），
 *     主键（显示值）由服务端重算 → 只 warn；
 *   - wrote:'display'（写新显示值）→ 断言落在主键上，_id 镜像由服务端按选项解析重算 → 只 warn；
 *   - wrote:'raw' / 关联数组 / 其他 → 直接断言主键，镜像键参与"一字不差"严格比对。
 * 关联字段（associationFormField_*）主键与 _id 镜像同为对象数组形态，写入主键后镜像同步 → 严格比对即可。
 */

/**
 * 写后回读断言 —— 防护 5：目标字段 == 期望值；非目标字段与写前快照一字不差（含 _id 镜像与关联数组）。
 * before/after 必须是同一读取管线的 fullRead；after 缺行/缺键/多键都算差异（键集合级）。
 * @returns {{ok:boolean, diffs:Array, warnings:Array}}
 *   diffs: [{path, kind:'target-mismatch'|'unexpected-change'|'key-lost'|'key-added'|'row-count-mismatch'|'row-missing', ...}]
 */
function assertAfterWrite(before, after, payload, meta) {
  const m = meta || { mainWrites: {}, tableWrites: {} };
  const diffs = []; const warnings = [];
  const beforeMain = before.main || {}; const afterMain = after.main || {};

  const payloadMain = {}; const payloadTables = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (isTableField(k)) payloadTables[k] = v; else payloadMain[k] = v;
  }
  const targetKeys = Object.keys(payloadMain);

  // —— 主表目标字段 ——
  const mirrorAsserted = new Set();  // 已在目标分支断言过的 _id 镜像键
  const tolerantKeys = new Set();    // 服务端重算、只 warn 不 fail 的键
  for (const k of targetKeys) {
    const w = m.mainWrites[k];
    if (w && w.wrote === '_id' && Object.prototype.hasOwnProperty.call(afterMain, `${k}_id`)) {
      mirrorAsserted.add(`${k}_id`); tolerantKeys.add(k);
      if (!deepEqual(afterMain[`${k}_id`], payloadMain[k])) {
        diffs.push({ path: `main.${k}_id`, kind: 'target-mismatch', expect: payloadMain[k], after: afterMain[`${k}_id`], before: beforeMain[`${k}_id`] });
      }
      if (!deepEqual(beforeMain[k], afterMain[k])) {
        warnings.push({ path: `main.${k}`, before: beforeMain[k], after: afterMain[k], reason: '实际值写入后显示值由服务端重算（可接受）' });
      }
    } else {
      if (!deepEqual(afterMain[k], payloadMain[k])) {
        diffs.push({ path: `main.${k}`, kind: 'target-mismatch', expect: payloadMain[k], after: afterMain[k], before: beforeMain[k] });
      }
      if (w && w.wrote === 'display' && !deepEqual(beforeMain[`${k}_id`], afterMain[`${k}_id`])) {
        tolerantKeys.add(`${k}_id`);
      }
    }
  }

  // —— 主表非目标键：与写前快照一字不差 ——
  for (const k of Object.keys(afterMain)) {
    if (targetKeys.includes(k) || mirrorAsserted.has(k)) continue;
    if (!Object.prototype.hasOwnProperty.call(beforeMain, k)) {
      const base = k.endsWith('_id') ? k.slice(0, -3) : null;
      if (base && targetKeys.includes(base)) {
        warnings.push({ path: `main.${k}`, before: undefined, after: afterMain[k], reason: '服务端为写入目标派生的新镜像键（可接受）' });
      } else {
        diffs.push({ path: `main.${k}`, kind: 'key-added', before: undefined, after: afterMain[k] });
      }
      continue;
    }
    if (tolerantKeys.has(k)) {
      if (!deepEqual(beforeMain[k], afterMain[k])) {
        warnings.push({ path: `main.${k}`, before: beforeMain[k], after: afterMain[k], reason: '_id 镜像随显示值写入由服务端重算（可接受）' });
      }
      continue;
    }
    if (!deepEqual(beforeMain[k], afterMain[k])) {
      diffs.push({ path: `main.${k}`, kind: 'unexpected-change', before: beforeMain[k], after: afterMain[k] });
    }
  }
  for (const k of Object.keys(beforeMain)) {
    if (!Object.prototype.hasOwnProperty.call(afterMain, k)) {
      diffs.push({ path: `main.${k}`, kind: 'key-lost', before: beforeMain[k], after: undefined });
    }
  }

  // —— 子表 ——
  const beforeTables = before.tables || {}; const afterTables = after.tables || {};
  const tableIds = new Set([...Object.keys(beforeTables), ...Object.keys(afterTables), ...Object.keys(payloadTables)]);
  for (const tfId of tableIds) {
    const bRows = beforeTables[tfId] || []; const aRows = afterTables[tfId] || [];
    const pRows = payloadTables[tfId] || null;
    if (!pRows) {
      if (!deepEqual(bRows, aRows)) {
        diffs.push({ path: `tables.${tfId}`, kind: 'unexpected-change', before: `${bRows.length} 行`, after: `${aRows.length} 行`, detail: '本次未写入该子表，但回读发生变化' });
      }
      continue;
    }
    if (aRows.length !== pRows.length) {
      diffs.push({ path: `tables.${tfId}`, kind: 'row-count-mismatch', expect: pRows.length, after: aRows.length });
      continue;
    }
    const touched = (m.tableWrites && m.tableWrites[tfId]) || {};
    const aByRowId = new Map(aRows.map(r => [r.rowId === undefined ? null : String(r.rowId), r]));
    pRows.forEach((pRow, idx) => {
      const bRow = bRows[idx] || {};
      const key = bRow.rowId !== undefined ? String(bRow.rowId) : null;
      const aRow = (key !== null && aByRowId.has(key)) ? aByRowId.get(key) : aRows[idx];
      if (!aRow) { diffs.push({ path: `tables.${tfId}[${idx}]`, kind: 'row-missing', rowId: bRow.rowId }); return; }
      const rowIdLabel = `tables.${tfId}[${idx}](rowId=${bRow.rowId !== undefined ? bRow.rowId : idx})`;
      if (bRow.rowId !== undefined && !deepEqual(bRow.rowId, aRow.rowId)) {
        diffs.push({ path: `${rowIdLabel}.rowId`, kind: 'unexpected-change', before: bRow.rowId, after: aRow.rowId });
      }
      const pCols = {}; for (const [c, v] of Object.entries(pRow)) { if (c !== 'rowId') pCols[c] = v; }
      const targetCols = Object.keys(pCols);
      const rowMirrorAsserted = new Set(); const rowTolerant = new Set();
      const rowTouched = touched[String(bRow.rowId)] || null;

      // 目标列断言（与主表同款形态感知）
      for (const c of targetCols) {
        const w = rowTouched && rowTouched[c];
        if (w && w.wrote === '_id' && Object.prototype.hasOwnProperty.call(aRow, `${c}_id`)) {
          rowMirrorAsserted.add(`${c}_id`); rowTolerant.add(c);
          if (!deepEqual(aRow[`${c}_id`], pCols[c])) {
            diffs.push({ path: `${rowIdLabel}.${c}_id`, kind: 'target-mismatch', expect: pCols[c], after: aRow[`${c}_id`], before: bRow[`${c}_id`] });
          }
          if (!deepEqual(bRow[c], aRow[c])) {
            warnings.push({ path: `${rowIdLabel}.${c}`, before: bRow[c], after: aRow[c], reason: '实际值写入后显示值由服务端重算（可接受）' });
          }
        } else {
          if (!deepEqual(aRow[c], pCols[c])) {
            diffs.push({ path: `${rowIdLabel}.${c}`, kind: 'target-mismatch', expect: pCols[c], after: aRow[c], before: bRow[c] });
          }
          if (w && w.wrote === 'display' && !deepEqual(bRow[`${c}_id`], aRow[`${c}_id`])) {
            rowTolerant.add(`${c}_id`);
          }
        }
      }

      // 非目标列：与写前行一字不差
      const colKeys = new Set([...Object.keys(bRow).filter(c => c !== 'rowId'), ...Object.keys(aRow).filter(c => c !== 'rowId')]);
      for (const c of colKeys) {
        if (targetCols.includes(c) || rowMirrorAsserted.has(c)) continue;
        const inB = Object.prototype.hasOwnProperty.call(bRow, c);
        const inA = Object.prototype.hasOwnProperty.call(aRow, c);
        if (!inB && inA) {
          const base = c.endsWith('_id') ? c.slice(0, -3) : null;
          if (base && targetCols.includes(base)) {
            warnings.push({ path: `${rowIdLabel}.${c}`, before: undefined, after: aRow[c], reason: '服务端为写入目标派生的新镜像键（可接受）' });
          } else {
            diffs.push({ path: `${rowIdLabel}.${c}`, kind: 'key-added', before: undefined, after: aRow[c] });
          }
          continue;
        }
        if (inB && !inA) { diffs.push({ path: `${rowIdLabel}.${c}`, kind: 'key-lost', before: bRow[c], after: undefined }); continue; }
        if (rowTolerant.has(c)) {
          if (!deepEqual(bRow[c], aRow[c])) {
            warnings.push({ path: `${rowIdLabel}.${c}`, before: bRow[c], after: aRow[c], reason: '_id 镜像随显示值写入由服务端重算（可接受）' });
          }
          continue;
        }
        if (!deepEqual(bRow[c], aRow[c])) {
          diffs.push({ path: `${rowIdLabel}.${c}`, kind: 'unexpected-change', before: bRow[c], after: aRow[c] });
        }
      }
    });
  }

  return { ok: diffs.length === 0, diffs, warnings };
}

// ============ 回滚计划（防护 6 的计划部分） ============

/**
 * 由写前快照与已执行载荷生成回滚载荷：把被写过的字段/子表恢复为写前值。
 * 主表只回写被触及的键：
 *   - 值取写前快照；快照中不存在该键 → 传 ''（清空语义）
 *   - 下拉字段写快照的 _id 实际值（保选项映射，与防护 3 同款），meta 标 wrote:'_id' 让断言宽容显示值重算
 * 子表整表回写 before 全量行（最保真）。
 * @returns {{payload:object, meta:object, note:string, touched:number}}
 */
function buildRollbackPayload(before, appliedPayload) {
  if (!isPlainObject(before) || !isPlainObject(before.main)) {
    throw new Error('[快照缺失] before.main 不存在，禁止构建回滚载荷');
  }
  const payload = {}; const meta = { mainWrites: {}, tableWrites: {} };
  let touched = 0;
  for (const k of Object.keys(appliedPayload || {})) {
    if (isTableField(k)) {
      payload[k] = deepClone((before.tables && before.tables[k]) || []);
      meta.tableWrites[k] = {};
      touched++;
    } else if (isSelectField(k) && before.main[`${k}_id`] !== undefined && before.main[`${k}_id`] !== null) {
      payload[k] = deepClone(before.main[`${k}_id`]);
      meta.mainWrites[k] = { wrote: '_id' };
      touched++;
    } else {
      payload[k] = deepClone(before.main[k] !== undefined && before.main[k] !== null ? before.main[k] : '');
      touched++;
    }
  }
  return { payload, meta, note: `回滚 ${touched} 个写入目标为写前快照值`, touched };
}

module.exports = {
  FDU_VERSION,
  COMPLEX_FIELD_PREFIXES,
  SUB_PAGE_SIZE,
  isPlainObject, deepClone, deepEqual,
  isTableField, isAssocField, isSelectField, isDateField, isNumberField, isComplexField,
  normalizeAssociationValue, normalizeDateValue, normalizeNumberValue, normalizeSelectValue, normalizeCellValue,
  parseInstValue, assertSubRowCount,
  sortAndGuardChanges, guardComplexFieldsOnFullRewrite,
  buildUpdatePayload, assertAfterWrite, buildRollbackPayload,
};
