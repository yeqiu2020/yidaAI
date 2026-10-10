/**
 * lib/sync-server/schema-push.js — 表单 Schema 配置推送（事件绑定/数据源/公式/校验/函数注册表）
 *
 * 【授权背景】2026-09-30 用户授权将规则 8 的推送范围从"仅动作代码"扩展为
 * "动作代码 + 字段事件绑定 + 远程数据源 + 字段公式 + 字段校验规则"一次性推送
 * （"一次性做到位，就不需要用户自己去动手了"）。字段结构（增删字段/改字段类型）
 * 仍走"本地生成 → 手动复制粘贴"，不在授权范围内。
 *
 * 【Schema 结构依据】2026-09-30 线上 getFormSchema.json（schemaVersion=V5）实测量测：
 * - 完整 Schema 顶层：gmtModified/i18nData/pages/schemaVersion/schemaType/actions/config/i18n/status
 * - 组件树：pages[0].componentsTree（本地旧格式 JSON 则为顶层 componentsTree，两者都兼容）
 * - 事件绑定：组件 props.<事件名>.events = [{name,id,params,type:'actionRef',uuid:'时间戳_序号'}]
 *   （didMount 等生命周期导出函数无需绑定，自动执行）
 * - 远程数据源：pages[0].componentsTree[0].dataSource.online[] 条目
 *   {dpType:'REMOTE', dataHandler:{source,compiled,type:'js'}, requestHandler:{type:'JSExpression',
 *    value:'this.utils.legaoBuiltin.dataSourceHandler'}, name, options:{url,method,params,isSync,shouldFetch,loadType},
 *    description, id, protocal:'REMOTE', type:'legao', isInit, formUuid}
 *   代码内通过 this.dataSourceMap['<name>'].load(params) 调用
 * - 字段公式：props.formula = "<公式串>" + props.complexValue = {complexType:'formula', formula:'<同串>'}
 *   + props.valueType = 'formula'（设计器渲染公式面板的开关；API 创建的表单字段默认
 *    'custom'，漏写会导致公式落盘但设计器不显示，2026-10-01 推送演示实测沉淀）
 *   （非公式字段为 {complexType:'custom', formula:'', value:''}；数据联动/流水号为设计器生成的
 *    复杂结构，不在本模块推送范围）
 * - 校验规则：props.validation = [{type:'required'}, {type:'maxLength', param:'25'}, ...]
 *   自定义函数校验条目（2026-10-01 用户手配金标准固化，夹具 tests/fixtures/schema-push_自定义校验金标准.json）：
 *   {type:'customValidate', param:{source:'<validateRule源码>', compiled:'function main(){...}', type:'js', error:{}},
 *    message:{en_US:'', zh_CN:'<错误提示>', type:'i18n'}} —— 自包含结构，不依赖 actions.module
 * - 函数注册表：actions.list = [{id, title}, ...]（设计器绑定下拉框数据来源）
 *
 * 创建日期：2026-09-30
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** 推送内容声明文件名（位于表单目录「代码」文件夹内） */
const PUSH_CONFIG_NAME = '推送配置.json';
/** 推送前全量 Schema 备份文件名（滚动覆盖） */
const SCHEMA_BACKUP_NAME = 'Schema备份_推送前.json';

/* ================== 基础工具 ================== */

/**
 * 从动作代码 source 中提取全部导出函数名（与 action-code-sync.buildCompiled 同一套解析规则）
 */
function extractExportNames(source) {
  const names = new Set();
  const src = String(source || '');
  let m;
  const reFn = /export\s+(?:async\s+)?function\s+(\w+)/g;
  while ((m = reFn.exec(src)) !== null) names.add(m[1]);
  const reDecl = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = reDecl.exec(src)) !== null) names.add(m[1]);
  const reList = /export\s*\{([^}]*)\}/g;
  while ((m = reList.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      const asM = seg.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asM) names.add(asM[2]);
      else if (/^[A-Za-z_$][\w$]*$/.test(seg)) names.add(seg);
    }
  }
  return [...names];
}

/** 生成数据源 id（仿线上形态：39 位大写字母数字） */
function genDataSourceId(existingIds) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let id = '';
    for (let i = 0; i < 39; i++) id += chars[Math.floor(Math.random() * chars.length)];
    if (!existingIds || !existingIds.has(id)) return id;
  }
  return 'DS' + Date.now() + 'PUSH';
}

/** 取组件树（兼容线上 V5 pages 包裹格式与本地旧版顶层格式） */
function getComponentsTree(schema) {
  if (schema && Array.isArray(schema.pages) && schema.pages[0] && Array.isArray(schema.pages[0].componentsTree)) {
    return schema.pages[0].componentsTree;
  }
  if (schema && Array.isArray(schema.componentsTree)) {
    return schema.componentsTree;
  }
  return null;
}

/** 读组件中文名（label 兼容 {zh_CN} 对象与纯字符串两种形态） */
function readComponentLabel(component) {
  const label = component && component.props && component.props.label;
  if (!label) return '';
  if (typeof label === 'string') return label;
  return label.zh_CN || '';
}

/* ================== 字段定位 ================== */

/**
 * 在组件树中定位目标组件
 * @param {Array} componentsTree
 * @param {string} fieldRef - 字段ID（fieldId）或唯一中文名（label.zh_CN）
 * @returns {{component: object, matchedBy: 'fieldId'|'label'}} 或抛错
 * 定位失败/歧义时抛错，错误信息附带可用的字段清单片段（方便 AI/用户修正配置）
 */
function findComponent(componentsTree, fieldRef) {
  if (!fieldRef || typeof fieldRef !== 'string') {
    throw new Error('字段引用为空');
  }
  const byId = [];
  const byLabel = [];
  (function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 20) return;
    if (Array.isArray(node)) { node.forEach(c => walk(c, depth + 1)); return; }
    if (node && node.props && typeof node.props === 'object') {
      if (node.props.fieldId === fieldRef) byId.push(node);
      else {
        const label = readComponentLabel(node);
        if (label && label === fieldRef) byLabel.push(node);
      }
    }
    for (const k of Object.keys(node)) walk(node[k], depth + 1);
  })(componentsTree, 0);

  if (byId.length === 1) return { component: byId[0], matchedBy: 'fieldId' };
  if (byId.length > 1) {
    throw new Error(`字段引用「${fieldRef}」按 fieldId 匹配到 ${byId.length} 个组件（异常情况），已拦截`);
  }
  if (byLabel.length === 1) return { component: byLabel[0], matchedBy: 'label' };
  if (byLabel.length > 1) {
    const ids = byLabel.map(c => c.props.fieldId).join('、');
    throw new Error(`字段引用「${fieldRef}」按中文名匹配到 ${byLabel.length} 个同名字段（${ids}），请在推送配置.json 中改用字段ID精确定位`);
  }
  // 未命中：收集现存字段清单片段辅助排错
  const known = [];
  (function collect(node, depth) {
    if (!node || typeof node !== 'object' || depth > 20 || known.length >= 8) return;
    if (Array.isArray(node)) { node.forEach(c => collect(c, depth + 1)); return; }
    if (node && node.props && node.props.fieldId) {
      known.push(`${node.props.fieldId}(${readComponentLabel(node) || '未命名'})`);
    }
    for (const k of Object.keys(node)) collect(node[k], depth + 1);
  })(componentsTree, 0);
  throw new Error(`找不到字段「${fieldRef}」。当前表单可用字段（前 ${known.length} 个）：${known.join('、')}`);
}

/* ================== 1. 字段事件绑定 ================== */

/**
 * 应用事件绑定配置（upsert，幂等）
 * @param {object} schema - 线上完整 Schema（就地修改）
 * @param {Array<{field:string, event:string, fn:string, params?:object}>} bindings
 * @param {string[]} exportNames - 推送代码的导出函数名集合（交叉校验用，可空则跳过校验）
 * @returns {{total:number, added:number, skipped:number, details:Array<{field,event,fn,action:'added'|'skipped',matchedBy}>}}
 */
function applyBindings(schema, bindings, exportNames) {
  const componentsTree = getComponentsTree(schema);
  if (!componentsTree) throw new Error('Schema 中找不到组件树（pages[0].componentsTree）');
  const exportsSet = new Set(exportNames || []);
  const details = [];
  let added = 0, skipped = 0;

  for (const b of (bindings || [])) {
    if (!b || typeof b !== 'object') throw new Error('bindings 中存在非对象条目');
    const { field, event, fn } = b;
    if (!field || !event || !fn) {
      throw new Error(`事件绑定条目缺少必填项（field/event/fn）：${JSON.stringify(b)}`);
    }
    if (!/^on[A-Z]\w*$/.test(event)) {
      throw new Error(`事件名不合法：「${event}」（需以 on 开头驼峰，如 onChange/onClick/onDelClick）`);
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(fn)) {
      throw new Error(`函数名不合法：「${fn}」`);
    }
    if (exportsSet.size > 0 && !exportsSet.has(fn)) {
      throw new Error(`绑定引用的函数「${fn}」（字段 ${field}，事件 ${event}）在推送代码的导出函数中不存在。` +
        `当前导出：${[...exportsSet].join('、') || '（无）'}。请检查函数名拼写，或确认该函数已 export。`);
    }

    const { component, matchedBy } = findComponent(componentsTree, field);
    const props = component.props;
    if (!props[event] || typeof props[event] !== 'object' || Array.isArray(props[event])) {
      props[event] = {};
    }
    if (!Array.isArray(props[event].events)) {
      // 事件容器已存在（如联动写入的其它键）时不破坏既有键，仅补 events 数组
      props[event].events = [];
    }
    const events = props[event].events;
    const exists = events.some(e => e && e.type === 'actionRef' && e.name === fn);
    if (exists) {
      skipped++;
      details.push({ field, event, fn, action: 'skipped', matchedBy, note: '已存在同名绑定' });
      continue;
    }
    events.push({
      name: fn,
      id: fn,
      params: b.params && typeof b.params === 'object' ? b.params : {},
      type: 'actionRef',
      uuid: `${Date.now()}_${events.length}`
    });
    added++;
    details.push({ field, event, fn, action: 'added', matchedBy });
  }

  return { total: details.length, added, skipped, details };
}

/* ================== 2. 远程数据源 ================== */

/**
 * 应用远程数据源配置（同名整条替换，否则新增；幂等）
 * @param {object} schema
 * @param {Array<{name:string, description?:string, url:string, method?:string, params?:Array, isInit?:boolean, didFetch?:string}>} dataSources
 * @param {{formUuid:string}} meta
 * @returns {{total, added, updated, details:Array<{name, action:'added'|'updated', url}>}}
 */
function applyDataSources(schema, dataSources, meta) {
  const componentsTree = getComponentsTree(schema);
  if (!componentsTree) throw new Error('Schema 中找不到组件树（pages[0].componentsTree）');
  const pageNode = componentsTree[0];
  if (!pageNode) throw new Error('组件树为空');

  if (!pageNode.dataSource || typeof pageNode.dataSource !== 'object') pageNode.dataSource = {};
  const ds = pageNode.dataSource;
  if (!Array.isArray(ds.online)) ds.online = [];

  const details = [];
  let added = 0, updated = 0;
  const existingIds = new Set(ds.online.map(d => d && d.id).filter(Boolean));

  for (const c of (dataSources || [])) {
    if (!c || typeof c !== 'object') throw new Error('dataSources 中存在非对象条目');
    const { name, url } = c;
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) {
      throw new Error(`数据源名称不合法：「${name}」（需为合法标识符，代码中以 this.dataSourceMap['${name}'] 调用）`);
    }
    if (!url || typeof url !== 'string') {
      throw new Error(`数据源「${name}」缺少 url`);
    }
    if (!url.startsWith('/')) {
      throw new Error(`数据源「${name}」的 url 必须是站内相对路径（以 / 开头，如 /dingtalk/web/APP_XXX/v1/form/getFormDataById.json），当前：${url}`);
    }
    const method = String(c.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
      throw new Error(`数据源「${name}」的 method 不合法：${method}`);
    }
    if (c.params !== undefined && !Array.isArray(c.params)) {
      throw new Error(`数据源「${name}」的 params 必须是数组`);
    }
    if (c.didFetch !== undefined && c.didFetch !== '' && typeof c.didFetch !== 'string') {
      throw new Error(`数据源「${name}」的 didFetch 必须是函数源码字符串`);
    }

    // dataHandler：设计器默认形态为 setState({名字: data}); 自定义 didFetch 时 source/compiled 均用其源码
    const didFetchSrc = (c.didFetch && String(c.didFetch).trim())
      || `function(data, err) { this.setState({${name}: data}); return data; }`;

    const entry = {
      dpType: 'REMOTE',
      dataHandler: { compiled: didFetchSrc, source: didFetchSrc, type: 'js' },
      formUuid: meta && meta.formUuid ? meta.formUuid : '',
      requestHandler: { type: 'JSExpression', value: 'this.utils.legaoBuiltin.dataSourceHandler' },
      isModified: false,
      name,
      options: {
        shouldFetch: true,
        loadType: '',
        method,
        params: Array.isArray(c.params) ? c.params : [],
        isSync: false,
        url
      },
      description: String(c.description || ''),
      id: '',
      protocal: 'REMOTE',
      type: 'legao',
      isInit: c.isInit === undefined ? true : !!c.isInit
    };

    const idx = ds.online.findIndex(d => d && d.name === name);
    if (idx >= 0) {
      // 同名整条替换，保留原 id（避免悬挂引用）
      entry.id = ds.online[idx].id || genDataSourceId(existingIds);
      ds.online[idx] = entry;
      updated++;
      details.push({ name, action: 'updated', url });
    } else {
      entry.id = genDataSourceId(existingIds);
      ds.online.push(entry);
      added++;
      details.push({ name, action: 'added', url });
    }
    existingIds.add(entry.id);
  }

  return { total: details.length, added, updated, details };
}

/* ================== 3. 字段公式 ================== */

/**
 * 校验公式中 #{fieldId} 引用是否都存在于本表单
 * @returns {string[]} 缺失的字段引用列表（空数组 = 通过）
 */
function findMissingFormulaRefs(componentsTree, formula) {
  const known = new Set();
  (function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 20) return;
    if (Array.isArray(node)) { node.forEach(c => walk(c, depth + 1)); return; }
    if (node && node.props && node.props.fieldId) known.add(node.props.fieldId);
    for (const k of Object.keys(node)) walk(node[k], depth + 1);
  })(componentsTree, 0);
  const missing = [];
  for (const m of String(formula || '').matchAll(/#\{([A-Za-z_$][\w$]*)\}/g)) {
    if (!known.has(m[1])) missing.push(m[1]);
  }
  return missing;
}

/**
 * 应用字段公式配置（普通计算公式；数据联动/流水号等设计器复杂结构不在此范围）
 * 公式为空串 = 清除该字段公式
 * @param {Array<{field:string, formula:string}>} formulas
 */
function applyFormulas(schema, formulas) {
  const componentsTree = getComponentsTree(schema);
  if (!componentsTree) throw new Error('Schema 中找不到组件树（pages[0].componentsTree）');
  const details = [];
  let applied = 0, cleared = 0;

  for (const f of (formulas || [])) {
    if (!f || typeof f !== 'object') throw new Error('formulas 中存在非对象条目');
    const { field, formula } = f;
    if (!field || typeof formula !== 'string') {
      throw new Error(`公式条目缺少 field 或 formula（须为字符串）：${JSON.stringify(f)}`);
    }
    if (formula.includes('#{') || formula.includes('FETCH')) {
      // 跨表联动公式（FETCH...）与流水号结构属设计器复杂结构，禁止经此通道推送（防止生成残缺联动）
      if (/FETCH[A-Z]|SERIALNUMBER/.test(formula)) {
        throw new Error(`字段「${field}」的公式包含数据联动（FETCH...）/流水号（SERIALNUMBER...）结构，` +
          `此类公式为设计器生成的复杂结构，暂不支持 API 推送，请在设计器中手工配置`);
      }
      const missing = findMissingFormulaRefs(componentsTree, formula);
      if (missing.length > 0) {
        throw new Error(`字段「${field}」的公式引用了本表单不存在的字段：${missing.join('、')}。已拦截（公式引用错误会静默失效）`);
      }
    }

    const { component, matchedBy } = findComponent(componentsTree, field);
    const props = component.props;
    // 实测结构：props.formula（字符串）与 props.complexValue 两处必须一致；
    // valueType 必须同步置为 'formula'——设计器靠它渲染公式编辑面板，
    // 缺失时（API 创建的表单字段自带 valueType='custom'）公式已落盘但设计器
    // 默认值面板仍显示"自定义"空输入（2026-10-01 推送演示实测事故）
    props.formula = formula;
    if (!props.complexValue || typeof props.complexValue !== 'object' || Array.isArray(props.complexValue)) {
      props.complexValue = {};
    }
    if (formula === '') {
      props.complexValue.complexType = 'custom';
      props.complexValue.formula = '';
      if (props.valueType === 'formula') props.valueType = 'custom';
      cleared++;
    } else {
      props.complexValue.complexType = 'formula';
      props.complexValue.formula = formula;
      props.valueType = 'formula';
      applied++;
    }
    details.push({ field, formula, action: formula === '' ? 'cleared' : 'applied', matchedBy });
  }

  return { total: details.length, applied, cleared, details };
}

/* ================== 4. 字段校验规则 ================== */

/**
 * 生成自定义函数校验的 compiled 包装（设计器编译形态，逐字符对齐金标准）：
 * function main(){\n    \n    'use strict';\n\nvar __compiledFunc__ = <source>;\n    return __compiledFunc__.apply(this, arguments);\n  }
 * 金标准中 compiled 内的 source 会被设计器再做空白归一化（如双空格注释前缀变单空格），
 * 语义等价，故此处嵌入 source 原文即可（前缀/后缀模板必须逐字符一致）。
 */
const CUSTOM_VALIDATE_PREFIX = 'function main(){\n    \n    \'use strict\';\n\nvar __compiledFunc__ = ';
const CUSTOM_VALIDATE_SUFFIX = ';\n    return __compiledFunc__.apply(this, arguments);\n  }';

function compileCustomValidate(source) {
  return CUSTOM_VALIDATE_PREFIX + String(source) + CUSTOM_VALIDATE_SUFFIX;
}

/**
 * 构造 customValidate 校验条目（type=customValidate，param 为 {source, compiled, type:'js', error}）
 * @param {{type:'customValidate', code:string, message:string}} rule - 推送配置.json 中的声明
 */
function buildCustomValidateRule(rule) {
  const code = String(rule.code || '').trim();
  if (!code) {
    throw new Error('customValidate 缺少 code（validateRule 函数源码字符串）');
  }
  if (!/function\s+validateRule\s*\(/.test(code)) {
    throw new Error('customValidate 的 code 必须是 function validateRule(value) {...} 形式的函数声明' +
      '（项目规范固定函数名，见 code-expert references/form-validation/spec.md）');
  }
  const message = String(rule.message || '').trim();
  if (!message) {
    throw new Error('customValidate 缺少 message（校验不通过时展示给填写者的错误提示）');
  }
  return {
    type: 'customValidate',
    param: {
      compiled: compileCustomValidate(code),
      source: code,
      type: 'js',
      error: {}
    },
    message: { en_US: '', zh_CN: message, type: 'i18n' }
  };
}

/**
 * 自定义校验 compiled 语法门禁（node --check，临时文件写系统临时目录后即删）
 * 运行时执行的是 param.compiled（function main 包装），只校验 source 会漏掉包装层拼接错误
 */
function customValidateSyntaxCheck(compiled) {
  const { spawnSync } = require('child_process');
  const os = require('os');
  const tmpFile = path.join(os.tmpdir(), `schema-push-check-${Date.now()}-${process.pid}.cjs`);
  try {
    fs.writeFileSync(tmpFile, compiled, 'utf-8');
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
 * 应用字段校验规则
 * mode='replace'（默认）：整组替换该字段 validation 数组（声明式全量，rules 为空数组 = 清空校验）
 * mode='merge'：按 rule.type 逐条替换/追加，未提及的类型保留原值
 * @param {Array<{field:string, rules:Array<{type:string, param?:string}|{type:'customValidate', code:string, message:string}>, mode?:string}>} validations
 */
function applyValidations(schema, validations) {
  const componentsTree = getComponentsTree(schema);
  if (!componentsTree) throw new Error('Schema 中找不到组件树（pages[0].componentsTree）');
  const details = [];
  let applied = 0;

  for (const v of (validations || [])) {
    if (!v || typeof v !== 'object') throw new Error(`校验条目缺少 field 或 rules（须为数组）：${JSON.stringify(v)}`);
    const { field, rules, mode } = v;
    if (!field || !Array.isArray(rules)) {
      throw new Error(`校验条目缺少 field 或 rules（须为数组）：${JSON.stringify(v)}`);
    }
    for (const r of rules) {
      if (!r || typeof r !== 'object' || !r.type || !/^[a-zA-Z]+$/.test(r.type)) {
        throw new Error(`字段「${field}」的校验规则不合法（需 {type, param?} 对象）：${JSON.stringify(r)}`);
      }
      if (r.type === 'customValidate') {
        // 先构造并做语法门禁（任何失败在改 Schema 前整体抛出）
        const entry = buildCustomValidateRule(r);
        const check = customValidateSyntaxCheck(entry.param.compiled);
        if (!check.ok) {
          throw new Error(`字段「${field}」的自定义校验代码语法校验未通过，已中止：\n${check.error}`);
        }
      }
    }
    const { component, matchedBy } = findComponent(componentsTree, field);
    const props = component.props;
    const oldRules = Array.isArray(props.validation) ? props.validation : [];

    let nextRules;
    if (mode === 'merge') {
      const merged = oldRules.slice();
      for (const r of rules) {
        const next = r.type === 'customValidate' ? buildCustomValidateRule(r) : { ...r };
        const idx = merged.findIndex(x => x && x.type === r.type);
        if (idx >= 0) merged[idx] = next; else merged.push(next);
      }
      nextRules = merged;
    } else {
      nextRules = rules.map(r => (r.type === 'customValidate' ? buildCustomValidateRule(r) : { ...r }));
    }

    if (nextRules.length === 0) delete props.validation;
    else props.validation = nextRules;
    applied++;
    details.push({
      field, action: 'applied', matchedBy,
      before: oldRules.map(r => r.type).join('+') || '（空）',
      after: nextRules.map(r => r.type).join('+') || '（空）'
    });
  }

  return { total: details.length, applied, details };
}

/* ================== 5. 函数注册表（actions.list） ================== */

/**
 * 从动作代码重建 actions.list（只增不删：保留既有条目顺序，追加源码新增导出）
 * 背景：actions.list 是设计器"绑定事件"下拉框的函数清单；旧推送链路只改 module，
 * 新增函数可能不进 list 导致绑定下拉找不到（2026-09-30 发现的潜在缺口）
 * @returns {{count:number, addedNames:string[]}}
 */
function rebuildActionsList(schema, source) {
  if (!schema.actions || typeof schema.actions !== 'object') schema.actions = {};
  if (!Array.isArray(schema.actions.list)) schema.actions.list = [];
  const exportsFound = extractExportNames(source);
  if (exportsFound.length === 0) return { count: schema.actions.list.length, addedNames: [] };

  const existingIds = new Set(schema.actions.list.map(x => x && x.id));
  const addedNames = [];
  for (const name of exportsFound) {
    if (existingIds.has(name)) continue;
    schema.actions.list.push({ id: name, title: name });
    addedNames.push(name);
  }
  return { count: schema.actions.list.length, addedNames };
}

/* ================== 6. 推送配置文件 ================== */

/**
 * 读取并校验表单目录下的 推送配置.json
 * @param {string} formDir - 表单目录
 * @returns {{exists:false} | {exists:true, filePath:string, config:object}}
 * 配置不合法时抛错（含明确原因）
 */
function loadPushConfig(formDir) {
  const codeDir = path.join(formDir, '代码');
  const filePath = path.join(codeDir, PUSH_CONFIG_NAME);
  if (!fs.existsSync(filePath)) return { exists: false };

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    throw new Error(`${PUSH_CONFIG_NAME} 不是合法 JSON：${e.message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${PUSH_CONFIG_NAME} 顶层必须是对象`);
  }
  for (const key of ['bindings', 'dataSources', 'formulas', 'validations']) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) {
      throw new Error(`${PUSH_CONFIG_NAME} 的 ${key} 必须是数组`);
    }
  }
  return { exists: true, filePath, config: raw };
}

/* ================== 7. 推送后回读验证 ================== */

/**
 * 推送保存后回读新 Schema，逐项核对配置已真正落盘（保存成功 ≠ 配置正确）
 * @param {object} freshSchema - 重新拉取的 Schema
 * @param {object} plan - 推送计划 {bindings, dataSources, formulas, validations}
 * @returns {{ok:boolean, checked:number, failures:string[]}}
 */
function verifyPushedSchema(freshSchema, plan) {
  const failures = [];
  let checked = 0;
  let componentsTree;
  try {
    componentsTree = getComponentsTree(freshSchema);
  } catch (e) {
    return { ok: false, checked: 0, failures: [`回读 Schema 无组件树：${e.message}`] };
  }
  if (!componentsTree) return { ok: false, checked: 0, failures: ['回读 Schema 无组件树'] };

  // 绑定核对
  for (const b of (plan.bindings || [])) {
    checked++;
    try {
      const { component } = findComponent(componentsTree, b.field);
      const events = component.props[b.event] && component.props[b.event].events;
      if (!Array.isArray(events) || !events.some(e => e && e.type === 'actionRef' && e.name === b.fn)) {
        failures.push(`绑定未落盘：${b.field}.${b.event} → ${b.fn}`);
      }
    } catch (e) {
      failures.push(`绑定核对失败（${b.field}）：${e.message}`);
    }
  }
  // 数据源核对
  const pageNode = componentsTree[0];
  const online = pageNode && pageNode.dataSource && Array.isArray(pageNode.dataSource.online) ? pageNode.dataSource.online : [];
  for (const c of (plan.dataSources || [])) {
    checked++;
    const found = online.find(d => d && d.name === c.name);
    if (!found) failures.push(`数据源未落盘：${c.name}`);
    else if (found.options && found.options.url !== c.url) failures.push(`数据源 url 不一致：${c.name}`);
    else if ((c.method || 'GET').toUpperCase() !== String(found.options && found.options.method || '').toUpperCase()) {
      failures.push(`数据源 method 不一致：${c.name}`);
    }
  }
  // 公式核对（含 valueType：设计器渲染公式的开关键，2026-10-01 实测事故沉淀）
  for (const f of (plan.formulas || [])) {
    checked++;
    try {
      const { component } = findComponent(componentsTree, f.field);
      const cur = component.props.formula;
      if (cur !== f.formula) failures.push(`公式未落盘（${f.field}）：期望「${f.formula}」实际「${cur}」`);
      const wantVT = f.formula === '' ? 'custom' : 'formula';
      if (component.props.valueType !== wantVT) {
        failures.push(`公式 valueType 不一致（${f.field}）：期望「${wantVT}」实际「${component.props.valueType}」（设计器将不渲染公式）`);
      }
    } catch (e) {
      failures.push(`公式核对失败（${f.field}）：${e.message}`);
    }
  }
  // 校验核对
  for (const v of (plan.validations || [])) {
    checked++;
    try {
      const { component } = findComponent(componentsTree, v.field);
      const cur = Array.isArray(component.props.validation) ? component.props.validation : [];
      const curTypes = cur.map(r => r.type).join('+');
      const wantTypes = v.rules.map(r => r.type).join('+');
      if (v.mode === 'merge') {
        for (const r of v.rules) {
          if (!cur.some(x => x && x.type === r.type)) failures.push(`校验规则缺失（${v.field}.${r.type}）`);
        }
      } else if (curTypes !== wantTypes) {
        failures.push(`校验规则不一致（${v.field}）：期望「${wantTypes}」实际「${curTypes}」`);
      }
      // 自定义函数校验：核对代码逐字符落盘（保存成功 ≠ 配置正确）
      for (const r of v.rules) {
        if (r.type !== 'customValidate') continue;
        const entry = cur.find(x => x && x.type === 'customValidate');
        const wantCode = String(r.code || '').trim();
        if (!entry) { failures.push(`自定义校验缺失（${v.field}）`); continue; }
        if (!entry.param || entry.param.source !== wantCode) {
          failures.push(`自定义校验代码不一致（${v.field}）：期望 ${wantCode.length} 字符，实际 ${entry.param ? entry.param.source.length : 0} 字符`);
        } else if (entry.message && entry.message.zh_CN !== String(r.message || '').trim()) {
          failures.push(`自定义校验提示语不一致（${v.field}）：期望「${r.message}」实际「${entry.message.zh_CN}」`);
        }
      }
    } catch (e) {
      failures.push(`校验核对失败（${v.field}）：${e.message}`);
    }
  }
  return { ok: failures.length === 0, checked, failures };
}

module.exports = {
  PUSH_CONFIG_NAME,
  SCHEMA_BACKUP_NAME,
  CUSTOM_VALIDATE_PREFIX,
  CUSTOM_VALIDATE_SUFFIX,
  extractExportNames,
  getComponentsTree,
  findComponent,
  applyBindings,
  applyDataSources,
  applyFormulas,
  applyValidations,
  buildCustomValidateRule,
  compileCustomValidate,
  rebuildActionsList,
  loadPushConfig,
  verifyPushedSchema,
};
