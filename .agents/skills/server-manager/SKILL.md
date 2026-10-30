---
name: server-manager
description: 宜搭服务管理器，一键启动和管理宜搭开发所需的本地服务。当用户需要启动宜搭原型页面访问服务、启动同步配置服务、检查服务状态、或遇到"同步服务未启动"、"同步配置按钮不能用"、"无法访问原型页面"等问题时触发此skill。适用于所有宜搭应用的原型页面预览和配置同步场景。关键词：启动宜搭服务、启动同步服务、启动HTTP服务、服务没启动、同步配置失败、启动原型页面服务
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **禁止手动npx http-server启动** — 必须通过本Skill的管理脚本启动
2. **管理HTTP静态服务8080和同步配置服务3457** — 两个端口固定，不可更改
3. **【v3.0.0 多组织并存】所有 URL 中的项目目录段必须自动提取当前项目根目录名（即当前工作目录路径的最后一段，如 `d:\宜搭AI助手直播\宜搭AI助手V2.0.23` → `宜搭AI助手V2.0.23`），直接填入 URL，严禁输出 `{项目目录名}` 占位符让用户手动替换**

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

### 第2步：执行受跟踪的统一入口

AI 会话内只运行：

```bash
node .workbuddy-ai/run/ensure-service.js
```

只查状态用 `node .workbuddy-ai/run/ensure-service.js status --json`。不要直接在 AI 宿主里执行后端的 server_manager start/restart；detached 不保证逃离宿主 Job Object。用户双击批处理与服务内部仍可调用 server_manager，它是后端实现入口。

### 第3步：验证并转达结果

必须检查 `YIDA_READY` 的 ok=true，再原样转达 markdown 地址。失败时给出日志里的原因；只生成 URL 不表示服务已经就绪。不要拼地址或拉起系统外部浏览器，点击链接在宿主内置浏览器打开。

### 第4步：安全运行约定

默认静态/同步服务均绑定 127.0.0.1。写请求（包括有副作用的 GET/SSE）需会话 token；浏览器页面由静态服务自动注入公共客户端，CLI 使用 lib/local-service/client.js。凭证和工具内部目录不得作为静态资产公开。不存在关闭加固后继续交付的默认路径。

### 第5步：向用户报告结果

使用结构化格式展示结果：

```markdown
✅ **宜搭服务启动完成！**

## 服务状态

| 服务 | 端口 | 状态 |
|------|------|------|
| HTTP 静态服务 | 8080 | 🟢 运行中 |
| 同步配置服务 | 3457 | 🟢 运行中 |

## 访问地址

- [🏠 打开本地操作页面](http://127.0.0.1:8080/<项目目录段>/本地操作页面/index.html)（点击后在宿主的内部浏览器中打开）

## 使用说明

1. 通过上述地址访问原型页面（不要使用 file:// 打开）
2. 点击"🔄 同步配置"按钮即可同步表单配置
3. 所有应用共享此 HTTP 服务，无需重复启动
```

> ⚠️ 报告里的链接**直接取自脚本输出的 `markdown`**，必须是可点击的完整地址（含项目目录段，不留 `{项目目录名}` 占位符）。

## 三、输出规范

1. **必须展示服务状态表格**：包含服务名称、端口、运行状态
2. **必须输出脚本给出的可点击地址**：直接转达 `server_manager.js` 打印的 `markdown` 行，**禁止自行拼接 URL**；该规则对所有宿主一致，不因宿主有无 `open_preview` 而改变
3. **必须说明使用方式**：提醒用户不要使用 file:// 打开页面
4. **错误时必须说明原因**：如果启动失败，说明具体原因和解决方法

## 四、禁止事项

- ❌ 禁止通过 `file://` 协议访问原型页面（浏览器安全限制会导致同步配置按钮失效）
- ❌ 禁止重复启动已运行的服务（脚本会自动检测，但需向用户说明）
- ❌ 禁止为每个应用单独启动 HTTP 服务（所有应用共享同一个 8080 端口服务）
- ❌ 禁止修改同步服务的端口（原型页面中的 `SYNC_SERVICE_URL` 固定为 3457）
- ❌ **禁止手动使用 `npx http-server` 启动服务**（必须使用 `server_manager.js` 统一管理）
- ❌ **禁止打开 `http://127.0.0.1:8080/` 组织门户首页**（无实际意义，必须打开 `/{项目目录名}/本地操作页面/index.html`）
- ❌ **禁止调用外部浏览器**（`start http://...` / `Start-Process http://...` / `explorer http://...`）：只输出可点击链接，由用户在宿主内置浏览器中打开


> 📚 「五、常见问题与解决方案」（12K 完整排障过程）外移至 [references/故障排查手册.md](references/故障排查手册.md)；「七、版本更新记录」外移至 [references/version-history.md](references/version-history.md)（2026-10-30，与 AGENTS.md 6.x/事实层去重）。
## 六、检查清单

执行前确认：
- [ ] 已确定用户需要的操作（启动/停止/重启/检查）
- [ ] 项目根目录路径正确（`d:\宜搭AI助手直播\宜搭AI助手V2.0.22`）
- [ ] 【v3.6.0·P5-3】可选统一预检：`node .agents/skills/server-manager/scripts/agent_capabilities.js` 一条命令输出 JSON 摘要（Skill 概况/登录态/8080+3457 服务状态/配置可读性），登录态失效时退出码 1

执行后确认：
- [ ] 脚本执行完成并返回结果
- [ ] 已向用户展示服务状态
- [ ] **已输出可点击的访问地址**（Trae：预览框或 `browser_navigate`；DSH：Markdown 链接 + `Ctrl+T` 备选说明）
- [ ] 已提供访问地址和使用说明
- [ ] 遇到错误时提供了明确的错误信息和解决建议

## 八、快速参考

### 常用命令

| 操作 | 命令 |
|------|------|
| **启动服务（所有宿主统一）** | `node .agents/skills/server-manager/scripts/server_manager.js start` |
| 检查状态 + 权威地址 | `node .agents/skills/server-manager/scripts/server_manager.js status` |
| **仅取访问地址**（不启停服务） | `node .agents/skills/server-manager/scripts/server_manager.js url` |
| 停止服务 | `node .agents/skills/server-manager/scripts/server_manager.js stop` |
| 重启服务 | `node .agents/skills/server-manager/scripts/server_manager.js restart` |
| 仅启动同步服务 | `node .agents/skills/server-manager/scripts/server_manager.js start-sync` |
| 注册开机自启 | `node .agents/skills/server-manager/scripts/server_manager.js autostart-on` |
| 取消开机自启 | `node .agents/skills/server-manager/scripts/server_manager.js autostart-off` |
| 手动拉起服务（脱离宿主进程树） | `schtasks /Run /TN YidaServiceStart` |
| 删除计划任务 | `schtasks /Delete /TN YidaServiceStart /F` |

> **AI 唯一职责**：运行 `start` → 把脚本打印的 `markdown` 行原样转达。**不要自己拼 URL、不要自己开浏览器。**

### 服务配置

| 服务 | 端口 | 说明 |
|------|------|------|
| HTTP 静态服务 | 8080 | 为所有应用提供原型页面访问 |
| 同步配置服务 | 3457 | 处理"同步配置"按钮的请求 |

### 访问路径示例

```
http://127.0.0.1:8080/{项目目录名}/本地操作页面/index.html
http://127.0.0.1:8080/{项目目录名}/{应用名}/01需求梳理/原型页面/index.html
http://127.0.0.1:8080/{项目目录名}/{应用名}/01需求梳理/原型页面/templates/list.html?form={表单名}
```

详细文档请参考【Skill定义与内容规范.md】
