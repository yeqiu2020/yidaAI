# server-manager 版本历史（自 SKILL.md 外移 2026-10-30）

## 七、版本更新记录

### v3.7.0 (2026-10-16)
- **重构（宿主无关统一方案）**：把「地址生成」和「打开方式」从 AI 判断收敛进 `server_manager.js`——
  - 新增 `getAccessUrls()`（唯一地址来源，禁止任何地方再手拼 URL）+ `printAccessReport()`（统一报告）；
  - `start` / `status` 均打印**权威地址 + 可粘贴 Markdown + `YIDA_READY` 机器可读行**；
  - 新增 `url` 命令：仅输出权威地址、不启停服务；
  - 启动失败也输出 `YIDA_READY {ok:false,...}`，AI 无需解析中文装饰文本。
- **第2步**：删除「Trae 走前台 8080 + start-sync 两段式」的宿主分叉，改为**所有宿主同一条 `start` 命令**。
- **第4步**：由「按宿主选择打开方式」改为「**把脚本输出的 markdown 原样转达**」；`open_preview` 降级为可选增强，
  没有它的宿主（DSH）跳过不影响结果——链接始终是主通道。
- **顺带修复**：`updateInitDoc()` 引用未定义的 `projectName`（命中占位符替换时抛 ReferenceError 被 catch 吞掉，
  成功提示反而显示"更新失败"），改为 `path.basename(CONFIG.projectRoot)`。
- **事故来源**：2026-10-16 AI 在 DSH 下误判"没有内置浏览器通道"，用 `Start-Process` 开外部浏览器；
  根因是旧文档把地址拼接与打开方式留给 AI 自行判断，导致同一件事在不同工具下结果不同。

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

