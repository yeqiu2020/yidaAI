---
name: publish-guard
description: 宜搭自定义页面发布守卫。在发布自定义页面之前检查线上是否有未同步改动、预览发布内容 diff、强制覆盖开关确认、发布后 health check。当用户需要发布页面、覆盖线上页面、或需要防止多人协作时的盲覆盖事故时触发。
---

# 宜搭自定义页面发布守卫（Publish Guard）

> 候选轨 Skill（Phase 5-0 新增），命名无 `yida-` 前缀（见禁止事项#11）。
> 风险等级：R2（会读线上、可触发发布，需门禁+影子运行）
> 依赖：`lib/core/http.js`（公共库）、`.cookies.json`（登录态）
> 协作关系：作为 `publish-page.js` 的前置检查层，**不替换它**

## 严格禁止 (NEVER DO)

- 不要在未经 `--force` 确认的情况下覆盖线上有未同步改动的页面
- 不要修改稳定轨的 `publish-page.js`（本 Skill 是独立前置检查层）
- 不要在 health check 失败后继续后续操作
- 不要跳过 diff 预览直接发布（除非用户明确使用 `--force`）

## 严格要求 (MUST DO)

- 发布前必须检查线上当前状态与本地最后同步状态的差异
- 检测到线上有未同步改动时必须阻止发布（除非 `--force`）
- 发布后必须执行 health check（验证页面可访问、非白屏/500）
- **发布后必须先回读核对再汇报**：health check 通过后，还必须通过只读接口（get-form-config / getFormSchema 类）回读目标页面配置，核对本轮发布内容已真实落库（如 compiled 代码含本轮新增的函数名/标记），回读一致才算发布闭环完成；未回读或回读不一致时严禁汇报「已发布/已更新/已上线」
- 所有检查结果必须有清晰的文本输出

## 适用场景

- 多人协作开发同一个宜搭应用时，防止覆盖他人的在线改动
- 交付给客户后客户自己也在改页面时，防止发布覆盖客户改动
- 需要预览发布内容 diff 时
- 需要发布后验证页面健康状态时

## 触发条件

**正向触发**：
- "发布前检查"、"发布守卫"
- "防止覆盖线上改动"、"盲覆盖检测"
- "发布前预览 diff"、"发布后 health check"
- "安全发布自定义页面"

## 与 publish-page.js 的关系

```
现有流程（publish-page.js）:
  代码文件 → lint → 编译 → 压缩 → 保存到宜搭

增强后流程（publish-guard 作为前置层）:
  代码文件 → publish-guard 检查 → lint → 编译 → 压缩 → 保存 → health check → 回读核对（C5）
              ↑                              ↑                    ↑
         前置安全检查                    后置验证            发布闭环确认
```

**关键约束**：
- 本阶段 publish-guard 作为**独立候选 Skill** 实现
- **不修改稳定轨 `publish-page.js`**
- 将来晋升稳定轨时，再作为 `publish-page.js` 的前置检查步骤合并

## 命令

### 建立同步基线与发布前检查（不实际发布）

首次维护已有页面时先读取并核对线上内容，再执行 `node .agents/skills/publish-guard/scripts/publish-guard.js baseline --appType <appType> --formUuid <formUuid>` 保存同步基线；没有基线默认拒绝覆盖。

```bash
# 检查线上页面是否有未同步改动
node .agents/skills/publish-guard/scripts/publish-guard.js check --appType <appType> --formUuid <formUuid>

# 预览发布内容 diff
node .agents/skills/publish-guard/scripts/publish-guard.js diff --appType <appType> --formUuid <formUuid> --code <代码文件路径>
```

### 安全发布（检查 + 发布 + health check）

```bash
# 安全发布（有未同步改动时阻止）
node .agents/skills/publish-guard/scripts/publish-guard.js publish --appType <appType> --formUuid <formUuid> --code <代码文件路径>

# 强制覆盖（跳过未同步改动检查）
node .agents/skills/publish-guard/scripts/publish-guard.js publish --appType <appType> --formUuid <formUuid> --code <代码文件路径> --force
```

### 发布后 health check

```bash
# 单独执行 health check
node .agents/skills/publish-guard/scripts/publish-guard.js health --appType <appType> --formUuid <formUuid>
```

## 检查项

| # | 检查项 | 说明 | 阻断级别 |
|---|--------|------|---------|
| C1 | 线上页面是否存在 | 页面 UUID 是否有效 | 阻断（不存在则需先创建） |
| C2 | 线上 Schema 与本地缓存对比 | 线上是否有未同步改动 | 阻断（除非 `--force`） |
| C3 | 代码 diff 预览 | 本地代码与线上代码的差异摘要 | 警告（不阻断） |
| C4 | 发布后 health check | 页面可访问、非白屏/500 | 阻断（失败需回退） |
| C5 | 发布后回读核对 | 通过只读接口（get-form-config/getFormSchema 类）回读线上 Schema，核对本轮发布内容已真实落库（对照本轮改动标记，如新增函数名） | 阻断（回读不一致或未回读，不得汇报"已发布/已上线"） |

## 本地缓存机制

publish-guard 在 `.cache/publish-guard/` 目录维护本地发布状态缓存：

| 文件 | 说明 |
|------|------|
| `<formUuid>.json` | 最后一次发布/同步的 Schema 快照 |

- 每次成功发布后，自动更新本地缓存
- 每次 `check` 时，对比线上 Schema 与本地缓存
- 如果线上 Schema 与本地缓存不一致 → 线上有未同步改动

## 文件结构

```
.agents/skills/publish-guard/
├── SKILL.md                          ← 本文件
├── scripts/
│   └── publish-guard.js              ← 发布守卫核心脚本
└── references/
    └── publish-guard-guide.md        ← 发布守卫使用指南
```

## 异常处理

| 异常场景 | 处理方式 |
|---------|----------|
| 登录态过期 | 提示重新登录 |
| 页面不存在 | 提示先创建页面 |
| 线上有未同步改动 | 阻止发布，显示 diff 摘要，提示使用 `--force` |
| 发布失败 | 不更新缓存，提示错误信息 |
| health check 失败 | 警告页面可能异常，建议检查 |
| 回读与发布内容不一致 | 判定"假成功"，停止后续汇报，输出回读差异并排查（登录态/Schema 版本/接口缓存），修复后重新发布并再次回读 |

## 参考文档

- [发布守卫使用指南](references/publish-guard-guide.md)

## 版本历史

- **v1.1.0**（2026-09-28）：新增「发布后回读核对」环节（C5）— 严格要求新增回读条款、检查项新增 C5 行、流程图增加"回读核对（C5）"节点、异常处理新增"回读与发布内容不一致"判定为假成功的处理。health check 之后必须通过 get-form-config / getFormSchema 类只读接口核对本轮发布内容已真实落库，未回读或回读不一致不得汇报「已发布/已上线」。依据：OpenYida 借鉴改造清单 P0-2（官方 yida-publish-page 证据契约 + yida-openyida-publish-guard 发布后验证原义）。（此前候选轨初始版未设版本号，记为 v1.0.0）


## 2026-10-25 发布闭环

发布必须展示本次 diff；检查后线上再次变化则中止。Native 核对 source、compiled、函数注册表；Canvas 核对 runtimeCode 和 importedModules。只有回读一致才推进缓存。CLI 的 saved/verified 仅确认持久化；runtimeVerified=false、nextAction=in_app_browser_validation 表示仍需在宿主内置浏览器进行运行验收，不能声称页面已验收。health 可加 --code 指定本次源码；仅代码非空不再视为健康。
