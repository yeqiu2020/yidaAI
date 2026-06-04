#!/usr/bin/env node
/**
 * fetch_forms_playwright.js - 宜搭表单列表获取脚本 (Node.js版本)
 * 版本: 1.2.1
 * 更新日期: 2026-05-17
 *
 * 更新内容:
 * - v1.2.1: 修复流程Code提取逻辑，从第4列(cells[3])提取流程Code
 *          宜搭部署运维表格中，流程Code在独立的第4列，不是和第3列在一起
 * - v1.2.0: 直接从部署运维表格提取processCode，无需API调用
 * - v1.1.2: 简化流程Code获取逻辑，合并到page.evaluate中一次完成
 * - v1.1.1: 修复双重浏览器实例问题，直接使用 ensureLogin 返回的 page 对象
 * - v1.1.0: 集成 simulated-login skill，使用智能登录流程
 * - 自动处理"立即登录"按钮点击、组织选择等操作
 * - 优化登录体验，无需手动扫码等待
 * 
 * 替代原 Python 版本的 fetch_forms_playwright.py
 * 
 * 用法: node fetch_forms_playwright.js <app_id> <app_name> <output_file> <cookie_file> [visual_mode]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 引入 simulated-login 的登录管理器
const loginManager = require('../../simulated-login/scripts/login-manager');

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length < 4) {
  console.error("用法: node fetch_forms_playwright.js <app_id> <app_name> <output_file> <cookie_file> [visual_mode]");
  process.exit(1);
}

const APP_ID = args[0];
const APP_NAME = args[1];
const OUTPUT_FILE = args[2];
const COOKIE_FILE = args[3];
const VISUAL_MODE = args[4] ? args[4].toLowerCase() === 'true' : false;

// 从 Cookie 文件读取 base_url
function getBaseUrlFromCookie() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const cookieData = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      if (cookieData.base_url) {
        return cookieData.base_url;
      }
    }
  } catch (e) {
    console.error(`读取 Cookie 文件失败: ${e.message}`);
  }
  // 默认域名
  return 'https://oksruk.aliwork.com';
}

const BASE_URL = getBaseUrlFromCookie();
const ADMIN_URL = `${BASE_URL}/${APP_ID}/admin`;

// 颜色配置（Node.js 终端颜色）
const Colors = {
  HEADER: "\x1b[95m",
  BLUE: "\x1b[94m",
  CYAN: "\x1b[96m",
  GREEN: "\x1b[92m",
  WARNING: "\x1b[93m",
  FAIL: "\x1b[91m",
  END: "\x1b[0m",
  BOLD: "\x1b[1m"
};

function printStep(stepNum, message) {
  if (VISUAL_MODE) {
    const separator = "=".repeat(80);
    console.log(`\n${Colors.CYAN}${separator}${Colors.END}`);
    console.log(`${Colors.CYAN}  步骤 ${stepNum}: ${message}${Colors.END}`);
    console.log(`${Colors.CYAN}${separator}${Colors.END}`);
  }
}

function printInfo(message) {
  if (VISUAL_MODE) {
    console.log(`${Colors.BLUE}ℹ️  ${message}${Colors.END}`);
  } else {
    console.log(`ℹ️  ${message}`);
  }
}

function printSuccess(message) {
  if (VISUAL_MODE) {
    console.log(`${Colors.GREEN}✅ ${message}${Colors.END}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

function printWarning(message) {
  if (VISUAL_MODE) {
    console.log(`${Colors.WARNING}⚠️  ${message}${Colors.END}`);
  } else {
    console.log(`⚠️  ${message}`);
  }
}

function printHighlight(message) {
  if (VISUAL_MODE) {
    console.log(`${Colors.BOLD}${Colors.CYAN}🔍 ${message}${Colors.END}`);
  } else {
    console.log(`🔍 ${message}`);
  }
}

async function fetchForms() {
  const forms = [];
  let browser = null;
  let page = null;
  
  try {
    // 步骤0: 确保登录态（使用 simulated-login）
    if (VISUAL_MODE) {
      printStep(0, "检查登录状态");
    }
    printInfo("使用 simulated-login 确保登录状态...");
    
    // 使用 ensureLogin 获取已登录的页面
    const loginResult = await loginManager.ensureLogin({
      headless: !VISUAL_MODE,
      targetUrl: ADMIN_URL
    });
    
    // ensureLogin 可能返回两种格式：
    // 1. Cookie 有效时：返回 existingData（包含 cookies, base_url 等）
    // 2. 重新登录后：返回 { success, page, browser, loginState }
    let loginState;
    if (loginResult.success) {
      // 重新登录后的返回格式
      printSuccess(`登录成功: ${loginResult.loginState?.login_user?.userName || '未知用户'}`);
      browser = loginResult.browser;
      page = loginResult.page;
      loginState = loginResult.loginState;
    } else if (loginResult.cookies) {
      // Cookie 验证成功的返回格式
      printSuccess(`使用现有登录态: ${loginResult.login_user?.userName || '未知用户'}`);
      loginState = loginResult;
      
      // 需要启动浏览器并添加 Cookie
      browser = await chromium.launch({
        headless: !VISUAL_MODE,
        slowMo: VISUAL_MODE ? 500 : 0
      });
      
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });
      
      // 添加 Cookie
      if (loginState.cookies && loginState.cookies.length > 0) {
        const cookies = loginState.cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.aliwork.com',
          path: c.path || '/'
        }));
        await context.addCookies(cookies);
        printSuccess(`已加载 ${cookies.length} 个 Cookie`);
      }
      
      page = await context.newPage();
    } else {
      throw new Error('登录失败：无法获取有效的登录态');
    }
    
    // 步骤1: 访问应用管理后台
    if (VISUAL_MODE) {
      printStep(1, `访问应用管理后台 - ${APP_NAME}`);
    }
    printInfo(`URL: ${ADMIN_URL}`);
    
    // 确保我们在正确的页面上
    const currentUrl = page.url();
    if (!currentUrl.includes(APP_ID)) {
      printInfo("导航到应用管理后台...");
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);
    } else {
      printSuccess("已在应用管理后台页面");
    }
    
    // 步骤2: 点击应用设置
    if (VISUAL_MODE) {
      printStep(2, "点击应用设置菜单");
    }
    printInfo("正在查找应用设置按钮...");
    
    const settingSelectors = [
      "text=应用设置",
      'a:has-text("应用设置")',
      'div:has-text("应用设置")',
      '[class*="setting"]',
      'button:has-text("设置")'
    ];
    
    for (const selector of settingSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          if (VISUAL_MODE) {
            await element.highlight();
            await page.waitForTimeout(500);
          }
          await element.click();
          printSuccess(`已点击: ${selector}`);
          break;
        }
      } catch (e) {
        // ignore
      }
    }
    
    await page.waitForTimeout(3000);
    
    // 步骤3: 点击部署运维
    if (VISUAL_MODE) {
      printStep(3, "点击部署运维菜单");
    }
    printInfo("正在查找部署运维按钮...");
    
    const deploySelectors = [
      "text=部署运维",
      'a:has-text("部署运维")',
      'div:has-text("部署运维")',
      '[class*="deploy"]',
      'li:has-text("部署运维")'
    ];
    
    for (const selector of deploySelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          if (VISUAL_MODE) {
            await element.highlight();
            await page.waitForTimeout(500);
          }
          await element.click();
          printSuccess(`已点击: ${selector}`);
          break;
        }
      } catch (e) {
        // ignore
      }
    }
    
    await page.waitForTimeout(5000);
    
    // 步骤4: 提取表单列表
    if (VISUAL_MODE) {
      printStep(4, "提取表单列表数据");
    }
    printInfo("正在等待页面加载完成...");
    
    // 等待页面完全加载
    await page.waitForLoadState('networkidle');
    
    // 可视化模式下高亮表格
    if (VISUAL_MODE) {
      try {
        const table = await page.locator('table, .ant-table').first();
        if (await table.isVisible().catch(() => false)) {
          await table.highlight();
          printInfo("已高亮显示表格区域");
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // ignore
      }
    }
    
    printInfo("正在提取表单数据...");
    
    // 从页面提取表单数据
    const formsData = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll("table tbody tr, .ant-table-row, tr");
      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 3) {
          const name = cells[0].textContent.trim();
          const type = cells[1].textContent.trim();
          const codeCell = cells[2].textContent.trim();
          const formMatch = codeCell.match(/FORM-[A-F0-9]{32}[A-Z0-9]{4}/);
          // 流程Code可能在第4列(cells[3])，也可能和第3列在一起
          let processCode = null;
          if (cells.length >= 4) {
            const processCell = cells[3].textContent.trim();
            const processMatch = processCell.match(/TPROC-[A-Z0-9-]+/);
            if (processMatch) {
              processCode = processMatch[0];
            }
          }
          // 如果第4列没有，尝试在第3列查找
          if (!processCode) {
            const processMatch = codeCell.match(/TPROC-[A-Z0-9-]+/);
            if (processMatch) {
              processCode = processMatch[0];
            }
          }
          if (formMatch && name.length > 0) {
            results.push({
              name: name,
              type: type,
              formUuid: formMatch[0],
              processCode: processCode
            });
          }
        }
      });
      return results;
    });
    
    if (formsData && formsData.length > 0) {
      forms.push(...formsData);
      printSuccess(`成功提取 ${forms.length} 个表单`);
      
      // 可视化模式下显示提取的表单
      if (VISUAL_MODE) {
        printHighlight("提取到的表单列表:");
        forms.forEach((form, i) => {
          console.log(`  ${i + 1}. ${form.name} (${form.type}) - ${form.formUuid.substring(0, 20)}...`);
        });
      }
    } else {
      printWarning("未能从表格提取数据，尝试从页面文本提取...");
      
      const content = await page.content();
      const formMatches = content.match(/FORM-[A-F0-9]{32}[A-Z0-9]{4}/g) || [];
      const procMatches = content.match(/TPROC-[A-F0-9]{32}[A-Z0-9]{4}/g) || [];
      
      // 使用正则表达式匹配中文表单名
      const pattern = /([\u4e00-\u9fa5]{2,20})[\s\S]*?(表单|流程)[\s\S]*?(FORM-[A-F0-9]{32}[A-Z0-9]{4})/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        forms.push({
          name: match[1],
          type: match[2],
          formUuid: match[3],
          processCode: null
        });
      }
      
      if (forms.length > 0) {
        printSuccess(`从页面文本提取到 ${forms.length} 个表单`);
      }
    }
    
    // 步骤5: 验证应用编码
    if (VISUAL_MODE) {
      printStep(5, "验证应用编码");
    }
    
    const pageText = await page.evaluate(() => document.body.innerText);
    const appCodeMatch = pageText.match(/APP_[A-Z0-9]+/);
    
    if (appCodeMatch) {
      const foundAppCode = appCodeMatch[0];
      printInfo(`页面应用编码: ${foundAppCode}`);
      
      if (foundAppCode === APP_ID) {
        printSuccess("应用编码验证通过");
      } else {
        printWarning(`应用编码不一致! 期望: ${APP_ID}, 实际: ${foundAppCode}`);
      }
    } else {
      printWarning("未能从页面提取应用编码");
    }
    
    // 保存结果
    if (forms.length > 0) {
      const output = {
        appId: APP_ID,
        appName: APP_NAME,
        forms: forms,
        count: forms.length,
        visualMode: VISUAL_MODE
      };
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    }
    
    // 可视化模式下保持浏览器打开
    if (VISUAL_MODE) {
      printStep(6, "同步完成");
      printInfo("浏览器将保持打开5秒，供您查看结果...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    await browser.close();
    
    if (VISUAL_MODE) {
      printSuccess("浏览器已关闭");
    }
    
    return forms;
    
  } catch (e) {
    console.error(`\n❌ 错误: ${e.message}`);
    
    // 可视化模式下保存截图
    if (VISUAL_MODE && page) {
      try {
        const screenshotFile = path.join(path.dirname(OUTPUT_FILE), "error_screenshot.png");
        await page.screenshot({ path: screenshotFile, fullPage: true });
        printInfo(`错误截图已保存: ${screenshotFile}`);
      } catch (screenshotError) {
        // ignore
      }
      
      printInfo("按Enter键关闭浏览器...");
      // Node.js 等待用户输入
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
    }
    
    if (browser) {
      await browser.close();
    }
    return [];
  }
}

// 主函数
async function main() {
  const forms = await fetchForms();
  console.log(JSON.stringify(forms, null, 2));
}

// 运行
main().catch(e => {
  console.error(`错误: ${e.message}`);
  process.exit(1);
});

// 导出供其他模块使用
module.exports = { fetchForms };
