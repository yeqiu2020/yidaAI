# form_creator 版本更新历史

> 本文件从 SKILL.md 拆分而来（Phase 6 任务 6-6），记录各版本的更新内容。

---



---

## 版本更新说明

**当前版本：v6.71.0** (2026-08-22)

### 更新内容
- 🛡️ **【项目根污染自锁闭环根治】应用分组目录平铺到项目根（08-21/08-22 两次事故，详见 faq.md 问题17）**：
  - **事故**：项目根长出「课程录制」应用的 11 个分组目录 + 残留系统配置清单.md，用户未点任何同步按钮，08-22 07:42 自发复发。根因三层叠加：①08-21 首次污染清理不彻底，根目录残留清单使项目根"伪装"成应用目录；②CLI 入口 `sync_all_configs.js` 对 args[0] 零校验，且单参数时 `parseAppIdFromConfig` 静默从残留清单读出错误 appId（HTTP 端点早有 v3.0.4 防线，CLI 无）；③识别层 `hasSystemConfig` 无法区分项目根与应用目录。
  - **修复1（config-sync/sync_all_configs.js v2.11.0）**：目标目录含 `组织及应用信息.md`（项目根独有标志）即拒绝执行并打印正确用法；`--allow-root` 显式豁免兼容旧版单应用布局。实测复现事故命令被拦截（退出码 1）。
  - **修复2（lib/sync-server/dir-ops.js）**：新增 `isProjectRootDir()`；`findDirByFileUrl` file:///http 两分支项目根候选降级为兜底；`resolveProjectDir` 候选稳定排序项目根沉底。实测：应用 URL 返回 `进销存2`（不再被根残留清单劫持），纯根 URL 保留兜底（旧布局兼容），file:// 应用路径返回 `进销存2`。SERVER_VERSION 3.0.7 → 3.0.8。
  - **修复3（二次审计补漏，同日）**：用户追问"是否彻底修复"触发全量入口审计，发现 3 个同模式未设防 CLI 入口（`sync_form_schemas.js` / `sync_config.js --output` / `project-sync/sync_project.js --output`）。新建共享防线模块 `lib/sync-server/guard-root.js`（单一来源），4 脚本统一接入（config-sync v3.21.0 / project-sync v1.1.0）；`sync_all_configs.js` 内联实现替换为共享调用。4 入口以项目根为目标实测全部拦截，temp-file 放行无误伤。
  - **数据清理已完成**：根目录残留清单 + 11 个杂散分组目录已删除并验证干净；服务经计划任务重启，`/health` 确认 v3.0.8 已加载。

**历史版本：v6.70.0** (2026-08-22)

### 更新内容
- 🛡️ **【08-18大版本变更衍生问题全盘排查·健壮性加固】**（问题15根因修复后，用户要求全盘扫描+健壮性评估，三路审计：服务端路径解析/前端路径处理/跨脚本子进程隔离，共15项发现，5项代码修复，详见 faq.md 问题16）：
  - **修复1（lib/sync-server/sync-ops.js）**：`regenerateFormConfigJs`/`generatePrototypePages` 两处 spawn 未注入 `YIDA_PROJECT_ROOT`+`cwd`，跨项目时生成器内 Cookie 定位回溯宿主项目。补注入（与 executeSync v3.0.3 同款 `findProjectRootFromAppDir`）。
  - **修复2（prototype_generator.js v2.39.0→v2.40.0）**：原型页面「组织主页」按钮硬编码 `href="/本地操作页面/index.html"`，静态根是项目根父目录，链接 404。app.js 模板新增 `buildPortalUrl()` 运行时按 URL 项目段重写；登录失效提示的门户地址同改（旧 `getProjectDirName()` 在 list/form 页 undefined）。进销存1/2 已用 v2.40.0 重建。
  - **修复3（config-sync/sync_all_configs.js）**：`loadCookieData()` 不传项目根 + 两处 execSync 未注入 env。新增 `cookieProjectRoot` 向上定位后显式传参并注入 cwd/env。
  - **修复4（form_creator/add_form_to_app.js）**：`ensureLogin()` 在定位目标项目根之前执行，login_manager 读写宿主 Cookie。main() 调序 + 模块级 `TARGET_PROJECT_ROOT` 统一注入 execCommand/syncFormSchema。
  - **修复5（prototype_generator.js）**：`updateOrgInfoPrototypeUrl` 写入「组织及应用信息.md」的地址缺项目段（控制台输出的却是对的）。拼接补 `encodeURIComponent(path.basename(rootDir))`，重跑后两个应用地址已正确。
  - **同族加固**：form-settings.js（1处）/flow-settings.js（3处）`loadCookieData()` 补传 `PROJECT_ROOT`。审计通过项：data-backup/data-clean/sync_single_form/manifest.html/create_from_markdown 无需修改。
  - SERVER_VERSION 3.0.6 → 3.0.7。回归实测全通过：页面 200 / app-info 返回进销存2 / sync-form 同步仓库信息 9 字段 / 浏览器实测组织主页链接运行时重写且目标页 200。

**历史版本：v6.69.0** (2026-08-22)

### 更新内容
- 🐛 **【三层根因修复】原型页面"同步表单字段"报路径重复「系统配置清单不存在」+ 静默匹配错误应用**（用户外部浏览器实测事故，详见 faq.md 问题15）：
  - **事故现象**：`同步失败：系统配置清单不存在: D:\宜搭AI助手直播\宜搭AI助手V2.0.30\宜搭AI助手V2.0.30\系统配置清单.md`，项目目录名重复拼接。
  - **根因1（前端 app.js）**：多项目布局下 pathname 段未 `decodePart` 就与 `'01需求梳理'` 比较，永远失败 → 把 URL 首段（项目根目录名）当 projectDir 发送。修复：先解码再比较（进销存1/进销存2 产物 + `prototype_generator.js` 模板三处）。
  - **根因2（dir-ops.js）**：`findProjectDir` 返回相对路径，子进程再 resolve 产生重复段；`findDirByFileUrl` 逐级累积时 i=1 命中项目根即返回（取首个而非最深）→ /app-info 返回错误应用名（"课程录制"）。修复（v3.0.5）：一律返回绝对路径；逐级累积取最深匹配目录。
  - **根因3（dir-ops.js，v3.0.6）**：projectDir 误传项目根目录名时静默命中"直接传项目名→项目根"兜底，读项目根残留配置清单（课程录制），**不报错但同步到错误应用**。修复：projectDir 命中后若 pageUrl 解析出 resolved 之下更深的应用目录（`startsWith(resolved + path.sep)`），以 pageUrl 为准并打黄色日志——浏览器缓存旧版 app.js 发错值也能正确兜底。
  - SERVER_VERSION 3.0.3 → 3.0.6。已验证：/app-info 两个场景（projectDir 正确/误传项目根名）均返回"进销存2"；Playwright 外部浏览器实测点击"同步表单字段"→ POST /sync-form 200 → success:true 拉取 12 字段（含子表明细）。

**历史版本：v6.68.0** (2026-08-18)

### 更新内容
- 🐛 **【全项目同族问题扫尾·多项目隔离】sync_server 子进程 Cookie 串宿主项目 + 前端取段残留**（用户要求系统性排查 v3.0.0 多项目布局所有未落实点，而非逐个救火）：
  - **高危修复1（lib/sync-server/sync-ops.js）**：`executeSync`（/sync-form）与 `executeFormListSync`（/sync-app 第一步）两个 spawn 点**未注入 cwd/env**，子进程内 `findProjectRoot()` 回溯 `__dirname` 指向宿主项目 → 跨项目调用时读到宿主项目的 `.cookies.json`（多组织并存下会串组织/无权限）。修复：新增 `findProjectRootFromAppDir()`（从应用目录向上最多 4 级找含 `.cookies.json` 或 `组织及应用信息.md` 的目录），spawn 时注入 `YIDA_PROJECT_ROOT` + cwd。
  - **高危修复2（config-sync/scripts/sync_config.js）**：Playwright 兜底路径的 cookie 用 `__dirname` 硬回溯（不读 env），即使 spawn 注入了环境变量也不生效。修复：改为 `YIDA_PROJECT_ROOT` 优先。
  - **同族修复3（form-to-prototype 模板 + 课程录制产物）**：guide.html 的 `getAppNameFromPath()` 取 `pathParts[0]`，多项目布局下取到项目名，Excel 路径与提示词指引全错。修复：双布局识别取应用名（已实测 guide 页显示"课程录制"）。
  - **同族修复4（form-to-prototype 模板 + 课程录制产物）**：app.js 的 `/app-info`、`/sync-app` 传 `getProjectDirName()`（项目名，且该函数仅在 manifest.html 内联定义，list.html/form.html 页面上是 undefined → 传空串），与 `findProjectDir` 期望的应用目录名不符，此前完全依赖 pageUrl 兜底。修复：新增 `getAppDirFromUrl()` 双布局计算，语义正确（已实测 logo/title 正确显示"课程录制"）。
  - **排查结论**：`/local-files`（manifest.html 保存）、门户页面全部请求（PROJECT_NAME → resolveProjectDir）语义正确无需修改；751/874/1031/511/1770 spawn 点与 runScript 在 v6.65.0 已注入 env，本轮复核确认到位。
  - SERVER_VERSION 3.0.1 → 3.0.3。**注意**：guide.html 指引文案中的 Excel 路径前缀仍硬编码旧项目根 `d:/宜搭AI编程/宜搭AI助手V1.7.3/`（V1.x 时代遗留），非串目录 bug，属过时文案，待用户决定改法。

**历史版本：v6.67.0** (2026-08-18)

### 更新内容
- ✨ **【交互优化】服务状态 UI 改为"仅异常时显示横幅"**（用户决策）：移除常驻状态指示器思路——服务正常运行是预期状态，不需要持续宣告；同步服务未运行才在页面顶部显示警告横幅（含操作指引），恢复后自动消失、页面自动复位。改动：1) `css/style.css` 删除废弃的 `.service-indicator` 样式（v3.0 改版后元素已不存在），新增 `.service-down-banner` 横幅样式（fixed 顶部、`--warning-bg` 配色、滑入动画、`body.has-service-banner` 整体下移 40px 避免遮挡）；2) `dashboard.js` 的 `checkService()` 检测完成后调用 `updateServiceBanner(running)`，横幅动态创建/移除，30 秒轮询自动更新。已 Playwright 实测三态：服务正常→零噪音无横幅；异常→横幅出现且文案正确（"同步服务未运行，同步/删除/备份等操作不可用—可在对话框输入「启动宜搭服务」或点击右上角「重启服务」"）；恢复→横幅自动移除。

**历史版本：v6.66.0** (2026-08-18)

### 更新内容
- 🐛 **【双根因修复】门户页面删除按钮误报"同步服务未启动" + 原型页面左上角显示错误应用名（进销存2 显示成进销存6）**：
  - **问题1（dashboard.js）**：v3.0 门户改版后页面已移除 `#service-indicator` 状态指示器元素，但 `checkService()` 开头 `if (!indicator) return;` 导致函数直接返回，`serviceRunning` 永远为 false，所有依赖它的操作（删除/同步/备份/清理数据）全部误报"同步服务未启动"，而服务实际正常运行（/health 返回 200）。修复：状态检测不再依赖指示器元素，指示器存在时才更新其 UI。
  - **问题2（lib/sync-server/dir-ops.js 的 findDirByFileUrl）**：该函数只支持单项目 URL 布局（第一路径段=应用名，如 `/进销存2/...`）。多项目布局（`/宜搭AI助手V2.0.25/进销存2/...`）下第一段是项目名，`hasSystemConfig(静态根/项目名)` 失败后返回 null，`/app-info` 回退到全盘扫描的 `uniqueCandidates[0]`（按目录排序的第一个，恰为"进销存6"），导致原型页面左上角 logo 和标题显示错误应用名。修复：HTTP URL 分支改为逐级累积路径段（第一段→前两段→前三段）尝试 `hasSystemConfig`，命中即返回，两种布局均兼容。已 Playwright 实测：原型页面标题/logo 正确显示"进销存2"，删除按钮正常弹出确认框且 `serviceRunning=true`。

**历史版本：v6.65.0** (2026-08-18)

### 更新内容
- 🐛 **【重大根因修复·多项目串目录】在一个项目创建应用，文件夹/数据跑到另一个项目**：多组织并存模式下，全局 sync_server（端口3457）由"最新启动服务的项目"接管（后启动方 restart 会杀掉旧进程），其 `SKILLS_DIR`/`__dirname` 全部指向宿主项目。导致：在 V2.0.25 门户页面创建"进销存0.75"，`/create-project` 端点调用 `createProject(projectName)` 不传目录，`create-project.js` 内部 `__dirname` 回溯解析到宿主 V2.0.26 → **项目文件夹创建到 V2.0.26**；而 `addAppToOrgConfig` 用请求参数正确写入 V2.0.25 → 记录与文件夹分裂。同类问题波及所有被 sync_server 调用且用 `__dirname` 回溯定位 `PROJECT_ROOT` 的脚本（Cookie/组织信息读写全部指向宿主项目）。**系统性修复（`YIDA_PROJECT_ROOT` 环境变量注入机制）**：1) `script-runner.js` 的 `runScript` 在传 cwd 时注入 `YIDA_PROJECT_ROOT` 环境变量；2) sync_server 所有直接 spawn 点（/refresh-login、/sync-app-to-local、/sync-app-to-local-stream、/backup-app-data、/refresh-org-apps）同样注入；3) 8 个脚本的 `PROJECT_ROOT` 定位统一改为"环境变量优先、`__dirname` 回溯兜底"（create-project、form-settings、flow-settings、clear-form-data、backup-app-data、init-org、login-manager、api_client、login_manager、sync_form_list_playwright）；4) `lib/core/utils.js` 的 `findProjectRoot()` 同样环境变量优先；5) `/create-project` 改为 `createProject(projectName, projectDirHost)` 显式传目标目录；`/form-settings`、`/flow-settings` 补传 `projectDirHost`（原调用漏传 cwd）。已实证验证：`/create-project` 带 `projectDir=V2.0.25` 时文件夹正确落在 V2.0.25，V2.0.26 下不存在。**注意：修复只对"最新启动服务的项目"生效（全局服务加载的是宿主代码），多项目并存时请用已修复的项目重启服务。**

**历史版本：v6.64.0** (2026-08-18)

### 更新内容
- 🐛 **【根因修复】启动服务后门户页面不显示「初始化组织信息」按钮**：v3.0.0 多组织并存模式下，`sync_server.js` 的 `/org-info` 端点依赖 `resolveProjectDir` 解析项目目录，而该函数要求目录下必须存在 `组织及应用信息.md`。新项目或未初始化项目缺少此文件时，`/org-info` 直接返回 400 错误"无法确定项目目录"，导致前端 `loadOrgInfo` 进入失败分支，无法渲染组织头部及初始化按钮。修复（`sync_server.js v3.0.1`）：1) `/org-info` 在 `resolveProjectDir` 失败后，若请求显式携带 `projectDir` 参数且对应目录存在，则将其作为项目目录；2) 当 `组织及应用信息.md` 不存在时，返回 `success:true` 的空组织信息（`orgInfo:{}`、`apps:[]`），让前端正常渲染并显示「初始化组织信息」按钮。

**历史版本：v6.63.0** (2026-08-17)

### 更新内容
- 🐛 **【根因修复】点击"同步表单字段"后宜搭新增字段不在原型页面显示**：`sync_server.js` 的 `/sync-form` 端点调用 `executeSync` 后直接返回，未刷新原型页面字段数据源。`sync_single_form.js` 仅更新了 `${formName}「...」.json` 和 `组件ID清单.md`，但 `updatePrototypePage()` 是为**老的 form_creator 布局**写的（去找 `01需求梳理/原型页面/forms/${formName}.html` 做正则替换），而 form-to-prototype 项目根本没有 `forms/` 子目录，字段实际数据源是 `form-config.js` 里的 `staticConfigData`，结果就是同步过程根本没碰 `form-config.js`，页面刷新后读的还是旧字段。修复（`sync_server.js v2.8.1`）：在 `executeSync` 成功后追加调用 `regenerateFormConfigJs(projectDir)`，它会调用 `prototype_generator.js --form-config-only`，从已更新的 `组件ID清单.md` 重新构建 `staticConfigData` 写入 `form-config.js`。`regenerateFormConfigJs` 内部已有「字段清单不存在则跳过」的兜底，不影响老项目。

**历史版本：v6.62.0** (2026-08-16)

### 更新内容
- 🐛 **【根因修复】同步表单字段报 "signal timed out"**：`sync_single_form.js` 的 `ensureLoginContext()` 原调用 `login_manager.js` 的 `ensureLogin()`，每次同步都启动 Playwright 浏览器验证登录态；Cookie 失效时弹浏览器等扫码（最长10分钟），导致同步服务子进程卡死、前端 `AbortSignal.timeout(60000)` 超时报 "signal timed out"（DOMException TimeoutError 的 message）。修复：改为纯 Cookie 读取（`coreUtils.loadCookieData` + `extractInfoFromCookies` 兜底提取 csrf_token），不启动 Playwright；同步耗时从 ~15秒降到 ~0.5秒。Cookie 失效时 `getFormSchema` API 返回登录页/LOGIN FAILED，抛出 `LOGIN_REQUIRED:` 前缀错误，前端 `syncForm` catch 块检测到后引导用户到「本地操作页面」点"刷新登录"按钮（`/refresh-login` SSE 端点），不再卡死。同步改动 `prototype_generator.js` v2.37.0（syncForm 错误提示）+ 移除未使用的 `LOGIN_MANAGER`/`API_CLIENT_DIR` 常量。

**历史版本：v6.61.0** (2026-07-28)

### 更新内容
- 🐛 **【根因修复】杜绝 FORM-TEMP 占位符残留导致线上"表单不存在"（进销存3事故）**：字段清单中"被填充的只读关联字段"说明列写`-`（无`关联-->`标记）→ 解析层静默丢失目标表名 → schema_builder.js 静默兜底生成 FORM-TEMP 占位符 → updateAssociationFields 按空 formTitle 匹配不到静默跳过 → 无自检带病交付，线上点"新增"必报"表单不存在"。修复（`create_from_markdown.js v2.20.0` + `schema_builder.js v1.4.0` 多层防御）：1) 新增 `validateAssociationTargets` 建表前校验+字段名推断兑底，推断失败零成本中止；2) targetMeta 匹配不到计入失败汇总；3) 新增 `scanAndFixPlaceholders` 建表后自检（步骤[5/10]），可解析的自动回填、不可解析的醒目告警+非零退出码；4) schema_builder 兜底分支显式告警。详见 faq.md 问题14。

**历史版本：v6.60.0** (2026-07-17)

### 更新内容
- 🚀 **【关键优化】脚本执行后禁止过度验证（18分钟→≤2分钟）**：用户严厉批评 form_creator 脚本执行完成后，AI做了大量不必要的后置验证（Grep/Read JSON字段细节、流水号公式、数据标题、重复查找临时文件、读取README.md、TodoWrite等），共25步操作中仅4-5步必要，耗时18分钟。新增专属硬规则第8条：后置验证上限5次工具调用，仅允许3项验证（Read系统配置清单.md、Glob JSON数量、Glob组件ID清单数量），禁止Grep/Read JSON字段细节，关联填充规则只看脚本日志不深挖JSON。

**历史版本：v6.59.0** (2026-07-17)

### 更新内容
- 🐛 **【关键修复】字段状态（只读/隐藏）未传递到宜搭表单Schema**：`convertFormToConfig` 仅保留 `status` 字段，`createFormWithMapping` 生成 `apiField` 时未传递状态字段，导致 `READONLY`/`HIDDEN` 行为丢失。修复：`create_from_markdown.js v2.19.3` 新增 `behavior` 字段并传递到 `apiField` 和子表 `colField`。

**历史版本：v6.58.0** (2026-07-16)

### 更新内容
- 🐛 **【关键修复】子表内关联字段的填充规则应使用 mainRules 而非 tableRules**：`buildDataFillingRules` 函数之前错误地将子表内关联字段的填充规则放入了 `tableRules`（子表填充规则），但实际上应该使用 `mainRules`（主表填充规则）。原因：用户场景是「关联表单的主表字段 → 填充到当前表单子表的每一行」，这应该用 mainRules（设计器完全支持）；tableRules 是用于「关联表单的子表字段 → 当前表单子表」的场景（设计器不支持）。修复后 AI 创建的子表内关联字段在设计器中可以正常显示和编辑「主表填充规则」面板。`create_from_markdown.js v2.19.3`。

**历史版本：v6.57.0** (2026-07-16)

**历史版本：v6.56.0** (2026-07-16)

### 更新内容
- 🐛 **【重要修正·二次修正】宜搭平台完全支持子表内关联字段的数据填充规则**：v6.54.0 声称"宜搭平台不支持子表内关联字段的数据填充规则"，v6.55.0 修正为"设计器UI不支持但API可写"，这两次都是**不准确的**。实际验证：用户手动创建的子表内关联字段，在宜搭设计器中**可以正常配置数据填充规则**，说明宜搭平台完全支持此功能。form_creator 的 `buildDataFillingRules` 已正确为子表内关联字段生成 `tableRules`（含 `tableFieldId`），通过 `saveFormSchema` API 写入后设计器中也能正常查看和编辑。硬规则7修正为：子表内关联字段与主表关联字段完全一致，都支持数据填充规则的设计器配置和运行时功能。

**历史版本：v6.55.0** (2026-07-16)

### 更新内容
- 🐛 **【已被v6.56.0修正】子表内关联字段数据填充规则**：声称"设计器UI不支持但API可写"，此说法不准确，实际宜搭平台完全支持。

**历史版本：v6.54.0** (2026-07-16)

### 更新内容
- ✨ **【新增】创建人/创建时间字段自动设置默认值公式**：EmployeeField 自动识别字段名"创建人/创建者/录入人"，设置 `complexValue.formula = "USER()"`；DateField 自动识别字段名"创建时间/创建日期/录入时间"，设置 `complexValue.formula = "TIMESTAMP(TODAY())"`。这样创建人字段自动填充当前登录用户，创建时间字段自动填充当前日期。

**历史版本：v6.53.0** (2026-07-15)

### 更新内容
- 🔒 **【机制·根源修复】统一填充规则分隔符常量 FILLING_PAIR_SEPARATOR**：历史教训——`ai-validator.js` 中 `collectFillTargetsInSection` 用 `/[,，、；;]/`、`checkFillRulesInSection` 用 `/[,，、；;]/`、`create_from_markdown.js` 中 `parseFillingFromAssocDesc` 用 `/[，、]/`，三处不一致导致"校验通过但运行失败"。修复：在两文件中定义统一常量 `FILLING_PAIR_SEPARATOR = /[、，,；;]/`（穷举兼容顿号、中文逗号、英文逗号、中文分号、英文分号），所有解析处引用同一常量。
- ✨ **【新增校验】check-fill-rule-syntax 命令**：校验填充规则的"="格式（缺等号、左右为空、多等号）、分隔符使用（推荐顿号，警告非推荐分隔符）。前置校验从3个增加到4个（ai-validator.js v1.6.0）。
- 🐛 **【修复·根源】parseFillingFromAssocDesc 丢弃源字段名**：解析"当前字段=源字段"时只保留当前字段名、丢弃源字段名，导致 `buildDataFillingRules` 用被填充字段名去目标表单猜源字段，当两者名称不一致（如"关联订单号=销售订单号"）时匹配失败、填充规则为空。修复：解析保留 `{currentLabel, sourceLabel}` 对象，用 sourceLabel 在目标表单精确匹配、用 currentLabel 在当前表单找被填充组件（create_from_markdown.js v2.19.1）。**原则：信任用户在字段清单中明确写的"当前字段=源字段"映射，不依赖模糊匹配。**
- 📢 **【机制·防静默】updateAssociationFields 失败汇总报告**：当填充规则解析到但配置为空时，`buildDataFillingRules` 返回 `unmatched` 数组（含每条未匹配原因），`updateAssociationFields` 收集到 `failureReport` 并在最后输出"⚠️ 关联填充规则配置失败汇总"。AI 必须检查此日志并主动告知用户（专属硬规则第6条）。

**历史版本：v6.52.0** (2026-07-15)

### 更新内容
- 🐛 **【修复】关联填充规则"当前字段≠源字段"时匹配失败**：`parseFillingFromAssocDesc` 解析"填充：当前字段=源字段"时只保留当前字段名、丢弃源字段名，导致匹配失败、填充规则为空（v6.53.0 已完整根治，见上）。

**历史版本：v6.49.0** (2026-07-07)

### 更新内容
- ✨ **【优化】分组目录加「分组」后缀，与表单目录结构对齐**：分组目录从"基础信息"改为"基础信息「分组」"，让用户更好区分分组和表单目录。修改了6个脚本（generate_from_markdown.js v6.5.0、create_from_markdown.js v2.19.0、sync_single_form.js v1.2.0、project_generator_v2.js v1.1.0、sync_config.js v3.10.0、prototype_generator.js v2.11.0）。`form.module`字段值保持不变，仅在创建/拼接分组目录路径时加「分组」后缀。prototype_generator.js支持向后兼容，优先查找带「分组」后缀的目录，找不到则查找不带后缀的旧目录。

**历史版本：v6.48.0** (2026-07-07)

### 更新内容
- 🐛 **【根因修复】两个脚本分组目录命名规则不一致导致重复目录**：`generate_from_markdown.js` 的 `getModuleNumberedName` 函数给分组目录加数字编号（如`02基础信息`），但 `create_from_markdown.js` + `sync_config.js` 使用不带编号的目录名（如`基础信息`，来自应用分组.md），两个脚本命名规则完全相反，导致 sync_config.js 找不到 generate_from_markdown.js 创建的目录后创建新目录，产生重复。v6.47.0 只修复了 `findFormDirectory` 函数，但未解决命名规则不一致的根因。v6.48.0 彻底修复：删除 `getModuleNumberedName` 函数，让 generate_from_markdown.js 也使用不带编号的分组目录名（与应用分组.md保持一致）。

**历史版本：v6.47.0** (2026-07-06)

### 更新内容
- 🐛 **【根因修复】分组目录路径不一致导致组件ID清单找不到、原型页面表单为空**：彻查三个关联问题：(1)`generate_from_markdown.js`创建带编号目录（如`02基础信息`），但`sync_config.js`的`findFormDirectory`跳过所有`/^\d{2}/`开头的目录，导致找不到表单目录后创建新的不带编号目录（如`基础信息`），产生重复目录；(2)组件ID清单只生成在其中一个目录，另一个目录缺失；(3)`prototype_generator.js`的`generateStaticConfigData`未从组件ID清单读取真实fieldId，使用占位符。修复：sync_config.js v3.8.1的`findFormDirectory`只跳过特殊目录（01需求梳理等），不跳过分组目录；prototype_generator.js v2.10.1的`generateStaticConfigData`优先从组件ID清单.md读取真实fieldId，并支持查找带编号的分组目录。
