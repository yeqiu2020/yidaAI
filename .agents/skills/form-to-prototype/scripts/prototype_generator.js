/**
 * 宜搭表单原型页面生成器 - 通用模板方案
 * 版本: 2.9.0
 *
 * 功能: 读取Markdown字段清单，生成通用HTML原型页面模板
 * 用法: node prototype_generator.js <字段清单md文件路径> [输出目录]
 * 示例: node prototype_generator.js "../../../出入库管理/01需求梳理/字段清单.md" "../../../出入库管理/01需求梳理/原型页面"
 *
 * 更新说明:
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
      currentModule = moduleMatch[1].trim();
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
      <span id="syncAppStatus" class="sync-status" style="display:none;margin-left:8px;"></span>
    </div>
    <div class="user-info">
      <a href="/index.html" class="btn-portal-link" title="回到组织主页">&#127968; 组织主页</a>
      👤 管理员
    </div>
  </header>
  
  <div class="container">
    <!-- 左侧菜单 -->
    <aside class="sidebar">
      <nav class="menu">
        <div class="menu-group">
          <div class="menu-group-title">业务表单</div>
          <div id="menuItems">
            <!-- 菜单项由JavaScript动态生成 -->
          </div>
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
      <span id="syncAppStatus" class="sync-status" style="display:none;margin-left:8px;"></span>
    </div>
    <div class="user-info">
      <a href="/index.html" class="btn-portal-link" title="回到组织主页">&#127968; 组织主页</a>
      👤 管理员
    </div>
  </header>

  <div class="container">
    <!-- 左侧菜单 -->
    <aside class="sidebar">
      <nav class="menu" id="mainMenu">
        <div class="menu-group">
          <div class="menu-group-title">业务表单</div>
          <div id="menuItems">
            <!-- 菜单项由JavaScript动态生成 -->
          </div>
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
      <span id="syncAppStatus" class="sync-status" style="display:none;margin-left:8px;"></span>
    </div>
    <div class="user-info">
      <a href="/index.html" class="btn-portal-link" title="回到组织主页">&#127968; 组织主页</a>
      👤 管理员
    </div>
  </header>

  <div class="container">
    <!-- 左侧菜单 -->
    <aside class="sidebar">
      <nav class="menu" id="mainMenu">
        <div class="menu-group">
          <div class="menu-group-title">业务表单</div>
          <div id="menuItems">
            <!-- 菜单项由JavaScript动态生成 -->
          </div>
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
      <a href="/index.html" class="btn-portal-link" title="回到组织主页">&#127968; 组织主页</a>
      &#128100; 管理员
    </div>
  </header>

  <div class="container">
    <aside class="sidebar">
      <nav class="menu" id="mainMenu">
        <div class="menu-group">
          <div class="menu-group-title">&#19994;&#21153;&#34920;&#21333;</div>
          <div id="menuItems"></div>
        </div>
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
        text = text.replace('&#31896;&#36148;Excel&#25991;&#20214;&#36335;&#24452;', 'd:\\&#23452;&#25645;AI&#32534;&#31243;\\&#23452;&#25645;AI&#21161;&#25163;V1.7.3\\' + appName + '\\01&#38656;&#27714;&#26803;&#29702;\\' + appName + '&#34920;&#21333;&#28165;&#21333;.xlsx');
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
      return pathParts[0] || '';
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
        const excelPath = 'd:\\&#23452;&#25645;AI&#32534;&#31243;\\&#23452;&#25645;AI&#21161;&#25163;V1.7.3\\' + appName + '\\01&#38656;&#27714;&#26803;&#29702;\\' + appName + '&#34920;&#21333;&#28165;&#21333;.xlsx';
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
 * 生成表单配置加载器JS
 * @param {Array} allForms - 所有表单列表
 * @returns {string} JS代码
 */
function generateFormConfigJs(allForms, outputDir) {
  // 生成表单路径映射
  // 表单直接放在项目根目录下，不再使用"未分组表单"子目录
  const formPathsEntries = allForms.map(form => {
    const formDir = form.name + (form.type === 'process' ? '「流程表单」' : '「普通表单」');
    // 只存储表单目录名，路径前缀由 getBasePath() 动态提供
    return `    '${form.name}': '${formDir}'`;
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
          if (cells.length >= 3 && /^\\d+$/.test(cells[0])) {
            const nameMatch = cells[1].match(/^(.+?)「(.+?)」/);
            if (nameMatch) {
              forms.push({
                name: nameMatch[1].trim(),
                type: nameMatch[2].trim(),
                uuid: cells[2].trim()
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

      // 更新 formPaths
      for (const form of forms) {
        if (!this.formPaths[form.name]) {
          this.formPaths[form.name] = form.name + '「' + form.type + '」';
        }
      }

      // 更新 staticConfigData 中缺失的表单
      for (const form of forms) {
        if (!this.staticConfigData[form.name]) {
          this.staticConfigData[form.name] = {
            formName: form.name,
            formUuid: form.uuid,
            fields: []
          };
        }
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
      console.warn('[FormConfig] 加载表单配置失败:', error);
      // 返回空配置而不是抛出错误，避免页面崩溃
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

  const formConfigData = {};

  allForms.forEach(function(form) {
    var fields = [];
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

    if (fields.length > 0) {
      formConfigData[form.name] = {
        formName: form.name,
        formUuid: form.uuid || '',
        fields: fields
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

  // 表单直接放在项目根目录下，不再使用模块子目录

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
          if (subTableMatch) {
            currentSubTableName = subTableMatch[1].trim();  // 纯子表名称
            var subTableFieldId = subTableMatch[2].trim().replace(/\\_/g, '_');  // fieldId，将 \_ 替换为 _
          } else {
            currentSubTableName = subTableFullName;
            var subTableFieldId = 'tableField_' + subTableFullName;
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

  allForms.forEach(function(form) {
    var fields = [];

    // 先尝试从组件ID清单.md获取完整字段数据（含子表子字段）
    var typeStr = form.type === 'process' ? '流程表单' : '普通表单';
    var formDirName = form.name + '「' + typeStr + '」';
    // 表单直接放在项目根目录下
    var componentListPath = path.resolve(projectRoot, formDirName, '组件ID清单.md');
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
        fields: fields
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

/* 左侧菜单栏 - 宜搭灰色风格 */
.container { display: flex; margin-top: 48px; min-height: calc(100vh - 48px); }
.sidebar { width: 208px; background: #fafafa; border-right: 1px solid #e8e8e8; position: fixed; top: 48px; bottom: 0; left: 0; overflow-y: auto; z-index: 100; }
.menu { padding: 0; }
.menu-group { margin-bottom: 4px; }
.menu-group-title { padding: 12px 16px 8px; font-size: 12px; color: #8c8c8c; text-transform: none; font-weight: 400; }
.menu-item { display: block; padding: 10px 16px 10px 32px; color: #595959; text-decoration: none; transition: all 0.3s; position: relative; font-size: 14px; border-left: 3px solid transparent; }
.menu-item:hover { background: #e6f7ff; color: #1890ff; }
.menu-item.active { background: #e6f7ff; color: #1890ff; border-left-color: #1890ff; }
.menu-item.process::before { content: '▸'; position: absolute; left: 16px; color: #52c41a; font-size: 10px; }
.guide-menu-item { border-left: 3px solid #fa8c16; }
.guide-menu-item:hover { border-left-color: #fa8c16; }
.guide-menu-item.active { border-left-color: #fa8c16; background: #fff7e6; color: #d46b08; }

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
      body: JSON.stringify({ pageUrl: window.location.href }),
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
    
    // 调用本地同步服务
    const response = await fetch(\`\${SYNC_SERVICE_URL}/sync-form\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formName: formName }),
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
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('服务未启动')) {
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
      body: JSON.stringify({ pageUrl: window.location.href }),
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

  const formNames = Object.keys(FormConfig.staticConfigData);
  let html = '';
  // 【开发引导】作为第一个菜单项
  html += '<a href="' + linkPrefix + 'guide.html" class="menu-item guide-menu-item" data-form="__guide__">📋 开发引导</a>';
  for (const name of formNames) {
    const encodedName = encodeURIComponent(name);
    html += '<a href="' + linkPrefix + 'list.html?form=' + encodedName + '" class="menu-item" data-form="' + name + '">' + name + '</a>';
  }
  container.innerHTML = html;
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
    const hasSubTable = config.fields && config.fields.some(f => f.componentType === '子表单' || f.componentType === 'TableField');
    const typeDesc = hasSubTable ? '普通表单（含子表）' : '普通表单';
    html += '<a href="templates/list.html?form=' + encodedName + '" class="link-card">' +
      '<div class="link-icon">📄</div>' +
      '<div class="link-content">' +
      '<h4>' + name + '</h4>' +
      '<p>业务表单 - ' + typeDesc + '</p>' +
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

  fs.writeFileSync(path.join(cssDir, 'style.css'), cssContent, 'utf-8');
  fs.writeFileSync(path.join(jsDir, 'app.js'), jsContent, 'utf-8');
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

  // 生成表单配置加载器（包含静态配置数据）
  const formConfigJs = generateFormConfigJs(systemInfo.forms, outputDir);
  fs.writeFileSync(path.join(outputDir, 'js', 'form-config.js'), formConfigJs, 'utf-8');
  console.log('  [生成] js/form-config.js - 表单配置加载器（含静态配置）');



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
  console.log('      └── 📄 guide.html');
  console.log('\n使用方式:');
  console.log('  1. 启动HTTP服务器: npx http-server "' + path.dirname(outputDir) + '" -p 8080');
  console.log('  2. 访问: http://localhost:8080/' + path.basename(path.dirname(outputDir)) + '/' + path.basename(outputDir) + '/index.html');
  console.log('\n说明:');
  console.log('  - 所有表单共用 list.html 和 form.html 两个通用模板');
  console.log('  - 通过 URL参数 ?form=产品信息 切换不同表单');
  console.log('  - 表单字段从 组件ID清单.md 动态加载');
  console.log('  - 支持字段ID显示和点击复制功能');
  console.log('\n============================================================\n');

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

main();
