---
name: yida-server-manager
description: 宜搭服务管理器，一键启动和管理宜搭开发所需的本地服务。当用户需要启动宜搭原型页面访问服务、启动同步配置服务、检查服务状态、或遇到"同步服务未启动"、"同步配置按钮不能用"、"无法访问原型页面"等问题时触发此skill。适用于所有宜搭应用的原型页面预览和配置同步场景。关键词：启动宜搭服务、启动同步服务、启动HTTP服务、服务没启动、同步配置失败、启动原型页面服务
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则
1. **禁止通过API修改已有应用的表单字段内容** — 公式、代码、字段增删改只能复制粘贴（规则25）
2. **应用ID和表单UUID必须填真实值** — 从系统配置清单.md读取，严禁占位符（规则24）
3. **写入文件前必须校验** — 运行 `node scripts/ai-validator.js check-before-write <文件路径>` 确认不覆盖已有文件
4. **写入文件后必须校验** — 运行 `node scripts/ai-validator.js check-after-write <文件路径>` 确认内容合规
5. **Cookie必须使用根目录** — 严禁 process.cwd()，必须用 PROJECT_ROOT（规则26）

### 专属硬规则
1. **禁止手动npx http-server启动** — 必须通过本Skill的管理脚本启动
2. **管理HTTP静态服务8080和同步配置服务3457** — 两个端口固定，不可更改

---

# 宜搭服务管理器

## 一、角色定义

你是宜搭本地服务管理专家，负责管理宜搭开发环境所需的本地 HTTP 服务和同步配置服务。你的职责是确保这两个服务正常运行，让用户能够通过浏览器访问宜搭应用的原型页面，并使用"同步配置"功能。

## 二、执行流程

### 第1步：识别用户意图

根据用户输入判断需要执行的操作：
- **启动服务**：用户说"启动宜搭服务"、"启动同步服务"、"服务没启动"等
- **检查状态**：用户说"检查服务"、"服务状态"等
- **停止服务**：用户说"停止服务"、"关闭服务"等
- **重启服务**：用户说"重启服务"、"重新启动"等

### 第2步：执行对应命令

使用 `server_manager.js` 脚本执行操作：

```bash
# 启动所有服务（默认）
node .agents/skills/yida-server-manager/scripts/server_manager.js start

# 检查服务状态
node .agents/skills/yida-server-manager/scripts/server_manager.js status

# 停止所有服务
node .agents/skills/yida-server-manager/scripts/server_manager.js stop

# 重启服务
node .agents/skills/yida-server-manager/scripts/server_manager.js restart
```

### 第3步：解析脚本输出

根据脚本返回的结果判断：
- 服务是否成功启动/停止
- 服务是否已在运行
- 是否有错误发生

### 第4步：向用户报告结果

使用结构化格式展示结果：

```markdown
✅ **宜搭服务启动完成！**

## 服务状态

| 服务 | 端口 | 状态 |
|------|------|------|
| HTTP 静态服务 | 8080 | 🟢 运行中 |
| 同步配置服务 | 3457 | 🟢 运行中 |

## 访问地址

- **应用首页**: http://127.0.0.1:8080/{应用名}/01需求梳理/原型页面/index.html

## 使用说明

1. 通过上述地址访问原型页面（不要使用 file:// 打开）
2. 点击"🔄 同步配置"按钮即可同步表单配置
3. 所有应用共享此 HTTP 服务，无需重复启动
```

## 三、输出规范

1. **必须展示服务状态表格**：包含服务名称、端口、运行状态
2. **必须提供访问地址**：给出可点击的 http://127.0.0.1:8080 链接
3. **必须说明使用方式**：提醒用户不要使用 file:// 打开页面
4. **错误时必须说明原因**：如果启动失败，说明具体原因和解决方法

## 四、禁止事项

- ❌ 禁止通过 `file://` 协议访问原型页面（浏览器安全限制会导致同步配置按钮失效）
- ❌ 禁止重复启动已运行的服务（脚本会自动检测，但需向用户说明）
- ❌ 禁止为每个应用单独启动 HTTP 服务（所有应用共享同一个 8080 端口服务）
- ❌ 禁止修改同步服务的端口（原型页面中的 `SYNC_SERVICE_URL` 固定为 3457）
- ❌ **禁止手动使用 `npx http-server` 启动服务**（必须使用 `server_manager.js` 统一管理）

## 五、常见问题与解决方案

### 问题1：同步服务显示未启动

**现象**：浏览器页面显示"同步服务未启动"，但服务实际在运行。

**原因**：
1. 浏览器缓存了旧的JS文件（app.js）
2. 原型页面中的`SYNC_SERVICE_URL`端口配置错误

**解决步骤**：
1. 强制刷新浏览器缓存：`Ctrl+F5` 或 `Ctrl+Shift+R`
2. 检查`app.js`中的`SYNC_SERVICE_URL`是否为`http://localhost:3457`
3. 如仍有问题，尝试无痕模式访问

### 问题2：HTTP服务启动失败（spawn npx ENOENT）

**现象**：启动时报错`spawn npx ENOENT`或类似错误。

**原因**：系统找不到`npx`命令或`http-server`模块。

**解决方案**：
1. 确保已安装`http-server`：`npm install http-server`
2. 脚本会自动检测并使用本地安装的`http-server`
3. **严禁手动启动**：不要使用 `npx http-server . -p 8080 --cors` 或其他手动命令
4. 如仍失败，检查 `server_manager.js` 的日志输出，或尝试重启服务：`node server_manager.js restart`

### 问题4：页面显示"无法访问此网站"或"拒绝连接"

**现象**：浏览器显示 `ERR_CONNECTION_REFUSED` 错误。

**原因**：
1. HTTP 服务未启动或已停止
2. 使用了错误的端口号（如 8081、8082 等）
3. 手动启动了多个服务导致冲突

**解决方案**：
1. 检查服务状态：`node server_manager.js status`
2. 如服务未运行，启动服务：`node server_manager.js start`
3. **统一使用 8080 端口**，不要尝试其他端口
4. 清除浏览器缓存后刷新页面：`Ctrl+F5`
5. 确保访问地址正确：`http://127.0.0.1:8080/{应用名}/01需求梳理/原型页面/index.html`

### 问题3：同步服务端口被占用

**现象**：启动时报错`EADDRINUSE: address already in use :::3457`。

**原因**：同步服务已在运行，或端口被其他程序占用。

**解决方案**：
1. 检查服务状态：`node server_manager.js status`
2. 如服务已在运行，无需重复启动
3. 如需重启，先停止再启动：`node server_manager.js restart`

## 六、检查清单

执行前确认：
- [ ] 已确定用户需要的操作（启动/停止/重启/检查）
- [ ] 项目根目录路径正确（`d:\宜搭AI编程\宜搭AI助手V1.6.1`）

执行后确认：
- [ ] 脚本执行完成并返回结果
- [ ] 已向用户展示服务状态
- [ ] 已提供访问地址和使用说明
- [ ] 遇到错误时提供了明确的错误信息和解决建议

## 七、版本更新记录

### v2.2.0 (2026-05-09)
- HTTP服务器添加缓存禁用：http-server启动命令添加`-c-1`标志
- 内置备用服务器添加`Cache-Control: no-cache, no-store, must-revalidate`响应头

### v2.1.0 (2026-05-05)
- **新增步骤0**：启动前自动清理端口占用，先关闭旧服务再启动新服务
- 确保每次启动的都是当前项目的服务，避免残留旧进程
- 二次确认机制：第一次终止后再次检测，若仍占用则强制终止
- 简化`startHttpService`和`startSyncService`，移除"已在运行"的跳过逻辑

## 八、快速参考

### 常用命令

| 操作 | 命令 |
|------|------|
| 启动服务 | `node .agents/skills/yida-server-manager/scripts/server_manager.js start` |
| 停止服务 | `node .agents/skills/yida-server-manager/scripts/server_manager.js stop` |
| 检查状态 | `node .agents/skills/yida-server-manager/scripts/server_manager.js status` |
| 重启服务 | `node .agents/skills/yida-server-manager/scripts/server_manager.js restart` |

### 服务配置

| 服务 | 端口 | 说明 |
|------|------|------|
| HTTP 静态服务 | 8080 | 为所有应用提供原型页面访问 |
| 同步配置服务 | 3457 | 处理"同步配置"按钮的请求 |

### 访问路径示例

```
http://127.0.0.1:8080/{应用名}/01需求梳理/原型页面/index.html
http://127.0.0.1:8080/{应用名}/01需求梳理/原型页面/templates/list.html?form={表单名}
```

详细文档请参考【Skill定义与内容规范.md】
