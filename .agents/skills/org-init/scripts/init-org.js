/**
 * 组织初始化脚本 - V1.5.1
 * 新增: 支持 YIDA_NO_OPEN_PORTAL 环境变量，由同步服务触发时跳过打开浏览器/注册自启（避免刷新应用信息时弹新窗口）
 * 自动从宜搭平台获取应用列表并更新到配置文件
 * 修复：配合 login-manager v1.0.11，修复页面跳转后登录流程提前退出的问题
 * 修复：文件不存在时自动创建默认配置文件
 * 新增：使用独立的登录管理器，组织选择时等待用户手动操作
 * 修复：使用动态路径，支持不同项目目录
 * 更新：应用列表表格改为3列格式（序号、应用名称、应用ID），移除空行、应用类型和备注列
 * 更新：移除用户信息表和组织英文标识行
 * 修复：应用列表生成时不再产生空行，表格格式更规范
 * 修复：移除对 simulated-login 的错误引用
 * 修复：应用列表按正序排列（新应用添加到表格末尾）
 * 修复：新增 updateOrgInfo 函数，在更新应用列表时同时更新组织信息
 * 修复：配合 login-manager v1.0.1，增强 base_url 有效性验证
 * 更新：配合 login-manager v1.0.3，使用双重保险策略获取组织信息
 * 重大更新：使用 API 接口 /query/app/getAppList.json 直接获取应用列表，无需逐个打开浏览器页面
 * 修复：尝试多个 API 端点获取应用列表，提高成功率
 * 修复：添加必要的请求头（Referer、User-Agent等），使API调用成功
 * 修复：添加 UTF-8 编码支持，解决 Windows 绫端中文乱码
 * 新增：初始化完成后自动启动HTTP服务并打开门户页面
 * 新增：rebuildAppList 以宜搭为准整体重建应用列表（删除宜搭中不存在的应用）
 * 修复：updateOrgInfo 在 loginState 没有 corpName/corpId 时保留原文件中的值
 * 修复：login-manager 抓取组织名称失败时会用域名前缀兜底，updateOrgInfo 将"corpName 等于域名前缀"也视为无效值，保留原文件中的组织名称，避免被域名前缀覆盖
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require('../../../../lib/core/utils');

// Windows 平台设置 UTF-8 代码页，解决中文乱码
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误，继续执行
  }
}

// 引用本地的登录管理器（独立的，组织选择时等待用户手动操作）
const { ensureLogin } = require('./login-manager.js');

// 动态获取项目根目录（向上回溯到项目根目录）
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const CONFIG = {
  // 阶段二改造：Cookie 优先全局，兼容项目根
  cookiesFile: (function() {
    const globalCF = path.join(require('os').homedir(), '.yida-ai-helper', '.cookies.json');
    return fs.existsSync(globalCF) ? globalCF : path.join(PROJECT_ROOT, '.cookies.json');
  })(),
  orgConfigFile: path.join(PROJECT_ROOT, '组织及应用信息.md'),
  baseUrl: null  // 将在登录后动态获取
};

// Phase 6: loadCookies 委托给 lib/core/utils.loadCookieData（统一实现）
// 兼容原签名：返回 cookies 数组（或 null）
function loadCookies() {
  const cookieData = coreUtils.loadCookieData(PROJECT_ROOT);
  return cookieData?.cookies || null;
}

function createDefaultOrgConfigFile(loginState) {
  // 格式化时间：YYYY-MM-DD HH:mm
  const now = new Date();
  const timeStr = now.getFullYear() + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
    String(now.getDate()).padStart(2, '0') + ' ' + 
    String(now.getHours()).padStart(2, '0') + ':' + 
    String(now.getMinutes()).padStart(2, '0');
  const baseUrl = loginState?.base_url || 'https://qfhefh.aliwork.com';
  const corpId = loginState?.corp_id || '';
  const domainPrefix = baseUrl.replace('https://', '').replace('.aliwork.com', '');
  // 旧版登录态可能残留"域名前缀兜底"的组织名称，视为无效
  let corpName = (loginState?.login_user?.corpName || '').trim();
  if (!corpName || corpName === domainPrefix) {
    corpName = '未知';
  }
  
  const defaultContent = `# 组织及应用信息

> 本文件存储宜搭组织信息和应用列表，供各个 Skill 调用
> 
> **注意**: 修改此文件后，相关 Skill 会自动读取最新配置

---

## 基本信息

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 版本 | 1.0.0 | 配置格式版本 |
| 最后更新时间 | ${timeStr} | 自动更新 |

---

## 组织信息

| 字段名 | 值 |
|--------|-----|
| 组织名称 | ${corpName} |
| 域名前缀 | ${domainPrefix} |
| 完整域名 | ${baseUrl} |
| corpId | ${corpId} |
| corp名称 | ${corpName} |
| 本地门户 | [http://127.0.0.1:8080/${encodeURIComponent(path.basename(PROJECT_ROOT))}/本地操作页面/index.html](http://127.0.0.1:8080/${encodeURIComponent(path.basename(PROJECT_ROOT))}/本地操作页面/index.html) |

---

## 应用列表

> 在此添加需要管理的宜搭应用，Skill 会自动读取
> 
> **提示**: 运行 \`node .agents/skills/org-init/scripts/init-org.js\` 可自动同步宜搭平台上的应用列表

| 序号 | 应用名称 | 应用ID (appId) |
|------|----------|----------------|
---

## 原型页面访问地址

> 以下地址需要在 HTTP 服务启动后访问
> 
> 请勿使用 \`file://\` 协议打开，否则会导致同步配置功能失效

| 应用名称 | 原型页面地址 | 本地状态 |
|----------|-------------|----------|
---

## 使用说明

### 如何添加新应用

**方式一：手动添加**
1. 在「应用列表」表格末尾添加新行
2. 填写序号、应用名称、应用ID
3. 保存文件后即可被 Skill 读取

**方式二：自动同步**
1. 运行同步命令：\`node .agents/skills/org-init/scripts/init-org.js\`
2. 系统会自动从宜搭平台获取应用列表并更新此文件

### 如何修改组织信息

1. 直接修改「组织信息」表格中的值
2. 修改后 Skill 下次运行时会自动读取新配置

### Skill 调用方式

\`\`\`javascript
// 读取组织配置
const orgConfig = loadOrgConfig();

// 获取 base_url
const baseUrl = orgConfig.base_url;

// 获取 corpId
const corpId = orgConfig.corp_id;

// 获取应用列表
const apps = orgConfig.apps;
\`\`\`

---

## 备注

此配置由系统自动生成，也可手动修改。
`;

  fs.writeFileSync(CONFIG.orgConfigFile, defaultContent);
  console.log('  [创建] 默认配置文件:', CONFIG.orgConfigFile);
  return true;
}

/**
 * 从已存在的配置文件中读取某个字段的当前值
 * @param {string} content - 配置文件内容
 * @param {string} label - 字段名（例如 "组织名称"）
 * @returns {string|null} 当前值，没有则 null
 */
function readExistingField(content, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\|\\s*' + escapedLabel + '\\s*\\|\\s*([^|\\n]+?)\\s*\\|');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

/**
 * 更新组织信息到配置文件
 * 当 loginState 中没有 corpName / corpId 时，保留原文件中的值
 * @param {Object} loginState - 登录态对象
 * @returns {boolean} 是否成功
 */
function updateOrgInfo(loginState) {
  try {
    if (!fs.existsSync(CONFIG.orgConfigFile)) {
      console.log('  [提示] 配置文件不存在，跳过组织信息更新');
      return false;
    }

    let content = fs.readFileSync(CONFIG.orgConfigFile, 'utf-8');

    const baseUrl = loginState?.base_url || 'https://qfhefh.aliwork.com';
    const domainPrefix = baseUrl.replace('https://', '').replace('.aliwork.com', '');

    // corpName 优先取 loginState，否则从原文件读出，最后才回退到"未知"
    // 注意：login-manager 抓取失败时会用域名前缀兜底，这种值不是真实组织名称，同样视为无效
    let corpName = (loginState?.login_user?.corpName || '').trim();
    if (!corpName || corpName === '未知' || corpName === domainPrefix) {
      const existing = readExistingField(content, '组织名称');
      if (existing && existing !== '未知' && existing !== domainPrefix) {
        corpName = existing;
        console.log('  [保留] 组织名称从原文件读取:', corpName);
      } else {
        corpName = '未知';
      }
    }

    // corpId 同样保留原值
    let corpId = (loginState?.corp_id || '').trim();
    if (!corpId) {
      const existingCorpId = readExistingField(content, 'corpId');
      if (existingCorpId) {
        corpId = existingCorpId;
        console.log('  [保留] corpId 从原文件读取:', corpId);
      }
    }
    
    // 更新时间
    const now = new Date();
    const timeStr = now.getFullYear() + '-' + 
      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0');
    
    // 更新表格字段的通用方法
    // 注意：编辑器的 Markdown 格式化会对齐填充表格（字段名后可能有多个空格），
    // 正则必须容忍任意空格，否则替换会静默失败
    const replaceTableField = (label, value) => {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(\\|\\s*' + escapedLabel + '\\s*\\|)[^|\\n]*(\\|)');
      if (!re.test(content)) {
        console.log('  [警告] 未在配置文件中找到字段行:', label, '（未更新）');
        return;
      }
      content = content.replace(re, '$1 ' + value + ' $2');
    };

    // 更新最后更新时间
    replaceTableField('最后更新时间', timeStr);
    // 更新组织名称
    replaceTableField('组织名称', corpName);
    // 更新域名前缀
    replaceTableField('域名前缀', domainPrefix);
    // 更新完整域名
    replaceTableField('完整域名', baseUrl);
    // 更新 corpId
    replaceTableField('corpId', corpId);
    // 更新 corp名称
    replaceTableField('corp名称', corpName);
    
    fs.writeFileSync(CONFIG.orgConfigFile, content);
    console.log('  [更新] 组织信息已更新');
    console.log('    - 组织名称:', corpName);
    console.log('    - 域名前缀:', domainPrefix);
    console.log('    - 完整域名:', baseUrl);
    console.log('    - corpId:', corpId);
    return true;
  } catch (e) {
    console.error('  [失败] 更新组织信息失败:', e.message);
    return false;
  }
}

function updateAppIdInMarkdown(appName, appId) {
  try {
    // 如果文件不存在，创建默认文件
    if (!fs.existsSync(CONFIG.orgConfigFile)) {
      console.log('  [提示] 配置文件不存在，创建默认文件...');
      createDefaultOrgConfigFile();
    }
    
    let content = fs.readFileSync(CONFIG.orgConfigFile, 'utf-8');
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 检查应用是否已存在
    const existingRegex = new RegExp('\\|\\s*\\d+\\s*\\|\\s*' + escaped + '\\s*\\|[^\\n]*', 'g');
    
    if (content.match(existingRegex)) {
      // 更新已存在的应用
      content = content.replace(existingRegex, (match) => {
        const parts = match.split('|');
        parts[3] = ' ' + (appId || '请手动补充') + ' ';
        return parts.join('|');
      });
      fs.writeFileSync(CONFIG.orgConfigFile, content);
      console.log('  [更新]', appName, '->', appId || '请手动补充');
      return true;
    } else {
      // 应用不存在，添加新行
      // 找到应用列表表格中所有已有的行
      const tableRowRegex = /\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/g;
      let lastNum = 0;
      let match;
      
      // 只匹配应用列表部分的行（在 ## 应用列表 和下一个 ## 之间）
      const appListSection = content.match(/## 应用列表[\s\S]*?(?=\n## |$)/);
      if (appListSection) {
        const rowMatches = appListSection[0].match(/\|\s*(\d+)\s*\|/g);
        if (rowMatches) {
          rowMatches.forEach(row => {
            const numMatch = row.match(/\|\s*(\d+)\s*\|/);
            if (numMatch) {
              const num = parseInt(numMatch[1]);
              if (!isNaN(num) && num > lastNum) {
                lastNum = num;
              }
            }
          });
        }
      }
      
      const newNum = lastNum + 1;
      const newRow = '| ' + newNum + ' | ' + appName + ' | ' + (appId || '请手动补充') + ' |';
      
      // 找到应用列表表格中最后一行，在其后添加新行
      // 首先找到应用列表部分
      const appListSectionRegex = /(## 应用列表[\s\S]*?)(\n## |\n---|$)/;
      const appListMatch = content.match(appListSectionRegex);
      
      if (appListMatch) {
        const appListSection = appListMatch[1];
        // 找到该部分中最后一行表格数据（以 | 数字 | 开头的行）
        const lines = appListSection.split('\n');
        let lastTableRowIndex = -1;
        
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].match(/^\|\s*\d+\s*\|/)) {
            lastTableRowIndex = i;
            break;
          }
        }
        
        if (lastTableRowIndex >= 0) {
          // 在最后一行表格数据后插入新行
          lines.splice(lastTableRowIndex + 1, 0, newRow);
          const newAppListSection = lines.join('\n');
          content = content.replace(appListSection, newAppListSection);
        } else {
          // 表格中没有数据行，在分隔符后添加
          const separatorRegex = /(\|------\|----------\|----------------\|)\n/;
          content = content.replace(separatorRegex, '$1\n' + newRow + '\n');
        }
      } else {
        // 备用方案：在分隔符后直接添加
        const separatorRegex = /(\|------\|----------\|----------------\|)\n/;
        content = content.replace(separatorRegex, '$1\n' + newRow + '\n');
      }
      
      fs.writeFileSync(CONFIG.orgConfigFile, content);
      console.log('  [新增]', appName, '->', appId || '请手动补充');
      return true;
    }
  } catch (e) {
    console.error('  [失败]', e.message);
    return false;
  }
}

/**
 * 整体重建应用列表表格
 * - 以宜搭返回的 apps 为准（数组中已包含 name 和 appId）
 * - 保留本地未同步的应用（appId 为"待创建"或"请手动补充"且在云端不存在的应用）
 * - 同时扫描本地项目文件夹，补充配置文件中未记录的本地应用
 * - 保留 3 列结构：序号 | 应用名称 | 应用ID (appId)
 * - 按宜搭返回顺序重新编号，本地未同步应用追加在末尾
 * @param {Array<{name:string, appId:string|null}>} apps - 宜搭上的应用列表
 * @returns {{updated:number, removed:number, added:number, preserved:number}}
 */
function rebuildAppList(apps) {
  if (!fs.existsSync(CONFIG.orgConfigFile)) {
    createDefaultOrgConfigFile();
  }

  let content = fs.readFileSync(CONFIG.orgConfigFile, 'utf-8');
  const beforeNames = parseAppListNames(content);
  const remoteNameSet = new Set(apps.map(a => a.name));

  // 收集本地的 {name -> appId}，便于在宜搭没返回 appId 时保留旧值
  const localMap = new Map();
  beforeNames.forEach(({ name, appId }) => {
    if (name) localMap.set(name, appId);
  });

  // ── 识别本地未同步应用（appId 为"待创建"/"请手动补充"，且云端不存在）──
  const localOnlyApps = [];
  beforeNames.forEach(({ name, appId }) => {
    if (name && !remoteNameSet.has(name) && (appId === '待创建' || appId === '请手动补充')) {
      // 检查本地项目文件夹是否存在
      const projectDir = path.join(PROJECT_ROOT, name);
      if (fs.existsSync(projectDir)) {
        localOnlyApps.push({ name, appId });
        console.log(`  [保留] 本地未同步应用：${name} (${appId})`);
      }
    }
  });

  // ── 扫描本地项目文件夹，发现配置文件中未记录的本地应用 ──
  const existingNames = new Set([...apps.map(a => a.name), ...localOnlyApps.map(a => a.name)]);
  const discoveredApps = discoverLocalApps(existingNames);
  localOnlyApps.push(...discoveredApps);

  // 构造新的应用列表行：云端应用 + 本地未同步应用
  const allApps = [...apps, ...localOnlyApps];
  const newRows = allApps.map((app, idx) => {
    let appId = app.appId;
    if (!appId || appId === '请手动补充') {
      // 宜搭没返回 ID 时，保留本地已有的（如果有）
      appId = localMap.get(app.name) || '请手动补充';
    }
    return `| ${idx + 1} | ${app.name} | ${appId} |`;
  });

  // 定位"应用列表"section：从"## 应用列表"开始到下一个"## "或文件末尾
  const sectionRegex = /(## 应用列表[\s\S]*?)(?=\n## |\n--- |\n# |\s*$)/;
  const sectionMatch = content.match(sectionRegex);
  if (!sectionMatch) {
    console.log('  [警告] 未找到 ## 应用列表 section，无法重建');
    return { updated: 0, removed: 0, added: 0, preserved: 0 };
  }

  // 在原 section 内，替换"表头+分隔行之后"到 section 结束的所有表格行
  const sectionText = sectionMatch[1];
  const tableHeaderRegex = /(\| 序号[^\n]*\n\|[ -|]+\n)([\s\S]*)/;
  const headerMatch = sectionText.match(tableHeaderRegex);

  let newSection;
  if (headerMatch) {
    newSection = sectionText.replace(tableHeaderRegex, (_m, header) => header + newRows.join('\n') + '\n');
  } else {
    newSection = sectionText.replace(/\s*$/, '\n' + newRows.join('\n') + '\n');
  }

  content = content.replace(sectionText, newSection);
  fs.writeFileSync(CONFIG.orgConfigFile, content, 'utf-8');

  // 计算增删
  const newNameSet = new Set(allApps.map(a => a.name));
  const removedNames = [];
  let removed = 0;
  beforeNames.forEach(({ name, appId }) => {
    if (name && !newNameSet.has(name)) {
      // 只移除已经同步过的应用（有真实 appId 的），不移除未同步应用
      if (appId !== '待创建' && appId !== '请手动补充') {
        removed++;
        removedNames.push(name);
        console.log('    - 已删除（宜搭中不存在）:', name);
      }
    }
  });
  let added = 0;
  const addedNames = [];
  allApps.forEach(a => { if (!beforeNames.find(b => b.name === a.name)) { added++; addedNames.push(a.name); } });
  const updated = apps.length - added;
  const preserved = localOnlyApps.length;
  // 保持不变的应用：之前已存在且当前仍在远端应用列表中
  const unchangedNames = allApps
    .filter(a => beforeNames.some(b => b.name === a.name))
    .map(a => a.name);

  console.log(`  [重建] 应用列表：共 ${allApps.length} 个（云端 ${apps.length} + 本地未同步 ${preserved}），新增 ${added}，删除 ${removed}，更新 ${updated}`);
  return { updated, removed, added, preserved, addedNames, removedNames, unchangedNames };
}

/**
 * 扫描本地项目文件夹，发现配置文件中未记录的本地应用
 * 判断依据：项目根目录下的子文件夹包含"系统配置清单.md"或"01需求梳理"目录
 * 排除已知系统目录（如 .agents, .cache, lib, scripts, node_modules 等）
 * @param {Set<string>} existingNames - 已知的应用名称集合
 * @returns {Array<{name:string, appId:string}>}
 */
function discoverLocalApps(existingNames) {
  const discovered = [];
  const SYSTEM_DIRS = new Set([
    '.agents', '.cache', '.playwright-browsers', '.playwright-cli', '.trae', '.figma', '.git',
    '.codebuddy', 'lib', 'scripts', 'node_modules', 'temp-file', 'tests',
    '本地操作页面', '★宜搭场景案例库', '★宜搭开发参考文档', 'AI宜搭场景',
  ]);

  try {
    const entries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirName = entry.name;
      
      // 跳过系统目录和隐藏目录
      if (dirName.startsWith('.') || SYSTEM_DIRS.has(dirName)) continue;
      
      // 跳过已存在的应用
      if (existingNames.has(dirName)) continue;
      
      // 检查是否是宜搭应用项目目录（包含特征文件）
      const dirPath = path.join(PROJECT_ROOT, dirName);
      const hasSystemConfig = fs.existsSync(path.join(dirPath, '系统配置清单.md'));
      const hasRequirementDir = fs.existsSync(path.join(dirPath, '01需求梳理'));
      const hasReadme = fs.existsSync(path.join(dirPath, 'README.md'));
      
      // 至少满足两个条件才认为是应用目录
      const score = (hasSystemConfig ? 1 : 0) + (hasRequirementDir ? 1 : 0) + (hasReadme ? 1 : 0);
      if (score >= 2) {
        console.log(`  [发现] 本地项目文件夹中的未记录应用：${dirName}`);
        discovered.push({ name: dirName, appId: '待创建' });
        existingNames.add(dirName); // 防止重复添加
      }
    }
  } catch (error) {
    console.log('  [警告] 扫描本地项目文件夹失败:', error.message);
  }

  return discovered;
}

/**
 * 从配置文件中解析出应用列表 section 的所有行
 * @returns {Array<{name:string, appId:string}>}
 */
function parseAppListNames(content) {
  const result = [];
  const lines = content.split('\n');
  let inAppSection = false;
  for (const line of lines) {
    if (line.startsWith('## 应用列表')) {
      inAppSection = true;
      continue;
    }
    if (inAppSection) {
      if (line.startsWith('## ') || line.startsWith('# ')) break;
      const m = line.match(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
      if (m) {
        result.push({ name: m[1].trim(), appId: m[2].trim() });
      }
    }
  }
  return result;
}

/**
 * 发送 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {Object} options - 请求选项
 * @param {Object} cookies - Cookie 对象
 * @param {string} referer - Referer URL
 * @returns {Promise<Object>}
 */
function makeRequest(url, options = {}, cookies = {}, referer = '') {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    // 构建 cookie 字符串
    const cookieString = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...options.headers
    };
    
    if (referer) {
      headers['Referer'] = referer;
    }
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: headers
    };
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (e) {
          resolve({ success: false, errorMsg: '解析响应失败: ' + e.message, rawData: data });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * 使用 API 接口获取应用列表
 * @param {Object} loginState - 登录态对象
 * @returns {Promise<Array>} 应用列表
 */
async function fetchAppsViaAPI(loginState) {
  console.log('\n📋 使用 API 接口获取应用列表...');
  
  try {
    const baseUrl = loginState?.base_url || CONFIG.baseUrl;
    const cookies = loginState?.cookies || loadCookies();
    
    if (!cookies) {
      console.log('❌ 未获取到登录态，无法继续');
      return [];
    }
    
    // 将 cookies 数组转换为对象
    const cookieObj = {};
    if (Array.isArray(cookies)) {
      cookies.forEach(cookie => {
        if (cookie.name && cookie.value) {
          cookieObj[cookie.name] = cookie.value;
        }
      });
    } else {
      Object.assign(cookieObj, cookies);
    }
    
    // 从 cookie 中获取 csrf token（宜搭使用 tianshu_csrf_token 或 c_csrf）
    const csrfToken = cookieObj['tianshu_csrf_token'] || cookieObj['c_csrf'] || cookieObj['XSRF-TOKEN'] || '';
    const timestamp = Date.now();
    
    // 尝试多个 API 端点（使用正确的参数格式）
    const apiEndpoints = [
      { 
        url: `${baseUrl}/query/app/getAppList.json?_api=App.getList&_mock=false&_csrf_token=${csrfToken}&_locale_time_zone_offset=28800000&pageIndex=1&pageSize=100&orderField=data_gmt_create&appStatus=&isAdmin=true&creator=&key=&_stamp=${timestamp}`, 
        method: 'GET' 
      },
      { url: `${baseUrl}/app/getAppList.json`, method: 'POST', body: {} },
      { url: `${baseUrl}/query/app/getAppList.json`, method: 'GET' }
    ];
    
    for (const endpoint of apiEndpoints) {
      console.log(`  尝试 API: ${endpoint.url}`);
      
      const options = {
        method: endpoint.method,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      };
      
      if (endpoint.body) {
        options.body = endpoint.body;
      }
      
      const result = await makeRequest(endpoint.url, options, cookieObj, `${baseUrl}/myApp`);
      
      // 检查各种可能的响应格式
      let apps = null;
      
      if (result?.success && result.content?.data && Array.isArray(result.content.data)) {
        apps = result.content.data;
      } else if (result?.data && Array.isArray(result.data)) {
        apps = result.data;
      } else if (result?.result && Array.isArray(result.result)) {
        apps = result.result;
      } else if (Array.isArray(result)) {
        apps = result;
      }
      
      if (apps && apps.length > 0) {
        console.log(`  ✓ 找到 ${apps.length} 个应用`);
        
        // 转换为统一格式
        const formattedApps = apps.map(app => {
          const appName = app.appName?.zh_CN || app.appName?.en_US || app.appName || app.name || '未命名';
          const appId = app.appId || app.appType || app.id || null;
          return { name: appName, appId: appId };
        }).filter(app => app.name && app.name !== '未命名');
        
        return formattedApps;
      }
    }
    
    console.log('  ⚠️ 所有 API 端点都未能获取到应用列表');
    return [];
  } catch (error) {
    console.error('  ❌ API 调用失败:', error.message);
    return [];
  }
}

/**
 * 使用浏览器获取应用列表（备用方案）
 * @param {Object} loginState - 登录态对象
 * @returns {Promise<Array>} 应用列表
 */
async function fetchAppsViaBrowser(loginState) {
  console.log('\n启动浏览器获取应用列表...');
  const browser = await chromium.launch({ headless: false });
  
  try {
    const cookies = loginState?.cookies || loadCookies();
    if (!cookies) {
      console.log('❌ 未获取到登录态，无法继续');
      return [];
    }
    
    const baseUrl = loginState?.base_url || CONFIG.baseUrl;
    
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();
    
    // 拦截网络请求，尝试找到应用列表 API
    const apiCalls = [];
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('getAppList') || url.includes('app/list') || url.includes('myApp')) {
        try {
          const data = await response.json().catch(() => null);
          if (data && (data.data || data.content || data.result || Array.isArray(data))) {
            apiCalls.push({ url, data });
          }
        } catch (e) {} // 有意忽略：响应体可能非 JSON 格式
      }
    });

    // 访问我的应用页面
    console.log('访问我的应用页面:', baseUrl + '/myApp');
    await page.goto(baseUrl + '/myApp', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    // 打印找到的 API 调用
    if (apiCalls.length > 0) {
      console.log('  发现 API 调用:');
      apiCalls.forEach((call, i) => {
        console.log(`    ${i + 1}. ${call.url}`);
      });
    }
    
    if (page.url().includes('login')) {
      console.log('❌ 未登录，请重新运行脚本进行登录');
      return [];
    }
    
    // 获取应用名称列表
    const appNames = await page.evaluate(() => {
      const names = [];
      const cards = document.querySelectorAll('.MyCreateAppCard--cardWrapper, .app-card');
      
      cards.forEach(card => {
        const titleEl = card.querySelector('[class*="CardTitle"], [class*="title"], h3, h4');
        if (titleEl) {
          const name = titleEl.textContent.trim();
          if (name && name.length > 1 && name.length < 50) {
            names.push(name);
          }
        }
      });
      
      return names;
    });
    
    console.log('找到', appNames.length, '个应用:', appNames);
    
    // 逐个点击应用获取 APP_ID
    const results = [];
    
    for (let i = 0; i < appNames.length; i++) {
      const appName = appNames[i];
      console.log('\n处理应用 ' + (i + 1) + '/' + appNames.length + ': ' + appName);
      
      try {
        const card = await page.locator('.MyCreateAppCard--cardWrapper, .app-card')
          .filter({ hasText: appName })
          .first();
        
        if (await card.isVisible().catch(() => false)) {
          const [newPage] = await Promise.all([
            context.waitForEvent('page', { timeout: 10000 }).catch(() => null),
            card.click()
          ]);
          
          let appId = null;
          
          if (newPage) {
            await newPage.waitForLoadState('networkidle');
            await newPage.waitForTimeout(3000);
            
            const url = newPage.url();
            console.log('  新页面URL:', url);
            
            const match = url.match(/APP_[A-Z0-9]+/i);
            if (match) {
              appId = match[0];
              console.log('  获取到 APP_ID:', appId);
            }
            
            await newPage.close();
          } else {
            await page.waitForTimeout(5000);
            const url = page.url();
            console.log('  当前页面URL:', url);
            
            const match = url.match(/APP_[A-Z0-9]+/i);
            if (match) {
              appId = match[0];
              console.log('  获取到 APP_ID:', appId);
            }
          }
          
          results.push({ name: appName, appId: appId });
          
          if (!page.url().includes('/myApp')) {
            await page.goto(baseUrl + '/myApp', { waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);
          }
        } else {
          console.log('  未找到应用卡片');
          results.push({ name: appName, appId: null });
        }
      } catch (e) {
        console.log('  处理失败:', e.message);
        results.push({ name: appName, appId: null });
        try {
          await page.goto(baseUrl + '/myApp', { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);
        } catch (e2) {} // 有意忽略：回退导航也可能失败，不影响主流程
      }
    }
    
    return results;
  } finally {
    await browser.close();
  }
}



/**
 * 确保门户页面资源文件存在（CSS/JS）
 * 门户页面已废弃，使用固定的本地操作页面代替
 */
function ensurePortalResources(portalDir) {
  // 门户页面已废弃，不再生成
  // 请使用固定的 本地操作页面 目录
  console.log('  ℹ️ 门户页面已废弃，使用本地操作页面代替');
}

/**
 * 递归复制目录（已废弃，保持兼容）
 */
function copyDirRecursive(src, dest) {
  // 已废弃，不再使用
}

/**
 * 启动HTTP服务并打开门户页面
 */
async function startServicesAndOpenPortal() {
  const { spawn } = require('child_process');

  const serverManagerScript = path.join(
    PROJECT_ROOT, '.agents', 'skills', 'server-manager', 'scripts', 'server_manager.js'
  );

  if (!fs.existsSync(serverManagerScript)) {
    console.log('  ⚠️ 服务管理器脚本不存在，跳过自动启动');
    console.log('  💡 请手动运行: node .agents/skills/server-manager/scripts/server_manager.js start');
    return;
  }

  // 检查服务是否已经在运行
  const httpRunning = await checkHttpServiceRunning();
  if (httpRunning) {
    console.log('  ✅ HTTP 服务已在运行中');
    openPortalInBrowser();
    return;
  }

  console.log('  🔄 正在启动 HTTP 服务和同步服务...');

  // 启动服务管理器
  const child = spawn(process.execPath, [serverManagerScript, 'start'], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true
  });
  child.unref();

  // 等待服务就绪
  console.log('  ⏳ 等待服务启动...');
  let retries = 0;
  const maxRetries = 15;
  while (retries < maxRetries) {
    await new Promise(r => setTimeout(r, 1000));
    retries++;
    const running = await checkHttpServiceRunning();
    if (running) {
      console.log(`  ✅ 服务已就绪 (第 ${retries} 秒)`);
      openPortalInBrowser();
      return;
    }
    if (retries % 3 === 0) {
      console.log(`  ⏳ 等待中... (${retries}/${maxRetries})`);
    }
  }

  console.log('  ⚠️ 服务启动超时，请手动启动');
  console.log('  💡 运行: node .agents/skills/server-manager/scripts/server_manager.js start');
}

/**
 * 检查 HTTP 服务是否在运行
 */
function checkHttpServiceRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8080/', { timeout: 2000 }, (res) => {
      resolve(true);
      req.destroy();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * 在浏览器中打开门户页面
 */
function openPortalInBrowser() {
  const projectName = encodeURIComponent(path.basename(PROJECT_ROOT));
  const portalUrl = `http://127.0.0.1:8080/${projectName}/本地操作页面/index.html`;
  console.log('\n' + '='.repeat(60));
  console.log('🎉 门户页面已就绪！');
  console.log('  📍 访问地址: ' + portalUrl);
  console.log('='.repeat(60));

  // 尝试在浏览器中打开
  try {
    const { exec } = require('child_process');
    const command = process.platform === 'win32'
      ? `start "" "${portalUrl}"`
      : process.platform === 'darwin'
        ? `open "${portalUrl}"`
        : `xdg-open "${portalUrl}"`;
    exec(command, (error) => {
      if (error) {
        console.log('  💡 请手动在浏览器中打开上述地址');
      } else {
        console.log('  ✅ 已在浏览器中打开门户页面');
      }
    });
  } catch (_) {
    console.log('  💡 请手动在浏览器中打开上述地址');
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('宜搭组织初始化工具');
  console.log('='.repeat(60));
  
  // 第一步：调用 simulated-login 进行登录
  console.log('\n🔐 第一步：登录宜搭平台');
  console.log('  将打开浏览器进行登录，请按提示操作...');
  console.log('  如果需要选择组织，请选择您要初始化的组织');
  console.log('');
  
  let loginState;
  try {
    loginState = await ensureLogin({ 
      headless: false,
      targetUrl: 'https://www.aliwork.com'
    });
    
    if (!loginState) {
      console.log('❌ 登录失败，请重试');
      return;
    }
    
    console.log('\n✅ 登录成功！');
    console.log('  用户:', loginState.login_user?.userName || '未知');
    console.log('  组织:', loginState.login_user?.corpName || '未知');
    console.log('  baseUrl:', loginState.base_url);
    
    CONFIG.baseUrl = loginState.base_url;
    
  } catch (error) {
    console.error('❌ 登录过程出错:', error.message);
    console.log('  请确保您已完成登录流程并选择了组织');
    return;
  }
  
  // 第二步：获取应用列表（优先使用 API）
  console.log('\n📋 第二步：获取应用列表');
  let apps = await fetchAppsViaAPI(loginState);
  
  // 如果 API 失败，使用浏览器备用方案
  if (apps.length === 0) {
    console.log('\n⚠️ API 获取失败，尝试使用浏览器方式...');
    apps = await fetchAppsViaBrowser(loginState);
  }
  
  if (apps.length === 0) {
    console.log('⚠️ 未获取到应用，初始化结束');
    return;
  }
  
  console.log('\n获取到', apps.length, '个应用:');
  apps.forEach((app, i) => {
    console.log('  ' + (i + 1) + '. ' + app.name + (app.appId ? ' (' + app.appId + ')' : ' (无ID)'));
  });
  
  // 第三步：更新配置文件
  console.log('\n📝 第三步：更新配置文件...');
  
  if (!fs.existsSync(CONFIG.orgConfigFile)) {
    createDefaultOrgConfigFile(loginState);
  }
  
  updateOrgInfo(loginState);

  // 用宜搭返回的应用列表整体重建本地应用列表（新增 / 更新 / 删除）
  const rebuildResult = rebuildAppList(apps);
  const updated = rebuildResult.updated + rebuildResult.added;
  const notFound = rebuildResult.added === 0 && apps.length === 0 ? 0 : 0;
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 初始化完成!');
  console.log('  - 成功更新:', updated, '个');
  console.log('  - 未匹配:', notFound, '个');
  console.log('  - 配置文件:', CONFIG.orgConfigFile);

  // 输出结构化变化摘要（供 sync_server / 本地门户解析，展示每个应用的增删改情况）
  const changeSummary = {
    success: true,
    addedNames: rebuildResult.addedNames || [],
    removedNames: rebuildResult.removedNames || [],
    unchangedNames: rebuildResult.unchangedNames || [],
    added: rebuildResult.added,
    removed: rebuildResult.removed,
    updated: rebuildResult.updated,
    preserved: rebuildResult.preserved
  };
  console.log('__YIDA_CHANGES__' + JSON.stringify(changeSummary));

  // 第四步：启动HTTP服务并打开门户页面
  // 【v1.5.1】由 sync_server 触发（浏览器刷新应用信息）时跳过打开浏览器/注册自启，避免每次刷新弹新窗口
  console.log('\n🚀 第四步：启动HTTP服务...');
  if (process.env.YIDA_NO_OPEN_PORTAL === '1') {
    console.log('  ℹ️ 由同步服务触发，跳过打开门户浏览器窗口');
  } else {
    await startServicesAndOpenPortal();
  }

  // 第五步：注册开机自启
  if (process.env.YIDA_NO_OPEN_PORTAL !== '1') {
    console.log('\n🔌 第五步：注册开机自启...');
    registerAutoStart();
  }
}

/**
 * 注册开机自启（仅在未注册时执行）
 */
function registerAutoStart() {
  const startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const shortcutPath = path.join(startupFolder, '宜搭AI助手-启动服务.bat');

  if (fs.existsSync(shortcutPath)) {
    console.log('  ✅ 开机自启已注册，跳过');
    return;
  }

  const batPath = path.join(PROJECT_ROOT, '启动宜搭服务.bat');
  if (!fs.existsSync(batPath)) {
    console.log('  ⚠️ 未找到 启动宜搭服务.bat，跳过注册');
    return;
  }

  const startupScript = `@echo off
chcp 65001 >nul 2>&1
cd /d "${PROJECT_ROOT}"
start /min "" node ".agents\\skills\\server-manager\\scripts\\server_manager.js" start
`;

  try {
    // 使用 GBK 编码写入 bat 文件（Windows cmd 默认使用 GBK）
    try {
      const iconv = require('iconv-lite');
      fs.writeFileSync(shortcutPath, iconv.encode(startupScript, 'gbk'));
    } catch (_) {
      fs.writeFileSync(shortcutPath, startupScript, 'utf-8');
    }
    console.log('  ✅ 已注册开机自启');
    console.log('     下次开机将自动启动宜搭服务');
    console.log('     取消自启: 在对话框输入 "取消宜搭服务开机自启"');
  } catch (error) {
    console.log('  ⚠️ 注册开机自启失败:', error.message);
    console.log('     您可以稍后手动注册: 在对话框输入 "注册宜搭服务开机自启"');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ 脚本执行失败:');
    console.error('  错误类型:', error.name || 'Unknown');
    console.error('  错误信息:', error.message);
    console.error('  堆栈跟踪:', error.stack);
    process.exit(1);
  });
}

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ 未处理的 Promise 拒绝:');
  console.error('  原因:', reason);
  process.exit(1);
});

// 捕获未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('\n❌ 未捕获的异常:');
  console.error('  错误信息:', error.message);
  console.error('  堆栈跟踪:', error.stack);
  process.exit(1);
});
