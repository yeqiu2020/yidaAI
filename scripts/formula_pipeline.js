#!/usr/bin/env node
/**
 * 公式一键流水线（2026-10-01 新增，AGENTS.md 规则8 配套工具）
 *
 * 一条命令完成：
 *   【1/5】定位项目与表单（读 系统配置清单.md 拿 appType/formUuid）
 *   【2/5】规则21选择性同步 Schema（get-schema sync-schema.js，只同步本表单一次）
 *   【3/5】字段ID解析 + 未知字段名校验 + formula-generator 生成 marks JSON（含编辑器可粘贴形态）
 *   【4/5】多场景本地求值验证（formula_evaluator.js，--tests 提供 JSON 用例文件）
 *   【5/5】可选：推送线上（自动转换 #{fieldId} 公式 → 合并 代码/推送配置.json →
 *          /push-form-actions scope=all → 回读验证报告）——AGENTS.md 规则8 授权通道
 *
 * 用法（在工程根目录执行）：
 *   node scripts/formula_pipeline.js --project 进销存0929 --form 采购入库 \
 *     --target 订单收货状态 --formula-file temp-file/xxx.txt \
 *     [--name 公式名称] [--category 逻辑判断] [--tests temp-file/cases.json] \
 *     [--push] [--dry-run] [--server http://127.0.0.1:3457]
 *
 * --formula-file 写法：直接写字段【显示名】（程序自动补零宽空格并校验所有中文字段名），例如：
 *   IF(GT(DATE(入库日期),DATE(需到货日期)),IF(GT(剩余待入库数量,0),"逾期正常收货",...)))
 *
 * --tests 用例文件格式（JSON 数组）：
 *   [{"values": {"入库日期": "2026-10-01", "剩余待入库数量": "10"},
 *     "autots": ["入库日期"],            // 可选：列出的字段若为 yyyy-MM-dd 自动转本地零点时间戳
 *     "expected": "按期正常收货"}]
 *   （求值器的 DATE() 只认数字时间戳，日期字段务必放进 autots 或直接给毫秒时间戳）
 *
 * 退出码：0=全部通过；1=生成/校验失败；2=推送回读验证未通过
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WRAPPER = path.join(ROOT, '.agents', 'skills', 'formula-generator', 'scripts', 'formula_generator_wrapper.js');
const EVALUATOR = path.join(ROOT, '.agents', 'skills', 'formula-generator', 'scripts', 'formula_evaluator.js');
const SYNC_SCHEMA = path.join(ROOT, '.agents', 'skills', 'get-schema', 'scripts', 'sync-schema.js');

/* ---------- 参数解析 ---------- */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'push' || key === 'dry-run') { args[key] = true; continue; }
      args[key] = argv[++i];
    } else args._.push(a);
  }
  return args;
}
const args = parseArgs(process.argv.slice(2));
const fail = (msg) => { console.error('❌ ' + msg); process.exit(1); };

for (const required of ['project', 'form', 'target', 'formula-file']) {
  if (!args[required]) fail(`缺少必需参数 --${required}（用法见文件头注释）`);
}

const projectName = args.project;
const formName = args.form;
const targetName = args.target;
const category = args.category || '逻辑判断';
const formulaName = args.name || (targetName + '公式');
const server = args.server || 'http://127.0.0.1:3457';
const projectDir = path.join(ROOT, projectName);
const configFile = path.join(projectDir, '系统配置清单.md');

/* ---------- 工具函数 ---------- */
function labelOf(props) {
  const l = props && props.label;
  if (!l) return '';
  return typeof l === 'string' ? l : (l.zh_CN || Object.values(l)[0] || '');
}
function runNode(script, cmdArgs, label) {
  try {
    const out = execFileSync(process.execPath, [script].concat(cmdArgs), { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + '\n' + (e.stderr || e.message), label };
  }
}
async function postJson(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; }
  catch (e) { return { status: r.status, json: null, text }; }
}

/* ---------- 【1/5】定位项目与表单 ---------- */
console.log('【1/5】定位项目与表单...');
if (!fs.existsSync(configFile)) fail(`项目目录不存在或缺少 系统配置清单.md: ${configFile}`);
const configText = fs.readFileSync(configFile, 'utf8');
const appMatch = configText.match(/\*\*应用ID\*\*\s*\|\s*([A-Z0-9_]+)/);
if (!appMatch) fail('系统配置清单.md 中未找到 应用ID');
const appType = appMatch[1];

let formRow = null;
for (const line of configText.split('\n')) {
  if (!line.includes(formName) || !line.includes('「')) continue;
  const m = line.match(/(FORM-[A-Z0-9]+)/);
  if (m) { formRow = { formUuid: m[1], name: line }; break; }
}
if (!formRow) fail(`系统配置清单.md 中未找到表单「${formName}」的 FORM- UUID`);

// 定位本地表单目录（目录名形如 采购入库「流程表单」）
function findFormDir(base, depth) {
  if (depth > 4) return null;
  for (const name of fs.readdirSync(base)) {
    const full = path.join(base, name);
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) {
      if (name.startsWith(formName + '「')) return full;
      const found = findFormDir(full, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
const formDir = findFormDir(projectDir, 1);
if (!formDir) fail(`项目 ${projectName} 下未找到表单目录「${formName}「...」」`);
const schemaFile = path.join(formDir, path.basename(formDir) + '.json');
console.log(`   应用: ${appType}  表单: ${path.basename(formDir)}  (${formRow.formUuid})`);

/* ---------- 【2/5】规则21 选择性同步 Schema ---------- */
console.log('【2/5】选择性同步 Schema（规则21：写操作前刷新本地缓存）...');
const sync = runNode(SYNC_SCHEMA, [appType, formRow.formUuid, path.relative(ROOT, schemaFile)], '同步Schema');
if (!sync.ok) fail(`Schema 同步失败:\n${sync.out.slice(0, 800)}`);
console.log(sync.out.split('\n').filter(l => /新增|删除|修改|同步完成/.test(l)).map(l => '   ' + l.trim()).join('\n'));

/* ---------- 【3/5】字段解析与公式生成 ---------- */
console.log('【3/5】解析字段ID、校验字段名、生成公式 JSON...');
const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
const fields = []; // {name, fieldId, componentName}
function walk(node) {
  if (node.props && node.props.fieldId && labelOf(node.props)) {
    fields.push({ name: labelOf(node.props), fieldId: node.props.fieldId, componentName: node.componentName });
  }
  (node.children || []).forEach(walk);
}
(schema.componentsTree || []).forEach(walk);

const formulaTextRaw = (() => {
  const f = path.resolve(process.cwd(), args['formula-file']);
  if (!fs.existsSync(f)) fail(`公式文件不存在: ${f}`);
  return fs.readFileSync(f, 'utf8').trim();
})();

// 已知字段名 → fieldId（重名检测，如主表/子表都有「备注」）
const nameMap = {};
for (const f of fields) (nameMap[f.name] = nameMap[f.name] || []).push(f);
// 最长匹配分段：公式中的连续字段名片段按「最长字段名优先」消耗，
// 防止「入库数量」作为「剩余待入库数量」的子串被误判为独立引用字段
const knownNames = Object.keys(nameMap).sort((a, b) => b.length - a.length);
function segmentFormula(text) {
  const used = new Set(); const unknown = new Set();
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') { // 字符串字面量内容（如状态值"按期正常收货"）不是字段引用
      const end = text.indexOf('"', i + 1);
      i = end >= 0 ? end + 1 : text.length;
      continue;
    }
    let matched = null;
    for (const n of knownNames) { if (text.startsWith(n, i)) { matched = n; break; } }
    if (matched) { used.add(matched); i += matched.length; continue; }
    if (/[\u4e00-\u9fa5]/.test(text[i])) {
      let j = i, run = '';
      while (j < text.length && /[\u4e00-\u9fa5A-Za-z0-9_.]/.test(text[j])) { run += text[j]; j++; }
      unknown.add(run); i = j; continue;
    }
    i++;
  }
  return { used: [...used], unknown: [...unknown] };
}
const seg = segmentFormula(formulaTextRaw);
const usedFields = seg.used;
const unknown = seg.unknown;
if (unknown.length > 0) fail(`公式中存在表单不存在的字段名：${unknown.join('、')}（请核对同步后的 Schema 字段清单）`);
if (!nameMap[targetName]) fail(`目标字段「${targetName}」不在表单中`);
const targetConflicts = nameMap[targetName];
if (targetConflicts.length > 1) fail(`目标字段名「${targetName}」在表单中重名（${targetConflicts.map(f => f.fieldId).join(', ')}），请改用 fieldId 定位（暂不支持）`);
for (const n of usedFields) {
  if (nameMap[n].length > 1) fail(`公式引用的字段名「${n}」在表单中重名（${nameMap[n].map(f => f.fieldId).join(', ')}），请改名后重试`);
}

// formula-generator 生成 marks JSON（wrapper 自动补零宽空格并校验位置）
// 注意：wrapper 成功后会删除 --formulaFile 指向的文件，故先复制到 temp-file/ 保护用户源文件
const outDir = path.join(formDir, '公式');
fs.mkdirSync(outDir, { recursive: true });
const outputJson = path.join(outDir, formulaName + '.json');
const wrapperInput = path.join(ROOT, 'temp-file', '_pipeline_wrapper_' + Date.now() + '.txt');
fs.mkdirSync(path.dirname(wrapperInput), { recursive: true });
fs.copyFileSync(path.resolve(process.cwd(), args['formula-file']), wrapperInput);
const fieldsArg = usedFields.map(n => `${n}:${nameMap[n][0].fieldId}`).join(',');
const gen = runNode(WRAPPER, [
  '--formulaName', formulaName,
  '--category', category,
  '--fields', fieldsArg,
  '--formulaFile', wrapperInput,
  '--outputPath', path.relative(ROOT, outputJson),
], '生成公式');
if (!gen.ok) fail(`公式生成失败:\n${gen.out.slice(-1200)}`);
console.log(gen.out.split('\n').filter(l => /验证通过|公式JSON已生成|已保存/.test(l)).map(l => '   ' + l.trim()).join('\n'));

// 生成后 marks 断言：每个 mark 包裹的字段名必须能解析到与 mark.value 一致的 fieldId
// （拦截 wrapper 意外分词/串字段——如「剩余待入库数量」被拆成「剩余待」+「入库数量」并错绑子表字段）
const genJsonEarly = JSON.parse(fs.readFileSync(outputJson, 'utf8'));
for (const m of (genJsonEarly.marks || [])) {
  const segName = genJsonEarly.text.slice(m.from.ch, m.to.ch).replace(/\u200b/g, '');
  const conf = nameMap[segName];
  if (!conf || conf[0].fieldId !== m.value) {
    fail(`marks 断言失败：mark 片段「${segName}」绑定到 ${m.value}，但预期 ${conf ? conf[0].fieldId : '(未知字段名)'}。生成结果异常，已中止`);
  }
}
console.log('   ✓ marks 断言通过（' + (genJsonEarly.marks || []).length + ' 个标记与字段ID一一对应）');

/* ---------- 【4/5】多场景本地求值验证 ---------- */
if (args.tests) {
  console.log('【4/5】本地求值验证（' + args.tests + '）...');
  const cases = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.tests), 'utf8'));
  // 求值器只认公式文本（不认 JSON），从生成结果抽出 text 存临时文件
  const genJson = JSON.parse(fs.readFileSync(outputJson, 'utf8'));
  const evalTxt = path.join(ROOT, 'temp-file', '_pipeline_eval_' + Date.now() + '.txt');
  fs.mkdirSync(path.dirname(evalTxt), { recursive: true });
  fs.writeFileSync(evalTxt, genJson.text, 'utf8');
  let passCount = 0;
  cases.forEach((c, i) => {
    const values = Object.assign({}, c.values);
    (c.autots || []).forEach(k => {
      if (typeof values[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values[k])) {
        values[k] = String(new Date(values[k] + 'T00:00:00+08:00').getTime());
      }
    });
    const tv = Object.keys(values).map(k => `${k}=${values[k]}`).join(',');
    const r = runNode(EVALUATOR, ['--formulaFile', evalTxt, '--fields', fieldsArg, '--testValues', tv], `用例${i + 1}`);
    const m = (r.out || '').match(/求值结果: "(.*)"|求值失败: (.*)/);
    const got = m ? (m[1] !== undefined ? m[1] : m[2]) : '(无输出)';
    const ok = r.ok && got === c.expected;
    if (ok) passCount++;
    console.log(`   ${ok ? '✅' : '❌'} 用例${i + 1}: 期望「${c.expected}」实际「${got}」`);
    if (!ok && r.out) {
      const issues = r.out.split('\n').filter(l => /⚠️|❌|field_undefined|field_missing|求值失败/.test(l));
      if (issues.length) console.log('      诊断: ' + issues.map(l => l.trim()).join(' | ').slice(0, 300));
    }
  });
  fs.unlinkSync(evalTxt);
  if (passCount !== cases.length) fail(`求值验证未全部通过（${passCount}/${cases.length}），已中止（未推送）`);
  console.log(`   求值验证通过：${passCount}/${cases.length}`);
} else {
  console.log('【4/5】跳过求值验证（未提供 --tests）');
}

/* ---------- 【5/5】可选推送 ---------- */
const targetFieldId = nameMap[targetName][0].fieldId;
// 零宽空格显示名 → #{fieldId} 推送格式
const pushFormula = genFormulaPushText();

function genFormulaPushText() {
  const genJson = JSON.parse(fs.readFileSync(outputJson, 'utf8'));
  return genJson.text.replace(/\u200b([^\u200b]+)\u200b/g, (m, name) => '#{'+ (nameMap[name] ? nameMap[name][0].fieldId : name) + '}');
}

if (!args.push) {
  console.log('【5/5】未指定 --push，流程结束（本地交付）');
  console.log('   公式 JSON: ' + outputJson);
  if (args['dry-run']) {
    console.log('   [dry-run] 若加 --push 将推送：');
    console.log('   field=' + targetFieldId);
    console.log('   formula=' + pushFormula);
  }
  process.exit(0);
}

if (args['dry-run']) {
  console.log('【5/5】[dry-run] 仅演示推送内容，不执行：');
  console.log('   field=' + targetFieldId);
  console.log('   formula=' + pushFormula);
  process.exit(0);
}

(async () => {
  console.log('【5/5】推送线上（规则8授权通道 /push-form-actions）...');
  const baseBody = {
    formName,
    projectDir,
    pageUrl: 'http://127.0.0.1:8080/' + encodeURIComponent(path.basename(ROOT)) + '/' + encodeURIComponent(projectName) + '/index.html',
  };

  // 5.1 同步线上动作代码（建立下载版镜像）
  const s1 = await postJson(server + '/sync-form-actions', baseBody);
  if (!s1.json || !s1.json.success) fail('同步动作代码失败: ' + JSON.stringify(s1.json || s1.text || s1.status).slice(0, 400));
  console.log('   ✓ 动作代码已同步（' + (s1.json.actionCodeLength || 0) + ' 字符）');

  // 5.2 确保推送版存在（不存在则从下载版复制；已存在则尊重用户工作文件）
  const codeDir = path.join(formDir, '代码');
  const pushVer = path.join(codeDir, '动作代码_推送版.js');
  if (!fs.existsSync(pushVer)) {
    const dlVer = path.join(codeDir, '动作代码_下载版.js');
    if (!fs.existsSync(dlVer)) fail('代码目录缺少 动作代码_下载版.js，无法建立推送版');
    fs.copyFileSync(dlVer, pushVer);
    console.log('   ✓ 已从下载版创建 动作代码_推送版.js');
  } else {
    console.log('   ✓ 使用已有 动作代码_推送版.js（内容不变，本次仅推公式）');
  }

  // 5.3 合并 推送配置.json（保留其他字段条目，仅替换目标字段公式）
  fs.mkdirSync(codeDir, { recursive: true });
  const pushCfgFile = path.join(codeDir, '推送配置.json');
  let pushCfg = {};
  if (fs.existsSync(pushCfgFile)) { try { pushCfg = JSON.parse(fs.readFileSync(pushCfgFile, 'utf8')); } catch (e) { fail('推送配置.json 解析失败: ' + e.message); } }
  pushCfg.formulas = (pushCfg.formulas || []).filter(f => f.field !== targetFieldId);
  pushCfg.formulas.push({ field: targetFieldId, formula: pushFormula });
  fs.writeFileSync(pushCfgFile, JSON.stringify(pushCfg, null, 2), 'utf8');
  console.log('   ✓ 推送配置.json 已合并（formulas ' + pushCfg.formulas.length + ' 条）');

  // 5.4 推送（服务端：备份→剥离→语法校验→三写→保存→回读逐项验证）
  const s2 = await postJson(server + '/push-form-actions', Object.assign({}, baseBody, { fileName: '动作代码_推送版.js', scope: 'all' }));
  if (!s2.json) fail('推送接口返回异常: HTTP ' + s2.status + ' ' + String(s1.text || '').slice(0, 300));
  const v = s2.json.verify || {};
  console.log('   推送 success=' + s2.json.success + '  回读验证 ok=' + v.ok + ' (checked=' + (v.checked || 0) + ', failures=' + ((v.failures || []).length) + ')');
  if (!s2.json.success || v.ok !== true) {
    console.error('   详情: ' + JSON.stringify(s2.json, null, 2).slice(0, 1500));
    process.exit(2);
  }
  console.log('✅ 全流程完成。提醒：需到宜搭设计器核对并发布才生效（API保存 ≠ 发布）。');
})().catch(e => fail('推送流程异常: ' + e.message));
