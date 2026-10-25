#!/usr/bin/env node
/**
 * service-menu.js — 宜搭服务管理菜单（中文 UI 放在 Node 里，避免 .bat 的编码陷阱）
 * ---------------------------------------------------------------------------
 * 设计要点（2026-10-17 事故沉淀）：
 *  1) .bat 里出现中文（UTF-8）或 LF 换行，cmd.exe 会**静默解析失败**（连日志都不写），
 *     表现为「双击没反应」。所以 .bat 只保留纯 ASCII 外壳，中文一律交给 Node 输出。
 *  2) 本菜单由用户双击启动 → 整条进程链（explorer → cmd → node）都在 AI 宿主 Job 之外，
 *     直接调用 start-local-service.bat 即可常驻，无需再套 explorer。
 *  3) 菜单编号保持 1-5 原样（2 是后台启动、3 是停止），避免肌肉记忆误点。
 *  4) 每次启动后都立刻回读验证（started != actually running）。
 */
'use strict';

const path = require('path');
const http = require('http');
const { spawnSync, spawn } = require('child_process');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ENSURE = path.join(__dirname, 'ensure-service.js');
const LAUNCHER = path.join(PROJECT_ROOT, 'start-local-service.bat');
const PORTAL_PATH = '/' + encodeURI(path.basename(PROJECT_ROOT)) + '/' + encodeURI('本地操作页面') + '/index.html';
const PORTAL_URL = 'http://127.0.0.1:8080' + PORTAL_PATH;

/** 调用 ensure-service 子命令（status/stop），输出直通控制台 */
function runEnsure(args = []) {
  const r = spawnSync(process.execPath, [ENSURE, ...args], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return r.status;
}

/** 直连探活（不走系统代理） */
function probe(port, urlPath, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout }, (res) => {
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, code: res.statusCode, bytes }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, code: 0 }); });
    req.on('error', () => resolve({ ok: false, code: 0 }));
  });
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function banner() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  宜搭服务管理  -  ' + PROJECT_ROOT);
  console.log('='.repeat(60));
  console.log('');
  console.log('   [1] 启动服务并验证（推荐）');
  console.log('   [2] 后台启动（关窗口也不停）');
  console.log('   [3] 停止服务');
  console.log('   [4] 查看状态');
  console.log('   [5] 健康检查');
  console.log('   [6] 打开本地操作页面');
  console.log('   [0] 退出');
  console.log('');
}

/** 轮询等待服务就绪 */
async function waitReady(maxSec = 40) {
  const deadline = Date.now() + maxSec * 1000;
  while (Date.now() < deadline) {
    const [page, sync] = await Promise.all([probe(8080, PORTAL_PATH), probe(3457, '/health')]);
    if (page.ok && sync.ok) return true;
    await sleep(1500);
  }
  return false;
}

async function main() {
  for (;;) {
    banner();
    const choice = (await ask('请选择 [1-6,0]: ')).trim();
    if (choice === '0') break;

    if (choice === '1') {
      console.log('\n[启动] 正在启动并验证（日志：service-start.log）…\n');
      const r = spawnSync('cmd', ['/c', LAUNCHER], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
      });
      console.log('');
      const code = runEnsure(['status']);
      console.log(code === 0 && r.status === 0
        ? '\n✅ 启动完成，服务已就绪。关闭本窗口不会停止服务。'
        : '\n❌ 启动未成功，请查看 service-start.log。');
      await ask('\n按回车返回菜单…');
    } else if (choice === '2') {
      console.log('\n[后台启动] 已派发，正在验证…\n');
      const child = spawn('cmd', ['/c', 'start', '', '/min', LAUNCHER], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      const ok = await waitReady(40);
      runEnsure(['status']);
      console.log(ok
        ? '\n✅ 后台启动成功，关闭本窗口不会停止服务。'
        : '\n❌ 40 秒内未就绪，请查看 service-start.log。');
      await ask('\n按回车返回菜单…');
    } else if (choice === '3') {
      console.log('');
      runEnsure(['stop']);
      await ask('\n按回车返回菜单…');
    } else if (choice === '4') {
      console.log('');
      runEnsure(['status']);
      await ask('\n按回车返回菜单…');
    } else if (choice === '5') {
      console.log('\n[健康检查]\n');
      const page = await probe(8080, PORTAL_PATH);
      const sync = await probe(3457, '/health');
      console.log(`   HTTP 静态服务 8080 : ${page.ok ? `✅ OK (HTTP ${page.code}, ${page.bytes} 字节)` : '❌ 无响应'}`);
      console.log(`   同步配置服务 3457 : ${sync.ok ? `✅ OK (HTTP ${sync.code})` : '❌ 无响应'}`);
      console.log(page.ok && sync.ok ? '\n✅ 健康检查通过。' : '\n❌ 服务异常，请用 [1] 启动或 [3] 停止后重试。');
      await ask('\n按回车返回菜单…');
    } else if (choice === '6') {
      spawn('cmd', ['/c', 'start', '', PORTAL_URL], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      console.log('\n已用默认浏览器打开：' + PORTAL_URL);
      await ask('\n按回车返回菜单…');
    }
  }
  rl.close();
}

main().catch((e) => { console.error('菜单异常:', e && e.message); process.exit(1); });
