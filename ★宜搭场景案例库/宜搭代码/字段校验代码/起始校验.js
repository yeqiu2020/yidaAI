/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 起始校验 - 校验输入是否以「中国」开头
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
  
  // 校验是否以「中国」开头
  var isStartWithChina = strValue.indexOf('中国') === 0;
  
  return isStartWithChina;
}

/**
 * ===== 宜搭内使用方式 =====
 * 1. 在表单设计器中选中目标字段
 * 2. 打开【校验】面板
 * 3. 选择【自定义校验】选项
 * 4. 粘贴本代码到代码编辑区域
 * 5. 在【错误提示】中输入：输入内容必须以「中国」开头
 * 6. 宜搭平台会自动调用validateRule函数
 * 
 * 注意事项:
 * - 所有代码必须放在validateRule(value)函数内部
 * - 返回true表示校验通过，返回false表示校验不通过
 * - 如需自定义错误提示，在宜搭【校验】面板的【错误提示】中设置
 * 
 * 代码版本号: v1.0.0
 */
