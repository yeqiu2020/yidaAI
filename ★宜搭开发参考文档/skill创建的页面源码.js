{
  "schemaType": "superform",
  "schemaVersion": "5.0",
  "utils": [
    {
      "name": "legaoBuiltin",
      "type": "npm",
      "content": {
        "package": "@ali/vu-legao-builtin",
        "version": "3.0.0",
        "exportName": "legaoBuiltin"
      }
    },
    {
      "name": "yidaPlugin",
      "type": "npm",
      "content": {
        "package": "@ali/vu-yida-plugin",
        "version": "1.1.0",
        "exportName": "yidaPlugin"
      }
    }
  ],
  "actions": {
    "module": {
      "compiled": "'use strict';\n\nexports.__esModule = true;\nexports.didMount = didMount;\n/**\n * didMount 触发测试\n * 版本号: v1.0.0\n * 代码类型: formAction\n *\n * 用途：验证 JS 代码文件是否能被宜搭正确加载，didMount 是否能触发\n */\n\nfunction didMount() {\n  console.log('==== didMount triggered ====');\n  if (this.utils && this.utils.toast) {\n    this.utils.toast({ type: 'success', title: 'didMount 已触发' });\n  }\n}\n\n/**\n * ===== 宜搭内配置步骤 =====\n *\n * 【步骤一】添加 JS 代码\n * 1. 进入客户跟进「流程表单」设计器 → 顶部「JS代码」按钮\n * 2. 点击「添加文件」，文件名填：testDidMount\n * 3. 完整复制粘贴本代码 → 保存\n *\n * 【步骤二】保存并发布流程\n *\n * 【步骤三】预览测试\n * 1. 点击「预览」进入预览页面\n * 2. 按 F12 打开控制台\n * 3. 看是否有日志：==== didMount triggered ====\n * 4. 看页面是否弹出 toast：didMount 已触发\n *\n * 如果看不到日志和 toast，说明 JS 代码文件本身没有被加载，请检查：\n * - 文件是否已保存\n * - 流程是否已发布\n * - 预览页面是否强制刷新（Ctrl+F5）\n *\n * 代码版本号: v1.0.0\n */\n",
      "source": "/**\n * didMount 触发测试\n * 版本号: v1.0.0\n * 代码类型: formAction\n *\n * 用途：验证 JS 代码文件是否能被宜搭正确加载，didMount 是否能触发\n */\n\nexport function didMount() {\n  console.log('==== didMount triggered ====');\n  if (this.utils && this.utils.toast) {\n    this.utils.toast({ type: 'success', title: 'didMount 已触发' });\n  }\n}\n\n/**\n * ===== 宜搭内配置步骤 =====\n *\n * 【步骤一】添加 JS 代码\n * 1. 进入客户跟进「流程表单」设计器 → 顶部「JS代码」按钮\n * 2. 点击「添加文件」，文件名填：testDidMount\n * 3. 完整复制粘贴本代码 → 保存\n *\n * 【步骤二】保存并发布流程\n *\n * 【步骤三】预览测试\n * 1. 点击「预览」进入预览页面\n * 2. 按 F12 打开控制台\n * 3. 看是否有日志：==== didMount triggered ====\n * 4. 看页面是否弹出 toast：didMount 已触发\n *\n * 如果看不到日志和 toast，说明 JS 代码文件本身没有被加载，请检查：\n * - 文件是否已保存\n * - 流程是否已发布\n * - 预览页面是否强制刷新（Ctrl+F5）\n *\n * 代码版本号: v1.0.0\n */\n"
    },
    "type": "FUNCTION",
    "list": [
      {
        "id": "didMount",
        "title": "didMount"
      }
    ]
  },
  "pages": [
    {
      "componentsTree": [
        {
          "componentName": "Page",
          "id": "node_ocmrq8rudcj",
          "props": {
            "titleDesc": {
              "type": "i18n",
              "zh_CN": "标题描述",
              "en_US": "title"
            },
            "pageStyle": {
              "backgroundColor": "#f2f3f5"
            },
            "contentMargin": "20",
            "contentPadding": "20",
            "contentPaddingMobile": "0",
            "titleBg": "https://img.alicdn.com/imgextra/i2/O1CN0143ATPP1wIa9TrVvzN_!!6000000006285-2-tps-3360-400.png_.webp",
            "sizePc": "medium",
            "contentMarginMobile": "0",
            "className": "page_mrq8rudc",
            "labelAlignPc": "top",
            "contentBgColor": "white",
            "labelWidthPc": "130px",
            "titleName": {
              "type": "i18n",
              "zh_CN": "标题名称",
              "en_US": "title"
            },
            "titleColor": "light",
            "backgroundColorCustom": "#f1f2f3",
            "showTitle": false,
            "templateVersion": "1.0.0",
            "contentBgColorMobile": "white",
            "labelWeightMobile": "normal",
            "labelWidthMobile": "80px",
            "labelWeightPc": "normal",
            "labelAlignMobile": "top"
          },
          "condition": true,
          "css": "body{background-color:#f2f3f5}",
          "methods": {
            "__initMethods__": {
              "type": "js",
              "source": "function (exports, module) { /*set actions code here*/ }",
              "compiled": "function (exports, module) { /*set actions code here*/ }"
            }
          },
          "dataSource": {
            "offline": [],
            "globalConfig": {
              "fit": {
                "compiled": "'use strict';\n\nvar __preParser__ = function fit(response) {\n  var content = response.content !== undefined ? response.content : response;\n  var error = {\n    message: response.errorMsg || response.errors && response.errors[0] && response.errors[0].msg || response.content || '远程数据源请求出错，success is false'\n  };\n  var success = true;\n  if (response.success !== undefined) {\n    success = response.success;\n  } else if (response.hasError !== undefined) {\n    success = !response.hasError;\n  }\n  return {\n    content: content,\n    success: success,\n    error: error\n  };\n};",
                "source": "function fit(response) {\r\n  const content = (response.content !== undefined) ? response.content : response;\r\n  const error = {\r\n    message: response.errorMsg ||\r\n      (response.errors && response.errors[0] && response.errors[0].msg) ||\r\n      response.content || '远程数据源请求出错，success is false',\r\n  };\r\n  let success = true;\r\n  if (response.success !== undefined) {\r\n    success = response.success;\r\n  } else if (response.hasError !== undefined) {\r\n    success = !response.hasError;\r\n  }\r\n  return {\r\n    content,\r\n    success,\r\n    error,\r\n  };\r\n}",
                "type": "js",
                "error": {}
              }
            },
            "online": [],
            "list": [],
            "sync": true
          },
          "lifeCycles": {
            "constructor": {
              "type": "js",
              "compiled": "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}",
              "source": "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}"
            }
          },
          "hidden": false,
          "title": "",
          "isLocked": false,
          "conditionGroup": "",
          "children": [
            {
              "componentName": "RootHeader",
              "id": "node_ocmrq8rudck",
              "props": {},
              "condition": true,
              "hidden": false,
              "title": "",
              "isLocked": false,
              "conditionGroup": ""
            },
            {
              "componentName": "RootContent",
              "id": "node_ocmrq8rudcl",
              "props": {},
              "condition": true,
              "hidden": false,
              "title": "",
              "isLocked": false,
              "conditionGroup": "",
              "children": [
                {
                  "componentName": "FormContainer",
                  "id": "node_ocmrq8rudcm",
                  "props": {
                    "aiFormConfig": {
                      "systemPrompt": "",
                      "model": "qwen"
                    },
                    "columns": 2,
                    "beforeSubmit": false,
                    "submitText": {
                      "type": "i18n",
                      "zh_CN": "提交",
                      "en_US": "Submit"
                    },
                    "labelAlign": "top",
                    "stageText": {
                      "type": "i18n",
                      "zh_CN": "暂存",
                      "en_US": "Stage"
                    },
                    "afterFormDataInit": false,
                    "formLabelVisible": true,
                    "formLabel": {
                      "en_US": "客户跟进",
                      "zh_CN": "客户跟进",
                      "type": "i18n"
                    },
                    "submitAndNewText": {
                      "type": "i18n",
                      "zh_CN": "提交并继续",
                      "en_US": "Submit and New"
                    },
                    "onProcessActionValidate": false,
                    "fieldId": "formContainer_mrq8rudc",
                    "afterSubmit": false
                  },
                  "condition": true,
                  "hidden": false,
                  "title": "",
                  "isLocked": false,
                  "conditionGroup": "",
                  "children": [
                    {
                      "componentName": "SerialNumberField",
                      "id": "node_ocmrq8ruda1",
                      "props": {
                        "preview": "KH20260718001",
                        "__useMediator": "value",
                        "prefix": "KH",
                        "serialNumReset": 1,
                        "__gridSpan": 1,
                        "suffix": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "serialNumPreview": "KH20260718001",
                        "startValue": 1,
                        "placeholder": {
                          "en_US": "自动生成",
                          "zh_CN": "自动生成",
                          "type": "i18n"
                        },
                        "behavior": "READONLY",
                        "validation": [],
                        "fieldId": "serialNumberField_rudac69i",
                        "digit": 6,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "跟进编号",
                          "en_US": "SerialNumberField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "serialNumberRule": [
                          {
                            "dateFormat": "yyyyMMdd",
                            "timeZone": "+8",
                            "isFixedTips": "",
                            "__sid": "item_mrq8rudac1",
                            "__hide_delete__": false,
                            "resetPeriodTips": "",
                            "content": "KH",
                            "formField": "",
                            "emptyPlaceholder": "",
                            "resetPeriod": "noClean",
                            "ruleType": "character",
                            "__sid__": "serial_mrq8rudac1",
                            "digitCount": 4,
                            "isFixed": true,
                            "initialValue": 1
                          },
                          {
                            "dateFormat": "yyyyMMdd",
                            "timeZone": "+8",
                            "isFixedTips": "",
                            "__sid": "item_mrq8rudac2",
                            "__hide_delete__": false,
                            "resetPeriodTips": "",
                            "content": "",
                            "formField": "",
                            "emptyPlaceholder": "",
                            "resetPeriod": "noClean",
                            "ruleType": "date",
                            "__sid__": "serial_mrq8rudac2",
                            "digitCount": 4,
                            "isFixed": true,
                            "initialValue": 1
                          },
                          {
                            "dateFormat": "yyyyMMdd",
                            "timeZone": "+8",
                            "isFixedTips": "",
                            "__sid": "item_mrq8rudac3",
                            "__hide_delete__": true,
                            "resetPeriodTips": "",
                            "content": "",
                            "formField": "",
                            "emptyPlaceholder": "",
                            "resetPeriod": "noClean",
                            "ruleType": "autoCount",
                            "__sid__": "serial_mrq8rudac3",
                            "digitCount": 3,
                            "isFixed": true,
                            "initialValue": 1
                          }
                        ],
                        "resetPeriod": "never",
                        "size": "medium",
                        "labelAlign": "top",
                        "syncSerialConfig": false,
                        "formula": {
                          "expression": "SERIALNUMBER(\"ding55bd6d1d9e1aa9b924f2f5cc6abecb85\", \"APP_SX7LDRNQ84FJ3M4O1UJL\", \"FORM-DA3FFA460C9B44C4B8FEA4D34C2B0B322FBE\", \"serialNumberField_rudac69i\", \"{\\\"type\\\":\\\"custom\\\",\\\"value\\\":[{\\\"__hide_delete__\\\":false,\\\"ruleType\\\":\\\"character\\\",\\\"content\\\":\\\"KH\\\",\\\"formField\\\":\\\"\\\",\\\"emptyPlaceholder\\\":\\\"\\\",\\\"dateFormat\\\":\\\"yyyyMMdd\\\",\\\"timeZone\\\":\\\"+8\\\",\\\"digitCount\\\":4,\\\"isFixed\\\":true,\\\"isFixedTips\\\":\\\"\\\",\\\"resetPeriod\\\":\\\"noClean\\\",\\\"resetPeriodTips\\\":\\\"\\\",\\\"initialValue\\\":1,\\\"__sid\\\":\\\"item_mrq8rudac1\\\",\\\"__sid__\\\":\\\"serial_mrq8rudac1\\\"},{\\\"__hide_delete__\\\":false,\\\"ruleType\\\":\\\"date\\\",\\\"content\\\":\\\"\\\",\\\"formField\\\":\\\"\\\",\\\"emptyPlaceholder\\\":\\\"\\\",\\\"dateFormat\\\":\\\"yyyyMMdd\\\",\\\"timeZone\\\":\\\"+8\\\",\\\"digitCount\\\":4,\\\"isFixed\\\":true,\\\"isFixedTips\\\":\\\"\\\",\\\"resetPeriod\\\":\\\"noClean\\\",\\\"resetPeriodTips\\\":\\\"\\\",\\\"initialValue\\\":1,\\\"__sid\\\":\\\"item_mrq8rudac2\\\",\\\"__sid__\\\":\\\"serial_mrq8rudac2\\\"},{\\\"__hide_delete__\\\":true,\\\"ruleType\\\":\\\"autoCount\\\",\\\"content\\\":\\\"\\\",\\\"formField\\\":\\\"\\\",\\\"emptyPlaceholder\\\":\\\"\\\",\\\"dateFormat\\\":\\\"yyyyMMdd\\\",\\\"timeZone\\\":\\\"+8\\\",\\\"digitCount\\\":3,\\\"isFixed\\\":true,\\\"isFixedTips\\\":\\\"\\\",\\\"resetPeriod\\\":\\\"noClean\\\",\\\"resetPeriodTips\\\":\\\"\\\",\\\"initialValue\\\":1,\\\"__sid\\\":\\\"item_mrq8rudac3\\\",\\\"__sid__\\\":\\\"serial_mrq8rudac3\\\"}]}\")"
                        },
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "DateField",
                      "id": "node_ocmrq8rudb2",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "请选择"
                        },
                        "behavior": "NORMAL",
                        "resetTime": false,
                        "value": "",
                        "validation": [],
                        "fieldId": "dateField_rudb5eg0",
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "disabledDate": {
                          "type": "none"
                        },
                        "format": "YYYY-MM-DD",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "跟进日期",
                          "en_US": "DateField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": ""
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": ""
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "AssociationFormField",
                      "id": "node_ocmrq8rudb3",
                      "props": {
                        "dataFilterRules": {
                          "condition": "AND",
                          "rules": [],
                          "ruleId": "group-mrq8rudb",
                          "instanceFieldId": "",
                          "version": "v2"
                        },
                        "orderEnable": false,
                        "__useMediator": "value",
                        "hasClear": true,
                        "isShowSearchBar": true,
                        "dataFillingRules": {
                          "tableRules": [],
                          "mainRules": [
                            {
                              "sourceType": "TextField",
                              "targetType": "TextField",
                              "source": "textField_rsu44dez",
                              "target": "textField_rudblnkc"
                            },
                            {
                              "sourceType": "SelectField",
                              "targetType": "SelectField",
                              "source": "selectField_rsu4rgtu",
                              "target": "selectField_rudbj3i2"
                            },
                            {
                              "sourceType": "TextField",
                              "targetType": "TextField",
                              "source": "textField_rsu4kk08",
                              "target": "textField_rudbh4ki"
                            },
                            {
                              "sourceType": "TextField",
                              "targetType": "TextField",
                              "source": "textField_rsu4ws88",
                              "target": "textField_rudb62cw"
                            }
                          ],
                          "version": "v2",
                          "unmatched": []
                        },
                        "__gridSpan": 1,
                        "supportDataFilling": true,
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "associationForm": {
                          "formType": "receipt",
                          "formUuid": "FORM-AA370CCBCEAC44E195CED85367B16736NJJM",
                          "appName": "",
                          "mainFieldLabel": {
                            "en_US": "",
                            "zh_CN": "",
                            "type": "i18n"
                          },
                          "formTitle": {
                            "en_US": "客户信息",
                            "zh_CN": "客户信息",
                            "type": "i18n"
                          },
                          "subFieldId": "serialNumberField_rsu3v4xl",
                          "subComponentName": "SerialNumberField",
                          "mainFieldId": "textField_rsu44dez",
                          "appType": "APP_SX7LDRNQ84FJ3M4O1UJL",
                          "customTableFields": [],
                          "mainComponentName": "TextField",
                          "tableShowType": "all",
                          "linkageFields": []
                        },
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "请选择"
                        },
                        "behavior": "NORMAL",
                        "validation": [],
                        "fieldId": "associationFormField_rudbsgrq",
                        "supportDataFilter": false,
                        "notFoundContent": {
                          "type": "i18n",
                          "zh_CN": "无数据",
                          "en_US": "Not Found"
                        },
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "validateFilter": false,
                        "multiple": false,
                        "orderConfig": [],
                        "label": {
                          "type": "i18n",
                          "zh_CN": "选择客户",
                          "en_US": "AssociationFormField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "mobileQuickSearchMode": "AllField",
                        "__tableFieldId": "",
                        "size": "medium",
                        "labelAlign": "top",
                        "supportAdd": true,
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "TextField",
                      "id": "node_ocmrq8rudb4",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "validationType": "text",
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入",
                          "en_US": "请输入"
                        },
                        "behavior": "READONLY",
                        "value": {
                          "type": "i18n",
                          "zh_CN": "",
                          "en_US": ""
                        },
                        "validation": [],
                        "hasLimitHint": false,
                        "fieldId": "textField_rudblnkc",
                        "autoHeight": false,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "客户名称",
                          "en_US": "TextField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "rows": 1,
                        "scanCode": {
                          "enabled": false,
                          "type": "all",
                          "editable": true
                        },
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": {
                            "en_US": "",
                            "zh_CN": "",
                            "type": "i18n"
                          }
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "maxLength": 200,
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "SelectField",
                      "id": "node_ocmrq8rudb5",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "dataSourceLinkage": "",
                        "isUseDataSourceColor": false,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "mode": "single",
                        "reusePrivilege": false,
                        "showSearch": true,
                        "valueType": "custom",
                        "autoWidth": true,
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "please select"
                        },
                        "behavior": "READONLY",
                        "value": "",
                        "validation": [],
                        "fieldId": "selectField_rudbj3i2",
                        "searchConfig": {
                          "dataType": "jsonp",
                          "url": "",
                          "beforeFetch": "function willFetch(params) {\n  return params;\n}",
                          "afterFetch": "function didFetch(content) {\n  return content;\n}"
                        },
                        "notFoundContent": {
                          "type": "i18n",
                          "zh_CN": "无数据",
                          "en_US": "Not Found"
                        },
                        "relateColorRules": [],
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "客户类型",
                          "en_US": "SelectField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "relateColorRuleEnable": false,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": ""
                        },
                        "labelAlign": "top",
                        "filterLocal": true,
                        "variable": "",
                        "formula": "",
                        "dataSource": [
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "企业客户",
                              "type": "i18n"
                            },
                            "value": "企业客户",
                            "sid": "serial_mrq8rudb0"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "个人客户",
                              "type": "i18n"
                            },
                            "value": "个人客户",
                            "sid": "serial_mrq8rudb1"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "经销商",
                              "type": "i18n"
                            },
                            "value": "经销商",
                            "sid": "serial_mrq8rudb2"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "其他",
                              "type": "i18n"
                            },
                            "value": "其他",
                            "sid": "serial_mrq8rudb3"
                          }
                        ],
                        "defaultDataSource": {
                          "customStashOptions": [],
                          "complexType": "custom",
                          "options": [
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "企业客户",
                                "type": "i18n"
                              },
                              "value": "企业客户",
                              "sid": "serial_mrq8rudb0"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "个人客户",
                                "type": "i18n"
                              },
                              "value": "个人客户",
                              "sid": "serial_mrq8rudb1"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "经销商",
                                "type": "i18n"
                              },
                              "value": "经销商",
                              "sid": "serial_mrq8rudb2"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "其他",
                                "type": "i18n"
                              },
                              "value": "其他",
                              "sid": "serial_mrq8rudb3"
                            }
                          ],
                          "formula": {
                            "data": [],
                            "event": {
                              "onPageReady,onChange": []
                            }
                          },
                          "url": "",
                          "searchConfig": {
                            "afterFetch": "",
                            "type": "JSONP",
                            "beforeFetch": "",
                            "url": ""
                          }
                        },
                        "dataSourceType": "custom"
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "TextField",
                      "id": "node_ocmrq8rudb6",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "validationType": "text",
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入",
                          "en_US": "请输入"
                        },
                        "behavior": "READONLY",
                        "value": {
                          "type": "i18n",
                          "zh_CN": "",
                          "en_US": ""
                        },
                        "validation": [],
                        "hasLimitHint": false,
                        "fieldId": "textField_rudbh4ki",
                        "autoHeight": false,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "联系人",
                          "en_US": "TextField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "rows": 1,
                        "scanCode": {
                          "enabled": false,
                          "type": "all",
                          "editable": true
                        },
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": {
                            "en_US": "",
                            "zh_CN": "",
                            "type": "i18n"
                          }
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "maxLength": 200,
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "TextField",
                      "id": "node_ocmrq8rudb7",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "validationType": "text",
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入",
                          "en_US": "请输入"
                        },
                        "behavior": "READONLY",
                        "value": {
                          "type": "i18n",
                          "zh_CN": "",
                          "en_US": ""
                        },
                        "validation": [],
                        "hasLimitHint": false,
                        "fieldId": "textField_rudb62cw",
                        "autoHeight": false,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "联系电话",
                          "en_US": "TextField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "rows": 1,
                        "scanCode": {
                          "enabled": false,
                          "type": "all",
                          "editable": true
                        },
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": {
                            "en_US": "",
                            "zh_CN": "",
                            "type": "i18n"
                          }
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "maxLength": 200,
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "TextField",
                      "id": "node_ocmrq8rudb8",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "validationType": "text",
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入",
                          "en_US": "请输入"
                        },
                        "behavior": "READONLY",
                        "value": {
                          "type": "i18n",
                          "zh_CN": "",
                          "en_US": ""
                        },
                        "validation": [],
                        "hasLimitHint": false,
                        "fieldId": "textField_rudbb6pr",
                        "autoHeight": false,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "电子邮箱",
                          "en_US": "TextField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "rows": 1,
                        "scanCode": {
                          "enabled": false,
                          "type": "all",
                          "editable": true
                        },
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": {
                            "en_US": "",
                            "zh_CN": "",
                            "type": "i18n"
                          }
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "maxLength": 200,
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "AddressField",
                      "id": "node_ocmrq8rudb9",
                      "props": {
                        "countryScope": 1,
                        "optionAutoWidth": true,
                        "__useMediator": "value",
                        "hasClear": true,
                        "__gridSpan": 2,
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "enableLocation": true,
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "Please select region"
                        },
                        "behavior": "READONLY",
                        "value": {},
                        "validation": [],
                        "fieldId": "addressField_rudbe12f",
                        "countryMode": "default",
                        "subLabel": {
                          "type": "i18n",
                          "zh_CN": "详细地址",
                          "en_US": "详细地址"
                        },
                        "showCountry": false,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "addressType": "ADDRESS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "客户地址",
                          "en_US": "AddressField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "size": "medium",
                        "labelAlign": "top",
                        "detailPlaceholder": {
                          "type": "i18n",
                          "zh_CN": "请输入详细地址",
                          "en_US": "请输入详细地址"
                        }
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "SelectField",
                      "id": "node_ocmrq8rudba",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "dataSourceLinkage": "",
                        "isUseDataSourceColor": false,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "mode": "single",
                        "reusePrivilege": false,
                        "showSearch": true,
                        "valueType": "custom",
                        "autoWidth": true,
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "please select"
                        },
                        "behavior": "NORMAL",
                        "value": "",
                        "validation": [],
                        "fieldId": "selectField_rudbjw11",
                        "searchConfig": {
                          "dataType": "jsonp",
                          "url": "",
                          "beforeFetch": "function willFetch(params) {\n  return params;\n}",
                          "afterFetch": "function didFetch(content) {\n  return content;\n}"
                        },
                        "notFoundContent": {
                          "type": "i18n",
                          "zh_CN": "无数据",
                          "en_US": "Not Found"
                        },
                        "relateColorRules": [],
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "onChange": {
                          "type": "JSExpression",
                          "value": "this.utils.legaoBuiltin.execEventFlow.bind(this, [this.onFollowWayChange])",
                          "events": [
                            {
                              "name": "onFollowWayChange",
                              "id": "onFollowWayChange",
                              "params": {},
                              "type": "actionRef",
                              "uuid": "1784431875207_0"
                            }
                          ]
                        },
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "跟进方式",
                          "en_US": "SelectField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "relateColorRuleEnable": false,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": ""
                        },
                        "labelAlign": "top",
                        "filterLocal": true,
                        "variable": "",
                        "formula": "",
                        "dataSource": [
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "电话",
                              "type": "i18n"
                            },
                            "value": "电话",
                            "sid": "serial_mrq8rudb0",
                            "status": "active"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "邮件",
                              "type": "i18n"
                            },
                            "value": "邮件",
                            "sid": "serial_mrq8rudb1",
                            "status": "active"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "拜访",
                              "type": "i18n"
                            },
                            "value": "拜访",
                            "sid": "serial_mrq8rudb2",
                            "status": "active"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "微信",
                              "type": "i18n"
                            },
                            "value": "微信",
                            "sid": "serial_mrq8rudb3",
                            "status": "active"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "其他",
                              "type": "i18n"
                            },
                            "value": "其他",
                            "sid": "serial_mrq8rudb4",
                            "status": "active"
                          }
                        ],
                        "defaultDataSource": {
                          "customStashOptions": [],
                          "complexType": "custom",
                          "options": [
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "电话",
                                "type": "i18n"
                              },
                              "value": "电话",
                              "sid": "serial_mrq8rudb0",
                              "status": "active"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "邮件",
                                "type": "i18n"
                              },
                              "value": "邮件",
                              "sid": "serial_mrq8rudb1",
                              "status": "active"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "拜访",
                                "type": "i18n"
                              },
                              "value": "拜访",
                              "sid": "serial_mrq8rudb2",
                              "status": "active"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "微信",
                                "type": "i18n"
                              },
                              "value": "微信",
                              "sid": "serial_mrq8rudb3",
                              "status": "active"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "其他",
                                "type": "i18n"
                              },
                              "value": "其他",
                              "sid": "serial_mrq8rudb4",
                              "status": "active"
                            }
                          ],
                          "formula": {
                            "data": [],
                            "event": {
                              "onPageReady,onChange": []
                            }
                          },
                          "url": "",
                          "searchConfig": {
                            "afterFetch": "",
                            "type": "JSONP",
                            "beforeFetch": "",
                            "url": ""
                          }
                        },
                        "dataSourceType": "custom"
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "SelectField",
                      "id": "node_ocmrq8rudbf",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "dataSourceLinkage": "",
                        "isUseDataSourceColor": false,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "mode": "single",
                        "reusePrivilege": false,
                        "showSearch": true,
                        "valueType": "custom",
                        "autoWidth": true,
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "please select"
                        },
                        "behavior": "NORMAL",
                        "value": "",
                        "validation": [],
                        "fieldId": "selectField_rudbbepq",
                        "searchConfig": {
                          "dataType": "jsonp",
                          "url": "",
                          "beforeFetch": "function willFetch(params) {\n  return params;\n}",
                          "afterFetch": "function didFetch(content) {\n  return content;\n}"
                        },
                        "notFoundContent": {
                          "type": "i18n",
                          "zh_CN": "无数据",
                          "en_US": "Not Found"
                        },
                        "relateColorRules": [],
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "跟进状态",
                          "en_US": "SelectField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "relateColorRuleEnable": false,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": ""
                        },
                        "labelAlign": "top",
                        "filterLocal": true,
                        "variable": "",
                        "formula": "",
                        "dataSource": [
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "计划中",
                              "type": "i18n"
                            },
                            "value": "计划中",
                            "sid": "serial_mrq8rudb0",
                            "status": "active"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "已完成",
                              "type": "i18n"
                            },
                            "value": "已完成",
                            "sid": "serial_mrq8rudb1",
                            "status": "active"
                          },
                          {
                            "defaultChecked": false,
                            "text": {
                              "en_US": "Option",
                              "zh_CN": "已取消",
                              "type": "i18n"
                            },
                            "value": "已取消",
                            "sid": "serial_mrq8rudb2",
                            "status": "active"
                          }
                        ],
                        "defaultDataSource": {
                          "customStashOptions": [],
                          "complexType": "custom",
                          "options": [
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "计划中",
                                "type": "i18n"
                              },
                              "value": "计划中",
                              "sid": "serial_mrq8rudb0",
                              "status": "active"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "已完成",
                                "type": "i18n"
                              },
                              "value": "已完成",
                              "sid": "serial_mrq8rudb1",
                              "status": "active"
                            },
                            {
                              "defaultChecked": false,
                              "text": {
                                "en_US": "Option",
                                "zh_CN": "已取消",
                                "type": "i18n"
                              },
                              "value": "已取消",
                              "sid": "serial_mrq8rudb2",
                              "status": "active"
                            }
                          ],
                          "formula": {
                            "data": [],
                            "event": {
                              "onPageReady,onChange": []
                            }
                          },
                          "url": "",
                          "searchConfig": {
                            "afterFetch": "",
                            "type": "JSONP",
                            "beforeFetch": "",
                            "url": ""
                          }
                        },
                        "dataSourceType": "custom"
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "TextareaField",
                      "id": "node_ocmrq8rudbb",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "validationType": "text",
                        "__gridSpan": 2,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入",
                          "en_US": "请输入"
                        },
                        "behavior": "NORMAL",
                        "value": {
                          "type": "i18n",
                          "zh_CN": "",
                          "en_US": ""
                        },
                        "validation": [],
                        "hasLimitHint": false,
                        "fieldId": "textareaField_rudb734l",
                        "htmlType": "textarea",
                        "autoHeight": false,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "onChange": {
                          "type": "JSExpression",
                          "value": "this.utils.legaoBuiltin.execEventFlow.bind(this, [this.onFollowContentChange])",
                          "events": [
                            {
                              "name": "onFollowContentChange",
                              "id": "onFollowContentChange",
                              "params": {},
                              "type": "actionRef",
                              "uuid": "1784431887471_3"
                            }
                          ]
                        },
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "跟进内容",
                          "en_US": "TextareaField"
                        },
                        "showEmptyRows": false,
                        "__category__": "form",
                        "labelColSpan": 4,
                        "rows": 4,
                        "scanCode": {
                          "editable": true,
                          "type": "all",
                          "enabled": false
                        },
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": {
                            "en_US": "",
                            "zh_CN": "",
                            "type": "i18n"
                          }
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "maxLength": 200,
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "DateField",
                      "id": "node_ocmrq8rudbc",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "请选择"
                        },
                        "behavior": "NORMAL",
                        "resetTime": false,
                        "value": "",
                        "validation": [],
                        "fieldId": "dateField_rudbmlsy",
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "disabledDate": {
                          "type": "none"
                        },
                        "format": "YYYY-MM-DD",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "下次跟进日期",
                          "en_US": "DateField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": ""
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": ""
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "EmployeeField",
                      "id": "node_ocmrq8rudbd",
                      "props": {
                        "closeOnSelect": false,
                        "__useMediator": "value",
                        "hasClear": true,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "userRangeType": "ALL",
                        "userRange": [],
                        "useAliworkUrl": false,
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "showEmplId": false,
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "请选择"
                        },
                        "behavior": "NORMAL",
                        "value": [],
                        "validation": [],
                        "fieldId": "employeeField_rudb3n24",
                        "startWithDepartmentId": "SELF",
                        "roleRange": [],
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "multiple": false,
                        "label": {
                          "type": "i18n",
                          "zh_CN": "跟进人",
                          "en_US": "EmployeeField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": []
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "showEmpIdType": "NAME",
                        "renderLinkForView": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "DepartmentSelectField",
                      "id": "node_ocmrq8rudbe",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "mode": "single",
                        "valueType": "custom",
                        "deptRange": [],
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入关键字进行搜索",
                          "en_US": "请输入关键字进行搜索"
                        },
                        "behavior": "NORMAL",
                        "value": [],
                        "validation": [],
                        "fieldId": "departmentSelectField_rudbzlbk",
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "isShowDeptFullName": false,
                        "multiple": false,
                        "label": {
                          "type": "i18n",
                          "zh_CN": "跟进人部门",
                          "en_US": "DepartmentSelectField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "deptRangeType": "ALL",
                        "hasSelectAll": false,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": []
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "dataSource": {
                          "searchConfig": {
                            "dataType": "json",
                            "url": "/query/deptService/searchDepts.json",
                            "beforeFetch": "function willFetch(data) {\n  data.key = data.key || data.q || \"\";\n  return data;\n}",
                            "afterFetch": "function didFetch(content) {\n  var data = [];\n  if (content && content.values) {\n    content.values.forEach(function (item) {\n      data.push({ value: item.emplId, text: item.name, deptFullPath: item.deptFullPath });\n    });\n  }\n  return data;\n}"
                          }
                        }
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "TextareaField",
                      "id": "node_ocmrq8rudbg",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "validationType": "text",
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入",
                          "en_US": "请输入"
                        },
                        "behavior": "NORMAL",
                        "value": {
                          "type": "i18n",
                          "zh_CN": "",
                          "en_US": ""
                        },
                        "validation": [],
                        "hasLimitHint": false,
                        "fieldId": "textareaField_rudbxrek",
                        "htmlType": "textarea",
                        "autoHeight": false,
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "备注",
                          "en_US": "TextareaField"
                        },
                        "showEmptyRows": false,
                        "__category__": "form",
                        "labelColSpan": 4,
                        "rows": 4,
                        "scanCode": {
                          "editable": true,
                          "type": "all",
                          "enabled": false
                        },
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": {
                            "en_US": "",
                            "zh_CN": "",
                            "type": "i18n"
                          }
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "maxLength": 200,
                        "isCustomStore": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "EmployeeField",
                      "id": "node_ocmrq8rudbh",
                      "props": {
                        "closeOnSelect": false,
                        "__useMediator": "value",
                        "hasClear": true,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "userRangeType": "ALL",
                        "userRange": [],
                        "useAliworkUrl": false,
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "showEmplId": false,
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "请选择"
                        },
                        "behavior": "READONLY",
                        "value": [],
                        "validation": [],
                        "fieldId": "employeeField_rudbswi3",
                        "startWithDepartmentId": "SELF",
                        "roleRange": [],
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "multiple": false,
                        "label": {
                          "type": "i18n",
                          "zh_CN": "创建人",
                          "en_US": "EmployeeField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": []
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": "",
                        "showEmpIdType": "NAME",
                        "renderLinkForView": true
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    },
                    {
                      "componentName": "DateField",
                      "id": "node_ocmrq8rudbi",
                      "props": {
                        "__useMediator": "value",
                        "hasClear": true,
                        "__gridSpan": 1,
                        "linkage": "",
                        "tips": {
                          "en_US": "",
                          "zh_CN": "",
                          "type": "i18n"
                        },
                        "valueType": "custom",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请选择",
                          "en_US": "请选择"
                        },
                        "behavior": "READONLY",
                        "resetTime": false,
                        "value": "",
                        "validation": [],
                        "fieldId": "dateField_rudbxptm",
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "dataEntryMode": false,
                        "submittable": "ALWAYS",
                        "disabledDate": {
                          "type": "none"
                        },
                        "format": "YYYY-MM-DD",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "创建时间",
                          "en_US": "DateField"
                        },
                        "__category__": "form",
                        "labelColSpan": 4,
                        "size": "medium",
                        "complexValue": {
                          "complexType": "custom",
                          "formula": "",
                          "value": ""
                        },
                        "labelAlign": "top",
                        "variable": "",
                        "formula": ""
                      },
                      "condition": true,
                      "hidden": false,
                      "title": "",
                      "isLocked": false,
                      "conditionGroup": ""
                    }
                  ]
                }
              ]
            },
            {
              "componentName": "RootFooter",
              "id": "node_ocmrq8rudcn",
              "props": {},
              "condition": true,
              "hidden": false,
              "title": "",
              "isLocked": false,
              "conditionGroup": "",
              "children": [
                {
                  "componentName": "FooterYida",
                  "id": "node_ocmrq8rudco",
                  "props": {},
                  "condition": true,
                  "hidden": false,
                  "title": "",
                  "isLocked": false,
                  "conditionGroup": ""
                }
              ]
            }
          ]
        }
      ],
      "componentsMap": [
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "RootHeader"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "SerialNumberField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "DateField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "AssociationFormField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "TextField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "SelectField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "AddressField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "TextareaField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "EmployeeField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "DepartmentSelectField"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "FormContainer"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "RootContent"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "FooterYida"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "RootFooter"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "Page"
        }
      ]
    }
  ]
}