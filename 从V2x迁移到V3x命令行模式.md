# 从 V2.x 整包模式迁移到 V3.x 命令行模式

> 适用于：使用 V2.x 整包下载/克隆模式的用户迁移到 V3.x `npm install -g yidaai` 模式

---

## 一、迁移前准备

### 1.1 检查当前版本

```bash
# 如果旧项目根目录有 package.json，查看版本
node -e "console.log(require('./package.json').version)"

# 如果安装了 yida-helper
yida-helper version
```

### 1.2 备份旧项目

```bash
# 复制旧项目目录为备份
cp -r ~/宜搭AI助手V2.0.21 ~/宜搭AI助手V2.0.21.backup
```

### 1.3 确认 Node.js 版本

```bash
node -v  # 需要 >= 18
```

---

## 二、安装 V3.x

### 2.1 全局安装

```bash
npm install -g yidaai
```

安装后会自动：
- 注册 `yida-helper` 和 `yidaazs` 命令
- 将 skills 分发到所有已安装的 AI 工具目录（Trae、Cursor、Claude 等）
- 创建全局数据目录 `~/.yida-ai-helper/`

### 2.2 验证安装

```bash
yida-helper version    # 应输出 3.0.0
yida-helper doctor     # 环境体检
yida-helper help       # 查看所有命令
```

---

## 三、迁移数据

### 3.1 自动迁移（推荐）

```bash
# 在新工作目录执行
mkdir ~/my-yida-project && cd ~/my-yida-project

# 初始化新项目骨架
yida-helper init

# 迁移旧项目数据
yida-helper migrate ~/宜搭AI助手V2.0.21
```

`migrate` 命令会自动完成：
- ✅ 复制 `组织及应用信息.md` → 新目录 + 全局备份
- ✅ 复制 `.cookies.json` → 全局目录（如果全局不存在）
- ✅ 复制 `本地操作页面/` → 新目录
- ✅ 检测旧 `.agents/skills/` 并提示后续 `copy` 命令

### 3.2 手动迁移（可选）

如果需要手动迁移，按以下步骤：

#### Cookie 迁移

```bash
# 创建全局数据目录
mkdir -p ~/.yida-ai-helper

# 复制 Cookie 到全局
cp ~/宜搭AI助手V2.0.21/.cookies.json ~/.yida-ai-helper/.cookies.json
```

#### 组织信息迁移

```bash
# 复制到新项目目录
cp ~/宜搭AI助手V2.0.21/组织及应用信息.md ~/my-yida-project/

# 也复制到全局（作为备份）
cp ~/宜搭AI助手V2.0.21/组织及应用信息.md ~/.yida-ai-helper/
```

#### 本地操作页面迁移

```bash
cp -r ~/宜搭AI助手V2.0.21/本地操作页面 ~/my-yida-project/
```

---

## 四、迁移后验证

### 4.1 验证登录态

```bash
yida-helper doctor
# 检查"登录态"一项是否显示"已登录"
```

### 4.2 验证服务启动

```bash
# 在新项目目录启动服务
cd ~/my-yida-project
yida-helper start

# 预期输出：
# ✅ HTTP 服务: 启动成功
# ✅ 同步服务: 启动成功
```

### 4.3 验证 skills 分发

```bash
# 重新分发 skills 到各 AI 工具
yida-helper copy

# 或仅分发到指定工具
yida-helper copy --tool cursor
```

### 4.4 验证脚本执行

```bash
# 透传执行任意 skill 脚本
yida-helper run hello-world-custom/scripts/main.js
# 应输出 "success: true"
```

---

## 五、V2.x → V3.x 变化对照

| 项目 | V2.x（整包模式） | V3.x（命令行模式） |
|------|------------------|-------------------|
| 安装方式 | 下载/克隆整个项目 | `npm install -g yidaai` |
| 命令入口 | `node .agents/skills/xxx/scripts/yyy.js` | `yida-helper run xxx/scripts/yyy.js` |
| Cookie 位置 | 项目根目录 `.cookies.json` | 全局 `~/.yida-ai-helper/.cookies.json` |
| Skills 位置 | 项目 `.agents/skills/` | 包内 + 全局分发到各工具 |
| 服务启动 | `node .agents/skills/server-manager/scripts/server_manager.js start` | `yida-helper start` |
| 更新方式 | 重新下载/克隆 | `yida-helper update` |
| 多项目共享 | 每个项目独立 Cookie | 全局 Cookie 共享 |

---

## 六、常见问题

### Q1: 迁移后旧项目还能用吗？

可以。V3.x 完全向后兼容：
- 旧项目目录的 `.cookies.json` 仍可被 `findCookieFile()` 识别（回退机制）
- 旧项目 `.agents/skills/` 仍可直接执行
- `yida-helper` 命令在旧项目目录下也能正常工作

### Q2: Cookie 迁移后需要重新登录吗？

不需要。`migrate` 命令会将 Cookie 复制到全局目录，所有项目共享。但如果 Cookie 已过期（通常有效期 7 天），需要 `yida-helper login` 重新登录。

### Q3: 多个 AI 工具怎么配置 skills？

安装时自动分发。如果后续安装了新的 AI 工具，运行 `yida-helper copy` 重新分发即可。

### Q4: 如何回退到 V2.x？

直接使用旧项目目录即可，V3.x 不会破坏旧项目。如需完全卸载 V3.x：
```bash
npm uninstall -g yidaai
```

---

## 七、迁移检查清单

- [ ] Node.js >= 18 已安装
- [ ] `npm install -g yidaai` 安装成功
- [ ] `yida-helper version` 输出 3.0.0
- [ ] `yida-helper init` 初始化新项目
- [ ] `yida-helper migrate <旧项目路径>` 迁移数据
- [ ] `yida-helper doctor` 体检通过
- [ ] `yida-helper start` 双服务启动成功
- [ ] `yida-helper copy` skills 分发成功
- [ ] `yida-helper run hello-world-custom/scripts/main.js` 执行成功
