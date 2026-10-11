/**
 * 页面：新鑫系统 - 工作台首页（自定义页面，经典链路 renderJsx）
 * 页面ID：FORM-7F762EB246E747D4BE87EBFAB84F1515C4DU
 * 工作台：https://oksruk.aliwork.com/APP_NVNNBIVSF59IKTEP1L1H/workbench/FORM-7F762EB246E747D4BE87EBFAB84F1515C4DU
 * 注意：依赖 publish-page.js 的 react preset 以 classic runtime 编译（React.createElement 产物），
 *       禁止使用会生成 require("react/jsx-runtime") 的 automatic 编译（宜搭沙箱无 require，详见踩坑记录 P-19）。
 * 视觉决策（6 步法）：
 * - 方向：商务专业（A）主色 #1A4D8F / 强调 #0D9488 / 背景 #F1F5F9
 * - 密度：舒适（PC 舒适，移动端紧凑）
 * - 导航壳：公司切换条 + 轻量问候栏 + 单屏分区
 * - 布局：公司切换条（置顶）→ KPI 主次分明（本月销售主卡）→ 高频入口大卡 + 分组收拢 → 最近订单动态 → 报表分析区
 * 数据源：销售订单/采购订单（近 100 条本地聚合本月口径与最近动态）、
 *         产品信息/客户信息/供应商信息/实时库存（totalCount）
 * 版本：v1.1.0 (2026-10-12)
 * - v1.0.0：首版发布
 * - v1.0.1：修复 automatic runtime 产物生成 require 导致页面报错（配合 publish-page.js classic 修复，见踩坑 P-19）
 * - v1.0.2：isMobile 基础上补充视口宽度判断（≤768px 走紧凑布局，兼容 PC 拖窄窗口）
 * - v1.0.3：修复入口跳转 404 —— 路由必须带 /workbench/（数据管理页）或 /submission/（发起页）段，
 *            裸 {appType}/{formUuid} 无 handler（404）；顶部「新建」按钮改走 submission 发起页
 * - v1.0.4：最近销售订单行调整主次——客户名称为主行（14px 加粗），订单编号+日期为次行小字
 * - v1.1.0：顶部新增公司切换条（新鑫科技/智联科技/致联科技 三档 Tab），选中公司写入 localStorage 持久化；
 *            「新建」类入口（submission 发起页）URL 自动携带 ?company= 参数，供表单侧默认归属使用
 */

var APP_TYPE = 'APP_NVNNBIVSF59IKTEP1L1H';

// ── 公司切换配置（2026-10-12 用户指定三家公司；名称必须与各单据表单「业务所属公司」字段选项值完全一致） ──
var COMPANIES = [
  { name: '新鑫科技', color: '#1A4D8F' },
  { name: '智联科技', color: '#0D9488' },
  { name: '致联科技', color: '#6D28D9' },
];
var DEFAULT_COMPANY = COMPANIES[0].name;
var COMPANY_LS_KEY = 'XXKJ_CURRENT_COMPANY';

// ── 表单入口配置（formUuid 来自 新鑫系统/系统配置清单.md，禁止改动为猜测值） ──
var FORMS = {
  saleOrder:   { uuid: 'FORM-E865B899BDE445DB82918AE5AC30E34B9D42', name: '销售订单',   initial: '销', color: '#1A4D8F', group: '销售' },
  saleOut:     { uuid: 'FORM-A3FD29B06AA9466F996C75D621324AFDN3LX', name: '销售出库',   initial: '出', color: '#1A4D8F', group: '销售' },
  saleReturn:  { uuid: 'FORM-E5AB39DD272B4211A8B30C0882B40610OUTU', name: '销售退货',   initial: '退', color: '#1A4D8F', group: '销售' },
  saleRecon:   { uuid: 'FORM-630A2C6DC92E45DB86964F9958C82B67TGKW', name: '销售对账单', initial: '对', color: '#1A4D8F', group: '销售' },
  quote:       { uuid: 'FORM-3D0FD29DE6B244F69E2087A0C433193011Z5', name: '报价单',     initial: '报', color: '#1A4D8F', group: '销售' },
  customer:    { uuid: 'FORM-A83E4407D8294F1A8C26A3D6E364CA60KB27', name: '客户信息',   initial: '客', color: '#2563A8', group: '销售' },

  purchaseOrder: { uuid: 'FORM-6D7780405CF64AC09936E8AA83121D1AQ3OS', name: '采购订单', initial: '采', color: '#0D9488', group: '采购' },
  purchaseIn:    { uuid: 'FORM-2B9B1930119E406592AC1B151860C5C9Z1VP', name: '采购入库', initial: '入', color: '#0D9488', group: '采购' },
  purchaseReturn:{ uuid: 'FORM-901E507D9D464B7EB706E07B91E3564DDUCH', name: '采购退库', initial: '退', color: '#0D9488', group: '采购' },
  purchaseRecon: { uuid: 'FORM-AF5308F63F38417083953EA60A4ED2166N4F', name: '采购对账单', initial: '对', color: '#0D9488', group: '采购' },
  supplier:      { uuid: 'FORM-ED6AC2FCF36948639777E5130E9A908DXUD1', name: '供应商信息', initial: '供', color: '#0F766E', group: '采购' },
  inquiry:       { uuid: 'FORM-5CE662ED81864F9C80F5F507C08AE4F1UIZU', name: '采购询价', initial: '询', color: '#0F766E', group: '采购' },

  stock:      { uuid: 'FORM-0E4E9C60D6684E0988456C1BDC74A0CE4K0S', name: '实时库存', initial: '库', color: '#B45309', group: '库存' },
  stockCheck: { uuid: 'FORM-CC42AF8AF93B48A8A103FA479B563276L7YM', name: '库存盘点', initial: '盘', color: '#B45309', group: '库存' },
  stockMove:  { uuid: 'FORM-C48928D213E742B7B8A24A1D78FAE507039Y', name: '库存调拨', initial: '调', color: '#B45309', group: '库存' },
  stockIn:    { uuid: 'FORM-62D05147B4EC482C9AE7700DE6C32C45MPMG', name: '其他入库', initial: '入', color: '#B45309', group: '库存' },
  stockOut:   { uuid: 'FORM-2F06A9B0BAFA4D1CA3A87D18C2B808DBGCNT', name: '其他出库', initial: '出', color: '#B45309', group: '库存' },

  saleReceipt: { uuid: 'FORM-0619119DD1AA4FFA919CDD8B54B151EDHO90', name: '销售收款', initial: '收', color: '#6D28D9', group: '财务' },
  purchasePay: { uuid: 'FORM-77F4A663404042238D549DB629D57FCFTXF4', name: '采购付款', initial: '付', color: '#6D28D9', group: '财务' },
  saleInvoice: { uuid: 'FORM-82BAA2B1064C4060AD498681292228CFH6BS', name: '销售开票', initial: '票', color: '#6D28D9', group: '财务' },
  bankFlow:    { uuid: 'FORM-D2245D2E16C6409CB9A842609C7ED5EEUULQ', name: '银行流水', initial: '银', color: '#6D28D9', group: '财务' },

  product:  { uuid: 'FORM-BE2F19E6D36B447BB0D8F5F10074ABECRF5J', name: '产品信息', initial: '品', color: '#475569', group: '基础' },
  warehouse:{ uuid: 'FORM-F768BE0E1AB347CD8FF12F4D1505CF32LHMZ', name: '仓库信息', initial: '仓', color: '#475569', group: '基础' },
  expense:  { uuid: 'FORM-41C1CBBE55C34B418643E15FFB6E0C394163', name: '费用报销', initial: '报', color: '#475569', group: '行政' },
  leave:    { uuid: 'FORM-0410BCF6846D4489969DAE36098C376B301W', name: '请假申请', initial: '假', color: '#475569', group: '行政' },
  staff:    { uuid: 'FORM-BF91596970A2497CA7513096773791DEW0EY', name: '员工档案', initial: '员', color: '#475569', group: '行政' },
};

// 报表分析入口（REPORT 页面编码来自系统配置清单.md）
var REPORTS = [
  { uuid: 'REPORT-OMD66B71UUE122GGNSB2T992AVKZ1UCKN78JM7', name: '销售数据分析', color: '#1A4D8F' },
  { uuid: 'REPORT-UQ866IC1EJD1B573PSMNX7Q97EGB2JBJ3P0JM0', name: '采购数据分析', color: '#0D9488' },
  { uuid: 'REPORT-6TG663815SX5WTYWK0TUM8AYW7ER23N7PFGPM3', name: '库存分析报表', color: '#B45309' },
  { uuid: 'REPORT-HA6668B1MIY5SJ0ELKUP787ROCUM2D37QLGPM1', name: '报价单分析', color: '#6D28D9' },
  { uuid: 'REPORT-9VD66QA13AO5B2KGG7LUL5DXJX2Y36EMOFGPM71', name: '应收应付总览', color: '#BE123C' },
  { uuid: 'REPORT-NNC669C1TRX5GZD8KH6FC689GDEJ2IEJPFGPM7', name: '银行流水分析', color: '#475569' },
];

// ── 字段映射（来自各表单 组件ID清单.md） ──
var FIELDS = {
  // 销售订单「流程表单」
  saleOrderNo:  'serialNumberField_mhabn0ob',
  saleCustomer: 'textField_l7znaxp0',
  saleAmount:   'numberField_mhvoc4l0',
  saleDate:     'dateField_kk91ezq5',
  saleDelivery: 'selectField_mhwuk1ek',
  // 采购订单「流程表单」
  purchaseOrderNo:  'serialNumberField_mh8hjild',
  purchaseSupplier: 'textField_l7u5c0sr',
  purchaseAmount:   'numberField_kl5u8j6c',
  purchaseDate:     'dateField_kl5u8j59',
  purchasePayStatus:'selectField_mi745q2t',
};

// ── 表单 UUID（数据统计用） ──
var UUIDS = {
  saleOrder:  'FORM-E865B899BDE445DB82918AE5AC30E34B9D42',
  purchaseOrder: 'FORM-6D7780405CF64AC09936E8AA83121D1AQ3OS',
  product:    'FORM-BE2F19E6D36B447BB0D8F5F10074ABECRF5J',
  customer:   'FORM-A83E4407D8294F1A8C26A3D6E364CA60KB27',
  supplier:   'FORM-ED6AC2FCF36948639777E5130E9A908DXUD1',
  stock:      'FORM-0E4E9C60D6684E0988456C1BDC74A0CE4K0S',
};

// ── 状态管理 ──
var _customState = {
  loading: true,
  loadError: false,
  userName: '',
  currentCompany: DEFAULT_COMPANY,
  saleStats: { total: 0, monthCount: 0, monthAmount: 0, amountFromAll: true, recent: [] },
  purchaseStats: { total: 0, monthCount: 0, monthAmount: 0, amountFromAll: true },
  productTotal: '-',
  customerTotal: '-',
  supplierTotal: '-',
  stockTotal: '-',
};

// 并行请求计数器（全部结束后统一关闭 loading）
var _pending = 0;

export function getCustomState(key) {
  if (key) {
    return _customState[key];
  }
  var copy = {};
  Object.keys(_customState).forEach((k) => {
    copy[k] = _customState[k];
  });
  return copy;
}

export function setCustomState(newState) {
  Object.keys(newState).forEach((key) => {
    _customState[key] = newState[key];
  });
  this.forceUpdate();
}

export function forceUpdate() {
  this.setState({ timestamp: new Date().getTime() });
}

// ── 公司切换工具（非导出，localStorage 不可用时静默退化为内存态） ──
function readStoredCompany() {
  try {
    var v = window.localStorage.getItem(COMPANY_LS_KEY);
    for (var i = 0; i < COMPANIES.length; i++) {
      if (COMPANIES[i].name === v) return v;
    }
  } catch (e) { /* 隐私模式/iframe 限制时走默认公司 */ }
  return DEFAULT_COMPANY;
}

function getCurrentCompanyName() {
  return _customState.currentCompany || readStoredCompany();
}

// ── 生命周期 ──
export function didMount() {
  var name = '';
  try {
    name = (window.loginUser && window.loginUser.userName) || '';
  } catch (e) { name = ''; }
  _customState.userName = name;
  _customState.currentCompany = readStoredCompany();
  this.loadAllData();
}

export function didUnmount() {
  // 页面无定时器，预留清理位
}

// ── 公司切换 ──
export function switchCompany(name) {
  var self = this;
  var valid = false;
  for (var i = 0; i < COMPANIES.length; i++) {
    if (COMPANIES[i].name === name) { valid = true; break; }
  }
  if (!valid || _customState.currentCompany === name) return;
  _customState.currentCompany = name;
  try {
    window.localStorage.setItem(COMPANY_LS_KEY, name);
  } catch (e) { /* 存储不可用时仅内存生效 */ }
  self.setCustomState({ currentCompany: name });
  self.utils.toast({ title: '已切换到「' + name + '」', type: 'success' });
}

// ── 数据加载 ──
export function loadAllData() {
  var self = this;
  _pending = 0;
  self.setCustomState({ loading: true, loadError: false });

  // 订单类：一次拉 100 条本地聚合（本月口径 + 最近动态）
  self.loadOrderStats(UUIDS.saleOrder, FIELDS.saleDate, FIELDS.saleAmount, 'saleStats');
  self.loadOrderStats(UUIDS.purchaseOrder, FIELDS.purchaseDate, FIELDS.purchaseAmount, 'purchaseStats');
  // 基础表：仅取记录总数
  self.loadTotal(UUIDS.product, 'productTotal');
  self.loadTotal(UUIDS.customer, 'customerTotal');
  self.loadTotal(UUIDS.supplier, 'supplierTotal');
  self.loadTotal(UUIDS.stock, 'stockTotal');
}

// 加载单个订单表：总数 / 本月单数与金额合计 / 最近 5 条
export function loadOrderStats(formUuid, dateField, amountField, stateKey) {
  var self = this;
  _pending++;
  this.utils.yida.searchFormDatas({
    formUuid: formUuid,
    currentPage: 1,
    pageSize: 100,
  }).then(function (res) {
    var rawList = parseList(res);
    var total = parseTotal(res, rawList);

    var monthStart = getMonthStart();
    var monthEnd = getMonthEnd();
    var monthCount = 0;
    var monthAmount = 0;
    var rows = [];
    rawList.forEach(function (item) {
      var fd = item.formData || {};
      rows.push(fd);
      var d = fd[dateField];
      var ts = toDateTs(d);
      if (ts >= monthStart && ts <= monthEnd) {
        monthCount++;
        monthAmount += toNumber(fd[amountField]);
      }
    });

    // 最近 5 条：按日期字段倒序
    rows.sort(function (a, b) {
      return toDateTs(b[dateField]) - toDateTs(a[dateField]);
    });
    var recent = rows.slice(0, 5).map(function (fd) {
      return {
        no: fd[FIELDS.saleOrderNo] || fd[FIELDS.purchaseOrderNo] || '-',
        partner: fd[FIELDS.saleCustomer] || fd[FIELDS.purchaseSupplier] || '-',
        amount: toNumber(fd[FIELDS.saleAmount] || fd[FIELDS.purchaseAmount] || 0),
        status: fd[FIELDS.saleDelivery] || fd[FIELDS.purchasePayStatus] || '',
        date: fd[dateField],
      };
    });

    var stats = {
      total: total,
      monthCount: monthCount,
      monthAmount: monthAmount,
      amountFromAll: total <= 100,
      recent: recent,
    };
    var next = {};
    next[stateKey] = stats;
    self.setCustomState(next);
    settle(self);
  }).catch(function (err) {
    console.log('loadOrderStats failed: ' + ((err && err.message) || 'unknown'));
    self.utils.toast({ title: '订单数据加载失败', type: 'error' });
    settle(self);
  });
}

// 加载单表记录总数
export function loadTotal(formUuid, stateKey) {
  var self = this;
  _pending++;
  this.utils.yida.searchFormDatas({
    formUuid: formUuid,
    currentPage: 1,
    pageSize: 1,
  }).then(function (res) {
    var rawList = parseList(res);
    var next = {};
    next[stateKey] = parseTotal(res, rawList);
    self.setCustomState(next);
    settle(self);
  }).catch(function (err) {
    console.log('loadTotal failed: ' + ((err && err.message) || 'unknown'));
    settle(self);
  });
}

// 所有请求结束后关闭 loading；全部失败时置错误态
export function settle(self) {
  _pending--;
  if (_pending > 0) return;
  var hasError =
    typeof _customState.productTotal !== 'number' &&
    typeof _customState.customerTotal !== 'number' &&
    typeof _customState.stockTotal !== 'number' &&
    _customState.saleStats.total === 0 &&
    _customState.purchaseStats.total === 0;
  self.setCustomState({ loading: false, loadError: hasError });
}

// ── 数据解析工具（P-14：兼容四种响应结构） ──
function parseList(res) {
  if (!res || !res.data) return [];
  if (Array.isArray(res.data)) return res.data;
  if (res.data.data && Array.isArray(res.data.data)) return res.data.data;
  if (res.data.result && Array.isArray(res.data.result)) return res.data.result;
  if (res.data.list && Array.isArray(res.data.list)) return res.data.list;
  return [];
}

function parseTotal(res, rawList) {
  if (!res) return rawList.length;
  if (typeof res.totalCount === 'number') return res.totalCount;
  if (res.data && typeof res.data.totalCount === 'number') return res.data.totalCount;
  if (res.data && typeof res.data.total === 'number') return res.data.total;
  return rawList.length;
}

function toNumber(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

// 日期值兼容：时间戳 / GMT 字符串 / 秒级时间戳
function toDateTs(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  var t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

function getMonthStart() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function getMonthEnd() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
}

// ── 格式化 ──
function formatDate(v) {
  var ts = toDateTs(v);
  if (!ts) return '-';
  var d = new Date(ts);
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : '' + m) + '-' + (day < 10 ? '0' + day : '' + day);
}

function formatMoney(n) {
  if (!n) return '0';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(2) + ' 万';
  return String(Math.round(n * 100) / 100);
}

// 状态标签配色（P-15：字典兜底）
function statusTone(text) {
  var s = String(text || '');
  if (!s) return { color: '#475569', bg: '#F1F5F9', border: '#E2E8F0' };
  if (s.indexOf('完') >= 0 || s.indexOf('已') >= 0 || s.indexOf('全') >= 0) {
    return { color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' };
  }
  if (s.indexOf('待') >= 0 || s.indexOf('未') >= 0 || s.indexOf('部分') >= 0) {
    return { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' };
  }
  return { color: '#1A4D8F', bg: '#E8F0FE', border: '#BFDBFE' };
}

// ── 导航 ──
// 数据管理页（列表/详情管理）：{origin}/{appType}/workbench/{formUuid}
// 注意：宜搭页面路由必须带 workbench/submission 段，裸 {appType}/{formUuid} 会 404（No handler found）
export function openForm(formUuid) {
  if (!formUuid) return;
  var url = window.location.origin + '/' + APP_TYPE + '/workbench/' + formUuid;
  window.open(url, '_blank');
}

// 表单提交页（发起新单据）：{origin}/{appType}/submission/{formUuid}?company=当前公司
// ?company= 由表单侧 didMount 读取并填入「业务所属公司」字段（表单侧接入前该参数不生效，无副作用）
export function openCreate(formUuid) {
  if (!formUuid) return;
  var url = window.location.origin + '/' + APP_TYPE + '/submission/' + formUuid
    + '?company=' + encodeURIComponent(getCurrentCompanyName());
  window.open(url, '_blank');
}

// ── 渲染 ──
export function renderJsx() {
  var self = this;
  var state = this.getCustomState();
  var timestamp = this.state && this.state.timestamp;
  // isMobile 依据设备标识；补充视口宽度判断，兼容 PC 端拖窄窗口的场景
  var isMobile = this.utils.isMobile() || (window.innerWidth || 1200) <= 768;

  var colors = {
    primary: '#1A4D8F',
    primaryDeep: '#153C70',
    primaryLight: '#E8F0FE',
    accent: '#0D9488',
    bg: '#F1F5F9',
    bgCard: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#475569',
    textTertiary: '#94A3B8',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
  };

  var pad = isMobile ? '12px' : '20px 28px 32px';

  var styles = {
    page: {
      minHeight: '100vh',
      background: colors.bg,
      padding: pad,
      borderRadius: '0 !important',
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
      color: colors.text,
      boxSizing: 'border-box',
    },
    card: {
      background: colors.bgCard,
      borderRadius: '12px',
      border: '1px solid ' + colors.border,
      padding: isMobile ? '14px' : '18px 20px',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    },
    sectionTitle: {
      fontSize: '16px',
      fontWeight: 700,
      color: colors.text,
      margin: '0 0 4px',
      letterSpacing: '-0.01em',
    },
    sectionHint: {
      fontSize: '12px',
      color: colors.textTertiary,
      fontWeight: 400,
      marginLeft: '8px',
    },
  };

  function companyColor(name) {
    for (var i = 0; i < COMPANIES.length; i++) {
      if (COMPANIES[i].name === name) return COMPANIES[i].color;
    }
    return colors.primary;
  }

  // ── 区块：公司切换条（选中公司持久化，新建入口自动携带） ──
  function renderCompanyBar() {
    var current = state.currentCompany || DEFAULT_COMPANY;
    return (
      <div style={{
        background: colors.bgCard,
        borderRadius: '12px',
        border: '1px solid ' + colors.border,
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', flexShrink: 0 }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: companyColor(current),
            display: 'inline-block',
          }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary }}>当前公司</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {COMPANIES.map((c, idx) => {
            var active = c.name === current;
            return (
              <div
                key={c.name}
                onClick={(e) => { self.switchCompany(c.name); }}
                style={{
                  padding: isMobile ? '7px 14px' : '8px 22px',
                  borderRadius: '8px',
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: active ? c.color : 'transparent',
                  color: active ? '#FFFFFF' : colors.textSecondary,
                  border: active ? '1px solid transparent' : '1px solid ' + colors.border,
                  boxShadow: active ? '0 2px 8px rgba(15, 23, 42, 0.18)' : 'none',
                }}
              >
                {c.name}
              </div>
            );
          })}
        </div>
        {!isMobile ? (
          <div style={{ fontSize: '12px', color: colors.textTertiary, flexShrink: 0, paddingRight: '6px' }}>
            切换后新建单据将默认归属所选公司
          </div>
        ) : null}
      </div>
    );
  }

  // ── 区块：顶部问候栏（轻量，非营销 Hero） ──
  function renderGreetBar() {
    var d = new Date();
    var h = d.getHours();
    var greet = h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    var dateText = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + week;
    var who = state.userName ? greet + '，' + state.userName : greet;

    var quickBtns = [
      { key: 'saleOrder', label: '新建销售订单', bg: '#FFFFFF', fg: colors.primary, bd: 'transparent' },
      { key: 'purchaseOrder', label: '新建采购订单', bg: 'rgba(255,255,255,0.14)', fg: '#FFFFFF', bd: '1px solid rgba(255,255,255,0.5)' },
    ];

    return (
      <div style={{
        background: 'linear-gradient(120deg, #1A4D8F 0%, #2563A8 60%, #2E6BB5 100%)',
        borderRadius: '14px',
        padding: isMobile ? '18px 16px' : '22px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 4px 14px rgba(26, 77, 143, 0.25)',
      }}>
        <div>
          <div style={{ fontSize: isMobile ? '18px' : '21px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
            {who}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', marginTop: '4px' }}>
            {dateText} · 欢迎使用新鑫系统工作台
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {quickBtns.map((btn) => (
            <div
              key={btn.key}
              onClick={(e) => { self.openCreate(FORMS[btn.key].uuid); }}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                background: btn.bg,
                color: btn.fg,
                border: btn.bd === 'transparent' ? 'none' : btn.bd,
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + {btn.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── 区块：KPI 指标（主卡：本月销售；副卡：采购/库存/客户） ──
  function renderKpi() {
    var s = state.saleStats;
    var p = state.purchaseStats;
    var kpiWrap = {
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : '2fr 1fr 1fr 1fr',
      gap: '12px',
    };

    var mainCard = (
      <div key="main" style={{
        background: 'linear-gradient(135deg, #1A4D8F 0%, #2E6BB5 100%)',
        borderRadius: '12px',
        padding: isMobile ? '14px 16px' : '20px 24px',
        boxShadow: '0 4px 14px rgba(26, 77, 143, 0.22)',
        cursor: 'pointer',
      }} onClick={(e) => { self.openForm(UUIDS.saleOrder); }}>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>本月销售订单</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
          <span style={{ fontSize: isMobile ? '28px' : '34px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em' }}>
            {s.monthCount}
          </span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>单</span>
        </div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', marginTop: '6px' }}>
          含税合计 <span style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>{formatMoney(s.monthAmount)}</span> 元
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '4px' }}>
          {s.amountFromAll ? '全量订单统计 · 点击进入销售订单' : '基于最近 100 单统计 · 点击进入销售订单'}
        </div>
      </div>
    );

    function kpiCard(key, title, value, unit, sub, formUuid, tint) {
      return (
        <div key={key} style={{
          background: colors.bgCard,
          borderRadius: '12px',
          border: '1px solid ' + colors.border,
          padding: isMobile ? '12px 14px' : '16px 18px',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }} onClick={(e) => { self.openForm(formUuid); }}>
          <div style={{ fontSize: '13px', color: colors.textSecondary }}>{title}</div>
          <div style={{ marginTop: '6px' }}>
            <span style={{
              fontSize: isMobile ? '22px' : '26px', fontWeight: 800, color: tint,
              letterSpacing: '-0.02em',
            }}>{value}</span>
            <span style={{ fontSize: '12px', color: colors.textTertiary, marginLeft: '4px' }}>{unit}</span>
          </div>
          <div style={{ fontSize: '11px', color: colors.textTertiary, marginTop: '4px' }}>{sub}</div>
        </div>
      );
    }

    return (
      <div style={kpiWrap}>
        {mainCard}
        {kpiCard('purchase', '本月采购订单', p.monthCount, '单',
          '含税合计 ' + formatMoney(p.monthAmount) + ' 元', UUIDS.purchaseOrder, colors.accent)}
        {kpiCard('stock', '实时库存 SKU', state.stockTotal, '个',
          '点击查看实时库存', UUIDS.stock, '#B45309')}
        {kpiCard('customer', '客户总数', state.customerTotal, '家',
          '供应商 ' + state.supplierTotal + ' 家 · 产品 ' + state.productTotal + ' 项', UUIDS.customer, '#6D28D9')}
      </div>
    );
  }

  // ── 区块：常用表单入口（高频大卡 + 分组收拢） ──
  function renderEntryIcon(form, size) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: size >= 44 ? '10px' : '8px',
        background: form.color,
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size >= 44 ? '18px' : '13px',
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {form.initial}
      </div>
    );
  }

  function renderMainEntries() {
    var mainKeys = ['saleOrder', 'saleOut', 'purchaseOrder', 'purchaseIn', 'stock', 'customer'];
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        gap: '12px',
      }}>
        {mainKeys.map((key) => {
          var form = FORMS[key];
          return (
            <div
              key={key}
              onClick={(e) => { self.openForm(form.uuid); }}
              style={{
                background: colors.bgCard,
                borderRadius: '12px',
                border: '1px solid ' + colors.border,
                padding: isMobile ? '12px' : '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
                transition: 'box-shadow 0.2s',
              }}
            >
              {renderEntryIcon(form, 44)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>{form.name}</div>
                <div style={{ fontSize: '12px', color: colors.textTertiary, marginTop: '2px' }}>{form.group}管理</div>
              </div>
              <div style={{ fontSize: '16px', color: colors.textTertiary }}>›</div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderGroupEntries() {
    var groups = [
      { title: '库存管理', keys: ['stockCheck', 'stockMove', 'stockIn', 'stockOut'] },
      { title: '财务结算', keys: ['saleReceipt', 'purchasePay', 'saleInvoice', 'bankFlow'] },
      { title: '销售进阶', keys: ['saleRecon', 'saleReturn', 'quote'] },
      { title: '采购进阶', keys: ['purchaseRecon', 'purchaseReturn', 'inquiry', 'supplier'] },
      { title: '基础与行政', keys: ['product', 'warehouse', 'expense', 'leave', 'staff'] },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
        {groups.map((g) => (
          <div key={g.title} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{
              fontSize: '12px', color: colors.textSecondary, width: '64px', flexShrink: 0,
              fontWeight: 600,
            }}>{g.title}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {g.keys.map((key) => {
                var form = FORMS[key];
                return (
                  <div
                    key={key}
                    onClick={(e) => { self.openForm(form.uuid); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: colors.bgCard,
                      border: '1px solid ' + colors.border,
                      borderRadius: '8px',
                      padding: '6px 12px 6px 8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: colors.text,
                    }}
                  >
                    {renderEntryIcon(form, 24)}
                    <span>{form.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderEntrySection() {
    return (
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '14px' }}>
          <div style={styles.sectionTitle}>常用表单</div>
          <div style={styles.sectionHint}>点击进入数据管理页</div>
        </div>
        {renderMainEntries()}
        <div style={{ borderTop: '1px solid ' + colors.borderLight, marginTop: '16px', paddingTop: '4px' }}>
          {renderGroupEntries()}
        </div>
      </div>
    );
  }

  // ── 区块：最近销售订单 ──
  function renderRecent() {
    var s = state.saleStats;
    var recent = s.recent || [];
    return (
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '10px' }}>
          <div style={styles.sectionTitle}>最近销售订单</div>
          <div style={styles.sectionHint}>近 5 单</div>
        </div>
        {recent.length === 0 ? (
          <div style={{
            padding: '32px 0', textAlign: 'center',
            color: colors.textTertiary, fontSize: '13px',
          }}>
            {state.loading ? '数据加载中…' : '暂无销售订单，点击上方「新建销售订单」发起第一单'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.map((row, idx) => {
              var tone = statusTone(row.status);
              return (
                <div
                  key={idx}
                  onClick={(e) => { self.openForm(UUIDS.saleOrder); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 0',
                    borderBottom: idx < recent.length - 1 ? '1px solid ' + colors.borderLight : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px', fontWeight: 600, color: colors.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{row.partner}</div>
                    <div style={{
                      fontSize: '12px', color: colors.textTertiary, marginTop: '2px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{row.no} · {formatDate(row.date)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: colors.primary }}>
                      {formatMoney(row.amount)}
                    </div>
                    <div style={{
                      display: 'inline-block', marginTop: '2px',
                      padding: '1px 6px', borderRadius: '4px',
                      fontSize: '11px', fontWeight: 500,
                      color: tone.color, background: tone.bg, border: '1px solid ' + tone.border,
                    }}>{row.status || '-'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── 区块：报表分析 ──
  function renderReports() {
    return (
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '14px' }}>
          <div style={styles.sectionTitle}>数据分析</div>
          <div style={styles.sectionHint}>经营报表一键直达</div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)',
          gap: '10px',
        }}>
          {REPORTS.map((r) => (
            <div
              key={r.uuid}
              onClick={(e) => { self.openForm(r.uuid); }}
              style={{
                background: colors.bg,
                borderRadius: '10px',
                border: '1px solid ' + colors.border,
                padding: isMobile ? '12px 8px' : '16px 10px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '34px', height: '34px', margin: '0 auto 8px',
                borderRadius: '8px', background: r.color, color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '15px', fontWeight: 700,
              }}>{r.name.charAt(0)}</div>
              <div style={{ fontSize: '12px', color: colors.text, fontWeight: 500 }}>{r.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── 加载 / 错误态 ──
  function renderState() {
    if (state.loading) {
      return (
        <div style={{
          ...styles.card,
          textAlign: 'center', padding: '60px 0',
          color: colors.textTertiary, fontSize: '14px',
        }}>
          正在加载工作台数据…
        </div>
      );
    }
    if (state.loadError) {
      return (
        <div style={{ ...styles.card, textAlign: 'center', padding: '48px 0' }}>
          <div style={{ color: colors.textSecondary, fontSize: '14px', marginBottom: '12px' }}>
            数据加载失败，请检查登录状态后重试
          </div>
          <div
            onClick={(e) => { self.loadAllData(); }}
            style={{
              display: 'inline-block', padding: '8px 24px',
              background: colors.primary, color: '#FFFFFF',
              borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            重新加载
          </div>
        </div>
      );
    }
    return null;
  }

  // ── 页面组装 ──
  // 公司切换条为静态 UI，不依赖数据加载：加载/错误态下也保持可见
  var stateView = renderState();
  var inner = stateView ? stateView : (
    <div>
      {renderGreetBar()}
      <div style={{ height: '16px' }} />
      {renderKpi()}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr',
        gap: '14px',
        marginTop: '14px',
        alignItems: 'start',
      }}>
        {renderEntrySection()}
        {renderRecent()}
      </div>
      <div style={{ marginTop: '14px' }}>
        {renderReports()}
      </div>
      <div style={{
        textAlign: 'center', fontSize: '11px', color: colors.textTertiary,
        marginTop: '20px',
      }}>
        金额统计口径：本月订单含税金额（单量超过 100 单时基于最近 100 单）
      </div>
    </div>
  );

  var body = (
    <div>
      {renderCompanyBar()}
      <div style={{ height: '12px' }} />
      {inner}
    </div>
  );

  return (
    <div style={styles.page} className="cp-page">
      <div style={{ display: 'none' }}>{timestamp}</div>
      {body}
    </div>
  );
}
