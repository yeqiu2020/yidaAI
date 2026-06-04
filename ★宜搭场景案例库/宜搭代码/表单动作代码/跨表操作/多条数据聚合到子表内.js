/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 多条数据聚合到子表内
 * 版本号: v1.0.1
 * 代码类型: formAction
 * 
 * 功能说明:
 * 点击按钮（获取成员工资数据）后，按照部门、年份、月份
 * 从跨应用【每月人员工资】表中查询数据，并将结果聚合填充到子表【成员工资明细】中
 * 
 * 使用说明：请查看代码末尾的"宜搭内操作步骤"
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 当前表单字段ID
    DEPARTMENT: 'departmentSelectField_mlv0y3v3',
    YEAR: 'numberField_mlv0y3v4',
    MONTH: 'numberField_mlv0y3v2',
    SUBTABLE: 'tableField_mlv1czzj',
    // 子表字段ID
    SUB_EMPLOYEE: 'employeeField_mlv0y3uv',
    SUB_ATTENDANCE: 'numberField_mlv0y3ux',
    SUB_PIECE_WAGE: 'numberField_mlv0y3uz',
    SUB_DAY_WAGE: 'numberField_mlv0y3v1'
  },
  // 跨应用查询配置
  CROSS_APP: {
    APP_TYPE: 'APP_G7F1UGDPF7GIEW0UCUBY',
    FORM_UUID: 'FORM-592ED876C0884F42A0E66CD45B9C281CD9RH'
  },
  // 目标表字段ID（用于构建查询条件）
  TARGET_FIELDS: {
    DEPARTMENT: 'departmentSelectField_mlv0y3v3',
    YEAR: 'numberField_mlv0y3v4',
    MONTH: 'numberField_mlv0y3v2',
    EMPLOYEE: 'employeeField_mlv0y3uv',
    ATTENDANCE: 'numberField_mlv0y3ux',
    PIECE_WAGE: 'numberField_mlv0y3uz',
    DAY_WAGE: 'numberField_mlv0y3v1'
  }
};

// 全局锁变量，防止重复点击
var isProcessing = false;

/**
 * 页面加载完成时触发
 * 版本号: v1.0.1
 */
export function didMount() {
  console.log('多条数据聚合到子表内代码已加载，版本号: v1.0.1');
}

/**
 * 格式化成员字段
 * 确保成员字段格式为 {emplId: "工号", name: "姓名"}
 * @param {any} employee - 原始成员数据
 * @returns {object} - 格式化后的成员对象
 */
function formatEmployeeField(employee) {
  if (!employee) {
    return { emplId: '', name: '' };
  }
  
  // 如果已经是正确格式
  if (typeof employee === 'object' && employee.emplId) {
    return employee;
  }
  
  // 如果是数组，取第一个
  if (Array.isArray(employee) && employee.length > 0) {
    var first = employee[0];
    if (typeof first === 'object' && first.emplId) {
      return first;
    }
    if (typeof first === 'object' && first.value) {
      return { emplId: first.value, name: first.label || first.value };
    }
    return { emplId: first, name: first };
  }
  
  // 如果是字符串
  if (typeof employee === 'string') {
    return { emplId: employee, name: employee };
  }
  
  // 如果有label和value属性
  if (typeof employee === 'object' && employee.value) {
    return { emplId: employee.value, name: employee.label || employee.value };
  }
  
  return { emplId: '', name: '' };
}

/**
 * 获取部门选择器的value值
 * 部门选择器返回的是数组对象，需要提取value属性
 * @param {any} department - 部门选择器的值
 * @returns {string} - 部门的value值
 */
function getDepartmentValue(department) {
  if (!department) {
    return '';
  }
  
  if (Array.isArray(department) && department.length > 0) {
    var first = department[0];
    if (typeof first === 'object' && first.value) {
      return first.value;
    }
    return first;
  }
  
  if (typeof department === 'string') {
    return department;
  }
  
  if (typeof department === 'object' && department.value) {
    return department.value;
  }
  
  return '';
}

/**
 * 获取成员工资数据
 * 绑定到按钮的onClick事件
 * @param {object} event - 事件对象
 * 版本号: v1.0.1
 */
export function getEmployeeSalaryData(event) {
  var that = this;
  
  // 防止重复点击
  if (isProcessing) {
    that.utils.toast({
      type: 'warning',
      title: '请稍候',
      content: '数据查询中，请勿重复点击'
    });
    return;
  }
  
  isProcessing = true;
  
  try {
    // 1. 获取当前表单的查询条件
    var departmentField = this.$(CONFIG.FIELD_IDS.DEPARTMENT);
    var yearField = this.$(CONFIG.FIELD_IDS.YEAR);
    var monthField = this.$(CONFIG.FIELD_IDS.MONTH);
    
    var department = departmentField.getValue();
    var year = yearField.getValue();
    var month = monthField.getValue();
    
    console.log('查询条件 - 部门:', department, '年份:', year, '月份:', month);
    
    // 2. 校验必填项
    if (!department || (Array.isArray(department) && department.length === 0)) {
      that.utils.toast({
        type: 'warning',
        title: '请填写部门'
      });
      isProcessing = false;
      return;
    }
    
    if (!year && year !== 0) {
      that.utils.toast({
        type: 'warning',
        title: '请填写年份'
      });
      isProcessing = false;
      return;
    }
    
    if (!month && month !== 0) {
      that.utils.toast({
        type: 'warning',
        title: '请填写月份'
      });
      isProcessing = false;
      return;
    }
    
    // 3. 构建查询条件
    var searchFieldJson = {};
    
    // 部门选择器需要提取value
    var departmentValue = getDepartmentValue(department);
    if (departmentValue) {
      searchFieldJson[CONFIG.TARGET_FIELDS.DEPARTMENT] = departmentValue;
    }
    
    // 年份和月份
    searchFieldJson[CONFIG.TARGET_FIELDS.YEAR] = year;
    searchFieldJson[CONFIG.TARGET_FIELDS.MONTH] = month;
    
    console.log('跨表查询条件:', JSON.stringify(searchFieldJson));
    
    // 显示加载中提示
    that.utils.toast({
      type: 'loading',
      title: '正在查询数据...'
    });
    
    // 4. 执行跨应用查询
    this.dataSourceMap.crossFormQuery.load({
      appType: CONFIG.CROSS_APP.APP_TYPE,
      formUuid: CONFIG.CROSS_APP.FORM_UUID,
      searchFieldJson: JSON.stringify(searchFieldJson),
      currentPage: 1,
      pageSize: 100
    }).then(function(res) {
      console.log('跨表查询结果:', res);
      
      // 5. 兼容三种success格式
      var hasData = res && (res.data || (res.result && res.result.data));
      var isSuccess = res && (res.success === true || res.success === 1 || hasData);
      
      if (!isSuccess) {
        var errorMsg = res && res.errorMsg ? res.errorMsg : '查询失败';
        console.error('跨表查询失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '查询失败',
          content: errorMsg
        });
        isProcessing = false;
        return;
      }
      
      // 6. 兼容两种数据位置
      var result = res.result || res || {};
      var dataList = result.data || res.data || [];
      var totalCount = result.totalCount || res.totalCount || dataList.length;
      
      console.log('查询到数据条数:', totalCount);
      
      if (!dataList || dataList.length === 0) {
        that.utils.toast({
          type: 'warning',
          title: '未查询到数据',
          content: '该条件下没有成员工资数据'
        });
        isProcessing = false;
        return;
      }
      
      // 7. 处理数据并填充到子表
      var subTableRows = [];
      
      for (var i = 0; i < dataList.length; i++) {
        var sourceData = dataList[i];
        
        // 从formData中读取字段值（兼容直接返回的数据结构）
        var formData = sourceData.formData || sourceData;
        
        // 提取各字段值
        var employee = formData[CONFIG.TARGET_FIELDS.EMPLOYEE];
        var attendance = formData[CONFIG.TARGET_FIELDS.ATTENDANCE];
        var pieceWage = formData[CONFIG.TARGET_FIELDS.PIECE_WAGE];
        var dayWage = formData[CONFIG.TARGET_FIELDS.DAY_WAGE];
        
        console.log('第' + (i + 1) + '条数据:', {
          employee: employee,
          attendance: attendance,
          pieceWage: pieceWage,
          dayWage: dayWage
        });
        
        // 构建子表行数据
        var rowData = {};
        
        // 成员字段需要格式化
        rowData[CONFIG.FIELD_IDS.SUB_EMPLOYEE] = formatEmployeeField(employee);
        
        // 数值字段
        rowData[CONFIG.FIELD_IDS.SUB_ATTENDANCE] = attendance || 0;
        rowData[CONFIG.FIELD_IDS.SUB_PIECE_WAGE] = pieceWage || 0;
        rowData[CONFIG.FIELD_IDS.SUB_DAY_WAGE] = dayWage || 0;
        
        subTableRows.push(rowData);
      }
      
      console.log('准备填充子表数据:', subTableRows);
      
      // 8. 填充到子表（使用triggerChange: false防止触发onChange事件）
      var subTable = that.$(CONFIG.FIELD_IDS.SUBTABLE);
      subTable.setValue(subTableRows, { triggerChange: false });
      
      // 9. 提示成功
      that.utils.toast({
        type: 'success',
        title: '数据获取成功',
        content: '已成功聚合' + subTableRows.length + '条成员工资数据'
      });
      
      isProcessing = false;
      
    }).catch(function(err) {
      console.error('跨表查询异常:', err);
      that.utils.toast({
        type: 'error',
        title: '查询异常',
        content: err.message || '未知错误'
      });
      isProcessing = false;
    });
    
  } catch (error) {
    console.error('获取成员工资数据错误:', error);
    that.utils.toast({
      type: 'error',
      title: '操作失败',
      content: error.message
    });
    isProcessing = false;
  }
}

/**
 * ===== 宜搭内操作步骤 =====
 * 
 * 【步骤1：配置远程数据源】（关键步骤，必须先完成）
 * 1. 进入宜搭应用后台，点击左侧菜单【数据源】
 * 2. 点击【添加】-->【新建远程API】，填写以下信息：
 *    - 名称：crossFormQuery（必须与代码中的名称一致）
 *    - 请求地址：/dingtalk/web/APP_G7F1UGDPF7GIEW0UCUBY/v1/form/searchFormDatas.json
 *      （已根据代码中的应用ID自动组装，直接复制使用）
 *    - 请求方式：GET
 *    - 参数配置：在UI界面不配置任何Query参数，所有参数由JS代码动态传入
 * 3. 点击【保存】完成数据源配置
 * 
 * 【步骤2：配置JS代码】
 * 1. 在宜搭表单设计器中，点击右上角【JS面板】
 * 2. 将本代码完整复制粘贴到JS编辑区域
 * 3. 点击【保存】
 * 
 * 【步骤3：配置按钮事件】
 * 1. 创建一个按钮组件，命名为"获取成员工资数据"
 * 2. 选中按钮，在右侧【动作】面板中找到【onClick】事件
 * 3. 选择绑定函数：getEmployeeSalaryData
 * 4. 点击【保存】
 * 
 * 【步骤4：测试验证】
 * 1. 预览或发布表单
 * 2. 填写部门、年份、月份（均为必填项）
 * 3. 点击"获取成员工资数据"按钮
 * 4. 查看子表是否正确填充数据
 * 
 * ===== 注意事项 =====
 * - 必须先配置远程数据源，否则代码无法调用跨应用查询
 * - 请求地址中的AppKey必须是当前应用的AppKey
 * - 部门、年份、月份为必填项，否则无法查询
 * - 子表原有数据会被新查询结果覆盖
 * - 如需查询超过100条数据，需要实现分页查询逻辑
 * 
 * 代码版本号: v1.0.1
 */
