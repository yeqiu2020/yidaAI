'use strict';

/**
 * eval_routing.js — 意图路由离线评测（P5-1，对齐 OpenYida eval --mode routing 机制）
 *
 * 离线无副作用：不调宜搭 API、不创建资源。对 skill-config.json 的触发面（description 关键词 +
 * disambiguationGroups 规则）做匹配模拟，输出命中率与误路由清单。
 *
 * 用法：node scripts/eval_routing.js [--cases tests/eval_routing_cases.json] [--top N]
 * 评测集格式：[{ "utterance": "用户话术", "expected": "skill名" }, ...]
 */

const fs = require('fs');
const path = require('path');
const { explicitIntent } = require('../lib/core/skill-routing');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CASES = path.join(PROJECT_ROOT, 'tests', 'eval_routing_cases.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, '.agents', 'skills', 'skill-config.json'), 'utf8'));
}

/** 从 description/tags/触发关键词中抽取技能的可匹配词条（≥2字符的中文词与英文token） */
function extractTerms(skill) {
  const text = [skill.description || '', (skill.tags || []).join(' ')].join(' ');
  const terms = new Set();
  // 英文/数字 token
  (text.match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g) || []).forEach((t) => terms.add(t.toLowerCase()));
  // 中文 2-4 字词（滑窗，去停用词）
  const zh = text.replace(/[^\u4e00-\u9fa5]/g, ' ');
  const stop = new Set(['用于', '支持', '通过', '可以', '进行', '当用户', '说明', '关键词', '包括', '以及', '能力', '实现', '自动', '触发', '此', '该', '等', '的', '与', '和', '或', '在', '中', '时']);
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i + len <= zh.length; i++) {
      const w = zh.slice(i, i + len);
      if (!stop.has(w) && !/[的了吗呢吧]/.test(w)) { terms.add(w); }
    }
  }
  return terms;
}

/** 话术分词（同样的滑窗 + 英文 token） */
function utteranceTokens(utterance) {
  const tokens = new Set();
  (utterance.match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g) || []).forEach((t) => tokens.add(t.toLowerCase()));
  const zh = utterance.replace(/[^\u4e00-\u9fa5]/g, ' ');
  for (let len = 2; len <= 6; len++) {
    for (let i = 0; i + len <= zh.length; i++) { tokens.add(zh.slice(i, i + len)); }
  }
  return [...tokens];
}

function route(utterance, skills, termIndex) {
  const explicit = explicitIntent(utterance);
  if (explicit && skills.some(skill => skill.name === explicit)) return { predicted: explicit, score: Infinity, scores: [] };
  const tokens = utteranceTokens(utterance);
  let best = null;
  const scores = [];
  for (const skill of skills) {
    let score = 0;
    for (const t of tokens) {
      if (termIndex.get(skill.name) && termIndex.get(skill.name).has(t)) { score += t.length >= 3 ? 2 : 1; }
    }
    scores.push({ name: skill.name, score });
    if (score > 0 && (!best || score > best.score)) { best = { name: skill.name, score }; }
  }
  return { predicted: best ? best.name : '(无命中)', score: best ? best.score : 0, scores };
}

function main() {
  const args = process.argv.slice(2);
  const casesIdx = args.indexOf('--cases');
  const casesFile = casesIdx !== -1 ? path.resolve(PROJECT_ROOT, args[casesIdx + 1]) : DEFAULT_CASES;
  const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const minimumIndex = args.indexOf('--min-rate');
  const minimum = minimumIndex < 0 ? 100 : Number(args[minimumIndex + 1]);
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 100 || !cases.length) throw new Error('非法评测阈值或空用例集');
  const config = loadConfig();
  const skills = (config.skills || []).filter((s) => s.enabled !== false);

  const termIndex = new Map();
  for (const skill of skills) { termIndex.set(skill.name, extractTerms(skill)); }
  // disambiguationGroups 规则强化（when 话术 → use 技能，视为高权重词条直配）
  for (const group of config.disambiguationGroups || []) {
    for (const rule of group.rules || []) {
      const toks = utteranceTokens(rule.when);
      if (!termIndex.has(rule.use)) { termIndex.set(rule.use, new Set()); }
      const set = termIndex.get(rule.use);
      toks.forEach((t) => set.add(t));
    }
  }

  let hit = 0;
  const misses = [];
  for (const c of cases) {
    const r = route(c.utterance, skills, termIndex);
    const ok = r.predicted === c.expected;
    if (ok) { hit++; } else {
      misses.push({ utterance: c.utterance, expected: c.expected, predicted: r.predicted, score: r.score });
    }
    console.log((ok ? 'PASS' : 'MISS') + ' | ' + c.utterance + ' | 期望=' + c.expected + ' | 预测=' + r.predicted);
  }

  const rate = ((hit / cases.length) * 100).toFixed(1);
  console.log('----------------------------------');
  console.log('命中率: ' + hit + '/' + cases.length + ' = ' + rate + '%');
  console.log('误路由清单:');
  misses.forEach((m) => console.log('  - "' + m.utterance + '" 期望 ' + m.expected + ' → 误判 ' + m.predicted));
  const report = { generatedAt: new Date().toISOString(), total: cases.length, hit, hitRate: rate + '%', misses };
  const outPath = path.join(PROJECT_ROOT, '.cache', 'eval', 'routing-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('报告已写入: ' + outPath);
  if (hit * 100 / cases.length < minimum) process.exitCode = 1;
}

main();
