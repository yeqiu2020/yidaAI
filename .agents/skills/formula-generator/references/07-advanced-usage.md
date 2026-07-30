# 07 - 高级用法：API方式调用、临时脚本说明、marks底层程序

> 本文件由 SKILL.md 下沉而来。最短执行路径（CLI方式）见 [../SKILL.md](../SKILL.md) 第2步。

## 一、API方式调用（程序集成）

**适用场景**：
- 其他 Node.js 程序需要调用公式生成功能
- 需要批量生成多个公式
- 需要在代码中动态构建公式配置

**执行步骤**：

1. **从用户需求中提取信息**：
   - 公式名称
   - 分类目录（日期计算/文本处理/逻辑判断/数学计算/身份证处理/子表处理/其他）
   - 字段显示名和字段ID
   - 公式逻辑

2. **构建公式文本**：
   - 使用零宽空格 `\u200b` 包裹字段名：`​字段名​`
   - 按照宜搭公式规范编写表达式

3. **调用生成器**（从项目根目录调用）：
   ```javascript
   const { generateYidaFormula, ZERO_WIDTH_SPACE } = require('./.agents/skills/formula-generator/scripts/formula_generator_wrapper.js');

   const result = generateYidaFormula({
     formulaName: "合同名称自动生成",
     category: "子表处理",
     formulaText: "IF(EQ(COUNT(" + ZERO_WIDTH_SPACE + "产品明细.产品名称" + ZERO_WIDTH_SPACE + "),0),...)",
     fields: [
       { displayName: "客户名称", fieldId: "textField_mlllvc7d" },
       { displayName: "产品明细.产品名称", fieldId: "textField_mlllvc7c" }
     ],
     // 智能输出路径配置：
     // - "项目案例" → 自动保存到当前提示词所在表单目录/公式/
     // - "场景案例" → 保存到 02宜搭场景案例库/宜搭公式/分类/
     // - 具体路径 → 直接使用该路径
     outputPath: "项目案例"
   });
   ```

   **参数说明**：
   | 参数 | 类型 | 必需 | 说明 |
   |------|------|------|------|
   | formulaName | string | ✅ | 公式名称 |
   | category | string | ✅ | 分类目录（日期计算/文本处理/逻辑判断/数学计算/身份证处理/子表处理/其他） |
   | formulaText | string | ✅ | 公式文本 |
   | fields | array | ✅ | 字段配置数组 |
   | outputPath | string | ❌ | 输出路径："项目案例"、"场景案例"或具体路径 |

4. **程序自动完成**：
   - 计算所有字段的 `from.ch` 和 `to.ch` 位置
   - 校验 `text[from.ch:to.ch]` 是否等于 `​字段名​`
   - 生成完整JSON并写入文件
   - 返回文件路径

**用户只需提供需求，AI自动调用程序生成！**

### API方式配置子表字段

```javascript
// ✅ 正确：displayName 使用完整的 "子表名.字段名"
generateYidaFormula({
  formulaName: "入库金额合计",
  formulaText: "SUMPRODUCT(​入库明细.入库数量​,​入库明细.入库单价​)",
  fields: [
    { displayName: "入库明细.入库数量", fieldId: "numberField_v4r5hpfr" },
    { displayName: "入库明细.入库单价", fieldId: "numberField_v4r5bgo9" }
  ]
});
```

## 二、关于临时脚本的重要说明

**为什么不应该创建临时JS脚本？**

1. **设计初衷**：`formula_generator_wrapper.js` 本身就是包装器，AI应该直接调用其中的函数，而不是再包装一层
2. **自动清理问题**：临时脚本会被 `cleanupTempScripts()` 自动清理，但这只是补救措施，不是正确做法
3. **版本管理混乱**：临时脚本会污染项目目录，虽然会被清理，但增加了不必要的复杂度
4. **错误处理不一致**：直接调用包装器函数可以获得更好的错误处理和返回值

**正确的调用方式**：
```javascript
// ✅ 正确：直接调用包装器函数（在AI执行环境中）
const { generateYidaFormula, ZERO_WIDTH_SPACE } = require('./.agents/skills/formula-generator/scripts/formula_generator_wrapper.js');

await generateYidaFormula({
  formulaName: "公式名称",
  category: "分类",
  formulaText: "...",
  fields: [...],
  outputPath: "项目案例"
});
```

**错误的调用方式**：
```javascript
// ❌ 错误：创建临时JS文件再执行
// 不要创建 generate_xxx.js 临时文件
// 不要通过 node generate_xxx.js 来生成公式
```

## 三、位置计算程序说明（底层引擎，⚠️ 手动配置流程已被取代）

> **注意**：以下"打开文件修改配置区再运行"的手动流程**已被 `formula_generator_wrapper.js` 的 CLI/API 方式取代**（见 SKILL.md 第2步），wrapper 内部会自动完成 marks 计算与校验。本节仅供理解底层机制。

### 程序文件

```
文件名：formula_marks_generator.js
位置：项目根目录
```

### 核心功能

| 功能 | 说明 |
|------|------|
| 字段位置自动计算 | 自动查找每个 `​字段名​` 的from.ch和to.ch |
| 多次引用处理 | 同一字段多次出现时，自动生成多个mark |
| 位置校验 | 自动验证 text[from:to] == ​字段名​ |
| 文件输出 | 直接写入JSON文件，不在控制台输出 |

### 使用步骤（旧流程，已被取代）

1. 打开 `formula_marks_generator.js`
2. 修改配置区：`formulaName`（公式名称）、`category`（分类目录）、`text`（公式文本）、`fields`（字段配置）
3. 运行 `node formula_marks_generator.js`
4. 程序自动生成JSON并写入文件

### 输出路径规则

```
02宜搭场景案例库/宜搭公式/{category}/{formulaName}.json
```
