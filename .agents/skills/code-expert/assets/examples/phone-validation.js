/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 手机号码格式校验 - 完整示例
 * 版本号: v1.0.0
 * 代码类型: fieldValidation
 * 
 * 这是一个完整的字段校验代码示例，可直接使用或参考
 */

// ===== 配置参数 =====
var CONFIG = {
  RULES: {
    REQUIRED: true,
    LENGTH: 11,
    START_WITH: '1',
    SECOND_DIGIT_MIN: 3,
    SECOND_DIGIT_MAX: 9
  },
  VALID_PREFIXES: [
    // 中国移动
    '134', '135', '136', '137', '138', '139', '147', '150', '151', '152',
    '157', '158', '159', '172', '178', '182', '183', '184', '187', '188',
    '195', '197', '198',
    // 中国联通
    '130', '131', '132', '145', '146', '155', '156', '166', '175', '176',
    '185', '186', '196',
    // 中国电信
    '133', '149', '153', '173', '177', '180', '181', '189', '190', '191',
    '193', '199',
    // 中国广电
    '192',
    // 虚拟运营商
    '162', '165', '167', '170', '171'
  ],
  MESSAGES: {
    REQUIRED: '手机号码不能为空',
    LENGTH: '手机号码必须是11位数字',
    FORMAT: '手机号码格式不正确，必须以1开头',
    SECOND_DIGIT: '手机号码第二位必须是3-9之间的数字',
    PREFIX: '请输入有效的手机号码号段'
  }
};

function validateRule(value) {
  if (CONFIG.RULES.REQUIRED && (!value || value === '')) {
    return { valid: false, message: CONFIG.MESSAGES.REQUIRED };
  }
  
  if (!value || value === '') {
    return { valid: true, message: '' };
  }

  var phone = String(value);
  var phoneRegex = /^\d{11}$/;
  
  if (!phoneRegex.test(phone)) {
    return { valid: false, message: CONFIG.MESSAGES.LENGTH };
  }

  if (phone.charAt(0) !== CONFIG.RULES.START_WITH) {
    return { valid: false, message: CONFIG.MESSAGES.FORMAT };
  }

  var secondDigit = phone.charAt(1);
  var secondDigitNum = parseInt(secondDigit, 10);
  
  if (secondDigitNum < CONFIG.RULES.SECOND_DIGIT_MIN || secondDigitNum > CONFIG.RULES.SECOND_DIGIT_MAX) {
    return { valid: false, message: CONFIG.MESSAGES.SECOND_DIGIT };
  }

  var prefix = phone.substring(0, 3);
  var isValidPrefix = false;
  
  for (var i = 0; i < CONFIG.VALID_PREFIXES.length; i++) {
    if (CONFIG.VALID_PREFIXES[i] === prefix) {
      isValidPrefix = true;
      break;
    }
  }

  if (!isValidPrefix) {
    return { valid: false, message: CONFIG.MESSAGES.PREFIX };
  }

  return { valid: true, message: '' };
}

export function validate(event) {
  var value = event.value;
  var result = validateRule(value);
  console.log('手机号码校验结果:', result);
  return { valid: result.valid, message: result.message };
}

/**
 * 代码版本号: v1.0.0
 */
