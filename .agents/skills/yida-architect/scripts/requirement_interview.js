/**
 * yida-architect Skill - 需求访谈问卷（分阶段版）
 * 版本: 1.2.0
 * 创建日期: 2026/3/1
 * 
 * 功能: 通过分阶段问答机制帮助用户梳理业务需求，生成标准化的需求文档
 * 优化：分四阶段进行，每阶段确认后再进入下一阶段
 */

/**
 * 访谈阶段定义
 */
const INTERVIEW_STAGES = {
    STAGE_1: {
        name: '业务逻辑梳理',
        description: '搞清楚"系统要管什么"、"有哪些表单"、"它们之间什么关系"',
        estimatedTime: '10-15 分钟',
        deliverables: ['业务逻辑图（Mermaid）', '表单清单'],
        status: 'pending' // pending, active, completed
    },
    STAGE_2: {
        name: '功能需求细化',
        description: '明确"系统要做什么"、"有哪些复杂功能"',
        estimatedTime: '10-15 分钟',
        deliverables: ['关键功能清单（4个表格）'],
        status: 'pending'
    },
    STAGE_3: {
        name: '字段详细定义',
        description: '确定"每个表单有哪些字段"、"字段什么类型"',
        estimatedTime: '15-20 分钟',
        deliverables: ['字段定义表（逐个表单）'],
        status: 'pending'
    },
    STAGE_4: {
        name: '自动化规则配置',
        description: '明确"系统如何自动运行"',
        estimatedTime: '10-15 分钟',
        deliverables: ['自动化规则表'],
        status: 'pending'
    }
};

/**
 * 第一阶段：业务逻辑梳理问题
 * 目标：搞清楚业务场景、表单结构、数据流向
 */
const STAGE_1_QUESTIONS = {
    // 业务背景
    businessContext: [
        {
            id: 's1_q1',
            question: '请简单描述一下您的业务场景，您是什么行业？主要做什么业务？',
            type: 'open',
            example: '例如：我是做装修行业的，需要管理业主信息、跟进记录、设计方案等',
            purpose: '了解业务领域和核心痛点',
            required: true
        },
        {
            id: 's1_q2',
            question: '您目前是如何管理这些业务的？有什么痛点？',
            type: 'open',
            example: '例如：目前用 Excel 记录，信息分散，跟进不规范，无法统计转化率',
            purpose: '了解现状和痛点',
            required: true
        },
        {
            id: 's1_q3',
            question: '您希望这个系统主要给哪些人使用？',
            type: 'multiSelect',
            options: ['销售人员', '设计师', '销售主管/经理', '老板/管理层', '财务人员', '其他'],
            purpose: '确定用户角色',
            required: true
        },
        {
            id: 's1_q4',
            question: '您估计每天/每月大约有多少笔业务数据？',
            type: 'singleSelect',
            options: ['每天少于 10 笔', '每天 10-50 笔', '每天 50-100 笔', '每天超过 100 笔', '不确定'],
            purpose: '评估数据量',
            required: false
        }
    ],

    // 表单结构
    formStructure: [
        {
            id: 's1_q5',
            question: '根据您的业务，我初步识别出以下基础信息，请确认或补充：',
            type: 'multiSelectWithCustom',
            defaultOptions: ['客户信息', '员工信息', '产品/服务信息'],
            allowCustom: true,
            customLabel: '其他基础信息',
            purpose: '识别基础信息表',
            required: true
        },
        {
            id: 's1_q6',
            question: '以下业务操作是否需要记录？（根据您的业务自动推荐）',
            type: 'multiSelectWithCustom',
            dynamicOptions: true, // 根据业务类型动态生成
            allowCustom: true,
            customLabel: '其他业务操作',
            purpose: '识别业务操作表',
            required: true
        },
        {
            id: 's1_q7',
            question: '这些业务之间是什么流程关系？',
            type: 'open',
            example: '例如：录入客户 → 多次跟进 → 交定金 → 分配设计师 → 收集需求 → 设计方案',
            purpose: '了解表单之间的数据流向',
            required: true
        },
        {
            id: 's1_q8',
            question: '某个业务是否需要记录多条明细？',
            type: 'open',
            example: '例如：一个客户有多次跟进记录；一个订单包含多个产品',
            purpose: '识别子表需求',
            required: false
        }
    ]
};

/**
 * 第二阶段：功能需求细化问题
 * 目标：明确计算需求、审批流程、通知提醒
 */
const STAGE_2_QUESTIONS = {
    calculations: [
        {
            id: 's2_q1',
            question: '需要哪些自动计算功能？',
            type: 'multiSelect',
            options: [
                '状态自动更新（根据操作自动变更状态）',
                '数据统计（转化率、业绩统计等）',
                '金额计算（数量×单价=金额等）',
                '数据联动（选择A自动带出B）',
                '暂时不需要'
            ],
            purpose: '识别计算需求',
            required: true
        },
        {
            id: 's2_q2',
            question: '如果需要状态自动更新，具体是什么规则？',
            type: 'open',
            condition: '选择了"状态自动更新"',
            example: '例如：交定金后客户状态变为"已交定金"',
            purpose: '明确状态流转规则',
            required: false
        }
    ],

    approval: [
        {
            id: 's2_q3',
            question: '哪些环节需要审批？',
            type: 'multiSelect',
            options: [
                '不需要审批',
                '收款确认（如：交定金需要财务确认）',
                '业务审核（如：设计需求需要主管审核）',
                '方案确认（如：设计方案需要客户确认）',
                '其他（请描述）'
            ],
            purpose: '识别审批需求',
            required: true
        }
    ],

    notifications: [
        {
            id: 's2_q4',
            question: '需要哪些提醒通知？',
            type: 'multiSelect',
            options: [
                '跟进提醒（多久未跟进提醒销售）',
                '进度提醒（如：设计超时提醒主管）',
                '到期提醒（如：定金有效期提醒）',
                '客户关怀（如：生日提醒）',
                '暂时不需要'
            ],
            purpose: '识别通知需求',
            required: true
        }
    ],

    reports: [
        {
            id: 's2_q5',
            question: '需要查看哪些统计报表？',
            type: 'multiSelect',
            options: [
                '客户统计（客户数量、转化率等）',
                '业绩统计（按销售统计业绩）',
                '进度统计（各阶段客户数量）',
                '跟进统计（跟进次数、跟进率等）',
                '暂时不需要报表'
            ],
            purpose: '识别报表需求',
            required: true
        }
    ],

    permissions: [
        {
            id: 's2_q6',
            question: '数据权限如何控制？',
            type: 'singleSelect',
            options: [
                '所有人都能看到所有数据',
                '只能看到自己录入的数据',
                '销售看自己的，主管看全部',
                '按部门隔离数据',
                '不确定，需要建议'
            ],
            purpose: '识别权限需求',
            required: true
        }
    ]
};

/**
 * 第三阶段：字段详细定义问题
 * 目标：逐个表单确定字段
 */
const STAGE_3_TEMPLATE = {
    // 针对每个表单的提问模板
    perFormQuestions: [
        {
            id: 's3_q1',
            question: '【{formName}】需要记录哪些信息？',
            type: 'open',
            example: '例如：客户姓名、电话、地址、意向程度等',
            purpose: '收集字段列表',
            required: true
        },
        {
            id: 's3_q2',
            question: '【{formName}】哪些字段是必填的？',
            type: 'open',
            example: '例如：客户姓名、电话是必填的',
            purpose: '确定必填字段',
            required: true
        },
        {
            id: 's3_q3',
            question: '【{formName}】哪些字段需要自动计算或联动？',
            type: 'open',
            example: '例如：金额 = 数量 × 单价',
            purpose: '识别计算公式',
            required: false
        }
    ]
};

/**
 * 第四阶段：自动化规则配置问题
 * 目标：确定自动化规则和流程
 */
const STAGE_4_QUESTIONS = {
    businessRules: [
        {
            id: 's4_q1',
            question: '哪些操作需要自动更新其他表单？',
            type: 'open',
            example: '例如：新增跟进记录后，自动更新客户的"最后跟进时间"',
            purpose: '识别业务关联规则',
            required: true
        },
        {
            id: 's4_q2',
            question: '审批流程的具体节点是什么？',
            type: 'open',
            example: '例如：交定金 → 财务确认；设计需求 → 主管审核 → 分配设计师',
            purpose: '明确审批节点',
            required: false
        }
    ],

    automation: [
        {
            id: 's4_q3',
            question: '提醒通知的具体规则是什么？',
            type: 'open',
            example: '例如：3天未跟进提醒销售；7天未出方案提醒主管',
            purpose: '明确提醒规则',
            required: false
        },
        {
            id: 's4_q4',
            question: '还有其他需要自动化的场景吗？',
            type: 'open',
            purpose: '收集其他自动化需求',
            required: false
        }
    ]
};

/**
 * 根据业务类型推荐默认选项
 * @param {string} businessType - 业务类型
 * @returns {Object} 推荐的表单和功能
 */
function getBusinessRecommendations(businessType) {
    const recommendations = {
        '装修': {
            basicForms: ['客户信息', '员工信息', '装修套餐'],
            operationForms: ['客户跟进', '定金收款', '设计需求', '设计方案'],
            features: ['状态自动更新', '数据统计', '跟进提醒', '进度提醒'],
            workflow: '录入客户 → 跟进记录 → 交定金 → 分配设计师 → 设计需求 → 设计方案'
        },
        '销售': {
            basicForms: ['客户信息', '产品信息', '员工信息'],
            operationForms: ['销售机会', '报价单', '销售订单', '合同'],
            features: ['金额计算', '业绩统计', '跟进提醒', '客户关怀'],
            workflow: '线索 → 商机 → 报价 → 订单 → 合同 → 回款'
        },
        '库存': {
            basicForms: ['产品信息', '仓库信息', '供应商信息'],
            operationForms: ['采购入库', '销售出库', '库存调拨', '库存盘点'],
            features: ['库存自动更新', '库存预警', '数据联动'],
            workflow: '采购 → 入库 → 库存 → 出库 → 销售'
        },
        '教育': {
            basicForms: ['学员信息', '课程信息', '教师信息'],
            operationForms: ['报名登记', '课程安排', '考勤记录', '成绩管理'],
            features: ['考勤统计', '成绩计算', '到期提醒'],
            workflow: '咨询 → 报名 → 排课 → 上课 → 考核'
        }
    };

    return recommendations[businessType] || null;
}

/**
 * 生成阶段引导语
 * @param {string} stage - 阶段名称
 * @returns {string} 引导语
 */
function generateStageIntro(stage) {
    const intros = {
        STAGE_1: `
## 🎯 第一阶段：业务逻辑梳理

**目标**：搞清楚"系统要管什么"、"有哪些表单"、"它们之间什么关系"

**预计时间**：10-15 分钟

**本阶段结束后，您将获得**：
- ✅ 业务逻辑图（可视化展示表单关系）
- ✅ 表单清单（所有基础表和业务表）

**确认无误后，我们再进入下一阶段。**

---

让我们开始吧！👇
`,
        STAGE_2: `
## 🎯 第二阶段：功能需求细化

**目标**：明确"系统要做什么"、"有哪些复杂功能"

**预计时间**：10-15 分钟

**本阶段结束后，您将获得**：
- ✅ 关键功能清单（重难点功能、审批流程、通知提醒等）

**确认无误后，我们再进入下一阶段。**

---

让我们继续！👇
`,
        STAGE_3: `
## 🎯 第三阶段：字段详细定义

**目标**：确定"每个表单有哪些字段"、"字段什么类型"

**预计时间**：15-20 分钟

**本阶段结束后，您将获得**：
- ✅ 字段定义表（每个表单的字段详细配置）

**确认无误后，我们再进入下一阶段。**

---

让我们继续！👇
`,
        STAGE_4: `
## 🎯 第四阶段：自动化规则配置

**目标**：明确"系统如何自动运行"

**预计时间**：10-15 分钟

**本阶段结束后，您将获得**：
- ✅ 自动化规则表（业务规则、审批流程、提醒通知）

**确认无误后，我们将生成完整的需求文档。**

---

让我们完成最后一步！👇
`
    };

    return intros[stage] || '';
}

/**
 * 生成阶段总结
 * @param {string} stage - 阶段名称
 * @param {Object} answers - 阶段回答
 * @returns {string} 阶段总结
 */
function generateStageSummary(stage, answers) {
    // 根据阶段生成不同的总结
    const summaries = {
        STAGE_1: () => {
            return `
## ✅ 第一阶段完成总结

### 业务场景
${answers.s1_q1 || '待补充'}

### 现状与痛点
${answers.s1_q2 || '待补充'}

### 使用人群
${Array.isArray(answers.s1_q3) ? answers.s1_q3.join('、') : answers.s1_q3}

### 识别出的表单
**基础信息表**：${Array.isArray(answers.s1_q5) ? answers.s1_q5.join('、') : '待确认'}

**业务操作表**：${Array.isArray(answers.s1_q6) ? answers.s1_q6.join('、') : '待确认'}

### 业务流程
${answers.s1_q7 || '待补充'}

---

**请确认以上信息是否正确？**
- 回复"确认无误"进入第二阶段
- 回复修改意见，我会调整
`;
        },
        STAGE_2: () => {
            return `
## ✅ 第二阶段完成总结

### 自动计算功能
${Array.isArray(answers.s2_q1) ? answers.s2_q1.join('、') : answers.s2_q1}

### 审批流程
${Array.isArray(answers.s2_q3) ? answers.s2_q3.join('、') : answers.s2_q3}

### 提醒通知
${Array.isArray(answers.s2_q4) ? answers.s2_q4.join('、') : answers.s2_q4}

### 统计报表
${Array.isArray(answers.s2_q5) ? answers.s2_q5.join('、') : answers.s2_q5}

### 数据权限
${answers.s2_q6}

---

**请确认以上功能需求是否完整？**
- 回复"确认无误"进入第三阶段
- 回复修改意见或补充需求
`;
        }
    };

    return summaries[stage] ? summaries[stage]() : '';
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        INTERVIEW_STAGES,
        STAGE_1_QUESTIONS,
        STAGE_2_QUESTIONS,
        STAGE_3_TEMPLATE,
        STAGE_4_QUESTIONS,
        getBusinessRecommendations,
        generateStageIntro,
        generateStageSummary
    };
}
