/**
 * 宜搭浏览器提交引擎
 * 版本: 1.0.0
 * 创建时间: 2026-03-13
 * 
 * 功能：使用Playwright模拟浏览器操作提交宜搭表单
 */

const { chromium } = require('playwright');
const fs = require('fs');

/**
 * 浏览器提交引擎主类
 */
class BrowserSubmitter {
  constructor(config) {
    this.config = {
      headless: config.headless !== false,
      slowMo: config.slowMo || 100,
      timeout: config.timeout || 30000,
      viewport: config.viewport || { width: 1920, height: 1080 },
      ...config
    };
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * 初始化浏览器
   */
  async init() {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      recordVideo: this.config.recordVideo ? {
        dir: this.config.videoDir || './videos/'
      } : undefined
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * 登录宜搭
   * @param {Object} credentials - 登录凭证
   */
  async login(credentials) {
    const { username, password, loginUrl = 'https://login.dingtalk.com/' } = credentials;
    
    try {
      console.log('正在登录宜搭...');
      
      // 访问登录页面
      await this.page.goto(loginUrl);
      
      // 等待登录表单加载
      await this.page.waitForSelector('input[type="text"], input[name="username"], #username', { timeout: 10000 });
      
      // 填写用户名
      await this.page.fill('input[type="text"], input[name="username"], #username', username);
      
      // 填写密码
      await this.page.fill('input[type="password"], input[name="password"], #password', password);
      
      // 点击登录按钮
      await this.page.click('button[type="submit"], .login-button, .btn-login');
      
      // 等待登录成功（检测跳转或特定元素）
      await this.page.waitForTimeout(3000);
      
      // 检查是否登录成功
      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('auth')) {
        throw new Error('登录失败，请检查用户名和密码');
      }
      
      console.log('✅ 登录成功');
      return { success: true };
    } catch (error) {
      console.error('❌ 登录失败:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * 提交单条数据
   * @param {Object} params - 提交参数
   * @returns {Promise<Object>} 提交结果
   */
  async submitOne(params) {
    const { formUrl, data, formConfig = {} } = params;
    
    const result = {
      success: false,
      message: '',
      errors: [],
      warnings: [],
      screenshot: null
    };

    try {
      console.log(`正在访问表单: ${formUrl}`);
      
      // 访问表单页面
      await this.page.goto(formUrl);
      
      // 等待表单加载
      await this.page.waitForSelector('.form-content, .yida-form, [data-testid="form"]', { timeout: 15000 });
      await this.page.waitForTimeout(2000);

      // 填写表单数据
      await this.fillForm(data, formConfig);

      // 点击提交按钮
      console.log('正在提交表单...');
      const submitButton = await this.page.$('.submit-button, .btn-submit, button:has-text("提交"), [data-testid="submit"]');
      
      if (!submitButton) {
        throw new Error('未找到提交按钮');
      }

      // 监听弹窗和错误提示
      const errorPromise = this.catchErrors();
      
      await submitButton.click();
      
      // 等待提交结果
      await this.page.waitForTimeout(3000);
      
      // 检查错误
      const errors = await errorPromise;
      if (errors.length > 0) {
        result.errors = errors;
        result.message = '表单验证失败';
        
        // 截图保存
        if (this.config.screenshotOnError) {
          const screenshotPath = `./screenshots/error_${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          result.screenshot = screenshotPath;
        }
        
        return result;
      }

      // 检查提交成功标志
      const successIndicator = await this.page.$('.success-message, .toast-success, .ant-message-success, .yida-success');
      const currentUrl = this.page.url();
      
      if (successIndicator || !currentUrl.includes('form')) {
        result.success = true;
        result.message = '提交成功';
        
        // 尝试获取实例ID
        const instanceId = await this.extractInstanceId();
        if (instanceId) {
          result.instanceId = instanceId;
        }
      } else {
        result.message = '提交结果未知，请手动检查';
      }

      return result;

    } catch (error) {
      result.message = error.message;
      
      // 截图保存
      if (this.config.screenshotOnError) {
        const screenshotPath = `./screenshots/error_${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = screenshotPath;
      }
      
      return result;
    }
  }

  /**
   * 批量提交数据
   * @param {Object} params - 批量提交参数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 提交结果列表
   */
  async submitBatch(params, options = {}) {
    const { formUrl, dataList = [], formConfig = {} } = params;
    const { delay = 3000 } = options;
    
    const results = [];
    
    for (let i = 0; i < dataList.length; i++) {
      console.log(`\n正在提交第 ${i + 1}/${dataList.length} 条数据...`);
      
      const result = await this.submitOne({
        formUrl,
        data: dataList[i],
        formConfig
      });
      
      results.push({
        index: i,
        data: dataList[i],
        ...result
      });
      
      // 延迟，避免操作过快
      if (i < dataList.length - 1 && delay > 0) {
        await this.page.waitForTimeout(delay);
      }
    }
    
    return results;
  }

  /**
   * 填写表单
   * @param {Object} data - 表单数据
   * @param {Object} formConfig - 表单配置
   */
  async fillForm(data, formConfig) {
    const fields = formConfig.fields || [];
    
    for (const [fieldId, value] of Object.entries(data)) {
      if (fieldId.startsWith('_')) continue; // 跳过内部字段
      
      const fieldConfig = fields.find(f => f.fieldId === fieldId) || {};
      
      try {
        await this.fillField(fieldId, value, fieldConfig);
      } catch (error) {
        console.warn(`填写字段 ${fieldId} 失败:`, error.message);
      }
    }
  }

  /**
   * 填写单个字段
   * @param {string} fieldId - 字段ID
   * @param {any} value - 字段值
   * @param {Object} fieldConfig - 字段配置
   */
  async fillField(fieldId, value, fieldConfig) {
    const type = fieldConfig.type || 'TextField';
    
    // 构建字段选择器
    const selectors = [
      `[data-field-id="${fieldId}"]`,
      `[id="${fieldId}"]`,
      `[name="${fieldId}"]`,
      `.${fieldId}`
    ];
    
    let fieldElement = null;
    for (const selector of selectors) {
      fieldElement = await this.page.$(selector);
      if (fieldElement) break;
    }
    
    if (!fieldElement) {
      console.warn(`未找到字段: ${fieldId}`);
      return;
    }

    switch (type) {
      case 'TextField':
      case 'TextareaField':
        await fieldElement.fill(String(value));
        break;
        
      case 'NumberField':
      case 'MoneyField':
        await fieldElement.fill(String(value));
        break;
        
      case 'DateField':
      case 'DateTimeField':
        // 点击日期选择器
        await fieldElement.click();
        await this.page.waitForTimeout(500);
        // 选择日期（简化处理）
        const dateStr = typeof value === 'number' ? new Date(value).toISOString().split('T')[0] : value;
        await fieldElement.fill(dateStr);
        break;
        
      case 'SelectField':
      case 'RadioField':
        // 点击下拉框
        await fieldElement.click();
        await this.page.waitForTimeout(500);
        // 选择选项
        const optionLabel = value.label || value;
        const option = await this.page.$(`.ant-select-item:has-text("${optionLabel}"), .dropdown-item:has-text("${optionLabel}")`);
        if (option) {
          await option.click();
        }
        break;
        
      case 'MultiSelectField':
        // 多选处理
        await fieldElement.click();
        await this.page.waitForTimeout(500);
        for (const item of value) {
          const label = item.label || item;
          const option = await this.page.$(`.ant-select-item:has-text("${label}")`);
          if (option) {
            await option.click();
          }
        }
        break;
        
      case 'EmployeeField':
      case 'DepartmentField':
        // 人员/部门选择
        await fieldElement.click();
        await this.page.waitForTimeout(500);
        // 搜索并选择
        const searchInput = await this.page.$('.ant-modal input, .picker-search input');
        if (searchInput) {
          await searchInput.fill(value.label);
          await this.page.waitForTimeout(1000);
          const item = await this.page.$('.ant-list-item, .picker-item');
          if (item) {
            await item.click();
          }
        }
        break;
        
      default:
        // 默认使用fill
        await fieldElement.fill(String(value));
    }
    
    // 等待一下，让表单有时间响应
    await this.page.waitForTimeout(300);
  }

  /**
   * 捕获页面错误
   * @returns {Promise<Array>} 错误列表
   */
  async catchErrors() {
    const errors = [];
    
    // 检查常见的错误提示元素
    const errorSelectors = [
      '.ant-form-item-explain-error',
      '.form-error',
      '.error-message',
      '.toast-error',
      '.ant-message-error',
      '[role="alert"]'
    ];
    
    for (const selector of errorSelectors) {
      const elements = await this.page.$$(selector);
      for (const element of elements) {
        const text = await element.textContent();
        if (text && text.trim()) {
          errors.push(text.trim());
        }
      }
    }
    
    return errors;
  }

  /**
   * 提取实例ID
   * @returns {Promise<string|null>} 实例ID
   */
  async extractInstanceId() {
    try {
      // 从URL中提取
      const url = this.page.url();
      const match = url.match(/instanceId=([\w-]+)/);
      if (match) {
        return match[1];
      }
      
      // 从页面内容中提取
      const instanceIdElement = await this.page.$('[data-instance-id], .instance-id');
      if (instanceIdElement) {
        return await instanceIdElement.getAttribute('data-instance-id');
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
}

// ============ 命令行接口 ============

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('用法: node browser-submitter.js <配置文件路径> <数据文件路径> [输出文件路径]');
    console.log('示例: node browser-submitter.js ./browser-config.json ./test-data.json ./submit-result.json');
    process.exit(1);
  }

  const configPath = args[0];
  const dataPath = args[1];
  const outputPath = args[2] || './browser-submit-result.json';

  let submitter = null;

  try {
    // 读取配置
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // 读取测试数据
    const dataContent = fs.readFileSync(dataPath, 'utf-8');
    const dataList = JSON.parse(dataContent);

    // 创建提交器
    submitter = new BrowserSubmitter({
      headless: config.headless !== false,
      slowMo: config.slowMo || 100,
      timeout: config.timeout || 30000,
      screenshotOnError: config.screenshotOnError !== false,
      ...config.browserOptions
    });

    // 初始化浏览器
    await submitter.init();

    // 登录
    const loginResult = await submitter.login({
      username: config.username,
      password: config.password,
      loginUrl: config.loginUrl
    });

    if (!loginResult.success) {
      throw new Error('登录失败: ' + loginResult.message);
    }

    console.log(`\n开始提交 ${dataList.length} 条数据...`);
    
    // 批量提交
    const results = await submitter.submitBatch({
      formUrl: config.formUrl,
      dataList,
      formConfig: config.formConfig || {}
    }, {
      delay: config.delay || 3000
    });

    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    const summary = {
      total: results.length,
      success: successCount,
      failed: failCount,
      successRate: ((successCount / results.length) * 100).toFixed(2) + '%',
      results
    };

    // 保存结果
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');

    console.log('\n========== 提交结果 ==========');
    console.log(`总计: ${summary.total}`);
    console.log(`成功: ${summary.success}`);
    console.log(`失败: ${summary.failed}`);
    console.log(`成功率: ${summary.successRate}`);
    console.log(`\n📄 详细结果已保存: ${outputPath}`);

    // 显示失败详情
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('\n❌ 失败详情:');
      failures.forEach(f => {
        console.log(`  第${f.index + 1}条: ${f.message}`);
        if (f.errors.length > 0) {
          f.errors.forEach(e => console.log(`    - ${e}`));
        }
        if (f.screenshot) {
          console.log(`    📸 截图: ${f.screenshot}`);
        }
      });
    }

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  } finally {
    // 关闭浏览器
    if (submitter) {
      await submitter.close();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出模块
module.exports = BrowserSubmitter;

/**
 * 版本历史：
 * v1.0.0 (2026-03-13): 初始版本，支持Playwright模拟浏览器登录和表单提交
 */