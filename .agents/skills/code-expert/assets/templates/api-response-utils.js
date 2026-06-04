/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 宜搭API响应处理工具函数
 * 统一处理所有宜搭API的返回格式差异
 * 
 * 使用说明:
 * 1. 将此代码复制到自定义页面代码的顶部（配置参数之前）
 * 2. 在所有数据源调用的地方使用 checkApiSuccess() 函数判断成功
 * 3. 使用 getApiErrorMessage() 函数获取错误信息
 * 
 * 支持的API类型：
 * - 新增API (saveFormData): 成功返回字符串 "FINST-xxx"
 * - 编辑API (updateFormData): 成功返回 null
 * - 删除API (deleteFormData): 成功返回 null  
 * - 查询API: 成功返回对象 {success: true, data: [...]} 或 {result: {data: [...]}}
 * 
 * 版本号: v1.0.0
 * 最后更新: 2026-02-24
 */

/**
 * 检查宜搭API调用是否成功
 * 统一处理所有API的返回格式差异
 * @param {any} res - API返回结果
 * @returns {boolean} - 是否成功
 */
function checkApiSuccess(res) {
  // 编辑/删除API成功时返回null
  if (res === null || res === undefined) {
    return true;
  }
  
  // 新增API成功时返回表单实例ID字符串
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) {
    return true;
  }
  
  // 查询API标准成功格式
  if (res && (res.success === true || res.success === 1)) {
    return true;
  }
  
  // 查询API直接返回数据
  if (res && (res.data || (res.result && res.result.data))) {
    return true;
  }
  
  return false;
}

/**
 * 获取API错误信息
 * @param {any} res - API返回结果
 * @param {string} defaultMsg - 默认错误信息
 * @returns {string} - 错误信息
 */
function getApiErrorMessage(res, defaultMsg) {
  if (res && res.errorMsg) {
    return res.errorMsg;
  }
  if (res && res.message) {
    return res.message;
  }
  return defaultMsg || '操作失败';
}

/**
 * 标准的数据源调用模板
 * 包含完整的成功/失败处理逻辑
 * 
 * @param {string} dataSourceName - 数据源名称
 * @param {object} params - 请求参数
 * @param {function} onSuccess - 成功回调
 * @param {function} onError - 失败回调（可选）
 * @param {object} context - this上下文
 */
function callDataSource(dataSourceName, params, onSuccess, onError, context) {
  var that = context || this;
  
  if (!that.dataSourceMap || !that.dataSourceMap[dataSourceName]) {
    console.error('数据源未配置:', dataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + dataSourceName
    });
    if (onError) onError(new Error('数据源未配置'));
    return;
  }
  
  that.dataSourceMap[dataSourceName].load(params)
    .then(function(res) {
      console.log('数据源[' + dataSourceName + ']返回:', res);
      
      if (checkApiSuccess(res)) {
        if (onSuccess) onSuccess(res);
      } else {
        var errorMsg = getApiErrorMessage(res, '操作失败');
        console.error('数据源[' + dataSourceName + ']操作失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '操作失败',
          content: errorMsg
        });
        if (onError) onError(new Error(errorMsg));
      }
    })
    .catch(function(err) {
      console.error('数据源[' + dataSourceName + ']异常:', err);
      that.utils.toast({
        type: 'error',
        title: '操作异常',
        content: err.message || '网络错误'
      });
      if (onError) onError(err);
    });
}

/**
 * 代码版本号: v1.0.0
 */
