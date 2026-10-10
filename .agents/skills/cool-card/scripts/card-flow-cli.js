#!/usr/bin/env node
/**
 * card-flow-cli.js — 酷卡片流程 API 创建器 v2（金标准克隆路线）
 * ==================================================================
 * 原理：从一条【已验证工作】的卡片流程拉取平台真实 processJson+viewJson 双参数，
 * 克隆修改（流程名/触发事件/字段映射/收件人/提示语/按钮绑定）后经
 * createLogicflow → saveProcess → publishProcessById 全 API 落地。
 *
 * 🔴 结构铁律（2026-10-01 从设计器 saveProcess 请求体实抓）：
 * - processJson 的 sendCard 节点 props 是 cardRules 22 键【直接平铺】，
 *   不是 OpenYida 编译器的 {sendCardRules:{...}} 包裹——包裹形式会报"流程解析异常"
 * - 触发节点也带 nodeId（node_xxx），三节点全量 id 化，nextId 数组连线
 * - 存储单一事实源 = viewJson {schema, globalSetting}；processJson 随 save 提交
 *
 * 用法：
 * node card-flow-cli.js --app APP_XXX --form FORM-XXX --name "流程名" \
 *   --events create \
 *   --map "type=订单状态,from=客户名称,content=备注,createDate=创建时间" \
 *   --send-to 0249654712697493 --last-message "提示语" \
 *   [--template-flow LPROC-源流程] [--action-flow LPROC-按钮流程] [--publish]
 *
 * 默认源流程：LPROC-T7966J91E1N9F0J0GQVVWABXTX142KLJ7DPUMQQ（销售订单卡片，实发验证）
 * 🟡 --form 须与源流程同表单（v1）；跨表单克隆需重映射触发 conditions，v2 再做。
 */
'use strict';

const path = require('path');
const coreUtils = require(path.resolve(__dirname, '../../../../lib/core/utils'));
const {
  getRequest, postRequest, requestWithAutoLogin, triggerLogin,
} = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));

// ---------- 常量 ----------
const APP_DEFAULT = 'APP_P2PD3I86ETCU1MGG8GZP';
const DEFAULT_TEMPLATE_FLOW = 'LPROC-T7966J91E1N9F0J0GQVVWABXTX142KLJ7DPUMQQ';
const TEMPLATE_FORM_DEFAULT = 'FORM-B57FC0616BDF48658C811B1906A64B8D17XH';
// 事件映射：用户语义 -> 设计器序列化值
const EVENT_MAP = { create: 'insert', update: 'update', delete: 'delete', comment: 'comment' };

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'publish') { args.publish = true; continue; }
      args[key] = argv[++i];
    }
  }
  return args;
}
function die(msg) { console.error('❌ ' + msg); process.exit(1); }

const args = parseArgs(process.argv);
const APP = args.app || APP_DEFAULT;
const TEMPLATE_FLOW = args['template-flow'] || DEFAULT_TEMPLATE_FLOW;
const TEMPLATE_FORM = args.form || TEMPLATE_FORM_DEFAULT;
const FLOW_NAME = args.name || '酷卡片流程';
const EVENTS = (args.events || 'create').split(',').map(s => EVENT_MAP[s.trim()] || s.trim());
const MAP = {};   // 卡片变量id -> 触发表单字段名
(args.map || '').split(',').forEach(pair => {
  const [k, v] = pair.split('=');
  if (k && v) MAP[k.trim()] = v.trim();
});
const SEND_TO = (args['send-to'] || '').split(',').map(s => s.trim()).filter(Boolean);
const LAST_MESSAGE = args['last-message'] || FLOW_NAME;
const ACTION_FLOW = args['action-flow'] || null;
const PUBLISH = !!args.publish;

// ---------- 主流程 ----------
(async () => {
  const stepLog = (s) => console.error('▸ ' + s);

  stepLog('读取登录态');
  let cookieData = coreUtils.loadCookieData();
  if (!cookieData) {
    console.error('登录态不存在，触发扫码登录（最长10分钟）...');
    cookieData = triggerLogin();
  }
  const authRef = {
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: coreUtils.resolveBaseUrl(cookieData),
    cookieData,
  };

  // 1) 拉源流程真实双参数
  stepLog('拉取源流程（' + TEMPLATE_FLOW + '）');
  const srcResp = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${APP}/query/simpleProcess/getProcess.json?processCode=${TEMPLATE_FLOW}&isLogic=true`,
      null,
      auth.cookies
    );
  }, authRef);
  if (!srcResp || !srcResp.success) die('拉取源流程失败: ' + (srcResp ? srcResp.errorMsg : '空响应'));
  let srcContent = srcResp.content;
  if (typeof srcContent === 'string') srcContent = JSON.parse(srcContent);
  const trueView = srcContent;                              // {schema, globalSetting}
  const srcCard = (trueView.schema.children || []).find(n => n.componentName === 'CardNode');
  if (!srcCard) die('源流程 viewJson 无 CardNode');
  // processJson：从 viewJson 重建三节点（结构=设计器实抓形状）
  const newId = () => 'node_' + Math.random().toString(36).slice(2, 13);
  const startId = newId(), cardId = newId(), endId = newId();

  // 2) 组装新 processJson（设计器实抓形状：props 平铺 cardRules、全节点带 nodeId）
  stepLog('组装 processJson（props 平铺 cardRules）');
  const rules = JSON.parse(JSON.stringify(srcCard.props.cardRules));

  // 字段映射修改（assignments + dataRules.rules + cardData 三写，金标准三写规则）
  const fieldMapDelta = Object.keys(MAP).length > 0;
  if (fieldMapDelta) {
    // 拉触发表单 Schema 建字段名→fieldId
    stepLog('拉取触发表单 Schema 解析字段ID');
    const schemaResp = await requestWithAutoLogin((auth) => {
      return getRequest(
        auth.baseUrl,
        `/alibaba/web/${APP}/_view/query/formdesign/getFormSchema.json?formUuid=${TEMPLATE_FORM}&schemaVersion=V5`,
        null,
        auth.cookies
      );
    }, authRef);
    if (!schemaResp || !schemaResp.success) die('获取 Schema 失败');
    let sc = schemaResp.content;
    if (typeof sc === 'string') sc = JSON.parse(sc);
    const fieldMap = {};
    (function collect(children) {
      for (const child of children || []) {
        if (child.props && child.props.fieldId && child.props.label) {
          const label = typeof child.props.label === 'object' ? (child.props.label.zh_CN || child.props.label.en_US) : child.props.label;
          if (label && !fieldMap[label]) fieldMap[label] = child.props.fieldId;
        }
        if (Array.isArray(child.children)) collect(child.children);
      }
    })((sc.pages && sc.pages[0] && sc.pages[0].componentsTree) || sc.components || []);

    for (const [varId, fieldName] of Object.entries(MAP)) {
      const fid = fieldMap[fieldName];
      if (!fid) die('字段「' + fieldName + '」未在触发表单 Schema 找到');
      // assignments
      const asg = (rules.assignments || []).find(a => a.column === varId);
      if (asg) { asg.value = fid; asg.valueType = 'processVar'; }
      // dataRules.rules
      const rule = (rules.dataRules.rules || []).find(r => r.id === varId);
      if (rule) { rule.value = fid; rule.valueLabel = fieldName; rule.valueType = 'processVar'; }
      // cardData
      rules.cardData[varId] = '${' + fieldName + '}';
    }
  }

  // 收件人
  if (SEND_TO.length) {
    rules.sendToUserIds = { assignments: [], column: '成员', value: SEND_TO, valueType: 'literal' };
    rules.sendToUserRule = {
      rules: [{
        componentName: 'EmployeeField', desc: 'user', id: 'user', name: '成员', required: true,
        ruleId: 'rule-' + Date.now().toString(36).toUpperCase(), type: 'string', valueType: 'literal',
        value: SEND_TO.map(uid => ({ id: uid, label: uid, name: uid, avatar: '', deptDesc: '', type: 'employee', corpId: '', isDisabled: false, orgType: '', checked: true })),
      }],
    };
  }
  // 提示语
  rules.lastMessage = LAST_MESSAGE;
  // 按钮绑定
  if (ACTION_FLOW) {
    rules.actionRules = { COOL_button_action_id_handler: { type: 'action', actionId: ACTION_FLOW } };
    rules.actionAssignments = [{ column: 'COOL_button_action_id_handler', type: '_action_', value: ACTION_FLOW }];
  }

  const processJson = {
    props: { allowCollaboration: true, allowTemporaryStorage: true, allowWithdraw: true, processCode: 'PENDING' },
    nodes: [
      {
        childNodes: [], description: '',
        name: { en_US: 'Form event trigger', type: 'i18n', zh_CN: '表单事件触发' },
        nextId: [cardId], nodeId: startId, prevId: '',
        props: {
          inputs: {
            activityAction: [], conditions: null, formEventField: '',
            formEventType: EVENTS, formUuid: TEMPLATE_FORM, triggerFormEventRecursively: false,
          },
          triggerType: 'FormEvent',
        },
        type: 'trigger',
      },
      {
        childNodes: [], description: '请设置',
        name: { en_US: '发送卡片', type: 'i18n', zh_CN: '发送卡片' },
        nextId: [endId], nodeId: cardId, prevId: '',
        props: rules,   // ★ cardRules 直接平铺（平台真实结构）
        type: 'sendCard',
      },
      {
        childNodes: [], description: '',
        name: { en_US: 'end', type: 'i18n', zh_CN: '结束' },
        nextId: [], nodeId: endId, prevId: '', props: {}, type: 'finish',
      },
    ],
  };

  // 3) 组装新 viewJson（克隆源结构，换 CardNode 的 id/props.cardRules）
  stepLog('组装 viewJson');
  const viewJson = JSON.parse(JSON.stringify(trueView));
  viewJson.schema.children = (viewJson.schema.children || []).map(n => {
    if (n.componentName === 'CardNode') {
      return { ...n, id: cardId, props: { ...n.props, cardRules: rules } };
    }
    return n;
  });

  // 4) createLogicflow
  stepLog('createLogicflow');
  const created = await requestWithAutoLogin((auth) => {
    const referer = `${auth.baseUrl}/${APP}/admin`;
    return postRequest(
      auth.baseUrl,
      `/alibaba/web/${APP}/query/formLogicflowBinding/createLogicflow.json`,
      {
        _csrf_token: auth.csrfToken,
        _locale_time_zone_offset: '28800000',
        name: FLOW_NAME,
        type: '1',
        formUuid: TEMPLATE_FORM,
      },
      auth.cookies,
      referer
    );
  }, authRef);
  if (!created || !created.success) die('createLogicflow 失败: ' + (created ? created.errorMsg : '空响应'));
  const processCode = created.content && created.content.processCode;
  if (!processCode) die('未返回 processCode');
  processJson.props.processCode = processCode;

  // 5) saveProcess
  stepLog('saveProcess');
  const saved = await requestWithAutoLogin((auth) => {
    const referer = `${auth.baseUrl}/${APP}/admin`;
    return postRequest(
      auth.baseUrl,
      `/alibaba/web/${APP}/query/simpleProcess/saveProcess.json`,
      {
        _csrf_token: auth.csrfToken,
        formUuid: TEMPLATE_FORM,
        isLogic: 'true',
        isOnline: 'true',
        json: JSON.stringify(processJson),
        needReportLine: 'y',
        processCode,
        viewJson: JSON.stringify(viewJson),
      },
      auth.cookies,
      referer
    );
  }, authRef);
  if (!saved || !saved.success) die('saveProcess 失败: ' + (saved ? saved.errorMsg || JSON.stringify(saved).slice(0, 200) : '空响应'));

  // 6) 回读验证
  stepLog('回读验证');
  const verify = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${APP}/query/simpleProcess/getProcess.json?processCode=${processCode}&isLogic=true`,
      null,
      auth.cookies
    );
  }, authRef);
  const vStr = JSON.stringify(verify);
  const cardOk = vStr.includes('"CardNode"') && vStr.includes('lastMessage') && vStr.includes(LAST_MESSAGE);
  console.error(cardOk ? '✅ 回读含完整卡片配置' : '⚠️ 回读异常，请开设计器人工检查');

  // 7) 可选发布
  let published = false;
  if (PUBLISH) {
    stepLog('publishProcess');
    const vResp = await requestWithAutoLogin((auth) => {
      return getRequest(
        auth.baseUrl,
        `/alibaba/web/${APP}/query/process/pageProcessVersion.json?processCode=${processCode}&appType=${APP}&status=&pageIndex=1&pageSize=10&orderByModifyTime=desc&_locale_time_zone_offset=28800000&_stamp=${Date.now()}`,
        null,
        auth.cookies
      );
    }, authRef);
    let pid = null, ver = null;
    try {
      const vl = (vResp.content && (vResp.content.data || vResp.content.list || vResp.content)) || [];
      const arr = Array.isArray(vl) ? vl : [];
      if (arr.length) { pid = arr[0].processId || arr[0].id; ver = arr[0].processVersion || arr[0].version; }
    } catch (e) {}
    if (pid == null) {
      console.error('⚠️ 未见流程版本，请到设计器点「发布」');
    } else {
      const pub = await requestWithAutoLogin((auth) => {
        const referer = `${auth.baseUrl}/${APP}/admin`;
        return postRequest(
          auth.baseUrl,
          `/alibaba/web/${APP}/query/simpleProcess/publishProcessById.json`,
          {
            _csrf_token: auth.csrfToken,
            formUuid: TEMPLATE_FORM,
            processCode,
            processId: String(pid),
            processVersion: String(ver),
          },
          auth.cookies,
          referer
        );
      }, authRef);
      published = !!(pub && pub.success);
      console.error((published ? '✅ 已发布' : '⚠️ 发布失败: ' + (pub ? pub.errorMsg : '空响应')) + '（启用开关请到列表行打开）');
    }
  }

  console.log(JSON.stringify({
    success: true,
    processCode,
    cardVerifiedInReadback: cardOk,
    published,
    nextSteps: [
      '设计器确认画布渲染（触发→发送卡片→结束）',
      '未发布则设计器发布；列表行打开启用开关',
      '提交触发表单测试数据验证卡片送达',
    ],
  }, null, 2));
  process.exit(0);
})().catch(e => {
  console.error('❌ 异常:', e.message);
  process.exit(1);
});
