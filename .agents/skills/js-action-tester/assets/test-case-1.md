# 测试用例 1: 条件显示图片组件

## 描述

测试宜搭表单中根据部门选择条件显示图片组件的功能。

## 前置条件

1. 宜搭测试应用已创建
2. 应用ID已配置
3. 宜搭账号已登录

## 测试步骤

### 1. 创建测试表单

创建包含以下字段的表单：
- 部门（单选）：财务部、人事部、销售部
- 姓名（文本）
- 图片上传（图片）

### 2. 上传JS代码

代码功能：
- 当部门="财务部" 且 姓名="李四" 时，显示图片组件
- 其他情况隐藏图片组件

### 3. 绑定事件

- 部门字段：onChange -> onDepartmentChange
- 姓名字段：onChange -> onNameChange

### 4. 执行测试

#### 测试场景 1: 条件满足
1. 选择部门 = "财务部"
2. 输入姓名 = "李四"
3. 验证图片组件显示

#### 测试场景 2: 条件不满足（部门不符）
1. 选择部门 = "人事部"
2. 输入姓名 = "李四"
3. 验证图片组件隐藏

#### 测试场景 3: 条件不满足（姓名不符）
1. 选择部门 = "财务部"
2. 输入姓名 = "张三"
3. 验证图片组件隐藏

## 预期结果

- 场景1：图片组件显示（setBehavior('NORMAL')）
- 场景2：图片组件隐藏（setBehavior('HIDDEN')）
- 场景3：图片组件隐藏（setBehavior('HIDDEN')）

## 验证点

- [ ] 表单创建成功
- [ ] 代码上传成功
- [ ] 事件绑定成功
- [ ] 场景1通过
- [ ] 场景2通过
- [ ] 场景3通过

## 参考代码

```javascript
// 条件显示图片组件.js
export function didMount() {
  console.log('条件显示图片组件代码已加载，版本号: v1.0.0');
  this.checkShowCondition();
}

export function onDepartmentChange({ value }) {
  console.log('部门变化:', value);
  this.checkShowCondition();
}

export function onNameChange({ value }) {
  console.log('姓名变化:', value);
  this.checkShowCondition();
}

export function checkShowCondition() {
  const department = this.$('departmentField').getValue();
  const name = this.$('nameField').getValue();
  console.log('检查条件 - 部门:', department, '姓名:', name);
  this.updateImageVisibility(department, name);
}

export function updateImageVisibility(department, name) {
  const imageComponent = this.$('imageField');
  if (department === '财务部' && name === '李四') {
    console.log('条件满足，显示图片组件');
    imageComponent.setBehavior('NORMAL');
  } else {
    console.log('条件不满足，隐藏图片组件');
    imageComponent.setBehavior('HIDDEN');
  }
}
```
