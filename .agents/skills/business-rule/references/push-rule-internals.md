# push-rule.js 内部机制与 API 写入详解

> 本文件由 SKILL.md 下沉而来。推送命令与核心约束见 [../SKILL.md](../SKILL.md) 第九节。

## 一、push-rule.js 工作原理

1. 读取 JSON 文件，获取 `text`（公式文本）和 `marks`（令牌标记数组）
2. **自动从 marks 推导公式步骤**：
   - 遍历 marks，按 `from.ch` 排序
   - 在令牌位置之间提取纯文本片段（type 步骤：键盘输入）
   - 在令牌位置提取字段名和上下文（click 步骤：点击字段列表）
   - 根据 mark 的 value 格式自动判断令牌类型：
     - value 以 `/` 结尾 → 目标表单引用 → context: stock
     - value 含 `/` 不以 `/` 结尾 → 目标表字段 → context: stock
     - value 无 `/` 且显示文本含 `.` → 子表字段 → context: detail
     - value 无 `/` 且显示文本无 `.` → 当前表字段 → context: current
3. 启动 Playwright 浏览器，注入 Cookie
4. 导航到流程设计器 → 创建新版本 → 全局设置 → 添加规则
5. 自动填写规则名称
6. 自动在公式编辑器中执行公式步骤（键盘输入 + 点击令牌）
7. 点击公式编辑器「确定」→ 规则对话框「确定」
8. 点击面板底部「保存」→ 顶部「保存」→「发布流程」
9. 最终验证规则是否写入并发布

## 二、从 MD 文件自动提取的元数据

| 字段 | MD 中的匹配模式 | 示例 |
|------|----------------|------|
| 规则名称 | `# 业务关联规则：XXX` | 销售出库-扣减库存 |
| 表单UUID | `触发表单UUID \| FORM-XXX` | FORM-D84F53BA... |
| 流程Code | `processCode \| TPROC--XXX` | TPROC--NNC669... |
| 目标表单 | `目标表单 \| XXX（` | 库存信息 |
| 应用ID | 从系统配置清单.md 自动读取 | APP_NZEJ00... |

> 应用ID 自动从项目目录或 JSON 文件所在路径向上查找 `系统配置清单.md` 读取，无需手动指定。

## 三、完整的 Playwright 自动化链路（v19 验证通过 + push-rule.js 通用化）

脚本自动执行以下步骤：

1. 导航到 `${baseUrl}/dingtalk/web/${appType}/design/newDesigner?processCode=${processCode}&formUuid=${formUuid}`
2. 点击「创建新流程」创建新版本草稿
3. 点击「全局设置」打开设置面板
4. 在「节点提交规则」区域检查是否已有同名规则：
   - **如有同名规则**：自动删除旧规则，再添加新规则
   - **如无同名规则**：直接添加新规则
5. 在 `node-rule-setting-dlg` 对话框中填写规则名称
6. 在公式输入区点击打开公式编辑器（CodeMirror）
7. 🔴 **全自动粘贴到 CodeMirror**（`autoPasteCmData`，v3.7.0）：先用 `execCommand('copy')` 把扁平 JSON 字符串写入真实系统剪贴板，聚焦公式编辑器的 CodeMirror 后触发真实 `Ctrl+V`，宜搭 paste 处理器检测 `isCmData` 自动还原令牌；随后用 `verifyCmTokens` 校验（不能只判断含 UPSERT，需 marks 数 ≥ 期望令牌数且非原始 JSON 文本）；若失败自动降级为合成 `ClipboardEvent(clipboardData=text/plain)` 兜底
8. 点击公式编辑器「确定」
9. 验证 TEXTAREA 值
10. 点击规则对话框「确定」
11. 检查规则是否在表格中
12. 点击全局设置面板底部「保存」
13. 点击顶部工具栏「保存」
14. 点击「发布流程」
15. 最终验证（流程状态、规则存在、流程版本号）

> 🔴 **关键经验**（v11→v19 + push-rule.js 通用化）：
> - 公式步骤从 JSON marks 自动推导，无需手动编写 formulaSteps
> - 目标表字段需先展开目标表分组（检查 `.formula-pane-var-list.list_hide`）
> - 子表字段在「当前表单提交后的值」分组内查找，title 格式为 `子表名.字段名`
> - 保存分三步：面板底部「保存」→ 顶部「保存」→「发布流程」，缺一不可
> - 仅保存不发布，规则不会生效
> - **检测到同名规则时，必须先删除旧规则再添加新规则，不能跳过**
> - **最终必须输出流程版本号**（如"流程版本 V3"），让用户明确知道规则在哪个版本中

## 四、方式二：API 直接写入（适用于未启用流程）

### 普通表单：通过 saveFormSchema API

1. 用 `get-schema` 获取当前表单的完整 Schema
2. 在 Schema 中找到或创建业务关联规则节点
3. 将结构化公式数据（text + marks）填入规则节点的 `complexValue` 字段
4. 调用 `saveFormSchema` 推送更新

### 流程表单：通过 saveProcessDesign API（仅草稿可用）

1. 用 `getProcessDesign` 获取当前流程设计
2. 在对应节点的 `submitRule` 中添加关联操作规则
3. 将结构化公式数据填入规则的公式字段
4. 调用 `saveProcessDesign` 保存
5. 调用 `publishProcess` 发布流程

> ⚠️ 已启用流程的 API 返回空内容（只读），此时自动降级为 Playwright 方式。

## 五、方式三：手动粘贴（兜底方案）

仅当 Playwright 和 API 均不可用时使用：

1. 打开生成的 JSON 文件，全选复制
2. 进入宜搭设计器对应的配置入口
3. 在公式编辑器中粘贴（CodeMirror 会自动识别 `{text, marks, isCmData}` 格式）
4. 点击「确定」→ 保存 → 发布流程

> ⚠️ 此方式仅作为兜底方案，正常情况下应使用方式一自动推送。
