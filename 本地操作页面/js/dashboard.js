/**
 * 宜搭组织管理门户 - Dashboard JS
 * v1.3.0
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
  if (fullDomainMatch) orgInfo.fullDomain = fullDomainMatch[1].trim();
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

// ========== 渲染组织头部 ==========
function renderOrgHeader(orgInfo) {
  document.getElementById('orgName').textContent = orgInfo.orgName || '未知组织';

  const metaParts = [];
  if (orgInfo.fullDomain) metaParts.push(`<span>&#127760; ${orgInfo.fullDomain}</span>`);
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
      const entryUrl = (app.hasPrototype && app.prototypeUrl)
        ? app.prototypeUrl
        : `http://127.0.0.1:8080/${encodeURIComponent(app.name)}/01需求梳理/原型页面/templates/guide.html`;

      actionsHtml = `
        <a href="${entryUrl}" class="btn btn-outline" target="_blank">&#128194; 进入应用</a>
        <button class="btn btn-ghost" onclick="syncAppToLocal('${app.name}', '${app.appId}', this)">&#128260; 同步更新</button>
        <button class="btn btn-ghost" onclick="backupAppData('${app.name}', '${app.appId}', this)">&#128190; 备份数据</button>
        <select class="backup-format-select" title="备份格式" onchange="event.stopPropagation()">
          <option value="excel" selected>Excel</option>
          <option value="json">JSON</option>
        </select>
      `;
    } else {
      // 未同步的应用：只显示同步到本地
      actionsHtml = `
        <button class="btn btn-primary" onclick="syncAppToLocal('${app.name}', '${app.appId}', this)">&#11015;&#65039; 同步到本地</button>
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

// ========== 同步应用到本地 ==========
async function syncAppToLocal(appName, appId, btnEl) {
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

  try {
    const res = await fetch(`${SYNC_SERVICE}/sync-app-to-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName, appId })
    });

    const data = await res.json();

    if (data.success) {
      hideSyncModal();
      showToast(`应用【${appName}】同步完成！`, 'success');
      // 刷新页面数据
      setTimeout(() => loadOrgInfo(), 1000);
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
  } catch (error) {
    hideSyncModal();
    showToast(`请求失败：${error.message}`, 'error');
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
    if (statusEl) {
      statusEl.className = 'app-status not-synced';
      statusEl.innerHTML = '&#9675; 未同步';
    }
  }
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

// ========== 弹窗控制 ==========
function showSyncModal(title) {
  const modal = document.getElementById('syncModal');
  document.getElementById('syncModalTitle').textContent = title;
  document.getElementById('progressText').textContent = '正在同步应用配置，请稍候...';
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
