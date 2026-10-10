#!/usr/bin/env node
/**
 * verify_card_flows.js — 卡片流程发布/启用状态核验
 * 用法：node .agents/skills/cool-card/scripts/verify_card_flows.js <appType> [流程名关键词]
 * 说明：包装 integration skill 的公开 CLI integration-list.js（规则5：可调用其他技能公开入口）。
 *       该 CLI 在非 TTY 下输出单行 JSON（flows[].status: "y"=启用）。
 * 退出码：0=目标流程全部启用；1=存在未启用/未找到；2=调用失败
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const appType = process.argv[2];
const keyword = process.argv[3] || '';
if (!appType) {
  console.error('用法: node verify_card_flows.js <appType> [流程名关键词]');
  process.exit(2);
}

const listCli = path.resolve(__dirname, '../../integration/scripts/integration-list.js');
const res = spawnSync(process.execPath, [listCli, 'list', appType], { encoding: 'utf8', timeout: 60000 });
if (res.error || res.status !== 0) {
  console.error('调用 integration-list 失败:', (res.stderr || res.error || '').toString().slice(0, 300));
  process.exit(2);
}

// 取 stdout 中最后一行 JSON 解析
let flows = [];
for (const line of (res.stdout || '').split('\n').reverse()) {
  const t = line.trim();
  if (t.startsWith('{') && t.includes('"flows"')) {
    flows = JSON.parse(t).flows || [];
    break;
  }
}

const targets = keyword ? flows.filter(f => (f.name || '').includes(keyword)) : flows;
if (!targets.length) {
  console.log('未找到匹配流程（关键词: ' + (keyword || '全部') + '）。注意：手动触发类流程不出现在此列表，需在 UI 核验。');
  process.exit(1);
}

let allEnabled = true;
for (const f of targets) {
  const ok = f.status === 'y';
  if (!ok) allEnabled = false;
  console.log((ok ? '✅' : '❌') + ' [' + (f.status === 'y' ? '启用' : f.status) + '] ' + f.name + '  ' + f.processCode);
}
console.log(allEnabled ? '\n✅ 目标流程全部启用' : '\n❌ 存在未启用流程，请到设计器发布并在列表行开启第二个开关');
process.exit(allEnabled ? 0 : 1);
