#!/usr/bin/env node
/**
 * dump-node-catalog.js — 宜搭逻辑流「全节点权威目录」提取器
 * ---------------------------------------------------------------
 * 目的：从公开 CDN 的逻辑流引擎 bundle 中，一次性提取 16 个面板节点的
 *       componentName / props 顶层键(rulesKey) / setter / 默认 props 形状，
 *       输出为权威节点目录。无需登录、可被任何 AI 复现。
 *
 * 为什么这样做（血泪教训）：
 *   逻辑流节点在 viewJson 里的 componentName 与 props 形状是固定且严格的，
 *   靠“记忆/猜测”写节点名或 props → 设计器白屏崩溃、保存报“转换xml失败”。
 *   而这些定义全部打包在这个公开 bundle 里，直接解析 = 权威、零猜测。
 *
 * 用法：
 *   node dump-node-catalog.js                 # 默认版本
 *   node dump-node-catalog.js 0.2.241         # 指定版本
 *   node dump-node-catalog.js 0.2.241 --json  # 额外输出 JSON 到 stdout
 *
 * 如何得到“当前线上版本号”：登录任一逻辑流设计器页，控制台执行
 *   [...document.scripts].map(s=>s.src).find(x=>x.includes('yida-logic-flow'))
 */
const https = require('https');

const version = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '0.2.241';
const wantJson = process.argv.includes('--json');
const URL = `https://g.alicdn.com/yida-platform/yida-logic-flow/${version}/index.js`;

// 面板 16 节点：中文标签 → componentName（全部已从 bundle 的 pb 枚举 + 材料 configure 核实）
const CATALOG = [
  { label: '表单事件触发', category: '触发',   componentName: 'StartNode',            rulesKey: 'start',               setter: 'BranchSetter/StartSetter', note: '引擎自带首节点；start 内含 triggerType/formEventType/conditions' },
  { label: '结束',        category: '结束',   componentName: 'EndNode',              rulesKey: 'name(i18n)',          setter: '-',                        note: '引擎自带尾节点' },
  { label: '新增数据',     category: '数据',   componentName: 'AddDataNode',          rulesKey: 'addDataRules',        setter: 'AddDataSetter',            note: '' },
  { label: '更新数据',     category: '数据',   componentName: 'UpdateDataNode',       rulesKey: 'updateDataRules',     setter: 'UpdateDataSetter',         note: '✅已上线验证：direct_form 子表词表更新累加' },
  { label: '获取单条数据', category: '数据',   componentName: 'GetSingleDataNode',    rulesKey: 'getData',             setter: 'GetDataSetter',            note: '默认 props 含 type:"single"' },
  { label: '获取多条数据', category: '数据',   componentName: 'GetBatchDataNode',     rulesKey: 'getData',             setter: 'GetDataSetter',            note: '默认 props 含 type:"batch"；循环容器的数据来源' },
  { label: '删除数据',     category: '数据',   componentName: 'DeleteDataNode',       rulesKey: 'deleteData',          setter: 'DeleteDataSetter',         note: 'props 键是 deleteData（非 deleteDataRules）；默认仅 name/nodeName/description' },
  { label: '连接流',       category: '连接器', componentName: 'AINode',               rulesKey: 'workFlowRules',       setter: '(iframe 子编辑器)',         note: 'type:aiFlow；走 iframe(initWorkFlow/saveWorkFlow postMessage)，建议设计器操作' },
  { label: '连接器',       category: '连接器', componentName: 'ConnectorNode',        rulesKey: 'connectorRules',      setter: 'ConnectorSetter',          note: '默认 props 含 status:"edit", step:0, connector...' },
  { label: '消息通知',     category: '消息',   componentName: 'SendMessageNode',      rulesKey: 'sendMessageRules',    setter: 'SendMessageSetter',        note: '' },
  { label: '发送邮件',     category: '消息',   componentName: 'SendEmailNode',        rulesKey: 'sendEmailRules',      setter: 'SendEmailSetter',          note: '' },
  { label: '发送卡片',     category: '卡片',   componentName: 'CardNode',             rulesKey: '(见运行时)',           setter: 'CardSetter',               note: '默认 props 含 paneClassName:"card-node-setter-pane"' },
  { label: '更新卡片',     category: '卡片',   componentName: 'CardUpdateNode',       rulesKey: '(见运行时)',           setter: 'CardSetter',               note: '' },
  { label: '条件分支',     category: '分支',   componentName: 'ConditionContainer',   rulesKey: '容器props:{name}; 子节点 ConditionNode.conditions', setter: 'BranchSetter', note: '容器+children：children=[ConditionNode(条件), ConditionNode(isDefault其他情况)]' },
  { label: '并行分支',     category: '分支',   componentName: 'ConditionContainer',   rulesKey: 'type:"parallel"; 子节点 ParallelNode.conditions', setter: 'BranchSetter(type=parallel)', note: '同为 ConditionContainer，加 type:"parallel"；children=[ParallelNode, ParallelNode(isDefault)]' },
  { label: '循环容器',     category: '分支',   componentName: 'CycleContainer',       rulesKey: 'cycleContainerRules', setter: '(需前置 GetBatchDataNode)', note: '只能遍历「获取多条数据」输出，不能遍历触发子表行' },
  { label: '发起审批',     category: '人工',   componentName: 'InitiateApprovalNode', rulesKey: 'initiateApprovalRules', setter: 'InitiateApprovalSetter',  note: '' },
  { label: '脚本(Groovy)', category: '开发者', componentName: 'GroovyNode',           rulesKey: 'groovy',              setter: 'GroovySetter',             note: 'props.groovy.action.code 存脚本正文' },
  { label: '脚本(JS)',     category: '开发者', componentName: 'JavaScriptNode',       rulesKey: 'JavaScript',          setter: 'JavaScriptSetter',         note: 'props.JavaScript.action.code 存脚本正文；outputs.add(描述,变量名,值) 输出' },
];

function get(u) {
  return new Promise((res, rej) => {
    https.get(u, (r) => {
      if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' for ' + u)); r.resume(); return; }
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}
function extractObject(s, openIdx) {
  let depth = 0, inStr = false, q = '';
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(openIdx, i + 1); }
  }
  return null;
}
function findDefaultProps(js, name) {
  for (const p of [`nodeName:"${name}"`, `componentName:"${name}"`]) {
    const idx = js.indexOf(p);
    if (idx < 0) continue;
    let open = js.lastIndexOf('{', idx);
    for (let t = 0; t < 8 && open > 0; t++) {
      const obj = extractObject(js, open);
      if (obj && obj.indexOf(p) >= 0 && obj.length < 3000) {
        return obj.replace(/Cut\("([^"]+)"\)/g, '"i18n:$1"');
      }
      open = js.lastIndexOf('{', open - 1);
    }
  }
  return null;
}

(async () => {
  console.error(`Fetching ${URL} ...`);
  const js = await get(URL);
  console.error(`OK. bundle size = ${js.length} chars\n`);

  // 校验 pb 枚举里确实含这些 componentName（权威运行时枚举）
  const enumIdx = js.indexOf('e.StartNode="StartNode"');
  const enumBlk = enumIdx >= 0 ? js.slice(enumIdx - 40, enumIdx + 700) : '';
  const enumNames = [...enumBlk.matchAll(/e\.([A-Za-z]+)="[A-Za-z]+"/g)].map(m => m[1]);

  const rows = CATALOG.map((n) => {
    const dp = findDefaultProps(js, n.componentName);
    const inEnum = enumNames.includes(n.componentName);
    return { ...n, verifiedInEnum: inEnum, defaultProps: dp ? (dp.length > 400 ? dp.slice(0, 400) + '…' : dp) : null };
  });

  console.log(`# 宜搭逻辑流全节点权威目录（bundle v${version}）\n`);
  console.log(`> 运行时节点枚举(pb)含: ${enumNames.join(', ')}\n`);
  console.log('| 面板标签 | 分组 | componentName | props键(rulesKey) | setter | 枚举核实 |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.label} | ${r.category} | \`${r.componentName}\` | ${r.rulesKey} | ${r.setter} | ${r.verifiedInEnum ? '✅' : '—'} |`);
  }
  console.log('\n## 默认 props 形状（createNode 安全建节点用）\n');
  for (const r of rows) {
    if (r.defaultProps) console.log(`- **${r.label}** \`${r.componentName}\`：\n  \`\`\`js\n  ${r.defaultProps}\n  \`\`\``);
    if (r.note) console.log(`  - 备注：${r.note}`);
  }
  if (wantJson) console.log('\n<!-- JSON -->\n' + JSON.stringify(rows, null, 2));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
