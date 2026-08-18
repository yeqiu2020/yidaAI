# yidaai

> 宜搭 AI 助手 — 一条命令安装、增量更新、多工具适配

## 安装

```bash
npm install -g yidaai
```

安装后会自动将 skills 分发到已安装的 AI 工具目录（Trae、Codex、Cursor、Claude、CodeBuddy、Qoder、ZCode、OpenCode 等）。

## 快速开始

```bash
# 1. 在项目目录初始化项目骨架
yida-helper init

# 2. 登录宜搭
yida-helper login

# 3. 启动本地服务（原型预览 + 配置同步）
yida-helper start

# 4. 环境体检
yida-helper doctor
```

## 命令一览

| 命令 | 说明 |
|------|------|
| `yida-helper init` | 在当前目录生成项目骨架（文档模板 + 规则文件） |
| `yida-helper init --with-skills` | 同上，额外复制 skills 到 `.agents/skills/` |
| `yida-helper login` | 扫码登录宜搭，凭据写入全局目录 |
| `yida-helper logout` | 清除登录凭据 |
| `yida-helper copy` | 将 skills 分发到所有已安装的 AI 工具 |
| `yida-helper copy --tool cursor` | 仅分发到指定工具 |
| `yida-helper copy --project <路径>` | 分发到项目级 `.agents/skills/` |
| `yida-helper start` | 启动本地 HTTP 服务 |
| `yida-helper stop` | 停止本地服务 |
| `yida-helper status` | 查看服务状态 |
| `yida-helper doctor` | 环境体检（Node、登录态、端口、skills 分发状态） |
| `yida-helper update` | 检查并更新到最新版 |
| `yida-helper run <脚本路径>` | 透传执行 skills 内的脚本 |
| `yida-helper migrate <旧项目>` | 迁移老项目数据到新目录 |
| `yida-helper version` | 打印版本号 |
| `yida-helper help` | 打印帮助 |

## 别名

`yida-helper` 也可用 `yidaazs` 代替。

## 环境要求

- Node.js >= 18
- npm >= 9

## Skills 能力一览

本包内置 40+ 宜搭低代码开发技能，涵盖：

- **表单创建**：从零创建表单、设计字段结构
- **流程配置**：审批流程、条件分支、字段权限
- **公式生成**：60+ 内置函数、marks 精确定位
- **集成自动化**：逻辑流创建/体检/回读（含 16 条硬规则门禁）
- **业务规则**：跨表 INSERT/UPDATE/DELETE/UPSERT
- **自定义页面**：Code Canvas / 原生 JSX / 大屏 / 看板
- **报表统计**：16 种图表 + ECharts 高级可视化
- **数据管理**：表单实例 CRUD、流程实例管理
- **连接器**：HTTP 连接器创建与鉴权管理
- **诊断修复**：yida-consultant 大管家问题诊断

## 多工具适配

安装后自动探测并分发到以下工具的全局 skills 目录：

| 工具 | 目录 |
|------|------|
| Trae (国际版) | `~/.trae-cn/skills/<skill>/`（拍平，无套壳） |
| Trae CLI | `~/.traecli/skills/yidaai/` |
| Codex | `~/.codex/skills/yidaai/` |
| OpenCode | `~/.config/opencode/skills/yidaai/` |
| CodeBuddy | `~/.codebuddy/skills/yidaai/` |
| Qoder | `~/.qoder/skills/yidaai/` |
| Qoder (国内版) | `~/.qoder-cn/skills/yidaai/` |
| ZCode | `~/.zcode/skills/yidaai/` |
| Claude Code | `~/.claude/skills/yidaai/` |
| Cursor | `~/.cursor/skills/yidaai/` |

## License

MIT
