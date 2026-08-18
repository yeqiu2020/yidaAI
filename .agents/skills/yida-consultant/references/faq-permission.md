# 登录/权限类高频问题

> 来源：auth-plus/SKILL.md、config-sync 相关配置同步说明

---

## Cookie 失效导致操作失败

### 症状

同步配置、提交数据或调用 API 时提示未登录或 Cookie 失效。

### 根因

宜搭登录态（Cookie）有过期时间，长时间未操作或服务器重启后 Cookie 可能失效。

### 修复方案

调 auth-plus skill 重新登录，获取新的 Cookie。支持多种登录策略：CDP 浏览器登录、环境变量注入、终端二维码登录、Playwright 降级。

### 验证方式

重新登录后，调 config-sync 同步配置，确认能正常获取数据。

### 参考来源

`.agents/skills/auth-plus/SKILL.md`

---

## 权限组配置导致看不到数据

### 症状

用户在表单中看不到某些数据，或无法编辑/删除数据。

### 根因

表单权限组配置限制了用户的数据可见范围。常见情况：
1. 权限组设置为"仅看本人数据"
2. 权限组未包含该用户
3. 数据权限规则配置不当

### 修复方案

1. 调 config-sync 同步配置，检查权限组设置
2. 确认用户所在的权限组
3. 检查数据权限规则是否符合业务需求
4. 如需调整，在宜搭设计器中修改权限组配置

### 验证方式

调 config-sync 同步配置，检查权限组列表和数据权限规则。

### 参考来源

`.agents/skills/config-sync/SKILL.md`

---

## 应用 ID 或表单 UUID 未配置

### 症状

执行同步、提交数据或创建自动化时提示"应用ID未填写"或"表单UUID不存在"。

### 根因

系统配置清单中的 appType 或 formUuid 未填写，或填写了占位符。

### 修复方案

1. 调 org-init skill 从宜搭平台获取组织信息和应用列表
2. 调 config-sync 同步应用 ID、表单 UUID、组件 ID
3. 确认系统配置清单.md 中的值是真实值，不是占位符

### 验证方式

调 config-sync 同步后，检查系统配置清单.md 中的 ID 是否已填充。

### 参考来源

`.agents/skills/org-init/SKILL.md`、`.agents/skills/config-sync/SKILL.md`

---

## 同步到本地报"应用不存在"（应用被重建导致 appId 变更）

### 症状

本地操作页面点击「同步到本地」报错：`导航列表API失败:应用不存在` / `应用ID xxx 验证失败，应用可能不存在或已被删除`（errorCode=TIANSHU_000015），且 `getFormNavigationListByOrder.json` 返回 `success=false, errorMsg=应用不存在`。系统配置清单同步失败，无法继续。

### 根因

应用在平台上被**删除后重建**（或改名/重建），平台分配了**新的 appId**；但本地 `组织及应用信息.md` 中仍保留**旧的 appId**，导致同步验证时平台按旧 ID 查不到该应用。这是本地配置与平台现实的"ID 漂移"冲突，不是同步脚本 bug。

### 排查要点

1. **先确认是"应用真不存在"还是"登录/接口问题"**：用同一个账号调用 `getFormNavigationListByOrder.json` 分别验证目标应用和一个已知正常应用。
   - 目标应用返回 `success=false, errorMsg=应用不存在` + 对比应用返回 `success=true` 且能拿到表单列表 → **登录态正常，目标应用确实不存在**（ID 漂移）
   - 两个都失败 → 登录态/接口问题（检查 .cookies.json）
2. **核对平台当前应用列表**：调用 `/query/app/getAppList.json?_api=App.getList` 拿到当前所有应用的 `appName` 与 `appType`（appId），逐条对照 `组织及应用信息.md` 的「应用列表」。
3. 只更新与平台不一致的那一行 appId，其它行不动。

### 修复方案

1. 将 `组织及应用信息.md` 中该应用的 appId 更新为平台返回的新值（保留3列表格结构，只改内容）。
2. 重新执行「同步到本地」验证。若输出目录不存在，先创建目录（页面同步会自动创建）。
3. 建议：删除云端应用后，务必同时点击本地页面「删除」清理本地记录（本地删除按应用名称删除配置行+文件夹，是干净的）；重建同名应用后建议点「刷新组织应用」重新对账 ID。

### 验证方式

重新同步成功、`getFormNavigationListByOrder.json` 对目标应用返回 `success=true` 且 `content` 为表单数组。

### 参考来源

`.agents/skills/config-sync/scripts/sync_config.js`（应用验证逻辑）、`.agents/skills/org-init/SKILL.md`、`组织及应用信息.md`

