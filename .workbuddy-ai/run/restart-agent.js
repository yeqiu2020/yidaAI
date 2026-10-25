#!/usr/bin/env node
/**
 * restart-agent.js — 真正执行「重启」的独立进程（由 3457 同步服务 spawn）
 * ---------------------------------------------------------------------------
 * 为什么需要它（2026-10-17 定位到的原有 bug）：
 *   server_manager 的 restartAll() = stopAll() + 等 2s + startAll()，
 *   而 stopAll() 对每个端口执行 `taskkill /PID <pid> /F /T`。
 *   旧实现里 server_manager restart 是**同步服务(3457)的子进程**，
 *   于是停止 3457 时 /T 把重启进程一起杀了 → 8080 已停、3457 已停、startAll 再也没执行，
 *   结果两个服务全挂（页面「🔄 重启服务」按钮一点就把服务打死的根因）。
 *
 * 本脚本的做法：同步服务收到 /restart-service 后 spawn 本脚本，然后**自己退出**。
 * 本脚本只做两件事：
 *   1) 等 2 秒（等同步服务真正退出、端口释放）
 *   2) 只杀 8080 的监听进程（本脚本不是 8080 的后代，/T 波及不到自己）
 *   3) 执行 server_manager start（全量拉起）
 * 全程不杀 3457，因此不会出现"自己杀自己"。
 *
 * 用法：node restart-agent.js [projectRoot]
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', '..');
const SERVER_MANAGER = path.join(PROJECT_ROOT, '.agents', 'skills', 'server-manager', 'scripts', 'server_manager.js');
const LOG_FILE = path.join(PROJECT_ROOT, 'service-start.log');
const HTTP_PORT = 8080;

function log(line) {
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) { /* ignore */ }
}

/** 找出监听指定端口的 PID */
function findPidOnPort(port) {
  try {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
    const out = (r.stdout || '') + (r.stderr || '');
    for (const line of out.split(/\r?\n/)) {
      if (line.includes('LISTENING') && new RegExp(`[:.]${port}\\s`).test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid) && pid !== '0') return pid;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  log(`[${new Date().toISOString()}] restart-agent 启动，等待同步服务退出…`);
  await sleep(2000);

  const httpPid = findPidOnPort(HTTP_PORT);
  if (httpPid) {
    log(`[${new Date().toISOString()}] 停止 8080 静态服务 (PID ${httpPid})`);
    spawnSync('taskkill', ['/PID', httpPid, '/F', '/T'], { encoding: 'utf8', windowsHide: true });
    await sleep(1200);
  } else {
    log(`[${new Date().toISOString()}] 8080 未在监听，跳过停止`);
  }

  log(`[${new Date().toISOString()}] 执行 server_manager start…`);
  const r = spawnSync(process.execPath, [SERVER_MANAGER, 'start'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  log((r.stdout || '') + (r.stderr || ''));
  log(`[${new Date().toISOString()}] restart-agent 结束 exit=${r.status}`);
})();
