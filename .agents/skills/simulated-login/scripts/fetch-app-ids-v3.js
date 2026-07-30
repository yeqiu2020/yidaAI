// 版本号：V3
// 修复：使用调试确认有效的选择器
const { chromium } = require("playwright");
const fs = require("fs");
const { loadCookies } = require("./login-manager");

// Phase 6: 消除硬编码绝对路径，改为命令行参数 + 相对路径 fallback
const ORG_CONFIG_FILE_MD = process.argv[2] || require('path').join(__dirname, '..', '..', '..', '..', '组织及应用信息.md');
const baseUrl = "https://qfhefh.aliwork.com";

function updateAppIdInMarkdown(appName, appId) {
  try {
    let mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, "utf-8");
    const escapedAppName = appName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
    const rowRegex = new RegExp("(\\\\|\\\\s*\\\\d+\\\\s*\\\\|\\\\s*" + escapedAppName + "\\\\s*\\\\|\\\\s*)[^|]*(\\\\s*\\\\|)", "g");
    if (mdContent.match(rowRegex)) {
      mdContent = mdContent.replace(rowRegex, "$1" + appId + "$2");
      fs.writeFileSync(ORG_CONFIG_FILE_MD, mdContent);
      console.log("    ✅ 已更新：" + appName + " -> " + appId);
      return true;
    }
    console.log("    ⚠️  未找到应用：" + appName);
    return false;
  } catch (error) {
    console.log("    ❌ 更新失败：" + error.message);
    return false;
  }
}

(async () => {
  console.log("🚀 启动浏览器...");
  const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
  
  try {
    const cookies = loadCookies();
    
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    if (cookies && cookies.length > 0) {
      await context.addCookies(cookies);
      console.log("  ✅ 已加载 " + cookies.length + " 个 Cookie");
    }
    const page = await context.newPage();
    
    console.log("📱 访问我的应用页面...");
    await page.goto(baseUrl + "/myApp", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    
    console.log("🔍 查找应用卡片...");
    const appData = await page.evaluate(() => {
      const cards = document.querySelectorAll(".app-card, [class*=\\\"MyCreateAppCard\\\"]");
      console.log("找到 " + cards.length + " 个应用卡片");
      const results = [];
      cards.forEach(card => {
        const titleElement = card.querySelector("[class*=\\\"title\\\"], [class*=\\\"name\\\"], .card-title, span[title]");
        const appName = titleElement ? titleElement.textContent.trim() : "未知应用";
        const links = card.querySelectorAll("a[href]");
        let appId = null;
        links.forEach(link => {
          const href = link.getAttribute("href");
          if (href) {
            const match = href.match(/APP_[A-Z0-9]+/i);
            if (match) appId = match[0];
          }
        });
        if (appId && appName) results.push({ appName: appName, appId: appId });
      });
      return results;
    });
    
    console.log("\\n📦 找到 " + appData.length + " 个带 ID 的应用");
    console.log("\\n📝 更新组织及应用信息.md...");
    appData.forEach(item => updateAppIdInMarkdown(item.appName, item.appId));
    console.log("\\n✅ 完成！");
  } finally {
    await browser.close();
  }
})();
