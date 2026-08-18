const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

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

  const processCode = 'LPROC-NA766IB1UZ88UK4OJE0R77HE1DD73D4F5TOSMQ';
  const url = `${baseUrl}/alibaba/web/APP_HHYNCIQ5E4UZFSMY4W3F/design/newDesigner.html?processCode=${processCode}&isLogic=true`;
  
  console.log('Navigating to designer...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(15000);
  console.log('Designer loaded');

  // Get the iframe as a Playwright Frame object
  const frameHandle = await page.$('iframe.lc-simulator-content-frame');
  if (!frameHandle) { console.error('No iframe found'); await browser.close(); return; }
  const frame = await frameHandle.contentFrame();
  if (!frame) { console.error('Could not get content frame'); await browser.close(); return; }
  
  console.log('Got iframe content frame');

  // Get bounding box using locator (Playwright's built-in)
  const nodeLoc = frame.locator('.flow-node-title', { hasText: '获取多条数据' });
  const bb = await nodeLoc.boundingBox();
  console.log('Node title bounding box:', JSON.stringify(bb));

  if (bb) {
    // Get iframe bounding box
    const iframeBb = await frameHandle.boundingBox();
    
    // Calculate absolute center coordinates
    const cx = iframeBb.x + bb.x + bb.width / 2;
    const cy = iframeBb.y + bb.y + bb.height / 2;
    console.log(`Node center: ${cx}, ${cy}`);
    
    // Click on empty area first (bottom-left)
    await page.mouse.click(50, 900);
    await page.waitForTimeout(2000);

    // Use frame.click with position relative to the element
    await nodeLoc.click();
    console.log('Clicked via locator');
    await page.waitForTimeout(5000);
    
    // Take screenshot
    await page.screenshot({ path: 'D:\\verify-locator-click.png' });
    console.log('Screenshot saved');
    
    // Search for panel content
    const search = await page.evaluate(() => {
      const mainText = document.body.innerText || '';
      const iframes = document.querySelectorAll('iframe');
      let iframeText = '';
      for (const iframe of iframes) {
        try { if (iframe.contentDocument) iframeText += iframe.contentDocument.body?.innerText || ''; } catch(e) {}
      }
      const combined = mainText + '\n' + iframeText;
      return {
        has从子表中获取: combined.includes('从子表中获取'),
        has从数据节点: combined.includes('从数据节点'),
        has获取方式: combined.includes('获取方式'),
        has请选择数据节点: combined.includes('请选择数据节点'),
        has目标表单: combined.includes('目标表单'),
        has产品规格: combined.includes('产品规格'),
        has规格: combined.includes('规格'),
        has数据过滤: combined.includes('数据过滤'),
        mainTextSample: mainText.slice(0, 400),
      };
    });
    console.log('Search after locator click:', JSON.stringify(search, null, 2));
  }

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
