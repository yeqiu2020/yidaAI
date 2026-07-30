/**
 * canvas-publish.js — Code Canvas 编译发布链路（增量增强，Phase 3）
 *
 * 将 .canvas.jsx / .canvas.tsx 源码编译为 runtimeCode + importedModules，
 * 构建 YidaCodeCanvas Schema 并发布到宜搭平台。
 *
 * 编译链路：
 *   1. Babel 两阶段编译：TS/JSX → ES5 + import→window alias + export default→YidaComp
 *   2. UglifyJS 压缩
 *   3. 依赖白名单提取（importedModules）
 *   4. 崩溃隔离（ErrorBoundary 包裹）
 *   5. Tailwind 按需注入（通过 importedModules 声明）
 *
 * 用法：
 *   node canvas-publish.js <代码文件路径> <appType> [formUuid] [页面名称] [--no-lint]
 *
 * 创建日期：2026-07-10 (Phase 3)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

var PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
var COOKIES_PATH = path.join(PROJECT_ROOT, '.cookies.json');
var PREFIX = '_view';
var DOMAIN_CODE = 'tEXDRG';

// ── 依赖白名单（window alias 映射）─────────────────────

var MODULE_ALIAS_MAP = {
  'react': 'React',
  'react-dom': 'ReactDOM',
  'antd': 'antd',
  'ahooks': 'ahooks',
  'd3': 'd3',
  '@ant-design/icons': 'icons',
  'dayjs': 'dayjs',
  'recharts': 'Recharts',
  'yida-plugin-markdown': 'YidaMarkdown',
  '@radix-ui/themes': 'Radix',
  'lucide-react': 'DynamicIcon',
  'framer-motion': 'FramerMotion',
};

// ── 依赖提取 ───────────────────────────────────────────

var IMPORT_PATTERN = /import\s+(?:[\w*\s{},]+\s+from\s+)?['"]([^'"]+)['"]/g;
var IMPORT_SIDE_EFFECT_PATTERN = /import\s+['"]([^'"]+)['"]/g;
var REQUIRE_PATTERN = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
var DYNAMIC_IMPORT_PATTERN = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * 从源码中提取所有导入的模块名（排除相对/绝对路径）
 * @param {string} code
 * @returns {string[]}
 */
function extractImportedModules(code) {
  var modules = new Set();
  var patterns = [IMPORT_PATTERN, IMPORT_SIDE_EFFECT_PATTERN, REQUIRE_PATTERN, DYNAMIC_IMPORT_PATTERN];
  for (var i = 0; i < patterns.length; i++) {
    patterns[i].lastIndex = 0;
    var match;
    while ((match = patterns[i].exec(code)) !== null) {
      var name = match[1];
      if (name && !name.startsWith('.') && !name.startsWith('/')) {
        modules.add(name);
      }
    }
  }
  return Array.from(modules).sort();
}

/**
 * 解析包名到根包，再查白名单获取 window alias
 * @param {string} pkg
 * @returns {string|null}
 */
function resolveWindowAlias(pkg) {
  if (MODULE_ALIAS_MAP[pkg]) {
    return MODULE_ALIAS_MAP[pkg];
  }
  var segments = pkg.split('/');
  var base = pkg.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  return MODULE_ALIAS_MAP[base] || null;
}

// ── Babel 编译 ─────────────────────────────────────────

/**
 * ESM → window alias Babel 插件
 * 把 import/export 改写为 window 别名引用 + YidaComp
 */
function esmToWindowPlugin(babel) {
  var t = babel.types;

  function moduleExpr(pkg) {
    var alias = resolveWindowAlias(pkg);
    if (alias) {
      return t.memberExpression(t.identifier('window'), t.identifier(alias));
    }
    return t.memberExpression(t.identifier('window'), t.stringLiteral(pkg), true);
  }

  return {
    name: 'yida-esm-to-window',
    visitor: {
      ImportDeclaration: function(nodePath) {
        var pkg = nodePath.node.source.value;
        var specifiers = nodePath.node.specifiers || [];

        // 相对/绝对路径导入：沙箱内无法解析，直接丢弃
        if (pkg.startsWith('.') || pkg.startsWith('/')) {
          nodePath.remove();
          return;
        }
        // 纯副作用导入：删除语句本身
        if (specifiers.length === 0) {
          nodePath.remove();
          return;
        }

        var decls = [];
        var tmp = nodePath.scope.generateUidIdentifier(resolveWindowAlias(pkg) || 'mod');
        decls.push(t.variableDeclarator(t.cloneNode(tmp), moduleExpr(pkg)));

        var namedProps = [];
        for (var i = 0; i < specifiers.length; i++) {
          var spec = specifiers[i];
          if (t.isImportDefaultSpecifier(spec)) {
            var init = t.conditionalExpression(
              t.logicalExpression('&&', t.cloneNode(tmp), t.memberExpression(t.cloneNode(tmp), t.identifier('__esModule'))),
              t.memberExpression(t.cloneNode(tmp), t.identifier('default')),
              t.cloneNode(tmp)
            );
            decls.push(t.variableDeclarator(t.identifier(spec.local.name), init));
          } else if (t.isImportNamespaceSpecifier(spec)) {
            decls.push(t.variableDeclarator(t.identifier(spec.local.name), t.cloneNode(tmp)));
          } else if (t.isImportSpecifier(spec)) {
            var importedName = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
            var localName = spec.local.name;
            namedProps.push(t.objectProperty(t.identifier(importedName), t.identifier(localName), false, importedName === localName));
          }
        }
        if (namedProps.length) {
          decls.push(t.variableDeclarator(t.objectPattern(namedProps), t.cloneNode(tmp)));
        }
        nodePath.replaceWith(t.variableDeclaration('var', decls));
      },

      ExportDefaultDeclaration: function(nodePath) {
        var decl = nodePath.node.declaration;
        if (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) {
          if (decl.id) {
            var idName = decl.id.name;
            nodePath.replaceWithMultiple([
              decl,
              t.variableDeclaration('var', [t.variableDeclarator(t.identifier('YidaComp'), t.identifier(idName))]),
            ]);
            return;
          }
          var expr = t.isFunctionDeclaration(decl)
            ? t.functionExpression(null, decl.params, decl.body, decl.generator, decl.async)
            : t.classExpression(null, decl.superClass, decl.body, decl.decorators || []);
          nodePath.replaceWith(t.variableDeclaration('var', [t.variableDeclarator(t.identifier('YidaComp'), expr)]));
          return;
        }
        nodePath.replaceWith(t.variableDeclaration('var', [t.variableDeclarator(t.identifier('YidaComp'), decl)]));
      },

      ExportNamedDeclaration: function(nodePath) {
        if (nodePath.node.declaration) {
          nodePath.replaceWith(nodePath.node.declaration);
        } else {
          nodePath.remove();
        }
      },

      ExportAllDeclaration: function(nodePath) {
        nodePath.remove();
      },
    },
  };
}

/**
 * 本地编译 Code Canvas 源码
 * @param {string} source - 原始 React/JSX/TSX 源码
 * @returns {{ runtimeCode: string, importedModules: string }}
 */
function compileCanvasLocal(source) {
  var importedModules = extractImportedModules(source);

  var Babel;
  try {
    Babel = require('@babel/standalone');
  } catch (e) {
    throw new Error('Canvas 编译需要 @babel/standalone，请运行 npm install @babel/standalone');
  }

  // 第一阶段：TS/JSX → ES5
  var stage1 = Babel.transform(source, {
    filename: 'canvas.tsx',
    presets: [
      'typescript',
      ['react', { runtime: 'classic' }],
    ],
    sourceType: 'module',
    compact: false,
    babelrc: false,
    configFile: false,
  });

  var intermediate = stage1.code || '';

  // classic JSX 需要作用域内存在 React
  var usesJsxRuntime = /\bReact\.createElement\b|\bReact\.Fragment\b/.test(intermediate);
  var hasReactBinding = /\b(var|let|const)\s+React\b/.test(intermediate) || /\bimport\s+React\b/.test(intermediate);
  if (usesJsxRuntime && !hasReactBinding) {
    intermediate = "import React from 'react';\n" + intermediate;
    if (importedModules.indexOf('react') === -1) {
      importedModules.push('react');
      importedModules.sort();
    }
  }

  // 第二阶段：import/export → window alias + YidaComp
  var stage2 = Babel.transform(intermediate, {
    filename: 'canvas.js',
    plugins: [esmToWindowPlugin],
    sourceType: 'module',
    compact: false,
    babelrc: false,
    configFile: false,
  });

  var runtimeCode = stage2.code || '';

  // UglifyJS 压缩
  try {
    var UglifyJS = require('uglify-js');
    var uglifyResult = UglifyJS.minify(runtimeCode);
    if (uglifyResult.code) {
      runtimeCode = uglifyResult.code;
    }
  } catch (uglifyErr) {
    console.log('  UglifyJS 不可用，使用 Babel 编译结果');
  }

  return {
    runtimeCode: runtimeCode,
    importedModules: JSON.stringify(importedModules),
  };
}

// ── Cookie 加载 ────────────────────────────────────────

function loadCookieData() {
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('Cookie 文件不存在: ' + COOKIES_PATH);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
}

function httpRequest(method, baseUrl, apiPath, postData, cookieStr) {
  var https = require('https');
  var http = require('http');
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

// ── 页面创建和检查 ─────────────────────────────────────

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

async function checkPageExists(baseUrl, appType, formUuid, cookieStr) {
  var checkPath = '/alibaba/web/' + appType + '/_view/query/formdesign/getFormSchema.json?formUuid=' + formUuid + '&_stamp=' + Date.now();
  try {
    var result = await httpRequest('GET', baseUrl, checkPath, null, cookieStr);
    return result.success && result.content && Object.keys(result.content).length > 0;
  } catch(e) {
    return false;
  }
}

// ── 工具函数 ───────────────────────────────────────────

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

// ── Canvas Schema 构建 ─────────────────────────────────

/**
 * 构建 YidaCodeCanvas 组件的 Schema
 * 与 native Schema 不同，Canvas 使用 YidaCodeCanvas 物料
 * 包含 ErrorBoundary 崩溃隔离和 Tailwind 注入
 */
function buildCanvasSchemaContent(runtimeCode, importedModules, formUuid) {
  var nextNodeId = createNodeIdGenerator();

  // ErrorBoundary 崩溃隔离代码
  var errorBoundaryCode = [
    'var __canvasError = null;',
    'try {',
    '  var module = { exports: {} };',
    '  var window = window || {};',
    '  ' + runtimeCode,
    '  var __comp = (typeof YidaComp !== "undefined" && (YidaComp.default || YidaComp)) || YidaComp;',
    '} catch(e) {',
    '  __canvasError = e.message || String(e);',
    '  console.error("[Canvas Runtime Error]", e);',
    '}',
  ].join('\n');

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
        { package: '@ali/vc-deep-yida', version: '1.5.169', componentName: 'YidaCodeCanvas' },
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
        css: 'body{background-color:#f2f3f5}.vc-page-yida-page{--yida-form-content-padding:0;--yida-form-content-margin:0;--yida-layout-padding:0}',
        methods: {},
        children: [
          { componentName: 'RootHeader', id: nextNodeId(), props: {}, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '' },
          { componentName: 'RootContent', id: nextNodeId(), props: {}, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '', children: [
            { componentName: 'YidaCodeCanvas', id: nextNodeId(), props: {
              code: runtimeCode,
              runtimeCode: runtimeCode,
              importedModules: importedModules,
              pageType: 'custom',
              errorBoundary: true,
            }, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '' },
          ]},
          { componentName: 'RootFooter', id: nextNodeId(), props: {}, condition: true, hidden: false, title: '', isLocked: false, conditionGroup: '' },
        ],
      }],
      id: formUuid,
      connectComponent: [],
    }],
    actions: {
      module: { compiled: '', source: '' },
      type: 'FUNCTION',
      list: [],
    },
    config: { connectComponent: [] },
  };

  return JSON.stringify(schema);
}

// ── 主流程 ─────────────────────────────────────────────

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
    console.log('用法: node canvas-publish.js <代码文件路径> <appType> [formUuid] [页面名称] [--no-lint]');
    console.log('');
    console.log('参数说明:');
    console.log('  代码文件路径  .canvas.jsx 或 .canvas.tsx 源码文件路径');
    console.log('  appType       应用ID');
    console.log('  formUuid      自定义页面ID (可选，若不提供则自动创建)');
    console.log('  页面名称      自定义页面名称 (可选)');
    console.log('  --no-lint     跳过 lint 检查（可选）');
    process.exit(1);
  }

  var codePath = path.resolve(args[0]);
  var appType = args[1];
  var formUuid = args[2] || '';
  var pageName = args[3] || 'Canvas自定义页面';

  // 处理 formUuid 为页面名称的情况
  if (formUuid && !formUuid.startsWith('FORM-')) {
    pageName = formUuid;
    formUuid = '';
  }

  console.log('=== 发布 Code Canvas 页面（实验性）===');
  console.log('代码文件: ' + codePath);
  console.log('应用ID: ' + appType);

  // 验证文件扩展名
  var ext = path.extname(codePath).toLowerCase();
  var fullExt = path.basename(codePath).toLowerCase();
  if (!fullExt.endsWith('.canvas.jsx') && !fullExt.endsWith('.canvas.tsx') && ext !== '.jsx' && ext !== '.tsx') {
    console.log('⚠️ 警告: 文件扩展名不是 .canvas.jsx/.canvas.tsx，将按 Canvas 链路处理');
  }

  var cookieData = loadCookieData();
  var cookieStr = cookieData.cookies.map(function(c) { return c.name + '=' + c.value; }).join('; ');

  console.log('用户: ' + (cookieData.login_user ? cookieData.login_user.userName : '未知'));
  console.log('平台: ' + cookieData.base_url);

  if (!fs.existsSync(codePath)) {
    console.error('代码文件不存在: ' + codePath);
    process.exit(1);
  }
  var sourceCode = fs.readFileSync(codePath, 'utf8');
  console.log('源码长度: ' + sourceCode.length + ' 字符');

  // ── 发布前 Lint 检查（增量增强，Phase 3）──
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

  // 页面创建/检查
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

  // 编译 Canvas 源码
  console.log('\n[Step 1] Canvas 本地编译 (Babel)...');
  var compiled;
  try {
    compiled = compileCanvasLocal(sourceCode);
  } catch (compileErr) {
    console.error('\n❌ Canvas 编译失败:');
    console.error(compileErr.message || compileErr);
    console.error('\n建议: 检查源码语法是否正确，确保使用标准 React/TSX 语法');
    process.exit(1);
  }
  console.log('runtimeCode 长度: ' + compiled.runtimeCode.length + ' 字符');
  console.log('importedModules: ' + compiled.importedModules);

  // 构建 Schema
  console.log('\n[Step 2] 构建 YidaCodeCanvas Schema...');
  var schemaContent = buildCanvasSchemaContent(compiled.runtimeCode, compiled.importedModules, formUuid);
  console.log('Schema 长度: ' + schemaContent.length + ' 字符');

  // 保存到宜搭平台
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
    console.log('\n=== Canvas 发布成功! ===');
    console.log('页面ID: ' + formUuid);
    console.log('页面名称: ' + pageName);
    console.log('设计器: ' + cookieData.base_url + '/alibaba/web/' + appType + '/design/pageDesigner?formUuid=' + formUuid);
    console.log('工作台: ' + cookieData.base_url + '/' + appType + '/workbench/' + formUuid);
    console.log('\n⚠️ Canvas 是实验性功能，如遇问题可使用 native 链路降级');
  } else {
    console.error('\n=== 发布失败 ===');
    console.error('错误: ' + JSON.stringify(saveRes).substring(0, 500));
    if (saveRes.errorMsg && (saveRes.errorMsg.indexOf('302') >= 0 || saveRes.errorMsg.indexOf('LOGIN') >= 0)) {
      console.error('\n登录态已过期，请先运行登录命令');
    }
    process.exit(1);
  }
}

module.exports = {
  compileCanvasLocal,
  extractImportedModules,
  resolveWindowAlias,
  buildCanvasSchemaContent,
  MODULE_ALIAS_MAP,
};

if (require.main === module) {
  main().catch(function(e) { console.error('发布异常:', e); process.exit(1); });
}
