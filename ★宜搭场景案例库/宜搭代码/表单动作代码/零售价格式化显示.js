/**
 * 零售价格式化显示（带人民币符号和千分位）
 * 版本号: v1.0.0
 * 代码类型: formAction
 * 
 * 功能说明:
 * - 将零售价数字字段格式化为带人民币符号和千分位的文本
 * - 例如：1234567.89 → ¥1,234,567.89
 * 
 * 使用方式:
 * 1. 在表单JS代码面板中粘贴此代码
 * 2. 在零售价字段的onChange事件中绑定formatPrice函数
 * 3. 或者使用didMount初始化时格式化
 */

// 配置参数
var CONFIG = {
  FIELD_IDS: {
    PRICE: 'numberField_mlbmfsvz',      // 零售价字段ID
    PRICE_DISPLAY: 'textField_price_display'  // 格式化显示字段ID（文本类型）
  }
};

/**
 * 格式化金额为带千分位的字符串
 * @param {number} amount - 金额数字
 * @returns {string} 格式化后的字符串，如：¥1,234,567.89
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === '') {
    return '';
  }
  
  // 转换为数字
  var num = parseFloat(amount);
  if (isNaN(num)) {
    return '';
  }
  
  // 格式化为带千分位的字符串
  var parts = num.toFixed(2).split('.');
  var integerPart = parts[0];
  var decimalPart = parts[1];
  
  // 添加千分位分隔符
  var result = '';
  var count = 0;
  for (var i = integerPart.length - 1; i >= 0; i--) {
    result = integerPart[i] + result;
    count++;
    if (count % 3 === 0 && i > 0) {
      result = ',' + result;
    }
  }
  
  return '¥' + result + '.' + decimalPart;
}

/**
 * 页面加载完成后的初始化
 */
export function didMount() {
  console.log('零售价格式化显示功能已加载，版本号: v1.0.0');
  
  // 初始化时格式化现有值
  var that = this;
  var priceValue = this.$(CONFIG.FIELD_IDS.PRICE).getValue();
  if (priceValue) {
    var formattedValue = formatCurrency(priceValue);
    this.$(CONFIG.FIELD_IDS.PRICE_DISPLAY).setValue(formattedValue);
  }
}

/**
 * 零售价变化时格式化显示
 * 绑定到零售价字段的onChange事件
 */
export function formatPrice(event) {
  var that = this;
  var priceValue = event.value;
  
  // 格式化为带人民币符号和千分位的文本
  var formattedValue = formatCurrency(priceValue);
  
  // 设置到显示字段
  this.$(CONFIG.FIELD_IDS.PRICE_DISPLAY).setValue(formattedValue);
  
  console.log('零售价格式化:', priceValue, '→', formattedValue);
}

/**
 * ===== 宜搭内使用方式 =====
 * 
 * 【方式一】实时格式化（推荐）
 * 1. 创建一个文本类型字段用于显示格式化后的价格（如：price_display）
 * 2. 在零售价字段的【动作】面板中，找到【值发生变化】事件
 * 3. 选择【调用JS函数】，绑定 formatPrice 函数
 * 4. 修改CONFIG中的字段ID为你的实际字段ID
 * 
 * 【方式二】提交时格式化
 * 1. 在表单提交按钮的动作中绑定 formatPrice 函数
 * 2. 或者在表单提交校验前调用格式化
 * 
 * 【字段配置】
 * - 零售价字段：数字类型，用于输入原始价格
 * - 显示字段：文本类型，用于显示格式化后的价格（可选，如不需要可注释掉相关代码）
 * 
 * 代码版本号: v1.0.0
 */
