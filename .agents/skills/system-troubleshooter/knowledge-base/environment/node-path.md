# Node.js 环境变量问题

## 问题描述

执行 `node` 或 `npm` 命令时提示：
```
node : 无法将"node"项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

## 根因分析

1. **Node.js 已正确安装**，安装路径为 `C:\Program Files\nodejs\`
2. **系统环境变量已更新**，`Path` 变量已包含 `C:\Program Files\nodejs\`
3. **当前终端会话未加载新环境变量** - 这是 Windows 的正常行为，环境变量只在**新打开的终端**中生效

## 解决方案

### 方案1：刷新当前终端环境变量（立即生效）

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
```

验证：
```powershell
node -v
npm -v
```

### 方案2：关闭并重新打开终端（推荐）

1. 关闭所有终端窗口
2. 重新打开新的终端
3. 环境变量会自动生效

### 方案3：修改 Skill 脚本（长期解决）

在 Skill 脚本中添加 Node.js 路径检测，使用完整路径调用：

```javascript
const fs = require('fs');
const { execSync } = require('child_process');

// Node.js 路径（解决环境变量未生效问题）
const NODE_PATH = process.env.NODE_PATH || 'C:\\Program Files\\nodejs\\node.exe';

// 使用完整路径执行
const nodeCmd = fs.existsSync(NODE_PATH) ? NODE_PATH : 'node';
execSync(`"${nodeCmd}" "${scriptPath}"`, { encoding: 'utf-8' });
```

**已修复的 Skill：**
- `yida-config-sync/scripts/sync_form_list_playwright.js`
- `yida-config-sync/scripts/sync_form_schemas.js`

## 预防措施

1. **安装 Node.js 后**，务必关闭所有终端窗口并重新打开
2. **在脚本中**，优先使用完整路径调用 Node.js，避免依赖环境变量
3. **定期检查** 环境变量是否正确设置：
   ```powershell
   [Environment]::GetEnvironmentVariable('Path', 'Machine')
   ```

## 相关文件

- Node.js 安装路径：`C:\Program Files\nodejs\`
- 环境变量位置：系统属性 → 高级 → 环境变量 → Path

## 参考

- 问题发现时间：2026-04-18
- 修复版本：yida-config-sync v3.8.1
