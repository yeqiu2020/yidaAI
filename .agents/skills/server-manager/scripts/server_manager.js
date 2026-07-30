/**
 * 宜搭服务管理器 v2.1.0
 * 一键启动/停止/检查宜搭开发所需的本地服务
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
  const urlPath = decodedUrl.split('?')[0];
  const pathParts = urlPath.split('/').filter(p => p);
  let filePath = path.join(projectRoot, ...pathParts);
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(projectRoot);
  if (!resolvedPath.startsWith(resolvedRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
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
  const projectRoot = CONFIG.projectRoot;

  logStep('1/4', `准备启动 HTTP 服务 (端口 ${CONFIG.httpPort})...`, 'blue');
  logStep('1/4', `项目根目录: ${projectRoot}`, 'cyan');

  let httpServerProcess = null;
  let startMethod = '';

  const localHttpServerDirect = path.join(projectRoot, 'node_modules', 'http-server', 'bin', 'http-server');
  const localHttpServerCmd = path.join(projectRoot, 'node_modules', '.bin', 'http-server.cmd');

  if (fs.existsSync(localHttpServerDirect)) {
    startMethod = '本地http-server (node直接调用)';
    logStep('2/4', `找到http-server脚本: ${localHttpServerDirect}`, 'green');
    logStep('2/4', `使用 ${startMethod} 启动...`, 'blue');
    httpServerProcess = spawn(process.execPath, [localHttpServerDirect, '.', '-p', String(CONFIG.httpPort), '--cors', '-c-1'], {
      cwd: projectRoot,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });
  } else if (fs.existsSync(localHttpServerCmd)) {
    startMethod = '本地http-server (cmd调用)';
    logStep('2/4', `找到http-server.cmd: ${localHttpServerCmd}`, 'green');
    logStep('2/4', `使用 ${startMethod} 启动...`, 'blue');
    httpServerProcess = spawn('cmd', ['/c', localHttpServerCmd, '.', '-p', String(CONFIG.httpPort), '--cors', '-c-1'], {
      cwd: projectRoot,
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
    httpServerProcess = spawn(process.execPath, [builtinScript, projectRoot, String(CONFIG.httpPort)], {
      cwd: projectRoot,
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

  const syncScriptPath = path.join(CONFIG.projectRoot, CONFIG.syncServerScript);

  if (!fs.existsSync(syncScriptPath)) {
    logStep('同步', `同步服务脚本不存在: ${syncScriptPath}`, 'red');
    return { success: false, error: '同步服务脚本不存在' };
  }

  logStep('同步', `脚本路径: ${syncScriptPath}`, 'cyan');

  const syncServer = spawn('node', [syncScriptPath], {
    cwd: CONFIG.projectRoot,
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
    console.log(`\n📁 HTTP 服务根目录: ${CONFIG.projectRoot}`);
    console.log(`🌐 访问地址: http://127.0.0.1:${CONFIG.httpPort}`);
  }

  return {
    http: { running: httpHealthy, pid: httpPid },
    sync: { running: syncRunning, pid: syncPid }
  };
}

async function forceStopPorts() {
  log('─── 步骤0: 清理端口占用 ───', 'blue');

  const httpPid = await getProcessOnPort(CONFIG.httpPort);
  const syncPid = await getProcessOnPort(CONFIG.syncPort);

  if (!httpPid && !syncPid) {
    logStep('0', `端口 ${CONFIG.httpPort} 和 ${CONFIG.syncPort} 均空闲，无需清理`, 'green');
    return;
  }

  if (httpPid) {
    logStep('0', `发现端口 ${CONFIG.httpPort} 被占用 (PID: ${httpPid})，正在终止...`, 'yellow');
    await stopService(CONFIG.httpPort, 'HTTP 静态服务');
  }

  if (syncPid) {
    logStep('0', `发现端口 ${CONFIG.syncPort} 被占用 (PID: ${syncPid})，正在终止...`, 'yellow');
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
    console.log('   1. 通过 http://127.0.0.1:8080 访问原型页面');
    console.log('   2. 不要使用 file:// 打开本地文件');
    console.log('   3. 点击"同步配置"按钮即可同步表单配置');
    console.log('\n📁 示例访问路径:');
    console.log('   http://127.0.0.1:8080/项目管理/01需求梳理/原型页面/index.html');
    console.log('\n🏠 组织门户:');
    console.log('   http://127.0.0.1:8080/  (组织管理门户)');

    await updateOrgInfo();
  }

  return { http: httpResult, sync: syncResult };
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

    for (const item of items) {
      const appPath = path.join(CONFIG.projectRoot, item);
      const prototypePath = path.join(appPath, '01需求梳理', '原型页面', 'index.html');

      if (fs.existsSync(prototypePath)) {
        apps.push({
          name: item,
          url: `http://127.0.0.1:${CONFIG.httpPort}/${item}/01需求梳理/原型页面/index.html`,
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
