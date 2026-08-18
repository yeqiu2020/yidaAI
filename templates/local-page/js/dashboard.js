/**
 * 宜搭组织管理门户 - Dashboard JS
 * v1.8.2: 拆分「初始化组织信息」与「刷新应用信息」两个入口
 *         - 初始化按钮：放在组织名称位置，仅当未初始化时显示，点击后完成首次登录+组织信息+应用列表抓取，完成后按钮自动消失
 *         - 刷新按钮：保留在应用管理 Tab 顶部，用于已有数据后同步宜搭端最新应用列表
 *         - 抽取共享函数 _runOrgInit 供两个入口复用，仅 UI 文案与触发场景不同
 * v1.8.0: 多组织并存——从 URL 路径首段提取当前项目名，请求同步/静态服务时携带 projectDir，
 *         实现同一端口下多项目互不干扰、不串数据
 * v1.7.1: 修复服务重启后刷新过早导致组织信息加载失败（增加重试机制+延迟刷新）
 * v1.7.0: 企业名称后显示服务启动目录；新增"重启服务"按钮
 * v1.6.1: 刷新应用信息改为 SSE 流式日志（与刷新登录态一致），弹窗实时展示同步进度
 */
const SYNC_SERVICE = 'http://localhost:3457';
const HTTP_SERVICE = 'http://127.0.0.1:8080';

// ========== 多组织并存：从 URL 路径提取当前项目名 ==========
// 页面以 http://127.0.0.1:8080/{项目名}/本地操作页面/index.html 访问，首段即项目目录名。
// 请求同步服务(3457)/静态服务(8080)时以该值定位到当前项目，避免串到其他项目的数据。
function getProjectName() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments.length > 0 ? decodeURIComponent(segments[0]) : '';
}
const PROJECT_NAME = getProjectName();
// projectDir 查询串（相对静态根的项目目录名），用于同步服务 resolveProjectDir
const PROJECT_DIR_QUERY = PROJECT_NAME ? `projectDir=${encodeURIComponent(PROJECT_NAME)}` : '';
// 静态服务中当前项目下的资源路径前缀（含项目段）
const HTTP_PROJECT_PREFIX = PROJECT_NAME ? `/${encodeURIComponent(PROJECT_NAME)}` : '';

// ========== 全局状态 ==========
let orgData = null;
let serviceRunning = false;

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  checkService();
  loadOrgInfo();
  // 每30秒轮询服务状态
  setInterval(checkService, 30000);
});

// ========== 服务状态检测 ==========
async function checkService() {
  const indicator = document.getElementById('service-indicator');
  indicator.className = 'service-indicator checking';
  indicator.querySelector('.indicator-text').textContent = '检测中...';

  try {
    const res = await fetch(`${SYNC_SERVICE}/health?${PROJECT_DIR_QUERY}`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      serviceRunning = true;
      indicator.className = 'service-indicator running';
      indicator.querySelector('.indicator-text').textContent = '服务运行中';
    } else {
      throw new Error('not ok');
    }
  } catch (_) {
    serviceRunning = false;
    indicator.className = 'service-indicator stopped';
    indicator.querySelector('.indicator-text').textContent = '服务未启动';
  }
}

// ========== 加载组织信息 ==========
// v1.7.1: 增加失败重试机制（最多3次），解决服务重启后刷新过早导致加载失败的问题
async function loadOrgInfo(attempt = 1) {
  const appList = document.getElementById('appList');
  appList.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const res = await fetch(`${SYNC_SERVICE}/org-info?${PROJECT_DIR_QUERY}`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    if (!data.success) {
      appList.innerHTML = `<div class="loading">加载失败：${data.error}</div>`;
      return;
    }

    orgData = data;
    renderOrgHeader(data.orgInfo, data.projectDir);
    renderAppList(data.apps);
    renderAppStats(data.totalApps, data.syncedApps);
  } catch (error) {
    // 连接失败时重试（服务重启等场景下端口可能未就绪）
    if (attempt < 3) {
      console.log(`[loadOrgInfo] 第${attempt}次加载失败，3秒后重试...`);
      setTimeout(() => loadOrgInfo(attempt + 1), 3000);
      return;
    }
    // 重试耗尽后，尝试直接读取markdown
    try {
      const mdRes = await fetch(`${HTTP_SERVICE}${HTTP_PROJECT_PREFIX}/组织及应用信息.md`, { signal: AbortSignal.timeout(3000) });
      if (mdRes.ok) {
        const mdText = await mdRes.text();
        const parsed = parseOrgMarkdown(mdText);
        orgData = parsed;
        renderOrgHeader(parsed.orgInfo, null);
        renderAppList(parsed.apps);
        renderAppStats(parsed.totalApps, parsed.syncedApps);
        return;
      }
    } catch (_) {}

    appList.innerHTML = `<div class="loading">无法连接同步服务，请先启动服务<br><small>在对话框中输入"启动宜搭服务"</small></div>`;
  }
}

// ========== 解析 Markdown（备用方案） ==========
function parseOrgMarkdown(content) {
  const orgInfo = {};
  const apps = [];

  // 解析组织信息
  const orgNameMatch = content.match(/\|\s*组织名称\s*\|\s*([^|\n]+)/);
  if (orgNameMatch) orgInfo.orgName = orgNameMatch[1].trim();
  const domainMatch = content.match(/\|\s*域名前缀\s*\|\s*([^|\n]+)/);
  if (domainMatch) orgInfo.domainPrefix = domainMatch[1].trim();
  const fullDomainMatch = content.match(/\|\s*完整域名\s*\|\s*([^|\n]+)/);
  if (fullDomainMatch) orgInfo.fullDomain = cleanUrlValue(fullDomainMatch[1]);
  const corpIdMatch = content.match(/\|\s*corpId\s*\|\s*([^|\n]+)/);
  if (corpIdMatch) orgInfo.corpId = corpIdMatch[1].trim();

  // 解析应用列表
  const lines = content.split('\n');
  let inAppTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('应用名称') && trimmed.includes('应用ID')) {
      inAppTable = true;
      continue;
    }
    if (inAppTable) {
      if (trimmed.startsWith('|') && !trimmed.startsWith('|--') && !trimmed.startsWith('| ---')) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          apps.push({
            name: cells[1],
            appId: cells[2],
            synced: false, // 备用方案无法检测同步状态
            hasPrototype: false,
            prototypeUrl: null
          });
        }
      } else if (!trimmed.startsWith('|')) {
        inAppTable = false;
      }
    }
  }

  return {
    success: true,
    orgInfo,
    apps,
    totalApps: apps.length,
    syncedApps: apps.filter(a => a.synced).length
  };
}

// 清洗 URL 字段值（兼容 Markdown 自动链接语法 <URL> 和 HTML 转义）
function cleanUrlValue(raw) {
  if (!raw) return raw;
  return raw
    .replace(/^&lt;/, '')
    .replace(/&gt;$/, '')
    .replace(/^</, '')
    .replace(/>$/, '')
    .trim();
}

// ========== 渲染组织头部 ==========
function renderOrgHeader(orgInfo, projectDir) {
  const orgNameEl = document.getElementById('orgName');

  // v1.8.2: 判断是否已初始化（组织名称为空 / "未知组织" / 未提供 orgInfo 视为未初始化）
  // 未初始化时，在组织名称位置显示"初始化组织信息"按钮，引导用户完成首次初始化
  const rawName = orgInfo && orgInfo.orgName ? orgInfo.orgName.trim() : '';
  const isUninitialized = !rawName || rawName === '未知组织';

  // v1.7.0: 在企业名称后显示服务启动目录名，一眼看出当前服务来自哪个文件夹
  const dirName = projectDir ? projectDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : '';

  if (isUninitialized) {
    // 未初始化：显示初始化按钮（一次性，初始化成功后页面重载即消失）
    orgNameEl.innerHTML = `<button class="btn btn-init-org" id="initOrgBtn" onclick="initOrgInfo(this)">&#128295; 初始化组织信息</button>`
      + (dirName
        ? ` <span class="org-dir-badge" title="当前服务启动目录：${projectDir}">${dirName}</span>`
        : '');
    // 未初始化时隐藏 meta 区域（域名/corpId 都还没有）
    document.getElementById('orgMeta').innerHTML = '';
    return;
  }

  orgNameEl.innerHTML = rawName + (dirName
    ? ` <span class="org-dir-badge" title="当前服务启动目录：${projectDir}">${dirName}</span>`
    : '');

  const metaParts = [];
  if (orgInfo.fullDomain) {
    const cleanUrl = cleanUrlValue(orgInfo.fullDomain);
    const displayUrl = cleanUrl.replace(/^https?:\/\//, '');
    metaParts.push(`<a href="${cleanUrl}" target="_blank" style="color:#fff;text-decoration:none;cursor:pointer;" title="点击在浏览器中打开">&#127760; ${displayUrl}</a>`);
  }
  if (orgInfo.corpId) metaParts.push(`<span>&#128273; ${orgInfo.corpId.substring(0, 12)}...</span>`);

  document.getElementById('orgMeta').innerHTML = metaParts.join('');
}

// ========== 重启服务 ==========
// v1.8.0: 多组织并存模式下，重启全局服务（所有项目短暂不可访问），不再针对单一项目目录
// 重启后轮询 /health 等待服务恢复，自动刷新页面
function restartService() {
  const btn = document.getElementById('btnRestartService');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '&#128260; 重启中...';
  }

  if (!window.confirm('确定要重启全局服务吗？\n将重启 HTTP(8080) 与同步服务(3457)，所有项目会短暂不可访问。')) {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#128260; 重启服务'; }
    return;
  }

  // 标记页面正在重启，防止用户误操作
  sessionStorage.setItem('serviceRestarting', '1');
  window.alert('全局服务正在重启，页面将自动刷新，请稍候...');

  // 通知同步服务执行重启（同步服务会 spawn 独立 server_manager restart 进程后自行退出）
  fetch(`${SYNC_SERVICE}/restart-service?${PROJECT_DIR_QUERY}`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      console.log('[restart-service] 重启已触发:', data);
      // 重启需要几秒（stop 旧进程 + 启动新进程），轮询等待服务恢复
      waitForServiceRestart();
    })
    .catch(err => {
      console.warn('[restart-service] 触发重启失败:', err);
      // 即使 HTTP 请求失败（服务已开始重启），也尝试轮询等待
      waitForServiceRestart();
    });
}

// 轮询等待同步服务恢复，最多等 30 秒
// v1.7.1: 服务恢复后再延迟 3 秒刷新，确保 3457 完全就绪（避免刷新过早导致组织信息加载失败）
function waitForServiceRestart(maxAttempts = 30) {
  let attempt = 0;
  const timer = setInterval(() => {
    attempt++;
    if (attempt > maxAttempts) {
      clearInterval(timer);
      sessionStorage.removeItem('serviceRestarting');
      window.alert('服务重启超时，请手动刷新页面或重新启动服务。');
      return;
    }
    fetch(`${SYNC_SERVICE}/health`, { signal: AbortSignal.timeout(3000) })
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'ok') {
          clearInterval(timer);
          sessionStorage.removeItem('serviceRestarting');
          // 服务健康检查通过后，再等 3 秒确保完全就绪，然后刷新
          console.log('[restart-service] 服务已恢复，3秒后刷新页面...');
          setTimeout(() => window.location.reload(), 3000);
        }
      })
      .catch(() => {
        // 服务尚未恢复，继续轮询
      });
  }, 1000);
}

// ========== 渲染应用统计 ==========
function renderAppStats(total, synced) {
  document.getElementById('appStats').textContent = `共 ${total} 个应用，已同步 ${synced} 个`;
}

// ========== 渲染应用列表 ==========
function renderAppList(apps) {
  const appList = document.getElementById('appList');

  if (!apps || apps.length === 0) {
    appList.innerHTML = '<div class="loading">暂无应用，请先初始化组织信息</div>';
    return;
  }

  appList.innerHTML = apps.map((app, index) => {
    const statusClass = app.synced ? 'synced' : 'not-synced';
    const statusIcon = app.synced ? '&#10003;' : '&#9675;';
    const statusText = app.synced ? '已同步' : '未同步';

    // 已同步的应用显示"进入应用"按钮 + 同步更新按钮
    const isNewApp = app.appId === '待创建'; // 通过"创建新应用"创建的本地应用
    let actionsHtml = '';

    if (app.synced) {
      // 已同步的应用：显示进入应用 + 同步更新
      // 已生成原型页面 → 指向完整原型页面；尚未生成（仅创建未转换）→ 指向 01需求梳理/index.html 开发引导页，
      // 避免访问不存在的原型页面 index.html 返回 404
      const entryUrl = (app.hasPrototype && app.prototypeUrl)
        ? app.prototypeUrl
        : `${HTTP_SERVICE}${HTTP_PROJECT_PREFIX}/${encodeURIComponent(app.name)}/01需求梳理/index.html`;

      actionsHtml = `
        <a href="${entryUrl}" class="btn btn-outline" target="_blank">&#128194; 进入应用</a>
        <button class="btn btn-ghost" onclick="syncAppToLocal('${app.name}', '${app.appId}', this)">&#128260; 更新应用</button>
        <button class="btn btn-ghost" onclick="backupAppData('${app.name}', '${app.appId}', this)">&#128190; 备份数据</button>
        <select class="backup-format-select" title="备份格式" onchange="event.stopPropagation()">
          <option value="excel" selected>Excel</option>
          <option value="json">JSON</option>
        </select>
        <button class="btn btn-danger" onclick="confirmDeleteLocalApp('${app.name.replace(/'/g, "\\'")}', '${app.appId.replace(/'/g, "\\'")}', this)">&#128465; 删除</button>
      `;
    } else {
      // 未同步的应用：显示同步到本地 + 删除
      actionsHtml = `
        <button class="btn btn-primary" onclick="syncAppToLocal('${app.name}', '${app.appId}', this)">&#11015;&#65039; 同步到本地</button>
        <button class="btn btn-danger" onclick="confirmDeleteLocalApp('${app.name.replace(/'/g, "\\'")}', '${app.appId.replace(/'/g, "\\'")}', this)">&#128465; 删除</button>
      `;
    }

    const metaParts = [];
    if (app.synced && app.formCount) metaParts.push(`${app.formCount} 个表单`);
    if (app.hasPrototype) metaParts.push('原型页面已生成');

    return `
      <div class="app-card" id="app-${index}">
        <div class="app-icon">&#128230;</div>
        <div class="app-info">
          <div class="app-name">
            ${app.synced && app.hasPrototype
              ? `<a href="${app.prototypeUrl}" target="_blank">${app.name}</a>`
              : `<span>${app.name}${isNewApp ? '<span class="new-badge">新建</span>' : ''}</span>`
            }
          </div>
          <div class="app-id">${app.appId}</div>
          <span class="app-status ${statusClass}">${statusIcon} ${statusText}</span>
          ${metaParts.length > 0 ? `<div class="app-meta">${metaParts.join(' | ')}</div>` : ''}
        </div>
        <div class="app-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ========== 同步应用到本地（SSE 流式版） ==========
function syncAppToLocal(appName, appId, btnEl) {
  if (!serviceRunning) {
    showToast('同步服务未启动，请在对话框中输入"启动宜搭服务"', 'error');
    return;
  }

  // 禁用按钮
  const originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '&#8987; 同步中...';

  // 更新卡片状态
  const card = btnEl.closest('.app-card');
  const statusEl = card.querySelector('.app-status');
  if (statusEl) {
    statusEl.className = 'app-status syncing';
    statusEl.innerHTML = '&#8987; 同步中...';
  }

  // 显示进度弹窗
  showSyncModal(`正在同步【${appName}】...`);
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');
  if (progressFill) progressFill.style.width = '0%';

  // 使用 SSE 流式接收同步进度
  const sseUrl = `${SYNC_SERVICE}/sync-app-to-local-stream?${PROJECT_DIR_QUERY}`;
  const es = new EventSource(sseUrl + '&appName=' + encodeURIComponent(appName) + '&appId=' + encodeURIComponent(appId));
  const syncLog = document.getElementById('syncLog');
  if (syncLog) syncLog.classList.add('show');

  // 辅助函数：添加日志条目
  function addLog(message, type) {
    if (!syncLog) return;
    const item = document.createElement('div');
    item.className = 'sync-log-item' + (type ? ' ' + type : '');
    item.textContent = message;
    syncLog.appendChild(item);
    syncLog.scrollTop = syncLog.scrollHeight;
  }

  let formTotal = 0;
  let formDone = 0;

  es.addEventListener('start', (e) => {
    const data = JSON.parse(e.data);
    if (progressText) progressText.textContent = data.message;
    addLog(data.message);
  });

  es.addEventListener('step', (e) => {
    const data = JSON.parse(e.data);
    if (progressText) progressText.textContent = `[步骤 ${data.step}/${data.totalSteps}] ${data.message}`;
    if (progressFill) {
      progressFill.classList.add('determinate');
      const pct = Math.round((data.step / data.totalSteps) * 100);
      progressFill.style.width = pct + '%';
    }
    addLog(`[步骤 ${data.step}/${data.totalSteps}] ${data.message}`);
  });

  es.addEventListener('form-start', (e) => {
    const data = JSON.parse(e.data);
    formTotal = data.total;
    if (progressText) progressText.textContent = `正在同步表单 [${data.current}/${data.total}]: ${data.formName}`;
    if (progressFill && formTotal > 0) {
      progressFill.classList.add('determinate');
      const pct = Math.round(((data.current - 1) / formTotal) * 100);
      progressFill.style.width = pct + '%';
    }
    addLog(`[${data.current}/${data.total}] 开始同步: ${data.formName}`);
  });

  es.addEventListener('form-done', (e) => {
    const data = JSON.parse(e.data);
    formDone++;
    if (progressText) progressText.textContent = data.message;
    if (progressFill && formTotal > 0) {
      const pct = Math.round((formDone / formTotal) * 100);
      progressFill.style.width = pct + '%';
    }
    addLog(data.message, data.status);
  });

  es.addEventListener('log', (e) => {
    const data = JSON.parse(e.data);
    if (progressText) progressText.textContent = data.message;
    addLog(data.message);
  });

  es.addEventListener('error', (e) => {
    let errorMsg = '同步过程中发生错误';
    try {
      if (e.data) {
        const data = JSON.parse(e.data);
        errorMsg = data.error || errorMsg;
      }
    } catch (_) {}
    es.close();
    showSyncModalCloseBtn();
    showToast(`同步失败：${errorMsg}`, 'error');
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
    if (statusEl) {
      statusEl.className = 'app-status not-synced';
      statusEl.innerHTML = '&#10007; 同步失败';
    }
  });

  es.addEventListener('done', (e) => {
    es.close();
    const data = JSON.parse(e.data);
    if (data.success) {
      if (progressFill) { progressFill.classList.add('determinate'); progressFill.style.width = '100%'; }
      addLog('同步完成！', 'success');
      setTimeout(() => { hideSyncModal(); showToast(`应用【${appName}】同步完成！`, 'success'); }, 800);
      setTimeout(() => loadOrgInfo(), 1500);
    } else {
      showSyncModalCloseBtn();
      showToast(`同步失败：${data.error || '未知错误'}`, 'error');
      btnEl.disabled = false;
      btnEl.innerHTML = originalText;
      if (statusEl) {
        statusEl.className = 'app-status not-synced';
        statusEl.innerHTML = '&#10007; 同步失败';
      }
    }
  });

  // SSE 连接超时保底（10分钟）
  setTimeout(() => {
    if (es.readyState !== EventSource.CLOSED) {
      es.close();
      showSyncModalCloseBtn();
      showToast('同步超时，请稍后重试', 'error');
      btnEl.disabled = false;
      btnEl.innerHTML = originalText;
      if (statusEl) {
        statusEl.className = 'app-status not-synced';
        statusEl.innerHTML = '&#9675; 未同步';
      }
    }
  }, 600000);
}

// ========== 备份应用数据 ==========
async function backupAppData(appName, appId, btnEl) {
  if (!serviceRunning) {
    showToast('同步服务未启动，请在对话框中输入"启动宜搭服务"', 'error');
    return;
  }

  const originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '&#8987; 备份中...';

  // 读取用户选择的备份格式
  const formatSelect = btnEl.parentElement.querySelector('.backup-format-select');
  const format = formatSelect ? formatSelect.value : 'json';

  showSyncModal(`正在备份【${appName}】数据...`);
  document.getElementById('progressText').textContent = `正在以 ${format.toUpperCase()} 格式查询表单数据，请稍候...`;

  try {
    const res = await fetch(`${SYNC_SERVICE}/backup-app-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName, appId, format, projectDir: PROJECT_NAME })
    });

    const data = await res.json();

    if (data.success) {
      hideSyncModal();
      const recordInfo = data.totalRecords > 0 ? `，共 ${data.totalRecords} 条记录` : '（表单暂无数据）';
      showToast(`应用【${appName}】备份完成${recordInfo}`, 'success');
    } else {
      showSyncModalCloseBtn();
      showToast(`备份失败：${data.error || '未知错误'}`, 'error');
      btnEl.disabled = false;
      btnEl.innerHTML = originalText;
    }
  } catch (error) {
    showSyncModalCloseBtn();
    showToast(`请求失败：${error.message}`, 'error');
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
  }
}

// ========== 删除本地应用 ==========
function confirmDeleteLocalApp(appName, appId, btnEl) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<div class="confirm-box">
    <div class="confirm-title">&#9888;&#65039; 删除本地应用</div>
    <div class="confirm-msg">确定要删除应用【${appName}】的本地相关信息吗？<br><br>此操作会从本地配置中移除该应用记录，并删除本地项目文件夹（如果存在），不会影响宜搭平台上的应用数据，不可撤销！</div>
    <div class="confirm-actions">
      <button class="tool-btn" style="background:#999" onclick="this.closest('.confirm-overlay').remove()">取消</button>
      <button class="tool-btn danger" id="confirmDeleteBtn">确认删除</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('confirmDeleteBtn').onclick = () => {
    overlay.remove();
    doDeleteLocalApp(appName, appId, btnEl);
  };
}

async function doDeleteLocalApp(appName, appId, btnEl) {
  if (!serviceRunning) {
    showToast('同步服务未启动，请在对话框中输入"启动宜搭服务"', 'error');
    return;
  }

  const originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '&#8987; 删除中...';

  try {
    const res = await fetch(`${SYNC_SERVICE}/delete-local-app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName, appId, projectDir: PROJECT_NAME })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`应用【${appName}】本地信息已清除`, 'success');
      setTimeout(() => loadOrgInfo(), 500);
    } else {
      const details = [];
      if (data.removedFromConfig) details.push('已移除配置记录');
      if (data.removedFolder) details.push('已删除项目文件夹');
      if (data.removedOrphanRows > 0) details.push(`已清理 ${data.removedOrphanRows} 条错位记录`);
      const detailText = details.length > 0 ? `（${details.join('、')}）` : '';
      showToast(`删除失败：${data.error || '未找到可删除的本地应用信息'}${detailText}`, 'error');
      btnEl.disabled = false;
      btnEl.innerHTML = originalText;
    }
  } catch (error) {
    showToast(`请求失败：${error.message}`, 'error');
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
  }
}

// ========== 刷新登录态 ==========
async function refreshLoginState(btnEl) {
  if (!serviceRunning) {
    showToast('同步服务未启动，请在对话框中输入"启动宜搭服务"', 'error');
    return;
  }

  const originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '&#8987; 刷新中...';

  // 打开执行过程观察弹窗（与"同步到本地"一致）
  showSyncModal('正在刷新登录态');

  // 弹窗内元素（自包含，参考 syncAppToLocal 的局部辅助函数）
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');
  const syncLog = document.getElementById('syncLog');
  if (syncLog) syncLog.classList.add('show');

  const addLog = (message, type) => {
    if (!syncLog) return;
    const item = document.createElement('div');
    item.className = 'sync-log-item' + (type ? ' ' + type : '');
    item.textContent = message;
    syncLog.appendChild(item);
    syncLog.scrollTop = syncLog.scrollHeight;
  };

  const setProgress = (percent, text) => {
    if (percent !== null && percent !== undefined && progressFill) {
      progressFill.classList.add('determinate');
      progressFill.style.width = percent + '%';
    }
    if (progressText && text) progressText.textContent = text;
  };

  const es = new EventSource(`${SYNC_SERVICE}/refresh-login`);
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    try { es.close(); } catch (e) {}
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
  };

  es.addEventListener('start', (e) => {
    let d = {};
    try { d = JSON.parse(e.data || '{}'); } catch (err) {}
    addLog(d.message || '开始刷新登录态', 'info');
    setProgress(null, d.message || '开始刷新登录态');
  });

  es.addEventListener('log', (e) => {
    let d = {};
    try { d = JSON.parse(e.data || '{}'); } catch (err) {}
    addLog(d.message || '', d.type || 'info');
    setProgress(null, (d.message || '').slice(0, 48));
  });

  es.addEventListener('done', async (e) => {
    let d = { success: false };
    try { d = JSON.parse(e.data || '{}'); } catch (err) {}
    finish();
    if (d.success) {
      const msg = d.userName ? `✅ 刷新完成，当前登录：${d.userName}` : '✅ 刷新完成';
      setProgress(100, msg);
      addLog(msg, 'success');
      showToast(`登录态已刷新${d.userName ? '（' + d.userName + '）' : ''}`, 'success');
    } else {
      setProgress(100, '❌ 刷新失败');
      addLog('❌ 刷新失败', 'error');
      showToast('刷新失败，请查看弹窗日志', 'error');
    }
    try { await loadLoginState(); } catch (err) {}
    // 成功才自动关闭；失败保留日志，需手动关闭
    if (d.success) {
      setTimeout(hideSyncModal, 1200);
    } else {
      showSyncModalCloseBtn();
    }
  });

  es.addEventListener('error', (e) => {
    if (closed) return;
    let msg = '连接中断';
    try { const d = JSON.parse(e.data || '{}'); if (d.error) msg = d.error; } catch (err) {}
    finish();
    setProgress(100, '❌ ' + msg);
    addLog('❌ ' + msg, 'error');
    showToast(`刷新失败：${msg}`, 'error');
    // 失败不自动关闭，弹窗保留日志
    showSyncModalCloseBtn();
  });
}

// ========== 初始化/刷新组织应用信息（共享底层） ==========
// v1.8.2: 抽取共享函数 _runOrgInit，供「初始化组织信息」（一次性，组织名称位置）与
//         「刷新应用信息」（应用列表顶部，常规同步）两个入口复用。
//         两者调用同一后端接口 /refresh-org-apps，仅 UI 文案与触发场景不同。
async function _runOrgInit(btnEl, opts) {
  if (!serviceRunning) {
    showToast('同步服务未启动，请在对话框中输入"启动宜搭服务"', 'error');
    return;
  }

  const o = Object.assign({
    modalTitle: '正在刷新应用信息',
    startLog: '开始刷新应用信息',
    progressText: '正在从宜搭同步应用列表，请稍候...',
    pendingBtnHtml: '&#8987; 刷新中...',
    doneProgressText: '✅ 应用信息刷新完成',
    doneLogText: '✅ 应用信息刷新完成',
    doneToast: '应用信息刷新完成',
    failProgressText: '❌ 刷新失败',
    failToastPrefix: '刷新失败',
  }, opts || {});

  const originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = o.pendingBtnHtml;

  // 灰化整个 portal 内容区
  const container = document.querySelector('.container');
  if (container) container.classList.add('is-busy');

  // 打开执行过程观察弹窗
  showSyncModal(o.modalTitle);
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');
  const syncLog = document.getElementById('syncLog');
  if (syncLog) syncLog.classList.add('show');

  const addLog = (message, type) => {
    if (!syncLog) return;
    const item = document.createElement('div');
    item.className = 'sync-log-item' + (type ? ' ' + type : '');
    item.textContent = message;
    syncLog.appendChild(item);
    syncLog.scrollTop = syncLog.scrollHeight;
  };

  const setProgress = (percent, text) => {
    if (percent !== null && percent !== undefined && progressFill) {
      progressFill.classList.add('determinate');
      progressFill.style.width = percent + '%';
    }
    if (progressText && text) progressText.textContent = text;
  };

  addLog(o.startLog, 'info');
  setProgress(null, o.progressText);

  const es = new EventSource(`${SYNC_SERVICE}/refresh-org-apps?${PROJECT_DIR_QUERY}`);
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    try { es.close(); } catch (e) {}
    if (container) container.classList.remove('is-busy');
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
  };

  es.addEventListener('log', (e) => {
    let d = {};
    try { d = JSON.parse(e.data || '{}'); } catch (err) {}
    addLog(d.message || '', d.type || 'info');
    setProgress(null, (d.message || '').slice(0, 48));
  });

  es.addEventListener('done', async (e) => {
    let d = { success: false };
    try { d = JSON.parse(e.data || '{}'); } catch (err) {}
    finish();
    if (d.success) {
      setProgress(100, o.doneProgressText);
      addLog(o.doneLogText, 'success');
      // 展示每个应用的变化情况（新增 / 删除 / 保持不变）
      const changes = d.changes;
      if (changes && typeof changes === 'object') {
        const addedNames = changes.addedNames || [];
        const removedNames = changes.removedNames || [];
        const unchangedNames = changes.unchangedNames || [];
        if (addedNames.length) {
          addLog(`🆕 新增应用：${addedNames.join('、')}`, 'success');
        }
        if (removedNames.length) {
          addLog(`🗑️ 删除应用：${removedNames.join('、')}`, 'error');
        }
        if (unchangedNames.length) {
          addLog(`➖ 保持不变：${unchangedNames.join('、')}`, 'info');
        }
        if (!addedNames.length && !removedNames.length && !unchangedNames.length) {
          addLog('未检测到应用变化', 'info');
        }
      }
      showToast(o.doneToast, 'success');
      // 成功才自动关闭
      setTimeout(hideSyncModal, 1500);
      try { await loadOrgInfo(); } catch (err) {}
    } else {
      setProgress(100, o.failProgressText);
      addLog(o.failProgressText + '：' + (d.error || '未知错误'), 'error');
      showToast(o.failToastPrefix + '：' + (d.error || '未知错误'), 'error');
      // 失败不自动关闭，弹窗保留日志
      showSyncModalCloseBtn();
    }
  });

  es.addEventListener('error', (e) => {
    if (closed) return;
    let msg = '连接中断';
    try { const d = JSON.parse(e.data || '{}'); if (d.error) msg = d.error; } catch (err) {}
    finish();
    setProgress(100, '❌ ' + msg);
    addLog('❌ ' + msg, 'error');
    showToast(`${o.failToastPrefix}：${msg}`, 'error');
    // 失败不自动关闭，弹窗保留日志
    showSyncModalCloseBtn();
  });
}

// ========== 刷新组织应用信息（应用管理 Tab 顶部按钮） ==========
// 适用：已有组织数据后，同步宜搭端最新的应用列表（组织信息变更也会一并更新）
async function refreshOrgApps(btnEl) {
  await _runOrgInit(btnEl, {
    modalTitle: '正在刷新应用信息',
    startLog: '开始刷新应用信息',
    progressText: '正在从宜搭同步应用列表，请稍候...',
    pendingBtnHtml: '&#8987; 刷新中...',
    doneProgressText: '✅ 应用信息刷新完成',
    doneLogText: '✅ 应用信息刷新完成',
    doneToast: '应用信息刷新完成',
    failProgressText: '❌ 刷新失败',
    failToastPrefix: '刷新失败',
  });
}

// ========== 初始化组织信息（组织名称位置按钮，一次性） ==========
// v1.8.2: 首次进入时组织名称位置显示此按钮，点击后完成首次登录+组织信息+应用列表抓取。
//         完成后调用 loadOrgInfo 重载，按钮自动消失，组织名称显示。
async function initOrgInfo(btnEl) {
  await _runOrgInit(btnEl, {
    modalTitle: '正在初始化组织信息',
    startLog: '开始初始化组织信息（首次登录 + 抓取组织信息 + 应用列表）',
    progressText: '正在登录宜搭并同步组织信息，请稍候...',
    pendingBtnHtml: '&#8987; 初始化中...',
    doneProgressText: '✅ 组织信息初始化完成',
    doneLogText: '✅ 组织信息初始化完成，正在刷新页面...',
    doneToast: '组织信息初始化完成',
    failProgressText: '❌ 初始化失败',
    failToastPrefix: '初始化失败',
  });
}

// ========== 弹窗控制 ==========
function showSyncModal(title) {
  const modal = document.getElementById('syncModal');
  document.getElementById('syncModalTitle').textContent = title;
  document.getElementById('progressText').textContent = '正在同步应用配置，请稍候...';
  const fill = document.getElementById('progressFill');
  if (fill) { fill.style.width = '0%'; fill.classList.remove('determinate'); }
  const log = document.getElementById('syncLog');
  if (log) { log.innerHTML = ''; log.classList.remove('show'); }
  const closeBtn = document.getElementById('syncModalClose');
  if (closeBtn) closeBtn.style.display = 'none';
  modal.style.display = 'flex';
}

// 失败/报错时：弹窗保留日志不自动关闭，仅显示手动关闭按钮
function showSyncModalCloseBtn() {
  const closeBtn = document.getElementById('syncModalClose');
  if (closeBtn) closeBtn.style.display = 'block';
}

function hideSyncModal() {
  document.getElementById('syncModal').style.display = 'none';
}

// ========== Toast 提示 ==========
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ========== 复制提示词 ==========
function copyPrompt(el) {
  const card = el.closest('.ai-action-card');
  const prompt = card.dataset.prompt;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(prompt).then(() => {
      const original = el.textContent;
      el.textContent = '已复制!';
      setTimeout(() => { el.textContent = original; }, 1500);
    }).catch(() => {
      fallbackCopy(prompt, el);
    });
  } else {
    fallbackCopy(prompt, el);
  }
}

function fallbackCopy(text, el) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    const original = el.textContent;
    el.textContent = '已复制!';
    setTimeout(() => { el.textContent = original; }, 1500);
  } catch (_) {
    showToast('复制失败，请手动复制', 'error');
  }
  document.body.removeChild(textarea);
}
