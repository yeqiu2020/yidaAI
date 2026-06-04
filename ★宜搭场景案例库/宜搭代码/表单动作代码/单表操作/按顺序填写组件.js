/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 按顺序填写组件
 * 功能描述: 只有填写了字段1，才能填写字段2，否则字段2不能填写（禁用）。
 *          只有填写了字段2，才能填写字段3，否则字段3不能填写（禁用）。
 * 版本号: v1.0.0
 * 代码类型: formAction
 * 
 * 使用说明:
 * 1. 在宜搭表单设计器中，将本代码复制到【JS面板】
 * 2. 在字段1、字段2、字段3的onChange事件中分别绑定对应的处理函数
 * 3. 页面加载后会自动初始化字段状态
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 字段1
    FIELD_1: 'textField_mlyvffcl',
    // 字段2
    FIELD_2: 'textField_mlyvffcn',
    // 字段3
    FIELD_3: 'textField_mlyvffcp'
  }
};

// 全局状态变量（用于防止循环触发）
var isProcessing = false;

/**
 * 页面加载完成时触发
 * 初始化字段的禁用状态
 * 版本号: v1.0.0
 */
export function didMount() {
  console.log('按顺序填写组件已加载，版本号: v1.0.0');
  
  var that = this;
  
  try {
    // 获取字段1的值
    var field1Value = this.$(CONFIG.FIELD_IDS.FIELD_1).getValue();
    // 获取字段2的值
    var field2Value = this.$(CONFIG.FIELD_IDS.FIELD_2).getValue();
    
    // 根据字段1的值设置字段2的禁用状态
    if (!field1Value || field1Value === '') {
      // 字段1为空，禁用字段2
      this.$(CONFIG.FIELD_IDS.FIELD_2).set('disabled', true);
    } else {
      // 字段1有值，启用字段2
      this.$(CONFIG.FIELD_IDS.FIELD_2).set('disabled', false);
    }
    
    // 根据字段2的值设置字段3的禁用状态
    if (!field2Value || field2Value === '') {
      // 字段2为空，禁用字段3
      this.$(CONFIG.FIELD_IDS.FIELD_3).set('disabled', true);
    } else {
      // 字段2有值，启用字段3
      this.$(CONFIG.FIELD_IDS.FIELD_3).set('disabled', false);
    }
    
  } catch (error) {
    console.error('初始化字段状态失败:', error);
  }
}

/**
 * 字段1值变更处理函数
 * 绑定到字段1的onChange事件
 * @param {object} event - 事件对象
 * 版本号: v1.0.0
 */
export function onField1Change(event) {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 获取字段1的当前值
    var field1Value = event.value;
    
    // 判断字段1是否有值
    if (!field1Value || field1Value === '') {
      // 字段1为空，禁用字段2，并清空字段2的值
      this.$(CONFIG.FIELD_IDS.FIELD_2).set('disabled', true);
      this.$(CONFIG.FIELD_IDS.FIELD_2).setValue('');
      
      // 同时禁用字段3，并清空字段3的值
      this.$(CONFIG.FIELD_IDS.FIELD_3).set('disabled', true);
      this.$(CONFIG.FIELD_IDS.FIELD_3).setValue('');
    } else {
      // 字段1有值，启用字段2
      this.$(CONFIG.FIELD_IDS.FIELD_2).set('disabled', false);
    }
    
  } catch (error) {
    console.error('字段1变更处理错误:', error);
    this.utils.toast({
      type: 'error',
      title: '处理失败',
      content: error.message
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * 字段2值变更处理函数
 * 绑定到字段2的onChange事件
 * @param {object} event - 事件对象
 * 版本号: v1.0.0
 */
export function onField2Change(event) {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 获取字段2的当前值
    var field2Value = event.value;
    
    // 判断字段2是否有值
    if (!field2Value || field2Value === '') {
      // 字段2为空，禁用字段3，并清空字段3的值
      this.$(CONFIG.FIELD_IDS.FIELD_3).set('disabled', true);
      this.$(CONFIG.FIELD_IDS.FIELD_3).setValue('');
    } else {
      // 字段2有值，启用字段3
      this.$(CONFIG.FIELD_IDS.FIELD_3).set('disabled', false);
    }
    
  } catch (error) {
    console.error('字段2变更处理错误:', error);
    this.utils.toast({
      type: 'error',
      title: '处理失败',
      content: error.message
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * ===== 宜搭内操作步骤 =====
 * 1. 进入表单设计器，点击【JS面板】
 * 2. 将本代码完整复制粘贴到JS面板中
 * 3. 选中【字段1】(textField_mlyvffcl)，在【属性】面板找到【动作】
 * 4. 在【值发生变化】事件中选择或输入: onField1Change
 * 5. 选中【字段2】(textField_mlyvffcn)，在【属性】面板找到【动作】
 * 6. 在【值发生变化】事件中选择或输入: onField2Change
 * 7. 保存并发布表单
 * 
 * 注意事项:
 * - didMount函数会在页面加载时自动执行，初始化字段状态
 * - 当字段1被清空时，字段2和字段3会自动禁用并清空
 * - 当字段2被清空时，字段3会自动禁用并清空
 * - 使用disabled属性禁用字段，用户无法输入
 *
 * 代码版本号: v1.0.0
 */
