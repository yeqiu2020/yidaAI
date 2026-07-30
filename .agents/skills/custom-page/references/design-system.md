# 宜搭自定义页面设计规范

> 宜搭自定义页面默认使用 Tailwind utility `className` 组织视觉层，并保留内联 `style` 兜底。不能使用 CSS 文件、CSS Modules 或构建期样式方案。

> **响应式适配**：所有样式应根据 `this.utils.isMobile()` 判断设备类型后分别应用 PC 端和移动端的样式值。

## 设计哲学

1. **清晰优于聪明**：用户永远不应该困惑下一步做什么
2. **一致优于新奇**：相同场景使用相同的视觉模式
3. **移动优先**：用 `this.utils.isMobile()` 判断设备，响应式适配
4. **有意图的留白**：充足的间距比堆砌元素更专业
5. **避免 AI 平庸美学**：不要千篇一律的灰白配色 + 无衬线字体 + 圆角卡片

> **视觉方向选择**：编写页面前必须先完成 [6 步视觉决策](visual-decision-guide.md)，从 5 套方向模板（商务专业/活力科技/温暖人文/极简效率/品牌定制）中选择一套，确保页面有明确视觉个性。

---

## 色彩系统

在 `renderJsx` 顶部定义语义色彩对象，全页复用：

> **主色说明**：宜搭平台已内置品牌色 CSS 变量，主色相关 token 直接使用平台变量，无需硬编码色值，可随平台主题自动适配。

```javascript
export function renderJsx() {
  var colors = {
    primary:      'var(--color-brand1-6)',
    primaryHover: 'var(--color-brand1-1)',
    hover:        'var(--color-brand1-9)',
    active:       'var(--color-brand1-9)',
    disabled:     'var(--color-brand1-8)',
    primaryLight: 'var(--color-brand1-2)',

    success:        '#52C41A',
    successLight:   '#F6FFED',
    warning:        '#FAAD14',
    warningLight:   '#FFFBE6',
    error:          '#FF4D4F',
    errorLight:     '#FFF2F0',
    info:           '#1677FF',
    infoLight:      '#E6F4FF',

    text:           '#1D2129',
    textSecondary:  '#4E5969',
    textTertiary:   '#86909C',
    textDisabled:   '#C9CDD4',
    border:         '#E5E6EB',
    borderLight:    '#F2F3F5',
    bg:             '#F7F8FA',
    bgCard:         '#FFFFFF',
  };
}
```

---

## 圆角系统

| 值 | 使用场景 |
|----|---------|
| `6px`  | 小型 Badge、标签 |
| `8px`  | 输入框、开关控件、小头像（< 32px） |
| `12px` | 下拉菜单背景、小型卡片、菜单项 |
| `16px` | 下拉菜单容器、Tooltip、大头像（> 48px） |
| `24px` | 主要卡片、对话框、按钮、容器区域 |

---

## 字体规范

```javascript
var typography = {
  fontSize: {
    xs:   '12px',
    sm:   '13px',
    base: '14px',
    md:   '15px',
    lg:   '16px',
    xl:   '18px',
    xxl:  '20px',
    h1:   '24px',
  },
  fontWeight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  lineHeight: {
    tight:  1.4,
    normal: 1.6,
    loose:  1.8,
  },
};
```

---

## 间距系统

以 **8px** 为基准单位，所有间距取其倍数：

```javascript
var spacing = {
  xs:   '4px',
  sm:   '8px',
  md:   '12px',
  lg:   '16px',
  xl:   '20px',
  xxl:  '24px',
  xxxl: '32px',
  page: '16px',
};
```

---

## 常用组件样式模板

### 页面容器

```javascript
var styles = {
  page: {
    minHeight: '100vh',
    background: '#F7F8FA',
    padding: isMobile ? '12px' : '16px 24px',
    borderRadius: '0 !important',
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif',
    fontSize: '14px',
    color: '#1D2129',
    boxSizing: 'border-box',
  },
};
```

### 卡片

```javascript
card: {
  background: '#FFFFFF',
  borderRadius: '8px',
  border: '1px solid #E5E6EB',
  padding: isMobile ? '12px' : '16px',
  marginBottom: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
},
cardTitle: {
  fontSize: '15px',
  fontWeight: 600,
  color: '#1D2129',
  marginBottom: '12px',
  paddingBottom: '10px',
  borderBottom: '1px solid #F2F3F5',
},
```

### 按钮

```javascript
btnPrimary: {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  height: '32px',
  background: '#1677FF',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  outline: 'none',
},
btnDefault: {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  height: '32px',
  background: '#FFFFFF',
  color: '#1D2129',
  border: '1px solid #E5E6EB',
  borderRadius: '6px',
  fontSize: '14px',
  cursor: 'pointer',
  outline: 'none',
},
btnDanger: {
  background: '#FF4D4F',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  padding: '0 16px',
  height: '32px',
  cursor: 'pointer',
},
```

### 输入框

```javascript
input: {
  width: '100%',
  height: '32px',
  padding: '0 12px',
  border: '1px solid #E5E6EB',
  borderRadius: '6px',
  fontSize: '14px',
  color: '#1D2129',
  background: '#FFFFFF',
  outline: 'none',
  boxSizing: 'border-box',
},
```

### 标签/徽章

```javascript
tag: function(type) {
  var colorMap = {
    success: { color: '#52C41A', bg: '#F6FFED', border: '#B7EB8F' },
    warning: { color: '#FAAD14', bg: '#FFFBE6', border: '#FFE58F' },
    error:   { color: '#FF4D4F', bg: '#FFF2F0', border: '#FFCCC7' },
    info:    { color: '#1677FF', bg: '#E6F4FF', border: '#91CAFF' },
    default: { color: '#4E5969', bg: '#F2F3F5', border: '#E5E6EB' },
  };
  var c = colorMap[type] || colorMap.default;
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    color: c.color,
    background: c.bg,
    border: '1px solid ' + c.border,
  };
},
```

### 数据列表行

```javascript
listItem: {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid #F2F3F5',
},
listLabel: {
  width: '100px',
  flexShrink: 0,
  fontSize: '13px',
  color: '#86909C',
},
listValue: {
  flex: 1,
  fontSize: '14px',
  color: '#1D2129',
},
```

### 空状态

```javascript
empty: {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 16px',
  color: '#C9CDD4',
  fontSize: '14px',
},
```

---

## 原生控件 focus 边框重置（开启 Tailwind preflight 后建议做）

开启 Tailwind `preflight` 后，`input` / `textarea` / `select` 及自定义下拉触发器在**聚焦时**会出现浏览器默认的黑色 / 粗边框（focus ring），与页面主题不一致。仅靠单个样式对象里的 `outline: 'none'` 不足以覆盖所有控件，建议在 `didMount` 里一次性注入一段控件 reset，兜住 focus 边框、`appearance`、`font-weight` 和阴影：

```javascript
export function injectControlReset() {
  if (document.getElementById('cp-control-reset')) { return; }
  var style = document.createElement('style');
  style.id = 'cp-control-reset';
  style.innerHTML = [
    '.cp-page input,.cp-page textarea,.cp-page select,.cp-page .cp-select-trigger{',
    '  appearance:none;-webkit-appearance:none;font-family:inherit;font-weight:400;',
    '  outline:none!important;box-shadow:none;border:1px solid #D0D5DD;border-radius:6px;background:#fff;',
    '}',
    '.cp-page input:focus,.cp-page textarea:focus,.cp-page select:focus,.cp-page .cp-select-trigger:focus{',
    '  border-color:var(--color-brand1-6,#2F6FED)!important;outline:none!important;',
    '  box-shadow:0 0 0 3px rgba(47,111,237,.14)!important;',
    '}',
  ].join('');
  document.head.appendChild(style);
}

// didMount 中调用一次；页面根容器加 className="cp-page"
export function didMount() {
  this.injectControlReset();
  this.ensureTailwind();
  this.loadData();
}
```

> 页面根节点需带 `cp-page` 作用域类，避免样式外汄影响宿主页面；多页面切换时 reset 的 style id 建议页面专属，不要检测到全局 id 就跳过注入。

---

## 设计反模式（禁止）

❌ **禁止使用纯灰白 + 无边框的平淡布局**，至少加 `boxShadow` 或 `border` 区分层次
❌ **禁止所有文字都用同一颜色**，主文字/次要文字/辅助文字应有明显区分
❌ **禁止按钮没有视觉反馈**，hover/active 状态要有颜色变化
❌ **禁止间距随意**，所有 margin/padding 必须是 4px 的倍数
❌ **禁止卡片没有圆角**，统一使用 `borderRadius: '8px'`
❌ **禁止忽略空状态**，列表/数据为空时必须有友好提示
❌ **禁止忽略加载状态**，异步操作必须有 loading 反馈
❌ **禁止移动端不适配**，所有页面必须用 `isMobile` 做响应式处理
