---
name: cool-card
description: 宜搭酷卡片（发送卡片/更新卡片节点）自动化构建技能。在指定应用中创建含「发送卡片」节点的集成自动化并验证卡片送达。🟢 首选：scripts/card-flow-cli.js 全 API 路线（2026-10-05 已验证：克隆金标准流程→saveProcess→publish，一条命令建卡片流程）；浏览器自动化（弹层放置协议）作为备选与修改既有流程的手段。当用户说"做酷卡片"、"发卡片"、"卡片自动化"、"发送卡片给XX"、"卡片推送"、"订阅卡片"等时触发。🔴 结构铁律：processJson 的 sendCard 节点 props 是 cardRules 22 键直接平铺（OpenYida 的 sendCardRules 包裹形式会报流程解析异常），详见 references/sendCardRules金标准.md。
version: 2.0.0
---

# 宜搭酷卡片自动化构建（cool-card）

> 2026-10-01~05 进销存0929 全链路实战验证：交互卡片+置顶卡片从零建到群内收到卡片。
> 🔴 **执行时必须先读 [references/全链路实操手册.md](references/全链路实操手册.md)，按手册顺序操作，禁止脱离手册自由摸索。**
> 卡片节点无法经 integration CLI 创建（CLI 不支持 CardNode），两条路线：
> - 🟢 **API 路线**：scripts/card-flow-cli.js（克隆金标准→saveProcess→publish，一条命令）
> - 🔧 **浏览器路线**：弹层放置协议（修改既有流程/跨表单场景）
>
> ⚠️ 前置条件：酷应用须发布到自建酷应用中心 + 用户在钉钉群内启用。发到群=群会话内；发到人=机器人私聊。
> 结构铁律：processJson 的 sendCard 节点 props 是 cardRules 22 键直接平铺（OpenYida 包裹形式报解析异常）。

## ⛔ 硬规则（违反任意一条都会翻车）

1. **【视口】** 浏览器视口先用 **1400x900**；若卡片设计器（card.dingtalk.com/editor）整页空白（React 不挂载），**降到 818x710 重新 goto**（1600/1400 直载必空白，实测确认）。
2. **【清弹窗】** 任何画布/面板点击无效时，**第一步先检查并关闭残留 alertdialog/toast**（"保存失败…知道了"），残留弹窗会静默吞掉所有点击。
3. **【放置协议】** 「发送卡片/更新数据」节点**只能**通过画布「+」弹层放置：`selectNode(触发节点)` → fiber 调 `NodeHandler.onVisibleChange(true)` → 在 `.next-overlay-inner.editor-nodes-panel` 中 React onClick 点节点项。点左侧常驻面板（off-screen x=-985）**永远只会开配置框，节点不上画布**。
4. **【四步闭环】** 节点面板保存 ≠ 流程保存 ≠ 发布 ≠ 启用，**四步缺一不可**；漏启用（列表行第二个开关）流程永远不触发。
5. **【模板路线】** 卡片内容用**官方模板（工单待处理等4个）+ 节点侧数据映射**，不要自动化自定义卡片设计器：card.dingtalk.com 文本组件的 `$` 变量选择器经合成输入不稳定（6 试 1 中），且拖拽放置不受控。
6. **【新窗口】** 编辑器/卡片设计器经 `window.open` 打开会被内嵌浏览器拦截——必须先注入 window.open 捕获钩子拿到 URL，再在当前 tab `goto`。
7. **【流水号】** 流程表单的 SerialNumberField 不在流程变量可选列表中，卡片映射与匹配条件都引用不到；需要单据号时映射其他字段或让用户手动改匹配条件为「实例ID」。
8. **【临时脚本】** 造数/验证只用 data-tester 标准函数编排（脚本放 temp-file/），禁止手写 searchFormDatas/saveProcess。

## 📋 标准执行流程（8 阶段）

### 阶段0：前置确认
- 应用 appType / 表单 formUuid 从 `系统配置清单.md` 读取（禁止猜测）
- 确认发送范围：**发送到人**无需群内启用酷应用（推荐，直达钉钉工作通知）；**发送到群**需先在群快捷栏启用酷应用，且定时触发无群上下文
- 加载 `references/自动化片段库.md` 中的片段（全部为浏览器上下文 JS，经 browser-use 执行）

### 阶段1：创建流程
- 入口：集成&自动化 → 新建下拉「从空白新建」；若下拉不出现（登录后会话状态异常），**reload 页面再点**；再不行切到空 tab 用落地页
- 对话框：名称 + 表单事件触发 + 选表单（下拉可搜索：type "销售" 过滤）；流程表单后续在触发节点勾选具体事件
- 用片段库 §1 捕获编辑器 URL（window.open 钩子），当前 tab goto 进入设计器

### 阶段2：配触发节点
- 按片段库 §2 `selectNode` 选中触发节点 → 面板自动打开
- 勾选事件（创建/编辑成功…）用片段库 §4（`__reactEventHandlers$.onChange`）
- 点面板底部「保存」→ 画布节点显示"创建成功，编辑成功"即成

### 阶段3：放置发送卡片节点 ★核心
- 严格按片段库 §3 四步：selectNode(触发节点) → onVisibleChange(true) → 找 `.next-overlay-inner.editor-nodes-panel` → React onClick 点「发送卡片」
- 成功标志：画布出现 `发送卡片 | 请设置`（表单事件流程）或节点数 wrapper+1

### 阶段4：配卡片节点
- selectNode(卡片节点) → 面板「第1步：选择卡片」→ 官方模板 tab → hover 行内「使用」按钮（JS click）
- 第2步数据映射：按片段库 §5 的 configRow 序列（类型下拉→字段→字段选择器），叶子项用正则 `^字段名(文本|数字|时间戳|成员|数组)?$` 匹配最后一层
- 第3步发送范围：发送到人 checkbox（`__reactEventHandlers$.onChange`）→ 选择人员 → `.deep-employee-selector-list-item` React onClick 选人 → 确认
- 会话提示语：native setter + input 事件改默认值
- 卡片按钮绑定（可选）：动作配置行第二个 select → React 打开 → 点手动触发流程名
- 面板「保存」→ 画布节点显示 `发送卡片: 工单待处理`

### 阶段5：保存/发布/启用
- 顶部「保存」→ 顶部「发布」→ 回列表页把流程行**第二个开关**拨为 on（第一个是顺序执行）
- 验证：`node .agents/skills/integration/scripts/integration-list.js list <appType>` 状态=启用

### 阶段6：造数触发（data-tester）
- 普通表单：`submitAIGeneratedData`（注意批量函数的幂等检查会跳过已有数据的表单）
- 流程表单：`submitAllWithAutoAssociations` 自动走 startInstance；关联字段传标题字符串
- 成员/日期/被填充字段 API 提交不会自动填充——data-tester v3.7.x 已内置兜底

### 阶段7：验证闭环
- 执行计数（列表页 alert「本月累计执行次数」）应 +N
- 运行日志（行内按钮）：状态=执行成功 即卡片已发出；把结果与实例 ID 记入报告
- 提醒用户查看钉钉：发送到人=工作通知里的卡片

## 📚 参考文件

| 文件 | 内容 |
|------|------|
| [references/全链路实操手册.md](references/全链路实操手册.md) | 🟢 **必读**：前置条件、两种卡片对比、标准流程、API合约、翻车速查表 |
| [references/自动化片段库.md](references/自动化片段库.md) | 浏览器上下文 JS 片段（§1~§7），逐段可直接执行 |
| [references/坑位与约束.md](references/坑位与约束.md) | 视口/弹窗/协议细节、平台限制、失败模式与恢复 |
| [references/sendCardRules金标准.md](references/sendCardRules金标准.md) | cardRules 22 键真实完整结构（2026-10-05 修正版） |
| [references/OpenYida借鉴.md](references/OpenYida借鉴.md) | OpenYida 编译器调研（结构参考，包裹形式不可直接用） |

## 🔧 辅助脚本

| 脚本 | 用途 |
|------|------|
| [scripts/card-flow-cli.js](scripts/card-flow-cli.js) | 🟢 **首选**：全 API 创建卡片流程（金标准克隆路线：getProcess 拉源→改 cardRules→createLogicflow→saveProcess→publishProcessById）。2026-10-05 实测：设计器渲染/发布/触发执行全通过。v1 仅支持与源流程同表单（销售订单），跨表单克隆待 v2 |
| [scripts/verify_card_flows.js](scripts/verify_card_flows.js) | CLI 核验应用下卡片流程发布/启用状态（包装 integration-list 公开 CLI） |

## 🚫 边界（当前不做/不稳）

- 自定义卡片设计器内拖组件、文本 `$` 变量绑定——自动化不稳，需要时引导用户手绘模板、AI 配数据映射
- 更新数据节点匹配条件的字段切换（面板内部 `dynamicOperators` 崩溃）——占位匹配可保存，精准匹配引导用户手改
- 卡片上渲染报表图表（平台不支持）
- 置顶卡片/发送到群：sendToGroupRule 结构已知但无实配金标准样本，且需群内启用酷应用——首次使用需实测
- 跨表单克隆卡片流程：需重映射触发 conditions（v2 待做）
