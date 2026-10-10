#!/usr/bin/env node
/**
 * integration-min-price-helper.js - 销售历史最低价 MIN 逻辑专用构建器
 *
 * 用途：创建「销售订单审批通过 → 仅在新价格低于现有价格时才更新中间表」的逻辑流
 *
 * 架构（3 节点）：
 *   Trigger (processFinish + agree)
 *     → UpdateData(direct_form):
 *         条件 = 客户+产品+规格 三键匹配 (Equal+processVar)
 *              AND 历史最低价 > 未税单价 (GreaterThan+processVar)
 *         赋值 = 历史最低价 ← 未税单价, 销售订单编号 ← 触发流水号
 *         noneOperation = ignored（价格不更低时不操作）
 *     → End
 *
 * 关键发现（v2.0.33）：
 *   - 分支条件（branchConditions）中的数值比较运算符（GreaterThan 等）会导致服务端
 *     "buildValue:公式构造失败，未包含公式" 错误——服务端分支条件仅支持 ExistValue 等无值操作符
 *   - 但「更新条件」（updateConditions）中的 GreaterThan 完全支持！
 *   - 因此方案改为：直接在 updateConditions 中加入 GreaterThan 条件，
 *     实现"仅当现有价格 > 新价格时才更新"的过滤效果
 *
 * 限制：
 *   - 此流仅处理「更新已存在记录」。首次创建（表中无记录）时因条件不匹配自动跳过。
 *   - 首次历史最低价需要手工初始化或独立脚本批量导入。
 *
 * 兼容项目规则：
 * - 不手写 processJson/viewJson（复用 buildProcessJson / buildViewJson）
 * - 不修改 integration-create.js（新建独立文件）
 * - 使用与 CLI 相同的 createLogicflow + saveProcess API
 * - 后续可用 integration-validate.js 体检 + integration-get.js 回读验证
 */

'use strict';

const path = require('path');
const { loadCookieData, resolveBaseUrl } = require(path.resolve(__dirname, '../../../../lib/core/utils'));
const { triggerLogin } = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));
const { generateNodeId } = require('./integration-node-ids');
const { buildProcessJson } = require('./integration-process-builder');
const { buildViewJson } = require('./integration-view-builder');
const { createLogicflow, saveProcess, getProcess, getFormSchema } = require('./integration-api');

// ════════════════════════════════════════════════════════════════════════
// 【认证】与 integration-create.js 完全相同的内联认证
// ════════════════════════════════════════════════════════════════════════
function getAuth() {
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error('登录态缓存不存在，触发登录...');
    cookieData = triggerLogin();
  }
  return {
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    cookieData,
  };
}

// ════════════════════════════════════════════════════════════════════════
// 业务字段配置
// ════════════════════════════════════════════════════════════════════════
const CFG = {
  appType: 'APP_NVNNBIVSF59IKTEP1L1H',                              // 新鑫系统
  triggerFormUuid: 'FORM-E865B899BDE445DB82918AE5AC30E34B9D42',     // 销售订单「流程表单」
  targetFormUuid: 'FORM-AFD11DCE32CE428A98EAF24C2F7332B0FNK8',     // 销售历史最低价「普通表单」
};

// 触发表单字段
const T = {
  mainCustomer: 'textField_l7znaxp0',          // 客户名称（主表）
  mainSerial: 'serialNumberField_mhabn0ob',    // 销售订单编号（主表流水号）
  subProduct: 'textField_kk91ezq9',            // 产品名称（子表）
  subSpec: 'textField_kk91ezqa',               // 产品规格（子表）
  subPrice: 'numberField_kkaljjuu',            // 未税单价（子表）
};

// 目标表单字段
const M = {
  customer: 'textField_muandvie',              // 客户名称
  product: 'textField_kk6bo9ct',               // 产品名称
  spec: 'textField_kk6bo9cu',                  // 产品规格
  price: 'numberField_muandvif',               // 历史最低价
  serial: 'textField_mufaguq8',                // 销售订单编号
};

// ════════════════════════════════════════════════════════════════════════
// 主逻辑
// ════════════════════════════════════════════════════════════════════════
async function main() {
  const authRef = getAuth();
  console.error('认证成功: ' + authRef.baseUrl);
  console.error('');

  const flowName = '销售订单审批通过同步历史最低价MIN';

  // ── 第一步：分配节点 ID（3 节点：trigger, updateData, end）────────
  const canvasId = generateNodeId();
  const triggerNodeId = generateNodeId();
  const updateDataNodeId = generateNodeId();
  const endNodeId = generateNodeId();

  console.error('═══ ' + flowName + ' ═══');
  console.error('触发表单: ' + CFG.triggerFormUuid);
  console.error('目标表单: ' + CFG.targetFormUuid);
  console.error('架构: 3 节点 (Trigger → UpdateData[带GreaterThan过滤] → End)');
  console.error('');

  // ── 第二步：获取目标表单 Schema（可选，用于 viewJson 的 outputs/rulesFilter）──
  let targetSchema = [];
  try {
    targetSchema = await getFormSchema(authRef, { appType: CFG.appType, formUuid: CFG.targetFormUuid });
    console.error('✅ 获取目标表单 Schema 成功（' + targetSchema.length + ' 个字段）');
  } catch (e) {
    console.error('⚠️ 获取 Schema 失败: ' + e.message + '（继续）');
  }

  // ── 第三步：构建更新条件（3 keys 匹配 + 价格过滤）──────────────────
  // 核心逻辑：4 个 AND 条件 ——
  //   1. 客户名称匹配
  //   2. 产品名称匹配
  //   3. 产品规格匹配
  //   4. 现有历史最低价 > 未税单价（仅当现有价格更高时才更新）
  const updateConditions = [
    { bFieldId: M.customer, bFieldName: '客户名称', aFieldId: T.mainCustomer, componentType: 'TextField', opCode: 'Equal', valueType: 'processVar' },
    { bFieldId: M.product,  bFieldName: '产品名称', aFieldId: T.subProduct,    componentType: 'TextField', opCode: 'Equal', valueType: 'processVar' },
    { bFieldId: M.spec,     bFieldName: '产品规格', aFieldId: T.subSpec,       componentType: 'TextField', opCode: 'Equal', valueType: 'processVar' },
    { bFieldId: M.price,    bFieldName: '历史最低价', aFieldId: T.subPrice,    componentType: 'NumberField', opCode: 'GreaterThan', valueType: 'processVar' },
  ];

  console.error('更新条件: 客户+产品+规格 三键匹配 AND 历史最低价 > 未税单价');
  console.error('  → 仅当目标表存在匹配记录 且 现有价格 > 新价格时才更新');
  console.error('');

  // ── 第四步：构建更新赋值 ────────────────────────────────────────────
  // 更新赋值：新价格 + 新订单编号
  const updateAssignments = [
    { column: M.price,   valueType: 'processVar', value: T.subPrice },
    { column: M.serial,  valueType: 'processVar', value: T.mainSerial },
  ];

  // ── 第五步：调用 buildProcessJson（3 节点）────────────────────────
  const processNodeIds = [triggerNodeId, updateDataNodeId, endNodeId];

  const processJson = buildProcessJson({
    appType: CFG.appType,
    formUuid: CFG.triggerFormUuid,
    formEventTypes: ['processFinish'],
    approvalActions: ['agree'],
    nodeIds: processNodeIds,
    hasMessageNode: false,
    updateFormUuid: CFG.targetFormUuid,
    updateConditions,
    updateAssignments,
    updateType: 'direct_form',           // 直接目标表单模式
    updateNoneOperation: 'ignored',      // 价格不更低时不操作
  });

  console.error('✅ processJson 构建完成');

  // ── 第六步：调用 buildViewJson（3 节点）──────────────────────────
  const viewNodeIds = [canvasId, triggerNodeId, updateDataNodeId, endNodeId];

  const viewJson = buildViewJson({
    appType: CFG.appType,
    formUuid: CFG.triggerFormUuid,
    formEventTypes: ['processFinish'],
    approvalActions: ['agree'],
    nodeIds: viewNodeIds,
    hasMessageNode: false,
    updateFormUuid: CFG.targetFormUuid,
    updateConditions,
    updateAssignments,
    updateFormSchema: targetSchema,
    updateFormName: '销售历史最低价',
    updateType: 'direct_form',
    updateNoneOperation: 'ignored',
  });

  console.error('✅ viewJson 构建完成');
  console.error('');

  // ── 第七步：新建逻辑流并保存 ────────────────────────────────────────
  console.error('正在新建逻辑流...');
  let processCode;
  try {
    processCode = await createLogicflow(authRef, { appType: CFG.appType, formUuid: CFG.triggerFormUuid, flowName });
    console.error('✅ 新建逻辑流成功: ' + processCode);
  } catch (error) {
    console.error('❌ 新建逻辑流失败: ' + error.message);
    process.exit(1);
  }

  console.error('正在保存流程配置...');
  try {
    const saveResp = await saveProcess(authRef, {
      appType: CFG.appType, formUuid: CFG.triggerFormUuid, processCode,
      processJson, viewJson, isOnline: true,
    });
    if (!saveResp || !saveResp.success) {
      console.error('❌ 保存失败: ' + JSON.stringify(saveResp));
      process.exit(1);
    }
    console.error('✅ 保存成功: ' + processCode);
  } catch (error) {
    console.error('❌ 保存失败: ' + error.message);
    process.exit(1);
  }

  // ── 第八步：保存后回读验证 ─────────────────────────────────────────
  console.error('正在回读验证...');
  try {
    const saved = await getProcess(authRef, { appType: CFG.appType, processCode });
    const savedView = saved.viewJson || {};
    const children = (savedView.schema && savedView.schema.children) || [];
    const nodeNames = children
      .filter(c => c.componentName && c.componentName !== 'CanvasEngine')
      .map(c => c.componentName)
      .join(' → ');
    console.error('  回读节点: ' + nodeNames);
    if (children.filter(c => c.componentName && c.componentName !== 'CanvasEngine').length >= 3) {
      console.error('✅ 回读验证通过');
    } else {
      console.error('❌ 回读节点数不足（期望 ≥ 3）');
    }
  } catch (e) {
    console.error('⚠️ 回读验证失败: ' + e.message);
  }

  // ── 输出结果 ──────────────────────────────────────────────────────────
  console.error('');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('  创建成功！');
  console.error('  processCode: ' + processCode);
  console.error('  架构: 3 节点（Trigger → UpdateData → End）');
  console.error('  更新条件: 3 keys + GreaterThan(历史最低价 > 未税单价)');
  console.error('  更新赋值: 历史最低价 ← 未税单价, 销售订单编号 ← 触发流水号');
  console.error('  行为: 仅当现有价格 > 新价格时才更新（保持历史最低价）');
  console.error('  验证命令: node .agents/skills/integration/scripts/integration-get.js ' + CFG.appType + ' ' + processCode);
  console.error('  体检命令: node .agents/skills/integration/scripts/integration-validate.js ' + CFG.appType + ' ' + processCode);
  console.error('═══════════════════════════════════════════════════════════════');

  console.log(JSON.stringify({
    success: true,
    processCode,
    architecture: '3-node-direct-form-with-greaterthan',
    flowName,
    appType: CFG.appType,
    triggerFormUuid: CFG.triggerFormUuid,
    targetFormUuid: CFG.targetFormUuid,
    updateConditionLogic: '3 keys (Equal+procVar) AND existing_price > new_price (GreaterThan+procVar)',
    updateAssignments: {
      price: 'target.price ← trigger.subPrice',
      serial: 'target.serial ← trigger.mainSerial',
    },
    behaviors: {
      noRecord: '不操作（需要初始数据）',
      existingHigher: '更新为更低价格',
      existingLowerOrEqual: '不操作（保持最小值）',
    },
  }, null, 2));
}

// ════════════════════════════════════════════════════════════════════════
// 入口
// ════════════════════════════════════════════════════════════════════════
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 异常退出: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { main, CFG, T, M };
