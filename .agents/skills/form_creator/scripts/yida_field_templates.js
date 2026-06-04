/**
 * 宜搭字段模板库
 * 版本: 4.1.3
 * 创建日期: 2026-02-16
 * 更新: 2026-03-13 - 修复SerialNumberField，强制behavior为READONLY且validation为空数组，确保流水号自动生成且非必填
 *
 * 功能: 提供所有宜搭标准字段的模板生成函数
 * 更新: TableField 默认表格方式显示
 * 更新: 字段状态映射：普通->NORMAL, 只读->READONLY, 隐藏->HIDDEN
 */

let fieldCounter = 0;

/**
 * 生成字段ID
 * @param {string} type - 字段类型
 * @returns {string} 字段ID
 */
function generateFieldId(type) {
  fieldCounter++;
  const prefix = type.charAt(0).toLowerCase() + type.slice(1);
  return `${prefix}_mloe5q${Date.now()}${fieldCounter}`;
}

/**
 * 国际化文�? * @param {string} text - 中文文本
 * @returns {Object} i18n对象
 */
function i18n(text) {
  return {
    type: 'i18n',
    zh_CN: text,
    en_US: text
  };
}

/**
 * 基础字段属�? */
const baseProps = {
  __category__: 'form',
  __useMediator__: 'value',
  labelAlign: 'top',
  labelTextAlign: 'left',
  tips: i18n(''),
  behavior: 'NORMAL',
  validation: [],
  __gridSpan: 1,
  visibility: ['PC', 'MOBILE'],
  submittable: 'DEFAULT',
  events: { ignored: true },
  onChange: { ignored: true },
  dataEntryMode: false,
  labelColSpan: 4,
  size: 'medium'
};

/**
 * 根据字段状态获取behavior
 * @param {string} status - 字段状�?(editable/readonly/hidden)
 * @returns {string} behavior�? */
function getBehaviorByStatus(status) {
  switch (status) {
    case 'readonly':
      return 'READONLY';
    case 'hidden':
      return 'HIDDEN';
    case 'editable':
    default:
      return 'NORMAL';
  }
}

/**
 * 根据字段状态获取hidden�? * @param {string} status - 字段状�? * @returns {boolean}
 */
function getHiddenByStatus(status) {
  return status === 'hidden';
}

/**
 * TextField - 单行文本
 */
function TextField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);

  return {
    componentName: 'TextField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      validationType: config.validation || 'text',
      hasClear: true,
      maxLength: config.maxLength || 200,
      scanCode: { enabled: false, type: 'all', editable: true },
      rows: 4,
      complexValue: {
        complexType: 'custom',
        value: i18n(''),
        formula: ''
      },
      valueType: 'custom',
      value: i18n(''),
      onFocus: { ignored: true },
      onBlur: { ignored: true },
      onPaste: { ignored: true },
      onKeyDown: { ignored: true },
      onPressEnter: { ignored: true },
      onScanCodeSuccess: { ignored: true },
      onScanCodeError: { ignored: true },
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      autoHeight: false,
      hasLimitHint: false,
      fieldId: config.fieldId || generateFieldId('TextField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * TextareaField - 多行文本
 */
function TextareaField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);

  return {
    componentName: 'TextareaField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      htmlType: 'textarea',
      hasClear: true,
      rows: config.rows || 4,
      showEmptyRows: true,
      complexValue: {
        complexType: 'custom',
        value: i18n(''),
        formula: ''
      },
      valueType: 'custom',
      value: i18n(''),
      onFocus: { ignored: true },
      onBlur: { ignored: true },
      onPaste: { ignored: true },
      onKeyDown: { ignored: true },
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      autoHeight: false,
      hasLimitHint: false,
      maxLength: config.maxLength || 500,
      fieldId: config.fieldId || generateFieldId('TextTextareaField'),
      __gridSpan: config.gridSpan || 2,
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * NumberField - 数�? */
function NumberField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  const props = {
    ...baseProps,
    label: i18n(config.label),
    placeholder: i18n(''),
    precision: config.precision || 0,
    hasClear: true,
    complexValue: {
      complexType: config.valueType === 'formula' ? 'formula' : 'custom',
      value: i18n(''),
      formula: ''
    },
    valueType: config.valueType || 'custom',
    value: i18n(''),
    formularZoneCode: '',
    formula: '',
    linkage: '',
    variable: '',
    fieldId: config.fieldId || generateFieldId('NumberField'),
    validation: config.required ? [{ type: 'required' }] : [],
    behavior: behavior
  };

  // 添加单位配置（如果有）
  if (config.unit) {
    props.innerAfter = i18n(config.unit);
    props.step = 1;
    props.onKeyDown = { ignored: true };
    props.onFocus = { ignored: true };
    props.onBlur = { ignored: true };
    props.onCorrect = { ignored: true };
    props.labelColOffset = 0;
    props.wrapperColSpan = 0;
    props.wrapperColOffset = 0;
    props.thousandsSeparators = false;
  }

  return {
    componentName: 'NumberField',
    props,
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * DateField - 日期
 */
function DateField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'DateField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(config.placeholder || ''),
      hasClear: true,
      format: config.format || 'yyyy-MM-dd',
      showTime: config.showTime || false,
      complexValue: {
        complexType: 'custom',
        value: i18n(''),
        formula: ''
      },
      valueType: 'custom',
      value: i18n(''),
      onVisibleChange: { ignored: true },
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      fieldId: config.fieldId || generateFieldId('DateField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * SelectField - 下拉选择
 */
function SelectField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  const dataSource = generateDataSource(config.options);
  
  return {
    componentName: 'SelectField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      options: config.options || [],
      hasClear: true,
      complexValue: {
        complexType: 'custom',
        value: '',
        formula: ''
      },
      valueType: 'custom',
      value: '',
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      fieldId: config.fieldId || generateFieldId('SelectField'),
      validation: config.required ? [{ type: 'required' }] : [],
      defaultDataSource: {
        complexType: 'custom',
        options: dataSource,
        formula: {
          data: [],
          event: {
            'onPageReady,onChange': []
          }
        },
        url: '',
        searchConfig: {
          type: 'JSONP',
          url: '',
          beforeFetch: '',
          afterFetch: ''
        },
        customStashOptions: []
      },
      dataSourceType: 'custom',
      dataSource: dataSource,
      searchConfig: {
        dataType: 'jsonp',
        url: '',
        beforeFetch: 'function willFetch(params) {\n  return params;\n}',
        afterFetch: 'function didFetch(content) {\n  return content;\n}'
      },
      supportInverse: false,
      isUseDataSourceColor: false,
      dataSourceLinkage: '',
      reusePrivilege: false,
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * EmployeeField - 成员选择
 */
function EmployeeField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'EmployeeField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      multiple: config.multiple || false,
      hasClear: true,
      complexValue: {
        complexType: 'custom',
        value: i18n(''),
        formula: ''
      },
      valueType: 'custom',
      value: i18n(''),
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      fieldId: config.fieldId || generateFieldId('EmployeeField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * AssociationFormField - 关联表单
 */
function AssociationFormField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);

  // 生成占位符UUID（用户后续需要在宜搭平台手动修改关联关系）
  const placeholderUuid = `FORM-PLACEHOLDER-${Date.now().toString(36).toUpperCase()}`;

  // 获取关联表单名称
  const assocFormName = config.associationFormName || config.associationForm || '';

  return {
    componentName: 'AssociationFormField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n('请选择'),
      hasClear: true,
      multiple: false,
      isCustomStore: true,
      isShowSearchBar: true,
      __gridSpan: 1,
      tips: i18n(''),
      notFoundContent: i18n('无数据'),
      dataEntryMode: false,
      submittable: 'ALWAYS',
      validateFilter: false,
      __useMediator: 'value',
      // 关联表单配置 - 使用占位符UUID
      associationForm: {
        formType: 'receipt',
        formUuid: config.associationFormId || placeholderUuid,
        appType: '',
        appName: '',
        formTitle: i18n(assocFormName),
        mainFieldId: '',
        mainFieldLabel: i18n(''),
        mainComponentName: 'TextField',
        tableShowType: 'all',
        customTableFields: [],
        subFieldId: '',
        subComponentName: '',
        linkageFields: []
      },
      // 数据过滤规则
      dataFilterRules: {
        condition: 'AND',
        rules: [],
        ruleId: 'group-' + Date.now().toString(36),
        instanceFieldId: '',
        version: 'v2'
      },
      supportDataFilter: false,
      // 数据回填规则
      dataFillingRules: {
        mainRules: [],
        tableRules: [],
        version: 'v2'
      },
      supportDataFilling: false,
      // 排序配置
      orderEnable: false,
      orderConfig: [],
      complexValue: {
        complexType: 'custom',
        value: i18n(''),
        formula: ''
      },
      valueType: 'custom',
      value: i18n(''),
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      fieldId: config.fieldId || generateFieldId('AssociationFormField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * TableField - 子表单
 */
function TableField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  const children = [];
  if (config.columns) {
    for (const col of config.columns) {
      const templateFn = FieldTemplates[col.type];
      if (templateFn) {
        const childField = templateFn(col);
        // 子表内字段设置宽度为 1，避免超出页面
        if (childField.props) {
          childField.props.__gridSpan = 1;
        }
        children.push(childField);
      }
    }
  }

  return {
    componentName: 'TableField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      complexValue: {
        complexType: 'custom',
        value: i18n(''),
        formula: ''
      },
      valueType: 'custom',
      value: [],
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      fieldId: config.fieldId || generateFieldId('TableField'),
      validation: config.required ? [{ type: 'required' }] : [],
      __gridSpan: config.gridSpan || 1,
      addButtonPosition: 'bottom',
      addButtonText: i18n('新增一项'),
      addButtonBehavior: 'NORMAL',
      enableImport: true,
      enableExport: true,
      filterEmptyRowData: false,
      showActions: true,
      copyButtonText: i18n('复制'),
      showDelAction: true,
      delButtonText: i18n('删除'),
      showDeleteConfirm: true,
      moveUp: i18n('上移'),
      moveDown: i18n('下移'),
      actions: [],
      __designerDevice: 'pc',
      layout: 'TABLE',
      mobileLayout: 'TILED',
      defaultCollapseStatus: true,
      theme: 'split',
      showTableHead: true,
      showIndex: true,
      indexName: i18n(''),
      tableLayout: 'fixed',
      pageSize: 20,
      maxItems: 500,
      minItems: 1,
      pcFreezeColumnStartCounts: '0',
      isFreezeOperateColumn: true,
      mobileFreezeColumnStartCounts: '0',
      actionsColumnWidth: 70,
      enableBatchDelete: false,
      showCopyAction: false,
      behavior: behavior
    },
    children: children,
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * RateField - 评分
 */
function RateField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'RateField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      value: i18n(''),
      count: config.count || 5,
      allowHalf: config.allowHalf || false,
      showGrade: config.showGrade || false,
      fieldId: config.fieldId || generateFieldId('RateField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * 生成选项的dataSource格式
 * @param {Array} options - 选项数组 [{label, value}]
 * @returns {Array} dataSource格式
 */
function generateDataSource(options) {
  if (!options || !Array.isArray(options)) return [];
  return options.map((opt, index) => {
    // 支持字符串数组或对象数组
    const label = typeof opt === 'string' ? opt : opt.label;
    const value = typeof opt === 'string' ? opt : opt.value;
    return {
      sid: `serial_${Date.now()}_${index}`,
      text: {
        type: 'i18n',
        zh_CN: label,
        en_US: label
      },
      value: value,
      defaultChecked: false,
      syncLabelValue: true
    };
  });
}

/**
 * RadioField - 单�? */
function RadioField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  const dataSource = generateDataSource(config.options);
  
  return {
    componentName: 'RadioField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      options: config.options || [],
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('RadioField'),
      validation: config.required ? [{ type: 'required' }] : [],
      itemDirection: 'hoz',
      complexValue: {
        complexType: 'custom',
        value: '',
        formula: ''
      },
      valueType: 'custom',
      value: '',
      defaultDataSource: {
        complexType: 'custom',
        options: dataSource,
        formula: {
          data: [],
          event: {
            'onPageReady,onChange': []
          }
        },
        url: '',
        searchConfig: {
          type: 'JSONP',
          url: '',
          beforeFetch: '',
          afterFetch: ''
        },
        customStashOptions: []
      },
      dataSourceType: 'custom',
      dataSource: dataSource,
      searchConfig: {
        dataType: 'jsonp',
        url: '',
        beforeFetch: 'function willFetch(params) {\n  return params;\n}',
        afterFetch: 'function didFetch(content) {\n  return content;\n}'
      },
      formularZoneCode: '',
      formula: '',
      linkage: '',
      variable: '',
      supportInverse: false,
      isUseDataSourceColor: false,
      dataSourceLinkage: '',
      reusePrivilege: false,
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * CheckboxField - 复�? */
function CheckboxField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'CheckboxField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      options: config.options || [],
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('CheckboxField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * MultiSelectField - 下拉复�? */
function MultiSelectField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'MultiSelectField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      options: config.options || [],
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('MultiSelectField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * CascadeSelectField - 级联选择
 */
function CascadeSelectField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'CascadeSelectField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('CascadeSelectField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * DepartmentSelectField - 部门选择
 */
function DepartmentSelectField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'DepartmentSelectField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      multiple: config.multiple || false,
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('DepartmentSelectField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * CascadeDateField - 日期区间
 */
function CascadeDateField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'CascadeDateField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      format: config.format || 'yyyy-MM-dd',
      fieldId: config.fieldId || generateFieldId('CascadeDateField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * ImageField - 图片上传
 */
function ImageField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'ImageField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      limit: config.limit || 5,
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('ImageField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * AttachmentField - 附件上传
 */
function AttachmentField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'AttachmentField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      limit: config.limit || 10,
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('AttachmentField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * AssociationQuery - 关联查询
 */
function AssociationQuery(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'AssociationQuery',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('AssociationQuery'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * SerialNumberField - 流水号
 * 注意：流水号字段始终为只读且非必填，由系统自动生成
 */
function SerialNumberField(config) {
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'SerialNumberField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      prefix: config.prefix || 'SN',
      suffix: config.suffix || '',
      digit: config.digit || 6,
      startValue: config.startValue || 1,
      fieldId: config.fieldId || generateFieldId('SerialNumberField'),
      validation: [],  // 流水号字段永不必填
      behavior: 'READONLY'
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * AddressField - 地址
 */
function AddressField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'AddressField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('AddressField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * CountrySelectField - 国家/地区
 */
function CountrySelectField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'CountrySelectField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('CountrySelectField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * LocationField - 定位
 */
function LocationField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'LocationField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('LocationField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * EditorField - 富文本编�? */
function EditorField(config) {
  const behavior = getBehaviorByStatus(config.status);
  const isHidden = getHiddenByStatus(config.status);
  
  return {
    componentName: 'EditorField',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('EditorField'),
      validation: config.required ? [{ type: 'required' }] : [],
      behavior: behavior
    },
    condition: true,
    hidden: isHidden,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * RichText - 富文本展�? */
function RichText(config) {
  return {
    componentName: 'RichText',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      hasClear: true,
      fieldId: config.fieldId || generateFieldId('RichText'),
      validation: config.required ? [{ type: 'required' }] : []
    },
    condition: true,
    hidden: false,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * PageSection - 分组
 */
function PageSection(config) {
  return {
    componentName: 'PageSection',
    props: {
      ...baseProps,
      label: i18n(config.label),
      placeholder: i18n(''),
      fieldId: config.fieldId || generateFieldId('PageSection'),
      __gridSpan: 4
    },
    condition: true,
    hidden: false,
    title: '',
    isLocked: false,
    conditionGroup: ''
  };
}

/**
 * 字段模板导出
 */
const FieldTemplates = {
  TextField,
  TextareaField,
  NumberField,
  DateField,
  SelectField,
  EmployeeField,
  AssociationFormField,
  TableField,
  RateField,
  RadioField,
  CheckboxField,
  MultiSelectField,
  CascadeSelectField,
  DepartmentSelectField,
  CascadeDateField,
  ImageField,
  AttachmentField,
  AssociationQuery,
  SerialNumberField,
  AddressField,
  CountrySelectField,
  LocationField,
  EditorField,
  RichText,
  PageSection
};

module.exports = {
  FieldTemplates,
  generateFieldId,
  i18n
};
