/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 宜搭API响应处理工具函数
 * 适用于：表单动作代码 + 自定义页面代码（复制到代码顶部，配置参数之前）
 * 
 * 使用说明:
 * 1. 将需要的函数复制到代码顶部（未用到的可删）
 * 2. 查询/新增/编辑/删除用 checkApiSuccess() 判断成功；getApiErrorMessage() 取错误信息
 * 3. getFormDataById 用 extractFormDataByIdResult()；listTableData 用 extractListTableDataResult()
 * 4. 读取子表关联字段用 getAssociationValue()（自动兼容 _id 后缀）
 *
 * ⚠️ 各API返回结构完全不同，不能用同一套逻辑处理！对照下表：
 * | API | 成功判断 | 数据位置 |
 * |-----|---------|---------|
 * | searchFormDatas | checkApiSuccess(res) | res.result.data |
 * | getFormDataById  | res.serialNo 存在（❌不能用checkApiSuccess） | res.serialNo / res.instValue |
 * | listTableData    | res.data 是数组 | res.data（顶层，❌不在res.result下） |
 * | saveFormData     | typeof res === 'string' | 返回值本身即实例ID |
 * | updateFormData/deleteFormData | res === null | 无数据返回 |
 *
 * 提供的函数：
 * - checkApiSuccess / getApiErrorMessage —— 通用判断（不含 getFormDataById）
 * - extractFormDataByIdResult —— getFormDataById 专用取值
 * - extractListTableDataResult —— listTableData 专用取值（顶层 data）
 * - formatAssociationField / formatEmployeeField / formatDepartmentField —— 字段格式转换
 * - getAssociationValue —— 安全读取子表关联字段（优先 _id 后缀）
 * - callDataSource / callDataSourceWithCheck —— 数据源调用封装
 *
 * 版本号: v1.1.0
 * 最后更新: 2026-07-24
 */

/**
 * 检查宜搭API调用是否成功
 * 支持: 新增(返回FINST-xxx字符串) / 编辑删除(返回null) / searchFormDatas查询(返回对象)
 * ⚠️ 不适用于 getFormDataById！该API返回扁平对象 {serialNo, instValue, creator, ...}，
 *   没有 success/data/result 字段，checkApiSuccess 会误判为失败！
 *   请改用 extractFormDataByIdResult(res) 或直接判断 res.serialNo。
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
 * getFormDataById 专用：从扁平返回对象中安全取值
 * ⚠️ 该API不返回子表数据！子表必须单独调用 listTableData 获取。
 * @param {object} res - getFormDataById 返回的扁平对象
 * @returns {object|null} - { serialNo, instValueMap, raw } 或 null（查询失败）
 */
function extractFormDataByIdResult(res) {
  if (!res || !res.serialNo) {
    return null; // 无 serialNo 视为查询失败
  }
  // instValue 是字段数据JSON字符串，解析为 fieldId -> value 映射
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
      // instValue 解析失败时保持空映射，调用方可回退用 serialNo
    }
  }
  return { serialNo: res.serialNo, instValueMap: instValueMap, raw: res };
}

/**
 * listTableData 专用：从顶层 data 取子表行数组
 * ⚠️ 数据在 res.data 顶层，不在 res.result.data！关联字段key带 _id 后缀。
 * @param {object} res - listTableDataByFormInstIdAndTableId 返回
 * @returns {object} - { list: [...], totalCount, currentPage }
 */
function extractListTableDataResult(res) {
  var list = [];
  if (res && res.data && Object.prototype.toString.call(res.data) === '[object Array]') {
    list = res.data; // 首选：顶层 data
  } else if (res && res.result && res.result.data) {
    list = res.result.data; // 兼容少数环境
  }
  return {
    list: list,
    totalCount: (res && res.totalCount) || 0,
    currentPage: (res && res.currentPage) || 1
  };
}

/**
 * 格式化关联表单字段值（API返回JSON字符串需要解析）
 * 与 form-action-template.js / cross-form-query.md §6 保持同一实现
 */
function formatAssociationField(value) {
  if (!value) return [];
  if (Object.prototype.toString.call(value) === '[object Array]') return value;
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed); // 双重转义
      return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [parsed];
    } catch (e) { return []; }
  }
  if (typeof value === 'object') return [value];
  return [];
}

/**
 * 格式化成员字段值为 setValue 需要的格式 [{value, label, key}]
 */
function formatEmployeeField(value) {
  if (!value) return [];
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.map(function(item) {
      if (typeof item === 'string') {
        return { value: item, label: item, key: item };
      }
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
    } catch (e) {
      return [{ value: value, label: value, key: value }];
    }
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
 * 格式化部门字段值为 setValue 需要的格式 [{value, text}]
 */
function formatDepartmentField(value) {
  if (!value) return [];
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.map(function(item) {
      if (typeof item === 'string') {
        return { value: item, text: item };
      }
      return {
        value: item.value || '',
        text: item.text || item.label || item.value || ''
      };
    });
  }
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return formatDepartmentField(parsed);
    } catch (e) {
      return [{ value: value, text: value }];
    }
  }
  if (typeof value === 'object') {
    return [{ value: value.value || '', text: value.text || value.label || value.value || '' }];
  }
  return [];
}

/**
 * 从子表行数据中安全读取关联表单字段
 * ⚠️ listTableData API 返回的关联字段key带 _id 后缀（如 associationFormField_xxx_id）
 *    标准字段名（associationFormField_xxx）在该API中为空！
 * @param {object} row - 子表行数据
 * @param {string} fieldId - 关联字段ID（不带 _id 后缀）
 * @returns {Array} - 格式化后的关联字段值
 */
function getAssociationValue(row, fieldId) {
  var value = row[fieldId + '_id']; // 优先 _id 后缀
  if (value !== undefined && value !== null) {
    return formatAssociationField(value);
  }
  return formatAssociationField(row[fieldId]); // 兼容无后缀
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
 * 数据源调用封装（按 apiType 自动选择正确的成功判断逻辑）
 * —— 解决“用同一套 checkApiSuccess 处理所有API”导致的误判问题
 * @param {string} dataSourceName - 数据源名称
 * @param {object} params - 请求参数
 * @param {string} apiType - 'searchFormDatas' | 'getFormDataById' | 'listTableData' | 'saveFormData' | 'updateFormData' | 'deleteFormData'
 * @param {function} onSuccess - 成功回调，入参为根据 apiType 提取后的数据
 * @param {function} onError - 失败回调（可选）
 * @param {object} context - this上下文
 */
function callDataSourceWithCheck(dataSourceName, params, apiType, onSuccess, onError, context) {
  var that = context || this;

  if (!that.dataSourceMap || !that.dataSourceMap[dataSourceName]) {
    console.error('数据源未配置:', dataSourceName);
    that.utils.toast({ type: 'error', title: '配置错误', content: '请配置数据源: ' + dataSourceName });
    if (onError) onError(new Error('数据源未配置'));
    return;
  }

  that.dataSourceMap[dataSourceName].load(params)
    .then(function(res) {
      console.log('数据源[' + dataSourceName + '](' + apiType + ')返回:', res);

      // getFormDataById：专用判断 + 提取
      if (apiType === 'getFormDataById') {
        var mainResult = extractFormDataByIdResult(res);
        if (mainResult) {
          if (onSuccess) onSuccess(mainResult);
        } else {
          that.utils.toast({ type: 'error', title: '查询失败', content: '未找到数据或无权限' });
          if (onError) onError(new Error('getFormDataById 查询失败'));
        }
        return;
      }

      // listTableData：专用提取（顶层 data）
      if (apiType === 'listTableData') {
        if (onSuccess) onSuccess(extractListTableDataResult(res));
        return;
      }

      // 其余API（searchFormDatas / saveFormData / updateFormData / deleteFormData）：通用判断
      if (checkApiSuccess(res)) {
        if (onSuccess) onSuccess(res);
      } else {
        var errorMsg = getApiErrorMessage(res, '操作失败');
        that.utils.toast({ type: 'error', title: '操作失败', content: errorMsg });
        if (onError) onError(new Error(errorMsg));
      }
    })
    .catch(function(err) {
      console.error('数据源[' + dataSourceName + ']异常:', err);
      that.utils.toast({ type: 'error', title: '操作异常', content: err.message || '网络错误' });
      if (onError) onError(err);
    });
}

/**
 * 代码版本号: v1.1.0
 */
