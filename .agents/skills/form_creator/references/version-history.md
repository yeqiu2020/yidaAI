# form_creator 版本更新历史

> 本文件从 SKILL.md 拆分而来（Phase 6 任务 6-6），记录各版本的更新内容。

---



---

## 版本更新说明

**当前版本：v6.61.0** (2026-07-28)

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
