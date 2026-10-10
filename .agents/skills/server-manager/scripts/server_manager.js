/**
 * 宜搭服务管理器 v3.2.0
 * 一键启动/停止/检查宜搭开发所需的本地服务
 *
 * v3.2.0 修复两处真实缺陷（导航条「启动宜搭服务」按钮 + 端口复用判定）：
 * - fix1 内置静态服务器 /__yida_start_service：argv[2] 实为 staticRoot（公共父目录），
 *   原实现 [staticRoot, projectDir] 直接拼接，而前端 projectDir 传的就是完整项目名，
 *   导致 targetRoot = staticRoot/项目名/项目名（多一层）。spawn 带不存在的 cwd 必然失败，
 *   而响应仍返回 success:true，页面按钮表现为"点了没反应"。
 *   现改为 resolveTargetProjectRoot()：候选路径推导 + 有效性校验（.agents / 组织及应用信息.md），
 *   目标无效时如实返回 400/500 而非假成功；spawn 失败通过 child 'error' 事件记录日志。
 * - fix2 isGlobalServiceRunning()：原实现只读 8080 /__yida_health 的 cwd 字段，
 *   而 3457 /health 不返回 cwd（比对 undefined ⇒ 永远 false），
 *   且 8080 的静态根是「组织及应用信息.md 所在目录」，未必等于 CONFIG.staticRoot，
 *   于是"已在运行的服务"会被误判为旧版而遭 taskkill 杀掉重启。
 *   现改为「多字段回退（serviceRoot → staticRoot → cwd）+ normalizePath 归一化比对」。
 * - 内置服务器 /__yida_health 新增 serviceRoot 字段（projectRoot 保留兼容旧调用方）
 * - 内置服务器 listen 回调增加 staticRoot / cwd 自检输出，便于排查"启动后立即退出"
 *
 * v3.1.0 页面一键启动（v1.1.0 _builtin_server）：
 * - 内置静态服务器新增 /__yida_start_service 接口：同步服务(3457)未启动、8080 存活时，
 *   页面可直接通过该接口拉起服务，无需 AI / 命令行动手
 * - ensureBuiltinServerScript 内嵌模板与外部 _builtin_server.js 同步新增该接口
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

const CONFIG = {
  httpPort: 8080,
  syncPort: 3457,
  get projectRoot() {
    // 支持显式传入项目目录（argv[3]，sync_server /restart-service 使用），
    // 避免进程 cwd=staticRoot 时向上查找 .agents 失败回退到错误目录。
    const overrideRoot = process.argv[3];
    if (overrideRoot && fs.existsSync(overrideRoot)) {
      return overrideRoot;
    }
    let currentDir = process.cwd();
    const root = path.parse(currentDir).root;
    while (currentDir !== root) {
      if (fs.existsSync(path.join(currentDir, '.agents'))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    return path.resolve(__dirname, '..', '..', '..', '..');
  },
  /**
   * 静态服务根（多组织并存的"公共父目录"）。
   * 项目目录 = 含 .agents 且含 组织及应用信息.md 的目录。
   * 按方案：staticRoot = 当前项目根的父目录（各项目互为兄弟目录），
   * 8080 统一通过 URL 首段（项目目录名）区分项目。单项目也保持此形态，访问路径始终带项目段。
   */
  get staticRoot() {
    return path.dirname(this.projectRoot);
  },
  syncServerScript: '.agents/skills/form_creator/scripts/sync_server.js',
  builtInServerScript: path.join(__dirname, '_builtin_server.js')
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
 * 判断指定端口上是否运行着"全局多项目服务"（即该服务的静态根/serviceRoot 等于本项目推导出的 staticRoot）。
 * v3.0.0 端口复用判定的核心依据。
 *
 * v3.2.0 修复：原实现只认 8080 的 `cwd`，导致两处误判——
 *   1) 同步服务(3457) 的 /health 只返回 staticRoot、不返回 cwd，原实现比对 undefined ⇒ 永远 false；
 *   2) 8080 的实际 staticRoot 是「项目根.组织及应用信息.md」所在目录，可能与 CONFIG.staticRoot
 *      （项目根父目录）不一致（如项目放在 …/公司名/项目名 之外时），此时会误判为"旧版服务"而被杀掉重启。
 * 现改为「归一化路径比对 + 多字段回退」：优先比 serviceRoot，其次比 staticRoot，最后比 cwd。
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isGlobalServiceRunning(port) {
  return new Promise((resolve) => {
    // 8080 静态服务用 /__yida_health（返回 cwd + projectRoot），3457 同步服务用 /health（返回 staticRoot + cwd）
    const healthPath = port === CONFIG.httpPort ? '/__yida_health' : '/health';
    const req = http.get(`http://127.0.0.1:${port}${healthPath}`, { timeout: 2000 }, (res) => {
      // 健康接口已响应即说明端口被"我方服务"占用；正文解析失败也不应判成"空闲"
      if (res.statusCode !== 200) { req.destroy(); resolve(false); return; }
      // Buffer 收集统一解码，防 chunk 边界撕碎中文字符
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        try {
          const info = JSON.parse(data);
          const expected = normalizePath(CONFIG.staticRoot);
          const actual = normalizePath(info.serviceRoot) || normalizePath(info.staticRoot) || normalizePath(info.cwd);
          resolve(!!actual && actual === expected);
        } catch (_) {
          // 健康接口通但正文非 JSON：按"非全局服务"处理，交给后续升级/重启逻辑兜底
          resolve(false);
        }
        req.destroy();
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * 路径归一化（用于跨平台/跨输入形式的路径比较）。
 * 统一为小写 + 正斜杠，避免 Windows 反斜杠、盘符大小写、尾部分隔符导致的误判。
 * @param {string} p
 * @returns {string} 归一化后的路径；输入为空时返回空串
 */
function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function ensureBuiltinServerScript() {
  // 注意：此模板字符串是 8080 静态服务器真正运行的内容，每次启动时写回 _builtin_server.js。
  // 修改端口/内部接口/静态文件逻辑时必须同步更新此处内嵌模板与外部 _builtin_server.js，保持两者一致。
  // v1.1.0: 新增 /__yida_start_service 启动接口——静态服务(8080)可独立于同步服务(3457)存活，
  //         当 3457 未启动时，页面可通过 8080 上的该接口直接拉起服务，无需依赖 3457 接口。
  // v3.2.0: 修正 /__yida_start_service 的 targetRoot 推导——argv[2] 是静态服务根(staticRoot)，
  //         原实现再拼一次 projectDir 会多一层且不校验存在性，导致 spawn 带无效 cwd 静默失败。
  //         现改为「推导 + 有效性校验」，目标无效时如实返回 4xx/5xx 而非假 success。
  const scriptContent = `const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
// 注意：进程启动参数 argv[2] 传入的是"静态服务根"（多项目模式下为公共父目录），
// 因此这里的常量语义是 staticRoot，不是单个项目的根目录。项目根需由 projectDir 推导。
const staticRoot = process.argv[2] || process.cwd();
const port = parseInt(process.argv[3]) || 8080;

/**
 * 判定某目录是否是"有效的宜搭项目根"（含 .agents 或 组织及应用信息.md）。
 * @param {string} dir
 * @returns {boolean}
 */
function isValidProjectRoot(dir) {
  if (!dir) return false;
  try {
    return fs.existsSync(path.join(dir, '.agents')) ||
           fs.existsSync(path.join(dir, '组织及应用信息.md'));
  } catch (_) { return false; }
}

/**
 * 由 projectDir（项目目录名或相对路径）推导出项目根目录。
 * v3.2.0 修复：原实现用 path.join(argv[2], projectDir)，而 argv[2] 是 staticRoot，
 *   前端传入的又是完整项目名，两者相同 ⇒ 拼成 …/新鑫科技AI助手V2.0.33/新鑫科技AI助手V2.0.33（多一层），
 *   且未校验存在性，spawn 带着不存在的 cwd 必然失败，而响应仍返回 success:true。
 * @param {string} projectDir
 * @returns {string|null} 项目根绝对路径；无有效目标时返回 null
 */
function resolveTargetProjectRoot(projectDir) {
  const candidates = [];
  const add = (d) => { if (d) candidates.push(path.resolve(d)); };

  if (projectDir) {
    // 兼容三种入参：纯目录名 / 相对 staticRoot 的路径 / 绝对路径
    add(path.join(staticRoot, projectDir));
    add(projectDir);
  } else {
    // 未传项目名：staticRoot 自身就是项目根（单项目模式）则用它；否则找 staticRoot 下唯一的项目
    add(staticRoot);
    try {
      const projectDirs = fs.readdirSync(staticRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(staticRoot, e.name))
        .filter(isValidProjectRoot);
      if (projectDirs.length === 1) add(projectDirs[0]);
    } catch (_) {}
  }

  for (const dir of candidates) {
    // 必须已存在且是合法项目根，避免 spawn 带无效 cwd 静默失败
    if (isValidProjectRoot(dir)) return dir;
  }
  // 兜底：传入目录存在即用（老版本项目可能既无 .agents 也无 组织及应用信息.md）
  for (const dir of candidates) {
    try { if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir; } catch (_) {}
  }
  return null;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  const decodedUrl = decodeURIComponent(req.url);
  const urlInfo = decodedUrl.split('?');
  if (urlInfo[0] === '/__yida_health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // serviceRoot = 本服务的静态根；projectRoot 字段保留以兼容旧调用方
    res.end(JSON.stringify({ status: 'ok', serviceRoot: staticRoot, cwd: process.cwd(), projectRoot: staticRoot }));
    return;
  }
  // v1.1.0: 启动宜搭服务接口——spawn server_manager start <项目根>，脱离当前进程独立运行。
  // 用途：同步服务(3457)未启动、但静态服务(8080)存活时，页面点击「启动宜搭服务」按钮即可直接拉起服务。
  // v3.2.0: 修正 targetRoot 推导（不再多拼一层），并在目标无效时如实返回失败而非假成功。
  if (urlInfo[0] === '/__yida_start_service') {
    const query = new URLSearchParams(urlInfo[1] || '');
    const projectDir = query.get('projectDir') || '';
    const targetRoot = resolveTargetProjectRoot(projectDir);
    const serverManagerScript = path.join(__dirname, 'server_manager.js');
    if (!targetRoot) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: \`无法定位项目目录: \${projectDir || '(未传 projectDir)'}\`, staticRoot }));
      return;
    }
    if (!fs.existsSync(serverManagerScript)) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: \`服务管理器脚本不存在: \${serverManagerScript}\`, projectRoot: targetRoot }));
      return;
    }
    try {
      const child = spawn(process.execPath, [serverManagerScript, 'start', targetRoot], {
        cwd: targetRoot,
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true
      });
      child.on('error', (err) => {
        console.error('START_SERVICE_SPAWN_ERROR:', err.message);
      });
      child.unref();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: '服务正在启动', projectRoot: targetRoot, staticRoot }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message, projectRoot: targetRoot }));
    }
    return;
  }
  const urlPath = urlInfo[0];
  const pathParts = urlPath.split('/').filter(p => p);
  let filePath = path.join(staticRoot, ...pathParts);
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(staticRoot);
  if (!resolvedPath.startsWith(resolvedRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
  // 老 URL 回退：URL 首段不是合法项目目录且文件不存在时，回退到 staticRoot 下唯一项目
  if (!fs.existsSync(filePath)) {
    let uniqueProject = null;
    try {
      const projectDirs = fs.readdirSync(staticRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(staticRoot, e.name))
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
server.listen(port, () => {
  // 启动自检：把实际生效的静态根打印出来，便于排查"服务启动后进程立即退出"类问题
  console.log('BUILTIN_SERVER_STARTED');
  console.log(\`staticRoot=\${staticRoot}\`);
  console.log(\`cwd=\${process.cwd()}\`);
});
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
  // 脚本文件取自当前项目目录的副本（各项目内均有一份），但进程 cwd 上移到 staticRoot，
  // 使 sync_server 的 STATIC_ROOT=staticRoot，从而按请求解析项目目录。
  const syncScriptPath = path.join(CONFIG.projectRoot, CONFIG.syncServerScript);

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
    case 'start-sync': {
      // v3.3.0: 仅启动同步配置服务(3457)，不触碰 8080 —— 配合 run_command 前台启动 8080 以支持 open_preview 预览框
      const syncOnlyResult = await startSyncService();
      process.exit(syncOnlyResult.success ? 0 : 1);
      break;
    }
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
