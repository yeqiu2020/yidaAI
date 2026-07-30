/**
 * 本地同步服务 — 路由入口
 * 提供HTTP接口供原型页面调用，实现单个表单同步
 *
 * 启动: node sync_server.js
 * 端口: 默认3457（可通过环境变量 SYNC_SERVICE_PORT 覆盖）
 *
 * Phase 6-2: 拆分为路由入口 + lib/sync-server/ 独立模块
 * - 工具函数 → lib/sync-server/utils.js
 * - 脚本执行器 → lib/sync-server/script-runner.js
 * - 目录操作 → lib/sync-server/dir-ops.js
 * - 配置读取 → lib/sync-server/config-reader.js
 * - 同步操作 → lib/sync-server/sync-ops.js
 * - 组织配置 → lib/sync-server/org-config.js
 *
 * v2.6.1: 新增删除本地应用接口
 * v2.6.0: 新增刷新组织应用信息接口
 * v2.5.0: 新增备份数据接口
 * v2.4.0: 新增8个API端点
 */

// ── Node 内置模块 ──────────────────────────────────────
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const url = require('url');

// ── lib/sync-server 模块（Phase 6-2 拆分）──────────────
const {
  CONFIG_FILE,
  log,
  unescapeMarkdown,
} = require('../../../../lib/sync-server/utils');

const {
  SCRIPTS,
  runScript,
  SKILLS_DIR,
} = require('../../../../lib/sync-server/script-runner');

const {
  findProjectDir,
} = require('../../../../lib/sync-server/dir-ops');

const {
  readSystemConfig,
} = require('../../../../lib/sync-server/config-reader');

const {
  checkFormExists,
  findOrphanFormDirs,
  renameFormDirsIfNeeded,
  cleanupEmptyGroups,
} = require('../../../../lib/sync-server/form-scanner');

const {
  executeSync,
  executeFormListSync,
  generatePrototypePages,
} = require('../../../../lib/sync-server/sync-ops');

const {
  addAppToOrgConfig,
  deleteLocalApp,
} = require('../../../../lib/sync-server/org-config');

// ── 常量 ────────────────────────────────────────────────
const PORT = parseInt(process.env.SYNC_SERVICE_PORT || '3457', 10);
const SERVER_VERSION = '2.6.1';
const PROJECT_ROOT = process.cwd();

// ── HTTP 服务器 ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // 设置CORS头，允许本地文件访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  // 健康检查接口
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      time: new Date().toISOString(),
      version: SERVER_VERSION,
      cwd: process.cwd(),
      script: __filename
    }));
    return;
  }

  // 应用信息接口（支持 GET 带 query 和 POST 带 body）
  if (parsedUrl.pathname === '/app-info') {
    try {
      const payload = {};
      if (parsedUrl.query && parsedUrl.query.projectDir) {
        payload.projectDir = parsedUrl.query.projectDir;
      }

      if (req.method === 'POST') {
        let body = '';
        await new Promise((resolve) => {
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', resolve);
        });
        try {
          const data = JSON.parse(body);
          if (data.pageUrl) payload.pageUrl = data.pageUrl;
          if (data.projectDir) payload.projectDir = data.projectDir;
        } catch (_) {} // Phase 6: 有意忽略空 catch（JSON 解析 fallback）
      }

      const projectDir = findProjectDir(req, payload);
      if (!projectDir) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录' }));
        return;
      }

      const config = readSystemConfig(projectDir);
      if (!config) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: '读取系统配置清单失败' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        appName: config.appName,
        appId: config.appId,
        formCount: config.forms.length
      }));
    } catch (error) {
      log(`处理请求失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 同步应用接口 - 只同步本地没有的新增表单
  if (parsedUrl.pathname === '/sync-app' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const projectDir = findProjectDir(req, data);

        if (!projectDir) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: '无法确定项目目录，请确保系统配置清单.md存在',
            debug: {
              version: SERVER_VERSION,
              cwd: process.cwd(),
              pageUrl: data.pageUrl || '',
              projectDir: data.projectDir || '',
              referer: req.headers.referer || '',
              origin: req.headers.origin || ''
            }
          }));
          return;
        }

        log(`收到同步应用请求: ${projectDir}`, 'yellow');

        // 第一步：从宜搭获取最新表单列表并更新配置文件
        log('正在从宜搭获取最新表单列表...', 'cyan');
        try {
          await executeFormListSync(projectDir);
          log('表单列表已更新', 'green');
        } catch (listError) {
          log(`获取表单列表失败: ${listError.message}`, 'red');
          res.writeHead(500);
          res.end(JSON.stringify({
            success: false,
            error: '从宜搭获取表单列表失败：' + listError.message
          }));
          return;
        }

        // 第二步：读取更新后的系统配置清单
        const config = readSystemConfig(projectDir);
        if (!config || !config.forms || config.forms.length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '系统配置清单中没有表单数据' }));
          return;
        }

        log(`当前配置中共 ${config.forms.length} 个表单`, 'cyan');

        // 第三步：筛选本地不存在的表单
        const newForms = [];
        const existingForms = [];
        for (const form of config.forms) {
          if (checkFormExists(projectDir, form.name, form.type, form.uuid)) {
            existingForms.push(form.name);
          } else {
            newForms.push(form);
          }
        }

        log(`已有表单: ${existingForms.length}个, 新增表单: ${newForms.length}个`, 'cyan');

        // 第三步-B：查找本地多余的表单（宜搭中已删除的）
        const orphanForms = findOrphanFormDirs(projectDir, config.forms);
        log(`本地多余表单: ${orphanForms.length}个`, 'cyan');

        // v2.11.0: 改名检测必须放在 early-return 之前。
        // 否则"仅改名"场景会被误判为"无新增无删除"（错误提示），且因提前返回
        // 缺少 needRefresh 字段导致前端不刷新（目录名已变但菜单未更新）。
        const renamedForms = renameFormDirsIfNeeded(projectDir, config.forms);
        if (renamedForms.length > 0) {
          log(`表单改名: ${renamedForms.length}个`, 'cyan');
        }

        if (newForms.length === 0 && orphanForms.length === 0 && renamedForms.length === 0) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: '所有表单已同步，没有新增或删除的表单',
            appName: config.appName,
            totalForms: config.forms.length,
            existingForms: existingForms.length,
            newForms: 0,
            syncedForms: [],
            deletedForms: [],
            renamedForms: [],
            needRefresh: false,
            details: []
          }));
          return;
        }

        // 第四步：同步新增表单
        const syncedForms = [];
        const failedForms = [];

        for (const form of newForms) {
          try {
            log(`开始同步新增表单: ${form.name}`, 'cyan');
            const result = await executeSync(projectDir, form.name);
            syncedForms.push(form.name);
            log(`同步成功: ${form.name}`, 'green');
          } catch (error) {
            log(`同步失败: ${form.name} - ${error.message}`, 'red');
            failedForms.push({ name: form.name, error: error.message });
          }
        }

        // 第五步：删除本地多余的表单目录
        const deletedForms = [];
        const deleteFailedForms = [];

        for (const orphan of orphanForms) {
          try {
            log(`删除本地多余表单: ${orphan.dirName}`, 'yellow');
            fs.rmSync(orphan.fullPath, { recursive: true, force: true });
            deletedForms.push(orphan.dirName);
            log(`已删除: ${orphan.dirName}`, 'green');
          } catch (error) {
            log(`删除失败: ${orphan.dirName} - ${error.message}`, 'red');
            deleteFailedForms.push({ name: orphan.dirName, error: error.message });
          }
        }

        // v2.11.0: 删除已移除表单后，清理因表单全删而变空的已移除分组目录
        // 与"更新应用"行为一致，避免空分组目录残留（此前缺口）
        cleanupEmptyGroups(projectDir, config.forms);

        // 第五步-B：从字段清单.md中移除已删除的表单章节
        if (deletedForms.length > 0) {
          const fieldListPath = path.join(projectDir, '01需求梳理', '字段清单.md');
          if (fs.existsSync(fieldListPath)) {
            try {
              let fieldListContent = fs.readFileSync(fieldListPath, 'utf-8');
              for (const dirName of deletedForms) {
                const nameMatch = dirName.match(/^(.+?)「/);
                if (nameMatch) {
                  const formName = nameMatch[1];
                  const sectionRegex = new RegExp(
                    `\\n###\\s*\\([^)]*\\)\\s*${formName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}「[^」]*」[\\s\\S]*?(?=\\n###\\s|\\n##\\s|$)`,
                    'g'
                  );
                  fieldListContent = fieldListContent.replace(sectionRegex, '');
                  log(`已从字段清单移除: ${formName}`, 'green');
                }
              }
              fs.writeFileSync(fieldListPath, fieldListContent, 'utf-8');
            } catch (error) {
              log(`更新字段清单失败: ${error.message}`, 'yellow');
            }
          }
        }

        // 第六步：检查并生成原型页面
        let prototypeResult = null;
        try {
          const formListChanged = newForms.length > 0 || deletedForms.length > 0 || renamedForms.length > 0;
          prototypeResult = await generatePrototypePages(projectDir, formListChanged);
          if (prototypeResult && prototypeResult.success && !prototypeResult.skipped) {
            log(`原型页面已生成: ${prototypeResult.message}`, 'green');
          }
        } catch (protoError) {
          log(`原型页面生成出错: ${protoError.message}`, 'yellow');
          prototypeResult = { success: false, skipped: false, error: protoError.message };
        }

        // 构建结果消息
        const parts = [];
        if (syncedForms.length > 0) parts.push(`新增 ${syncedForms.length} 个表单`);
        if (deletedForms.length > 0) parts.push(`删除 ${deletedForms.length} 个本地多余表单`);
        if (renamedForms.length > 0) parts.push(`改名 ${renamedForms.length} 个表单`);
        if (failedForms.length > 0) parts.push(`${failedForms.length} 个同步失败`);
        if (deleteFailedForms.length > 0) parts.push(`${deleteFailedForms.length} 个删除失败`);
        if (prototypeResult && prototypeResult.success && !prototypeResult.skipped) parts.push(`原型页面已自动生成`);
        if (prototypeResult && prototypeResult.error) parts.push(`原型页面生成失败: ${prototypeResult.error}`);

        const needRefresh = syncedForms.length > 0 || deletedForms.length > 0 || renamedForms.length > 0 ||
          (prototypeResult && prototypeResult.success && !prototypeResult.skipped);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: parts.length > 0 ? `同步完成！${parts.join('，')}` : '同步完成',
          appName: config.appName,
          totalForms: config.forms.length,
          existingForms: existingForms.length,
          newForms: newForms.length,
          syncedForms: syncedForms,
          failedForms: failedForms,
          deletedForms: deletedForms,
          deleteFailedForms: deleteFailedForms,
          renamedForms: renamedForms.map(r => r.to),
          prototypeGenerated: prototypeResult ? !prototypeResult.skipped : false,
          needRefresh: needRefresh
        }));

      } catch (error) {
        log(`处理请求失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // 同步表单接口
  if (parsedUrl.pathname === '/sync-form' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const formName = data.formName;

        if (!formName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少表单名称参数' }));
          return;
        }

        const projectDir = findProjectDir(req, data);

        if (!projectDir) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: '无法确定项目目录，请确保系统配置清单.md存在',
            debug: {
              version: SERVER_VERSION,
              cwd: process.cwd(),
              formName: formName || '',
              pageUrl: data.pageUrl || '',
              projectDir: data.projectDir || '',
              referer: req.headers.referer || '',
              origin: req.headers.origin || ''
            }
          }));
          return;
        }

        log(`收到同步请求: ${formName}`, 'yellow');
        const result = await executeSync(projectDir, formName);
        res.writeHead(200);
        res.end(JSON.stringify(result));

      } catch (error) {
        log(`处理请求失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

// ========== 组织门户 API ==========

// POST /refresh-login — 刷新宜搭登录态
if (parsedUrl.pathname === '/refresh-login' && req.method === 'POST') {
    try {
      log('收到刷新登录态请求', 'yellow');
      const loginScript = path.join(SKILLS_DIR, 'api-client', 'scripts', 'login_manager.js');

      if (!fs.existsSync(loginScript)) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: '登录脚本不存在: ' + loginScript }));
        return;
      }

      const child = spawn(process.execPath, [loginScript], {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });

      child.on('error', (error) => {
        log(`刷新登录态失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      });

      child.on('close', (code) => {
        if (code !== 0 && !stdout.includes('✅')) {
          const errorMsg = (stderr || stdout || `退出码: ${code}`).trim();
          log(`刷新登录态失败: ${errorMsg}`, 'red');
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: errorMsg }));
          return;
        }
        // 解析输出中的用户信息（login_manager.js 用 console.error 输出）
        let userName = '';
        const allOutput = stdout + stderr;
        const userMatch = allOutput.match(/loginUser:\s*(.+)/);
        if (userMatch) userName = userMatch[1].trim();
        // 备用：从 "用户: xxx" 格式提取
        if (!userName) {
          const userMatch2 = allOutput.match(/用户:\s*(.+)/);
          if (userMatch2) userName = userMatch2[1].trim();
        }

        log(`刷新登录态成功${userName ? ': ' + userName : ''}`, 'green');
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: '登录态刷新成功',
          userName: userName
        }));
      });
    } catch (error) {
      log(`刷新登录态异常: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

// GET /org-info — 获取组织信息及应用列表
  if (parsedUrl.pathname === '/org-info') {
    try {
      const orgInfoPath = path.join(process.cwd(), '组织及应用信息.md');
      if (!fs.existsSync(orgInfoPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '组织及应用信息.md 不存在' }));
        return;
      }

      const content = fs.readFileSync(orgInfoPath, 'utf-8');
      const orgInfo = {};
      const orgNameMatch = content.match(/\|\s*组织名称\s*\|\s*([^|\n]+)/);
      if (orgNameMatch) orgInfo.orgName = orgNameMatch[1].trim();
      const domainMatch = content.match(/\|\s*域名前缀\s*\|\s*([^|\n]+)/);
      if (domainMatch) orgInfo.domainPrefix = domainMatch[1].trim();
      const fullDomainMatch = content.match(/\|\s*完整域名\s*\|\s*([^|\n]+)/);
      if (fullDomainMatch) orgInfo.fullDomain = fullDomainMatch[1].trim();
      const corpIdMatch = content.match(/\|\s*corpId\s*\|\s*([^|\n]+)/);
      if (corpIdMatch) orgInfo.corpId = corpIdMatch[1].trim();
      const corpNameMatch = content.match(/\|\s*corp名称\s*\|\s*([^|\n]+)/);
      if (corpNameMatch) orgInfo.corpName = corpNameMatch[1].trim();

      const apps = [];
      const knownAppNames = new Set();
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
              const appName = cells[1];
              const appId = unescapeMarkdown(cells[2]);
              const appDir = path.join(process.cwd(), appName);
              const configPath = path.join(appDir, CONFIG_FILE);
              const prototypePath = path.join(appDir, '01需求梳理', '原型页面', 'index.html');
              const isSynced = fs.existsSync(configPath);
              const hasPrototype = fs.existsSync(prototypePath);

              apps.push({
                name: appName,
                appId: appId,
                synced: isSynced,
                hasPrototype: hasPrototype,
                prototypeUrl: hasPrototype ? `http://127.0.0.1:8080/${encodeURIComponent(appName)}/01需求梳理/原型页面/index.html` : null
              });
              knownAppNames.add(appName);
            }
          } else if (!trimmed.startsWith('|')) {
            inAppTable = false;
          }
        }
      }

      // ── 扫描本地项目文件夹，补充未在配置文件中记录的本地应用 ──
      const LOCAL_APP_SYSTEM_DIRS = new Set([
        '.agents', '.cache', '.playwright-browsers', '.playwright-cli', '.trae', '.figma', '.git',
        '.codebuddy', 'lib', 'scripts', 'node_modules', 'temp-file', 'tests',
        '本地操作页面', '★宜搭场景案例库', '★宜搭开发参考文档', 'AI宜搭场景',
      ]);
      try {
        const entries = fs.readdirSync(process.cwd(), { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const dirName = entry.name;
          if (dirName.startsWith('.') || LOCAL_APP_SYSTEM_DIRS.has(dirName)) continue;
          if (knownAppNames.has(dirName)) continue;

          const dirPath = path.join(process.cwd(), dirName);
          const hasSystemConfig = fs.existsSync(path.join(dirPath, '系统配置清单.md'));
          const hasRequirementDir = fs.existsSync(path.join(dirPath, '01需求梳理'));
          const hasReadme = fs.existsSync(path.join(dirPath, 'README.md'));
          const score = (hasSystemConfig ? 1 : 0) + (hasRequirementDir ? 1 : 0) + (hasReadme ? 1 : 0);
          if (score >= 2) {
            const prototypePath = path.join(dirPath, '01需求梳理', '原型页面', 'index.html');
            const hasPrototype = fs.existsSync(prototypePath);
            apps.push({
              name: dirName,
              appId: '待创建',
              synced: false,
              hasPrototype: hasPrototype,
              prototypeUrl: hasPrototype ? `http://127.0.0.1:8080/${encodeURIComponent(dirName)}/01需求梳理/原型页面/index.html` : null
            });
            log(`[org-info] 发现本地未记录应用: ${dirName}`, 'green');
          }
        }
      } catch (scanErr) {
        log(`[org-info] 扫描本地文件夹失败: ${scanErr.message}`, 'yellow');
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        orgInfo,
        apps,
        totalApps: apps.length,
        syncedApps: apps.filter(a => a.synced).length
      }));
    } catch (error) {
      log(`获取组织信息失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // POST /sync-app-to-local — 同步应用到本地
  if (parsedUrl.pathname === '/sync-app-to-local' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName, appId } = data;

        if (!appName || !appId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少应用名称或应用ID' }));
          return;
        }

        log(`收到同步应用到本地请求: ${appName} (${appId})`, 'yellow');

        const projectDir = path.join(process.cwd(), appName);
        const syncScript = SCRIPTS.configSync;

        if (!fs.existsSync(syncScript)) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: '同步脚本不存在: ' + syncScript }));
          return;
        }

        if (!fs.existsSync(projectDir)) {
          fs.mkdirSync(projectDir, { recursive: true });
        }

        log(`执行同步: node ${syncScript} "${projectDir}" "${appId}" "${appName}"`, 'cyan');

        const child = spawn(process.execPath, [syncScript, projectDir, appId, appName], {
          cwd: process.cwd(),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });

        child.on('error', (error) => {
          log(`同步应用失败: ${error.message}`, 'red');
          try {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: error.message }));
          } catch (_) {} // Phase 6: 有意忽略（HTTP 响应可能已发送）
        });

        child.on('close', (code) => {
          // 判断是否有真正致命的错误（而非仅仅是部分表单失败或 warning 级别的 stderr）
          const hasRealError = stderr && /❌|Error|失败:.*\n(?!.*✅)/m.test(stderr);
          const isTotalFailure = code !== 0 && !stdout.includes('✅');

          if (hasRealError || isTotalFailure) {
            const errorMsg = (stderr || stdout || `退出码: ${code}`).toString().trim();
            log(`同步应用失败: ${errorMsg}`, 'red');
            try {
              res.writeHead(500);
              res.end(JSON.stringify({ success: false, error: errorMsg }));
            } catch (_) {} // Phase 6: 有意忽略（HTTP 响应可能已发送）
            return;
          }

          // 即使退出码非零（如部分表单失败），只要有成功记录就视为整体成功
          log(`同步应用成功: ${appName}${code !== 0 ? ' (部分表单同步有警告)' : ''}`, code !== 0 ? 'yellow' : 'green');

          try {
            const serverMgr = path.join(SKILLS_DIR, 'server-manager', 'scripts', 'server_manager.js');
            if (fs.existsSync(serverMgr)) {
              spawn(process.execPath, [serverMgr, 'update-org'], {
                cwd: process.cwd(),
                detached: true,
                stdio: ['ignore', 'ignore', 'ignore'],
                windowsHide: true
              }).unref();
            }
          } catch (_) {} // Phase 6: 有意忽略（子进程分离，非关键操作）

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: `应用【${appName}】同步完成`,
            appName,
            appId
          }));
        });
      } catch (error) {
        log(`处理请求失败: ${error.message}`, 'red');
        try {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: error.message }));
        } catch (_) {} // Phase 6: 有意忽略（HTTP 响应可能已发送）
      }
    });
    return;
  }

  // GET /sync-app-to-local-stream — SSE 流式同步（逐步推送进度）
  if (parsedUrl.pathname === '/sync-app-to-local-stream' && req.method === 'GET') {
      try {
        const appName = parsedUrl.query && parsedUrl.query.appName;
        const appId = parsedUrl.query && parsedUrl.query.appId;

        if (!appName || !appId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少应用名称或应用ID' }));
          return;
        }

        log(`收到流式同步请求: ${appName} (${appId})`, 'yellow');

        // 设置 SSE 响应头
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        // SSE 辅助函数
        const sendSSE = (event, data) => {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        sendSSE('start', { message: `开始同步【${appName}】`, appName, appId });

        const projectDir = path.join(process.cwd(), appName);
        const syncScript = SCRIPTS.configSync;

        if (!fs.existsSync(syncScript)) {
          sendSSE('error', { error: '同步脚本不存在: ' + syncScript });
          res.end();
          return;
        }

        if (!fs.existsSync(projectDir)) {
          fs.mkdirSync(projectDir, { recursive: true });
        }

        const child = spawn(process.execPath, [syncScript, projectDir, appId, appName], {
          cwd: process.cwd(),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let buffer = '';

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        // 逐行解析 stdout，推送进度
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 保留最后不完整的行

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // 解析步骤进度
            const stepMatch = trimmed.match(/\[步骤(\d+)\/(\d+)\](.*)/);
            if (stepMatch) {
              sendSSE('step', {
                step: parseInt(stepMatch[1]),
                totalSteps: parseInt(stepMatch[2]),
                message: stepMatch[3].trim()
              });
              continue;
            }

            // 解析表单同步进度 [1/10] 同步: 表单名
            const formMatch = trimmed.match(/\[(\d+)\/(\d+)\]\s*同步:\s*(.+)/);
            if (formMatch) {
              sendSSE('form-start', {
                current: parseInt(formMatch[1]),
                total: parseInt(formMatch[2]),
                formName: formMatch[3].trim()
              });
              continue;
            }

            // 表单同步成功
            if (trimmed.includes('✅') && trimmed.includes('完成')) {
              sendSSE('form-done', { status: 'success', message: trimmed });
              continue;
            }

            // 表单同步失败
            if (trimmed.includes('❌') && trimmed.includes('失败')) {
              sendSSE('form-done', { status: 'error', message: trimmed });
              continue;
            }

            // 其他重要日志
            if (trimmed.includes('✅') || trimmed.includes('❌') || trimmed.includes('⚠️') || trimmed.includes('📊')) {
              sendSSE('log', { message: trimmed });
            }
          }
        });

        child.stderr.on('data', (chunk) => { stderr += chunk; });

        child.on('error', (error) => {
          log(`流式同步失败: ${error.message}`, 'red');
          sendSSE('error', { error: error.message });
          res.end();
        });

        child.on('close', (code) => {
          // 处理 buffer 中剩余的行
          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.includes('✅') || trimmed.includes('📊')) {
              sendSSE('log', { message: trimmed });
            }
          }

          const hasRealError = stderr && /❌|Error|失败:.*\n(?!.*✅)/m.test(stderr);
          const isTotalFailure = code !== 0 && !stdout.includes('✅');

          if (hasRealError || isTotalFailure) {
            const errorMsg = (stderr || stdout || `退出码: ${code}`).toString().trim();
            log(`流式同步失败: ${errorMsg}`, 'red');
            sendSSE('done', { success: false, error: errorMsg });
          } else {
            log(`流式同步成功: ${appName}`, 'green');
            // 异步更新组织信息
            try {
              const serverMgr = path.join(SKILLS_DIR, 'server-manager', 'scripts', 'server_manager.js');
              if (fs.existsSync(serverMgr)) {
                spawn(process.execPath, [serverMgr, 'update-org'], {
                  cwd: process.cwd(),
                  detached: true,
                  stdio: ['ignore', 'ignore', 'ignore'],
                  windowsHide: true
                }).unref();
              }
            } catch (_) {}
            sendSSE('done', { success: true, message: `应用【${appName}】同步完成`, appName, appId });
          }
          res.end();
        });
      } catch (error) {
        log(`流式同步异常: ${error.message}`, 'red');
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
          res.end();
        } catch (_) {}
      }
    return;
  }

  // POST /backup-app-data — 备份应用数据
  if (parsedUrl.pathname === '/backup-app-data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName, appId, format = 'json' } = data;

        if (!appName || !appId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少应用名称或应用ID' }));
          return;
        }

        if (!['json', 'excel'].includes(format)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '格式参数错误，仅支持 json 或 excel' }));
          return;
        }

        log(`收到备份应用数据请求: ${appName} (${appId}) [${format}]`, 'yellow');

        const backupScript = SCRIPTS.dataBackup;
        if (!fs.existsSync(backupScript)) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: '备份脚本不存在: ' + backupScript }));
          return;
        }

        log(`执行备份: node ${backupScript} "${appId}" "${appName}" "${format}"`, 'cyan');

        const child = spawn(process.execPath, [backupScript, appId, appName, format], {
          cwd: process.cwd(),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });

        child.on('error', (error) => {
          log(`备份应用数据失败: ${error.message}`, 'red');
          try {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: error.message }));
          } catch (_) {} // Phase 6: 有意忽略（HTTP 响应可能已发送）
        });

        child.on('close', (code) => {
          if (code !== 0) {
            const errorMsg = (stderr || stdout || `退出码: ${code}`).toString().trim();
            log(`备份应用数据失败: ${errorMsg}`, 'red');
            try {
              res.writeHead(500);
              res.end(JSON.stringify({ success: false, error: errorMsg }));
            } catch (_) {} // Phase 6: 有意忽略（HTTP 响应可能已发送）
            return;
          }

          log(`备份应用数据成功: ${appName}`, 'green');

          let resultData = {};
          try {
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            if (lastLine && lastLine.startsWith('{')) {
              resultData = JSON.parse(lastLine);
            }
          } catch (_) {} // Phase 6: 有意忽略（JSON 解析 fallback）

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: `应用【${appName}】数据备份完成`,
            appName,
            appId,
            outputDir: resultData.outputDir || null,
            zipPath: resultData.zipPath || null,
            totalRecords: resultData.totalRecords || 0,
            totalForms: resultData.totalForms || 0
          }));
        });
      } catch (error) {
        log(`处理备份请求失败: ${error.message}`, 'red');
        try {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: error.message }));
        } catch (_) {} // Phase 6: 有意忽略（HTTP 响应可能已发送）
      }
    });
    return;
  }

  // POST /delete-local-app — 删除本地应用
  if (parsedUrl.pathname === '/delete-local-app' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { appName, appId } = data;

        if (!appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少应用名称参数' }));
          return;
        }

        log(`收到删除本地应用请求: ${appName} (${appId || '-'})`, 'yellow');
        const result = deleteLocalApp(appName, appId || '待创建');

        if (result.success) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: `应用【${appName}】本地信息已清除`,
            ...result
          }));
        } else {
          res.writeHead(500);
          res.end(JSON.stringify({
            success: false,
            error: '未找到可删除的本地应用信息',
            ...result
          }));
        }
      } catch (error) {
        log(`处理删除请求失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // GET /app-sync-status — 获取所有应用的同步状态
  if (parsedUrl.pathname === '/app-sync-status') {
    try {
      const orgInfoPath = path.join(process.cwd(), '组织及应用信息.md');
      if (!fs.existsSync(orgInfoPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '组织及应用信息.md 不存在' }));
        return;
      }

      const content = fs.readFileSync(orgInfoPath, 'utf-8');
      const apps = [];
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
              const appName = cells[1];
              const appId = unescapeMarkdown(cells[2]);
              const appDir = path.join(process.cwd(), appName);
              const configPath = path.join(appDir, CONFIG_FILE);
              const prototypePath = path.join(appDir, '01需求梳理', '原型页面', 'index.html');
              const isSynced = fs.existsSync(configPath);
              const hasPrototype = fs.existsSync(prototypePath);

              let formCount = 0;
              if (isSynced) {
                try {
                  const config = readSystemConfig(appDir);
                  if (config && config.forms) formCount = config.forms.length;
                } catch (_) {} // Phase 6: 有意忽略（配置读取失败不影响列表展示）
              }

              apps.push({
                name: appName,
                appId: appId,
                synced: isSynced,
                hasPrototype: hasPrototype,
                formCount,
                prototypeUrl: hasPrototype ? `http://127.0.0.1:8080/${encodeURIComponent(appName)}/01需求梳理/原型页面/index.html` : null
              });
            }
          } else if (!trimmed.startsWith('|')) {
            inAppTable = false;
          }
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        apps,
        totalApps: apps.length,
        syncedApps: apps.filter(a => a.synced).length
      }));
    } catch (error) {
      log(`获取同步状态失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // ========== 新增 API 端点 (v2.4.0) ==========

  // POST /sync-config — 同步应用配置
  if (parsedUrl.pathname === '/sync-config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName, appId } = data;
        if (!appName || !appId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appName 或 appId 参数' }));
          return;
        }
        const projectDir = path.join(PROJECT_ROOT, appName);
        const result = await runScript(SCRIPTS.configSync, [projectDir, appId, appName], 120000);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /sync-schema — 同步表单Schema
  if (parsedUrl.pathname === '/sync-schema' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, formUuid, formName, appName } = data;
        if (!appId || !formUuid || !formName || !appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少必要参数 (appId, formUuid, formName, appName)' }));
          return;
        }
        const localJsonPath = path.join(PROJECT_ROOT, appName, '02基础信息', formName, formName + '.json');
        const result = await runScript(SCRIPTS.schemaSync, [appId, formUuid, localJsonPath]);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /sync-rules — 同步业务规则
  if (parsedUrl.pathname === '/sync-rules' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, appName } = data;
        if (!appId || !appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 appName 参数' }));
          return;
        }
        const outputDir = path.join(PROJECT_ROOT, appName);
        const result = await runScript(SCRIPTS.ruleSync, ['--appId', appId, '--output', outputDir]);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /project-sync — 一站式同步
  if (parsedUrl.pathname === '/project-sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, appName } = data;
        if (!appId || !appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 appName 参数' }));
          return;
        }
        const outputDir = path.join(PROJECT_ROOT, appName);
        const result = await runScript(SCRIPTS.projectSync, ['--appId', appId, '--output', outputDir], 300000);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /clean-data — 清空表单数据
  if (parsedUrl.pathname === '/clean-data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, mode, formUuid, appName, confirm, dryRun } = data;
        if (!appId || !mode) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 mode 参数' }));
          return;
        }
        let args;
        if (mode === 'all') {
          args = [appId, '--all'];
          if (appName) args.push('--appName', appName);
        } else if (mode === 'form') {
          if (!formUuid) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'form 模式下缺少 formUuid 参数' }));
            return;
          }
          args = [appId, '--form', formUuid];
          if (appName) args.push('--appName', appName);
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'mode 必须为 all 或 form' }));
          return;
        }
        // 透传删除确认/预览标志：clear-form-data.js 需要 --confirm 才会真正删除，
        // dryRun 优先（仅预览不删除）。
        if (dryRun) {
          args.push('--dry-run');
        } else if (confirm) {
          args.push('--confirm');
        }
        const result = await runScript(SCRIPTS.dataClean, args, 300000);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /generate-system-map — 生成系统图谱
  if (parsedUrl.pathname === '/generate-system-map' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName } = data;
        if (!appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appName 参数' }));
          return;
        }
        const configPath = path.join(PROJECT_ROOT, appName, '系统配置清单.md');
        if (!fs.existsSync(configPath)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '系统配置清单.md 不存在: ' + configPath }));
          return;
        }
        const outputDir = path.join(PROJECT_ROOT, appName, '系统功能图谱');
        const result = await runScript(SCRIPTS.systemMap, [configPath, outputDir]);

        const files = [];
        if (fs.existsSync(outputDir)) {
          const entries = fs.readdirSync(outputDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile()) {
              files.push(entry.name);
            }
          }
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result, files }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /form-settings — 表单设置
  if (parsedUrl.pathname === '/form-settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, formUuid, action, options } = data;
        if (!appId || !formUuid || !action) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId, formUuid 或 action 参数' }));
          return;
        }
        const validActions = ['get-settings', 'set-title', 'list-fields', 'set-restart', 'set-permission'];
        if (!validActions.includes(action)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: `action 必须为: ${validActions.join(', ')}` }));
          return;
        }
        const args = [action, '--app', appId, '--form', formUuid];
        if (options) {
          if (options.title) args.push('--title', options.title);
          if (options.field) args.push('--field', options.field);
          if (options.restart !== undefined) args.push('--restart', String(options.restart));
          if (options.permission) args.push('--permission', options.permission);
        }
        const result = await runScript(SCRIPTS.formSettings, args);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /flow-settings — 流程设置
  if (parsedUrl.pathname === '/flow-settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, formUuid, action, options } = data;
        if (!appId || !action) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 action 参数' }));
          return;
        }
        const validActions = ['list-flow-forms', 'get-settings', 'set-auto-approval'];
        if (!validActions.includes(action)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: `action 必须为: ${validActions.join(', ')}` }));
          return;
        }
        const args = [action, '--app', appId];
        if (formUuid) args.push('--form', formUuid);
        if (options) {
          if (options.autoApproval !== undefined) args.push('--auto-approval', String(options.autoApproval));
        }
        const result = await runScript(SCRIPTS.flowSettings, args);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // GET /app-forms — 获取应用的表单列表
  if (parsedUrl.pathname === '/app-forms' && req.method === 'GET') {
    try {
      const appName = parsedUrl.query && parsedUrl.query.appName;
      if (!appName) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '缺少 appName 参数' }));
        return;
      }
      const configPath = path.join(PROJECT_ROOT, appName, '系统配置清单.md');
      if (!fs.existsSync(configPath)) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, forms: [], message: '未找到系统配置清单，请先同步应用' }));
        return;
      }
      const content = fs.readFileSync(configPath, 'utf-8');
      const forms = [];
      const lines = content.split('\n');
      for (const line of lines) {
        const formMatch = line.match(/\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(FORM-[\w-]+)\s*\|/);
        if (formMatch && formMatch[2] && formMatch[2].startsWith('FORM-')) {
          forms.push({ name: formMatch[1].trim(), formUuid: formMatch[2] });
        }
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, forms }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // GET /local-files — 读取本地文件内容
  if (parsedUrl.pathname === '/local-files' && req.method === 'GET') {
    try {
      const filePath = parsedUrl.query && parsedUrl.query.file;
      if (!filePath) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '缺少 file 参数' }));
        return;
      }
      if (filePath.includes('..')) {
        res.writeHead(403);
        res.end(JSON.stringify({ success: false, error: '路径不允许包含 ..' }));
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      if (!['.md', '.json', '.js'].includes(ext)) {
        res.writeHead(403);
        res.end(JSON.stringify({ success: false, error: '只允许读取 .md, .json, .js 文件' }));
        return;
      }
      const fullPath = path.join(PROJECT_ROOT, filePath);
      if (!fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '文件不存在' }));
        return;
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: content }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // POST /refresh-org-apps — 刷新组织应用列表
  if (parsedUrl.pathname === '/refresh-org-apps' && req.method === 'POST') {
    try {
      const initOrgScript = path.join(SKILLS_DIR, 'org-init', 'scripts', 'init-org.js');
      if (!fs.existsSync(initOrgScript)) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: 'org-init 脚本不存在: ' + initOrgScript }));
        return;
      }

      log('收到刷新应用信息请求，执行 org-init...', 'yellow');
      const result = await runScript(initOrgScript, [], 300000);
      log('应用信息刷新完成', 'green');
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: result }));
    } catch (error) {
      log(`刷新应用信息失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // POST /create-project — 创建新项目
  if (parsedUrl.pathname === '/create-project' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { projectName } = data;
        if (!projectName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 projectName 参数' }));
          return;
        }
        if (!fs.existsSync(SCRIPTS.projectCreator)) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: 'project-creator 脚本不存在' }));
          return;
        }
        const { createProject } = require(SCRIPTS.projectCreator);
        const result = createProject(projectName);
        addAppToOrgConfig(projectName, '待创建');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // POST /save-prompts — 保存常用提示词
  if (parsedUrl.pathname === '/save-prompts' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const promptsFile = path.join(PROJECT_ROOT, '本地操作页面', '常用提示词.json');
        fs.writeFileSync(promptsFile, JSON.stringify(data, null, 2), 'utf-8');
        log(`常用提示词已保存到: ${promptsFile}`, 'green');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: '保存成功' }));
      } catch (error) {
        log(`保存提示词失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // GET /get-prompts — 获取常用提示词
  if (parsedUrl.pathname === '/get-prompts') {
    try {
      const promptsFile = path.join(PROJECT_ROOT, '本地操作页面', '常用提示词.json');
      if (!fs.existsSync(promptsFile)) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: null }));
        return;
      }
      const content = fs.readFileSync(promptsFile, 'utf-8');
      const data = JSON.parse(content);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ success: false, error: '接口不存在' }));
});

// 启动服务器
server.listen(PORT, () => {
  log('='.repeat(60), 'green');
  log('宜搭表单同步服务已启动', 'green');
  log('='.repeat(60), 'green');
  log(`服务地址: http://localhost:${PORT}`, 'cyan');
  log('可用接口:', 'cyan');
  log(`  - GET  http://localhost:${PORT}/health            健康检查`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/app-info          应用信息`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-app          同步应用（只同步新增表单）`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-form         同步单个表单`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/org-info          组织信息及应用列表`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-app-to-local 同步应用到本地`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/app-sync-status   应用同步状态`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-config       同步应用配置`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-schema       同步表单Schema`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-rules        同步业务规则`, 'cyan');
  log(`  - POST http://localhost:${PORT}/project-sync      一站式同步`, 'cyan');
  log(`  - POST http://localhost:${PORT}/clean-data        清空表单数据`, 'cyan');
  log(`  - POST http://localhost:${PORT}/backup-app-data   备份应用数据`, 'cyan');
  log(`  - POST http://localhost:${PORT}/generate-system-map 生成系统图谱`, 'cyan');
  log(`  - POST http://localhost:${PORT}/form-settings     表单设置`, 'cyan');
  log(`  - POST http://localhost:${PORT}/flow-settings     流程设置`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/local-files       读取本地文件`, 'cyan');
  log(`  - POST http://localhost:${PORT}/refresh-org-apps  刷新组织应用信息`, 'cyan');
  log(`  - POST http://localhost:${PORT}/create-project    创建新项目`, 'cyan');
  log('='.repeat(60), 'green');
  log('按 Ctrl+C 停止服务', 'yellow');
  log('='.repeat(60), 'green');
});

// 优雅退出
process.on('SIGINT', () => {
  log('\n正在停止服务...', 'yellow');
  server.close(() => {
    log('服务已停止', 'green');
    process.exit(0);
  });
});
