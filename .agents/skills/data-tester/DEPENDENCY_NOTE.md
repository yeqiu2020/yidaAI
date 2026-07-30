# 依赖管理说明

> 版本: 1.0.0
> 更新日期: 2026-03-31

---

## 变更说明

从 v2.0.1 开始，本 Skill 的依赖统一从项目根目录的 `node_modules` 加载，不再单独维护 node_modules。

### 原因
- 避免重复安装相同的依赖包
- 统一依赖版本管理
- 减少磁盘空间占用

### 依赖来源

| 依赖包 | 来源位置 | 版本 |
|--------|----------|------|
| axios | 根目录 node_modules | ^1.14.0 |
| playwright | 根目录 node_modules | ^1.58.2 |

### 根目录 package.json

```json
{
  "dependencies": {
    "axios": "^1.14.0",
    "playwright": "^1.58.2"
  }
}
```

---

## 注意事项

1. **不要**在 skill 目录下运行 `npm install`，所有依赖都应该在根目录安装
2. 如果 skill 需要新的依赖，请添加到根目录的 package.json 中
3. 代码中的 `require('axios')` 和 `require('playwright')` 会自动从根目录的 node_modules 解析

---

## 历史版本

### v2.0.0
- 独立维护 node_modules
- 依赖：axios@^1.13.6, playwright@^1.58.2

### v2.0.1
- 移除独立的 node_modules
- 依赖统一从根目录加载
