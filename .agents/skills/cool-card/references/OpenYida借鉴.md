# OpenYida 借鉴调研（2026-10-01，main 分支 zip 快照）

> 仓库：https://github.com/openyida/openyida （MIT 协议，AI-native CLI for 宜搭）
> 本项目 data-tester/integration 等技能已有借鉴先例（「OpenYida 借鉴改造清单」）。
> 结论：**OpenYida 命令清单（101条）没有酷卡片命令，但其代码层完整支持卡片节点**——这是本项目 integration CLI 缺失能力的现成实现。

## 发现一：process-compiler.js 原生支持卡片节点

`lib/process/services/process-compiler.js`（2088 行，65KB）：

```js
// 节点别名表（节选，106-112 行）
sendcard: 'SendCardNode',  sendcardnode: 'SendCardNode',  cardnode: 'CardNode',
updatecard: 'UpdateCardNode',  cardupdate: 'CardUpdateNode',

// GENERIC_NODE_CONFIGS（184-203 行）
SendCardNode:  { processType: 'sendCard',  title: ['发送卡片'], propKeys: ['sendCardRules', 'cardRules'] },
UpdateCardNode:{ processType: 'updateCard', title: ['更新卡片'], propKeys: ['updateCardRules', 'cardUpdateRules'] },

// 编译分发（1479-1486 行）
SendCardNode  → processProps = clonePlain(props.sendCardRules || {})
UpdateCardNode→ processProps = clonePlain(props.updateCardRules || {})
```

测试佐证（tests/configure-process.test.js:390）：
`{ componentName: 'SendCardNode', name: '发卡片', sendCardRules: { cardId: 'CARD-A' } }` 编译为 processJson 节点 `type:'sendCard'` + viewJson schema 节点 componentName:'CardNode'——**raw props 直通模式**。

主入口：`buildProcessAndViewJson(definition, processCode, formUuid, baseUrl, appType, options)`
（递归分配 nodeId → 构建节点列表 → apply/finish 首尾节点 → prevId/nextId 链），依赖仅 3 个本地模块：`core/yida-i18n`、`core/i18n`、`services/process-actions`。

## 发现二：完整保存管线端点（process-service.js）

| 函数 | 端点 | 说明 |
|------|------|------|
| newDraftProcess | `/{appType}/query/simpleProcess/newDraftProcess.json` | 建草稿，取 processId/processVersion |
| saveProcessById | `/alibaba/web/{appType}/query/simpleProcess/saveProcessById.json` | 提交 json(processJson)+viewJson，`isOnline:'true'` |
| publishProcessById | `/alibaba/web/{appType}/query/simpleProcess/publishProcessById.json` | 发布 |
| getProcessById / pageProcessVersion | 同域 query 路径 | 回读/版本查询 |

另有 `process-view-verifier.js`（视图体检器）可一并借鉴。

## 可行路线（v2 演进方向，未实施）

**CLI 加速路线**：vendor OpenYida 的 compiler+service 四文件进本技能（保留 MIT 声明）→
spec 填 `sendCardRules`（按 [sendCardRules金标准.md](sendCardRules金标准.md) 真实结构）→
编译 → newDraft → saveProcessById → publishProcessById。
全程 API 化，绕开浏览器自动化，预期 20 分钟 → 2 分钟。

**实施前提**：
1. 用本项目 `.cookies.json`（csrfToken+cookies）复刻 createYidaClient 的请求封装（参考 integration-api.js）
2. spec 的 cardData/dataRules/actionRules 按金标准生成；`selectCard` 段需要官方模板元数据（可先从本文件样例抄，或调模板列表接口）
3. 规则1 合规性：saveProcess 由**经过验证的编译器**生成（非手写 JSON），且保存后执行 getProcessById 回读 + 体检——与 integration skill 现行门禁同强度
4. 首次落地用一次性流程验证编译产物在设计器渲染正常（规则18教训：保存成功≠画布正确）

## 本地快照

- 源码 zip：`temp-file/openyida-main.zip`；解压：`temp-file/openyida-src/openyida-main/`
- 关键文件：`lib/process/services/{process-compiler,process-service,process-view-verifier}.js`
