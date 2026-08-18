/**
 * 宜搭项目创建工具
 * 版本: 2.6.0
 * 更新日期: 2026-08-02
 *
 * 更新内容:
 * - v2.6.0: 系统配置清单模板"应用名称/应用ID/访问地址/创建时间/最后更新"统一改为加粗格式，
 *          与 config-sync 的 sync_config.js 模板一致，从源头消除两套表头格式差异
 *           （避免未加粗表头导致解析应用信息失败显示"未知应用"）
 * - v2.5.0: 系统配置清单模板添加流程Code列
 *          - 表单UUID清单表格从3列改为4列
 *          - 新增"流程Code"列，与sync_config.js保持一致
 * - v2.4.0: 修改默认创建位置为根目录
 *          - 默认直接在根目录创建项目
 *          - 移除"项目案例"子文件夹逻辑
 * - v2.3.0: 简化表单UUID清单模板格式
 *          - 只保留3列：序号、页面名称「类型」、表单UUID
 *          - 移除"页面类型"、"流程Code"、"备注"列
 *          - 从组织配置读取完整域名
 *          - 优先使用组织域名而非 www.aliwork.com
 * - v2.2.0: 自动从组织及应用信息.md读取应用ID
 *          - 创建项目时自动匹配应用ID并填入系统配置清单
 *          - 统一术语："应用编码"改为"应用ID"
 * - v2.1.0: 移除项目开发提示词生成（现已放在根目录公用）
 *          - 项目开发提示词.md 现在放在根目录，所有项目共用
 *          - 创建项目时不再生成此文件
 * - v2.0.0: 更新项目开发提示词模板为v2.0.0版本
 *          - 新增步骤零：已有项目准备流程
 *          - 简化为"说明+提示词"结构
 *          - 增加AI智能分组说明
 * - v1.5.0: 统一创建模式，所有项目按相同结构创建
 *          - 去除新项目/已有项目区分
 *          - 后续通过同步脚本更新配置
 *
 * 功能: 根据项目名称创建标准化的宜搭项目目录结构
 *
 * 用法: node create-project.js "项目名称"
 *       项目将直接创建在根目录下
 */

const fs = require('fs');
const path = require('path');

// 根目录
const ROOT_DIR = path.join(__dirname, '..', '..', '..', '..');

/**
 * 从组织及应用信息.md读取应用列表
 * @returns {Object} { corpId, domain, apps: [{name, appId}] }
 */
function loadOrgConfig() {
  const orgConfigPath = path.join(ROOT_DIR, '组织及应用信息.md');
  const result = {
    corpId: '',
    domain: '',
    apps: []
  };

  if (!fs.existsSync(orgConfigPath)) {
    return result;
  }

  try {
    const content = fs.readFileSync(orgConfigPath, 'utf-8');

    // 提取 corpId
    const corpIdMatch = content.match(/corpId\s*\|\s*(ding[\w]+)/);
    if (corpIdMatch) {
      result.corpId = corpIdMatch[1];
    }

    // 提取组织域名
    const domainMatch = content.match(/完整域名\s*\|\s*(https?:\/\/[^\s|]+)/);
    if (domainMatch) {
      result.domain = domainMatch[1].replace(/\/$/, ''); // 去掉末尾的斜杠
    }

    // 提取应用列表 - 匹配表格行
    const appRows = content.match(/\|\s*\d+\s*\|\s*[^|]+\|\s*APP_\w+\s*\|/g);
    if (appRows) {
      appRows.forEach(row => {
        const parts = row.split('|').map(p => p.trim()).filter(p => p);
        if (parts.length >= 3) {
          result.apps.push({
            name: parts[1],
            appId: parts[2]
          });
        }
      });
    }
  } catch (error) {
    console.log(`⚠️  读取组织配置失败: ${error.message}`);
  }

  return result;
}

/**
 * 根据项目名称查找应用ID
 * @param {string} projectName - 项目名称
 * @param {Array} apps - 应用列表
 * @returns {string|null} 应用ID
 */
function findAppId(projectName, apps) {
  const match = apps.find(app => app.name === projectName);
  return match ? match.appId : null;
}

/**
 * 创建项目
 * @param {string} projectName - 项目名称
 * @returns {Object} 创建结果
 */
function createProject(projectName) {
  console.log(`\n[项目创建] ${projectName}`);
  console.log('=' .repeat(50));

  // 直接在根目录创建
  const baseDir = ROOT_DIR;

  console.log(`📁 创建位置: 根目录`);

  // 1. 读取组织配置，获取应用ID、CorpId和域名
  const orgConfig = loadOrgConfig();
  const appId = findAppId(projectName, orgConfig.apps);
  const corpId = orgConfig.corpId;
  const domain = orgConfig.domain || 'https://www.aliwork.com';

  if (appId) {
    console.log(`✅ 从组织配置找到应用ID: ${appId}`);
  } else {
    console.log(`⚠️  未在组织配置中找到应用ID，将使用"待同步"`);
  }

  if (orgConfig.domain) {
    console.log(`✅ 从组织配置找到域名: ${domain}`);
  }

  // 2. 创建项目目录
  const projectPath = path.join(baseDir, projectName);
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
    console.log(`✅ 创建项目目录: ${projectPath}`);
  } else {
    console.log(`⚠️  项目目录已存在: ${projectPath}`);
  }

  // 3. 创建 01需求梳理 文件夹
  const requirementDir = path.join(projectPath, '01需求梳理');
  if (!fs.existsSync(requirementDir)) {
    fs.mkdirSync(requirementDir, { recursive: true });
    console.log(`✅ 创建需求梳理目录`);
  }

  // 4. 创建系统配置清单（自动填入应用ID、CorpId和域名）
  const configPath = path.join(projectPath, '系统配置清单.md');
  if (!fs.existsSync(configPath)) {
    const configContent = generateConfigTemplate(projectName, appId, corpId, domain);
    fs.writeFileSync(configPath, configContent, 'utf-8');
    console.log(`✅ 创建系统配置清单${appId ? '（已填入应用ID）' : '（待同步）'}`);
  } else {
    console.log(`⚠️  系统配置清单已存在，跳过`);
  }

  // 4. 创建 README.md
  const readmePath = path.join(projectPath, 'README.md');
  if (!fs.existsSync(readmePath)) {
    const readmeContent = generateReadmeTemplate(projectName);
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    console.log(`✅ 创建项目说明文档`);
  }

  // 5. 创建基础开发引导页 01需求梳理/index.html
  // 作用：字段清单/原型页面未生成时，"进入应用"指向此页，避免访问原型页面 index.html 返回 404
  // 字段清单转换完成后，form-to-prototype 会生成完整原型页面（01需求梳理/原型页面/index.html），此引导页仍保留在 01需求梳理/ 下作参考
  const guidePath = path.join(requirementDir, 'index.html');
  if (!fs.existsSync(guidePath)) {
    const guideContent = generateGuidePage(projectName);
    fs.writeFileSync(guidePath, guideContent, 'utf-8');
    console.log(`✅ 创建基础开发引导页 (01需求梳理/index.html)`);
  } else {
    console.log(`⚠️  开发引导页已存在，跳过`);
  }

  console.log('=' .repeat(50));
  console.log('✅ 项目创建完成！\n');
  console.log('📋 项目结构:');
  console.log(`   ${projectName}/`);
  console.log(`   ├── 01需求梳理/`);
  console.log(`   │   └── index.html (开发引导页)`);
  console.log(`   ├── 系统配置清单.md`);
  console.log(`   └── README.md`);
  console.log('');
  console.log('💡 提示：项目已创建');
  console.log('   项目开发提示词.md 位于根目录，所有项目共用');
  console.log('   后续可通过 config-sync 技能同步宜搭应用配置');
  console.log('   同步命令: node .agents/skills/config-sync/scripts/sync_all_configs.js\n');

  return {
    success: true,
    projectName,
    projectPath,
    requirementDir: path.join(projectName, '01需求梳理'),
    configFile: path.join(projectName, '系统配置清单.md'),
    guidePage: path.join(projectName, '01需求梳理', 'index.html')
  };
}

/**
 * 生成系统配置清单模板
 * @param {string} projectName - 项目名称
 * @param {string|null} appId - 应用ID
 * @param {string} corpId - 企业ID
 * @param {string} domain - 组织域名
 * @returns {string} Markdown内容
 */
function generateConfigTemplate(projectName, appId = null, corpId = '', domain = 'https://www.aliwork.com') {
  const today = new Date().toISOString().split('T')[0];
  const appIdValue = appId || '待同步';
  const corpIdValue = corpId || '待同步';

  return `# ${projectName} - 系统配置清单

> 版本: 1.0.0
> 生成日期: ${today}
> 更新说明: 项目初始化

---

## 📱 应用信息

### 基本信息

| 属性 | 值 | 说明 |
|------|-----|------|
| **应用名称** | ${projectName} | 宜搭应用显示名称 |
| **应用ID** | ${appIdValue} | 应用唯一标识（APP_XXX） |
| **访问地址** | ${appId ? `${domain}/app/${appId}/` : '待同步'} | 宜搭应用访问URL |
| **创建时间** | 待同步 | 应用创建时间 |
| **最后更新** | 待同步 | 最后更新时间 |

### 部署运维信息

> **说明**：从宜搭平台「部署运维」页面获取，用于API调用和二次开发

| 属性 | 值 | 说明 |
|------|-----|------|
| Corp ID | ${corpIdValue} | 企业ID（dingXXX） |
| 应用ID | ${appIdValue} | 应用唯一标识（APP_XXX） |
| 应用密钥 | 待同步 | 应用密钥（用于API认证） |
| 当前登录人ID | 待同步 | 当前用户ID |

---

## 📋 表单ID清单

> **说明**：从宜搭平台「部署运维」页面获取所有页面编码。流程表单包含两个ID：表单UUID（页面编码）和流程Code（流程编码）

| 序号 | 页面名称「类型」 | 页面编码（表单UUID） | 流程Code |
|:---:|-----------------|---------------------|----------|
| 1 | 待同步「普通表单」 | FORM-XXX | - |

---

## 🔧 技术配置

### API配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| Base URL | https://www.aliwork.com/ | 宜搭平台地址 |
| API版本 | v1 | 当前API版本 |
| 认证方式 | Cookie/Token | 登录态认证 |

### 环境信息

| 环境 | 地址 | 状态 |
|------|------|------|
| 开发环境 | 待配置 | 待部署 |
| 测试环境 | 待配置 | 待部署 |
| 生产环境 | 待配置 | 待部署 |

---

## ❌ 创建失败记录

| 表单名称 | 失败原因 | 重试时间 | 状态 |
|---------|---------|---------|------|
| 无 | - | - | - |

---

## 📊 统计信息

- 表单总数: 0
- 普通表单: 0
- 流程表单: 0
- 子表数量: 0
- 数据工厂: 0
- 集成自动化: 0

---

## 🔗 快速访问

- [宜搭工作台](https://www.aliwork.com/)
- [应用管理](https://www.aliwork.com/appManager/)
- [开放平台](https://open.dingtalk.com/)

---

## 📝 更新日志

| 版本 | 日期 | 更新内容 | 更新人 |
|------|------|---------|--------|
| 1.0.0 | ${today} | 项目初始化 | 系统自动 |

---

## 💡 使用说明

### 如何获取部署运维信息

1. 登录宜搭平台，进入应用
2. 点击右上角「...」→「部署运维」
3. 复制以下信息到本文件：
   - Corp ID
   - 应用ID
   - 应用密钥
   - 页面名称、页面类型、页面编码

### 如何同步配置

创建宜搭应用后，使用以下命令同步配置：

\`\`\`powershell
# 统一同步（推荐）- 同步应用ID、表单UUID、组件ID、表结构
node .agents/skills/config-sync/scripts/sync_all_configs.js "${projectName}/01需求梳理/字段清单.md" "APP_XXX"

# 或分步同步
# 步骤1：同步系统配置清单
node .agents/skills/config-sync/scripts/sync_config.js --appId "APP_XXX" --output "${projectName}"

# 步骤2：同步表单结构及组件ID
node .agents/skills/config-sync/scripts/sync_form_schemas.js "${projectName}/01需求梳理/字段清单.md" "APP_XXX"
\`\`\`

### 已有应用同步

如果是已有宜搭应用，先手动复制部署运维信息到本文件，然后执行：

\`\`\`powershell
node .agents/skills/config-sync/scripts/sync_config.js --appId "APP_XXX" --output "${projectName}" --smart-group
\`\`\`
`;
}

/**
 * 生成 README.md 模板
 * @param {string} projectName - 项目名称
 * @returns {string} Markdown内容
 */
function generateReadmeTemplate(projectName) {
  const today = new Date().toISOString().split('T')[0];

  return `# ${projectName}

> 版本: 1.0.0  
> 创建日期: ${today}  
> 项目状态: 初始化阶段

---

## 项目概述

${projectName}是一个宜搭低代码应用项目。

---

## 项目目录结构

\`\`\`
${projectName}/
├── 01需求梳理/              # 需求文档和字段清单
│   └── .gitkeep
├── 系统配置清单.md           # 宜搭应用配置信息（通过同步更新）
└── README.md                # 项目说明文档
\`\`\`

---

## 开发流程

参考根目录下的 [项目开发提示词.md](../../项目开发提示词.md) 了解完整的开发流程。

### 简要流程

1. **需求梳理** - 在 01需求梳理/ 目录下编写字段清单
2. **表单设计** - 根据字段清单设计表单结构
3. **生成配置** - 使用 form_creator 生成JSON配置
4. **创建应用** - 在宜搭平台创建应用和表单
5. **同步配置** - 使用 config-sync 同步应用ID、表单UUID、组件ID
6. **配置规则** - 设置公式、校验、流程等业务规则
7. **测试验证** - 完成功能测试和数据验证
8. **上线部署** - 正式发布使用

---

## 配置同步

创建宜搭应用后，使用以下命令同步配置：

\`\`\`bash
# 统一同步（推荐）
node .agents/skills/config-sync/scripts/sync_all_configs.js "${projectName}/01需求梳理/字段清单.md" "APP_XXX"

# 或分步同步
# 步骤1：同步系统配置
node .agents/skills/config-sync/scripts/sync_config.js --appId "APP_XXX" --output "${projectName}"

# 步骤2：同步表单结构
node .agents/skills/config-sync/scripts/sync_form_schemas.js "${projectName}/01需求梳理/字段清单.md" "APP_XXX"
\`\`\`

---

## 注意事项

1. **不要直接修改已生成的JSON文件** - 如需调整，修改字段清单后重新生成
2. **定期同步配置** - 使用 config-sync 同步应用配置信息
3. **版本控制** - 重要的字段清单和配置变更建议做版本记录

---

## 相关技能

- **form_creator** - 根据字段清单生成宜搭表单配置
- **formula-generator** - 生成宜搭公式
- **code-expert** - 生成宜搭JS代码
- **config-sync** - 同步宜搭应用配置信息

---

*文档版本：v1.0.0*  
*最后更新：${today}*
`;
}

/**
 * 生成应用的基础开发引导页（自包含 HTML，不依赖原型页面的样式/资源）
 * 用途：应用创建后、字段清单/原型页面尚未生成时，"进入应用"指向此页，
 * 避免访问不存在的原型页面 index.html 返回 404。
 * 当 form-to-prototype 生成完整原型页面后，"进入应用"改指向完整原型页面。
 * 【v2.7.0】新增：满足"创建应用后即可看到开发指引"的需求
 */
function generateGuidePage(projectName) {
  const today = new Date().toISOString().split('T')[0];
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${projectName} - 开发引导</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f5f7fa; color: #1f2d3d; line-height: 1.6; }
  .container { max-width: 820px; margin: 0 auto; padding: 40px 24px; }
  .welcome { background: linear-gradient(135deg, #1565c0 0%, #42a5f5 100%); color: #fff; padding: 40px; border-radius: 12px; margin-bottom: 32px; text-align: center; box-shadow: 0 6px 20px rgba(21,101,192,0.25); }
  .welcome h1 { font-size: 26px; margin-bottom: 10px; }
  .welcome p { font-size: 14px; opacity: 0.9; }
  .welcome .status { display: inline-block; margin-top: 14px; padding: 5px 16px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 20px; font-size: 12px; }
  .step-row { display: flex; justify-content: space-between; margin-bottom: 32px; position: relative; padding: 0 20px; }
  .step-row::before { content: ''; position: absolute; top: 20px; left: 70px; right: 70px; height: 2px; background: #e3e8ef; z-index: 0; }
  .step { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; z-index: 1; }
  .step-num { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 15px; background: #e3e8ef; color: #8c94a1; }
  .step.done .step-num { background: #52c41a; color: #fff; box-shadow: 0 2px 8px rgba(82,196,26,0.3); }
  .step.active .step-num { background: #1677ff; color: #fff; box-shadow: 0 2px 8px rgba(22,119,255,0.4); }
  .step-label { font-size: 12px; color: #8c94a1; }
  .step.active .step-label { color: #1677ff; font-weight: 500; }
  .card { background: #fff; border-radius: 10px; border: 1px solid #ecf0f5; padding: 24px 28px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .card h3 { font-size: 16px; color: #1f2d3d; margin-bottom: 12px; }
  .card p { font-size: 14px; color: #5a6472; margin-bottom: 12px; }
  .card ol, .card ul { margin: 0 0 12px 20px; }
  .card li { font-size: 14px; color: #5a6472; margin-bottom: 6px; }
  .prompt { background: #f8fafc; border: 1px solid #e3e8ef; border-radius: 8px; padding: 14px 16px; font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 13px; color: #1f2d3d; margin-bottom: 12px; word-break: break-all; }
  .notice { background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #ad6800; margin-bottom: 12px; }
  .footer { text-align: center; font-size: 12px; color: #9aa4b1; margin-top: 24px; }
  .btn { display: inline-block; padding: 8px 20px; background: #1677ff; color: #fff; border-radius: 6px; font-size: 14px; text-decoration: none; }
  @media (max-width: 640px) { .container { padding: 20px 14px; } .welcome { padding: 24px 18px; } .step-row { padding: 0 6px; } }
</style>
</head>
<body>
<div class="container">
  <div class="welcome">
    <h1>${projectName}</h1>
    <p>宜搭低代码应用 · 开发引导页</p>
    <div class="status">应用已创建 · 等待需求梳理与字段清单转换</div>
  </div>

  <div class="step-row">
    <div class="step done"><div class="step-num">✓</div><div class="step-label">创建应用</div></div>
    <div class="step active"><div class="step-num">2</div><div class="step-label">需求梳理</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-label">字段清单</div></div>
    <div class="step"><div class="step-num">4</div><div class="step-label">规则清单</div></div>
    <div class="step"><div class="step-num">5</div><div class="step-label">原型页面</div></div>
  </div>

  <div class="notice">
    ⚠️ 当前应用刚创建，尚未进行需求梳理与字段清单转换。转换完成后，本页将替换为完整的原型页面（表单列表/表单详情/数据清单）。
  </div>

  <div class="card">
    <h3>📌 下一步：需求梳理</h3>
    <p>请先准备应用的 <strong>开发框架 Excel 模板</strong>（在其中填写表单的类型、名称及字段等信息），然后使用 <strong>excel-to-form</strong> 技能将其转换为本地字段清单：</p>
    <div class="prompt">「调用技能 excel-to-form」将 Excel 模板转换成本地字段清单和规则清单，生成到 01需求梳理 目录下</div>
    <p>转换完成后，自动生成：字段清单.md、规则清单.md、应用分组.md 及原型页面。</p>
  </div>

  <div class="card">
    <h3>📋 已自动创建的内容</h3>
    <ul>
      <li><strong>01需求梳理/</strong> - 需求文档与字段清单目录</li>
      <li><strong>系统配置清单.md</strong> - 宜搭应用配置信息</li>
      <li><strong>README.md</strong> - 项目说明文档</li>
    </ul>
  </div>

  <div class="card">
    <h3>🛠 后续开发流程</h3>
    <ol>
      <li><strong>需求梳理</strong> - 用 excel-to-form 生成字段清单/规则清单/应用分组</li>
      <li><strong>原型预览</strong> - 用 form-to-prototype 生成 HTML 原型页面</li>
      <li><strong>生成配置</strong> - 用 form_creator 生成宜搭表单 JSON 配置</li>
      <li><strong>创建应用</strong> - 在宜搭平台创建应用和表单</li>
      <li><strong>同步配置</strong> - 用 config-sync 同步应用ID、表单UUID、组件ID</li>
      <li><strong>配置规则</strong> - 设置公式、校验、流程等业务规则</li>
      <li><strong>测试验证</strong> - 完成功能测试和数据验证</li>
      <li><strong>上线部署</strong> - 正式发布使用</li>
    </ol>
  </div>

  <div class="footer">${projectName} · 创建于 ${today} · 宜搭AI助手</div>
</div>
</body>
</html>
`;
}

// 命令行执行入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const projectName = args[0];

  if (!projectName || projectName.startsWith('-')) {
    console.error('❌ 错误: 请提供项目名称');
    console.log('');
    console.log('用法: node create-project.js "项目名称"');
    console.log('');
    console.log('示例:');
    console.log('  node create-project.js "进销存管理"');
    console.log('');
    process.exit(1);
  }

  try {
    const result = createProject(projectName);
    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 创建失败:', error.message);
    process.exit(1);
  }
}

module.exports = { createProject };
