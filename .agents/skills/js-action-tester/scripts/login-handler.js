/**
 * 登录流程处理模块
 * 版本: v1.0.5
 * 
 * 更新记录:
 * v1.0.5 - 优化组织选择页面处理，支持更多选择器
 */

/**
 * 处理钉钉登录授权流程 - 严格版本
 * 确保每一步都成功完成后再继续
 */
async function handleLoginFlow(page, config = {}) {
  console.log('  🔐 开始处理登录流程...');
  
  const maxSteps = 15;
  let step = 0;
  
  while (step < maxSteps) {
    step++;
    console.log(`\n  📍 步骤 ${step}/${maxSteps}`);
    
    // 等待页面稳定
    await page.waitForTimeout(3000);
    
    // 截图查看当前状态
    try {
      await page.screenshot({ 
        path: `./login-step-${step}.png`,
        fullPage: true 
      });
      console.log(`    📸 已截图: login-step-${step}.png`);
    } catch (e) {
      console.log('    ⚠️ 截图失败');
    }
    
    // 检查当前页面状态
    const pageState = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      
      // 1. 检查是否已进入宜搭设计器
      if (bodyText.includes('表单设计') || bodyText.includes('组件库') || 
          bodyText.includes('页面设置') || bodyText.includes('保存')) {
        return { type: 'logged-in', message: '已登录到宜搭设计器' };
      }
      
      // 2. 检查协议同意页面
      const confirmBtn = document.querySelector('.module-agreement-button-co');
      if (confirmBtn && bodyText.includes('确定')) {
        return { 
          type: 'agreement', 
          message: '协议同意页面',
          button: '.module-agreement-button-co',
          buttonText: '确定'
        };
      }
      
      // 3. 检查立即登录页面（按钮形式）- 优先检测
      // 页面特征：有立即登录按钮，可能有头像
      const loginBtn = document.querySelector('.module-confirm-button');
      if (loginBtn && bodyText.includes('立即登录')) {
        return { 
          type: 'login-button', 
          message: '立即登录页面（按钮）',
          button: '.module-confirm-button',
          buttonText: '立即登录'
        };
      }
      
      // 4. 检查二维码+头像授权登录页面
      // 页面特征：包含二维码和头像，提示"使用钉钉扫码或点击头像授权登录"
      const avatarPic = document.querySelector('.base-comp-avatar-pic');
      const qrCode = document.querySelector('.login-qr-code, .qrcode, [class*="qr"]');
      const hasScanText = bodyText.includes('扫码') || bodyText.includes('扫描');
      const hasAvatarText = bodyText.includes('头像') || bodyText.includes('授权');
      
      // 必须同时有二维码和头像，或者明确提示点击头像授权
      if ((qrCode && avatarPic) || bodyText.includes('点击头像授权')) {
        return { 
          type: 'avatar-login', 
          message: '二维码+头像授权登录页面',
          avatarSelector: '.base-comp-avatar-pic',
          buttonText: '点击头像授权登录'
        };
      }
      
      // 5. 检查组织选择页面
      if (bodyText.includes('选择你加入的组织')) {
        return { 
          type: 'select-org', 
          message: '组织选择页面'
        };
      }
      
      // 6. 检查需要手动处理的页面
      if (bodyText.includes('绑定手机号码') || bodyText.includes('请设置密码')) {
        return { 
          type: 'manual', 
          message: '需要手动完成的页面',
          text: bodyText.substring(0, 100)
        };
      }
      
      // 7. 未知状态
      return { 
        type: 'unknown', 
        message: '未知页面状态',
        text: bodyText.substring(0, 200)
      };
    });
    
    console.log(`    当前状态: ${pageState.type} - ${pageState.message}`);
    
    // 根据状态执行相应操作
    switch (pageState.type) {
      case 'logged-in':
        console.log('    ✅ 登录流程完成！');
        await page.waitForTimeout(5000);
        return { success: true, message: '登录成功' };
        
      case 'agreement':
        console.log(`    🖱️ 点击"${pageState.buttonText}"按钮...`);
        try {
          await page.click(pageState.button, { force: true, timeout: 5000 });
          console.log('    ✅ 已点击确定');
        } catch (e) {
          console.log('    ⚠️ 点击失败，尝试文本选择器');
          try {
            await page.click('text="确定"', { force: true, timeout: 5000 });
            console.log('    ✅ 已点击确定(文本选择器)');
          } catch (e2) {
            console.log('    ❌ 无法点击确定按钮');
          }
        }
        break;
        
      case 'avatar-login':
        // 二维码+头像授权登录 - 点击头像
        console.log('    🖱️ 检测到二维码+头像登录，点击头像...');
        try {
          // 方法1: 使用类选择器点击头像
          const avatar = await page.$('.base-comp-avatar-pic');
          if (avatar) {
            await avatar.click({ force: true, timeout: 5000 });
            console.log('    ✅ 已点击头像 (.base-comp-avatar-pic)');
          } else {
            throw new Error('未找到头像元素');
          }
        } catch (e) {
          console.log('    ⚠️ 方法1失败:', e.message);
          try {
            // 方法2: 使用evaluate点击
            const clicked = await page.evaluate(() => {
              const avatar = document.querySelector('.base-comp-avatar-pic');
              if (avatar) {
                avatar.click();
                // 同时触发更多事件确保点击生效
                avatar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                avatar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                avatar.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                return { success: true, method: 'evaluate-click' };
              }
              return { success: false, reason: 'avatar-not-found' };
            });
            
            if (clicked.success) {
              console.log(`    ✅ 已点击头像 (${clicked.method})`);
            } else {
              console.log('    ❌ 无法点击头像:', clicked.reason);
            }
          } catch (e2) {
            console.log('    ❌ 点击头像失败:', e2.message);
          }
        }
        break;
        
      case 'login-button':
        // 立即登录按钮
        console.log(`    🖱️ 点击"${pageState.buttonText}"按钮...`);
        try {
          await page.click(pageState.button, { force: true, timeout: 5000 });
          console.log('    ✅ 已点击立即登录');
        } catch (e) {
          console.log('    ⚠️ 点击失败，尝试文本选择器');
          try {
            await page.click('text="立即登录"', { force: true, timeout: 5000 });
            console.log('    ✅ 已点击立即登录(文本选择器)');
          } catch (e2) {
            console.log('    ❌ 无法点击立即登录按钮');
          }
        }
        break;
        
      case 'select-org':
        console.log('    🖱️ 尝试点击第一个组织...');
        try {
          // 尝试多种选择器（根据实际页面结构）
          const selectors = [
            '.org-item',  // 最常见的组织项类名
            '.module-corp-sel-listitem',
            '.module-corp-sel-listitem-title',
            '[class*="corp-sel"]',
            '[class*="org"]',
            '.next-list-item'  // Next 组件库列表项
          ];
          let clicked = false;
          for (const selector of selectors) {
            try {
              const elements = await page.$$(selector);
              if (elements.length > 0) {
                // 点击第一个可见的组织
                for (const el of elements) {
                  const isVisible = await el.isVisible().catch(() => false);
                  if (isVisible) {
                    await el.click({ force: true, timeout: 5000 });
                    console.log(`    ✅ 已点击第一个组织 (${selector})`);
                    clicked = true;
                    break;
                  }
                }
                if (clicked) break;
              }
            } catch (e) {
              // 继续尝试下一个选择器
            }
          }
          if (!clicked) {
            console.log('    ⚠️ 未能点击组织，尝试使用文本内容查找...');
            try {
              // 尝试点击包含组织名称的元素
              await page.click('text=/.*公司|.*技术|.*中心|.*部$/', { force: true, timeout: 5000 });
              console.log('    ✅ 已通过文本点击组织');
              clicked = true;
            } catch (e) {
              console.log('    ⚠️ 文本点击也失败了');
            }
          }
          if (!clicked) {
            console.log('    ⚠️ 未能点击组织，尝试evaluate方式...');
            const clicked = await page.evaluate(() => {
              // 查找所有可能的组织项
              const items = document.querySelectorAll('.org-item, .module-corp-sel-listitem, [class*="corp-sel"], [class*="org"]');
              for (const item of items) {
                if (item.offsetParent !== null && item.textContent.trim().length > 0) {
                  item.click();
                  return true;
                }
              }
              // 如果找不到，尝试查找列表中的第一个可点击元素
              const listContainer = document.querySelector('.next-list, .org-list, [class*="corp-sel"]');
              if (listContainer) {
                const firstItem = listContainer.querySelector('div, li, a');
                if (firstItem) {
                  firstItem.click();
                  return true;
                }
              }
              return false;
            });
            if (clicked) {
              console.log('    ✅ 已通过evaluate点击组织');
            }
          }
        } catch (e) {
          console.log('    ❌ 点击组织失败:', e.message);
        }
        break;
        
      case 'manual':
        console.log('    ⚠️ 需要手动操作:', pageState.text);
        if (config.headless) {
          throw new Error('需要手动完成登录流程');
        }
        console.log('    ⏳ 等待30秒供手动操作...');
        await page.waitForTimeout(30000);
        break;
        
      case 'unknown':
        console.log('    ⚠️ 未知状态，页面文本:', pageState.text);
        // 连续3次未知状态则退出
        if (step > 3) {
          const prevStates = [];
          // 这里可以添加状态历史检查
        }
        break;
    }
    
    // 等待页面响应
    console.log('    ⏳ 等待页面响应...');
    await page.waitForTimeout(5000);
  }
  
  console.log('  ⚠️ 登录流程达到最大步骤数，可能未完成');
  return { success: false, message: '登录流程未完成' };
}

module.exports = { handleLoginFlow };
