/**
 * schema_builder.js - 宜搭表单Schema构建器
 * 版本: 1.4.0
 * 更新日期: 2026-07-28
 *
 * v1.4.0: 【根因修复】AssociationFormField 兜底生成 FORM-TEMP 占位符时不再静默
 *         - 事故背景（进销存3）：上游未传 associationForm.formUuid 时此处静默生成
 *           FORM-TEMP-* 占位符（formTitle/appType 也为空），无任何告警，
 *           带病交付后线上点"新增"必报"表单不存在"。
 *         - 修复：兜底分支同步输出显式 console.warn，明确告知字段名、占位符值与后果，
 *           配合 create_from_markdown.js v2.20.0 的建表前校验与建表后自检形成多层防御。
 *
 * v1.3.0: 【关键修复】添加 componentDidMount 和 componentWillUnmount 生命周期钩子
 *         - 修复前：lifeCycles 只有 constructor，缺少 componentDidMount(actionRef → didMount)
 *         - 导致API创建的表单中页面JS代码的 didMount 永远不会被调用
 *         - 修复后：lifeCycles 包含 componentDidMount(指向didMount)、componentWillUnmount("")、constructor
 *         - 与宜搭手动创建的表单schema结构完全一致
 *         - 影响范围：所有通过form_creator创建的表单
 *
 * v1.2.0: 【关键修复】SerialNumberField完整实现serialNumberRule数组配置
 *         - 修复前：SerialNumberField只设置基础属性，未构建serialNumberRule数组
 *         - 修复后：构建3规则数组（character+date+autoCount），生成正确的流水号预览
 *         - 影响范围：所有通过form_creator创建的包含流水号字段的表单
 *
 * v1.1.0: 初始版本
 *
 * 功能: 将字段定义转换为宜搭标准的表单Schema
 */

// ==================== ID生成器 ====================

let nodeIdCounter = 1;

function nextNodeId() {
  return "node_oc" + Date.now().toString(36) + (nodeIdCounter++).toString(36);
}

function generateFieldId(componentName) {
  const prefix = componentName.charAt(0).toLowerCase() + componentName.slice(1);
  const timePart = Date.now().toString(36).slice(-4);
  const randomPart = Math.random().toString(36).substring(2, 6);
  return prefix + "_" + timePart + randomPart;
}

// ==================== i18n 工具 ====================

function i18n(text, enText) {
  return { type: "i18n", zh_CN: text, en_US: enText || text };
}

// ==================== 选项数据源构建 ====================

function buildOptionDataSource(options) {
  return options.map((optionText, index) => ({
    defaultChecked: false,
    text: i18n(optionText, "Option"),
    value: optionText,
    sid: "serial_" + Date.now().toString(36) + index
  }));
}

// ==================== 字段组件构建 ====================

// 选项类字段类型
const OPTION_FIELD_TYPES = ["RadioField", "SelectField", "CheckboxField", "MultiSelectField"];

/**
 * 构建字段组件
 * @param {Object} field - 字段定义
 * @returns {Object} 组件配置
 */
function buildFieldComponent(field) {
  let componentName = field.type;
  let fieldId = field.fieldId || generateFieldId(componentName);
  const nodeId = nextNodeId();

  // 基础校验规则
  const validation = [];
  if (field.required) {
    validation.push({ type: "required" });
  }

  // 基础props
  const props = {
    __useMediator: "value",
    fieldId: fieldId,
    label: i18n(field.label, componentName),
    __category__: "form",
    behavior: field.behavior || "NORMAL",
    visibility: field.visibility || ["PC", "MOBILE"],
    dataEntryMode: false,
    submittable: "DEFAULT",
    validation: validation,
    labelAlign: field.labelAlign || "top",
    labelTextAlign: "left",
    labelColSpan: 4,
    size: "medium",
    submittable: "ALWAYS"
  };

  // 根据字段类型设置特定属性
  // 公共：将字段说明写入 tips（关联字段的 tips 只包含关联目标，不包含填充规则）
  if (field.description) {
    let tipsContent = field.description;
    // 关联表单字段：去掉填充规则部分，只保留关联目标
    if (field.type === 'AssociationFormField' && tipsContent) {
      const semiIndex = tipsContent.indexOf('；');
      if (semiIndex > 0) {
        tipsContent = tipsContent.substring(0, semiIndex);
      }
    }
    props.tips = i18n(tipsContent, "");
  }

  switch (componentName) {
    case "TextField":
    case "TextareaField":
      props.hasClear = true;
      props.placeholder = field.placeholder ? i18n(field.placeholder) : i18n("请输入");
      props.valueType = "custom";
      props.validationType = "text";
      props.value = i18n("", "");
      props.hasLimitHint = false;
      props.maxLength = field.maxLength || 200;
      props.rows = componentName === "TextareaField" ? 4 : 1;
      props.isCustomStore = true;
      props.scanCode = { enabled: false, type: "all", editable: true };
      break;

    case "NumberField":
      props.hasClear = true;
      props.placeholder = field.placeholder ? i18n(field.placeholder) : i18n("请输入数字");
      props.valueType = "custom";
      props.precision = field.precision || 0;
      props.step = field.step || 1;
      props.thousandsSeparators = field.thousandsSeparators || false;
      props.innerAfter = field.unit || "";
      props.isCustomStore = true;
      break;

    case "DateField":
      props.placeholder = field.placeholder ? i18n(field.placeholder) : i18n("请选择");
      props.format = field.format || "YYYY-MM-DD";
      props.hasClear = true;
      props.disabledDate = { type: "none" };
      props.valueType = "custom";
      props.resetTime = false;
      break;

    case "SelectField":
    case "MultiSelectField":
    case "RadioField":
    case "CheckboxField":
      const options = field.options || ["选项一", "选项二", "选项三"];
      const dataSource = buildOptionDataSource(options);
      props.dataSource = dataSource;
      props.dataSourceType = "custom";
      props.defaultDataSource = {
        customStashOptions: [],
        complexType: "custom",
        options: dataSource,
        formula: { data: [], event: { "onPageReady,onChange": [] } },
        url: "",
        searchConfig: { afterFetch: "", type: "JSONP", beforeFetch: "", url: "" }
      };
      if (componentName === "SelectField" || componentName === "MultiSelectField") {
        props.hasClear = true;
        props.showSearch = true;
        props.mode = componentName === "SelectField" ? "single" : "multiple";
      }
      break;

    case "EmployeeField":
      props.placeholder = i18n("请选择");
      props.multiple = field.multiple || false;
      props.userRangeType = "ALL";
      props.showEmpIdType = "NAME";
      props.startWithDepartmentId = "SELF";
      props.renderLinkForView = true;
      break;

    case "DepartmentSelectField":
      props.placeholder = i18n("请输入关键字进行搜索");
      props.multiple = field.multiple || false;
      props.deptRangeType = "ALL";
      props.mode = "single";
      break;

    case "TableField":
      props.showIndex = true;
      props.addButtonText = i18n("新增一项");
      props.delButtonText = i18n("删除");
      props.copyButtonText = i18n("复制");
      props.pageSize = 20;
      props.maxItems = 500;
      props.minItems = 1;
      props.theme = "split";
      props.layout = "TABLE";
      props.showActions = true;
      props.showDelAction = true;
      props.showCopyAction = false;
      props.enableExport = true;
      props.enableImport = true;
      break;

    case "AttachmentField":
      props.type = "normal";
      props.listType = "text";
      props.buttonText = i18n("上传文件");
      props.multiple = true;
      props.limit = field.limit || 9;
      props.maxFileSize = field.maxFileSize || 100;
      props.autoUpload = true;
      break;

    case "ImageField":
      props.type = "normal";
      props.listType = "image";
      props.buttonText = i18n("图片上传");
      props.multiple = true;
      props.limit = field.limit || 9;
      props.maxFileSize = field.maxFileSize || 50;
      props.autoUpload = true;
      props.accept = "image/*";
      break;

    case "AssociationFormField":
      props.placeholder = i18n("请选择");
      props.hasClear = true;
      props.multiple = field.multiple || false;
      props.isCustomStore = true;
      props.isShowSearchBar = true;
      props.__gridSpan = 1;
      // tips 已在公共部分根据 field.description 设置，此处不再覆盖为空
      props.notFoundContent = i18n("无数据", "Not Found");
      props.dataEntryMode = false;
      props.submittable = "ALWAYS";
      props.validateFilter = false;
      props.__useMediator = "value";
      
      // 使用占位符UUID或传入的UUID
      // v1.4.0: 兜底生成占位符时必须显式告警，禁止静默产出"表单不存在"的坏关联字段
      let formUuid;
      if (field.associationForm && field.associationForm.formUuid) {
        formUuid = field.associationForm.formUuid;
      } else {
        formUuid = `FORM-TEMP-${Date.now().toString(36).toUpperCase()}`;
        console.warn(`⚠️  [schema_builder] 关联表单字段 "${field.label || '(未命名)'}" 未提供 associationForm.formUuid，已生成占位符 ${formUuid}。`);
        console.warn(`    后果：该字段在线上点击"新增"会报"表单不存在"，必须回填真实 formUuid！`);
      }
      
      let formTitle = (field.associationForm && field.associationForm.formTitle) || "";
      if (typeof formTitle === 'string') {
        formTitle = i18n(formTitle);
      }
      
      props.associationForm = {
        formType: (field.associationForm && field.associationForm.formType) || "receipt",
        formUuid: formUuid,
        appType: (field.associationForm && field.associationForm.appType) || "",
        appName: (field.associationForm && field.associationForm.appName) || "",
        formTitle: formTitle,
        mainFieldId: (field.associationForm && field.associationForm.mainFieldId) || "",
        mainFieldLabel: i18n("", ""),
        mainComponentName: (field.associationForm && field.associationForm.mainComponentName) || "TextField",
        tableShowType: "all",
        customTableFields: [],
        subFieldId: "",
        subComponentName: "",
        linkageFields: []
      };
      
      props.dataFilterRules = {
        condition: "AND",
        rules: [],
        ruleId: "group-" + Date.now().toString(36),
        instanceFieldId: "",
        version: "v2"
      };
      props.supportDataFilter = false;
      
      props.dataFillingRules = {
        mainRules: [],
        tableRules: [],
        version: "v2"
      };
      props.supportDataFilling = false;
      
      props.orderEnable = false;
      props.orderConfig = [];
      break;

    case "AddressField":
      props.countryMode = "default";
      props.countryScope = 1;
      props.addressType = "ADDRESS";
      props.subLabel = i18n("详细地址");
      props.detailPlaceholder = i18n("请输入详细地址");
      props.hasClear = true;
      props.enableLocation = true;
      break;

    case "RateField":
      props.count = field.count || 5;
      props.allowHalf = field.allowHalf || false;
      props.showGrade = false;
      break;

    case "SerialNumberField": {
      const snPrefix = field.prefix || field.serialPrefix || "SN";
      const snDigitCount = field.digitCount || 3;
      const snDatePattern = field.datePattern || "yyyyMMdd";
      const snInitialValue = field.startValue || field.initialValue || 1;
      const snResetPeriod = field.resetPeriod || "noClean";

      // 生成 serialNumberRule 数组（固定字符 + 日期 + 自动计数）
      const ts = Date.now().toString(36);
      const snRule = [
        {
          __hide_delete__: false,
          ruleType: 'character',
          content: snPrefix,
          formField: '',
          emptyPlaceholder: '',
          dateFormat: snDatePattern,
          timeZone: '+8',
          digitCount: 4,
          isFixed: true,
          isFixedTips: '',
          resetPeriod: snResetPeriod,
          resetPeriodTips: '',
          initialValue: snInitialValue,
          __sid: `item_${ts}c1`,
          __sid__: `serial_${ts}c1`
        },
        {
          __hide_delete__: false,
          ruleType: 'date',
          content: '',
          formField: '',
          emptyPlaceholder: '',
          dateFormat: snDatePattern,
          timeZone: '+8',
          digitCount: 4,
          isFixed: true,
          isFixedTips: '',
          resetPeriod: snResetPeriod,
          resetPeriodTips: '',
          initialValue: snInitialValue,
          __sid: `item_${ts}c2`,
          __sid__: `serial_${ts}c2`
        },
        {
          __hide_delete__: true,
          ruleType: 'autoCount',
          content: '',
          formField: '',
          emptyPlaceholder: '',
          dateFormat: snDatePattern,
          timeZone: '+8',
          digitCount: snDigitCount,
          isFixed: true,
          isFixedTips: '',
          resetPeriod: snResetPeriod,
          resetPeriodTips: '',
          initialValue: snInitialValue,
          __sid: `item_${ts}c3`,
          __sid__: `serial_${ts}c3`
        }
      ];

      // 生成预览值
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}${mm}${dd}`;
      const countStr = String(snInitialValue).padStart(snDigitCount, '0');
      const snPreview = `${snPrefix}${dateStr}${countStr}`;

      props.prefix = snPrefix;
      props.suffix = field.suffix || "";
      props.digit = snDigitCount + 3;
      props.startValue = snInitialValue;
      props.resetPeriod = "never";
      props.serialNumReset = 1;
      props.serialNumPreview = snPreview;
      props.serialNumberRule = snRule;
      props.syncSerialConfig = false;
      props.preview = snPreview;
      props.placeholder = i18n("自动生成");
      props.valueType = "custom";
      props.isCustomStore = true;
      props.behavior = "READONLY";
      props.validation = [];
      break;
    }
  }

  const component = {
    componentName: componentName,
    id: nodeId,
    fieldId: fieldId,
    props: props,
    condition: true,
    hidden: false,
    title: "",
    isLocked: false,
    conditionGroup: ""
  };

  // 处理子表字段
  if (componentName === "TableField" && field.children) {
    component.children = field.children.map(child => buildFieldComponent(child));
  }

  return component;
}

// ==================== 组件收集 ====================

function collectComponentNames(fields) {
  const names = new Set(["Page", "RootHeader", "RootContent", "RootFooter", "FooterYida", "FormContainer"]);
  fields.forEach(field => {
    names.add(field.type);
    if (field.type === "TableField" && field.children) {
      field.children.forEach(child => names.add(child.type));
    }
  });
  return Array.from(names);
}

function buildComponentsMap(componentNames) {
  return componentNames.map(name => ({
    package: "@ali/vc-deep-yida",
    version: "1.5.169",
    componentName: name
  }));
}

// ==================== Schema构建 ====================

/**
 * 构建表单Schema
 * @param {string} formTitle - 表单标题
 * @param {Array} fields - 字段定义数组
 * @param {string} formUuid - 表单UUID
 * @returns {Object} 完整的表单Schema
 */
function buildFormSchema(formTitle, fields, formUuid) {
  const fieldComponents = fields.map(field => buildFieldComponent(field));
  const componentNames = collectComponentNames(fields);

  // 构造函数代码
  const constructorCode = `function constructor() {
var module = { exports: {} };
var _this = this;
this.__initMethods__(module.exports, module);
Object.keys(module.exports).forEach(function(item) {
  if(typeof module.exports[item] === 'function'){
    _this[item] = module.exports[item];
  }
});

}`;

  // actions代码
  const actionsCompiled = `"use strict";

exports.__esModule = true;
exports.didMount = didMount;
function didMount() {
  console.log("\u300C\u9875\u9762 JS\u300D\uFF1A\u5F53\u524D\u9875\u9762\u5730\u5740 " + location.href);
}
`;
  const actionsSource = `export function didMount() {
  console.log(\`「页面 JS」：当前页面地址 \${location.href}\`);
}`;

  // Page组件树
  const pageComponentsTree = [
    {
      componentName: "Page",
      id: nextNodeId(),
      props: {
        contentBgColor: "white",
        pageStyle: { backgroundColor: "#f2f3f5" },
        contentMargin: "20",
        contentPadding: "20",
        showTitle: false,
        contentPaddingMobile: "0",
        templateVersion: "1.0.0",
        contentMarginMobile: "0",
        className: "page_" + Date.now().toString(36),
        contentBgColorMobile: "white",
        titleName: i18n("标题名称", "title"),
        titleDesc: i18n("标题描述", "title"),
        titleColor: "light",
        titleBg: "https://img.alicdn.com/imgextra/i2/O1CN0143ATPP1wIa9TrVvzN_!!6000000006285-2-tps-3360-400.png_.webp",
        backgroundColorCustom: "#f1f2f3",
        sizePc: "medium",
        labelAlignPc: "top",
        labelWidthPc: "130px",
        labelWeightPc: "normal",
        labelAlignMobile: "top",
        labelWidthMobile: "80px",
        labelWeightMobile: "normal"
      },
      condition: true,
      css: "body{background-color:#f2f3f5}",
      methods: {
        __initMethods__: {
          type: "js",
          source: "function (exports, module) { /*set actions code here*/ }",
          compiled: "function (exports, module) { /*set actions code here*/ }"
        }
      },
      dataSource: {
        offline: [],
        globalConfig: {
          fit: {
            compiled: "'use strict';\n\nvar __preParser__ = function fit(response) {\n  var content = response.content !== undefined ? response.content : response;\n  var error = {\n    message: response.errorMsg || response.errors && response.errors[0] && response.errors[0].msg || response.content || '远程数据源请求出错，success is false'\n  };\n  var success = true;\n  if (response.success !== undefined) {\n    success = response.success;\n  } else if (response.hasError !== undefined) {\n    success = !response.hasError;\n  }\n  return {\n    content: content,\n    success: success,\n    error: error\n  };\n};",
            source: "function fit(response) {\r\n  const content = (response.content !== undefined) ? response.content : response;\r\n  const error = {\r\n    message: response.errorMsg ||\r\n      (response.errors && response.errors[0] && response.errors[0].msg) ||\r\n      response.content || '远程数据源请求出错，success is false',\r\n  };\r\n  let success = true;\r\n  if (response.success !== undefined) {\r\n    success = response.success;\r\n  } else if (response.hasError !== undefined) {\r\n    success = !response.hasError;\r\n  }\r\n  return {\r\n    content,\r\n    success,\r\n    error,\r\n  };\r\n}",
            type: "js",
            error: {}
          }
        },
        online: [],
        list: [],
        sync: true
      },
      lifeCycles: {
        componentDidMount: {
          id: "didMount",
          name: "didMount",
          params: {},
          type: "actionRef"
        },
        componentWillUnmount: "",
        constructor: {
          type: "js",
          compiled: constructorCode,
          source: constructorCode
        }
      },
      hidden: false,
      title: "",
      isLocked: false,
      conditionGroup: "",
      children: [
        {
          componentName: "RootHeader",
          id: nextNodeId(),
          props: {},
          condition: true,
          hidden: false,
          title: "",
          isLocked: false,
          conditionGroup: ""
        },
        {
          componentName: "RootContent",
          id: nextNodeId(),
          props: {},
          condition: true,
          hidden: false,
          title: "",
          isLocked: false,
          conditionGroup: "",
          children: [
            {
              componentName: "FormContainer",
              id: nextNodeId(),
              props: {
                formLabel: i18n(formTitle, formTitle),
                formLabelVisible: true,
                columns: 2,
                labelAlign: "top",
                submitText: i18n("提交", "Submit"),
                stageText: i18n("暂存", "Stage"),
                submitAndNewText: i18n("提交并继续", "Submit and New"),
                fieldId: "formContainer_" + Date.now().toString(36),
                aiFormConfig: { systemPrompt: "", model: "qwen" },
                beforeSubmit: false,
                afterSubmit: false,
                onProcessActionValidate: false,
                afterFormDataInit: false
              },
              condition: true,
              hidden: false,
              title: "",
              isLocked: false,
              conditionGroup: "",
              children: fieldComponents
            }
          ]
        },
        {
          componentName: "RootFooter",
          id: nextNodeId(),
          props: {},
          condition: true,
          hidden: false,
          title: "",
          isLocked: false,
          conditionGroup: "",
          children: [
            {
              componentName: "FooterYida",
              id: nextNodeId(),
              props: {},
              condition: true,
              hidden: false,
              title: "",
              isLocked: false,
              conditionGroup: ""
            }
          ]
        }
      ]
    }
  ];

  // 页面Schema
  const pageSchema = {
    utils: [
      {
        name: "legaoBuiltin",
        type: "npm",
        content: {
          package: "@ali/vu-legao-builtin",
          version: "3.0.0",
          exportName: "legaoBuiltin"
        }
      },
      {
        name: "yidaPlugin",
        type: "npm",
        content: {
          package: "@ali/vu-yida-plugin",
          version: "1.1.0",
          exportName: "yidaPlugin"
        }
      }
    ],
    componentsMap: buildComponentsMap(componentNames),
    componentsTree: pageComponentsTree,
    componentAlias: { items: [] },
    id: formUuid,
    connectComponent: []
  };

  // 顶层Schema
  return {
    schemaType: "superform",
    schemaVersion: "5.0",
    pages: [pageSchema],
    actions: {
      module: {
        compiled: actionsCompiled,
        source: actionsSource
      },
      type: "FUNCTION",
      list: [{ id: "didMount", title: "didMount" }]
    },
    config: {
      connectComponent: []
    }
  };
}

// ==================== 导出 ====================

module.exports = {
  buildFormSchema,
  buildFieldComponent,
  generateFieldId,
  i18n,
  OPTION_FIELD_TYPES
};
