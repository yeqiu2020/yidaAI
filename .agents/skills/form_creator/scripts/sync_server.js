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
 * v3.3.0: 修复单项目布局下「进入应用」404 — org-info 的 prototypeUrl 原先无条件按
 *         多项目格式拼 /{项目名}/{应用名}/，而 server_manager v3.4.0 staticRoot 有效性
 *         校验对"资料目录型父目录"（合法项目占比<50%）回退单项目形态（staticRoot=项目根、
 *         8080 URL 不带项目段），链接指向不存在的项目段目录（2026-10-14 实测）。
 *         新增 buildEntryUrlBase：按「项目目录相对静态根的路径段」生成 URL 前缀，
 *         单项目布局 → 无项目段；多项目布局 → /{项目名}。同步修复前端 dashboard.js v1.10.2。
 * v3.2.9: /health 新增 projectVersion 字段 — 项目版本唯一真相源 package.json（与 git tag 对应），本地操作页面状态检查同步展示
 * v3.2.0: 【重构】/sync-form-actions 改为服务端内联实现（lib/sync-server/action-code-sync.js），
 *         不再 spawn 子进程 — 消除动作代码同步唯一的子进程链路（关联两次 IDE 卡死事故排查）；
 *         executeSync 全端点加 90s 子进程超时兜底（sync-ops.js）
 * v3.1.0: 新增 /sync-form-actions 接口 — 只同步单个表单的动作代码到「代码」文件夹
 *         （executeSync 支持 options.actionsOnly，传 --actions-only 给 sync_single_form.js）
 * v3.0.9: 修复单项目模式（服务在项目根内启动，staticRoot==项目根）下
 *         resolveProjectDir 误报「传入的 projectDir 无效」并放弃解析的问题；
 *         漏改文件：lib/sync-server/dir-ops.js
 * v2.9.0: 新增 /restart-service 重启服务接口（重启到当前项目目录）
 * v2.8.1: /org-info 接口返回 projectDir（服务启动目录），供前端显示目录徽标
 * v2.6.1: 新增删除本地应用接口
 * v2.6.0: 新增刷新组织应用信息接口
 * v2.5.0: 新增备份数据接口
 * v2.4.0: 新增8个API端点
 */

// ── Node 内置模块 ──────────────────────────────────────
const http = require('http');
const { createSecurity } = require('../../../../lib/local-service/security');
const { safeFile } = require('../../../../lib/local-service/paths');
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
  resolveProjectDir,
  hasOrgConfig,
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

// v3.2.0: 动作代码同步内联实现（不再 spawn 子进程，消除 /sync-form-actions 的子进程链路）
const { syncFormActionCode } = require('../../../../lib/sync-server/action-code-sync');
// v3.2.2: 动作代码推送（本地版本 → 宜搭）与版本列表
const { pushActionCode, listActionCodeVersions } = require('../../../../lib/sync-server/action-code-sync');

// ── 常量 ────────────────────────────────────────────────
const PORT = parseInt(process.env.SYNC_SERVICE_PORT || '3457', 10);
const SERVER_VERSION = '3.4.1'; // v3.4.1: 新增 GET /backup-progress 备份进度查询（配合 backup-app-data.js v1.7.0 的 _progress.json）
// 项目版本（唯一真相源 = package.json 的 version 字段，与 git tag vX.Y.Z 对应）
let PROJECT_VERSION = '未知';
try { PROJECT_VERSION = require('../../../../package.json').version || '未知'; } catch (e) { /* 读取失败保持"未知" */ }
// v3.0.0 多组织并存：
//  单项目模式 cwd=项目目录（PROJECT_ROOT=项目根，与旧版一致）
//  多项目模式 cwd=公共父目录（静态根 staticRoot=process.cwd()，项目目录是其子目录）
//  因此 PROCESS_ROOT 不再作为唯一根使用，所有按请求解析项目目录。
const STATIC_ROOT = process.cwd();

// v3.3.0: 应用入口 URL 前缀——按「项目目录相对静态根的路径段」生成，与 server_manager
// v3.4.0 staticRoot 有效性校验对齐：
//   多项目布局（projectDir = STATIC_ROOT/{项目名}）→ http://127.0.0.1:8080/{项目名}
//   单项目布局（projectDir == STATIC_ROOT）        → http://127.0.0.1:8080（无项目段）
function buildEntryUrlBase(projectDir) {
  const resolved = path.resolve(projectDir || STATIC_ROOT);
  const rel = path.relative(path.resolve(STATIC_ROOT), resolved);
  const seg = (!rel || rel === '.') ? '' : `/${encodeURIComponent(path.basename(resolved))}`;
  return `http://127.0.0.1:8080${seg}`;
}

// ── HTTP 服务器 ─────────────────────────────────────────
function createSyncServer(options = {}) {
const STATIC_ROOT = path.resolve(options.staticRoot || process.cwd());
const protectRequest = createSecurity(options);
return http.createServer(async (req, res) => {
  if (protectRequest(req, res)) return;
  req.setEncoding('utf8'); // StringDecoder preserves Chinese split across HTTP chunks.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const parsedUrl = url.parse(req.url, true);

  // 健康检查接口
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      securityPatch: 'enabled',
      bindAddress: '127.0.0.1',
      tokenRequired: true,
      time: new Date().toISOString(),
      version: SERVER_VERSION,
      projectVersion: PROJECT_VERSION,
      // v3.0.0: staticRoot = 服务根（多项目=公共父目录；单项目=项目目录），
      // server_manager 用它判断当前 3457 是否已是"多项目全局服务"以决定复用/重启。
      staticRoot: STATIC_ROOT,
      cwd: process.cwd(),
      script: __filename
    }));
    return;
  }

  // GET /backup-progress — 备份进度查询（v3.4.1）
  // backup-app-data.js v1.7.0 备份期间把进度写入 <项目>/<应用名>/03项目交付物/数据备份/_progress.json，
  // 页面轮询本接口实现实时进度；备份结束脚本自动删除该文件（found=false = 当前没有进行中的备份）
  if (parsedUrl.pathname === '/backup-progress' && req.method === 'GET') {
    const appName = String((parsedUrl.query && parsedUrl.query.appName) || '').trim();
    const projectDirHost = resolveProjectDir(req, {
      projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
      staticRoot: STATIC_ROOT
    });
    if (!appName || appName === '.' || appName === '..' || /[\\/:*?"<>|]/.test(appName) || !projectDirHost) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: '参数错误' }));
      return;
    }
    const progressFile = path.join(projectDirHost, appName, '03项目交付物', '数据备份', '_progress.json');
    try {
      const raw = fs.readFileSync(progressFile, 'utf8');
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, found: true, progress: JSON.parse(raw) }));
    } catch (_) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, found: false }));
    }
    return;
  }

  // 重启服务接口：重启 HTTP + 同步服务（到服务根 staticRoot）
  // 实现：spawn 独立 server_manager restart 进程后立即退出，由新进程接管端口
  if (parsedUrl.pathname === '/restart-service') {
    res.writeHead(200);
    // v3.0.0: 多项目模式下重启全局服务（不再重启到单一项目）
    const projectDir = resolveProjectDir(req, {
      projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
      staticRoot: STATIC_ROOT
    });
    res.end(JSON.stringify({
      success: true,
      message: '服务正在重启，页面将自动刷新',
      restarting: true,
      staticRoot: STATIC_ROOT,
      projectDir: projectDir || process.cwd()
    }));
    log('🔄 收到重启服务请求，启动 restart-agent...', 'yellow');
    try {
      // server_manager 位于项目目录 .agents 下；多项目模式下用任意项目副本重启全局服务即可
      const mgrDir = projectDir || STATIC_ROOT;
      const restartAgent = path.join(mgrDir, '.workbuddy-ai', 'run', 'restart-agent.js');

      // 【2026-10-17 修复】restartAll() 的 stopAll() 会执行
      //   taskkill /PID <同步服务PID> /F /T
      // 而旧实现 spawn 的 server_manager restart 正是同步服务的**子进程** → /T 把它一起杀掉：
      // 8080 已停、3457 已停，restart 再也走不到 startAll，两个服务全挂
      // （页面「🔄 重启服务」按钮一点就把服务打死的根因）。
      // 现在改为 spawn restart-agent.js：它不执行 stopAll，只杀 8080（自己不是 8080 的后代），
      // 然后跑 server_manager start。同步服务自己退出，永远不会"自己杀自己"。
      if (fs.existsSync(restartAgent)) {
        const child = spawn(process.execPath, [restartAgent, mgrDir], {
          cwd: mgrDir,
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
      } else {
        // 兜底：旧行为（restart-agent 缺失时仍可尝试，但可能被 /T 连带杀死）
        const serverManagerPath = path.join(mgrDir, '.agents', 'skills', 'server-manager', 'scripts', 'server_manager.js');
        const child = spawn(process.execPath, [serverManagerPath, 'restart', mgrDir], {
          cwd: STATIC_ROOT,
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
      }
      // 给响应 1 秒时间发送完毕，然后让当前进程退出（端口将由重启后的新进程接管）
      setTimeout(() => {
        log('🔄 同步服务进程退出，等待重启完成...', 'yellow');
        process.exit(0);
      }, 1000);
    } catch (err) {
      log(`❌ 重启服务失败: ${err.message}`, 'red');
    }
    return;
  }

  // 确保服务运行接口（2026-10-17 新增）
  // 只「启动」不「停止」，供 AI/脚本在 3457 还活着时把掉线的 8080 拉起来。
  // 关键前提：同步服务本身运行在 AI 宿主进程树之外（孤儿进程），它 spawn 的子进程同样常驻，
  // 不受宿主命令 Job Object 回收影响 —— 这是冷启动唯一不依赖系统弹窗的通道。
  if (parsedUrl.pathname === '/ensure-service') {
    const projectDir = resolveProjectDir(req, {
      projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
      staticRoot: STATIC_ROOT
    });
    const mgrDir = projectDir || STATIC_ROOT;
    const serverManagerPath = path.join(mgrDir, '.agents', 'skills', 'server-manager', 'scripts', 'server_manager.js');
    let spawned = false;
    let errMsg = '';
    try {
      const child = spawn(process.execPath, [serverManagerPath, 'start'], {
        cwd: mgrDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
      spawned = true;
    } catch (e) {
      errMsg = e.message;
      log(`❌ ensure-service 启动失败: ${e.message}`, 'red');
    }
    res.writeHead(200);
    res.end(JSON.stringify({
      success: spawned,
      message: spawned ? '正在启动服务' : '启动失败: ' + errMsg,
      projectDir: mgrDir
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

  // POST /sync-form-actions — 只同步单个表单的动作代码（不更新字段/组件清单/原型页）
  // v3.1.0: 供原型页面"同步动作代码"按钮调用
  if (parsedUrl.pathname === '/sync-form-actions' && req.method === 'POST') {
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
            error: '无法确定项目目录，请确保系统配置清单.md存在'
          }));
          return;
        }

        log(`收到动作代码同步请求: ${formName}`, 'yellow');
        // v3.2.0: 内联实现（读配置→读Cookie→直调宜搭API→落盘），不再 spawn 子进程
        const result = await syncFormActionCode({ projectDir, formName });
        res.writeHead(200);
        res.end(JSON.stringify(result));

      } catch (error) {
        log(`处理动作代码同步请求失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // v3.2.2: GET /form-actions-versions — 列出表单「代码」文件夹下的版本文件（推送前选择用）
  if (parsedUrl.pathname === '/form-actions-versions' && req.method === 'GET') {
    try {
      const data = {
        formName: parsedUrl.query.formName || undefined,
        projectDir: parsedUrl.query.projectDir || undefined,
        // v3.2.3: pageUrl 透传给 findProjectDir（多项目环境下精确定位当前项目的应用目录，
        // 防止兜底扫描命中旧版本项目的同名应用，如 V1.6.4）
        pageUrl: parsedUrl.query.pageUrl || undefined
      };
      const formName = data.formName;
      if (!formName) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '缺少表单名称参数' }));
        return;
      }
      const projectDir = findProjectDir(req, data);
      if (!projectDir) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录' }));
        return;
      }
      const result = listActionCodeVersions(projectDir, formName);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (error) {
      log(`列出动作代码版本失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // v4.0.0: POST /push-form-actions — 推送本地代码版本到宜搭（安全流程：备份→语法校验→替换actions；
  //         scope='all' 时追加推送配置.json 的事件绑定/数据源/公式/校验 + actions.list 重建 + 回读验证）
  if (parsedUrl.pathname === '/push-form-actions' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const formName = data.formName;
        const fileName = data.fileName;

        if (!formName || !fileName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少表单名称或文件名参数' }));
          return;
        }

        const projectDir = findProjectDir(req, data);
        if (!projectDir) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录' }));
          return;
        }

        // v4.0.0: scope='all' 一键全量推送（动作代码 + 推送配置.json 的事件绑定/数据源/公式/校验）
        const scope = data.scope === 'all' ? 'all' : 'code';

        log(`收到动作代码推送请求: ${formName} ← ${fileName}${scope === 'all' ? '（全量：代码+绑定+数据源+公式+校验）' : ''}`, 'yellow');
        const result = await pushActionCode({ projectDir, formName, fileName, scope });
        if (result.success) {
          const extra = [];
          if (result.backupFile) extra.push('代码备份: ' + result.backupFile);
          if (result.schemaBackupFile) extra.push('Schema备份: ' + result.schemaBackupFile);
          if (result.config && result.config.found) {
            extra.push(`绑定+${result.config.bindings.added} 数据源+${result.config.dataSources.added + result.config.dataSources.updated} 公式${result.config.formulas.applied} 校验${result.config.validations.applied}`);
          }
          if (result.verify && !result.verify.ok) extra.push('回读异常: ' + result.verify.failures.join('；'));
          log(`推送成功: ${formName}${extra.length ? '（' + extra.join('，') + '）' : ''}`, 'green');
        } else {
          log(`动作代码推送失败: ${result.error}`, 'red');
        }
        res.writeHead(200);
        res.end(JSON.stringify(result));

      } catch (error) {
        log(`处理动作代码推送请求失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

// ========== 组织门户 API ==========

// GET /refresh-login — 刷新宜搭登录态（SSE 流式，供前端弹窗展示执行过程）
if (parsedUrl.pathname === '/refresh-login' && req.method === 'GET') {
    try {
      log('收到刷新登录态请求（流式）', 'yellow');
      const loginScript = path.join(SKILLS_DIR, 'api-client', 'scripts', 'login_manager.js');

      if (!fs.existsSync(loginScript)) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: '登录脚本不存在: ' + loginScript }));
        return;
      }

      const sendSSE = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // retry:0 表示连接断开后不自动重连，避免重复触发登录流程
      res.write('retry: 0\n\n');
      sendSSE('start', { message: '正在启动登录态刷新...' });

      // v3.0.2 多项目隔离：登录/Cookie 必须写入目标项目目录
      const projectDirHost = resolveProjectDir(req, {
        projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
        staticRoot: STATIC_ROOT
      }) || STATIC_ROOT;

      // v3.2.1: 登录组织校验 — 期望组织取项目历史 Cookie 的 base_url（上次正确登录的组织）。
      // 防止登录落到其他组织（如用户钉钉记忆的默认组织），导致所有同步报"登录已失效"
      let expectedBaseUrl = '';
      try {
        const histCookiePath = path.join(projectDirHost, '.cookies.json');
        if (fs.existsSync(histCookiePath)) {
          const hist = JSON.parse(fs.readFileSync(histCookiePath, 'utf-8'));
          if (hist && hist.base_url) {
            expectedBaseUrl = String(hist.base_url).replace(/\/$/, '');
          }
        }
      } catch (e) {
        log(`读取历史登录组织失败（跳过组织校验）: ${e.message}`, 'yellow');
      }

      // 心跳：防止代理/浏览器在长时间等待（如扫码）时断开连接
      const heartbeat = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
      }, 15000);

      const child = spawn(process.execPath, [loginScript], {
        cwd: projectDirHost,
        env: {
          ...process.env,
          YIDA_PROJECT_ROOT: projectDirHost,
          // v3.2.1: 传入期望组织域名，login_manager 登录后校验并引导切换
          ...(expectedBaseUrl ? { YIDA_EXPECTED_BASE_URL: expectedBaseUrl } : {})
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let buffer = '';
      let fullOutput = '';
      const classify = (line) => {
        if (line.includes('❌') || line.includes('失败') || line.includes('错误') || line.includes('已失效') || line.includes('超时')) return 'error';
        if (line.includes('✅') || line.includes('成功') || line.includes('已保存') || line.includes('已验证')) return 'success';
        if (line.includes('⚠️') || line.includes('请') || line.includes('等待') || line.includes('步骤') || line.includes('尝试')) return 'warn';
        return 'info';
      };
      const flush = (text) => {
        fullOutput += text;
        buffer += text;
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';
        for (const raw of parts) {
          const line = raw.replace(/\r$/, '').trim();
          if (!line) continue;
          // 跳过 login_manager 末尾的 JSON 结果转储，保持弹窗整洁
          if (/^\s*[{"]/.test(line) || /^\s*"[a-zA-Z_]+"\s*:/.test(line)) continue;
          sendSSE('log', { message: line, type: classify(line) });
        }
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', flush);
      child.stderr.on('data', flush);

      const cleanup = () => { try { clearInterval(heartbeat); } catch (e) {} };

      child.on('error', (error) => {
        cleanup();
        log(`刷新登录态失败: ${error.message}`, 'red');
        sendSSE('error', { error: error.message });
        res.end();
      });

      child.on('close', (code) => {
        cleanup();
        if (buffer.trim()) sendSSE('log', { message: buffer.trim(), type: 'info' });
        const success = code === 0 || fullOutput.includes('✅');
        let userName = '';
        const m = fullOutput.match(/(?:loginUser:|login_user:|用户:|userName:|user_name:)\s*([^\n,]+)/);
        if (m) userName = m[1].trim();
        log(`刷新登录态${success ? '成功' : '失败'}${userName ? ': ' + userName : ''}`, success ? 'green' : 'red');
        sendSSE('done', { success, userName });
        res.end();
      });

      // 客户端断开（如关闭页面）时终止子进程，避免遗留孤儿登录进程
      req.on('close', () => {
        try { child.kill('SIGTERM'); } catch (e) {}
      });
    } catch (error) {
      log(`刷新登录态异常: ${error.message}`, 'red');
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      } else {
        try { res.end(); } catch (e) {}
      }
    }
    return;
  }

// GET /org-info — 获取组织信息及应用列表
  if (parsedUrl.pathname === '/org-info') {
    try {
      const projectDir = resolveProjectDir(req, {
        projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
        staticRoot: STATIC_ROOT
      });
      if (!projectDir) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
        return;
      }
      const orgInfoPath = path.join(projectDir, '组织及应用信息.md');
      if (!fs.existsSync(orgInfoPath)) {
        // v3.0.1: 未初始化时返回空组织信息，让前端显示"初始化组织信息"按钮
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          orgInfo: {},
          apps: [],
          totalApps: 0,
          syncedApps: 0,
          projectDir: projectDir
        }));
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
              const appDir = path.join(projectDir, appName);
              const configPath = path.join(appDir, CONFIG_FILE);
              const prototypePath = path.join(appDir, '01需求梳理', '原型页面', 'index.html');
              const isSynced = fs.existsSync(configPath);
              const hasPrototype = fs.existsSync(prototypePath);

              apps.push({
                name: appName,
                appId: appId,
                synced: isSynced,
                hasPrototype: hasPrototype,
                prototypeUrl: hasPrototype ? `${buildEntryUrlBase(projectDir)}/${encodeURIComponent(appName)}/01需求梳理/原型页面/index.html` : null
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
        const entries = fs.readdirSync(projectDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const dirName = entry.name;
          if (dirName.startsWith('.') || LOCAL_APP_SYSTEM_DIRS.has(dirName)) continue;
          if (knownAppNames.has(dirName)) continue;

          const dirPath = path.join(projectDir, dirName);
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
              prototypeUrl: hasPrototype ? `${buildEntryUrlBase(projectDir)}/${encodeURIComponent(dirName)}/01需求梳理/原型页面/index.html` : null
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
        syncedApps: apps.filter(a => a.synced).length,
        // v2.8.1: 返回服务启动目录，供前端显示"当前服务来自哪个文件夹"
        projectDir: projectDir
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

        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const projectDir = path.join(projectDirHost, appName);
        // 防根因回归（v3.0.4）：目标目录必须叠加应用名，禁止把内容直接写入项目根。
        // 历史事故：应用名未参与目标路径时，表单分组被平铺到项目根目录（如 V2.0.29 根）。
        if (!appName || path.basename(projectDir) !== appName) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: `同步目标目录定位失败：应用「${appName}」未叠加到项目子目录，已拦截，避免表单分组再次平铺到项目根目录。`
          }));
          return;
        }
        // 显式保证不会直接写项目根（即使 appName 解析异常也兜底）
        if (projectDir !== path.join(projectDirHost, appName)) {
          // 理论上不会进入（path.join 结果唯一），此处防御 appName 含路径分隔符等异常
          return res.end(JSON.stringify({ success: false, error: '同步目标目录异常，已中止。' }));
        }
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
          cwd: projectDirHost,
          env: { ...process.env, YIDA_PROJECT_ROOT: projectDirHost },
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
              spawn(process.execPath, [serverMgr, 'update-org', projectDirHost], {
                cwd: projectDirHost,
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

        const projectDirHost = resolveProjectDir(req, {
          projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
          staticRoot: STATIC_ROOT
        });
        if (!projectDirHost) {
          try { sendSSE('error', { error: '无法确定项目目录，请检查访问路径' }); res.end(); } catch (_) {}
          return;
        }

        // 设置 SSE 响应头
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',

        });

        // SSE 辅助函数
        const sendSSE = (event, data) => {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        sendSSE('start', { message: `开始同步【${appName}】`, appName, appId });

        const projectDir = path.join(projectDirHost, appName);
        // 防根因回归（v3.0.4）：目标目录必须叠加应用名，禁止把内容直接写入项目根。
        // 历史事故：应用名未参与目标路径时，表单分组被平铺到项目根目录（如 V2.0.29 根）。
        if (!appName || path.basename(projectDir) !== appName) {
          try { sendSSE('error', { error: `同步目标目录定位失败：应用「${appName}」未叠加到项目子目录，已拦截，避免表单分组再次平铺到项目根目录。` }); res.end(); } catch (_) {}
          return;
        }
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
          cwd: projectDirHost,
          env: { ...process.env, YIDA_PROJECT_ROOT: projectDirHost },
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
                spawn(process.execPath, [serverMgr, 'update-org', projectDirHost], {
                  cwd: projectDirHost,
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

        // v3.0.4: forms 为表单 UUID 数组（部分备份模式）；空/缺省 = 全量备份
        let selectedForms = null;
        if (Array.isArray(data.forms) && data.forms.length > 0) {
          if (!data.forms.every(u => typeof u === 'string' && /^FORM-[\w-]+$/.test(u))) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'forms 参数格式错误，应为表单 UUID 数组' }));
            return;
          }
          selectedForms = data.forms;
        }

        log(`收到备份应用数据请求: ${appName} (${appId}) [${format}]${selectedForms ? ` [指定 ${selectedForms.length} 个表单]` : ' [全部表单]'}`, 'yellow');

        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }

        const backupScript = SCRIPTS.dataBackup;
        if (!fs.existsSync(backupScript)) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: '备份脚本不存在: ' + backupScript }));
          return;
        }

        const spawnArgs = [backupScript, appId, appName, format];
        if (selectedForms) {
          spawnArgs.push(`--forms=${selectedForms.join('|')}`);
        }
        log(`执行备份: node ${backupScript} "${appId}" "${appName}" "${format}"${selectedForms ? ` --forms=${selectedForms.length}个` : ''}`, 'cyan');

        const child = spawn(process.execPath, spawnArgs, {
          cwd: projectDirHost,
          env: { ...process.env, YIDA_PROJECT_ROOT: projectDirHost },
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
            totalForms: resultData.totalForms || 0,
            backupMode: resultData.backupMode || 'all',
            // v3.4.1: 透传 backup-app-data.js v1.7.0 的部分成功状态
            partial: resultData.partial || false,
            warnings: Array.isArray(resultData.warnings) ? resultData.warnings : [],
            keptDir: resultData.keptDir || null
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const result = deleteLocalApp(projectDirHost, appName, appId || '待创建');

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
      const projectDirHost = resolveProjectDir(req, {
        projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
        staticRoot: STATIC_ROOT
      });
      if (!projectDirHost) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
        return;
      }
      const orgInfoPath = path.join(projectDirHost, '组织及应用信息.md');
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
              const appDir = path.join(projectDirHost, appName);
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
                prototypeUrl: hasPrototype ? `${buildEntryUrlBase(projectDirHost)}/${encodeURIComponent(appName)}/01需求梳理/原型页面/index.html` : null
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const projectDir = path.join(projectDirHost, appName);
        // 防根因回归（v3.0.4）：目标目录必须叠加应用名，禁止把内容直接写入项目根
        if (!appName || path.basename(projectDir) !== appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: `同步目标目录定位失败：应用「${appName}」未叠加到项目子目录，已拦截，避免表单分组再次平铺到项目根目录。` }));
          return;
        }
        const result = await runScript(SCRIPTS.configSync, [projectDir, appId, appName], 120000, projectDirHost);
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const localJsonPath = path.join(projectDirHost, appName, '02基础信息', formName, formName + '.json');
        const result = await runScript(SCRIPTS.schemaSync, [appId, formUuid, localJsonPath], 60000, projectDirHost);
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const outputDir = path.join(projectDirHost, appName);
        const result = await runScript(SCRIPTS.ruleSync, ['--appId', appId, '--output', outputDir], 60000, projectDirHost);
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const outputDir = path.join(projectDirHost, appName);
        const result = await runScript(SCRIPTS.projectSync, ['--appId', appId, '--output', outputDir], 300000, projectDirHost);
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const result = await runScript(SCRIPTS.dataClean, args, 300000, projectDirHost);
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const configPath = path.join(projectDirHost, appName, '系统配置清单.md');
        if (!fs.existsSync(configPath)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '系统配置清单.md 不存在: ' + configPath }));
          return;
        }
        const outputDir = path.join(projectDirHost, appName, '系统功能图谱');
        const result = await runScript(SCRIPTS.systemMap, [configPath, outputDir], 60000, projectDirHost);

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
        // v3.0.2 多项目隔离：必须传项目目录（cwd + YIDA_PROJECT_ROOT），否则脚本
        // 内部 __dirname 回溯指向宿主项目，Cookie/组织信息读写串目录
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const result = await runScript(SCRIPTS.formSettings, args, 60000, projectDirHost);
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
        // v3.0.2 多项目隔离：必须传项目目录（cwd + YIDA_PROJECT_ROOT），否则脚本
        // 内部 __dirname 回溯指向宿主项目，Cookie/组织信息读写串目录
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const result = await runScript(SCRIPTS.flowSettings, args, 60000, projectDirHost);
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
      const projectDirHost = resolveProjectDir(req, {
        projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
        staticRoot: STATIC_ROOT
      });
      if (!projectDirHost) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
        return;
      }
      const configPath = path.join(projectDirHost, appName, '系统配置清单.md');
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
      const projectDirHost = resolveProjectDir(req, {
        projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
        staticRoot: STATIC_ROOT
      });
      if (!projectDirHost) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
        return;
      }
      const fullPath = safeFile(projectDirHost, filePath, ['.md', '.json', '.js']);
      if (!fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '文件不存在' }));
        return;
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stat = fs.statSync(fullPath);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: content, mtime: stat.mtimeMs }));
    } catch (error) {
      res.writeHead(error.statusCode || 500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // POST /local-files — 写入本地文件内容（供「生成清单」页面编辑后回写 .md 源文件）
  // 设计：
  //   - 三个 .md 是唯一事实源，页面为视图层。写入采用「锚点区间替换」的指导思想，
  //     由前端重建目标表格区间，服务端负责安全写盘。
  //   - 冲突检测：前端提交 expectedMtime（读取时的 mtimeMs），若文件被外部修改则拒绝，避免覆盖。
  //   - 自动备份：写前备份为 <file>.bak.<timestamp>，并保留最近 N 份。
  // 安全：路径不允许 .. ，扩展名仅允许 .md / .json / .js。
  if (parsedUrl.pathname === '/local-files' && req.method === 'POST') {
    try {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', resolve);
      });
      const payload = JSON.parse(body || '{}');
      const filePath = (payload.file || '').trim();
      const content = payload.content;
      const expectedMtime = payload.expectedMtime;

      if (!filePath) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '缺少 file 参数' }));
        return;
      }
      if (typeof content !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '缺少 content 参数' }));
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
        res.end(JSON.stringify({ success: false, error: '只允许写入 .md, .json, .js 文件' }));
        return;
      }
      const projectDirHost = resolveProjectDir(req, { projectDir: payload.projectDir, pageUrl: payload.pageUrl, staticRoot: STATIC_ROOT });
      if (!projectDirHost) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
        return;
      }
      const fullPath = safeFile(projectDirHost, filePath, ['.md', '.json', '.js']);
      if (!fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '文件不存在: ' + filePath }));
        return;
      }

      // 冲突检测：若前端提供了 expectedMtime，且与当前文件 mtime 不一致，说明文件被外部修改
      const currentStat = fs.statSync(fullPath);
      if (typeof expectedMtime === 'number' && Math.abs(currentStat.mtimeMs - expectedMtime) > 1) {
        res.writeHead(409);
        res.end(JSON.stringify({
          success: false,
          error: '文件已被外部修改，请刷新页面后重试（避免覆盖他人改动）',
          currentMtime: currentStat.mtimeMs
        }));
        return;
      }

      // 自动备份：写前备份，保留最近 5 份
      try {
        const bakDir = path.join(path.dirname(fullPath), '.manifest-bak');
        if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
        const base = path.basename(filePath).replace(/\.[^.]+$/, '');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const bakFile = path.join(bakDir, `${base}.${ts}.bak`);
        fs.copyFileSync(fullPath, bakFile);
        // 清理旧备份，保留最近 5 份
        try {
          const baks = fs.readdirSync(bakDir).filter(f => f.startsWith(base + '.') && f.endsWith('.bak')).sort();
          while (baks.length > 5) {
            const oldest = baks.shift();
            fs.unlinkSync(path.join(bakDir, oldest));
          }
        } catch (e) { /* 清理失败不影响主流程 */ }
      } catch (bakErr) {
        throw new Error('备份失败，已中止写入: ' + bakErr.message);
      }

      // 写回（保持 Windows 环境 CRLF，避免整文件 diff 爆炸）
      const normalized = content.replace(/\r?\n/g, '\r\n');
      fs.writeFileSync(fullPath, normalized, 'utf-8');
      const newStat = fs.statSync(fullPath);
      log(`[local-files] 已写入 ${filePath}（${Buffer.byteLength(normalized, 'utf-8')} bytes）`, 'green');
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, mtime: newStat.mtimeMs }));
    } catch (error) {
      res.writeHead(error.statusCode || 500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // GET /refresh-org-apps — 刷新组织应用列表（SSE 流式，供前端弹窗展示执行过程）
  // 【v2.8.0】由"普通POST+runScript阻塞等待"改为"SSE流式"，前端可实时看到运行日志，解决"弹窗无日志、体感卡住"问题
  if (parsedUrl.pathname === '/refresh-org-apps') {
    try {
      const initOrgScript = path.join(SKILLS_DIR, 'org-init', 'scripts', 'init-org.js');
      if (!fs.existsSync(initOrgScript)) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: 'org-init 脚本不存在: ' + initOrgScript }));
        return;
      }

      const projectDirHost = resolveProjectDir(req, {
        projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
        staticRoot: STATIC_ROOT
      });
      if (!projectDirHost) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
        return;
      }

      log('收到刷新应用信息请求，执行 org-init...', 'yellow');

      const sendSSE = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // retry:0 表示连接断开后不自动重连，避免重复触发同步
      res.write('retry: 0\n\n');
      sendSSE('start', { message: '正在启动应用信息刷新...' });

      // 心跳：防止代理/浏览器在长时间等待时断开连接
      const heartbeat = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
      }, 15000);

      const child = spawn(process.execPath, [initOrgScript], {
        cwd: projectDirHost,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        // 【v2.8.0】由同步服务触发，跳过 init-org 打开浏览器/注册自启
        // v3.0.2 多项目隔离：注入 YIDA_PROJECT_ROOT，确保组织信息写入目标项目
        env: { ...process.env, YIDA_NO_OPEN_PORTAL: '1', YIDA_PROJECT_ROOT: projectDirHost },
      });

      let buffer = '';
      let fullOutput = '';
      const classify = (line) => {
        if (line.includes('❌') || line.includes('失败') || line.includes('错误') || line.includes('已失效') || line.includes('超时')) return 'error';
        if (line.includes('✅') || line.includes('成功') || line.includes('已保存') || line.includes('已更新')) return 'success';
        if (line.includes('⚠️') || line.includes('请') || line.includes('等待') || line.includes('尝试')) return 'warn';
        return 'info';
      };
      const flush = (text) => {
        fullOutput += text;
        buffer += text;
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';
        for (const raw of parts) {
          const line = raw.replace(/\r$/, '').trim();
          if (!line) continue;
          // 跳过 init-org 末尾的 __YIDA_CHANGES__ 结构化标记，由 done 事件单独携带
          if (line.startsWith('__YIDA_CHANGES__')) continue;
          sendSSE('log', { message: line, type: classify(line) });
        }
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', flush);
      child.stderr.on('data', flush);

      const cleanup = () => { try { clearInterval(heartbeat); } catch (e) {} };

      child.on('error', (error) => {
        cleanup();
        log(`刷新应用信息失败: ${error.message}`, 'red');
        sendSSE('error', { error: error.message });
        res.end();
      });

      child.on('close', (code) => {
        cleanup();
        if (buffer.trim()) sendSSE('log', { message: buffer.trim(), type: 'info' });
        const success = code === 0;
        // 解析 init-org 输出的结构化变化摘要（每个应用的增删情况）
        let changes = null;
        const marker = '__YIDA_CHANGES__';
        const markerIdx = fullOutput.lastIndexOf(marker);
        if (markerIdx >= 0) {
          const tail = fullOutput.slice(markerIdx + marker.length).trim().split(/\r?\n/)[0];
          try { changes = JSON.parse(tail); } catch (e) { changes = null; }
        }
        log(`应用信息刷新${success ? '成功' : '失败'}`, success ? 'green' : 'red');
        sendSSE('done', { success, changes });
        res.end();
      });

      // 客户端断开（如关闭页面）时终止子进程
      req.on('close', () => {
        try { child.kill('SIGTERM'); } catch (e) {}
      });
    } catch (error) {
      log(`刷新应用信息异常: ${error.message}`, 'red');
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      } else {
        try { res.end(); } catch (e) {}
      }
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
        // v3.0.2 多项目隔离：先解析目标项目目录，再传给 createProject，
        // 否则脚本内部 __dirname 回溯会指向宿主项目（最新启动服务的一方），导致项目文件夹串目录
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const result = createProject(projectName, projectDirHost);
        // 多组织并存：新项目注册到「目标项目」的组织及应用信息
        addAppToOrgConfig(projectDirHost, projectName, '待创建');
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
        const projectDirHost = resolveProjectDir(req, { projectDir: data.projectDir, staticRoot: STATIC_ROOT });
        if (!projectDirHost) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
          return;
        }
        const promptsFile = path.join(projectDirHost, '本地操作页面', '常用提示词.json');
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
      const projectDirHost = resolveProjectDir(req, {
        projectDir: (parsedUrl.query && parsedUrl.query.projectDir) || undefined,
        staticRoot: STATIC_ROOT
      });
      if (!projectDirHost) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录，请检查访问路径' }));
        return;
      }
      const promptsFile = path.join(projectDirHost, '本地操作页面', '常用提示词.json');
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
}

// 启动服务器
function startSyncServer() {
const server = createSyncServer();
server.listen(PORT, '127.0.0.1', () => {
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
  log(`  - POST http://localhost:${PORT}/local-files       写入本地文件（含冲突检测+备份）`, 'cyan');
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
return server;
}

module.exports = { createSyncServer, startSyncServer };
if (require.main === module) startSyncServer();
