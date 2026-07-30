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
      "source": "/**\n* 尊敬的用户，你好：页面 JS 面板是高阶用法，一般不建议普通用户使用，如需使用，请确定你具备研发背景，能够自我排查问题。当然，你也可以咨询身边的技术顾问或者联系宜搭平台的技术支持获得服务（可能收费）。\n* 我们可以用 JS 面板来开发一些定制度高功能，比如：调用阿里云接口用来做图像识别、上报用户使用数据（如加载完成打点）等等。\n* 你可以点击面板上方的 「使用帮助」了解。\n*/\n\n// 当页面渲染完毕后马上调用下面的函数，这个函数是在当前页面 - 设置 - 生命周期 - 页面加载完成时中被关联的。\nexport function didMount() {\n  console.log(`「页面 JS」：当前545页面地址 ${location.href}`);\n  // console.log(`「页面 JS」：当前页面 id 参数为 ${this.state.urlParams.id}`);\n  // 更多 this 相关 API 请参考：https://www.yuque.com/yida/support/ocmxyv#OCEXd\n  // document.title = window.loginUser.userName + ' | 宜搭';\n  console.log(\"4654\")\n}",
      "compiled": "\"use strict\";\n\nexports.__esModule = true;\nexports.didMount = didMount;\n/**\n* 尊敬的用户，你好：页面 JS 面板是高阶用法，一般不建议普通用户使用，如需使用，请确定你具备研发背景，能够自我排查问题。当然，你也可以咨询身边的技术顾问或者联系宜搭平台的技术支持获得服务（可能收费）。\n* 我们可以用 JS 面板来开发一些定制度高功能，比如：调用阿里云接口用来做图像识别、上报用户使用数据（如加载完成打点）等等。\n* 你可以点击面板上方的 「使用帮助」了解。\n*/\n\n// 当页面渲染完毕后马上调用下面的函数，这个函数是在当前页面 - 设置 - 生命周期 - 页面加载完成时中被关联的。\nfunction didMount() {\n  console.log(\"\\u300C\\u9875\\u9762 JS\\u300D\\uFF1A\\u5F53\\u524D545\\u9875\\u9762\\u5730\\u5740 \" + location.href);\n  // console.log(`「页面 JS」：当前页面 id 参数为 ${this.state.urlParams.id}`);\n  // 更多 this 相关 API 请参考：https://www.yuque.com/yida/support/ocmxyv#OCEXd\n  // document.title = window.loginUser.userName + ' | 宜搭';\n  console.log(\"4654\");\n}\n"
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
          "id": "node_ocmrramlpl1",
          "props": {
            "templateVersion": "1.0.0",
            "pageStyle": {
              "backgroundColor": "#f2f3f5"
            },
            "titleName": {
              "type": "i18n",
              "zh_CN": "标题名称",
              "en_US": "title"
            },
            "titleDesc": {
              "type": "i18n",
              "zh_CN": "标题描述",
              "en_US": "title"
            },
            "titleColor": "light",
            "titleBg": "https://img.alicdn.com/imgextra/i2/O1CN0143ATPP1wIa9TrVvzN_!!6000000006285-2-tps-3360-400.png_.webp",
            "backgroundColorCustom": "#f1f2f3",
            "sizePc": "medium",
            "labelAlignPc": "top",
            "labelWidthPc": "130px",
            "labelWeightPc": "normal",
            "contentMargin": "12",
            "contentPadding": "20",
            "contentBgColor": "white",
            "showTitle": true,
            "labelAlignMobile": "top",
            "labelWidthMobile": "80px",
            "labelWeightMobile": "normal",
            "contentMarginMobile": "12",
            "contentPaddingMobile": "0",
            "contentBgColorMobile": "white",
            "className": "page_mrramyql"
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
          "methods": {
            "__initMethods__": {
              "type": "js",
              "source": "function (exports, module) { /*set actions code here*/ }",
              "compiled": "function (exports, module) { /*set actions code here*/ }"
            }
          },
          "lifeCycles": {
            "componentDidMount": {
              "id": "didMount",
              "name": "didMount",
              "params": {},
              "type": "actionRef"
            },
            "componentWillUnmount": "",
            "constructor": {
              "type": "js",
              "compiled": "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}",
              "source": "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}"
            }
          },
          "hidden": false,
          "title": "",
          "isLocked": false,
          "condition": true,
          "conditionGroup": "",
          "children": [
            {
              "componentName": "RootHeader",
              "id": "node_ocmrramlpl2",
              "props": {},
              "hidden": false,
              "title": "",
              "isLocked": false,
              "condition": true,
              "conditionGroup": ""
            },
            {
              "componentName": "RootContent",
              "id": "node_ocmrramlpl3",
              "props": {},
              "hidden": false,
              "title": "",
              "isLocked": false,
              "condition": true,
              "conditionGroup": "",
              "children": [
                {
                  "componentName": "FormContainer",
                  "id": "node_ocmrramlpl4",
                  "props": {
                    "columns": 1,
                    "labelAlign": "top",
                    "submitText": {
                      "type": "i18n",
                      "zh_CN": "提交",
                      "en_US": "Submit"
                    },
                    "stageText": {
                      "type": "i18n",
                      "zh_CN": "暂存",
                      "en_US": "Save"
                    },
                    "submitAndNewText": {
                      "type": "i18n",
                      "zh_CN": "提交并继续",
                      "en_US": "Submit and New"
                    },
                    "fieldId": "formContainer_mrramnrh",
                    "aiFormConfig": {
                      "systemPrompt": "",
                      "model": "qwen"
                    },
                    "beforeSubmit": false,
                    "afterSubmit": false,
                    "onProcessActionValidate": false,
                    "afterFormDataInit": false
                  },
                  "hidden": false,
                  "title": "",
                  "isLocked": false,
                  "condition": true,
                  "conditionGroup": "",
                  "children": [
                    {
                      "componentName": "TextField",
                      "id": "node_ocmrramlpl7",
                      "props": {
                        "__category__": "form",
                        "__useMediator": "value",
                        "label": {
                          "type": "i18n",
                          "zh_CN": "单行文本",
                          "en_US": "Text Field"
                        },
                        "labelAlign": "top",
                        "labelTextAlign": "left",
                        "placeholder": {
                          "type": "i18n",
                          "zh_CN": "请输入",
                          "en_US": "Please enter"
                        },
                        "tips": {
                          "zh_CN": "",
                          "en_US": "",
                          "type": "i18n"
                        },
                        "behavior": "NORMAL",
                        "complexValue": {
                          "complexType": "custom",
                          "value": {
                            "type": "i18n",
                            "en_US": "",
                            "zh_CN": ""
                          },
                          "formula": ""
                        },
                        "valueType": "custom",
                        "value": {
                          "type": "i18n",
                          "zh_CN": "",
                          "en_US": ""
                        },
                        "rows": 4,
                        "validationType": "text",
                        "hasClear": true,
                        "maxLength": 200,
                        "scanCode": {
                          "enabled": false,
                          "type": "all",
                          "editable": true
                        },
                        "validation": [],
                        "__gridSpan": 1,
                        "fieldId": "textField_mrramvft",
                        "visibility": [
                          "PC",
                          "MOBILE"
                        ],
                        "submittable": "DEFAULT",
                        "formula": "",
                        "linkage": "",
                        "variable": "",
                        "autoHeight": false,
                        "hasLimitHint": false,
                        "dataEntryMode": false,
                        "labelColSpan": 4
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
              "id": "node_ocmrramlpl5",
              "props": {},
              "hidden": false,
              "title": "",
              "isLocked": false,
              "condition": true,
              "conditionGroup": ""
            }
          ],
          "css": "body{background-color:#f2f3f5}"
        }
      ],
      "componentsMap": [
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "Page"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "RootHeader"
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
          "componentName": "RootFooter"
        },
        {
          "package": "@ali/vc-deep-yida",
          "version": "1.5.169",
          "componentName": "TextField"
        }
      ]
    }
  ]
}