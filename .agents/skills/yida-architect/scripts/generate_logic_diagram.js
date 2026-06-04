/**
 * yida-architect Skill - 业务逻辑图生成脚本
 * 版本: 2.0.0
 * 更新日期: 2026/3/2
 * 
 * 功能: 根据业务主线生成标准的 draw.io 业务逻辑图
 * 输出格式: .drawio 文件（XML格式），可直接用 draw.io 打开编辑
 * 
 * 核心原则:
 * 1. 只记录核心业务主线（数据表单 + 核心数据 + 执行表单）
 * 2. 只记录执行顺序（业务逻辑）
 * 3. 只记录表单之间的连接关系
 * 4. 不包含：审批节点、人员信息、计算公式、自动化规则等细枝末节
 * 
 * 表单分类（3类）：
 * - 数据表单：黄色圆角矩形 (#fff3cd)，编号 1.xxx / 2.xxx / 3.xxx / 4.xxx
 * - 核心数据：紫色圆形 (#e2d4f0)，编号 2.xxx，aspect=fixed
 * - 执行表单：粉色圆角矩形 (#f8d7da)，编号 3.xxx / 4.xxx
 * 
 * 连线类型（2种）：
 * - 实线：数据引用关系（查）
 * - 虚线：数据更新关系（增删改）
 */

/**
 * 生成 draw.io 业务逻辑图
 * @param {Object} config - 配置对象
 * @param {Array} config.dataForms - 数据表单数组 [{name, x, y, width, height}]
 * @param {Array} config.coreData - 核心数据数组 [{name, x, y, size}]
 * @param {Array} config.executeForms - 执行表单数组 [{name, x, y, width, height}]
 * @param {Array} config.relations - 表单关系数组 [{from, to, type, label}]
 * @param {string} config.title - 图表标题
 * @returns {string} draw.io XML 代码
 */
function generateLogicDiagram(config) {
    const { 
        dataForms = [], 
        coreData = [], 
        executeForms = [], 
        relations = [],
        title = '业务逻辑图'
    } = config;
    
    // 样式常量
    const STYLES = {
        dataForm: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#fff3cd;strokeColor=#ffc107;strokeWidth=1;fontSize=12;',
        coreData: 'ellipse;whiteSpace=wrap;html=1;fillColor=#e2d4f0;strokeColor=#9c27b0;strokeWidth=1;fontSize=12;fontStyle=1;aspect=fixed;',
        executeForm: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f8d7da;strokeColor=#dc3545;strokeWidth=1;fontSize=12;',
        referenceLine: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#333333;strokeWidth=1;fontSize=10;',
        updateLine: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666;strokeWidth=1;dashed=1;fontSize=9;',
        title: 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=24;fontStyle=1',
        legendTitle: 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=12;fontStyle=1',
        legendText: 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=10;'
    };
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="65bd71144e">
    <diagram name="${title}" id="logic-diagram">
        <mxGraphModel dx="918" dy="698" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
            <root>
                <mxCell id="0"/>
                <mxCell id="1" parent="0"/>
                
                <!-- 标题 -->
                <mxCell id="title" value="${title}" style="${STYLES.title}" parent="1" vertex="1">
                    <mxGeometry x="385" y="30" width="400" height="40" as="geometry"/>
                </mxCell>
`;
    
    let cellId = 2;
    const nodeMap = {}; // 存储节点ID映射
    
    // 生成数据表单节点（黄色圆角矩形）
    dataForms.forEach((form, index) => {
        const id = form.id || `data-${index}`;
        const x = form.x || (120 + index * 200);
        const y = form.y || 172.5;
        const width = form.width || 100;
        const height = form.height || 50;
        
        nodeMap[form.name] = id;
        
        xml += `
                <!-- 数据表单: ${form.name} -->
                <mxCell id="${id}" value="${form.name}" style="${STYLES.dataForm}" parent="1" vertex="1">
                    <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
                </mxCell>`;
        cellId++;
    });
    
    // 生成核心数据节点（紫色圆形）
    coreData.forEach((form, index) => {
        const id = form.id || `core-${index}`;
        const x = form.x || (280 + index * 235);
        const y = form.y || 160;
        const size = form.size || 70;
        
        nodeMap[form.name] = id;
        
        xml += `
                <!-- 核心数据: ${form.name} -->
                <mxCell id="${id}" value="${form.name}" style="${STYLES.coreData}" parent="1" vertex="1">
                    <mxGeometry x="${x}" y="${y}" width="${size}" height="${size}" as="geometry"/>
                </mxCell>`;
        cellId++;
    });
    
    // 生成执行表单节点（粉色圆角矩形）
    executeForms.forEach((form, index) => {
        const id = form.id || `exec-${index}`;
        const x = form.x || (693 + (index % 2) * 210);
        const y = form.y || (170 + Math.floor(index / 2) * 135);
        const width = form.width || 100;
        const height = form.height || 50;
        
        nodeMap[form.name] = id;
        
        xml += `
                <!-- 执行表单: ${form.name} -->
                <mxCell id="${id}" value="${form.name}" style="${STYLES.executeForm}" parent="1" vertex="1">
                    <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
                </mxCell>`;
        cellId++;
    });
    
    // 生成关系连线
    relations.forEach((rel, index) => {
        const fromId = nodeMap[rel.from] || rel.from;
        const toId = nodeMap[rel.to] || rel.to;
        const isUpdate = rel.type === 'update';
        const style = isUpdate ? STYLES.updateLine : STYLES.referenceLine;
        const edgeId = `edge-${index}`;
        
        xml += `
                <!-- ${rel.from} ${isUpdate ? '更新' : '引用'} ${rel.to} -->
                <mxCell id="${edgeId}" value="${rel.label || (isUpdate ? '更新' : '引用')}" style="${style}" parent="1" source="${fromId}" target="${toId}" edge="1">
                    <mxGeometry relative="1" as="geometry"/>`;
        
        // 如果有中间点，添加 Array
        if (rel.points && rel.points.length > 0) {
            xml += `
                    <Array as="points">`;
            rel.points.forEach(point => {
                xml += `
                        <mxPoint x="${point.x}" y="${point.y}"/>`;
            });
            xml += `
                    </Array>`;
        }
        
        xml += `
                </mxCell>`;
    });
    
    // 生成图例
    const legendY = 560;
    xml += `
                
                <!-- 图例 -->
                <mxCell id="legend-title" value="图例说明" style="${STYLES.legendTitle}" parent="1" vertex="1">
                    <mxGeometry x="80" y="${legendY}" width="80" height="20" as="geometry"/>
                </mxCell>
                
                <mxCell id="legend-data-box" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff3cd;strokeColor=#ffc107;strokeWidth=1;" parent="1" vertex="1">
                    <mxGeometry x="80" y="${legendY + 30}" width="40" height="25" as="geometry"/>
                </mxCell>
                
                <mxCell id="legend-data-text" value="数据表单" style="${STYLES.legendText}" parent="1" vertex="1">
                    <mxGeometry x="130" y="${legendY + 30}" width="60" height="25" as="geometry"/>
                </mxCell>
                
                <mxCell id="legend-core-box" value="" style="ellipse;whiteSpace=wrap;html=1;fillColor=#e2d4f0;strokeColor=#9c27b0;strokeWidth=1;aspect=fixed;" parent="1" vertex="1">
                    <mxGeometry x="80" y="${legendY + 70}" width="25" height="25" as="geometry"/>
                </mxCell>
                
                <mxCell id="legend-core-text" value="核心数据" style="${STYLES.legendText}" parent="1" vertex="1">
                    <mxGeometry x="130" y="${legendY + 70}" width="60" height="25" as="geometry"/>
                </mxCell>
                
                <mxCell id="legend-exec-box" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8d7da;strokeColor=#dc3545;strokeWidth=1;" parent="1" vertex="1">
                    <mxGeometry x="80" y="${legendY + 110}" width="40" height="25" as="geometry"/>
                </mxCell>
                
                <mxCell id="legend-exec-text" value="执行表单" style="${STYLES.legendText}" parent="1" vertex="1">
                    <mxGeometry x="130" y="${legendY + 110}" width="60" height="25" as="geometry"/>
                </mxCell>
            </root>
        </mxGraphModel>
    </diagram>
</mxfile>`;
    
    return xml;
}

/**
 * 保存业务逻辑图到 draw.io 文件
 * @param {string} xmlCode - draw.io XML 代码
 * @param {string} filePath - 文件路径（自动转换为 .drawio 扩展名）
 * @param {string} projectName - 项目名称
 * @returns {string} 实际保存的文件路径
 */
function saveLogicDiagram(xmlCode, filePath, projectName) {
    const fs = require('fs');
    const path = require('path');
    
    // 确保使用 .drawio 扩展名
    const drawioFilePath = filePath.replace(/\.(mmd|md|xml)$/, '.drawio');
    
    // 确保目录存在
    const dir = path.dirname(drawioFilePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(drawioFilePath, xmlCode, 'utf8');
    console.log(`✅ 业务逻辑图已保存: ${drawioFilePath}`);
    return drawioFilePath;
}

/**
 * 根据业务类型快速生成业务逻辑图配置
 * @param {string} businessType - 业务类型（装修、销售、库存、教育等）
 * @returns {Object} 配置对象
 */
function getBusinessLogicConfig(businessType) {
    const configs = {
        '进销存': {
            title: '进销存业务逻辑图',
            dataForms: [
                { name: '1.货品类别', x: 120, y: 172.5, width: 90, height: 45 },
                { name: '2.供应商库', x: 903, y: 172.5, width: 100, height: 50 },
                { name: '3.仓库信息', x: 903, y: 315, width: 100, height: 50 },
                { name: '4.客户信息', x: 903, y: 560, width: 100, height: 50 }
            ],
            coreData: [
                { name: '2.货品信息', x: 280, y: 160, size: 70 },
                { name: '2.库存信息', x: 515, y: 305, size: 70 }
            ],
            executeForms: [
                { name: '3.采购入库', x: 693, y: 170, width: 100, height: 50 },
                { name: '3.销售出库', x: 903, y: 440, width: 100, height: 50 },
                { name: '4.库存盘点', x: 510, y: 100, width: 100, height: 50 },
                { name: '4.库存调拨', x: 500, y: 560, width: 100, height: 50 }
            ],
            relations: [
                // 引用关系（实线）
                { from: '1.货品类别', to: '2.货品信息', type: 'reference', label: '引用' },
                { from: '2.货品信息', to: '2.库存信息', type: 'reference', label: '引用' },
                { from: '2.供应商库', to: '3.采购入库', type: 'reference', label: '引用' },
                { from: '3.仓库信息', to: '3.采购入库', type: 'reference', label: '引用' },
                { from: '3.仓库信息', to: '2.库存信息', type: 'reference', label: '引用' },
                { from: '3.仓库信息', to: '3.销售出库', type: 'reference', label: '引用' },
                { from: '4.客户信息', to: '3.销售出库', type: 'reference', label: '引用' },
                { from: '2.库存信息', to: '3.销售出库', type: 'reference', label: '引用' },
                { from: '2.货品信息', to: '3.采购入库', type: 'reference', label: '引用' },
                { from: '4.库存盘点', to: '2.库存信息', type: 'reference', label: '引用' },
                { from: '2.库存信息', to: '4.库存调拨', type: 'reference', label: '引用 x2' },
                // 更新关系（虚线）
                { from: '3.采购入库', to: '2.库存信息', type: 'update', label: '插入/增加\n库存数量' },
                { from: '3.销售出库', to: '2.库存信息', type: 'update', label: '扣减库存\n数量' },
                { from: '4.库存盘点', to: '2.库存信息', type: 'update', label: '更新库存\n数量' },
                { from: '4.库存调拨', to: '2.库存信息', type: 'update', label: '扣减库存\n数量' },
                { from: '4.库存调拨', to: '2.库存信息', type: 'update', label: '增加库存\n数量' }
            ]
        },
        '装修': {
            title: '装修客户管理业务逻辑图',
            dataForms: [
                { name: '1.客户信息', x: 120, y: 300, width: 100, height: 50 },
                { name: '2.员工信息', x: 120, y: 450, width: 100, height: 50 }
            ],
            coreData: [
                { name: '2.客户状态', x: 350, y: 300, size: 70 }
            ],
            executeForms: [
                { name: '3.客户录入', x: 550, y: 150, width: 100, height: 50 },
                { name: '3.客户跟进', x: 550, y: 280, width: 100, height: 50 },
                { name: '3.定金收款', x: 550, y: 410, width: 100, height: 50 },
                { name: '3.设计需求', x: 550, y: 540, width: 100, height: 50 },
                { name: '3.设计方案', x: 750, y: 540, width: 100, height: 50 }
            ],
            relations: [
                // 引用关系
                { from: '1.客户信息', to: '3.客户录入', type: 'reference', label: '引用' },
                { from: '1.客户信息', to: '3.客户跟进', type: 'reference', label: '引用' },
                { from: '1.客户信息', to: '3.定金收款', type: 'reference', label: '引用' },
                { from: '1.客户信息', to: '3.设计需求', type: 'reference', label: '引用' },
                { from: '2.员工信息', to: '3.客户录入', type: 'reference', label: '销售人员' },
                { from: '2.员工信息', to: '3.客户跟进', type: 'reference', label: '销售人员' },
                { from: '2.员工信息', to: '3.定金收款', type: 'reference', label: '销售人员' },
                { from: '2.员工信息', to: '3.设计需求', type: 'reference', label: '设计师' },
                { from: '2.员工信息', to: '3.设计方案', type: 'reference', label: '设计师' },
                // 更新关系
                { from: '3.客户录入', to: '2.客户状态', type: 'update', label: '创建客户' },
                { from: '3.客户跟进', to: '2.客户状态', type: 'update', label: '更新跟进状态' },
                { from: '3.定金收款', to: '2.客户状态', type: 'update', label: '更新为已交定金' },
                { from: '3.设计需求', to: '2.客户状态', type: 'update', label: '更新为设计中' },
                { from: '3.设计方案', to: '2.客户状态', type: 'update', label: '更新为方案已确认' }
            ]
        }
    };
    
    return configs[businessType] || configs['进销存'];
}

/**
 * 快速生成示例业务逻辑图
 * @param {string} businessType - 业务类型
 * @param {string} outputPath - 输出路径
 * @returns {string} 生成的文件路径
 */
function generateExample(businessType, outputPath) {
    const config = getBusinessLogicConfig(businessType);
    const xml = generateLogicDiagram(config);
    return saveLogicDiagram(xml, outputPath, config.title);
}

// 导出模块
module.exports = {
    generateLogicDiagram,
    saveLogicDiagram,
    getBusinessLogicConfig,
    generateExample
};

// 如果直接运行此脚本，生成示例
if (require.main === module) {
    const path = require('path');
    const outputDir = path.join(__dirname, '..', '..', '..', 'examples');
    
    // 生成进销存示例
    generateExample('进销存', path.join(outputDir, '进销存业务逻辑图.drawio'));
    
    // 生成装修示例
    generateExample('装修', path.join(outputDir, '装修客户管理业务逻辑图.drawio'));
    
    console.log('\n✅ 示例文件已生成！');
    console.log('请使用 draw.io 打开查看。');
}
