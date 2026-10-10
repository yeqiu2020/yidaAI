---
name: custom-page
description: 宜搭自定义页面开发。使用 export function renderJsx() 模式编写完整的自定义页面代码，支持 JSX 渲染、状态管理、API 调用和复杂交互。当用户说'自定义页面'、'JSX页面'、'自定义组件'、'页面JS代码'、'自定义页面代码'、'页面交互'时触发。不适用于原生表单页面开发。
---

# 自定义页面开发

## 核心规则

### 致命规则（FATAL）

违反会导致页面崩溃或运行时报错：

1. **使用 `export function` 定义方法**：所有需要 `this` 的方法必须用 `export function` 定义，不得用箭头函数或函数表达式
2. **事件绑定箭头函数包裹**：`renderJsx` 顶部先写 `var self = this`，事件使用 `onClick={(e) => { self.handleClick(e) }}`，严禁 `onClick={this.handleClick}` 或 `.bind(this)`
3. **`.map()`/`.filter()` 回调用箭头函数**：`.map((item) => ...)`，禁止 `.map(function(item) {...})`，否则回调内 `this` 丢失
4. **输入框非受控模式**：`<input>` 用 `defaultValue` + `onChange` 写入 `_customState`，禁止 `value` 受控模式
5. **禁止 import/require**：第三方库通过 `this.utils.loadScript` 加载 CDN 脚本
6. **字段 ID 必须从系统配置清单获取**：读取项目中的 `系统配置清单.md` 和 `组件ID清单.md` 获取真实 fieldId，文件顶部定义 `FIELDS` 常量映射字段别名，禁止猜测或手写
7. **所有 API 调用必须 .catch()**：异常通过 `this.utils.toast({ title: message, type: 'error' })` 提示用户
8. **renderJsx 每个 return 分支必须渲染 timestamp**：`<div style={{ display: 'none' }}>{this.state && this.state.timestamp}</div>`
9. **禁止 ES6 计算属性名**：不要写 `{ [key]: value }`、`{ [FIELDS.xxx]: value }` 或 `setCustomState({ [key]: value })`；宜搭运行时可能静默白屏。改用 `var obj = {}; obj[key] = value;`
10. **Babel 编译必须使用 `modules: 'commonjs'`**：宜搭运行时用 `new Function()` 评估代码，`export` 语法在其中会报 `SyntaxError`，必须编译为 `exports.xxx = xxx` 格式（详见 [踩坑记录 P-01](references/pitfalls.md)）
11. **`__initMethods__` 必须包含实际编译代码**：不能用占位符 `/*set actions code here*/`，否则所有导出函数都不会绑定到 `this`（详见 [踩坑记录 P-02](references/pitfalls.md)）
12. **`actions.list` 必须包含所有导出函数名**：不能只列默认 6 个方法，必须自动提取所有 `export function` 名称（详见 [踩坑记录 P-03](references/pitfalls.md)）
13. **【强制】代码必须自动发布，禁止要求用户手动复制粘贴**：编写完页面代码后，必须立即调用 `publish-page.js` 脚本将代码自动写入宜搭平台，不得让用户自行打开设计器粘贴代码
14. **【强制】创建自定义页面必须使用 `formType: 'display'`**：宜搭平台创建自定义页面时，`saveFormSchemaInfo` API 的 `formType` 参数必须传 `'display'`，严禁使用 `'page'`。使用 `'page'` 会导致 `getSchemaWithAllNavs` API 返回 500，页面完全空白且无控制台错误（详见 [踩坑记录 P-13](references/pitfalls.md)）
15. **【强制】页面源码修改必须发布闭环，无发布证据不得汇报"已上线"**：本轮只要新建/修改了自定义页面源码（`page-code.js`、`.canvas.jsx` 等页面文件），执行结束前必须看到**发布成功的证据**——`publish-page.js` 输出发布成功结果（含设计器/工作台 URL 或 API 成功 JSON）。无证据时只允许汇报「源码已修改，尚未发布」，**严禁汇报「页面已更新/已重新发布/已上线」**；本地编辑、diff、lint 通过、编译通过、口头声明都**不能**作为发布证据（对齐 OpenYida 官方规则 5 证据契约）。发布前建议先走 `publish-guard` Skill 检查线上是否有未同步改动，发布后按 publish-guard 的回读步骤核对（C5）通过才算闭环完成

### 重要规则（IMPORTANT）

影响代码质量和用户体验：

1. **代码生成前确认功能摘要**：详见 [编码指南 编注 0](references/coding-guide.md)
2. **pageSize ≤ 100**：分页接口 `searchFormDatas` 等的 `pageSize` 最大 100
3. **didUnmount 清理定时器**：在 `didUnmount` 中清理所有 `setInterval`/`setTimeout`，防止内存泄漏
4. **默认 Tailwind 风格层**：面向用户的自定义页面默认使用 Tailwind utility className 组织视觉层，并默认导入 Tailwind preflight 重置原生控件外观；运行时脚本只允许使用已验证的 `g.alicdn.com` 或企业自托管地址，未配置有效地址时走内联兜底样式
5. **DateField 时间戳格式**：日期字段值必须是时间戳（毫秒），不能是字符串
6. **forceUpdate 后延迟操作 DOM**：`forceUpdate()` 后 DOM 不会立即更新，需 `setTimeout` 延迟访问新 DOM 元素
7. **多端适配**：使用 `this.utils.isMobile()` 判断设备类型，适配 PC 和移动端
8. **输入法组合输入处理**：使用 `_isComposing` 标记配合 `compositionstart`/`compositionend` 事件，避免输入过程中触发提交
9. **iframe 嵌入表单 URL**：数据列表用 `workbench/{formUuid}?iframe=true`，禁止用 `formDetail`
10. **Tabs 显隐控制**：下拉值变更后自动回退到第一个可见 Tab，内容区用 `display: none` 保留 DOM
11. **加载态必须可恢复**：列表/看板页默认保留空态或演示数据；接口失败、超时或返回异常时必须把 `loading` 置回 `false`，不要只渲染"正在加载..."挡住整页
12. **禁止可见原生下拉**：筛选、预约、审批等用户可见下拉交互不要使用 `<select>`；使用 Tailwind className 组合 `button + menu + option` 的自定义下拉组件

> 每条规则的代码示例、反模式和常见错误见 [编码指南](references/coding-guide.md)（编写代码前强制必读）。
> 表单类 JSX 控件、筛选栏、表格、成员/附件等组件写法见 [组件指南](references/component-jsx-guide.md)；未验证的平台组件能力不得编造。

## 双链架构与运行桥规范（v1.4.0 对齐官方 Canvas 架构，P3-1）

> 自定义页面有两种编译链路，根据文件扩展名自动选择。

### 1. 链路选型决策表

| 条件 | 链路 | 说明 |
|------|------|------|
| `.canvas.jsx` / `.canvas.tsx` | **Canvas 现代链路** | React18 + hooks + antd，崩溃隔离，详见 [Canvas 开发指南](references/canvas-guide.md) |
| `.js` / `.oyd.jsx` / `.jsx`（非 canvas） | **Native 经典链路（稳定）** | React16 类组件 + `this.utils.yida`，原有流程不受影响 |

**选型规则**（官方原义）：新建页面默认走现代链路（Canvas）；**维护既有经典格式页面**（`.oyd.jsx`/`renderJsx`/平台 Jsx 组件）时继续用经典链路维护；仅当用户明确要求转为 Canvas 时才走迁移（见第 4 节迁移指引）。经典链路的判定特征：页面依赖 `this.$(fieldId)`、`this.utils.yida.*`、`this.dataSourceMap`、表单提交、字段双向绑定——这些是经典链路专属能力。

**Canvas 适用**：现代 React 交互、hooks 状态、可视化、需要崩溃隔离的页面
**Native 适用**：需要 `this.utils.yida.*` 数据桥、`this.$(fieldId)` 表单字段双向绑定、`dataSourceMap` 的页面

> Canvas 实验性能力（如原生组件桥）未验证前可降级 Native 链路，但**新建页面优先 Canvas**。

### 2. 运行桥规范（页面代码与平台私有 API 解耦——架构铁律）

**Canvas 现代链路页面内部禁止直接写 `this.utils.yida.*`、`this.$(fieldId)`、`this.dataSourceMap`**（官方致命规则原义：*组件内部不能直接写 this.$(fieldId)、this.utils.yida.* 或 this.dataSourceMap*——YidaCodeCanvas 没有平台 JSX 实例桥，this 上下文不存在）。取而代之的三桥分工：

| 桥对象（官方命名，本项目落地时按自身发布机制命名，**解耦原则不变**） | 职责 | 使用规则 |
|------|------|---------|
| `window.__OPENYIDA_YIDA_API__` | 表单/流程数据操作（如 searchFormDatas） | 表单数据读写一律走此桥（业务字段位于 `row.formData[fieldId]`） |
| `window.__OPENYIDA_UTILS__` | 根级工具（toast/dialog/router/isMobile 等宜搭 utils 函数） | 页面不直接依赖平台 this.utils |
| `window.__OPENYIDA_CONNECTOR_API__` | 平台连接器调用 | 仅接受 `Http_*` 格式 connectorName/operationId/connectionId，Body 传对象 |

**接入分工铁律**：表单数据 → JS-API 桥；平台连接器 → 连接器桥；**只有自定义同源接口才使用 `fetch`**。数据、生命周期与渲染必须通过 hooks、props、桥对象完成，不使用经典页面的 this 上下文 API。

### 3. 经典链路维护

既有 Native 页面的维护规范不变（本文档致命规则 1-14 与编码指南全部适用）。经典链路**不是待淘汰品**：强依赖 `this.utils.yida.*`/`dataSourceMap` 的页面在迁移验证完成前**必须留在经典链路**，禁止为升级而升级。

### 4. 迁移指引（经典 → Canvas，六步，源自官方 yida-canvas-upgrade）

1. **盘点原页面**：读源文件（不从编译产物反推），列导出函数/顶层常量/_customState 字段/生命周期/API 调用，标记依赖 `this` 的能力
2. **判断可迁性**：纯展示 UI+本地状态+白名单图表库 → 可迁；强依赖 `this.utils.yida.*` 或 `dataSourceMap` 且 props 注入未验证 → 先输出阻塞点，**保留历史页面**；诉求实为字段/流程/报表/权限 → 停止迁移改走配置型 Skill
3. **生成 Canvas 源码**：`export function renderJsx()` 的 JSX → `function YidaComp(props)`；`_customState` → useState/useMemo；didMount/didUnmount → useEffect + cleanup；删掉 forceUpdate/timestamp 强刷
4. **处理依赖**：import 仅限可用资源清单内的包；CDN 脚本换白名单或最小验证
5. **发布 + 回读验证**：publish 后回读 Schema 确认组件树存在 `YidaCodeCanvas` 且 `runtimeCode` 非空（回读仍是 `Jsx` = 升级未完成，见致命规则 15 发布闭环）
6. **运行验收**：首屏非空、控制台无依赖缺失/`YidaComp` 未定义错误、核心交互可触发、移动端宽度检查；迁移完成或受阻都输出升级报告

> 兼容性红线：工具函数替换（this.utils.toast/dialog → antd Message/Modal 或 props 注入）需验证；原生字段组件（如 EmployeeField）需先最小验证；未验证前只交草案不得发布覆盖线上页。

## 原生组件桥接（v1.5.0 新增，P3-2）

> Canvas 现代链路页面里使用宜搭运行态原生组件时的标准桥接方案。方法论三件事（官方原义）：**能力检测**（先探测、可用增强）→ **降级方案**（fallback 保底）→ **值归一化**（提交 payload 不依赖 raw 原始对象）。**Canvas 自绘 fallback 是页面稳定基线；原生组件是增强体验。**

### 能力检测（findYidaComponent 查找顺序）

运行时从 `window.Deep` → `window.DeepYida.default`（或 bundle 数组按 displayName 匹配）→ `window.YidaNativeComponents[name]` 依次查找。桥接函数只返回**可渲染组件**（函数组件/class 组件/带 render() 的对象/包装对象的 component|Component|default 字段）；仅有 displayName/name 的描述对象不可直接渲染（会触发 `Minified React error #130`）。未传 `form.value/formUuid`、CSS 未就绪、弹层打不开、OSS 签名未完成、移动端形态未适配等场景一律走降级。

### 组件清单与三件事（10 类）

| 类别 | 组件 | 能力检测 | 降级方案（fallback） | 值归一化 |
|------|------|---------|---------------------|---------|
| 门户-公告横幅 | `PortalTopBanner` | window.Deep 查找 | Canvas 自绘横幅 | 无业务值 |
| 门户-快捷入口 | `PortalQuickEntry` | 同上 | Canvas 自绘入口列表 | 无业务值 |
| 门户-收藏容器 | `QuickAccessCard`（theme 必传） | 同上+theme 校验 | Canvas 自绘卡片 | 无业务值 |
| 门户-最近访问 | `RecentlyUsedCard`（theme 必传） | 同上 | Canvas 自绘卡片 | 无业务值 |
| 数据管理视图 | `DataManageViews` | 同上 | iframe 嵌表单（`workbench/{formUuid}?iframe=true`） | 无业务值 |
| 字段-成员选择 | `EmployeeField` | 同上 | Canvas 自绘成员选择器 | ⬇ 见归一化示例 |
| 字段-部门选择 | `DepartmentSelectField` | 同上 | Canvas 自绘部门选择器 | ⬇ 见归一化示例 |
| 上传-附件 | `AttachmentField` | 同上 | `<input type="file">` + 直传 | ⬇ 见归一化示例 |
| 上传-图片 | `ImageField` | 同上 | `<input type="file" accept="image/*">` | ⬇ 见归一化示例 |
| 门户-数据卡片 | `DataCard` | ⚠️ 仅确认门户数据卡片上下文可用时接入 | Canvas 自绘卡片取数 | 无业务值 |

### 值归一化示例（官方结构；首次接入时记录一次真实 onChange 输出按实际结构适配）

```javascript
// 成员 EmployeeField：页面状态只存归一化值，raw 仅用于检查、不进提交 payload
function normalizeEmployee(raw) {
  return { userId: raw.userId || '', emplId: raw.emplId || '', name: raw.name || '',
           nickName: raw.nickName || '', workNo: raw.workNo || '', avatar: raw.avatar || '', raw };
}
// 提交表单时：formDataJson[employeeFieldId] = [normalized.userId]（成员字段提交格式=userId数组）

// 部门 DepartmentSelectField
function normalizeDepartment(raw) {
  return { deptId: raw.deptId || '', value: raw.value || '', name: raw.name || '',
           text: raw.text || '', deptFullPath: raw.deptFullPath || '', raw };
}

// 附件/图片 AttachmentField / ImageField：提交只用归一化后的文件数组
function normalizeFile(raw) {
  return { name: raw.name || '', url: raw.url || '', downloadURL: raw.downloadURL || '',
           imgURL: raw.imgURL || '', fileId: raw.fileId || '', size: raw.size || 0,
           type: raw.type || '', raw };
}
```

**降级控件也必须产出上述归一化结构**（成员存 name/userId/workNo，部门存 deptId 与名称，文件存 name/url/fileId），保证提交链路不感知"值来自原生组件还是 fallback"。

## 表格批量录入页面模式（v1.6.0 新增，P3-3）

> 「一张页面里多行表格填报、批量提交」的标准页面模式（如批量报单、批量入库）。适用 Canvas 现代链路（`.canvas.jsx` + YidaComp + hooks）；存量平台 JSX/native 页面的表格录入走经典链路既有能力。

### 页面结构与行状态模型

- **UI**：antd `Table` + `Input`/`Select`/`DatePicker` 行内编辑（Excel 式多行编辑）
- **行状态模型**：每行携带 `_rowId`（唯一标识）、`_status`（`draft | invalid | submitting | submitted | failed`）、`_errors`（行内校验错误）、`_submitError`；单元格修改后清错并把 `failed/invalid` 恢复为 `draft`
- **草稿持久化**：存 `localStorage`，key 必须含目标 `formUuid`；全部提交成功后清除，部分失败时**保留失败行**
- **提交流程**：先行级校验 → 展示待提交行数与关键摘要 → 用户确认 → 分批写入

### 批量提交链路（官方契约）

- Canvas 内禁止 `this.utils.yida.*`（见双链架构运行桥规范）；写入默认走发布层注入的 `window.__OPENYIDA_YIDA_API__.saveFormData / updateFormData` **逐行调用**（每行=一条独立表单实例，非子表控件写入；子表数据提交遵循本项目 integration/business-rule 既有硬规则）
- 或使用已验证的连接器代理/同源业务桥（`writeBridge.saveRow`），要求 `writeBridge.verified === true` 且字段 ID 来自 `get-schema` 真实 Schema；**未验证时按钮禁用，不得模拟成功或伪造 formInstId**（对齐致命规则 15 发布闭环）
- 日期字段值遵守数据查询三项硬规范（13 位毫秒时间戳，见 P0-3）

**分批提交模板**（官方原义，批次建议 5–20 行，批间顺序、批内并发）：

```javascript
async function submitInBatches(rows, writeBridge, batchSize) {
  const results = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(async (row) => {
      try {
        const value = await writeBridge.saveRow(toPayload(row), {
          rowId: row._rowId,
          idempotencyKey: 'canvas-table:' + row._rowId,  // 幂等键防重复提交
        });
        return { rowId: row._rowId, ok: true, value };
      } catch (error) {
        return { rowId: row._rowId, ok: false, error: error.message || '提交失败' };
      }
    }));
    results.push(...batchResults);
  }
  return results;
}
```

失败行只重试失败部分，成功行不重复提交。

## 图表技术选型（v1.7.0 新增，P2-2 决策表）

> 自定义页面图表有明确选型规则，AI 禁止随机选择图表库。**默认 Recharts，例外才 ECharts**——禁止仅因用户说"高级""好看""大屏"就切换 ECharts。

### 决策表（官方路由原义）

| 场景 | 选型 |
|------|------|
| 折线/面积/柱/条/饼环/组合图等常规图表（新页面，未指定技术栈） | **Recharts**（白名单依赖，`.canvas.jsx` + YidaComp + hooks） |
| 标准统计报表、原生筛选器、指标卡和表格报表 | 走 `report` Skill 原生报表（非页面代码） |
| 用户明确要求 ECharts | ECharts 兼容链路 |
| 维护已有 ECharts / 平台 JSX 组件图表页面 | ECharts 兼容链路（维护场景） |
| 复杂 option 能力缺口：地图、graph、桑基、custom series 等 Recharts 无法覆盖 | ECharts 兼容链路 |
| 经营分析看板/驾驶舱类交付 | **先做指标分析再选组件**（见下方方法论），图表路由在步骤 7 才决定 |
| 先建统计口径再做定制图表 | 先 `report`/`data-prep` 形成聚合数据源，再页面图表展示 |

### 经营看板方法论（官方 dashboard 九步，要点）

澄清业务范围（5-8 个经营维度/指标/角色/刷新频率）→ 数据契约（appType/formUuid/fieldId/报表/连接器）→ 派单触发配置 → 场景/主题/Shell 设计 → 生成看板源码 → hooks 实现筛选/轮询/导航/cleanup → **图表路由（此刻才选 Recharts 或 ECharts）** → 编译快检+发布回读 → 验收闭环。

### 图表数据规则（与 P0-1 服务端聚合硬规则同源，官方原文）

- KPI/趋势/占比必须来自**服务端聚合、报表结果或明确的聚合接口**——禁止前端全量聚合（拉全量明细 reduce/groupBy 冒充生产聚合）
- 明细查询必须分页；demo/seed 数据只能离线预览并明确标记，真实交付无数据时展示真实空态
- 筛选/周期切换/Tabs/刷新按钮均为受控状态并真实驱动派生数据；不得在 YidaCodeCanvas 组件内使用 `this.dataSourceMap`

## 适用场景

**正向触发**：
- 开发自定义展示页面（"自定义页面"、"JSX 页面"、"自定义组件"）
- 需要调用 `this.utils.yida.*` 读写表单数据
- 复杂交互逻辑（状态管理、事件处理、动态渲染）
- 自定义页面代码编写、页面交互逻辑实现

**不适用（应使用其他技能）**：

| 场景 | 应使用技能 |
|------|-----------|
| 原生表单页面开发 | `form_creator` |
| 批量表格录入 | `form_creator` |

## 异常处理

| 异常场景 | 处理方式 |
|---------|----------|
| 在 renderJsx 页面里使用了 React Hooks | 改为类组件模式，使用 export function + _customState |
| 字段 ID 不确定 | 读取项目的 `系统配置清单.md` 和 `组件ID清单.md` 获取真实 fieldId |
| `forceUpdate is not a function` | 检查 `this` 绑定，确认方法用 `export function` 定义 |
| API 调用无响应 | 确认 `.catch()` 错误处理，检查登录态 |
| 页面空白 | 检查 `renderJsx` 是否正确导出，查看浏览器控制台；检查是否使用了计算属性名 |
| `.then()` 回调中代码不执行 | 检查是否使用了 `padStart()`/`padEnd()`，改用三元运算符替代 |
| `SyntaxError: Unexpected token 'export'` | Babel 编译必须用 `modules: 'commonjs'`，详见 [踩坑记录 P-01](references/pitfalls.md) |
| `this.__initMethods__ is not a function` | `__initMethods__` 必须包含实际编译代码，详见 [踩坑记录 P-02](references/pitfalls.md) |
| `this.xxx is not a function`（自定义方法） | `actions.list` 必须包含所有导出函数名，详见 [踩坑记录 P-03](references/pitfalls.md) |
| 302 LOGIN FAILED | Cookie 必须包含所有域名，详见 [踩坑记录 P-06](references/pitfalls.md) |
| 保存后 actions 字段丢失 | Schema 结构不完整，详见 [踩坑记录 P-11](references/pitfalls.md) |
| 页面空白且无控制台错误 | `formType` 用了 `'page'` 而非 `'display'`，详见 [踩坑记录 P-13](references/pitfalls.md) |

## 快速开始

以创建「员工信息查询页」为例，完整流程如下：

### Step 1：获取字段 ID

读取项目中的 `系统配置清单.md` 获取应用 ID 和表单 UUID，读取 `组件ID清单.md` 获取字段 ID。

也可以使用 `get-schema` 或 `config-sync` Skill 同步最新的字段信息。

### Step 2：创建页面代码文件

在项目目录下创建页面代码文件：`<应用名称>/05自定义页面/<页面名称>/page-code.js`

### Step 3：编写页面代码

按照 [编码指南](references/coding-guide.md) 编写完整的页面代码，核心结构：

```javascript
var FIELDS = {
  userName: 'textField_xxx',
  department: 'selectField_xxx',
};

var _customState = {
  loading: true,
  list: [],
};

export function getCustomState(key) { /* 传 key 返回单值，不传返回浅拷贝 */ }
export function setCustomState(newState) { /* 合并更新 + this.forceUpdate() */ }
export function forceUpdate() { this.setState({ timestamp: new Date().getTime() }); }

export function didMount() { this.loadData(); }
export function didUnmount() { /* 清理定时器 */ }

export function loadData() { /* this.utils.yida.searchFormDatas(...) */ }

export function renderJsx() {
  var self = this;
  var timestamp = this.state && this.state.timestamp;
  return (
    <div>
      <div style={{ display: 'none' }}>{timestamp}</div>
      {/* 页面内容 */}
    </div>
  );
}
```

### Step 4：自动发布代码到宜搭

> **【强制】代码必须通过 `publish-page.js` 脚本自动发布到宜搭平台，禁止要求用户手动复制粘贴！**
> 发布脚本是本 Skill 的核心能力之一，它会自动完成：页面不存在时自动创建 → Babel 编译 → UglifyJS 压缩 → Schema 构建 → API 保存。

```bash
node .agents/skills/custom-page/scripts/publish-page.js <代码文件路径> <appType> [formUuid] [页面名称]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| 代码文件路径 | ✅ | JSX 源码文件路径（如 `待办事项管理/05自定义页面/Todolist待办事项/page-code.js`） |
| appType | ✅ | 应用ID（如 `APP_C8U5IYBXYRHUWY0H3GJ8`） |
| formUuid | ❌ | 自定义页面ID（如 `FORM-XXX`），若不提供或页面不存在，脚本会自动创建新页面 |
| 页面名称 | ❌ | 自定义页面名称（默认"自定义页面"） |

**自动创建页面**：当 `formUuid` 未提供或页面不存在时，脚本会调用 `saveFormSchemaInfo` API（`formType: 'display'`）自动创建自定义页面，获取新的 `formUuid` 后继续发布流程。**⚠️ 注意：自定义页面的 formType 必须是 `'display'`，不是 `'page'`！使用 `'page'` 会导致运行时 `getSchemaWithAllNavs` API 返回 500，页面完全空白。**

**前提条件**：
- 项目根目录下存在 `.cookies.json`（有效的宜搭登录态）
- 如果登录态过期（302 错误），需先运行 `node .agents/skills/api-client/scripts/login_manager.js` 重新登录

**发布成功后**：
- 脚本会输出设计器 URL 和工作台 URL
- 直接访问工作台 URL 即可预览页面效果

## 开发规范

> 编写页面代码前**必须完整阅读** [编码指南](references/coding-guide.md)，包含文件结构模板、状态管理模式、生命周期钩子、全局变量及全部编码注意事项。
> 涉及输入控件、日期、选择、成员/部门、附件、表格或筛选栏时，同时阅读 [组件指南](references/component-jsx-guide.md)。
> 实现 UI 样式时阅读 [设计规范](references/design-system.md)。

## 官方示例模板

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `window.g_config._csrf_token` | `String` | CSRF Token，调用需认证的接口时必须携带 |
| `window.loginUser.userId` | `String` | 当前登录用户的工号 |
| `window.loginUser.userName` | `String` | 当前登录用户的姓名 |
| `this.state.urlParams` | `Object` | 页面 URL 中的查询参数 |

### 编码注意事项

1. **自定义方法必须用 `export function` 定义**：凡是需要在方法内部使用 `this`（包括 `this.utils.yida.*`、`this.setCustomState` 等）的自定义方法，**必须且只能**使用 `export function 方法名() {}` 的形式定义，调用时使用 `this.方法名()`。**禁止**使用 `const fn = () => {}`、`const fn = function() {}` 等形式定义需要访问 `this` 的方法，这些形式无法被宜搭运行时正确绑定 `this`：
   ```javascript
   // ✅ 正确：export function + this.方法名() 调用
   export function didMount() {
     this.loadStatistics();
   }
   export function loadStatistics() {
     this.utils.yida.searchFormDatas({ formUuid: 'FORM-XXX', pageSize: 10 });
   }

   // ❌ 错误①：缺少 export，无法被宜搭运行时识别，this 丢失
   export function didMount() {
     loadStatistics();
   }
   function loadStatistics() {
     this.utils.yida.searchFormDatas(...);  // 报错：this is undefined
   }

   // ❌ 错误②：箭头函数/函数表达式形式，缺少 export，无法被宜搭运行时绑定 this
   const loadStatistics = () => {
     this.utils.yida.searchFormDatas(...);  // 报错：this is undefined
   };
   ```

2. **【严格禁止】事件绑定必须使用箭头函数包裹**：在 `renderJsx` 中绑定任何事件处理器时，先在函数顶部定义 `var self = this`，再使用箭头函数 `(e) => { self.方法名(e) }`。**严禁**直接写 `this.方法名` 或 `.bind(this)` 作为事件处理器：

   ```javascript
   // ✅ 正确：renderJsx 顶部固定 self，箭头函数包裹
   export function renderJsx() {
     var self = this;
     return <button onClick={(e) => { self.handleSubmit(e); }}>提交</button>;
   }

   // ❌ 错误①：直接传方法引用，this 丢失
   export function renderJsx() {
     return <button onClick={this.handleSubmit}>提交</button>;
   }

   // ❌ 错误②：使用 .bind(this) 绑定，不符合规范
   export function renderJsx() {
     return <button onClick={function() { this.handleSubmit(); }.bind(this)}>提交</button>;
   }
   ```

   > **生成代码时的自检清单**：检查 `renderJsx` 中所有 `onClick`、`onChange`、`onSubmit` 等事件属性，确保每一个都是 `(e) => { self.xxx(e) }` 形式，不存在任何 `onClick={this.xxx}` 或 `.bind(this)` 的写法。

   ```javascript
   // ❌ 错误③：在 .map(function(){}) 普通函数回调中使用箭头函数事件处理器，this 已丢失
   export function renderJsx() {
     return (
       <div>
         {quickBtns.map(function(btn, idx) {
           return (
             <button key={idx} onClick={(e) => { this.goToForm(btn.form); }}>
               {btn.label}
             </button>
           );
         })}
       </div>
     );
   }

   // ✅ 正确：.map() 回调必须使用箭头函数，确保 this 正确捕获
   export function renderJsx() {
     var self = this;
     return (
       <div>
         {quickBtns.map((btn, idx) => (
           <button key={idx} onClick={(e) => { self.goToForm(btn.form); }}>
             {btn.label}
           </button>
         ))}
       </div>
     );
   }
   ```

3. **输入法组合输入处理**：使用 `_isComposing` 标记配合 `compositionstart` / `compositionend` 事件
4. **定时器清理**：在 `didUnmount` 中必须清理所有定时器
5. **错误处理**：所有 API 调用必须使用 `.catch()` 处理异常
6. **样式方式**：默认使用 Tailwind utility className 组织视觉层；关键尺寸、容器兜底和 Tailwind 加载失败兜底可继续使用 `style` 对象。CSS 渐变必须使用 `background` 属性，不能使用 `backgroundColor`
7. **异步操作**：可以使用 `async/await` 语法
8. **pageSize 上限**：最大值为 **100**
9. **输入框使用非受控组件**：使用 `defaultValue`，在 `onChange` 中更新 `_customState`
10. **DateField 时间戳格式**：值必须是时间戳（毫秒），不能是字符串
11. **多端适配**：使用 `this.utils.isMobile()` 判断设备类型
12. **清除默认样式**：宜搭自定义页面容器有默认 padding 和圆角，需要强制覆盖
13. **性能优化**：不要在每次 `onChange` 都调用 `setCustomState`，可直接写入 `_customState` 静默更新
14. **forceUpdate() 后的 DOM 渲染时序**：`forceUpdate()` 后同步代码中无法立即访问新渲染的 DOM 元素，需 `setTimeout` 延迟
15. **调试技巧**：`console.log('当前状态:', _customState)` 或 `this.utils.toast({ title: '调试信息', type: 'info' })`
16. **iframe 嵌入表单 URL 规范**：数据管理页用 `workbench/{formUuid}?iframe=true`
17. **下拉选项控制选项卡显隐**：下拉值变更后自动回退到第一个可见 Tab
18. **字段 ID 语义化别名约定**：在文件顶部统一定义 `FIELDS` 常量映射字段别名

## 常见场景示例

- 自定义页面附件上传：见 [AttachmentField 上传指南](references/attachment-upload-guide.md)
- 对应最小代码示例：见 [attachment-upload.js](examples/attachment-upload.js)

## API 速查

### 表单数据（`this.utils.yida.<方法>(params)`）

| 方法 | 说明 | 必填参数 |
|------|------|----------|
| `saveFormData` | 新建实例 | `formUuid`, `appType`, `formDataJson` |
| `updateFormData` | 更新实例 | `formInstId`, `updateFormDataJson` |
| `deleteFormData` | 删除实例 | `formUuid` |
| `getFormDataById` | 查询详情 | `formInstId` |
| `searchFormDatas` | 搜索列表 | `formUuid` |
| `searchFormDataIds` | 搜索 ID 列表 | `formUuid` |

### 流程操作（`this.utils.yida.<方法>(params)`）

| 方法 | 说明 | 必填参数 |
|------|------|----------|
| `startProcessInstance` | 发起流程 | `formUuid`, `processCode`, `formDataJson` |
| `getProcessInstanceById` | 查询流程详情 | `processInstanceId` |
| `getProcessInstances` | 搜索流程列表 | — |

### 工具函数（`this.utils.<方法>()`）

| 方法 | 用途 |
|------|------|
| `toast` | 轻提示 |
| `dialog` | 对话框 |
| `formatter` | 日期/金额格式化 |
| `getLoginUserId` / `getLoginUserName` | 获取当前用户 |
| `isMobile` | 判断移动端 |
| `openPage` | 打开新页面 |
| `router.push` | 路由跳转 |
| `loadScript` | 动态加载脚本 |

### 大模型 AI 接口

| 方法 | 说明 | 调用方式 |
| --- | --- | --- |
| `txtFromAI` | AI 文本生成 | `POST /query/intelligent/txtFromAI.json` |

**主要参数**：`_csrf_token`（CSRF 令牌）、`prompt`（提示词）、`skill`（技能类型，如 `ToText`）、`maxTokens`（最大返回 token 数）

## 参考文档

| 文档 | 覆盖范围 | 何时阅读 |
|------|---------|---------|
| [编码指南](references/coding-guide.md) | 文件结构模板、状态管理、生命周期、编码规范 | 编写任何页面代码前必读 |
| [视觉决策指南](references/visual-decision-guide.md) | 6 步视觉决策法、5 套方向模板、密度配置、导航壳选择、场景级反 AI 味红线 | 编写任何页面代码前必读（编码指南前置步骤） |
| [踩坑记录](references/pitfalls.md) | 所有已知坑点、根因分析、修复方案、排查方法论 | 编写代码前必读 + 每次排查问题后更新 |
| [设计规范](references/design-system.md) | 色彩/圆角/字体/间距系统、组件样式模板、反模式 | 实现 UI 样式时必读 |
| [组件指南](references/component-jsx-guide.md) | JSX 控件写法、筛选栏、表格、成员/附件 | 涉及表单控件时必读 |
| [素材资源](references/assets-guide.md) | 图片/音乐/Icon 素材库、CDN 安全规范 | 需要引入图片、图标、音效时阅读 |
| [附件上传](references/attachment-upload-guide.md) | AttachmentField 上传完整链路 | 需要上传附件时阅读 |
| [Canvas 开发指南](references/canvas-guide.md) | Canvas 编译链路、React18 + hooks、依赖白名单、崩溃隔离 | 开发 .canvas.jsx/.canvas.tsx 页面时阅读 |

### 发布前 Lint 检查（Phase 3 新增）

发布流程会自动执行 lint 检查（lint → 编译 → 压缩 → 发布），检查项从致命规则自动提取：

- **致命错误（FATAL）**：阻断发布，必须修复
- **警告（WARN）**：不阻断，建议修复
- **`--no-lint` 开关**：可完全跳过 lint 检查（不推荐）

单独运行 lint：
```bash
node .agents/skills/custom-page/scripts/lint-page.js <代码文件路径>
```

## 注意事项

- 本技能不读写 memory，所有页面状态（`_customState`）仅在当前页面会话内有效，刷新页面后重置，不跨会话持久化
- 代码通过 `publish-page.js` 脚本直接发布到宜搭平台，无需手动复制粘贴
- 应用ID和表单UUID必须从 `系统配置清单.md` 读取真实值并直接填入，严禁留占位符
- **发布编译必须使用 CommonJS 格式**：宜搭运行时用 `new Function()` 评估 `actions.module.compiled`，不支持 `export` 语法，因此 Babel 编译必须设置 `modules: 'commonjs'`

---

*v1.7.0 (2026-09-28) — 新增「图表技术选型」决策表（P2-2）：默认 Recharts / 例外才 ECharts（明确要求、维护旧页、地图 graph 桑基 custom series 能力缺口）/ 原生报表归 report skill / 经营看板先指标分析再选组件（dashboard 九步要点）/ 图表数据规则与服务端聚合硬规则同源。依据：OpenYida 借鉴改造清单 P2-2（官方 yida-rechart / yida-chart / yida-dashboard 路由原义）*

*v1.6.0 (2026-09-28) — 新增「表格批量录入页面模式」章节（P3-3）：行状态模型（_rowId/_status 四态/_errors/草稿 localStorage 含 formUuid）+ 提交流程（校验→确认→分批）+ 批量提交契约（YIDA_API 桥逐行 saveFormData=每行独立实例、writeBridge.verified 才可用、未验证禁用按钮禁伪造 formInstId）+ 官方分批提交模板（5-20 行批间顺序批内并发+幂等键）。依据：OpenYida 借鉴改造清单 P3-3（官方 yida-canvas-table-form 原义）*

*v1.5.0 (2026-09-28) — 新增「原生组件桥接」章节（P3-2）：方法论三件事（能力检测 findYidaComponent 三级查找/降级 fallback 为稳定基线/值归一化 raw 不进提交 payload）+ 10 类组件三件事对照表（门户4类/DataManageViews/成员/部门/附件/图片/DataCard 边界）+ 成员/部门/附件图片三组可运行归一化示例代码。依据：OpenYida 借鉴改造清单 P3-2（官方 yida-canvas-custom-page/references/native-components-bridge.md 原义）*

*v1.4.0 (2026-09-28) — 「链路选择决策」升级为「双链架构与运行桥规范」（P3-1）：①选型补官方规则（新建默认 Canvas、经典格式页面留经典链路维护、明确请求才迁移）；②新增运行桥三桥分工表（YIDA_API/UTILS/CONNECTOR）与解耦铁律（Canvas 内禁写 this.utils.yida.*/this.$/dataSourceMap，只有自定义同源接口才用 fetch）；③新增六步迁移指引（盘点→可迁性判断→生成→依赖→发布回读→运行验收）与兼容性红线。依据：OpenYida 借鉴改造清单 P3-1（官方 yida-canvas-custom-page / yida-canvas-upgrade 原义）*

*v1.3.5 (2026-09-28) — 新增致命规则 15「页面源码修改必须发布闭环，无发布证据不得汇报已上线」：本轮修改/新建页面源码后，执行结束前必须看到 publish-page.js 发布成功证据（URL/成功 JSON）；无证据只能汇报「源码已修改，尚未发布」，严禁宣称已上线；发布前走 publish-guard、发布后按其 C5 回读核对。依据：OpenYida 借鉴改造清单 P0-2（官方规则 5 证据契约原义）*

*v1.3.4 (2026-07-24) — lint-page.js 新增 W07 规则（检测 UI 文案/标题/按钮中的装饰性 emoji，跳过纯注释行，WARN 级不阻断发布）；coding-guide.md 自检清单 E 段补充 emoji 红线*
