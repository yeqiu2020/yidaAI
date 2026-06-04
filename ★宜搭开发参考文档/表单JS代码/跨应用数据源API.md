> 作者：叶秋
> 联系方式：15270209736
> 来源：www.yidatrain.com

跨应用数据源API
宜搭提供远程 API 调用的能力可以通过 HTTP 请求异步接口（详细使用请参考 远程 API 文档），于此同时宜搭平台还提供了一些内置的远程 API 用于进行宜搭数据的操作。

警告
由于宜搭提供的 Open API 调用需要进行鉴权，因此在免登页面中无法直接使用远程 Open API，可以自行通过 FaaS 或者自建服务中转调用。

API 调用说明
请求路径
宜搭提供多种应用维度的接口，在应用内可以通过以下方式来调用远程 API（支持跨应用调用），接口返回格式为：

# 应用编码可以通过应用设置=》部署运维页面进行查看
# 接口路径参考下面的文档，不同 API 提供不同的接口路径
"/dingtalk/web/${应用编码}/${接口路径}"

提示
在宜搭平台编写的接口请求代码请直接使用相对路径，如下所示，避免因企业二级域名修改导致需要调整代码。

/dingtalk/web/APP_X1X2X3X4/v1/form/searchFormDatas.json



接口返回结构
宜搭平台提供的远程 API 的返回结构如下所示：

interface IResponse {
  success: boolean; // 请求是否成功
  result?: object | array | string; // 请求成功的返回内容
  errorMsg?: string; // 错误信息
  errorCode?: string; // 错误码
  errorLevel?: number; // 错误级别
}

表单相关 API
宜搭平台提供表单类型的页面来进行表单数据收集，表单相关 API 则用来对表单数据进行相应的增删改查操作，下面提到的表单实例其实就是值表单数据集中的一条数据。

新建表单实例
接口路径： /v1/form/saveFormData.json
请求类型： POST
参数：( formDataJson 需要通过 JSON.stringify() 函数来把对象进行序列化)
参数名	描述	是否必填	示例	备注
formUuid	表单 ID	是	FORM-NJYJZELV8YZRDEI2N5IQ7L6VEDMR1VE9GMPCJB	
appType	应用 ID	是	APP_DR4OK27ZKL5N22B907E8	
formDataJson	表单数据	是	{"textField_jcpm6agt": "单行", "employeeField_jcos0sar": ["workno"]}	参考：附录 1 保存/更新 表单数据格式说明
返回值示例：
{
  "result": "FINST-EF6Y93URN2UZ1SBPLIP9NAV6HR2GEO1Z4ZCHSCJ0",
  "success": true
}

更新表单中指定组件值
接口： /v1/form/updateFormData.json
请求类型： POST
参数：
参数名	描述	是否必填	示例	备注
formInstId	要更新的表单数据 ID	是	FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9	
updateFormDataJson	要更新的表单组件值，必填	是	{"employeeField_jcpm5gy2": ["xxxxx", "yyyyy"]}	参考：附录 1 保存/更新 表单数据格式说明。 参数有的组件更新，没有的组件保持不变。 明细的值只能统一更新，无法只更新子表单下某个组件的值
useLatestVersion	使用最新的表单版本进行更新	否	y	参考：附录 1 保存/更新 表单数据格式说明「特别注意」
返回值示例：
{
  "success": true
}

删除表单实例
接口： /v1/form/deleteFormData.json
请求类型： POST
参数：
参数名	描述	是否必填	示例	备注
formInstId	要删除的表单数据 ID	是	FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9	
返回值示例：
{
  "success": true
}

根据表单实例 ID 查询表单实例详情
接口： /v1/form/getFormDataById.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
formInstId	要查询的表单数据 ID	是	FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9	
返回值示例：
{
  "success": "请求是否成功",
  "errorMsg": "错误信息",
  "errorCode": "错误码",
  "result": "表单实例详情👇🏻👇🏻👇🏻"
}

result 参见附录 5. 表单实例详情对象格式说明

根据条件搜索表单实例 ID 列表
接口： /v1/form/searchFormDataIds.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
formUuid	表单 ID	是	FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3	
searchFieldJson	根据表单内组件值查询	否		格式见附录 2：根据组件值进行条件搜索，组件值格式说明
currentPage	当前页	否	1	必须大于 0 默认 1
pageSize	每页记录数	否	10	必须大于 0 默认 10 不能大于 100
originatorId	根据数据提交人工号查询	否		
createFrom	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式
createTo	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式。和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的数据。
modifiedFrom	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式
modifiedTo	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-02-01	字符串格式，且为 yyyy-MM-DD 格式。和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
dynamicOrder	排序	否	column: '+'	column: '+'
返回值示例：
{
  "result": {
    "data": ["FINST-EF6Y93URN2F02S745LTMW2D2G4WVDS16O17ISCJ0"],
    "totalCount": 1,
    "currentPage": 1
  },
  "success": true
}

根据条件搜索表单实例详情列表
接口： /v1/form/searchFormDatas.json
请求类型： GET
权限控制：该接口会受页面设置的权限控制（管理员除外）
参数：
参数名	描述	是否必填	示例	备注
formUuid	表单 ID	是	FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3	
searchFieldJson	根据表单内组件值查询	否		格式见附录 2：根据组件值进行条件搜索，组件值格式说明
currentPage	当前页	否	1	必须大于 0 默认 1
pageSize	每页记录数	否	10	必须大于 0 默认 10 不能大于 100
originatorId	根据数据提交人工号查询	否		
createFrom	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式（或者精确到秒 yyyy-MM-DD HH:mm:ss）
createTo	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式（或者精确到秒 yyyy-MM-DD HH:mm:ss）和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的据
modifiedFrom	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式（或者精确到秒 yyyy-MM-DD HH:mm:ss）｜
modifiedTo	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-02-01	字符串格式，且为 yyyy-MM-DD 格式。 （或者精确到秒 yyyy-MM-DD HH:mm:ss）和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
dynamicOrder	排序	否	{"numberField_1ac":"+"}	表示按照字段 numberField_1ac 升序排列

**注意：** 参数名 `searchFieldJson` 在实际使用中可能存在与文档或不同场景下表现不一致的情况。某些场景下可能需要使用 `searchField` 作为参数名。建议优先使用 `searchFieldJson`，如果遇到问题，可尝试更换为 `searchField` 进行测试。

返回值示例：
{
  "success": true,
  "errorCode": "",
  "errorMsg": "",
  "result": {
    "data": [],
    "totalCount": 1,
    "currentPage": 1
  }
}

获取表单定义
本接口将于2024年12月1日进行升级，升级后的接口将不再支持普通用户使用，只有管理员才支持调用。

接口： /v1/form/getFormComponentDefinationList.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
formUuid	表单 ID	是	FORM-NJYJZELV8YZRDEI2N5IQ7L6VEDMR1VE9GMPCJB	
version	表单版本	否	FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9	可以传入 formData 中的 version 字段。
为空时返回最新的版本定义				
返回值示例：
{
    "success":true,
    "content":[
        {
            "label":"{"en_US":"CheckBox Field", "zh_CN":"多选", "type":"i18n"}",
            "key":"checkboxField_jiwvhkdi"
        },
        {
            "label":"{"en_US":"Textarea Field", "zh_CN":"多行输入框", "type":"i18n"}",
            "key":"textareaField_jiwvhkdh"
        },
        {
            "label":"{"en_US":"Select Field", "zh_CN":"下拉单选", "type":"i18n"}",
            "key":"selectField_jiwvhkdg"
        }
    ]
}


获取子表单数据
接口： v1/form/listTableDataByFormInstIdAndTableId.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
formUuid	表单 ID	是	FORM-NJYJZELV8YZRDEI2N5IQ7L6VEDMR1VE9GMPCJB	
formInstanceId	要查询的实例的实例 ID	是	FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9	
tableFieldId	需要查找的子表单组件的唯一标识	是	tableField_ksyaujq1	
currentPage	当前页	否	10	必须大于 0，默认 1
pageSize	每页记录数	否	50	大于 0 并且小于 50，默认 10
返回值示例：
{
  "result": {
    "data": [
      {
        "textField_kstqokaa": ""
      },
      {
        "textField_kstqokaa": "1"
      },
      {
        "textField_kstqokaa": "2"
      }
    ],
    "totalCount": 120,
    "currentPage": 1
  },
  "success": true
}

流程相关 API
流程表单也是宜搭平台提供的基础能力之一，流程相关 API 用于对流程进行相关操作。

流程发起
接口路径： /v1/process/startInstance.json
请求类型： POST
参数：
参数名	描述	是否必填	示例	备注
processCode	流程 code	是	TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4 ｜ 单独发起页链接上可查	
formUuid	表单 ID	是	FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3 ｜ 单独发起页链接上可查	
formDataJson	表单数据	是		参考：附录 1 保存/更新 表单数据格式说明
deptId	发起人所在部门号	否	18295	不填，默认发起人主职部门
返回值示例：
{
  "result": "f30233fb-72e1-4af4-8cb8-c7e0ea9ee530",
  "success": true
}

根据条件搜索流程实例 ID
接口路径： /v1/process/getInstanceIds.json
请求类型： GET
权限说明：流程需要配置实例可查看权限（管理员除外）
参数：
参数名	描述	是否必填	示例	备注
formUuid	表单 ID	是	FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3	
searchFieldJson	根据表单内组件值查询	否		格式见附录 2：根据组件值进行条件搜索，组件值格式说明
taskId	任务 ID	否	2199132092	一般用不到
instanceStatus	实例状态	否	RUNNING	可选值为：RUNNING, TERMINATED, COMPLETED, ERROR。分别代表：运行中，已终止，已完成，异常。
approvedResult	流程审批结果	否	agree	可选值为：agree, disagree。分别表示：同意， 拒绝。
currentPage	当前页	否	1	必须大于 0 默认 1
pageSize	每页记录数	否	10	必须大于 0 默认 10 不能大于 100
originatorId	根据流程发起人工号查询	否		
createFrom	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式 yyyy-MM-DD
createTo	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式。和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的数据。
modifiedFrom	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式
modifiedTo	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式。 和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
返回值示例：
{
  "result": {
    "data": [
      "f30233fb-72e1-4af4-8cb8-c7e0ea9ee530",
      "bc0950a3-fe1b-459c-b6ba-282be38523ab",
      "f540cbd7-43eb-40de-b915-6716578a2802"
    ],
    "totalCount": 3,
    "currentPage": 1
  },
  "success": true
}

根据搜索条件获取实例详情列表
接口路径： /v1/process/getInstances.json
请求类型： GET
权限说明：流程需要配置实例可查看权限（管理员除外）
参数：
参数名	描述	是否必填	示例	备注
formUuid	表单 ID	是	FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3	
searchFieldJson	根据表单内组件值查询	否		格式见附录 2：根据组件值进行条件搜索，组件值格式说明
taskId	任务 ID	否	2199132092	一般用不到
instanceStatus	实例状态	否	RUNNING	可选值为：RUNNING, TERMINATED, COMPLETED, ERROR。
分别代表：运行中，已终止，已完成，异常。				
approvedResult	流程审批结果	否	agree	可选值为：agree, disagree。分别表示：同意， 拒绝。
currentPage	当前页	否	1	必须大于 0 默认 1
pageSize	每页记录数	否	10	必须大于 0 默认 10 不能大于 100
originatorId	根据流程发起人工号查询	否		
createFrom	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式 yyyy-MM-DD
createTo	createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式。和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的数据。
modifiedFrom	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式（或者精确到秒 yyyy-MM-DD HH:mm:ss）｜
modifiedTo	modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表	否	2018-01-01	字符串格式，且为 yyyy-MM-DD 格式。 （或者精确到秒 yyyy-MM-DD HH:mm:ss）和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
返回值示例：
{
  "success": true,
  "errorCode": "",
  "errorMsg": "",
  "result": {
    "data": [],
    "totalCount": 1,
    "currentPage": 1
  }
}

根据实例 ID 获取流程实例详情
接口路径： /v1/process/getInstanceById.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
processInstanceId	流程实例 ID	是	f30233fb-72e1-4af4-8cb8-c7e0ea9ee530	
返回值示例：
{
  "success": true,
  "errorCode": "",
  "errorMsg": "",
  "result": "实例详情，参见 [附录 3- 流程实例详情对象格式说明](#流程实例详情对象格式说明)"
}


删除流程实例
接口路径： /v1/process/deleteInstance.json
请求类型： POST
参数：
参数名	描述	是否必填	示例	备注
processInstanceId	流程实例 ID	是	f30233fb-72e1-4af4-8cb8-c7e0ea9ee530	
返回值示例：
{
  "success": true,
  "errorCode": "",
  "errorMsg": ""
}

终止流程实例
接口路径： /v1/process/terminateInstance.json
请求类型： POST
参数：
参数名	描述	是否必填	示例	备注
processInstanceId	流程实例 ID	是	f30233fb-72e1-4af4-8cb8-c7e0ea9ee530	
返回值示例：
{
  "success": true,
  "errorCode": "",
  "errorMsg": ""
}

执行单个任务接口
接口路径： /v1/task/executeTask.json
请求类型： POST
参数：
参数名	描述	是否必填	示例	备注
taskId	任务 ID	是	12002575	
procInstId	实例 ID	是	f30233fb-72e1-4af4-8cb8-c7e0ea9ee530	
outResult	审批结果	是	AGREE	AGREE(同意)、DISAGREE(不同意)
remark	审批意见	是	确认同意	
formDataJson	审批意见	否	确认同意	参考：附录 1 保存/更新 表单数据格式说明。
参数有的组件更新，没有的组件保持不变。明细的值只能统一更新，无法只更新子表单下某个组件的值				
noExecuteExpressions	是否不执行校验&关联操作	否	y	本任务节点有绑定校验规则或者关联操作时，
y -> 不执行校验规则&关联操作 n -> 执行校验规则&关联操作不传默认为 n，即会执行校验规则&关联操作				
返回值示例：
{
  "success": "请求是否成功",
  "errorCode": "错误信息",
  "errorMsg": "错误码"
}

获取审批记录
接口路径： /v1/process/getOperationRecords.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
processInstanceId	流程实例 ID	是	f30233fb-72e1-4af4-8cb8-c7e0ea9ee530	
返回值示例：
{
  "success": true,
  "content": [
    {
      "operateTime": "2018-06-22 14:35:40",
      "remark": "",
      "taskHoldTime": 0,
      "type": "HISTORY",
      "operatorName": "宜小搭",
      "operator": "yida",
      "activityId": "sid-restartevent",
      "action": "提交申请",
      "actionExt": "submit",
      "id": 2846866118,
      "operatorPhotoUrl": "/photo/yida.128x128.jpg",
      "processInstanceId": "8c124808-82e7-473b-9a7a-43c29b310837",
      "showName": "提交申请",
      "operateType": "NEW_PROCESS",
      "domains": [],
      "operatorStatus": "A",
      "operatorAgentIds": [],
      "size": 1,
      "operatorDisplayName": "宜小搭",
      "taskId": "null"
    },
    {
      "taskHoldTime": 531398377,
      "type": "TODO",
      "operatorName": "宜小搭",
      "operator": "yida",
      "activityId": "sidJIOB2P2J1JW3RPMDOS28",
      "taskType": "COMMON_ALL_AT_ONCE",
      "actionExt": "doing",
      "operatorPhotoUrl": "/photo/yida.128x128.jpg",
      "processInstanceId": "8c124808-82e7-473b-9a7a-43c29b310837",
      "showName": "执行人",
      "activeTime": "2018-06-22 14:35:41",
      "domains": [],
      "operatorStatus": "A",
      "operatorAgentIds": [],
      "size": 1,
      "operatorDisplayName": "宜小搭",
      "taskId": "2846866145"
    }
  ]
}

流程实例更新
接口路径： /v1/process/updateInstance.json
请求类型： POST
参数：
参数名	描述	是否必填	示例	备注
processInstanceId	实例 ID	是		
updateFormDataJson	更新的表单数据	是		参考：附录 1 保存/更新 表单数据格式说明
返回值示例：
{
  "success": true
}

任务中心相关 API
宜搭平台提供有一个任务中心用来查看当前组织下所有应用的任务列表及其状态，任务中心相关 API 则是用来对任务中心中的任务列表进行查询操作。

已提交任务
接口路径： /v1/process/getMySubmitInApp.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
pageSize	每页记录数	是	10	必须大于 0 默认 10 最大值：100
currentPage	当前页	是	1	必须大于 0 默认 1
keyword	关键词	否		
返回值示例：
成功
{
  "result": {
    "data": [
      {
        "modifiedTime": "2018-04-12 19:44:14",
        "formInstanceId": "FINST-AJ1L4CJVXL0UIAIPR06ZA52U9HKUXXXXXX",
        "title": "单据",
        "instValue": [
          {
            "componentId": "node_jfwgghbo",
            "componentName": "TextField",
            "fieldId": "textField_jfwggg8e",
            "label": "姓名",
            "validation": [],
            "fieldData": {
              "complexType": "custom",
              "dataType": "CHANGED",
              "pass": true,
              "value": "jack"
            },
            "errorMsg": null,
            "hasError": false
          }
        ],
        "processId": 0,
        "appType": "APP_R8MYLKYXXXXXX",
        "dataMap": {
          "textField_jfXXXXXX": "XXXXXX"
        },
        "originatorId": "XXXXXX",
        "formUuid": "FORM-0G7KPV3WZL0U3AHTOA9BFVXXXXXX",
        "dataType": "finst",
        "originatorAvatar": "http://static.dingtalk.com/media/lADPBbCc1R7VwSHNXXXXXX.jpg",
        "version": 0,
        "createTime": "2018-04-12 19:44:14"
      }
    ],
    "totalCount": 1,
    "currentPage": 1
  },
  "success": true
}


失败
{
  "errorCode": "TIANSHU_000006",
  "success": false,
  "errorMsg": "没有权限"
}

待办任务
接口路径： /v1/task/getTodoTasksInApp.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
pageSize	每页记录数	是	10	必须大于 0 默认 10 最大值：100
currentPage	当前页	是	1	必须大于 0 默认 1
keyword	关键词	否		
返回值示例：
成功
{
  "result": {
    "data": [
      {
        "processInstanceId": "XXXXXX",
        "originatorName": "XXX",
        "processCode": "TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4",
        "processTitle": "XXX 发起的流程",
        "title": "XXX 发起的流程",
        "appType": "APP_R8MYLKYXXXXXX",
        "formUuid": "FORM-0G7KPV3WZL0U3AHTOA9BFVXXXXXX",
        "dataType": "finst",
        "originatorId": "XXXXXX",
        "originatorAvatar": "http://static.dingtalk.com/media/lADPBbCc1R7VwSHNXXXXXX.jpg",
        "originatorName": "XXX",
        "instanceStatus": "RUNNING",
        "taskId": "XXXXXX",
        "taskType": "COMMON_ALL_AT_ONCE",
        "taskTitle": "XXX 发起的流程",
        "gmtCreate": "2018-04-12 19:44:14",
        "gmtModified": "2018-04-12 19:44:14",
        "taskHoldTime": 531398377,
        "activityId": "sidJIOB2P2J1JW3RPMDOS28",
        "taskStatus": "TODO",
        "showName": "执行人",
        "operator": "yida",
        "operatorName": "宜小搭",
        "operatorPhotoUrl": "/photo/yida.128x128.jpg",
        "operatorDisplayName": "宜小搭",
        "operatorStatus": "A",
        "operatorAgentIds": [],
        "size": 1,
        "instValue": [
          {
            "componentId": "node_jfwgghbo",
            "componentName": "TextField",
            "fieldId": "textField_jfwggg8e",
            "label": "姓名",
            "validation": [],
            "fieldData": {
              "complexType": "custom",
              "dataType": "CHANGED",
              "pass": true,
              "value": "jack"
            },
            "errorMsg": null,
            "hasError": false
          }
        ]
      }
    ],
    "totalCount": 1,
    "currentPage": 1
  },
  "success": true
}

已办任务
接口路径： /v1/task/getDoneTasksInApp.json
请求类型： GET
参数：
参数名	描述	是否必填	示例	备注
pageSize	每页记录数	是	10	必须大于 0 默认 10 最大值：100
currentPage	当前页	是	1	必须大于 0 默认 1
keyword	关键词	否		
返回值示例：
成功
{
  "result": {
    "data": [
      {
        "processInstanceId": "XXXXXX",
        "originatorName": "XXX",
        "processCode": "TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4",
        "processTitle": "XXX 发起的流程",
        "title": "XXX 发起的流程",
        "appType": "APP_R8MYLKYXXXXXX",
        "formUuid": "FORM-0G7KPV3WZL0U3AHTOA9BFVXXXXXX",
        "dataType": "finst",
        "originatorId": "XXXXXX",
        "originatorAvatar": "http://static.dingtalk.com/media/lADPBbCc1R7VwSHNXXXXXX.jpg",
        "originatorName": "XXX",
        "instanceStatus": "COMPLETED",
        "taskId": "XXXXXX",
        "taskType": "COMMON_ALL_AT_ONCE",
        "taskTitle": "XXX 发起的流程",
        "gmtCreate": "2018-04-12 19:44:14",
        "gmtModified": "2018-04-12 19:44:14",
        "taskHoldTime": 531398377,
        "activityId": "sidJIOB2P2J1JW3RPMDOS28",
        "taskStatus": "DONE",
        "showName": "执行人",
        "operator": "yida",
        "operatorName": "宜小搭",
        "operatorPhotoUrl": "/photo/yida.128x128.jpg",
        "operatorDisplayName": "宜小搭",
        "operatorStatus": "A",
        "operatorAgentIds": [],
        "size": 1,
        "instValue": [
          {
            "componentId": "node_jfwgghbo",
            "componentName": "TextField",
            "fieldId": "textField_jfwggg8e",
            "label": "姓名",
            "validation": [],
            "fieldData": {
              "complexType": "custom",
              "dataType": "CHANGED",
              "pass": true,
              "value": "jack"
            },
            "errorMsg": null,
            "hasError": false
          }
        ]
      }
    ],
    "totalCount": 1,
    "currentPage": 1
  },
  "success": true
}

作为返回值的表单数据的格式说明
作为返回值的表单数据格式和 附录 1 保存/更新 表单数据格式说明基本一致。区别在于：

录入时，地区组件值为 ["省份 ID ", "市 ID ", "区 ID "]。作为返回值时，是 ["省名称", "城市名称", "地区名称"]。
单选，下拉单选，多选，下拉多选是有国际化的。返回值时，会根据传的 language 参数，返回对应的数据值。
表单实例详情对象格式说明
字段	描述	示例	备注
gmtModified	最后修改时间	2018-01-24 11:22:01	
formUuid	表单 ID	FORM-EF6Y93URN24F1SCX15VA2P918LPEIJ2H3UFORCJ1	
originator	发起人详情	[{"name":{"zh_CN": "user_zh_name", "type": "i18n"}, "userId": "workno"}]	
formData	表单数据详情	TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4	参考附录 4- 作为返回值的表单数据的格式说明
完整的数据格式 demo
{
  "result": {
    "gmtModified": "2018-01-24 11:22:01",
    "formUuid": "FORM-EF6Y93URN24F1SCX15VA2P918LPEIJ2H3UFORCJ1",
    "formInstId": "FINST-EF6Y93URN2F02S745LTMW2D2G4WVDS16O17ISCJ0",
    "formData": {
      "numberField_jcr0069o": 1,
      "multiSelectField_jcr0069s": ["选项三", "选项二"],
      "textareaField_jcr0069n": "duohang",
      "employeeField_jcr0069x": ["xxxx"],
      "departmentField_jcr0069z": "xxxx",
      "cascadeDate_jcr0069u": ["1514736000000", "1517328000000"],
      "cascadeSelectField_jcr006a0": ["part", "part_b"],
      "tableField_jcr006a1": [
        {
          "departmentField_jcr006ad": "xxxx",
          "cascadeDate_jcr006aa": ["1514736000000", "1517328000000"],
          "selectField_jcr006a6": "选项三",
          "citySelectField_jcr006ac": ["天津", "天津市", "河东区"],
          "radioField_jcr006a5": "选项二",
          "employeeField_jcr006ab": ["xxxxxx", "yyyyyy"],
          "dateField_jcr006a9": 1517328000000,
          "textField_jcr006a2": "子表单下单行",
          "textareaField_jcr006a3": "子表单下多行",
          "cascadeSelectField_jcr006ae": ["product", "product_a"],
          "numberField_jcr006a4": 2,
          "checkboxField_jcr006a7": ["选项一", "选项三", "选项二"],
          "multiSelectField_jcr006a8": ["选项一", "选项三", "选项二"]
        }
      ],
      "selectField_jcr0069q": "选项一",
      "citySelectField_jcr0069y": ["北京", "北京市", "东城区"],
      "checkboxField_jcr0069r": ["选项三", "选项二"],
      "textField_jcr0069m": "danhang",
      "radioField_jcr0069p": "选项一",
      "dateField_jcr0069t": 1516636800000
    },
    "originator": {
      "name": {
        "pureEn_US": "userEnglishName",
        "en_US": "userEnglishName",
        "zh_CN": "userName",
        "type": "i18n"
      },
      "userId": "xxxx"
    }
  },
  "success": true
}

---

