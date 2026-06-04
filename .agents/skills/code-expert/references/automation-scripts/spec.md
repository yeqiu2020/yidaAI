# 自动化脚本规范

> 宜搭自动化脚本（JavaScript节点）代码编写规范
> 版本: v2.0.0
> 更新日期: 2026-05-25

---

## 一、核心概念

宜搭自动化脚本节点有三个核心概念，构成完整数据处理链条：
**输入（Input对象）→ 处理（代码块）→ 输出（Output对象）**

### 1. Input对象（输入对象）
- **定义**：当前JavaScript节点的数据输入源
- **来源**：在配置面板中手动选择的上游数据字段或静态值
- **使用方式**：在代码中通过 `inputObj.字段名` 或直接使用配置的变量名获取

### 2. 代码块
- **定义**：核心业务逻辑处理中心
- **功能**：接收Input对象数据，进行加工处理，赋值给Output对象

### 3. Output对象（输出对象）
- **定义**：当前JavaScript节点的数据输出载体
- **方法**：通过 `outputs.add("显示名称", "键名", 值)` 添加输出数据
- **下游使用**：下游节点可以直接选择脚本节点输出的字段作为输入

---

## 二、代码结构

### 标准模板
```javascript
// [功能描述]
// 版本号: v1.0.0
// 代码类型: automation

// ===== 获取输入数据 =====
// 方式1：使用 inputObj（推荐，明确数据来源）
var inputData = inputObj.子表字段名 || [];

// 方式2：直接使用配置的变量名（如果Input配置中字段名就是inputData）
// var inputData = inputData || [];

// 如果输入是JSON字符串，进行解析
if (typeof inputData === 'string') {
  try {
    inputData = JSON.parse(inputData);
  } catch (e) {
    outputs.add('结果', 'result', null);
  }
}

// 数据验证
if (!inputData || !Array.isArray(inputData) || inputData.length === 0) {
  outputs.add('结果', 'result', null);
} else {
  // 业务处理逻辑
  var result = processData(inputData);
  
  // 输出结果
  outputs.add('处理结果', 'result', result);
}

// 代码版本号: v1.0.0
```

---

## 三、必须遵守的规则

### 1. 语法限制 - 仅支持 ES5

**自动化脚本节点仅支持 ES5 语法，以下特性不能使用：**

| 特性 | 错误示例 | 正确写法 |
|------|---------|---------|
| `const` / `let` | `const x = 1` | `var x = 1` |
| 箭头函数 | `var fn = () => {}` | `var fn = function() {}` |
| 模板字符串 | `` `Hello ${name}` `` | `'Hello ' + name` |
| 解构赋值 | `var {a, b} = obj` | `var a = obj.a; var b = obj.b` |
| 可选链 | `obj?.prop` | `obj && obj.prop` |
| 展开运算符 | `[...arr]` | 使用循环或 `concat` |
| `async/await` | `async function() {}` | 使用 Promise 链式调用 |

### 2. 只能使用单行注释
```javascript
// 正确
// 这是单行注释

// 错误 - 不允许使用多行注释
/**
 * 这是多行注释
 * 不允许使用
 */
```

### 3. 不使用 this
自动化脚本中没有 `this` 上下文：
```javascript
// 错误
var value = this.$('field').getValue();

// 正确
var value = inputObj.字段名;
```

### 4. 使用 inputObj / outputs
- **输入**：使用 `inputObj.字段名` 获取上游数据
- **输出**：使用 `outputs.add("显示名称", "键名", 值)`

```javascript
// 获取输入（假设Input配置中选择了"子表数据"字段）
var data = inputObj.子表数据 || [];

// 输出结果
outputs.add('处理结果', 'result', processedData);
```

**outputs.add 参数说明：**
- 第1个参数：显示名称（下游节点选择时看到的名称）
- 第2个参数：键名（代码中引用的变量名）
- 第3个参数：值（可以是任意类型：字符串、数字、对象、数组等）

### 5. 不使用 return
使用 `if-else` 控制流程，不要在function之外使用 `return`：
```javascript
// 错误
if (!data) {
  outputs.add('结果', 'result', null);
  return; // 不允许！
}

// 正确
if (!data) {
  outputs.add('结果', 'result', null);
} else {
  // 处理逻辑
  outputs.add('结果', 'result', result);
}
```

### 6. 不支持 console.log
删除所有日志语句：
```javascript
// 错误
console.log('处理数据:', data);

// 正确（直接删除日志）
// 处理数据
```

### 7. 不支持网络请求和顶级对象
- 不支持 `xhr`、`fetch` 网络请求
- 不支持 `window`、`console`、`print` 等顶级对象和函数

### 8. 资源限制
- **内存限制**：超过10M会触发内存超限错误
- **CPU限制**：CPU占用超过5秒会触发自动保护机制（如死循环会报错）

### 9. 函数定义
- 支持在代码块里定义 `function`
- 请不要在 `function` 之外添加 `return` 语句

---

## 四、配置步骤

### 步骤1：添加脚本节点
1. 进入集成自动化设计器
2. 将「脚本」节点拖拽到画布中
3. 连接到上游节点

### 步骤2：配置输入变量（Input对象）
1. 在脚本节点配置面板中找到「Input对象」区域
2. 点击「添加输入变量」
3. **字段名**：配置代码中使用的变量名（如 `子表数据`）
4. **字段值**：选择上游节点的输出字段或输入静态值
5. 代码中使用：`inputObj.子表数据`

### 步骤3：粘贴代码
1. 在「代码块」区域粘贴脚本代码
2. 确保使用 `//` 单行注释
3. 确保使用 `inputObj.字段名` 获取输入
4. 确保使用 `outputs.add()` 输出结果

### 步骤4：配置输出变量（Output对象）
1. 在「Output对象」区域点击「添加输出变量」
2. **显示名称**：下游节点选择时看到的名称（如"处理结果"）
3. **键名**：与代码中 `outputs.add` 的第2个参数一致（如 `result`）
4. 下游节点可以使用这些输出变量

### 步骤5：测试代码
1. 在Input对象中输入测试数据
2. 点击测试按钮，查看输出数据

### 步骤6：消费数据
1. 在脚本节点下方的其他节点中
2. 当选取字段类型时，可以看到前置脚本节点Output对象对应的字段
3. 选择需要的字段作为下游节点的输入

---

## 五、常用场景

### 场景1：数据过滤
```javascript
var inputData = inputObj.子表数据 || [];

if (!Array.isArray(inputData) || inputData.length === 0) {
  outputs.add('结果', 'result', []);
} else {
  var result = [];
  for (var i = 0; i < inputData.length; i++) {
    if (inputData[i].amount > 10000) {
      result.push(inputData[i]);
    }
  }
  outputs.add('结果', 'result', result);
}
```

### 场景2：数据转换
```javascript
var inputData = inputObj.子表数据 || [];

if (!Array.isArray(inputData)) {
  outputs.add('结果', 'result', null);
} else {
  var result = [];
  for (var i = 0; i < inputData.length; i++) {
    result.push({
      name: inputData[i].name,
      formattedValue: inputData[i].value + '元'
    });
  }
  outputs.add('结果', 'result', result);
}
```

### 场景3：酷卡片表格格式转换
```javascript
var inputData = inputObj.子表数据 || [];

if (!Array.isArray(inputData) || inputData.length === 0) {
  outputs.add('转换结果', 'result', {
    data: [],
    meta: []
  });
} else {
  var processedData = [];
  for (var i = 0; i < inputData.length; i++) {
    var item = inputData[i];
    processedData.push({
      menuName: item.菜品名称 || '',
      price: item.单价 || '0',
      quantity: item.数量 || '0'
    });
  }
  
  var meta = [
    { aliasName: '菜名', dataType: 'STRING', alias: 'menuName', weight: 40 },
    { aliasName: '价格', dataType: 'STRING', alias: 'price', weight: 30 },
    { aliasName: '份数', dataType: 'STRING', alias: 'quantity', weight: 20 }
  ];
  
  outputs.add('转换结果', 'result', {
    data: processedData,
    meta: meta
  });
}
```

### 场景4：条件分支
```javascript
var status = inputObj.审批状态 || '';
var amount = inputObj.金额 || 0;

if (status === 'approved' && amount > 50000) {
  outputs.add('审批级别', 'level', 'high');
  outputs.add('是否需要总监审批', 'needDirector', true);
} else if (status === 'approved') {
  outputs.add('审批级别', 'level', 'normal');
  outputs.add('是否需要总监审批', 'needDirector', false);
} else {
  outputs.add('审批级别', 'level', 'pending');
  outputs.add('是否需要总监审批', 'needDirector', false);
}
```

---

## 六、常见错误

### 错误1：使用ES6语法
```javascript
// 错误
const data = inputObj.子表数据;
let result = [];

// 正确
var data = inputObj.子表数据;
var result = [];
```

### 错误2：使用箭头函数
```javascript
// 错误
var process = (item) => { return item.value; };

// 正确
var process = function(item) { return item.value; };
```

### 错误3：使用模板字符串
```javascript
// 错误
var msg = `处理完成，共${count}条`;

// 正确
var msg = '处理完成，共' + count + '条';
```

### 错误4：使用解构赋值
```javascript
// 错误
var { name, value } = inputObj;

// 正确
var name = inputObj.name;
var value = inputObj.value;
```

### 错误5：使用return语句
```javascript
// 错误
if (!data) {
  outputs.add('结果', 'result', null);
  return;
}

// 正确
if (!data) {
  outputs.add('结果', 'result', null);
} else {
  // 处理逻辑
}
```

### 错误6：使用console.log
```javascript
// 错误
console.log('调试信息:', data);

// 正确（删除console.log）
// 处理数据
```

---

## 七、数据流总结

```
上游节点（如表单提交）
    ↓
Input对象（选择需要的字段）
    ↓
代码块（inputObj.字段名 获取数据 → 处理逻辑 → outputs.add 输出）
    ↓
Output对象（outputs.add 添加的字段）
    ↓
下游节点（选择Output对象中的字段作为输入）
```

---

*文档版本: v2.0.0*
*更新日期: 2026-05-25*
