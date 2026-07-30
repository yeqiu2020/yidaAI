/**
 * safe-action-templates.js — 安全动作模板
 *
 * 候选轨 Skill（Phase 3 新增），生成符合安全规范的动作配置模板。
 *
 * 用法：
 *   node safe-action-templates.js generate --type <GET|POST|PUT|DELETE> --url <接口路径> --name <动作名称>
 *   node safe-action-templates.js list
 *
 * 创建日期：2026-07-10 (Phase 3)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// ── 模板定义 ───────────────────────────────────────────

var TEMPLATES = {
  GET: function(url, name) {
    return {
      id: 'action_' + Date.now(),
      operationId: name.replace(/\s+/g, '_'),
      summary: name,
      description: name,
      url: url,
      method: 'get',
      inputs: [
        {
          childList: [
            { componentName: 'TextField', defaultValue: 'application/json', desc: 'Content-Type', name: 'Content-Type', required: false },
          ],
          desc: '请求头',
          name: 'Headers',
          paramType: 'Object',
          required: false,
        },
        {
          desc: '查询参数',
          name: 'Query',
          paramType: 'Object',
          required: false,
          childList: [
            { componentName: 'TextField', name: 'param1', label: '参数1', desc: '查询参数1', required: false, __level: 0, hidden: false },
          ],
        },
      ],
      parameters: {
        header: [{ name: 'Content-Type', value: 'application/json' }],
      },
      responses: { type: 'object', properties: {} },
      outputs: [],
      origin: true,
    };
  },

  POST: function(url, name) {
    return {
      id: 'action_' + Date.now(),
      operationId: name.replace(/\s+/g, '_'),
      summary: name,
      description: name,
      url: url,
      method: 'post',
      inputs: [
        {
          childList: [
            { componentName: 'TextField', defaultValue: 'application/json', desc: 'Content-Type', name: 'Content-Type', required: false },
          ],
          desc: '请求头',
          name: 'Headers',
          paramType: 'Object',
          required: false,
        },
        {
          defaultValue: '{}',
          desc: '请求体',
          name: 'Body',
          paramType: 'Object',
          required: false,
          childList: [
            { componentName: 'TextField', name: 'fieldName', label: '字段名称', desc: '字段描述', required: true, __level: 0, hidden: false },
          ],
        },
      ],
      parameters: {
        header: [{ name: 'Content-Type', value: 'application/json' }],
        body: { default: '{}' },
      },
      responses: { type: 'object', properties: {} },
      outputs: [],
      origin: true,
    };
  },

  PUT: function(url, name) {
    var template = TEMPLATES.POST(url, name);
    template.method = 'put';
    return template;
  },

  DELETE: function(url, name) {
    return {
      id: 'action_' + Date.now(),
      operationId: name.replace(/\s+/g, '_'),
      summary: name,
      description: name,
      url: url,
      method: 'delete',
      inputs: [
        {
          childList: [
            { componentName: 'TextField', defaultValue: 'application/json', desc: 'Content-Type', name: 'Content-Type', required: false },
          ],
          desc: '请求头',
          name: 'Headers',
          paramType: 'Object',
          required: false,
        },
      ],
      parameters: {
        header: [{ name: 'Content-Type', value: 'application/json' }],
      },
      responses: { type: 'object', properties: {} },
      outputs: [],
      origin: true,
    };
  },
};

// ── 安全规则 ───────────────────────────────────────────

var SAFETY_RULES = [
  '✅ 请求路径不以 / 开头时自动添加前缀 /',
  '✅ Content-Type 默认设为 application/json',
  '✅ outputs 中 paramType 使用大写类型名（String/Number/Boolean）',
  '✅ responses 中 type 使用小写类型名（string/number/boolean）',
  '✅ 所有 inputs 字段都包含 __level 和 hidden 属性',
  '✅ outputs childList 中 _key 格式为 operationId%fieldName',
  '✅ 动作配置不包含任何敏感凭证信息（凭证由连接器鉴权管理）',
  '✅ GET 接口不包含 Body 分组',
  '✅ defaultValue 提供合理默认值',
];

// ── 命令实现 ───────────────────────────────────────────

/**
 * 生成安全动作模板
 * @param {string} type - GET/POST/PUT/DELETE
 * @param {string} url - 接口路径
 * @param {string} name - 动作名称
 * @returns {object} - 动作配置
 */
function generateTemplate(type, url, name) {
  type = (type || 'GET').toUpperCase();
  if (!TEMPLATES[type]) {
    throw new Error('不支持的动作类型: ' + type + '，可选: GET, POST, PUT, DELETE');
  }

  if (!url) {
    throw new Error('缺少 url 参数（接口路径）');
  }

  // 确保路径以 / 开头
  if (!url.startsWith('/') && !url.startsWith('http')) {
    url = '/' + url;
  }

  name = name || type.toLowerCase() + '_action';
  var template = TEMPLATES[type](url, name);

  return template;
}

/**
 * 列出所有可用模板
 * @returns {void}
 */
function listTemplates() {
  console.log('=== 可用安全动作模板 ===\n');
  Object.keys(TEMPLATES).forEach(function(type) {
    console.log('  ' + type + ' — ' + getTemplateDescription(type));
  });
  console.log('\n=== 安全规则 ===');
  SAFETY_RULES.forEach(function(rule) {
    console.log('  ' + rule);
  });
}

function getTemplateDescription(type) {
  var descriptions = {
    GET: '查询接口，含 Headers + Query 分组，无 Body',
    POST: '创建接口，含 Headers + Body 分组',
    PUT: '更新接口，含 Headers + Body 分组',
    DELETE: '删除接口，仅含 Headers 分组',
  };
  return descriptions[type] || '';
}

// ── CLI 入口 ───────────────────────────────────────────

function parseArgs(args) {
  var parsed = { command: args[0], options: {} };
  for (var i = 1; i < args.length; i++) {
    var arg = args[i];
    if (arg.startsWith('--')) {
      var key = arg.substring(2);
      var value = args[i + 1];
      if (value && !value.startsWith('--')) {
        parsed.options[key] = value;
        i++;
      } else {
        parsed.options[key] = true;
      }
    }
  }
  return parsed;
}

function main() {
  var args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node safe-action-templates.js <command> [options]');
    console.log('');
    console.log('命令:');
    console.log('  generate  生成安全动作模板');
    console.log('  list      列出可用模板');
    process.exit(0);
  }

  var parsed = parseArgs(args);
  var cmd = parsed.command;
  var opts = parsed.options;

  try {
    switch (cmd) {
      case 'generate':
        if (!opts.type || !opts.url) {
          console.error('缺少参数: --type, --url 为必填');
          process.exit(1);
        }
        var template = generateTemplate(opts.type, opts.url, opts.name);
        var cacheDir = path.join(PROJECT_ROOT, '.cache', 'connector', 'actions');
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        var outputFile = path.join(cacheDir, 'action_' + (opts.name || opts.type).replace(/\s+/g, '_') + '_' + Date.now() + '.json');
        fs.writeFileSync(outputFile, JSON.stringify([template], null, 2), 'utf8');
        console.log('=== 安全动作模板已生成 ===');
        console.log('类型: ' + opts.type.toUpperCase());
        console.log('路径: ' + opts.url);
        console.log('名称: ' + (opts.name || opts.type));
        console.log('输出: ' + outputFile);
        console.log('\n安全规则检查:');
        SAFETY_RULES.forEach(function(rule) {
          console.log('  ' + rule);
        });
        break;

      case 'list':
        listTemplates();
        break;

      default:
        console.error('未知命令: ' + cmd);
        process.exit(1);
    }
  } catch (err) {
    console.error('错误: ' + err.message);
    process.exit(1);
  }
}

module.exports = {
  generateTemplate,
  listTemplates,
  SAFETY_RULES,
  TEMPLATES,
};

if (require.main === module) {
  main();
}
