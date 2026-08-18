// 表单静态配置数据（从组件ID清单自动生成）
// 用于 file:// 协议下避免 CORS 跨域问题

window.FormConfigData = {
  "产品信息": {
    "formName": "产品信息",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "产品编号",
        "fieldId": "serialNumberField_gpr2iiot",
        "index": "1"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_gpr2j7do",
        "index": "2"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品分类",
        "fieldId": "textField_gpr2jadm",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "规格型号",
        "fieldId": "textField_gpr341ic",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "单位",
        "fieldId": "textField_gpr3bcud",
        "index": "5"
      },
      {
        "componentType": "NumberField",
        "fieldName": "参考采购价",
        "fieldId": "numberField_gpr31moe",
        "index": "6"
      },
      {
        "componentType": "NumberField",
        "fieldName": "参考销售价",
        "fieldId": "numberField_gpr3lcl1",
        "index": "7"
      },
      {
        "componentType": "NumberField",
        "fieldName": "库存上限",
        "fieldId": "numberField_gpr3yjkf",
        "index": "8"
      },
      {
        "componentType": "NumberField",
        "fieldName": "库存下限",
        "fieldId": "numberField_gpr3yljm",
        "index": "9"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gpr3qmpy",
        "index": "10"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gpr33tyv",
        "index": "11"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gpr3sfl2",
        "index": "12"
      },
      {
        "componentType": "SelectField",
        "fieldName": "状态",
        "fieldId": "selectField_gpr3ixaz",
        "index": "13"
      }
    ]
  },
  "仓库信息": {
    "formName": "仓库信息",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "仓库编号",
        "fieldId": "serialNumberField_gqwko9ap",
        "index": "1"
      },
      {
        "componentType": "TextField",
        "fieldName": "仓库名称",
        "fieldId": "textField_gqwkszm9",
        "index": "2"
      },
      {
        "componentType": "TextField",
        "fieldName": "仓库地址",
        "fieldId": "textField_gqwkqrfj",
        "index": "3"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "负责人",
        "fieldId": "employeeField_gqwktaf7",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "联系电话",
        "fieldId": "textField_gqwk83ma",
        "index": "5"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gqwkhide",
        "index": "6"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gqwk1876",
        "index": "7"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gqwkqy7z",
        "index": "8"
      },
      {
        "componentType": "SelectField",
        "fieldName": "状态",
        "fieldId": "selectField_gqwkw9zh",
        "index": "9"
      }
    ]
  },
  "库存盘点": {
    "formName": "库存盘点",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "盘点单号",
        "fieldId": "serialNumberField_gs786guw",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "盘点日期",
        "fieldId": "dateField_gs78rjy3",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "盘点仓库",
        "fieldId": "associationFormField_gs78d3cg",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "仓库名称",
        "fieldId": "textField_gs7881kq",
        "index": "4"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "盘点人",
        "fieldId": "employeeField_gs78uvz9",
        "index": "5"
      },
      {
        "componentType": "SelectField",
        "fieldName": "盘点状态",
        "fieldId": "selectField_gs78shrv",
        "index": "6"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gs78z6yl",
        "index": "7"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gs7891fo",
        "index": "8"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gs78udtb",
        "index": "9"
      },
      {
        "index": "10",
        "componentType": "子表单",
        "fieldName": "盘点明细 (tableField_gs79bsf7)",
        "fieldId": "tableField_盘点明细 (tableField_gs79bsf7)"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "产品信息",
        "fieldId": "associationFormField_gs7953s2",
        "index": "10.1",
        "isSubTableField": true,
        "subTableName": "盘点明细 (tableField_gs79bsf7)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_gs7985u2",
        "index": "10.2",
        "isSubTableField": true,
        "subTableName": "盘点明细 (tableField_gs79bsf7)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "账面数量",
        "fieldId": "numberField_gs79hg2b",
        "index": "10.3",
        "isSubTableField": true,
        "subTableName": "盘点明细 (tableField_gs79bsf7)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "实盘数量",
        "fieldId": "numberField_gs79u7xe",
        "index": "10.4",
        "isSubTableField": true,
        "subTableName": "盘点明细 (tableField_gs79bsf7)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "盘盈数量",
        "fieldId": "numberField_gs79s6y1",
        "index": "10.5",
        "isSubTableField": true,
        "subTableName": "盘点明细 (tableField_gs79bsf7)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "盘亏数量",
        "fieldId": "numberField_gs79z5gy",
        "index": "10.6",
        "isSubTableField": true,
        "subTableName": "盘点明细 (tableField_gs79bsf7)"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gs79wexo",
        "index": "10.7",
        "isSubTableField": true,
        "subTableName": "盘点明细 (tableField_gs79bsf7)"
      }
    ]
  },
  "库存调拨": {
    "formName": "库存调拨",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "调拨单号",
        "fieldId": "serialNumberField_gtlshhd5",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "调拨日期",
        "fieldId": "dateField_gtltyp06",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "调出仓库",
        "fieldId": "associationFormField_gtlte2fg",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "调出仓库名称",
        "fieldId": "textField_gtlt5d6b",
        "index": "4"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "调入仓库",
        "fieldId": "associationFormField_gtltdaqh",
        "index": "5"
      },
      {
        "componentType": "TextField",
        "fieldName": "调入仓库名称",
        "fieldId": "textField_gtltpu0l",
        "index": "6"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "调拨人",
        "fieldId": "employeeField_gtlt9nrk",
        "index": "7"
      },
      {
        "componentType": "SelectField",
        "fieldName": "调拨状态",
        "fieldId": "selectField_gtlth492",
        "index": "8"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gtltyj6j",
        "index": "9"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gtltljfe",
        "index": "10"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gtltb3u6",
        "index": "11"
      },
      {
        "index": "12",
        "componentType": "子表单",
        "fieldName": "调拨明细 (tableField_gtltjhot)",
        "fieldId": "tableField_调拨明细 (tableField_gtltjhot)"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "产品信息",
        "fieldId": "associationFormField_gtltd23l",
        "index": "12.1",
        "isSubTableField": true,
        "subTableName": "调拨明细 (tableField_gtltjhot)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_gtlt6gyj",
        "index": "12.2",
        "isSubTableField": true,
        "subTableName": "调拨明细 (tableField_gtltjhot)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "调拨数量",
        "fieldId": "numberField_gtltdmsd",
        "index": "12.3",
        "isSubTableField": true,
        "subTableName": "调拨明细 (tableField_gtltjhot)"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gtltf5p1",
        "index": "12.4",
        "isSubTableField": true,
        "subTableName": "调拨明细 (tableField_gtltjhot)"
      }
    ]
  },
  "客户信息": {
    "formName": "客户信息",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "客户编号",
        "fieldId": "serialNumberField_gv0l898v",
        "index": "1"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户名称",
        "fieldId": "textField_gv0mzwt9",
        "index": "2"
      },
      {
        "componentType": "SelectField",
        "fieldName": "客户类型",
        "fieldId": "selectField_gv0m91ni",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "联系人",
        "fieldId": "textField_gv0mc24z",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "联系电话",
        "fieldId": "textField_gv0mpbkh",
        "index": "5"
      },
      {
        "componentType": "TextField",
        "fieldName": "电子邮箱",
        "fieldId": "textField_gv0msjpi",
        "index": "6"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户地址",
        "fieldId": "textField_gv0m7a2m",
        "index": "7"
      },
      {
        "componentType": "NumberField",
        "fieldName": "预付款余额",
        "fieldId": "numberField_gv0mlanf",
        "index": "8"
      },
      {
        "componentType": "NumberField",
        "fieldName": "信用额度",
        "fieldId": "numberField_gv0mb84t",
        "index": "9"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gv0m84o4",
        "index": "10"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gv0mrmj0",
        "index": "11"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gv0mzuy6",
        "index": "12"
      },
      {
        "componentType": "SelectField",
        "fieldName": "状态",
        "fieldId": "selectField_gv0m0755",
        "index": "13"
      }
    ]
  },
  "客户跟进": {
    "formName": "客户跟进",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "跟进编号",
        "fieldId": "serialNumberField_gwbu70ka",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "跟进日期",
        "fieldId": "dateField_gwbv7xdk",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "客户名称",
        "fieldId": "associationFormField_gwbvmsyk",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户联系人",
        "fieldId": "textField_gwbvjnen",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户电话",
        "fieldId": "textField_gwbvn1rt",
        "index": "5"
      },
      {
        "componentType": "SelectField",
        "fieldName": "跟进方式",
        "fieldId": "selectField_gwbvnnhg",
        "index": "6"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "跟进内容",
        "fieldId": "textareaField_gwbvo141",
        "index": "7"
      },
      {
        "componentType": "DateField",
        "fieldName": "下次跟进日期",
        "fieldId": "dateField_gwbvc5px",
        "index": "8"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "跟进人",
        "fieldId": "employeeField_gwbvw6pb",
        "index": "9"
      },
      {
        "componentType": "SelectField",
        "fieldName": "跟进状态",
        "fieldId": "selectField_gwbvhrmz",
        "index": "10"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gwbvkvep",
        "index": "11"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gwbv7ldx",
        "index": "12"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gwbvh9ty",
        "index": "13"
      }
    ]
  },
  "供应商信息": {
    "formName": "供应商信息",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "供应商编号",
        "fieldId": "serialNumberField_gxeyp4ho",
        "index": "1"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商名称",
        "fieldId": "textField_gxezy4y9",
        "index": "2"
      },
      {
        "componentType": "TextField",
        "fieldName": "联系人",
        "fieldId": "textField_gxeztfsc",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "联系电话",
        "fieldId": "textField_gxezvhhb",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "电子邮箱",
        "fieldId": "textField_gxezbqd5",
        "index": "5"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商地址",
        "fieldId": "textField_gxez2a68",
        "index": "6"
      },
      {
        "componentType": "SelectField",
        "fieldName": "付款方式",
        "fieldId": "selectField_gxez3ssd",
        "index": "7"
      },
      {
        "componentType": "NumberField",
        "fieldName": "预付款",
        "fieldId": "numberField_gxez7u0n",
        "index": "8"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gxezpjyf",
        "index": "9"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gxezhucx",
        "index": "10"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gxez2pc4",
        "index": "11"
      },
      {
        "componentType": "SelectField",
        "fieldName": "状态",
        "fieldId": "selectField_gxezq21k",
        "index": "12"
      }
    ]
  },
  "采购订单": {
    "formName": "采购订单",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "采购订单号",
        "fieldId": "serialNumberField_gyqsw3vk",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "采购日期",
        "fieldId": "dateField_gyqt2frv",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "供应商",
        "fieldId": "associationFormField_gyqtmfve",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商联系人",
        "fieldId": "textField_gyqtqw4g",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商电话",
        "fieldId": "textField_gyqtpakz",
        "index": "5"
      },
      {
        "componentType": "DateField",
        "fieldName": "交货日期",
        "fieldId": "dateField_gyqtyx9b",
        "index": "6"
      },
      {
        "componentType": "NumberField",
        "fieldName": "采购总金额",
        "fieldId": "numberField_gyqtuh6s",
        "index": "7"
      },
      {
        "componentType": "SelectField",
        "fieldName": "订单状态",
        "fieldId": "selectField_gyqtelud",
        "index": "8"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gyqtvp4t",
        "index": "9"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_gyqtqir6",
        "index": "10"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_gyqticjo",
        "index": "11"
      },
      {
        "index": "12",
        "componentType": "子表单",
        "fieldName": "采购明细 (tableField_gyqtnw9b)",
        "fieldId": "tableField_采购明细 (tableField_gyqtnw9b)"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "产品信息",
        "fieldId": "associationFormField_gyqt2vx6",
        "index": "12.1",
        "isSubTableField": true,
        "subTableName": "采购明细 (tableField_gyqtnw9b)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_gyqtpu4c",
        "index": "12.2",
        "isSubTableField": true,
        "subTableName": "采购明细 (tableField_gyqtnw9b)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品规格",
        "fieldId": "textField_gyqtb2fi",
        "index": "12.3",
        "isSubTableField": true,
        "subTableName": "采购明细 (tableField_gyqtnw9b)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "采购数量",
        "fieldId": "numberField_gyqtazrz",
        "index": "12.4",
        "isSubTableField": true,
        "subTableName": "采购明细 (tableField_gyqtnw9b)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "采购单价",
        "fieldId": "numberField_gyqte9wn",
        "index": "12.5",
        "isSubTableField": true,
        "subTableName": "采购明细 (tableField_gyqtnw9b)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "采购金额",
        "fieldId": "numberField_gyqt2l1i",
        "index": "12.6",
        "isSubTableField": true,
        "subTableName": "采购明细 (tableField_gyqtnw9b)"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_gyqtbqzq",
        "index": "12.7",
        "isSubTableField": true,
        "subTableName": "采购明细 (tableField_gyqtnw9b)"
      }
    ]
  },
  "采购入库": {
    "formName": "采购入库",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "入库单号",
        "fieldId": "serialNumberField_h07rlju4",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "入库日期",
        "fieldId": "dateField_h07rgmfx",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "采购订单",
        "fieldId": "associationFormField_h07r8h4i",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "采购订单号",
        "fieldId": "textField_h07rnnwz",
        "index": "4"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "入库仓库",
        "fieldId": "associationFormField_h07rm264",
        "index": "5"
      },
      {
        "componentType": "TextField",
        "fieldName": "入库仓库名称",
        "fieldId": "textField_h07rkhb5",
        "index": "6"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "供应商",
        "fieldId": "associationFormField_h07rvmmi",
        "index": "7"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商联系人",
        "fieldId": "textField_h07rfm0w",
        "index": "8"
      },
      {
        "componentType": "NumberField",
        "fieldName": "入库总金额",
        "fieldId": "numberField_h07rt65x",
        "index": "9"
      },
      {
        "componentType": "SelectField",
        "fieldName": "入库状态",
        "fieldId": "selectField_h07rsm40",
        "index": "10"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h07sbjkz",
        "index": "11"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_h07s5196",
        "index": "12"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_h07s2nrf",
        "index": "13"
      },
      {
        "index": "14",
        "componentType": "子表单",
        "fieldName": "入库明细 (tableField_h07so2lk)",
        "fieldId": "tableField_入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "产品信息",
        "fieldId": "associationFormField_h07syohw",
        "index": "14.1",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_h07stupu",
        "index": "14.2",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品规格",
        "fieldId": "textField_h07s6rr9",
        "index": "14.3",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "采购数量",
        "fieldId": "numberField_h07s7pui",
        "index": "14.4",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "入库数量",
        "fieldId": "numberField_h07safn4",
        "index": "14.5",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "入库单价",
        "fieldId": "numberField_h07s4k18",
        "index": "14.6",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "入库金额",
        "fieldId": "numberField_h07sfe7o",
        "index": "14.7",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h07stj9b",
        "index": "14.8",
        "isSubTableField": true,
        "subTableName": "入库明细 (tableField_h07so2lk)"
      }
    ]
  },
  "销售订单": {
    "formName": "销售订单",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "销售订单号",
        "fieldId": "serialNumberField_h1oqkmv8",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "销售日期",
        "fieldId": "dateField_h1oqzmol",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "客户名称",
        "fieldId": "associationFormField_h1oqft9u",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户联系人",
        "fieldId": "textField_h1oq716p",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户电话",
        "fieldId": "textField_h1oq8u4s",
        "index": "5"
      },
      {
        "componentType": "DateField",
        "fieldName": "交货日期",
        "fieldId": "dateField_h1oqap6z",
        "index": "6"
      },
      {
        "componentType": "NumberField",
        "fieldName": "销售总金额",
        "fieldId": "numberField_h1oq94cl",
        "index": "7"
      },
      {
        "componentType": "SelectField",
        "fieldName": "订单状态",
        "fieldId": "selectField_h1oqocwz",
        "index": "8"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h1oqt2x0",
        "index": "9"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_h1or1ug1",
        "index": "10"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_h1orhdp8",
        "index": "11"
      },
      {
        "index": "12",
        "componentType": "子表单",
        "fieldName": "销售明细 (tableField_h1orvmyd)",
        "fieldId": "tableField_销售明细 (tableField_h1orvmyd)"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "产品信息",
        "fieldId": "associationFormField_h1or67mn",
        "index": "12.1",
        "isSubTableField": true,
        "subTableName": "销售明细 (tableField_h1orvmyd)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_h1orhla6",
        "index": "12.2",
        "isSubTableField": true,
        "subTableName": "销售明细 (tableField_h1orvmyd)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品规格",
        "fieldId": "textField_h1orfmiy",
        "index": "12.3",
        "isSubTableField": true,
        "subTableName": "销售明细 (tableField_h1orvmyd)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "销售数量",
        "fieldId": "numberField_h1or6d6u",
        "index": "12.4",
        "isSubTableField": true,
        "subTableName": "销售明细 (tableField_h1orvmyd)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "销售单价",
        "fieldId": "numberField_h1orn8q6",
        "index": "12.5",
        "isSubTableField": true,
        "subTableName": "销售明细 (tableField_h1orvmyd)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "销售金额",
        "fieldId": "numberField_h1orafqf",
        "index": "12.6",
        "isSubTableField": true,
        "subTableName": "销售明细 (tableField_h1orvmyd)"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h1orun3j",
        "index": "12.7",
        "isSubTableField": true,
        "subTableName": "销售明细 (tableField_h1orvmyd)"
      }
    ]
  },
  "销售出库": {
    "formName": "销售出库",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "出库单号",
        "fieldId": "serialNumberField_h32kyjdw",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "出库日期",
        "fieldId": "dateField_h32l8nx4",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "销售订单",
        "fieldId": "associationFormField_h32ltvdk",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "销售订单号",
        "fieldId": "textField_h32lwn06",
        "index": "4"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "出库仓库",
        "fieldId": "associationFormField_h32l3fvn",
        "index": "5"
      },
      {
        "componentType": "TextField",
        "fieldName": "出库仓库名称",
        "fieldId": "textField_h32l6fo0",
        "index": "6"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "客户名称",
        "fieldId": "associationFormField_h32lns63",
        "index": "7"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户联系人",
        "fieldId": "textField_h32lxwkc",
        "index": "8"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户电话",
        "fieldId": "textField_h32ll8w4",
        "index": "9"
      },
      {
        "componentType": "NumberField",
        "fieldName": "出库总金额",
        "fieldId": "numberField_h32lkqlj",
        "index": "10"
      },
      {
        "componentType": "SelectField",
        "fieldName": "出库状态",
        "fieldId": "selectField_h32l9bs5",
        "index": "11"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h32la0rc",
        "index": "12"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_h32ls3qk",
        "index": "13"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_h32l0gt4",
        "index": "14"
      },
      {
        "index": "15",
        "componentType": "子表单",
        "fieldName": "出库明细 (tableField_h32lx5dn)",
        "fieldId": "tableField_出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "产品信息",
        "fieldId": "associationFormField_h32lxc51",
        "index": "15.1",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_h32l4ipo",
        "index": "15.2",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品规格",
        "fieldId": "textField_h32l54hl",
        "index": "15.3",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "销售数量",
        "fieldId": "numberField_h32l3y8b",
        "index": "15.4",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "出库数量",
        "fieldId": "numberField_h32ln0lg",
        "index": "15.5",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "出库单价",
        "fieldId": "numberField_h32lusb0",
        "index": "15.6",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "出库金额",
        "fieldId": "numberField_h32ly2y3",
        "index": "15.7",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h32lk6d4",
        "index": "15.8",
        "isSubTableField": true,
        "subTableName": "出库明细 (tableField_h32lx5dn)"
      }
    ]
  },
  "销售退货": {
    "formName": "销售退货",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "退货单号",
        "fieldId": "serialNumberField_h4irablb",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "退货日期",
        "fieldId": "dateField_h4ir8cun",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "销售订单",
        "fieldId": "associationFormField_h4irxyoj",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "销售订单号",
        "fieldId": "textField_h4irzme0",
        "index": "4"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "客户名称",
        "fieldId": "associationFormField_h4irc75s",
        "index": "5"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户联系人",
        "fieldId": "textField_h4ir7sc9",
        "index": "6"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户电话",
        "fieldId": "textField_h4iry64k",
        "index": "7"
      },
      {
        "componentType": "NumberField",
        "fieldName": "退货总金额",
        "fieldId": "numberField_h4ir2v1v",
        "index": "8"
      },
      {
        "componentType": "SelectField",
        "fieldName": "退货状态",
        "fieldId": "selectField_h4ir2x8q",
        "index": "9"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h4ir9ovq",
        "index": "10"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_h4is5s98",
        "index": "11"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_h4isvlzy",
        "index": "12"
      },
      {
        "index": "13",
        "componentType": "子表单",
        "fieldName": "退货明细 (tableField_h4isos7f)",
        "fieldId": "tableField_退货明细 (tableField_h4isos7f)"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "产品信息",
        "fieldId": "associationFormField_h4iseuig",
        "index": "13.1",
        "isSubTableField": true,
        "subTableName": "退货明细 (tableField_h4isos7f)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品名称",
        "fieldId": "textField_h4is6rua",
        "index": "13.2",
        "isSubTableField": true,
        "subTableName": "退货明细 (tableField_h4isos7f)"
      },
      {
        "componentType": "TextField",
        "fieldName": "产品规格",
        "fieldId": "textField_h4is3370",
        "index": "13.3",
        "isSubTableField": true,
        "subTableName": "退货明细 (tableField_h4isos7f)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "退货数量",
        "fieldId": "numberField_h4isv5et",
        "index": "13.4",
        "isSubTableField": true,
        "subTableName": "退货明细 (tableField_h4isos7f)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "退货单价",
        "fieldId": "numberField_h4isxqkv",
        "index": "13.5",
        "isSubTableField": true,
        "subTableName": "退货明细 (tableField_h4isos7f)"
      },
      {
        "componentType": "NumberField",
        "fieldName": "退货金额",
        "fieldId": "numberField_h4is01il",
        "index": "13.6",
        "isSubTableField": true,
        "subTableName": "退货明细 (tableField_h4isos7f)"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h4isr82a",
        "index": "13.7",
        "isSubTableField": true,
        "subTableName": "退货明细 (tableField_h4isos7f)"
      }
    ]
  },
  "收款登记": {
    "formName": "收款登记",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "收款编号",
        "fieldId": "serialNumberField_h5y0799f",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "收款日期",
        "fieldId": "dateField_h5y168bo",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "客户名称",
        "fieldId": "associationFormField_h5y1t8gx",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户联系人",
        "fieldId": "textField_h5y111o1",
        "index": "4"
      },
      {
        "componentType": "NumberField",
        "fieldName": "收款金额",
        "fieldId": "numberField_h5y19xn6",
        "index": "5"
      },
      {
        "componentType": "SelectField",
        "fieldName": "收款方式",
        "fieldId": "selectField_h5y1cvk4",
        "index": "6"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "关联订单",
        "fieldId": "associationFormField_h5y1lgrm",
        "index": "7"
      },
      {
        "componentType": "TextField",
        "fieldName": "关联订单号",
        "fieldId": "textField_h5y1zssb",
        "index": "8"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h5y13qb6",
        "index": "9"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_h5y1d8gn",
        "index": "10"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_h5y1savl",
        "index": "11"
      }
    ]
  },
  "开票登记": {
    "formName": "开票登记",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "开票编号",
        "fieldId": "serialNumberField_h7bdacc4",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "开票日期",
        "fieldId": "dateField_h7beo4qa",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "客户名称",
        "fieldId": "associationFormField_h7bev24z",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户联系人",
        "fieldId": "textField_h7be7qvt",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "客户电话",
        "fieldId": "textField_h7bex5dw",
        "index": "5"
      },
      {
        "componentType": "SelectField",
        "fieldName": "发票类型",
        "fieldId": "selectField_h7belek8",
        "index": "6"
      },
      {
        "componentType": "NumberField",
        "fieldName": "发票金额",
        "fieldId": "numberField_h7be9m84",
        "index": "7"
      },
      {
        "componentType": "NumberField",
        "fieldName": "税率",
        "fieldId": "numberField_h7becggo",
        "index": "8"
      },
      {
        "componentType": "NumberField",
        "fieldName": "税额",
        "fieldId": "numberField_h7bex9qc",
        "index": "9"
      },
      {
        "componentType": "NumberField",
        "fieldName": "价税合计",
        "fieldId": "numberField_h7ben5tz",
        "index": "10"
      },
      {
        "componentType": "TextField",
        "fieldName": "发票号码",
        "fieldId": "textField_h7bepv7j",
        "index": "11"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h7beqzb1",
        "index": "12"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_h7berfid",
        "index": "13"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_h7befr4t",
        "index": "14"
      }
    ]
  },
  "付款登记": {
    "formName": "付款登记",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "付款编号",
        "fieldId": "serialNumberField_h8nlu97e",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "付款日期",
        "fieldId": "dateField_h8nliffi",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "供应商",
        "fieldId": "associationFormField_h8nl8uli",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商联系人",
        "fieldId": "textField_h8nlms48",
        "index": "4"
      },
      {
        "componentType": "NumberField",
        "fieldName": "付款金额",
        "fieldId": "numberField_h8nlaaxk",
        "index": "5"
      },
      {
        "componentType": "SelectField",
        "fieldName": "付款方式",
        "fieldId": "selectField_h8nltpzh",
        "index": "6"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "关联订单",
        "fieldId": "associationFormField_h8nmic50",
        "index": "7"
      },
      {
        "componentType": "TextField",
        "fieldName": "关联订单号",
        "fieldId": "textField_h8nmbvc1",
        "index": "8"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_h8nm7mog",
        "index": "9"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_h8nm0nql",
        "index": "10"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_h8nmyomf",
        "index": "11"
      }
    ]
  },
  "收票登记": {
    "formName": "收票登记",
    "fields": [
      {
        "componentType": "SerialNumberField",
        "fieldName": "收票编号",
        "fieldId": "serialNumberField_ha0oxxvv",
        "index": "1"
      },
      {
        "componentType": "DateField",
        "fieldName": "收票日期",
        "fieldId": "dateField_ha0ph2gi",
        "index": "2"
      },
      {
        "componentType": "AssociationFormField",
        "fieldName": "供应商",
        "fieldId": "associationFormField_ha0ps5x1",
        "index": "3"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商联系人",
        "fieldId": "textField_ha0pbr5d",
        "index": "4"
      },
      {
        "componentType": "TextField",
        "fieldName": "供应商电话",
        "fieldId": "textField_ha0pb48z",
        "index": "5"
      },
      {
        "componentType": "SelectField",
        "fieldName": "发票类型",
        "fieldId": "selectField_ha0p85nr",
        "index": "6"
      },
      {
        "componentType": "NumberField",
        "fieldName": "发票金额",
        "fieldId": "numberField_ha0pbnlc",
        "index": "7"
      },
      {
        "componentType": "NumberField",
        "fieldName": "税率",
        "fieldId": "numberField_ha0pzaew",
        "index": "8"
      },
      {
        "componentType": "NumberField",
        "fieldName": "税额",
        "fieldId": "numberField_ha0p315u",
        "index": "9"
      },
      {
        "componentType": "NumberField",
        "fieldName": "价税合计",
        "fieldId": "numberField_ha0ptccv",
        "index": "10"
      },
      {
        "componentType": "TextField",
        "fieldName": "发票号码",
        "fieldId": "textField_ha0pvv61",
        "index": "11"
      },
      {
        "componentType": "TextareaField",
        "fieldName": "备注",
        "fieldId": "textareaField_ha0pf6fn",
        "index": "12"
      },
      {
        "componentType": "EmployeeField",
        "fieldName": "创建人",
        "fieldId": "employeeField_ha0pyd4i",
        "index": "13"
      },
      {
        "componentType": "DateField",
        "fieldName": "创建时间",
        "fieldId": "dateField_ha0ptt52",
        "index": "14"
      }
    ]
  }
};
