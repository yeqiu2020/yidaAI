# 宜搭集成自动化 API 研究文档

## 研究目标
探索宜搭平台"集成&自动化"功能的 API 接口，用于获取自动化流程规则数据。

## 背景知识

宜搭的"集成&自动化"是一个独立的功能模块，允许用户：
1. 创建自动化流程（当XX发生时，执行YY）
2. 设置触发器（表单事件、定时任务等）
3. 配置执行动作（发送通知、更新数据、调用接口等）

## 可能的 API 路径

基于宜搭平台的 API 设计模式，推测以下可能的接口：

### 1. 获取自动化流程列表
```
GET /dingtalk/web/{appId}/integration/getFlows.json
GET /dingtalk/web/{appId}/automation/getRules.json
GET /dingtalk/web/{appId}/flow/getFlows.json
```

### 2. 获取单个流程详情
```
GET /dingtalk/web/{appId}/integration/getFlowDetail.json
GET /dingtalk/web/{appId}/automation/getRuleDetail.json
```

### 3. 获取触发器列表
```
GET /dingtalk/web/{appId}/integration/getTriggers.json
```

### 4. 获取执行动作列表
```
GET /dingtalk/web/{appId}/integration/getActions.json
```

## 需要抓包验证的接口

要获取这些 API，需要：

1. **打开宜搭应用后台**
   - 访问：https://www.aliwork.com/{appId}/admin

2. **进入"集成&自动化"页面**
   - 点击左侧菜单：集成&自动化
   - 或访问：https://www.aliwork.com/{appId}/integration

3. **使用浏览器开发者工具抓包**
   - 按 F12 打开开发者工具
   - 切换到 Network（网络）标签
   - 刷新页面或点击"新建自动化"
   - 查看请求的 URL 和响应数据

## 预期的数据结构

### 自动化流程对象
```json
{
  "flowId": "FLOW_XXX",
  "flowName": "库存预警通知",
  "trigger": {
    "type": "form",
    "formUuid": "FORM_XXX",
    "event": "onCreate"
  },
  "conditions": [
    {
      "field": "库存数量",
      "operator": "lessThan",
      "value": 10
    }
  ],
  "actions": [
    {
      "type": "notification",
      "template": "库存不足预警",
      "recipients": ["user1", "user2"]
    }
  ],
  "status": "enabled"
}
```

## 实现计划

### 阶段1：API 发现
- [ ] 抓包获取真实的 API 路径
- [ ] 确认请求方法（GET/POST）
- [ ] 确认请求参数
- [ ] 分析响应数据结构

### 阶段2：功能实现
- [ ] 在 `api_client.js` 中添加自动化相关 API
- [ ] 创建 `fetchAutomationFlows` 函数
- [ ] 创建 `parseAutomationData` 函数
- [ ] 更新 `sync_rules.js` 集成自动化同步

### 阶段3：测试验证
- [ ] 测试 API 调用
- [ ] 验证数据解析
- [ ] 生成自动化规则清单

## 注意事项

1. **权限问题**：集成自动化 API 可能需要特殊权限
2. **版本差异**：不同宜搭版本可能有不同的 API
3. **数据量**：自动化规则可能较多，需要分页处理
4. **复杂性**：自动化规则可能很复杂（多条件、多动作、嵌套逻辑）

## 参考资料

- 宜搭官方文档：https://www.aliwork.com/docs
- 宜搭开放平台：https://open.aliwork.com

---

**研究状态**：待抓包验证
**最后更新**：2026-03-11
