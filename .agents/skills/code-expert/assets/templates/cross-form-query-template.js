/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 跨表查询【场景C】专用模板：查主表 + 查子表 → 填充当前表单子表
 * 版本号: v1.0.0
 * 代码类型: formAction
 *
 * 适用场景：在当前表单选择一条“关联表单”记录后，
 *   把被选记录的【主表字段 + 子表明细】自动填充到当前表单的字段和子表中。
 *   典型例子：采购订单选择后，填充入库单的入库明细子表。
 *
 * ⚠️ 场景C 必须调用 2 个 API、配置 2 个数据源：
 *   ① getFormDataById  → 查主表（❌不返回子表数据！❌不能用 checkApiSuccess，判断 res.serialNo）
 *   ② listTableDataByFormInstIdAndTableId → 查子表（数据在 res.data 顶层，关联字段key带 _id 后缀）
 *
 * ⚠️ 事件绑定必须手动：本模板只提供 export function，请在设计器中手动绑定 onChange，
 *   禁止用代码 field.onChange() 自动绑定。
 */

// ============ 通用工具函数（源自 api-response-utils.js，保持同一实现）============

/**
 * getFormDataById 专用：从扁平返回对象中安全取值
 * ⚠️ 该API不返回子表数据！返回 { serialNo, instValueMap, raw } 或 null（失败）
 */
function extractFormDataByIdResult(res) {
  if (!res || !res.serialNo) {
    return null;
  }
  var instValueMap = {};
  if (res.instValue) {
    try {
      var arr = typeof res.instValue === 'string' ? JSON.parse(res.instValue) : res.instValue;
      if (Object.prototype.toString.call(arr) === '[object Array]') {
        for (var i = 0; i < arr.length; i++) {
          var item = arr[i];
          if (item && item.fieldId) {
            instValueMap[item.fieldId] = item.fieldData;
          }
        }
      }
    } catch (e) {
      // instValue 解析失败时保持空映射
    }
  }
  return { serialNo: res.serialNo, instValueMap: instValueMap, raw: res };
}

/**
 * listTableData 专用：从顶层 data 取子表行数组
 * 返回 { list: [...], totalCount, currentPage }
 */
function extractListTableDataResult(res) {
  var list = [];
  if (res && res.data && Object.prototype.toString.call(res.data) === '[object Array]') {
    list = res.data;
  } else if (res && res.result && res.result.data) {
    list = res.result.data;
  }
  return {
    list: list,
    totalCount: (res && res.totalCount) || 0,
    currentPage: (res && res.currentPage) || 1
  };
}

/** 格式化关联表单字段值（API返回JSON字符串需要解析） */
function formatAssociationField(value) {
  if (!value) return [];
  if (Object.prototype.toString.call(value) === '[object Array]') return value;
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [parsed];
    } catch (e) { return []; }
  }
  if (typeof value === 'object') return [value];
  return [];
}

/** 格式化成员字段值为 setValue 需要的格式 [{value, label, key}] */
function formatEmployeeField(value) {
  if (!value) return [];
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.map(function(item) {
      if (typeof item === 'string') return { value: item, label: item, key: item };
      return {
        value: item.value || item.key || item.emplId || '',
        label: item.label || item.name || item.value || '',
        key: item.key || item.value || item.emplId || ''
      };
    });
  }
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return formatEmployeeField(parsed);
    } catch (e) { return [{ value: value, label: value, key: value }]; }
  }
  if (typeof value === 'object') {
    return [{
      value: value.value || value.key || value.emplId || '',
      label: value.label || value.name || value.value || '',
      key: value.key || value.value || value.emplId || ''
    }];
  }
  return [];
}

/**
 * 从子表行数据中安全读取关联表单字段
 * ⚠️ listTableData 返回的关联字段key带 _id 后缀，标准字段名为空！
 */
function getAssociationValue(row, fieldId) {
  var value = row[fieldId + '_id'];
  if (value !== undefined && value !== null) {
    return formatAssociationField(value);
  }
  return formatAssociationField(row[fieldId]);
}

// ============ 配置参数 ============
var CONFIG = {
  // 当前表单字段ID
  FIELD_IDS: {
    SOURCE_ASSOCIATION: 'associationFormField_xxx', // 当前表单上“选择源单据”的关联表单字段
    TARGET_SUB_TABLE: 'tableField_target',           // 当前表单要被填充的目标子表
    TARGET_MAIN_FIELD: 'textField_target'            // （可选）当前表单要被填充的主表字段
  },
  // 数据源（需在宜搭后台配置 2 个远程API数据源）
  DATA_SOURCE: {
    GET_MAIN: 'getSourceMainForm',   // → getFormDataById.json  查源单据主表
    GET_SUB: 'getSourceSubTable'     // → listTableDataByFormInstIdAndTableId.json 查源单据子表
  },
  // 源表单信息（从 系统配置清单.md 读取真实值，严禁占位符）
  SOURCE_FORM: {
    APP_ID: 'APP_XXX',
    FORM_UUID: 'FORM-XXX',
    SUB_TABLE_FIELD_ID: 'tableField_source' // 源单据的子表字段ID
  },
  // 源子表字段 → 目标子表字段 映射（左：源子表列ID，右：目标子表列ID）
  SUB_FIELD_MAP: {
    'textField_srcName': 'textField_dstName',
    'numberField_srcQty': 'numberField_dstQty',
    'associationFormField_srcProduct': 'associationFormField_dstProduct' // 关联字段需 getAssociationValue
  },
  // 目标子表中属于“关联表单类型”的列（这些列必须走 getAssociationValue）
  SUB_ASSOCIATION_FIELDS: ['associationFormField_srcProduct']
};

var isProcessing = false;

export function didMount() {
  console.log('跨表查询场景C模板已加载，版本号: v1.0.0');
}

/**
 * ① 查主表：getFormDataById
 * @param {object} that - this 上下文
 * @param {string} formInstId - 源单据实例ID
 * @returns {Promise} resolve({ serialNo, instValueMap, raw })，失败 reject
 */
function fetchMainForm(that, formInstId) {
  return that.dataSourceMap[CONFIG.DATA_SOURCE.GET_MAIN].load({
    formInstId: formInstId
  }).then(function(res) {
    var mainResult = extractFormDataByIdResult(res); // ❌不能用 checkApiSuccess
    if (!mainResult) {
      throw new Error('主表查询失败：未找到源单据或无权限');
    }
    return mainResult;
  });
}

/**
 * ② 查子表：listTableDataByFormInstIdAndTableId（含分页，pageSize 上限 50）
 * @param {object} that - this 上下文
 * @param {string} formInstId - 源单据实例ID
 * @param {number} currentPage - 当前页（从1开始）
 * @param {Array} accumulated - 已累积的子表行
 * @returns {Promise} resolve(所有子表行数组)
 */
function fetchSubTable(that, formInstId, currentPage, accumulated) {
  var pageSize = 50; // listTableData 上限 50
  return that.dataSourceMap[CONFIG.DATA_SOURCE.GET_SUB].load({
    formUuid: CONFIG.SOURCE_FORM.FORM_UUID,
    formInstanceId: formInstId,
    tableFieldId: CONFIG.SOURCE_FORM.SUB_TABLE_FIELD_ID,
    currentPage: String(currentPage),
    pageSize: String(pageSize)
  }).then(function(res) {
    var parsed = extractListTableDataResult(res); // 从 res.data 顶层取
    var all = accumulated.concat(parsed.list);
    if (all.length < parsed.totalCount) {
      return fetchSubTable(that, formInstId, currentPage + 1, all);
    }
    return all;
  });
}

/**
 * ③ 把源子表行映射为目标子表行格式
 * @param {Array} sourceRows - listTableData 返回的源子表行
 * @returns {Array} 目标子表 setValue 需要的行数组
 */
function buildSubTableRows(sourceRows) {
  var rows = [];
  for (var i = 0; i < sourceRows.length; i++) {
    var src = sourceRows[i];
    var row = {};
    for (var srcField in CONFIG.SUB_FIELD_MAP) {
      if (!CONFIG.SUB_FIELD_MAP.hasOwnProperty(srcField)) continue;
      var dstField = CONFIG.SUB_FIELD_MAP[srcField];
      var isAssociation = CONFIG.SUB_ASSOCIATION_FIELDS.indexOf(srcField) !== -1;
      if (isAssociation) {
        // 关联字段：必须用 getAssociationValue（子表API返回 _id 后缀）
        row[dstField] = getAssociationValue(src, srcField);
      } else {
        // 普通字段：数值列可能带 _value 后缀，优先取原值
        row[dstField] = src[srcField] !== undefined ? src[srcField] : '';
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * ④ 完整流程：关联字段 onChange → 查主表 + 查子表 → 填充当前子表
 * 绑定到当前表单“源单据”关联字段的 onChange 事件
 * @param {object} event - { value: 关联字段新值 }
 */
export function onSourceFieldChange(event) {
  var that = this;
  if (isProcessing) return;

  var value = event && event.value;
  // 关联字段值形如 [{ instanceId, formUuid, title, ... }]
  if (!value || !value.length || !value[0].instanceId) {
    return; // 清空或无效选择，不处理
  }
  var formInstId = value[0].instanceId;

  isProcessing = true;

  fetchMainForm(that, formInstId).then(function(mainResult) {
    // 主表字段可选填充（示例：把源单据流水号填到当前表单某字段）
    if (CONFIG.FIELD_IDS.TARGET_MAIN_FIELD) {
      var mainField = that.$(CONFIG.FIELD_IDS.TARGET_MAIN_FIELD);
      if (mainField) {
        mainField.setValue(mainResult.serialNo, { triggerChange: false });
      }
    }
    // 继续查子表
    return fetchSubTable(that, formInstId, 1, []);
  }).then(function(sourceRows) {
    var targetRows = buildSubTableRows(sourceRows);
    var subTable = that.$(CONFIG.FIELD_IDS.TARGET_SUB_TABLE);
    if (!subTable) {
      throw new Error('目标子表组件不存在: ' + CONFIG.FIELD_IDS.TARGET_SUB_TABLE);
    }
    // triggerChange:false 防止触发子表 onChange 死循环
    subTable.setValue(targetRows, { triggerChange: false });
    that.utils.toast({ type: 'success', title: '已填充 ' + targetRows.length + ' 条明细' });
  }).catch(function(err) {
    console.error('场景C填充失败:', err);
    that.utils.toast({ type: 'error', title: '填充失败', content: err.message || '未知错误' });
  }).then(function() {
    isProcessing = false; // 无论成功失败都释放锁（相当于 finally）
  });
}

/**
 * ===== 宜搭内配置步骤 =====
 *
 * 【步骤一】添加JS代码
 * 1. 进入表单设计器 → 顶部「JS代码」按钮
 * 2. 点击「添加文件」，文件名填 crossFormFillSubTable
 * 3. 完整复制粘贴本代码 → 保存
 *
 * 【步骤二】核对配置
 * 1. CONFIG.FIELD_IDS：填当前表单的关联字段、目标子表、目标主表字段ID
 * 2. CONFIG.SOURCE_FORM：从 系统配置清单.md 读取源表单的 APP_ID / FORM_UUID / 子表字段ID（真实值，严禁占位符）
 * 3. CONFIG.SUB_FIELD_MAP：配置 源子表列ID → 目标子表列ID 的映射
 * 4. CONFIG.SUB_ASSOCIATION_FIELDS：列出映射中属于“关联表单类型”的源列ID
 *
 * 【步骤三】配置 2 个数据源（场景C必须！）
 * 数据源1（查主表）：
 *   - 名称与 CONFIG.DATA_SOURCE.GET_MAIN 一致（getSourceMainForm）
 *   - 请求地址：/dingtalk/web/{源表单APP_ID}/v1/form/getFormDataById.json
 *   - 请求方式：GET
 * 数据源2（查子表）：
 *   - 名称与 CONFIG.DATA_SOURCE.GET_SUB 一致（getSourceSubTable）
 *   - 请求地址：/dingtalk/web/{源表单APP_ID}/v1/form/listTableDataByFormInstIdAndTableId.json
 *   - 请求方式：GET
 * ⚠️ 所有参数由代码动态传入，后台不需要预先配置参数；不要传 appType！
 *
 * 【步骤四】手动绑定事件（禁止代码自动绑定）
 * 1. 选中“源单据”关联表单字段 → 右侧属性面板 → 动作 → 值发生变化时
 * 2. 选择函数：onSourceFieldChange
 * 3. 保存表单
 *
 * 【步骤五】测试验证
 * 1. 预览表单，在关联字段选择一条源单据
 * 2. 观察目标子表是否自动填充明细，主表字段是否回填
 * 3. 打开浏览器控制台看日志确认主表/子表返回结构
 *
 * 【常见问题】
 * Q: 子表填充为空？
 * A: ①确认调用了 listTableData（getFormDataById 不返回子表）；②确认从 res.data 顶层取；③检查 SUB_TABLE_FIELD_ID 是否为源子表字段ID
 * Q: 关联列显示为空？
 * A: 子表API关联字段带 _id 后缀，必须用 getAssociationValue，且该列要加入 SUB_ASSOCIATION_FIELDS
 * Q: 主表查询总是失败？
 * A: getFormDataById 不能用 checkApiSuccess，本模板用 res.serialNo 判断，确认源单据实例ID正确
 * Q: 页面卡死？
 * A: setValue 必须带 { triggerChange: false }，并用 isProcessing 锁防止死循环
 *
 * 代码版本号: v1.0.0
 */
