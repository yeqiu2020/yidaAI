# 宜搭 OpenAPI（HTTP 远程数据源）完整参考

> 宜搭平台内置的远程 HTTP 接口速查（表单 / 流程 / 任务中心 + 数据格式附录）
> 版本: v1.0.0
> 来源: https://docs.aliwork.com/docs/developer/api/openAPI （官方原文）
> 用途: 配置远程数据源 + 编写 dataSourceMap 调用代码时对照接口路径、参数、返回结构

***

## 零、本文件与 data-structures.md 的分工（重要！）

| 文件 | 覆盖内容 | 使用场景 |
| ---- | ---- | ---- |
| `data-structures.md` | **前端** `this.$(id).getValue()` / `setValue()` 的值格式 | 表单动作里读写组件 |
| **本文件（附录1/2）** | **HTTP 接口** `formDataJson` / `searchFieldJson` 的字符串格式 | 调 saveFormData / searchFormDatas 等远程 API |

⚠️ **两套格式不同！** 例如成员字段：
- 前端 `setValue` 需 `[{value,label,key}]`；
- HTTP `formDataJson` 只需 `["工号"]`（字符串数组）。
混用会导致"提交成功但字段为空"或报错。

***

## 一、调用说明

### 1.1 请求路径

```bash
# 应用编码可在「应用设置 → 部署运维」查看
# 宜搭平台内编写请求代码请用相对路径，避免二级域名变更导致失效
/dingtalk/web/${应用编码}/${接口路径}

# 示例
/dingtalk/web/APP_X1X2X3X4/v1/form/searchFormDatas.json
```

### 1.2 统一返回结构（IResponse）

```typescript
interface IResponse {
  success: boolean;              // 请求是否成功
  result?: object | array | string; // 成功的返回内容
  errorMsg?: string;             // 错误信息
  errorCode?: string;            // 错误码
  errorLevel?: number;           // 错误级别
}
```

> ⚠️ **鉴权限制**：免登页面无法直接使用远程 Open API（需鉴权），可通过 FaaS 或自建服务中转调用。

> ⚠️ **dataSourceMap 与原始返回的差异**：在表单动作中通过 `this.dataSourceMap.xxx.load()` 调用时，实际 resolve 的结构与上表的"原始 HTTP 返回"可能不同（宜搭会做一层解包）。已验证的实战差异（务必以此为准）见 `form-actions/cross-form-query.md` §1.1~§1.3：
> - `searchFormDatas` → 取 `res.result.data`
> - `getFormDataById` → 扁平对象，判 `res.serialNo`，**不能**用 checkApiSuccess
> - `listTableDataByFormInstIdAndTableId` → 取 `res.data`（顶层），关联字段带 `_id` 后缀

***

## 二、表单相关 API

| # | 接口说明 | 路径（/v1/form/…） | 方法 | 关键参数 | 成功返回 |
| - | ---- | ---- | ---- | ---- | ---- |
| 1 | 新建表单实例 | `saveFormData.json` | POST | formUuid, appType, formDataJson | `result: "FINST-xxx"` |
| 2 | 更新表单指定组件值 | `updateFormData.json` | POST | formInstId, updateFormDataJson, useLatestVersion? | `{success:true}` |
| 3 | 删除表单实例 | `deleteFormData.json` | POST | formInstId | `{success:true}` |
| 4 | 按实例ID查详情 | `getFormDataById.json` | GET | formInstId | `{success, result:{详情}}` |
| 5 | 按条件搜实例ID列表 | `searchFormDataIds.json` | GET | formUuid, searchFieldJson, currentPage, pageSize | `result:{data:[ids], totalCount, currentPage}` |
| 6 | 按条件搜实例详情列表 | `searchFormDatas.json` | GET | formUuid, searchFieldJson, currentPage, pageSize | `result:{data:[...], totalCount, currentPage}` |
| 7 | 获取表单定义 | `getFormComponentDefinationList.json` | GET | formUuid, version? | `{success, content:[{label,key}]}` |
| 8 | 获取子表单数据 | `listTableDataByFormInstIdAndTableId.json` | GET | formUuid, formInstanceId, tableFieldId, currentPage, pageSize | `result:{data:[...], totalCount, currentPage}` |

### 2.1 参数细节与坑点

- **formDataJson / updateFormDataJson** 必须 `JSON.stringify()` 序列化，格式见 **附录一**。
- **searchFieldJson** 格式见 **附录二**（与写入格式不同！）。
- **pageSize 上限**：searchFormDatas/searchFormDataIds ≤ **100**（默认 10）；listTableData ≤ **50**（默认 10）。
- **updateFormData**：只更新传入的组件，未传的保持不变；子表只能整表更新，无法只改子表某一行的某个组件。`useLatestVersion=y` 使用最新表单版本更新。
- **getFormComponentDefinationList**：官方公告自 2024-12-01 起该接口仅管理员可调用。
- **权限**：`searchFormDatas` 受页面权限控制（管理员除外）。

### 2.2 时间范围查询参数（searchFormDatas / searchFormDataIds 通用）

| 参数 | 说明 | 格式 |
| ---- | ---- | ---- |
| originatorId | 按提交人工号查询 | 字符串 |
| createFrom / createTo | 按创建时间段查询 | `yyyy-MM-DD`（searchFormDatas 支持精确到秒 `yyyy-MM-DD HH:mm:ss`） |
| modifiedFrom / modifiedTo | 按修改时间段查询 | 同上 |
| dynamicOrder | 排序 | `{"numberField_1ac":"+"}` 表示按该字段升序，`"-"` 降序 |

***

## 三、流程相关 API

| # | 接口说明 | 路径 | 方法 | 关键参数 | 成功返回 |
| - | ---- | ---- | ---- | ---- | ---- |
| 1 | 发起流程 | `/v1/process/startInstance.json` | POST | processCode, formUuid, formDataJson, deptId? | `result: 流程实例ID` |
| 2 | 按条件搜流程实例ID | `/v1/process/getInstanceIds.json` | GET | formUuid, searchFieldJson, instanceStatus?, approvedResult?, currentPage, pageSize | `result:{data:[ids], totalCount, currentPage}` |
| 3 | 按条件搜流程实例详情 | `/v1/process/getInstances.json` | GET | 同上 | `result:{data:[...], totalCount, currentPage}` |
| 4 | 按实例ID查流程详情 | `/v1/process/getInstanceById.json` | GET | processInstanceId | `{success, result:{详情}}` |
| 5 | 删除流程实例 | `/v1/process/deleteInstance.json` | POST | processInstanceId | `{success:true}` |
| 6 | 终止流程实例 | `/v1/process/terminateInstance.json` | POST | processInstanceId | `{success:true}` |
| 7 | 更新流程实例数据 | `/v1/process/updateInstance.json` | POST | processInstanceId, updateFormDataJson | `{success:true}` |
| 8 | 执行单个审批任务 | `/v1/task/executeTask.json` | POST | taskId, procInstId, outResult, remark, formDataJson?, noExecuteExpressions? | `{success}` |
| 9 | 获取审批记录 | `/v1/process/getOperationRecords.json` | GET | processInstanceId | `{success, content:[操作记录]}` |

### 3.1 关键枚举值

- **instanceStatus**：`RUNNING`（运行中）/ `TERMINATED`（已终止）/ `COMPLETED`（已完成）/ `ERROR`（异常）
- **approvedResult**：`agree`（同意）/ `disagree`（拒绝）
- **outResult**（executeTask）：`AGREE`（同意）/ `DISAGREE`（不同意）
- **noExecuteExpressions**（executeTask）：`y` 不执行校验规则&关联操作 / `n`（默认）执行

> ⚠️ 流程需配置"实例可查看权限"，getInstanceIds/getInstances 才能查到数据（管理员除外）。

***

## 四、任务中心相关 API

| # | 接口说明 | 路径 | 方法 | 关键参数 |
| - | ---- | ---- | ---- | ---- |
| 1 | 我已提交（应用维度） | `/v1/process/getMySubmitInApp.json` | GET | pageSize, currentPage, keyword? |
| 2 | 我的待办（应用维度） | `/v1/task/getTodoTasksInApp.json` | GET | pageSize, currentPage, keyword? |
| 3 | 我的已办（应用维度） | `/v1/task/getDoneTasksInApp.json` | GET | pageSize, currentPage, keyword? |
| 4 | 抄送我的（应用维度） | `/v1/task/getNotifyMeTasksInApp.json` | GET | pageSize, currentPage, keyword?, processCodes?, instanceStatus? |

- pageSize 最大 **100**，默认 10；currentPage 默认 1。
- 返回结构统一：`result:{data:[任务对象], totalCount, currentPage}`；无权限时 `{success:false, errorCode:"TIANSHU_000006", errorMsg:"没有权限"}`。

***

## 五、附录一：保存/更新表单数据格式（formDataJson / updateFormDataJson）

> 用 `Map<String,Object>` 的 JSON 字符串，key 为组件ID，value 为组件值。**用于写入接口（saveFormData / updateFormData / startInstance）。**

| 组件类型 | 数据格式 | 示例 |
| ---- | ---- | ---- |
| 单行输入框 | 字符串 | `"danhang"` |
| 多行输入框 | 字符串 | `"duohang"` |
| 数字输入框 | 数字 | `1` |
| 单选 / 下拉单选 | 字符串 | `"选项一"` |
| 多选 / 下拉多选 | 字符串数组 | `["选项一","选项二"]` |
| 日期组件 | 时间戳（毫秒） | `1516636800000` |
| 级联日期（区间） | 字符串数组 | `["1514736000000","1517328000000"]`；仅结束时间 `["","1517328000000"]` |
| 人员搜索框 | 字符串数组（工号） | `["xxxxx","yyyyy"]` |
| 城市选择 | 字符串数组（ID） | `["110000","110100","110101"]`（省→市→区，省ID必填） |
| 部门选择 | 字符串数组（部门ID） | `["1123456"]` |
| 级联选择 | 字符串数组 | `["part","part_b"]`（按级联顺序） |
| 图片上传 | 对象数组 | `[{"downloadUrl":"...","name":"图.jpg"}]` |
| 附件组件 | 对象数组 | `[{"downloadUrl":"...","name":"a.txt"}]` |
| 超链接组件 | 对象数组 | `[{"link":"http://www.aliwork.com","text":"宜搭"}]` |
| 子表单 | 对象数组（JSONARRAY） | `[{"textField_x":"行1"},{"textField_x":"行2"}]` |
| 手写签名 | 字符串（图片地址） | `"https://.../x.png"` |

**完整示例（含子表）：**

```json
{
  "textField_jcr0069m": "danhang",
  "numberField_jcr0069o": 1,
  "radioField_jcr0069p": "选项一",
  "checkboxField_jcr0069r": ["选项二","选项三"],
  "dateField_jcr0069t": 1516636800000,
  "employeeField_jcr0069x": ["xxxxx"],
  "citySelectField_jcr0069y": ["110000","110100","110101"],
  "departmentField_jcr0069z": ["1123456"],
  "imageField_l096bb9l": [{"name":"图.jpg","downloadUrl":"https://.../a.jpg"}],
  "tableField_jcr006a1": [
    {
      "textField_jcr006a2": "子表单下单行",
      "numberField_jcr006a4": 2,
      "employeeField_jcr006ab": ["yyyyy","xxxxx"]
    }
  ]
}
```

***

## 六、附录二：条件搜索格式（searchFieldJson）

> ⚠️ **与附录一写入格式不同！** 用于 searchFormDatas / searchFormDataIds / getInstanceIds / getInstances。key 为组件ID，value 为搜索条件。

| 组件类型 | 数据格式 | 示例 | 匹配方式 |
| ---- | ---- | ---- | ---- |
| 单行 / 多行输入框 | 字符串 | `"danhang"` | 模糊搜索 |
| 数字输入框 | 字符串数组 | `["1","10"]` | 范围（最小,最大） |
| 单选 / 下拉单选 | 字符串 | `"选项一"` | 精确 |
| 多选 / 下拉多选 | 字符串数组 | `["选项二"]` | 数组子集匹配 |
| 日期组件 | 数组（时间戳） | `[1514736000000,1517414399000]` | 范围（开始,结束） |
| 日期区间 | 二维数组 | `[[开始范围],[结束范围]]` | 范围 |
| 人员搜索框 | 字符串数组 | `["xxxxx","yyyyy"]` | 精确，工号顺序须一致 |
| 城市选择 | 字符串数组 | `["110000","110100"]` | 子集，有市ID须有省ID |
| 部门选择 | 数字 | `1123456` | 精确 |
| 级联选择 | 字符串数组 | `["part","part_b"]` | 数组子集 |
| 子表单组件 | 字符串 | `"danhang"` | 模糊（子表值为大text） |

**在代码中的用法（配合 dataSourceMap）：**

```javascript
// 搜索：单行模糊 + 数字范围 + 人员精确
var searchFieldJson = JSON.stringify({
  textField_name: '张',              // 模糊
  numberField_amount: ['1', '1000'], // 范围
  employeeField_owner: ['0249654712697493'] // 精确
});
this.dataSourceMap.searchData.load({
  formUuid: 'FORM-XXX',
  searchFieldJson: searchFieldJson,
  currentPage: 1,
  pageSize: 100
});
```

***

## 七、附录三：实例详情对象格式

### 7.1 表单实例详情（getFormDataById.result）

| 字段 | 说明 |
| ---- | ---- |
| gmtModified | 最后修改时间 |
| formUuid | 表单ID |
| formInstId | 实例ID |
| originator | 发起人详情 `{name:{zh_CN,type},userId}` |
| formData | 表单数据（格式见附录一，地区/选项为**名称**而非ID） |

### 7.2 流程实例详情（getInstanceById.result）

| 字段 | 说明 |
| ---- | ---- |
| actioners | 当前任务执行人（已完成时为空） |
| processInstanceId | 实例ID |
| formUuid / processCode | 表单ID / 流程Code |
| title | 实例标题 |
| instanceStatus | 实例状态 |
| approvedResult | 结束时审批结论（agree/disagree） |
| originator | 发起人 |
| data | 表单数据（格式见附录一） |

> ⚠️ **作为返回值时的差异**：地区组件返回 `["省名","市名","区名"]`（非ID）；单选/多选等有国际化，按 language 参数返回对应文案。

***

*文档版本: v1.0.0*
