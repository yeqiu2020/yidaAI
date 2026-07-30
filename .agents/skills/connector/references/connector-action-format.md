# 连接器执行动作配置文件格式

本文档详细说明宜搭连接器执行动作配置文件的格式规范。

## 字段说明

| 字段 | 说明 |
|------|------|
| `label` | 字段在宜搭界面上显示的"显示名称"，应根据接口文档含义填写中文名称 |
| `desc` | 字段的详细描述，用于 hover 提示 |
| `__level` | 字段层级，顶层字段填 `0` |
| `hidden` | 是否在界面上隐藏该字段，默认 `false` |

## inputs 分组规则

| 分组 | 说明 | 包含内容 |
|------|------|---------|
| `Headers` | 请求头参数 | `Content-Type` 等 |
| `Query` | URL 查询参数 | GET 接口的参数 |
| `Path` | 路径变量 | URL 中 `{variable}` 形式的参数 |
| `Body` | 请求体参数 | POST/PUT 接口的 JSON body |

### GET 接口处理规则

GET 接口没有 Body，所有业务参数放在 `Query` 分组中：
- `inputs` 只包含 `Headers` 和 `Query`
- `parameters` 只有 `header` 和 `query` 字段，无 `body`

## 完整的 JSON 格式示例

```json
[
  {
    "id": "operation-id",
    "operationId": "actionName",
    "summary": "动作名称",
    "description": "动作描述",
    "url": "v1.0/api/path",
    "method": "post",
    "inputs": [
      {
        "childList": [
          {
            "componentName": "TextField",
            "defaultValue": "application/json",
            "desc": "Content-Type",
            "name": "Content-Type",
            "required": false
          }
        ],
        "desc": "请求头",
        "name": "Headers",
        "paramType": "Object",
        "required": false
      },
      {
        "defaultValue": "{}",
        "desc": "请求体",
        "name": "Body",
        "paramType": "Object",
        "required": false,
        "childList": [
          {
            "componentName": "TextField",
            "name": "fieldName",
            "label": "字段显示名称",
            "desc": "字段含义描述",
            "required": true,
            "__level": 0,
            "hidden": false
          }
        ]
      }
    ],
    "parameters": {
      "header": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ],
      "body": {
        "default": "{}"
      }
    },
    "responses": {
      "type": "object",
      "properties": {
        "fieldName": { "type": "string", "description": "fieldName" }
      }
    },
    "outputs": [
      {
        "defaultValue": "{\n    \"fieldName\": \"value\"\n}",
        "desc": "响应体结构",
        "name": "Response",
        "paramType": "Object",
        "required": false,
        "childList": [
          {
            "_key": "actionName%fieldName",
            "name": "fieldName",
            "paramType": "String",
            "children": [],
            "childList": [],
            "__level": 0,
            "hidden": false,
            "label": "字段显示名称"
          }
        ]
      }
    ],
    "origin": true
  }
]
```

## 安全规则

- ✅ 动作配置不包含任何敏感凭证信息（凭证由连接器鉴权管理）
- ✅ 请求路径以 / 开头
- ✅ Content-Type 默认设为 application/json
- ✅ outputs 中 paramType 使用大写类型名（String/Number/Boolean）
- ✅ responses 中 type 使用小写类型名（string/number/boolean）
- ✅ 所有 inputs 字段都包含 __level 和 hidden 属性
- ✅ outputs childList 中 _key 格式为 operationId%fieldName
- ✅ GET 接口不包含 Body 分组
