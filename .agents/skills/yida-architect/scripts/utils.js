/**
 * yida-architect Skill - 工具函数集合
 * 版本: 1.1.0
 * 创建日期: 2026/3/1
 * 
 * 功能: 提供通用的工具函数，支持业务梳理和宜搭配置
 */

/**
 * 表单分类常量
 */
const FORM_CATEGORIES = {
    BASIC: {
        name: '基础信息表',
        color: '#f9d5bb',
        borderColor: '#d4ac0d',
        description: '存储基础数据，被其他表单引用',
        examples: ['客户信息', '供应商信息', '产品信息', '仓库信息', '部门信息']
    },
    CORE: {
        name: '核心数据表',
        color: '#e6c7ff',
        borderColor: '#9b59b6',
        description: '存储核心业务数据，被业务操作表更新',
        examples: ['库存信息', '账户余额', '客户信用额度']
    },
    OPERATION: {
        name: '业务操作表',
        color: '#ffb6c1',
        borderColor: '#c0392b',
        description: '记录业务操作，触发数据更新',
        examples: ['采购入库', '销售出库', '库存调拨', '库存盘点']
    }
};

/**
 * 宜搭字段类型映射
 */
const YIDA_FIELD_TYPES = {
    text: { name: '单行文本', component: 'TextField', icon: '📝' },
    textarea: { name: '多行文本', component: 'TextareaField', icon: '📄' },
    number: { name: '数字', component: 'NumberField', icon: '🔢' },
    money: { name: '金额', component: 'MoneyField', icon: '💰' },
    date: { name: '日期', component: 'DateField', icon: '📅' },
    datetime: { name: '日期时间', component: 'DateTimeField', icon: '⏰' },
    select: { name: '下拉单选', component: 'SelectField', icon: '📋' },
    multiSelect: { name: '下拉多选', component: 'MultiSelectField', icon: '☑️' },
    radio: { name: '单选', component: 'RadioField', icon: '⭕' },
    checkbox: { name: '多选', component: 'CheckboxField', icon: '☑️' },
    associate: { name: '关联表单', component: 'AssociateFormField', icon: '🔗' },
    subform: { name: '子表单', component: 'SubformField', icon: '📊' },
    image: { name: '图片', component: 'ImageField', icon: '🖼️' },
    file: { name: '附件', component: 'FileField', icon: '📎' },
    user: { name: '成员', component: 'UserField', icon: '👤' },
    department: { name: '部门', component: 'DepartmentField', icon: '🏢' },
    address: { name: '地址', component: 'AddressField', icon: '📍' },
    phone: { name: '电话', component: 'PhoneField', icon: '📞' },
    email: { name: '邮箱', component: 'EmailField', icon: '📧' },
    barcode: { name: '扫码', component: 'BarcodeField', icon: '📲' }
};

/**
 * 宜搭业务关联规则操作类型
 */
const BUSINESS_RULE_OPERATIONS = {
    add: { name: '新增数据', description: '在目标表单中创建新记录' },
    update: { name: '更新数据', description: '更新目标表单中匹配的记录' },
    delete: { name: '删除数据', description: '删除目标表单中匹配的记录' },
    addOrUpdate: { name: '新增或更新', description: '如果匹配则更新，否则新增' }
};

/**
 * 宜搭触发时机
 */
const TRIGGER_TIMINGS = {
    onSubmit: { name: '表单提交后', description: '表单数据提交后触发' },
    beforeApprove: { name: '审核通过前', description: '审批流程通过前触发' },
    afterApprove: { name: '审核通过后', description: '审批流程通过后触发' },
    onUpdate: { name: '数据更新后', description: '表单数据更新后触发' }
};

/**
 * 开发难度等级
 */
const DIFFICULTY_LEVELS = {
    high: { name: '🔴 高', description: '需要配置多个业务关联规则或复杂公式' },
    medium: { name: '🟡 中', description: '需要配置单个业务关联规则或中等复杂度公式' },
    low: { name: '🟢 低', description: '宜搭内置功能，简单配置即可' }
};

/**
 * 生成唯一ID
 * @param {string} prefix - ID前缀
 * @param {number} index - 序号
 * @returns {string} 格式化的ID
 */
function generateId(prefix, index) {
    return `${prefix}${String(index).padStart(3, '0')}`;
}

/**
 * 验证表单名称是否符合规范
 * @param {string} name - 表单名称
 * @returns {Object} 验证结果 {valid: boolean, message: string}
 */
function validateFormName(name) {
    if (!name || name.trim() === '') {
        return { valid: false, message: '表单名称不能为空' };
    }
    if (name.length > 50) {
        return { valid: false, message: '表单名称不能超过50个字符' };
    }
    if (!/[\u4e00-\u9fa5]/.test(name)) {
        return { valid: false, message: '表单名称应包含中文' };
    }
    return { valid: true, message: '表单名称符合规范' };
}

/**
 * 验证字段名称是否符合规范
 * @param {string} name - 字段名称
 * @returns {Object} 验证结果 {valid: boolean, message: string}
 */
function validateFieldName(name) {
    if (!name || name.trim() === '') {
        return { valid: false, message: '字段名称不能为空' };
    }
    if (name.length > 20) {
        return { valid: false, message: '字段名称不能超过20个字符' };
    }
    if (!/[\u4e00-\u9fa5]/.test(name)) {
        return { valid: false, message: '字段名称应使用中文' };
    }
    // 检查是否包含特殊字符
    const specialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
    if (specialChars.test(name)) {
        return { valid: false, message: '字段名称不能包含特殊字符' };
    }
    return { valid: true, message: '字段名称符合规范' };
}

/**
 * 根据业务类型推荐表单结构
 * @param {string} businessType - 业务类型
 * @returns {Object} 推荐的表单结构
 */
function recommendFormStructure(businessType) {
    const structures = {
        inventory: {
            name: '进销存管理',
            basicForms: ['客户信息', '供应商信息', '产品信息', '仓库信息'],
            coreForms: ['库存信息'],
            operationForms: ['采购入库', '销售出库', '库存调拨', '库存盘点']
        },
        sales: {
            name: '销售管理',
            basicForms: ['客户信息', '产品信息', '销售人员'],
            coreForms: ['客户信用额度'],
            operationForms: ['销售订单', '销售出库', '销售退货', '客户跟进']
        },
        purchase: {
            name: '采购管理',
            basicForms: ['供应商信息', '产品信息', '采购人员'],
            coreForms: ['供应商信用额度'],
            operationForms: ['采购申请', '采购订单', '采购入库', '采购退货']
        },
        hr: {
            name: '人事管理',
            basicForms: ['部门信息', '职位信息', '员工信息'],
            coreForms: ['考勤记录', '薪资档案'],
            operationForms: ['请假申请', '加班申请', '报销申请', '入职办理']
        }
    };
    
    return structures[businessType] || null;
}

/**
 * 生成宜搭公式表达式
 * @param {string} type - 公式类型
 * @param {Object} params - 公式参数
 * @returns {string} 公式表达式
 */
function generateFormula(type, params) {
    const formulas = {
        sum: () => `SUM(${params.field})`,
        average: () => `AVERAGE(${params.field})`,
        count: () => `COUNT(${params.field})`,
        max: () => `MAX(${params.field})`,
        min: () => `MIN(${params.field})`,
        if: () => `IF(${params.condition}, ${params.trueValue}, ${params.falseValue})`,
        round: () => `ROUND(${params.field}, ${params.decimals || 2})`,
        datediff: () => `DATEDIF(${params.startDate}, ${params.endDate}, "${params.unit || 'D'}")`,
        concat: () => `CONCAT(${params.fields.join(', ')})`,
        lookup: () => `LOOKUP(${params.sourceField}, ${params.targetForm}, ${params.targetField})`
    };
    
    return formulas[type] ? formulas[type]() : '';
}

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @param {string} format - 格式字符串
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date, format = 'YYYY-MM-DD') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 生成版本号
 * @param {string} currentVersion - 当前版本号
 * @param {string} type - 更新类型 (major/minor/patch)
 * @returns {string} 新版本号
 */
function generateVersion(currentVersion, type = 'patch') {
    const parts = currentVersion.split('.').map(Number);
    
    switch (type) {
        case 'major':
            return `${parts[0] + 1}.0.0`;
        case 'minor':
            return `${parts[0]}.${parts[1] + 1}.0`;
        case 'patch':
        default:
            return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }
}

/**
 * 导出所有工具函数和常量
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FORM_CATEGORIES,
        YIDA_FIELD_TYPES,
        BUSINESS_RULE_OPERATIONS,
        TRIGGER_TIMINGS,
        DIFFICULTY_LEVELS,
        generateId,
        validateFormName,
        validateFieldName,
        recommendFormStructure,
        generateFormula,
        formatDate,
        generateVersion
    };
}
