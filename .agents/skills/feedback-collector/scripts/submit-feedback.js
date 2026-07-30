#!/usr/bin/env node

/**
 * 用户反馈提交脚本
 * 将反馈数据发送到叶秋建议收集系统
 * 
 * 版本: v1.2.5
 * 更新日期: 2026-03-26
 * 
 * 使用方法:
 * node submit-feedback.js --sender "用户名" --phone "手机号" --type "bug" --title "标题" --description "描述"
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'webhook.json');
const STORAGE_PATH = path.join(__dirname, '..', 'config', 'user-feedback-storage.json');
const CURRENT_USER_PATH = path.join(__dirname, '..', 'config', 'current-user.json');

// 固定配置
const FIXED_RECIPIENT = '叶秋';
const FIXED_ADDRESS = 'https://www.yidatrain.com';
const DAILY_LIMIT = 3;

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
用法: node submit-feedback.js [选项]

选项:
  --sender          发送人姓名（必填）
  --phone           发送人电话（必填）
  --type, -t        反馈类型 (bug/feature/requirement/question/review)
  --title           反馈标题（必填）
  --description, -d 详细描述（必填）
  --steps           复现步骤（Bug类型）
  --expected        期望结果
  --actual          实际结果
  --context         使用场景（建议类型）
  --recipient       接收人（可选，默认：叶秋）
  --address         接收地址（可选，默认：https://www.yidatrain.com/）
  --webhook         Webhook URL（可选，默认使用配置文件）
  --help, -h        显示帮助信息

示例:
  node submit-feedback.js \\
    --sender "张三" \\
    --phone "13800138000" \\
    --type "feature" \\
    --title "增加批量导入功能" \\
    --description "希望能支持Excel批量导入数据"
`);
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sender: '',
    phone: '',
    type: '',
    title: '',
    description: '',
    steps: '',
    expected: '',
    actual: '',
    context: '',
    recipient: FIXED_RECIPIENT,
    address: FIXED_ADDRESS,
    webhook: ''
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--sender':
        options.sender = nextArg;
        i++;
        break;
      case '--phone':
        options.phone = nextArg;
        i++;
        break;
      case '--type':
      case '-t':
        options.type = nextArg;
        i++;
        break;
      case '--title':
        options.title = nextArg;
        i++;
        break;
      case '--description':
      case '-d':
        options.description = nextArg;
        i++;
        break;
      case '--steps':
        options.steps = nextArg;
        i++;
        break;
      case '--expected':
        options.expected = nextArg;
        i++;
        break;
      case '--actual':
        options.actual = nextArg;
        i++;
        break;
      case '--context':
        options.context = nextArg;
        i++;
        break;
      case '--recipient':
        options.recipient = nextArg;
        i++;
        break;
      case '--address':
        options.address = nextArg;
        i++;
        break;
      case '--webhook':
        options.webhook = nextArg;
        i++;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * 验证必填字段
 */
function validateOptions(options) {
  const errors = [];

  if (!options.sender || options.sender.trim() === '') {
    errors.push('发送人姓名(--sender)不能为空');
  }

  if (!options.phone || options.phone.trim() === '') {
    errors.push('发送人电话(--phone)不能为空');
  } else if (!/^1[3-9]\d{9}$/.test(options.phone)) {
    errors.push('发送人电话格式不正确，请输入11位手机号');
  }

  if (!options.type) {
    errors.push('反馈类型(--type)不能为空');
  } else if (!['bug', 'feature', 'requirement', 'question', 'review'].includes(options.type)) {
    errors.push('反馈类型必须是: bug, feature, requirement, question, review 之一');
  }

  if (!options.title || options.title.trim() === '') {
    errors.push('反馈标题(--title)不能为空');
  }

  if (!options.description || options.description.trim() === '') {
    errors.push('详细描述(--description)不能为空');
  }

  // 校验接收人和接收地址是否被篡改
  if (options.recipient !== FIXED_RECIPIENT) {
    errors.push(`接收人必须为"${FIXED_RECIPIENT}"，不允许修改`);
  }

  if (options.address !== FIXED_ADDRESS) {
    errors.push(`接收地址必须为"${FIXED_ADDRESS}"，不允许修改`);
  }

  return errors;
}

/**
 * 读取用户存储数据
 */
function readUserStorage() {
  try {
    if (fs.existsSync(STORAGE_PATH)) {
      const data = fs.readFileSync(STORAGE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取用户存储数据失败:', error.message);
  }
  return { version: '1.2.0', dailyLimit: DAILY_LIMIT, users: {} };
}

/**
 * 保存用户存储数据
 */
function saveUserStorage(data) {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('保存用户存储数据失败:', error.message);
  }
}

/**
 * 检查用户发送次数限制
 */
function checkDailyLimit(phone) {
  const storage = readUserStorage();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  if (!storage.users[phone]) {
    storage.users[phone] = {
      firstSendDate: today,
      sendCount: 0,
      history: []
    };
  }

  const user = storage.users[phone];
  
  // 如果日期变了，重置计数
  if (user.firstSendDate !== today) {
    user.firstSendDate = today;
    user.sendCount = 0;
  }

  // 检查是否超过限制
  if (user.sendCount >= DAILY_LIMIT) {
    return {
      allowed: false,
      message: `您今日已发送 ${user.sendCount} 条建议，已达到每日上限（${DAILY_LIMIT}条）。请明天再试。`,
      storage: storage,
      user: user
    };
  }

  return {
    allowed: true,
    remaining: DAILY_LIMIT - user.sendCount,
    storage: storage,
    user: user
  };
}

/**
 * 记录用户发送历史
 */
function recordUserFeedback(phone, feedbackData) {
  const storage = readUserStorage();
  const today = new Date().toISOString().split('T')[0];
  
  if (!storage.users[phone]) {
    storage.users[phone] = {
      firstSendDate: today,
      sendCount: 0,
      history: []
    };
  }

  const user = storage.users[phone];
  
  // 如果日期变了，重置计数
  if (user.firstSendDate !== today) {
    user.firstSendDate = today;
    user.sendCount = 0;
  }

  user.sendCount++;
  user.history.push({
    sendTime: new Date().toISOString(),
    title: feedbackData.title,
    type: feedbackData.feedbackType,
    status: '已发送'
  });

  saveUserStorage(storage);
}

/**
 * 读取当前用户信息
 */
function readCurrentUser() {
  try {
    if (fs.existsSync(CURRENT_USER_PATH)) {
      const data = fs.readFileSync(CURRENT_USER_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取当前用户信息失败:', error.message);
  }
  return { version: '1.2.0', lastUpdated: '', sender: '', phone: '' };
}

/**
 * 保存当前用户信息
 */
function saveCurrentUser(sender, phone) {
  try {
    const userData = {
      version: '1.2.0',
      lastUpdated: new Date().toISOString(),
      sender: sender,
      phone: phone
    };
    fs.writeFileSync(CURRENT_USER_PATH, JSON.stringify(userData, null, 2), 'utf8');
    console.log('✅ 用户信息已保存');
  } catch (error) {
    console.error('保存用户信息失败:', error.message);
  }
}

/**
 * 获取Webhook URL
 */
function getWebhookUrl(options) {
  if (options.webhook) {
    return options.webhook;
  }

  if (process.env.DINGTALK_FEEDBACK_WEBHOOK) {
    return process.env.DINGTALK_FEEDBACK_WEBHOOK;
  }

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.webhookUrl) {
        return config.webhookUrl;
      }
    }
  } catch (error) {
    console.error('读取配置文件失败:', error.message);
  }

  return null;
}

/**
 * 构建反馈数据
 */
function buildFeedbackData(options) {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  
  return {
    sender_name: options.sender,
    sender_phone: options.phone,
    feedbackType: options.type,
    title: options.title,
    description: options.description,
    source: '宜搭AI助手',
    source_version: '1.4.3'
  };
}

/**
 * 发送HTTP POST请求
 */
function sendPostRequest(webhookUrl, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const postData = JSON.stringify(data);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          // 尝试解析 JSON 响应
          const parsedResponse = JSON.parse(responseData);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // HTTP 成功，检查业务逻辑是否成功
            resolve({
              success: true,
              statusCode: res.statusCode,
              response: responseData,
              data: parsedResponse
            });
          } else {
            // HTTP 失败，返回错误信息
            reject({
              success: false,
              statusCode: res.statusCode,
              message: parsedResponse.message || `HTTP ${res.statusCode}`,
              data: parsedResponse
            });
          }
        } catch (error) {
          // JSON 解析失败，返回原始数据
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              statusCode: res.statusCode,
              response: responseData
            });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    // 解析参数
    const options = parseArgs();

    // 验证参数
    const errors = validateOptions(options);
    if (errors.length > 0) {
      console.error('❌ 参数错误:');
      errors.forEach(error => console.error(`  - ${error}`));
      console.error('\n使用 --help 查看帮助信息');
      process.exit(1);
    }

    // 检查每日发送限制
    const limitCheck = checkDailyLimit(options.phone);
    if (!limitCheck.allowed) {
      console.error(`❌ ${limitCheck.message}`);
      process.exit(1);
    }

    console.log(`📊 您今日还可发送 ${limitCheck.remaining} 条建议`);

    // 获取Webhook URL
    const webhookUrl = getWebhookUrl(options);
    if (!webhookUrl) {
      console.error('❌ 错误: 未配置Webhook URL');
      console.error('请通过以下方式之一配置:');
      console.error('  1. 使用 --webhook 参数指定');
      console.error('  2. 设置环境变量 DINGTALK_FEEDBACK_WEBHOOK');
      console.error('  3. 创建配置文件 config/webhook.json');
      process.exit(1);
    }

    // 构建反馈数据
    const feedbackData = buildFeedbackData(options);

    console.log('\n📤 正在提交反馈...');
    console.log(`   接收人: ${options.recipient}`);
    console.log(`   发送人: ${options.sender}`);
    console.log(`   电话: ${options.phone}`);
    console.log(`   类型: ${options.type}`);
    console.log(`   标题: ${options.title}`);

    // 打印要发送的数据
    console.log('\n📤 准备发送的数据:');
    console.log(JSON.stringify(feedbackData, null, 2));

    // 发送请求
    const result = await sendPostRequest(webhookUrl, feedbackData);

    if (result.success) {
      // 检查接收端返回的业务状态
      let responseData = result.data;
      
      // 调试：打印接收端返回的原始数据
      console.log('\n📥 接收端返回数据(原始):');
      console.log(JSON.stringify(responseData, null, 2));
      
      // 处理 API Gateway 格式（数据在 body 字段中）
      if (responseData && responseData.body) {
        try {
          responseData = JSON.parse(responseData.body);
          console.log('\n📥 解析后的业务数据:');
          console.log(JSON.stringify(responseData, null, 2));
        } catch (e) {
          console.log('\n⚠️ 无法解析 body 字段');
        }
      }
      
      // 根据接收端返回的 code 字段判断业务状态
      // code: 0 表示成功，其他值表示失败
      const businessCode = responseData && responseData.code;
      
      if (businessCode !== undefined && businessCode !== 0 && businessCode !== '0') {
        console.error('\n❌ 账号校验不通过，无法发送。');
        console.error(`   错误信息: ${responseData.message || '未知错误'}`);
        
        // 根据错误信息给出具体提示
        const message = responseData.message || '';
        if (message.includes('不存在') || message.includes('未注册') || message.includes('未找到')) {
          console.error('\n   系统中未找到您的注册信息。');
          console.error('   📎 请先前往注册: https://www.yidatrain.com/');
          console.error('   注册完成后，再回来发送您的建议。');
        } else if (message.includes('不匹配') || message.includes('错误')) {
          console.error('\n   您提供的姓名和手机号不匹配，请检查：');
          console.error(`   - 姓名: ${options.sender}`);
          console.error(`   - 手机号: ${options.phone}`);
          console.error('   请重新提供正确的注册信息。');
        }
        
        if (responseData.registerUrl) {
          console.error(`\n   📎 注册地址: ${responseData.registerUrl}`);
        }
        
        process.exit(1);
      }
      
      // 从接收端返回数据中获取今日发送次数和剩余次数
      const todayCount = responseData && responseData.data && responseData.data.today_count;
      const todayRemain = responseData && responseData.data && responseData.data.today_remain;
      
      // 如果接收端返回的今日次数已达到或超过3次，则不允许继续发送
      if (todayCount !== undefined && todayCount >= 3) {
        console.error('\n❌ 您今日已发送3条建议，达到每日上限。');
        console.error('   请明天再试。');
        process.exit(1);
      }
      
      // 保存当前用户信息
      saveCurrentUser(options.sender, options.phone);
      
      // 记录用户发送历史
      recordUserFeedback(options.phone, feedbackData);
      
      console.log('\n✅ 反馈提交成功！');
      console.log(`   发送时间: ${new Date().toLocaleString('zh-CN')}`);
      
      // 优先使用接收端返回的今日次数信息
      if (todayCount !== undefined && todayRemain !== undefined) {
        console.log(`   今日已发送: ${todayCount} 条`);
        console.log(`   今日剩余: ${todayRemain} 条`);
      } else {
        console.log(`   今日已发送: ${limitCheck.user ? limitCheck.user.sendCount + 1 : 1}/${DAILY_LIMIT} 条`);
      }
      
      // 显示接收端返回的额外信息
      if (responseData && responseData.data && responseData.data.feedback_id) {
        console.log(`   反馈编号: ${responseData.data.feedback_id}`);
      }
      if (responseData && responseData.message) {
        console.log(`   服务器消息: ${responseData.message}`);
      }
      
      process.exit(0);
    } else {
      throw new Error('提交失败');
    }

  } catch (error) {
    console.error('\n❌ 提交失败:', error.message);
    
    // 保存到本地备份
    try {
      const backupDir = path.join(__dirname, '..', 'backup');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const backupFile = path.join(backupDir, `feedback-${Date.now()}.json`);
      const options = parseArgs();
      const backupData = buildFeedbackData(options);
      fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
      console.log(`💾 反馈已备份到: ${backupFile}`);
    } catch (backupError) {
      console.error('备份也失败了:', backupError.message);
    }
    
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

/**
 * 版本: v1.2.8
 * 更新: 2026-03-26
 * - 移除发送前验证，恢复到发送后验证逻辑
 * - 验证由接收端在收到数据后进行
 */
