/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 用户登录注册功能
 * 适用于宜搭自定义页面
 */

// ==================== 配置变量区域 ====================
// 登录页面组件ID
const PHONE_FIELD_ID = 'textField_ml4v2v6e';      // 手机号码输入框
const PASSWORD_FIELD_ID = 'textField_ml4v2v6f';   // 密码输入框
const LOGIN_BUTTON_ID = 'button_ml4v2v6g';        // 登录按钮

// 登录状态显示组件ID
const USER_INFO_TEXT_ID = 'text_user_info';       // 显示用户信息的文本组件（右上角显示"欢迎，张三"）
const LOGOUT_BUTTON_ID = 'button_ml5cjz5v';       // 退出登录按钮
const LOGIN_FORM_CONTAINER = 'div_ml5cjr5s';      // 登录前表单容器（包含手机号、密码、登录按钮）
const USER_INFO_CONTAINER = 'div_ml5cjr5t';       // 登录后内容容器（登录后显示的内容）

// 用户信息存储表单配置
const USER_FORM_ID = 'FORM-261B58C351D64898A4483E8E780EDEB1UHKD';  // 用户信息表单ID
const USER_PHONE_FIELD = 'textField_ml4uad9j';    // 用户表单中的手机号字段
const USER_PASSWORD_FIELD = 'textField_ml4uad9n'; // 用户表单中的密码字段
const USER_NAME_FIELD = 'textField_ml4uad9l';     // 用户表单中的姓名字段

// 应用编码（请替换为实际的应用编码，可在应用设置-部署运维页面查看）
const APP_TYPE = 'APP_XXXXXXXX';                  // 应用编码

// 本地存储Key
const STORAGE_KEY = 'yida_user_info';             // 浏览器本地存储的用户信息Key
const SESSION_KEY = 'yida_session';               // 浏览器session存储Key

// 页面跳转配置
const HOME_PAGE_ID = '';                          // 登录成功后跳转的页面ID（请替换为实际页面ID）
const REGISTER_PAGE_ID = '';                      // 注册页面ID（如有独立注册页面，请替换）

// ==================== 生命周期函数 ====================
/**
 * 页面加载完成时执行
 * 用于初始化页面状态、检查登录状态等
 */
export function didMount() {
  const that = this;
  // 检查用户是否已登录
  checkLoginStatus();
  // 更新登录状态显示
  updateLoginStatusUI.call(that);
}

// ==================== 登录相关功能 ====================
/**
 * 登录按钮点击事件
 * 验证手机号和密码，登录成功后存储用户信息到本地
 */
export function onLoginClick() {
  const that = this;
  const phone = this.$(PHONE_FIELD_ID).getValue();
  const password = this.$(PASSWORD_FIELD_ID).getValue();

  // 前端基础校验
  if (!validateLoginInput.call(this, phone, password)) {
    return;
  }

  // 显示加载状态
  this.$(LOGIN_BUTTON_ID).set('loading', true);

  // 调用远程API验证用户
  verifyUser.call(this, phone, password)
    .then((userInfo) => {
      if (userInfo) {
        // 登录成功，存储用户信息
        saveUserToStorage(userInfo);
        that.utils.toast({
          title: '登录成功',
          type: 'success'
        });
        // 更新UI显示登录状态
        updateLoginStatusUI.call(that);
        // 跳转到首页或其他页面
        redirectToHome.call(that);
      } else {
        that.utils.toast({
          title: '手机号或密码错误',
          type: 'error'
        });
      }
    })
    .catch((error) => {
      console.error('登录失败:', error);
      that.utils.toast({
        title: '登录失败，请稍后重试',
        type: 'error'
      });
    })
    .finally(() => {
      that.$(LOGIN_BUTTON_ID).set('loading', false);
    });
}

/**
 * 验证登录输入
 * @param {string} phone - 手机号
 * @param {string} password - 密码
 * @returns {boolean} 验证是否通过
 */
function validateLoginInput(phone, password) {
  const that = this;
  // 手机号非空校验
  if (!phone || phone.trim() === '') {
    that.utils.toast({
      title: '请输入手机号码',
      type: 'warning'
    });
    return false;
  }

  // 手机号格式校验
  if (!isValidPhone(phone)) {
    that.utils.toast({
      title: '请输入正确的手机号码',
      type: 'warning'
    });
    return false;
  }

  // 密码非空校验
  if (!password || password.trim() === '') {
    that.utils.toast({
      title: '请输入密码',
      type: 'warning'
    });
    return false;
  }

  return true;
}

/**
 * 验证手机号格式
 * @param {string} phone - 手机号
 * @returns {boolean} 是否有效
 */
function isValidPhone(phone) {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

// ==================== 用户验证功能 ====================
/**
 * 验证用户手机号和密码
 * @param {string} phone - 手机号
 * @param {string} password - 密码
 * @returns {Promise<Object|null>} 用户信息或null
 */
function verifyUser(phone, password) {
  const that = this;
  console.log('开始验证用户:', phone);
  return new Promise((resolve, reject) => {
    // 构建查询条件：根据手机号查询用户
    const queryParams = {
      formUuid: USER_FORM_ID,
      searchFieldJson: JSON.stringify({
        [USER_PHONE_FIELD]: phone
      })
    };
    console.log('查询参数:', queryParams);
    console.log('dataSourceMap是否存在:', !!that.dataSourceMap);
    console.log('queryUserData是否存在:', !!(that.dataSourceMap && that.dataSourceMap.queryUserData));

    // 调用宜搭远程API查询用户数据
    // API接口：/v1/form/searchFormDatas.json
    if (that.dataSourceMap && that.dataSourceMap.queryUserData) {
      that.dataSourceMap.queryUserData.load(queryParams)
        .then((res) => {
          console.log('查询结果:', res);
          // 宜搭API返回的数据结构：{ data: [...], totalCount: 1, currentPage: 1 }
          if (res && res.data && res.data.length > 0) {
            const user = res.data[0];
            console.log('找到用户:', user);
            const storedPassword = user.formData[USER_PASSWORD_FIELD];
            console.log('存储的密码:', storedPassword, '输入的密码:', password);
            
            // 密码校验（明文对比，生产环境建议使用加密）
            if (storedPassword === password) {
              resolve({
                userId: user.formInstId,
                phone: user.formData[USER_PHONE_FIELD],
                name: user.formData[USER_NAME_FIELD],
                loginTime: new Date().getTime()
              });
            } else {
              console.log('密码不匹配');
              resolve(null); // 密码错误
            }
          } else {
            console.log('未找到用户数据');
            resolve(null); // 用户不存在
          }
        })
        .catch((err) => {
          console.error('查询用户失败:', err);
          reject(err);
        });
    } else {
      console.log('使用模拟数据验证');
      // 如果没有配置数据源，使用模拟数据（开发测试用）
      simulateVerifyUser(phone, password)
        .then(resolve)
        .catch(reject);
    }
  });
}

/**
 * 模拟用户验证（用于测试，生产环境请删除）
 * @param {string} phone - 手机号
 * @param {string} password - 密码
 * @returns {Promise<Object|null>} 用户信息或null
 */
function simulateVerifyUser(phone, password) {
  return new Promise((resolve) => {
    // 模拟API延迟
    setTimeout(() => {
      // 测试账号
      if (phone === '13800138000' && password === '123456') {
        resolve({
          userId: 'test_user_001',
          phone: phone,
          name: '测试用户',
          loginTime: new Date().getTime()
        });
      } else {
        resolve(null);
      }
    }, 500);
  });
}

// ==================== 本地存储功能 ====================
/**
 * 保存用户信息到浏览器本地存储
 * @param {Object} userInfo - 用户信息对象
 */
function saveUserToStorage(userInfo) {
  try {
    // 使用localStorage持久化存储
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userInfo));
    // 使用sessionStorage会话存储
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(userInfo));
  } catch (e) {
    console.error('存储用户信息失败:', e);
  }
}

/**
 * 从本地存储获取用户信息
 * @returns {Object|null} 用户信息或null
 */
function getUserFromStorage() {
  try {
    const userStr = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(STORAGE_KEY);
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    console.error('读取用户信息失败:', e);
    return null;
  }
}

/**
 * 清除本地存储的用户信息（退出登录）
 */
export function clearUserStorage() {
  const that = this;
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    that.utils.toast({
      title: '已退出登录',
      type: 'success'
    });
    // 更新UI显示
    updateLoginStatusUI.call(that);
    // 刷新页面或跳转到登录页
    setTimeout(() => {
      location.reload();
    }, 1000);
  } catch (e) {
    console.error('清除用户信息失败:', e);
  }
}

/**
 * 更新登录状态UI显示
 * 在页面右上角显示用户信息，控制登录表单/用户信息的显隐
 */
function updateLoginStatusUI() {
  const that = this;
  const userInfo = getUserFromStorage();
  
  if (userInfo) {
    // 已登录状态
    console.log('更新UI为已登录状态:', userInfo.name);
    
    // 显示用户信息（右上角）
    if (that.$(USER_INFO_TEXT_ID)) {
      that.$(USER_INFO_TEXT_ID).set('content', `欢迎，${userInfo.name} (${userInfo.phone})`);
      that.$(USER_INFO_TEXT_ID).set('behavior', 'NORMAL');
    }
    
    // 显示退出登录按钮
    if (that.$(LOGOUT_BUTTON_ID)) {
      that.$(LOGOUT_BUTTON_ID).set('behavior', 'NORMAL');
    }
    
    // 隐藏登录表单
    if (that.$(LOGIN_FORM_CONTAINER)) {
      that.$(LOGIN_FORM_CONTAINER).set('behavior', 'HIDDEN');
    }
    
    // 显示用户信息容器
    if (that.$(USER_INFO_CONTAINER)) {
      that.$(USER_INFO_CONTAINER).set('behavior', 'NORMAL');
    }
  } else {
    // 未登录状态
    console.log('更新UI为未登录状态');
    
    // 清空用户信息
    if (that.$(USER_INFO_TEXT_ID)) {
      that.$(USER_INFO_TEXT_ID).set('content', '未登录');
      that.$(USER_INFO_TEXT_ID).set('behavior', 'HIDDEN');
    }
    
    // 隐藏退出登录按钮
    if (that.$(LOGOUT_BUTTON_ID)) {
      that.$(LOGOUT_BUTTON_ID).set('behavior', 'HIDDEN');
    }
    
    // 显示登录表单
    if (that.$(LOGIN_FORM_CONTAINER)) {
      that.$(LOGIN_FORM_CONTAINER).set('behavior', 'NORMAL');
    }
    
    // 隐藏用户信息容器
    if (that.$(USER_INFO_CONTAINER)) {
      that.$(USER_INFO_CONTAINER).set('behavior', 'HIDDEN');
    }
  }
}

/**
 * 退出登录按钮点击事件
 */
export function onLogoutClick() {
  clearUserStorage.call(this);
}

// ==================== 登录状态检查 ====================
/**
 * 检查用户登录状态
 * 页面加载时调用，已登录可自动跳转
 */
function checkLoginStatus() {
  const userInfo = getUserFromStorage();
  if (userInfo) {
    // 检查登录是否过期（例如7天）
    const expireTime = 7 * 24 * 60 * 60 * 1000; // 7天
    const now = new Date().getTime();
    
    if (now - userInfo.loginTime < expireTime) {
      // 已登录且未过期，可自动跳转
      console.log('用户已登录:', userInfo.name);
      // 如需自动跳转，取消下面注释
      // redirectToHome();
    } else {
      // 登录已过期，清除存储
      clearUserStorage();
    }
  }
}

/**
 * 获取当前登录用户信息
 * @returns {Object|null} 用户信息
 */
export function getCurrentUser() {
  return getUserFromStorage();
}

/**
 * 判断用户是否已登录
 * @returns {boolean} 是否已登录
 */
export function isLoggedIn() {
  return getUserFromStorage() !== null;
}

// ==================== 页面跳转功能 ====================
/**
 * 跳转到首页
 */
function redirectToHome() {
  if (HOME_PAGE_ID) {
    this.utils.router.push(HOME_PAGE_ID);
  } else {
    console.log('请配置首页页面ID');
  }
}

/**
 * 跳转到注册页面
 */
export function goToRegister() {
  const that = this;
  if (REGISTER_PAGE_ID) {
    that.utils.router.push(REGISTER_PAGE_ID);
  } else {
    that.utils.toast({
      title: '注册功能暂未开放',
      type: 'notice'
    });
  }
}

// ==================== 注册功能（可选） ====================
/**
 * 注册新用户
 * 如需在登录页面集成注册功能，可调用此方法
 * @param {Object} userData - 用户数据
 */
export function registerUser(userData) {
  const that = this;
  const { phone, password, name } = userData;

  // 校验输入
  if (!phone || !password || !name) {
    that.utils.toast({
      title: '请填写完整信息',
      type: 'warning'
    });
    return;
  }

  if (!isValidPhone(phone)) {
    that.utils.toast({
      title: '请输入正确的手机号码',
      type: 'warning'
    });
    return;
  }

  // 检查手机号是否已注册
  checkPhoneExists.call(that, phone)
    .then((exists) => {
      if (exists) {
        that.utils.toast({
          title: '该手机号已注册',
          type: 'warning'
        });
        return;
      }

      // 提交注册数据
      // API接口：/v1/form/saveFormData.json
      const formData = {
        appType: APP_TYPE,
        formUuid: USER_FORM_ID,
        formDataJson: JSON.stringify({
          [USER_PHONE_FIELD]: phone,
          [USER_PASSWORD_FIELD]: password,
          [USER_NAME_FIELD]: name
        })
      };

      return that.dataSourceMap && that.dataSourceMap.createUser
        ? that.dataSourceMap.createUser.load(formData)
        : Promise.resolve({ success: true });
    })
    .then((res) => {
      if (res) {
        that.utils.toast({
          title: '注册成功，请登录',
          type: 'success'
        });
      }
    })
    .catch((error) => {
      console.error('注册失败:', error);
      that.utils.toast({
        title: '注册失败，请稍后重试',
        type: 'error'
      });
    });
}

/**
 * 检查手机号是否已存在
 * @param {string} phone - 手机号
 * @returns {Promise<boolean>} 是否存在
 */
function checkPhoneExists(phone) {
  const that = this;
  return new Promise((resolve, reject) => {
    const queryParams = {
      formUuid: USER_FORM_ID,
      searchFieldJson: JSON.stringify({
        [USER_PHONE_FIELD]: phone
      })
    };

    if (that.dataSourceMap && that.dataSourceMap.queryUserData) {
      that.dataSourceMap.queryUserData
        .load(queryParams)
        .then((res) => {
          // 宜搭API返回的数据结构：{ data: [...], totalCount: 1, currentPage: 1 }
          resolve(res && res.data && res.data.length > 0);
        })
        .catch(reject);
    } else {
      resolve(false);
    }
  });
}

// ==================== 密码安全功能 ====================
/**
 * 修改密码
 * @param {string} oldPassword - 旧密码
 * @param {string} newPassword - 新密码
 */
export function changePassword(oldPassword, newPassword) {
  const that = this;
  const userInfo = getUserFromStorage();
  if (!userInfo) {
    that.utils.toast({
      title: '请先登录',
      type: 'warning'
    });
    return;
  }

  // 新密码强度校验
  if (!isStrongPassword(newPassword)) {
    that.utils.toast({
      title: '密码强度不足，请使用6位以上字母数字组合',
      type: 'warning'
    });
    return;
  }

  // 验证旧密码并更新
  verifyUser.call(that, userInfo.phone, oldPassword)
    .then((result) => {
      if (!result) {
        that.utils.toast({
          title: '原密码错误',
          type: 'error'
        });
        return;
      }

      // 更新密码
      // API接口：/v1/form/updateFormData.json
      const updateData = {
        formInstId: userInfo.userId,
        updateFormDataJson: JSON.stringify({
          [USER_PASSWORD_FIELD]: newPassword
        })
      };

      return that.dataSourceMap && that.dataSourceMap.updateUser
        ? that.dataSourceMap.updateUser.load(updateData)
        : Promise.resolve({ success: true });
    })
    .then((res) => {
      if (res) {
        that.utils.toast({
          title: '密码修改成功',
          type: 'success'
        });
      }
    })
    .catch((error) => {
      console.error('修改密码失败:', error);
      that.utils.toast({
        title: '修改失败，请稍后重试',
        type: 'error'
      });
    });
}

/**
 * 校验密码强度
 * @param {string} password - 密码
 * @returns {boolean} 是否通过校验
 */
function isStrongPassword(password) {
  // 至少6位，包含字母和数字
  const strongRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;
  return strongRegex.test(password);
}

// ==================== 使用说明 ====================
/**
 * 【宜搭内操作步骤】
 * 
 * 1. 页面组件配置：
 *    - 在自定义页面中添加以下组件：
 *      * 单行文本组件（手机号码）：设置fieldId为 textField_ml4v2v6e
 *      * 密码组件（密码）：设置fieldId为 textField_ml4v2v6f
 *      * 按钮组件（登录）：设置fieldId为 button_ml4v2v6g
 * 
 * 2. 登录按钮绑定事件：
 *    - 选中登录按钮，在动作面板中绑定点击事件为：onLoginClick
 * 
 * 3. 配置远程数据源（推荐）：
 *    - 在页面数据源面板中添加以下远程API：
 *      
 *      a) queryUserData - 查询用户数据
 *         - 请求地址：/dingtalk/web/{APP_TYPE}/v1/form/searchFormDatas.json
 *         - 请求方法：GET
 *         - 请求参数：formUuid, searchFieldJson
 *         - 示例：/dingtalk/web/APP_XXXXXXXX/v1/form/searchFormDatas.json
 *      
 *      b) createUser - 创建用户（注册用）
 *         - 请求地址：/dingtalk/web/{APP_TYPE}/v1/form/saveFormData.json
 *         - 请求方法：POST
 *         - 请求参数：appType, formUuid, formDataJson
 *         - 示例：/dingtalk/web/APP_XXXXXXXX/v1/form/saveFormData.json
 *      
 *      c) updateUser - 更新用户（修改密码用）
 *         - 请求地址：/dingtalk/web/{APP_TYPE}/v1/form/updateFormData.json
 *         - 请求方法：POST
 *         - 请求参数：formInstId, updateFormDataJson
 *         - 示例：/dingtalk/web/APP_XXXXXXXX/v1/form/updateFormData.json
 * 
 * 4. 用户信息表单要求：
 *    - 表单ID：FORM-261B58C351D64898A4483E8E780EDEB1UHKD
 *    - 字段配置：
 *      * textField_ml4uad9j：手机号码（单行文本）
 *      * textField_ml4uad9n：密码（单行文本或密码组件）
 *      * textField_ml4uad9l：姓名（单行文本）
 * 
 * 5. 应用编码配置：
 *    - 修改代码中的 APP_TYPE 为实际的应用编码
 *    - 应用编码可在应用设置-部署运维页面查看
 * 
 * 6. 可选配置：
 *    - 修改代码中的 HOME_PAGE_ID 为登录成功后跳转的页面ID
 *    - 修改代码中的 REGISTER_PAGE_ID 为注册页面ID（如有独立注册页）
 *    - 如需密码加密，请修改 verifyUser 和 registerUser 中的密码处理逻辑
 * 
 * 7. 安全建议：
 *    - 生产环境建议对密码进行MD5或SHA256加密存储
 *    - 建议启用HTTPS确保数据传输安全
 *    - 可添加图形验证码防止暴力破解
 *    - 建议限制登录失败次数
 * 
 * 【注意事项】
 * - 本代码使用localStorage和sessionStorage存储用户信息
 * - 登录状态默认保持7天，可在checkLoginStatus中修改过期时间
 * - 如需退出登录，调用clearUserStorage方法
 * - 如需获取当前登录用户，调用getCurrentUser方法
 * - 如需检查登录状态，调用isLoggedIn方法
 * - API返回结构统一为：{ success: boolean, result?: object, errorMsg?: string, errorCode?: string }
 */
