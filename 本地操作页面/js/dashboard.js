/**
 * 宜搭组织管理门户 - Dashboard JS
 * v1.6.0
 */
const SYNC_SERVICE = 'http://localhost:3457';
const HTTP_SERVICE = 'http://127.0.0.1:8080';

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
    const res = await fetch(`${SYNC_SERVICE}/health`, { signal: AbortSignal.timeout(3000) });
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
async function loadOrgInfo() {
  const appList = document.getElementById('appList');
  appList.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const res = await fetch(`${SYNC_SERVICE}/org-info`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    if (!data.success) {
      appList.innerHTML = `<div class="loading">加载失败：${data.error}</div>`;
      return;
    }

    orgData = data;
    renderOrgHeader(data.orgInfo);
    renderAppList(data.apps);
    renderAppStats(data.totalApps, data.syncedApps);
  } catch (error) {
    // 如果API不可用，尝试直接读取markdown
    try {
      const mdRes = await fetch(`${HTTP_SERVICE}/组织及应用信息.md`, { signal: AbortSignal.timeout(3000) });
      if (mdRes.ok) {
        const mdText = await mdRes.text();
        const parsed = parseOrgMarkdown(mdText);
        orgData = parsed;
        renderOrgHeader(parsed.orgInfo);
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
function renderOrgHeader(orgInfo) {
  document.getElementById('orgName').textContent = orgInfo.orgName || '未知组织';

  const metaParts = [];
  if (orgInfo.fullDomain) {
    const cleanUrl = cleanUrlValue(orgInfo.fullDomain);
    const displayUrl = cleanUrl.replace(/^https?:\/\//, '');
    metaParts.push(`<a href="${cleanUrl}" target="_blank" style="color:#fff;text-decoration:none;cursor:pointer;" title="点击在浏览器中打开">&#127760; ${displayUrl}</a>`);
  }
  if (orgInfo.corpId) metaParts.push(`<span>&#128273; ${orgInfo.corpId.substring(0, 12)}...</span>`);

  document.getElementById('orgMeta').innerHTML = metaParts.join('');
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
      // 指向本地原型页面
      const entryUrl = (app.hasPrototype && app.prototypeUrl)
        ? app.prototypeUrl
        : `http://127.0.0.1:8080/${encodeURIComponent(app.name)}/01需求梳理/原型页面/index.html`;

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
  const sseUrl = `${SYNC_SERVICE}/sync-app-to-local-stream`;
  const es = new EventSource(sseUrl + '?appName=' + encodeURIComponent(appName) + '&appId=' + encodeURIComponent(appId));
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
    hideSyncModal();
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
      hideSyncModal();
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
      hideSyncModal();
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
      body: JSON.stringify({ appName, appId, format })
    });

    const data = await res.json();

    if (data.success) {
      hideSyncModal();
      const recordInfo = data.totalRecords > 0 ? `，共 ${data.totalRecords} 条记录` : '（表单暂无数据）';
      showToast(`应用【${appName}】备份完成${recordInfo}`, 'success');
    } else {
      hideSyncModal();
      showToast(`备份失败：${data.error || '未知错误'}`, 'error');
      btnEl.disabled = false;
      btnEl.innerHTML = originalText;
    }
  } catch (error) {
    hideSyncModal();
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
      body: JSON.stringify({ appName, appId })
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
    setTimeout(hideSyncModal, 1200);
  });

  es.addEventListener('error', (e) => {
    if (closed) return;
    let msg = '连接中断';
    try { const d = JSON.parse(e.data || '{}'); if (d.error) msg = d.error; } catch (err) {}
    finish();
    setProgress(100, '❌ ' + msg);
    addLog('❌ ' + msg, 'error');
    showToast(`刷新失败：${msg}`, 'error');
    setTimeout(hideSyncModal, 1500);
  });
}

// ========== 刷新组织应用信息 ==========
async function refreshOrgApps(btnEl) {
  if (!serviceRunning) {
    showToast('同步服务未启动，请在对话框中输入"启动宜搭服务"', 'error');
    return;
  }

  const originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '&#8987; 刷新中...';

  // 灰化整个 portal 内容区
  const container = document.querySelector('.container');
  if (container) container.classList.add('is-busy');

  showToast('正在从宜搭同步应用列表...', 'info');

  try {
    const res = await fetch(`${SYNC_SERVICE}/refresh-org-apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();

    if (data.success) {
      showToast('应用信息刷新完成', 'success');
      await loadOrgInfo();
    } else {
      showToast('刷新失败：' + (data.error || '未知错误'), 'error');
    }
  } catch (error) {
    showToast('请求失败：' + error.message, 'error');
  } finally {
    if (container) container.classList.remove('is-busy');
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
  }
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
  modal.style.display = 'flex';
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
