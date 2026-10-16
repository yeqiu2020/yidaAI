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

### 第2步：执行对应命令

**【v3.3.0 强制】启动服务必须走『前台 8080 + start-sync』两段式流程**（通过 integrated_code_mode 的 `Exec` 调用 `tools.run_command` 执行，**禁用普通 Shell 后台启动**）。

> 原因：`open_preview` 预览框要求 `command_id` 对应一个**正在运行（Running）**的 `web_server` 类型命令；`server_manager.js start` 是 daemon 化启动（脚本退出，命令 Exited），永远无法生成预览框。

**步骤A — 前台启动 8080 静态服务**（在 Exec 中执行 `tools.run_command`）：

```js
const r = await tools.run_command({
  command: 'node .agents/skills/server-manager/scripts/_builtin_server.js "D:\\宜搭AI助手直播" 8080',
  blocking: false,              // 必须 false：web 服务器长驻
  command_type: 'web_server',   // 必须 web_server：让 IDE 识别为本地服务器
  target_terminal: 'new',
  requires_approval: false,
  wait_ms_before_async: 2500,
  cwd: 'D:\\宜搭AI助手直播\\宜搭AI助手V2.0.32'
});
// r.status 应为 Running，r.command_id 记下来 → 第4步 open_preview 必须用它
```

**步骤B — 启动同步配置服务**（短命令，3457 已运行会自动复用，不会触碰 8080）：

```bash
node .agents/skills/server-manager/scripts/server_manager.js start-sync
```

**若 8080 被旧的后台服务占用**，先执行清理再走步骤A：

```bash
node .agents/skills/server-manager/scripts/server_manager.js stop
```

其他操作（检查状态/停止/重启）仍用普通命令：

```bash
node .agents/skills/server-manager/scripts/server_manager.js status
node .agents/skills/server-manager/scripts/server_manager.js stop
# 重启 = stop 后走步骤A + 步骤B
```
### 第3步：解析脚本输出

根据脚本返回的结果判断：
- 服务是否成功启动/停止
- 服务是否已在运行
- 是否有错误发生

### 第4步：打开首页（生成预览框）

服务启动成功后，**必须执行以下操作**：

1. **【首选】调用 open_preview 生成预览框**（在 Exec 中执行 `tools.open_preview`）：
   - `preview_url` **只能设为** `http://127.0.0.1:8080/{项目目录名}/本地操作页面/index.html`（⚠️ 严禁打开 `http://127.0.0.1:8080/` 组织门户首页，无实际意义）
   - `command_id` **必须用第2步步骤A返回的、状态为 Running 的 command_id**（这是成败关键：传已退出命令的 ID 会超时）
   - 成功标志：返回 `success: true`，对话中渲染出可点击的预览框，点击即跳转 Trae 内部浏览器
2. **失败处理（最多重试 1 次）**：OpenPreview 可能返回 `net::ERR_ABORTED` 或 `IDE Command timeout`——这是 Trae IDE 预览/命令通道的间歇性故障，不代表服务未启动；重试 1 次仍失败立即切换兜底，禁止反复重试
3. **【兜底】内置浏览器直接打开**（在 Exec 中执行）：
   - `await tools.browser_navigate({url: 'http://127.0.0.1:8080/{项目目录名}/本地操作页面/index.html'})`（URL 中文路径建议用编码形式）
   - 兜底也超时则输出完整 URL 文字，并说明服务已正常运行
4. **【强制】严禁调用外部浏览器**：禁止 `start http://...`、`Start-Process http://...` 等打开系统默认浏览器的命令
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

- [🏠 打开本地操作页面](http://127.0.0.1:8080/{项目目录名}/本地操作页面/index.html)（页面已通过内置浏览器自动打开，此链接仅作备份）

## 使用说明

1. 通过上述地址访问原型页面（不要使用 file:// 打开）
2. 点击"🔄 同步配置"按钮即可同步表单配置
3. 所有应用共享此 HTTP 服务，无需重复启动
```

## 三、输出规范

1. **必须展示服务状态表格**：包含服务名称、端口、运行状态
2. **必须用内部浏览器打开页面**：优先调用 OpenPreview 生成预览框（点击即跳转内部浏览器）；OpenPreview 不可用时通过 Exec 调用 `browser_navigate` 兜底；同时输出完整 URL 文字备份；严禁调用外部浏览器（禁止 `start http://...` / `Start-Process http://...` 等命令）
3. **必须说明使用方式**：提醒用户不要使用 file:// 打开页面
4. **错误时必须说明原因**：如果启动失败，说明具体原因和解决方法

## 四、禁止事项

- ❌ 禁止通过 `file://` 协议访问原型页面（浏览器安全限制会导致同步配置按钮失效）
- ❌ 禁止重复启动已运行的服务（脚本会自动检测，但需向用户说明）
- ❌ 禁止为每个应用单独启动 HTTP 服务（所有应用共享同一个 8080 端口服务）
- ❌ 禁止修改同步服务的端口（原型页面中的 `SYNC_SERVICE_URL` 固定为 3457）
- ❌ **禁止手动使用 `npx http-server` 启动服务**（必须使用 `server_manager.js` 统一管理）
- ❌ **禁止打开 `http://127.0.0.1:8080/` 组织门户首页**（无实际意义，必须打开 `/{项目目录名}/本地操作页面/index.html`）

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
5. 确保访问地址正确：`http://127.0.0.1:8080/{项目目录名}/{应用名}/01需求梳理/原型页面/index.html`

### 问题3：同步服务端口被占用

**现象**：启动时报错`EADDRINUSE: address already in use :::3457`。

**原因**：同步服务已在运行，或端口被其他程序占用。

**解决方案**：
1. 检查服务状态：`node server_manager.js status`
2. 如服务已在运行，无需重复启动
3. 如需重启，先停止再启动：`node server_manager.js restart`

### 问题5：切换项目后服务残留，同步/页面指向旧项目目录

> **v3.0.0 多组织并存模式已彻底解决此问题**：全局服务以 `staticRoot`（公共父目录）为根启动，URL 首段即项目目录名，各项目互不干扰，切换项目无需重启服务。

**现象（仅旧版 v2.x 单项目模式适用）**：用户在 A 项目（如 V2.0.22）启动过服务，之后切到 B 项目（如 V2.0.23）开发，忘记重启服务。浏览器打开门户页面时，页面内容和"同步到本地"都指向 **旧项目 A 的目录**，新项目 B 下找不到同步出来的文件夹。

**⚠️ 变体（2026-10-13/14 新鑫科技AI助手实测）：从项目内子目录启动 3457 + 旧版前端缓存劫持**——两个叠加根因：
1. **服务 cwd 落在项目内子文件夹（如 本地操作页面）**：不报任何错，`组织及应用信息.md`、`.cookies.json`、门户创建的应用文件夹全部写进该子目录。识别特征：`/health` 返回的 `cwd` 不是项目根；「组织及应用信息.md」中「本地门户」URL 出现双重段（如 `…/本地操作页面/本地操作页面/index.html`）。
2. **前端缓存劫持（修复 cwd 后仍复发的原因）**：index.html 引用 dashboard.js 的缓存参数长期停在 `?v=1.8.0`，浏览器永远拿不到 v1.10.0 的单项目布局适配，把 URL 首段 `本地操作页面` 当项目名发 `projectDir=本地操作页面`；服务端 `resolveProjectDir` v3.0.1「目录存在即接受」分支放行，定位被劫持。且错位目录一旦有 md 残留，referer 兜底/唯一项目扫描也会持续命中，**自我延续**。
处置：杀 3457 → 子目录里的 md/cookies/应用文件夹移到项目根并合并数据 → 修 dir-ops.js（v3.1.0 单项目布局防护：hasOrgConfig(staticRoot) 时相对 projectDir 一律落 staticRoot、跳过 referer/子目录扫描）→ 升 dashboard.js 缓存参数（?v=1.10.1）→ 以项目根为 cwd 重启（见问题8）。

**根因（旧版）**：HTTP(8080) 与同步服务(3457) 是全局端口，由**第一次启动它们的项目目录**持有。页面/同步接口通过 `process.cwd()` 定位项目目录，进程 cwd = 旧项目 A，所以数据全部写入 A。

**识别方法**：
1. 检查端口归属：`Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 8080, 3457 }`
2. 查看占用进程的工作目录（`sync_server.js` / `http-server` 的启动路径）
3. 打开门户页面后看企业名称后是否显示**当前服务目录徽标**（v1.7.0 起，如 `云途数字技术 宜搭AI助手V2.0.23`）——若徽标目录 ≠ 当前项目目录，说明服务残留

**解决方案**：
1. **（v3.0.0 推荐）门户页面一键重启**：打开 `http://127.0.0.1:8080/{项目目录名}/本地操作页面/index.html`，点击组织头部的「🔄 重启服务」按钮，服务将自动重启全局服务（通过 `/restart-service` 接口触发 `server_manager.js restart`，重启后页面自动刷新）。**前提**：当前 8080/3457 由最新版 sync_server（v2.9.0+）提供；若是旧版本服务，需先用方案 2 重启一次。
2. 停止旧项目服务：`node server_manager.js stop`（在旧项目目录执行）或清理占用端口进程
3. 在**当前项目目录**重新启动：`node server_manager.js start`
4. 重新打开门户页面确认目录徽标正确
5. 已同步到错误目录的数据，将文件夹移动到当前项目根目录即可

**注意**：
- 门户页面「重启服务」按钮 = `POST /restart-service`，sync_server 收到后 spawn 独立 `server_manager.js restart` 进程并自动退出，由新进程接管端口
- 重启后前端逻辑：轮询 `/health` 恢复 → 延迟 3 秒 → 刷新页面；`loadOrgInfo` 失败自动重试 3 次（v1.7.1）
- Trae 终端环境下子进程会被终端 Job Object 清理，`server_manager.js start` 启动的服务可能在终端关闭后消失。**根治方案见「问题9」**（用任务计划程序拉起，完全脱离 Trae）。⚠️ 旧的「用 autostart-on 比手动建计划任务更简单」说法已过时——autostart-on 只覆盖"开机"场景，**不解决"本次会话内关 Trae"**；且两者功能重叠，二选一即可。
- **autostart-on 前置条件（v3.0.1）**：项目根目录必须存在 `启动宜搭服务.bat` 源文件，否则报「未找到 启动宜搭服务.bat」。该 bat 需 **GBK 编码**（中文路径乱码），内容为：
  ```
  @echo off
  chcp 65001 >nul 2>&1
  cd /d "D:\项目根目录"
  start /min "" node ".agents\skills\server-manager\scripts\server_manager.js" start
  ```
  源文件不存在时，先用 PowerShell 以 GBK 编码创建（`[System.IO.File]::WriteAllText($batPath, $content, [System.Text.Encoding]::GetEncoding('GBK'))`），再执行 autostart-on
- **取消开机自启**：`node .agents/skills/server-manager/scripts/server_manager.js autostart-off`

### 问题6：同步把表单分组平铺到了项目根目录（应用名这一层丢失）

> **v3.0.4 已在 sync_server.js 侧加拦截修复**：同步目标目录必须叠加应用名。

**现象**：点击某应用的「同步到本地」后，本该出现在 `项目根/{应用名}/` 下的表单分组目录（如 `公式`、`业务规则「分组」`、`发起审批「分组」` 及表单目录），被**平铺写到了项目根目录**（与 `本地操作页面`、`lib`、`.agents` 平级），且没有生成同级 `应用名` 目录。

**根因**：同步服务（3457）进程的 `STATIC_ROOT`（= `process.cwd()`）与多项目静态服务根（8080，=公共父目录）曾不一致；同步目标本应为 `项目根/{应用名}`，当应用名未参与目标路径时，内容被直接写入项目根。这是历史遗留 + 同步目标定位缺少强校验共同导致。

**识别方法**：打开本地操作页面 / 直接在命令行列出项目根目录，若出现成批的 `xxx「分组」`/`xxx「表单」` 目录且没有对应 `应用名` 上级目录，即为平铺。

**解决方案**：
1. sync_server v3.0.4 起，`/sync-app-to-local`、`/sync-app-to-local-stream`、`/sync-config` 三个同步接口均校验目标目录 = `项目根/{应用名}`；若应用名为空或目标回退到项目根，会直接返回错误并拦截，**不再静默平铺**。
2. 已平铺到项目根的孤儿目录不会自动归位：如需归位，手动移动到 `项目根/{应用名}/` 下即可；不需要可直接删除。

### 问题7：前台启动 8080 报 MODULE_NOT FOUND: _builtin_server.js（v3.3.1 实测踩坑）

**现象**：按 v3.3.0 步骤A执行 `node .agents/skills/server-manager/scripts/_builtin_server.js "D:\宜搭AI助手直播" 8080`，报 `Error: Cannot find module '..._builtin_server.js'`，run_command 状态为 Exited。

**根因**：`_builtin_server.js` 是**临时文件**——仅当 staticRoot（公共父目录）下找不到 http-server 时，`server_manager.js start` 才调用 `ensureBuiltinServerScript()` 生成它；而 `stopAll()` 停止服务时会**主动 unlink 删除该文件**（server_manager.js 第 598-600 行）。因此：
- 首次全新环境 / 刚执行过 `stop` → 文件不存在 → 步骤A直接失败
- 本项目 http-server 装在**项目目录**内而 staticRoot 是**公共父目录**，检测路径不匹配，start 永远走"内置静态服务器"分支（会生成文件）

**解决方案（实测可行，两段式前置补丁）**：
1. 先跑一次 `node .agents/skills/server-manager/scripts/server_manager.js start` —— 生成 `_builtin_server.js` 并后台启动 8080+3457
2. **不要跑 `stop`**（会删文件）—— 直接 `taskkill /PID <8080的PID> /F /T` 只杀 HTTP 进程（3457 保留，无需 start-sync）
3. 再执行 v3.3.0 步骤A前台 run_command 启动 `_builtin_server.js`（此时文件存在，状态 Running）
4. open_preview 用新的 command_id 打开预览框

**教训**：Skill 文档引用的脚本若由运行时生成，必须在文档中注明其生成/销毁时机；`stop` 删除临时文件的设计与 v3.3.0 前台启动流程存在脱节。

### 问题8：Background 模式启动 8080/3457 的**正确姿势**（v3.4.0 实测确认）

**⚠️ 核心约束：`STATIC_ROOT = process.cwd()`。启动 cwd 决定一切。**

| 服务 | 启动 cwd | 说明 |
|------|---------|------|
| 8080 `_builtin_server.js` | **任意**（建议 staticRoot） | staticRoot 由**第 1 个位置参数显式传入**，不受 cwd 影响 |
| 3457 `sync_server.js` | **必须是 staticRoot（公共父目录）** | `STATIC_ROOT = process.cwd()`，cwd 错则 `/org-info`、同步定位全错 |

**正确启动命令（Background 模式，脱离终端也不掉）**：

```
# 8080 —— 第1参数显式传 staticRoot
cd "<staticRoot>" && node "<项目根>/.agents/skills/server-manager/scripts/_builtin_server.js" "<staticRoot>" 8080

# 3457 —— cwd 必须是 staticRoot
cd "<staticRoot>" && node "<项目根>/.agents/skills/form_creator/scripts/sync_server.js"
```

**为什么不用 `server_manager.js start`**：该命令用 `spawn(detached:true, stdio:'ignore') + unref()` 起子进程，
在本 Agent 宿主里**会话一结束子进程即被回收**（Job Object 清理）。表现为脚本自报
「🎉 所有服务已就绪！」但 `status` 立刻变两个 🔴。改用 Background 模式直接跑两个脚本反而稳定。

**⚠️ 若误用「项目根」作为 3457 的 cwd**，会触发连锁故障：
`STATIC_ROOT` 错位 → `path.join(staticRoot, '{项目名}')` 多套一层 →
`resolveProjectDir` 报「传入的 projectDir 无效」并回退 referer → **可能同步到错误项目**。
（该误导性日志已于 sync_server v3.0.9 修复：`resolveProjectDir` 补
`hasOrgConfig(staticRoot)` 兜底；但**启动 cwd 仍必须正确**，修复只是容错而非替代。）

**验证三连（缺一不可）**：
```bash
netstat -ano | grep LISTENING | grep -E ":8080|:3457"        # ① 端口真的在监听
curl -s --noproxy '*' http://127.0.0.1:3457/health           # ② 直连拿 version/staticRoot/cwd
curl -s --noproxy '*' -o /dev/null -w "%{http_code}" "<门户URL>"  # ③ 门户页 200
```

**⚠️ 必须加 `--noproxy '*'`**：本机存在 HTTP 代理时会拦截 127.0.0.1，
不绕过则 curl 返回 `upstream connect failed: 由于目标计算机积极拒绝`（**假失败**），
容易被误判为"服务未启动"。8080 则返回 502（也是代理产生的，非服务本身故障）。

**教训**：脚本自报的成功 ≠ 服务存活。**必须 netstat + 直连 HTTP 双重证实，且显式 bypass 代理。**

### 问题9：关 Trae 服务就掉——Job Object 病根只能用「计划任务」根治（v3.5.0 实测根治）

**现象**：用户每次「启动宜搭服务」都成功，但只要关闭 Trae 重新登录，8080/3457 就消失，必须再启动一次，反复循环。

**根因（问题8 已诊断但未根治）**：Trae 终端创建的进程属于该终端的 **Job Object**。`server_manager.js start` 用的是 `spawn(detached:true, stdio:'ignore') + unref()`（server_manager.js 第 407-434 行），`detached` 只让子进程脱离 node 父进程，**并未脱离终端的 Job Object**。因此无论 `start`（daemon 化）、问题7 的「前台 run_command」、还是问题8 的「Background 模式」，只要**启动方在 Trae 内**，Trae 关闭 → Job Object 销毁 → 8080/3457 一起被杀。

> ⚠️ **问题8 的 Background 模式治标不治本**：它让服务在"本次会话内"更稳定，但仍在 Agent 宿主的 Job Object 内。实测：`start` 自报「🎉 所有服务已就绪！」，会话结束 `status` 却两个 🔴。

**根治方案（唯一根治：让启动方脱离 Trae）——任务计划程序**：

```powershell
$taskName = 'YidaServiceStart'
$scriptPath = '<项目根>\.agents\skills\server-manager\scripts\server_manager.js'
$nodeExe = '<node.exe 绝对路径>'   # 例 C:\Users\Administrator\.trae-cn\binaries\node\versions\22.22.2\node.exe

# ① 注册：开机触发（ONSTART），/F 覆盖同名任务
schtasks /Create /TN $taskName /TR "`"$nodeExe`" `"$scriptPath`" start" /SC ONSTART /RU "$env:USERNAME" /RL LIMITED /F

# ② 立即触发一次（此刻由 Task Scheduler 拉起，不受 Trae 控制）
schtasks /Run /TN $taskName
```

**关键点**：
1. 计划任务由 Windows Task Scheduler 执行，**不继承任何终端的 Job Object**，因此关 Trae 不影响服务。
2. **无需指定 `/TR` 的工作目录**：`server_manager.js` 的 `CONFIG.projectRoot` 会向上查找 `.agents`（第 58-64 行），不依赖 cwd；`staticRoot = dirname(projectRoot)`，均自动推导。
3. **必须在 Trae 内先杀掉占用端口的孤儿进程**，否则 `start` 会走「端口已被全局服务占用，复用」分支（第 395-398 行）**直接复用那个会死的进程**，等于没换：
   ```powershell
   taskkill /PID <8080的PID> /F /T    # 8080 先杀
   # 3457 若显示🟢但可能是残留，也可一并 taskkill 后让计划任务重新拉起两个端口
   ```
4. **验证父子进程已脱离**（父进程为空 = 独立）：
   ```powershell
   Get-NetTCPConnection -State Listen -LocalPort 8080,3457 | ForEach-Object {
     $p = Get-Process -Id $_.OwningProcess; $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)"
     "端口 $($_.LocalPort) PID=$($_.OwningProcess) 父PID=$($p.ParentProcessId) 父进程=$($pp.Name)"
   }
   ```
   父PID/父进程为空 → 已脱离 Trae，成功。
5. **验证任务本身**：`(Get-ScheduledTask -TaskName 'YidaServiceStart').State` 应为 `Ready`；`LastTaskResult` = `0` 表示上次运行成功。

**日常维护命令**：
```powershell
schtasks /Run /TN YidaServiceStart                          # 手动拉起（服务挂了随时用）
schtasks /Query /TN YidaServiceStart                          # 查看状态
schtasks /Delete /TN YidaServiceStart /F                      # 删除任务
```

**与开机自启（autostart-on）的关系**：两者功能重叠，**二选一，不要并存**（否则开机重复启动两次）。推荐计划任务：既能开机自启，又能**手动触发**立即拉起，覆盖了 autostart-on 只覆盖"开机"的场景缺口。已有 autostart-on 快捷方式时需先 `autostart-off` 删除。

**教训**：病根在「启动方是谁」而非「前台/后台」。任何在 Trae 终端内启动的 node 进程都受 Job Object 管控，改启动参数（detached/unref/Background）无法根治；必须换启动方到 Trae 之外。

### 问题10：`schtasks /Run` 显示 SUCCESS 但服务未拉起——计划任务指向旧项目路径（v3.6.2 实测踩坑）

**现象**：执行 `schtasks /Run /TN YidaServiceStart` 返回 SUCCESS，但随后 `server_manager.js status` 两个端口仍 🔴。

**根因**：计划任务注册时的脚本路径是**注册那一刻的项目根**。项目目录升级/改名（如 `新鑫科技AI助手V2.0.33` → `新鑫科技AI助手`）后，任务仍指向旧路径，旧路径下脚本不存在 → 任务执行失败。`schtasks /Run` 只表示"已尝试触发"，**不代表任务内部命令执行成功**。

**识别方法**：
```powershell
schtasks /Query /TN YidaServiceStart /V /FO LIST | Select-String -Pattern "上次结果|Last Result|要运行的任务|Task To Run"
```
- `Last Result: 1` = 任务命令执行失败
- `Task To Run` 中的脚本路径 ≠ 当前项目根 → 路径漂移

**解决方案**：用 `/F` 覆盖重注册为当前项目路径，再触发：
```powershell
schtasks /Create /TN YidaServiceStart /TR '"<node.exe绝对路径>" "<当前项目根>\.agents\skills\server-manager\scripts\server_manager.js" start' /SC ONSTART /RU "$env:USERNAME" /RL LIMITED /F
schtasks /Run /TN YidaServiceStart
```
注册后必须 `status` + `curl --noproxy '*' http://127.0.0.1:3457/health` 双验证（脚本自报成功 ≠ 存活，同问题8）。

**教训**：`/Run` 的 SUCCESS ≠ 服务启动成功；项目目录改名/升级后计划任务不会自动跟随，必须重注册。

### 问题11：单项目布局下「进入应用」/「组织主页」404——URL 项目段格式不匹配（v3.6.3 实测踩坑）

**现象**：门户页点「📂 进入应用」打开 not found；原型页点「🏠 组织主页」也是 404。服务状态、静态页本身均正常。

**根因（三层叠加，2026-10-14 新鑫科技AI助手实测）**：server_manager v3.4.0 staticRoot 有效性校验把"资料目录型父目录"（合法项目占比 <50%，本项目 2/22）回退**单项目布局**（staticRoot=项目根，8080 URL 不带项目段），但三处仍按多项目格式拼 URL：
1. **sync_server.js org-info 的 prototypeUrl** 硬编码 `http://127.0.0.1:8080/{项目名}/{应用名}/...` → 8080 上不存在 `/{项目名}/` 层 → 进入应用 404
2. **dashboard.js getProjectName()** 拿 URL 编码段（`%E6%9C%AC...`）与 `'本地操作页面'` 比较，永远 false → 单项目布局判断失效，PROJECT_NAME 被错设为 `本地操作页面`
3. **原型页 app.js buildPortalUrl()**（v3.0.7）把 URL 首段当项目段拼接——单项目布局下原型页 URL 是 `/{应用名}/01需求梳理/...`，首段是**应用名**，拼出 `/{应用名}/本地操作页面/` → 组织主页 404

**修复方案（已实施）**：
1. sync_server v3.3.0：新增 `buildEntryUrlBase(projectDir)`——按「项目目录相对静态根的路径段」生成 URL 前缀（单项目 → 无段；多项目 → `/{项目名}`），三处 prototypeUrl 统一走该函数
2. dashboard.js v1.10.2：getProjectName 先 `decodeURIComponent(segments[0])` 再比较 `'本地操作页面'`（index.html 缓存参数同步升 ?v=1.10.2）
3. prototype_generator v2.42.0：app.js 模板改探测法 `rewritePortalLinks()`——`HEAD /本地操作页面/index.html` 可达 → 单项目（门户链接不带段）；404 → 多项目（按首段拼）；探测异常保持模板原 href；GENERATOR_VERSION 递增触发全量重建，存量页面 app.js 手动同步 + HTML 引用加 `?v=2.42.0`

**教训**：URL 拼接逻辑（服务端 prototypeUrl、前端门户链接）必须与 server_manager 的 staticRoot 布局判定**同一标准**；单项目/多项目布局并存时，任何"URL 首段 = 项目段"的假设都要显式验证（前端无法直接判断首段语义，用探测法或让服务端下发布局信息）。

## 六、检查清单

执行前确认：
- [ ] 已确定用户需要的操作（启动/停止/重启/检查）
- [ ] 项目根目录路径正确（`d:\宜搭AI助手直播\宜搭AI助手V2.0.22`）
- [ ] 【v3.6.0·P5-3】可选统一预检：`node .agents/skills/server-manager/scripts/agent_capabilities.js` 一条命令输出 JSON 摘要（Skill 概况/登录态/8080+3457 服务状态/配置可读性），登录态失效时退出码 1

执行后确认：
- [ ] 脚本执行完成并返回结果
- [ ] 已向用户展示服务状态
- [ ] 已提供访问地址和使用说明
- [ ] 遇到错误时提供了明确的错误信息和解决建议

## 七、版本更新记录

### v3.6.3 (2026-10-14)
- **新增**：问题11「单项目布局下『进入应用』/『组织主页』404」——sync_server org-info 的 prototypeUrl 无条件按
  多项目格式拼 `/{项目名}/{应用名}/`，而 v3.4.0 staticRoot 校验回退单项目形态（URL 无项目段）后链接 404；
  修复为 sync_server v3.3.0 `buildEntryUrlBase`（按项目目录相对静态根的路径段生成 URL 前缀）+
  dashboard.js v1.10.2（getProjectName 必须先 decodeURIComponent 再比较'本地操作页面'，编码段比较永远 false）+
  prototype_generator v2.42.0（组织主页链接改探测法 rewritePortalLinks）。

### v3.6.2 (2026-10-14)
- **新增**：问题10「`schtasks /Run` 显示 SUCCESS 但服务未拉起」——项目目录升级/改名后计划任务仍指向旧项目路径（Last Result: 1），给出 `/V /FO LIST` 识别法与 `/F` 重注册方案；明确 `/Run` 的 SUCCESS ≠ 任务内部命令执行成功。
- **修正**：问题5 变体补充完整根因链——旧版前端缓存（?v=1.8.0）发 projectDir=本地操作页面 +
  resolveProjectDir v3.0.1「目录存在即接受」+ md 残留后 referer/唯一项目扫描自我延续；
  已由 dir-ops.js v3.1.0 单项目布局防护根治，dashboard.js 缓存参数升 ?v=1.10.1。

## 八、快速参考

### 常用命令

| 操作 | 命令 |
|------|------|
| 启动服务（完整两段式） | 按第2步：run_command 前台启动 8080（web_server）→ `server_manager.js start-sync` |
| 仅启动同步服务 | `node .agents/skills/server-manager/scripts/server_manager.js start-sync` |
| 停止服务 | `node .agents/skills/server-manager/scripts/server_manager.js stop` |
| 检查状态 | `node .agents/skills/server-manager/scripts/server_manager.js status` |
| 注册开机自启 | `node .agents/skills/server-manager/scripts/server_manager.js autostart-on` |
| 取消开机自启 | `node .agents/skills/server-manager/scripts/server_manager.js autostart-off` |
| 手动拉起服务（脱离 Trae，推荐） | `schtasks /Run /TN YidaServiceStart` |
| 删除计划任务 | `schtasks /Delete /TN YidaServiceStart /F` |

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
