/**
 * ��֯��ʼ���ű� - V1.0.0
 * �Զ����˴�ƽ̨��ȡӦ���б������µ������ļ�
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ����
const CONFIG = {
  cookiesFile: 'D:/�˴�AI���/�˴�AI����V1.4/.cookies.json',
  orgConfigFile: 'D:/�˴�AI���/�˴�AI����V1.4/��֯��Ӧ����Ϣ.md',
  baseUrl: 'https://qfhefh.aliwork.com'
};

/**
 * ���� Cookie
 */
function loadCookies() {
  try {
    if (!fs.existsSync(CONFIG.cookiesFile)) {
      console.log('Cookie �ļ�������:', CONFIG.cookiesFile);
      return null;
    }
    const data = JSON.parse(fs.readFileSync(CONFIG.cookiesFile, 'utf-8'));
    return data.cookies || data;
  } catch (e) {
    console.error('���� Cookie ʧ��:', e.message);
    return null;
  }
}

/**
 * ���� Markdown �е�Ӧ�� ID
 */
function updateAppIdInMarkdown(appName, appId) {
  try {
    if (!fs.existsSync(CONFIG.orgConfigFile)) {
      console.log('�����ļ�������');
      return false;
    }
    
    let content = fs.readFileSync(CONFIG.orgConfigFile, 'utf-8');
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(\\|\\s*\\d+\\s*\\|\\s*' + escaped + '\\s*\\|\\s*)[^|]*(\\s*\\|)', 'g');
    
    if (content.match(regex)) {
      content = content.replace(regex, '$1' + (appId || '���ֶ�����') + '$2');
      fs.writeFileSync(CONFIG.orgConfigFile, content);
      console.log('  [OK]', appName, '->', appId || '���ֶ�����');
      return true;
    }
    console.log('  [δ�ҵ�]', appName);
    return false;
  } catch (e) {
    console.error('  [ʧ��]', e.message);
    return false;
  }
}

/**
 * ���˴��ȡӦ���б�
 */
async function fetchApps() {
  console.log('���������...');
  const browser = await chromium.launch({ headless: false });
  
  try {
    const cookies = loadCookies();
    if (!cookies) {
      console.log('����ʹ�� simulated-login skill ��¼');
      return [];
    }
    
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();
    
    console.log('�����ҵ�Ӧ��ҳ��...');
    await page.goto(CONFIG.baseUrl + '/myApp', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    if (page.url().includes('login')) {
      console.log('δ��¼�����ȵ�¼');
      return [];
    }
    
    const apps = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.app-card, [class*="MyCreateAppCard"]');
      
      cards.forEach(card => {
        const titleEl = card.querySelector('[class*="title"], [class*="name"], span[title]');
        const name = titleEl ? titleEl.textContent.trim() : '';
        
        let appId = null;
        card.querySelectorAll('a[href]').forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            const match = href.match(/APP_[A-Z0-9]+/i);
            if (match && !appId) appId = match[0];
          }
        });
        
        if (name) results.push({ name, appId });
      });
      
      return results;
    });
    
    return apps;
  } finally {
    await browser.close();
  }
}

/**
 * ������
 */
async function main() {
  console.log('='.repeat(60));
  console.log('�˴���֯��ʼ������');
  console.log('='.repeat(60));
  
  const apps = await fetchApps();
  if (apps.length === 0) {
    console.log('δ��ȡ��Ӧ��');
    return;
  }
  
  console.log('\n�ҵ�', apps.length, '��Ӧ��:');
  apps.forEach((app, i) => {
    console.log('  ' + (i + 1) + '. ' + app.name + (app.appId ? ' (' + app.appId + ')' : ' (��ID)'));
  });
  
  console.log('\n���������ļ�...');
  let updated = 0;
  for (const app of apps) {
    if (updateAppIdInMarkdown(app.name, app.appId)) updated++;
  }
  
  console.log('\n���! ������', updated, '��Ӧ��');
  console.log('='.repeat(60));
}

if (require.main === module) {
  main().catch(console.error);
}
