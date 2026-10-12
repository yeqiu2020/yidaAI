const http = require('http');
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
  // 兜底：单项目布局（静态根=项目根）下显式候选可能是页面目录等非项目根（如"本地操作页面"），
  // 静态根自身即项目根时优先回退，避免 spawn 带错误 cwd
  if (isValidProjectRoot(staticRoot)) return staticRoot;
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
  // 根路径重定向到组织门户（单项目布局下静态根=项目根，根目录无 index.html）
  if (req.url === '/' && fs.existsSync(path.join(staticRoot, '本地操作页面', 'index.html'))) {
    res.writeHead(302, { Location: '/' + encodeURIComponent('本地操作页面') + '/index.html' });
    res.end();
    return;
  }
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
      res.end(JSON.stringify({ success: false, message: `无法定位项目目录: ${projectDir || '(未传 projectDir)'}`, staticRoot }));
      return;
    }
    if (!fs.existsSync(serverManagerScript)) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: `服务管理器脚本不存在: ${serverManagerScript}`, projectRoot: targetRoot }));
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
  console.log(`staticRoot=${staticRoot}`);
  console.log(`cwd=${process.cwd()}`);
});
server.on('error', (err) => { console.error('BUILTIN_SERVER_ERROR:', err.message); process.exit(1); });
