# 宜搭元素选择器参考

## 表单设计器结构

### 主容器
- `.lc-workbench-center` - 设计器中间区域（包含画布）
- `.lc-toolbar` - 顶部工具栏
- `.lc-toolbar-left` / `.lc-toolbar-center` / `.lc-toolbar-right` - 工具栏分区

### 左侧边栏
- `.lc-dock` - 左侧图标按钮容器
- `.lc-title.lc-dock` - 单个图标按钮
- `.lc-title-icon` - 图标内部

### JS代码面板
- `.monaco-editor` - 代码编辑器
- `.save-pane-btn` - 保存按钮
- `.ve-event-setter` - 事件设置面板

### 表单区域
- `.vc-form-container` / `.next-form` / `form[role="grid"]` - 表单容器
- `.deep-form-field` - 表单字段容器
- `.next-form-item` - 表单项（另一种类名）

## 字段选择器

### 通过ID查找（推荐）
```javascript
// 使用字段ID精确查找
document.getElementById('radioField_xxx')
document.querySelector('label[for="radioField_xxx"]')
```

### 通过Label文本查找
```javascript
// 在表单容器内查找
const formContainer = document.querySelector('.lc-workbench-center');
const labels = formContainer.querySelectorAll('label');
labels.forEach(label => {
  if (label.textContent.trim() === '部门') {
    // 找到字段
  }
});
```

### 通过类名查找
```javascript
// 单选字段
.next-form-item.deep-radio-form-field

// 文本字段
.next-form-item.deep-text-form-field

// 图片字段
.next-form-item.deep-image-form-field
```

## 按钮选择器

### 保存按钮
```javascript
.save-pane-btn
button:has-text("保存")
.engine-actionitem button
```

### 新建动作按钮
```javascript
.ve-event-add-action button
button:has-text("新建动作")
```

### 高级标签
```javascript
.lc-title-txt:has-text("高级")
.next-tabs-tab-inner:has-text("高级")
```

## 事件列表

```javascript
.vs-event-list li  // 事件选项列表
```

## 最佳实践

1. **优先使用ID**：字段ID是唯一的，最可靠
2. **使用closest查找容器**：从label或input向上查找字段容器
3. **添加等待**：操作后添加适当的waitForTimeout
4. **备选方案**：提供多种选择器作为备选

## 调试技巧

```javascript
// 查看所有label
const labels = document.querySelectorAll('label');
labels.forEach((l, i) => console.log(i, l.textContent));

// 查看字段容器
const fields = document.querySelectorAll('.deep-form-field');
fields.forEach((f, i) => console.log(i, f.className));

// 查看所有按钮
const buttons = document.querySelectorAll('button');
buttons.forEach((b, i) => console.log(i, b.textContent, b.className));
```
