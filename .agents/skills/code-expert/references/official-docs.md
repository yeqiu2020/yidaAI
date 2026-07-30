# 宜搭官方开发文档索引（外部文献资料）

> 本文件保存宜搭官方开发文档的权威链接，供 AI 在本地知识库不够完整时**临时联网查询**。
> 版本: v1.0.0
> 维护: 当官方文档更新、或本地知识库发现缺口时，回填到对应本地文件并在此登记。

***

## 一、四大官方文档速查

| 文档 | 官方链接 | 覆盖内容 | 本地对应文件 |
| ---- | ---- | ---- | ---- |
| **宜搭 JS-API**（前端） | https://docs.aliwork.com/docs/developer/api/yidaAPI | JS 面板可直接调用的 API：`this.$()`、组件读写、`dataSourceMap`、`this.state/setState`、`utils.*`、`router.*`、Dialog | `common-core/api-reference.md` |
| **跨应用数据源 API**（OpenAPI） | https://docs.aliwork.com/docs/developer/api/openAPI | 内置 HTTP 接口：表单增删改查、流程、任务中心 + 数据格式附录 | `common-core/open-api-reference.md` |
| **钉钉 JS-API** | https://docs.aliwork.com/docs/developer/api/dingAPI | 端内能力：`window.dd` 原生弹框/设备/扫码等；需 `loadScript` 引入 + `isDingTalk` 判断 | `common-core/api-reference.md` §钉钉 JSAPI |
| **服务端开放 API** | https://docs.aliwork.com/docs/developer/api/serverAPI | 服务端（access_token 鉴权）调用的流程/表单/任务/附件接口，供 FaaS、自建服务、连接器使用 | 暂无本地文件（本索引直接引用） |

***

## 二、何时查官方（决策指引）

1. **本地文件已覆盖** → 直接用本地（`api-reference.md` / `open-api-reference.md` / `data-structures.md`），它们含实战踩坑修正，优先级高于官方原文。
2. **本地找不到某接口/参数** → 按上表定位到对应官方链接联网查询。
3. **官方与本地冲突** → 以本地"实战验证结论"为准（尤其 `getFormDataById` 扁平对象、`listTableData` 顶层 `res.data` + `_id` 后缀），因为官方原文描述的是"原始 HTTP 返回"，宜搭 `dataSourceMap` 会做一层解包，实际 resolve 结构不同。
4. **免登/服务端场景** → Open API 需鉴权，免登页无法直接调用；服务端能力查 serverAPI（access_token）。

***

## 三、四个文档的关键差异（避免混淆）

| 维度 | yidaAPI | openAPI | dingAPI | serverAPI |
| ---- | ---- | ---- | ---- | ---- |
| 运行位置 | 浏览器（页面内） | 浏览器（走宜搭代理转发） | 浏览器（钉钉端内） | 服务端 |
| 调用方式 | `this.xxx` | `this.dataSourceMap.xxx.load()` 或 fetch | `window.dd.xxx` | HTTP + access_token |
| 鉴权 | 免登（页面态） | 需登录态，免登页不可用 | 端内自动 | access_token |
| 典型用途 | 组件读写、页面交互 | 跨表增删改查、流程操作 | 扫码、端内弹框、设备能力 | 后端集成、定时任务、连接器 |

***

*文档版本: v1.0.0 ｜ 登记于 2026-07-24*
