# code-expert 知识库索引

> 快速定位所需文档的导航页
> 版本：v1.3.0

---

## ⚡ 跨表查询场景速查（A/B/C/D）—— 先选场景再写码！

> 跨表查询翻车的根因：把所有API当作“同一种返回结构”处理。先按下表确定场景，再选对应API/数据源/模板。

| 场景 | 你要什么 | API | 数据源 | 模板/文档 |
|------|---------|-----|-------|---------|
| **A** 查主表列表 | 满足条件的多条主表记录 | `searchFormDatas` | 1个 | `form-action-template.js` + `cross-form-query.md` §六 |
| **B** 按ID查主表 | 已知实例ID的主表字段 | `getFormDataById` | 1个 | `cross-form-query.md` §1.2 |
| **C** 查主表+子表 ⭐ | 完整记录（主表+子表明细） | `getFormDataById` + `listTableData` | **2个** | **`cross-form-query-template.js`** + `cross-form-query.md` §六点五 |
| **D** 只查子表 | 已知实例ID的子表明细 | `listTableData` | 1个 | `cross-form-query.md` §1.3 |

### API 返回格式速查表（⚠️ 每个API结构不同，不能用同一套逻辑！）

| API | 成功判断 | 数据位置 | ⚠️ 踩坑点 |
|-----|---------|---------|---------|
| `searchFormDatas` | `checkApiSuccess(res)` | `res.result.data` | — |
| `getFormDataById` | `res.serialNo` 存在 | `res.serialNo` / `res.instValue` | ❌不能用`checkApiSuccess`；❌不返回子表 |
| `listTableData` | `res.data` 是数组 | `res.data`（顶层） | ❌不在`res.result.data`；关联字段带`_id`后缀 |
| `saveFormData` | `typeof res === 'string'` | 返回值本身即实例ID | — |
| `updateFormData` | `res === null` | 无数据返回 | 参数名是`updateFormDataJson` |
| `deleteFormData` | `res === null` | 无数据返回 | — |

> 工具函数：`assets/templates/api-response-utils.js`（`extractFormDataByIdResult` / `extractListTableDataResult` / `getAssociationValue` / `callDataSourceWithCheck`）

---

## 🎯 快速导航

### 按需求类型查找

#### 📝 我需要生成代码

| 需求场景 | 查阅文档 | 模板文件 |
|---------|---------|---------|
| 表单字段联动 | `references/form-actions/spec.md` | `assets/templates/form-action-template.js` |
| 子表数据处理 | `references/form-actions/spec.md` → 三、子表处理 | `assets/templates/form-action-template.js` |
| 跨表单数据查询 | `references/form-actions/cross-form-query.md` | `assets/templates/form-action-template.js` |
| 数据校验规则 | `references/form-validation/spec.md` | `assets/templates/field-validation-template.js` |
| 自动化流程脚本 | `references/automation-scripts/spec.md` | `assets/templates/automation-template.js` |
| 自定义页面（JSX/renderJsx） | ⚠️ **不在本 Skill，请用独立 `custom-page` Skill** | — |
| 不知道用什么 API | `references/common-core/api-reference.md` | - |

#### 🔧 我遇到了错误

| 错误现象 | 可能原因 | 解决方案 |
|---------|---------|---------|
| **setValue is not a function** | UI 时序问题 | `references/common-core/error-guide.md` → 一、时序问题 |
| **编辑保存报错"参数校验失败 updateFormDataJson"** | API 参数名错误 | `references/common-core/error-guide.md` → 二、API 参数错误 |
| **删除时报错"未知的数据源"** | rowData.formUuid 是对象 | `references/common-core/error-guide.md` → 三、删除 API 错误 |
| **勾选表格行没反应** | 行选择器函数签名错误 | ⚠️ 自定义页面问题，请查独立 `custom-page` Skill |
| **子表操作后页面卡死** | 死循环（setValue 触发 onChange） | `references/form-actions/spec.md` → 三、子表防死循环 |
| **弹窗字段填充失败** | DOM 未渲染完成 | `references/common-core/error-guide.md` → 一、时序问题 |
| **this.$ is not a function** | 嵌套函数中 this 指向错误 | `references/common-core/error-guide.md` → 四、this 指向 |
| **自动化脚本报错"const is not defined"** | 使用了 ES6 语法 | `references/automation-scripts/spec.md` → 一、ES5 限制 |

#### 📚 我需要了解规范

| 查阅内容 | 文档位置 |
|---------|---------|
| 各场景语法支持（ES5/ES6+） | `references/common-core/syntax-guide.md` |
| API 使用规范（前端 this.* / utils / 钉钉JSAPI） | `references/common-core/api-reference.md` |
| 组件数据结构（getValue/setValue 格式） | `references/common-core/data-structures.md` |
| **HTTP OpenAPI（表单/流程/任务中心 + 写入/搜索格式附录）** | `references/common-core/open-api-reference.md` |
| 常见 API 错误案例 | `references/common-core/error-guide.md` |
| **官方文档权威链接（本地缺口时联网查）** | `references/official-docs.md` |
| 代码类型分类 | `SKILL.md` → 第一步：场景分类 |

---

## 📂 完整文档结构

### 公共基础文档（所有场景必读）

| 文档 | 说明 | 必读场景 |
|------|------|---------|
| `syntax-guide.md` | 各场景语法支持说明（ES5/ES6+） | 全部 |
| `api-reference.md` | 完整 API 字典（前端 this.* / utils / 状态 / 钉钉JSAPI） | 全部 |
| `data-structures.md` | 组件数据结构参考（getValue/setValue 值格式） | 全部 |
| `open-api-reference.md` | HTTP OpenAPI 接口清单 + formDataJson/searchFieldJson 格式附录 | 跨表增删改查、远程数据源 |
| `error-guide.md` | 常见 API 错误案例（10 大必读坑） | 全部 |

> 📎 外部文献：`references/official-docs.md` 保存宜搭官方 4 大文档（yidaAPI/openAPI/dingAPI/serverAPI）权威链接，本地缺口时可让 AI 临时联网查询。

### 场景专属文档

#### 表单动作代码 [FORM_ACTION]

| 文档 | 说明 |
|------|------|
| `form-actions/spec.md` | 动作专属规范（含子表防死循环、UI 时序） |
| `form-actions/cross-form-query.md` | 跨表查询专题（分页、API 参数、兼容处理） |
| `form-actions/cases.md` | 动作专属案例 |

#### 字段校验代码 [VALIDATION]

| 文档 | 说明 |
|------|------|
| `form-validation/spec.md` | 校验专属规范 |
| `form-validation/regex-lib.md` | 常用正则表达式库 |

#### 自动化脚本 [AUTOMATION]

| 文档 | 说明 |
|------|------|
| `automation-scripts/spec.md` | 脚本专属规范（**ES5 强制**） |
| `automation-scripts/cases.md` | 脚本专属案例 |

#### 自定义页面 [CUSTOM_PAGE]

> ⚠️ **自定义页面代码不在本 Skill 范围内**，已独立为 `custom-page` Skill（`export function renderJsx()` 模式 + Babel 编译 + 自动发布）。需开发自定义页面时请直接触发 `custom-page` Skill，本 Skill 不再维护相关文档与模板。

---

## 🔍 快速检索关键词

### 触发 Skill 的关键词

- **动作代码**：按钮点击、字段联动、子表汇总、提交前校验
- **校验规则**：手机号、身份证、邮箱、格式验证
- **自动化脚本**：流程节点、定时任务、数据处理
- **自定义页面**：列表页面、数据展示、React 组件

### 常见错误关键词

- `setValue is not a function` → 时序问题
- `updateFormDataJson` → API 参数错误
- `this.$ is not a function` → this 指向问题
- `const is not defined` → ES5 语法错误
- `页面卡死/浏览器崩溃` → 子表死循环

---

## 💡 使用建议

1. **先分类场景**：根据需求确定是哪种代码类型（表单动作/校验/自动化/自定义页面）
2. **查阅规范**：阅读对应场景的 `spec.md` 了解规范
3. **使用模板**：从 `assets/templates/` 复制对应模板
4. **检查错误**：遇到问题时查阅 `error-guide.md` 和对应场景的 `pitfalls.md`

---

*文档版本：v1.3.0*
