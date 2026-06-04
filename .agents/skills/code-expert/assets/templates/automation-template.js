// 自动化脚本代码模板
// 版本号: v6.0.0
// 代码类型: automation
//
// ===== 重要提示 =====
// 自动化脚本仅支持 ES5 语法！
// - 使用 var 而不是 const/let
// - 使用 function 而不是箭头函数
// - 使用字符串拼接而不是模板字符串
// - 不能使用解构赋值、可选链、展开运算符
// - 不能使用 async/await
// - 不能使用 console.log
// - 不支持 xhr、fetch 网络请求
// - 不支持 window、console、print 等顶级对象
// - 内存限制：超过10M会触发内存超限错误
// - CPU限制：超过5秒会触发自动保护机制
//
// ===== 核心概念 =====
// 1. Input对象：通过 inputObj.字段名 获取上游数据
// 2. 代码块：编写JavaScript逻辑处理数据
// 3. Output对象：通过 outputs.add("显示名称", "键名", 值) 输出结果
//
// ===== 输入变量配置 =====
// 在脚本节点配置面板中设置:
// 1. 找到「Input对象」区域
// 2. 点击「添加输入变量」
// 3. 字段名: 子表数据（代码中使用 inputObj.子表数据）
// 4. 字段值: 选择上游节点的子表字段

// ===== 获取输入数据 =====
var inputData = inputObj.子表数据 || [];

// 如果输入是JSON字符串，进行解析
var parsedData = inputData;
if (typeof inputData === 'string') {
  try {
    parsedData = JSON.parse(inputData);
  } catch (e) {
    outputs.add('结果', 'result', null);
  }
}

// ===== 数据验证 =====
if (!parsedData || !Array.isArray(parsedData) || parsedData.length === 0) {
  outputs.add('结果', 'result', []);
  outputs.add('处理数量', 'count', 0);
} else {
  // ===== 业务处理逻辑 =====
  
  // 示例1：数据过滤
  var filteredData = [];
  for (var i = 0; i < parsedData.length; i++) {
    if ((parsedData[i].amount || 0) > 1000) {
      filteredData.push(parsedData[i]);
    }
  }
  
  // 示例2：数据转换
  var transformedData = [];
  for (var j = 0; j < filteredData.length; j++) {
    var item = filteredData[j];
    var formattedAmount = '¥' + (item.amount ? item.amount.toFixed(2) : '0.00');
    var statusText = item.status === 'approved' ? '已审批' : '待审批';
    
    transformedData.push({
      name: item.name,
      amount: item.amount,
      formattedAmount: formattedAmount,
      status: item.status,
      statusText: statusText
    });
  }
  
  // 示例3：数据汇总
  var totalAmount = 0;
  for (var k = 0; k < transformedData.length; k++) {
    totalAmount += parseFloat(transformedData[k].amount) || 0;
  }
  
  // ===== 输出结果 =====
  // outputs.add 参数说明：
  // 第1个参数：显示名称（下游节点选择时看到的名称）
  // 第2个参数：键名（代码中引用的变量名）
  // 第3个参数：值（可以是任意类型）
  outputs.add('处理结果', 'result', transformedData);
  outputs.add('处理数量', 'count', transformedData.length);
  outputs.add('总金额', 'totalAmount', totalAmount);
  outputs.add('原始数量', 'originalCount', parsedData.length);
}

// ============================================================
// ===== 宜搭内配置步骤 =====
//
// 【步骤一】添加脚本节点
// 1. 进入集成自动化设计器
// 2. 将「脚本」节点拖拽到画布中
// 3. 连接到上游节点（如表单提交节点）
//
// 【步骤二】配置输入变量（Input对象）
// 1. 选中脚本节点，在配置面板中找到「Input对象」区域
// 2. 点击「添加输入变量」
// 3. 字段名填写: 子表数据（与代码中的 inputObj.子表数据 对应）
// 4. 字段值选择: 上游节点的子表字段
//
// 【步骤三】粘贴代码
// 1. 在「代码块」区域粘贴本代码
// 2. 确保使用 // 单行注释（本代码已符合规范）
// 3. 确保使用 inputObj.字段名 获取输入
// 4. 确保使用 outputs.add() 输出结果
// 5. 点击保存
//
// 【步骤四】配置输出变量（Output对象）
// 1. 在「Output对象」区域点击「添加输出变量」
// 2. 添加输出变量，显示名称和键名要与代码中的 outputs.add 一致：
//    - 显示名称: 处理结果，键名: result，类型: Array
//    - 显示名称: 处理数量，键名: count，类型: Number
//    - 显示名称: 总金额，键名: totalAmount，类型: Number
//    - 显示名称: 原始数量，键名: originalCount，类型: Number
//
// 【步骤五】测试代码
// 1. 在Input对象中输入测试数据
// 2. 点击测试按钮，查看输出数据
//
// 【步骤六】消费数据
// 1. 将脚本节点连接到下游节点（如新增数据节点、消息通知节点等）
// 2. 下游节点可以选择Output对象中的字段作为输入
//
// ===== 重要提示 =====
// - 必须使用 // 单行注释，禁止使用 /** */ 多行注释
// - 输入数据使用 inputObj.字段名 获取
// - 输出数据使用 outputs.add("显示名称", "键名", 值)
// - 不支持 console.log，请删除所有日志语句
// - 禁止使用 return 语句（在function之外）
// - 仅支持 ES5 语法（var、function）
// - 不支持 xhr、fetch 网络请求
// - 不支持 window、console、print 等顶级对象
// - 内存限制：超过10M会触发内存超限错误
// - CPU限制：超过5秒会触发自动保护机制
//
// 代码版本号: v6.0.0
