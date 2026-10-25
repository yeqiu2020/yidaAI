---
name: connector
description: 宜搭 HTTP 连接器创建与管理。支持自然语言描述 API 创建连接器、cURL 智能解析、API 文档自动解析、连接器动作管理、连接账号管理和安全动作模板。当用户需要接入外部接口、配置鉴权、创建或管理连接器时触发。
---

# HTTP 连接器管理

> 候选轨 Skill（Phase 3 新增），命名无 `yida-` 前缀（见禁止事项#11）。
> 依赖：`lib/core/http.js`（Phase 1/2 公共库）、`.cookies.json`（登录态）

## 严格禁止 (NEVER DO)

- 不要在代码中硬编码 API Key、密码等凭证，通过连接器鉴权配置管理
- 不要编造 connector-id 或 action-id，必须从命令返回中提取
- 不要删除连接器前确认是否有表单/页面正在使用
- 不要用 shell heredoc 或重定向生成连接器 action/config JSON

## 严格要求 (MUST DO)

- 优先使用 `smart-create` 从 cURL 命令或接口文档智能创建
- 创建连接器后，将 connector-id 记录到 `.cache/connectors.json`
- action 配置文件必须先用结构化文件写入工具创建到 `.cache/connector/actions/` 目录
- 本技能不读写 memory，连接器配置通过 API 写入宜搭平台

## 适用场景

用户需要"接入外部接口"、"调用第三方 API"、"连接钉钉开放平台"、"HTTP 连接器"时使用。

## 触发条件

**正向触发**：
- "接入外部接口"、"调用第三方 API"
- "连接钉钉开放平台"、"HTTP 连接器"
- "打通自建系统"、"API 集成"
- "配置鉴权"、"创建连接器"
- "从 cURL 创建"、"解析 API 文档"

## 鉴权方式

| 界面显示 | 内部类型 | 适用场景 |
|---------|---------|----------|
| 无身份验证 | `NONE` | 公开 API |
| 基本身份验证 | `BasicAuth` | 用户名密码 |
| API 密钥 | `ApiKeyAuth` | Header/Query 传密钥 |
| 钉钉开放平台验证 | `DingAuth` | 钉钉 OpenAPI |
| 阿里云 API 网关 | `AliyunApiGateway` | 阿里云网关 |
| 钉钉零信任网关 | `DingTrustGW` | 零信任网关 |

## 命令

### 连接器管理

```bash
# 列出所有连接器
node .agents/skills/connector/scripts/connector-manager.js list --appType <appType>

# 创建连接器
node .agents/skills/connector/scripts/connector-manager.js create --appType <appType> --name "连接器名称" --host "api.example.com" [--auth "NONE|BasicAuth|ApiKeyAuth|DingAuth|AliyunApiGateway|DingTrustGW" --username <用户名> --password <密码> --api-key <密钥> --app-key <应用Key> --app-secret <应用Secret>]

# 获取详情
node .agents/skills/connector/scripts/connector-manager.js detail --appType <appType> --connectorId <connector-id>

# 删除连接器
node .agents/skills/connector/scripts/connector-manager.js delete --appType <appType> --connectorId <connector-id>
```

### 执行动作管理

```bash
# 列出执行动作
node .agents/skills/connector/scripts/action-manager.js list-actions --appType <appType> --connectorId <connector-id>

# 添加执行动作
node .agents/skills/connector/scripts/action-manager.js add-action --appType <appType> --connectorId <connector-id> --operations <action-file>

# 删除执行动作
node .agents/skills/connector/scripts/action-manager.js delete-action --appType <appType> --connectorId <connector-id> --actionId <action-id>

# 测试连接器
node .agents/skills/connector/scripts/action-manager.js test --appType <appType> --connectorId <connector-id> --action <action-file>
```

### 连接账号管理

```bash
# 列出连接账号
node .agents/skills/connector/scripts/connection-manager.js list-connections --appType <appType> --connectorId <connector-id>

# 创建连接账号
node .agents/skills/connector/scripts/connection-manager.js create-connection --appType <appType> --connectorId <connector-id> --name "账号名" [--username <用户名> --password <密码> --api-key <密钥>]
```

### 智能创建（推荐）

```bash
# 从 cURL 命令创建
node .agents/skills/connector/scripts/smart-create.js --appType <appType> --curl "curl 'https://api.example.com/v1/data' -H 'Authorization: Bearer xxx'" --name "连接器名称"

# 解析 API 文档
node .agents/skills/connector/scripts/smart-create.js --appType <appType> --doc <api-doc.md路径>

# 生成接口文档模板
node .agents/skills/connector/scripts/smart-create.js gen-template
```

### 安全动作模板

```bash
# 生成安全动作模板
node .agents/skills/connector/scripts/safe-action-templates.js generate --type <GET|POST|PUT|DELETE> --url <接口路径> --name <动作名称>

# 列出可用模板
node .agents/skills/connector/scripts/safe-action-templates.js list
```

## 文件结构

```
.agents/skills/connector/
├── SKILL.md                          ← 本文件
├── scripts/
│   ├── connector-manager.js          ← 连接器管理（list/create/detail/delete）
│   ├── action-manager.js             ← 执行动作管理（list/add/delete/test）
│   ├── connection-manager.js         ← 连接账号管理（list/create）
│   ├── smart-create.js               ← 智能创建（cURL/API文档解析）
│   └── safe-action-templates.js      ← 安全动作模板
└── references/
    └── connector-api-guide.md        ← 连接器 API 参考
```

## 异常处理

| 异常场景 | 处理方式 |
|---------|----------|
| 连接器不存在 | 重新执行 list 获取有效 ID，不得编造 |
| 鉴权失败（401/403） | 检查鉴权方式和凭证配置 |
| API 调用超时 | 检查目标域名是否可达 |
| action-id 不存在 | 执行 list-actions 重新获取 |
| 连接器被依赖无法删除 | 先解除依赖再删除 |
| 智能创建解析失败 | 降级为模板创建方式 |
| 企业版权限不足 | 探测版本权限，无权限提示升级 |
| HTTP 200 但响应非 JSON 且含 `waf_block` | 平台 WAF 拦截（仅动作/连接器保存、发布类提交接口适用），按下方「WAF 误拦判定与规避」处理；查询类接口被拦先查登录态 |

## WAF 误拦判定与规避（强制·v1.1.0）

> 依据：OpenYida 借鉴改造清单 P0-6（官方 Changelog 2026.9.22 原义：*"仅当发布返回 HTTP 200 但响应体非 JSON 且包含 `waf_block` 时判定为安全拦截，指导用二分法定位命中片段"*）

**判定条件**：保存/发布类提交接口返回 **HTTP 200，但响应体不是 JSON 且包含 `waf_block`** → 判定为平台安全（WAF）拦截，不是未知错误。宜搭 WAF 会拦截动作配置中携带的疑似攻击特征内容（连接器 action 示例代码、文档片段、鉴权示例等是高危来源）。

**处理流程**：
1. **二分法定位**：对本次提交的 action/config 内容每次注释或删除一半重试提交，约 log2 次定位到最小命中片段
2. **规避改写**：命中片段避免以下特征——**正则字面量**（如 `/<script>/`）、**危险 HTML/script 字符串**（`<script>`、`javascript:`、`onerror=` 等）、**SQL/命令注入特征串**（`' OR 1=1`、`; DROP TABLE` 等）；可改用转义、拆分拼接或文字描述替代
3. **重试确认**：改写后重新提交，返回 JSON（含 success 字段）才算通过

**适用范围**：仅保存动作、发布、提交类**写接口**适用；查询类接口（list/detail）被拦通常是登录态问题，先查 `.cookies.json`，不套用本规则。**禁止**把 WAF 拦截当未知错误反复原样重试。

## 危险操作确认

删除连接器为不可逆操作，执行前必须确认无表单/页面依赖此连接器。

## 参考文档

- [连接器 API 参考](references/connector-api-guide.md)
- [执行动作配置格式](references/connector-action-format.md)
- [宜搭 HTTP 连接器官方文档](https://docs.aliwork.com/docs/yida_support/_10/zbq17y)

## 连接器安全动作知识库（v1.2.0 新增，P4-3）

> 条目结构：**场景 / 错误表现 / 安全写法**。前 6 条源自官方 yida-connector-safe-actions 风险清单（原义），后 3 条为本项目实测沉淀。

| # | 场景 | 错误表现 | 安全写法 |
|---|------|---------|---------|
| K1 | 输出字段展开复杂 `Code/Message/Data` 子字段（平台未确认兼容时） | 测试面板崩溃/动作列表为空 | 输出保守只留根对象 `Response`，确认兼容后再展开 |
| K2 | GET 动作配置 Body / `inputs` 与 `parameters` 中 query 参数不一致 | 面板异常、参数丢失 | GET 不配 Body；query 参数两处严格一致 |
| K3 | 中文 JSON 未按 UTF-8 读写 | 动作名/参数乱码、校验失败 | 生成与读取 JSON 一律 UTF-8 |
| K4 | 同批 JSON 重复 `operationId` | CLI fail-closed 拒绝（不静默覆盖） | 提交前自查 operationId 唯一 |
| K5 | 把 Authorization/Cookie/token/API Key 示例值写进动作 | 敏感信息入库 | 敏感 Header 默认值必须为空，凭证走连接账号 |
| K6 | `update-action` 只传部分动作 | 平台保存为 **replace-all**，遗漏的动作被清空 | 任何不完整/未知结果立即停止，禁止自动重试非幂等写；保存后 `list-actions` 复验完整性 |
| K7（本地） | 宜搭 POST 类接口漏 `_csrf_token` 或用 cookie 子集 | 「csrf校验失败」（P1-1/P4-2 实测） | POST 显式带 `_csrf_token` 且 cookie 必须读 .cookies.json **全量**（含 c_csrf） |
| K8（本地） | 集成自动化 AD batch 模式写目标主表（流程表单触发场景） | `JSONArray cannot be cast to Map` 引擎崩溃、零写入（integration 硬规则19） | 改 direct_form 更新节点 + noneOperation=add 逐行迭代 |
| K9（本地） | 连接器入参映射把 valueType 枚举 token（processVar/literal）当数据值 | 赋值静默丢失或字面量入库（integration 硬规则3） | token 只进 valueType 槽位，value 槽位放真实业务值/字段ID |

**动作测试规范（test 强制步骤）**：新增/修改动作后**必须先 test 再投入使用**——①`--action` 用 `operationId`（不是顺序编号）；②优先结构化参数 `--path-json/--query-json/--header-json/--body-json`（避免 flat 参数误入 query/body）；③配置了 `securitySchemes` 时先 `list-connections` 取目标连接器名下账号再传 `--account-id`（0 账号/未指定/账号不属目标连接器 → 停止）；④测试只接受 `{statusLine,responseHeaders,content}` canonical 响应，非 2xx 或未知 envelope 都算失败；⑤测试后再次 `list-actions` 确认动作未被清空。

## 设计器数据源（v1.2.0 新增，P4-3）

> 适用边界：**平台 JSX 组件页面**（设计器 Page）通过 dataSourceMap 调连接器。YidaCodeCanvas/`.canvas.jsx` 场景不走本节（走 yida-canvas-data-binding 等价能力），禁止发明伪 dataSourceMap。

- **配置形态**：设计器 Page 根节点 → `dataSource.online` 注册数据源 → 代码 `this.dataSourceMap.<名称>.load()` 调用
- **连接器数据源关键配置**：`dpType: "YIDACONNECTOR"` + `protocal: "REMOTE"` + `requestHandler.value: "this.utils.legaoBuiltin.dataSourceHandler"`；`options.connector`（连接器名）、`options.connectorAction.value`（Action 的 operationId）、`options.params.inputs`（Headers/Query/Body）、`options.shouldFetch: false` 按需触发、`didFetch/onError` 处理
- **平台只读归一形态**：REMOTE + `/query/publicService/invokeService.json` + `serviceInfo.connectorInfo`
- **命名与拆分**：数据源用业务语义小驼峰（如 `getDeviceList`）；查询/详情/保存/删除各自独立数据源，不做万能 Action
- **状态与安全**：失败/取消/超时必须恢复 `loading: false`、错误用户可见；mutation 防重复提交；不写死 `_csrf_token`，凭证留在连接器/后端侧
- **禁止绕过**：平台 JSX 页面不得用 `fetch`/`XMLHttpRequest`/`testConnector.json`/手写外部 URL 直连
- **验收**：回读时左侧"数据源"面板可见、`actions.module.source` 无直连痕迹、运行时只用 `this.dataSourceMap.<名称>.load()`

## 版本历史

- **v1.2.0**（2026-09-28）：新增「连接器安全动作知识库」（9 条：官方 6 风险条目 + 本地 3 实测沉淀，条目结构=场景/错误表现/安全写法）+「动作测试规范」（operationId/结构化参数/account-id 前置检查/canonical 响应/测试后复验）+「设计器数据源」章节（YIDACONNECTOR+REMOTE 配置形态、invokeService 归一、JSX 页面边界与禁止绕过清单）。依据：OpenYida 借鉴改造清单 P4-3（官方 yida-connector-safe-actions / yida-data-source-connectors 原义 + 本项目 integration 硬规则3/19 实测教训）
- **v1.1.0**（2026-09-28）：新增「WAF 误拦判定与规避」章节 + 异常处理表新增对应行（P0-6）——HTTP 200 + 响应体非 JSON + 含 `waf_block` 判定为平台 WAF 拦截，二分法定位命中片段，规避写法（避免正则字面量/危险 HTML-script 字符串/注入特征串），仅保存/发布类写接口适用。依据：OpenYida 借鉴改造清单 P0-6（官方 Changelog 2026.9.22 原义）。（此前候选轨初始版未设版本号，记为 v1.0.0）
