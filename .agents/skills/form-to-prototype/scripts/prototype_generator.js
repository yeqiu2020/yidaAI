/**
 * 宜搭表单原型页面生成器 - 通用模板方案
 * 版本: 2.22.0
 *
 * 功能: 读取Markdown字段清单，生成通用HTML原型页面模板
 * 用法: node prototype_generator.js <字段清单md文件路径> [输出目录]
 * 示例: node prototype_generator.js "../../../出入库管理/01需求梳理/字段清单.md" "../../../出入库管理/01需求梳理/原型页面"
 *
 * 更新说明:
 * - v2.14.0: 【新增】版本感知重建
 *           1. 生成完成时写入 .generator-version 版本文件
 *           2. sync-ops.js 据此判断：版本不符则强制全量重建，保证 manifest 等新功能覆盖所有应用
 * - v2.13.0: 【增强】manifest.html「生成清单」字段清单 Tab 完整展示
 *           1. 按「分组 → 表单（可折叠）→ 数据标题 + 主表/子表」完整呈现，与字段清单.md 一一对应
 *           2. 顶部的「使用说明」区折叠为可展开详情，不再顶置占屏
 *           3. 每个表单主表/子表独立成表，支持单元格行内编辑 + 增删行
 *           4. 保存时完整重建字段清单（保留头部说明 + 尾部链接）
 * - v2.12.0: 【新增】所有页面顶栏加「📥 刷新本地清单」按钮
 *           1. manifest.html：顶栏按钮实时重新 GET 三个 md 并重渲染；支持 ?refresh=1 自动刷新
 *           2. index/list/form：顶栏按钮跳转 manifest.html?refresh=1（本地 md → 页面，与「同步应用表单」云端→本地互补）
 *           3. 新增 .btn-sync-local 青色按钮样式
 * - v2.11.0: 【新增】生成 templates/manifest.html「生成清单」页模板
 *           1. 展示并支持编辑三个需求文件：字段清单.md / 规则清单.md / 应用分组.md
 *           2. 三个 Tab：① 应用分组 ② 字段清单 ③ 规则清单（五类规则）
 *           3. 侧边栏在「开发引导」下新增「📑 生成清单」菜单项（青色高亮）
 *           4. 编辑后通过 POST /local-files 回写对应 .md 源文件（需同步服务运行）
 * - v2.10.1: 【修复】查找组件ID清单时支持带编号的分组目录
 *           问题：generate_from_markdown.js 创建的目录带编号（如 02基础信息），
 *                 但 prototype_generator.js 使用 form.module（如 基础信息）构建路径，找不到目录。
 *           修复：添加 findFormDirectoryWithNumberPrefix 函数，支持查找带编号的目录。
 *
 * - v2.9.0: 新增开发引导页面
 *          1. 新增 templates/guide.html 开发引导页（3步引导：需求分析→原型设计→系统构建）
 *          2. 侧边栏菜单第一个位置添加「📋 开发引导」菜单项（橙色高亮）
 *          3. renderMenu() 自动生成开发引导链接
 *          4. 新增 .guide-menu-item CSS 样式
 *          5. getCurrentFormName() 默认返回空字符串（去除占位表单名）
 * - v2.8.0: 新增"回到组织主页"按钮
 *          1. 在原型页面右上角添加"组织主页"链接按钮，点击可回到组织门户首页
 *          2. 更新 index.html、list.html、form.html 三个模板的 header 区域
 *          3. 新增 .btn-portal-link CSS 样式
 *          1. 改进 updateOrgInfoPrototypeUrl 函数的正则匹配逻辑
 *          2. 确保表格行格式与现有表格完全一致（使用 <URL> 格式）
 *          3. 修复section替换逻辑，避免重复添加分隔线
 * - v2.7.0: 移除「未分组表单」目录逻辑，表单路径直接在项目根目录下查找
 * - v2.6.0: 修复子表名称和ID显示问题
 *   - 修复 parseComponentIdList 函数，正确解析子表标题中的名称和 fieldId
 *   - 子表容器字段使用正确的 fieldId（如 tableField_mlvyrixo）
 *   - 子表字段使用小数点序号格式（如 "1.1"），避免重复创建子表容器
 *   - 修复模板字符串中正则表达式转义问题
 * - v2.5.0: 支持新的组件ID清单格式（主表和子表分开的表格）
 *   - 更新 parseComponentIdList 函数，识别 ## 📋 主表字段 和 ## 📋 子表：XXX 标记
 *   - 更新 groupFields 函数，使用 isSubTableField 标记识别子表字段
 *   - 兼容旧格式（序号包含小数点，如 "4.1"）和新格式（isSubTableField 标记）
 * - v2.0.0: 重构为通用模板方案，不再为每个表单生成单独页面
 *   - 生成 templates/list.html - 通用列表页
 *   - 生成 templates/form.html - 通用新增/详情页
 *   - 生成 js/form-config.js - 表单配置加载器
 *   - 保留 index.html - 系统首页
 *   - 保留 css/style.css - 样式文件
 *   - 保留 js/app.js - 交互脚本
 *
 * 设计原则:
 * - 通用模板通过URL参数 ?form=产品信息 加载不同表单
 * - 表单字段配置从 组件ID清单.md 动态读取
 * - 支持字段ID显示和点击复制功能
 */

const fs = require('fs');
const path = require('path');

/**
 * 原型页面生成器版本号。
 * 每次功能升级时递增，sync-ops.js 会比对 .generator-version 文件，
 * 版本不符则强制全量重建原型页面（保证 manifest 等新功能覆盖所有应用）。
 */
const GENERATOR_VERSION = '2.38.0';
// 导出 GENERATOR_VERSION：供 lib/sync-server/sync-ops.js 的版本感知重建机制动态读取，
// 使 sync 期望版本与生成器版本由单一来源驱动，避免"两套版本号人工同步遗漏"导致存量应用不自动重建。
module.exports = module.exports || {};
module.exports.GENERATOR_VERSION = GENERATOR_VERSION;

/**
 * 解析Markdown表格行
 * @param {string} line - 表格行内容
 * @returns {Object|null} 解析后的字段信息
 */
function parseTableRow(line) {
  if (!line || typeof line !== 'string') {
    return null;
  }

  line = line.trim();

  // 匹配表格行: | 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |
  const tableMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);

  if (tableMatch) {
    const name = tableMatch[1].trim();
    const type = tableMatch[2].trim();
    const description = tableMatch[3].trim();
    const status = tableMatch[4].trim();
    const required = tableMatch[5].trim();

    // 跳过表头分隔行
    if (name.includes('---') || name.includes('字段名称')) {
      return null;
    }
    // 跳过统计行，避免被当成真实字段
    if (name === '主表字段' || name === '子表字段') {
      return null;
    }

    // 从描述中提取组件ID: "组件ID: tableField_xxx" 或 "组件ID: textField_xxx"
    let fieldId = '';
    const idMatch = description.match(/组件ID[：:]\s*(\S+)/);
    if (idMatch) {
      fieldId = idMatch[1];
    }

    return {
      name,
      type,
      description: description === '-' ? '' : description,
      status,
      required: required === '是',
      original: line,
      id: fieldId || undefined
    };
  }

  return null;
}

/**
 * 解析Markdown内容（新表格格式）
 * @param {string} content - Markdown文件内容
 * @returns {Object} 解析后的系统配置
 */
function parseMarkdown(content) {
  const systemInfo = {
    name: '',
    version: '',
    forms: []
  };

  const lines = content.split('\n');
  let currentModule = '';
  let currentForm = null;
  let currentSubTable = null;
  let inTable = false;
  let isSubTableSection = false;

  // 提取系统名称
  const titleMatch = content.match(/^#\s+(.+?)\s*-/m);
  if (titleMatch) {
    systemInfo.name = titleMatch[1].trim();
  }

  // 提取版本
  const versionMatch = content.match(/>\s*版本:\s*(.+)/m);
  if (versionMatch) {
    systemInfo.version = versionMatch[1].trim();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 空行表示表格结束
    if (!line) {
      inTable = false;
      continue;
    }

    // 跳过说明部分
    if (line.startsWith('>') || line.startsWith('---')) {
      continue;
    }

    // 匹配模块标题: ## 一、模块名称
    const moduleMatch = line.match(/^##\s+([一二三四五六七八九十]+、.+)$/);
    if (moduleMatch) {
      // v2.8.0: 去掉模块名称中的中文序号前缀（如"一、基础信息" → "基础信息"）
      currentModule = moduleMatch[1].trim().replace(/^[一二三四五六七八九十]+[、.．]\s*/, '');
      continue;
    }

    // 匹配表单标题: ### (一) 表单名称「普通表单/流程表单」
    const formMatch = line.match(/^###\s*\(\S+\)\s*(.+?)「(\S+?)」/);
    if (formMatch) {
      // 保存之前的表单
      if (currentForm) {
        systemInfo.forms.push(currentForm);
      }
      
      currentForm = {
        module: currentModule,
        name: formMatch[1].trim(),
        type: formMatch[2].includes('流程') ? 'process' : 'normal',
        fields: [],
        subTables: []
      };
      currentSubTable = null;
      isSubTableSection = false;
      inTable = false;
      continue;
    }

    // 匹配子表标记: **子表：{子表名称}**
    const subTableHeaderMatch = line.match(/^\*\*子表[：:](.+?)\*\*$/);
    if (subTableHeaderMatch && currentForm) {
      isSubTableSection = true;
      currentSubTable = {
        name: subTableHeaderMatch[1].trim(),
        fields: []
      };
      currentForm.subTables.push(currentSubTable);
      inTable = false;
      continue;
    }

    // 匹配主表字段标记
    const mainTableMatch = line.match(/^\*\*主表字段[：:]\*\*$/);
    if (mainTableMatch && currentForm) {
      isSubTableSection = false;
      currentSubTable = null;
      inTable = false;
      continue;
    }

    // 检测表格开始（通过表头分隔行）
    if (line.match(/^\|[-\s|]+\|$/)) {
      inTable = true;
      continue;
    }

    // 解析表格行
    if (inTable && line.startsWith('|')) {
      const fieldInfo = parseTableRow(line);
      if (fieldInfo) {
        if (isSubTableSection && currentSubTable) {
          currentSubTable.fields.push(fieldInfo);
        } else if (currentForm) {
          currentForm.fields.push(fieldInfo);
        }
      }
      continue;
    }

    // 遇到非表格行，结束当前表格解析
    if (inTable && !line.startsWith('|')) {
      inTable = false;
    }
  }

  // 添加最后一个表单
  if (currentForm) {
    systemInfo.forms.push(currentForm);
  }

  return systemInfo;
}

/**
 * 生成导航菜单HTML（用于内联到页面中）
 * @param {Array} allForms - 所有表单列表
 * @returns {string} HTML代码
 */
function generateMenuHtml(allForms, linkPrefix = 'templates/') {
  // 按模块分组
  const modules = {};
  allForms.forEach(form => {
    if (!modules[form.module]) {
      modules[form.module] = [];
    }
    modules[form.module].push(form);
  });

  let menuHtml = '';
  for (const [moduleName, forms] of Object.entries(modules)) {
    menuHtml += `        <div class="menu-group">\n`;
    menuHtml += `          <div class="menu-group-title">${moduleName}</div>\n`;
    forms.forEach(form => {
      const formTypeClass = form.type === 'process' ? ' process' : '';
      menuHtml += `          <a href="${linkPrefix}list.html?form=${encodeURIComponent(form.name)}" class="menu-item${formTypeClass}" data-form="${form.name}">${form.name}</a>\n`;
    });
    menuHtml += `        </div>\n`;
  }

  return menuHtml;
}

/**
 * 生成首页HTML
 * @param {Object} systemInfo - 系统信息
 * @param {Array} allForms - 所有表单列表
 * @returns {string} HTML代码
 */
function generateIndexHtml(systemInfo, allForms) {
  const systemName = systemInfo.name;

  // 统计信息
  const totalForms = allForms.length;
  const processForms = allForms.filter(f => f.type === 'process').length;
  const subTableCount = allForms.reduce((sum, f) => {
    const fromSubTables = f.subTables ? f.subTables.length : 0;
    const fromFields = f.fields ? f.fields.filter(field => field.type === '子表单' || field.type === '子表').length : 0;
    return sum + fromSubTables + fromFields;
  }, 0);

  // 生成快速链接
  const quickLinksHtml = allForms.map(form => {
    const icon = form.type === 'process' ? '▶️' : '📄';
    const typeDesc = form.type === 'process' ? '流程表单' : '普通表单';
    const subTableDesc = form.subTables && form.subTables.length > 0 ? '（含子表）' : '';
    return `          <a href="templates/list.html?form=${encodeURIComponent(form.name)}" class="link-card">
            <div class="link-icon">${icon}</div>
            <div class="link-content">
              <h4>${form.name}</h4>
              <p>${form.module} - ${typeDesc}${subTableDesc}</p>
            </div>
          </a>`;
  }).join('\n');

  // 生成导航菜单
  const menuHtml = generateMenuHtml(allForms);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${systemName} - 原型预览</title>
  <link rel="stylesheet" href="css/style.css">
  <style>
    .prototype-intro {
      background: linear-gradient(135deg, #1677ff 0%, #36cfc9 100%);
      color: #fff;
      padding: 48px;
      border-radius: 8px;
      margin-bottom: 32px;
    }
    .prototype-intro h1 {
      font-size: 32px;
      margin-bottom: 16px;
    }
    .prototype-intro p {
      font-size: 16px;
      opacity: 0.9;
      line-height: 1.8;
    }
    .feature-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 32px;
    }
    .feature-card {
      background: #fff;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .feature-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.1);
    }
    .feature-icon {
      font-size: 32px;
      margin-bottom: 16px;
    }
    .feature-card h3 {
      font-size: 18px;
      margin-bottom: 8px;
      color: #333;
    }
    .feature-card p {
      color: #666;
      font-size: 14px;
      line-height: 1.6;
    }
    .quick-links {
      margin-top: 32px;
    }
    .quick-links h2 {
      font-size: 20px;
      margin-bottom: 16px;
      color: #333;
    }
    .link-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .link-card {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      display: flex;
      align-items: center;
      gap: 16px;
      text-decoration: none;
      color: #333;
      transition: all 0.3s;
    }
    .link-card:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.1);
      border-left: 4px solid #1677ff;
    }
    .link-icon {
      width: 48px;
      height: 48px;
      background: #f0f7ff;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .link-content h4 {
      font-size: 16px;
      margin-bottom: 4px;
    }
    .link-content p {
      font-size: 13px;
      color: #666;
    }
  </style>
</head>
<body>
  <!-- 顶部导航 -->
  <header class="header">
    <div class="header-left">
      <div class="logo" id="systemLogo">${systemName}</div>
      <button class="btn btn-sync-app" id="syncAppBtn" onclick="syncApp()" title="同步宜搭中新增的手工单表到本地">🔄 同步应用表单</button>
      <button class="btn btn-sync-local" id="refreshLocalBtn" onclick="location.href='templates/manifest.html?refresh=1'" title="重新读取本地字段清单/规则清单/应用分组的最新内容">📥 刷新本地清单</button>
      <span id="syncAppStatus" class="sync-status" style="display:none;margin-left:8px;"></span>
    </div>
    <div class="user-info">
      <a href="/本地操作页面/index.html" class="btn-portal-link" title="回到组织主页（宜搭AI助手组织管理门户）">&#127968; 组织主页</a>
      👤 管理员
    </div>
  </header>
  
  <div class="container">
    <!-- 左侧菜单 -->
    <aside class="sidebar">
      <nav class="menu">
        <div id="menuItems">
          <!-- 菜单（含分组）由JavaScript动态生成 -->
        </div>
      </nav>
    </aside>
    
    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 欢迎区域 -->
      <div class="prototype-intro">
        <h1>欢迎使用${systemName}原型</h1>
        <p>
          本原型基于字段清单和规则清单自动生成，模拟宜搭低代码平台的界面风格。<br>
          通过本原型，您可以快速体验系统界面，验证字段和规则设计是否符合预期。
        </p>
      </div>

      <!-- 原型提示 -->
      <div class="prototype-notice">
        本页面为原型预览，仅供界面体验使用。数据为模拟数据，不涉及真实业务逻辑。
      </div>

      <!-- 系统统计 -->
      <div class="welcome-stats" style="margin-top: 0; margin-bottom: 32px;">
        <div class="stat-card">
          <div class="stat-number" id="statFormCount">-</div>
          <div class="stat-label">表单总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="statProcessCount">0</div>
          <div class="stat-label">流程表单</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="statSubTableCount">-</div>
          <div class="stat-label">子表明细</div>
        </div>
      </div>

      <!-- 功能特性 -->
      <div class="feature-cards">
        <div class="feature-card">
          <div class="feature-icon">📋</div>
          <h3>表单体验</h3>
          <p>预览每个表单的数据录入界面，检查字段类型、顺序、布局</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🧮</div>
          <h3>公式计算</h3>
          <p>支持简单的公式实时计算，如小计金额 = 单价 × 数量</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📖</div>
          <h3>规则说明</h3>
          <p>通过文字说明和提示框理解业务规则、审批流程</p>
        </div>
      </div>

      <!-- 快速链接 -->
      <div class="quick-links">
        <h2>快速访问</h2>
        <div class="link-grid" id="linkGrid">
          <!-- 快速链接由JavaScript动态生成 -->
        </div>
      </div>
    </main>
  </div>
  
  <script src="js/app.js"></script>
  <script src="js/form-config.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', async function() {
      // 动态加载表单列表
      if (typeof FormConfig !== 'undefined') {
        await FormConfig.loadFormListFromConfig();
      }
      // 动态生成左侧菜单
      renderIndexMenu();
      // 动态生成快速链接
      renderQuickLinks();
      // 更新统计数字
      updateStats();
    });
  </script>
</body>
</html>`;
}

/**
 * 生成通用列表页模板
 * @param {Array} allForms - 所有表单列表（用于生成菜单）
 * @returns {string} HTML代码
 */
function generateListTemplateHtml(allForms) {
  const menuHtml = generateMenuHtml(allForms, '');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>数据列表 - 原型预览</title>
  <link rel="stylesheet" href="../css/style.css">
</head>
<body>
  <!-- 顶部导航 -->
  <header class="header">
    <div class="header-left">
      <div class="logo" id="systemLogo">系统名称</div>
      <button class="btn btn-sync-app" id="syncAppBtn" onclick="syncApp()" title="同步宜搭中新增的手工单表到本地">🔄 同步应用表单</button>
      <button class="btn btn-sync-local" id="refreshLocalBtn" onclick="location.href='manifest.html?refresh=1'" title="重新读取本地字段清单/规则清单/应用分组的最新内容">📥 刷新本地清单</button>
      <span id="syncAppStatus" class="sync-status" style="display:none;margin-left:8px;"></span>
    </div>
    <div class="user-info">
      <a href="/本地操作页面/index.html" class="btn-portal-link" title="回到组织主页（宜搭AI助手组织管理门户）">&#127968; 组织主页</a>
      👤 管理员
    </div>
  </header>

  <div class="container">
    <!-- 左侧菜单 -->
    <aside class="sidebar">
      <nav class="menu" id="mainMenu">
        <div id="menuItems">
          <!-- 菜单（含分组）由JavaScript动态生成 -->
        </div>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 原型提示 -->
      <div class="prototype-notice">
        本页面为原型预览，仅供界面体验使用。数据为模拟数据，不涉及真实业务逻辑。
      </div>

      <!-- 页面标题 -->
      <div class="page-header">
        <h1 class="page-title" id="pageTitle">
          数据列表
          <span class="form-uuid" title="点击复制" id="formUuid" style="font-size: 12px; color: #8c8c8c; font-weight: normal; font-family: monospace; margin-left: 8px; cursor: pointer;"></span>
        </h1>
        <div class="page-actions">
          <button class="btn btn-primary" id="addBtn" onclick="openAddDrawer()">+ 新增</button>
          <button class="btn btn-sync" id="syncBtn" onclick="syncForm()">🔄 同步表单字段</button>
          <button class="btn btn-default">📥 导入</button>
          <button class="btn btn-default">📤 导出</button>
        </div>
        <div id="syncStatus" class="sync-status" style="margin-top: 8px;"></div>
      </div>

      <!-- 搜索区域 -->
      <div class="search-area">
        <div class="search-form">
          <div class="search-item">
            <label>关键字</label>
            <input type="text" class="input" placeholder="请输入关键字" style="width: 200px;">
          </div>
          <button class="btn btn-primary">🔍 查询</button>
          <button class="btn btn-default">重置</button>
        </div>
      </div>

      <!-- 数据表格 -->
      <div class="table-container">
        <table class="data-table" id="dataTable">
          <thead>
            <tr id="tableHeader">
              <!-- 表头由JavaScript动态生成 -->
            </tr>
          </thead>
          <tbody id="tableBody">
            <!-- 表体由JavaScript动态生成 -->
          </tbody>
        </table>

        <!-- 分页 -->
        <div class="pagination">
          <span class="pagination-info" id="paginationInfo">共 0 条记录</span>
          <button class="page-btn" disabled>上一页</button>
          <button class="page-btn active">1</button>
          <button class="page-btn" disabled>下一页</button>
        </div>
      </div>
    </main>
  </div>

  <!-- 新增/编辑抽屉弹窗 -->
  <div class="drawer-overlay" id="drawerOverlay" onclick="closeDrawer()"></div>
  <div class="drawer" id="drawer">
    <div class="drawer-header">
      <span class="drawer-title" id="drawerTitle">新增</span>
      <button class="drawer-close" onclick="closeDrawer()">✕</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-form-container" id="drawerFormContainer">
        <!-- 表单内容由JavaScript动态渲染 -->
      </div>
    </div>
  </div>

  <script src="../js/app.js"></script>
  <script src="../js/form-config.js"></script>
  <script>
    // 页面初始化
    document.addEventListener('DOMContentLoaded', async function() {
      // 动态加载表单列表
      await FormConfig.loadFormListFromConfig();
      // 动态生成左侧菜单
      renderListMenu();
      // 获取表单名称
      const formName = FormConfig.getCurrentFormName();

      // 更新页面标题和UUID（异步加载）
      const formUuid = await FormConfig.getFormUuid(formName);
      document.getElementById('pageTitle').innerHTML = formName + (formUuid ? '<span class="form-uuid" title="点击复制" style="font-size: 12px; color: #8c8c8c; font-weight: normal; font-family: monospace; margin-left: 8px; cursor: pointer;">' + formUuid + '</span>' : '');
      document.title = formName + ' - 原型预览';
      
      // 绑定UUID点击复制事件
      const uuidElement = document.querySelector('#pageTitle .form-uuid');
      if (uuidElement && formUuid) {
        uuidElement.onclick = function(e) {
          e.stopPropagation();
          navigator.clipboard.writeText(formUuid).then(function() {
            uuidElement.style.color = '#52c41a';
            FormConfig.showCopyToast('已复制');
            setTimeout(function() {
              uuidElement.style.color = '#8c8c8c';
            }, 1500);
          });
        };
      }

      // 新增按钮改为抽屉弹窗，不需要设置链接

      // 高亮当前菜单
      const currentForm = FormConfig.getCurrentFormName();
      document.querySelectorAll('.menu-item').forEach(item => {
        if (item.dataset.form === currentForm) {
          item.classList.add('active');
        }
      });

      // 加载表单配置并渲染表格
      const config = await FormConfig.loadFormConfig(formName);
      if (config) {
        renderTable(config);
      }
    });

    // 渲染表格
    function renderTable(config) {
      const fields = config.fields;
      const formName = config.formName;

      // 如果没有字段配置，显示提示信息
      if (!fields || fields.length === 0) {
        document.getElementById('tableHeader').innerHTML = '<th style="text-align: center; color: #8c8c8c;">暂无字段配置</th>';
        document.getElementById('tableBody').innerHTML = '<tr><td style="text-align: center; padding: 40px; color: #8c8c8c;">' +
          '<div style="margin-bottom: 16px;">📋</div>' +
          '<div>该表单尚未配置字段</div>' +
          '<div style="font-size: 12px; margin-top: 8px;">请先在宜搭平台创建表单并同步配置</div>' +
          '</td></tr>';
        document.getElementById('paginationInfo').textContent = '共 0 条记录';
        return;
      }

      // 生成表头（显示前6个字段+操作列）
      const displayFields = fields.slice(0, 6);
      let headerHtml = '<th style="width: 50px;"><input type="checkbox"></th>';
      displayFields.forEach(field => {
        headerHtml += '<th>' + field.fieldName + '</th>';
      });
      headerHtml += '<th style="width: 150px;">操作</th>';
      document.getElementById('tableHeader').innerHTML = headerHtml;

      // 生成模拟数据行
      const mockData = [
        { id: 'NO20240301001', name: '示例' + formName + '1' },
        { id: 'NO20240301002', name: '示例' + formName + '2' },
        { id: 'NO20240301003', name: '示例' + formName + '3' }
      ];

      let bodyHtml = '';
      mockData.forEach((data, index) => {
        bodyHtml += '<tr>';
        bodyHtml += '<td><input type="checkbox"></td>';
        displayFields.forEach((field, fieldIndex) => {
          let value = '';
          if (fieldIndex === 0) value = data.id;
          else if (fieldIndex === 1) value = data.name;
          else value = '数据' + (index + 1);
          bodyHtml += '<td>' + value + '</td>';
        });
        bodyHtml += '<td>';
        bodyHtml += '<div class="table-actions">';
        bodyHtml += '<a href="form.html?form=' + encodeURIComponent(formName) + '&id=' + data.id + '" class="btn btn-sm btn-default">查看</a>';
        bodyHtml += '</div>';
        bodyHtml += '</td>';
        bodyHtml += '</tr>';
      });

      document.getElementById('tableBody').innerHTML = bodyHtml;
      document.getElementById('paginationInfo').textContent = '共 ' + mockData.length + ' 条记录';
    }
  </script>
</body>
</html>`;
}

/**
 * 生成通用表单页模板
 * @param {Array} allForms - 所有表单列表（用于生成菜单）
 * @returns {string} HTML代码
 */
function generateFormTemplateHtml(allForms) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>表单 - 原型预览</title>
  <link rel="stylesheet" href="../css/style.css">
</head>
<body>
  <!-- 顶部导航 -->
  <header class="header">
    <div class="header-left">
      <div class="logo" id="systemLogo">系统名称</div>
      <button class="btn btn-sync-app" id="syncAppBtn" onclick="syncApp()" title="同步宜搭中新增的手工单表到本地">🔄 同步应用表单</button>
      <button class="btn btn-sync-local" id="refreshLocalBtn" onclick="location.href='manifest.html?refresh=1'" title="重新读取本地字段清单/规则清单/应用分组的最新内容">📥 刷新本地清单</button>
      <span id="syncAppStatus" class="sync-status" style="display:none;margin-left:8px;"></span>
    </div>
    <div class="user-info">
      <a href="/本地操作页面/index.html" class="btn-portal-link" title="回到组织主页（宜搭AI助手组织管理门户）">&#127968; 组织主页</a>
      👤 管理员
    </div>
  </header>

  <div class="container">
    <!-- 左侧菜单 -->
    <aside class="sidebar">
      <nav class="menu" id="mainMenu">
        <div id="menuItems">
          <!-- 菜单（含分组）由JavaScript动态生成 -->
        </div>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 原型提示 -->
      <div class="prototype-notice">
        本页面为原型预览，仅供界面体验使用。数据为模拟数据，不涉及真实业务逻辑。
      </div>

      <!-- 表单容器 -->
      <div class="form-container">
        <h2 class="page-title" id="pageTitle">新建</h2>

        <form id="dynamicForm" data-validate>
          <!-- 表单内容由JavaScript动态生成 -->
          <div id="formFieldsContainer">
            <p style="color: #999; text-align: center; padding: 40px;">正在加载表单配置...</p>
          </div>

          <!-- 规则说明区域 -->
          <div class="rules-section">
            <h4>📋 业务规则</h4>
            <p class="rules-desc">以下规则涉及表单数据处理和系统自动化：</p>
            <div class="business-rules" id="businessRules">
              <div class="rule-item">
                <span class="rule-tag">数据联动</span>
                <p>本表单数据变更将影响关联表单，请谨慎修改</p>
              </div>
            </div>
          </div>

          <!-- 表单操作 -->
          <div class="form-actions" id="formActions">
            <button type="submit" class="btn btn-primary">提交</button>
            <button type="button" class="btn btn-default" onclick="saveDraft()">保存草稿</button>
            <a href="#" class="btn btn-default" id="cancelBtn">取消</a>
          </div>
        </form>
      </div>
    </main>
  </div>

  <script src="../js/app.js"></script>
  <script src="../js/form-config.js"></script>
  <script>
    // 页面初始化
    document.addEventListener('DOMContentLoaded', async function() {
      // 动态加载表单列表
      await FormConfig.loadFormListFromConfig();
      // 动态生成左侧菜单
      renderFormMenu();
      // 获取表单名称
      const formName = FormConfig.getCurrentFormName();
      const dataId = FormConfig.getUrlParam('id');
      const isViewMode = !!dataId;

      // 更新页面标题和UUID（异步加载）
      const formUuid = await FormConfig.getFormUuid(formName);
      const pageTitle = isViewMode ? formName + '详情' : '新建' + formName;
      document.getElementById('pageTitle').innerHTML = pageTitle + (formUuid ? '<span class="form-uuid" title="点击复制" style="font-size: 12px; color: #8c8c8c; font-weight: normal; font-family: monospace; margin-left: 8px; cursor: pointer;">' + formUuid + '</span>' : '');
      document.title = pageTitle + ' - 原型预览';
      
      // 绑定UUID点击复制事件
      const uuidElement = document.querySelector('#pageTitle .form-uuid');
      if (uuidElement && formUuid) {
        uuidElement.onclick = function(e) {
          e.stopPropagation();
          navigator.clipboard.writeText(formUuid).then(function() {
            uuidElement.style.color = '#52c41a';
            FormConfig.showCopyToast('已复制');
            setTimeout(function() {
              uuidElement.style.color = '#8c8c8c';
            }, 1500);
          });
        };
      }

      // 更新取消按钮链接
      document.getElementById('cancelBtn').href = 'list.html?form=' + encodeURIComponent(formName);

      // 高亮当前菜单
      const currentForm = FormConfig.getCurrentFormName();
      document.querySelectorAll('.menu-item').forEach(item => {
        if (item.dataset.form === currentForm) {
          item.classList.add('active');
        }
      });

      // 渲染表单
      const config = await FormConfig.renderForm('formFieldsContainer', formName);

      if (config) {
        console.log('表单加载完成: ' + formName + ', 共 ' + config.fieldCount + ' 个字段');

        // 如果是查看模式，填充模拟数据并设为只读
        if (isViewMode) {
          fillViewModeData(config, dataId);
        }
      }
    });

    // 查看模式：填充数据并设为只读
    function fillViewModeData(config, dataId) {
      // 隐藏提交和保存草稿按钮
      document.getElementById('formActions').innerHTML = 
        '<a href="list.html?form=' + encodeURIComponent(config.formName) + '" class="btn btn-default">返回</a>';

      // 填充模拟数据
      config.fields.forEach(field => {
        const element = document.getElementById(field.fieldId);
        if (!element) return;

        // 根据字段类型填充不同的模拟数据
        let value = '';
        if (field.fieldName.includes('编号')) value = dataId;
        else if (field.fieldName.includes('名称')) value = '示例' + field.fieldName;
        else if (field.fieldName.includes('时间')) value = '2024-03-01 10:00:00';
        else if (field.fieldName.includes('人')) value = '管理员';
        else if (field.componentType === 'NumberField') value = '100';
        else value = '示例数据';

        if (element.tagName === 'SELECT') {
          element.value = value;
          element.disabled = true;
        } else if (element.tagName === 'TEXTAREA') {
          element.value = value;
          element.readOnly = true;
        } else {
          element.value = value;
          element.readOnly = true;
          element.classList.add('disabled');
        }
      });
    }

    // 保存草稿
    function saveDraft() {
      alert('草稿已保存');
    }
  </script>
</body>
</html>`;
}

/**
 * 生成开发引导页模板
 * @returns {string} HTML代码
 */
function generateGuideHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>开发引导 - 原型预览</title>
  <link rel="stylesheet" href="../css/style.css">
  <style>
    .guide-container { max-width: 800px; margin: 0 auto; padding: 32px 0; }
    .guide-welcome { background: linear-gradient(135deg, #1565c0 0%, #42a5f5 100%); color: #fff; padding: 36px 40px; border-radius: 8px; margin-bottom: 32px; text-align: center; box-shadow: 0 4px 16px rgba(21,101,192,0.3); }
    .guide-welcome h1 { font-size: 24px; margin-bottom: 8px; }
    .guide-welcome p { font-size: 14px; opacity: 0.85; line-height: 1.6; }
    .guide-progress { display: flex; justify-content: space-between; margin-bottom: 32px; padding: 0 16px; position: relative; }
    .guide-progress::before { content: ''; position: absolute; top: 20px; left: 60px; right: 60px; height: 2px; background: #e8e8e8; z-index: 0; }
    .guide-progress-step { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; z-index: 1; }
    .guide-progress-num { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px; background: #e8e8e8; color: #999; }
    .guide-progress-step.active .guide-progress-num { background: #1677ff; color: #fff; box-shadow: 0 2px 8px rgba(22,119,255,0.4); }
    .guide-progress-step.done .guide-progress-num { background: #52c41a; color: #fff; }
    .guide-progress-label { font-size: 12px; color: #8c8c8c; }
    .guide-progress-step.active .guide-progress-label { color: #1677ff; font-weight: 500; }
    .guide-card { background: #fff; border-radius: 8px; border: 1px solid #f0f0f0; padding: 28px 32px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); transition: all 0.3s; }
    .guide-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-color: #1677ff; }
    .guide-card-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .guide-card-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #fff; flex-shrink: 0; }
    .guide-card-title { font-size: 17px; font-weight: 600; color: #262626; }
    .guide-card-skill { font-size: 11px; color: #1677ff; background: #e6f4ff; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
    .guide-card-desc { font-size: 14px; color: #595959; margin-bottom: 16px; line-height: 1.7; }
    .guide-path { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 12px; background: #fff8e1; border: 1px solid #ffe0b2; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; word-break: break-all; color: #e65100; line-height: 1.5; user-select: all; }
    .guide-prompt-box { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 6px; padding: 14px 16px; }
    .guide-prompt-label { font-size: 11px; color: #8c8c8c; margin-bottom: 8px; }
    .guide-prompt-text { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; background: #fff; border: 1px solid #e8e8e8; padding: 10px 14px; border-radius: 4px; cursor: pointer; display: block; word-break: break-all; line-height: 1.6; transition: all 0.2s; color: #262626; }
    .guide-prompt-text:hover { background: #e6f4ff; border-color: #91d5ff; }
    .guide-prompt-text:active { background: #bae0ff; }
    .guide-prompt-text .copy-hint { float: right; font-size: 11px; color: #8c8c8c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; }
    .guide-card-note { margin-top: 16px; padding: 10px 14px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 6px; font-size: 13px; color: #d48806; }
    @media (max-width: 640px) {
      .guide-container { padding: 16px; }
      .guide-welcome { padding: 24px 20px; }
      .guide-progress { padding: 0 8px; }
      .guide-progress::before { left: 40px; right: 40px; }
      .guide-card { padding: 20px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <div class="logo" id="systemLogo">开发引导</div>
      <span style="font-size:12px;color:#8c8c8c;padding:2px 8px;background:#f0f0f0;border-radius:4px;">新建应用</span>
    </div>
    <div class="user-info">
      <a href="/本地操作页面/index.html" class="btn-portal-link" title="回到组织主页（宜搭AI助手组织管理门户）">&#127968; 组织主页</a>
      &#128100; 管理员
    </div>
  </header>

  <div class="container">
    <aside class="sidebar">
      <nav class="menu" id="mainMenu">
        <div id="menuItems"></div>
      </nav>
    </aside>

    <main class="main-content">
      <div class="prototype-notice">
        &#26412;&#39029;&#38754;&#20026;&#24320;&#21457;&#24341;&#23548;&#65292;&#24110;&#21161;&#24744;&#23436;&#25104;&#20174;&#38656;&#27714;&#20998;&#26512;&#21040;&#31995;&#32479;&#26500;&#24314;&#30340;&#23436;&#25972;&#27969;&#31243;&#12290;
      </div>

      <div class="guide-container">
        <div class="guide-welcome">
          <h1>&#128640; &#26032;&#24314;&#24212;&#29992; - &#24320;&#21457;&#24341;&#23548;</h1>
          <p>&#36319;&#38543;&#20197;&#19979;&#19977;&#20010;&#27493;&#39588;&#65292;&#20174;&#38656;&#27714;&#20998;&#26512;&#21040;&#31995;&#32479;&#26500;&#24314;&#65292;&#24555;&#36895;&#23436;&#25104;&#24212;&#29992;&#30340;&#24320;&#21457;&#19982;&#37096;&#32626;</p>
        </div>

        <div class="guide-progress">
          <div class="guide-progress-step" id="stepDot1">
            <div class="guide-progress-num" style="background:#1976d2;color:#fff;">1</div>
            <div class="guide-progress-label">&#38656;&#27714;&#20998;&#26512;</div>
          </div>
          <div class="guide-progress-step" id="stepDot2">
            <div class="guide-progress-num">2</div>
            <div class="guide-progress-label">&#21407;&#22411;&#35774;&#35745;</div>
          </div>
          <div class="guide-progress-step" id="stepDot3">
            <div class="guide-progress-num">3</div>
            <div class="guide-progress-label">&#31995;&#32479;&#26500;&#24314;</div>
          </div>
        </div>

        <div class="guide-card">
          <div class="guide-card-header">
            <div class="guide-card-icon" style="background:#1976d2;">1</div>
            <div>
              <span class="guide-card-title">&#38656;&#27714;&#20998;&#26512;</span>
              <span class="guide-card-skill">excel-to-form</span>
            </div>
          </div>
          <div class="guide-card-desc">
            &#35831;&#23558;&#24744;&#30340; Excel &#38656;&#27714;&#25991;&#26723;&#22797;&#21046;&#21040;&#20197;&#19979;&#30446;&#24405;&#65292;&#28982;&#21518;&#20351;&#29992;&#19979;&#26041;&#25552;&#31034;&#35789;&#35753; AI &#33258;&#21160;&#29983;&#25104;&#23383;&#27573;&#28165;&#21333;&#21644;&#35268;&#21017;&#28165;&#21333;&#65306;
          </div>
          <div class="guide-path" id="excelPathDisplay">d:\\&#23452;&#25645;AI&#32534;&#31243;\\&#23452;&#25645;AI&#21161;&#25163;V1.7.3\\&#24212;&#29992;&#21517;\\01&#38656;&#27714;&#26803;&#29702;\\&#24212;&#29992;&#21517;&#34920;&#21333;&#28165;&#21333;.xlsx</div>
          <div class="guide-prompt-box">
            <div class="guide-prompt-label">&#128203; &#25552;&#31034;&#35789;&#65288;&#28857;&#20987;&#22797;&#21046;&#21040;&#21098;&#36148;&#26495;&#65292;&#28982;&#21518;&#31896;&#36148;&#32473; AI &#21161;&#25163;&#65289;</div>
            <div class="guide-prompt-text" id="guidePrompt1" onclick="copyGuidePrompt(this)">
              <span>&#23558; Excel&#12304;&#31896;&#36148;Excel&#25991;&#20214;&#36335;&#24452;&#12305;&#36716;&#25442;&#25104;&#26412;&#22320;&#23383;&#27573;&#28165;&#21333;&#21644;&#35268;&#21017;&#28165;&#21333;&#65292;&#29983;&#25104;&#21040;&#12304;01&#38656;&#27714;&#26803;&#29702;&#12305;&#30446;&#24405;&#19979;&#12290;</span>
              <span class="copy-hint">&#128203; &#28857;&#20987;&#22797;&#21046;</span>
            </div>
          </div>
        </div>

        <div class="guide-card">
          <div class="guide-card-header">
            <div class="guide-card-icon" style="background:#388e3c;">2</div>
            <div>
              <span class="guide-card-title">&#21407;&#22411;&#35774;&#35745;</span>
              <span class="guide-card-skill">form-to-prototype</span>
            </div>
          </div>
          <div class="guide-card-desc">
            &#26681;&#25454;&#24050;&#29983;&#25104;&#30340;&#23383;&#27573;&#28165;&#21333;&#65292;&#33258;&#21160;&#29983;&#25104;&#21407;&#22411;&#39029;&#38754;&#39044;&#35272;&#24212;&#29992;&#30028;&#38754;&#25928;&#26524;&#12290;&#22914;&#26524;&#23545;&#40664;&#35748;&#21407;&#22411;&#19981;&#28385;&#24847;&#65292;&#21487;&#22312;&#27492;&#22522;&#30784;&#19978;&#36827;&#34892;&#32654;&#21270;&#12290;
          </div>
          <div class="guide-prompt-box">
            <div class="guide-prompt-label">&#128203; &#25552;&#31034;&#35789;&#65288;&#28857;&#20987;&#22797;&#21046;&#21040;&#21098;&#36148;&#26495;&#65292;&#28982;&#21518;&#31896;&#36148;&#32473; AI &#21161;&#25163;&#65289;</div>
            <div class="guide-prompt-text" id="guidePrompt2" onclick="copyGuidePrompt(this)">
              <span>&#25353;&#29031;&#12304;&#24212;&#29992;&#21517;/01&#38656;&#27714;&#26803;&#29702;&#12305;&#65292;&#29983;&#25104;&#26412;&#22320;&#21407;&#22411;&#39029;&#38754;&#12290;</span>
              <span class="copy-hint">&#128203; &#28857;&#20987;&#22797;&#21046;</span>
            </div>
          </div>
        </div>

        <div class="guide-card">
          <div class="guide-card-header">
            <div class="guide-card-icon" style="background:#d84315;">3</div>
            <div>
              <span class="guide-card-title">&#31995;&#32479;&#26500;&#24314;</span>
              <span class="guide-card-skill">form_creator</span>
            </div>
          </div>
          <div class="guide-card-desc">
            &#23558;&#23383;&#27573;&#28165;&#21333;&#25512;&#36865;&#21040;&#23452;&#25645;&#24179;&#21488;&#65292;&#33258;&#21160;&#21019;&#24314;&#24212;&#29992;&#21644;&#34920;&#21333;&#12290;&#31995;&#32479;&#20250;&#33258;&#21160;&#23436;&#25104;&#34920;&#21333;&#21019;&#24314;&#12289;&#23383;&#27573;&#37197;&#32622;&#21644;&#22522;&#30784;&#35774;&#32622;&#12290;
          </div>
          <div class="guide-prompt-box">
            <div class="guide-prompt-label">&#128203; &#25552;&#31034;&#35789;&#65288;&#28857;&#20987;&#22797;&#21046;&#21040;&#21098;&#36148;&#26495;&#65292;&#28982;&#21518;&#31896;&#36148;&#32473; AI &#21161;&#25163;&#65289;</div>
            <div class="guide-prompt-text" id="guidePrompt3" onclick="copyGuidePrompt(this)">
              <span>&#25353;&#29031;&#12304;&#24212;&#29992;&#21517;/01&#38656;&#27714;&#26803;&#29702;/&#23383;&#27573;&#28165;&#21333;.md&#12305;&#65292;&#29983;&#25104;&#23452;&#25645;&#34920;&#21333;&#24182;&#25512;&#36865;&#21040;&#23452;&#25645;&#21019;&#24314;&#24212;&#29992;&#12290;</span>
              <span class="copy-hint">&#128203; &#28857;&#20987;&#22797;&#21046;</span>
            </div>
          </div>
          <div class="guide-card-note">&#9888;&#65039; &#21019;&#24314;&#21518;&#38656;&#31561;&#24453; 3-5 &#20998;&#38047;&#20877;&#21516;&#27493;&#37197;&#32622;&#21040;&#26412;&#22320;&#65292;&#28982;&#21518;&#28857;&#20987;&#24038;&#20391;&#33756;&#21333;&#30340;&#12300;&#21516;&#27493;&#24212;&#29992;&#34920;&#21333;&#12301;&#25353;&#38062;&#21516;&#27493;&#26032;&#34920;&#21333;&#12290;</div>
        </div>
      </div>
    </main>
  </div>

  <script src="../js/app.js"></script>
  <script src="../js/form-config.js"></script>
  <script>
    function copyGuidePrompt(el) {
      const textSpan = el.querySelector('span:first-child');
      if (!textSpan) return;
      let text = textSpan.textContent;
      const appName = getAppNameFromPath();
      if (appName && appName !== '&#24212;&#29992;&#21517;') {
        text = text.replace('&#31896;&#36148;Excel&#25991;&#20214;&#36335;&#24452;', 'd:/&#23452;&#25645;AI&#32534;&#31243;/&#23452;&#25645;AI&#21161;&#25163;V1.7.3/' + appName + '/01&#38656;&#27714;&#26803;&#29702;/' + appName + '&#34920;&#21333;&#28165;&#21333;.xlsx');
        text = text.replace(/&#24212;&#29992;&#21517;/g, appName);
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() { showCopyToast(el); });
      } else {
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showCopyToast(el);
      }
    }

    function showCopyToast(el) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#52c41a;color:#fff;padding:10px 24px;border-radius:4px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(82,196,26,0.4);';
      toast.textContent = '&#9989; &#25552;&#31034;&#35789;&#24050;&#22797;&#21046;&#21040;&#21098;&#36148;&#26495;';
      document.body.appendChild(toast);
      const hint = el.querySelector('.copy-hint');
      if (hint) {
        const origText = hint.textContent;
        hint.textContent = '&#9989; &#24050;&#22797;&#21046;';
        setTimeout(function() { hint.textContent = origText; }, 2000);
      }
      setTimeout(function() { toast.remove(); }, 2000);
    }

    function getAppNameFromPath() {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      // pathname 对中文目录名返回 URL 编码形式，需解码为明文（用于显示/拼接本地路径）
      const appName = pathParts[0] || '';
      try { return decodeURIComponent(appName); } catch (e) { return appName; }
    }

    document.addEventListener('DOMContentLoaded', function() {
      if (typeof FormConfig !== 'undefined') {
        FormConfig.loadFormListFromConfig().then(function() {
          renderListMenu();
          setTimeout(function() {
            document.querySelectorAll('.menu-item').forEach(function(item) {
              if (item.dataset.form === '__guide__') { item.classList.add('active'); }
            });
          }, 100);
        });
      }
      const appName = getAppNameFromPath();
      if (appName) {
        const excelPath = 'd:/&#23452;&#25645;AI&#32534;&#31243;/&#23452;&#25645;AI&#21161;&#25163;V1.7.3/' + appName + '/01&#38656;&#27714;&#26803;&#29702;/' + appName + '&#34920;&#21333;&#28165;&#21333;.xlsx';
        document.getElementById('excelPathDisplay').textContent = excelPath;
        const prompts = document.querySelectorAll('.guide-prompt-text span:first-child');
        if (prompts[0]) prompts[0].textContent = '&#23558; Excel&#12304;' + excelPath + '&#12305;&#36716;&#25442;&#25104;&#26412;&#22320;&#23383;&#27573;&#28165;&#21333;&#21644;&#35268;&#21017;&#28165;&#21333;&#65292;&#29983;&#25104;&#21040;&#12304;01&#38656;&#27714;&#26803;&#29702;&#12305;&#30446;&#24405;&#19979;&#12290;';
        if (prompts[1]) prompts[1].textContent = '&#25353;&#29031;&#12304;' + appName + '/01&#38656;&#27714;&#26803;&#29702;&#12305;&#65292;&#29983;&#25104;&#26412;&#22320;&#21407;&#22411;&#39029;&#38754;&#12290;';
        if (prompts[2]) prompts[2].textContent = '&#25353;&#29031;&#12304;' + appName + '/01&#38656;&#27714;&#26803;&#29702;/&#23383;&#27573;&#28165;&#21333;.md&#12305;&#65292;&#29983;&#25104;&#23452;&#25645;&#34920;&#21333;&#24182;&#25512;&#36865;&#21040;&#23452;&#25645;&#21019;&#24314;&#24212;&#29992;&#12290;';
      }
    });
  </script>
</body>
</html>`;
}

/**
 * 生成「生成清单」页面模板（manifest.html）
 * 展示并支持编辑三个需求梳理文件：字段清单.md、规则清单.md、应用分组.md。
 * 三个文件为唯一事实源，页面为视图层：
 *   - 生成时把三个 md 的当前内容内嵌为初始数据（window.__MANIFEST_DATA__）
 *   - 页面编辑表格后，通过 POST /local-files 回写对应 md 文件（锚点区间替换）
 * @param {string} markdownPath - 字段清单.md 的绝对路径（用于推导同目录的规则清单/应用分组）
 * @param {string} outputDir - 原型页面输出目录
 * @param {string} systemName - 系统名称
 * @returns {string} manifest.html 内容
 */
function generateManifestHtml(markdownPath, outputDir, systemName) {
  // 读取三个 md 的当前内容（供初始渲染，缺文件则置空）
  const reqDir = path.dirname(markdownPath);
  const readMd = (name) => {
    try {
      const p = path.join(reqDir, name);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
    } catch (e) { return ''; }
  };
  const fieldsMd = readMd('字段清单.md');
  const rulesMd = readMd('规则清单.md');
  const groupsMd = readMd('应用分组.md');
  const systemLogo = systemName || '生成清单';

  // 将 md 内容安全内嵌为 JSON（转义 </script> 防止破坏 HTML）
  const embedJson = (str) => JSON.stringify(String(str || '').replace(/<\/script>/gi, '<\\/script>'));

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${systemLogo} - 生成清单</title>
  <link rel="stylesheet" href="../css/style.css">
  <style>
    /* 顶栏手动保存按钮：触发 saveCurrentManifest() 保存当前激活 Tab */
    .btn-save-manifest { display: inline-flex; align-items: center; gap: 4px; padding: 4px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; color: #fff; background: #52c41a; border: 1px solid #52c41a; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .btn-save-manifest:hover { background: #73d13d; border-color: #73d13d; }
    .btn-save-manifest:active { background: #389e0d; border-color: #389e0d; }
    .manifest-header { background: linear-gradient(135deg, #13c2c2 0%, #1677ff 100%); color: #fff; padding: 24px 32px; border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
    .manifest-header h1 { font-size: 20px; margin: 0; }
    .manifest-header p { font-size: 13px; opacity: 0.85; margin-top: 4px; }
    .manifest-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border, #e8e8e8); margin-bottom: 16px; }
    .manifest-tab { padding: 10px 20px; font-size: 14px; font-weight: 500; border: none; background: none; cursor: pointer; color: #595959; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
    .manifest-tab:hover { color: #1677ff; }
    .manifest-tab.active { color: #1677ff; border-bottom-color: #1677ff; }
    .manifest-panel { display: none; }
    .manifest-panel.active { display: block; }
    .manifest-toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
    .manifest-toolbar .hint { font-size: 12px; color: #8c8c8c; }
    .manifest-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
    .manifest-table th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-weight: 600; color: #262626; border: 1px solid #e8e8e8; }
    .manifest-table td { padding: 6px 10px; border: 1px solid #e8e8e8; vertical-align: top; }
    .manifest-table td[contenteditable="true"] { cursor: text; background: #fff; }
    .manifest-table td[contenteditable="true"]:focus { background: #e6f4ff; outline: 2px solid #91d5ff; }
    .manifest-table tr:hover td { background: #fafafa; }
    .manifest-table tr:hover td[contenteditable="true"] { background: #fafafa; }
    .manifest-table tr:hover td[contenteditable="true"]:focus { background: #e6f4ff; }
    /* ===== 字段清单表格列宽控制（fixed 布局让列宽严格生效） ===== */
    .manifest-fields-table { table-layout: fixed; }
    .manifest-fields-table .manifest-col-name { width: 12%; }
    .manifest-fields-table .manifest-col-type { width: 12%; }
    .manifest-fields-table .manifest-col-desc { width: 42%; }
    .manifest-fields-table .manifest-col-select { width: 10%; }
    /* ===== 字段状态 / 是否必填 下拉框美化 ===== */
    .manifest-table select[data-kind] {
      width: 100%;
      padding: 5px 26px 5px 9px;
      border: 1px solid #d0d5dd;
      border-radius: 6px;
      background-color: #fff;
      font-size: 13px;
      line-height: 1.5;
      color: #1f2d3d;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%238c94a1' d='M6 8.5L1.5 4h9z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 12px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .manifest-table select[data-kind]:hover { border-color: #1677ff; }
    .manifest-table select[data-kind]:focus { outline: none; border-color: #1677ff; box-shadow: 0 0 0 2px rgba(22,119,255,0.15); }
    .manifest-table select[data-kind="status"] { background-color: #f0f7ff; }
    .manifest-table select[data-kind="required"] { background-color: #f6ffed; }
    .manifest-table select[data-kind="fieldtype"] { background-color: #f9f0ff; }
    .manifest-btn { font-size: 12px; padding: 4px 12px; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer; color: #333; background: #fff; transition: all 0.2s; }
    .manifest-btn:hover { opacity: 0.85; }
    .manifest-btn.primary { background: #1677ff; color: #fff; border-color: #1677ff; }
    .manifest-btn.warning { background: #faad14; color: #333; border-color: #faad14; }
    .manifest-btn.danger { background: #ff4d4f; color: #fff; border-color: #ff4d4f; }
    .manifest-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .manifest-status { font-size: 12px; padding: 4px 12px; border-radius: 4px; }
    .manifest-status.success { background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; }
    .manifest-status.error { background: #fff2f0; color: #ff4d4f; border: 1px solid #ffccc7; }
    .manifest-status.idle { background: #f5f5f5; color: #8c8c8c; border: 1px solid #e8e8e8; }
    .manifest-section { margin-bottom: 16px; }
    .manifest-section-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; padding-left: 10px; border-left: 4px solid #1677ff; }
    .manifest-empty { padding: 40px; text-align: center; color: #8c8c8c; font-size: 14px; }
    .manifest-cell-actions { white-space: nowrap; }
    .manifest-add-row-btn { margin-top: 8px; }
    .manifest-field-group { margin-bottom: 8px; }
    .manifest-field-group-name { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #262626; }
    .manifest-note { margin-top: 16px; padding: 10px 14px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 6px; font-size: 12px; color: #d48806; line-height: 1.6; }
    /* 「字段清单使用说明」折叠区：三角形与下方分组箭头一致（大小/颜色/间距/左缩进） */
    .manifest-collapse { margin: 0; }
    .manifest-collapse-summary { list-style: none; cursor: pointer; font-size: 13px; font-weight: 600; color: #1677ff; padding: 10px 16px; margin: 0; user-select: none; display: flex; align-items: center; }
    .manifest-collapse-summary::-webkit-details-marker { display: none; }
    .manifest-collapse-summary::before { content: '▼'; display: inline-block; font-size: 11px; color: #409eff; margin-right: 6px; transform: rotate(-90deg); transition: transform 0.2s; }
    .manifest-collapse[open] > .manifest-collapse-summary::before { transform: rotate(0deg); }
    /* ===== 使用说明 HTML 排版（替代原生 md 原文） ===== */
    .manifest-guide { padding: 4px 2px; }
    .manifest-guide h3 { font-size: 15px; font-weight: 700; color: #1677ff; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e8e8e8; }
    .manifest-guide h3.guide-main { font-size: 16px; margin-top: 6px; }
    .manifest-guide h4 { font-size: 13px; font-weight: 700; color: #262626; margin: 14px 0 8px; }
    .manifest-guide p { font-size: 13px; color: #595959; line-height: 1.8; margin: 6px 0; }
    .manifest-guide p.guide-sub { font-size: 12px; font-weight: 600; color: #8c8c8c; margin: 8px 0 4px; }
    .manifest-guide ul { margin: 6px 0 6px 18px; padding: 0; }
    .manifest-guide ul li { font-size: 13px; color: #595959; line-height: 1.9; }
    .manifest-guide strong { color: #262626; font-weight: 700; }
    .manifest-guide em { color: #d48806; font-style: normal; background: #fffbe6; padding: 1px 4px; border-radius: 3px; }
    .manifest-guide blockquote { margin: 8px 0; padding: 8px 12px; background: #f6ffed; border-left: 4px solid #52c41a; border-radius: 0 6px 6px 0; font-size: 13px; color: #389e0d; line-height: 1.7; }
    .manifest-guide table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; background: #fff; }
    .manifest-guide table th { background: #f5f5f5; padding: 7px 10px; text-align: left; font-weight: 600; color: #262626; border: 1px solid #e8e8e8; }
    .manifest-guide table td { padding: 6px 10px; border: 1px solid #e8e8e8; color: #595959; line-height: 1.6; }
    .manifest-guide hr { border: none; border-top: 1px dashed #d9d9d9; margin: 16px 0; }
    /* ===== 分组 / 表单 折叠与区分 ===== */
    .manifest-group { margin-bottom: 14px; border: 1px solid #e8e8e8; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .manifest-group-header { padding: 12px 16px; font-size: 14px; font-weight: 700; color: #1f2d3d; cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; background: #f7f9fc; transition: background 0.2s; }
    .manifest-group-header:hover { background: #eef3fa; }
    .manifest-group-arrow { font-size: 11px; color: #409eff; transition: transform 0.2s; display: inline-block; margin-right: 6px; }
    .manifest-group-arrow { transform: rotate(0deg); } /* 默认展开 → ▼ 向下 */
    .manifest-group.collapsed .manifest-group-arrow { transform: rotate(-90deg); } /* 收起 → ▶ 向右 */
    .manifest-group-body { padding: 10px 12px; }
    .manifest-group.collapsed .manifest-group-body { display: none; }
    .manifest-form { margin-bottom: 10px; border: 1px solid #ececec; border-radius: 8px; overflow: hidden; background: #fff; }
    .manifest-form-header { padding: 10px 14px; font-size: 13px; font-weight: 600; color: #303133; cursor: pointer; display: flex; align-items: center; gap: 8px; user-select: none; background: #fafbfc; transition: background 0.2s; }
    .manifest-form-header:hover { background: #f2f6fb; }
    .manifest-form-arrow { font-size: 11px; color: #909399; transition: transform 0.2s; display: inline-block; }
    .manifest-form-arrow { transform: rotate(0deg); } /* 默认展开 → ▼ */
    .manifest-form.collapsed .manifest-form-arrow { transform: rotate(-90deg); } /* 收起 → ▶ */
    .manifest-form-body { padding: 10px 8px 6px; }
    .manifest-form.collapsed .manifest-form-body { display: none; }
    .manifest-form-type { display: inline-block; font-size: 11px; padding: 2px 10px; border-radius: 12px; color: #fff; background: #409eff; white-space: nowrap; letter-spacing: 0.5px; }
    .manifest-form-type.flow { background: #f56c6c; }
    .manifest-datatitle { font-size: 11px; color: #a0a4ab; white-space: nowrap; }
    /* 数据标题可编辑输入框（修改后自动保存回写 字段清单.md） */
    .manifest-datatitle-input { width: 180px; max-width: 40%; font-size: 12px; color: #606266; padding: 2px 8px; border: 1px dashed #c0c4cc; border-radius: 4px; background: transparent; outline: none; transition: all 0.2s; margin-left: 4px; }
    .manifest-datatitle-input:hover { border-color: #409eff; background: #fff; }
    .manifest-datatitle-input:focus { border-style: solid; border-color: #409eff; background: #fff; box-shadow: 0 0 0 2px rgba(64,158,255,0.15); }
    .manifest-table-title { font-size: 12px; font-weight: 600; color: #606266; margin: 8px 2px 4px; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; justify-content: center; align-items: center; }
    .modal-box { background: #fff; border-radius: 8px; padding: 20px 24px; width: 90%; max-width: 640px; max-height: 80vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .modal-box h3 { font-size: 16px; margin: 0 0 16px; }
    .modal-box textarea { width: 100%; min-height: 240px; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 6px; resize: vertical; box-sizing: border-box; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .badge-rule { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; margin-right: 4px; color: #fff; }
    .badge-rule.r1 { background: #722ed1; }
    .badge-rule.r2 { background: #fa8c16; }
    .badge-rule.r3 { background: #13c2c2; }
    .badge-rule.r4 { background: #52c41a; }
    .badge-rule.r5 { background: #1677ff; }
    @media (max-width: 640px) {
      .manifest-header { padding: 16px 20px; }
      .manifest-table { font-size: 12px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <div class="logo" id="systemLogo">${systemLogo}</div>
      <span style="font-size:12px;color:#8c8c8c;padding:2px 8px;background:#f0f0f0;border-radius:4px;">生成清单</span>
      <button class="btn btn-sync-local" id="refreshLocalBtn" onclick="refreshManifestData()" title="重新读取本地字段清单/规则清单/应用分组的最新内容">&#128190; 刷新本地清单</button>
      <span id="refreshLocalStatus" class="sync-status" style="display:none;margin-left:8px;"></span>
    </div>
    <div class="user-info">
      <button class="btn btn-save-manifest" id="saveManifestBtn" onclick="saveCurrentManifest()" title="保存当前Tab（应用分组/字段清单/规则清单）到对应 md 源文件">&#128190; 保存</button>
      <a href="/本地操作页面/index.html" class="btn-portal-link" title="回到组织主页（宜搭AI助手组织管理门户）">&#127968; 组织主页</a>
      &#128100; 管理员
    </div>
  </header>

  <div class="container">
    <aside class="sidebar">
      <nav class="menu">
        <div id="menuItems"></div>
      </nav>
    </aside>

    <main class="main-content">
      <div class="manifest-header">
        <div>
          <h1>&#128202; 生成清单</h1>
          <p>查看与编辑「字段清单 / 规则清单 / 应用分组」三个需求文件，编辑后自动回写对应 .md 源文件。</p>
        </div>
        <div id="manifestStatus" class="manifest-status idle">就绪</div>
      </div>

      <div class="manifest-tabs">
        <button class="manifest-tab active" data-tab="groups" onclick="switchManifestTab('groups')">&#128193; 应用分组</button>
        <button class="manifest-tab" data-tab="fields" onclick="switchManifestTab('fields')">&#128203; 字段清单</button>
        <button class="manifest-tab" data-tab="rules" onclick="switchManifestTab('rules')">&#128209; 规则清单</button>
      </div>

      <!-- Tab1 应用分组 -->
      <div class="manifest-panel active" id="panel-groups">
        <div class="manifest-toolbar">
          <button class="manifest-btn warning" onclick="saveManifestFile('groups')">&#128190; 保存应用分组</button>
          <button class="manifest-btn" onclick="addGroupRow()">+ 新增分组</button>
          <button class="manifest-btn" onclick="openRawView('groups')">&#128194; 查看源文件</button>
          <span class="hint">点击表格单元格可直接编辑；保存后回写 应用分组.md</span>
        </div>
        <div id="groupsTableWrap"></div>
        <div class="manifest-note">&#128161; 应用分组定义宜搭应用中的导航分组结构。创建应用前请确认，可直接在下方编辑分组名称与包含表单。</div>
      </div>

      <!-- Tab2 字段清单 -->
      <div class="manifest-panel" id="panel-fields">
        <div class="manifest-toolbar">
          <input type="text" id="fieldSearch" placeholder="搜索字段名..." style="padding:6px 10px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;width:200px;" oninput="renderFieldsPanel()">
          <button class="manifest-btn warning" onclick="saveManifestFile('fields')">&#128190; 保存字段清单</button>
          <button class="manifest-btn" onclick="openRawView('fields')">&#128194; 查看源文件</button>
          <span class="hint">点击单元格可编辑字段名称/类型/说明/状态/必填</span>
        </div>
        <div id="fieldsPanelWrap"></div>
        <div class="manifest-note">&#128161; 字段清单是生成宜搭表单的依据。修改字段后请同步核对规则清单，再创建应用。</div>
      </div>

      <!-- Tab3 规则清单 -->
      <div class="manifest-panel" id="panel-rules">
        <div class="manifest-toolbar">
          <button class="manifest-btn warning" onclick="saveManifestFile('rules')">&#128190; 保存规则清单</button>
          <button class="manifest-btn" onclick="openRawView('rules')">&#128194; 查看源文件</button>
          <span class="hint">支持两种规则格式：按规则类型分类或按表单分类，自动识别</span>
        </div>
        <div id="rulesPanelWrap"></div>
        <div class="manifest-note">&#128161; 规则清单为评审参考，不会直接在宜搭中生成。具体公式/代码/流程由用户确认后另行生成。</div>
      </div>
    </main>
  </div>

  <!-- 源文件查看弹窗 -->
  <div class="modal-backdrop" id="rawModal" style="display:none;" onclick="if(event.target===this)this.style.display='none';">
    <div class="modal-box">
      <h3 id="rawModalTitle">源文件</h3>
      <textarea id="rawModalContent" readonly></textarea>
      <div class="modal-actions">
        <button class="manifest-btn" onclick="document.getElementById('rawModal').style.display='none';">关闭</button>
      </div>
    </div>
  </div>

  <script>
    // ===== 初始数据（由生成器内嵌）=====
    window.__MANIFEST_DATA__ = {
      fieldsMd: ${embedJson(fieldsMd)},
      rulesMd: ${embedJson(rulesMd)},
      groupsMd: ${embedJson(groupsMd)}
    };

    // ===== 同步服务地址 =====
    const SYNC_SERVICE = 'http://localhost:3457';
    const CURRENT_FILE = {
      groups: '字段清单所在目录的应用分组.md（由后端按 file 参数定位）'
    };
    // 由 getBasePath() 推导项目目录名和应用目录名，用于构造 file 参数和 projectDir 参数
    // 注意：window.location.pathname 对非 ASCII 目录名（如中文应用目录）会返回 URL 编码形式
    // （如 %E8%BF%9B%E9%94%80%E5%AD%983），必须先 decodeURIComponent 还原为明文，
    // 否则 buildFileParam 拼接后再 encodeURIComponent 会双重编码，导致同步服务 404。
    // v3.1.0 多组织并存模式：URL 格式为 /{项目目录名}/{应用名}/01需求梳理/原型页面/index.html
    //      老回退模式：URL 格式为 /{应用名}/01需求梳理/原型页面/index.html
    function getPathParts() {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const decode = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
      // 多组织并存模式：parts[2] === '01需求梳理'
      if (parts.length >= 3 && parts[2] === '01%E9%9C%80%E6%B1%82%E6%A2%B3%E7%90%86') {
        return { projectDir: decode(parts[0]), appDir: decode(parts[1]) };
      }
      // 兼容已解码的 '01需求梳理'
      if (parts.length >= 3 && parts[2] === '01需求梳理') {
        return { projectDir: decode(parts[0]), appDir: decode(parts[1]) };
      }
      // 老回退模式：parts[1] === '01需求梳理' 或 parts[1] 是其编码形式
      if (parts.length >= 2 && (parts[1] === '01%E9%9C%80%E6%B1%82%E6%A2%B3%E7%90%86' || parts[1] === '01需求梳理')) {
        return { projectDir: '', appDir: decode(parts[0]) };
      }
      // 兜底
      return { projectDir: '', appDir: decode(parts[0] || '') };
    }
    function getProjectDirName() {
      return getPathParts().projectDir;
    }
    function getAppDirName() {
      return getPathParts().appDir;
    }
    function buildFileParam(relName) {
      const appDir = getAppDirName();
      return appDir ? (appDir + '/01需求梳理/' + relName) : relName;
    }
    // v3.1.0: 构造 projectDir 查询参数（多组织并存模式）
    function buildProjectDirQuery() {
      const pd = getProjectDirName();
      return pd ? ('&projectDir=' + encodeURIComponent(pd)) : '';
    }

    // ===== Tab 切换 =====
    let currentTab = 'groups'; // 当前激活 Tab，供顶栏保存按钮 saveCurrentManifest 使用
    function switchManifestTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.manifest-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.manifest-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + tab).classList.add('active');
      if (tab === 'groups') renderGroupsPanel();
      if (tab === 'fields') renderFieldsPanel();
      if (tab === 'rules') renderRulesPanel();
    }
    // 顶栏「保存」按钮：保存当前激活 Tab 到对应 md 源文件
    function saveCurrentManifest() {
      saveManifestFile(currentTab || 'groups');
    }

    // ===== 状态提示 =====
    function setStatus(text, type) {
      const el = document.getElementById('manifestStatus');
      if (!el) return;
      el.textContent = text;
      el.className = 'manifest-status ' + (type || 'idle');
    }

    // 顶栏刷新按钮的状态提示
    function setRefreshStatus(text, type) {
      const el = document.getElementById('refreshLocalStatus');
      if (!el) return;
      if (!text) { el.style.display = 'none'; return; }
      el.textContent = text;
      el.style.display = 'inline';
      el.className = 'sync-status ' + (type || '');
    }

    // ===== 刷新本地清单：重新 GET 三个 md 的最新内容并重渲染 =====
    // 设计：本地三个 .md 是唯一事实源，页面是视图层。刷新 = 从磁盘拉取最新内容覆盖内嵌快照。
    // 与顶栏「🔄 同步应用表单」（云端→本地）互补：此按钮为「本地→页面」。
    async function refreshManifestData(silent) {
      const btn = document.getElementById('refreshLocalBtn');
      const relMap = { fieldsMd: '字段清单.md', rulesMd: '规则清单.md', groupsMd: '应用分组.md' };
      if (btn) { btn.disabled = true; btn.innerHTML = '刷新中...'; }
      if (!silent) setRefreshStatus('刷新中...', '');
      try {
        const entries = Object.keys(relMap);
        const results = await Promise.all(entries.map(key => {
          return fetch(SYNC_SERVICE + '/local-files?file=' + encodeURIComponent(buildFileParam(relMap[key])) + buildProjectDirQuery())
            .then(res => res.json())
            .then(d => ({ key, ok: !!d.success, content: d.data || '' }))
            .catch(() => ({ key, ok: false, content: '' }));
        }));
        let failCount = 0;
        results.forEach(r => {
          if (r.ok) {
            window.__MANIFEST_DATA__[r.key] = r.content;
          } else {
            failCount++;
          }
        });
        // 清空解析缓存并重渲染
        fieldsCache = null;
        rulesSections = [];
        groupsRows = [];
        renderGroupsPanel();
        renderFieldsPanel();
        renderRulesPanel();
        const currentTab = document.querySelector('.manifest-tab.active');
        if (currentTab) switchManifestTab(currentTab.dataset.tab);
        if (failCount > 0) {
          if (!silent) { setRefreshStatus(failCount + ' 个文件读取失败', 'error'); setStatus('部分文件刷新失败：同步服务未启动或文件不存在', 'error'); }
        } else {
          if (!silent) { setRefreshStatus('已刷新 ' + entries.length + ' 个文件', 'success'); setStatus('已从本地重新读取最新清单', 'success'); }
        }
      } catch (e) {
        if (!silent) { setRefreshStatus('刷新失败', 'error'); setStatus('刷新失败：' + e.message, 'error'); }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '&#128190; 刷新本地清单'; }
        setTimeout(function() { setRefreshStatus(null); }, 3000);
      }
    }

    // ===== 解析 Markdown 表格 =====
    function parseMdTable(md) {
      const lines = String(md || '').split('\\n');
      const tables = [];
      let cur = null;
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('|')) {
          const cells = t.split('|').slice(1, -1).map(c => c.trim());
          if (t.includes('---') && cells.every(c => /^-+$/.test(c.replace(/^:+/,'').replace(/:+$/,'')))) {
            if (cur) { cur.rows.push([]); } // 分隔行，跳过
          } else if (!cur) {
            cur = { header: cells, rows: [] };
          } else if (cur.header) {
            cur.rows.push(cells);
          }
        } else {
          if (cur) { tables.push(cur); cur = null; }
        }
      }
      if (cur) tables.push(cur);
      return tables;
    }

    // ===== 应用分组渲染 =====
    let groupsRows = [];
    function initGroups() {
      const tables = parseMdTable(window.__MANIFEST_DATA__.groupsMd);
      // 取第一个有"分组名称"列的表格
      const g = tables.find(t => t.header && t.header.some(h => h.includes('分组名称'))) || tables[0];
      if (g && g.header) {
        // 过滤完全空的分组行（名称与包含表单均为空），避免表格残留空行污染
        groupsRows = g.rows.map(r => {
          const obj = { name: '', forms: '' };
          const nameIdx = g.header.findIndex(h => h.includes('分组名称'));
          const formsIdx = g.header.findIndex(h => h.includes('包含表单'));
          if (nameIdx >= 0) obj.name = r[nameIdx] || '';
          if (formsIdx >= 0) obj.forms = r[formsIdx] || '';
          return obj;
        }).filter(g => (g.name && g.name.trim()) || (g.forms && g.forms.trim()));
      }
    }
    function renderGroupsPanel() {
      const wrap = document.getElementById('groupsTableWrap');
      if (!groupsRows.length) initGroups();
      let html = '<table class="manifest-table"><thead><tr><th style="width:60px;">序号</th><th>分组名称</th><th>包含表单（顿号分隔）</th><th style="width:120px;">操作</th></tr></thead><tbody>';
      groupsRows.forEach((g, i) => {
        html += '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td contenteditable="true" data-row="' + i + '" data-col="name">' + g.name + '</td>' +
          '<td contenteditable="true" data-row="' + i + '" data-col="forms">' + g.forms + '</td>' +
          '<td class="manifest-cell-actions"><button class="manifest-btn danger" onclick="deleteGroupRow(' + i + ')">删除</button></td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      wrap.innerHTML = html;
      bindManifestEdits(wrap, 'groups');
    }
    function addGroupRow() { groupsRows.push({ name: '', forms: '' }); renderGroupsPanel(); autoSave('groups'); }
    function deleteGroupRow(i) { groupsRows.splice(i, 1); renderGroupsPanel(); autoSave('groups'); }

    // ===== 字段清单渲染：按「分组 → 表单（可折叠）→ 数据标题 + 主表/子表」完整展示 =====
    // 解析 字段清单.md 的完整结构，与源文件一一对应（不再只取第一个表格）。
    let fieldsCache = null;
    function parseFieldsData() {
      if (fieldsCache) return fieldsCache;
      const md = String(window.__MANIFEST_DATA__.fieldsMd || '');
      const lines = md.split('\\n');
      const groups = [];
      let curGroup = null, curForm = null, curTable = null;
      // 顶部说明区：从文件头到第一个真正的分组标题（形如 "## 一、基础信息"），保留说明区原文用于回写。
      // 使用说明区内的 "## 📋 字段清单使用说明" 和 "### 一、可用字段类型" 等不计为分组。
      let headEnd = 0;
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (/^##\\s*[一二三四五六七八九十0-9]+、/.test(t)) { headEnd = i; break; }
      }
      const head = headEnd > 0 ? lines.slice(0, headEnd).join('\\n') : md;

      const beginTable = (header) => {
        curTable = { title: '', header: header || [], rows: [] };
        if (curForm) curForm.tables.push(curTable);
      };
      for (let i = headEnd; i < lines.length; i++) {
        const t = lines[i].trim();
        if (/^##\\s+/.test(t)) {
          // 剥离重复的中文序号前缀（"一、一、基础信息" → "一、基础信息"），保留单重
          const groupName = t.replace(/^##\\s+/, '').replace(/^(?:[一二三四五六七八九十]+[、.．]\\s*)+(?=[一二三四五六七八九十]+[、.．])/, '');
          curGroup = { name: groupName, forms: [] };
          groups.push(curGroup); curForm = null; curTable = null; continue;
        }
        if (/^###\\s+/.test(t)) {
          const nameMatch = t.replace(/^###\\s+/, '').match(/^(\\(?[一二三四五六七八九十0-9]+\\)?\\s*)?(.+?)「(.+?)」$/);
          curForm = { name: nameMatch ? nameMatch[2] : t.replace(/^###\\s+/, ''), formType: nameMatch ? nameMatch[3] : '', dataTitle: '', tables: [] };
          if (curGroup) curGroup.forms.push(curForm); curTable = null; continue;
        }
        // 数据标题
        const dt = t.match(/^\\*\\*数据标题[：:]\\s*(.+?)\\*\\*/);
        if (dt && curForm) { curForm.dataTitle = dt[1]; continue; }
        // 子表标题：标记下一个表格为子表（重置 curTable，等待表头行创建）
        const sub = t.match(/^\\*\\*子表[：:]\\s*(.+?)\\*\\*/);
        if (sub && curForm) { curForm._pendingTitle = '子表：' + sub[1]; curTable = null; continue; }
        // 主表标题（子表之前的最后一个主表）
        const main = t.match(/^\\*\\*主表[：:]\\s*(.+?)\\*\\*/);
        if (main && curForm) { curForm._pendingTitle = '主表：' + main[1]; curTable = null; continue; }
        // 表格：表头行（首行）创建表格，分隔行跳过，数据行追加
        if (t.startsWith('|')) {
          const cells = t.split('|').slice(1, -1).map(c => c.trim());
          const isSep = cells.length && cells.every(c => /^-+$/.test(c.replace(/^:+/,'').replace(/:+$/,'')));
          if (!isSep && cells.length) {
            if (!curTable) {
              const title = curForm && curForm._pendingTitle ? curForm._pendingTitle : '主表';
              curTable = { title: title, header: cells, rows: [] };
              if (curForm) { curForm.tables.push(curTable); curForm._pendingTitle = null; }
            } else {
              curTable.rows.push(cells);
            }
          }
        }
      }
      fieldsCache = { groups, head, raw: md };
      return fieldsCache;
    }

    // 轻量 md → HTML：仅用于「使用说明」区排版，避免原样显示 md 语法
    function mdToHtml(md) {
      const lines = String(md || '').split('\\n');
      let html = '', inTable = false, inList = false;
      const flushTable = () => { if (inTable) { html += '</table>'; inTable = false; } };
      const flushList = () => { if (inList) { html += '</ul>'; inList = false; } };
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const t = line.trim();
        if (!t) { flushTable(); flushList(); continue; }
        // 表格
        if (t.startsWith('|')) {
          const cells = t.split('|').slice(1, -1).map(c => c.trim());
          const isSep = cells.length && cells.every(c => /^-+$/.test(c.replace(/^:+/,'').replace(/:+$/,'')));
          if (isSep) { continue; }
          if (!inTable) { inTable = true; html += '<table><thead><tr>' + cells.map(c => '<th>' + c.replace(/\\*\\*/g, '').replace(/[\`*#]/g, '') + '</th>').join('') + '</tr></thead><tbody>'; }
          else { html += '<tr>' + cells.map(c => '<td>' + c.replace(/\\*\\*/g, '') + '</td>').join('') + '</tr>'; }
          continue;
        }
        flushTable();
        // 标题（#/##/###/#### 统一为 h3/h4 层级）
        const h2 = t.match(/^##\\s+(.+)$/);
        if (h2) { flushList(); html += '<h3 class="guide-main">' + h2[1].replace(/[\`*#]/g, '') + '</h3>'; continue; }
        const h3 = t.match(/^###\\s+(.+)$/);
        if (h3) { flushList(); html += '<h4>' + h3[1].replace(/[\`*#]/g, '') + '</h4>'; continue; }
        const h4 = t.match(/^####\\s+(.+)$/);
        if (h4) { flushList(); html += '<p class="guide-sub">' + h4[1].replace(/[\`*#]/g, '') + '</p>'; continue; }
        // 分隔线
        if (/^---+$/.test(t) || /^\\*\\*\\*+$/.test(t)) { flushList(); html += '<hr>'; continue; }
        // 引用
        if (t.startsWith('>')) { flushList(); html += '<blockquote>' + inlineFormat(t.replace(/^>\\s*/, '')) + '</blockquote>'; continue; }
        // 无序列表
        if (/^[-*]\\s+/.test(t)) {
          if (!inList) { inList = true; html += '<ul>'; }
          html += '<li>' + inlineFormat(t.replace(/^[-*]\\s+/, '')) + '</li>'; continue;
        }
        flushList();
        // 普通段落
        html += '<p>' + inlineFormat(t) + '</p>';
      }
      flushTable(); flushList();
      return html;
    }
    // 行内格式：**加粗** / \`代码\` / 前后缀
    function inlineFormat(s) {
      return String(s || '')
        .replace(/\`([^\`]+)\`/g, '<em>$1</em>')
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    }

    // ===== 分组 / 表单折叠状态管理（加 manifest 前缀避免与 app.js 的 toggleGroup 冲突） =====
    let groupCollapsed = {}, formCollapsed = {};
    let fieldsData = null;
    function manifestToggleGroup(gi, force) {
      // 语义：groupCollapsed[gi] === false 表示展开，其余(undefined/true)表示收起；点击切换
      groupCollapsed[gi] = (force !== undefined) ? force : (groupCollapsed[gi] === false);
      const el = document.querySelector('.manifest-group[data-gi="' + gi + '"]');
      if (el) el.classList.toggle('collapsed', groupCollapsed[gi] !== false);
    }
    function manifestToggleForm(gi, fi, force) {
      const key = gi + '-' + fi;
      formCollapsed[key] = (force !== undefined) ? force : (formCollapsed[key] === false);
      const el = document.querySelector('.manifest-form[data-key="' + key + '"]');
      if (el) el.classList.toggle('collapsed', formCollapsed[key] !== false);
    }
    function manifestCollapseAll() {
      const d = fieldsData || parseFieldsData();
      const groups = d.groups || [];
      groups.forEach((g, gi) => { groupCollapsed[gi] = true; g.forms.forEach((f, fi) => { formCollapsed[gi + '-' + fi] = true; }); });
      const gEls = document.querySelectorAll('.manifest-group'); gEls.forEach(e => e.classList.add('collapsed'));
      const fEls = document.querySelectorAll('.manifest-form'); fEls.forEach(e => e.classList.add('collapsed'));
    }
    function manifestExpandAll() {
      const d = fieldsData || parseFieldsData();
      const groups = d.groups || [];
      groups.forEach((g, gi) => { groupCollapsed[gi] = false; g.forms.forEach((f, fi) => { formCollapsed[gi + '-' + fi] = false; }); });
      const gEls = document.querySelectorAll('.manifest-group'); gEls.forEach(e => e.classList.remove('collapsed'));
      const fEls = document.querySelectorAll('.manifest-form'); fEls.forEach(e => e.classList.remove('collapsed'));
    }
    // 合并「全部收起/全部展开」为单个切换按钮：根据 manifestAllExpanded 状态切换
    let manifestAllExpanded = false;
    function updateManifestToggleBtn() {
      const btn = document.getElementById('manifestToggleAllBtn');
      if (btn) {
        btn.textContent = manifestAllExpanded ? '📕 全部收起' : '📖 全部展开';
        btn.title = manifestAllExpanded ? '收起所有分组与表单' : '展开所有分组与表单';
      }
    }
    function manifestToggleAll() {
      if (manifestAllExpanded) { manifestCollapseAll(); manifestAllExpanded = false; }
      else { manifestExpandAll(); manifestAllExpanded = true; }
      updateManifestToggleBtn();
    }
    function renderFieldsPanel() {
      fieldsData = parseFieldsData();
      const wrap = document.getElementById('fieldsPanelWrap');
      if (!fieldsData.groups.length) { wrap.innerHTML = '<div class="manifest-empty">未检测到字段清单内容</div>'; return; }
      const kw = (document.getElementById('fieldSearch').value || '').trim();
      // 顶部的「使用说明」折叠区：用 mdToHtml 将说明转为结构化 HTML 排版
      const headContent = (fieldsData.head || '').replace(/^#+[^\\n]*\\n*/, '').trim();
      let html = '<details class="manifest-collapse"><summary class="manifest-collapse-summary">字段清单使用说明（可展开）</summary><div class="manifest-collapse-body manifest-guide">' + mdToHtml(headContent) + '</div></details>';
      // 工具栏：全部展开 / 全部收起（单个切换按钮，图标+文字随状态变化）
      html += '<div class="manifest-toolbar" style="margin:10px 0;">' +
        '<button class="manifest-btn" id="manifestToggleAllBtn" onclick="manifestToggleAll()" title="' + (manifestAllExpanded ? '收起所有分组与表单' : '展开所有分组与表单') + '">' + (manifestAllExpanded ? '📕 全部收起' : '📖 全部展开') + '</button>' +
        '<span class="hint">点击分组/表单标题可展开或收起</span></div>';
      fieldsData.groups.forEach((g, gi) => {
        // 搜索时若命中该分组内任意字段则自动展开该分组
        const gHit = kw && g.forms.some(f => f.tables.some(tb => tb.rows.some(r => r.some(c => String(c).includes(kw)))));
        const gOpen = gHit || groupCollapsed[gi] === false;
        html += '<div class="manifest-group' + (gOpen ? '' : ' collapsed') + '" data-gi="' + gi + '">' +
          '<div class="manifest-group-header" onclick="manifestToggleGroup(' + gi + ')">' +
          '<span><span class="manifest-group-arrow">▼</span> ' + g.name + '</span>' +
          '<span class="manifest-datatitle">' + g.forms.length + ' 个表单</span></div>' +
          '<div class="manifest-group-body">';
        g.forms.forEach((form, fi) => {
          const key = gi + '-' + fi;
          const fHit = kw && form.tables.some(tb => tb.rows.some(r => r.some(c => String(c).includes(kw))));
          const fOpen = fHit || formCollapsed[key] === false;
          const isFlow = form.formType && form.formType.indexOf('流程') >= 0;
          html += '<div class="manifest-form' + (fOpen ? '' : ' collapsed') + '" data-key="' + key + '">' +
            '<div class="manifest-form-header" onclick="manifestToggleForm(' + gi + ',' + fi + ')">' +
            '<span class="manifest-form-arrow">▼</span>' +
            '<span class="manifest-form-type' + (isFlow ? ' flow' : '') + '">' + form.formType + '</span> ' + form.name +
            '<span class="manifest-datatitle">数据标题：</span>' +
            '<input class="manifest-datatitle-input" type="text" value="' + escapeHtml(form.dataTitle || '') + '" placeholder="（可编辑，自动保存）" data-gi="' + gi + '" data-fi="' + fi + '" onclick="event.stopPropagation()" oninput="updateDataTitle(this)" title="修改数据标题后自动回写 字段清单.md">' +
            '</div>';
          html += '<div class="manifest-form-body">';
          form.tables.forEach((tb, ti) => {
            html += '<div class="manifest-table-title">' + tb.title + '</div>';
            if (!tb.header.length) { html += '<div class="manifest-empty" style="padding:12px;">（空表）</div>'; return; }
            html += '<table class="manifest-table manifest-fields-table"><thead><tr>' + tb.header.map(h => '<th class="' + colClassFor(h) + '">' + h + '</th>').join('') + '<th style="width:8%;">操作</th></tr></thead><tbody>';
            tb.rows.forEach((r, ri) => {
              if (kw && !r.some(c => String(c).includes(kw))) return;
              html += '<tr>';
              tb.header.forEach((h, ci) => {
                html += renderFieldCell(gi, fi, ti, ri, ci, h, r[ci] || '');
              });
              html += '<td class="manifest-cell-actions"><button class="manifest-btn danger" onclick="deleteFieldRow(' + gi + ',' + fi + ',' + ti + ',' + ri + ')">删除</button></td></tr>';
            });
            html += '</tbody></table>';
            html += '<button class="manifest-btn manifest-add-row-btn" onclick="addFieldRow(' + gi + ',' + fi + ',' + ti + ')">+ 新增行</button>';
          });
          html += '</div></div>';
        });
        html += '</div></div>';
      });
      wrap.innerHTML = html;
      bindManifestEdits(wrap, 'fields');
      bindFieldSelects();
    }
    // 根据表头列名返回列宽 class（用于控制字段说明/字段状态/是否必填等列的宽度）
    function colClassFor(h) {
      const s = String(h || '');
      if (s.indexOf('字段名') >= 0 || s.indexOf('字段编码') >= 0) return 'manifest-col-name';
      if (s.indexOf('字段状态') >= 0 || s.indexOf('是否必填') >= 0) return 'manifest-col-select';
      if (s.indexOf('说明') >= 0 || s.indexOf('描述') >= 0) return 'manifest-col-desc';
      if (s.indexOf('类型') >= 0) return 'manifest-col-type';
      return '';
    }
    // 渲染字段单元格：字段状态/是否必填 用下拉选项，其余保持可编辑文本
    function renderFieldCell(gi, fi, ti, ri, ci, header, val) {
      const h = String(header || '');
      const colCls = colClassFor(h);
      if (h.indexOf('字段状态') >= 0) {
        const opts = ['普通', '只读', '隐藏'];
        return '<td class="' + colCls + '"><select data-kind="status" data-gi="' + gi + '" data-fi="' + fi + '" data-ti="' + ti + '" data-row="' + ri + '" data-col="' + ci + '">' +
          opts.map(o => '<option value="' + o + '"' + (String(val) === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></td>';
      }
      if (h.indexOf('是否必填') >= 0) {
        const opts = ['否', '是'];
        return '<td class="' + colCls + '"><select data-kind="required" data-gi="' + gi + '" data-fi="' + fi + '" data-ti="' + ti + '" data-row="' + ri + '" data-col="' + ci + '">' +
          opts.map(o => '<option value="' + o + '"' + (String(val) === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></td>';
      }
      // 字段类型 → 预设下拉（选项来自字段清单"可用字段类型"，超出预设时追加为自定义选项）
      if (h.indexOf('字段类型') >= 0) {
        const opts = ['单行文本', '多行文本', '数值', '日期', '单选', '复选', '下拉单选', '下拉复选', '关联表单', '成员', '部门', '附件', '图片', '地址', '流水号'];
        if (val && opts.indexOf(val) < 0) opts.push(val);
        return '<td class="' + colCls + '"><select data-kind="fieldtype" data-gi="' + gi + '" data-fi="' + fi + '" data-ti="' + ti + '" data-row="' + ri + '" data-col="' + ci + '">' +
          opts.map(o => '<option value="' + o + '"' + (String(val) === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></td>';
      }
      return '<td class="' + colCls + '" contenteditable="true" data-tab="fields" data-gi="' + gi + '" data-fi="' + fi + '" data-ti="' + ti + '" data-row="' + ri + '" data-col="' + ci + '">' + escapeHtml(val || '') + '</td>';
    }
    // 绑定字段状态/必填下拉的 change → 更新数据 + 自动保存
    function bindFieldSelects() {
      const wrap = document.getElementById('fieldsPanelWrap');
      if (!wrap) return;
      wrap.querySelectorAll('select[data-kind]').forEach(function(sel) {
        sel.addEventListener('change', function() {
          const d = parseFieldsData();
          const tb = d.groups[parseInt(sel.dataset.gi, 10)].forms[parseInt(sel.dataset.fi, 10)].tables[parseInt(sel.dataset.ti, 10)];
          tb.rows[parseInt(sel.dataset.row, 10)][parseInt(sel.dataset.col, 10)] = sel.value;
          autoSave('fields');
        });
      });
    }
    // 自动保存：编辑后无需手动点按钮，自动回写 md 源文件
    let autoSaveTimer = null;
    function autoSave(tab) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(function() { saveManifestFile(tab); }, 500);
    }
    function addFieldRow(gi, fi, ti) {
      const d = parseFieldsData();
      const tb = d.groups[gi].forms[fi].tables[ti];
      // 新增行给下拉列填默认值（字段类型=单行文本、字段状态=普通、是否必填=否），其余列留空
      const newRow = tb.header.map(h => {
        const hs = String(h || '');
        if (hs.indexOf('字段类型') >= 0) return '单行文本';
        if (hs.indexOf('字段状态') >= 0) return '普通';
        if (hs.indexOf('是否必填') >= 0) return '否';
        return '';
      });
      tb.rows.push(newRow);
      renderFieldsPanel();
      autoSave('fields');
    }
    function deleteFieldRow(gi, fi, ti, ri) {
      const d = parseFieldsData();
      d.groups[gi].forms[fi].tables[ti].rows.splice(ri, 1);
      renderFieldsPanel();
      autoSave('fields');
    }
    // 数据标题可编辑：修改后写回 dataTitle 并自动保存回写 字段清单.md
    function updateDataTitle(input) {
      if (event && event.stopPropagation) event.stopPropagation();
      const d = parseFieldsData();
      const form = d.groups[parseInt(input.dataset.gi, 10)].forms[parseInt(input.dataset.fi, 10)];
      if (form) { form.dataTitle = input.value; autoSave('fields'); }
    }

    // HTML 转义（防止字段内容破坏页面结构）
    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ===== 编辑同步：把 contenteditable 单元格的编辑写回数据源 + 自动保存 =====
    function bindManifestEdits(wrap, tab) {
      if (!wrap) return;
      wrap.querySelectorAll('td[contenteditable="true"]').forEach(function(td) {
        td.addEventListener('input', function() {
          const val = td.textContent;
          if (tab === 'groups') {
            // 写回应用分组数据源（groupsRows）
            const r = groupsRows[parseInt(td.dataset.row, 10)];
            if (r) r[td.dataset.col] = val;
          } else if (tab === 'fields') {
            const d = parseFieldsData();
            const tb = d.groups[parseInt(td.dataset.gi, 10)].forms[parseInt(td.dataset.fi, 10)].tables[parseInt(td.dataset.ti, 10)];
            tb.rows[parseInt(td.dataset.row, 10)][parseInt(td.dataset.col, 10)] = val;
          } else if (tab === 'rules') {
            const sec = rulesSections[parseInt(td.dataset.section, 10)];
            const catIdx = parseInt(td.dataset.cat, 10);
            const catOrder = (sec && sec._catOrder && sec._catOrder.length) ? sec._catOrder : ['表单内公式', '表单校验规则', '表单动作代码', '业务规则', '自动化规则'];
            const cat = catOrder[catIdx];
            if (sec && sec.cats[cat]) {
              const row = sec.cats[cat][parseInt(td.dataset.row, 10)];
              if (row) row[parseInt(td.dataset.col, 10)] = val;
            }
          }
          // 自动保存：编辑后无需手动点按钮，防抖 500ms 回写对应 md 源文件
          autoSave(tab);
        });
      });
    }

    // ===== 规则清单渲染（支持两种格式）=====
    let rulesSections = [];
    let rulesFormat = 'form'; // 'form' = 表单中心格式, 'type' = 类型中心格式
    function parseRulesData() {
      const md = window.__MANIFEST_DATA__.rulesMd || '';
      const lines = md.split('\\n');
      const sections = [];
      let current = null;

      // 检测格式：是否有 ## 一、 大类标题（类型中心格式）
      const hasTopLevel = lines.some(l => /^##\s+[一二三四五六七八九十]+、/.test(l.trim()));
      rulesFormat = hasTopLevel ? 'type' : 'form';

      if (hasTopLevel) {
        // 类型中心格式：## 一、大类 → ### 1. 子类 → 表格行
        for (const line of lines) {
          const t = line.trim();
          // 跳过文件标题 # xxx 和说明 > xxx
          if (/^#\s+/.test(t)) continue;
          if (/^>/.test(t)) continue;
          if (/^---$/.test(t)) continue;
          // ## 一、大类 → section
          const topMatch = t.match(/^##\s+[一二三四五六七八九十]+、\s*(.+)$/);
          if (topMatch) {
            current = { form: topMatch[1].trim(), cats: {}, _catOrder: [], _curCat: null };
            sections.push(current);
            continue;
          }
          // ### 1. 子类 → category
          const subMatch = t.match(/^###\s+\d+\.\s*(.+)$/);
          if (subMatch && current) {
            const catName = subMatch[1].trim();
            current.cats[catName] = [];
            current._curCat = catName;
            current._catOrder.push(catName);
            continue;
          }
          // 表格行
          if (current && current._curCat && t.startsWith('|') && !t.startsWith('|--') && !t.startsWith('| :') && !/^\|-+/.test(t)) {
            const cells = t.split('|').slice(1, -1).map(c => c.trim());
            if (cells.length && cells.some(c => c !== '' && c !== '无' && !/^-+$/.test(c))) {
              current.cats[current._curCat].push(cells);
            }
          }
        }
      } else {
        // 表单中心格式（原有逻辑）：### 1. 表单名 → #### ① 分类 → 表格行
        const catMap = ['表单内公式', '表单校验规则', '表单动作代码', '业务规则', '自动化规则'];
        for (const line of lines) {
          const t = line.trim();
          const formMatch = t.match(/^### \\d+\\.\\s*(.+)$/);
          if (formMatch) {
            current = { form: formMatch[1].trim(), cats: {}, _catOrder: [] };
            sections.push(current);
            continue;
          }
          const catMatch = t.match(/^####\\s*([①②③④⑤])\\s*(.+)$/);
          if (catMatch && current) {
            const catName = catMap[parseInt(catMatch[1], 10) - 1] || catMatch[2].trim();
            current.cats[catName] = [];
            current._curCat = catName;
            current._catOrder.push(catName);
            continue;
          }
          if (current && current._curCat && t.startsWith('|') && !t.startsWith('|--') && !t.startsWith('| :')) {
            const cells = t.split('|').slice(1, -1).map(c => c.trim());
            if (cells.some(c => c !== '' && c !== '无')) current.cats[current._curCat].push(cells);
          }
        }
      }
      return sections;
    }
    function renderRulesPanel() {
      rulesSections = parseRulesData();
      const sections = rulesSections;
      const wrap = document.getElementById('rulesPanelWrap');
      if (!sections.length) { wrap.innerHTML = '<div class="manifest-empty">规则清单为空或格式未识别</div>'; return; }
      let html = '';
      sections.forEach((sec, si) => {
        html += '<div class="manifest-section"><div class="manifest-section-title">' + sec.form + '</div>';
        // 动态分类：优先使用 _catOrder，回退到固定5类
        const catOrder = (sec._catOrder && sec._catOrder.length) ? sec._catOrder : ['表单内公式', '表单校验规则', '表单动作代码', '业务规则', '自动化规则'];
        catOrder.forEach((cat, ci) => {
          const rows = sec.cats[cat] || [];
          html += '<div class="manifest-field-group"><div class="manifest-field-group-name"><span class="badge-rule r' + ((ci % 5) + 1) + '">' + (ci + 1) + '</span>' + cat + '</div>';
          if (!rows.length) { html += '<div style="font-size:12px;color:#8c8c8c;padding:6px 0;">无</div>'; }
          else {
            html += '<table class="manifest-table"><tbody>';
            rows.forEach((r, ri) => {
              html += '<tr>';
              r.forEach((c, cidx) => { html += '<td contenteditable="true" data-tab="rules" data-section="' + si + '" data-cat="' + ci + '" data-row="' + ri + '" data-col="' + cidx + '">' + c + '</td>'; });
              html += '</tr>';
            });
            html += '</tbody></table>';
          }
          html += '</div>';
        });
        html += '</div>';
      });
      wrap.innerHTML = html;
      bindManifestEdits(wrap, 'rules');
    }

    // ===== 保存：将编辑后的数据回写 md =====
    // 由于锚点区间替换的完整实现需要服务端配合，这里采用「序列化为新 md 表格区间」策略：
    // 前端把编辑结果按原文件结构重建为完整 md 文本，POST /local-files 交由服务端做锚点替换。
    function buildUpdatedMd(tab) {
      if (tab === 'groups') {
        // 【v2.27.0 修复】完整重建整个应用分组.md，避免旧正则只替换首个表格导致旧表格残留重复。
        // 用"分组表头首次出现位置"切分，兼容 \\r\\n / \\n 混合换行，不依赖分隔线，彻底去重。
        const md = window.__MANIFEST_DATA__.groupsMd;
        const anchor = '| 序号 | 分组名称 | 包含表单 |';
        const idx = md.indexOf(anchor);
        // 生成新分组表格（groupsRows 每行一条）
        const table = '| 序号 | 分组名称 | 包含表单 |\\n|:---:|---------|---------|\\n' +
          groupsRows.map((g, i) => '| ' + (i + 1) + ' | ' + g.name + ' | ' + g.forms + ' |').join('\\n');
        if (idx < 0) {
          // 无现成分组表格：在文件末尾追加
          return md.replace(/\\s+$/, '') + '\\n\\n' + table;
        }
        // head = 分组表格之前的内容（# 标题 + > 版本/说明 + 分隔线）
        const head = md.substring(0, idx).replace(/\\s+$/, '');
        // tail = 表格区之后的内容（从 "## " 标题开始，保留使用说明/修改示例）
        const tailMatch = md.substring(idx + anchor.length).match(/^#{1,2} [\\s\\S]*$/m);
        const tail = tailMatch ? tailMatch[0] : '';
        // 组装：文件头 + 新表格 + 尾部说明
        return head + '\\n\\n' + table + (tail ? '\\n\\n' + tail : '');
      }
      if (tab === 'fields') {
        // 完整重建字段清单：保留头部说明 + 尾部链接，重建所有分组/表单/主表/子表
        const data = parseFieldsData();
        if (!data.groups.length) return window.__MANIFEST_DATA__.fieldsMd;
        // 文件头部（# 标题 + 使用说明）
        let md = data.head;
        if (md && md.charAt(md.length - 1) !== '\\n') md += '\\n';
        md += '\\n---\\n\\n';
        // 重建主体
        const chineseNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        data.groups.forEach((g, gi) => {
          // 剥离 g.name 已有的序号前缀，避免保存时重复（"一、一、基础信息"）
          const cleanName = String(g.name || '').replace(/^(?:[一二三四五六七八九十]+[、.．]\\s*)+/, '');
          md += '## ' + (chineseNum[gi] || (gi + 1)) + '、' + cleanName + '\\n\\n';
          g.forms.forEach((form, fi) => {
            const subSeq = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][fi] || (fi + 1);
            md += '### (' + subSeq + ') ' + form.name + '「' + form.formType + '」\\n\\n';
            if (form.dataTitle) md += '**数据标题：' + form.dataTitle + '**\\n\\n';
            form.tables.forEach(tb => {
              if (tb.title) md += '**' + tb.title + '**\\n\\n';
              if (tb.header.length) {
                md += '| ' + tb.header.join(' | ') + ' |\\n';
                md += '|' + tb.header.map(() => '---').join('|') + '|\\n';
                tb.rows.forEach(r => {
                  while (r.length < tb.header.length) r.push('');
                  md += '| ' + r.join(' | ') + ' |\\n';
                });
              }
              md += '\\n';
            });
          });
        });
        // 尾部链接
        const linkIdx = window.__MANIFEST_DATA__.fieldsMd.indexOf('**文件链接**');
        if (linkIdx >= 0) md += '---\\n\\n' + window.__MANIFEST_DATA__.fieldsMd.slice(linkIdx).replace(/^\\n+/, '');
        return md;
      }
      if (tab === 'rules') {
        // 整体重建规则清单：保留文件头部（使用说明）与尾部链接，中间按 sections 重建
        const original = window.__MANIFEST_DATA__.rulesMd;
        const sections = rulesSections.length ? rulesSections : parseRulesData();
        if (!sections.length) return original;
        // 截取头部：从文件开头到第一个 "## " 分级标题之前（保留 # 标题与使用说明）
        const lines = original.split('\\n');
        let headEnd = 0;
        for (let i = 0; i < lines.length; i++) {
          if (/^#{1,2}\\s+/.test(lines[i]) && i > 0) { headEnd = i; break; }
        }
        const head = headEnd > 0 ? lines.slice(0, headEnd).join('\\n') : original;
        // 尾部链接：查找 "**文件链接**" 行及其后的内容
        const linkIdx = original.indexOf('**文件链接**');
        const tail = linkIdx >= 0 ? '\\n\\n' + original.slice(linkIdx).replace(/^\\n+/, '') : '';
        // 重建主体
        let body = '';
        const chineseNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        sections.forEach((sec, si) => {
          body += '## ' + (chineseNum[si] || (si + 1)) + '、' + sec.form + '\\n\\n';
          // 动态分类：优先使用 _catOrder，回退到固定5类
          const catOrder = (sec._catOrder && sec._catOrder.length) ? sec._catOrder : ['表单内公式', '表单校验规则', '表单动作代码', '业务规则', '自动化规则'];
          catOrder.forEach((cat, ci) => {
            if (rulesFormat === 'type') {
              // 类型中心格式：### 1. 子类
              body += '### ' + (ci + 1) + '. ' + cat + '\\n\\n';
            } else {
              // 表单中心格式：#### ① 分类
              body += '#### ' + ['①', '②', '③', '④', '⑤'][ci] + ' ' + cat + '\\n\\n';
            }
            const rows = sec.cats[cat] || [];
            if (!rows.length) { body += '无\\n\\n'; }
            else {
              const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 2);
              body += '| ' + Array(maxCols).fill('字段').join(' | ') + ' |\\n';
              body += '|' + Array(maxCols).fill('---').join('|') + '|\\n';
              rows.forEach(r => {
                while (r.length < maxCols) r.push('');
                body += '| ' + r.join(' | ') + ' |\\n';
              });
              body += '\\n';
            }
          });
          body += '---\\n\\n';
        });
        return head + '\\n\\n' + body + tail;
      }
      return '';
    }

    // 应用分组 → 字段清单 联动：保存应用分组后，把调整后的分组归属同步到字段清单的分组结构
    // （字段清单.md 的"## 分组 → ### 表单"按新的应用分组归属重建，保证两个文件一致）
    function syncFieldsGroups() {
      const data = parseFieldsData();
      if (!data.groups.length) return;
      // 拍平字段清单所有表单，按表单名索引（保留各自字段表格数据）
      const formMap = {};
      data.groups.forEach(g => (g.forms || []).forEach(f => { if (f.name) formMap[f.name] = f; }));
      // 按新的应用分组重建分组归属（保证每个表单只归属到首个出现的分组）
      const newGroups = [];
      const seen = new Set(); // 已归属过的表单名，后续分组自动跳过，避免同一表单重复出现在多个分组
      groupsRows.forEach(g => {
        const name = String(g.name || '').trim();
        if (!name) return;
        const forms = String(g.forms || '').split(/[、,，\\s/]+/).map(s => s.trim()).filter(Boolean)
          .filter(n => {
            if (!formMap[n] || seen.has(n)) return false; // 表单不存在或已被其他分组占用
            seen.add(n);
            return true;
          })
          .map(n => formMap[n]);
        newGroups.push({ name: name, forms: forms });
      });
      // 应用分组未引用的表单（字段清单里有但没分组的）→ 追加到"未分组"，避免数据丢失
      const orphans = [];
      Object.keys(formMap).forEach(n => { if (!seen.has(n)) orphans.push(formMap[n]); });
      if (orphans.length) newGroups.push({ name: '未分组', forms: orphans });
      // 更新缓存分组结构，供 buildUpdatedMd('fields') 重建
      data.groups = newGroups;
      fieldsCache = data;
    }

    function saveManifestFile(tab) {
      setStatus('保存中...', 'idle');
      const relMap = { groups: '应用分组.md', fields: '字段清单.md', rules: '规则清单.md' };
      // 先 GET 获取当前文件 mtime，做并发冲突检测；GET 失败（同步服务未启动）则直接报错
      fetch(SYNC_SERVICE + '/local-files?file=' + encodeURIComponent(buildFileParam(relMap[tab])) + buildProjectDirQuery())
      .then(res => res.json())
      .then(read => {
        if (!read.success) { setStatus('无法读取当前文件: ' + (read.error || ''), 'error'); return; }
        const body = {
          file: buildFileParam(relMap[tab]),
          content: buildUpdatedMd(tab),
          expectedMtime: read.mtime,
          projectDir: getProjectDirName()
        };
        return fetch(SYNC_SERVICE + '/local-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      })
      .then(res => res ? res.json() : null)
      .then(data => {
        if (!data) return;
        if (data.success) {
          setStatus('已保存 ' + relMap[tab], 'success');
          // 保存成功后刷新内嵌快照，避免重复保存时基于旧数据
          window.__MANIFEST_DATA__[ { groups: 'groupsMd', fields: 'fieldsMd', rules: 'rulesMd' }[tab] ] = buildUpdatedMd(tab);
          if (tab === 'rules') { rulesSections = []; parseRulesData._cache = null; }
          // 应用分组保存成功后，联动同步字段清单的分组归属（保证两个 md 一致）
          if (tab === 'groups') {
            syncFieldsGroups();
            window.__MANIFEST_DATA__.fieldsMd = buildUpdatedMd('fields');
            saveManifestFile('fields');
            renderFieldsPanel();
          }
        } else {
          setStatus('保存失败: ' + (data.error || ''), 'error');
        }
      })
      .catch(() => setStatus('保存失败：同步服务未启动', 'error'));
    }

    function openRawView(tab) {
      const map = { groups: '应用分组.md', fields: '字段清单.md', rules: '规则清单.md' };
      const md = { groups: window.__MANIFEST_DATA__.groupsMd, fields: window.__MANIFEST_DATA__.fieldsMd, rules: window.__MANIFEST_DATA__.rulesMd }[tab];
      document.getElementById('rawModalTitle').textContent = map[tab] + '（只读）';
      document.getElementById('rawModalContent').value = md;
      document.getElementById('rawModal').style.display = 'flex';
    }

    // ===== 初始化 =====
    document.addEventListener('DOMContentLoaded', function() {
      // 初始化左侧菜单（复用 app.js 的 renderMenu）
      if (typeof FormConfig !== 'undefined' && typeof renderMenu === 'function') {
        FormConfig.loadFormListFromConfig().then(function() {
          renderMenu('menuItems', '');
          setTimeout(function() {
            document.querySelectorAll('.menu-item').forEach(function(item) {
              if (item.dataset.form === '__manifest__') { item.classList.add('active'); }
            });
          }, 100);
        });
      }
      renderGroupsPanel();
      renderFieldsPanel();
      renderRulesPanel();
      // 每次打开/刷新页面都静默从本地重新读取三个 md（本地 .md 是唯一事实源），
      // 保证编辑后刷新页面能看到最新已保存数据；同步服务不可用时静默回退内嵌快照，不打扰用户。
      // 兼容旧的 ?refresh=1 参数。
      refreshManifestData(window.location.search.indexOf('refresh=1') < 0);
    });
  </script>
  <script src="../js/app.js"></script>
  <script src="../js/form-config.js"></script>
</body>
</html>`;
}

/**
 * 生成表单配置加载器JS
 * @param {Array} allForms - 所有表单列表
 * @returns {string} JS代码
 */
function generateFormConfigJs(allForms, outputDir) {
  // 生成表单路径映射
  // v2.8.0: 支持分组目录，如果表单有module字段，路径为"分组名/表单目录"
  // v2.11.0: 分组目录加「分组」后缀，与表单目录结构对齐
  const formPathsEntries = allForms.map(form => {
    const formDir = form.name + (form.type === 'process' ? '「流程表单」' : '「普通表单」');
    // 如果有分组信息，构建包含分组的路径（分组目录加「分组」后缀）
    // v2.11.1: 支持多层次分组（form.module 为全路径如"业务规则/1.主表操作主表"）
    const groupDir = form.module ? form.module.split('/').map(p => `${p}「分组」`).join('/') : '';
    const fullPath = groupDir ? `${groupDir}/${formDir}` : formDir;
    // 只存储表单目录名，路径前缀由 getBasePath() 动态提供
    return `    '${form.name}': '${fullPath}'`;
  }).join(',\n');

  // 生成表单UUID映射（如果表单有uuid字段）
  const formUuidEntries = allForms.map(form => {
    const uuid = form.uuid || '';
    return `    '${form.name}': '${uuid}'`;
  }).join(',\n');

  // 生成静态配置数据（兜底配置）
  const staticConfigData = generateStaticConfigData(allForms, outputDir);

  return `// 表单配置加载器
// 根据表单名称加载对应的组件ID清单

const FormConfig = {
  // 静态配置数据（兜底配置，当动态加载失败时使用）
  staticConfigData: ${JSON.stringify(staticConfigData, null, 2)},

  // 表单路径映射（相对于 templates/form.html 的相对路径）
  // form.html 位于: 原型页面/templates/form.html
  // 需要向上退 3 级到项目根目录，再进入分组表单目录
  formPaths: {
${formPathsEntries}
  },

  // 表单UUID缓存（动态加载后缓存）
  uuidCache: {},

  // 获取表单UUID
  // HTTP协议下优先动态加载，file://协议下使用静态配置
  async getFormUuid(formName) {
    // 1. HTTP协议下优先动态加载（确保获取最新UUID）
    if (!this.isFileProtocol()) {
      // 先检查缓存
      if (this.uuidCache[formName]) {
        return this.uuidCache[formName];
      }

      try {
        const uuid = await this.loadFormUuidFromConfig(formName);
        if (uuid) {
          this.uuidCache[formName] = uuid;
          return uuid;
        }
      } catch (e) {
        console.warn('[FormConfig] 动态加载UUID失败:', e);
      }
    }

    // 2. file:// 协议下或动态加载失败时，使用静态配置
    const staticConfig = this.staticConfigData[formName];
    if (staticConfig && staticConfig.formUuid) {
      return staticConfig.formUuid;
    }

    return '';
  },

  // 从系统配置清单.md动态加载表单UUID
  async loadFormUuidFromConfig(formName) {
    const configUrl = this.getBasePath() + '%E7%B3%BB%E7%BB%9F%E9%85%8D%E7%BD%AE%E6%B8%85%E5%8D%95.md';

    console.log('[FormConfig] 正在加载UUID配置: ' + configUrl);

    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error('无法加载系统配置清单: ' + response.status);
    }

    const markdown = await response.text();

    // 解析系统配置清单，查找表单UUID
    // 匹配格式: |  1  | 机构信息「普通表单」   | FORM-67AA628B3F6C49D8A4BE4DCE3B2FAE79QCKX-999 |
    const lines = markdown.split('\\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('|') && trimmedLine.includes('「')) {
        const cells = trimmedLine.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 3) {
          const nameMatch = cells[1].match(/^(.+?)「/);
          if (nameMatch && nameMatch[1] === formName) {
            const uuid = cells[2];
            console.log('[FormConfig] 找到UUID: ' + formName + ' = ' + uuid);
            return uuid;
          }
        }
      }
    }

    console.warn('[FormConfig] 未在系统配置清单中找到UUID: ' + formName);
    return '';
  },

  // 从系统配置清单动态加载表单列表并更新 formPaths 和 staticConfigData
  // v2.8.0: 支持从系统配置清单读取分组信息，构建包含分组的路径
  async loadFormListFromConfig() {
    try {
      const configUrl = this.getBasePath() + '%E7%B3%BB%E7%BB%9F%E9%85%8D%E7%BD%AE%E6%B8%85%E5%8D%95.md';
      const response = await fetch(configUrl);
      if (!response.ok) {
        console.warn('[FormConfig] 无法加载系统配置清单');
        return;
      }

      const markdown = await response.text();
      const forms = [];
      const lines = markdown.split('\\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|') && trimmed.includes('「')) {
          const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
          // 解析分组信息（如果有5列，第5列是所属分组）
          if (cells.length >= 3 && /^\\d+$/.test(cells[0])) {
            const nameMatch = cells[1].match(/^(.+?)「(.+?)」/);
            if (nameMatch) {
              // 第5列所属分组：'-' 是 markdown 无值占位符，归一化为空字符串
              const rawGroup = cells.length >= 5 ? cells[4].trim() : '';
              const group = (rawGroup && rawGroup !== '-' && rawGroup !== '—') ? rawGroup : '';
              forms.push({
                name: nameMatch[1].trim(),
                type: nameMatch[2].trim(),
                uuid: cells[2].trim(),
                group: group  // 保存分组信息
              });
            }
          }
        }
      }

      if (forms.length === 0) return;

      // 构建当前有效的表单名称集合
      const validFormNames = new Set(forms.map(f => f.name));

      // 清理已不存在的表单（宜搭中已删除的）
      for (const name of Object.keys(this.formPaths)) {
        if (!validFormNames.has(name)) {
          console.log('[FormConfig] 移除已删除的表单:', name);
          delete this.formPaths[name];
        }
      }
      for (const name of Object.keys(this.staticConfigData)) {
        if (!validFormNames.has(name)) {
          delete this.staticConfigData[name];
        }
      }
      if (window.FormConfigData) {
        for (const name of Object.keys(window.FormConfigData)) {
          if (!validFormNames.has(name)) {
            delete window.FormConfigData[name];
          }
        }
      }

      // 更新 formPaths（包含分组路径）
      // v2.11.0: 分组目录加「分组」后缀，与表单目录结构对齐
      // v2.16.0: 总是用最新分组信息覆盖 formPaths，修正旧版不匹配的路径
      for (const form of forms) {
        if (form.group) {
          this.formPaths[form.name] = form.group + '「分组」/' + form.name + '「' + form.type + '」';
        } else {
          this.formPaths[form.name] = form.name + '「' + form.type + '」';
        }
      }

      // 更新 staticConfigData 中缺失的表单，并回填 group 字段（兼容旧版静态JS无group的情况）
      for (const form of forms) {
        if (!this.staticConfigData[form.name]) {
          this.staticConfigData[form.name] = {
            formName: form.name,
            formUuid: form.uuid,
            fields: []
          };
        }
        // 无论新旧条目，都用系统配置清单的 group 覆盖回填，确保运行时可读
        this.staticConfigData[form.name].group = form.group || '';
      }

      // 更新 FormConfigData
      if (window.FormConfigData) {
        for (const form of forms) {
          if (!window.FormConfigData[form.name]) {
            window.FormConfigData[form.name] = {
              formName: form.name,
              fields: []
            };
          }
          window.FormConfigData[form.name].group = form.group || '';
        }
      }

      console.log('[FormConfig] 动态加载了 ' + forms.length + ' 个表单');
    } catch (error) {
      console.warn('[FormConfig] 动态加载表单列表失败:', error);
    }
  },

  // 缓存配置
  configCache: {},



  // 获取URL参数
  getUrlParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  },

  // 获取当前表单名称
  getCurrentFormName() {
    return this.getUrlParam('form') || '';
  },

  // 根据当前页面URL计算基础路径前缀
  getBasePath() {
    const pathname = window.location.pathname;
    // 如果URL包含 /templates/，说明当前在 templates/ 目录下（list.html/form.html）
    // 需要向上3级到项目根目录
    if (pathname.includes('/templates/')) {
      return '../../../';
    }
    // 否则在原型页面根目录（index.html），只需向上2级
    return '../../';
  },

  // 获取表单路径
  getFormPath(formName) {
    const formDir = this.formPaths[formName] || formName;
    return this.getBasePath() + formDir;
  },

  // 检测是否为 file:// 协议
  isFileProtocol() {
    return window.location.protocol === 'file:';
  },

  // 从静态数据中读取表单配置
  getStaticConfig(formName) {
    const staticConfig = this.staticConfigData[formName];
    if (!staticConfig || !Array.isArray(staticConfig.fields)) {
      return null;
    }
    return {
      formName: staticConfig.formName || formName,
      fields: staticConfig.fields,
      fieldCount: staticConfig.fields.length,
      source: 'static'
    };
  },

  // 解析组件ID清单Markdown（支持新格式：主表和子表分开的表格）
  parseComponentIdList(markdown) {
    const fields = [];
    const lines = markdown.split('\\n');
    let inTable = false;
    let currentSection = 'main'; // 'main' 或 'subTable'
    let currentSubTableName = null;
    let currentSubTableIndex = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测主表字段部分
      if (line === '## 📋 主表字段') {
        currentSection = 'main';
        currentSubTableName = null;
        currentSubTableIndex = null;
        inTable = false;
        continue;
      }

      // 检测子表部分
      if (line.startsWith('## 📋 子表：')) {
        currentSection = 'subTable';
        const subTableFullName = line.replace('## 📋 子表：', '').trim();
        
        // 解析子表名称和 fieldId，格式如："分派任务详情 (tableField_mlvyrixo)" 或 "子表单 (tableField\\_molm11hq)"
        const subTableMatch = subTableFullName.match(/^(.+?)\\s*\\((tableField(?:\\\\_)?[^)]+)\\)$/);
        if (subTableMatch) {
          currentSubTableName = subTableMatch[1].trim();  // 纯子表名称
          var subTableFieldId = subTableMatch[2].trim().replace(/\\\\_/g, '_');  // 子表 fieldId，将 \_ 替换为 _
        } else {
          currentSubTableName = subTableFullName;
          var subTableFieldId = 'tableField_' + subTableFullName;
        }
        
        currentSubTableIndex = fields.length; // 使用当前字段数作为子表索引
        
        // 插入子表容器字段，让 groupFields() 能正确识别并创建 tableGroup
        fields.push({
          index: String(currentSubTableIndex + 1),
          componentType: '子表单',
          fieldName: currentSubTableName,
          fieldId: subTableFieldId
        });
        
        inTable = false;
        continue;
      }

      // 检测表格开始（兼容前后有空格的情况，如 |  序号 |）
      if (line.replace(/\\s/g, '').startsWith('|序号|')) {
        inTable = true;
        continue;
      }

      // 进入统计区后结束组件表解析（但继续解析其他子表）
      if (inTable && line.startsWith('## 📊 统计信息')) {
        inTable = false;
        continue;
      }

      // 离开表格
      if (inTable && line && !line.startsWith('|')) {
        inTable = false;
        continue;
      }

      // 跳过分隔线（兼容 |------| 和 |:---:| 两种格式）
      if (line.includes('---') && line.startsWith('|') && line.endsWith('|')) {
        continue;
      }

      // 解析表格行
      if (inTable && line.startsWith('|') && line.includes('|')) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        if (
          cells.length >= 4 &&
          cells[0] !== '序号' &&
          cells[0] !== '统计项' &&
          /^\\d+$/.test(cells[0])
        ) {
          const field = {
            index: cells[0],
            componentType: cells[1],
            fieldName: cells[2],
            fieldId: cells[3].replace(/\\\\_/g, '_')
          };

          // 如果是子表字段，使用小数点序号格式（如 "1.1"），让 groupFields 方式3识别
          if (currentSection === 'subTable' && currentSubTableName) {
            field.index = String(currentSubTableIndex + 1) + '.' + cells[0];
          }

          fields.push(field);
        }
      }
    }

    return fields;
  },

  // 布局组件列表（这些不是表单字段，需要过滤）
  layoutComponents: [
    '列布局', '列', '选项卡', '分割线', '文本', '卡片', '网格',
    'ColumnsLayout', 'Column', 'Tab', 'Divider', 'Text', 'Card', 'Grid',
    'ColumnContainer', 'GroupContainer'
  ],

  // 根据组件类型获取输入类型
  getInputType(componentType) {
    const typeMap = {
      'TextField': 'text',
      'NumberField': 'number',
      'SerialNumberField': 'text',
      'SelectField': 'select',
      'TextareaField': 'textarea',
      'DateField': 'date',
      'EmployeeField': 'text',
      'RateField': 'number',
      'RadioField': 'text',
      'CheckboxField': 'text',
      'AttachmentField': 'file',
      'ImageField': 'file',
      '单行文本': 'text',
      '多行文本': 'textarea',
      '数值': 'number',
      '日期': 'date',
      '日期时间': 'date',
      '单选': 'radio',
      '复选': 'checkbox',
      '下拉单选': 'select',
      '下拉多选': 'select',
      '成员': 'employee',
      '部门': 'employee',
      '附件': 'file',
      '图片': 'file',
      '流水号': 'text',
      '评分': 'number',
      '地址': 'text',
      '定位': 'text',
      '关联表单': 'text',
      '级联选择': 'select',
      '按钮': 'button',
      'Button': 'button'
    };
    return typeMap[componentType] || 'text';
  },

  // 判断是否为布局组件
  isLayoutComponent(componentType) {
    return this.layoutComponents.indexOf(componentType) !== -1;
  },

  // 判断是否为子表组件
  isTableComponent(componentType) {
    return componentType === '子表单' || componentType === 'TableField';
  },

  // 判断是否为子表内字段（通过 isSubTableField 标记或序号包含小数点）
  isSubTableField(field) {
    return field.isSubTableField || String(field.index).indexOf('.') !== -1;
  },

  // 对字段进行分组：主表字段、子表组
  groupFields(fields) {
    const mainFields = [];
    const tableGroups = {};
    let currentTableIndex = null;
    let currentSubTableName = null;

    for (const field of fields) {
      if (this.isLayoutComponent(field.componentType)) {
        continue;
      }

      // 方式1：通过子表组件（TableField/子表单）识别子表
      if (this.isTableComponent(field.componentType)) {
        currentTableIndex = field.index;
        currentSubTableName = field.fieldName;
        tableGroups[currentTableIndex] = {
          tableField: field,
          children: [],
          name: currentSubTableName
        };
        continue;
      }

      // 方式2：通过 isSubTableField 标记识别子表字段（适用于组件ID清单中无子表组件的情况）
      if (field.isSubTableField && field.subTableName) {
        const tableName = field.subTableName;
        if (!tableGroups[tableName]) {
          tableGroups[tableName] = {
            tableField: {
              index: tableName,
              fieldName: tableName,
              componentType: '子表单',
              fieldId: 'tableField_' + tableName
            },
            children: [],
            name: tableName
          };
        }
        tableGroups[tableName].children.push(field);
        continue;
      }

      // 方式3：通过序号包含小数点识别子表字段
      if (currentTableIndex && this.isSubTableField(field)) {
        tableGroups[currentTableIndex].children.push(field);
        continue;
      }

      mainFields.push(field);
      currentTableIndex = null;
      currentSubTableName = null;
    }

    return { mainFields, tableGroups };
  },

  // 生成单个字段输入框HTML
  generateFieldInputHtml(field) {
    const inputType = this.getInputType(field.componentType);

    switch (inputType) {
      case 'select':
        return '<select class="select" id="' + field.fieldId + '"><option value="">请选择</option></select>';
      case 'textarea':
        return '<textarea id="' + field.fieldId + '" placeholder="请输入' + field.fieldName + '"></textarea>';
      case 'file':
        const accept = field.componentType === 'ImageField' || field.componentType === '图片' ? 'accept="image/*"' : '';
        return '<input type="file" class="input" id="' + field.fieldId + '" ' + accept + '>';
      case 'radio':
        return '<div class="multi-select"><label class="checkbox-label"><input type="radio" name="' + field.fieldId + '"> 选项1</label><label class="checkbox-label"><input type="radio" name="' + field.fieldId + '"> 选项2</label></div>';
      case 'checkbox':
        return '<div class="multi-select"><label class="checkbox-label"><input type="checkbox"> 选项1</label><label class="checkbox-label"><input type="checkbox"> 选项2</label></div>';
      case 'employee':
        return '<input type="text" class="input" id="' + field.fieldId + '" readonly placeholder="点击选择人员">';
      case 'number':
        return '<input type="number" class="input" id="' + field.fieldId + '" placeholder="请输入' + field.fieldName + '">';
      case 'date':
        return '<input type="date" class="input" id="' + field.fieldId + '">';
      case 'button':
        return '<button type="button" class="input btn-action" id="' + field.fieldId + '" style="padding:6px 16px;background:#1890ff;color:#fff;border:1px solid #1890ff;border-radius:4px;cursor:pointer;font-size:14px;">' + field.fieldName + '</button>';
      default:
        const readonly = field.componentType === 'SerialNumberField' || field.componentType === 'EmployeeField' || field.componentType === '流水号' ? 'readonly placeholder="系统自动生成"' : 'placeholder="请输入' + field.fieldName + '"';
        const disabled = field.componentType === 'SerialNumberField' || field.componentType === 'EmployeeField' || field.componentType === '流水号' ? 'disabled' : '';
        return '<input type="' + inputType + '" class="input ' + disabled + '" id="' + field.fieldId + '" ' + readonly + '>';
    }
  },

  // 生成主表字段HTML
  generateFieldHtml(field) {
    const isFullWidth = field.componentType === 'TextareaField' || field.componentType === '多行文本';
    const gridClass = isFullWidth ? 'form-item full-width' : 'form-item';

    const inputHtml = this.generateFieldInputHtml(field);

    return '<div class="' + gridClass + '">' +
      '<label class="form-label">' + field.fieldName + ' <span class="field-id" title="点击复制组件ID">' + field.fieldId + '</span></label>' +
      '<div class="form-control">' + inputHtml + '</div>' +
      '</div>';
  },

  // 生成子表HTML
  generateSubTableHtml(group) {
    const table = group.tableField;
    const children = group.children;

    if (children.length === 0) {
      return '<div class="form-section">' +
        '<h3 class="form-section-title">' + table.fieldName + ' <span class="field-id" title="点击复制组件ID">' + table.fieldId + '</span></h3>' +
        '<p style="color: #8c8c8c; padding: 16px; text-align: center;">子表暂无字段</p>' +
        '</div>';
    }

    const headersHtml = children.map(function(f) {
      return '<th>' + f.fieldName + ' <span class="field-id" style="display:inline" title="点击复制组件ID">' + f.fieldId + '</span></th>';
    }).join('');

    const cellsHtml = children.map(function(f) {
      return '<td>' + FormConfig.generateFieldInputHtml(f) + '</td>';
    }).join('');

    return '<div class="form-section">' +
      '<h3 class="form-section-title">' + table.fieldName + ' <span class="field-id" title="点击复制组件ID">' + table.fieldId + '</span></h3>' +
      '<div class="subtable">' +
      '<div class="subtable-header">' +
      '<span style="color:#8c8c8c;font-size:13px">子表字段，支持多行数据</span>' +
      '<button class="btn-add" type="button">+ 新增一行</button>' +
      '</div>' +
      '<table class="subtable-content">' +
      '<thead><tr>' + headersHtml + '<th style="width:60px">操作</th></tr></thead>' +
      '<tbody><tr>' + cellsHtml + '<td><button class="btn-delete" type="button">删除</button></td></tr></tbody>' +
      '</table>' +
      '</div>' +
      '</div>';
  },

  // 加载表单配置
  async loadFormConfig(formName) {
    // 检查缓存
    if (this.configCache[formName]) {
      return this.configCache[formName];
    }

    // file:// 协议下优先使用静态配置（避免 CORS 跨域问题）
    if (this.isFileProtocol()) {
      const staticConfig = this.getStaticConfig(formName);
      if (staticConfig) {
        console.log('[FormConfig] 使用静态配置: ' + formName);
        this.configCache[formName] = staticConfig;
        return staticConfig;
      }
      console.warn('[FormConfig] 静态配置中未找到: ' + formName + '，尝试 fetch');
    }

    const formPath = this.getFormPath(formName);
    // 对路径进行编码，处理中文字符，但保留 ../ 等相对路径前缀
    const encodedPath = formPath.split('/').map(part => {
      // 保留相对路径符号 . 和 .. 不编码
      if (part === '.' || part === '..') return part;
      return encodeURIComponent(part);
    }).join('/');
    const configUrl = encodedPath + '/%E7%BB%84%E4%BB%B6ID%E6%B8%85%E5%8D%95.md';

    console.log('[FormConfig] 正在加载配置: ' + configUrl);

    try {
      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error('无法加载配置: ' + configUrl + ', 状态: ' + response.status);
      }
      const markdown = await response.text();
      console.log('[FormConfig] 配置内容长度: ' + markdown.length);

      const fields = this.parseComponentIdList(markdown);
      console.log('[FormConfig] 解析到 ' + fields.length + ' 个字段');

      const config = {
        formName: formName,
        fields: fields,
        fieldCount: fields.length,
        source: 'remote'
      };

      // 缓存配置
      this.configCache[formName] = config;
      return config;
    } catch (error) {
      console.warn('[FormConfig] 加载表单配置失败，回退到静态配置:', error);
      // v2.16.0: 优先回退到静态配置，而非直接返回空配置
      const staticConfig = this.getStaticConfig(formName);
      if (staticConfig && staticConfig.fields && staticConfig.fields.length > 0) {
        console.log('[FormConfig] 使用静态配置兜底: ' + formName);
        this.configCache[formName] = staticConfig;
        return staticConfig;
      }
      // 静态配置也没有，才返回空配置
      const emptyConfig = {
        formName: formName,
        fields: [],
        fieldCount: 0,
        source: 'empty'
      };
      this.configCache[formName] = emptyConfig;
      return emptyConfig;
    }
  },

  // 渲染表单
  async renderForm(containerId, formName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const config = await this.loadFormConfig(formName);
    if (!config) {
      container.innerHTML = '<p style="color: red;">加载表单配置失败</p>';
      return;
    }

    // 对字段进行分组（过滤布局组件、分离子表）
    const { mainFields, tableGroups } = this.groupFields(config.fields);

    // 生成主表字段HTML
    const mainFieldsHtml = mainFields.map(function(f) { return FormConfig.generateFieldHtml(f); }).join('');

    // 生成子表HTML
    const subTablesHtml = [];
    for (var key in tableGroups) {
      subTablesHtml.push(FormConfig.generateSubTableHtml(tableGroups[key]));
    }

    container.innerHTML = 
      '<div class="form-section" id="formSection">' +
      '<h3 class="form-section-title">基本信息</h3>' +
      '<div class="form-grid">' + mainFieldsHtml + '</div>' +
      '</div>' +
      subTablesHtml.join('');

    // 初始化复制功能
    this.initCopyFeature();

    return config;
  },

  // 显示复制成功提示（全局可调用）
  showCopyToast(message) {
    let toast = document.getElementById('copyToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'copyToast';
      toast.className = 'copy-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(function() {
      toast.classList.remove('show');
    }, 2000);
  },

  // 初始化复制功能
  initCopyFeature() {
    var self = this;

    // 复制字段ID到剪贴板
    function copyFieldId(element) {
      const fieldId = element.textContent;
      navigator.clipboard.writeText(fieldId).then(function() {
        element.classList.add('copied');
        element.setAttribute('title', '已复制!');
        self.showCopyToast('已复制');

        setTimeout(function() {
          element.classList.remove('copied');
          element.setAttribute('title', '点击复制组件ID');
        }, 2000);
      }).catch(function(err) {
        console.error('复制失败:', err);
        const textArea = document.createElement('textarea');
        textArea.value = fieldId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        element.classList.add('copied');
        self.showCopyToast('已复制');

        setTimeout(function() {
          element.classList.remove('copied');
        }, 2000);
      });
    }

    // 为所有field-id元素添加点击事件
    document.querySelectorAll('.field-id').forEach(function(el) {
      el.setAttribute('title', '点击复制组件ID');
      el.onclick = function() { copyFieldId(this); };
    });
  }
};

// 导出配置对象
window.FormConfig = FormConfig;
`;
}

/**
 * 生成表单静态配置数据对象（用于内联到 form-config.js）
 * v2.10.1: 优先从组件ID清单.md读取真实fieldId
 * @param {Array} allForms - 所有表单列表
 * @param {string} outputDir - 原型页面输出目录（用于定位组件ID清单）
 * @returns {Object} 配置数据对象
 */
function generateStaticConfigData(allForms, outputDir) {
  const typeMap = {
    '单行文本': 'TextField',
    '多行文本': 'TextareaField',
    '数值': 'NumberField',
    '日期': 'DateField',
    '日期时间': 'DateField',
    '单选': 'RadioField',
    '复选': 'CheckboxField',
    '下拉复选': 'CheckboxField',
    '下拉单选': 'SelectField',
    '关联表单': 'AssociationFormField',
    '成员': 'EmployeeField',
    '部门': 'DepartmentSelectField',
    '附件': 'AttachmentField',
    '图片': 'ImageField',
    '流水号': 'SerialNumberField',
    '子表': '子表单',
    '子表单': '子表单',
    '评分': 'RateField'
  };

  // v2.10.1: 从组件ID清单.md中提取字段（含子表字段）
  function parseComponentIdListFromFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const fields = [];
      let inTable = false;
      let currentSection = 'main';
      let currentSubTableName = null;
      let mainIndex = 0;

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (line === '## 📋 主表字段') {
          currentSection = 'main';
          currentSubTableName = null;
          inTable = false;
          continue;
        }

        if (line.startsWith('## 📋 子表：')) {
          currentSection = 'subTable';
          const subTableFullName = line.replace('## 📋 子表：', '').trim();
          const subTableMatch = subTableFullName.match(/^(.+?)\s*\((tableField(?:\\_)?[^)]+)\)$/);
          let subTableFieldId;
          if (subTableMatch) {
            currentSubTableName = subTableMatch[1].trim();
            subTableFieldId = subTableMatch[2].trim().replace(/\\_/g, '_');
          } else {
            currentSubTableName = subTableFullName;
            subTableFieldId = 'tableField_' + subTableFullName;
          }
          mainIndex++;
          fields.push({
            index: String(mainIndex),
            componentType: '子表单',
            fieldName: currentSubTableName,
            fieldId: subTableFieldId,
            isSubTableContainer: true
          });
          inTable = false;
          continue;
        }

        if (line.replace(/\s/g, '').startsWith('|序号|')) { inTable = true; continue; }
        if (inTable && line.startsWith('## ') && !line.includes('组件清单')) { break; }
        if (inTable && line && !line.startsWith('|')) { inTable = false; continue; }
        if (line.includes('---') && line.startsWith('|') && line.endsWith('|')) { continue; }
        if (inTable && line.startsWith('|') && line.includes('|')) {
          const cells = line.split('|').map(function(c) { return c.trim(); }).filter(function(c) { return c; });
          if (
            cells.length >= 4 &&
            cells[0] !== '序号' &&
            cells[0] !== '统计项' &&
            /^\d+(?:\.\d+)?$/.test(cells[0])
          ) {
            const field = {
              componentType: cells[1],
              fieldName: cells[2],
              fieldId: cells[3].replace(/\\_/g, '_')
            };

            if (currentSection === 'subTable' && currentSubTableName) {
              field.index = String(mainIndex) + '.' + cells[0];
            } else {
              mainIndex++;
              field.index = String(mainIndex);
            }

            fields.push(field);
          }
        }
      }
      return fields;
    } catch (e) {
      return null;
    }
  }

  // v2.10.1: 查找带编号的分组目录（如 02基础信息）
  function findFormDirectoryWithNumberPrefix(baseDir, moduleName) {
    if (!fs.existsSync(baseDir)) return null;

    var directPath = path.join(baseDir, moduleName);
    if (fs.existsSync(directPath)) return directPath;

    var items = fs.readdirSync(baseDir, { withFileTypes: true });
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item.isDirectory()) continue;
      var dirName = item.name;
      if (dirName === '01需求梳理' || dirName.startsWith('.') || dirName === 'temp-file') continue;
      var nameWithoutNumber = dirName.replace(/^\d+/, '');
      if (nameWithoutNumber === moduleName) {
        return path.join(baseDir, dirName);
      }
    }

    return null;
  }

  // 计算项目根目录：从原型页面/ 向上2级
  var projectRoot = '';
  if (outputDir) {
    projectRoot = path.resolve(outputDir, '..', '..');
  }

  const formConfigData = {};

  allForms.forEach(function(form) {
    var fields = [];

    // v2.10.1: 先尝试从组件ID清单.md获取完整字段数据（含子表子字段）
    // v2.11.0: 分组目录加「分组」后缀，与表单目录结构对齐
    // v2.11.1: 支持多层次分组（form.module 为全路径如"业务规则/1.主表操作主表"）
    var typeStr = form.type === 'process' ? '流程表单' : '普通表单';
    var formDirName = form.name + '「' + typeStr + '」';
    var groupDirName = form.module ? form.module.split('/').map(function(p) { return p + '「分组」'; }).join('/') : '';
    var formRelativePath = groupDirName ? path.join(groupDirName, formDirName) : formDirName;
    var componentListPath = path.resolve(projectRoot, formRelativePath, '组件ID清单.md');

    // v2.11.0: 如果带「分组」后缀的路径找不到，尝试查找不带后缀的旧分组目录（向后兼容）
    if (!fs.existsSync(componentListPath) && form.module) {
      var oldGroupDir = path.join(projectRoot, form.module);
      if (fs.existsSync(oldGroupDir)) {
        componentListPath = path.join(oldGroupDir, formDirName, '组件ID清单.md');
      }
    }

    var componentFields = parseComponentIdListFromFile(componentListPath);

    if (componentFields && componentFields.length > 0) {
      // 使用组件ID清单中的完整字段数据
      componentFields.forEach(function(f) {
        fields.push({
          index: f.index,
          componentType: f.componentType,
          fieldName: f.fieldName,
          fieldId: f.fieldId
        });
      });
    } else {
      // 降级：仅使用字段清单中的主表字段
      var mainIndex = 0;

      // 处理主表字段
      if (form.fields && Array.isArray(form.fields)) {
        form.fields.forEach(function(field) {
          // 跳过统计行
          if (field.name === '主表字段' || field.name === '子表字段') return;
          mainIndex++;
          var componentType = typeMap[field.type] || 'TextField';
          fields.push({
            index: String(mainIndex),
            componentType: componentType,
            fieldName: field.name,
            fieldId: field.id || ('field_' + field.name + '_' + String(mainIndex).padStart(2, '0'))
          });
        });
      }

      // 处理子表及其字段
      if (form.subTables && Array.isArray(form.subTables)) {
        form.subTables.forEach(function(subTable) {
          mainIndex++;
          var tableDisplayIndex = mainIndex;
          fields.push({
            index: String(tableDisplayIndex),
            componentType: '子表单',
            fieldName: subTable.name,
            fieldId: subTable.fieldId || ('tableField_' + subTable.name)
          });

          if (subTable.fields && Array.isArray(subTable.fields)) {
            subTable.fields.forEach(function(field, subIndex) {
              var componentType = typeMap[field.type] || 'TextField';
              fields.push({
                index: String(tableDisplayIndex) + '.' + String(subIndex + 1),
                componentType: componentType,
                fieldName: field.name,
                fieldId: field.id || ('field_' + field.name + '_' + String(tableDisplayIndex) + '.' + String(subIndex + 1))
              });
            });
          }
        });
      }
    }

    if (fields.length > 0) {
      formConfigData[form.name] = {
        formName: form.name,
        formUuid: form.uuid || '',
        fields: fields,
        group: (form.module && form.module !== '-' && form.module !== '—') ? form.module : ''
      };
    }
  });

  return formConfigData;
}

/**
 * 生成表单静态配置数据 JS 文件
 * 用于 file:// 协议下避免 CORS 跨域问题
 * @param {Array} allForms - 所有表单列表
 * @param {string} outputDir - 原型页面输出目录（用于定位组件ID清单）
 * @returns {string} JS代码
 */
function generateFormConfigDataJs(allForms, outputDir) {
  const typeMap = {
    '单行文本': 'TextField',
    '多行文本': 'TextareaField',
    '数值': 'NumberField',
    '日期': 'DateField',
    '日期时间': 'DateField',
    '单选': 'RadioField',
    '复选': 'CheckboxField',
    '下拉复选': 'CheckboxField',
    '下拉单选': 'SelectField',
    '关联表单': 'AssociationFormField',
    '成员': 'EmployeeField',
    '部门': 'DepartmentSelectField',
    '附件': 'AttachmentField',
    '图片': 'ImageField',
    '流水号': 'SerialNumberField',
    '子表': '子表单',
    '子表单': '子表单',
    '评分': 'RateField'
  };

  // v2.10.1: 表单按分组目录组织，组件ID清单路径需包含分组前缀

  const formConfigData = {};

  // 从组件ID清单.md中提取字段（含子表字段）
  // 支持新格式：识别 ## 📋 主表字段 和 ## 📋 子表：XXX 标记
  // 自动为子表生成容器字段（componentType: '子表单'），确保运行时 groupFields() 能正确分组
  function parseComponentIdListFromFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const fields = [];
      let inTable = false;
      let currentSection = 'main';  // 'main' 或 'subTable'
      let currentSubTableName = null;
      let mainIndex = 0;           // 主表全局序号

      for (const rawLine of lines) {
        const line = rawLine.trim();

        // 检测主表字段部分
        if (line === '## 📋 主表字段') {
          currentSection = 'main';
          currentSubTableName = null;
          inTable = false;
          continue;
        }

        // 检测子表部分 → 插入子表容器字段
        if (line.startsWith('## 📋 子表：')) {
          currentSection = 'subTable';
          const subTableFullName = line.replace('## 📋 子表：', '').trim();
          
          // 解析子表名称和 fieldId，格式如："分派任务详情 (tableField_mlvyrixo)" 或 "子表单 (tableField\\_molm11hq)"
          const subTableMatch = subTableFullName.match(/^(.+?)\s*\((tableField(?:\\_)?[^)]+)\)$/);
          let subTableFieldId;
          if (subTableMatch) {
            currentSubTableName = subTableMatch[1].trim();  // 纯子表名称
            subTableFieldId = subTableMatch[2].trim().replace(/\\_/g, '_');  // fieldId，将 \_ 替换为 _
          } else {
            currentSubTableName = subTableFullName;
            subTableFieldId = 'tableField_' + subTableFullName;
          }
          
          mainIndex++;  // 子表容器占用一个主表序号
          
          // 关键修复：插入子表容器字段，让运行时 groupFields() 能识别并创建 tableGroup
          fields.push({
            index: String(mainIndex),
            componentType: '子表单',
            fieldName: currentSubTableName,
            fieldId: subTableFieldId,
            isSubTableContainer: true  // 标记为子表容器
          });
          
          inTable = false;
          continue;
        }

        if (line.replace(/\s/g, '').startsWith('|序号|')) { inTable = true; continue; }
        if (inTable && line.startsWith('## ') && !line.includes('组件清单')) { break; }
        if (inTable && line && !line.startsWith('|')) { inTable = false; continue; }
        if (line.includes('---') && line.startsWith('|') && line.endsWith('|')) { continue; }
        if (inTable && line.startsWith('|') && line.includes('|')) {
          const cells = line.split('|').map(function(c) { return c.trim(); }).filter(function(c) { return c; });
          if (
            cells.length >= 4 &&
            cells[0] !== '序号' &&
            cells[0] !== '统计项' &&
            /^\d+(?:\.\d+)?$/.test(cells[0])
          ) {
            const field = {
              componentType: cells[1],
              fieldName: cells[2],
              fieldId: cells[3].replace(/\\_/g, '_')
            };

            if (currentSection === 'subTable' && currentSubTableName) {
              // 子表字段：使用 "容器序号.子表内序号" 格式
              field.index = String(mainIndex) + '.' + cells[0];
            } else {
              // 主表字段
              mainIndex++;
              field.index = String(mainIndex);
            }

            fields.push(field);
          }
        }
      }
      return fields;
    } catch (e) {
      return null;
    }
  }

  // 计算项目根目录：从原型页面/ 向上2级
  var projectRoot = '';
  if (outputDir) {
    projectRoot = path.resolve(outputDir, '..', '..');
  }

  // v2.10.1: 查找带编号的分组目录（如 02基础信息）
  function findFormDirectoryWithNumberPrefix(baseDir, moduleName) {
    if (!fs.existsSync(baseDir)) return null;

    // 1. 先尝试直接路径
    var directPath = path.join(baseDir, moduleName);
    if (fs.existsSync(directPath)) return directPath;

    // 2. 查找带编号的目录（如 02基础信息）
    var items = fs.readdirSync(baseDir, { withFileTypes: true });
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item.isDirectory()) continue;
      var dirName = item.name;
      // 跳过特殊目录
      if (dirName === '01需求梳理' || dirName.startsWith('.') || dirName === 'temp-file') continue;
      // 去掉编号后匹配（如 02基础信息 → 基础信息）
      var nameWithoutNumber = dirName.replace(/^\d+/, '');
      if (nameWithoutNumber === moduleName) {
        return path.join(baseDir, dirName);
      }
    }

    return null;
  }

  allForms.forEach(function(form) {
    var fields = [];

    // 先尝试从组件ID清单.md获取完整字段数据（含子表子字段）
    // v2.11.0: 分组目录加「分组」后缀，与表单目录结构对齐
    // v2.11.1: 支持多层次分组（form.module 为全路径如"业务规则/1.主表操作主表"）
    var typeStr = form.type === 'process' ? '流程表单' : '普通表单';
    var formDirName = form.name + '「' + typeStr + '」';
    var groupDirName = form.module ? form.module.split('/').map(function(p) { return p + '「分组」'; }).join('/') : '';
    var formRelativePath = groupDirName ? path.join(groupDirName, formDirName) : formDirName;
    var componentListPath = path.resolve(projectRoot, formRelativePath, '组件ID清单.md');

    // v2.11.0: 如果带「分组」后缀的路径找不到，尝试查找不带后缀的旧分组目录（向后兼容）
    if (!fs.existsSync(componentListPath) && form.module) {
      var oldGroupDir = path.join(projectRoot, form.module);
      if (fs.existsSync(oldGroupDir)) {
        componentListPath = path.join(oldGroupDir, formDirName, '组件ID清单.md');
      }
    }

    var componentFields = parseComponentIdListFromFile(componentListPath);

    if (componentFields && componentFields.length > 0) {
      // 使用组件ID清单中的完整字段数据
      componentFields.forEach(function(f) {
        fields.push({
          index: f.index,
          componentType: f.componentType,
          fieldName: f.fieldName,
          fieldId: f.fieldId
        });
      });
    } else {
      // 降级：仅使用字段清单中的主表字段
      var mainIndex = 0;

      var hasSubTableSections = form.subTables && Array.isArray(form.subTables) && form.subTables.length > 0;

      if (form.fields && Array.isArray(form.fields)) {
        form.fields.forEach(function(field) {
          // 跳过统计行（主表字段/子表字段）
          if (field.name === '主表字段' || field.name === '子表字段') return;
          // 若字段清单已提供“子表：xxx”结构，则主表中的“子表单”父行交给 subTables 统一处理，避免重复
          if (
            hasSubTableSections &&
            (field.type === '子表单' || field.type === '子表' || field.type === 'TableField')
          ) {
            return;
          }
          mainIndex++;
          var componentType = typeMap[field.type] || 'TextField';
          fields.push({
            index: String(mainIndex),
            componentType: componentType,
            fieldName: field.name,
            fieldId: field.id || ('field_' + field.name + '_' + String(mainIndex).padStart(2, '0'))
          });
        });
      }

      // 处理子表及其字段（从字段清单中的子表定义）
      if (form.subTables && Array.isArray(form.subTables)) {
        form.subTables.forEach(function(subTable) {
          mainIndex++;
          var tableDisplayIndex = mainIndex;
          fields.push({
            index: String(tableDisplayIndex),
            componentType: '子表单',
            fieldName: subTable.name,
            fieldId: subTable.fieldId || ('tableField_' + subTable.name)
          });

          if (subTable.fields && Array.isArray(subTable.fields)) {
            subTable.fields.forEach(function(field, subIndex) {
              var componentType = typeMap[field.type] || 'TextField';
              fields.push({
                index: String(tableDisplayIndex) + '.' + String(subIndex + 1),
                componentType: componentType,
                fieldName: field.name,
                fieldId: field.id || ('field_' + field.name + '_' + String(tableDisplayIndex) + '.' + String(subIndex + 1))
              });
            });
          }
        });
      }
    }

    if (fields.length > 0) {
      formConfigData[form.name] = {
        formName: form.name,
        formUuid: form.uuid || '',
        fields: fields,
        group: (form.module && form.module !== '-' && form.module !== '—') ? form.module : ''
      };
    }
  });

  return `// 表单静态配置数据（自动生成）
// 用于 file:// 协议下避免 CORS 跨域问题

window.FormConfigData = ${JSON.stringify(formConfigData, null, 2)};
`;
}

/**
 * 生成静态资源文件（CSS和JS）
 * @param {string} outputDir - 输出目录
 */
function generateStaticFiles(outputDir) {
  const cssDir = path.join(outputDir, 'css');
  const jsDir = path.join(outputDir, 'js');

  // 创建目录
  if (!fs.existsSync(cssDir)) {
    fs.mkdirSync(cssDir, { recursive: true });
  }
  if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir, { recursive: true });
  }

  // CSS文件内容 - 宜搭风格样式（包含copy-toast样式）
  const cssContent = `/* 宜搭风格样式 - 高度还原 */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; font-size: 14px; color: #262626; background: #f0f2f5; line-height: 1.5715; }

/* 顶部导航栏 - 宜搭灰色风格 */
.header { height: 48px; background: #fff; border-bottom: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; position: fixed; top: 0; left: 0; right: 0; z-index: 1000; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.header-left { display: flex; align-items: center; gap: 12px; }
.logo { font-size: 16px; font-weight: 500; color: #262626; display: flex; align-items: center; gap: 8px; }
.logo::before { content: '◆'; color: #1890ff; font-size: 18px; }
.user-info { color: #595959; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.btn-portal-link { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 6px; font-size: 13px; color: #1677ff; text-decoration: none; border: 1px solid #1677ff; background: #fff; transition: all 0.2s; white-space: nowrap; }
.btn-portal-link:hover { background: #e6f4ff; border-color: #4096ff; }

/* 同步应用按钮 */
.btn-sync-app { background: #fa8c16; color: #fff; border-color: #fa8c16; font-size: 13px; padding: 3px 12px; height: 28px; }
.btn-sync-app:hover { background: #ffa940; border-color: #ffa940; }
.btn-sync-app:disabled { background: #d9d9d9; border-color: #d9d9d9; color: #999; cursor: not-allowed; }

/* 刷新本地清单按钮（本地 md → 页面，与「同步应用表单」云端→本地互补） */
.btn-sync-local { background: #13c2c2; color: #fff; border-color: #13c2c2; font-size: 13px; padding: 3px 12px; height: 28px; }
.btn-sync-local:hover { background: #36cfc9; border-color: #36cfc9; }
.btn-sync-local:disabled { background: #d9d9d9; border-color: #d9d9d9; color: #999; cursor: not-allowed; }

/* 左侧菜单栏 - 宜搭灰色风格 */
.container { display: flex; margin-top: 48px; min-height: calc(100vh - 48px); }
.sidebar { width: 208px; background: #fafafa; border-right: 1px solid #e8e8e8; position: fixed; top: 48px; bottom: 0; left: 0; overflow-y: auto; z-index: 100; }
.menu { padding: 0; }
.menu-group { margin-bottom: 4px; }
.menu-group-title { padding: 12px 16px 8px; font-size: 12px; color: #8c8c8c; text-transform: none; font-weight: 400; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 4px; }
.menu-group-title:hover { color: #595959; }
.menu-group-arrow { display: inline-block; width: 12px; font-size: 10px; color: #8c8c8c; text-align: center; }
.menu-group-icon { font-size: 14px; }
.menu-group-items { overflow: hidden; }
.menu-item { display: block; padding: 10px 16px 10px 32px; color: #595959; text-decoration: none; transition: all 0.3s; position: relative; font-size: 14px; border-left: 3px solid transparent; }
.menu-item:hover { background: #e6f7ff; color: #1890ff; }
.menu-item.active { background: #e6f7ff; color: #1890ff; border-left-color: #1890ff; }
.menu-icon { margin-right: 6px; font-size: 12px; }
.guide-menu-item { border-left: 3px solid #fa8c16; }
.guide-menu-item:hover { border-left-color: #fa8c16; }
.guide-menu-item.active { border-left-color: #fa8c16; background: #fff7e6; color: #d46b08; }
.manifest-menu-item { border-left: 3px solid #13c2c2; }
.manifest-menu-item:hover { border-left-color: #13c2c2; }
.manifest-menu-item.active { border-left-color: #13c2c2; background: #e6fffb; color: #08979c; }

/* 主内容区 */
.main-content { flex: 1; margin-left: 208px; padding: 16px; background: #f0f2f5; min-height: calc(100vh - 48px); }

/* 原型提示 */
.prototype-notice { background: #fffbe6; border: 1px solid #ffe58f; border-radius: 2px; padding: 8px 12px; margin-bottom: 16px; color: #d48806; font-size: 13px; }

/* 页面标题区 */
.page-header { background: #fff; padding: 16px 24px; border-radius: 2px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); border: 1px solid #f0f0f0; }
.page-title { font-size: 16px; font-weight: 500; margin-bottom: 16px; color: #262626; }
.page-actions { display: flex; gap: 8px; }

/* 按钮样式 - 宜搭风格 */
.btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 15px; font-size: 14px; border-radius: 2px; border: 1px solid transparent; cursor: pointer; text-decoration: none; transition: all 0.3s; height: 32px; }
.btn-primary { background: #1890ff; color: #fff; border-color: #1890ff; }
.btn-primary:hover { background: #40a9ff; border-color: #40a9ff; }
.btn-default { background: #fff; color: #262626; border-color: #d9d9d9; }
.btn-default:hover { color: #40a9ff; border-color: #40a9ff; }
.btn-sm { padding: 0 7px; height: 24px; font-size: 12px; }
.btn-sync { background: #52c41a; color: #fff; border-color: #52c41a; }
.btn-sync:hover { background: #73d13d; border-color: #73d13d; }

/* 搜索区域 */
.search-area { background: #fff; padding: 16px 24px; border-radius: 2px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); border: 1px solid #f0f0f0; }
.search-form { display: flex; gap: 12px; align-items: flex-end; }
.search-item { display: flex; flex-direction: column; gap: 4px; }
.search-item label { font-size: 13px; color: #595959; }

/* 表格样式 - 宜搭风格 */
.table-container { background: #fff; border-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); border: 1px solid #f0f0f0; }
.data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.data-table th { background: #fafafa; padding: 12px 16px; text-align: left; border-bottom: 1px solid #f0f0f0; font-weight: 500; color: #262626; }
.data-table td { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; color: #595959; }
.data-table tbody tr:hover { background: #f5f5f5; }
.data-table a { color: #1890ff; text-decoration: none; }
.data-table a:hover { text-decoration: underline; }

/* 分页 */
.pagination { display: flex; justify-content: flex-end; padding: 12px 16px; gap: 8px; align-items: center; }
.page-btn { padding: 5px 12px; border: 1px solid #d9d9d9; background: #fff; border-radius: 2px; cursor: pointer; font-size: 14px; color: #262626; }
.page-btn:hover { color: #1890ff; border-color: #1890ff; }
.page-btn.active { background: #1890ff; color: #fff; border-color: #1890ff; }
.page-btn:disabled { color: #bfbfbf; border-color: #d9d9d9; cursor: not-allowed; background: #f5f5f5; }
.pagination-info { color: #595959; font-size: 13px; }

/* 表单容器 */
.form-container { background: #fff; border-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); border: 1px solid #f0f0f0; padding: 24px; }
.form-section { margin-bottom: 24px; }
.form-section-title { font-size: 15px; font-weight: 500; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; color: #262626; }
.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 24px; }
.form-item { display: flex; flex-direction: column; gap: 6px; }
.form-item.full-width { grid-column: span 2; }
.form-label { font-size: 13px; color: #262626; font-weight: 400; }
.required { color: #ff4d4f; margin-left: 2px; }
.form-control { display: flex; align-items: center; }

/* 输入框样式 - 宜搭风格 */
.input, .select, textarea { width: 100%; height: 32px; padding: 4px 11px; border: 1px solid #d9d9d9; border-radius: 2px; font-size: 14px; color: #262626; transition: all 0.3s; background: #fff; }
.input:hover, .select:hover, textarea:hover { border-color: #40a9ff; }
.input:focus, .select:focus, textarea:focus { outline: none; border-color: #40a9ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.2); }
.input::placeholder, textarea::placeholder { color: #bfbfbf; }
.input:disabled, .input[readonly], .select:disabled, .select[readonly], textarea:disabled { background: #f5f5f5; color: #bfbfbf; cursor: not-allowed; border-color: #d9d9d9; }
textarea { height: auto; min-height: 80px; resize: vertical; padding: 8px 11px; line-height: 1.5715; }
.unit { margin-left: 8px; color: #595959; font-size: 13px; }

/* 字段提示 */
.rule-hint { font-size: 12px; color: #8c8c8c; margin-top: 4px; }
.field-hint-inline { font-size: 12px; color: #8c8c8c; font-weight: normal; margin-left: 4px; }

/* 组件ID显示样式 */
.field-id { font-size: 11px; color: #bfbfbf; font-weight: normal; margin-left: 6px; font-family: 'Courier New', monospace; background: #fafafa; padding: 1px 4px; border-radius: 2px; border: 1px solid #f0f0f0; cursor: pointer; user-select: none; transition: all 0.2s; }
.field-id:hover { background: #e6f7ff; border-color: #91d5ff; color: #1890ff; }
.field-id:active { background: #1890ff; border-color: #1890ff; color: #fff; }
.field-id.copied { background: #52c41a; border-color: #52c41a; color: #fff; }

/* 复制成功提示 */
.copy-toast { position: fixed; top: 80px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #52c41a; color: #fff; padding: 10px 24px; border-radius: 4px; font-size: 14px; box-shadow: 0 4px 12px rgba(82, 196, 26, 0.4); opacity: 0; transition: all 0.3s; z-index: 9999; pointer-events: none; }
.copy-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* 子表样式 */
.subtable { margin-top: 16px; }
.subtable-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.subtable-header h4 { font-size: 14px; font-weight: 500; color: #262626; }
.btn-add { padding: 4px 12px; background: #fff; border: 1px dashed #d9d9d9; border-radius: 2px; color: #1890ff; cursor: pointer; font-size: 13px; transition: all 0.3s; }
.btn-add:hover { border-color: #1890ff; }
.subtable-content { width: 100%; border: 1px solid #f0f0f0; border-radius: 2px; }
.subtable-content th, .subtable-content td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
.subtable-content th { background: #fafafa; font-weight: 500; color: #262626; font-size: 13px; }
.subtable-content td { font-size: 13px; }
.subtable-content .input { height: 28px; padding: 2px 8px; font-size: 13px; }
.btn-delete { padding: 2px 8px; background: #fff; border: 1px solid #ff4d4f; color: #ff4d4f; border-radius: 2px; cursor: pointer; font-size: 12px; }
.btn-delete:hover { background: #ff4d4f; color: #fff; }
.btn-select { margin-left: 8px; padding: 4px 10px; background: #fff; border: 1px solid #d9d9d9; color: #595959; border-radius: 2px; cursor: pointer; font-size: 12px; }
.btn-select:hover { color: #1890ff; border-color: #1890ff; }

/* 多选框样式 */
.multi-select { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 0; }
.checkbox-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; color: #262626; }
.checkbox-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: #1890ff; }

/* 规则说明区域 */
.rules-section { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
.rules-section h4 { font-size: 14px; font-weight: 500; color: #262626; margin-bottom: 12px; }
.rules-desc { font-size: 13px; color: #595959; margin-bottom: 12px; }
.rule-tip { background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 2px; padding: 8px 12px; margin-bottom: 8px; color: #096dd9; font-size: 13px; }
.business-rules { background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 2px; padding: 12px; }
.rule-item { margin-bottom: 8px; }
.rule-item:last-child { margin-bottom: 0; }
.rule-tag { display: inline-block; padding: 2px 6px; background: #52c41a; color: #fff; font-size: 12px; border-radius: 2px; margin-bottom: 4px; }
.rule-item p { font-size: 13px; color: #262626; margin: 0; }
.complex-rule-notice { background: #fff2f0; border: 1px solid #ffccc7; border-radius: 2px; padding: 12px; margin-top: 12px; }
.complex-rule-notice strong { font-size: 13px; color: #262626; }
.complex-rule-notice p { font-size: 13px; color: #595959; margin: 4px 0; }
.rule-detail { font-size: 12px; color: #8c8c8c; margin-top: 8px; }

/* 表单操作按钮 */
.form-actions { display: flex; justify-content: flex-start; gap: 8px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0f0f0; }

/* 同步状态 */
.sync-status { font-size: 13px; padding: 8px 12px; border-radius: 2px; display: none; }
.sync-status.loading { display: block; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; }
.sync-status.success { display: block; background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; }
.sync-status.error { display: block; background: #fff2f0; color: #ff4d4f; border: 1px solid #ffccc7; }

/* 首页统计 */
.welcome-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
.stat-card { background: #fff; padding: 20px 24px; border-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); border: 1px solid #f0f0f0; text-align: center; }
.stat-number { font-size: 28px; font-weight: 500; color: #1890ff; margin-bottom: 4px; }
.stat-label { font-size: 13px; color: #8c8c8c; }

/* 抽屉组件样式 - 宜搭风格 */
.drawer-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45); z-index: 1000; opacity: 0; visibility: hidden; transition: all 0.3s; }
.drawer-overlay.active { opacity: 1; visibility: visible; }
.drawer { position: fixed; top: 0; right: 0; width: 60%; min-width: 800px; max-width: 95vw; height: 100vh; background: #fff; z-index: 1001; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.7, 0.3, 0.1, 1); box-shadow: -4px 0 16px rgba(0,0,0,0.15); display: flex; flex-direction: column; }
.drawer.active { transform: translateX(0); }
.drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; background: #fff; height: 48px; }
.drawer-title { font-size: 16px; font-weight: 500; color: #262626; }
.drawer-close { width: 28px; height: 28px; border: none; background: transparent; font-size: 16px; color: #8c8c8c; cursor: pointer; border-radius: 2px; display: flex; align-items: center; justify-content: center; }
.drawer-close:hover { background: #f5f5f5; color: #262626; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px; background: #f0f2f5; }
.drawer-form-container { background: #fff; border-radius: 2px; padding: 20px; border: 1px solid #f0f0f0; }
@media (max-width: 768px) { .drawer { width: 100%; max-width: 100%; } }

/* 报表页面样式 */
.report-container { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 24px; }
.report-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e8e8e8; }
.report-title { font-size: 20px; font-weight: 600; color: #333; }
.report-filters { display: flex; gap: 16px; align-items: center; }
.report-filter { display: flex; align-items: center; gap: 8px; }
.report-filter label { font-size: 14px; color: #666; }
.report-filter select, .report-filter input { padding: 6px 12px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; }
.report-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
.summary-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 20px; color: #fff; }
.summary-card.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
.summary-card.warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.summary-card.info { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
.summary-value { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
.summary-label { font-size: 14px; opacity: 0.9; }
.summary-change { font-size: 12px; margin-top: 8px; opacity: 0.8; }
.report-charts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 32px; }
.chart-container { background: #f8f9fa; border-radius: 8px; padding: 20px; border: 1px solid #e8e8e8; }
.chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.chart-title { font-size: 16px; font-weight: 600; color: #333; }
.chart-placeholder { height: 200px; background: #fff; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 14px; border: 1px dashed #d9d9d9; }
.report-table-container { margin-top: 32px; }
.report-table-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #333; }

/* 数据大屏样式 */
.dashboard-container { background: #0f1419; min-height: 100vh; padding: 20px; color: #fff; }
.dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 16px 24px; background: linear-gradient(90deg, #1a237e 0%, #283593 100%); border-radius: 8px; }
.dashboard-title { font-size: 24px; font-weight: 600; display: flex; align-items: center; gap: 12px; }
.dashboard-title::before { content: '📊'; font-size: 28px; }
.dashboard-time { font-size: 14px; color: rgba(255,255,255,0.8); }
.dashboard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 20px; }
.dashboard-card { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); border-radius: 8px; padding: 20px; position: relative; overflow: hidden; }
.dashboard-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #00d2ff 0%, #3a7bd5 100%); }
.dashboard-card.success { background: linear-gradient(135deg, #134e5e 0%, #71b280 100%); }
.dashboard-card.warning { background: linear-gradient(135deg, #f12711 0%, #f5af19 100%); }
.dashboard-card.danger { background: linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%); }
.dashboard-card-value { font-size: 32px; font-weight: 600; margin-bottom: 8px; }
.dashboard-card-label { font-size: 14px; color: rgba(255,255,255,0.8); }
.dashboard-card-trend { font-size: 12px; margin-top: 12px; display: flex; align-items: center; gap: 4px; }
.dashboard-card-trend.up { color: #52c41a; }
.dashboard-card-trend.down { color: #ff4d4f; }
.dashboard-charts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px; }
.dashboard-chart { background: rgba(255,255,255,0.05); border-radius: 8px; padding: 20px; border: 1px solid rgba(255,255,255,0.1); }
.dashboard-chart-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.dashboard-chart-placeholder { height: 200px; background: rgba(0,0,0,0.2); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.5); font-size: 14px; border: 1px dashed rgba(255,255,255,0.2); }
.dashboard-lists { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.dashboard-list { background: rgba(255,255,255,0.05); border-radius: 8px; padding: 20px; border: 1px solid rgba(255,255,255,0.1); }
.dashboard-list-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.dashboard-list-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.dashboard-list-item:last-child { border-bottom: none; }
.dashboard-list-name { color: rgba(255,255,255,0.9); }
.dashboard-list-value { color: #00d2ff; font-weight: 500; }
.update-time { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 12px; text-align: right; }`;

  // JS文件内容
  const jsContent = `// 宜搭原型交互脚本
// 版本: 1.7.0

// 抽屉组件
function openDrawer(title) {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('drawer');
  const drawerTitle = document.querySelector('.drawer-title');
  
  if (overlay && drawer) {
    overlay.classList.add('active');
    drawer.classList.add('active');
    if (drawerTitle && title) {
      drawerTitle.textContent = '新增' + title;
    }
  }
}

function closeDrawer() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('drawer');
  
  if (overlay && drawer) {
    overlay.classList.remove('active');
    drawer.classList.remove('active');
  }
}

// 打开新增表单抽屉
async function openAddDrawer() {
  const formName = typeof FormConfig !== 'undefined' ? FormConfig.getCurrentFormName() : '';
  if (!formName) {
    alert('无法获取表单名称');
    return;
  }
  
  // 打开抽屉
  openDrawer(formName);
  
  // 设置抽屉标题
  const drawerTitle = document.getElementById('drawerTitle');
  if (drawerTitle) {
    drawerTitle.textContent = '新增' + formName;
  }
  
  // 渲染表单到抽屉
  const container = document.getElementById('drawerFormContainer');
  if (container && typeof FormConfig !== 'undefined') {
    container.innerHTML = '<div style="text-align:center;padding:40px;">⏳ 加载中...</div>';
    try {
      await FormConfig.renderForm('drawerFormContainer', formName);
    } catch (error) {
      console.error('渲染表单失败:', error);
      container.innerHTML = '<div style="text-align:center;padding:40px;color:#ff4d4f;">❌ 加载表单失败</div>';
    }
  }
}

// 子表操作
function addSubtableRow(tableId, formType) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  const rowCount = tbody.querySelectorAll('tr').length;
  
  // 根据表单类型生成不同的行内容
  let rowHtml = '';
  if (formType === 'purchase') {
    rowHtml = \`
      <tr>
        <td><input type="text" class="input" placeholder="选择产品" style="width: 150px;"><button class="btn-select" onclick="openSelectDialog('产品')">选择</button></td>
        <td><input type="text" class="input" readonly placeholder="自动带出" style="width: 100px;"></td>
        <td><input type="number" class="input" placeholder="0" style="width: 80px; text-align: right;" onchange="calculateSubtotal(this, 'purchase')"></td>
        <td><input type="number" class="input" placeholder="0.00" style="width: 100px; text-align: right;" onchange="calculateSubtotal(this, 'purchase')"></td>
        <td><input type="number" class="input" readonly placeholder="0.00" style="width: 100px; text-align: right; background: #f5f5f5;"></td>
        <td><button class="btn-delete" onclick="deleteSubtableRow(this, '\${tableId}')">删除</button></td>
      </tr>
    \`;
  } else if (formType === 'sale') {
    rowHtml = \`
      <tr>
        <td><input type="text" class="input" placeholder="选择产品" style="width: 150px;"><button class="btn-select" onclick="openSelectDialog('产品')">选择</button></td>
        <td><input type="text" class="input" readonly placeholder="自动带出" style="width: 100px;"></td>
        <td><input type="number" class="input" placeholder="0" style="width: 80px; text-align: right;" onchange="calculateSubtotal(this, 'sale')"></td>
        <td><input type="number" class="input" placeholder="0.00" style="width: 100px; text-align: right;" onchange="calculateSubtotal(this, 'sale')"></td>
        <td><input type="number" class="input" readonly placeholder="0.00" style="width: 100px; text-align: right; background: #f5f5f5;"></td>
        <td><button class="btn-delete" onclick="deleteSubtableRow(this, '\${tableId}')">删除</button></td>
      </tr>
    \`;
  } else {
    rowHtml = \`
      <tr>
        <td><input type="text" class="input" placeholder="输入数据" style="width: 150px;"></td>
        <td><input type="text" class="input" placeholder="输入数据" style="width: 150px;"></td>
        <td><input type="number" class="input" placeholder="0" style="width: 100px; text-align: right;"></td>
        <td><button class="btn-delete" onclick="deleteSubtableRow(this, '\${tableId}')">删除</button></td>
      </tr>
    \`;
  }
  
  tbody.insertAdjacentHTML('beforeend', rowHtml);
  updateTotal(tableId, formType);
}

function deleteSubtableRow(btn, tableId) {
  const row = btn.closest('tr');
  if (row) {
    row.remove();
    // 根据tableId推断formType
    const formType = tableId.includes('采购') || tableId.includes('入库') ? 'purchase' : 
                     tableId.includes('销售') || tableId.includes('出库') ? 'sale' : 'inventory';
    updateTotal(tableId, formType);
  }
}

function calculateSubtotal(input, formType) {
  const row = input.closest('tr');
  if (!row) return;
  
  const quantityInput = row.querySelector('td:nth-child(3) input');
  const priceInput = row.querySelector('td:nth-child(4) input');
  const subtotalInput = row.querySelector('td:nth-child(5) input');
  
  if (quantityInput && priceInput && subtotalInput) {
    const quantity = parseFloat(quantityInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const subtotal = quantity * price;
    subtotalInput.value = subtotal.toFixed(2);
  }
  
  // 更新合计
  const tableId = row.closest('table').id;
  updateTotal(tableId, formType);
}

function updateTotal(tableId, formType) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const rows = table.querySelectorAll('tbody tr');
  let total = 0;
  
  rows.forEach(row => {
    const subtotalInput = row.querySelector('td:nth-child(5) input');
    if (subtotalInput) {
      total += parseFloat(subtotalInput.value) || 0;
    }
  });
  
  const totalCell = table.querySelector('.total-amount');
  if (totalCell) {
    totalCell.textContent = total.toFixed(2);
  }
}

// 选择对话框
function openSelectDialog(type) {
  alert('选择' + type + '对话框（原型演示）');
}

// 保存草稿
function saveDraft(formId) {
  alert('草稿已保存（原型演示）');
}

// 表单验证
document.addEventListener('DOMContentLoaded', function() {
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      alert('表单提交成功（原型演示）');
    });
  });
});

// 同步服务配置
const SYNC_SERVICE_URL = 'http://localhost:3457';
const SYNC_SERVICE_CHECK_INTERVAL = 5000; // 5秒检查一次

// 加载应用信息（应用名称等）
async function loadAppInfo() {
  try {
    const response = await fetch(\`\${SYNC_SERVICE_URL}/app-info\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageUrl: window.location.href, projectDir: (typeof getProjectDirName === 'function') ? getProjectDirName() : '' }),
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.appName) {
        document.querySelectorAll('.logo').forEach(el => {
          el.textContent = data.appName;
        });
        document.title = data.appName + ' - 原型预览';
        return data;
      }
    }
  } catch (error) {
    console.log('[AppInfo] 加载应用信息失败:', error.message);
  }
  return null;
}

// 检查同步服务状态
async function checkSyncService() {
  try {
    const response = await fetch(\`\${SYNC_SERVICE_URL}/health\`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// 显示服务状态提示
function showServiceStatus(isRunning) {
  let statusEl = document.getElementById('serviceStatus');
  
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'serviceStatus';
    statusEl.style.cssText = \`
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 9998;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    \`;
    document.body.appendChild(statusEl);
  }
  
  if (isRunning) {
    statusEl.style.background = '#f6ffed';
    statusEl.style.color = '#52c41a';
    statusEl.style.border = '1px solid #b7eb8f';
    statusEl.innerHTML = '🟢 同步服务运行中';
  } else {
    statusEl.style.background = '#fff2f0';
    statusEl.style.color = '#ff4d4f';
    statusEl.style.border = '1px solid #ffccc7';
    statusEl.innerHTML = '🔴 同步服务未启动';
  }
}

// 自动检测服务状态
async function autoCheckService() {
  const isRunning = await checkSyncService();
  showServiceStatus(isRunning);
  return isRunning;
}

// 页面加载时自动检测服务状态并加载应用信息
document.addEventListener('DOMContentLoaded', function() {
  autoCheckService();
  // 每5秒检查一次服务状态
  setInterval(autoCheckService, SYNC_SERVICE_CHECK_INTERVAL);
  // 加载应用名称
  loadAppInfo();
  // 从系统配置清单动态加载表单列表（清理已删除的表单、新增新表单）
  if (typeof FormConfig !== 'undefined' && FormConfig.loadFormListFromConfig) {
    FormConfig.loadFormListFromConfig().then(() => {
      // 重新渲染菜单
      if (typeof renderIndexMenu === 'function') renderIndexMenu();
      if (typeof renderListMenu === 'function') renderListMenu();
      if (typeof renderFormMenu === 'function') renderFormMenu();
    });
  }
});

// 同步表单配置
async function syncForm(formName) {
  const btn = document.getElementById('syncBtn');
  const statusEl = document.getElementById('syncStatus');
  
  // 如果没有传入表单名称，尝试从 FormConfig 获取
  if (!formName && typeof FormConfig !== 'undefined') {
    formName = FormConfig.getCurrentFormName();
  }
  
  if (!formName) {
    alert('无法获取表单名称');
    return;
  }
  
  // 更新按钮状态
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '🔄 同步中...';
  }
  
  if (statusEl) {
    statusEl.className = 'sync-status loading';
    statusEl.innerHTML = '<span>⏳</span> 正在同步...';
  }
  
  try {
    // 先检查服务是否可用
    const isServiceRunning = await checkSyncService();
    
    if (!isServiceRunning) {
      // 服务未启动，显示启动指引
      showServiceStartGuide();
      throw new Error('同步服务未启动');
    }
    
    // 【v2.7.2 修复】传入 projectDir 确保同步到正确的应用
    // 从当前页面URL计算项目目录，避免多个应用有相同表单名时匹配错误
    // 【v3.1.1 修复】pathname 对中文目录名返回 URL 编码形式，须 decodeURIComponent
    // 还原为明文，否则同步服务 path.join 定位不到目录
    let projectDir = '';
    const pathname = window.location.pathname;
    const isFileProtocol = window.location.protocol === 'file:';
    const pathParts = pathname.split('/').filter(p => p);
    const decodePart = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
    
    if (isFileProtocol) {
      // file协议: 从后向前查找项目目录名（匹配 xxx数字 格式）
      for (let i = pathParts.length - 1; i >= 0; i--) {
        const part = pathParts[i];
        if (/^[^/]+\\d+$/.test(part)) {
          projectDir = decodePart(part);
          break;
        }
      }
    } else {
      // HTTP协议: 项目目录名是第一个路径段
      if (pathParts.length > 0) {
        projectDir = decodePart(pathParts[0]);
      }
    }
    
    // 调用本地同步服务
    const response = await fetch(\`\${SYNC_SERVICE_URL}/sync-form\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        formName: formName,
        projectDir: projectDir  // 【关键】传入项目目录，确保同步到正确的应用
      }),
      signal: AbortSignal.timeout(60000) // 60秒超时
    });
    
    const result = await response.json();
    
    if (result.success) {
      if (statusEl) {
        statusEl.className = 'sync-status success';
        statusEl.innerHTML = '<span>✅</span> 同步成功！';
      }
      
      // 延迟刷新页面
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      throw new Error(result.error || '同步失败');
    }
  } catch (error) {
    console.error('同步失败:', error);
    
    if (statusEl) {
      statusEl.className = 'sync-status error';
      statusEl.innerHTML = '<span>❌</span> 同步失败';
    }
    
    // 显示友好的错误提示
    const errorMsg = error.message || '同步失败';
    if (errorMsg.includes('LOGIN_REQUIRED') || errorMsg.includes('登录态已过期') || errorMsg.includes('登录已失效')) {
      const pd = (typeof getProjectDirName === 'function') ? getProjectDirName() : '';
      const portalUrl = pd ? \`http://127.0.0.1:8080/\${encodeURIComponent(pd)}/本地操作页面/index.html\` : 'http://127.0.0.1:8080/本地操作页面/index.html';
      alert('登录态已失效，请先打开「本地操作页面」\\n(' + portalUrl + ')\\n点击"刷新登录"按钮，登录成功后再回来同步表单字段。');
    } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('服务未启动')) {
      showServiceStartGuide();
    } else {
      alert('同步失败：' + errorMsg);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🔄 同步表单字段';
    }
  }
}

// 同步应用 - 只同步本地没有的新增表单
async function syncApp() {
  const btn = document.getElementById('syncAppBtn');
  const statusEl = document.getElementById('syncAppStatus');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '🔄 同步中...';
  }

  if (statusEl) {
    statusEl.className = 'sync-status loading';
    statusEl.innerHTML = '<span>⏳</span> 正在从宜搭获取最新表单列表...';
    statusEl.style.display = 'block';
  }

  try {
    const isServiceRunning = await checkSyncService();

    if (!isServiceRunning) {
      showServiceStartGuide();
      throw new Error('同步服务未启动');
    }

    const response = await fetch(\`\${SYNC_SERVICE_URL}/sync-app\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageUrl: window.location.href, projectDir: (typeof getProjectDirName === 'function') ? getProjectDirName() : '' }),
      signal: AbortSignal.timeout(180000)
    });

    const result = await response.json();

    if (result.success) {
      if (statusEl) {
        statusEl.className = 'sync-status success';
        if (result.newForms === 0 && (!result.deletedForms || result.deletedForms.length === 0) && !result.prototypeGenerated) {
          statusEl.innerHTML = '<span>✅</span> ' + result.message;
        } else {
          let detailHtml = '<span>✅</span> ' + result.message;
          if (result.syncedForms && result.syncedForms.length > 0) {
            detailHtml += '<br>📋 同步的表单：' + result.syncedForms.join('、');
          }
          if (result.deletedForms && result.deletedForms.length > 0) {
            detailHtml += '<br>🗑️ 删除的表单：' + result.deletedForms.join('、');
          }
          if (result.prototypeGenerated) {
            detailHtml += '<br>🖥️ 原型页面已自动生成';
          }
          if (result.failedForms && result.failedForms.length > 0) {
            detailHtml += '<br>❌ 同步失败：' + result.failedForms.map(f => f.name).join('、');
          }
          if (result.deleteFailedForms && result.deleteFailedForms.length > 0) {
            detailHtml += '<br>❌ 删除失败：' + result.deleteFailedForms.map(f => f.name).join('、');
          }
          statusEl.innerHTML = detailHtml;
        }
      }

      if (result.needRefresh) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } else {
      throw new Error(result.error || '同步失败');
    }
  } catch (error) {
    console.error('同步应用失败:', error);

    if (statusEl) {
      statusEl.className = 'sync-status error';
      statusEl.innerHTML = '<span>❌</span> 同步失败：' + (error.message || '未知错误');
      statusEl.style.display = 'block';
    }

    const errorMsg = error.message || '同步失败';
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('服务未启动')) {
      showServiceStartGuide();
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🔄 同步应用表单';
    }
  }
}

// 显示服务启动指引
function showServiceStartGuide() {
  const guideHtml = \`
    <div style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 480px;
      width: 90%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <span style="font-size: 24px; margin-right: 12px;">⚠️</span>
        <h3 style="margin: 0; font-size: 18px; color: #1f1f1f;">同步服务未启动</h3>
      </div>
      
      <p style="color: #666; margin-bottom: 16px; line-height: 1.6;">
        请点击同步按钮前，先启动同步服务。您可以选择以下任一方式：
      </p>
      
      <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <div style="font-weight: 600; margin-bottom: 8px; color: #1f1f1f;">方式一：使用 VS Code 任务（推荐）</div>
        <ol style="margin: 0; padding-left: 20px; color: #666; line-height: 1.8;">
          <li>在 VS Code 中按 <kbd style="background: #e8e8e8; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Ctrl+Shift+P</kbd></li>
          <li>输入 "任务: 运行任务"</li>
          <li>选择 "启动宜搭同步服务"</li>
        </ol>
      </div>
      
      <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <div style="font-weight: 600; margin-bottom: 8px; color: #1f1f1f;">方式二：双击运行批处理文件</div>
        <p style="margin: 0; color: #666;">
          双击运行项目目录下的 <code style="background: #e8e8e8; padding: 2px 6px; border-radius: 3px;">启动同步服务.bat</code>
        </p>
      </div>
      
      <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
        <div style="font-weight: 600; margin-bottom: 8px; color: #1f1f1f;">方式三：命令行启动</div>
        <code style="display: block; background: #1f1f1f; color: #fff; padding: 12px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; overflow-x: auto;">
node .agents/skills/form_creator/scripts/sync_server.js
        </code>
      </div>
      
      <button onclick="this.closest('.sync-guide-overlay').remove()" style="
        width: 100%;
        padding: 10px;
        background: #1890ff;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        font-weight: 500;
      ">我知道了</button>
    </div>
    <div class="sync-guide-overlay" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 9999;
    " onclick="this.remove()"></div>
  \`;
  
  const guideEl = document.createElement('div');
  guideEl.innerHTML = guideHtml;
  document.body.appendChild(guideEl);
}

// 复制到剪贴板
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('已复制到剪贴板');
    });
  } else {
    // 降级方案
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('已复制到剪贴板');
  }
}

// 显示提示消息
function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = \`
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #52c41a;
    color: #fff;
    padding: 10px 20px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  \`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

// 动态生成菜单（通用）
function renderMenu(containerId, linkPrefix) {
  const container = document.getElementById(containerId);
  if (!container || typeof FormConfig === 'undefined') return;

  // 1. 分离无分组表单和有分组表单（保序）
  const noGroupForms = [];
  const groupOrder = [];
  const groupMap = {};
  for (const name of Object.keys(FormConfig.staticConfigData)) {
    const cfg = FormConfig.staticConfigData[name];
    // 防御性检查：'-'/—' 是 markdown 无值占位符，视为无分组
    const g = (cfg && cfg.group && cfg.group !== '-' && cfg.group !== '—' && cfg.group.trim()) ? cfg.group.trim() : '';
    if (!g) {
      // 无分组表单直接放入扁平列表
      noGroupForms.push(name);
    } else {
      if (!groupMap[g]) { groupMap[g] = []; groupOrder.push(g); }
      groupMap[g].push(name);
    }
  }

  let html = '';
  // 2. 开发引导作为独立首项
  html += '<a href="' + linkPrefix + 'guide.html" class="menu-item guide-menu-item" data-form="__guide__">📋 开发引导</a>';
  // 2.1 生成清单作为开发引导之下的第二项
  html += '<a href="' + linkPrefix + 'manifest.html" class="menu-item guide-menu-item manifest-menu-item" data-form="__manifest__">📑 生成清单</a>';

  // 3. 输出无分组表单（扁平显示，带表单图标）
  for (const name of noGroupForms) {
    const encodedName = encodeURIComponent(name);
    const icon = getFormIcon(name);
    html += '<a href="' + linkPrefix + 'list.html?form=' + encodedName + '" class="menu-item" data-form="' + name + '"><span class="menu-icon">' + icon + '</span>' + name + '</a>';
  }

  // 4. 按分组输出，每组一个可折叠的 .menu-group 块（默认收起，状态用 localStorage 持久化）
  for (const g of groupOrder) {
    // 读取持久化状态（默认收起），用 try-catch 防止 file:// 协议下 localStorage 不可用
    var isExpanded = false;
    try { isExpanded = localStorage.getItem('menu_group_' + g) === '1'; } catch (e) {} // 有意忽略：浏览器环境 localStorage 可能不可用
    var arrow = isExpanded ? '▼' : '▶';
    var displayStyle = isExpanded ? '' : ' style="display: none;"';
    html += '<div class="menu-group">';
    // 用 data-group 属性传递分组名，避免 onclick 字符串转义问题
    html += '<div class="menu-group-title" onclick="toggleGroup(this)" data-group="' + g + '">';
    html += '<span class="menu-group-arrow">' + arrow + '</span>';
    html += '<span class="menu-group-icon">📁</span>';
    html += '<span class="menu-group-name">' + g + '</span>';
    html += '</div>';
    html += '<div class="menu-group-items"' + displayStyle + '>';
    for (const name of groupMap[g]) {
      const encodedName = encodeURIComponent(name);
      const icon = getFormIcon(name);
      html += '<a href="' + linkPrefix + 'list.html?form=' + encodedName + '" class="menu-item" data-form="' + name + '"><span class="menu-icon">' + icon + '</span>' + name + '</a>';
    }
    html += '</div></div>';
  }

  container.innerHTML = html;
}

// 根据表单类型返回图标：📄 普通表单 / 🔄 流程表单
function getFormIcon(formName) {
  const path = (typeof FormConfig !== 'undefined' && FormConfig.formPaths[formName]) || '';
  return path.indexOf('「流程表单」') !== -1 ? '🔄' : '📄';
}

// 分组折叠/展开（▼ 展开 / ▶ 收起 切换，状态持久化到 localStorage）
function toggleGroup(titleEl) {
  var itemsEl = titleEl.nextElementSibling;
  var arrowEl = titleEl.querySelector('.menu-group-arrow');
  // 从 data-group 属性读取分组名，避免 onclick 字符串转义
  var groupName = titleEl.getAttribute('data-group') || '';
  if (itemsEl.style.display === 'none') {
    itemsEl.style.display = '';
    arrowEl.textContent = '▼';
    try { localStorage.setItem('menu_group_' + groupName, '1'); } catch (e) {} // 有意忽略：浏览器环境 localStorage 可能不可用
  } else {
    itemsEl.style.display = 'none';
    arrowEl.textContent = '▶';
    try { localStorage.setItem('menu_group_' + groupName, '0'); } catch (e) {} // 有意忽略：浏览器环境 localStorage 可能不可用
  }
}

// index.html 专用菜单渲染
function renderIndexMenu() {
  renderMenu('menuItems', 'templates/');
}

// list.html 专用菜单渲染
function renderListMenu() {
  renderMenu('menuItems', '');
}

// form.html 专用菜单渲染
function renderFormMenu() {
  renderMenu('menuItems', '');
}

// index.html 专用快速链接渲染
function renderQuickLinks() {
  const linkGrid = document.getElementById('linkGrid');
  if (!linkGrid || typeof FormConfig === 'undefined') return;

  const formNames = Object.keys(FormConfig.staticConfigData);
  let html = '';
  for (const name of formNames) {
    const encodedName = encodeURIComponent(name);
    const config = FormConfig.staticConfigData[name];
    const hasSubTable = config && config.fields && config.fields.some(f => f.componentType === '子表单' || f.componentType === 'TableField');
    const typeDesc = hasSubTable ? '普通表单（含子表）' : '普通表单';
    const groupName = (config && config.group) ? config.group : '业务表单';
    html += '<a href="templates/list.html?form=' + encodedName + '" class="link-card">' +
      '<div class="link-icon">📄</div>' +
      '<div class="link-content">' +
      '<h4>' + name + '</h4>' +
      '<p>' + groupName + ' - ' + typeDesc + '</p>' +
      '</div></a>';
  }
  linkGrid.innerHTML = html;
}

// index.html 专用统计更新
function updateStats() {
  if (typeof FormConfig === 'undefined') return;
  const formNames = Object.keys(FormConfig.staticConfigData);
  let subTableCount = 0;

  for (const name of formNames) {
    const config = FormConfig.staticConfigData[name];
    if (config.fields) {
      const hasSubTable = config.fields.some(f => f.componentType === '子表单' || f.componentType === 'TableField');
      if (hasSubTable) subTableCount++;
    }
  }

  const statFormCount = document.getElementById('statFormCount');
  const statSubTableCount = document.getElementById('statSubTableCount');

  if (statFormCount) statFormCount.textContent = formNames.length;
  if (statSubTableCount) statSubTableCount.textContent = subTableCount;
}

// 导出函数（如果支持模块）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    openDrawer,
    closeDrawer,
    addSubtableRow,
    deleteSubtableRow,
    calculateSubtotal,
    updateTotal,
    openSelectDialog,
    saveDraft,
    syncForm,
    syncApp,
    loadAppInfo,
    renderIndexMenu,
    renderListMenu,
    renderFormMenu,
    renderQuickLinks,
    updateStats,
    copyToClipboard,
    showToast
  };
}`;

  // 【v2.37.1】静态脚本 JS 语法自检（app.js）：写入前校验，语法错误直接阻断
  // 防止坏文件落地（历史事故：v2.37.0 模板字符串 \n 被解析为真实换行，产物 app.js 语法错误，
  // 旧版自检 try-catch 只告警不阻断，坏文件覆盖了所有应用的原型页面）
  validateGeneratedJs('js/app.js', jsContent);
  fs.writeFileSync(path.join(cssDir, 'style.css'), cssContent, 'utf-8');
  fs.writeFileSync(path.join(jsDir, 'app.js'), jsContent, 'utf-8');
}

/**
 * 【v2.23.0】产物 JS 语法自检：用 vm 模块对新生成的 HTML 内 <script> / 独立 .js 做语法校验
 * （只解析不执行，避免 window/document 等浏览器全局报运行时错误）。
 * 若发现语法错误，立即抛出，阻止生成损坏的坏页面，防止"生成清单页打开空白/崩"问题。
 * @param {string} label - 产物标识（用于报错提示）
 * @param {string} content - HTML 内容或 JS 源码
 */
const vm = require('vm');
function validateGeneratedJs(label, content) {
  // 抽取 HTML 中的所有 <script> 内容；若为纯 JS（无 <script 标签）则直接校验整个内容
  let scripts;
  if (content.includes('<script')) {
    scripts = [...String(content).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  } else {
    scripts = [String(content)];
  }
  for (let i = 0; i < scripts.length; i++) {
    const code = scripts[i].trim();
    if (!code) continue;
    try {
      new vm.Script(code, { filename: label + (scripts.length > 1 ? '[script' + i + ']' : '') });
    } catch (e) {
      throw new Error('[生成失败] 产物 ' + label + ' 的 JS 存在语法错误（第' + (i + 1) + '段 script）：' + e.message);
    }
  }
}

/**
 * 生成项目
 * @param {string} markdownPath - Markdown文件路径
 * @param {string} outputDir - 输出目录
 */
async function generatePrototype(markdownPath, outputDir) {
  console.log('\n============================================================');
  console.log('宜搭表单原型页面生成器 v2.3.0');
  console.log('（通用模板方案）');
  console.log('============================================================\n');

  // 1. 读取Markdown
  console.log('[1/5] 读取字段清单...');
  const fullPath = path.resolve(markdownPath);
  if (!fs.existsSync(fullPath)) {
    console.error('错误: 文件不存在 ' + fullPath);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  console.log('  ✓ 文件读取成功\n');

  // 2. 解析Markdown
  console.log('[2/5] 解析字段清单...');
  const systemInfo = parseMarkdown(content);

  // 2.1 从系统配置清单读取表单UUID
  console.log('[2.1/5] 读取系统配置清单...');
  const projectRoot = path.dirname(path.dirname(fullPath));
  const configListPath = path.join(projectRoot, '系统配置清单.md');
  const formUuidMap = {};
  if (fs.existsSync(configListPath)) {
    const configContent = fs.readFileSync(configListPath, 'utf-8');
    const uuidMatches = configContent.matchAll(/\|\s*\d+\s*\|\s*(.+?)「\S+?」\s*\|\s*(FORM-[A-Z0-9-]+)\s*\|/g);
    for (const match of uuidMatches) {
      const formName = match[1].trim();
      const uuid = match[2].trim();
      formUuidMap[formName] = uuid;
    }
    console.log('  ✓ 从系统配置清单读取UUID: ' + Object.keys(formUuidMap).length + ' 个');
  } else {
    console.log('  ⚠ 未找到系统配置清单: ' + configListPath);
  }

  // 将UUID赋值给表单
  systemInfo.forms.forEach(form => {
    if (formUuidMap[form.name]) {
      form.uuid = formUuidMap[form.name];
    }
  });

  console.log('  ✓ 系统名称: ' + systemInfo.name);
  console.log('  ✓ 版本: ' + systemInfo.version);
  console.log('  ✓ 表单数量: ' + systemInfo.forms.length);
  systemInfo.forms.forEach(form => {
    console.log('    - ' + form.name + ' (' + form.module + ') - ' + (form.type === 'process' ? '流程表单' : '普通表单') + (form.uuid ? ' [UUID]' : ''));
  });
  console.log();

  // 3. 创建输出目录
  console.log('[3/5] 创建输出目录...');
  const templatesDir = path.join(outputDir, 'templates');
  
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  console.log('  ✓ 输出目录: ' + outputDir);
  console.log('  ✓ 目录结构: 原型页面/');
  console.log('    ├── templates/   (通用模板页面)');
  console.log('    ├── css/         (样式文件)');
  console.log('    └── js/          (脚本文件)');
  console.log();

  // 4. 生成静态资源
  console.log('[4/5] 生成静态资源...');
  generateStaticFiles(outputDir);
  console.log('  ✓ CSS样式文件');
  console.log('  ✓ JS交互脚本');
  console.log('  ✓ 表单配置加载器 (form-config.js)\n');

  // 5. 生成页面文件
  console.log('[5/5] 生成页面文件...');

  // 生成首页
  const indexHtml = generateIndexHtml(systemInfo, systemInfo.forms);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf-8');
  console.log('  [生成] index.html');

  // 生成通用列表页模板
  const listTemplateHtml = generateListTemplateHtml(systemInfo.forms);
  fs.writeFileSync(path.join(templatesDir, 'list.html'), listTemplateHtml, 'utf-8');
  console.log('  [生成] templates/list.html - 通用列表页模板');

  // 生成通用表单页模板
  const formTemplateHtml = generateFormTemplateHtml(systemInfo.forms);
  fs.writeFileSync(path.join(templatesDir, 'form.html'), formTemplateHtml, 'utf-8');
  console.log('  [生成] templates/form.html - 通用新增/详情页模板');

  // 生成开发引导页模板
  const guideHtml = generateGuideHtml();
  fs.writeFileSync(path.join(templatesDir, 'guide.html'), guideHtml, 'utf-8');
  console.log('  [生成] templates/guide.html - 开发引导页模板');

  // 生成「生成清单」页模板（manifest.html）：展示并编辑字段清单/规则清单/应用分组
  const manifestHtml = generateManifestHtml(fullPath, outputDir, systemInfo.name);
  fs.writeFileSync(path.join(templatesDir, 'manifest.html'), manifestHtml, 'utf-8');
  console.log('  [生成] templates/manifest.html - 生成清单页模板');

  // 生成表单配置加载器（包含静态配置数据）
  const formConfigJs = generateFormConfigJs(systemInfo.forms, outputDir);
  fs.writeFileSync(path.join(outputDir, 'js', 'form-config.js'), formConfigJs, 'utf-8');
  console.log('  [生成] js/form-config.js - 表单配置加载器（含静态配置）');



  // 【v2.23.0】产物 JS 语法自检：校验所有新生成的 HTML/JS，有语法错误立即中止，避免产出坏页面
  // 【v2.37.1】由"告警继续"改为"直接 throw 中止"，让 sync-ops 捕获生成失败，杜绝静默产出坏文件
  // （app.js 已在 generateStaticFiles 内写入前校验阻断，此处校验 HTML 与 form-config）
  console.log('\n[4/5] 产物 JS 语法自检...');
  try {
    validateGeneratedJs('index.html', indexHtml);
    validateGeneratedJs('list.html', listTemplateHtml);
    validateGeneratedJs('form.html', formTemplateHtml);
    validateGeneratedJs('guide.html', guideHtml);
    validateGeneratedJs('manifest.html', manifestHtml);
    validateGeneratedJs('js/form-config.js', formConfigJs);
    console.log('  ✓ 全部产物 JS 语法校验通过');
  } catch (e) {
    console.error('  ✗ 产物 JS 语法校验未通过，中止生成: ' + e.message);
    throw e;
  }

  console.log('\n============================================================');
  console.log('[生成完成]');
  console.log('============================================================');
  console.log('\n位置: ' + path.resolve(outputDir));
  console.log('\n文件结构:');
  console.log('  📁 ' + outputDir + '/');
  console.log('  ├── 📄 index.html');
  console.log('  ├── 📁 css/');
  console.log('  │   └── 📄 style.css');
  console.log('  ├── 📁 js/');
  console.log('  │   ├── 📄 app.js');
  console.log('  │   └── 📄 form-config.js');
  console.log('  └── 📁 templates/');
  console.log('      ├── 📄 list.html');
  console.log('      ├── 📄 form.html');
  console.log('      ├── 📄 guide.html');
  console.log('      └── 📄 manifest.html');
  console.log('\n使用方式:');
  // v3.1.0: 多组织并存模式下，URL 需要带项目目录段
  let projectDirName = '';
  try {
    let dir = path.resolve(outputDir);
    const root = path.parse(dir).root;
    while (dir !== root) {
      if (fs.existsSync(path.join(dir, '组织及应用信息.md'))) {
        projectDirName = path.basename(dir);
        break;
      }
      dir = path.dirname(dir);
    }
  } catch (_) {}
  const appDirName = path.basename(path.dirname(path.dirname(outputDir)));
  const urlPrefix = projectDirName
    ? `http://127.0.0.1:8080/${encodeURIComponent(projectDirName)}/${encodeURIComponent(appDirName)}`
    : `http://127.0.0.1:8080/${encodeURIComponent(appDirName)}`;
  console.log('  1. 启动宜搭服务: node .agents/skills/server-manager/scripts/server_manager.js start');
  console.log('  2. 访问: ' + urlPrefix + '/01需求梳理/原型页面/index.html');
  console.log('\n说明:');
  console.log('  - 所有表单共用 list.html 和 form.html 两个通用模板');
  console.log('  - 通过 URL参数 ?form=产品信息 切换不同表单');
  console.log('  - 表单字段从 组件ID清单.md 动态加载');
  console.log('  - 支持字段ID显示和点击复制功能');
  console.log('\n============================================================\n');

  // 写入生成器版本文件，供 sync-ops.js 版本感知重建判断
  try {
    fs.writeFileSync(path.join(outputDir, '.generator-version'), GENERATOR_VERSION, 'utf-8');
    console.log('  [版本] 已写入 .generator-version = ' + GENERATOR_VERSION);
  } catch (e) {
    console.log('  [警告] 写入 .generator-version 失败: ' + e.message);
  }

  // 更新组织及应用信息.md 中的原型页面地址
  updateOrgInfoPrototypeUrl(outputDir);
}

/**
 * 更新组织及应用信息.md 中的原型页面访问地址
 * 与 server_manager.js / sync_all_configs.js 保持完全一致的格式和逻辑
 * @param {string} outputDir - 原型页面输出目录
 */
function updateOrgInfoPrototypeUrl(outputDir) {
  const HTTP_PORT = 8080;

  // 从 outputDir 推断应用名称
  // outputDir 格式通常为: xxx/01需求梳理/原型页面 或 xxx/原型页面
  const parts = outputDir.split(path.sep);
  const prototypeIndex = parts.indexOf('原型页面');
  let appName = null;

  if (prototypeIndex > 0) {
    // 检查前面是否是 "01需求梳理"
    if (parts[prototypeIndex - 1] === '01需求梳理' && prototypeIndex >= 2) {
      appName = parts[prototypeIndex - 2];
    } else {
      appName = parts[prototypeIndex - 1];
    }
  }

  if (!appName) {
    console.log('  ⚠️  无法从路径推断应用名称，跳过更新组织及应用信息');
    return;
  }

  // 查找项目根目录（向上查找包含 组织及应用信息.md 的目录）
  let rootDir = path.resolve(outputDir);
  let orgInfoPath = null;
  while (rootDir !== path.parse(rootDir).root) {
    const testPath = path.join(rootDir, '组织及应用信息.md');
    if (fs.existsSync(testPath)) {
      orgInfoPath = testPath;
      break;
    }
    rootDir = path.dirname(rootDir);
  }

  if (!orgInfoPath) {
    console.log('  ⚠️  未找到组织及应用信息.md，跳过更新');
    return;
  }

  try {
    let content = fs.readFileSync(orgInfoPath, 'utf-8');

    // 扫描项目根目录下所有有原型页面的应用
    const apps = [];
    const items = fs.readdirSync(rootDir);

    for (const item of items) {
      const appPath = path.join(rootDir, item);
      const prototypePath = path.join(appPath, '01需求梳理', '原型页面', 'index.html');

      if (fs.existsSync(prototypePath)) {
        apps.push({
          name: item,
          url: `http://127.0.0.1:${HTTP_PORT}/${item}/01需求梳理/原型页面/index.html`,
          synced: true
        });
      }
    }

    if (apps.length === 0) {
      console.log('  ⚠️  未找到任何原型页面，跳过更新');
      return;
    }

    // 构建表格行（确保格式与现有表格一致）
    const prototypeTable = apps.map(app =>
      `| ${app.name} | <${app.url}> | ✅ 已同步 |`
    ).join('\n');

    // 构建完整的原型页面section
    const prototypeSection = `## 原型页面访问地址

> 以下地址需要在 HTTP 服务启动后访问
>
> 请勿使用 \`file://\` 协议打开，否则会导致同步配置功能失效

| 应用名称 | 原型页面地址 | 本地状态 |
| ------ | ----------------------------------------------------- | ----- |
${prototypeTable}`;

    // 替换或新增 section
    if (content.includes('## 原型页面访问地址')) {
      // 已存在section，替换整个section内容
      // 匹配从 "## 原型页面访问地址" 到下一个 "## " 或文件末尾的内容
      const sectionRegex = /(## 原型页面访问地址[\s\S]*?)(?=\n## |$)/;
      content = content.replace(sectionRegex, prototypeSection + '\n\n');
      console.log(`  📝 更新原型页面访问地址 (${apps.length} 个应用)`);
    } else {
      // 不存在section，在文件末尾添加
      // 找到最后一个 *** 分隔符之后，或者直接在文件末尾添加
      if (content.trim().endsWith('***')) {
        content = content.trim() + '\n\n' + prototypeSection + '\n';
      } else {
        content = content.trim() + '\n\n***\n\n' + prototypeSection + '\n';
      }
      console.log(`  ➕ 新增原型页面访问地址section (${apps.length} 个应用)`);
    }

    fs.writeFileSync(orgInfoPath, content, 'utf-8');
    console.log('  ✅ 已更新组织及应用信息.md');
  } catch (error) {
    console.log(`  ⚠️  更新组织及应用信息失败: ${error.message}`);
  }
}

// 主函数
function main() {
  const markdownPath = process.argv[2];
  const formConfigOnly = process.argv.includes('--form-config-only');

  if (!markdownPath) {
    console.log('用法: node prototype_generator.js <字段清单md文件路径> [输出目录] [--form-config-only]');
    console.log('示例:');
    console.log('  node prototype_generator.js "../../../出入库管理/01需求梳理/字段清单.md" "../../../出入库管理/01需求梳理/原型页面"');
    console.log('\n说明:');
    console.log('  - 如果未指定输出目录，默认在字段清单所在目录生成"原型页面"文件夹');
    console.log('  - --form-config-only: 仅重新生成 form-config.js，不重新生成整个原型页面');
    process.exit(1);
  }

  // 处理输出目录：如果未指定，默认与字段清单同目录
  let outputDir;
  const args = process.argv.slice(2).filter(a => a !== '--form-config-only');
  if (args[1]) {
    outputDir = args[1];
  } else {
    const markdownDir = path.dirname(markdownPath);
    outputDir = path.join(markdownDir, '原型页面');
  }

  if (formConfigOnly) {
    // 仅重新生成 form-config.js
    generateFormConfigOnly(markdownPath, outputDir).catch(err => {
      console.error('生成失败:', err);
      process.exit(1);
    });
  } else {
    generatePrototype(markdownPath, outputDir).catch(err => {
      console.error('生成失败:', err);
      process.exit(1);
    });
  }
}

/**
 * 仅重新生成 form-config.js（表单列表变化时调用）
 */
async function generateFormConfigOnly(markdownPath, outputDir) {
  console.log('\n============================================================');
  console.log('宜搭表单原型页面生成器 - 仅更新 form-config.js');
  console.log('============================================================\n');

  // 1. 读取Markdown
  console.log('[1/3] 读取字段清单...');
  const fullPath = path.resolve(markdownPath);
  if (!fs.existsSync(fullPath)) {
    console.error('错误: 文件不存在 ' + fullPath);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');

  // 2. 解析Markdown
  console.log('[2/3] 解析字段清单...');
  const systemInfo = parseMarkdown(content);

  // 2.1 从系统配置清单读取表单UUID
  const projectRoot = path.dirname(path.dirname(fullPath));
  const configListPath = path.join(projectRoot, '系统配置清单.md');
  const formUuidMap = {};
  if (fs.existsSync(configListPath)) {
    const configContent = fs.readFileSync(configListPath, 'utf-8');
    const uuidMatches = configContent.matchAll(/\|\s*\d+\s*\|\s*(.+?)「\S+?」\s*\|\s*(FORM-[A-Z0-9-]+)\s*\|/g);
    for (const match of uuidMatches) {
      const formName = match[1].trim();
      const uuid = match[2].trim();
      formUuidMap[formName] = uuid;
    }
  }

  systemInfo.forms.forEach(form => {
    if (formUuidMap[form.name]) {
      form.uuid = formUuidMap[form.name];
    }
  });

  console.log(`  ✓ 表单数量: ${systemInfo.forms.length}`);

  // 3. 重新生成 form-config.js
  console.log('[3/3] 重新生成 form-config.js...');
  const formConfigJs = generateFormConfigJs(systemInfo.forms, outputDir);
  const jsDir = path.join(outputDir, 'js');
  if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(jsDir, 'form-config.js'), formConfigJs, 'utf-8');
  console.log('  ✓ form-config.js 已更新');

  console.log('\n============================================================');
  console.log('[更新完成]');
  console.log('============================================================\n');
}

if (require.main === module) {
  main();
}
