/**
 * 宜搭项目创建工具
 * 版本: 2.5.0
 * 更新日期: 2026-05-17
 *
 * 更新内容:
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

  console.log('=' .repeat(50));
  console.log('✅ 项目创建完成！\n');
  console.log('📋 项目结构:');
  console.log(`   ${projectName}/`);
  console.log(`   ├── 01需求梳理/`);
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
    configFile: path.join(projectName, '系统配置清单.md')
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
| 应用名称 | ${projectName} | 宜搭应用显示名称 |
| 应用ID | ${appIdValue} | 应用唯一标识（APP_XXX） |
| 访问地址 | ${appId ? `${domain}/app/${appId}/` : '待同步'} | 宜搭应用访问URL |
| 创建时间 | 待同步 | 应用创建时间 |
| 最后更新 | 待同步 | 最后更新时间 |

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
