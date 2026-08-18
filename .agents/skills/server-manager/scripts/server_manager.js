/**
 * 宜搭服务管理器 v3.0.0
 * 一键启动/停止/检查宜搭开发所需的本地服务
 *
 * v3.0.0 多组织并存：
 * - CONFIG 新增 staticRoot（静态服务根 = 各项目共用的公共父目录）
 * - HTTP 静态服务 8080 以 staticRoot 为根启动，通过 URL 首段区分项目（组织）
 * - 同步服务 3457 cwd 上移到 staticRoot，单实例服务所有项目
 * - forceStopPorts 改为「识别后决定复用/升级」，不再无条件杀端口
 * - updateOrgInfo 生成的「原型页面访问地址」URL 增加项目目录段
 *
 * 用法:
 *   node server_manager.js [start|stop|status|restart|autostart-on|autostart-off]
 *
 * v2.1.0 新增:
 * - 新增 autostart-on/autostart-off 命令，注册/取消开机自启
 * - 开机自启通过 Windows 启动文件夹实现（放置 .bat 快捷方式）
 */

const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

// 阶段四修复 Bug 2：引入 paths 模块以获取包内 skills 路径
let paths;
try {
  paths = require('../../../../lib/core/paths');
} catch (e) {
  // 回退：__dirname 上溯找 packageRoot
  paths = null;
}

const CONFIG = {
  httpPort: 8080,
  syncPort: 3457,
  get projectRoot() {
    // 阶段二改造（规格6.8）：优先 cwd，支持 --project-dir
    // 支持显式传入项目目录（argv[3]，sync_server /restart-service 使用）
    const overrideRoot = process.argv[3];
    if (overrideRoot && fs.existsSync(overrideRoot)) {
      return overrideRoot;
    }
    // 优先 process.cwd()
    return process.cwd();
  },
  /**
   * 静态服务根（阶段二改造：默认=cwd，即 projectRoot 本身）。
   * 规格 6.8：静态根 = cwd（--project-dir 可指定）。
   * 多项目工作区时 --project-dir <子目录> 使静态根切到该子目录。
   */
  get staticRoot() {
    return this.projectRoot;
  },
  syncServerScript: 'form_creator/scripts/sync_server.js',
  builtInServerScript: path.join(__dirname, '_builtin_server.js'),
  /**
   * 同步服务脚本定位（阶段四修复 Bug 2）：
   * 优先从包内 skillsSource() 查找（透传模式天然成立），
   * 回退到项目级 .agents/skills/ 目录。
   */
  get syncServerScriptPath() {
    // 优先：包内路径（paths.skillsSource()）
    if (paths) {
      const pkgPath = path.join(paths.skillsSource(), this.syncServerScript);
      if (fs.existsSync(pkgPath)) return pkgPath;
    }
    // 回退：项目级
    const projPath = path.join(this.projectRoot, '.agents', 'skills', this.syncServerScript);
    if (fs.existsSync(projPath)) return projPath;
    // 最终回退：__dirname 同级（server-manager 本身就在 skills 目录下）
    const localPath = path.join(__dirname, '..', 'form_creator', 'scripts', 'sync_server.js');
    return localPath;
  },
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message, color = 'cyan') {
  console.log(`  ${colors[color]}[${step}]${colors.reset} ${message}`);
}

function logHeader(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve({ port, inUse: true });
      } else {
        resolve({ port, inUse: false, error: err.message });
      }
    });
    server.once('listening', () => {
      server.close();
      resolve({ port, inUse: false });
    });
    server.listen(port, '0.0.0.0');
  });
}

function getProcessOnPort(port) {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
      if (error || !stdout) {
        resolve(null);
        return;
      }
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/LISTENING\s+(\d+)/);
        if (match) {
          resolve(match[1]);
          return;
        }
      }
      resolve(null);
    });
  });
}

function httpHealthCheck(port, maxRetries = 5, interval = 1000) {
  return new Promise((resolve) => {
    let attempts = 0;
    function tryRequest() {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/`, { timeout: 3000 }, (res) => {
        resolve(true);
        req.destroy();
      });
      req.on('error', () => {
        if (attempts < maxRetries) {
          logStep('检查', `第${attempts}次健康检查未响应，${interval}ms后重试...`, 'yellow');
          setTimeout(tryRequest, interval);
        } else {
          resolve(false);
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (attempts < maxRetries) {
          logStep('检查', `第${attempts}次健康检查超时，${interval}ms后重试...`, 'yellow');
          setTimeout(tryRequest, interval);
        } else {
          resolve(false);
        }
      });
    }
    tryRequest();
  });
}

/**
 * 判断指定端口上是否运行着"全局多项目服务"（/__yida_health 返回的 cwd 等于 staticRoot）。
 * v3.0.0 端口复用判定的核心依据。
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isGlobalServiceRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/__yida_health`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve(info.cwd === CONFIG.staticRoot);
        } catch (_) { resolve(false); }
        req.destroy();
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function ensureBuiltinServerScript() {
  const scriptContent = `const http = require('http');
const fs = require('fs');
const path = require('path');
const projectRoot = process.argv[2] || process.cwd();
const port = parseInt(process.argv[3]) || 8080;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  const decodedUrl = decodeURIComponent(req.url);
  if (decodedUrl.split('?')[0] === '/__yida_health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', cwd: process.cwd(), projectRoot }));
    return;
  }
  const urlPath = decodedUrl.split('?')[0];
  const pathParts = urlPath.split('/').filter(p => p);
  let filePath = path.join(projectRoot, ...pathParts);
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(projectRoot);
  if (!resolvedPath.startsWith(resolvedRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
  // 老 URL 回退：URL 首段不是合法项目目录且文件不存在时，回退到 staticRoot 下唯一项目
  if (!fs.existsSync(filePath)) {
    let uniqueProject = null;
    try {
      const projectDirs = fs.readdirSync(projectRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(projectRoot, e.name))
        .filter(d => fs.existsSync(path.join(d, '组织及应用信息.md')));
      if (projectDirs.length === 1) uniqueProject = projectDirs[0];
    } catch (_) {}
    if (uniqueProject) {
      const fb = path.join(uniqueProject, ...pathParts);
      if (fs.existsSync(fb)) filePath = fb;
    }
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) { filePath = path.join(filePath, 'index.html'); }
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return; }
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.md':'text/markdown' };
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.writeHead(200);
  fs.createReadStream(filePath).pipe(res);
});
server.listen(port, () => { console.log('BUILTIN_SERVER_STARTED'); });
server.on('error', (err) => { console.error('BUILTIN_SERVER_ERROR:', err.message); process.exit(1); });
`;
  fs.writeFileSync(CONFIG.builtInServerScript, scriptContent, 'utf-8');
  return CONFIG.builtInServerScript;
}

async function startHttpService() {
  // v3.0.0: 静态服务根 = staticRoot（多项目=公共父目录；单项目=项目根）
  const staticRoot = CONFIG.staticRoot;

  logStep('1/4', `准备启动 HTTP 服务 (端口 ${CONFIG.httpPort})...`, 'blue');
  logStep('1/4', `静态服务根: ${staticRoot}`, 'cyan');

  let httpServerProcess = null;
  let startMethod = '';

  // v3.0.0: 若 8080 已被"全局多项目静态服务"占用，直接复用，不再重复启动
  if (await isGlobalServiceRunning(CONFIG.httpPort)) {
    logStep('2/4', `端口 ${CONFIG.httpPort} 已是全局多项目静态服务，直接复用`, 'green');
    return { success: true, alreadyRunning: true, reuse: true };
  }

  const localHttpServerDirect = path.join(staticRoot, 'node_modules', 'http-server', 'bin', 'http-server');
  const localHttpServerCmd = path.join(staticRoot, 'node_modules', '.bin', 'http-server.cmd');

  if (fs.existsSync(localHttpServerDirect)) {
    startMethod = '本地http-server (node直接调用)';
    logStep('2/4', `找到http-server脚本: ${localHttpServerDirect}`, 'green');
    logStep('2/4', `使用 ${startMethod} 启动...`, 'blue');
    httpServerProcess = spawn(process.execPath, [localHttpServerDirect, '.', '-p', String(CONFIG.httpPort), '--cors', '-c-1'], {
      cwd: staticRoot,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });
  } else if (fs.existsSync(localHttpServerCmd)) {
    startMethod = '本地http-server (cmd调用)';
    logStep('2/4', `找到http-server.cmd: ${localHttpServerCmd}`, 'green');
    logStep('2/4', `使用 ${startMethod} 启动...`, 'blue');
    httpServerProcess = spawn('cmd', ['/c', localHttpServerCmd, '.', '-p', String(CONFIG.httpPort), '--cors', '-c-1'], {
      cwd: staticRoot,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });
  } else {
    startMethod = '内置静态服务器';
    logStep('2/4', `未找到本地http-server，使用内置静态服务器`, 'yellow');
    const builtinScript = ensureBuiltinServerScript();
    logStep('2/4', `内置服务器脚本: ${builtinScript}`, 'cyan');
    logStep('2/4', `使用 ${startMethod} 启动...`, 'blue');
    httpServerProcess = spawn(process.execPath, [builtinScript, staticRoot, String(CONFIG.httpPort)], {
      cwd: staticRoot,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });
  }

  if (!httpServerProcess) {
    logStep('2/4', `创建进程失败`, 'red');
    return { success: false, error: '无法创建HTTP服务进程' };
  }

  const httpPid = httpServerProcess.pid;
  logStep('2/4', `进程已创建 (PID: ${httpPid})`, 'cyan');

  httpServerProcess.on('error', (err) => {
    logStep('2/4', `进程错误: ${err.message}`, 'red');
  });

  httpServerProcess.unref();

  logStep('3/4', `等待服务就绪，进行健康检查...`, 'blue');
  const healthy = await httpHealthCheck(CONFIG.httpPort, 8, 1500);

  if (healthy) {
    logStep('3/4', `健康检查通过！HTTP 服务已就绪`, 'green');
    logStep('4/4', `访问地址: http://127.0.0.1:${CONFIG.httpPort}`, 'green');
    return { success: true, alreadyRunning: false, pid: httpPid, method: startMethod };
  } else {
    logStep('3/4', `健康检查失败！服务未在预期时间内就绪`, 'red');
    const finalCheck = await checkPort(CONFIG.httpPort);
    if (finalCheck.inUse) {
      logStep('3/4', `端口已被占用但HTTP无响应，可能有其他服务占用了端口`, 'yellow');
      const pid = await getProcessOnPort(CONFIG.httpPort);
      if (pid) logStep('3/4', `占用进程 PID: ${pid}`, 'yellow');
      return { success: false, error: `端口被占用但HTTP服务无响应 (PID: ${pid})` };
    }
    logStep('3/4', `端口未被占用，服务可能启动后立即退出了`, 'red');
    return { success: false, error: 'HTTP服务启动后立即退出' };
  }
}

async function startSyncService() {
  logStep('同步', `准备启动同步配置服务 (端口 ${CONFIG.syncPort})...`, 'blue');

  // v3.0.0: 若 3457 已被"全局多项目服务"（cwd=staticRoot）占用，直接复用，不再重复启动
  const existingGlobal = await isGlobalServiceRunning(CONFIG.syncPort);
  if (existingGlobal) {
    logStep('同步', `端口 ${CONFIG.syncPort} 已是全局多项目同步服务，直接复用`, 'green');
    return { success: true, alreadyRunning: true, reuse: true };
  }

  const staticRoot = CONFIG.staticRoot;
  // 阶段四修复 Bug 2：使用 syncServerScriptPath getter 优先定位包内脚本
  const syncScriptPath = CONFIG.syncServerScriptPath;

  if (!fs.existsSync(syncScriptPath)) {
    logStep('同步', `同步服务脚本不存在: ${syncScriptPath}`, 'red');
    return { success: false, error: '同步服务脚本不存在' };
  }

  logStep('同步', `脚本路径: ${syncScriptPath}`, 'cyan');

  const syncServer = spawn(process.execPath, [syncScriptPath], {
    cwd: staticRoot,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true
  });

  const syncPid = syncServer.pid;
  logStep('同步', `进程已创建 (PID: ${syncPid})`, 'cyan');

  syncServer.on('error', (err) => {
    logStep('同步', `进程错误: ${err.message}`, 'red');
  });

  syncServer.unref();

  logStep('同步', `等待同步服务就绪...`, 'blue');

  for (let i = 1; i <= 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const pid = await getProcessOnPort(CONFIG.syncPort);
    if (pid) {
      logStep('同步', `同步配置服务启动成功 (第${i}秒检测到端口监听, PID: ${pid})`, 'green');
      logStep('同步', `服务地址: http://localhost:${CONFIG.syncPort}`, 'cyan');
      return { success: true, alreadyRunning: false, pid: syncPid };
    }
    logStep('同步', `第${i}秒: 端口未就绪，继续等待...`, 'yellow');
  }

  logStep('同步', `同步服务未在8秒内启动`, 'red');
  return { success: false, error: '同步服务未在预期时间内启动' };
}

async function stopService(port, name) {
  const pid = await getProcessOnPort(port);

  if (!pid) {
    log(`⚠️  ${name} (端口 ${port}) 未运行`, 'yellow');
    return { success: true, wasRunning: false };
  }

  log(`🛑 正在停止 ${name} (PID: ${pid})...`, 'blue');

  return new Promise((resolve) => {
    exec(`taskkill /PID ${pid} /F /T`, (error) => {
      if (error) {
        log(`❌ 停止 ${name} 失败: ${error.message}`, 'red');
        resolve({ success: false, error: error.message });
      } else {
        log(`✅ ${name} 已停止`, 'green');
        resolve({ success: true, wasRunning: true });
      }
    });
  });
}

async function checkStatus() {
  logHeader('📊 服务状态检查');

  const httpHealthy = await httpHealthCheck(CONFIG.httpPort, 2, 500);
  const httpPid = httpHealthy ? await getProcessOnPort(CONFIG.httpPort) : null;
  const syncPid = await getProcessOnPort(CONFIG.syncPort);
  const syncRunning = !!syncPid;

  console.log('\n┌─────────────────────┬────────┬──────────────────────────┐');
  console.log('│ 服务                │ 端口   │ 状态                     │');
  console.log('├─────────────────────┼────────┼──────────────────────────┤');

  if (httpHealthy) {
    console.log(`│ HTTP 静态服务       │ ${CONFIG.httpPort}   │ 🟢 运行中 (PID: ${httpPid || '未知'}) │`);
  } else {
    console.log(`│ HTTP 静态服务       │ ${CONFIG.httpPort}   │ 🔴 未启动                │`);
  }

  if (syncRunning) {
    console.log(`│ 同步配置服务        │ ${CONFIG.syncPort}   │ 🟢 运行中 (PID: ${syncPid || '未知'}) │`);
  } else {
    console.log(`│ 同步配置服务        │ ${CONFIG.syncPort}   │ 🔴 未启动                │`);
  }

  console.log('└─────────────────────┴────────┴──────────────────────────┘');

  if (httpHealthy) {
    console.log(`\n📁 HTTP 静态服务根: ${CONFIG.staticRoot}`);
    console.log(`🌐 当前项目: ${CONFIG.projectRoot}`);
    console.log(`🌐 访问地址: http://127.0.0.1:${CONFIG.httpPort}/${encodeURIComponent(path.basename(CONFIG.projectRoot))}/`);
  }

  return {
    http: { running: httpHealthy, pid: httpPid },
    sync: { running: syncRunning, pid: syncPid }
  };
}

async function forceStopPorts() {
  log('─── 步骤0: 清理端口占用（多项目模式识别后复用） ───', 'blue');

  // v3.0.0: 多项目模式下，若端口被"全局多项目服务"占用则直接复用（不再杀死，避免中断其他项目）；
  // 仅当占用的是旧版"单项目服务"时才终止（升级重启）。
  const httpGlobal = await isGlobalServiceRunning(CONFIG.httpPort);
  const syncGlobal = await isGlobalServiceRunning(CONFIG.syncPort);

  if (httpGlobal) logStep('0', `端口 ${CONFIG.httpPort} 已是全局多项目服务，复用`, 'green');
  if (syncGlobal) logStep('0', `端口 ${CONFIG.syncPort} 已是全局多项目服务，复用`, 'green');

  const httpPid = httpGlobal ? null : await getProcessOnPort(CONFIG.httpPort);
  const syncPid = syncGlobal ? null : await getProcessOnPort(CONFIG.syncPort);

  if (!httpPid && !syncPid) {
    logStep('0', `端口 ${CONFIG.httpPort} 和 ${CONFIG.syncPort} 均空闲（或为全局多项目服务），无需清理`, 'green');
    return;
  }

  if (httpPid) {
    logStep('0', `发现端口 ${CONFIG.httpPort} 被旧版服务占用 (PID: ${httpPid})，正在终止升级...`, 'yellow');
    await stopService(CONFIG.httpPort, 'HTTP 静态服务');
  }

  if (syncPid) {
    logStep('0', `发现端口 ${CONFIG.syncPort} 被旧版服务占用 (PID: ${syncPid})，正在终止升级...`, 'yellow');
    await stopService(CONFIG.syncPort, '同步配置服务');
  }

  logStep('0', `等待1秒确保端口释放...`, 'cyan');
  await new Promise(r => setTimeout(r, 1000));

  const httpPidAfter = await getProcessOnPort(CONFIG.httpPort);
  const syncPidAfter = await getProcessOnPort(CONFIG.syncPort);

  if (httpPidAfter) {
    logStep('0', `⚠️ 端口 ${CONFIG.httpPort} 仍被占用 (PID: ${httpPidAfter})，强制终止...`, 'red');
    try { execSync(`taskkill /PID ${httpPidAfter} /F /T`, { stdio: 'ignore' }); } catch(e) {} // 有意忽略：进程可能已自行退出
    await new Promise(r => setTimeout(r, 500));
  }

  if (syncPidAfter) {
    logStep('0', `⚠️ 端口 ${CONFIG.syncPort} 仍被占用 (PID: ${syncPidAfter})，强制终止...`, 'red');
    try { execSync(`taskkill /PID ${syncPidAfter} /F /T`, { stdio: 'ignore' }); } catch(e) {} // 有意忽略：进程可能已自行退出
    await new Promise(r => setTimeout(r, 500));
  }

  logStep('0', `端口清理完成`, 'green');
}

async function startAll() {
  logHeader('🚀 启动宜搭服务');

  console.log(`📁 项目根目录: ${CONFIG.projectRoot}`);
  console.log(`📁 静态服务根(公共父目录): ${CONFIG.staticRoot}`);
  console.log(`📅 启动时间: ${new Date().toLocaleString()}\n`);

  await forceStopPorts();

  log('─── 步骤1: 启动 HTTP 静态服务 ───', 'blue');
  const httpResult = await startHttpService();

  console.log('');
  log('─── 步骤2: 启动同步配置服务 ───', 'blue');
  const syncResult = await startSyncService();

  console.log('\n' + '='.repeat(60));
  log('📋 启动报告', 'cyan');
  console.log('='.repeat(60));

  if (httpResult.success) {
    log(`✅ HTTP 服务: 启动成功 (端口 ${CONFIG.httpPort}, 方式: ${httpResult.method || '未知'})`, 'green');
  } else {
    log(`❌ HTTP 服务: 启动失败 - ${httpResult.error}`, 'red');
  }

  if (syncResult.success) {
    log(`✅ 同步服务: 启动成功 (端口 ${CONFIG.syncPort})`, 'green');
  } else {
    log(`❌ 同步服务: 启动失败 - ${syncResult.error}`, 'red');
  }

  if (httpResult.success && syncResult.success) {
    console.log('\n' + '─'.repeat(60));
    log('🎉 所有服务已就绪！', 'green');
    console.log('─'.repeat(60));
    console.log('\n📖 使用说明:');
    console.log('   1. 访问路径携带项目目录段，例如:');
    console.log(`      http://127.0.0.1:8080/${encodeURIComponent(path.basename(CONFIG.projectRoot))}/本地操作页面/index.html`);
    console.log('   2. 不要使用 file:// 打开本地文件');
    console.log('   3. 点击"同步配置"按钮即可同步表单配置');
    console.log('\n📁 示例访问路径:');
    console.log(`   http://127.0.0.1:8080/${encodeURIComponent(path.basename(CONFIG.projectRoot))}/项目管理/01需求梳理/原型页面/index.html`);
    console.log('\n🏠 组织门户:');
    console.log(`   http://127.0.0.1:8080/${encodeURIComponent(path.basename(CONFIG.projectRoot))}/本地操作页面/index.html`);

    await updateOrgInfo();
    updateInitDoc();
  }

  return { http: httpResult, sync: syncResult };
}

/**
 * v3.0.0: 启动服务后自动把 02应用初始化.md 中的占位符替换为当前项目目录名
 */
function updateInitDoc() {
  const docPath = path.join(CONFIG.projectRoot, '02应用初始化.md');
  if (!fs.existsSync(docPath)) return;

  try {
    let content = fs.readFileSync(docPath, 'utf-8');
    const projectName = path.basename(CONFIG.projectRoot);
    const oldPattern = /http:\/\/127\.0\.0\.1:8080\/\{项目目录名\}\//g;
    if (!oldPattern.test(content)) return; // 无占位符则跳过
    content = content.replace(oldPattern, `http://127.0.0.1:8080/${encodeURIComponent(projectName)}/`);
    fs.writeFileSync(docPath, content, 'utf-8');
    console.log(`\n✅ 已将 02应用初始化.md 中的占位符替换为项目名: ${projectName}`);
  } catch (error) {
    console.log('\n⚠️  更新 02应用初始化.md 失败:', error.message);
  }
}

async function stopAll() {
  logHeader('🛑 停止宜搭服务');

  const httpResult = await stopService(CONFIG.httpPort, 'HTTP 静态服务');
  const syncResult = await stopService(CONFIG.syncPort, '同步配置服务');

  if (fs.existsSync(CONFIG.builtInServerScript)) {
    try { fs.unlinkSync(CONFIG.builtInServerScript); } catch(e) {} // 有意忽略：临时文件可能已不存在
  }

  console.log('\n' + '='.repeat(60));
  if (httpResult.success && syncResult.success) {
    log('✅ 所有服务已停止', 'green');
  } else {
    log('⚠️ 部分服务停止失败', 'yellow');
  }
  console.log('='.repeat(60));

  return { http: httpResult, sync: syncResult };
}

async function restartAll() {
  logHeader('🔄 重启宜搭服务');
  await stopAll();
  console.log('\n等待2秒确保端口释放...');
  await new Promise(r => setTimeout(r, 2000));
  await startAll();
}

async function updateOrgInfo() {
  const orgInfoPath = path.join(CONFIG.projectRoot, '组织及应用信息.md');

  if (!fs.existsSync(orgInfoPath)) {
    console.log('\n⚠️  组织及应用信息.md 不存在，跳过更新');
    return;
  }

  try {
    let content = fs.readFileSync(orgInfoPath, 'utf-8');

    const apps = [];
    const items = fs.readdirSync(CONFIG.projectRoot);
    // v3.0.0: URL 增加项目目录段，如 http://127.0.0.1:8080/{项目目录名}/{应用名}/01需求梳理/原型页面/index.html
    const projectSegment = encodeURIComponent(path.basename(CONFIG.projectRoot));

    for (const item of items) {
      const appPath = path.join(CONFIG.projectRoot, item);
      const prototypePath = path.join(appPath, '01需求梳理', '原型页面', 'index.html');

      if (fs.existsSync(prototypePath)) {
        apps.push({
          name: item,
          url: `http://127.0.0.1:${CONFIG.httpPort}/${projectSegment}/${encodeURIComponent(item)}/01需求梳理/原型页面/index.html`,
          synced: true
        });
      }
    }

    const prototypeTable = apps.map(app =>
      `| ${app.name} | ${app.url} | ✅ 已同步 |`
    ).join('\n');

    const prototypeSection = `\n---\n\n## 原型页面访问地址\n\n> 以下地址需要在 HTTP 服务启动后访问\n> \n> 请勿使用 \`file://\` 协议打开，否则会导致同步配置功能失效\n\n| 应用名称 | 原型页面地址 | 本地状态 |\n|----------|-------------|----------|\n${prototypeTable}\n`;

    if (content.includes('## 原型页面访问地址')) {
      content = content.replace(/\n[*-]{3}\n\n## 原型页面访问地址[\s\S]*?(?=\n[*-]{3}\n\n## |$)/, prototypeSection);
    } else {
      content = content.replace(/\n[*-]{3}\n\n## 备注/, prototypeSection + '\n---\n\n## 备注');
    }

    fs.writeFileSync(orgInfoPath, content, 'utf-8');
    console.log('\n✅ 已更新组织及应用信息.md 中的原型页面访问地址');
  } catch (error) {
    console.log('\n⚠️  更新组织及应用信息.md 失败:', error.message);
  }
}

async function main() {
  const command = process.argv[2] || 'start';

  switch (command.toLowerCase()) {
    case 'start':
      await startAll();
      // 子进程已用 detached:true + unref() 独立运行，脚本可直接退出
      console.log('\n✅ 启动脚本已退出，服务在后台持续运行');
      console.log('   停止服务请运行: node .agents/skills/server-manager/scripts/server_manager.js stop\n');
      process.exit(0);
      break;
    case 'stop':
      await stopAll();
      break;
    case 'status':
      await checkStatus();
      break;
    case 'restart':
      await restartAll();
      break;
    case 'update-org':
      await updateOrgInfo();
      break;
    case 'autostart-on':
      enableAutoStart();
      break;
    case 'autostart-off':
      disableAutoStart();
      break;
    default:
      console.log('用法: node server_manager.js [start|stop|status|restart|autostart-on|autostart-off]');
      console.log('');
      console.log('命令:');
      console.log('  start          启动所有服务（默认）');
      console.log('  stop           停止所有服务');
      console.log('  status         检查服务状态');
      console.log('  restart        重启所有服务');
      console.log('  autostart-on   注册开机自启');
      console.log('  autostart-off  取消开机自启');
      process.exit(1);
  }
}

/**
 * 注册开机自启（Windows 启动文件夹方式）
 */
function enableAutoStart() {
  logHeader('🔌 注册开机自启');

  const startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const batPath = path.join(CONFIG.projectRoot, '启动宜搭服务.bat');
  const shortcutPath = path.join(startupFolder, '宜搭AI助手-启动服务.bat');

  if (!fs.existsSync(batPath)) {
    log('❌ 未找到 启动宜搭服务.bat，请确认项目目录正确', 'red');
    process.exit(1);
  }

  // 创建启动脚本（使用 start /min 最小化运行，避免弹窗干扰）
  // 注意：bat 文件必须使用 GBK 编码，否则中文路径会乱码
  const startupScript = `@echo off
chcp 65001 >nul 2>&1
cd /d "${CONFIG.projectRoot}"
start /min "" node ".agents\\skills\\server-manager\\scripts\\server_manager.js" start
`;

  try {
    // 使用 GBK 编码写入 bat 文件（Windows cmd 默认使用 GBK）
    const iconv = require('iconv-lite');
    if (iconv) {
      fs.writeFileSync(shortcutPath, iconv.encode(startupScript, 'gbk'));
    } else {
      // 没有 iconv-lite 时使用 Buffer 手动处理
      fs.writeFileSync(shortcutPath, startupScript, 'utf-8');
    }
    log(`✅ 已注册开机自启`, 'green');
    log(`   启动文件夹: ${startupFolder}`, 'cyan');
    log(`   快捷方式: ${shortcutPath}`, 'cyan');
    console.log('');
    log('💡 下次开机将自动启动宜搭服务', 'yellow');
    log('   取消自启: 在对话框输入 "取消宜搭服务开机自启"', 'yellow');
  } catch (error) {
    log(`❌ 注册失败: ${error.message}`, 'red');
    log('💡 请尝试以管理员身份运行', 'yellow');
    process.exit(1);
  }
}

/**
 * 取消开机自启
 */
function disableAutoStart() {
  logHeader('🔌 取消开机自启');

  const startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const shortcutPath = path.join(startupFolder, '宜搭AI助手-启动服务.bat');

  if (!fs.existsSync(shortcutPath)) {
    log('⚠️ 未找到开机自启快捷方式，可能未注册', 'yellow');
    return;
  }

  try {
    fs.unlinkSync(shortcutPath);
    log('✅ 已取消开机自启', 'green');
  } catch (error) {
    log(`❌ 取消失败: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    log(`❌ 错误: ${err.message}`, 'red');
    process.exit(1);
  });
}
