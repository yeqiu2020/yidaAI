/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 版本：1.0.0
 */

// [功能描述]
// 版本号: v1.0.0

// 主处理函数
function main() {
  // 1. 获取输入数据（直接使用宜搭中配置的变量名）
  var inputData = inputVariable || [];
  
  // 2. 数据验证
  if (!inputData || inputData.length === 0) {
    outputs.add("输出描述", "outputName", null);
    return;
  }
  
  // 3. 业务逻辑处理
  var result = processData(inputData);
  
  // 4. 输出结果
  outputs.add("输出描述", "outputName", result);
}

// 辅助函数
function processData(data) {
  // 处理逻辑
  return result;
}

// 执行主函数
main();

// 代码版本号: v1.0.0

/**
 * ===== 宜搭内配置步骤 =====
 * 
 * 【配置入参】
 * 1. 在宜搭流程设计器中，选择脚本节点
 * 2. 在【入参】区域添加变量：
 *    - 变量描述：输入数据的描述
 *    - 变量名：inputVariable（与代码中的变量名一致）
 *    - 变量值：选择或填写数据来源
 * 
 * 【配置出参】
 * 3. 在【出参】区域添加变量：
 *    - 变量描述：输出数据的描述
 *    - 变量名：outputName（下游节点引用的名称）
 *    - 代码中的变量：result（脚本代码中的变量名）
 * 
 * 【粘贴代码】
 * 4. 将本代码粘贴到代码编辑区域
 * 5. 修改功能描述、变量名和业务逻辑
 * 6. 保存并发布流程
 *
 * 注意事项:
 * - 仅支持ES5语法（var、function等）
 * - 不支持let/const、箭头函数等ES6+语法
 * - 不支持input.xxx方式获取参数，直接使用变量名
 * - 使用outputs.add(描述, 变量名, 值)设置输出
 * - return语句只能在函数内部使用
 * - 不支持console、window等顶级对象
 * - 数据处理超过10M会触发内存超限错误
 * - CPU占用超过5S会触发自动保护
 *
 * 代码版本号: v1.0.0
 */
