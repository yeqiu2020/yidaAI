/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 日期倒计时功能
 * 版本号: v1.1.0
 * 代码类型: formAction
 * 
 * 功能说明:
 * - 根据截止日期自动计算倒计时
 * - 显示格式：X天X小时X分钟X秒
 * - 每秒自动更新倒计时
 * 
 * 使用说明:
 * 1. 在截止日期字段的onChange事件中绑定startCountdown函数
 * 2. 页面加载时会自动启动倒计时（如果已有截止日期）
 * 
 * ⚠️ 重要提示：倒计时字段必须是【单行文本】或【多行文本】组件！
 *    不能使用日期组件，否则无法正常显示倒计时文本
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    DEADLINE: 'dateField_mm373b6w',
    COUNTDOWN: 'textField_mm373b6x'
  }
};

// 全局定时器变量
var countdownTimer = null;

/**
 * 页面加载完成时触发
 * 启动倒计时（如果截止日期已有值）
 * 版本号: v1.0.0
 */
export function didMount() {
  console.log('日期倒计时功能已加载，版本号: v1.0.0');
  startCountdown.call(this);
}

/**
 * 启动/更新倒计时
 * 绑定到截止日期字段的onChange事件
 * @param {object} event - 事件对象（可选）
 * 版本号: v1.0.0
 */
export function startCountdown(event) {
  var that = this;
  
  // 清除已有定时器
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  
  // 获取截止日期
  var deadline = this.$(CONFIG.FIELD_IDS.DEADLINE).getValue();
  
  // 如果没有截止日期，清空倒计时显示
  if (!deadline) {
    this.$(CONFIG.FIELD_IDS.COUNTDOWN).setValue('');
    return;
  }
  
  // 将截止日期转换为时间戳
  var deadlineTime = new Date(deadline).getTime();
  
  // 立即执行一次倒计时计算
  updateCountdown.call(that, deadlineTime);
  
  // 每秒更新一次倒计时
  countdownTimer = setInterval(function() {
    updateCountdown.call(that, deadlineTime);
  }, 1000);
}

/**
 * 更新倒计时显示
 * @param {number} deadlineTime - 截止日期的时间戳
 * 版本号: v1.0.0
 */
function updateCountdown(deadlineTime) {
  var that = this;
  var now = new Date().getTime();
  var diff = deadlineTime - now;
  
  // 如果已过期
  if (diff <= 0) {
    this.$(CONFIG.FIELD_IDS.COUNTDOWN).setValue('已截止');
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    return;
  }
  
  // 计算天、时、分、秒
  var days = Math.floor(diff / (1000 * 60 * 60 * 24));
  var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  var seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  // 格式化显示
  var countdownText = days + '天' + hours + '小时' + minutes + '分钟' + seconds + '秒';
  
  // 设置倒计时显示值
  this.$(CONFIG.FIELD_IDS.COUNTDOWN).setValue(countdownText);
}

/**
 * 清除倒计时
 * 可在需要停止倒计时的时候调用
 * 版本号: v1.0.0
 */
export function clearCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  this.$(CONFIG.FIELD_IDS.COUNTDOWN).setValue('');
}

/**
 * ===== 宜搭内使用方式 =====
 * 
 * 【第一步】配置字段ID：
 * - 在CONFIG中确认字段ID与实际表单一致
 * - 截止日期字段ID: dateField_mm373b6w
 * - 倒计时显示字段ID: textField_mm373b6x
 * 
 * 【第二步】绑定事件：
 * 1. 选中【截止日期】字段
 * 2. 在【属性】面板找到【动作】配置
 * 3. 在【值发生变化】事件中绑定: startCountdown
 * 
 * 【第三步】页面加载自动启动：
 * - didMount函数会在页面加载完成后自动执行
 * - 如果截止日期已有值，会自动启动倒计时
 * 
 * 【第四步】粘贴代码：
 * - 进入表单【JS代码】面板
 * - 粘贴本代码到编辑区域
 * - 保存并发布表单
 * 
 * 注意事项:
 * - 倒计时字段建议使用【文本】或【多行文本】组件
 * - 倒计时每秒自动更新
 * - 当截止日期过期后会显示"已截止"并停止倒计时
 * - 切换页面或关闭表单时会自动清除定时器
 * 
 * 代码版本号: v1.0.0
 */
