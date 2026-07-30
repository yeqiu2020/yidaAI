#!/usr/bin/env node
/**
 * generate-rule-json-from-config.js — 从配置文件生成业务关联规则 JSON
 *
 * 用途：通过配置文件定义公式模板和字段映射，自动生成精确的 marks 位置
 * 解决：避免手动计算 marks 的 from.ch/to.ch 位置导致偏差
 *
 * 用法：
 *   node .agents/skills/business-rule/scripts/generate-rule-json-from-config.js <config.json>
 *
 * 配置文件格式（见 examples/upsert-config-example.json)：
 *   {
 *     "template": "UPSERT({目标表单},AND(EQ({目标表单.仓库},{仓库名称}),EQ({目标表单.产品},{明细.产品名称})),\"\",{目标表单.仓库},{仓库名称},{目标表单.产品},{明细.产品名称},{目标表单.数量},{目标表单.数量}+{明细.入库数量})",
 *     "mapping": {
 *       "目标表单": { "display": "库存信息", "value": "FORM-BF0E85D555D4460EBAB64DBF1F449D19Z7G7/" },
 *       "目标表单.仓库": { "display": "库存信息.仓库名称", "value": "FORM-...//textField_xxx" },
 *       "仓库名称": { "display": "仓库名称", "value": "textField_yyy" },
 *       ...
 *     },
 *     "output": "业务规则/采购入库-增加库存.json"
 *   }
 *
 * 关键：占位符名称必须唯一，且不能是另一个占位符的前缀（如 {目标表单} 不能是 {目标表单.仓库} 的前缀）
 */

const path = require('path');
const fs = require('fs');

const ZWS = '\u200b';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template') result.template = args[++i];
    else if (args[i] === '--mapping') result.mapping = JSON.parse(args[++i]);
    else if (args[i] === '--output') result.output = args[++i];
  }
  return result;
}

/**
 * 从模板和映射生成 {text, marks, isCmData}
 *
 * 🔴 核心修正（v3.7.0）：占位符在模板中必须写成 `{key}`（带花括号），mapping 的 key 不带花括号。
 *   本函数匹配 **完整的 `{key}`（含花括号）** 并整体替换为 ZWS 包裹的显示名，
 *   花括号会被一并删除，绝不会残留在最终公式里。
 *   —— 这是历史 bug 的根因：旧版只匹配 key 本身（不含花括号），
 *      导致生成 `UPSERT({\u200b库存信息\u200b},...)` 这种带花括号的非法公式，宜搭校验必然失败。
 *
 * 算法：
 * 1. 按占位符长度降序排序（长的先匹配，双重保险）
 * 2. 从左到右扫描模板，每次定位最靠左的 `{key}`
 * 3. 用 ZWS 包裹显示名替换整个 `{key}`（含花括号），精确记录令牌位置
 */
function generateRuleJson(template, mapping) {
  const sortedKeys = Object.keys(mapping).sort((a, b) => b.length - a.length);

  const marks = [];
  let result = '';
  let cursor = 0;

  while (cursor < template.length) {
    // 尝试匹配最靠左的占位符（匹配完整的 {key}，含花括号）
    let matchedKey = null;
    let matchedIndex = -1;

    for (const key of sortedKeys) {
      const braced = '{' + key + '}';
      const idx = template.indexOf(braced, cursor);
      if (idx !== -1 && (matchedIndex === -1 || idx < matchedIndex)) {
        matchedIndex = idx;
        matchedKey = key;
      }
    }

    if (matchedKey === null) {
      // 没有更多占位符，添加剩余文本
      result += template.substring(cursor);
      break;
    }

    // 添加占位符之前的文本（{ 之前的部分）
    if (matchedIndex > cursor) {
      result += template.substring(cursor, matchedIndex);
    }

    // 计算 from.ch（包含前导 ZWS）
    const fromCh = result.length;

    // 显示名称（人类可读）
    const display = mapping[matchedKey].display;
    result += ZWS + display + ZWS;

    // 计算 to.ch（后导 ZWS 的下一个字符位置）
    const toCh = result.length;

    marks.push({
      from: { line: 0, ch: fromCh, sticky: null },
      to: { line: 0, ch: toCh, sticky: null },
      value: mapping[matchedKey].value,
      invalid: false,
    });

    // 移动游标到整个 {key} 之后（+2 为花括号长度）
    cursor = matchedIndex + matchedKey.length + 2;
  }

  return {
    text: result,
    marks,
    isCmData: true,
  };
}

function mainCli() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('用法: node generate-rule-json-from-config.js <config.json>');
    console.error('');
    console.error('配置文件格式:');
    console.error(JSON.stringify({
      template: 'UPSERT({目标表单},...)"',
      mapping: { '{占位符}': { display: '显示名', value: '字段ID' } },
      output: 'output.json'
    }, null, 2));
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  generateAndSave(config, path.dirname(path.resolve(process.cwd(), configPath)));
}

/**
 * 🔴 v3.7.2 强制卡点：可能创建新记录的函数（UPSERT/INSERT）写目标子表时，必须配套主表前置规则
 *（2026-07-28 实战教训，2026-07-28 二次修正：UPDATE/DELETE 豁免）
 *
 * 背景：受「普通组件与明细组件不能同改」限制，写目标子表字段的规则无法同时写目标主表
 * 业务键。若目标表中不存在主条件匹配的记录，UPSERT/INSERT 创建的新记录主表字段全空
 *（脏数据，且后续永远匹配不上）。宜搭校验器只查语法不查业务完整性，本卡点在生成阶段机器强制拦截。
 *
 * 🔴 函数级豁免（v3.7.2）：UPDATE/DELETE 的语义是「只作用于匹配到的已有记录」，目标主表
 * 记录不存在时为空操作，不会创建任何记录，无脏数据风险，因此不需要配套主表前置规则。
 * 只有 UPSERT/INSERT（可能创建新记录）写目标子表时才触发本卡点。
 *
 * 判定：mapping 中 value 形如 `FORM-xxx/fieldId`（目标表字段）且 display 含 ≥2 个点号
 *（如「E目标表单3.产品规格.规格」= 表单.子表.字段）即视为目标子表字段。
 * 注：只看目标侧字段，与来源字段是主表还是子表无关（「目标表写分开，来源表读自由」）。
 *
 * 拦截：UPSERT/INSERT 模板中用到任何目标子表字段时，config 必须声明 companionMainRule 指向
 * 已存在的主表前置规则文件（规则1 的 .json 或 .md），否则拒绝生成并以退出码 2 退出。
 *
 * 误判逃生口（仅限表单/子表显示名本身含点号导致的误判）：config 中显式声明
 * "subTableGuard": "off"，脚本会放行但打印高亮警告。
 */
function enforceSubTableCompanionGuard(config, configDir) {
  const { template, mapping, output } = config;

  const subTableTargets = Object.keys(mapping).filter((key) => {
    const m = mapping[key] || {};
    const isTargetField = /^FORM-[^/]+\/.+$/.test(m.value || '');
    const dotCount = ((m.display || '').match(/\./g) || []).length;
    return isTargetField && dotCount >= 2 && template.includes('{' + key + '}');
  });

  if (subTableTargets.length === 0) return; // 纯主表规则，放行

  console.log(`\n🔍 检测到模板写入/引用了目标子表字段: ${subTableTargets.map(k => mapping[k].display).join(', ')}`);

  // 🔴 v3.7.2 函数级豁免：UPDATE/DELETE 只作用于已存在的记录（不存在则空操作），
  // 不会产生主表字段全空的脏数据；只有可能创建新记录的 UPSERT/INSERT 需要配套主表前置规则
  const ops = [...template.matchAll(/\b(UPSERT|INSERT|UPDATE|DELETE)\s*\(/gi)].map(m => m[1].toUpperCase());
  const hasCreatingOp = ops.includes('UPSERT') || ops.includes('INSERT');
  if (!hasCreatingOp) {
    console.log(`✅ 操作类型为 ${[...new Set(ops)].join('/') || '未识别'}（非 UPSERT/INSERT）：UPDATE/DELETE 仅作用于已存在记录，目标不存在时为空操作，无脏数据风险，无需配套主表前置规则。`);
    return;
  }

  if (config.subTableGuard === 'off') {
    console.warn('⚠️⚠️⚠️ subTableGuard 已显式关闭（仅允许用于显示名含点号的误判场景）。');
    console.warn('⚠️ 若本规则确实写目标子表，必须先配套主表前置规则，否则会产生主表字段全空的脏数据！');
    return;
  }

  if (!config.companionMainRule) {
    console.error('\n❌ 拒绝生成（硬规则7推论）：本规则用 UPSERT/INSERT 操作目标表的子表，但 config 未声明 companionMainRule。');
    console.error('   写目标子表的规则无法同时写目标主表业务键——目标记录不存在时会插入主表字段全空的脏数据。');
    console.error('   必须拆成两条规则并按顺序推送：');
    console.error('     规则1（先推）: UPSERT(目标表, EQ(目标表.业务键, 业务键), "", 目标表.业务键, 业务键)  ← 确保主表记录存在');
    console.error('     规则2（后推）: 本条写子表的规则（此时主表记录必定存在）');
    console.error('   修复方法：');
    console.error('     1. 先为规则1创建 config 并生成/推送（规则1是纯主表规则，不会触发本卡点）');
    console.error('     2. 在本 config 中添加 "companionMainRule": "<规则1的.json或.md文件路径>" 后重新运行');
    process.exit(2);
  }

  // 校验 companionMainRule 文件真实存在（相对 config 所在目录或 cwd 解析）
  const candidates = [
    path.resolve(configDir || process.cwd(), config.companionMainRule),
    path.resolve(process.cwd(), config.companionMainRule),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    console.error(`\n❌ 拒绝生成：companionMainRule 指向的主表前置规则文件不存在: ${config.companionMainRule}`);
    console.error('   必须先生成规则1（主表前置 UPSERT）文件，再生成本条子表规则。');
    process.exit(2);
  }
  if (output && path.resolve(configDir || process.cwd(), output) === found) {
    console.error('\n❌ 拒绝生成：companionMainRule 不能指向本规则自身的输出文件。');
    process.exit(2);
  }

  console.log(`✅ 主表前置规则已就位: ${found}`);
  console.log('🔴 推送顺序要求：必须先推送主表前置规则（规则1），再推送本条子表规则（规则2）——宜搭「公式执行」列表从上到下顺序执行。');
}

function generateAndSave(config, configDir) {
  const { template, mapping, output } = config;

  console.log('=== 生成业务关联规则 JSON ===\n');
  console.log(`模板: ${template.substring(0, 120)}...`);
  console.log(`映射条目数: ${Object.keys(mapping).length}`);

  // 🔴 v3.7.2 强制卡点：UPSERT/INSERT 写目标子表必须配套主表前置规则（UPDATE/DELETE 豁免）
  enforceSubTableCompanionGuard(config, configDir);

  const json = generateRuleJson(template, mapping);

  // 验证
  console.log(`\n生成结果:`);
  console.log(`  文本长度: ${json.text.length}`);
  console.log(`  令牌数量: ${json.marks.length}`);

  // 验证每个 mark 对应的文本片段
  console.log(`\n  令牌验证 (所有 mark 必须满足：text[from.ch] == ZWS 且 text[to.ch-1] == ZWS):`);
  let allValid = true;
  for (let i = 0; i < json.marks.length; i++) {
    const m = json.marks[i];
    const slice = json.text.substring(m.from.ch, m.to.ch);
    const sliceDisplay = slice.replace(/\u200b/g, '[ZWS]');

    const charAtFrom = json.text[m.from.ch];
    const charAtToMinus1 = json.text[m.to.ch - 1];
    const validFrom = charAtFrom === '\u200b';
    const validTo = charAtToMinus1 === '\u200b';
    const valid = validFrom && validTo;
    if (!valid) allValid = false;

    console.log(`    [${i}] ch:${m.from.ch}-${m.to.ch}  span:${m.to.ch - m.from.ch}  ${valid ? '✅' : '❌ 必须从 ZWS 开始并以 ZWS 结束!'}`);
    console.log(`         text: "${sliceDisplay}"`);
    console.log(`         value: "${m.value}"`);
  }

  if (!allValid) {
    console.error('\n❌ 验证失败：部分令牌的 ZWS 边界不匹配，这是 marks 计算错误的直接证据');
    process.exit(1);
  }

  // 🔴 v3.7.0 新增：花括号残留检查——最终公式绝不应含任何 { 或 }
  //   （宜搭业务关联公式不使用花括号；若残留，说明占位符未被正确替换，
  //   会生成像 `UPSERT({​库存信息​},...)` 的非法公式，宜搭校验必然失败）
  if (json.text.includes('{') || json.text.includes('}')) {
    console.error('\n❌ 验证失败：生成的公式中残留了花括号 { 或 }');
    console.error(`   公式文本: ${json.text.replace(/\u200b/g, '[ZWS]')}`);
    console.error('   可能原因：模板中的占位符 {xxx} 在 mapping 中找不到对应 key（注意 mapping 的 key 不带花括号）');
    console.error('   排查：确保模板里每个 {key} 都在 mapping 中有同名（不带花括号）的条目');
    process.exit(1);
  }

  // 写入文件
  const outputPath = path.resolve(process.cwd(), output);
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(json));
  console.log(`\n✅ 已保存到: ${outputPath}`);
  console.log(`\n建议: 运行以下命令推送到宜搭:`);
  console.log(`  node .agents/skills/business-rule/scripts/push-rule.js --json "${output}" --md "${output.replace('.json', '.md')}"`);
}

if (require.main === module) {
  if (process.argv[2] && process.argv[2].endsWith('.json')) {
    mainCli();
  } else {
    // CLI 模式（向后兼容）
    const { template, mapping, output } = parseArgs();
    if (!template || !mapping || !output) {
      console.error('用法: node generate-rule-json-from-config.js <config.json>');
      process.exit(1);
    }
    generateAndSave({ template, mapping, output });
  }
}

module.exports = { generateRuleJson, generateAndSave, enforceSubTableCompanionGuard };
