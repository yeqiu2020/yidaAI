/**
 * 宜搭系统功能图谱生成脚本
 * 版本: v1.0.0
 * 功能: 从JSON配置或Markdown文档生成Mermaid图表
 * 更新说明: 初始版本
 */

const fs = require('fs');
const path = require('path');

/**
 * 系统关系图谱生成器类
 */
class YidaSystemMapGenerator {
  constructor(config) {
    this.config = config;
    this.outputDir = config.outputDir || './系统功能图谱';
  }

  /**
   * 生成完整的系统图谱
   */
  generateAll() {
    console.log('开始生成系统功能图谱...');
    
    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 生成各类图表
    this.generateFormRelationMap();
    this.generateFieldDependencyMap();
    this.generateDataLinkageMap();
    this.generateAutomationMap();
    this.generateComprehensiveMap();

    console.log(`图谱生成完成，输出目录: ${this.outputDir}`);
  }

  /**
   * 生成表单关系图 (ER图)
   */
  generateFormRelationMap() {
    const { forms, relationships } = this.config;
    
    let mermaid = `---\n`;
    mermaid += `# ${this.config.projectName} - 表单关系图\n`;
    mermaid += `# 版本: v1.0.0\n`;
    mermaid += `# 生成时间: ${new Date().toLocaleString()}\n`;
    mermaid += `# 自动生成的文件，请勿手动修改\n`;
    mermaid += `---\n\n`;
    mermaid += `erDiagram\n`;

    // 按模块分组
    const modules = this.groupByModule(forms);
    
    for (const [moduleName, moduleForms] of Object.entries(modules)) {
      mermaid += `    subgraph "${moduleName}"\n`;
      moduleForms.forEach(form => {
        mermaid += `        ${form.code}[${form.name}]\n`;
      });
      mermaid += `    end\n\n`;
    }

    // 添加关系
    relationships.forEach(rel => {
      const arrow = this.getRelationshipArrow(rel.type);
      mermaid += `    ${rel.from} ${arrow} ${rel.to} : "${rel.description}"\n`;
    });

    // 添加表单字段定义
    forms.forEach(form => {
      if (form.fields && form.fields.length > 0) {
        mermaid += `\n    ${form.code} {\n`;
        form.fields.forEach(field => {
          const pk = field.isPrimaryKey ? ' PK' : '';
          const fk = field.isForeignKey ? ' FK' : '';
          mermaid += `        ${field.type} ${field.code}${pk}${fk}\n`;
        });
        mermaid += `    }\n`;
      }
    });

    const outputPath = path.join(this.outputDir, '01-表单关系图.md');
    fs.writeFileSync(outputPath, mermaid);
    console.log(`✓ 表单关系图已生成: ${outputPath}`);
  }

  /**
   * 生成字段依赖图
   */
  generateFieldDependencyMap() {
    const { forms, fieldDependencies } = this.config;
    
    let mermaid = `---\n`;
    mermaid += `# ${this.config.projectName} - 字段依赖图\n`;
    mermaid += `# 版本: v1.0.0\n`;
    mermaid += `# 生成时间: ${new Date().toLocaleString()}\n`;
    mermaid += `---\n\n`;
    mermaid += `graph TB\n\n`;

    // 样式定义
    mermaid += `    %% ==================== 样式定义 ====================\n`;
    mermaid += `    classDef inputField fill:#e1f5fe,stroke:#01579b,stroke-width:2px\n`;
    mermaid += `    classDef calcField fill:#fff3e0,stroke:#e65100,stroke-width:2px\n`;
    mermaid += `    classDef lookupField fill:#f3e5f5,stroke:#4a148c,stroke-width:2px\n`;
    mermaid += `    classDef refField fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px\n\n`;

    // 按表单分组生成字段依赖
    forms.forEach(form => {
      if (form.fields && form.fields.some(f => f.formula || f.linkage)) {
        mermaid += `    %% ==================== ${form.name}字段依赖 ====================\n`;
        mermaid += `    subgraph "${form.name}"\n`;
        
        form.fields.forEach(field => {
          const nodeId = `${form.code}_${field.code}`;
          let className = 'inputField';
          if (field.formula) className = 'calcField';
          if (field.linkage) className = 'lookupField';
          if (field.isForeignKey) className = 'refField';
          
          mermaid += `        ${nodeId}[${field.name}]:::${className}\n`;
        });

        // 字段间依赖关系
        form.fields.forEach(field => {
          if (field.formula && field.formula.dependencies) {
            field.formula.dependencies.forEach(dep => {
              const fromId = `${form.code}_${dep}`;
              const toId = `${form.code}_${field.code}`;
              mermaid += `        ${fromId} -->|"${field.formula.operator || '依赖'}"| ${toId}\n`;
            });
          }
        });

        mermaid += `    end\n\n`;
      }
    });

    // 跨表单字段依赖
    if (fieldDependencies && fieldDependencies.length > 0) {
      mermaid += `    %% ==================== 跨表单字段依赖 ====================\n`;
      mermaid += `    subgraph "跨表单依赖"\n`;
      
      fieldDependencies.forEach((dep, index) => {
        const fromId = `CF${index}_FROM`;
        const toId = `CF${index}_TO`;
        mermaid += `        ${fromId}[${dep.sourceForm}.${dep.sourceField}]:::refField\n`;
        mermaid += `        ${toId}[${dep.targetForm}.${dep.targetField}]:::lookupField\n`;
        mermaid += `        ${fromId} -.->|"${dep.type}"| ${toId}\n`;
      });
      
      mermaid += `    end\n`;
    }

    const outputPath = path.join(this.outputDir, '02-字段依赖图.md');
    fs.writeFileSync(outputPath, mermaid);
    console.log(`✓ 字段依赖图已生成: ${outputPath}`);
  }

  /**
   * 生成数据联动图
   */
  generateDataLinkageMap() {
    const { dataLinkages } = this.config;
    
    let mermaid = `---\n`;
    mermaid += `# ${this.config.projectName} - 数据联动图\n`;
    mermaid += `# 版本: v1.0.0\n`;
    mermaid += `# 生成时间: ${new Date().toLocaleString()}\n`;
    mermaid += `---\n\n`;
    mermaid += `flowchart TD\n\n`;

    // 样式定义
    mermaid += `    %% ==================== 样式定义 ====================\n`;
    mermaid += `    classDef trigger fill:#ffebee,stroke:#c62828,stroke-width:2px\n`;
    mermaid += `    classDef action fill:#e3f2fd,stroke:#1565c0,stroke-width:2px\n`;
    mermaid += `    classDef condition fill:#fff9c4,stroke:#f57f17,stroke-width:2px\n`;
    mermaid += `    classDef result fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px\n\n`;

    if (dataLinkages && dataLinkages.length > 0) {
      dataLinkages.forEach((linkage, index) => {
        mermaid += `    %% ==================== ${linkage.name} ====================\n`;
        mermaid += `    subgraph "${linkage.name}"\n`;
        
        const triggerId = `L${index}_TRIGGER`;
        mermaid += `        ${triggerId}[${linkage.trigger}]:::trigger\n`;
        
        let prevId = triggerId;
        linkage.actions.forEach((action, actionIndex) => {
          const actionId = `L${index}_ACT${actionIndex}`;
          mermaid += `        ${actionId}[${action.name}]:::action\n`;
          mermaid += `        ${prevId} --> ${actionId}\n`;
          prevId = actionId;
          
          if (action.results) {
            action.results.forEach((result, resultIndex) => {
              const resultId = `L${index}_RES${actionIndex}_${resultIndex}`;
              mermaid += `        ${resultId}[${result}]:::result\n`;
              mermaid += `        ${actionId} --> ${resultId}\n`;
            });
          }
        });
        
        mermaid += `    end\n\n`;
      });
    }

    const outputPath = path.join(this.outputDir, '03-数据联动图.md');
    fs.writeFileSync(outputPath, mermaid);
    console.log(`✓ 数据联动图已生成: ${outputPath}`);
  }

  /**
   * 生成自动化规则图
   */
  generateAutomationMap() {
    const { automationRules } = this.config;
    
    let mermaid = `---\n`;
    mermaid += `# ${this.config.projectName} - 自动化规则图\n`;
    mermaid += `# 版本: v1.0.0\n`;
    mermaid += `# 生成时间: ${new Date().toLocaleString()}\n`;
    mermaid += `---\n\n`;
    mermaid += `flowchart TD\n\n`;

    // 样式定义
    mermaid += `    %% ==================== 样式定义 ====================\n`;
    mermaid += `    classDef trigger fill:#ffebee,stroke:#c62828,stroke-width:2px\n`;
    mermaid += `    classDef condition fill:#fff9c4,stroke:#f57f17,stroke-width:2px\n`;
    mermaid += `    classDef action fill:#e3f2fd,stroke:#1565c0,stroke-width:2px\n`;
    mermaid += `    classDef endNode fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px\n\n`;

    if (automationRules && automationRules.length > 0) {
      automationRules.forEach((rule, index) => {
        mermaid += `    %% ==================== ${rule.name} ====================\n`;
        
        const triggerId = `R${index}_TRIGGER`;
        mermaid += `    ${triggerId}[${rule.triggerEvent}]:::trigger\n`;
        
        let prevId = triggerId;
        
        if (rule.conditions && rule.conditions.length > 0) {
          rule.conditions.forEach((cond, condIndex) => {
            const condId = `R${index}_COND${condIndex}`;
            mermaid += `    ${condId}{${cond}}:::condition\n`;
            mermaid += `    ${prevId} --> ${condId}\n`;
            prevId = condId;
          });
        }
        
        rule.actions.forEach((action, actionIndex) => {
          const actionId = `R${index}_ACT${actionIndex}`;
          const icon = this.getActionIcon(action.type);
          mermaid += `    ${actionId}[${icon} ${action.name}]:::action\n`;
          mermaid += `    ${prevId} --> ${actionId}\n`;
          prevId = actionId;
        });
        
        const endId = `R${index}_END`;
        mermaid += `    ${endId}[规则执行完成]:::endNode\n`;
        mermaid += `    ${prevId} --> ${endId}\n\n`;
      });
    }

    const outputPath = path.join(this.outputDir, '04-自动化规则图.md');
    fs.writeFileSync(outputPath, mermaid);
    console.log(`✓ 自动化规则图已生成: ${outputPath}`);
  }

  /**
   * 生成综合关系图
   */
  generateComprehensiveMap() {
    const { forms, relationships, automationRules } = this.config;
    
    let mermaid = `---\n`;
    mermaid += `# ${this.config.projectName} - 综合关系图\n`;
    mermaid += `# 版本: v1.0.0\n`;
    mermaid += `# 生成时间: ${new Date().toLocaleString()}\n`;
    mermaid += `# 包含: 表单关系、字段依赖、自动化规则\n`;
    mermaid += `---\n\n`;
    mermaid += `graph TB\n\n`;

    // 样式定义
    mermaid += `    %% ==================== 全局样式定义 ====================\n`;
    mermaid += `    classDef baseForm fill:#e3f2fd,stroke:#1565c0,stroke-width:2px\n`;
    mermaid += `    classDef bizForm fill:#fff3e0,stroke:#e65100,stroke-width:2px\n`;
    mermaid += `    classDef dataForm fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px\n`;
    mermaid += `    classDef autoRule fill:#ffebee,stroke:#c62828,stroke-width:2px\n`;
    mermaid += `    classDef external fill:#eceff1,stroke:#455a64,stroke-width:2px\n\n`;

    // 按模块分组
    const modules = this.groupByModule(forms);
    
    for (const [moduleName, moduleForms] of Object.entries(modules)) {
      mermaid += `    %% ==================== ${moduleName} ====================\n`;
      mermaid += `    subgraph "${moduleName}"\n`;
      
      moduleForms.forEach(form => {
        const className = this.getFormClassName(form.type);
        mermaid += `        ${form.code}[${form.name}<br/>${form.type}]:::${className}\n`;
      });
      
      mermaid += `    end\n\n`;
    }

    // 表单关系
    if (relationships && relationships.length > 0) {
      mermaid += `    %% ==================== 表单关系 ====================\n`;
      relationships.forEach(rel => {
        const line = rel.isStrong ? '===>' : '-.->';
        mermaid += `    ${rel.from} ${line}|"${rel.description}"| ${rel.to}\n`;
      });
      mermaid += `\n`;
    }

    // 自动化规则
    if (automationRules && automationRules.length > 0) {
      mermaid += `    %% ==================== 自动化规则 ====================\n`;
      mermaid += `    subgraph "自动化规则"\n`;
      
      automationRules.forEach((rule, index) => {
        const ruleId = `RULE_${index}`;
        mermaid += `        ${ruleId}[${rule.name}]:::autoRule\n`;
        
        if (rule.triggerForm) {
          mermaid += `        ${rule.triggerForm} ==>|"触发"| ${ruleId}\n`;
        }
        if (rule.targetForm) {
          mermaid += `        ${ruleId} ==>|"执行"| ${rule.targetForm}\n`;
        }
      });
      
      mermaid += `    end\n`;
    }

    const outputPath = path.join(this.outputDir, '05-综合关系图.md');
    fs.writeFileSync(outputPath, mermaid);
    console.log(`✓ 综合关系图已生成: ${outputPath}`);
  }

  /**
   * 按模块分组表单
   */
  groupByModule(forms) {
    const modules = {};
    forms.forEach(form => {
      const module = form.module || '未分类';
      if (!modules[module]) {
        modules[module] = [];
      }
      modules[module].push(form);
    });
    return modules;
  }

  /**
   * 获取关系箭头样式
   */
  getRelationshipArrow(type) {
    const arrows = {
      '引用': '-->',
      '关联': '---',
      '包含': '||--o{',
      '继承': '--|>',
      '更新': '==>',
      '触发': '..>'
    };
    return arrows[type] || '-->';
  }

  /**
   * 获取表单样式类名
   */
  getFormClassName(type) {
    const classes = {
      '普通表单': 'baseForm',
      '流程表单': 'bizForm',
      '数据表单': 'dataForm'
    };
    return classes[type] || 'baseForm';
  }

  /**
   * 获取动作图标
   */
  getActionIcon(type) {
    const icons = {
      '新增': '➕',
      '更新': '✏️',
      '删除': '🗑️',
      '通知': '📧',
      '集成': '🔗',
      '审批': '✅',
      '计算': '🧮'
    };
    return icons[type] || '⚡';
  }
}

/**
 * 从Markdown解析配置
 */
function parseFromMarkdown(markdownContent) {
  const config = {
    projectName: '',
    forms: [],
    relationships: [],
    fieldDependencies: [],
    dataLinkages: [],
    automationRules: []
  };

  // 解析项目名称
  const titleMatch = markdownContent.match(/#\s+(.+)/);
  if (titleMatch) {
    config.projectName = titleMatch[1].trim();
  }

  // 解析表单列表
  const formMatches = markdownContent.matchAll(/[-*]\s*(.+?)\s*「(.+?)」/g);
  for (const match of formMatches) {
    config.forms.push({
      name: match[1].trim(),
      type: match[2].trim(),
      code: match[1].trim().replace(/\s+/g, '_')
    });
  }

  // 解析关系
  const relMatches = markdownContent.matchAll(/(\w+)\s*(->|-->|=>|==>)\s*(\w+)\s*[:：]\s*(.+)/g);
  for (const match of relMatches) {
    config.relationships.push({
      from: match[1].trim(),
      to: match[3].trim(),
      type: '引用',
      description: match[4].trim()
    });
  }

  return config;
}

/**
 * 主函数
 */
function main() {
  // 示例配置
  const exampleConfig = {
    projectName: '出入库管理系统',
    outputDir: './系统功能图谱',
    forms: [
      {
        name: '产品信息',
        type: '普通表单',
        code: 'PRODUCT',
        module: '基础信息',
        fields: [
          { code: 'product_code', name: '产品编号', type: 'string', isPrimaryKey: true },
          { code: 'product_name', name: '产品名称', type: 'string' },
          { code: 'spec', name: '规格型号', type: 'string' }
        ]
      },
      {
        name: '仓库信息',
        type: '普通表单',
        code: 'WAREHOUSE',
        module: '基础信息'
      },
      {
        name: '采购入库单',
        type: '流程表单',
        code: 'PURCHASE_IN',
        module: '库存管理',
        fields: [
          { code: 'quantity', name: '入库数量', type: 'number' },
          { code: 'price', name: '入库单价', type: 'number' },
          { code: 'amount', name: '入库金额', type: 'number', formula: { operator: '*', dependencies: ['quantity', 'price'] } }
        ]
      },
      {
        name: '库存实时表',
        type: '普通表单',
        code: 'STOCK',
        module: '库存中心'
      }
    ],
    relationships: [
      { from: 'PURCHASE_IN', to: 'PRODUCT', type: '引用', description: '选择产品' },
      { from: 'PURCHASE_IN', to: 'WAREHOUSE', type: '引用', description: '选择仓库' },
      { from: 'PURCHASE_IN', to: 'STOCK', type: '更新', description: '更新库存', isStrong: true }
    ],
    fieldDependencies: [
      { sourceForm: 'PRODUCT', sourceField: 'product_name', targetForm: 'PURCHASE_IN', targetField: 'product_name', type: '数据填充' }
    ],
    dataLinkages: [
      {
        name: '产品选择联动',
        trigger: '选择产品编号',
        actions: [
          { name: '查询产品信息', results: ['填充产品名称', '填充规格型号', '填充计量单位'] }
        ]
      }
    ],
    automationRules: [
      {
        name: '入库更新库存',
        triggerEvent: '入库单审批通过',
        triggerForm: 'PURCHASE_IN',
        targetForm: 'STOCK',
        conditions: ['审批状态=通过'],
        actions: [
          { name: '更新库存数量', type: '更新' },
          { name: '记录库存流水', type: '新增' }
        ]
      }
    ]
  };

  const generator = new YidaSystemMapGenerator(exampleConfig);
  generator.generateAll();
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { YidaSystemMapGenerator, parseFromMarkdown };
