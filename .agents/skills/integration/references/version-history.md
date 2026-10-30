# Integration 版本历史（自 SKILL.md 外移 2026-10-30）

## 版本历史

- **v2.10.5 (2026-10-16)**：【原生流运行时不随 API 保存刷新 + 公式字段引用源=0】①lit3 555 实验：原生流 saveProcess 成功+回读正确但执行仍走旧定义，须用户设计器保存/发布（自建流不受限）；②待付公式引用 SUM 公式字段 kl5u8j6c 作源求值 0（落地-130），流公式目标/源双向禁用公式字段，总额源改用付款行 kkkskxba（860/500 双实证）。详见 references/version-history.md。
- **v2.10.4 (2026-10-15)**：【公式字段写入覆盖机制破案】流对 valueType=formula 目标字段赋值被字段自身公式重算覆盖（SUM(子表) 链在流上下文=0，公式/字面量全变 0，四轮判定实验实锤）；专属硬规则 9 + 已知限制 8 固化。配套：getProcess 树展开在顶层取树三分支、saveProcess 双槽位、JSON.stringify undefined 丢键兜底、减法 ADD+PRODUCT 安全模式、中间表字段映射实锤（付款子表 fwr6rzxa=产品编码/bmrgjus5=产品规格）。

完整版本历史见 [references/version-history.md](references/version-history.md)。
