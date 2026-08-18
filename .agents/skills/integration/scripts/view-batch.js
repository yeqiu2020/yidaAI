const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  // 阶段二改造：Cookie 优先全局，兼容项目根
  const { findCookieFile } = require('../../../../lib/core/paths');
  const cookieFile = findCookieFile();
  if (!cookieFile) { console.error('未找到 .cookies.json'); process.exit(1); }
  const cookieData = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
  const baseUrl = cookieData.base_url || cookieData.baseUrl || 'https://www.aliwork.com';
  const cookies = Array.isArray(cookieData) ? cookieData : (cookieData.cookies || []);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage();

  const url = `${baseUrl}/alibaba/web/APP_HHYNCIQ5E4UZFSMY4W3F/design/newDesigner.html?processCode=LPROC-5Z9661A1IE88V8AWIGI2F5LVR3LC3423CIOSMC5&isLogic=true`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.resolve(__dirname, 's1-overview.png'), fullPage: false });

  // Use logicSchema to find nodes
  const schema = await page.evaluate(() => window.logicSchema).catch(() => null);
  if (!schema) { console.log('No schema'); await browser.close(); return; }

  const all = [];
  const walk = (n, d) => { if (!n) return; all.push({n, d}); (n.children||[]).forEach(c => walk(c, d+1)); };
  walk(schema, 0);

  const batch = all.find(x => x.n.componentName === 'GetBatchDataNode');
  const single = all.find(x => x.n.componentName === 'GetSingleDataNode');
  console.log('Batch ID:', batch?.n?.id);
  console.log('Single ID:', single?.n?.id);

  // Find canvasDocument frame and wrapper positions
  for (const f of page.frames()) {
    const hasCanvas = await f.evaluate(() => !!window.canvasDocument).catch(() => false);
    if (!hasCanvas) continue;
    const info = await f.evaluate(() => {
      const wrappers = document.querySelectorAll('.simple-flow-canvas-node-wrapper');
      return Array.from(wrappers).map(w => {
        const r = w.getBoundingClientRect();
        const t = (w.querySelector('.node-title') || w.querySelector('[class*="title"]') || {}).textContent || '';
        return { t: t.trim().slice(0, 30), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
      });
    }).catch(() => []);
    console.log('Wrappers:', JSON.stringify(info));

    if (batch) {
      const pos = info.find(n => n.t.includes('多条'));
      if (!pos) {
        console.log('Batch not in wrappers, using logicSchema click simulation');
        // Try to click the third node (rough position based on typical layout)
        if (info.length >= 3) {
          const third = info[2];
          console.log('Clicking third wrapper:', third.x, third.y);
          await page.mouse.click(third.x, third.y);
        }
      } else {
        console.log('Clicking at', pos.x, pos.y);
        await page.mouse.click(pos.x, pos.y);
      }
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.resolve(__dirname, 's2-batch-panel.png'), fullPage: false });
      console.log('Panel screenshot saved');
    }
    break;
  }

  await page.waitForTimeout(3000);
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
