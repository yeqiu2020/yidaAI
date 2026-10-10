# Node.js 环境变量问题

## 问题描述

执行 `node` 或 `npm` 命令时提示：
```
node : 无法将"node"项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

或

```
'node' is not recognized as an internal or external command
```

## 根因分析

### 情况1：Node.js 已安装但当前终端未识别
1. **Node.js 已正确安装**，但安装路径不在系统 PATH 中
2. **PowerShell 7 环境问题** - PowerShell 7 的 PATH 与系统 PATH 不同步
3. **当前终端会话未加载新环境变量** - 环境变量只在**新打开的终端**中生效

### 情况2：Node.js 安装在编辑器自带路径
- Trae 编辑器：`%USERPROFILE%\.trae-cn\binaries\node\versions\xx.x.x`
- Cursor 编辑器：`%USERPROFILE%\.cursor\binaries\node\versions\xx.x.x`
- CodeBuddy 编辑器：`%USERPROFILE%\.codebuddy\binaries\node\versions\xx.x.x`

这些路径通常不在系统 PATH 中，导致命令行无法识别。

## 解决方案

### 方案1：使用自动修复工具（推荐）

运行系统修复工具，自动查找并修复 Node.js 路径：

```powershell
node .agents/skills/system-troubleshooter/scripts/fix-node-path.js
```

或在其他脚本中引用：

```javascript
const fixNodePath = require('../system-troubleshooter/scripts/fix-node-path.js');

// 自动修复 Node.js 路径
const result = fixNodePath({ permanent: true });

if (result.success) {
  console.log('✅ Node.js 已可用，版本:', result.version);
} else {
  console.error('❌ 修复失败:', result.message);
}
```

**功能特点：**
- ✅ 自动查找常见安装路径（官方/Trae/Cursor/nvm等）
- ✅ 支持 PowerShell 7 环境自动同步
- ✅ 临时修复当前会话 + 永久添加到用户环境变量
- ✅ 返回详细修复结果

### 方案2：手动刷新环境变量（临时）

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
```

验证：
```powershell
node -v
npm -v
```

### 方案3：关闭并重新打开终端

1. 关闭所有终端窗口
2. 重新打开新的终端
3. 环境变量会自动生效

### 方案4：手动添加环境变量（永久）

1. 找到 Node.js 安装路径（如 `C:\Program Files\nodejs` 或 `%USERPROFILE%\.trae-cn\binaries\node\versions\22.22.2`）
2. 打开「系统属性」→「高级」→「环境变量」
3. 编辑「用户变量」中的 `Path`
4. 添加 Node.js 所在目录
5. 确定保存，重新打开终端

## 预防措施

1. **安装 Node.js 后**，务必关闭所有终端窗口并重新打开
2. **使用自动修复工具**，在脚本开头调用 `fixNodePath()`
3. **定期检查** 环境变量是否正确设置：
   ```powershell
   [Environment]::GetEnvironmentVariable('Path', 'User')
   ```

## 相关文件

- 自动修复脚本：`.agents/skills/system-troubleshooter/scripts/fix-node-path.js`
- Node.js 官网：https://nodejs.org/

## 更新记录

- **v1.1.0** (2026-08-01): 增加自动修复工具，支持 PowerShell 7 和编辑器自带 Node.js
- **v1.0.0** (2026-04-18): 初始版本，基础环境变量修复方案
