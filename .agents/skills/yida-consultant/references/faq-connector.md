# 连接器类高频问题

> 来源：connector/references/connector-action-format.md、connector-api-guide.md

---

## 连接器鉴权失败

### 症状

连接器调用 API 时返回 401/403 错误，或提示鉴权失败。

### 根因

1. 鉴权方式配置不正确（API Key / OAuth2 / Basic Auth 等选择错误）
2. 鉴权信息（Token / API Key / 用户名密码）填写错误或已过期
3. 鉴权信息放在了错误的位置（Header vs Query vs Body）

### 修复方案

1. 确认目标 API 的鉴权方式
2. 检查连接器的鉴权配置是否匹配
3. 确认鉴权信息放在正确位置（通常在 Header 中）
4. 如需重新配置，调 connector skill 重建连接器

### 验证方式

调 connector 的测试动作，验证鉴权是否通过。

### 参考来源

`.agents/skills/connector/references/connector-api-guide.md`

---

## 连接器执行动作配置丢失

### 症状

连接器创建时配置了执行动作，但测试后动作消失，或调用时提示动作不存在。

### 根因

连接器动作配置格式不正确，或测试时覆盖了原有配置。

### 修复方案

1. 检查动作配置 JSON 格式是否符合规范（inputs 分组：Headers / Query / Path / Body）
2. 确认 GET 接口没有 Body 分组，参数放在 Query 中
3. 如需修复，调 connector skill 重新生成动作配置

### 验证方式

调 connector skill 查看当前动作配置，确认格式正确。

### 参考来源

`.agents/skills/connector/references/connector-action-format.md`

---

## 连接器跨应用查询参数名混淆

### 症状

连接器调用宜搭 API 查询数据时，查询条件不生效或返回空结果。

### 根因

不同场景下参数名可能不同：`searchFieldJson` vs `searchField`。此外，跨应用查询时不要传递多余的 `appType` 参数（应用 ID 已在数据源 URL 中）。

### 修复方案

1. 优先使用 `searchFieldJson`，如果失败尝试 `searchField`
2. 不要传递 `appType` 参数
3. 打印完整响应，确认数据层级和参数是否生效

### 验证方式

调 connector 动作测试，打印完整请求和响应。

### 参考来源

`.agents/skills/code-expert/references/common-core/error-guide.md`（案例8、14）
