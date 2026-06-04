/**
 * yida-architect Skill - 自动化规则表生成脚本
 * 版本: 1.1.0
 * 创建日期: 2026/3/1
 * 
 * 功能: 根据业务逻辑生成标准化的自动化规则配置表
 */

/**
 * 生成自动化规则表
 * @param {Array} rules - 规则数组
 * @returns {string} Markdown 表格
 */
function generateAutomationRulesTable(rules) {
    let md = `### 第四层模板：自动化规则表\n\n`;
    md += `#### 业务关联规则配置\n\n`;
    md += `| 规则编号 | 规则名称 | 触发表单 | 触发时机 | 目标表单 | 操作类型 | 数据过滤条件 | 字段映射 | 执行顺序 | 状态 |\n`;
    md += `|---------|---------|---------|---------|---------|---------|------------|---------|---------|-----|\n`;
    
    rules.forEach((rule, index) => {
        const ruleId = `BR${String(index + 1).padStart(3, '0')}`;
        const status = rule.status || '✅';
        md += `| ${ruleId} | ${rule.name} | ${rule.triggerForm} | ${rule.triggerTiming} | ${rule.targetForm} | ${rule.operationType} | ${rule.filterCondition} | ${rule.fieldMapping} | ${rule.executionOrder} | ${status} |\n`;
    });
    
    md += `\n**宜搭业务关联规则配置说明**：\n`;
    md += `- **触发时机**：表单提交后 / 审核通过前 / 审核通过后\n`;
    md += `- **操作类型**：新增数据 / 更新数据 / 删除数据 / 新增或更新\n`;
    md += `- **数据过滤**：用于匹配目标表单的记录（如：产品 ID = 当前.产品 ID）\n`;
    md += `- **字段映射**：源表单字段与目标表单字段的对应关系\n`;
    md += `- **执行顺序**：多个规则同时触发时的执行优先级（数字越小优先级越高）\n\n`;
    
    return md;
}

/**
 * 生成集成自动化配置表
 * @param {Array} automations - 自动化数组
 * @returns {string} Markdown 表格
 */
function generateIntegrationAutomationTable(automations) {
    let md = `#### 集成自动化配置\n\n`;
    md += `| 自动化编号 | 自动化名称 | 触发器 | 触发条件 | 执行动作 | 目标系统/服务 | 配置参数 | 执行频率 | 状态 |\n`;
    md += `|-----------|-----------|-------|---------|---------|-------------|---------|---------|-----|\n`;
    
    automations.forEach((automation, index) => {
        const autoId = `IA${String(index + 1).padStart(3, '0')}`;
        const status = automation.status || '✅';
        md += `| ${autoId} | ${automation.name} | ${automation.trigger} | ${automation.condition} | ${automation.action} | ${automation.target} | ${automation.params} | ${automation.frequency} | ${status} |\n`;
    });
    
    md += `\n**宜搭集成自动化配置说明**：\n`;
    md += `- **触发器**：表单事件 / 定时触发 / 流程事件 / 消息事件\n`;
    md += `- **执行动作**：发送消息 / 调用 API / 更新表单 / 创建任务 / 调用连接器\n`;
    md += `- **目标系统**：钉钉 / 企业微信 / 飞书 / 自定义 API / 其他宜搭表单\n`;
    md += `- **执行频率**：实时 / 每小时 / 每天 / 每周 / 每月\n\n`;
    
    return md;
}

/**
 * 生成审批流程配置表
 * @param {Array} processes - 流程数组
 * @returns {string} Markdown 表格
 */
function generateApprovalProcessTable(processes) {
    let md = `#### 审批流程配置\n\n`;
    md += `| 流程编号 | 流程名称 | 所属表单 | 审批节点 | 审批人 | 审批条件 | 操作权限 | 超时设置 | 状态 |\n`;
    md += `|---------|---------|---------|---------|-------|---------|---------|---------|-----|\n`;
    
    processes.forEach((process, index) => {
        const processId = `AP${String(index + 1).padStart(3, '0')}`;
        const status = process.status || '✅';
        md += `| ${processId} | ${process.name} | ${process.form} | ${process.node} | ${process.approver} | ${process.condition} | ${process.permissions} | ${process.timeout} | ${status} |\n`;
    });
    
    md += `\n**宜搭审批流程配置说明**：\n`;
    md += `- **审批节点**：开始 → 审批 → 抄送 → 结束（支持多级审批）\n`;
    md += `- **审批人**：指定人员 / 角色 / 部门负责人 / 表单字段值\n`;
    md += `- **审批条件**：根据表单字段值决定流程走向（如：金额 > 10000 需要总监审批）\n`;
    md += `- **操作权限**：同意 / 拒绝 / 转交 / 退回 / 加签\n`;
    md += `- **超时设置**：审批超时自动提醒或自动通过\n\n`;
    
    return md;
}

/**
 * 生成公式计算规则表
 * @param {Array} formulas - 公式数组
 * @returns {string} Markdown 表格
 */
function generateFormulaRulesTable(formulas) {
    let md = `#### 公式计算规则\n\n`;
    md += `| 公式编号 | 所属表单 | 字段名称 | 公式类型 | 公式表达式 | 计算时机 | 依赖字段 | 精度设置 | 状态 |\n`;
    md += `|---------|---------|---------|---------|-----------|---------|---------|---------|-----|\n`;
    
    formulas.forEach((formula, index) => {
        const formulaId = `FM${String(index + 1).padStart(3, '0')}`;
        const status = formula.status || '✅';
        md += `| ${formulaId} | ${formula.form} | ${formula.field} | ${formula.type} | ${formula.expression} | ${formula.timing} | ${formula.dependencies} | ${formula.precision} | ${status} |\n`;
    });
    
    md += `\n**宜搭公式配置说明**：\n`;
    md += `- **公式类型**：数学计算 / 文本处理 / 日期计算 / 逻辑判断 / 数据联动\n`;
    md += `- **计算时机**：实时计算 / 表单提交时 / 定时计算\n`;
    md += `- **依赖字段**：公式中引用的其他字段，这些字段值变化时触发重新计算\n`;
    md += `- **精度设置**：数字字段的小数位数（建议金额用 2 位，数量用 3 位）\n`;
    md += `- **常用函数**：SUM（求和）、IF（条件判断）、ROUND（四舍五入）、DATEDIF（日期差）\n\n`;
    
    return md;
}

/**
 * 生成完整的第四层自动化规则表
 * @param {Object} config - 配置对象
 * @returns {string} 完整的 Markdown 文档
 */
function generateAutomationRules(config) {
    const { 
        businessRules = [], 
        integrationAutomations = [], 
        approvalProcesses = [], 
        formulaRules = [] 
    } = config;
    
    let md = '';
    
    if (businessRules.length > 0) {
        md += generateAutomationRulesTable(businessRules);
    }
    
    if (integrationAutomations.length > 0) {
        md += generateIntegrationAutomationTable(integrationAutomations);
    }
    
    if (approvalProcesses.length > 0) {
        md += generateApprovalProcessTable(approvalProcesses);
    }
    
    if (formulaRules.length > 0) {
        md += generateFormulaRulesTable(formulaRules);
    }
    
    return md;
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateAutomationRulesTable,
        generateIntegrationAutomationTable,
        generateApprovalProcessTable,
        generateFormulaRulesTable,
        generateAutomationRules
    };
}

/**
 * 示例用法
 */
const exampleConfig = {
    businessRules: [
        {
            name: '采购入库增加库存',
            triggerForm: '采购入库',
            triggerTiming: '审核通过后',
            targetForm: '库存信息',
            operationType: '更新数据',
            filterCondition: '产品 ID = 当前.产品 ID',
            fieldMapping: '库存数量 = 库存数量 + 入库数量',
            executionOrder: 1,
            status: '✅'
        }
    ],
    integrationAutomations: [
        {
            name: '库存预警通知',
            trigger: '定时触发',
            condition: '每天 9:00',
            action: '发送钉钉消息',
            target: '钉钉群',
            params: '库存低于安全库存的产品列表',
            frequency: '每天',
            status: '✅'
        }
    ],
    approvalProcesses: [
        {
            name: '采购审批',
            form: '采购入库',
            node: '主管审批',
            approver: '部门主管',
            condition: '金额 > 5000',
            permissions: '同意/拒绝/转交',
            timeout: '24小时自动提醒',
            status: '✅'
        }
    ],
    formulaRules: [
        {
            form: '销售订单',
            field: '订单金额',
            type: '数学计算',
            expression: 'SUM(明细表.金额)',
            timing: '实时计算',
            dependencies: '明细表.金额',
            precision: '2位小数',
            status: '✅'
        }
    ]
};

// console.log(generateAutomationRules(exampleConfig));
