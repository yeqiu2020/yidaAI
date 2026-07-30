/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 表单动作代码模板
 * 版本号: v2.4.0
 * 代码类型: formAction
 *
 * 使用说明:
 * 1. 复制本模板并重命名
 * 2. 修改CONFIG中的字段ID配置
 * 3. 实现具体的业务逻辑函数
 * 4. 在宜搭组件事件中绑定对应的函数（下拉选择，无需粘贴代码）
 *
 * ⚠️ 重要提示:
 * - 所有 export function 必须用 function 关键字声明，禁止用箭头函数！
 *   箭头函数在宜搭运行时无法正确获取 this（组件上下文）
 * - Promise 回调内使用 that 保存 this 引用
 * - 子表 onChange 必须加 isProcessing 锁，防止 setValue 触发死循环
 * - 跨表查询新增用 formDataJson，编辑用 updateFormDataJson
 * - ⚠️ getFormDataById 不适用 checkApiSuccess！需单独判断 res.serialNo
 * - ⚠️ listTableData 子表API关联字段key带 _id 后缀！需用 getAssociationValue
 */

// ===== 通用工具函数（需要时保留）=====
/**
 * 检查宜搭API调用是否成功
 * 支持: 新增(返回FINST-xxx字符串) / 编辑删除(返回null) / searchFormDatas查询(返回对象)
 * ⚠️ 不适用于 getFormDataById！该API返回扁平对象{serialNo,instValue,creator,...}
 *   没有 success/data/result 字段，checkApiSuccess 会误判为失败！
 *   需单独判断: if (!res || !res.serialNo) throw Error('查询失败')
 */
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true;
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;
  if (res && (res.success === true || res.success === 1)) return true;
  if (res && (res.data || (res.result && res.result.data))) return true;
  return false;
}

/**
 * 格式化关联表单字段值（API返回JSON字符串需要解析）
 */
function formatAssociationField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed); // 双重转义
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { return []; }
  }
  if (typeof value === 'object') return [value];
  return [];
}

/**
 * 从子表行数据中安全读取关联表单字段
 * ⚠️ listTableData API 返回的关联字段key带 _id 后缀（如 associationFormField_xxx_id）
 *    标准字段名（associationFormField_xxx）在该API中为空！
 *    前端 getValue() 返回的字段名不带 _id，但子表API只有 _id 版本有数据！
 */
function getAssociationValue(row, fieldId) {
  // 优先尝试 _id 后缀（listTableData API 返回格式）
  var value = row[fieldId + '_id'];
  if (value !== undefined && value !== null) {
    return formatAssociationField(value);
  }
  // 兼容无后缀（前端 getValue 格式）
  return formatAssociationField(row[fieldId]);
}

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 在此配置所有用到的字段ID，示例:
    // FIELD_NAME: 'textField_xxx',
    // SUB_TABLE: 'tableField_xxx',
    // TOTAL: 'numberField_zzz'
  },
  DATA_SOURCE: {
    // 数据源名称（需在宜搭后台配置），示例:
    // QUERY: 'queryDataSource',
    // ADD: 'addDataSource'
  }
};

// 全局锁（防止子表 setValue 触发 onChange 死循环）
var isProcessing = false;

/**
 * 页面加载完成时触发
 * 必须包含，即使为空也要保留
 * 
 * ⚠️ 重要：必须使用 setTimeout 延迟初始化
 * 原因：didMount 执行时表单组件可能未完全加载，直接操作组件会返回 null
 * 参考：字段顺序填写联动功能 v1.0.0 → v1.0.1 的修复经验
 * 
 * 版本号: v2.3.0
 */
export function didMount() {
  console.log('表单动作代码已加载，版本号: v2.3.0');
  
  var that = this;
  
  // 延迟初始化，确保表单组件完全加载
  setTimeout(function() {
    // TODO: 在此进行初始化操作，如设置字段初始状态
    console.log('初始化完成');
  }, 100);
}

/**
 * 字段值变更处理示例
 * 绑定到字段的 onChange 事件
 * @param {object} event - 事件对象，event.value 为新值
 * 
 * ⚠️ 重要：操作组件前必须先检查组件是否存在
 * 原因：字段可能被隐藏或销毁，直接操作会返回 null
 * 参考：字段顺序填写联动功能 v1.0.1 → v1.0.2 的修复经验
 * 
 * ⚠️ 注意：setValue 会触发字段校验规则，如表单配置了校验规则可能导致报错
 * 建议：禁用字段时只使用 set('disabled', true)，避免调用 setValue('')
 * 参考：字段顺序填写联动功能 v1.0.2 → v1.0.4 的修复经验
 * 
 * 版本号: v2.3.0
 */
export function onFieldChange(event) {
  var that = this;  // ← 必须：Promise 回调中使用 that
  var value = event.value;

  if (isProcessing) return;

  try {
    isProcessing = true;

    // TODO: 在此实现字段联动逻辑
    // 示例：安全地获取组件并操作
    var targetComponent = this.$(CONFIG.FIELD_IDS.TARGET_FIELD);
    if (!targetComponent) {
      console.error('目标字段组件不存在，ID:', CONFIG.FIELD_IDS.TARGET_FIELD);
      return;
    }
    
    // 启用/禁用字段（安全操作）
    targetComponent.set('disabled', false);
    
    // 注意：setValue 会触发校验规则，慎用！
    // targetComponent.setValue('');  // 可能触发校验报错
    
    console.log('字段值变更:', value);

  } catch (error) {
    console.error('字段变更处理错误:', error);
    
    // 捕获到校验规则错误时给出明确提示
    if (error.message && error.message.indexOf('validateRule') !== -1) {
      console.error('提示：表单字段配置了校验规则，但校验规则代码有错误');
      console.error('建议：检查表单字段的校验规则设置，或联系管理员修复');
    }
    
    this.utils.toast({ type: 'error', title: '处理失败', content: error.message });
  } finally {
    isProcessing = false;
  }
}

/**
 * 子表数据变更处理示例（含防死循环）
 * 绑定到子表字段的 onChange 事件
 * @param {object} event - { value: 子表全量数据, extra: { fieldId, changes } }
 * 版本号: v2.3.0
 */
export function onSubTableChange(event) {
  if (isProcessing) return;

  try {
    isProcessing = true;
    var value = event.value || [];

    // 示例：汇总子表金额到主表
    var total = 0;
    for (var i = 0; i < value.length; i++) {
      total += parseFloat(value[i][CONFIG.FIELD_IDS.SUB_AMOUNT]) || 0;
    }
    // 必须加 { triggerChange: false }，否则会死循环！
    this.$(CONFIG.FIELD_IDS.TOTAL).setValue(total, { triggerChange: false });

  } catch (error) {
    console.error('子表处理错误:', error);
  } finally {
    isProcessing = false;  // 必须在 finally 中释放锁
  }
}

/**
 * 按钮点击处理示例（含跨表查询）
 * 绑定到按钮的 onClick 事件
 * @param {object} event - 事件对象
 * 版本号: v2.3.0
 */
export function onButtonClick(event) {
  var that = this;  // ← 必须：.then() 回调中用 that 而非 this

  var fieldValue = this.$(CONFIG.FIELD_IDS.FIELD_NAME).getValue();

  this.dataSourceMap[CONFIG.DATA_SOURCE.QUERY].load({
    searchFieldJson: JSON.stringify([{
      fieldId: 'textField_xxx',
      operator: 'like',
      fieldValue: fieldValue
    }]),
    currentPage: 1,
    pageSize: 100
  }).then(function(res) {
    if (checkApiSuccess(res)) {
      var result = res.result || res || {};
      var dataList = result.data || res.data || [];
      console.log('查询结果:', dataList);
      that.utils.toast({ type: 'success', title: '查询成功，共' + dataList.length + '条' });
    } else {
      that.utils.toast({ type: 'error', title: '查询失败' });
    }
  }).catch(function(error) {
    console.error('查询异常:', error);
    that.utils.toast({ type: 'error', title: '查询异常' });
  });
}

/**
 * 提交前校验示例
 * 绑定到提交按钮的 onClick 事件（在提交动作前执行）
 * @returns {boolean} - false 阻止提交，true 允许提交
 * 版本号: v2.3.0
 */
export function beforeSubmit() {
  var requiredField = this.$(CONFIG.FIELD_IDS.FIELD_NAME).getValue();

  if (!requiredField || requiredField === '') {
    this.utils.toast({ type: 'warning', title: '请填写必填项' });
    return false;
  }

  return true;
}

/**
 * ===== 宜搭内配置步骤 =====
 *
 * 【步骤一】添加JS代码
 * 1. 进入表单设计器 → 顶部「JS代码」按钮
 * 2. 点击「添加文件」，文件名填 formAction
 * 3. 完整复制粘贴本代码 → 保存
 *
 * 【步骤二】配置字段ID
 * 修改 CONFIG.FIELD_IDS 中所有字段ID为实际值
 *
 * 【步骤三】绑定字段事件（字段联动）
 * 1. 选中字段 → 右侧属性面板 → 动作 → 值发生变化时
 * 2. 选择函数：onFieldChange
 *
 * 【步骤四】绑定按钮事件
 * 1. 选中按钮 → 右侧属性面板 → 动作 → 点击时
 * 2. 选择函数：onButtonClick
 *
 * 【步骤五】配置数据源（跨表查询必须）
 * 1. 进入宜搭应用后台 → 左侧「数据源」→ 添加 → 新建远程API
 * 2. 名称与 CONFIG.DATA_SOURCE 中一致
 * 3. 请求地址：/dingtalk/web/{APP_ID}/v1/form/searchFormDatas.json
 * 4. 请求方式：GET（所有参数由代码动态传入，不在后台配置）
 *
 * 常用API端点：
 * | 功能 | 端点 |
 * |------|------|
 * | 查询列表 | /v1/form/searchFormDatas.json |
 * | 新增 | /v1/form/saveFormData.json |
 * | 编辑 | /v1/form/updateFormData.json |
 * | 删除 | /v1/form/deleteFormData.json |
 * | 查询子表 | /v1/form/listTableDataByFormInstIdAndTableId.json |
 *
 * ⚠️ 注意：跨表查询不要传递 appType 参数！
 *
 * 【常见问题】
 * Q: 点击按钮没反应？  A: 检查步骤四绑定，函数名是否一致
 * Q: 字段联动不生效？ A: 检查步骤三绑定，字段ID是否正确
 * Q: dataSourceMap.xxx.load is not a function？ A: 检查步骤五数据源配置
 * Q: this.$ is not a function？ A: 嵌套回调中用 that 代替 this
 *
 * 代码版本号: v2.3.0
 */
