/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 出库数量校验 - 校验出库数量不得大于库存数量
 * 版本号: v1.0.0
 * 代码类型: fieldValidation
 * 
 * 使用说明:
 * 1. 将此代码粘贴到出库数量字段的【自定义校验】中
 * 2. 在【错误提示】中设置提示信息，如：出库数量不能大于库存数量
 * 3. 确保库存数量字段ID配置正确
 * 
 * 重要说明:
 * - 所有代码必须放在validateRule(value)函数内部
 * - 返回true表示校验通过，false表示校验不通过
 * - 宜搭平台会自动处理错误提示
 */

function validateRule(value) {
  // 如果出库数量为空，不进行校验（如需必填请同时设置必填校验）
  if (value === null || value === undefined || value === '') {
    return true;
  }
  
  // 将出库数量转换为数字
  var outStockNum = Number(value);
  
  // 检查出库数量是否为有效数字
  if (isNaN(outStockNum)) {
    return false;
  }
  
  // 获取库存数量字段的值
  // 库存数量字段ID：numberField_mlxk0khx
  var stockNumField = this.$('numberField_mlxk0khx');
  
  // 如果库存数量字段不存在，返回校验通过
  if (!stockNumField) {
    return true;
  }
  
  // 获取库存数量的值
  var stockNumValue = stockNumField.getValue();
  
  // 如果库存数量为空，返回校验通过
  if (stockNumValue === null || stockNumValue === undefined || stockNumValue === '') {
    return true;
  }
  
  // 将库存数量转换为数字
  var stockNum = Number(stockNumValue);
  
  // 检查库存数量是否为有效数字
  if (isNaN(stockNum)) {
    return true;
  }
  
  // 校验规则：出库数量不得大于库存数量
  // 出库数量 <= 库存数量 时校验通过
  var isValid = outStockNum <= stockNum;
  
  return isValid;
}

/**
 * ===== 宜搭内使用方式 =====
 * 1. 在表单设计器中选中【出库数量】字段
 * 2. 打开【校验】面板
 * 3. 选择【自定义校验】选项
 * 4. 粘贴本代码到代码编辑区域
 * 5. 在【错误提示】中输入：出库数量不能大于库存数量
 * 6. 宜搭平台会自动调用validateRule函数
 * 
 * 配置说明:
 * - 库存数量字段ID：numberField_mlxk0khx
 * - 如需修改库存数量字段ID，请修改代码中的字段ID配置
 * 
 * 注意事项:
 * - 所有代码必须放在validateRule(value)函数内部
 * - 返回true表示校验通过，返回false表示校验不通过
 * - 出库数量等于库存数量时校验通过（可以全部出库）
 * - 如需同时校验出库数量必须大于0，请额外设置数值范围校验
 * 
 * 代码版本号: v1.0.0
 */
