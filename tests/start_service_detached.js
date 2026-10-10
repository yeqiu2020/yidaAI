// 以「完全独立」方式启动宜搭服务：detached + 输出重定向到日志文件 + unref
// 目的：验证服务能否脱离当前 Agent 会话长期存活
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const proj = process.argv[2];
const mgr = path.join(proj, '.agents', 'skills', 'server-manager', 'scripts', 'server_manager.js');
const logPath = path.join(proj, 'temp-file', 'service-start.log');

fs.mkdirSync(path.dirname(logPath), { recursive: true });
const out = fs.openSync(logPath, 'w');

const p = spawn(process.execPath, [mgr, 'start'], {
  cwd: proj,
  detached: true,
  stdio: ['ignore', out, out],
  windowsHide: true
});
p.unref();

fs.writeFileSync(path.join(proj, 'temp-file', 'service.pid'), String(p.pid));
console.log('SPAWNED_PID=' + p.pid);
console.log('LOG=' + logPath);
