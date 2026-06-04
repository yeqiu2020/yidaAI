# 宜搭代码语法支持说明

> 宜搭不同场景的 JavaScript 语法支持差异说明
> 版本: v1.1.0
> **附: 自动化脚本必须使用 ES5**

---

## 各场景语法支持汇总

宜搭平台不同场景对 JavaScript 语法的支持程度不同：

| 场景 | 语法支持 | 说明 |
|------|---------|------|
| 表单动作代码 | ES6+ | 支持 `const`/`let`、箭头函数、`async/await` 等 |
| 字段校验代码 | ES6+ | 支持现代语法 |
| 自定义页面 | ES6+ | 支持现代语法 |
| **自动化脚本** | **ES5** | **仅支持 ES5 语法，见下方详细说明** |

---

## 自动化脚本 ES5 限制

**自动化脚本节点**（集成自动化流程中的脚本节点）**仅支持 ES5 语法**，以下特性**不能使用**：

| 特性 | 错误示例 | 正确写法 |
|------|---------|---------|
| `const` / `let` | `const x = 1` | `var x = 1` |
| 箭头函数 | `var fn = () => {}` | `var fn = function() {}` |
| 模板字符串 | `` `Hello ${name}` `` | `'Hello ' + name` |
| 解构赋值 | `var {a, b} = obj` | `var a = obj.a; var b = obj.b` |
| 可选链 | `obj?.prop` | `obj && obj.prop` |
| 展开运算符 | `[...arr]` | 使用循环或 `concat` |
| `async/await` | `async function() {}` | 使用 Promise 链式调用 |

### 自动化脚本正确示例：

```javascript
// 获取输入
var inputData = inputs.inputData || [];

// 数据处理
var result = [];
for (var i = 0; i < inputData.length; i++) {
  if (inputData[i].amount > 1000) {
    result.push(inputData[i]);
  }
}

// 输出结果
outputs.add('结果', 'result', result);
```

---

## 其他场景（表单动作/校验/自定义页面）

这些场景支持 ES6+ 语法，可以使用：

```javascript
// 变量声明
const API_URL = 'https://api.example.com';
let count = 0;

// 箭头函数
const handleClick = async () => {
  const res = await this.dataSourceMap.xxx.load();
  this.$('field')?.setValue(res?.data);
};

// 模板字符串
const message = `姓名: ${name}, 年龄: ${age}`;

// 解构赋值
const { name, age } = userData;

// 可选链
const userName = data?.user?.profile?.name || '匿名';

// 展开运算符
const newArray = [...oldArray, newItem];
```


> ⚠️ **重要提示**: 如果不确定宜搭版本支持，请优先使用 ES5待安全语法，在实际环境测试后再优化。

---

*文档版本: v1.1.0*
