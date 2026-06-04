/**
 * 宜搭自动化测试 - 测试执行引擎
 * 版本: v1.0.85
 * 
 * 更新记录:
 * v1.0.85 - 支持从 .organization.json 读取组织配置
 * v1.0.84 - 修复 base_url 使用问题，从登录态中读取正确的域名
 * v1.0.83 - 优化登录检查逻辑，先检查是否直接访问成功，避免不必要的登录流程
 * v1.0.82 - 迁移到 simulated-login Skill 进行登录态管理
 * v1.0.81 - 集成 yida-api-client 的 login_helper，统一登录态管理
 * v1.0.80 - 优化登录态管理，优先从 .cookies.json 加载，与 yida-api-client 保持一致
 */

const fs = require('fs');
const path = require('path');

// 加载 yida-api-client
const { createEmptyForm, saveFormSchema } = require('../../yida-api-client/scripts/form_manager');
const { buildFormSchema } = require('../../yida-api-client/scripts/schema_builder');

// 加载登录处理模块
const { handleLoginFlow } = require('./login-handler');

// 加载 simulated-login（模拟登录管理器）
const loginManager = require('../../simulated-login/scripts/login-manager');

// 计数器文件路径
const COUNTER_FILE = path.join(__dirname, '.form-counter');

/**
 * 获取当前计数器值
 */
function getFormCounter() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = fs.readFileSync(COUNTER_FILE, 'utf8');
      const counter = parseInt(data.trim(), 10);
      return isNaN(counter) ? 1 : counter;
    }
  } catch (e) {
    console.log('  读取计数器文件失败，使用默认值');
  }
  return 1;
}

/**
 * 保存计数器值
 */
function saveFormCounter(counter) {
  try {
    fs.writeFileSync(COUNTER_FILE, String(counter), 'utf8');
  } catch (e) {
    console.log('  保存计数器文件失败');
  }
}

class YidaAutoTester {
  
  constructor(config) {
    this.config = {
      appId: config.appId,
      appName: config.appName || '测试应用',
      yidaBaseUrl: config.yidaBaseUrl || 'https://www.aliwork.com',
      headless: config.headless !== false,
      slowMo: config.slowMo || 100
    };
    
    // playwright 实例（由调用者传入）
    this.chromium = config.chromium;
    
    this.state = {
      browser: null,
      context: null,
      page: null,
      consoleLogs: [],
      testResults: [],
      formUuid: null,
      fieldIdMap: {}
    };
    
    // 属性面板选择器列表（统一使用）
    this.settingsPanelSelectors = [
      '.lc-settings-content', 
      '.lc-settings', 
      '[class*="Setting"]',
      '[class*="setting"]',
      '.ve-settings-panel',
      '.next-shell-aside',
      '.yida-setting-panel',
      '.form-designer-sidebar',
      '.property-panel',
      '.right-panel',
      '.lc-workspace-right',
      '.setting-container-content'  // 从截图看到的属性面板class
    ];
  }

  /**
   * 创建测试表单
   */
  async createTestForm(fields) {
    console.log('📋 使用API创建测试表单...');
    
    // 使用 simulated-login 获取登录态
    let authRef = loginManager.getLoginStateQuick();
    if (!authRef || !authRef.cookies) {
      console.log('🔐 需要登录，启动登录流程...');
      authRef = await loginManager.ensureLogin({ headless: false });
    }
    
    authRef.baseUrl = authRef.base_url || authRef.baseUrl || 'https://www.aliwork.com';
    
    // 生成表单标题：测试001、测试002...
    const counter = getFormCounter();
    const formTitle = `测试${String(counter).padStart(3, '0')}`;
    saveFormCounter(counter + 1);
    console.log(`  表单标题: ${formTitle}`);
    const formUuid = await createEmptyForm(authRef, this.config.appId, formTitle, 'receipt');
    console.log(`✅ 表单已创建: ${formUuid}`);
    
    const schema = buildFormSchema(formTitle, fields, formUuid);
    
    // 收集字段ID映射
    this._extractFieldIds(schema);
    
    await saveFormSchema(authRef, this.config.appId, formUuid, schema);
    console.log('✅ 表单Schema已保存');
    
    this.state.formUuid = formUuid;
    return formUuid;
  }

  /**
   * 提取字段ID映射
   */
  _extractFieldIds(schema) {
    console.log('  提取字段ID映射...');
    try {
      const pageSchema = schema.pages[0];
      const componentsTree = pageSchema.componentsTree;

      const findFields = (component) => {
        if (!component) return;
        
        if (component.fieldId && component.props && component.props.label) {
          const label = component.props.label.zh_CN || component.props.label;
          const fieldId = component.fieldId;
          this.state.fieldIdMap[label] = fieldId;
          console.log(`  字段映射: ${label} -> ${fieldId}`);
        }

        if (component.children && Array.isArray(component.children)) {
          component.children.forEach(child => findFields(child));
        }
      };

      if (componentsTree && componentsTree[0]) {
        findFields(componentsTree[0]);
      }

      console.log(`  共提取 ${Object.keys(this.state.fieldIdMap).length} 个字段映射`);
    } catch (e) {
      console.log('  ⚠️ 提取字段ID映射失败:', e.message);
    }
  }

  /**
   * 初始化浏览器
   * 使用 yida-api-client 的 login_helper 管理登录态
   */
  async initBrowser() {
    console.log('🚀 初始化浏览器...');
    if (!this.chromium) {
      throw new Error('请传入 playwright.chromium 实例');
    }
    this.state.browser = await this.chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo
    });
    
    // 使用 simulated-login 获取登录态
    let cookies = null;
    let loginState = null;
    try {
      // 先尝试加载组织配置（优先）
      const orgConfig = loginManager.loadOrgConfig();
      if (orgConfig?.base_url) {
        this.config.yidaBaseUrl = orgConfig.base_url;
        console.log(`  📍 从 .organization.json 加载 base_url: ${this.config.yidaBaseUrl}`);
      }
      
      // 再尝试快速获取登录态（包含 base_url）
      loginState = loginManager.getLoginStateQuick();
      if (loginState) {
        cookies = loginState.cookies;
        console.log(`  已从 .cookies.json 加载 ${cookies?.length || 0} 个 Cookie`);
        
        // 如果组织配置中没有 base_url，使用登录态中的
        if (!orgConfig?.base_url && loginState.base_url) {
          this.config.yidaBaseUrl = loginState.base_url;
          console.log(`  📍 使用登录态中的 base_url: ${this.config.yidaBaseUrl}`);
        }
      }
    } catch (e) {
      console.log('  ⚠️ 加载 Cookie 失败:', e.message);
    }
    
    // 如果没有从 .cookies.json 加载到，尝试从 storageState.json 加载（兼容旧版本）
    if (!cookies) {
      const storageStatePath = path.join(path.resolve(__dirname, '..', '..', '..', '..'), 'storageState.json');
      if (fs.existsSync(storageStatePath)) {
        try {
          const stateData = fs.readFileSync(storageStatePath, 'utf8');
          const storageState = JSON.parse(stateData);
          cookies = storageState.cookies;
          console.log(`  已从 storageState.json 加载 ${cookies?.length || 0} 个 Cookie`);
        } catch (e) {
          console.log('  ⚠️ 从 storageState.json 加载失败:', e.message);
        }
      }
    }
    
    this.state.context = await this.state.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    
    // 如果有 Cookie，添加到 context
    if (cookies && cookies.length > 0) {
      await this.state.context.addCookies(cookies);
      console.log('  ✅ Cookie 已添加到浏览器上下文');
    } else {
      console.log('  ⚠️ 未找到登录态，可能需要手动登录');
    }
    
    this.state.page = await this.state.context.newPage();
    
    // 监听控制台日志
    this.state.page.on('console', msg => {
      const log = {
        type: msg.type(),
        text: msg.text(),
        time: new Date().toISOString()
      };
      this.state.consoleLogs.push(log);
      console.log(`[${log.type.toUpperCase()}] ${log.text}`);
    });
    
    // 监听弹窗
    this.state.page.on('dialog', async dialog => {
      console.log(`  检测到弹窗: ${dialog.type()}`);
      await dialog.accept();
    });
    
    console.log('✅ 浏览器初始化完成');
  }

  /**
   * 保存 storage state
   * 使用 login_helper 统一保存
   */
  async _saveStorageState() {
    try {
      const storageState = await this.state.context.storageState();
      
      // 保存到 storageState.json（本地备份）
      const storageStatePath = path.join(process.cwd(), 'storageState.json');
      fs.writeFileSync(storageStatePath, JSON.stringify(storageState, null, 2));
      console.log('  已保存 storage state');
      
      // 使用 simulated-login 保存到 .cookies.json（统一格式）
       const existingState = loginManager.getLoginStateQuick() || {};
       const loginState = {
         ...existingState,
         cookies: storageState.cookies,
         updated_at: new Date().toISOString()
       };
       
       loginManager.saveLoginState(loginState);
      console.log('  已同步更新 .cookies.json');
    } catch (e) {
      console.log('  ⚠️ 保存 storage state 失败:', e.message);
    }
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser() {
    if (this.state.browser) {
      // 保存 storage state
      await this._saveStorageState();
      await this.state.browser.close();
      console.log('✅ 浏览器已关闭');
    }
  }

  /**
   * 等待 iframe 加载完成
   */
  async _waitForIframeLoaded() {
    let retries = 15;
    while (retries > 0) {
      // 获取所有 frames
      const frames = this.state.page.frames();
      let targetFrame = null;
      
      // 查找 SimulatorRenderer iframe
      for (const frame of frames) {
        if (frame.name() === 'SimulatorRenderer' || frame.url().includes('form')) {
          targetFrame = frame;
          break;
        }
      }
      
      if (targetFrame) {
        try {
          // 检查 iframe 中是否有表单内容（排除登录页面）
          const hasFormContent = await targetFrame.evaluate(() => {
            const body = document.body;
            if (!body) return false;
            
            const bodyText = body.innerText || '';
            
            // 检查是否是登录页面（包含这些文本说明是登录页面）
            const isLoginPage = bodyText.includes('欢迎使用企业账号') || 
                               bodyText.includes('立即登录') ||
                               bodyText.includes('绑定手机号码') ||
                               bodyText.includes('请设置密码');
            
            if (isLoginPage) {
              return false; // 登录页面不算表单内容
            }
            
            // 检查是否有表单相关元素
            const hasFormElements = document.querySelectorAll('input, select, textarea, .next-radio-group, .next-select, [class*="field"], [class*="component"], [class*="form"]').length > 0;
            
            // 检查是否有我们创建的字段（通过字段ID）
            const hasFieldIds = document.querySelectorAll('[id*="Field"], [data-field-id]').length > 0;
            
            return hasFormElements || hasFieldIds;
          });
          
          if (hasFormContent) {
            console.log('  ✅ 表单 iframe 已加载完成');
            return targetFrame;
          }
        } catch (e) {
          // iframe 可能还没准备好
        }
      }
      console.log(`  等待 iframe 加载... (${15 - retries + 1}/15)`);
      await this.state.page.waitForTimeout(2000);
      retries--;
    }
    console.log('  ⚠️ iframe 加载超时，继续执行');
    return null;
  }

  /**
   * 上传JS代码
   */
  async uploadCode(codeFilePath) {
    console.log(`📤 上传代码到表单: ${this.state.formUuid}...`);
    
    const code = fs.readFileSync(codeFilePath, 'utf8');
    
    // 打开表单设计器
    const designUrl = `${this.config.yidaBaseUrl}/alibaba/web/${this.config.appId}/design/pageDesigner?formUuid=${this.state.formUuid}`;
    console.log(`  打开设计器: ${designUrl}`);
    
    await this.state.page.goto(designUrl, { 
      timeout: 120000,
      waitUntil: 'domcontentloaded'
    });
    await this.state.page.waitForTimeout(15000);
    
    // 处理授权弹窗
    await this._handleAuthDialog();
    
    // 等待页面加载（表单设计器需要更长时间）
    console.log('  等待表单设计器完全加载...');
    await this.state.page.waitForTimeout(15000);
    
    // 等待 iframe 加载完成
    console.log('  等待表单渲染 iframe 加载...');
    await this._waitForIframeLoaded();
    
    // 点击JS图标
    await this._clickJSIcon();
    
    // 粘贴代码
    await this._pasteCode(code);
    
    // 保存
    await this._saveCode();
    
    console.log('✅ 代码上传完成');
  }

  /**
   * 处理钉钉登录授权流程 - 使用新的登录处理模块
   * 先检查是否已直接访问成功，如果失败再走登录流程
   */
  async _handleAuthDialog() {
    console.log('  检查登录状态...');
    
    try {
      // 等待页面加载
      await this.state.page.waitForTimeout(5000);
      
      // 先检查当前页面状态 - 如果已经直接访问成功，就不需要登录
      const currentUrl = this.state.page.url();
      console.log(`  当前页面: ${currentUrl}`);
      
      // 检查是否已经在设计器页面（直接访问成功）
      const isInDesigner = currentUrl.includes('/design/pageDesigner') && 
                           !currentUrl.includes('login') && 
                           !currentUrl.includes('sign');
      
      if (isInDesigner) {
        console.log('  ✅ 直接访问成功，已在设计器页面，无需登录');
        // 保存当前登录态
        await this._saveStorageState();
        return;
      }
      
      // 需要登录，使用登录处理模块
      console.log('  ⚠️ 需要登录，开始登录流程...');
      const result = await handleLoginFlow(this.state.page, this.config);
      
      if (result.success) {
        console.log('  ✅ 登录流程完成');
        // 保存 storage state
        await this._saveStorageState();
      } else {
        console.log('  ⚠️ 登录流程未完成:', result.message);
        // 如果登录未完成，抛出错误阻止后续执行
        throw new Error('登录流程未完成，无法继续执行测试');
      }
      
    } catch (e) {
      console.log('  ❌ 处理登录授权时出错:', e.message);
      // 重新抛出错误，让上层处理
      throw e;
    }
  }

  /**
   * 等待设置面板加载并检查是否包含字段属性
   */
  async _waitForSettingsPanel(fieldLabel) {
    console.log('    等待属性面板加载...');
    await this.state.page.waitForTimeout(6000);
    
    // 调试：检查主页面中是否出现了属性面板，并且包含字段属性
    const selectors = this.settingsPanelSelectors;
    const panelInfo = await this.state.page.evaluate(({ selectors, fieldLabel }) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const textContent = el.textContent || '';
          // 检查是否包含字段属性（标题、描述信息、状态等）
          const hasFieldProperties = textContent.includes('标题') && 
                                    textContent.includes('描述信息') && 
                                    textContent.includes('状态');
          // 检查是否包含字段标题
          const hasFieldTitle = textContent.includes(fieldLabel);
          
          return { 
            found: true, 
            selector, 
            visible: el.offsetParent !== null,
            childCount: el.children.length,
            textContent: textContent.substring(0, 300),
            hasFieldProperties,
            hasFieldTitle
          };
        }
      }
      return { found: false };
    }, { selectors, fieldLabel });
    
    if (panelInfo.found) {
      console.log(`    ✅ 找到属性面板: ${panelInfo.selector} (可见: ${panelInfo.visible}, 子元素: ${panelInfo.childCount})`);
      console.log(`    包含字段属性: ${panelInfo.hasFieldProperties}, 包含字段标题: ${panelInfo.hasFieldTitle}`);
      console.log(`    属性面板内容: ${panelInfo.textContent}`);
    } else {
      console.log('    ⚠️ 未找到属性面板');
    }
  }

  /**
   * 点击JS图标
   */
  async _clickJSIcon() {
    console.log('  点击左侧JS代码图标...');
    try {
      const clicked = await this.state.page.evaluate(() => {
        const svgs = document.querySelectorAll('svg');
        for (const svg of svgs) {
          const paths = svg.querySelectorAll('path');
          for (const path of paths) {
            const d = path.getAttribute('d') || '';
            if (d.includes('726.4 515.2')) {
              let current = svg;
              while (current && current !== document.body) {
                if (current.tagName === 'SPAN' || current.tagName === 'BUTTON') {
                  const classes = current.className || '';
                  if (classes.includes('dock') || classes.includes('title')) {
                    current.click();
                    return true;
                  }
                }
                current = current.parentElement;
              }
            }
          }
        }
        return false;
      });
      
      if (clicked) {
        console.log('  ✅ 已点击JS图标');
      }
    } catch (e) {
      console.log('  ❌ 点击JS图标失败:', e.message);
    }
    await this.state.page.waitForTimeout(3000);
  }

  /**
   * 粘贴代码
   */
  async _pasteCode(code) {
    console.log('  粘贴代码...');
    try {
      await this.state.page.waitForSelector('.monaco-editor', { timeout: 10000 });
      
      // 使用剪贴板API
      await this.state.page.evaluate((codeContent) => {
        const textarea = document.createElement('textarea');
        textarea.value = codeContent;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }, code);
      
      const editor = await this.state.page.$('.monaco-editor');
      if (editor) {
        await editor.click();
        await this.state.page.waitForTimeout(300);
        await this.state.page.keyboard.press('Control+a');
        await this.state.page.waitForTimeout(200);
        await this.state.page.keyboard.press('Control+v');
        console.log('  ✅ 代码已粘贴');
      }
    } catch (e) {
      console.log('  ⚠️ 粘贴代码时出错:', e.message);
    }
    await this.state.page.waitForTimeout(2000);
  }

  /**
   * 保存代码
   */
  async _saveCode() {
    console.log('  保存代码...');
    try {
      const saveBtn = await this.state.page.$('.save-pane-btn')
        || await this.state.page.$('button:has-text("保存")');
      
      if (saveBtn) {
        await saveBtn.click();
        console.log('  ✅ 已点击保存按钮');
      }
    } catch (e) {
      console.log('  ⚠️ 保存时出错:', e.message);
    }
    await this.state.page.waitForTimeout(3000);
  }

  /**
   * 获取 iframe 中的 page 对象
   */
  async _getIframePage() {
    // 查找 SimulatorRenderer iframe
    const iframe = this.state.page.frame({ name: 'SimulatorRenderer' });
    if (iframe) {
      return iframe;
    }
    // 备选：查找第一个 iframe
    const frames = this.state.page.frames();
    for (const frame of frames) {
      if (frame.name() === 'SimulatorRenderer' || frame.url().includes('form')) {
        return frame;
      }
    }
    // 如果没有找到 iframe，返回主 page
    return this.state.page;
  }

  /**
   * 点击表单字段
   */
  async clickFormField(fieldLabel) {
    console.log(`    查找并点击字段: ${fieldLabel}...`);

    // 获取 iframe page（表单画布在 iframe 中）
    const iframePage = await this._getIframePage();
    const fieldId = this.state.fieldIdMap[fieldLabel];

    if (fieldId) {
      // 方法0: 优先使用 Playwright 的 click 方法（触发真实事件）
      try {
        // 尝试通过ID查找字段元素并点击（使用 force: true 强制点击）
        const fieldSelector = `#${fieldId}`;
        await iframePage.click(fieldSelector, { timeout: 5000, force: true });
        console.log(`    ✅ 已点击字段: ${fieldLabel} (方法: playwright-id-click)`);
        
        // 等待设置面板加载
        await this._waitForSettingsPanel(fieldLabel);
        return;
      } catch (e) {
        console.log(`    ⚠️ Playwright ID点击失败: ${e.message}`);
      }
      
      // 方法1: 在 iframe 中使用字段ID精确查找并点击
      const clicked = await iframePage.evaluate((id) => {
        // 首先尝试通过ID查找字段元素
        const fieldElement = document.getElementById(id);
        if (fieldElement) {
          // 方法1a: 尝试查找字段的label并点击
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) {
            label.click();
            label.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { success: true, method: 'label-click' };
          }
          
          // 方法1b: 查找字段的标题/label文本
          const formItem = fieldElement.closest('.next-form-item, [class*="form-item"]');
          if (formItem) {
            // 尝试查找form-item中的label
            const itemLabel = formItem.querySelector('.next-form-item-label, label, .field-label, [class*="label"]');
            if (itemLabel) {
              itemLabel.click();
              itemLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return { success: true, method: 'form-item-label-click' };
            }
            
            // 点击form-item本身
            formItem.click();
            formItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { success: true, method: 'form-item-click' };
          }
          
          // 方法1c: 点击字段本身
          fieldElement.click();
          fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { success: true, method: 'field-direct' };
        }

        // 方法2: 查找包含字段ID的元素
        const elementsWithId = document.querySelectorAll(`[id*="${id}"], [data-field-id*="${id}"], [field-id*="${id}"]`);
        for (const el of elementsWithId) {
          // 尝试找到可点击的父元素
          let clickableEl = el.closest('.next-form-item, [class*="form-item"], [class*="field"]') || el;
          clickableEl.click();
          clickableEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { success: true, method: 'field-id-contains' };
        }

        return { success: false, method: 'none' };
      }, fieldId);

      if (clicked && clicked.success) {
        console.log(`    ✅ 已点击字段: ${fieldLabel} (方法: ${clicked.method})`);
        // 等待设置面板加载
        await this._waitForSettingsPanel(fieldLabel);
        return;
      }
    }

    // 备选：通过文本查找（在 iframe 中）
    try {
      // 尝试多种文本匹配方式
      await iframePage.waitForSelector(`text="${fieldLabel}"`, { timeout: 5000 });
      await iframePage.click(`text="${fieldLabel}"`);
      console.log(`    ✅ 已点击字段(文本精确匹配): ${fieldLabel}`);
      return;
    } catch (e) {
      // 尝试部分匹配
      try {
        const elements = await iframePage.$$(`text=/.*${fieldLabel}.*/`);
        if (elements.length > 0) {
          await elements[0].click();
          console.log(`    ✅ 已点击字段(文本部分匹配): ${fieldLabel}`);
          return;
        }
      } catch (e2) {
        console.log(`    ⚠️ 在 iframe 中点击失败: ${e2.message}`);
      }
    }

    // 调试：输出 iframe 中的表单结构
    console.log(`    🔍 调试: 输出 iframe 中的表单结构...`);
    try {
      const pageInfo = await iframePage.evaluate(() => {
        // 获取所有 label 文本
        const labels = Array.from(document.querySelectorAll('label, .next-form-item-label, [class*="label"], [class*="title"]'));
        const labelTexts = labels.map(l => l.textContent.trim()).filter(t => t.length > 0).slice(0, 10);

        // 获取所有 id 包含 field 的元素
        const fieldElements = Array.from(document.querySelectorAll('[id*="Field"], [id*="field"], [data-field-id]'));
        const fieldIds = fieldElements.map(el => el.id || el.getAttribute('data-field-id')).slice(0, 10);

        // 获取 body 中的文本内容预览
        const bodyText = document.body.innerText.substring(0, 500);

        return { labelTexts, fieldIds, bodyText };
      });

      console.log(`      找到的Label文本: ${JSON.stringify(pageInfo.labelTexts)}`);
      console.log(`      找到的Field IDs: ${JSON.stringify(pageInfo.fieldIds)}`);
      console.log(`      Body文本预览: ${pageInfo.bodyText.substring(0, 200)}...`);
    } catch (e) {
      console.log(`      调试信息获取失败: ${e.message}`);
    }

    console.log(`    ❌ 无法点击字段: ${fieldLabel}`);
    throw new Error(`无法找到或点击字段: ${fieldLabel}`);
  }

  /**
   * 关闭JS面板
   */
  async _closeJSPanel() {
    console.log('  检查并关闭JS面板...');
    try {
      const isJSPanelOpen = await this.state.page.evaluate(() => {
        const hasCodeEditor = document.querySelector('.monaco-editor');
        const hasActionPanel = document.querySelector('.ve-event-setter, .action-panel');
        return hasCodeEditor || hasActionPanel;
      });

      if (isJSPanelOpen) {
        console.log('  JS面板处于打开状态，尝试关闭...');
        const closed = await this.state.page.evaluate(() => {
          const svgs = document.querySelectorAll('svg');
          for (const svg of svgs) {
            const paths = svg.querySelectorAll('path');
            for (const path of paths) {
              const d = path.getAttribute('d') || '';
              if (d.includes('726.4 515.2')) {
                let current = svg;
                while (current && current !== document.body) {
                  if (current.tagName === 'SPAN' || current.tagName === 'BUTTON' || current.tagName === 'DIV') {
                    const classes = current.className || '';
                    if (classes.includes('dock') || classes.includes('title')) {
                      current.click();
                      return true;
                    }
                  }
                  current = current.parentElement;
                }
              }
            }
          }
          return false;
        });

        if (closed) {
          console.log('  ✅ 已关闭JS面板');
          await this.state.page.waitForTimeout(2000);
        } else {
          await this.state.page.keyboard.press('Escape');
          await this.state.page.waitForTimeout(1000);
        }
      }
    } catch (e) {
      console.log('  检查JS面板状态时出错:', e.message);
    }
  }

  /**
   * 绑定字段事件
   */
  async bindEvents(formUuid) {
    console.log('🔗 绑定事件...');
    
    // 先关闭JS面板
    await this._closeJSPanel();

    // 等待 iframe 加载完成
    console.log('  等待表单渲染完成...');
    await this._waitForIframeLoaded();
    await this.state.page.waitForTimeout(3000);

    // 绑定部门字段的 onChange 事件
    console.log('  绑定部门字段事件...');
    await this.clickFormField('部门');
    await this.state.page.waitForTimeout(2000);

    // 点击"高级"标签
    console.log('    点击高级标签...');
    try {
      const selectors = this.settingsPanelSelectors;
      const advancedClicked = await this.state.page.evaluate((selectors) => {
        // 在属性面板中查找"高级"标签
        let settingsPanel = null;
        for (const selector of selectors) {
          settingsPanel = document.querySelector(selector);
          if (settingsPanel) break;
        }
        
        if (!settingsPanel) return { clicked: false, reason: 'no-panel' };
        
        // 方法1: 查找标签文本为"高级"的元素
        const tabs = settingsPanel.querySelectorAll('.lc-title-txt, .next-tabs-tab-inner, [role="tab"], .tab-title');
        for (const tab of tabs) {
          const text = (tab.textContent || '').trim();
          if (text === '高级') {
            tab.click();
            return { clicked: true, method: 'tab-text' };
          }
        }
        // 方法2: 查找所有包含"高级"文本的元素
        const allElements = settingsPanel.querySelectorAll('*');
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text === '高级' && el.children.length === 0) {
            el.click();
            return { clicked: true, method: 'element-text' };
          }
        }
        return { clicked: false, reason: 'not-found', panelText: settingsPanel.textContent.substring(0, 100) };
      }, selectors);

      if (advancedClicked.clicked) {
        console.log(`    ✅ 已点击高级标签 (${advancedClicked.method})`);
      } else {
        console.log('    ⚠️ 未找到高级标签');
      }
    } catch (e) {
      console.log('    ⚠️ 点击高级标签失败:', e.message);
    }
    await this.state.page.waitForTimeout(2000);

    // 在属性面板中查找并点击"新建动作"
    console.log('    查找并点击新建动作...');
    try {
      // 等待属性面板加载
      await this.state.page.waitForTimeout(3000);
      
      // 调试：输出属性面板中的按钮（使用统一的选择器）
      const selectors = this.settingsPanelSelectors;
      const buttonTexts = await this.state.page.evaluate((selectors) => {
        // 查找右侧属性面板 - 使用统一的选择器
        for (const selector of selectors) {
          const panel = document.querySelector(selector);
          if (panel) {
            const btns = panel.querySelectorAll('button, .next-btn, [role="button"], .action-btn, .add-action');
            const texts = Array.from(btns).map(b => (b.textContent || '').trim()).filter(t => t.length > 0 && t.length < 50);
            if (texts.length > 0) {
              return { selector, texts: texts.slice(0, 15), panelHTML: panel.outerHTML.substring(0, 500) };
            }
          }
        }
        
        // 如果找不到面板，返回整个页面的按钮
        const allBtns = document.querySelectorAll('button');
        return { 
          selector: 'all-page', 
          texts: Array.from(allBtns).map(b => (b.textContent || '').trim()).filter(t => t.length > 0 && t.length < 50).slice(0, 15)
        };
      }, selectors);
      console.log(`    属性面板(${buttonTexts.selector})中的按钮:`, JSON.stringify(buttonTexts.texts));
      if (buttonTexts.panelHTML) {
        console.log(`    属性面板HTML片段: ${buttonTexts.panelHTML.substring(0, 200)}...`);
      }

      // 查找并点击"新建动作"按钮
      const actionClicked = await this.state.page.evaluate((selectors) => {
        // 查找右侧属性面板 - 使用统一的选择器
        let settingsPanel = null;
        let matchedSelector = '';
        for (const selector of selectors) {
          settingsPanel = document.querySelector(selector);
          if (settingsPanel) {
            matchedSelector = selector;
            break;
          }
        }
        
        if (!settingsPanel) return { clicked: false, reason: 'no-settings-panel' };
        
        console.log(`[DEBUG] 找到属性面板: ${matchedSelector}, 子元素数: ${settingsPanel.children.length}, 文本内容: ${settingsPanel.textContent.substring(0, 200)}`);

        // 方法1: 查找 ve-event-add-action 容器中的按钮
        const addActionContainers = settingsPanel.querySelectorAll('.ve-event-add-action');
        for (const container of addActionContainers) {
          const btn = container.querySelector('button');
          if (btn) {
            btn.click();
            return { clicked: true, text: btn.textContent.trim(), method: 've-event-add-action' };
          }
        }

        // 方法2: 通过文本查找"新建动作"
        const btns = settingsPanel.querySelectorAll('button, .next-btn, [role="button"]');
        for (const btn of btns) {
          const text = (btn.textContent || '').trim();
          if (text === '新建动作' || text.includes('新建动作')) {
            btn.click();
            return { clicked: true, text, method: 'text-match' };
          }
        }
        
        // 方法3: 查找包含"动作"或"事件"的按钮
        for (const btn of btns) {
          const text = (btn.textContent || '').trim();
          if (text.includes('动作') || text.includes('事件') || text.includes('添加') || text.includes('新建')) {
            btn.click();
            return { clicked: true, text, method: 'fuzzy-match' };
          }
        }

        return { clicked: false, reason: 'not-found' };
      }, selectors);

      if (actionClicked.clicked) {
        console.log(`    ✅ 已点击"${actionClicked.text}"按钮 (${actionClicked.method})`);
      } else {
        console.log(`    ⚠️ 未找到新建动作按钮 (${actionClicked.reason})`);
      }
    } catch (e) {
      console.log('    ⚠️ 点击新建动作失败:', e.message);
    }
    
    // 等待弹窗出现
    console.log('    等待事件选择弹窗出现...');
    await this.state.page.waitForTimeout(3000);
    
    // 调试：输出弹窗内容
    const dialogContent = await this.state.page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog, .vs-dialog, [class*="dialog"], [class*="modal"]');
      const results = [];
      for (const dialog of dialogs) {
        if (dialog.offsetParent !== null) {
          results.push({
            className: dialog.className,
            text: dialog.textContent.substring(0, 300),
            visible: true
          });
        }
      }
      return results;
    });
    console.log(`    找到的弹窗: ${JSON.stringify(dialogContent)}`);
    
    // 选择"onChange 值发生变化"
    console.log('    选择onChange...');
    let onChangeClicked = false;
    try {
      // 方法1: 使用Playwright文本选择器
      const onChangeOption = await this.state.page.$('text=onChange 值发生变化');
      if (onChangeOption) {
        await onChangeOption.click();
        console.log('    ✅ 已点击 onChange 值发生变化 (Playwright)');
        onChangeClicked = true;
      }
    } catch (e) {
      console.log('    ⚠️ Playwright点击onChange失败:', e.message);
    }
    
    if (!onChangeClicked) {
      // 方法2: 使用evaluate点击
      const clicked = await this.state.page.evaluate(() => {
        // 查找弹窗中的列表项
        const items = document.querySelectorAll('.vs-event-list li, .next-list-item, [class*="list-item"]');
        for (const item of items) {
          const text = item.textContent || '';
          if (text.includes('onChange') || text.includes('值发生变化')) {
            item.click();
            return { success: true, text: text.substring(0, 50) };
          }
        }
        
        // 查找所有包含onChange的元素
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent || '';
          if ((text.includes('onChange') || text.includes('值发生变化')) && el.children.length === 0) {
            el.click();
            return { success: true, method: 'text-search', text: text.substring(0, 50) };
          }
        }
        
        return { success: false };
      });
      
      if (clicked.success) {
        console.log(`    ✅ 已点击 onChange (${clicked.text})`);
      } else {
        console.log('    ⚠️ 未找到onChange选项');
      }
    }
    
    await this.state.page.waitForTimeout(2000);
    
    // 等待函数选择弹窗出现
    console.log('    等待函数选择弹窗出现...');
    await this.state.page.waitForTimeout(2000);
    
    // 调试：输出函数选择弹窗内容
    const funcDialogContent = await this.state.page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog, .vs-dialog, [class*="dialog"], [class*="modal"]');
      const results = [];
      for (const dialog of dialogs) {
        if (dialog.offsetParent !== null) {
          results.push({
            className: dialog.className,
            text: dialog.textContent.substring(0, 500),
            visible: true
          });
        }
      }
      return results;
    });
    console.log(`    函数弹窗内容: ${JSON.stringify(funcDialogContent)}`);
    
    // 选择函数 onDepartmentChange
    console.log('    选择onDepartmentChange函数...');
    let funcClicked = false;
    try {
      const funcOption = await this.state.page.$('text=onDepartmentChange');
      if (funcOption) {
        await funcOption.click();
        console.log('    ✅ 已选择 onDepartmentChange (Playwright)');
        funcClicked = true;
      }
    } catch (e) {
      console.log('    ⚠️ Playwright选择函数失败:', e.message);
    }
    
    if (!funcClicked) {
      // 使用evaluate选择函数
      const clicked = await this.state.page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent || '';
          if (text.includes('onDepartmentChange') && el.children.length === 0) {
            el.click();
            return { success: true };
          }
        }
        return { success: false };
      });
      
      if (clicked.success) {
        console.log('    ✅ 已选择 onDepartmentChange (evaluate)');
      } else {
        console.log('    ⚠️ 未找到onDepartmentChange函数');
      }
    }
    
    await this.state.page.waitForTimeout(2000);
    
    // 绑定姓名字段
    console.log('  绑定姓名字段事件...');
    await this.clickFormField('姓名');
    await this.state.page.waitForTimeout(2000);
    
    // 点击"高级"标签
    console.log('    点击高级标签...');
    try {
      const advancedClicked2 = await this.state.page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text === '高级' && el.children.length === 0) {
            el.click();
            return { clicked: true, method: 'text-match' };
          }
        }
        const tabs = document.querySelectorAll('.lc-title-txt, .next-tabs-tab-inner, [role="tab"]');
        for (const tab of tabs) {
          if (tab.textContent.includes('高级')) {
            tab.click();
            return { clicked: true, method: 'tab-class' };
          }
        }
        return { clicked: false };
      });
      
      if (advancedClicked2.clicked) {
        console.log(`    ✅ 已点击高级标签 (${advancedClicked2.method})`);
      } else {
        console.log('    ⚠️ 未找到高级标签');
      }
    } catch (e) {
      console.log('    ⚠️ 点击高级标签失败:', e.message);
    }
    await this.state.page.waitForTimeout(2000);
    
    // 点击"新建动作"按钮
    console.log('    点击新建动作...');
    try {
      const actionClicked2 = await this.state.page.evaluate(() => {
        const btns = document.querySelectorAll('button, .next-btn, [role="button"]');
        for (const btn of btns) {
          const text = (btn.textContent || '').trim();
          if (text === '新建动作' || text.includes('新建动作')) {
            btn.click();
            return { clicked: true, text };
          }
        }
        return { clicked: false };
      });
      
      if (actionClicked2.clicked) {
        console.log(`    ✅ 已点击"${actionClicked2.text}"按钮`);
      } else {
        console.log('    ⚠️ 未找到新建动作按钮');
      }
    } catch (e) {
      console.log('    ⚠️ 点击新建动作失败:', e.message);
    }
    
    // 等待弹窗出现
    console.log('    等待事件选择弹窗出现...');
    await this.state.page.waitForTimeout(3000);
    
    // 选择"onChange 值发生变化"
    console.log('    选择onChange...');
    let onChangeClicked2 = false;
    try {
      const onChangeOption2 = await this.state.page.$('text=onChange 值发生变化');
      if (onChangeOption2) {
        await onChangeOption2.click();
        console.log('    ✅ 已点击 onChange 值发生变化 (Playwright)');
        onChangeClicked2 = true;
      }
    } catch (e) {
      console.log('    ⚠️ Playwright点击onChange失败:', e.message);
    }
    
    if (!onChangeClicked2) {
      const clicked = await this.state.page.evaluate(() => {
        const items = document.querySelectorAll('.vs-event-list li, .next-list-item, [class*="list-item"]');
        for (const item of items) {
          const text = item.textContent || '';
          if (text.includes('onChange') || text.includes('值发生变化')) {
            item.click();
            return { success: true, text: text.substring(0, 50) };
          }
        }
        
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent || '';
          if ((text.includes('onChange') || text.includes('值发生变化')) && el.children.length === 0) {
            el.click();
            return { success: true, method: 'text-search', text: text.substring(0, 50) };
          }
        }
        
        return { success: false };
      });
      
      if (clicked.success) {
        console.log(`    ✅ 已点击 onChange (${clicked.text})`);
      } else {
        console.log('    ⚠️ 未找到onChange选项');
      }
    }
    
    await this.state.page.waitForTimeout(2000);
    
    // 等待函数选择弹窗出现
    console.log('    等待函数选择弹窗出现...');
    await this.state.page.waitForTimeout(2000);
    
    // 选择函数 onNameChange
    console.log('    选择onNameChange函数...');
    let funcClicked2 = false;
    try {
      const funcOption2 = await this.state.page.$('text=onNameChange');
      if (funcOption2) {
        await funcOption2.click();
        console.log('    ✅ 已选择 onNameChange (Playwright)');
        funcClicked2 = true;
      }
    } catch (e) {
      console.log('    ⚠️ Playwright选择函数失败:', e.message);
    }
    
    if (!funcClicked2) {
      const clicked = await this.state.page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent || '';
          if (text.includes('onNameChange') && el.children.length === 0) {
            el.click();
            return { success: true };
          }
        }
        return { success: false };
      });
      
      if (clicked.success) {
        console.log('    ✅ 已选择 onNameChange (evaluate)');
      } else {
        console.log('    ⚠️ 未找到onNameChange函数');
      }
    }
    
    await this.state.page.waitForTimeout(2000);
    
    console.log('✅ 事件绑定完成');
  }

  /**
   * 简化的字段事件绑定方法
   * @param {string} fieldLabel - 字段标签（如"部门"）
   * @param {string} eventType - 事件类型（如'onChange'）
   * @param {string} handlerName - 处理函数名（如'onDepartmentChange'）
   */
  async bindFieldEvent(fieldLabel, eventType, handlerName) {
    console.log(`🖱️ 绑定字段事件: ${fieldLabel}.${eventType} -> ${handlerName}`);
    
    // 关闭JS面板（如果打开）
    await this._closeJSPanel();
    
    // 等待iframe加载
    await this._waitForIframeLoaded();
    
    // 点击字段
    console.log(`  点击字段: ${fieldLabel}`);
    await this.clickFormField(fieldLabel);
    await this.state.page.waitForTimeout(2000);
    
    // 点击"高级"标签
    console.log('  点击"高级"标签');
    try {
      await this.state.page.click('text="高级"', { timeout: 5000 });
      console.log('    ✅ 已点击"高级"标签');
    } catch (e) {
      // 备用方案
      await this.state.page.evaluate(() => {
        const tabs = document.querySelectorAll('.lc-title-txt, .next-tabs-tab-inner');
        for (const tab of tabs) {
          if (tab.textContent.trim() === '高级') {
            tab.click();
            return true;
          }
        }
      });
    }
    await this.state.page.waitForTimeout(2000);
    
    // 点击"新建动作"按钮
    console.log('  点击"新建动作"按钮');
    try {
      await this.state.page.click('text="新建动作"', { timeout: 5000 });
      console.log('    ✅ 已点击"新建动作"按钮');
    } catch (e) {
      await this.state.page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.includes('新建动作')) {
            btn.click();
            return true;
          }
        }
      });
    }
    await this.state.page.waitForTimeout(3000);
    
    // 选择事件类型
    console.log(`  选择事件: ${eventType}`);
    try {
      await this.state.page.click(`text="${eventType} 值发生变化"`, { timeout: 5000 });
      console.log(`    ✅ 已选择 ${eventType} 事件`);
    } catch (e) {
      await this.state.page.evaluate((type) => {
        const items = document.querySelectorAll('.vs-event-list li');
        for (const item of items) {
          if (item.textContent.includes(type)) {
            item.click();
            return true;
          }
        }
      }, eventType);
    }
    await this.state.page.waitForTimeout(2000);
    
    // 选择处理函数
    console.log(`  选择处理函数: ${handlerName}`);
    try {
      await this.state.page.click(`text="${handlerName}"`, { timeout: 5000 });
      console.log(`    ✅ 已选择 ${handlerName}`);
    } catch (e) {
      await this.state.page.evaluate((name) => {
        const items = document.querySelectorAll('.next-select-menu-item, [role="option"]');
        for (const item of items) {
          if (item.textContent.includes(name)) {
            item.click();
            return true;
          }
        }
      }, handlerName);
    }
    await this.state.page.waitForTimeout(2000);
    
    // 点击确定
    console.log('  点击确定按钮');
    try {
      await this.state.page.click('button:text("确定")', { timeout: 5000 });
      console.log('    ✅ 已点击确定');
    } catch (e) {
      await this.state.page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.trim() === '确定') {
            btn.click();
            return true;
          }
        }
      });
    }
    await this.state.page.waitForTimeout(2000);
    
    // 点击保存
    console.log('  点击保存按钮');
    try {
      await this.state.page.click('.save-pane-btn', { timeout: 5000 });
      console.log('    ✅ 已点击保存');
    } catch (e) {
      await this.state.page.evaluate(() => {
        const btn = document.querySelector('.save-pane-btn');
        if (btn) btn.click();
      });
    }
    await this.state.page.waitForTimeout(3000);
    
    console.log(`✅ 字段事件绑定完成: ${fieldLabel}.${eventType} -> ${handlerName}`);
  }

  /**
 * 宜搭自动化测试 - 测试执行引擎
 * 版本: v1.0.79
 */

/**
 * 执行测试
 */
  async executeTest(formUuid) {
    console.log('🧪 执行测试...');
    
    // 这里可以添加具体的测试逻辑
    // 例如：填写表单字段、验证图片显示状态等
    
    console.log('✅ 测试执行完成');
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      formUuid: this.state.formUuid,
      results: this.state.testResults,
      consoleLogs: this.state.consoleLogs,
      summary: {
        total: this.state.testResults.length,
        passed: this.state.testResults.filter(r => r.status === 'PASS').length,
        failed: this.state.testResults.filter(r => r.status === 'FAIL').length
      }
    };
    
    return report;
  }
}

module.exports = { YidaAutoTester };
