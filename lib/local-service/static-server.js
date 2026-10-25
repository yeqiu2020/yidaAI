'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createSecurity, sendJson } = require('./security');
const { safeFile, within, publicParts } = require('./paths');
const CLIENT = path.resolve(__dirname, '../../本地操作页面/js/local-client.js');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css', '.json':'application/json', '.md':'text/markdown; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

function isProject(dir) {
  return fs.existsSync(path.join(dir, '.agents')) || fs.existsSync(path.join(dir, '组织及应用信息.md'));
}

function createStaticServer(staticRoot, options = {}) {
  staticRoot = fs.realpathSync(staticRoot);
  const protect = createSecurity(options);
  const launch = options.launch || ((script, cwd) => {
    const child = spawn(process.execPath, [script, 'start', cwd], { cwd, detached:true, stdio:'ignore', windowsHide:true });
    child.on('error', err => console.error('START_SERVICE_SPAWN_ERROR:', err.message));
    child.unref();
  });
  return http.createServer((req, res) => {
    if (protect(req, res)) return;
    let pathname, query;
    try {
      const [rawPath, rawQuery] = req.url.split('?');
      pathname = decodeURIComponent(rawPath);
      query = new URLSearchParams(rawQuery || '');
      publicParts(pathname.replace(/^\//, ''));
    } catch (e) { sendJson(res, e instanceof URIError ? 400 : 403, {success:false,error:e.message}); return; }
    if (pathname === '/__yida_health') {
      sendJson(res, 200, {status:'ok', serviceRoot:staticRoot, projectRoot:staticRoot, cwd:staticRoot, securityPatch:'enabled', bindAddress:'127.0.0.1'}); return;
    }
    if (pathname === '/__yida_client.js') {
      res.writeHead(200, {'Content-Type':MIME['.js'], 'Cache-Control':'no-store'});
      fs.createReadStream(CLIENT).on('error', () => res.destroy()).pipe(res); return;
    }
    try {
      if (pathname === '/__yida_start_service') {
        const requested = query.get('projectDir') || '';
        let target;
        if (requested) {
          const parts = publicParts(requested);
          if (parts.length !== 1) throw new Error('项目名必须是当前服务根下的一级目录');
          target = isProject(staticRoot) && path.basename(staticRoot) === requested ? staticRoot : path.join(staticRoot, requested);
        } else if (isProject(staticRoot)) target = staticRoot;
        else {
          const projects = fs.readdirSync(staticRoot,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(staticRoot,e.name)).filter(isProject);
          if (projects.length === 1) target = projects[0];
        }
        if (!target || !within(staticRoot, fs.realpathSync(target)) || !isProject(target)) {
          sendJson(res,400,{success:false,error:'无法唯一定位项目'}); return;
        }
        const manager = path.join(target,'.agents/skills/server-manager/scripts/server_manager.js');
        if (!fs.existsSync(manager)) { sendJson(res,404,{success:false,error:'服务管理脚本不存在'}); return; }
        launch(manager,target);
        sendJson(res,202,{success:true,message:'服务正在启动',projectRoot:target}); return;
      }
      if (!['GET','HEAD'].includes(req.method)) { sendJson(res,405,{success:false,error:'Method not allowed'}); return; }
      let parts = publicParts(pathname);
      let projectRoot;
      if (isProject(staticRoot)) projectRoot = staticRoot;
      else {
        const candidate = parts.length ? path.join(staticRoot,parts[0]) : null;
        if (candidate && isProject(candidate)) { projectRoot=candidate; parts=parts.slice(1); }
        else {
          const projects=fs.readdirSync(staticRoot,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(staticRoot,e.name)).filter(isProject);
          if (projects.length===1) projectRoot=projects[0];
        }
      }
      if (!projectRoot || !within(staticRoot,fs.realpathSync(projectRoot))) { sendJson(res,404,{success:false,error:'项目不存在'}); return; }
      if (!parts.length) parts=['本地操作页面','index.html'];
      let file=safeFile(projectRoot,parts.join('/'));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=safeFile(projectRoot,parts.concat('index.html').join('/'));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { sendJson(res,404,{success:false,error:'Not Found'}); return; }
      const ext=path.extname(file).toLowerCase();
      if (!MIME[ext]) { sendJson(res,403,{success:false,error:'不允许公开此文件类型'}); return; }
      res.writeHead(200,{'Content-Type':MIME[ext],'Cache-Control':'no-store'});
      if (req.method==='HEAD') { res.end(); return; }
      if (ext==='.html') {
        const html=fs.readFileSync(file,'utf8');
        // Upgrade existing generated pages at delivery time; no business source is rewritten.
        const script='<script src="/__yida_client.js"></script>';
        res.end(/<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i,m=>m+script) : script+html);
      } else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    } catch (e) { if (!res.headersSent) sendJson(res,403,{success:false,error:e.message}); else res.destroy(); }
  });
}

function start(staticRoot=process.argv[2] || process.cwd(), port=Number(process.argv[3]) || 8080) {
  const server=createStaticServer(staticRoot);
  server.listen(port,'127.0.0.1',()=>console.log('BUILTIN_SERVER_STARTED staticRoot='+path.resolve(staticRoot)));
  server.on('error',err=>{console.error('BUILTIN_SERVER_ERROR:',err.message);process.exitCode=1;});
  return server;
}
module.exports={createStaticServer,start,isProject};
