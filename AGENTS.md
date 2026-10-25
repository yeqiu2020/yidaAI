# AGENTS.md - 本工程 AI 协作规则

<!-- =================================================================== -->
<!-- ⭐ SKILL 根目录声明 - 供所有 AI IDE 自动识别用                           -->
<!-- =================================================================== -->
# 📁 本地 AI 技能包 (Skills)

本工程的本地 AI 技能库位于 **`.agents/skills/`** 目录，包含以下能力：

| 技能名称 | 描述 | 触发词示例 | 执行方式 |
|---------|------|-----------|---------|
| `server-manager` | 宜搭服务管理器 | 启动宜搭服务、检查服务状态 | `node .agents/skills/server-manager/scripts/server_manager.js <command>` |
| `integration` | 集成自动化（逻辑流） | 创建集成自动化、逻辑流 | `node .agents/skills/integration/scripts/integration-create.js <command>` |
| `business-rule` | 业务关联规则 | INSERT、UPDATE、DELETE、跨表规则 | `node .agents/skills/business-rule/scripts/<script>.js` |
| `api-client` | 宜搭 API 客户端 | 静默登录、创建应用 | `node .agents/skills/api-client/scripts/api_client.js` |
| ... | （共 40+ 个技能，详见 skill-config.json） | | |

**🔑 核心配置文件：**
- `skill-config.json` - Skill 全量索引与登记文件（**必须与 SKILL.md frontmatter 保持同步**）
- `SKILL.md` - 每个技能的详细文档和硬规则（frontmatter 的 `description` 是运行时触发权威面）

**💡 使用约定：**
- ✅ AI 应优先通过 **Bash 命令** 调用这些 Skills（如 `node .agents/skills/xxx/scripts/yyy.js ...`）
- ❌ 不要尝试用 Skill 工具传参（除非明确定义参数格式）
- 🔄 所有技能已在 Trae IDE 中自动识别，可直接在侧边栏查看

**⚠️ 跨 IDE 兼容性说明：**
- 本文件符合 Cursor/Trae/Windsurf 等主流 IDE 的 `AGENTS.md` 规范
- Skill 目录结构遵循通用的 `.agents/skills/` 约定
- 如需在其他项目复用此架构，请保留完整目录结构和配置文件

---

# 项目级 AI 协作总则

1. **不修改成熟运行中的 Skill** — 现有 40 个已注册 Skill 已在生产环境中正常运行，除非用户明确要求修改某个 Skill，否则 AI 不得修改任何现有 Skill 的 `SKILL.md`、`references/`、`scripts/` 目录及内容。
2. **新增能力优先增量添加** — 新功能、新能力应通过新建 Skill 或新增文件的方式实现，不以修改现有 Skill 为代价。
3. **`skill-config.json` 是登记和消歧索引** — 所有 Skill 必须在此文件中注册；`skills[].description` 是索引面，各 Skill 的 `SKILL.md` frontmatter `description` 是运行时触发权威面，修改任一侧时必须同步修改另一侧。
4. **`references` 默认只读引用** — 一个 Skill 可以读取其他 Skill 的 `references` 文件作为知识源，但不得修改原文件。
5. **`scripts` 是公开执行入口** — 一个 Skill 可以调用其他 Skill 的公开 CLI 命令，但不得 patch 其脚本来适配自身。

<!-- BEGIN local-service-management-hard-rules (2026-09-28 事故沉淀，随项目分发) -->

# 本地服务管理硬规则【对所有 AI 强制生效】

6. **【强制】严禁用 AI 工具的「后台任务」（run_in_background / Background job）启动用户长期使用的本地服务**（sync_server 3457、8080 静态服务等）。
   - **原因（2026-09-28 实测事故）**：后台任务启动的服务进程树绑定在 IDE 工具宿主（pwsh）的 Job Object 上；用户在原型页点同步按钮 → 服务 spawn 子进程 → 进程树膨胀且全拴在宿主上 → **宿主阻塞，整个 IDE 卡死**；用户在任务管理器强杀进程树时，pwsh（.NET 宿主）被强杀弹出 `0xe0434352 未知的软件异常` 错误框（此弹窗只是强杀的伴随现象，无害，点确定即可，不是根因）。
   - **正确启动方式（三选一）**：
     - `node .agents/skills/server-manager/scripts/server_manager.js start`（detached 分离进程）
     - 双击/执行 `启动宜搭服务.bat`
     - 让用户在本地操作页面点「🔄 重启服务」按钮（走 `/restart-service`，spawn 独立进程）
   - **最彻底的脱离方式（Agent 会话内启动服务的首选）**：用计划任务一次性启动 — `schtasks /create /tn <任务名> /tr "<bat绝对路径>" /sc once /st 23:59 /f` → `schtasks /run` → 3 秒后 `schtasks /delete`。进程由 Task Scheduler 服务托管，完全脱离 AI 宿主进程树（2026-09-28 实测有效；/tr 路径含中文但无空格时可不加引号）。
   - **临时调试需短暂起服务时**：可以后台跑，但**用完必须立即停掉**，绝不能留给用户点击使用。
   - **已在运行的孤儿进程服务（父进程已退出、由系统接管）无需再动**，它是安全的。

6.1. **【强制】启动宜搭服务只跑一条命令，访问地址由脚本产出、AI 原样转达 —— 全宿主统一，禁止按工具分叉。**
   - **唯一启动命令**（DSH / Trae / Cursor / Claude Code / Codex 全部相同）：
     ```
     node .agents/skills/server-manager/scripts/server_manager.js start
     ```
     脚本会打印**权威地址 + 可直接粘贴的 Markdown**，以及一行机器可读结果：
     ```
     YIDA_READY {"ok":true,...,"markdown":"[🏠 打开本地操作页面](http://127.0.0.1:8080/<项目目录段>/本地操作页面/index.html)"}
     ```
   - **AI 的唯一动作**：把该 `markdown` 行**原样贴给用户**，并说明"点击后在宿主内置浏览器中打开"。
   - **❌ 禁止**：
     - 自己拼接访问 URL（极易漏项目目录段 → 404）——地址只有一个来源：脚本；
     - `start http://...`、`Start-Process http://...`、`explorer http://...`、`open http://...` 等拉起系统外部浏览器；
     - 打开 `http://127.0.0.1:8080/` 组织门户首页（无实际意义）；
     - 把地址改写成 `file://`（会导致"同步配置"按钮失效）；
     - **按宿主分叉流程**（如"Trae 走两段式、DSH 走另一种"）——这正是历史上同一件事在不同工具下结果不同的根因。
   - **关于宿主差异（不影响流程，仅影响可选增强）**：Trae 另有 `tools.open_preview`，可在给出链接之外**额外**生成预览框；
     调用失败无需重试（链接已给到用户）。DSH 没有该工具，跳过即可——其内置浏览器是右侧栏 Sidebar Browser
     （包 `@deepseek-ai/dsh-client-ui-sidebar-browser`，`desktop` profile 默认启用），按设计**不注册任何 agent 工具**，
     用户点击聊天里的 HTTP(S) 链接即在内置浏览器打开（`ui-chat.linkOpening` 默认 `sidebar`），也可按 `Ctrl+T` 手输地址。
     **两条路径对用户效果一致，因此 AI 侧流程必须保持完全相同。**
   - **原因（2026-10-16 实测）**：旧文档把「地址拼接」和「打开方式」留给 AI 按宿主自行判断，导致 AI 在 DSH 下
     误判"没有内置浏览器通道"，用 `Start-Process` 开了外部浏览器。修复方式不是给 DSH 补一条分支，
     而是**把地址生成与结果输出收敛进脚本**（`getAccessUrls()` / `printAccessReport()`），让宿主差异从 AI 的判断链里彻底消失。

6.2. **【强制·WorkBuddy / Trae 宿主实测定稿】启动服务只认 `ensure-service.js`，禁止直跑 `server_manager start`。**
   - **唯一启动命令**（幂等：已在跑就直接返回，不在跑才拉起，并自动轮询验证）：
     ```
     node .workbuddy-ai/run/ensure-service.js
     ```
     可选子命令：`status`（只查）、`stop`（停止）、`--json`（只输出 YIDA_READY 单行）。
     退出码 0 = 已就绪；1 = 未就绪（脚本会打印手动兜底方案）。
   - **为什么不能用 `server_manager start`（2026-10-17 事故，用户明确要求杜绝）**：宿主命令沙箱用 Job Object 包裹整条命令的进程树，
     命令结束即 kill-on-close。`server_manager.js` 里的 `detached:true + unref()` **仍在 Job 内**，于是出现
     "启动日志全绿、健康检查通过 → 命令退出后 8080/3457 立刻消失 → 用户打开页面一片空白 / 暂无数据" 的假成功。
     关沙箱（`dangerouslyDisableSandbox`）同样无效。
   - **唯一可靠的脱离方式（实测两条，按优先级）**：
     1. **3457 同步服务在线时** → `GET http://127.0.0.1:3457/ensure-service?projectDir=<项目目录名>`。
        同步服务本身是宿主 Job 之外的孤儿进程，它 spawn 的子进程同样常驻；**全程无任何系统弹窗，最快**。
        （该接口 2026-10-17 由本项目新增，见 `sync_server.js`）
     2. **两条服务全挂（冷启动）时** → `explorer.exe "%LOCALAPPDATA%\YidaService\start-yida.cmd"`。
        该中立启动器由 `ensure-service.js` **每次现生成**（内容跟随项目路径，GBK 编码 + CRLF）。
        **绝不要**把项目目录里的 `.bat` 交给 explorer —— 见下面「安全警告」条。
   - **【安全警告陷阱】工作区目录内的 `.bat` / `.vbs` 经 ShellExecute(explorer) 启动会弹「打开文件 - 安全警告」**，
     必须人工点「运行」才执行；自动化场景下等于**静默失败**，而且多次调用会堆积弹窗、把 explorer 拖到连打开文件夹都失败
     （2026-10-17 实测：4 个弹窗 + 9 个 explorer 实例，`explorer.exe .` 直接返回 1）。
     同一个 `.bat` 放到 `%LOCALAPPDATA%\Temp` 下经 explorer 启动**立即执行、无弹窗** —— 所以启动器必须放工作区外。
     清理方法：`Get-Process explorer | Where-Object { $_.MainWindowTitle -like '*安全警告*' } | Stop-Process -Force`
     或 `taskkill /F /PID <pid>`。
   - **本机被安全策略封死、不要浪费时间再试的通道**（逐条实测）：
     `schtasks.exe`（Program Blacklist）、`wmic.exe`（Program Blacklist）、
     `Invoke-CimMethod Win32_Process Create`（策略判定等价 Start-Process）、
     COM 实例化（`Schedule.Service` / `WScript.Shell` 等一律拦截）。
   - **验证铁律**：服务死活的判据只有 `ensure-service.js` 的 `YIDA_READY {"ok":true,...}` 或 node 直连 http。
     **禁止用 `curl` 判活**——本机有系统代理（`HTTP_PROXY=http://127.0.0.1:<随机端口>`），未监听时 curl 会返回 **502**，
     看起来像"服务在跑但报错"，极易误判（2026-10-17 两次踩坑）。
   - **【页面「🔄 重启服务」按钮的原有 bug（2026-10-17 已修）】**：
     `/restart-service` 旧实现 spawn 的 `server_manager restart` 是同步服务的**子进程**，
     而 `stopAll()` 对每个端口执行 `taskkill /PID <pid> /F /T` —— 停 3457 时把重启进程一起杀掉，
     于是 8080 停了、3457 停了、`startAll()` 再也没执行 → **点一次按钮，两个服务全挂**。
     修法：改为 spawn `.workbuddy-ai/run/restart-agent.js`（只杀 8080、自己不是 8080 的后代，然后跑 `server_manager start`），
     同步服务自己退出，永不"自己杀自己"。改完必须回归：POST `/restart-service?projectDir=<项目目录名>` → 等 18s → 两个服务仍 🟢。
   - **用户侧入口同步修复**：`start-local-service.bat`（启动 + 启动后回读验证写 `service-start.log`）、
     `启动宜搭服务.bat`（纯 ASCII 外壳，只负责 `node .workbuddy-ai\run\service-menu.js`）。
     菜单中文 UI 全部在 `service-menu.js` 里实现，**编号保持 1-5 原样**（1 启动 / 2 后台启动 / 3 停止 / 4 状态 / 5 健康检查 / 6 打开页面）；
     原菜单依赖的 `.workbuddy-ai/run/persistent-launcher.js` 等文件根本不存在，点必失败（2026-10-17 已修）。
   - **【.bat 铁律】所有 .bat 必须同时满足：纯 ASCII 内容 + CRLF 换行。**
     2026-10-17 实测：把 `start-local-service.bat` 写成 **LF 换行 + UTF-8 中文注释** 后，cmd.exe **静默解析失败**——
     连第一行 `echo >> log` 都没执行、无任何报错，表现为"双击没反应 / explorer 拉起后什么都没发生"，
     且会让人误判成 explorer 方式失效（本次排查多绕了半小时）。中文一律放 Node 脚本里输出。
     新增/修改 .bat 后必须自检：`node -e "const b=require('fs').readFileSync('x.bat','utf8');console.log('CRLF',(b.match(/\r\n/g)||[]).length,'非ASCII',[...b].filter(c=>c.charCodeAt(0)>127).length)"`
     → 非 ASCII 必须为 0，且 CRLF 数 = 行数。
   - **【两条路径要分清，别混用】**
     - **用户双击路径**：`启动宜搭服务.bat` → `service-menu.js` → `cmd /c start-local-service.bat` → `server_manager start`。
       整条链都在 AI 宿主 Job 之外，**直接调即可，不需要再套 explorer**。
     - **AI 会话内路径**：`node .workbuddy-ai/run/ensure-service.js`（自动选路：3457 在线走 `/ensure-service`，
       否则用工作区外的中立启动器 + explorer）。
       同一份 `server_manager start` 在 AI 命令里跑必被回收、在用户双击里跑能常驻——差别只在 Job Object。
   - **回答用户前必须做**：先跑 `ensure-service.js` 拿到 `ok:true`，再把 `markdown` 原样贴出并用 present_files 打开该 URL。
     只贴链接不验证 = 未完成。用户说"页面没打开"时，**第一步永远是查 8080/3457 是否真的在监听**，
     而不是重发链接或怀疑浏览器。

<!-- END local-service-management-hard-rules -->

<!-- BEGIN prototype-page-hard-rules (2026-09-28 事故沉淀，随项目分发) -->

# 原型页面开发硬规则【对所有 AI 强制生效】

7. **【强制】原型页面（生成器模板内）严禁调用原生浏览器对话框 `alert()` / `confirm()` / `prompt()`**。
   - **原因（2026-09-28 两次 IDE 卡死事故根因）**：Trae 内置浏览器（WebView）中原生 `alert()` 是同步阻塞调用，渲染异常时页面 JS 线程永久冻结，直接拖死整个 IDE；且用户明确偏好自定义弹窗。
   - **正确做法**：一律使用生成器模板内的 `showErrorModal(title, detailHtml)` 自定义模态（纯字符串拼接，避免模板转义问题）；服务启动指引已有 `showServiceStartGuide()` 自定义模态。
   - 生成新原型页后，必须检查产物 `js/app.js` 中 `alert(` 调用数为 0。

<!-- END prototype-page-hard-rules -->

<!-- BEGIN action-code-push-hard-rules (2026-09-28 用户授权沉淀 · 2026-09-30 授权扩展，随项目分发) -->

# 表单配置推送硬规则（动作代码+事件绑定+数据源+公式+校验）【对所有 AI 强制生效】

8. **【授权例外·v4.0.0 已扩展】表单配置允许通过 API 一次性推送回宜搭：动作代码、字段事件绑定、远程数据源、字段公式、字段校验规则**（2026-09-30 用户授权"一次性做到位，不需要用户自己动手"；动作代码推送授权见 2026-09-28），且必须走完整安全流程。
   - **背景**：工作区规则25禁止通过 API 修改已有表单，防止误改线上。2026-09-28 用户授权动作代码推送例外；2026-09-30 经数日推送实测安全后，用户解除公式/校验规则限制，授权范围扩展为上述五类。
   - **唯一入口**：原型页「⬆️ 推送动作代码」按钮 → `POST /push-form-actions`（`scope:'all'` 全量；实现：`lib/sync-server/action-code-sync.js` + `lib/sync-server/schema-push.js`）。禁止绕过该入口手写 saveFormSchema 调用。
   - **安全流程（缺一不可）**：①拉取线上 Schema ②推送前自动备份（`动作代码_推送前备份.js` + scope=all 时全量 `Schema备份_推送前.json`，均固定名滚动覆盖）③剥离同步头注释 ④node --check 语法校验 ⑤替换 `actions.module.source`+`compiled`（compiled 由 buildCompiled 生成，只改 source 会假成功），并应用 推送配置.json（见下），actions.list 函数注册表从推送代码重建（**只增不删**——它是设计器绑定下拉框的函数清单，漏更新会导致新函数无法绑定）⑥saveFormSchema ⑦重新拉取 Schema 回读逐项验证（**保存成功 ≠ 配置正确**）。任一配置校验失败 → 整体中止不保存。
   - **推送内容声明文件**：表单目录 `代码/推送配置.json`（字段引用用 fieldId 或唯一中文名）：`bindings: [{field, event, fn}]`（fn 必须在推送代码 export 中存在，否则拦截）、`dataSources: [{name, url(站内相对路径), method, params, isInit, didFetch?}]`（写入 `dataSource.online`，REMOTE 形态与设计器一致，代码用 `this.dataSourceMap['名字'].load()` 调用）、`formulas: [{field, formula}]`（普通计算公式，**三写** `props.formula`+`props.complexValue`+`props.valueType='formula'`——设计器靠 valueType 渲染公式编辑面板，漏写会导致公式落盘但设计器不显示（2026-10-01 实测事故）；`#{fieldId}` 引用必须存在，空串=清除；FETCH/SERIALNUMBER 联动/流水号结构禁止经此通道）、`validations: [{field, rules:[{type,param?}|{type:'customValidate', code, message}], mode?:'replace'|'merge'}]`（写入 `props.validation`；`customValidate` 为自定义函数校验条目：code=validateRule 函数源码字符串，message=校验失败提示，编译包装模板与手配金标准逐字符对齐（夹具 tests/fixtures/schema-push_自定义校验金标准.json），node --check 语法门禁，回读验证核对 source 逐字符一致；2026-10-01 用户手配金标准固化）。无此文件时 scope=all 自动退化为仅推动作代码。
   - **边界**：字段结构（增删字段、改字段类型）仍走"本地生成 → 手动复制粘贴"，不在推送授权范围；数据联动（FETCHDISTINCTDATA）与流水号（SERIALNUMBER）为设计器生成的复杂结构，暂不支持 API 推送；自定义页面不受规则25限制（可 API 发布）。
   - **推送后提醒用户**：需到宜搭设计器核对并发布才生效（API 保存 = 设计器"保存"，不等于发布）。
   - **【推送文件命名规范】代码三文件**：`动作代码_下载版.js`（线上镜像，每次「同步动作代码」覆盖更新，禁止手改）→ `动作代码_推送版.js`（唯一工作文件，基于下载版复制而来，改造直接改它，推送列表置顶默认选中）→ `动作代码_推送前备份.js`（推送瞬间线上快照，固定名滚动覆盖）。文件名不再带日期/_v2 后缀；版本号只在代码内部体现（头部注释 + didMount 加载 toast）。scope=all 追加两文件：`推送配置.json`（声明绑定/数据源/公式/校验，随表单代码目录走）+ `Schema备份_推送前.json`（推送前全量快照，滚动覆盖，回滚依据）。
   - **【版本号铁律·2026-09-30 用户要求】每次升级动作代码，必须同步更新代码内【全部】版本号标记，缺一处即视为未完成，禁止让用户看到旧版本号**。四处必改清单：① 头部 `* 版本号: vX.Y.Z`；② 头部「更新记录」新增本次变更行；③ didMount 加载 toast/console 日志中的版本号；④ 尾部 `* 代码版本号`。推送前必须自检：全文检索旧版本号应为 0 处，同时检查各文件头部的 `* 版本号:` 行与实际版本一致。历史事故（2026-09-30 退货 v1.0.0→v1.0.1）：AI 改了②③④漏了①，用户连续两次看到旧版本号并被激怒；同日出库 v1.0.2 也存在同款漏改。
   - **【多项目定位·强制】原型页所有新增 fetch 请求必须携带 `pageUrl: window.location.href`**（GET 请求放 query 参数），与 syncFormActions 保持一致。原因（2026-09-28 推送首测失败根因）：`findProjectDir` 靠 pageUrl/referer 精确定位当前项目的应用目录；两者都缺失时兜底扫描按字母序命中其他版本项目的同名应用（如 V1.6.4\新鑫系统），且新旧项目表单 UUID 相同、错误极难察觉（表现为"找不到代码文件夹"而非"找错项目"）。部分浏览器/WebView 对跨源 fetch 不发送 Referer，不能依赖它。
   - **【推送公式格式·2026-10-01 实测定稿，禁止重新考古】** 推送配置.json 的 `formulas:[{field, formula}]` 中公式串使用 **`#{fieldId}` 引用格式**（如 `IF(GT(DATE(#{dateField_a}),DATE(#{dateField_b})),"逾期","按期")`，推送演示表单与采购入库实测落盘并被设计器正常渲染）。注意它与公式编辑器粘贴用的「零宽空格显示名+marks」JSON 是**两套不同形态**：后者仅用于本地交付/设计器粘贴（公式/目录下的 isCmData JSON），前者才是推送落盘格式。
   - **【公式流水线·2026-10-01 新增】** 公式类任务的机械环节已脚本化为一条命令：`node scripts/formula_pipeline.js --project <项目目录名> --form <表单名> --target <目标字段名> --formula-file <公式文本.txt> [--tests 测试用例.json] [--push] [--dry-run]`，自动完成 规则21选择性同步Schema → 字段ID解析与未知字段名校验 → formula-generator marks 生成 → 多场景本地求值验证 → 可选推送（自动转换 `#{fieldId}` 公式并合并 推送配置.json → /push-form-actions → 回读报告）。**公式任务必须优先走此流水线，禁止再手工逐步考古端点/格式**（公式文本本身由 AI 按需求编写，流水线只接管机械环节）。
   - **【默认轻交付·推送先问（2026-10-01 用户反馈：单公式任务耗时21分钟过长）】** 公式/代码类任务的默认边界 = 本地生成→验证→交付文件即止；**是否推送线上先问用户一句**（用户需求中已明确写"推上去/同步到云端/一次性做到位"的除外）。技术路线不确定时（推不推、用哪套格式、动不动线上）优先用一句话问用户，禁止自行长链路考古——用户的 5 秒回答比 AI 的 7 分钟排查便宜。

<!-- END action-code-push-hard-rules -->

<!-- BEGIN temp-file-management-hard-rules (2026-09-28 用户反馈沉淀，随项目分发) -->

# 临时文件管理硬规则【对所有 AI 强制生效】

9. **【强制】临时/调试产物严禁散落在项目根目录，一律写入 `temp-file/` 目录**（该目录已被 `.gitignore` 忽略，不会进 git）。
   - **原因（2026-09-28 用户明确反馈）**：调试会话结束后在根目录遗留了大量 `debug_*.js`、`run_*.js`、`test_*.js`、`temp_*.js`、`tmp_*.json` 等一次性脚本和数据，用户极为反感。根目录只允许放项目正式文件（配置、文档、正式入口），散落垃圾会污染每一次 AI 会话的上下文。
   - **正确做法**：
     - 创建任何一次性测试脚本、debug 脚本、临时数据 JSON、调试截图/导出文件时，**输出路径必须是 `temp-file/`**（如 `temp-file/debug_xxx.js`）；复杂场景按主题建子目录（如 `temp-file/20260928-对账调试/`）。
     - **会话结束前清理**：有留用价值的脚本 → 移入 `temp-file/`；确认无价值 → 直接删除；需要长期维护的正式测试 → 放入 `tests/` 目录并接入 jest，不占用临时目录。
     - 删除前用 grep 确认项目代码（lib/scripts/tests/docs/.agents 等）无引用即可执行，**此类清理无需再向用户逐个确认**。
   - **判定标准**：文件生命周期 ≤ 一个调试会话 = 临时产物；跨会话仍需引用 = 移入 `temp-file/`；属于项目正式能力 = 进 `tests/` 或对应 Skill 目录。
   - **【脚本执行纪律·2026-10-01】** 多行 Node/PowerShell 逻辑一律先用 Write 写入 `temp-file/` 下的脚本文件再执行，**禁止多行内联 `node -e`**（Windows cmd 下会静默吞输出、不报错，2026-10-01 公式任务因此重试 4 次）；**禁止用 findstr/管道匹配中文**（控制台编码不一致必失败），文本检索与解析一律用 node 临时脚本或 Read 工具完成。

<!-- END temp-file-management-hard-rules -->

<!-- BEGIN yida-integration-hard-rules (generated by scripts/sync-hard-rules.js, do not edit) -->

<!-- 本文件由 scripts/sync-hard-rules.js 自动生成，请勿直接修改。 -->
<!-- 权威源: .agents/skills/integration/references/集成自动化硬规则.md，改完源文件后运行 node scripts/sync-hard-rules.js -->

# 宜搭集成自动化（逻辑流）生成硬规则【对所有 AI 强制生效】

> 背景事故：曾有 AI 手工拼配置创建"采购入库同步库存"逻辑流，产出空壳获取节点、
> 把序列化 token "processVar" 当字面量存进匹配条件、公式为空、数据流断链——
> 保存全部"成功"，但流程永远不工作。宜搭 saveProcess 接口不校验配置完整性，
> **保存成功 ≠ 配置正确**。以下规则用于从根源杜绝此类废流。

1.**【强制】禁止手写 processJson/viewJson，禁止直接调用 saveProcess.json 接口，禁止用浏览器自动化拖节点拼流程。** 创建/修改集成自动化只允许通过以下 CLI（经过回归测试的构建器，自带保存前体检门禁）：
   - 创建：`node .agents/skills/integration/scripts/integration-create.js create <appType> <formUuid> "<名称>" [参数]`
   - 回读：`node .agents/skills/integration/scripts/integration-get.js <appType> <processCode>`
   - 体检：`node .agents/skills/integration/scripts/integration-validate.js <appType> <processCode>`
   - 列表：`node .agents/skills/integration/scripts/integration-list.js list <appType>`
   参数详情见 `.agents/skills/integration/SKILL.md`。

2.**【强制】生成前必须先拿到真实 ID，禁止编造任何 formUuid / fieldId / appType。**
   - 应用ID 从 `组织及应用信息.md` 读取；表单字段ID 必须先同步 Schema（get-schema skill 或 CLI 会自动抓取校验）。
   - 出现 `FORM-XXX`、`textField_xxx` 这类猜测值 = 直接违规，门禁会拒绝保存。

3.**【强制】`processVar` / `literal` / `formula` 是值类型（valueType）的枚举 token，不是数据值。**
   - 引用触发表单字段：valueType=processVar，值 = 真实字段引用（如 `trigger_textField_abc`）。
   - 固定值比较：valueType=literal，值 = 真实业务值（如 `上海仓库`）。
   - 把 token 本身写进值槽位（例如 匹配条件 = 字面量 "processVar"）会导致条件永远匹配不到。

4.**【强制】保存/发布后必须回读验证闭环，不允许以"保存成功"作为完成依据：**
   - 第一步 `integration-get.js` 回读节点树，确认节点数、类型、串联与预期一致；
   - 第二步 `integration-validate.js` 体检，必须输出"体检通过"；有 [ERROR] 必须修复重建；
   - 有条件的场景再用 data-tester 提交一条测试数据，用 `integration-check.js` 查执行日志。

5.**【强制】典型场景"单据审批通过后同步库存"的标准形态（不要自由发挥节点图）：**
   流程事件触发（审批通过）→ 更新数据节点（direct_form 直接更新：主条件=字段引用匹配仓库/商品，
   更新规则=公式累加数量，noneOperation=add 实现 upsert）→ 结束。
   **直接更新模式下不需要"获取单条数据"前置节点**；只有 `--update-type node` 才需要获取节点。
   **标准 CLI 命令模板（照抄替换真实 ID 即可，不要自由发挥）：**
   ```
   node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后同步更新" \
     --events processFinish --approval-actions agree \
     --update-form-uuid FORM-TARGET \
     --update-condition "textField_target_key1:目标匹配字段1:textField_trig_key1:TextField:Equal::processVar" \
     --update-condition "textField_target_key2:目标匹配字段2:textField_trig_key2:TextField:Equal::processVar" \
     --update-assignment "numberField_target_val:column:#{FORM-TARGET/numberField_target_val}+#{numberField_trig_val}" \
     --update-assignment "textField_target_key1:processVar:textField_trig_key1" \
     --update-assignment "textField_target_key2:processVar:textField_trig_key2" \
     --update-none-operation add --publish
   ```
   ⚠️ 上面就是完整命令，3 节点（触发→更新→结束），不需要 --cycle、不需要 --data-form-uuid、不需要获取节点。

5.1.**【强制】方案选择判别标准是「动作类型」，不是「数据拓扑」（选错=白建逻辑流）：**
   - **✅ 数据同步/累加/upsert（更新或新增另一张表的数据）→ 一律 direct_form 更新数据节点（3 节点），无论触发数据来自主表字段还是子表明细行**：
     - 目标是主表字段：`--update-form-uuid` + `--update-condition` + `--update-assignment`（CLI 模板见上方第 5 条）；
     - 目标是子表行：追加 `--update-sub-source-id` + `--update-sub-condition`；
     - 引擎在 direct_form 模式下自动对触发子表明细行逐行迭代匹配（含"子表明细→目标主表记录"，如采购入库.入库明细→库存信息主表，已实际验证），**任何数据同步场景禁止用循环容器**。
   - **⚠️ 循环容器（`--cycle`）仅用于"逐条执行非更新类动作"**：即需要对「获取多条数据」的每条结果分别执行**消息通知、连接器调用、发起审批**等 direct_form 无法表达的动作时才使用；它不是数据同步的备选方案。**"发起审批" ≠ "新增数据"**：发起审批是创建流程实例（审批流程），不是更新/新增数据记录，属于"非更新类动作"，必须用循环容器+发起审批节点（InitiateApprovalNode），禁止用 direct_form 更新数据节点。
   - **历史事故（同一根因发生过三次）**：前两次都有 AI 把"采购入库同步库存"（入库明细子表→库存信息主表）误用循环容器方案（5 节点+获取多条+循环），实际 direct_form 直接更新（3 节点）即可。第三次（v2.8.0）：另一个 AI 把"任务分派子表→任务执行发起审批"误用 direct_form 更新数据节点，根因是 5.1 只提"消息通知、连接器调用"未明确提"发起审批"，AI 把"发起审批"等同于"新增数据"套用 direct_form 规则。修复：5.1 明确列出"发起审批"为非更新类动作。前两次根因详见 `docs/采购入库同步库存-集成自动化配置指南.md`。

6.**【强制】`--force-save`（跳过体检门禁）只能在用户明确批准后使用，AI 不得自行决定绕过门禁。**

7.怀疑某条已有逻辑流有问题（无论谁创建的），先用 `integration-validate.js <appType> <processCode>` 体检出具报告，再决定修复方案；禁止盲改。

8.**【强制】公式赋值（valueType=column）的 viewJson 必须同时写入 `__display`、`__source`、`value` 三个字段，格式如下（bundle 逆向确认，禁止自由发挥）：**
   - `__display` = **纯文本字符串**（如 `"目标表字段.库存数量+入库明细.入库数量"`），给设置面板输入框显示。❌ 不能是 JSON 对象（显示 `[object Object]`）、❌ 不能是 JSON 字符串（显示 JSON 原文）。
   - `__source` = **与 CLI 传入公式完全相同**（如 `"#{FORM-xxx/fieldId}+#{fieldId}"`），给公式编辑器弹窗重建状态。❌ 跨表引用用单斜杠 `/` 不是 `//`（direct_form 模式目标表单是 targetForm 类型，formSuffix="/"）；❌ 触发字段不加任何后缀（formSuffix=""）。
   - `value` = **与 `__source` 完全相同**，不做任何转换。❌ 不需要点号转换。
   - 历史事故：曾因 `__source` 误用 `//` 导致验证器报"类型不合法"；`__display` 误存为 JSON 对象导致设置面板显示 `[object Object]`；`value` 误做点号转换导致与 `__source` 不一致。

9.**【强制】删除流程表单数据时，必须增加流程状态判断为"已完成"** — 流程表单的数据在流程进行中时不允许直接删除，只有流程完成后（状态为"已完成"）才能删除。创建删除自动化规则时，必须在获取数据节点中增加流程状态的条件判断，确保只删除流程已结束的数据。
   - 获取数据节点的过滤条件中必须包含：流程状态 = "已完成"
   - 如果目标表单是流程表单（formType=process），必须添加此条件
   - 如果目标表单是普通表单（formType=receipt），无需此条件
   - 历史事故：曾因未添加流程状态判断，导致流程进行中的数据被误删除，造成业务流程异常

10.**【强制】循环容器内发起审批节点的 `assignments[].value` 必须使用 `${cycleNodeId}.fieldId` 格式** — 设计器 setter tree 选择器中"当前循环执行的数据"展开后子选项的 value 就是此格式（如 `${node_xxx}.textField_570rac0i`）。同时必须写入 `__display` 字段（源字段中文名），否则 setter 在未加载 `getFormVariables.json` API 时显示空白。
   - ❌ 裸 `cycleNodeId`（如 `node_xxx`）→ setter 全部显示"当前循环执行的数据"整体，不显示具体字段名
   - ❌ `cycleNodeId//fieldId`（如 `node_xxx//textField_570rac0i`）→ setter 不识别，保存后回退为空
   - ✅ `${cycleNodeId}.fieldId`（如 `${node_xxx}.textField_570rac0i`）→ setter 正确显示各字段名
   - `__display` = 源字段中文名（如 `"任务名称"`），缺少则首次加载显示"请配置字段/变量"（空白）
   - **面板保存 ≠ 服务器保存**：设计器面板内的"保存"按钮只应用到本地画布，必须点击页面顶部工具栏的 `simple-flow-canvas-save` 按钮才触发 `saveProcess` API 持久化。创建后执行 `integration-designer-fix.js --save` 自动修复设计器面板并持久化。
   - **正确保存流程（v2.8.2 经实测验证）**：①点击设置面板右下角"保存"按钮（通过 React `__reactEventHandlers$.onClick` 调用，非 DOM click）→ ②检查是否有错误弹窗（如发起人未设置等）→ ③点击空白处退出节点 → ④点击右上角"发布"按钮（同样通过 React onClick）→ ⑤检查是否有错误弹窗 → ⑥等待 `saveProcess` API 返回 `success:true`。**每次保存后必须检查弹窗**，否则可能"假保存"成功。
   - 历史事故：v2.6.0~v2.7.0 经历三轮格式试错（裸 cycleNodeId → cycleNodeId//fieldId → ${cycleNodeId}.fieldId），每次都"保存成功"但设计器显示不正确，折腾多天。根因是 setter tree 选择器子选项 value 格式未通过 Playwright 逆向确认。

11.**【强制】`--cycle-initiate-approval-assignment` 参数格式为 `目标字段ID:processVar:源字段ID`（两个冒号），不是 `目标字段ID:源字段ID`（一个冒号）。** CLI 的 `parseAssignments` 函数按 `column:valueType:value` 三段式解析，只传一个冒号会导致 valueType 和 value 都截断为空，赋值静默丢失（assignments 数组为空）。
   - ✅ 正确：`--cycle-initiate-approval-assignment "textField_target:processVar:textField_source"`
   - ❌ 错误：`--cycle-initiate-approval-assignment "textField_target:textField_source"`（只一个冒号，赋值被静默丢弃）
   - 回读验证：创建后用 `integration-get.js --raw` 检查 `initiateApprovalRules.assignments` 数组长度，为 0 = 格式错误。
   - **标准 CLI 命令模板（循环内发起审批，照抄替换真实 ID 即可）：**
   ```
   node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后循环发起审批" \
     --events processFinish --approval-actions agree \
     --data-source-type subform --data-sub-field-id tableField_xxx \
     --cycle \
     --cycle-initiate-approval-form-uuid FORM-TARGET \
     --cycle-initiate-approval-assignment "textField_target1:processVar:textField_source1" \
     --cycle-initiate-approval-assignment "employeeField_target2:processVar:employeeField_source2" \
     --cycle-initiate-approval-assignment "dateField_target3:processVar:dateField_source3" \
     --publish
   ```
   ⚠️ 创建后必须执行 `integration-designer-fix.js --save` 修复设计器面板并持久化。

12.**【强制】所有发起审批节点的发起人（initiator）不得为空，禁止使用 `form_inst_creator`；【默认约定·禁止询问】发起人默认 = 当前登录用户（开发者本人），无需向用户询问、无需手动传参。**
   - **【默认发起人（CLI 已实现，v2.8.12）】** 未显式指定 `--initiate-approval-initiator-user` 时，`integration-create.js` 自动读取项目根目录 `.cookies.json` 的 `login_user.userId / login_user.userName`（即当前登录的开发者）作为发起人，并输出 `ℹ️ 【默认发起人】` 提示。**AI 禁止为"发起人用谁"停下来问用户**——直接省略该参数让 CLI 默认即可；只有用户主动要求特定发起人时才传 `--initiate-approval-initiator-user <userId[:name]>`。
   - initiator 实际格式（`buildSelectUserInitiator`，主链与循环内同款）：`{type: 'select_user', value: '{"id":"<userId>","label":"<姓名>","type":"employee"}'}`
   - ❌ 空值 → 设计器保存时报错弹窗，保存失败但不报 API 错误
   - ❌ `form_inst_creator`（系统变量）→ **processFinish 事件中不可用，导致发起审批静默失败**（v2.8.3 事故）
   - ✅ 当前登录用户（默认）或显式指定的 userId → 设计器正确显示姓名，processFinish 事件中正常工作
   - ⚠️ **文档纠偏（v2.8.12）**：旧版规则描述的 `findSubmitterFieldId` 自动查找（按"提交人 EmployeeField→第一个 EmployeeField"优先级）**从未存在于当前代码**（全目录无该函数），`form_field_list`/`form_field` 两种 initiator 格式也与当前代码不符（实际统一为 `select_user`）。以本条描述为准。
   - 历史事故：
     - v2.8.2（循环内）：initiator 为空，设计器弹"发起人不能为空"。
     - v2.8.3（主链）：发起审批回退到 `form_inst_creator`，processFinish 事件中不可用，导致发起审批静默失败（规则触发但未生成数据）。
     - v2.0.27（文档-代码脱节）：旧文档声称"CLI 已自动查找发起人"，实际代码硬性要求 `--initiate-approval-initiator-user` 缺失即报错退出 → AI 被迫向用户索要 userId。而"默认开发者 ID"此前只在 data-tester/batch-submitter.js（EmployeeField 自动填充）实现过，integration 路径从未配置。修复：CLI 缺省取 `.cookies.json` 当前登录用户，本规则同步改写。

13.**【强制】目标表单是流程表单时，必须使用「发起审批」节点创建数据，禁止使用「更新数据」或「新增数据」节点。** 流程表单的数据必须关联流程实例才能正常打开，直接用数据操作节点插入的数据没有流程实例，无法在宜搭中打开查看。
   - ✅ 目标表单是流程表单 → 用 InitiateApprovalNode（发起审批）创建流程实例
   - ❌ 目标表单是流程表单 → 用 UpdateDataNode（更新数据）或 AddDataNode（新增数据）→ 数据无流程实例，无法打开
   - 历史事故（v2.8.3）：AI 用更新数据节点向流程表单插入数据，保存成功但数据无法打开；改用发起审批节点后又用 insert 事件触发，导致规则触发但未生成数据（流程表单的 insert 事件不触发自动化）。

13.1.**【强制】规则 13 只约束「创建新记录」场景 — 流程表单目标的插入/更新/删除完整决策表（按表直接执行，禁止停下来向用户抛方案选择题）。**
   - **规则 13 禁止的是用数据节点创建新记录**（新记录无流程实例 → 打不开），它**不禁止**对流程表单**已有记录**的更新与删除。更新数据节点作用于流程表单已有记录（规则 14 两步方案的节点 2 已实测可行）、删除数据节点配合"流程状态=已完成"条件（规则 9）均为标准可行方案。**禁止把规则 13 的"创建场景禁止"推广到更新/删除场景。**
   - **完整决策表（目标表单是流程表单时，按操作类型对号入座直接执行）：**
     | 操作 | 标准方案 | 关键约束 |
     |------|---------|---------|
     | 插入新数据（仅主表字段） | InitiateApprovalNode（发起审批，见规则 13） | 发起人默认=当前登录用户，无需传参无需询问（规则 12）；触发表单也是流程表单时事件用 processFinish+agree（规则 15） |
     | 插入新数据（含子表） | 发起审批 + 更新数据 两步方案（见规则 14） | CLI 自动检测：`--update-form-uuid` 指向流程表单 + `--update-none-operation add` 时自动插入发起审批节点 |
     | 更新已有数据 | UpdateDataNode（更新数据，direct_form，CLI 模板见规则 5） | `--update-none-operation` 必须用 `ignored`（默认）——**禁止 add**：add 在匹配不到时会插入无流程实例的脏数据；匹配条件必须用已有记录的业务键（如名称）定位 |
     | 删除已有数据 | 获取数据节点（过滤条件必须含 流程状态="已完成"，见规则 9）→ 删除数据节点 | 删整条：`--data-form-uuid` + `--delete-data`（不传 `--delete-sub-source-id`）；只删子表行：按规则 16 选模式 A/B |
   - **遇到「插入+更新+删除」等组合需求**：按上表把每个动作拆成独立逻辑流（一条逻辑流一个动作）直接创建，**全部动作均可实现**。禁止向用户抛"方案A 改普通表单 / 方案B 放弃更新删除 / 方案C 自定义"之类的选择题；也禁止主动建议用户把流程表单改成普通表单来绕过限制（除非用户主动提出）。
   - 历史事故（v2.0.27）：AI 把规则 13 误读为"流程表单一律禁止更新/删除"，对"插入+更新+删除"组合需求停下来问用户选方案 A/B/C。实际三个动作全部可实现：插入=发起审批、更新=更新数据节点（ignored）、删除=获取（流程状态=已完成）+删除节点。根因：可行方案分散在规则 9/13/14/15/16 中，缺少按操作类型对号入座的总决策表。

14.**【强制】发起审批节点（InitiateApprovalNode）不支持子表字段赋值。** assignments 中只能赋值目标表单的**主表字段**，子表字段（tableField 下的字段）赋值不生效（规则触发但子表数据为空）。
   - 如需向目标流程表单的子表插入数据，必须采用**「发起审批 + 更新数据」两步方案**：
     - 节点1：InitiateApprovalNode — 只赋值主表字段创建流程实例
     - 节点2：UpdateDataNode（direct_form 子表 upsert）— 按主表字段匹配刚创建的记录，向子表插入数据
   - **CLI v2.8.3 已实现自动检测**：当 `--update-form-uuid` 指向流程表单且 `--update-none-operation add` 时，CLI 自动在更新数据节点前插入发起审批节点（从 `--update-condition` 提取主表字段作为发起审批赋值），AI 无需手动判断和添加 `--initiate-approval-*` 参数。
   - **两步方案中 UpdateDataNode 的 `--update-none-operation` 必须设为 `add`（而非 `ignored`）**，因为子表当前为空，`ignored` 会跳过不插入。
   - **子表字段必须同时出现在 `--update-sub-condition`（匹配条件）和 `--update-assignment`（赋值）中**，否则只匹配不赋值，子表数据不完整。
   - **两步方案标准 CLI 命令模板（照抄替换真实 ID 即可，发起人由 CLI 自动查找）：**
   ```
   node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "提交数据插入目标流程表单子表" \
     --initiate-approval-form-uuid FORM-TARGET \
     --initiate-approval-assignment "textField_target_main:processVar:textField_trig_main" \
     --update-form-uuid FORM-TARGET \
     --update-condition "textField_target_main:名称:textField_trig_main:TextField:Equal::processVar" \
     --update-sub-source-id tableField_target_sub \
     --update-sub-condition "numberField_target_sub_key:规格:numberField_trig_sub_key:NumberField:Equal::processVar" \
     --update-assignment "numberField_target_sub_key:processVar:numberField_trig_sub_key" \
     --update-assignment "numberField_target_sub_val:processVar:numberField_trig_sub_val" \
     --update-none-operation add \
     --publish
   ```
   ⚠️ 发起人默认=当前登录用户（开发者），无需传 `--initiate-approval-initiator-user`（CLI v2.8.12 起自动从 `.cookies.json` 读取，规则 12）。仅当用户主动要求特定发起人时才显式指定。
   - 历史事故（v2.8.3）：①AI 在发起审批节点中赋值子表字段 → 规则触发但子表数据为空 ②两步方案中 noneOperation 用 ignored → 发起审批创建了主表记录但子表仍为空（ignored 跳过了子表插入）③子表字段只在 sub-condition 中出现未在 assignment 中出现 → 规格字段没写入目标子表。

15.**【强制】流程表单作为触发表单时，触发事件必须「分动作区分」，不可一律用 processFinish。** `integration-create.js` v2.8.14 已实现精确的触发事件自动检测与修正（黄金标准参考流「主表操作主表1-删除同步目标表单1」LPROC-76E66）：

   - **流程表单触发事件语义（分动作对号入座，禁止全部改成 processFinish）**：
     - **insert（新增/提交）** → 流程表单上表现为「流程结束」→ **自动映射为 `processFinish + agree`**（未显式 `--events` 时同理）
     - **update（编辑）** → 流程表单上仍是**独立数据操作事件**，显式 `--events update` 时**保留**原事件（编辑触发）
     - **delete（删除）** → 流程表单上仍是**独立数据操作事件**，显式 `--events delete` 时**保留**原事件（删除触发，对齐金标准 `formEventType=["delete"]` + `examineApproveType="processFinish"`）

   - **【自动检测逻辑（已实现）】** `integration-create.js` 在创建逻辑流前自动调用 `getFormType` 检测触发表单类型，命中 `formType === 'process'` 时按以下规则处理：
     - 未显式指定 `--events`（默认 insert）→ 自动设为 `processFinish + agree`（禁止确认，直接执行）
     - 显式指定 `--events insert` → 将 insert 映射为 `processFinish + agree`（流程表单 submit=流程完成）
     - 显式指定 `--events update` → **保留 update**（编辑触发，无需审批动作）
     - 显式指定 `--events delete` → **保留 delete**（删除触发，无需审批动作）
     - AI 无需手动判断触发表单类型，CLI 会自动拦截并精确处理
   - **【默认约定·禁止确认】触发事件由 CLI 按动作自动判定，不是需要征求意见的选项。** 用户描述的动作（新增/编辑/删除）对应唯一的标准触发事件：
     - 新增数据 → `processFinish`（流程结束）
     - 编辑数据 → `update`（编辑触发）
     - 删除数据 → `delete`（删除当前触发表单数据触发）
     禁止把"新增用流程结束、编辑用编辑、删除用删除"统一改成"全部用 processFinish"。也**禁止**停下发"你确认这个触发事件吗"之类的确认题。只有存在**多个**可行方案且用户意图无法唯一确定时，才允许向用户询问。

   - 历史事故（v2.8.3）：AI 用 `--events insert` 触发流程表单，规则触发了但没生成数据。另一事故：AI 用 `--events delete` 触发流程表单删除规则，规则永远无法触发。
   - 历史事故（v2.0.27）：AI 用 `--events update` 触发流程表单，设计器显示不正常且字段未设置。根因：`integration-create.js` 缺少触发表单类型自动检测逻辑，AI 和 CLI 都未拦截无效事件。修复：添加触发表单类型自动检测。
   - 历史事故（v2.8.14）：此前规则15过度泛化——把"流程表单源的 insert 不单独触发"泛化为"update/delete 也不触发"，导致 AI 创建三条同步流（新增/编辑/删除）时全部被改写为 `processFinish + agree`，编辑和删除无法按"编辑/删除"触发。修复：重写触发事件自动检测，仅 insert 默认/显式映射为 processFinish，显式 update/delete 保留原事件。

16.**【强制】删除子表数据的两种标准模式（按子表关联范围选择）** — 删除目标表单的子表行时，禁止在同一个获取节点里混用主表条件和子表条件（引擎报"表单不存在"红色错误）。

   **模式 A：sub_table 直接获取模式（4 节点，推荐 — 设计器 UI 友好）**：触发 → 获取多条数据（从子表中获取） → 删除子表行 → 结束
   - 适用场景：子表条件字段值在目标表单中唯一（不会跨主记录重复），或全局删除匹配行即可
   - **节点1 触发**：流程表单用 `processFinish + agree`，普通表单用 `delete`
   - **节点2 子表多条**（GetBatchDataNode, originalType="sub_table", sourceId=`#{FORM-TARGET}`, subSourceId=字段ID）：条件=触发表单字段关联目标子表字段
   - **节点3 删除子表行**（DeleteDataNode, sourceId=节点2的nodeId, delete-sub-source-id+delete-sub-condition 精确匹配）
   - **关键**：`--data-condition` 只放子表字段条件，**不能加主表字段条件**（否则引擎报错）
   - **CLI 命令模板（照抄替换真实 ID）：**
   ```
   node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后删除关联子表行" \
     --events processFinish --approval-actions agree \
     --data-form-uuid FORM-TARGET \
     --data-query-type multiple \
     --data-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
     --data-sub-source-id tableField_target_sub \
     --delete-data \
     --delete-sub-source-id tableField_target_sub \
     --delete-sub-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
     --publish
   ```
   - ⚠️ `--data-condition` 中**不能**加 `--data-sub-condition`（否则触发 chain mode 变成 5 节点 cascade，且设计器显示"从数据节点中获取"而非"从子表中获取"）
   - **v2.8.7 关键澄清**：`--data-sub-source-id` **单独使用（无 `--data-sub-condition`）即触发 sub_table 直接获取模式**（节点2 显示"从子表中获取"，sourceId=`#{目标表单}`）。它与 `--data-source-type subform` 不同——subform 是 `sourceId=#{触发表单}`（从触发数据子表取），本模式是 `sourceId=#{目标表单}`（从目标表单子表取）。若误传了 `--data-sub-condition`，会变成 5 节点 cascade（模式 B，节点显示"从数据节点中获取"）。

   **模式 B：cascade 链式获取模式（5 节点）**：触发 → 获取主表单条 → 获取子表多条 → 删除子表行 → 结束
   - 适用场景：子表条件字段值跨主记录重复，必须先用主表字段定位到具体父记录
   - **节点2 主表单单条**（GetSingleDataNode, sourceId=目标表单, originalType=process_form/form）：主条件=触发表单字段关联目标主表字段（流程表单目标用 `process_form`，普通表单目标用 `form`）
   - **节点3 子表多条**（GetBatchDataNode, originalType="sub_table"【非"node"，v2.8.8 修正】, sourceId=节点2的nodeId, subSourceId=目标子表字段ID）：子条件=触发表单字段关联目标子表字段
   - **节点4 删除子表行**（DeleteDataNode, sourceId=节点3的nodeId, **deleteData.type="sub_table"**【非"node"，v2.8.8 修正】+ 无 appType + targetItem={} + subSourceId=目标子表 + subCondition）：删除子表行必须 `type="sub_table"`；仅删除整条主表记录（无 subSourceId）才用 `type="node"`+appType
   - **CLI v2.8.5 已支持自动 cascade**：同时指定 `--data-sub-source-id` 和 `--data-sub-condition` 时自动启用链式获取
   - **CLI 命令模板（照抄替换真实 ID）：**
   ```
   node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后删除关联子表行" \
     --events processFinish --approval-actions agree \
     --data-form-uuid FORM-TARGET \
     --data-query-type single \
     --data-condition "textField_target_main:名称:textField_trigger_main:TextField:Equal::processVar" \
     --data-sub-source-id tableField_target_sub \
     --data-sub-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
     --delete-data \
     --delete-sub-source-id tableField_target_sub \
     --delete-sub-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
     --publish
   ```
   - ⚠️ 目标表单是流程表单时，还应在 `--data-condition` 中追加流程状态条件（字段ID 视平台而定）
   - **设计器 UI 差异**：模式 A 在节点2显示"从子表中获取"+ 目标表单名称；模式 B 显示"从数据节点中获取"+ 上游节点名称
   - **🟡 v2.8.8 重要引擎限制（bundle 0.2.241 验证）**：模式 A（sub_table 直接获取）**不能**在 condition 中放主表字段作为过滤条件——引擎 `GetDataSetter` 在 `originalType="sub_table"` 时只允许子表字段做条件。**任何"按主表字段（如名称）锁定 + 从子表取行"的场景都必须用模式 B（cascade，5 节点）**。模式 A 仅适用于「子表条件字段值全局唯一」或「全局删除匹配行」的简化场景。

   - 历史事故（v2.8.5 前）：AI 把"删除目标子表行"做成单个 GetBatchDataNode+DeleteDataNode（2 节点），主表字段和子表字段混在同一个 condition 里，引擎报"表单不存在"红色错误；另一版本用 delete 事件触发流程表单，规则无法触发。
   - 历史事故（v2.8.5）：AI 使用 chain mode（--data-sub-condition）创建了 cascade 流，虽然运行时能工作，但设计器显示"从数据节点中获取"而非"从子表中获取"，且 sourceId 引用上游节点的 viewJson 格式（`appType: '', targetItem: {}`）未填充表单友好信息，导致用户难以通过 UI 确认配置正确性。修复：引入 sub_table 直接获取模式（模式 A），仅使用 `--data-condition`（不加 `--data-sub-condition`），让 CLI 使用 originalType="sub_table" 路径，viewJson 的 targetItem 正确填充目标表单信息。
   - **历史事故（v2.8.8）**：AI（包括本会话）错误判断 cascade（5 节点）里 node3（GetBatchDataNode）的 `originalType` 必须是 `"node"`（因 sourceId 指向上游节点）。**事实**：手工配置金标准显示 **节点3 的 `originalType` 应当是 `"sub_table"`**——`sourceId` 指向上游节点 + `subSourceId`=目标子表 + `originalType="sub_table"` 才会让设计器显示「从子表中获取」+「数据节点=获取单条数据」+「子表=产品规格」三件套。修复 `integration-view-builder.js` 第 487 行和 `integration-process-builder.js` 第 612 行：`originalType: 'node'` → `originalType: 'sub_table'`。验证：与用户手工截图（设计器面板）对照，节点3 的「从子表中获取」radio 选中、「数据节点」=「获取单条数据」、「子表」=「产品规格」、condition 仅含子表规格条件——完全匹配 `originalType="sub_table"` + `sourceId=node_2` + `subSourceId=tableField_5rkfw271` 的 viewJson。教训：**不要根据代码字段名（如 `sourceId=节点`）推断 `originalType`**，必须以**设计器手工配置 viewJson 金标准**为准。

17.**【强制】全场景组合总决策矩阵（4 数据拓扑 × 3 操作 × 2 目标类型 = 24 格）— 创建任何逻辑流前先在此表对号入座，禁止脱离矩阵自由发挥节点方案。**
   - **数据拓扑定义（"X 操作 Y" = 触发数据来自 X，操作目标是 Y）**：
     - **主表→主表**：触发主表字段 → 目标主表记录
     - **子表→主表**：触发子表明细行 → 目标主表记录（direct_form 引擎自动逐行迭代，规则 5.1）
     - **主表→子表**：触发主表字段 → 目标子表行
     - **子表→子表**：触发子表明细行 → 目标子表行
   - **矩阵（方案缩写：AF=发起审批节点；UD=更新数据节点 direct_form；AD=新增数据节点；GD=获取数据节点+删除数据节点；两步=发起审批+更新数据）**：

     | 拓扑 | 操作 | 目标=普通表单 | 目标=流程表单 |
     |------|------|--------------|--------------|
     | 主表→主表 | 新增 | ✅ UD+add(upsert，规则5模板) 或 AD(--add-data-form-uuid) | ✅ AF（规则13；每触发1条建1条） |
     | 主表→主表 | 更新 | ✅ UD（规则5模板） | ✅ UD+ignored（规则13.1） |
     | 主表→主表 | 删除 | ✅ GD 删整条(--data-condition+--delete-data) | ✅ GD+流程状态条件（字段写法见下方"缺口1已闭合"） |
     | 子表→主表 | 新增 | ✅ UD+add（引擎逐行迭代，5.1已验证；⚠️ 首选，规则19）；❌ AD batch 写目标主表在流程表单触发场景崩溃（规则19） | ✅ 循环+AF 逐行发起（规则11模板）/整单1条则主链AF |
     | 子表→主表 | 更新 | ✅ UD（5.1 已验证：入库明细→库存主表） | ✅ UD+ignored（同主表→主表更新，引擎逐行迭代） |
     | 子表→主表 | 删除 | ✅ GD 删整条（--data-condition 引用触发子表字段，见下方缺口2模板） | ✅ GD+流程状态条件（字段写法见下方"缺口1已闭合"） |
     | 主表→子表 | 新增 | ✅ 往已有记录子表插行：UD+--update-sub-source-id+add（规则14同款，目标改普通表单免AF）；新建记录含子表行：AD+--add-data-insert-type sub_table | ✅ 两步方案（规则14模板，触发字段全用主表字段） |
     | 主表→子表 | 更新 | ✅ UD+--update-sub-*（子表upsert，cli-examples 模板） | ✅ UD+--update-sub-*（noneOperation 按下方分层表选） |
     | 主表→子表 | 删除 | ✅ 规则16 模式A（子表字段值全局唯一）或模式B | ✅ 规则16 模式A/B+流程状态条件（字段写法见下方"缺口1已闭合"） |
     | 子表→子表 | 新增 | ✅ AD+sub_table+batch（cli-examples"子表批量新增"模板） | ✅ 两步方案（规则14模板原样） |
     | 子表→子表 | 更新 | ⚠️ 先过规则20判据：定位目标父记录的业务键在触发表单【主表】→ UD+--update-sub-*（入库明细→采购订单.采购明细 已验证）；键只在触发【子表行】里 → ❌ 直接更新静默空转，✅ 必须中间表两段式（规则20，实测32/32） | 同左判据（规则20）；中间表流B按规则13.1 用 ignored |
     | 子表→子表 | 删除 | ✅ 规则16 模式A/B 模板 | ✅ 规则16 模式A/B+流程状态条件（字段写法见下方"缺口1已闭合"） |

   - **✅ 缺口1已闭合（v2.0.28 金标准：主表操作主表1-删除目标表单1）** — 删除流程表单数据时「流程状态=已完成」过滤条件的**真实字段写法已实测固化**：字段ID=**`process_status`**，组件类型=`SelectField`（多值 multiple=true），运算符=**「包含」(Contain)**，值=**「已完成」**，valueType=`literal`（extValue=`value`；设计器存数组 `["已完成"]`，CLI 存字符串 `"已完成"` 均可工作）。**CLI 写法**（追加到 `--data-condition`，注意用**单冒号**分隔，勿用 `::`）：
     ```
     --data-condition "process_status:流程状态:已完成:SelectField:Contain:literal"
     ```
     ⚠️ **单冒号坑**：`--data-condition` 是 `bFieldId:bFieldName:aFieldId:componentType:opCode:valueType` 六段单冒号格式。若误用 `Contain::literal`（双冒号）会把 valueType 置空回退成 `processVar`，导致值"已完成"被当变量引用（v2.8.11/v2.0.28 实测踩坑）。**处理方式（禁止编造字段ID，规则2/18 同源约束）**：若遇到未确认的目标=流程表单删除场景，先用金标准路径——①在设计器手工建一条含"流程状态=已完成"过滤条件的获取节点 → ② `integration-get.js <appType> <processCode> --raw` 导出该节点 condition → ③ 固化并照抄。拿到金标准前，向用户说明"流程状态条件写法待金标准确认"并执行①②，不算多余提问。
   - **缺口2 模板（子表→主表 删整条，往已有模板的参数适配，非新能力）**：获取节点 `--data-condition` 的 aFieldId 放触发**子表字段ID**（规则16 模板已证明获取条件可引用触发子表字段），其余同 cli-examples"批量删除"：
     ```
     node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后删除目标表单匹配记录" \
       --events processFinish --approval-actions agree \
       --data-form-uuid FORM-TARGET --data-query-type single \
       --data-condition "textField_target_main:名称:textField_trigger_sub_key:TextField:Equal::processVar" \
       --delete-data --publish
     ```
     （流程表单触发默认 processFinish+agree，规则15；目标为普通表单无需流程状态条件）
   - **noneOperation 分层语义（子表更新场景选 add/ignored 的唯一判据，两半均有实测来源）**：
     | 层级 | ignored | add |
     |------|---------|-----|
     | 主表记录未匹配（主条件不命中） | 跳过，什么都不做 | **新增一条主表记录**（规则5 upsert 已验证；目标=流程表单时这是无流程实例的脏数据 → 禁止，规则13.1） |
     | 主表匹配、子表行未匹配（子条件不命中） | 跳过该行，不插入（规则14 事故②实测） | 在匹配到的主表记录子表中**新增一行**（规则14 两步方案实测） |
     - **选型口诀**：目标=流程表单且主表可能匹配不到 → 只能 ignored；主表必匹配到（如两步方案刚创建的记录）且需给子表插行 → add；目标=普通表单且允许新增主表（upsert）→ add。
   - **审查记录（v2.8.11，2026-08-20）**：24 格全量对照规则 5/5.1/9/11/13/13.1/14/15/16 + cli-examples 20 示例 + process-builder 源码。结论：16 格有模板可照抄，4 格本次补判定/模板（子表→主表删整条、主表→子表新增的两种语义），4 格（目标=流程表单的删除）依赖缺口1的流程状态字段金标准。矩阵随新能力落地持续更新，修改本矩阵必须同步注明来源（哪条规则/哪条模板/哪个实测流）。

18.**【强制】显式分支 upsert（"存在则更新/不存在则插入"）必须用 CLI `--conditional-upsert`，且分支内动作节点必须嵌套进 ConditionNode.children — 「执行接线正确」≠「画布渲染正确」，两者缺一不可。**
   - **场景识别**：用户要求"匹配到就更新、匹配不到就新增"且**明确要求显式分支判断**（画布上可见条件分支节点）时，用 `--conditional-upsert`（不是默认 upsert——默认 upsert 是单更新节点 `noneOperation=add`，画布上没有分支）。若用户只要"同步效果"没要求分支，按规则 5 模板用单节点 upsert。
   - **🔴 画布嵌套铁律（v2.8.20 实证）**：viewJson 中分支内动作节点必须作为 ConditionNode 的 `children` **层级嵌套**：
     ```
     ConditionContainer（条件分支）
       ├─ ConditionNode（条件1，有值）→ children: [UpdateDataNode 更新数据]
       └─ ConditionNode（其他情况，默认）→ children: [InitiateApprovalNode 发起审批]
     ```
     ❌ 动作节点平铺在 CanvasEngine children 顶层（与容器同级）→ processJson nextId 接线即使完全正确（条件1→更新、默认→发起审批），**设计器画布仍把动作节点画在主干上、分支内为空**。saveProcess 不校验嵌套层级，保存照样成功——又一个"保存成功 ≠ 配置正确"的实例。CLI v2.8.20 已修复 view-builder 自动嵌套，AI 无需手写，但**回读验证必须确认嵌套结构**。
   - **标准节点树（6 节点）**：表单事件触发 → 获取单条数据（按业务键匹配目标表单）→ 条件分支[条件1:实例ID有值 ExistValue→更新数据 / 其他情况→发起审批] → 结束。
   - **🔵 条件1 判断存在性的字段必须是「获取数据节点的实例ID」（v2.8.21 根因修复）**：CLI 自动生成 `条件1` 规则引用**获取数据节点的实例ID变量** = `node_xxx.pid`（`opCode=ExistValue` 有值、`name/__display=获取单条数据.实例ID`）。**禁止把判断字段填成固定字面量"实例ID"**——那只是检出示意图，不是运行时真正要检查的节点变量。必须引用 `${dataNodeId}.pid`（`__display` 为节点变量中文名，设计器才能从"获取单条数据"节点取到真实实例ID值）。**禁止用业务匹配字段（如名称）做 ExistValue 判断**——业务字段可能为空但记录已存在，用业务字段会把"已存在"误判为"不存在"导致重复插入。conditionalUpsert 语义下"新建一律走发起审批"，目标必为流程表单，实例ID 即流程表单实例ID系统字段。
     - **字段名铁律（v2.8.23 实证，v2.8.26 补坑，v2.8.27 定稿）**：实例ID 变量引用键是 **`.pid`**，**不是 `.processInstanceId`**，也**不是 `.proc_inst_id`**。用户手工配置金标准（设计器变量树"获取单条数据.实例ID"）确认 id = `${node}.pid`。CLI 曾误用 `.processInstanceId` 退化显示固定"实例ID"；v2.8.25 又曾误用 `.proc_inst_id`（误读 dataNode/getConfig.json 的**表单筛选字段**表）导致标红、下拉不选中。**教训：条件分支引用「节点输出」的键后缀固定是 `.pid`；`proc_inst_id` 只是数据节点自身表单筛选用的字段键，属不同上下文，禁止混用**。判断键必须对照设计器变量树而非 getConfig 字段表。
     - **🔴 `${}` 包裹铁律（v2.8.27 实证，连续三个版本踩坑的真正根因）**：规则 id 存进 viewJson/processJson 时，`${` 和 `}` 是**字面量字符**，必须原样出现在最终 JSON 里：`"id": "${node_xxx}.pid"`。**JS 代码里写未转义模板字符串 `` `${dataNodeId}.pid` `` 是错的**——插值会把 `${}` 吃掉产出 `"node_xxx.pid"`，后果：设计器下拉匹配不到（span 显示对但下拉不选中+标红）+ 运行时恒判"无值"走默认分支重复插入。正确写法：`` `\${${dataNodeId}}.pid` ``（转义）或 `'$' + '{' + dataNodeId + '}.pid'`。统一走 `buildExistenceBranchCondition(dataNodeId)` 导出函数，禁止在别处手拼。**验证金标准必须逐字符 diff（含 `${}`），不能只对比字段名/后缀——v2.8.23~26 三次"已修复"全是假验证。**
     - **`extValue` 铁律（v2.8.24 实证）**：节点变量引用条件（id 形如 `${node}.pid`）的 `extValue` 必须为 **`"value"`**，`valueType` 保持 `"literal"`。**禁止把 `extValue` 写成 `"literal"`**。用户手配金标准（csa66_golden.json 条件规则）`extValue="value"`、`valueType="literal"`、`op="有值"`、`name/__display=获取单条数据.实例ID`。实测：`extValue` 写成 `"literal"` 时，即使 `id` 已正确指向 `${node}.pid`，设计器条件 setter 仍把该字段当成"固定字面量"而非"节点实例ID变量引用"，渲染为未选中（v2.8.24 前用户连续多次踩坑）。CLI 已在 `buildConditionNodeProps` 中：凡 `fieldId` 含 `.`（节点变量引用）则强制 `extValue="value"`。
     - **🔴 无值操作符键禁令（v2.8.28 实证，`${}` 修复后的下一个隐藏根因）**：ExistValue（有值）/NotExistValue（无值）这类**无值比较操作符**的条件规则，**禁止写 `value` 和 `ruleValue` 键**——金标准（用户手配 captured_save.json）里这两个键**不存在**。CLI 曾写 `value:""/ruleValue:""`，设计器条件 setter 拿规则 `value` 匹配下拉选项 key，空字符串匹配不上 `${node}.pid` → span 靠 name 显示正确但下拉不选中+标红（与 `${}` 丢失同症状不同根因）。`buildConditionNodeProps` 已对无值操作符跳过这两个键；`buildExistenceBranchCondition` 不再产出 `value:''`。**教训：金标准 diff 必须键集合级对比（哪些键存在/缺失），多一个空键同样致命——v2.8.27 只 diff 值没 diff 键集合，漏掉了这个根因。**
   - **目标=流程表单时插入分支必须用发起审批节点**（规则 13），普通表单则用新增数据节点。更新分支 `noneOperation=ignored`。
   - **标准 CLI 命令模板（照抄替换真实 ID 即可）：**
     ```
     node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "提交后分支判断更新或新增" \
       --events processFinish --approval-actions agree \
       --data-form-uuid FORM-TARGET --data-query-type single \
       --data-condition "textField_target_key:名称:textField_trig_key:TextField:Equal::processVar" \
       --update-form-uuid FORM-TARGET \
       --update-condition "textField_target_key:名称:textField_trig_key:TextField:Equal::processVar" \
       --update-assignment "numberField_target_val:processVar:numberField_trig_val" \
       --update-none-operation ignored \
       --initiate-approval-form-uuid FORM-TARGET \
       --initiate-approval-assignment "textField_target_key:processVar:textField_trig_key" \
       --initiate-approval-assignment "numberField_target_val:processVar:numberField_trig_val" \
       --conditional-upsert --publish
     ```
     （发起人默认=当前登录用户，规则 12；流程表单触发自动映射 processFinish+agree，规则 15）
   - **验证闭环（在规则 4 基础上追加画布验证）**：① `integration-get.js <appType> <processCode> --raw` 回读 viewJson 树，确认 UpdateDataNode/InitiateApprovalNode 在 ConditionNode **children 内**而非顶层平铺；② `integration-validate.js` 体检通过；③ 打开设计器确认画布渲染（分支内能看到两个动作节点）。
   - 历史事故（v2.8.13~v2.8.16）：conditionalUpsert 首版只有 processJson 接线，v2.8.16 挪了容器位置但动作节点仍平铺，用户打开设计器看到"分支里面没有节点，节点在分支外面"（LPROC-ULD662...实锤）。修复（v2.8.20）：view-builder 把两个动作节点分别嵌套进「条件1」/「其他情况」的 children，重建 LPROC-N4G662... 设计器 logicSchema 确认嵌套正确。教训：**凡涉及容器类节点（条件分支/循环/并行），子节点必须层级嵌套；每次都应打开设计器亲眼确认画布，不要只看回读 JSON**。

19.**【强制·v2.8.29 实测】「子表→主表」批量写入首选 direct_form upsert（UD+add），禁止用 AD batch 写目标主表 — 后者在流程表单触发场景下引擎崩溃且体检不拦截。**
   - **事故（2026-09-22，LPROC-BMG66GA1 实锤）**：流程表单 processFinish+agree 触发 → AddDataNode `--add-data-type batch --add-data-source-id 触发子表字段ID`（insertType=form 写目标主表，7 条 column 裸字段赋值）→ 运行时报 `节点[新增数据] 执行异常: com.alibaba.fastjson.JSONArray cannot be cast to java.util.Map`，零写入。保存前体检通过——又一个"保存成功 ≠ 配置正确"实例。
   - **标准替代方案（已回归验证）**：direct_form 更新节点 + `--update-none-operation add`（规则 5.1 金标准逐行迭代）写入目标主表：主条件 a 侧引用触发子表字段（引擎逐行迭代 upsert），赋值用 processVar。实测流 LPROC-NAD66NC1：对账单审批通过 → 对账明细 4 行逐行 upsert 到中间表，全部正确（含触发主表流水号字段引用）。
   - **中间表架构模式（触发子表 → 中间普通表 → 目标子表）**：当直接更新目标子表被引擎限制封死（5.1 只能写主表列、级联 GetSingle 解析不到触发子表字段会静默空转）时，用两段式：流A=UD+add 逐行写中间表；流B=中间表 insert 触发 → direct_form+subSourceId 更新目标子表（触发字段全为中间表主表字段，绕开全部限制）。实测 LPROC-NAD66NC1 + LPROC-QMF66WA1 链路 32/32 断言 PASS（双订单匹配/行状态/累加/填零完结）。
   - **测试脚本经验**：searchFormDatas 的 pageSize 上限 100，传 200 返回 0 条（静默），验证脚本用 ≤100。

20.**【强制·v2.0.30 实测定稿】「子表→子表」更新前必须先过判据：定位目标父记录的业务键在哪一层 — 键只在触发子表行里时，直接更新方案无论怎么拼节点都是死路，必须中间表两段式。**
   - **判据（创建前先回答一个问题）**："用什么字段定位目标表单的父记录（更新节点的主条件 a 侧）？"
     - 该业务键在**触发表单主表**上有对应字段 → direct_form `UD+--update-sub-*` 可行（入库明细→采购订单.采购明细 已验证案例）
     - 该业务键**只在触发子表行里**（典型：对账单主表的"选择销售订单"是多选关联无法作精确匹配键，销售订单编号只存在于对账明细子表行）→ ❌ 直接方案撞双重引擎限制：**主条件被迫引用触发子表字段（限制②禁止）+ 级联 GetSingle 解析不到触发子表字段静默空转（限制③）** → ✅ **必须中间表两段式**（完整 CLI 模板见 cli-examples.md"中间表两段式"）
   - **两段式架构（每一段都走引擎已验证的畅通方向）**：
     - 流A = 触发表单审批通过 → `UD+--update-none-operation add` 逐行迭代把触发子表行 upsert 进**中间普通表**（"子表→主表"畅通方向，规则 5.1/19）；主条件 = 中间表业务键组合（单号+订单编号+产品+规格）匹配触发子表字段
     - 流B = 中间表 `--events insert` 触发 → `UD+--update-sub-source-id` 更新目标子表（"主表→子表"畅通方向）；触发字段全为中间表**主表**字段，绕开全部 6 道限制；多订单支持靠子表行自带订单编号，无需循环容器
     - 中间表字段 = 触发子表行字段全集 + 定位键（单号/订单编号/产品/规格），建普通表单（add_form_to_app）
   - **流B `--update-none-operation` 用 `ignored`**：主记录必已存在（订单编号来自真实订单），`add` 会在匹配不到时插无流程实例的脏数据（规则 13.1 分层表）。
   - **试错成本记录（勿重蹈）**：v2.0.33 对账场景经历 5 轮试错（级联5节点→循环容器→业务规则→AD batch→中间表成功），消耗用户 100+ 积分。**下次遇到"多条数据×子表行×更新目标子表"直接上两段式，禁止从直接方案开始试。**
   - **测试数据经验（data-tester 创建流程表单测试数据）**：① `submitOne` 走 process 分支**不自动加载 Cookie**，必须显式传 `{csrfToken, cookies, hostname}`（postRequest 里 `cookies.map` 空指针）；② `deleteInstance` 第 3 参传**完整 cookieData** 非 cookies 数组；③ `loadCookies()` 返回 `userId`（非 `login_user.userId`）；④ 提交后等 6 秒再查待办审批（太快 optim lock fail / 待办未找到）；⑤ 测试脚本的 schema 字段映射**直接用组件ID清单.md 硬编码**，禁止动态解析 form_creator JSON（label 属性结构与假设不符会静默提取为空，产出空壳数据）；⑥ 测试数据删除（即使是 AI 自己刚建的坏数据）也必须先征得用户同意。
   - **设计器显示坑（勿误判）**：赋值源为**流水号字段（SerialNumberField）**时，设计器设置面板显示"请配置字段/变量"空白（字段选择树类型过滤不含流水号），属**显示层问题**——回读 value 为真实字段ID、运行时正常（实测写入成功）。先 `integration-get.js --raw` 验证存储值再决定是否修复，**禁止看到空白就重建**；也禁止在此类面板上点"保存"（可能把好配置回写成空）。
   - 实测验证链：LPROC-NAD66NC1（流A）+ LPROC-QMF66WA1（流B）32/32 断言 PASS（双订单匹配/行状态/累加/填零完结）；完整复盘见 `docs/销售对账同步订单-中间表架构复盘.md`。

21.**【强制·2026-10-11 实证】向已有表单的子表新增字段后，引擎 UPDATE 引用该列时只能命中「新增之后创建的行」——存量行的行数据里没有新列，直接报「公式:UPDATE 计算错误」（更新数据节点整体失败）。**
   - **场景**：子表→子表两段式（规则 20）的流B 更新目标子表时，目标字段是刚加到目标表单子表的新列。
   - **根因**：引擎 UPDATE 子表行时，SET 的列必须存在于该行的存储数据中。存量实例的行创建于加字段之前，行数据不含新列 → 对不存在的列做 SET 计算报错。与字段创建方式无关（saveFormSchema API 加的字段、设计器拖拽重建的字段都一样）；与字段类型无关（同表单同子表的老文本列可写、新下拉/新文本都需行数据含列）。
   - **判别方法**：listTableDataByFormInstIdAndTableId 返回的行原始键里查目标 fieldId——键不存在 = 存量行未含列。
   - **修复**：存量单据在页面编辑保存一次（UI 序列化会把新列写入行数据）；updateFormData API 补列无效（数据层丢弃行记录中不存在的键，实测）。新建实例的行天然包含新列，无需处理。
   - **公式形态注意（同一案例实测）**：子表行 UPDATE 的赋值公式引用「目标表单字段」需带表单前缀 （无前缀报「公式包含不存在的组件」）；仅引用触发表单字段可用无前缀 。金标准 LPROC-QMF66WA1 公式中无前缀的引用实为触发表单（对账记录表）字段。
   - **【2026-10-15 流A/流H 对照实测】无前缀不一定报错，更危险的是「静默失效」**：同构两条流（流A 目标=采购订单子表 LPROC-VN866Z91、流H 目标=对账单子表 LPROC-6G666TB1），流A 赋值旧值引用无前缀 `ADD(#{numberField_mv8w1ar6},#{numberField_0f36jq6h})` → 保存/发布/运行全程零报错，但**子表行赋值全部被静默丢弃**（行已付款金额/行状态纹丝不动）；同一节点里的主表字段赋值 `ADD(#{numberField_mkv8f07t},…)` 却"成功"——实为无前缀解析为空后 ADD(空,付款额)=付款额，首笔碰巧正确、同订单第二笔必丢累加（判别实验：XP20261015050 mkv8f07t=123.31=中间表单笔付款额实锤）。流H 全部带 FORM- 前缀 → 行赋值正常。**铁律：公式赋值中引用目标表单旧值一律带 `#{FORM-xxx/fieldId}` 前缀，保存后必须回读核对 value 字段前缀 + 用真实数据行验证行字段真的变了（不能只看运行日志无异常）**。
   - **实测链**：采购付款核销链路 LPROC-D66667A1（流A）+ 流B（目标=对账单子表）+ 流C（目标=采购订单子表下拉，原生列 ✅）。流B 在存量行上 5 种赋值形态（字面量/公式无前缀/公式带前缀/processVar×2）全部失败，换新建对账单后**同一条流不改任何配置直接成功**（XX-DZ-202610110030 实测「已付款」写入）——行数据是唯一被对照实验锁定的变量。
   - **⚠️ 排查期间的两个错误判断（勿重蹈）**：①曾误判「下拉字段引擎不可写、需改单行文本」——被推翻，终版流B 以公式成功写入下拉字段（新建行），文本列能写只是因为它行数据里有列；②曾误判「API 加的字段引擎不认、设计器重建才行」——被推翻，设计器重建的下拉在存量行上同样失败。两者都是把「行数据缺列」这个真因错归因到了字段类型/创建方式上。
   - **排查方法论（固定顺序，避免再耗一下午）**：① listTableData 查目标行原始键，确认行数据里有没有目标列（第一步就做，不要反复换赋值写法）；② 用「新建一条含新列的实例」做对照实验，锁定行数据变量；③ 确认后再决定存量数据策略（页面编辑保存补列 / 只对新数据生效并明示用户）。

22.**【强制·2026-10-15 实测】逻辑流写入（UpdateDataNode）产生的子表行 `update` 事件不向其他逻辑流传播（`--trigger-recursively` 也无效），`insert` 事件正常传播 — 依赖"中间表被更新"触发下游流的方案天然是死路，必须让中间表逐笔 INSERT。**
   - **实测链（采购付款→对账单行级累加）**：核销写入流（UD+add UPSERT）每笔付款更新同一行（gmtModified 变化确认写入成功），下游流D 同时监听 insert+update 且开启 trigger-recursively，totalCount 恒为 0；同表 UN86（只监听 insert）在首笔付款时正常触发 → insert 传播、update 不传播是引擎防递归铁律，与自动触发开关无关。
   - **正确解法（金标准复刻，实测 0→400→800 逐笔累加 PASS）**：给中间表 UPSERT 键加入**单据编号**（付款单编号），每笔付款键必不同 → UD+add 必然走 INSERT 分支 → insert 事件逐笔传播 → 下游流做行级累加。中间表语义从"状态表"变为"流水表"，与对账明细中间表（规则 20 金标准）完全一致。

23.**【强制·2026-10-15 实测】`integration-api.js` 的 `saveProcess` 不校验响应 success，失败静默返回 — 修改既有逻辑流必须用 `integration-create.js --process-code <code>`（先存草稿后发布两步），并回读 listLogicflows 核对 `lastAction === "更新已发布"`。**
   - 事故：patch 脚本直接调 saveProcess(isOnline:true) 后 HTTP 无报错，但 listLogicflows 显示 lastAction="更新未发布"，线上仍是旧定义，触发测试全部打在旧逻辑上（浪费多轮排查）。
   - 另：API 保存过的逻辑流 getProcess 回读 content 恒为 "{}"/null，修改只能整体重建（--process-code 模式），不能读改。

24.**【强制·2026-10-15 实测】UpdateDataNode 更新目标子表行时，`subSourceId` 有值但 `subCondition` 为空 → 引擎按主表模式执行，运行时报「操作的是主表，目标列只能来自主表」（保存前体检不拦截）。** 子表行更新的赋值列/公式必须配合非空 subCondition；而 subCondition 的源字段若也来自触发子表，会撞「主条件和子条件不能同时包含明细」保存校验（见规则 20 两段式判据）——两道墙夹击下，"业务键只在触发子表行里"的场景只有中间表两段式一条活路。

25.**【强制·2026-10-15 实测】新版 superform 表单（schemaType=superform）的 `READONLY` 行为字段，startInstance/updateInstance API 写入被静默丢弃（响应成功但值不入库）。** 需要向此类字段写值时只能走逻辑流 UpdateDataNode（流引擎可写），或把字段改为可编辑。排查手段：API 写入后立即回读 getInstanceById，值缺失即中招。

26.**【强制·2026-10-15 实测】更新数据节点的状态判断公式，禁止引用触发表单中由「前端 JS 联动计算」的列（如 剩余待付金额/累计金额 等仅浏览器 onChange 回写的列）。** API、逻辑流或导入提交的数据这些列为空，`GT(空,0)=false` 会走 else 分支造成状态误判（实例：流B `IF(GT(#{付款子表.剩余待付金额},0),"部分付款","已付款")` 把未付清的对账单误写成"已付款"，导致前端选单被"已付款跳过"拦截）。状态判断必须基于**目标表自身持久化的数据**（如目标子表行级累计字段），且判空场景要走安全分支。配套教训：某字段从主表挪到子表（或反之）后，必须全局检索所有读取方（JS/公式/逻辑流）同步修正引用位置，否则读取恒为空。

27.**【强制·2026-10-15 实测】排查"谁在写这张表" / 新建流前查重，必须用 formLogicflowBinding 全量清单（`integration-list.js list` 默认即此源），禁止只看 appLogicflowBinding。**
   - **双清单陷阱**：两个清单接口返回的流集合不同——`appLogicflowBinding/listflow`（Connector.getListflow，**分组结构** `{formUuid, flowList:[...]}`）实测仅 26 条；`formLogicflowBinding/listflow`（Connector.getTriggerList，**平铺结构**，每个元素直接是 flow）实测 43 条。**原生设计器创建/编辑的流只出现在后者**（实锤案例：LPROC-6Y866V81「采购付款后更新采购订单主表付款状态」不在 app 清单中）。`integration-list.js` 已兼容两种返回结构，`--source app` 仅作对照。
   - **事故（新鑫系统，2026-10-15）**：采购订单主表已付款金额 mkv8f07t 被双写。自建流A（VN866Z91）与原生流 6Y866V81（同触发表+同目标字段 `mkv8f07t=ADD(旧值,本次付款)` 累加赋值）功能重复；因 6Y866V81 不在 app 清单中，排查 38 流+表单JS+公式字段+审批流定义全部落空。最终靠「停用嫌疑流+发验证付款测增量」实验 + 全量清单对比才锁定（停用流A后付款 5228 主表仍 +30/+15 → 第二写入者坐实 → 全量清单秒中）。
   - **判别实验模板（锁定未知写入者的最快路径，先于一切猜测）**：停用嫌疑流 → 发一笔小额验证单据 → 回读目标字段增量。增量=预期值 → 写入者另有其人，去全量清单找；增量=0 → 该流就是唯一写入者。配合 `simpleProcess/getProcess.json?processCode=<code>&isLogic=true` 回读嫌疑流配置核实（`getFlow.json` 对流配置返回空，用此接口；审批流 TPROC 定义用 getProcessDesign.json 也读不到，属死路）。
   - **API 参数铁律**：listflow pageSize 上限 50（传 100 报"参数校验失败：pageSize invalid"）；listLog 仅 `status=2`（失败日志）可查且必须带 processCode（后端忽略其值返回应用级混总），成功执行不暴露。
   - **铁律：重建/新建集成流前，必须先用全量清单按「触发表单+目标表单」双维度查重，防止与既有流功能重复导致双写/三写。**

<!-- END yida-integration-hard-rules -->



<!-- BEGIN local-cache-sync-hard-rules (2026-09-30 用户定稿) -->

# 本地缓存与实时同步硬规则【对所有 AI 强制生效】

21. **【强制】本地字段清单/Schema 是「派生缓存」，写操作前禁止信旧缓存**——真相源永远在宜搭云端，本地文件（组件ID清单.md / 表单Schema.json / 系统配置清单.md）是策展后的可靠投影，定位是"机器自动刷新的缓存"，不是需要人工维护的真相。
   - **【强制·写操作前选择性刷新】** 任何写操作（创建/修改逻辑流、推送动作代码、业务规则写入、面向表单结构的造数）之前，必须先用 get-schema 的 `sync-schema.js` **只同步本次任务涉及的那几张表单**（选择性同步，严禁全量刷新整个应用），核对关键字段映射后再动手。用户在云端加字段/改结构后**无需通知 AI、无需手动点同步**，由 AI 在写操作前自动刷新发现变化。
   - **【强制·每任务一次】** 同一任务内对同一表单只刷新一次，后续步骤复用本地缓存，**禁止每走一步都重新查云端**——宜搭/钉钉接口有调用配额，反复查询不划算；本地数据对 AI 更快更省。
   - **【读操作可直接用缓存】** 查询/诊断类读操作可直接用本地缓存；若发现与云端实际行为矛盾，先怀疑缓存过期，刷新后再判断。
   - **【已知读不到的配置】** 表单的数据源配置（页面级存储）不在 getFormSchema 载荷内，此类信息以设计器实况为准，AI 不得声称"Schema 里没有就是不存在"。
   - **背景**：2026-09-30 用户确认降级方案——本地清单的价值在"策展后的可靠投影"（设计器 JSON 解析有陷阱：label i18n、TableField 包装、props 嵌套，data-tester 规则13⑤ 因此禁止动态解析）+ 接口配额经济性，而非"人工维护的真相"；同步动作由 AI 自动触发，用户零维护。

<!-- END local-cache-sync-hard-rules -->

<!-- BEGIN git-branch-workflow-rules (2026-10-11 用户定稿) -->

# Git 分支协作规范【对所有 AI 强制生效】

22. **【强制】分支命名 = `project-<企业名拼音缩写小写>`**（喜优高 → `project-xyg`）。AI 为新项目取名时，必须向用户复述"项目名 → 拼音缩写 → 完整分支名"并确认后再创建；易混缩写（如 xlg/xyg）逐一拼写核对。历史事故（2026-10-11）：AI 取名 project-xlg，实为 xyg，用户事后发现才改名。
23. **【强制】main = 主干，只收「完整、测试绿」的公共底座改动；项目进行中的半成品一律在项目分支上 commit + push（推 GitHub 作异地备份）**。节奏：每次收尾 push 分支；批次完成（测试绿）→ merge 回 main → push → 删分支；开工/换电脑前 `git fetch && git merge origin/main` 下行拉公共更新。项目业务数据不进 git（真相源在宜搭云端），git 只管公共底座（skills/lib/页面/文档）。
24. **【强制】勤合勤下行，禁止长期攒分支**：多个项目分支并行时，哪个分支的公共改动完整（测试绿）就先合哪个，其余分支随即 merge origin/main 下行，把冲突化整为零；`版本历史.md` / `SKILL.md` / `skill-config.json` 等高频文件一律追加式编辑（文件末尾或自己的小节内），降低同一行被两条分支同时改写的冲突面。合并回 main 的操作由 AI 在命令行完成（用户说"合回 main"即可），无需用户去 GitHub 网页操作。

<!-- END git-branch-workflow-rules -->


