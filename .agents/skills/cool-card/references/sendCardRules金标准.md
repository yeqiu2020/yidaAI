# sendCardRules / cardRules 金标准（2026-10-01 实测导出，2026-10-05 重大修正）

> 来源：流程②「销售订单创建推送卡片」发布后导出（LPROC-T7966J91E1N9F0J0GQVVWABXTX142KLJ7DPUMQQ），
> 该流程运行日志"执行成功"、卡片实发。**以此为 spec 直填或调试的金标准。**
>
> **🔴 2026-10-05 重大修正（设计器 saveProcess 请求体实抓）**：
> - processJson 的 sendCard 节点 props 是 cardRules 22 键**直接平铺**，**不是** OpenYida 编译器的 `{sendCardRules:{...}}` 包裹——包裹形式 saveProcess 报「流程解析异常」
> - 触发节点同样带 nodeId（node_xxx），三节点全量 id 化，nextId 数组连线，prevId 恒为 ''
> - formEventType 序列化值：创建成功='insert'、编辑='update'、删除='delete'
> - 存储单一事实源 = getProcess.json 返回的 {schema, globalSetting}（processJson 随 save 提交、不回读）
> - **cardRules 完整 22 键**（--raw 导出会截断，以 getProcess.json 为准）：actionAssignments, actionRules, assignments, atGroupUserRule, bizId, cardAppId, cardData, cardPageCode, cardType, dataRules, description, lastMessage, receiverUserRule, selectCard, sendToGroupRule, sendToUserIds, sendToUserRule, sendType, showAtGroupUser, showSendToGroup, showSendToUser, visibleScope
> - 关键键语义：`assignments`（每变量 fieldId processVar 绑定）｜`sendToUserIds`（收件人 userId 字面量数组）｜`sendToUserRule`（UI 选人回显）｜`sendType:'update'`+`bizId.value='__masterdata_form_inst_id'`（同实例去重更新）｜`lastMessage`（会话提示语）｜`visibleScope:'ALL'`
> - **API 建流程全链路已验证**：`scripts/card-flow-cli.js` v2 克隆路线（getProcess 拉源 → 改 cardRules → createLogicflow → saveProcess → publishProcessById），设计器渲染、发布、触发执行全部通过
> - **API 端点合约**：getProcess.json?processCode&isLogic=true（GET 设计态双参数源）｜saveProcess.json（POST json+viewJson）｜publishProcessById.json（POST processId+processVersion）｜pageProcessVersion.json（查 processId/version）｜createLogicflow.json（POST name/type/formUuid）
> - ⚠️ 页面内合成 POST 会被 baxia 反爬静默拒绝（空 200），POST 必须走 node 侧 api-client（带全量 cookie）

## 位置

viewJson：`schema.children[N].componentName = "CardNode"`，配置在 `props.cardRules`。
processJson 侧对应节点 `type: "sendCard"`，**cardRules 22 键直接平铺在 node.props 上**（无包裹键）。

## 完整结构（可运行真实样本，节选）

```json
{
  "componentName": "CardNode",
  "id": "node_ocmupd85af1",
  "props": {
    "nodeName": "CardNode",
    "paneClassName": "card-node-setter-pane",
    "name": { "type": "i18n", "zh_CN": "发送卡片", "en_US": "发送卡片" },
    "description": "请设置",
    "cardRules": {
      "cardAppId": "APP_Q5EDE81BFOKVYB0O7IJ9",
      "cardPageCode": "form2104d1c5628f23d2001a",
      "cardType": "im",
      "selectCard": {
        "appId": "APP_Q5EDE81BFOKVYB0O7IJ9",
        "cardName": "工单待处理",
        "cardPageCode": "form2104d1c5628f23d2001a",
        "cardPreviewUrl": "https://img.alicdn.com/imgextra/i2/O1CN013L1w7A1YLjzHVdG3e_!!6000000003043-0-tps-496-740.jpg",
        "cardScene": "",
        "cardSchema": null,
        "cardTag": "",
        "cardTemplateId": "",
        "cardType": "im",
        "useCard": false,
        "variableConfig": null,
        "_cardType": "official"
      },
      "cardData": {
        "type": "${订单状态}",
        "from": "${客户名称}",
        "content": "${销售订单号}",
        "createDate": "${创建时间}"
      },
      "actionRules": {
        "COOL_button_action_id_handler": {
          "type": "action",
          "actionId": "LPROC-BO966PC1UVN9UBT8INCU4CMZ7U7F34MS6APUMZ3"
        }
      },
      "dataRules": {
        "0": { "id": "submitter",  "label": "提交人",   "name": "submitter",  "componentName": "TextField", "originType": "string", "paramType": "String", "required": true, "childList": null, "componentOption": "", "componentProps": null, "parentParamType": "" },
        "1": { "id": "type",       "label": "工单类型", "name": "type",       "componentName": "TextField", "originType": "string", "paramType": "String", "required": true, "childList": null, "componentOption": "", "componentProps": null, "parentParamType": "" },
        "2": { "id": "from",       "label": "工单来源", "name": "from",       "componentName": "TextField", "originType": "string", "paramType": "String", "required": true, "childList": null, "componentOption": "", "componentProps": null, "parentParamType": "" },
        "3": { "id": "content",    "label": "工单内容", "name": "content",    "componentName": "TextField", "originType": "string", "paramType": "String", "required": true, "childList": null, "componentOption": "", "componentProps": null, "parentParamType": "" },
        "4": { "id": "createDate", "label": "创建时间", "name": "createDate", "componentName": "TextField", "originType": "string", "paramType": "String", "required": true, "childList": null, "componentOption": "", "componentProps": null, "parentParamType": "" },
        "id": "Body",
        "childList": [ "…与 0~4 同结构（模板变量树）…" ]
      }
    }
  }
}
```

## 关键规律（写 spec / 调试必读）

1. **cardData 的映射值是 `"${字段中文名}"`** —— 运行时按触发表单字段名解析，不是字段 ID。
2. **dataRules 是模板变量声明树**：数字键为顶层变量，`id:"Body"` 为容器，`childList` 复述一遍变量清单。用官方模板时整段从 `selectCard` 对应的模板元数据照抄，不可手造。
3. **actionRules 键名**：`COOL_button_action_id_handler`（工单待处理模板的"立即处理"按钮），值 `{type:"action", actionId:"<手动触发流程processCode>"}`；「关闭工单」按钮对应另一个 handler 键。
4. **发送到人**（本次实测走通）：`cardRules` 中另含收件人配置段（本次通过 UI 配置写入，导出键为 selectCard 之外的同级键）；发送到群需群内启用酷应用且触发有群上下文。
5. 官方模板的应用归属 `APP_Q5EDE81BFOKVYB0O7IJ9`（宜搭官方酷应用），`cardPageCode` 按模板固定。
