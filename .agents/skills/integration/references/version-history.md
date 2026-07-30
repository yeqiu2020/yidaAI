# integration 版本历史

> 本文件从 SKILL.md 拆分而来（渐进式披露）。按需加载：需要了解某个能力何时引入/修复了什么问题时查阅。

## v2.5.0 (2026-07-29)
- **【从根源杜绝废流：保存前体检门禁 + 已有流审计 + 跨 AI 硬规则】** 新增 `integration-validate.js`：13 类检查（空壳获取节点/占位符字面量如 `processVar`/空公式/数据流断链/编造字段等）
- `integration-create.js` 保存前自动体检（含 Schema 字段存在性校验），有 [ERROR] 拒绝保存（`--force-save` 逃生口仅限用户批准）；审计 CLI 可回读体检任意已有逻辑流（含其他 AI/设计器创建的）
- 跨 AI 可移植硬规则：权威源 `references/集成自动化硬规则.md` + `scripts/sync-hard-rules.js` 一键分发 Trae/Cursor/AGENTS.md/CLAUDE.md；离线断言扩充至 28 用例全绿（含截图 4 硬伤反例）

## v2.4.0 (2026-07-29)
- **【体检问题全修复 + 离线断言全绿】** 一次性修复评估中识别的 P0/P1/P2/P3 级问题，`integration-builder.test.js` 16 用例全通过，6 个脚本 `node --check` 语法全通过
- 🔴 P0.1 修复 `integration-check.js` 的 `--output` Excel 导出未实现：新增 `exportToExcel`，生成「异常汇总」+「异常日志」两工作表；`require.main === module` 守卫使其可离线测试
- 🔴 P0.2 修复条件分支实际不分支：processJson 默认分支 `nextId` 改为直达结束节点、命中分支指向尾节点，形成真分流（原两分支均指向同一 conditionNextId，条件形同虚设）
- P1 补充 Groovy 脚本节点（`--script-lang groovy` → viewJson `GroovyNode`/props.groovy，processJson `CodeExecutor`/scriptType=Groovy，镜像已验证的 JavaScript 兄弟节点结构）
- P2.8 新增 `integration-get.js` + `integration-api.js` 的 `getProcess`（GET，isLogic=true）回读逻辑流节点结构，供修改前查看/排查
- P2.11 将触发/条件的 AND/OR 逻辑暴露到 CLI：新增 `--trigger-logic` / `--branch-logic`，支持重复 `--branch-condition` 组合多条件
- P3.12 统一两个 builder 的 `userFields` 默认值为 `form_inst_creator`（原 process/view 不一致）

## v2.3.0 (2026-07-28)
- **【剩余 3 类节点全回归】脚本/条件分支/循环容器 API 直建打通**：3 条真实回归流保存成功 + 设计器画布/面板回读验证通过（回归E 脚本代码与输出变量回显、回归F 面板回显「姓名 等于 张三」、回归G 面板回显数据源+continue 阻断模式）
- 🔴 核心修复：旧 builder 三类节点实现完全错误 — 脚本节点错用 `ScriptNode`+`scriptRules`（正确：`JavaScriptNode` + props.JavaScript 包装，processJson type=`CodeExecutor` Gb 形状）；条件分支平铺非容器（正确：`route` 容器 + condition 子节点，子节点才有 prevId）；循环容器完全缺失（正确：`foreach` + 循环体末节点回指容器 + jumpId）
- bundle 权威序列化规则（Jct 类型映射 / Gb / jb / Ub / ny / Yct / Fb）固化到 `references/canonical-node-shapes.md`
- 新增 CLI 参数：`--script-output var:type[:desc]`（可多次）/`--cycle`；`--script-code`/`--branch-*` 去除「后端暂不支持」标注
- 关键一致性约束：分支/循环节点 ID 由 create.js 统一生成后传入两个 builder；带 --cycle 时消息节点嵌入循环体（离线断言 51 项全通）

## v2.2.0 (2026-07-28)
- **【四大类场景全回归】数据节点 API 直建全面打通**：主表/子表 × insert/update/delete/upsert 共 7 条真实逻辑流保存成功 + 设计器回读验证通过
- 🔴 核心修复：processJson 的 `dataUpdate` 节点 props 改为【扁平】展开的 updateDataRules（bundle 转换器 `Jb` 权威形状），根治「转换xml失败」；viewJson 同步增加 subCondition/rulesFilter/tableRulesFilter
- 🔴 核心修复：多条获取的 viewJson 组件名 `GetMultipleDataNode`→`GetBatchDataNode`（错名保存不报错但画布静默不渲染），节点级/getData 的 type 改为 batch/single 随查询类型
- 新增 CLI 参数：`--update-type`/`--update-sub-source-id`/`--update-sub-condition`/`--update-none-operation`(upsert)/`--delete-data`/`--delete-sub-source-id`/`--add-data-insert-type`/`--add-data-sub-form-uuid`/`--add-data-type`/`--add-data-source-id`
- 删除节点（bundle `Xb`）/新增节点（bundle `Zb`）processJson 权威形状固化到避坑清单 10–12 条

## v2.1.0 (2026-07-19)
- **【真金白银经验固化】新增「节点权威对照表 + 一步到位配置手册」**：所有节点 componentName / props 顶层键从真实设计器引擎抓取核实，杜绝再凭空猜测
- 决定性避坑清单：脚本节点=`JavaScriptNode`(非ScriptNode)、`UpdateDataNode` 扁平 props(name/nodeName/description/updateDataRules，缺则白屏崩溃)、`AddDataNode` 同构、`JavaScriptNode` 的 props.JavaScript.action.code、读回用 `props.items[].getValue()`、`CycleContainer` 只遍历 GetBatch 不能遍历触发子表
- 黄金配方：direct_form 子表"逐行匹配更新"累加完整 `updateDataRules` 形状 + 公式编码规则（跨表 `#{formUuid/fieldId}`、触发 `#{fieldId}`）+ 设计器四步 + Playwright 兜底路径（引擎入口/稳定 createNode/读回/发布/启停确认）
- 已在进销存3「采购入库 → 采购订单.采购明细.已入库数量」子表累加流上线验证并启用（status=y）

## v2.0.0 (2026-07-14)
- 新增 `--get-self` / `--get-self-field` / `--get-self-query-field` 参数，支持自动插入获取自身节点
- 新增 `--initiate-approval-form-uuid` / `--initiate-approval-initiator-user` / `--initiate-approval-assignment` 参数，支持发起审批节点
- 新增 `--connector-mode` / `--connection-id` / `--connector-display-name` 参数，支持 HTTP 连接器模式自动推断
- 修复节点执行顺序：获取数据节点现在在新增数据节点之前执行（trigger -> dataRetrieve -> addData -> initiateApproval -> ...）
- 修复 `buildDataRetrieveCondition` 支持 opCode 和 valueType 参数
- 新增 `resolveConnectorMode` 函数，connectorId 以 Http_ 开头时自动按 mode=5 处理
- 新增 `buildInitiateApprovalAssignments` / `mapDataRetrieveOperator` 函数
- 连接器节点支持 `connectorMode` 和 `connectionId` 字段
- view-builder 新增 `InitiateApprovalNode` 组件支持

## v1.0.2 (2026-05-24)
- 新增 `--data-query-type multiple` 支持「获取多条数据」节点（通过 quantity 控制条数）
- 扩展 process-builder / view-builder 增加 `GetMultipleDataNode` 组件（⚠️ v2.2.0 已纠正为 `GetBatchDataNode`）
- 新增 `--update-form-uuid`/`--update-assignment`/`--script-code`/`--branch-field` 参数（预留，后端当时暂不支持）
- 全功能实测确认：新增数据/获取单条数据/获取多条数据/消息通知/连接器节点均通过

## v1.0.1 (2026-05-24)
- 修复 `integration-api.js` POST 请求双重 `querystring.stringify` bug（导致 POST body 为空）
- 为所有 POST 请求添加正确的 `Referer` 头（解决 CSRF 校验失败问题）
- 全功能测试通过：创建/修改/查询/启停/日志检查

## v1.0.0 (2026-05-24)
- 从宜搭AI编程工具集成自动化模块提炼
- 支持创建/修改集成自动化（草稿保存 + 发布）
- 支持查询逻辑流列表（关键字/表单/状态筛选）、启用/停用、运行日志检查（异常排查 + Excel导出）
- 支持6种节点类型：触发器、新增数据、获取单条数据、连接器调用、消息通知、结束
- 内置钉钉待办2.0连接器预设；依赖 api-client skill 提供登录态管理
