# 终端中文乱码问题

## 问题描述

运行 Node.js 脚本时，中文字符显示为乱码。

**现象示例：**
```
瀹滄惌缁勭粐鍒濆鍖栧惎鍔ㄥ櫒  (应为：宜搭组织初始化启动器)
```

## 环境信息

- **操作系统**: Windows
- **终端**: PowerShell / Trae IDE 终端
- **Node.js**: v22.22.2
- **触发场景**: 运行任何输出中文的 Node.js 脚本

## 根因分析（5 Whys）

1. **为什么显示乱码？**
   - Node.js 输出 UTF-8 编码的中文，但终端显示为乱码

2. **为什么终端无法正确显示？**
   - PowerShell 的 `$OutputEncoding` 默认为 US-ASCII (CodePage 20127)

3. **为什么使用 US-ASCII？**
   - PowerShell 默认输出编码不支持 UTF-8 多字节字符

4. **为什么 Node.js 使用 UTF-8？**
   - Node.js 默认使用 UTF-8 编码输出

5. **根本原因**
   - **编码不匹配**: Node.js (UTF-8) → PowerShell (US-ASCII) → 终端 (GB2312)

## 诊断步骤

1. 检查当前编码设置：
   ```powershell
   [Console]::OutputEncoding    # 应为 UTF8
   $OutputEncoding               # 应为 UTF8
   chcp                          # 应为 65001
   ```

2. 验证问题：
   ```powershell
   node -e "console.log('中文测试')"
   # 如果显示乱码，确认问题存在
   ```

## 解决方案

### 方案1：全局永久设置（推荐）⭐

**这是最根本的解决方案，一次设置，所有终端生效。**

创建或修改 PowerShell 配置文件，添加 UTF-8 编码设置：

```powershell
# 创建配置文件（如果不存在）
New-Item -Path $PROFILE -Type File -Force

# 添加 UTF-8 编码设置
Add-Content -Path $PROFILE -Value "`n# 设置 UTF-8 编码，解决中文乱码问题`n`$OutputEncoding = [System.Text.Encoding]::UTF8`n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`nchcp 65001 | Out-Null"

# 重新加载配置文件（或重启终端）
. $PROFILE
```

**配置文件位置**: `C:\Users\<用户名>\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`

**优点**: 
- ✅ 永久生效，无需每次设置
- ✅ 所有 PowerShell 终端自动应用
- ✅ 不需要修改任何 Skill 脚本
- ✅ 最彻底的解决方案

**缺点**: 无

---

### 方案2：临时设置（用于单次执行）

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
node your-script.js
```

**优点**: 立即生效，不影响其他会话
**缺点**: 仅当前终端会话有效

---

### 方案3：脚本自动处理（备用方案）

如果无法修改 PowerShell 配置文件，可以在 Skill 脚本中自动设置编码：

#### 方法 A：使用统一工具

引用 `system-troubleshooter` 提供的统一编码设置工具：

```javascript
// 在脚本开头引用
const setUtf8Encoding = require('../system-troubleshooter/scripts/set-utf8-encoding.js');

// 设置 UTF-8 编码
setUtf8Encoding();

// 后续代码...
console.log('中文输出正常');
```

#### 方法 B：内联代码

```javascript
const { execSync } = require('child_process');

// Windows 平台设置 UTF-8 代码页
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误，继续执行
  }
}
```

**优点**: 脚本自包含，不依赖外部环境
**缺点**: 需要修改每个 Skill 脚本，维护成本高

## 推荐方案总结

| 方案 | 适用场景 | 优先级 |
|------|---------|--------|
| **方案1：全局永久设置** | 所有开发环境 | ⭐⭐⭐ 首选 |
| **方案2：临时设置** | 单次测试 | ⭐⭐ 备用 |
| **方案3：脚本自动处理** | 无法修改环境时 | ⭐ 兜底 |

## 验证修复

执行以下命令验证中文显示是否正常：

```powershell
node -e "console.log('中文测试')"
# 应输出: 中文测试
```

## 预防措施

1. **新环境初始化**
   - 在新机器或新用户环境下，首先配置 PowerShell UTF-8 编码
   - 将编码设置纳入环境初始化流程

2. **团队协作**
   - 统一使用方案1（全局永久设置）
   - 在团队文档中明确编码规范

3. **CI/CD 环境**
   - 在自动化脚本中设置编码
   - 确保构建服务器使用 UTF-8 编码

## 相关文件

### 统一工具
- `.agents/skills/system-troubleshooter/scripts/set-utf8-encoding.js` - UTF-8 编码设置工具

### PowerShell 配置文件
- 路径: `$PROFILE` (通常为 `C:\Users\<用户名>\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`)
- 内容:
  ```powershell
  # 设置 UTF-8 编码，解决中文乱码问题
  $OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  chcp 65001 | Out-Null
  ```

## 参考

- [Microsoft Docs: About Character Encoding](https://docs.microsoft.com/powershell/module/microsoft.powershell.core/about/about_character_encoding)
- Node.js 官方文档: Buffer 和字符编码

## 记录信息

- **首次发现**: 2026-04-18
- **记录人**: AI Assistant
- **严重程度**: P2 - 一般（有 workaround）
- **状态**: 已解决
- **解决版本**: system-troubleshooter v1.1.0
- **更新记录**:
  - 2026-04-19: 添加全局永久设置方案作为首选解决方案
