# 自定义页面视觉决策指南（6 步法）

> **生成页面前必须先完成此 6 步视觉决策**，避免"统一灰白 AI 味"。本指南是 [编码指南](coding-guide.md) 编注 0 的前置步骤。

---

## Step 1：信息架构梳理

在编写任何代码之前，先梳理页面的信息结构。

### 1.1 梳理清单

| 维度 | 问题 | 产出 |
|------|------|------|
| **页面类型** | 列表页 / 详情页 / 表单页 / 看板页 / 混合页？ | 页面类型标签 |
| **核心内容** | 用户第一眼应该看到什么？ | 优先级排序的内容块列表 |
| **数据来源** | 每个内容块的数据从哪来（表单/流程/外部 API）？ | 数据源映射表 |
| **操作入口** | 用户在此页面能做什么操作？ | 操作按钮清单 |
| **页面层级** | 有几层信息？是否需要 Tab / 折叠 / 分步？ | 层级结构树 |

### 1.2 信息架构模板

```markdown
## 页面：XXX管理页

### 内容块（按优先级）
1. 【顶部】统计卡片：总数 / 待处理 / 已完成
2. 【中部】筛选栏：日期范围 + 状态 + 关键词
3. 【主体】数据列表：表格形式，支持分页
4. 【底部】操作区：新建 / 批量导出

### 数据源
- 统计卡片 → searchFormDatas 聚合
- 数据列表 → searchFormDatas 分页
- 筛选项 → 本地状态

### 操作入口
- 新建 → 跳转表单提交页
- 查看详情 → 跳转数据详情页
- 导出 → 前端生成 Excel
```

### 1.3 决策规则

| 页面类型 | 推荐布局 | 说明 |
|---------|---------|------|
| 列表页 | 顶部统计 + 筛选栏 + 数据表格 | 统计卡片不超过 4 个 |
| 详情页 | 左侧导航 + 右侧详情卡片 | 宽屏左右布局，窄屏上下堆叠 |
| 看板页 | 栅格卡片布局 | 2~4 列响应式网格 |
| 表单页 | 居中表单 + 分步指引 | 最大宽度 640px |
| 混合页 | Tab 分区 + 各区独立布局 | Tab 数量 ≤ 5 |

---

## Step 2：视觉方向选择

**这是消除"AI 味"的关键步骤。** 不要默认使用灰白配色，根据业务场景选择有视觉个性的方向。

### 2.1 五套视觉方向模板

#### 方向 A：商务专业（Business Pro）

```javascript
var visualDirection = {
  name: '商务专业',
  suitableFor: '企业管理、审批流程、数据报表',
  colors: {
    primary: '#1A4D8F',       // 深蓝主色
    primaryLight: '#E8F0FE',  // 浅蓝背景
    accent: '#0D9488',        // 青色强调
    bg: '#F1F5F9',            // 冷灰背景
    bgCard: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#475569',
    border: '#CBD5E1',
  },
  borderRadius: { card: '12px', button: '8px', input: '8px', tag: '4px' },
  shadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
  spacing: 'comfortable',  // 16px 基准
  fontHeading: 'font-weight: 700; letter-spacing: -0.02em',
  fontBody: 'font-weight: 400; line-height: 1.6',
};
```

#### 方向 B：活力科技（Tech Vibrant）

```javascript
var visualDirection = {
  name: '活力科技',
  suitableFor: '数据分析、监控大屏、技术工具',
  colors: {
    primary: '#6366F1',       // 靛蓝主色
    primaryLight: '#EEF2FF',
    accent: '#F59E0B',        // 琥珀强调
    bg: '#0F172A',            // 深色背景
    bgCard: '#1E293B',        // 深色卡片
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    border: '#334155',
  },
  borderRadius: { card: '16px', button: '10px', input: '10px', tag: '6px' },
  shadow: '0 4px 20px rgba(99, 102, 241, 0.15)',
  spacing: 'comfortable',
  fontHeading: 'font-weight: 800; letter-spacing: -0.03em',
  fontBody: 'font-weight: 400; line-height: 1.7',
  gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
};
```

#### 方向 C：温暖人文（Warm Human）

```javascript
var visualDirection = {
  name: '温暖人文',
  suitableFor: 'HR、员工服务、培训学习',
  colors: {
    primary: '#EA580C',       // 橙色主色
    primaryLight: '#FFF7ED',
    accent: '#059669',        // 绿色强调
    bg: '#FEFCE8',            // 暖白背景
    bgCard: '#FFFFFF',
    text: '#292524',
    textSecondary: '#78716C',
    border: '#E7E5E4',
  },
  borderRadius: { card: '20px', button: '12px', input: '12px', tag: '8px' },
  shadow: '0 2px 12px rgba(234, 88, 12, 0.08)',
  spacing: 'loose',  // 20px 基准
  fontHeading: 'font-weight: 600; letter-spacing: 0',
  fontBody: 'font-weight: 400; line-height: 1.8',
};
```

#### 方向 D：极简效率（Minimal Efficient）

```javascript
var visualDirection = {
  name: '极简效率',
  suitableFor: '内部工具、配置管理、设置页面',
  colors: {
    primary: '#18181B',       // 近黑主色
    primaryLight: '#F4F4F5',
    accent: '#22C55E',        // 绿色强调（仅用于成功状态）
    bg: '#FAFAFA',
    bgCard: '#FFFFFF',
    text: '#18181B',
    textSecondary: '#71717A',
    border: '#E4E4E7',
  },
  borderRadius: { card: '8px', button: '6px', input: '6px', tag: '4px' },
  shadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  spacing: 'compact',  // 12px 基准
  fontHeading: 'font-weight: 600; letter-spacing: -0.01em',
  fontBody: 'font-weight: 400; line-height: 1.5',
};
```

#### 方向 E：品牌定制（Brand Custom）

```javascript
var visualDirection = {
  name: '品牌定制',
  suitableFor: '对外展示、客户门户、品牌活动',
  colors: {
    // 从宜搭平台 CSS 变量读取品牌色
    primary: 'var(--color-brand1-6)',
    primaryLight: 'var(--color-brand1-2)',
    accent: 'var(--color-brand1-9)',
    bg: 'var(--color-brand1-1)',
    bgCard: '#FFFFFF',
    text: '#1D2129',
    textSecondary: '#4E5969',
    border: '#E5E6EB',
  },
  borderRadius: { card: '12px', button: '8px', input: '8px', tag: '6px' },
  shadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
  spacing: 'comfortable',
  fontHeading: 'font-weight: 700',
  fontBody: 'font-weight: 400; line-height: 1.6',
};
```

### 2.2 方向选择决策表

| 业务场景 | 推荐方向 | 理由 |
|---------|---------|------|
| 审批流程 / 企业管理 | 商务专业 A | 严谨可信，蓝色系传递专业感 |
| 数据看板 / 监控大屏 | 活力科技 B | 深色背景突出数据，渐变增加科技感 |
| HR / 员工服务 / 培训 | 温暖人文 C | 暖色调降低距离感，增加亲和力 |
| 内部工具 / 配置管理 | 极简效率 D | 减少视觉干扰，专注功能效率 |
| 对外展示 / 客户门户 | 品牌定制 E | 跟随品牌色，统一对外形象 |
| 不确定 | 品牌定制 E | 最安全的默认选择 |

### 2.3 方向应用方式

在 `renderJsx` 顶部定义选定方向的色彩对象，全页复用：

```javascript
export function renderJsx() {
  var isMobile = this.utils.isMobile();

  // ── 视觉方向：商务专业 ──
  var colors = {
    primary: '#1A4D8F',
    primaryLight: '#E8F0FE',
    accent: '#0D9488',
    bg: '#F1F5F9',
    bgCard: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#475569',
    border: '#CBD5E1',
  };

  var styles = {
    page: {
      minHeight: '100vh',
      background: colors.bg,
      padding: isMobile ? '12px' : '24px',
      borderRadius: '0 !important',
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    },
    card: {
      background: colors.bgCard,
      borderRadius: '12px',
      border: '1px solid ' + colors.border,
      padding: isMobile ? '12px' : '20px',
      marginBottom: '16px',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
    },
    // ... 其他组件样式使用 colors 中的值
  };

  return (
    <div style={styles.page}>
      {/* 页面内容 */}
    </div>
  );
}
```

---

## Step 3：信息密度配置

根据页面使用场景选择信息密度。

### 3.1 三种密度模式

| 模式 | 适用场景 | 特征 | 间距基准 | 字号基准 |
|------|---------|------|---------|---------|
| **紧凑（Compact）** | 内部工具、配置管理、数据密集型表格 | 行高小、间距窄、信息量大 | 12px | 13px |
| **舒适（Comfortable）** | 默认推荐、企业管理页面、列表详情 | 行高适中、间距合理、阅读舒适 | 16px | 14px |
| **宽松（Loose）** | 面向客户的展示页、培训页面 | 行高大、间距宽、呼吸感强 | 20px | 15px |

### 3.2 密度配置对象

```javascript
// 紧凑模式
var density = {
  pagePadding: isMobile ? '8px' : '12px',
  cardPadding: isMobile ? '8px' : '12px',
  cardGap: '8px',
  listItemHeight: '36px',
  listItemPadding: '6px 0',
  fontSize: { xs: '11px', sm: '12px', base: '13px', md: '14px', lg: '15px', xl: '16px', h1: '20px' },
  lineHeight: { tight: '1.3', normal: '1.5', loose: '1.6' },
};

// 舒适模式（默认）
var density = {
  pagePadding: isMobile ? '12px' : '16px 24px',
  cardPadding: isMobile ? '12px' : '16px',
  cardGap: '12px',
  listItemHeight: '44px',
  listItemPadding: '10px 0',
  fontSize: { xs: '12px', sm: '13px', base: '14px', md: '15px', lg: '16px', xl: '18px', h1: '24px' },
  lineHeight: { tight: '1.4', normal: '1.6', loose: '1.8' },
};

// 宽松模式
var density = {
  pagePadding: isMobile ? '16px' : '24px 32px',
  cardPadding: isMobile ? '16px' : '24px',
  cardGap: '20px',
  listItemHeight: '56px',
  listItemPadding: '14px 0',
  fontSize: { xs: '13px', sm: '14px', base: '15px', md: '16px', lg: '18px', xl: '20px', h1: '28px' },
  lineHeight: { tight: '1.5', normal: '1.7', loose: '2.0' },
};
```

### 3.3 密度选择规则

- **移动端默认紧凑**：手机屏幕空间有限，紧凑模式优先
- **PC 端默认舒适**：大多数企业管理页面使用舒适模式
- **展示页用宽松**：面向客户或高管的页面用宽松模式增加品质感
- **用户可切换**：提供密度切换按钮时，用 `_customState.density` 记录当前模式

---

## Step 4：导航壳选择

根据页面层级和复杂度选择导航方式。

### 4.1 导航壳类型

| 类型 | 适用场景 | 实现方式 |
|------|---------|---------|
| **无导航壳** | 单一功能页、简单列表 | 直接渲染内容，无顶部栏 |
| **顶部栏 + 内容** | 需要标题和操作按钮的页面 | 固定顶部栏（标题 + 操作按钮） + 下方滚动内容 |
| **Tab 导航** | 多功能分区页面 | 顶部 Tab 栏 + Tab 内容区 |
| **左侧导航 + 内容** | 多层级详情页 | 左侧菜单树 + 右侧内容区（PC 端） |
| **底部 Tab 导航** | 移动端多功能页 | 底部固定 Tab 栏 + 上方内容区 |

### 4.2 导航壳模板

#### 顶部栏 + 内容（最常用）

```javascript
function renderTopBar(title, actions, isMobile) {
  return {
    bar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: isMobile ? '12px' : '0 24px',
      height: '56px',
      background: '#FFFFFF',
      borderBottom: '1px solid #E5E6EB',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      borderRadius: '0 !important',
    },
    title: {
      fontSize: isMobile ? '16px' : '18px',
      fontWeight: 600,
      color: '#1D2129',
    },
    actions: {
      display: 'flex',
      gap: '8px',
    },
  };
}
```

#### Tab 导航

```javascript
function renderTabNav(tabs, activeTab, isMobile) {
  return {
    tabBar: {
      display: 'flex',
      gap: '4px',
      padding: isMobile ? '8px 12px' : '0 24px',
      borderBottom: '1px solid #E5E6EB',
      overflowX: 'auto',
    },
    tab: {
      padding: '8px 16px',
      fontSize: '14px',
      fontWeight: 500,
      color: '#86909C',
      cursor: 'pointer',
      borderBottom: '2px solid transparent',
      whiteSpace: 'nowrap',
    },
    tabActive: {
      color: '#1677FF',
      borderBottom: '2px solid #1677FF',
      fontWeight: 600,
    },
  };
}
```

### 4.3 选择规则

| 条件 | 推荐导航壳 |
|------|-----------|
| 单功能、无分区 | 无导航壳 |
| 需要标题 + 操作按钮 | 顶部栏 + 内容 |
| 2~5 个功能分区 | Tab 导航 |
| >5 个分区或需要树形结构 | 左侧导航 + 内容 |
| 移动端 + 多功能 | 底部 Tab 导航 |

---

## Step 5：详情页样式注入

如果页面包含详情展示区域，需要选择详情页的布局和样式。

### 5.1 详情页布局类型

| 布局 | 适用场景 | 说明 |
|------|---------|------|
| **卡片堆叠** | 简单详情、字段不多 | 多个卡片上下排列 |
| **左右分栏** | PC 端详情页 | 左侧基本信息 + 右侧详细信息 |
| **描述列表** | 键值对形式的数据 | label-value 行列表 |
| **时间线** | 流程审批、操作日志 | 按时间顺序展示节点 |
| **步骤条 + 内容** | 分步流程展示 | 步骤标识 + 每步详情 |

### 5.2 描述列表模板

```javascript
var detailStyles = {
  descList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },
  descItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '12px 0',
    borderBottom: '1px solid #F2F3F5',
  },
  descLabel: {
    width: '120px',
    flexShrink: 0,
    fontSize: '13px',
    color: '#86909C',
    lineHeight: '1.6',
  },
  descValue: {
    flex: 1,
    fontSize: '14px',
    color: '#1D2129',
    lineHeight: '1.6',
    fontWeight: 500,
  },
};
```

### 5.3 时间线模板

```javascript
var timelineStyles = {
  timeline: {
    padding: '0 0 0 20px',
    borderLeft: '2px solid #E5E6EB',
  },
  timelineItem: {
    position: 'relative',
    padding: '0 0 20px 20px',
  },
  timelineDot: {
    position: 'absolute',
    left: '-27px',
    top: '4px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#1677FF',
    border: '2px solid #FFFFFF',
    boxShadow: '0 0 0 2px #1677FF',
  },
  timelineContent: {
    fontSize: '14px',
    color: '#1D2129',
  },
  timelineTime: {
    fontSize: '12px',
    color: '#86909C',
    marginTop: '4px',
  },
};
```

---

## Step 6：最终审查

编码完成后的视觉审查清单。

### 6.1 审查清单

| # | 检查项 | 通过标准 | 不通过处理 |
|---|--------|---------|-----------|
| 1 | **视觉个性** | 页面有明确的视觉方向，不是"灰白卡片堆叠" | 回到 Step 2 重新选择方向 |
| 2 | **色彩一致性** | 全页使用同一套色彩对象，无硬编码色值不一致 | 检查所有 style 对象，统一引用 colors |
| 3 | **间距规范** | 所有 margin/padding 是 4px 倍数 | 调整为最近的 4px 倍数 |
| 4 | **密度一致** | 全页使用同一密度模式 | 检查 spacing 配置是否统一 |
| 5 | **空状态** | 列表/数据为空时有友好提示 | 添加 empty 状态组件 |
| 6 | **加载状态** | 异步操作有 loading 反馈 | 添加 loading 动画或骨架屏 |
| 7 | **移动端适配** | `isMobile` 分支覆盖所有样式差异 | 检查每个 style 对象的 isMobile 分支 |
| 8 | **圆角统一** | 同类组件使用相同圆角值 | 统一到设计规范 |
| 9 | **字号层级** | 标题 > 正文 > 辅助文字，有明确区分 | 检查 fontSize 层级 |
| 10 | **阴影层次** | 卡片有阴影或边框区分层次 | 添加 boxShadow 或 border |

### 6.2 "AI 味"自检

以下特征出现 2 个以上，说明页面有"AI 味"：

- [ ] 全页只有灰白色，无任何品牌色或强调色
- [ ] 所有卡片完全相同，无视觉层次区分
- [ ] 字号全页统一 14px，无大小变化
- [ ] 没有任何图标或视觉装饰
- [ ] 间距全页统一，无节奏变化
- [ ] 按钮无 hover/active 状态变化

> **修复方法**：回到 Step 2 选择有视觉个性的方向，确保色彩、字号、间距有层级变化。

---

## 场景级反 AI 味红线（生成前必查）

> Step 6.2 是**通用**自检；本节是**分场景**的具体红线。弱模型最容易在这几类页面上套用同一张"白卡片 + 大标题 + 三指标"的默认脸，本节逐场景列出"必须先想清楚的问题"和"禁止的默认脸"。**选定页面类型后，先照对应红线过一遍，再动手写代码。**

### 场景 1：工作台 / 门户首页

- **必须先想清楚**：谁用？第一件事想干什么？哪个入口是高频主操作、哪些是次要？有没有"待我处理"这类需要立刻看到的动态数据？
- **禁止的默认脸**：
  - ❌ 顶部一个营销风大 Hero 横幅（工作台不是落地页，别放巨幅标语）
  - ❌ 所有功能入口做成等大九宫格平铺、无主次
  - ❌ 5 个 KPI 卡片一样大一样色（真正重要的指标要更大/更突出）
  - ❌ 一堆快捷入口堆在一起却没有"我的待办/最近使用"
- **正确做法**：主操作区（待办/高频入口）显著放大置顶，次要入口收拢；KPI 按重要性分主次，主指标配趋势或对比。

### 场景 2：数据看板 / 大屏

- **必须先想清楚**：这个屏是给谁看的（老板/一线）？核心结论是什么？哪张图承载主结论、哪些是辅助？
- **禁止的默认脸**：
  - ❌ 所有指标卡等大等色平铺，看不出主次
  - ❌ 一个饼图塞超过 5 个分类（改用条形/环形+Top N）
  - ❌ 纯色背景无分区、无卡片层次，图表悬空
  - ❌ 折线/柱状不标单位、不标时间范围
- **正确做法**：核心结论区放大居中或置顶，辅助图表环绕；深色大屏用卡片分区+发光/边框区分层次；每张图有标题、单位、时间口径。

### 场景 3：列表页 / 数据管理

- **必须先想清楚**：用户在这一页最想"筛出什么"和"批量做什么"？哪几列是决策关键列？点一行是看详情还是就地操作？
- **禁止的默认脸**：
  - ❌ 每列等宽（关键列该宽、状态/操作列该窄）
  - ❌ 每个字段都套彩色标签（只有状态类字段才用色块，否则满屏花）
  - ❌ 点一行整页跳走、丢掉列表上下文（优先抽屉/弹层看详情）
  - ❌ 空数据时只留空白表格，无空态提示
  - ❌ 筛选项一排下拉但没有"重置/已选条件"反馈
- **正确做法**：关键列加宽左对齐、数字右对齐、状态用有限几种色块；行操作用图标按钮收在末列；空态给引导文案+主操作。

### 场景 4：详情页 / 表单详情

- **必须先想清楚**：这条数据最重要的 3~5 个信息是什么？哪些字段可以折叠或次要展示？有没有流程/操作日志需要时间线？
- **禁止的默认脸**：
  - ❌ 把几十个字段一股脑平铺成"字段墙"（一行一个 label:value，看不到重点）
  - ❌ 分组标题永远只会写"基本信息 / 详细信息 / 其他信息"这种万能空话
  - ❌ label 和 value 同字号同字重，分不清主次
  - ❌ 有审批流/日志却用普通列表而不是时间线
- **正确做法**：顶部做"关键信息摘要区"（标题+状态+3~5 个核心字段），其余按业务语义分组（如"客户信息/订单金额/物流"而非"基本/详细"）；label 弱化、value 强化；流程用时间线。

### 场景 5：官网 / 落地页 / 对外展示页

- **必须先想清楚**：这页要让访客记住什么、做什么（转化目标）？品牌调性是什么？
- **禁止的默认脸**：
  - ❌ 通屏一个渐变背景从头铺到尾、无分区节奏
  - ❌ 千篇一律"居中大标题 + 一句副标题 + 两个按钮"的套路首屏
  - ❌ 每个板块都用一样的卡片，无叙事节奏
- **正确做法**：首屏突出唯一转化目标；板块之间有留白/配色/图文错落的节奏变化；跟随品牌色（见方向 E）。

### 场景 6：批量录入 / 表格填报页

- **必须先想清楚**：一次要录多少行？哪些字段有默认值/可继承上一行？怎么快速增删行、怎么校验？
- **禁止的默认脸**：
  - ❌ 每行都是完整表单纵向堆叠（应做成紧凑表格行内编辑）
  - ❌ 没有"新增一行/复制上一行/批量删除"
  - ❌ 校验只在提交时才报、且不定位到具体单元格
- **正确做法**：表格化行内编辑、紧凑密度、支持增删复制行、即时逐格校验并高亮错误单元格。

> **落地约束**：本节只是"该避开什么、该突出什么"的判断清单，具体色值/圆角/间距仍以 [设计规范](design-system.md) 为准；具体控件写法见 [组件指南](component-jsx-guide.md)。

---

## 决策结果输出

完成 6 步决策后，在代码文件顶部注释中记录决策结果：

```javascript
/**
 * 页面：XXX管理页
 * 视觉决策：
 * - 方向：商务专业（A）
 * - 密度：舒适（Comfortable）
 * - 导航壳：顶部栏 + 内容
 * - 详情布局：描述列表
 * - 主色：#1A4D8F
 * - 强调色：#0D9488
 */
```

这有助于后续维护和风格一致性管理。
