# code-expert 知识库索引

> 快速定位所需文档的导航页
> 版本：v1.0.0

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
| 自定义页面 | `references/custom-pages/spec.md` | `assets/templates/custom-page-template.js` |
| 不知道用什么 API | `references/common-core/api-reference.md` | - |

#### 🔧 我遇到了错误

| 错误现象 | 可能原因 | 解决方案 |
|---------|---------|---------|
| **setValue is not a function** | UI 时序问题 | `references/common-core/error-guide.md` → 一、时序问题 |
| **编辑保存报错"参数校验失败 updateFormDataJson"** | API 参数名错误 | `references/common-core/error-guide.md` → 二、API 参数错误 |
| **删除时报错"未知的数据源"** | rowData.formUuid 是对象 | `references/common-core/error-guide.md` → 三、删除 API 错误 |
| **勾选表格行没反应** | 行选择器函数签名错误 | `references/custom-pages/pitfalls.md` → 行选择器绑定 |
| **子表操作后页面卡死** | 死循环（setValue 触发 onChange） | `references/form-actions/spec.md` → 三、子表防死循环 |
| **弹窗字段填充失败** | DOM 未渲染完成 | `references/common-core/error-guide.md` → 一、时序问题 |
| **this.$ is not a function** | 嵌套函数中 this 指向错误 | `references/common-core/error-guide.md` → 四、this 指向 |
| **自动化脚本报错"const is not defined"** | 使用了 ES6 语法 | `references/automation-scripts/spec.md` → 一、ES5 限制 |

#### 📚 我需要了解规范

| 查阅内容 | 文档位置 |
|---------|---------|
| 各场景语法支持（ES5/ES6+） | `references/common-core/syntax-guide.md` |
| API 使用规范 | `references/common-core/api-reference.md` |
| 组件数据结构（getValue/setValue 格式） | `references/common-core/data-structures.md` |
| 常见 API 错误案例 | `references/common-core/error-guide.md` |
| 代码类型分类 | `SKILL.md` → 第一步：场景分类 |

---

## 📂 完整文档结构

### 公共基础文档（所有场景必读）

| 文档 | 说明 | 必读场景 |
|------|------|---------|
| `syntax-guide.md` | 各场景语法支持说明（ES5/ES6+） | 全部 |
| `api-reference.md` | 完整 API 字典 | 全部 |
| `data-structures.md` | 组件数据结构参考 | 全部 |
| `error-guide.md` | 常见 API 错误案例（10 大必读坑） | 全部 |

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

| 文档 | 说明 |
|------|------|
| `custom-pages/spec.md` | 页面专属规范 |
| `custom-pages/pitfalls.md` | 页面专属坑点（行选择器、弹窗、数据格式） |

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

*文档版本：v1.0.0*
