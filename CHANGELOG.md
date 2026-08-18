# Changelog

## [3.0.0] - 2026-08-18

### 重磅升级

- **全局 npm 包发布**：`npm install -g yidaai` 一条命令安装
- **多工具自动适配**：安装后自动分发 skills 到 9+ 个 AI 工具目录
- **路径完全解耦**：消除所有硬编码路径，全局数据目录 `~/.yida-ai-helper/`
- **Cookie 全局化**：登录凭据一次写入，所有项目共享
- **CLI 命令体系**：`init` / `login` / `copy` / `start` / `stop` / `status` / `doctor` / `update` / `run` / `migrate`

### 新增命令

- `yida-helper init` — 项目骨架初始化（模板渲染 + 占位符替换）
- `yida-helper init --with-skills` — 初始化时复制 skills 到项目级
- `yida-helper login` / `logout` — 全局登录态管理
- `yida-helper copy` — skills 多工具重分发
- `yida-helper copy --project <路径>` — 项目级 skills 分发
- `yida-helper start` / `stop` / `status` — 本地服务管理
- `yida-helper doctor` — 环境体检
- `yida-helper update` — 自动更新检查
- `yida-helper run <脚本>` — 透传执行 skills 脚本
- `yida-helper migrate <旧项目>` — 老项目数据迁移

### 架构改造

- `lib/core/paths.js` — 统一路径解析模块
- `scripts/postinstall.js` — npm 安装后自动 skills 分发
- `templates/` — 模板目录（占位符替换）
- `.npmignore` — 发布包体积控制

### 安全

- 敏感信息审计：清理 storageState.json 等含真实凭据的文件
- 清理 skill-config.json 中的手机号
- 删除 12 张调试截图（integration skill）

### 别名

- `yida-helper` 和 `yidaazs` 均可使用

## [2.0.23] - 2026-08-14

- 40+ Skill 全量注册
- 集成自动化硬规则 16 条
- yida-consultant 诊断型 Skill
- 多 AI 工具规则同步

## [2.0.0] - 2026-07-01

- Skill 架构体系建立
- skill-config.json 索引登记
- 通用硬规则体系
