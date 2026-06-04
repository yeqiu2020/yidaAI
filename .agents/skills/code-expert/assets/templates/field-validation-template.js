/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 字段校验代码模板
 * 版本号: v2.0.0
 * 代码类型: fieldValidation
 * 
 * 使用说明:
 * 1. 复制本模板并重命名
 * 2. 修改validateRule函数中的校验逻辑
 * 3. 在宜搭字段的【校验】面板中粘贴代码
 * 4. 在【错误提示】中设置失败时的提示文字
 * 
 * 重要提示:
 * - 所有代码必须放在validateRule函数内部
 * - 函数接收value参数（字段当前值）
 * - 必须返回true（通过）或false（不通过）
 * - 校验代码中不应修改其他字段的值
 */

function validateRule(value) {
  // ===== 校验逻辑编写区 =====
  
  // 1. 空值校验（如需必填，建议同时勾选【必填】选项）
  if (!value || value === '') {
    return true; // 空值时返回true，让必填校验处理
  }
  
  // 2. 格式校验示例：手机号
  const phoneReg = /^1[3-9]\d{9}$/;
  if (!phoneReg.test(value)) {
    return false;
  }
  
  // 3. 长度校验示例
  const minLength = 6;
  const maxLength = 20;
  if (value.length < minLength || value.length > maxLength) {
    return false;
  }
  
  // 4. 范围校验示例（数值）
  const numValue = parseFloat(value);
  if (!isNaN(numValue)) {
    const min = 0;
    const max = 100;
    if (numValue < min || numValue > max) {
      return false;
    }
  }
  
  // 5. 自定义业务逻辑校验
  // 在此添加具体的业务校验逻辑
  
  // 所有校验通过，返回true
  return true;
}

/**
 * ===== 常用正则表达式参考 =====
 * 
 * 手机号: /^1[3-9]\d{9}$/
 * 身份证号: /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/
 * 邮箱: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
 * 正整数: /^\d+$/
 * 金额（最多2位小数）: /^\d+(\.\d{1,2})?$/
 * 中文: /^[\u4e00-\u9fa5]+$/
 * 英文: /^[a-zA-Z]+$/
 * 日期: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
 * 
 * ===== 宜搭内使用方式 =====
 * 1. 在表单设计器中选中目标字段
 * 2. 打开【校验】面板
 * 3. 选择【自定义校验】选项
 * 4. 粘贴本代码到代码编辑区域
 * 5. 宜搭平台会自动调用 validateRule 函数
 * 6. 在【错误提示】中设置失败时的提示文字
 * 
 * 注意事项:
 * - 返回true表示校验通过，返回false表示校验不通过
 * - 宜搭平台会自动调用validateRule函数并处理错误提示
 * - 如需自定义错误提示文字，在【校验】面板的【错误提示】中设置
 * - 所有代码必须放在validateRule函数内部，函数外部代码不会执行
 * - 校验代码中不应修改其他字段的值
 *
 * 代码版本号: v2.0.0
 */
