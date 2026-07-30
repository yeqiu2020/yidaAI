/**
 * architect Skill - 关键功能清单生成脚本
 * 版本: 1.1.0
 * 创建日期: 2026/3/1
 * 
 * 功能: 根据功能需求生成标准化的关键功能清单表格
 */

/**
 * 生成重难点功能清单
 * @param {Array} features - 功能数组
 * @returns {string} Markdown 表格
 */
function generateDifficultyFeaturesTable(features) {
    let md = `#### 🔴 重难点功能清单\n\n`;
    md += `| 功能模块 | 涉及表单 | 功能描述（业务语言） | 技术实现（宜搭配置） | 影响范围 | 开发难度 | 用户确认 |\n`;
    md += `|---------|---------|-------------------|-------------------|---------|---------|---------|\n`;
    
    features.forEach(feature => {
        const difficulty = feature.difficulty === 'high' ? '🔴高' : 
                          feature.difficulty === 'medium' ? '🟡中' : '🟢低';
        md += `| ${feature.module} | ${feature.forms} | ${feature.description} | ${feature.implementation} | ${feature.impact} | ${difficulty} | ⬜ |\n`;
    });
    
    md += `\n**开发难度说明**：\n`;
    md += `- 🔴 **高难度**：需要配置多个业务关联规则或集成自动化，或需要复杂公式\n`;
    md += `- 🟡 **中难度**：需要配置单个业务关联规则或中等复杂度公式\n`;
    md += `- 🟢 **低难度**：宜搭内置功能，简单配置即可\n\n`;
    
    return md;
}

/**
 * 生成子表结构清单
 * @param {Array} subTables - 子表数组
 * @returns {string} Markdown 表格
 */
function generateSubTableList(subTables) {
    let md = `#### 🟡 子表结构清单\n\n`;
    md += `| 主表名称 | 子表名称 | 子表用途 | 关键字段 | 计算公式 | 宜搭组件类型 | 用户确认 |\n`;
    md += `|---------|---------|---------|---------|---------|------------|---------|\n`;
    
    subTables.forEach(table => {
        md += `| ${table.mainTable} | ${table.subTable} | ${table.purpose} | ${table.fields} | ${table.formula} | ${table.component} | ⬜ |\n`;
    });
    
    md += `\n**宜搭子表配置要点**：\n`;
    md += `- 子表字段类型必须与主表一致\n`;
    md += `- 关联表单字段需要配置数据过滤条件\n`;
    md += `- 数字字段需要设置小数位数（建议 2 位）\n`;
    md += `- 计算公式字段设置为"自动计算"，不要让用户手动输入\n\n`;
    
    return md;
}

/**
 * 生成跨表单数据流清单
 * @param {Array} dataFlows - 数据流数组
 * @returns {string} Markdown 表格
 */
function generateDataFlowList(dataFlows) {
    let md = `#### 🟢 跨表单数据流清单\n\n`;
    md += `| 数据流向 | 源表单（触发） | 目标表单（被影响） | 触发条件 | 数据操作 | 宜搭实现方式 | 配置复杂度 | 用户确认 |\n`;
    md += `|---------|--------------|------------------|---------|---------|------------|-----------|---------|\n`;
    
    dataFlows.forEach(flow => {
        const complexity = flow.complexity === 'high' ? '🔴高' : 
                          flow.complexity === 'medium' ? '🟡中' : '🟢低';
        md += `| ${flow.name} | ${flow.source} | ${flow.target} | ${flow.trigger} | ${flow.operation} | ${flow.implementation} | ${complexity} | ⬜ |\n`;
    });
    
    md += `\n**宜搭业务关联规则配置要点**：\n`;
    md += `- 触发时机：选择"表单提交后"或"审核通过后"\n`;
    md += `- 数据过滤：必须精确匹配（产品 ID + 仓库 ID）\n`;
    md += `- 更新操作：选择"增加/减少"而不是"覆盖"\n`;
    md += `- 并发控制：启用"乐观锁"防止数据冲突\n\n`;
    
    return md;
}

/**
 * 生成特殊功能需求清单
 * @param {Array} specialFeatures - 特殊功能数组
 * @returns {string} Markdown 表格
 */
function generateSpecialFeaturesTable(specialFeatures) {
    let md = `#### 🔵 特殊功能需求清单\n\n`;
    md += `| 功能名称 | 涉及表单 | 功能描述 | 宜搭实现方式 | 开发难度 | 是否需要定制代码 | 用户确认 |\n`;
    md += `|---------|---------|---------|------------|---------|---------------|---------|\n`;
    
    specialFeatures.forEach(feature => {
        const difficulty = feature.difficulty === 'high' ? '🔴高' : 
                          feature.difficulty === 'medium' ? '🟡中' : '🟢低';
        const needCode = feature.needCode ? '是' : '否';
        md += `| ${feature.name} | ${feature.forms} | ${feature.description} | ${feature.implementation} | ${difficulty} | ${needCode} | ⬜ |\n`;
    });
    
    md += `\n**宜搭特殊功能配置说明**：\n`;
    md += `- **扫码组件**：仅支持移动端，需要在字段配置中启用"扫码录入"\n`;
    md += `- **审批流程**：在表单设置中启用"流程"，配置审批节点和条件\n`;
    md += `- **数据报表**：建议使用宜搭内置报表，复杂报表使用 QuickBI\n`;
    md += `- **消息通知**：配置集成自动化，选择"钉钉消息"动作\n`;
    md += `- **数据权限**：在"权限管理"中配置角色和数据过滤规则\n\n`;
    
    return md;
}

/**
 * 生成完整的第二层关键功能清单
 * @param {Object} config - 配置对象
 * @returns {string} 完整的 Markdown 文档
 */
function generateFeatureList(config) {
    const { 
        difficultyFeatures = [], 
        subTables = [], 
        dataFlows = [], 
        specialFeatures = [] 
    } = config;
    
    let md = `### 第二层模板：关键功能清单\n\n`;
    
    if (difficultyFeatures.length > 0) {
        md += generateDifficultyFeaturesTable(difficultyFeatures);
    }
    
    if (subTables.length > 0) {
        md += generateSubTableList(subTables);
    }
    
    if (dataFlows.length > 0) {
        md += generateDataFlowList(dataFlows);
    }
    
    if (specialFeatures.length > 0) {
        md += generateSpecialFeaturesTable(specialFeatures);
    }
    
    return md;
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateDifficultyFeaturesTable,
        generateSubTableList,
        generateDataFlowList,
        generateSpecialFeaturesTable,
        generateFeatureList
    };
}

/**
 * 示例用法
 */
const exampleConfig = {
    difficultyFeatures: [
        {
            module: '库存自动计算',
            forms: '库存信息',
            description: '每次入库/出库后自动更新库存',
            implementation: '业务关联规则（4 个）',
            impact: '采购、销售、库存模块',
            difficulty: 'high'
        }
    ],
    subTables: [
        {
            mainTable: '销售订单',
            subTable: '订单明细',
            purpose: '记录多个产品的订购信息',
            fields: '产品、数量、单价、金额',
            formula: '金额 = 数量 × 单价',
            component: '明细表'
        }
    ],
    dataFlows: [
        {
            name: '销售出库 → 库存',
            source: '销售出库',
            target: '库存信息',
            trigger: '出库单审核通过',
            operation: '扣减对应产品库存',
            implementation: '业务关联规则',
            complexity: 'medium'
        }
    ],
    specialFeatures: [
        {
            name: '扫码入库',
            forms: '采购入库',
            description: '扫描产品条码快速录入',
            implementation: '扫码组件 + 数据联动',
            difficulty: 'medium',
            needCode: false
        }
    ]
};

// console.log(generateFeatureList(exampleConfig));
