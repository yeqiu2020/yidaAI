---
name: form-data-update
description: 宜搭已有实例数据修正护栏（执行层）。当用户说"修改表单数据"、"更新实例"、"改单据字段值"、"刷数据"、"修正存量数据"、"回写字段"、"把XX记录的XX改成XX"时触发。对已有表单实例做字段级修正（主表+子表），强制四步：改前快照→执行→回读逐字段断言→失败自动回滚。内置防护：子表完整行读取（formData 只含前 50 行）、关联表单字段必须数组（写字符串会清空关联）、下拉自动写 _id 实际值、附件/图片/签名类控件中止、写入台账与反向回填。创建新数据用 data-tester，清空数据用 data-clean。
---

# form-data-update —— 宜搭实例数据修正护栏

> 定位：执行层样板（《Skill体系优化方案_20261029.md》阶段二产物）。
> 只回答两件事：**什么时候必须走这里**、**怎么调用**。知识正文一律不进本文件。

## 🔴 硬规则

1. **修改已有实例的字段（主表或子表），禁止手写 updateFormData / updateInstance 脚本，一律走本工具 CLI**。2026-10-29 实证：裸写脚本连踩三坑（子表 50 行截断丢 121 行、关联字段写字符串被清空、服务端校验拦截无参数可绕过）。
2. **AI 必须先向用户复述改动清单并获得明确同意后，才可携带 `--yes` 执行写入**；预览阶段只用 `--dry-run`。
3. **断言失败 = 自动回滚 + 输出差异清单**；若回滚也失败（needsManualFix），只能人工核对台账快照，禁止盲目重试。
4. 服务端校验拦截（如「不允许超量发货！」）**无参数可绕过**，如实转达错误信息，改走页面操作或数据源头修正。
5. 键一律用 fieldId（中文名→fieldId 查各项目 `组件ID清单.md`）；本工具**不支持**：新增子表行、附件/图片/签名类控件写入、批量多实例（多实例请逐条调用，每条独立快照/回滚）。

## 脚本入口

```bash
# 1) 写改动文件（键=fieldId；子表值=要改的行数组，每行必须带 rowId）
#    {"formUuid":"FORM-XXX","formInstId":"FINST-XXX","changes":{
#      "numberField_a": 10,
#      "selectField_b": "新显示值",
#      "associationFormField_c": [{"instanceId":"FINST-9","title":"关联单"}],
#      "tableField_d": [{"rowId":"ROW-xxx","numberField_q": 5}]
#    }}
node .agents/skills/form-data-update/scripts/form_data_update.js \
  --app APP_XXX --changes <changes.json> --dry-run        # 2) 预览（不写）

node .agents/skills/form-data-update/scripts/form_data_update.js \
  --app APP_XXX --changes <changes.json> --yes            # 3) 用户同意后执行

node .agents/skills/form-data-update/scripts/form_data_update.js \
  --rollback <batchId>                                    # 4) 按台账反向回填
```

选项：`--form-type receipt|process`（缺省自动探测：快照含 processInstanceId → 流程表单）、`--json`（末行输出 `FDU_RESULT {...}` 机器可读单行）、`--ledger-dir`（默认 `temp-file/fdu-ledger`）。

## 强制防护（CLI 内置，缺一不可）

| # | 防护 | 实现 |
|---|------|------|
| 1 | 子表读取完整行 | `getFormDataById` 的 instValue + `listTableDataByFormInstIdAndTableId` 分页（pageSize=50，totalCount 交叉校验），禁止用 formData 判断行数 |
| 2 | 子表整表回写 + 行补 rowId + 关联数组化 + 复杂控件中止 | `buildUpdatePayload` / `guardComplexFieldsOnFullRewrite`（附件/图片/签名列非空 → 直接中止） |
| 3 | 下拉写 `_id` 实际值 | 值未变 → 写快照 `_id`；新值透传，回读断言兜底 |
| 4 | 写前快照 | 完整 instValue + 待写载荷落盘 `temp-file/fdu-ledger/<batchId>/`，落盘失败不写 |
| 5 | 回读逐字段断言 | 同管线重读（R1/R2），目标字段==期望，非目标字段一字不差（键集合级，含 `_id` 镜像与关联数组；下拉显示值/镜像的服务端重算只 warn） |
| 6 | 断言失败自动回滚 | 恢复为写前快照值并复跑断言；失败则标记 needsManualFix |
| 7 | 写入台账 | 表单/记录/字段/旧值/新值/时间，按批次目录留存，支持 `--rollback` 反向回填 |

退出码：`0` 成功；`1` 断言失败（已回滚或需人工）；`2` 未写入即中止。

## 线上验收清单（离线单测已覆盖逻辑，写线上前按此验证）

`tests/features/form-data-update.test.js`（44 用例）覆盖：子表 60 行整表回写、关联数组、下拉显示值≠实际值、主表+子表混合、回滚自洽。写线上前须用真实数据各验 1 条：

1. 子表 > 50 行的记录：只改 1 行 → 回读全表行数不变；
2. 含关联表单字段的记录：改其他字段 → 关联不被清空；
3. 下拉显示值与选项实际值不一致的记录：不改它 → 选项映射不变；
4. 命中服务端业务校验的记录：如实报错中止，无写入；
5. 主表+子表混合更新：全部字段落值。

## 版本

v1.0.0（2026-10-29）。事实层条目变更请同步 `.agents/skills/事实层.md` 并标注日期。
