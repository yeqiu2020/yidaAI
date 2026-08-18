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
  await page.waitForTimeout(15000);

  // Double-click "获取多条数据" node in iframe to open settings panel
  const nodeInfo = await page.evaluate(() => {
    const iframe = document.querySelector('iframe.lc-simulator-content-frame');
    if (!iframe || !iframe.contentDocument) return { found: false };
    const doc = iframe.contentDocument;
    const titles = doc.querySelectorAll('.flow-node-title');
    for (let i = 0; i < titles.length; i++) {
      if (titles[i].textContent?.trim()?.includes('获取多条')) {
        const nodeEl = titles[i].closest('[class*="node"]') || titles[i].parentElement;
        const rect = nodeEl.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();
        return { found: true, x: iframeRect.x + rect.x + rect.width/2, y: iframeRect.y + rect.y + rect.height/2 };
      }
    }
    return { found: false };
  });
  
  console.log('Node info:', JSON.stringify(nodeInfo));
  
  if (nodeInfo.found) {
    // Try double-click
    await page.mouse.dblclick(nodeInfo.x, nodeInfo.y);
    await page.waitForTimeout(3000);
    console.log('Double-clicked');
  }

  // Take screenshot to see if panel opened
  await page.screenshot({ path: 'D:\\panel-dblclick.png' });
  console.log('Screenshot saved');

  // Check if any panel with settings appeared
  const panelTexts = await page.evaluate(() => {
    const results = [];
    const body = document.body;
    const walk = (el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Look for setting panel - should have fields like 获取方式, 表单, etc
      if (r.x > 1100 && r.y > 100 && r.y < 900 && r.width > 30 && r.height > 10) {
        const txt = el.textContent?.trim();
        if (txt && txt.length > 1 && txt.length < 80 && el.children.length <= 1) {
          results.push({ txt: txt.slice(0, 50), x: Math.round(r.x), y: Math.round(r.y) });
        }
      }
      if (el.children) Array.from(el.children).forEach(walk);
    };
    walk(body);
    return results.slice(0, 40);
  });
  console.log('Right area text:', JSON.stringify(panelTexts, null, 2));

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
