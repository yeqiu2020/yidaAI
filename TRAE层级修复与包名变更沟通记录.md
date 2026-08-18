# TRAE 全局分发层级修复与包名变更沟通记录

> **沟通记录编号**：GZZX-20260818-0002
> **记录时间**：2026-08-18
> **发起方**：验收 AI
> **接收方**：执行 AI
> **关联文档**：`GitHub发布与命令行安装改造方案.md` 第 2.3/5.3/5.5 节、`阶段四至六修复报告.md`、官方文档 docs.trae.cn/ide_skills

---

## 一、沟通记录索引

| 沟通记录编号 | 摘要 |
|------------|------|
| GZZX-20260818-0002 | 用户空目录探针实测失败，验收 AI 定位根因为 TRAE 全局 skills 只识别一层结构而当前分发为两层套壳；同时用户拍板 npm 包名改为 yidaai（已核实可注册）。要求执行 AI 完成拍平分发改造 + 包名变更两项修复后复核 |

---

## 二、问题 1（P0）：TRAE 全局 skills 目录分发层级错误

### 2.1 现象（用户实测）

1. 在源码项目目录内输入"测试自定义Skill" → 返回"自定义 Skill 加载成功" ✅（但加载的是**项目级** `.agents/skills/`，非全局目录）
2. 在空目录 `c:\Users\Administrator\Desktop\新建文件夹` 输入"测试自定义Skill" → 返回"**当前工作目录是空目录，没有找到任何 Skill 相关的文件**" ❌

### 2.2 根因（已 100% 确认）

**TRAE 全局 skills 目录只识别一层结构，当前分发套了两层壳，导致整个目录被 TRAE 忽略。**

官方文档（docs.trae.cn/ide_skills）定义的结构：

```text
%userprofile%\.trae-cn\skills\
└── <技能名>\            ← 每个 skill 直接放在 skills 下（一层）
    └── SKILL.md
```

当前 postinstall.js / copy.js 实际分发的结构（FOLDER_NAME='yida-ai-helper' 套壳）：

```text
C:\Users\Administrator\.trae-cn\skills\
└── yida-ai-helper\      ← TRAE 把这一层当成"一个技能"
    ├── hello-world-custom\SKILL.md   ← 但它下面没有直接的 SKILL.md
    └── ...（45 个 skill）
```

TRAE 扫描时把 `yida-ai-helper` 当作技能名，发现其内部无 `SKILL.md`，整个目录被忽略。

**旁证**：C 盘 skills 目录下已存在的一层副本（`form_creator/`、`server-manager/`、`org-init/`、`form-to-prototype/`，用户此前手动复制）正是 TRAE 能识别的格式。

**注**：OpenYida 官方用两层套壳（`skills/yida-skills/`）分发给 Claude Code/Codex 是成功先例，说明**两层结构并非所有工具都不认**，仅 TRAE 实测不识别。其他 8 个工具保持两层不动，待用户逐个探针实测后再定。

### 2.3 修复要求

#### A. `trae-cn` 改为拍平（一层）分发

修改 [scripts/postinstall.js](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/scripts/postinstall.js) 与 [lib/cli/copy.js](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/lib/cli/copy.js)（两处逻辑需保持一致，建议抽公共函数或在两文件同步改）：

1. 映射表 `trae-cn` 条目增加 `flatten: true` 标记
2. flatten 模式下：把 `skillsSource()` 下的**每个 skill 目录**直接复制到 `~\.trae-cn\skills\<skill名>\`（不再套 FOLDER_NAME 外壳）
3. **碰撞保护**：目标 `~\.trae-cn\skills\<skill名>` 已存在且不在本次托管清单（manifest）内时，**默认跳过并在输出中警告**（可能是用户自己的 skill 或历史手动副本），严禁静默覆盖
4. 新增 `--force` 参数（仅 copy 命令）：碰撞时强制覆盖（用于本机一次性清理历史手动副本）

#### B. manifest 托管清单（升级清理依据）

1. 拍平分发完成后，在 `~\.trae-cn\skills\` 写入 `.yidaai-manifest.json`，记录本次复制的全部 skill 目录名
2. 下次分发前：读取 manifest → 先删除清单内已不存在的旧目录 → 再复制新集合 → 重写 manifest
3. 保证升级/卸载不留脏数据，且绝不触碰非托管目录

#### C. 清理本机失效的旧两层壳

修复后执行一次清理（可并入 cleanupLegacy 或手动）：

```powershell
# 删除 9 个工具目录下的旧两层壳
Remove-Item -Recurse -Force "$env:USERPROFILE\.trae-cn\skills\yida-ai-helper" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\skills\yida-ai-helper" -ErrorAction SilentlyContinue
# ... 其余 7 个工具同理（claude/cursor/opencode/codebuddy/qoder/qoder-cn/zcode）
```

同时 cleanupLegacy 的 `legacyNames` 数组加入 `'yida-ai-helper'`（若 FOLDER_NAME 改名，见问题 2）。

#### D. 本机历史一层副本处理

C 盘 `~\.trae-cn\skills\` 下已有 4 个用户此前手动复制的一层副本（`form_creator/`、`server-manager/`、`org-init/`、`form-to-prototype/`），内容为旧版。修复完成后在本机跑一次 `yida-helper copy --tool trae-cn --force`，用包内最新版覆盖这 4 个目录（它们与包内 skill 同名，属同一来源的历史副本）。

#### E. doctor.js 同步适配

[lib/cli/doctor.js](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/lib/cli/doctor.js) 第 41 行 `FOLDER_NAME` 检测逻辑：trae-cn 工具改为检测拍平后的形态（建议检测 `.yidaai-manifest.json` 存在 + 抽查 1 个 skill 目录），其余工具维持 FOLDER_NAME 检测。

#### F. 文档回填

1. 方案文档 5.3 矩阵 TRAE 行状态列改为：**"一层结构已实测识别（2026-08-18），两层套壳不识别"**
2. 5.5 探针法补充说明 TRAE 层级要求
3. README 多工具支持表 TRAE 行路径改为 `~/.trae-cn/skills/<skill>/（拍平）`
4. 此坑记入项目经验文档（规则 2：错误与文档对比后记录）

### 2.4 验收标准（复核用）

- [ ] `yida-helper copy --tool trae-cn` 后，`~\.trae-cn\skills\` 下**无** `yida-ai-helper` 套壳目录，45 个 skill 直接以一层结构存在
- [ ] `.yidaai-manifest.json` 生成且内容正确
- [ ] 手工在 `~\.trae-cn\skills\` 造一个假目录（如 `my-own-skill/SKILL.md`）→ 再跑 copy → 该目录未被删除未被覆盖（碰撞保护生效）
- [ ] `--force` 模式可覆盖同名碰撞目录
- [ ] 其余 8 个工具仍为两层结构（回归不受影响）
- [ ] doctor 对 trae-cn 显示已分发（新检测逻辑）
- [ ] 用户在空目录实测"测试自定义Skill"返回加载成功（最终闭环，用户执行）

---

## 三、问题 2（P0）：npm 包名变更 yida-ai-helper → yidaai

### 3.1 用户决策

用户拍板：发包名称使用 **`yidaai`**（全小写，npm 规范不允许大写）。

已核实：`npm view yidaai` 返回 404（未被占用，可注册）。

### 3.2 变更范围（包身份相关，P0 必改）

| 文件 | 位置 | 改法 |
|------|------|------|
| [package.json](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/package.json) | 第 2 行 `"name"` | `"yida-ai-helper"` → `"yidaai"` |
| [README.md](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/README.md) | 第 1 行标题、第 8 行安装命令、全文 `yida-ai-helper` 包名引用 | `npm install -g yidaai` |
| [CHANGELOG.md](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/CHANGELOG.md) | 第 7 行安装命令 | 同上 |
| [lib/cli/update.js](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/lib/cli/update.js) | 第 17 行 `PACKAGE_NAME` | `'yidaai'` |
| [lib/cli/doctor.js](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/lib/cli/doctor.js) | 第 193 行 `fetchLatestVersion(...)`、第 199 行可更新提示命令 | `'yidaai'` |
| [从V2x迁移到V3x命令行模式.md](file:///d:/宜搭AI助手直播/宜搭AI助手V2.0.23/从V2x迁移到V3x命令行模式.md) | 安装命令 `npm install -g yida-ai-helper` | `yidaai` |
| publish.yml / 方案文档 / 阶段报告中出现的安装命令 | 全文 | `yidaai` |

### 3.3 关联决策（保持不变，避免扩大改动面）

| 项 | 决策 | 理由 |
|----|------|------|
| 命令名 `yida-helper` / `yidaazs`（bin 双键） | **不改** | 用户已习惯，包名与命令名本就可不同 |
| 全局数据目录 `~/.yida-ai-helper/`（Cookie/config） | **不改** | 内部路径非用户输入项；改它需连带 6 个 skill 脚本内联引用 + 规则26 + paths.js，风险大于收益 |
| 工具 skills 套壳 `FOLDER_NAME` | **改为 `yidaai`**，legacyNames 增加 `'yida-ai-helper'` | README 表与新包名一致；cleanupLegacy 已有机制承接改名清理 |
| 包版本号 | 维持 `3.0.0` | 发布前首版 |

### 3.4 验收标准（复核用）

- [ ] `node bin/cli.js version` 输出 3.0.0（回归）
- [ ] `npm pack --dry-run` 生成的 tarball 文件名为 `yidaai-3.0.0.tgz`
- [ ] Grep 全库（排除 node_modules/temp-file）`install -g yida-ai-helper` 零命中（文档安装命令全部更新）
- [ ] `lib/cli/update.js` 与 `doctor.js` 的 registry 查询指向 `yidaai`
- [ ] 各工具目录旧 `yida-ai-helper` 套壳被 cleanupLegacy 清理，新套壳为 `yidaai`（trae-cn 为拍平无套壳）
- [ ] `~/.yida-ai-helper/` 全局数据目录不受影响（Cookie 路径不变）

---

## 四、执行顺序建议

1. 先做问题 2 包名变更（半小时级，独立无依赖）
2. 再做问题 1 拍平改造（含 manifest/碰撞保护/doctor 适配）
3. 本机执行：`node bin/cli.js copy --force`（全量刷新 + 清理旧壳 + 覆盖 4 个历史一层副本）
4. 回贴证据：`Get-ChildItem ~\.trae-cn\skills\` 目录列表 + manifest 内容 + 假目录碰撞测试输出 + tarball 文件名
5. 验收 AI 复核通过后，通知用户在空目录重测探针（最终闭环）

---

## 五、遗留提醒（非本次范围）

- 其他 8 个工具的两层结构是否被识别，仍待用户逐个探针实测（5.3 矩阵状态列除 TRAE 外仍为"待实测"）；若同样失败，按本次拍平方案 + manifest 机制逐工具扩展
- 登录链路验证（用户尚未执行 `login`）与探针实测可并行推进
