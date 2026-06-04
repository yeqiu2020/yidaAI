/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 版本：1.0.0
 */

// 子表数据转换成酷卡片表格数据格式
// 版本号: v1.0.2
// 代码类型: automation
//
// ===== 输入变量配置 =====
// 在脚本节点配置面板中设置:
// - 字段名: subTableData
// - 字段值: 选择上游节点的子表字段
//
// 功能说明:
// 将宜搭子表单数据转换成酷卡片组件表格数据格式
// 输出: 符合酷卡片表格格式的 {data, meta} 对象
//
// 重要提示:
// - 必须使用 // 单行注释，禁止使用 /** */ 多行注释
// - 输入数据直接使用变量名获取，如: var data = 变量名 || []
// - 输出数据使用 outputs.add(描述, 变量名, 值)
// - 不支持 console.log，请删除所有日志语句
// - 禁止使用 return 语句，使用 if-else 控制流程
// - 不需要定义 main 函数，直接在代码块中编写逻辑

// ===== 获取输入数据 =====
// 直接使用在脚本节点中配置的变量名
var subTableData = subTableData || [];

// ===== 配置参数 =====
var CONFIG = {
  // 字段映射配置: 宜搭字段ID -> {显示名称, 业务字段名}
  FIELD_MAPPING: {
    textField_ml20hmaa: { aliasName: '菜名', alias: 'menuName', dataType: 'STRING', weight: 40 },
    numberField_ml20hmac: { aliasName: '价格', alias: 'price', dataType: 'STRING', weight: 30 },
    numberField_ml20hmad: { aliasName: '份数', alias: 'quantity', dataType: 'STRING', weight: 20 }
  },
  // 需要排除的系统字段
  EXCLUDE_FIELDS: ['rowId', 'formInstId', 'createTime', 'updateTime', 'createBy', 'updateBy']
};

// 如果输入是JSON字符串，进行解析
if (typeof subTableData === 'string') {
  try {
    subTableData = JSON.parse(subTableData);
  } catch (e) {
    outputs.add('转换结果', 'result', {
      data: [],
      meta: []
    });
  }
}

// 数据验证
if (!subTableData || !Array.isArray(subTableData) || subTableData.length === 0) {
  outputs.add('转换结果', 'result', {
    data: [],
    meta: []
  });
} else {
  // ===== 数据转换处理 =====

  // 1. 处理data数组 - 将宜搭字段ID转换为业务字段名
  var data = [];
  for (var i = 0; i < subTableData.length; i++) {
    var row = subTableData[i];
    var newRow = {};

    // 遍历每一行的字段
    for (var fieldId in row) {
      // 跳过系统字段
      if (CONFIG.EXCLUDE_FIELDS.indexOf(fieldId) >= 0) {
        continue;
      }

      // 检查是否有字段映射配置
      var mapping = CONFIG.FIELD_MAPPING[fieldId];
      if (mapping) {
        // 使用业务字段名
        newRow[mapping.alias] = row[fieldId];
      } else {
        // 没有映射配置时，保留原字段名
        newRow[fieldId] = row[fieldId];
      }
    }

    data.push(newRow);
  }

  // 2. 处理meta数组 - 生成表头配置
  var meta = [];
  // 按weight降序排序
  var sortedMappings = [];
  for (var key in CONFIG.FIELD_MAPPING) {
    sortedMappings.push(CONFIG.FIELD_MAPPING[key]);
  }
  sortedMappings.sort(function(a, b) {
    return b.weight - a.weight;
  });

  // 生成meta数组
  for (var j = 0; j < sortedMappings.length; j++) {
    var map = sortedMappings[j];
    meta.push({
      aliasName: map.aliasName,
      alias: map.alias,
      dataType: map.dataType,
      weight: map.weight
    });
  }

  // 3. 组装最终结果
  var result = {
    data: data,
    meta: meta
  };

  // 输出结果
  outputs.add('转换结果', 'result', result);
}

// ===== 宜搭内使用方式 =====
// 1. 在集成自动化或流程设计器中添加【脚本节点】
// 2. 配置 Input 对象:
//    - 字段名: subTableData（在代码中直接使用此变量名获取）
//    - 字段值: 选择上游节点的子表字段
// 3. 在代码块中直接使用变量名 subTableData 获取输入数据
// 4. 使用 outputs.add('描述', '变量名', 值) 输出结果
// 5. 在下游节点中可以选择脚本节点的输出字段
// 6. 粘贴本代码到脚本编辑区域
//
// ⚠️ 重要提醒:
// - 输入数据直接使用配置的变量名获取（如 subTableData）
// - 禁止使用 return 语句，请使用 if-else 控制代码流程
// - 不要在 function 之外使用 return 语句
//
// ===== 字段映射配置说明 =====
// 请根据实际子表字段修改 CONFIG.FIELD_MAPPING 配置:
// - textField_ml20hmaa: 宜搭字段ID
//   - aliasName: 表格中显示的列名
//   - alias: data中使用的业务字段名
//   - dataType: 数据类型(STRING/NUMBER/DATE)
//   - weight: 列显示顺序权重(越大越靠左)
//
// 代码版本号: v1.0.2
