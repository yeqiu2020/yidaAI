# 发布守卫使用指南

> 本文档详细说明 publish-guard 候选 Skill 的使用方式、检查逻辑和缓存机制。

---

## 1. 核心概念

### 1.1 盲覆盖问题

现有的 `publish-page.js` 在发布自定义页面时，直接将本地代码编译后保存到宜搭平台。
它**不知道线上当前内容是什么**——如果别人（或你另一台机器）在线上改过页面，你的发布会直接覆盖，造成改动丢失。

### 1.2 publish-guard 解决方案

publish-guard 在发布前增加一道安全检查：

```
发布流程对比：

现有（无守卫）:
  本地代码 → 编译 → 保存到宜搭（盲保存，可能覆盖他人改动）

增强（有守卫）:
  本地代码 → [守卫检查] → 编译 → 保存到宜搭 → [Health Check]
               ↑                              ↑
          检测未同步改动                  验证页面健康
```

---

## 2. 检查逻辑

### 2.1 未同步改动检测

publish-guard 在本地维护一份 Schema 快照缓存（`.cache/publish-guard/<formUuid>.json`）。

检测逻辑：
1. 获取线上当前 Schema
2. 加载本地缓存的 Schema 快照
3. 对比两者的关键字段：
   - 代码内容（actions.module.source）
   - 组件数量
   - Action 数量
4. 如果不一致 → 线上有未同步改动 → **阻止发布**

### 2.2 代码 diff 预览

发布前可以预览本地代码与线上代码的差异：
- 统计新增行数、删除行数
- 显示前 10 行新增/删除内容
- 帮助开发者确认发布内容

### 2.3 Health Check

发布后验证页面健康状态：
1. **Schema 可获取**：页面 Schema 能否正常获取
2. **代码内容非空**：代码内容不为空（防止白屏）

---

## 3. 缓存机制

### 3.1 缓存目录

```
.cache/publish-guard/
├── FORM-AAA.json    ← 表单 FORM-AAA 的最后一次发布快照
├── FORM-BBB.json    ← 表单 FORM-BBB 的最后一次发布快照
└── ...
```

### 3.2 缓存内容

```json
{
  "formUuid": "FORM-AAA",
  "cachedAt": "2026-07-10T12:00:00.000Z",
  "schema": { ... }
}
```

### 3.3 缓存更新时机

- **发布成功后**：自动更新缓存（保存线上 Schema 快照）
- **手动同步**：可以运行 `check` 命令，当检测到无冲突时手动更新缓存

### 3.4 缓存清除

如需清除缓存（例如确认线上改动是预期的，想接受线上版本作为新基线）：
- 删除 `.cache/publish-guard/<formUuid>.json`
- 或删除整个 `.cache/publish-guard/` 目录

---

## 4. 使用场景

### 4.1 日常发布

```bash
# 安全发布（推荐）
node publish-guard.js publish --appType APP_xxx --formUuid FORM-yyy --code my-page.js
```

### 4.2 检查线上状态

```bash
# 只检查，不发布
node publish-guard.js check --appType APP_xxx --formUuid FORM-yyy
```

### 4.3 预览差异

```bash
# 查看本地代码与线上代码的差异
node publish-guard.js diff --appType APP_xxx --formUuid FORM-yyy --code my-page.js
```

### 4.4 强制覆盖

当确认要覆盖线上改动时：

```bash
# 强制覆盖（跳过未同步改动检查）
node publish-guard.js publish --appType APP_xxx --formUuid FORM-yyy --code my-page.js --force
```

### 4.5 发布后验证

```bash
# 单独执行 health check
node publish-guard.js health --appType APP_xxx --formUuid FORM-yyy
```

---

## 5. 与 publish-page.js 的集成方式

### 5.1 当前阶段（候选轨）

- publish-guard 作为独立候选 Skill 实现
- 通过 `child_process.fork` 调用 `publish-page.js`
- **不修改 publish-page.js 的任何代码**

### 5.2 未来晋升稳定轨后

- publish-guard 的检查逻辑将作为 `publish-page.js` 的前置步骤合并
- `publish-page.js` 增加 `--guard` 开关（默认开启，可 `--no-guard` 跳过）
- 检查失败时 `publish-page.js` 自动中止

---

## 6. 退出码说明

| 退出码 | 含义 |
|--------|------|
| 0 | 成功（检查通过/发布成功/health check 通过） |
| 1 | 失败（检查未通过/发布失败/health check 失败/参数错误） |

---

*创建日期：2026-07-10 (Phase 5-0)*
