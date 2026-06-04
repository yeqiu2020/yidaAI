/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 手机号码校验 - 校验中国大陆手机号码格式
 * 版本号: v1.0.0
 * 代码类型: fieldValidation
 * 
 * 使用说明:
 * 1. 复制本模板并重命名
 * 2. 在validateRule函数内编写校验逻辑
 * 3. 返回true表示校验通过，false表示校验不通过
 * 4. 将代码粘贴到宜搭字段的【自定义校验】中
 * 
 * 重要说明:
 * - 所有代码必须放在validateRule(value)函数内部
 * - 返回true表示校验通过，false表示校验不通过
 * - 宜搭平台会自动处理错误提示
 */

function validateRule(value) {
  // 如果值为空，不进行校验（如需必填请同时设置必填校验）
  if (!value || value === '') {
    return true;
  }
  
  // 将值转换为字符串类型
  var strValue = String(value);
  
  // 中国大陆手机号码正则表达式
  // ^1: 以1开头
  // [3-9]: 第二位数字为3-9（覆盖3、4、5、6、7、8、9，其中6也是合法号段如166）
  // \d{9}: 后面跟着9位数字
  // $: 结束符，确保总共11位
  var phoneRegExp = /^1[3-9]\d{9}$/;
  
  // 执行正则校验
  var isValid = phoneRegExp.test(strValue);
  
  return isValid;
}

/**
 * ===== 宜搭内使用方式 =====
 * 1. 在表单设计器中选中目标字段
 * 2. 打开【校验】面板
 * 3. 选择【自定义校验】选项
 * 4. 粘贴本代码到代码编辑区域
 * 5. 在【错误提示】中输入：请输入正确的11位手机号码
 * 6. 宜搭平台会自动调用validateRule函数
 * 
 * 注意事项:
 * - 所有代码必须放在validateRule(value)函数内部
 * - 返回true表示校验通过，返回false表示校验不通过
 * - 如需自定义错误提示，在宜搭【校验】面板的【错误提示】中设置
 * 
 * 代码版本号: v1.0.0
 */


// ==================== 测试用例 ====================
// 以下测试用例用于本地验证，实际使用时不会执行

function testPhoneValidation() {
  var testCases = [
    // 测试用例1: 有效号码 - 以138开头的标准号码
    { input: '13800138000', expected: true, description: '有效号码-138开头' },
    
    // 测试用例2: 长度不足 - 只有10位数字
    { input: '1380013800', expected: false, description: '长度不足-10位数字' },
    
    // 测试用例3: 首位非1 - 以2开头
    { input: '23800138000', expected: false, description: '首位非1-以2开头' },
    
    // 测试用例4: 第二位不符合规范 - 以12开头（第二位是2）
    { input: '12800138000', expected: false, description: '第二位不规范-以12开头' },
    
    // 测试用例5: 包含非数字字符 - 包含字母
    { input: '1380013800a', expected: false, description: '包含非数字字符-含字母' },
    
    // 测试用例6: 有效号码 - 以199开头的较新号段
    { input: '19912345678', expected: true, description: '有效号码-199开头新号段' },
    
    // 测试用例7: 空值 - 应返回true（表示不进行校验）
    { input: '', expected: true, description: '空值-不进行校验' },
    
    // 测试用例8: 包含空格 - 号码中包含空格
    { input: '138 0013 8000', expected: false, description: '包含空格字符' }
  ];
  
  var passCount = 0;
  var failCount = 0;
  
  console.log('========== 手机号码校验测试开始 ==========');
  
  for (var i = 0; i < testCases.length; i++) {
    var testCase = testCases[i];
    var result = validateRule(testCase.input);
    var isPass = result === testCase.expected;
    
    if (isPass) {
      passCount++;
      console.log('✓ 通过: ' + testCase.description);
      console.log('  输入: "' + testCase.input + '", 期望: ' + testCase.expected + ', 实际: ' + result);
    } else {
      failCount++;
      console.log('✗ 失败: ' + testCase.description);
      console.log('  输入: "' + testCase.input + '", 期望: ' + testCase.expected + ', 实际: ' + result);
    }
  }
  
  console.log('========== 测试结束 ==========');
  console.log('总计: ' + testCases.length + ' 个测试用例');
  console.log('通过: ' + passCount + ' 个');
  console.log('失败: ' + failCount + ' 个');
  
  return failCount === 0;
}

// 如需运行测试，取消下面一行的注释
// testPhoneValidation();

/**
 * 代码版本号: v1.0.0
 */
