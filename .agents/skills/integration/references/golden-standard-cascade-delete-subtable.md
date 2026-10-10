# 金标准：删除目标表单子表行（cascade 5 节点，流程表单）v2.8.8

> **本文档为唯一权威金标准**。所有涉及"主表操作子表 → 删除目标表单子表行"的集成自动化，
> 必须以本文档的 viewJson 结构为准。任何与本文档不一致的生成结果都视为缺陷，需修正生成器。
>
> 来源：用户手工配置流「主表操作子表提交后删除目标表单对应子表行」`LPROC-N7C66G91N9A8I6UPIBJT09NZ80JN3YX5I7QSM81`
> 应用：`APP_HHYNCIQ5E4UZFSMY4W3F`（课程录制），2026-08-12 手工微调后导出。

## 一、业务场景与命令

**场景**：触发表单「主表操作子表」（流程表单）提交并审批结束后，删除「目标表单3」（流程表单）内名称匹配记录下、规格匹配的子表行。

**标准 CLI 命令**（照抄替换真实 ID 即可，不需手动改 viewJson）：
```bash
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "主表操作子表提交后删除目标表单对应子表行" \
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

## 二、节点树（5 节点 cascade）

```
StartNode(表单事件触发, processFinish+agree)
  → GetSingleDataNode(获取单条数据, 目标主表按名称匹配)
  → GetBatchDataNode(获取子表多条数据, sub_table, 数据节点=上游, 子表=产品规格, 规格匹配)
  → DeleteDataNode(删除数据, sub_table, 子表行)
  → EndNode(结束)
```

## 三、各节点 viewJson 金标准

### 1. StartNode（表单事件触发）

```json
{
  "componentName": "StartNode",
  "props": {
    "nodeName": "StartNode",
    "name": { "en_US": "Form event trigger", "zh_CN": "表单事件触发", "type": "i18n" },
    "nodeError": "",
    "start": {
      "examineApproveType": "processFinish",
      "formEventType": ["delete"],
      "formEventField": "",
      "dataFilterType": "all",
      "fieldType": "all",
      "conditions": { "condition": "AND", "rules": [] },
      "formUuid": "FORM-3BC7433335FE40A5AFE78AFDD952225F0Q08",
      "triggerType": "FormEvent",
      "type": "form",
      "triggerFormEventRecursively": false,
      "examineApproveNode": "",
      "examineApproveActiveList": []
    }
  }
}
```

> ⚠️ **触发事件关键**：`formEventType` 是 **`["delete"]`**（不是 `["processEvents"]`），
> `examineApproveType="processFinish"`。这是宜搭对"流程表单审批结束后"场景的标准表达，
> 参考流「主表操作主表1-删除同步目标表单1」`LPROC-76E66...` 也是同样配置。
> `examineApproveActiveList` 为空数组（该流未限定审批动作）。

### 2. GetSingleDataNode（获取单条数据，目标主表）

```json
{
  "componentName": "GetSingleDataNode",
  "props": {
    "nodeName": "GetSingleDataNode",
    "name": "获取单条数据",
    "description": "请设置想要获取的数据",
    "type": "single",
    "getData": {
      "type": "single",
      "originalType": "process_form",
      "appType": "APP_HHYNCIQ5E4UZFSMY4W3F",
      "sourceId": "FORM-AB089735539A4BDF96560D57B44D269D3CAD",
      "targetItem": {
        "appType": "APP_HHYNCIQ5E4UZFSMY4W3F",
        "appName": "课程录制",
        "formItem": {
          "formType": "process",
          "advanceProc": "n",
          "formUuid": "FORM-AB089735539A4BDF96560D57B44D269D3CAD",
          "title": "目标表单3",
          "fields": null,
          "hasTableField": null
        }
      },
      "subSourceId": "",
      "relativeItem": {},
      "filterType": "condition",
      "condition": {
        "condition": "AND",
        "rules": [
          {
            "id": "textField_5rkfde2c",
            "op": "包含",
            "operators": [],
            "value": "textField_5mgmyxq3",
            "componentType": "TextField",
            "ruleId": "item-af544084-b0e8-4ac7-bb28-4b4d06b971b6",
            "parentId": "group-b93f8f81-0343-4f4a-8397-13a91cdb68aa",
            "extValue": "processVar",
            "ruleValue": "textField_5mgmyxq3",
            "name": "名称",
            "valueType": "processVar",
            "ruleType": "rule_text",
            "opCode": "Contain"
          }
        ],
        "ruleId": "group-b93f8f81-0343-4f4a-8397-13a91cdb68aa",
        "conditionCode": "&&"
      },
      "sort": { "type": "none", "column": "" },
      "rulesFilter": [ ...主表字段 + 系统字段(创建时间/修改时间/创建者/最后修改者/流程实例ID/流程状态)... ],
      "outputs": [ ...主表字段 + 产品规格子表(tableField_5rkfw271)... ],
      "quantity": 1,
      "dataRules": { "rules": [ { "componentName": "", "labe": "", "name": "", "required": false, "ruleId": "rule-xxx", "value": "", "valueType": "literal" } ] },
      "assignments": []
    },
    "title": "获取单条数据"
  }
}
```

> ⚠️ **关键字段**：
> - `originalType` = **`"process_form"`**（目标表单是流程表单）。普通表单目标为 `"form"`。
> - `targetItem` 是**完整结构** `{appType, appName, formItem:{formType, advanceProc, formUuid, title}}`，不是简化的 `{deep,value,label}`。
> - 主表匹配条件 `op` = **`"包含"`**（`opCode:"Contain"`），用户手工标准用"包含"而非"等于"。
> - condition rule 是**完整结构**（含 ruleId/parentId/extValue/ruleValue/name/valueType/ruleType/opCode）。

### 3. GetBatchDataNode（获取子表多条数据，sub_table）

```json
{
  "componentName": "GetBatchDataNode",
  "props": {
    "nodeName": "GetBatchDataNode",
    "name": { "type": "i18n", "zh_CN": "获取子表多条数据", "en_US": "获取多条数据" },
    "description": "请设置想要获取的数据",
    "type": "batch",
    "getData": {
      "type": "batch",
      "originalType": "sub_table",
      "appType": "",
      "sourceId": "node_1041680d0f3",
      "targetItem": { "deep": 0, "value": "node_1041680d0f3", "label": "获取单条数据" },
      "subSourceId": "tableField_5rkfw271",
      "relativeItem": { "deep": 0, "value": "tableField_5rkfw271", "label": "产品规格" },
      "filterType": "condition",
      "condition": {
        "condition": "AND",
        "rules": [
          {
            "id": "numberField_5rkfgxx6",
            "op": "等于",
            "operators": [],
            "value": "numberField_5mgmoit9",
            "componentType": "NumberField",
            "ruleId": "item-a3cfe6d6-d7b8-415f-8749-5ef6a81bebfc",
            "parentId": "group-7a9b6354-9a9c-45d0-bdf4-9ac19e79f91c",
            "extValue": "processVar",
            "ruleValue": "numberField_5mgmoit9",
            "name": "规格",
            "valueType": "processVar",
            "ruleType": "rule_text",
            "opCode": "Equal"
          }
        ],
        "ruleId": "group-7a9b6354-9a9c-45d0-bdf4-9ac19e79f91c",
        "conditionCode": "&&"
      },
      "sort": { "type": "none", "column": "" },
      "rulesFilter": [ ...子表内字段(规格/单价)... ],
      "outputs": [ ...子表字段完整结构(含 parentId=tableField_5rkfw271, __category__=form)... ],
      "quantity": 100,
      "dataRules": { "rules": [ ... ] },
      "assignments": []
    },
    "title": { "type": "i18n", "zh_CN": "获取子表多条数据", "en_US": "获取多条数据" }
  }
}
```

> ⚠️ **关键字段**：
> - `originalType` = **`"sub_table"`**（从子表获取），**不是 `"node"`**（v2.8.8 修正）。
> - `sourceId` = 上游节点ID（`"node_1041680d0f3"`），`targetItem.value` 同节点ID + `label="获取单条数据"`。
> - `subSourceId` = 目标子表字段ID（`tableField_5rkfw271`），`relativeItem.label` = 子表名"产品规格"。
> - 子表条件 `op` = **`"等于"`**（`opCode:"Equal"`），仅子表字段条件。
> - `name`/`title` 为 i18n 对象，zh_CN = **"获取子表多条数据"**。

### 4. DeleteDataNode（删除数据，子表行）

```json
{
  "componentName": "DeleteDataNode",
  "props": {
    "nodeName": "DeleteDataNode",
    "name": "删除数据",
    "description": "请设置要删除的数据",
    "deleteData": {
      "sourceId": "node_bb0daae8bfb",
      "targetItem": {},
      "type": "sub_table",
      "subSourceId": "tableField_5rkfw271"
    },
    "title": "删除数据"
  }
}
```

> **关键**：`deleteData.type="sub_table"`，`sourceId`=上游获取多条节点ID，`subSourceId`=目标子表字段ID，`targetItem={}`，**无 `appType`**（删除子表行场景）。

> ⚠️ **v2.8.8 区分**：`deleteData.type` 取决于删除对象——
> - 删除**子表行**（有 `subSourceId`）：`type="sub_table"` + 无 `appType` + `targetItem={}`
> - 删除**整条主表记录**（无 `subSourceId`）：`type="node"` + `appType`（如参考流 `LPROC-76E66`）
> CLI 已按此区分修正（`deleteIsSubTable`）。

### 5. EndNode（结束）

```json
{ "componentName": "EndNode", "props": { "name": { "en_US": "end", "zh_CN": "结束", "type": "i18n" } } }
```

## 四、CLI 生成 vs 金标准的差异清单（v2.8.8 需修正）

| # | 位置 | CLI 生成（错） | 金标准（对） | 修复 |
|---|------|---------------|-------------|------|
| 1 | StartNode `formEventType` | `["processEvents"]` | `["delete"]` | 流程表单审批结束后触发用 delete |
| 2 | GetSingleDataNode `originalType` | `"process"` | `"process_form"` | ✅ 已修正（v2.8.8） |
| 3 | GetSingleDataNode `targetItem` | `{deep,value,label}` 简化 | 完整 `{appType,appName,formItem}` | 文档记录，宜搭交互时补齐 |
| 4 | GetSingleDataNode 主表条件 `op` | `等于`(Equal) | `包含`(Contain) | 业务选择，用户用"包含" |
| 5 | GetBatchDataNode `name`/`title` | 字符串"获取多条数据" | i18n 对象"获取子表多条数据" | UI 命名，宜搭可接受字符串 |
| 6 | GetSingleDataNode `rulesFilter`/`outputs` | 简化（仅用到的字段） | 完整（含系统字段） | 宜搭保存/读取时动态补齐，CLI 生成最小集即可 |
| 7 | **DeleteDataNode `deleteData.type`** | `"node"`（有 subSourceId 时） | **`"sub_table"`** | ✅ 已修正（v2.8.8） |

> **说明**：#6 中 rulesFilter/outputs 的完整字段（创建时间/修改时间/创建者/最后修改者/流程实例ID/流程状态）是宜搭在设计器交互时自动补齐的，CLI 不必完全复刻（否则维护成本极高且易错）。CLI 生成最小字段集即可被宜搭接受并自动补全。
> **#7 修复详情**：CLI 原先只要有 `deleteSubSourceId` 都用 `type="node"`，但金标准删除子表行应为 `type="sub_table"` + 无 `appType` + `targetItem={}`。参考流 `LPROC-76E66`（删整条主表记录）用 `type="node"`+`appType` 佐证区分。已按 `deleteIsSubTable`（是否有 deleteSubSourceId）区分修正两个 builder。

## 五、硬规则与避坑

- 硬规则 16：cascade 5 节点删除子表行的标准形态。
- 避坑清单 #24：节点3 `originalType` 必须是 `sub_table`（非 `node`）。
- **不要从 `sourceId` 是否指向上游节点去推断 `originalType`**——必须以手工配置 viewJson 为金标准。

## 六、已知限制（合并自原 cascade-subtable-delete skill，2026-08-12 测试结论）

> 即使 viewJson 结构完全符合上述金标准，当前平台引擎版本下「删除目标子表行」仍可能无法生效：
> - 现象：所有格式变体（浏览器录制 + CLI 各种方案）均**保存发布成功**（API 返回 `success:true`），但实际执行时出现**静默 no-op**——流程引擎报告执行成功（status=3，elapsed≈347ms，exception 为空），目标子表行**实际未被删除**。
> - 结论：这可能是**平台引擎版本对「从集成自动化删除子表行」场景的限制**，而非 JSON 格式配置问题。需要更高版本平台支持或通过其他途径实现（如表单设计层面的子表组件能力、人工确认后执行等）。
> - 当前推荐路径：仍先用 CLI `integration-create.js` 创建 4 节点/5 节点流程（能顺利通过体检门禁），提交测试数据观察；若仍不删除，需向上反馈平台限制。
