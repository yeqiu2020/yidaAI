/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 子表多行拆分到子表单行
 * 版本号: v1.0.0
 * 代码类型: formAction
 * 
 * 功能描述: 将【分派任务详情】子表按照【事项处理人员】拆分到另外一个【详情自动拆分】子表内，子表每一行一个人员
 * 
 * 组件ID说明:
 * - 分派任务详情（子表）: tableField_mlvyrixo
 *   - 事项名称: textField_mlvyrixp
 *   - 事项基本分: numberField_mlvyrixr
 *   - 事项处理人员: employeeField_mlyw28p8
 * - 详情自动拆分（子表）: tableField_mlvyrixz
 *   - 事项名称: textField_mlvyrixw
 *   - 事项基本分: numberField_mlvyrixx
 *   - 事项处理人员: employeeField_mlyw28p9
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 源子表 - 分派任务详情
    SOURCE_TABLE: 'tableField_mlvyrixo',
    SOURCE_MATTER_NAME: 'textField_mlvyrixp',
    SOURCE_BASE_SCORE: 'numberField_mlvyrixr',
    SOURCE_HANDLER: 'employeeField_mlyw28p8',
    // 目标子表 - 详情自动拆分
    TARGET_TABLE: 'tableField_mlvyrixz',
    TARGET_MATTER_NAME: 'textField_mlvyrixw',
    TARGET_BASE_SCORE: 'numberField_mlvyrixx',
    TARGET_HANDLER: 'employeeField_mlyw28p9'
  }
};

// 全局锁变量，防止循环触发
var isProcessing = false;

/**
 * 页面加载完成时触发
 * 版本号: v1.0.0
 */
export function didMount() {
  console.log('子表多行拆分到子表单行功能已加载，版本号: v1.0.0');
}

/**
 * 分派任务详情子表值变更处理
 * 绑定到【分派任务详情】子表的onChange事件
 * 当分派任务详情子表数据变化时，自动按人员拆分到详情自动拆分表
 * @param {object} event - 事件对象
 * 版本号: v1.0.0
 */
export function onSourceTableChange(event) {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 获取源子表数据
    var sourceTable = this.$(CONFIG.FIELD_IDS.SOURCE_TABLE);
    var sourceData = sourceTable.getValue();
    
    console.log('源子表数据:', sourceData);
    
    // 如果源子表为空，清空目标子表
    if (!sourceData || !sourceData.length || sourceData.length === 0) {
      var targetTable = this.$(CONFIG.FIELD_IDS.TARGET_TABLE);
      targetTable.setValue([], { triggerChange: false });
      return;
    }
    
    // 构建目标子表数据 - 按人员拆分，每人一行
    var targetData = [];
    
    for (var i = 0; i < sourceData.length; i++) {
      var sourceRow = sourceData[i];
      
      // 获取事项名称
      var matterName = sourceRow[CONFIG.FIELD_IDS.SOURCE_MATTER_NAME] || '';
      // 获取事项基本分
      var baseScore = sourceRow[CONFIG.FIELD_IDS.SOURCE_BASE_SCORE] || 0;
      // 获取事项处理人员（可能是数组）
      var handlers = sourceRow[CONFIG.FIELD_IDS.SOURCE_HANDLER] || [];
      
      // 如果没有处理人员，跳过该行
      if (!handlers || handlers.length === 0) {
        continue;
      }
      
      // 为每个处理人员创建一行
      for (var j = 0; j < handlers.length; j++) {
        var handler = handlers[j];
        
        // 构建目标子表行数据
        var targetRow = {};
        targetRow[CONFIG.FIELD_IDS.TARGET_MATTER_NAME] = matterName;
        targetRow[CONFIG.FIELD_IDS.TARGET_BASE_SCORE] = baseScore;
        targetRow[CONFIG.FIELD_IDS.TARGET_HANDLER] = [handler]; // 成员字段是数组格式
        
        targetData.push(targetRow);
      }
    }
    
    console.log('生成的目标子表数据:', targetData);
    
    // 检查数据量限制（子表最多500行）
    if (targetData.length > 500) {
      console.warn('拆分后数据超过最大限制: 500');
      this.utils.toast({
        type: 'warning',
        title: '数据量过大',
        content: '拆分后数据超过500行，已截断处理'
      });
      targetData = targetData.slice(0, 500);
    }
    
    // 更新目标子表数据，不触发onChange避免死循环
    var targetTable = this.$(CONFIG.FIELD_IDS.TARGET_TABLE);
    targetTable.setValue(targetData, { triggerChange: false });
    
    // 提示用户
    if (targetData.length > 0) {
      this.utils.toast({
        type: 'success',
        title: '拆分成功',
        content: '已生成 ' + targetData.length + ' 条拆分记录'
      });
    }
    
  } catch (error) {
    console.error('子表拆分处理错误:', error);
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
 * ===== 宜搭内操作步骤 =====
 * 1. 打开表单设计器，进入【任务分派】表单
 * 2. 选中【分派任务详情】子表组件
 * 3. 在右侧属性面板中找到【动作】或【事件】配置
 * 4. 将【onChange】事件绑定到 onSourceTableChange 函数
 * 5. 保存并发布表单
 * 6. 测试：在【分派任务详情】子表中添加数据，观察【详情自动拆分】子表是否自动按人员拆分
 * 
 * 注意事项:
 * - 本代码已添加防死循环机制（isProcessing锁 + triggerChange: false）
 * - 事项处理人员字段支持多选，每个人员会生成独立的一行
 * - 子表数据量限制为500行，超过会自动截断
 * 
 * 代码版本号: v1.0.0
 */
