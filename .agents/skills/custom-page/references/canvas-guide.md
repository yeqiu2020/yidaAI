# Code Canvas 开发指南

> **实验性功能（Phase 3 新增）** — Canvas 是宜搭的代码画布自定义页面链路，支持现代 React18 + hooks。
> 当文件扩展名为 `.canvas.jsx` 或 `.canvas.tsx` 时，自动走 Canvas 编译链路。

## 链路选择决策

| 条件 | 使用链路 |
|------|---------|
| 文件扩展名 `.canvas.jsx` / `.canvas.tsx` | **Canvas 链路**（本指南） |
| 文件扩展名 `.js` / `.oyd.jsx` / `.jsx`（非 canvas） | **Native 链路**（原有流程，不受影响） |
| 需要 React Hooks（useState/useEffect） | Canvas |
| 需要 `this.utils.yida.*` 数据桥 | Native（Canvas 无 this 数据桥） |
| 需要 `this.$(fieldId)` 表单字段双向绑定 | Native |
| 需要崩溃隔离（ErrorBoundary） | Canvas |
| 需要现代 React 组件库（antd/recharts） | Canvas |

### 降级策略

Canvas 是实验性功能，如遇 API 不稳定或编译问题，可降级为 Native 链路：
1. 将 `.canvas.jsx` 重命名为 `.oyd.jsx`
2. 改写为 `export function renderJsx()` 模式
3. 使用 `publish-page.js` 发布

## Canvas 与 Native 的区别

| 特性 | Native（.oyd.jsx） | Canvas（.canvas.jsx） |
|------|-------------------|----------------------|
| React 版本 | React 16 类组件 | React 18 函数组件 |
| Hooks | ❌ 不支持 | ✅ 支持 |
| import/require | ❌ 禁止 | ✅ 通过 window alias |
| this 上下文 | ✅ 页面实例 | ❌ 无 this |
| this.utils.yida | ✅ 可用 | ❌ 不可用 |
| 崩溃隔离 | ❌ 整页白屏 | ✅ ErrorBoundary |
| 编译方式 | Babel CommonJS | Babel ESM→window alias |
| Schema 物料 | Jsx | YidaCodeCanvas |
| 状态管理 | _customState | useState/useReducer |
| Tailwind | loadScript 动态加载 | 按需注入 |

## 编译链路

### 1. Babel 两阶段编译

```
源码 (.canvas.jsx/.tsx)
  ↓ Stage 1: TS/JSX → ES5 (Babel typescript + react presets)
中间代码 (含 import/export)
  ↓ Stage 2: ESM → window alias (自定义 Babel 插件)
runtimeCode (纯 JS，new Function 可执行)
```

### 2. import → window alias 转换

```javascript
// 源码
import React, { useState } from 'react';
import { Button } from 'antd';

// 编译后
var _r = window.React;
var React = _r && _r.__esModule ? _r.default : _r;
var { useState } = _r;
var _a = window.antd;
var { Button } = _a;
```

### 3. export default → YidaComp

```javascript
// 源码
export default function MyPage() { ... }

// 编译后
var YidaComp = function MyPage() { ... };
```

## 依赖白名单

| 包名 | window alias | 说明 |
|------|-------------|------|
| `react` | `React` | React 18 |
| `react-dom` | `ReactDOM` | ReactDOM |
| `antd` | `antd` | Ant Design 组件库 |
| `ahooks` | `ahooks` | React Hooks 库 |
| `d3` | `d3` | D3 可视化 |
| `@ant-design/icons` | `icons` | Ant Design 图标 |
| `dayjs` | `dayjs` | 日期处理 |
| `recharts` | `Recharts` | React 图表库 |
| `@radix-ui/themes` | `Radix` | Radix UI |
| `lucide-react` | `DynamicIcon` | Lucide 图标 |
| `framer-motion` | `FramerMotion` | 动画库 |

> 不在白名单的包会被编译为 `window["pkg"]`，运行时若未注入会报错。

## 崩溃隔离

Canvas 页面包裹在 ErrorBoundary 中，组件崩溃时不会导致整页白屏，而是显示错误信息。

## 最小示例

```jsx
import React, { useState, useEffect } from 'react';
import { Button, Input, Card } from 'antd';

export default function HelloWorld() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');

  useEffect(() => {
    console.log('Canvas page mounted');
    return () => console.log('Canvas page unmounted');
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <Card title="Canvas 页面示例">
        <p>计数: {count}</p>
        <Button type="primary" onClick={() => setCount(count + 1)}>
          点击 +1
        </Button>
        <Input
          placeholder="输入你的名字"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginTop: 12 }}
        />
        {name && <p>你好, {name}!</p>}
      </Card>
    </div>
  );
}
```

## 数据读写（HTTP 桥）

Canvas 无 `this.utils.yida` 数据桥，需要自建 HTTP 请求：

```jsx
import React, { useState, useEffect } from 'react';

const APP_TYPE = 'APP_XXX';
const BASE_URL = 'https://www.aliwork.com';

export default function DataList() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 同源 fetch 调用宜搭开放 API
    fetch(`${BASE_URL}/alibaba/web/${APP_TYPE}/query/formdesign/searchFormDatas.json?formUuid=FORM-XXX`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setList(data.data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('数据加载失败:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>加载中...</div>;

  return (
    <div>
      {list.map((item, idx) => (
        <div key={idx}>{JSON.stringify(item.formData)}</div>
      ))}
    </div>
  );
}
```

## 发布命令

```bash
# Canvas 文件自动走 Canvas 链路
node .agents/skills/custom-page/scripts/publish-page.js <页面名>.canvas.jsx <appType> [formUuid]

# 也可直接调用 canvas-publish.js
node .agents/skills/custom-page/scripts/canvas-publish.js <页面名>.canvas.jsx <appType> [formUuid]
```

## 注意事项

1. **Canvas 是实验性功能**：宜搭平台的 Canvas API 可能不稳定，native 链路作为降级方案
2. **无 this 数据桥**：Canvas 不能使用 `this.utils.yida.*`、`this.$(fieldId)` 等原生能力
3. **依赖白名单**：只能使用白名单中的依赖，新增依赖需要平台支持
4. **副作用清理**：`useEffect` 必须返回 cleanup 函数
5. **入口必须导出 YidaComp**：`export default` 会被编译为 `var YidaComp = ...`
6. **Tailwind 按需注入**：Canvas 运行时支持 Tailwind CSS 按需注入
