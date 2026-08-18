﻿const fs = require('fs');
const path = require('path');
const os = require('os');
const querystring = require('querystring');
const https = require('https');
const http = require('http');

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require('../../../../lib/core/utils');

var PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 阶段二改造：Cookie 优先全局，兼容项目根
var GLOBAL_COOKIES_PATH = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
var COOKIES_PATH = fs.existsSync(GLOBAL_COOKIES_PATH) ? GLOBAL_COOKIES_PATH : path.join(PROJECT_ROOT, '.cookies.json');
var PREFIX = '_view';
var DOMAIN_CODE = 'tEXDRG';

// Phase 6: loadCookieData 委托给 lib/core/utils.loadCookieData（统一实现）
// 保留原行为：cookie 文件不存在时 process.exit(1)
function loadCookieData() {
  const data = coreUtils.loadCookieData(PROJECT_ROOT);
  if (!data) {
    console.error('Cookie 文件不存在或为空: ' + COOKIES_PATH);
    process.exit(1);
  }
  return data;
}

function httpRequest(method, baseUrl, apiPath, postData, cookieStr) {
  return new Promise(function(resolve, reject) {
    var url = new URL(apiPath, baseUrl);
    var isHttps = url.protocol === 'https:';
    var reqModule = isHttps ? https : http;
    var opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Cookie': cookieStr,
        'Origin': baseUrl,
        'Referer': baseUrl + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };
    if (method === 'POST' && postData) {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    var req = reqModule.request(opts, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(body)); }
        catch(e) { resolve({ success: false, errorMsg: 'JSON parse error', raw: body.substring(0, 300) }); }
      });
    });
    req.on('error', reject);
    if (method === 'POST' && postData) { req.write(postData); }
    req.end();
  });
}

function compileSource(sourceCode, moduleType) {
  var modules = moduleType !== undefined ? moduleType : 'commonjs';
  try {
    var babelStandalone = require('@babel/standalone');
    var babelResult = babelStandalone.transform(sourceCode, {
      presets: [['env', { targets: { chrome: '49' }, modules: modules }], 'react'],
      plugins: [],
    });
    var compiled = babelResult.code || sourceCode;
    try {
      var UglifyJS = require('uglify-js');
      var uglifyResult = UglifyJS.minify(compiled);
      if (uglifyResult.code) {
        compiled = uglifyResult.code;
      }
    } catch(uglifyErr) {
      console.log('  UglifyJS 不可用，使用 Babel 编译结果');
    }
    return compiled;
  } catch(babelErr) {
    console.log('  Babel 不可用，使用原始代码');
    return sourceCode;
  }
}

function extractExportedFunctions(sourceCode) {
  var names = [];
  var regex = /export\s+function\s+(\w+)\s*\(/g;
  var match;
  while ((match = regex.exec(sourceCode)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function createNodeIdGenerator() {
  var counter = 100;
  return function() {
    counter += 1;
    return 'node_' + counter;
  };
}

function generateSuffix() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

function buildDefaultPageDataSource(formUuid) {
  return {
    list: [
      { id: 'urlParams', type: 'custom', options: { uri: '', isSync: false }, description: 'URL\u53C2\u6570' },
      { id: 'timestamp', type: 'custom', options: { uri: '', isSync: false }, description: '\u65F6\u95F4\u6233' },
    ],
  };
}

function buildSchemaContent(sourceCode, compiledCode, commonjsCompiledCode, formUuid, exportedFuncNames) {
  var nextNodeId = createNodeIdGenerator();
  var constructorCode = "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}";

  var initMethodsFunc = 'var exports = arguments[0]; var module = arguments[1];\n' + commonjsCompiledCode;
  var actionList = exportedFuncNames.map(function(name) {
    return { id: name, title: name };
  });

  var schema = {
    schemaType: 'superform',
    schemaVersion: '5.0',
    pages: [{
      utils: [
        { name: 'legaoBuiltin', type: 'npm', content: { package: '@ali/vu-legao-builtin', version: '3.0.0', exportName: 'legaoBuiltin' } },
        { name: 'yidaPlugin', type: 'npm', content: { package: '@ali/vu-yida-plugin', version: '1.1.0', exportName: 'yidaPlugin' } },
      ],
      componentsMap: [
        { package: '@ali/vc-deep-yida', version: '1.5.169', componentName: 'RootHeader' },
        { package: '@ali/vc-deep-yida', version: '1.5.169', componentName: 'Jsx' },
        { package: '@ali/vc-deep-yida', version: '1.5.169', componentName: 'RootContent' },
        { package: '@ali/vc-deep-yida', version: '1.5.169', componentName: 'RootFooter' },
        { package: '@ali/vc-deep-yida', version: '1.5.169', componentName: 'Page' },
      ],
      componentsTree: [{
        componentName: 'Page',
        id: nextNodeId(),
        props: {
          contentBgColor: 'white',
          pageStyle: { backgroundColor: '#f2f3f5' },
          contentMargin: '0',
          contentPadding: '0',
          showTitle: false,
          contentPaddingMobile: '0',
          templateVersion: '1.0.0',
          contentMarginMobile: '0',
          className: 'page_' + generateSuffix(),
          contentBgColorMobile: 'white',
        },
        condition: true,
        css: 'body{background-color:#f2f3f5}.vc-page-yida-page{--yida-form-content-padding:0;--yida-form-content-margin:0;--yida-layout-padding:0}.vc-deep-container-entry.vc-rootcontent{padding:0!important;margin-top:0!important;margin-right:0!important;margin-bottom:0!important;margin-left:0!important}',
        methods: {
          __initMethods__: {
            type: 'js',
            source: initMethodsFunc,
            compiled: initMethodsFunc,
          },
        },
        dataSource: buildDefaultPageDataSource(formUuid),
        lifeCycles: {
          constructor: { type: 'js', compiled: constructorCode, source: constructorCode },
          componentWillUnmount: { name: 'didUnmount', id: 'didUnmount', type: 'actionRef', params: {} },
          componentDidMount: { name: 'didMount', id: 'didMount', params: {}, type: 'actionRef' },
        },
        hidden: false,
        title: '',
        isLocked: false,
        conditionGroup: '',
        children: [
          { componentName: 'RootHeader', id: nextNodeId(), props: {}, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '' },
          { componentName: 'RootContent', id: nextNodeId(), props: {}, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '', children: [
            { componentName: 'Jsx', id: nextNodeId(), props: {
              render: {
                type: 'js',
                compiled: 'function main(){\n    \n    "use strict";\n\nvar __compiledFunc__ = function render() {\n  return this.renderJsx();\n};\n    return __compiledFunc__.apply(this, arguments);\n  }',
                source: 'function render() {\n  return this.renderJsx();\n}',
                error: {},
              },
              __style__: {},
              fieldId: 'jsx_' + generateSuffix(),
            }, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '' },
          ]},
          { componentName: 'RootFooter', id: nextNodeId(), props: {}, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '' },
        ],
      }],
      id: formUuid,
      connectComponent: [],
    }],
    actions: {
      module: { compiled: compiledCode, source: sourceCode },
      type: 'FUNCTION',
      list: actionList,
    },
    config: { connectComponent: [] },
  };

  return JSON.stringify(schema);
}

async function checkPageExists(baseUrl, appType, formUuid, cookieStr) {
  var checkPath = '/alibaba/web/' + appType + '/_view/query/formdesign/getFormSchema.json?formUuid=' + formUuid + '&_stamp=' + Date.now();
  try {
    var result = await httpRequest('GET', baseUrl, checkPath, null, cookieStr);
    return result.success && result.content && Object.keys(result.content).length > 0;
  } catch(e) {
    return false;
  }
}

async function createCustomPage(baseUrl, appType, pageName, csrfToken, cookieStr) {
  console.log('  正在创建自定义页面...');
  var title = JSON.stringify({ zh_CN: pageName, en_US: pageName, type: 'i18n' });
  var createPath = '/alibaba/web/' + appType + '/query/formdesign/saveFormSchemaInfo.json?_stamp=' + Date.now();
  var postData = querystring.stringify({
    _csrf_token: csrfToken,
    formType: 'display',
    relateFormType: 'receipt',
    relateFormUuid: '',
    parentNavUuid: '',
    title: title,
  });

  var result = await httpRequest('POST', baseUrl, createPath, postData, cookieStr);

  if (result.success && result.content) {
    var newFormUuid = result.content.formUuid || result.content;
    console.log('  页面创建成功: ' + newFormUuid);
    return newFormUuid;
  } else {
    throw new Error('创建页面失败: ' + JSON.stringify(result).substring(0, 300));
  }
}

async function main() {
  var args = process.argv.slice(2);
  
  // ── 解析 --no-lint 开关（增量增强，Phase 3）──
  var skipLint = false;
  args = args.filter(function(arg) {
    if (arg === '--no-lint') {
      skipLint = true;
      return false;
    }
    return true;
  });
  
  if (args.length < 2) {
    console.log('用法: node publish-page.js <代码文件路径> <appType> [formUuid] [页面名称] [--no-lint]');
    console.log('');
    console.log('参数说明:');
    console.log('  代码文件路径  JSX 源码文件路径 (.js/.jsx native, .canvas.jsx/.canvas.tsx Canvas)');
    console.log('  appType       应用ID (如 APP_C8U5IYBXYRHUWY0H3GJ8)');
    console.log('  formUuid      自定义页面ID (可选，若不提供则自动创建新页面)');
    console.log('  页面名称      自定义页面名称 (可选，默认"自定义页面")');
    console.log('  --no-lint     跳过 lint 检查（可选）');
    process.exit(1);
  }

  // ── Canvas 链路检测（增量增强，Phase 3）──
  // .canvas.jsx / .canvas.tsx 文件走 Canvas 编译链路
  // 不影响现有 native .js/.oyd.jsx 文件的发布流程
  var codePathRaw = args[0];
  var fileNameLower = path.basename(codePathRaw).toLowerCase();
  if (fileNameLower.endsWith('.canvas.jsx') || fileNameLower.endsWith('.canvas.tsx')) {
    console.log('检测到 Canvas 源码文件，切换到 Canvas 编译链路...');
    var canvasPublishPath = path.join(__dirname, 'canvas-publish.js');
    // 将 --no-lint 传递给 Canvas 发布流程
    var canvasArgs = args.slice();
    if (skipLint) canvasArgs.push('--no-lint');
    var child = require('child_process').fork(canvasPublishPath, canvasArgs, { stdio: 'inherit' });
    child.on('exit', function(code) { process.exit(code || 0); });
    return;
  }

  var codePath = path.resolve(args[0]);
  var appType = args[1];
  var formUuid = args[2] || '';
  var pageName = args[3] || '自定义页面';
  if (formUuid && !formUuid.startsWith('FORM-')) {
    pageName = formUuid;
    formUuid = '';
  }

  console.log('=== 发布自定义页面 ===');
  console.log('代码文件: ' + codePath);
  console.log('应用ID: ' + appType);

  var cookieData = loadCookieData();
  var cookieStr = cookieData.cookies.map(function(c) { return c.name + '=' + c.value; }).join('; ');

  console.log('用户: ' + (cookieData.login_user ? cookieData.login_user.userName : '未知'));
  console.log('平台: ' + cookieData.base_url);

  if (!fs.existsSync(codePath)) {
    console.error('代码文件不存在: ' + codePath);
    process.exit(1);
  }
  var sourceCode = fs.readFileSync(codePath, 'utf8');
  console.log('代码长度: ' + sourceCode.length + ' 字符');

  // ── 发布前 Lint 检查（增量增强，Phase 3）──
  // lint → 编译 → 压缩 → 发布
  // 默认：警告非阻断，仅致命错误阻断；--no-lint 可完全跳过
  if (!skipLint) {
    try {
      var linter = require(path.join(__dirname, 'lint-page.js'));
      var lintResult = linter.lintCode(sourceCode, path.basename(codePath));
      console.log(linter.formatLintResult(lintResult));
      if (!lintResult.passed) {
        console.error('\n❌ Lint 检查发现 ' + lintResult.fatalIssues.length + ' 个致命错误，发布中止。');
        console.error('   修复后重试，或使用 --no-lint 跳过检查（不推荐）。');
        process.exit(1);
      }
    } catch(lintErr) {
      console.log('  ⚠️ Lint 脚本加载失败，跳过检查: ' + lintErr.message);
    }
  } else {
    console.log('⚠️ 已跳过 lint 检查 (--no-lint)');
  }

  if (!formUuid) {
    console.log('\n[Step 0] 未提供 formUuid，自动创建自定义页面...');
    formUuid = await createCustomPage(cookieData.base_url, appType, pageName, cookieData.csrf_token, cookieStr);
    console.log('新页面ID: ' + formUuid);
  } else {
    console.log('页面ID: ' + formUuid);
    var exists = await checkPageExists(cookieData.base_url, appType, formUuid, cookieStr);
    if (!exists) {
      console.log('\n[Step 0] 页面不存在，自动创建自定义页面...');
      formUuid = await createCustomPage(cookieData.base_url, appType, pageName, cookieData.csrf_token, cookieStr);
      console.log('新页面ID: ' + formUuid);
    }
  }

  var exportedFuncNames = extractExportedFunctions(sourceCode);
  console.log('导出函数: ' + exportedFuncNames.join(', '));

  console.log('\n[Step 1] 编译代码 (CommonJS)...');
  var commonjsCompiledCode = compileSource(sourceCode, 'commonjs');
  console.log('CommonJS 编译后长度: ' + commonjsCompiledCode.length + ' 字符');

  console.log('\n[Step 2] 构建 Schema...');
  var schemaContent = buildSchemaContent(sourceCode, commonjsCompiledCode, commonjsCompiledCode, formUuid, exportedFuncNames);
  console.log('Schema 长度: ' + schemaContent.length + ' 字符');

  console.log('\n[Step 3] 保存到宜搭平台...');
  var savePath = '/alibaba/web/' + appType + '/' + PREFIX + '/query/formdesign/saveFormSchema.json?_stamp=' + Date.now();
  var postData = querystring.stringify({
    _csrf_token: cookieData.csrf_token,
    prefix: PREFIX,
    content: schemaContent,
    formUuid: formUuid,
    schemaVersion: 'V5',
    domainCode: DOMAIN_CODE,
    importSchema: 'true',
  });

  var saveRes = await httpRequest('POST', cookieData.base_url, savePath, postData, cookieStr);

  if (saveRes.success) {
    console.log('\n=== 发布成功! ===');
    console.log('页面ID: ' + formUuid);
    console.log('页面名称: ' + pageName);
    console.log('设计器: ' + cookieData.base_url + '/alibaba/web/' + appType + '/design/pageDesigner?formUuid=' + formUuid);
    console.log('工作台: ' + cookieData.base_url + '/' + appType + '/workbench/' + formUuid);
  } else {
    console.error('\n=== 发布失败 ===');
    console.error('错误: ' + JSON.stringify(saveRes).substring(0, 500));
    if (saveRes.errorMsg && (saveRes.errorMsg.indexOf('302') >= 0 || saveRes.errorMsg.indexOf('LOGIN') >= 0)) {
      console.error('\n登录态已过期，请先运行: node .agents/skills/api-client/scripts/login_manager.js');
    }
    process.exit(1);
  }
}

// 导出函数供门禁测试和其他模块 require 使用
module.exports = {
  compileSource,
  extractExportedFunctions,
  buildSchemaContent,
  buildDefaultPageDataSource,
  createNodeIdGenerator,
  generateSuffix,
  httpRequest,
  loadCookieData,
  main,
};

// 仅在直接运行时执行 main（防止 require 时触发 process.exit）
if (require.main === module) {
  main().catch(function(e) { console.error('发布异常:', e); process.exit(1); });
}
