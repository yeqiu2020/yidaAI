#!/usr/bin/env node
/**
 * form-data-update —— 宜搭已有实例字段修正护栏（执行层样板）
 * 版本: v1.0.0
 * 依据: 《Skill体系优化方案_20261029.md》第六节。强制四步：改前快照 → 执行 → 回读逐字段断言 → 失败自动回滚。
 *
 * 使用方式:
 *   node scripts/form_data_update.js --app APP_XXX --changes changes.json [--form-type receipt|process] [选项]
 *   node scripts/form_data_update.js --rollback <batchId>            # 按 ledger 反向回填
 *
 * 选项:
 *   --app <APP_XXX>          应用 ID（必填，回滚模式除外）
 *   --changes <file>         改动文件（必填，回滚模式除外），结构:
 *                            { "formUuid": "FORM-XXX", "formInstId": "FINST-XXX",
 *                              "changes": { "字段ID": 值, "子表ID": [{ "rowId": "...", "列ID": 值 }] } }
 *                            键一律用 fieldId（中文名→fieldId 查组件ID清单.md）；本工具不支持新增子表行与附件/图片/签名类控件
 *   --form-type <type>       receipt 普通表单 / process 流程表单；缺省自动探测（快照含 processInstanceId → process）
 *   --dry-run                只做快照读取与载荷构建，不写线上
 *   --yes                    跳过交互确认直接写入（AI 必须在用户明确同意本次写入后才可携带）
 *   --rollback <batchId>     按 ledger 目录中的快照反向回填（复用同一套守卫/断言管线）
 *   --ledger-dir <dir>       台账目录，默认 temp-file/fdu-ledger
 *   --json                   末行输出机器可读 FDU_RESULT {...} 单行
 *
 * 退出码: 0 成功（或 dry-run 完成）；1 写入后断言失败（已自动回滚，或回滚也失败需人工介入）；2 未写入即中止
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const lib = require('./fdu_lib.js');
const coreUtils = require('../../../../lib/core/utils');

// 多项目隔离：与 data-clean/data-backup 同款，跟随 YIDA_PROJECT_ROOT 而不是脚本宿主
const SCRIPT_HOST_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PROJECT_ROOT = (process.env.YIDA_PROJECT_ROOT && fs.existsSync(process.env.YIDA_PROJECT_ROOT))
  ? process.env.YIDA_PROJECT_ROOT
  : SCRIPT_HOST_ROOT;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    } else { args._.push(a); }
  }
  return args;
}

function loadSession() {
  const data = coreUtils.loadCookieData(PROJECT_ROOT);
  if (!data) throw new Error('读取 Cookie 失败：.cookies.json 不存在或为空，请先完成登录');
  const cookies = data.cookies || [];
  const baseUrl = data.base_url || 'https://www.aliwork.com';
  return { cookies, baseUrl, hostname: baseUrl.replace(/^https?:\/\//, ''), csrfToken: data.csrf_token || '' };
}

function request(method, session, apiPath, formParams) {
  return new Promise((resolve, reject) => {
    const isPost = method === 'POST';
    let postData = '';
    const headers = {
      'Cookie': session.cookies.map(c => `${c.name}=${c.value}`).join('; '),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': `https://${session.hostname}/`,
    };
    let fullPath = apiPath;
    if (isPost) {
      const params = { ...(formParams || {}), _csrf_token: session.csrfToken };
      postData = querystring.stringify(params);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(postData);
      headers['Origin'] = `https://${session.hostname}`;
    } else {
      headers['Content-Type'] = 'application/json';
    }
    const req = https.request({
      hostname: session.hostname, port: 443, path: fullPath, method,
      headers, timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} @ ${apiPath}: ${body.slice(0, 300)}`));
          return;
        }
        if (body.trim() === '' || body.trim() === 'null') { resolve(null); return; }
        try { resolve(JSON.parse(body)); } catch (e) {
          if (body.includes('<')) reject(new Error(`接口返回非 JSON（疑似登录态失效）@ ${apiPath}，请重新登录`));
          else reject(new Error(`JSON 解析失败 @ ${apiPath}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`请求超时 @ ${apiPath}`)); });
    req.on('error', reject);
    if (isPost) req.write(postData);
    req.end();
  });
}

function unwrapRecord(resp) {
  // getFormDataById 两种历史包装：{success, result:{...}} / 扁平对象
  if (resp === null || resp === undefined) throw new Error('实例读取返回空（记录不存在或无权限）');
  if (resp.result !== undefined && resp.result !== null) return resp.result;
  if (resp.content && typeof resp.content === 'object') return resp.content;
  if (resp.success === false) throw new Error(`实例读取失败: ${resp.errorMsg || resp.message || JSON.stringify(resp).slice(0, 200)}`);
  return resp;
}

/** 防护 1：完整读取 = getFormDataById 的 instValue（主表）+ listTableData 分页（子表全量行，totalCount 交叉校验） */
async function readFullInstance(session, appId, formUuid, formInstId, formType, tableFieldIds) {
  let record; let detectedType = formType;
  if (formType === 'process') {
    record = unwrapRecord(await request('GET', session, `/dingtalk/web/${appId}/v1/process/getInstanceById.json?processInstanceId=${encodeURIComponent(formInstId)}`));
  } else {
    record = unwrapRecord(await request('GET', session, `/dingtalk/web/${appId}/v1/form/getFormDataById.json?formInstId=${encodeURIComponent(formInstId)}${formUuid ? `&formUuid=${encodeURIComponent(formUuid)}` : ''}`));
  }
  if (detectedType !== 'process' && record) {
    const hint = record.processInstanceId || (record.formData && record.formData.processInstanceId);
    if (hint) detectedType = 'process';
  }
  const parsed = lib.parseInstValue(record.instValue, record.formData);
  const tables = {};
  for (const tfId of tableFieldIds) {
    const rows = [];
    let page = 1; let totalCount = null;
    while (true) {
      const qs = `formUuid=${encodeURIComponent(formUuid)}&formInstanceId=${encodeURIComponent(formInstId)}&tableFieldId=${encodeURIComponent(tfId)}&currentPage=${page}&pageSize=${lib.SUB_PAGE_SIZE}`;
      const resp = await request('GET', session, `/dingtalk/web/${appId}/v1/form/listTableDataByFormInstIdAndTableId.json?${qs}`);
      const list = (resp && Array.isArray(resp.data)) ? resp.data : ((resp && resp.result && resp.result.data) || []);
      const tc = resp ? (resp.totalCount !== undefined ? resp.totalCount : (resp.result && resp.result.totalCount)) : 0;
      if (totalCount === null) totalCount = Number(tc || 0);
      rows.push(...list);
      if (rows.length >= totalCount) break;
      if (list.length === 0) break; // 防死循环：接口不再给数据
      page++;
      if (page > 200) throw new Error(`[子表分页异常] ${tfId} 超过 200 页仍未取满 totalCount=${totalCount}，中止`);
    }
    lib.assertSubRowCount(rows, totalCount, tfId);
    // 与 instValue 行数交叉校验（并发/形态漂移探测）
    const instRows = parsed.tables[tfId];
    if (Array.isArray(instRows) && instRows.length > 0 && instRows.length !== rows.length) {
      throw new Error(`[子表行数交叉校验失败] ${tfId}: instValue ${instRows.length} 行 ≠ 分页接口 ${rows.length} 行（totalCount=${totalCount}）。数据可能正被并发修改，请重试或排查。`);
    }
    tables[tfId] = rows;
  }
  return { main: parsed.main, tables, raw: record, formType: detectedType };
}

/** 写入（普通表单 updateFormData / 流程表单 process/updateInstance），成功返回 null */
async function writePayload(session, appId, formType, formInstId, payload) {
  const params = { updateFormDataJson: JSON.stringify(payload) };
  if (formType === 'process') params.processInstanceId = formInstId;
  else params.formInstanceId = formInstId;
  const apiPath = formType === 'process'
    ? `/dingtalk/web/${appId}/v1/process/updateInstance.json`
    : `/dingtalk/web/${appId}/v1/form/updateFormData.json`;
  const resp = await request('POST', session, apiPath, params);
  // 成功 = null；失败 = {success:false,...} 或含错误信息
  if (resp === null || resp === undefined) return null;
  if (typeof resp === 'object' && resp.success === false) {
    throw new Error(`[服务端拒绝写入] ${resp.errorMsg || resp.message || JSON.stringify(resp).slice(0, 300)}（服务端校验拦截无参数可绕过，请按提示处理数据或走页面操作）`);
  }
  if (typeof resp === 'object' && (resp.errorCode || resp.errorMsg)) {
    throw new Error(`[服务端拒绝写入] ${resp.errorMsg || resp.errorCode}`);
  }
  return resp;
}

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function newBatchId() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `fdu_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function writeLedgerBatch(ledgerDir, batchId, files) {
  const dir = path.join(PROJECT_ROOT, ledgerDir, batchId);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, obj] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2), 'utf-8');
  }
  return dir;
}

function printHead(title) { console.log(`\n===== ${title} =====`); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jsonMode = !!args.json;
  const ledgerDir = typeof args['ledger-dir'] === 'string' ? args['ledger-dir'] : 'temp-file/fdu-ledger';
  const session = loadSession();

  // ============ 回滚模式 ============
  if (args.rollback) {
    const batchDir = path.join(PROJECT_ROOT, ledgerDir, String(args.rollback));
    if (!fs.existsSync(path.join(batchDir, 'snapshot.json'))) {
      throw new Error(`台账目录不存在或缺少快照: ${batchDir}`);
    }
    const snapshot = JSON.parse(fs.readFileSync(path.join(batchDir, 'snapshot.json'), 'utf-8'));
    const applied = JSON.parse(fs.readFileSync(path.join(batchDir, 'payload.json'), 'utf-8'));
    const plan = lib.buildRollbackPayload(snapshot.full, applied.payload);
    console.log(`[回滚] 批次 ${args.rollback}: ${plan.note}`);
    return runUpdate(session, {
      appId: snapshot.appId, formUuid: snapshot.formUuid, formInstId: snapshot.formInstId,
      formType: snapshot.formType, payload: plan.payload, meta: plan.meta,
      tableFieldIds: Object.keys(applied.meta.tableWrites || {}),
      ledgerDir, isRollback: true, rollbackOf: String(args.rollback), jsonMode,
    });
  }

  // ============ 常规模式 ============
  if (!args.app) throw new Error('缺少 --app <APP_XXX>');
  if (typeof args.changes !== 'string') throw new Error('缺少 --changes <file>（或使用 --rollback <batchId>）');
  const changesPath = path.isAbsolute(args.changes) ? args.changes : path.join(PROJECT_ROOT, args.changes);
  const spec = JSON.parse(fs.readFileSync(changesPath, 'utf-8'));
  const { formUuid, formInstId } = spec;
  if (!formUuid || !formInstId) throw new Error('changes 文件必须包含 formUuid 与 formInstId');
  const sorted = lib.sortAndGuardChanges(spec.changes);
  const formType = args['form-type'] === 'process' || args['form-type'] === 'receipt' ? args['form-type'] : 'auto';

  // —— 第 1 步：改前快照（防护 1/4）——
  printHead('第 1 步 改前快照（instValue + 子表分页 totalCount 交叉校验）');
  const before = await readFullInstance(session, args.app, formUuid, formInstId, formType, Object.keys(sorted.tables));
  console.log(`表单类型: ${before.formType}；主表键 ${Object.keys(before.main).length} 个；涉及子表 ${Object.keys(sorted.tables).length} 张（${Object.entries(before.tables).map(([k, v]) => `${k}:${v.length}行`).join(', ') || '无'})`);

  // —— 第 2 步：守卫 + 构建载荷（防护 2/3）——
  printHead('第 2 步 守卫与载荷构建');
  lib.guardComplexFieldsOnFullRewrite(before, sorted);
  const built = lib.buildUpdatePayload(before, sorted);
  for (const e of built.ledgerEntries) {
    const ov = JSON.stringify(e.oldValue); const nv = JSON.stringify(e.newValue);
    console.log(`  ${e.target}: ${ov && ov.length > 60 ? ov.slice(0, 60) + '…' : ov} → ${nv && nv.length > 60 ? nv.slice(0, 60) + '…' : nv}`);
  }

  if (args['dry-run']) {
    printHead('dry-run 结束（未写入任何数据）');
    console.log(`载荷已就绪，去掉 --dry-run 并加 --yes 即可执行。`);
    if (jsonMode) console.log(`FDU_RESULT ${JSON.stringify({ ok: true, dryRun: true, batchId: null })}`);
    return;
  }

  // 确认闸门：非交互环境必须显式 --yes（SKILL.md 硬规则：AI 须先获用户同意）
  if (!args.yes) {
    if (process.stdin.isTTY) {
      throw new Error('写入属不可逆操作：请确认上面的改动清单后加 --yes 重新执行');
    }
    throw new Error('非交互环境写入必须显式传 --yes（AI 必须先获得用户对本次写入的明确同意）');
  }

  return runUpdate(session, {
    appId: args.app, formUuid, formInstId, formType: before.formType,
    payload: built.payload, meta: built.meta, before,
    tableFieldIds: Object.keys(sorted.tables), ledgerDir, isRollback: false, jsonMode,
  });
}

/** 四步主链：快照落盘 → 执行 → 回读断言 → 失败自动回滚（防护 4/5/6/7） */
async function runUpdate(session, ctx) {
  const batchId = newBatchId();
  const before = ctx.before;
  let beforeFull = before;

  if (!beforeFull) {
    // 回滚模式：重建改前快照（以线上当前值为 R1，仅用于断言基线；真正回滚值来自台账快照）
    beforeFull = (await readFullInstance(session, ctx.appId, ctx.formUuid, ctx.formInstId, ctx.formType, ctx.tableFieldIds));
  }

  // —— 快照落盘（写失败则整体中止，防护 4）——
  let batchDir;
  try {
    batchDir = writeLedgerBatch(ctx.ledgerDir, batchId, {
      'snapshot.json': { appId: ctx.appId, formUuid: ctx.formUuid, formInstId: ctx.formInstId, formType: ctx.formType, readAt: ts(), full: beforeFull },
      'payload.json': { payload: ctx.payload, meta: ctx.meta },
    });
  } catch (e) {
    throw new Error(`[快照落盘失败] ${e.message}。已中止，未写入任何数据。`);
  }
  console.log(`\n[${ctx.isRollback ? '回滚' : '写入'}] 批次 ${batchId}，台账: ${batchDir}`);

  // —— 执行 ——
  let writeResp;
  try {
    writeResp = await writePayload(session, ctx.appId, ctx.formType, ctx.formInstId, ctx.payload);
  } catch (e) {
    console.error(`\n❌ 写入未完成: ${e.message}`);
    console.error('快照与载荷已留存于台账，未产生需回滚的写入。');
    if (ctx.jsonMode) console.log(`FDU_RESULT ${JSON.stringify({ ok: false, aborted: true, batchId, error: e.message })}`);
    process.exitCode = 2;
    return;
  }
  void writeResp;

  // —— 回读断言（防护 5）——
  printHead('第 3 步 回读断言（同管线重读，逐字段比对）');
  const after = await readFullInstance(session, ctx.appId, ctx.formUuid, ctx.formInstId, ctx.formType, ctx.tableFieldIds);
  const verdict = lib.assertAfterWrite(beforeFull, after, ctx.payload, ctx.meta);
  for (const w of verdict.warnings) {
    console.log(`  ⚠️ 镜像重算（可接受）: ${w.path}\n     ${JSON.stringify(w.before)} → ${JSON.stringify(w.after)}（${w.reason}）`);
  }

  if (verdict.ok) {
    printHead('第 4 步 完成');
    console.log(`✅ 写入并验证成功：${ctx.formInstId}（批次 ${batchId}）`);
    writeLedgerBatch(ctx.ledgerDir, batchId, {
      'result.json': { ok: true, isRollback: ctx.isRollback, rollbackOf: ctx.rollbackOf || null, finishedAt: ts(), warnings: verdict.warnings },
      'ledger.json': ctx.ledgerEntries || [],
    });
    if (ctx.jsonMode) console.log(`FDU_RESULT ${JSON.stringify({ ok: true, batchId, warnings: verdict.warnings.length })}`);
    return;
  }

  // —— 断言失败 → 自动回滚（防护 6）——
  console.error(`\n❌ 回读断言失败，差异 ${verdict.diffs.length} 处：`);
  for (const d of verdict.diffs) {
    console.error(`  [${d.kind}] ${d.path}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}${d.expect !== undefined ? `（期望 ${JSON.stringify(d.expect)}）` : ''}`);
  }
  if (ctx.isRollback) {
    console.error('❗ 回滚自身断言失败，可能存在并发写入或格式漂移 —— 请人工核对台账快照后处理，禁止盲目重试。');
    writeLedgerBatch(ctx.ledgerDir, batchId, { 'result.json': { ok: false, isRollback: true, rollbackOf: ctx.rollbackOf, diffs: verdict.diffs, finishedAt: ts(), needsManualFix: true } });
    if (ctx.jsonMode) console.log(`FDU_RESULT ${JSON.stringify({ ok: false, batchId, rolledBack: false, needsManualFix: true, diffs: verdict.diffs })}`);
    process.exitCode = 1;
    return;
  }
  console.error('\n…… 正在自动回滚（恢复为写前快照值）');
  const rollbackPlan = lib.buildRollbackPayload(beforeFull, ctx.payload);
  try {
    await writePayload(session, ctx.appId, ctx.formType, ctx.formInstId, rollbackPlan.payload);
    const afterRollback = await readFullInstance(session, ctx.appId, ctx.formUuid, ctx.formInstId, ctx.formType, ctx.tableFieldIds);
    const rbVerdict = lib.assertAfterWrite(beforeFull, afterRollback, rollbackPlan.payload, rollbackPlan.meta);
    if (rbVerdict.ok) {
      console.error(`✅ 已回滚至写前状态（断言通过）。差异清单已留存，请排查后重试。`);
      writeLedgerBatch(ctx.ledgerDir, batchId, { 'result.json': { ok: false, rolledBack: true, diffs: verdict.diffs, finishedAt: ts() } });
      if (ctx.jsonMode) console.log(`FDU_RESULT ${JSON.stringify({ ok: false, batchId, rolledBack: true, diffs: verdict.diffs })}`);
    } else {
      console.error(`❗ 回滚后仍有 ${rbVerdict.diffs.length} 处差异 —— 请人工核对台账快照 ${batchDir}，禁止盲目重试。`);
      writeLedgerBatch(ctx.ledgerDir, batchId, { 'result.json': { ok: false, rolledBack: true, rollbackVerified: false, diffs: verdict.diffs, rollbackDiffs: rbVerdict.diffs, finishedAt: ts(), needsManualFix: true } });
      if (ctx.jsonMode) console.log(`FDU_RESULT ${JSON.stringify({ ok: false, batchId, rolledBack: true, rollbackVerified: false, needsManualFix: true })}`);
    }
  } catch (e) {
    console.error(`❗ 回滚执行失败: ${e.message} —— 请人工用台账快照 ${batchDir} 恢复，禁止盲目重试。`);
    writeLedgerBatch(ctx.ledgerDir, batchId, { 'result.json': { ok: false, rolledBack: false, rollbackError: e.message, diffs: verdict.diffs, finishedAt: ts(), needsManualFix: true } });
    if (ctx.jsonMode) console.log(`FDU_RESULT ${JSON.stringify({ ok: false, batchId, rolledBack: false, rollbackError: e.message, needsManualFix: true })}`);
  }
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n[form-data-update] 中止: ${e.message}`);
  console.error(process.argv.includes('--json') ? 'FDU_RESULT ' + JSON.stringify({ ok: false, aborted: true, error: e.message }) : '未写入任何数据。');
  process.exitCode = 2;
});
