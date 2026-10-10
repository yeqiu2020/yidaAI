/**
 * 宜搭案例库 - 渲染脚本
 * v1.0.0
 * 负责将 CaseLibraryData 渲染为可视化案例页面
 */

// ========== 全局状态 ==========
let currentCaseIndex = 0;

// ========== 初始化 ==========
function initCaseLibrary() {
  renderCaseNav();
  renderCase(currentCaseIndex);
}

// ========== 渲染案例导航 ==========
function renderCaseNav() {
  const nav = document.getElementById('caseNav');
  if (!nav || !window.CaseLibraryData || window.CaseLibraryData.length === 0) return;

  // 仅当存在多个案例时才显示导航（单个案例时隐藏，避免与标题重复）
  if (window.CaseLibraryData.length <= 1) {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';

  nav.innerHTML = window.CaseLibraryData.map((c, i) => `
    <button class="case-nav-btn ${i === currentCaseIndex ? 'active' : ''}" onclick="switchCase(${i})">
      ${c.name}
    </button>
  `).join('');
}

function switchCase(index) {
  currentCaseIndex = index;
  document.querySelectorAll('.case-nav-btn').forEach((b, i) => b.classList.toggle('active', i === index));
  renderCase(index);
}

// ========== 渲染单个案例 ==========
function renderCase(index) {
  const c = window.CaseLibraryData[index];
  if (!c) return;

  // 统计提示词总数
  const totalSteps = c.buildRoute.reduce((sum, phase) => sum + phase.steps.length, 0);
  const totalPhases = c.buildRoute.length;

  // 头部
  document.getElementById('caseHeader').innerHTML = `
    <div class="case-header-inner">
      <div class="case-header-title">${c.name}</div>
      <div class="case-header-tagline">${c.tagline}</div>
      <div class="case-header-stats">
        <span class="case-stat-chip"><b>${totalPhases}</b> 个阶段</span>
        <span class="case-stat-chip"><b>${totalSteps}</b> 个提示词</span>
        <span class="case-stat-chip badge-parallel">并行优化</span>
      </div>
    </div>
  `;

  // 一、整体业务介绍
  document.getElementById('caseOverview').innerHTML = `
    <div class="case-card">
      <div class="case-card-title"><span class="case-section-num">一</span> 整体业务介绍</div>
      <p class="case-intro">${c.overview.intro}</p>
      <div class="arch-wrap">${c.overview.architectureHtml}</div>
      <div class="case-module-grid">
        ${c.overview.moduleList.map(m => `
          <div class="case-module-card">
            <div class="case-module-icon">${m.icon}</div>
            <div class="case-module-name">${m.name}</div>
            <div class="case-module-desc">${m.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // 二、业务规则与提示词（建造路线）
  document.getElementById('caseBuildRoute').innerHTML = `
    <div class="case-card">
      <div class="case-card-title">
        <span class="case-section-num">二</span> 业务规则与提示词（建造路线）
        <span class="case-legend">
          <span class="legend-tag tag-parallel">⫸ 可并行</span>
          <span class="legend-tag tag-sequential">→ 需按顺序</span>
        </span>
      </div>
      <div class="case-route-tip">
        💡 使用方法：按阶段顺序，将每个步骤的提示词复制粘贴给 AI 执行。<b>可并行</b>的步骤可以同时发给 AI 缩短时间；
        <b>需按顺序</b>的步骤必须等前一步完成后再执行（后一步依赖前一步的表单/数据）。
      </div>
      ${c.buildRoute.map((phase, pi) => renderPhase(phase, pi + 1)).join('')}
    </div>
  `;

  // 三、测试与模拟数据
  document.getElementById('caseTesting').innerHTML = `
    <div class="case-card">
      <div class="case-card-title"><span class="case-section-num">三</span> 测试与模拟数据</div>
      <div class="case-route-tip">${c.testing.parallelNote}</div>
      <div class="case-test-grid">
        ${c.testing.steps.map((t, i) => `
          <div class="case-test-card">
            <div class="case-test-index">${i + 1}</div>
            <div class="case-test-name">${t.name}</div>
            <div class="case-test-prompt">
              <span class="prompt-text" onclick="copyPromptText(this)" title="点击复制">${t.prompt}</span>
            </div>
            <div class="case-test-method"><b>验证方式：</b>${t.method}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ========== 渲染单个阶段 ==========
function renderPhase(phase, phaseNum) {
  const modeBadge = phase.parallel
    ? '<span class="phase-mode phase-parallel">⫸ 本阶段可并行</span>'
    : '<span class="phase-mode phase-sequential">→ 本阶段需按顺序</span>';

  const stepsHtml = phase.steps.map((step, si) => {
    const stepMode = phase.parallel
      ? '<span class="step-mode step-parallel" title="可与其他步骤并行执行" onclick="event.stopPropagation()">⫸ 并行</span>'
      : '<span class="step-mode step-sequential" title="需按顺序执行">→ 顺序</span>';
    return `
      <div class="case-step">
        <div class="case-step-head">
          <span class="case-step-num">${phaseNum}.${si + 1}</span>
          <span class="case-step-name">${step.name}</span>
          ${stepMode}
        </div>
        ${step.skill ? `<div class="case-step-skill">🎯 技能：${step.skill}</div>` : ''}
        ${step.note ? `<div class="case-step-note">💬 ${step.note}</div>` : ''}
        <div class="case-step-prompt">
          <span class="prompt-text" onclick="copyPromptText(this)" title="点击复制到剪贴板">${step.prompt}</span>
          <button class="copy-btn" onclick="copyPromptText(this.parentElement.querySelector('.prompt-text'))">复制</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="case-phase">
      <div class="case-phase-header">
        <div class="case-phase-title">阶段 ${phaseNum}：${phase.name}</div>
        ${modeBadge}
      </div>
      <p class="case-phase-desc">${phase.desc}</p>
      <div class="case-steps">${stepsHtml}</div>
    </div>
  `;
}

// ========== 复制提示词 ==========
function copyPromptText(el) {
  const text = el.textContent.trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('已复制到剪贴板', 'success');
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('已复制到剪贴板', 'success'); } catch (_) { showToast('复制失败', 'error'); }
  document.body.removeChild(ta);
}