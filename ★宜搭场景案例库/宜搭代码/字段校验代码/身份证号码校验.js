/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 身份证号码校验规则
 * 版本号: v1.0.0
 * 代码类型: fieldValidation
 * 
 * 功能说明:
 * 1. 支持15位和18位身份证号码校验
 * 2. 验证身份证号码格式合法性
 * 3. 验证18位身份证的校验码
 * 
 * 使用说明:
 * - 只需编写validateRule(value)函数
 * - 返回true表示校验通过，false表示校验不通过
 * - 宜搭平台会自动处理错误提示
 */

function validateRule(value) {
  // 空值校验通过（如需必填校验，请在宜搭【校验】面板中设置必填）
  if (!value || value === '') {
    return true;
  }
  
  // 去除首尾空格
  var idCard = value.toString().trim();
  
  // 长度校验：必须为15位或18位
  if (idCard.length !== 15 && idCard.length !== 18) {
    return false;
  }
  
  // 15位身份证校验
  if (idCard.length === 15) {
    // 15位身份证：纯数字，第7-8位为年份(19XX)，9-10位为月份，11-12位为日期
    var reg15 = /^[1-9]\d{7}((0\d)|(1[0-2]))(([0|1|2]\d)|3[0-1])\d{3}$/;
    return reg15.test(idCard);
  }
  
  // 18位身份证校验
  if (idCard.length === 18) {
    // 基本格式校验（前17位为数字，最后一位为数字或X/x）
    var reg18 = /^[1-9]\d{5}(18|19|20)\d{2}((0[1-9])|(1[0-2]))(([0-2][1-9])|10|20|30|31)\d{3}[\dXx]$/;
    if (!reg18.test(idCard)) {
      return false;
    }
    
    // 校验码验证（加权求和算法）
    var weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    var checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
    
    var sum = 0;
    for (var i = 0; i < 17; i++) {
      sum += parseInt(idCard.charAt(i), 10) * weights[i];
    }
    
    var mod = sum % 11;
    var expectedCheckCode = checkCodes[mod];
    var actualCheckCode = idCard.charAt(17).toUpperCase();
    
    return expectedCheckCode === actualCheckCode;
  }
  
  return false;
}

/**
 * ===== 宜搭内使用方式 =====
 * 1. 在表单设计器中选中目标字段（如身份证字段）
 * 2. 打开【校验】面板
 * 3. 选择【自定义校验】选项
 * 4. 粘贴本代码到代码编辑区域
 * 5. 在【错误提示】中填写："请输入正确的身份证号码"
 * 6. 保存表单
 * 
 * 注意事项:
 * - 所有代码必须放在validateRule(value)函数内部
 * - 返回true表示校验通过，返回false表示校验不通过
 * - 本校验支持15位和18位身份证号码
 * - 18位身份证会验证最后一位校验码的正确性
 * 
 * 代码版本号: v1.0.0
 */
