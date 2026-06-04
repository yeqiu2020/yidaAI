/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 所有成员拆分
 * 版本号: v1.0.0
 * 代码类型: formAction
 * 
 * 功能描述: 将主表内的【所有成员】拆分到任务分派子表内，子表每一行一个人员
 * 
 * 组件ID说明:
 * - 所有成员: employeeField_mlyvlvs4
 * - 任务分派（子表）: tableField_mlyvlvs5
 *   - 成员: employeeField_mlyvlvs6
 *   - 事项: textField_mlyvlvs7
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 主表字段
    ALL_MEMBERS: 'employeeField_mlyvlvs4',
    // 子表
    TASK_ASSIGN_TABLE: 'tableField_mlyvlvs5',
    // 子表字段
    MEMBER: 'employeeField_mlyvlvs6',
    MATTER: 'textField_mlyvlvs7'
  }
};

// 全局锁变量，防止循环触发
var isProcessing = false;

/**
 * 页面加载完成时触发
 * 版本号: v1.0.0
 */
export function didMount() {
  console.log('所有成员拆分功能已加载，版本号: v1.0.0');
}

/**
 * 所有成员字段值变更处理
 * 绑定到【所有成员】字段的onChange事件
 * 当所有成员字段值变化时，自动拆分到子表
 * @param {object} event - 事件对象
 * 版本号: v1.0.0
 */
export function onAllMembersChange(event) {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 获取所有成员字段的值
    var allMembersField = this.$(CONFIG.FIELD_IDS.ALL_MEMBERS);
    var allMembers = allMembersField.getValue();
    
    console.log('所有成员字段值:', allMembers);
    
    // 如果没有选择成员，清空子表
    if (!allMembers || !allMembers.length || allMembers.length === 0) {
      var subTable = this.$(CONFIG.FIELD_IDS.TASK_ASSIGN_TABLE);
      subTable.setValue([], { triggerChange: false });
      return;
    }
    
    // 获取子表组件
    var subTable = this.$(CONFIG.FIELD_IDS.TASK_ASSIGN_TABLE);
    
    // 构建子表数据 - 每个成员一行
    var subTableData = [];
    for (var i = 0; i < allMembers.length; i++) {
      var member = allMembers[i];
      
      // 构建子表行数据
      var rowData = {};
      rowData[CONFIG.FIELD_IDS.MEMBER] = [member]; // 成员字段是数组格式
      rowData[CONFIG.FIELD_IDS.MATTER] = ''; // 事项字段默认为空
      
      subTableData.push(rowData);
    }
    
    console.log('生成的子表数据:', subTableData);
    
    // 更新子表数据，不触发onChange避免死循环
    subTable.setValue(subTableData, { triggerChange: false });
    
    // 提示用户
    this.utils.toast({
      type: 'success',
      title: '成员拆分成功',
      content: '已将 ' + allMembers.length + ' 位成员拆分到任务分派表'
    });
    
  } catch (error) {
    console.error('成员拆分处理错误:', error);
    this.utils.toast({
      type: 'error',
      title: '拆分失败',
      content: error.message
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * 手动触发成员拆分
 * 可绑定到按钮的onClick事件，用于手动触发拆分
 * 版本号: v1.0.0
 */
export function splitMembers() {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 获取所有成员字段的值
    var allMembersField = this.$(CONFIG.FIELD_IDS.ALL_MEMBERS);
    var allMembers = allMembersField.getValue();
    
    // 检查是否选择了成员
    if (!allMembers || !allMembers.length || allMembers.length === 0) {
      this.utils.toast({
        type: 'warning',
        title: '提示',
        content: '请先选择所有成员'
      });
      return;
    }
    
    // 获取子表组件
    var subTable = this.$(CONFIG.FIELD_IDS.TASK_ASSIGN_TABLE);
    
    // 获取现有子表数据
    var existingData = subTable.getValue() || [];
    
    // 构建子表数据 - 每个成员一行
    var subTableData = [];
    for (var i = 0; i < allMembers.length; i++) {
      var member = allMembers[i];
      
      // 检查该成员是否已存在于子表中
      var isExist = false;
      for (var j = 0; j < existingData.length; j++) {
        var existingRow = existingData[j];
        var existingMember = existingRow[CONFIG.FIELD_IDS.MEMBER];
        if (existingMember && existingMember.length > 0) {
          if (existingMember[0].value === member.value || existingMember[0].userId === member.userId) {
            // 保留现有行的数据（包括事项字段）
            subTableData.push(existingRow);
            isExist = true;
            break;
          }
        }
      }
      
      // 如果不存在，则新增一行
      if (!isExist) {
        var rowData = {};
        rowData[CONFIG.FIELD_IDS.MEMBER] = [member];
        rowData[CONFIG.FIELD_IDS.MATTER] = '';
        subTableData.push(rowData);
      }
    }
    
    console.log('手动拆分后的子表数据:', subTableData);
    
    // 更新子表数据
    subTable.setValue(subTableData, { triggerChange: false });
    
    // 提示用户
    this.utils.toast({
      type: 'success',
      title: '成员拆分成功',
      content: '已将 ' + allMembers.length + ' 位成员拆分到任务分派表'
    });
    
  } catch (error) {
    console.error('手动拆分处理错误:', error);
    this.utils.toast({
      type: 'error',
      title: '拆分失败',
      content: error.message
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * ===== 宜搭内使用方式 =====
 * 
 * 方式一：自动拆分（推荐）
 * 1. 在表单设计器中选中【所有成员】字段
 * 2. 打开【属性】面板，找到【事件】选项
 * 3. 在【值变更】事件中绑定 onAllMembersChange 函数
 * 4. 保存并发布表单
 * 5. 当用户选择成员后，会自动拆分到子表
 * 
 * 方式二：手动拆分
 * 1. 在表单中添加一个按钮（如"拆分成员"）
 * 2. 选中按钮，打开【属性】面板，找到【事件】选项
 * 3. 在【点击】事件中绑定 splitMembers 函数
 * 4. 保存并发布表单
 * 5. 点击按钮时执行成员拆分
 * 
 * 注意事项:
 * - 成员字段的数据格式为数组，每个元素包含userId、name等属性
 * - 子表中的成员字段也是数组格式，所以赋值时需要包装成数组 [member]
 * - 使用 triggerChange: false 防止死循环
 * - splitMembers 函数会保留已存在成员的事项字段值
 * 
 * 代码版本号: v1.0.0
 */
