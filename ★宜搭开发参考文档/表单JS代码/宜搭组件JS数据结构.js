/**
 * 宜搭组件JS赋值测试代码
 * 版本号: v1.0.3
 * 创建时间: 2026-04-08
 * 功能说明: 测试宜搭所有常用组件的JS赋值功能
 * 
 * 【使用步骤】
 * 1. 在宜搭表单中添加对应组件
 * 2. 添加一个按钮组件，文字改为"测试赋值"
 * 3. 选中按钮 -> 右侧属性面板 -> 动作 -> onClick -> 绑定 testAllComponents 函数
 * 4. 保存表单，点击按钮即可测试
 */

// ============================================
// ===== 组件ID配置区域 - 已根据实际表单配置 =====
// ============================================

// 基础表单组件
var TEXT_FIELD = 'textField_mnpd2l8d';                    // 1.单行文本
var TEXTAREA_FIELD = 'textareaField_mnpd2l8f';           // 2.多行文本
var NUMBER_FIELD = 'numberField_mnpd2l8h';               // 3.数值
var RATE_FIELD = 'rateField_mnpd2l8j';                   // 4.评分

// 选择类组件
var RADIO_FIELD = 'radioField_mnpd2l8l';                 // 5.单选
var CHECKBOX_FIELD = 'checkboxField_mnpd2l8n';           // 6.复选
var SELECT_FIELD = 'selectField_mnpd2l8p';               // 7.下拉单选
var MULTI_SELECT_FIELD = 'multiSelectField_mnpd2l8r';    // 8.下拉复选

// 组织类组件
var EMPLOYEE_FIELD = 'employeeField_mnpd2l8t';           // 9.成员/人员选择
var DEPARTMENT_FIELD = 'departmentSelectField_mnpd2l8v'; // 10.部门选择

// 时间类组件
var DATE_FIELD = 'dateField_mnpd2l8x';                   // 11.日期
var DATE_RANGE_FIELD = 'cascadeDateField_mnpd2l8z';      // 12.日期区间

// 文件类组件
var IMAGE_UPLOAD_FIELD = 'imageField_mnpd2l91';          // 13.图片上传
var ATTACHMENT_FIELD = 'attachmentField_mnpd2l93';       // 14.附件

// 复杂组件
var ASSOCIATION_FORM_FIELD = 'associationFormField_mnpd2l95'; // 15.关联表单
var ADDRESS_FIELD = 'addressField_mnpd2l97';             // 16.地址
var REGION_SELECT_FIELD = 'countrySelectField_mnpd2l99'; // 17.国家/地区

// ============================================
// ===== 页面生命周期函数 =====
// ============================================

export function didMount() {
  console.log('宜搭组件JS赋值测试代码已加载 - 版本: v1.0.3');
  console.log('使用说明：添加按钮并绑定 testAllComponents 函数到 onClick 事件');
}

// ============================================
// ===== 测试函数 - 点击按钮执行 =====
// ============================================

/**
 * 测试所有组件赋值功能
 * 将此函数绑定到按钮的onClick事件
 */
export function testAllComponents() {
  console.log('========== 开始测试所有组件赋值 ==========');
  
  // 测试成功的组件数
  var successCount = 0;
  var failCount = 0;
  
  // 1. 单行文本
  try {
    this.$(TEXT_FIELD).setValue('这是单行文本的测试内容');
    console.log('✅ 单行文本赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 单行文本赋值失败:', error.message);
    failCount++;
  }
  
  // 2. 多行文本
  try {
    this.$(TEXTAREA_FIELD).setValue('这是多行文本的第一行\n这是第二行\n这是第三行');
    console.log('✅ 多行文本赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 多行文本赋值失败:', error.message);
    failCount++;
  }
  
  // 3. 数值
  try {
    this.$(NUMBER_FIELD).setValue(12345);
    console.log('✅ 数值赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 数值赋值失败:', error.message);
    failCount++;
  }
  
  // 4. 评分
  try {
    this.$(RATE_FIELD).setValue(4);
    console.log('✅ 评分赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 评分赋值失败:', error.message);
    failCount++;
  }
  
  // 5. 单选
  try {
    this.$(RADIO_FIELD).setValue('选项一');
    console.log('✅ 单选赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 单选赋值失败:', error.message);
    failCount++;
  }
  
  // 6. 复选
  try {
    this.$(CHECKBOX_FIELD).setValue(['选项一', '选项二']);
    console.log('✅ 复选赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 复选赋值失败:', error.message);
    failCount++;
  }
  
  // 7. 下拉单选
  try {
    this.$(SELECT_FIELD).setValue('选项二');
    console.log('✅ 下拉单选赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 下拉单选赋值失败:', error.message);
    failCount++;
  }
  
  // 8. 下拉复选
  try {
    this.$(MULTI_SELECT_FIELD).setValue(['选项二', '选项三']);
    console.log('✅ 下拉复选赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 下拉复选赋值失败:', error.message);
    failCount++;
  }
  
  // 9. 成员/人员选择
  try {
    this.$(EMPLOYEE_FIELD).setValue([{
      avatar: '',
      key: '0249654712697493',
      label: '叶秋',
      value: '0249654712697493'
    }]);
    console.log('✅ 成员/人员选择赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 成员/人员选择赋值失败:', error.message);
    failCount++;
  }
  
  // 10. 部门选择
  try {
    this.$(DEPARTMENT_FIELD).setValue([{
      text: {
        zh_CN: '商务部门',
        en_US: 'Business Department',
        type: 'i18n'
      },
      value: '407524713'
    }]);
    console.log('✅ 部门选择赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 部门选择赋值失败:', error.message);
    failCount++;
  }
  
  // 11. 日期
  try {
    this.$(DATE_FIELD).setValue(1774108800000);
    console.log('✅ 日期赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 日期赋值失败:', error.message);
    failCount++;
  }
  
  // 12. 日期区间
  try {
    this.$(DATE_RANGE_FIELD).setValue({
      start: 1772294400000,
      end: 1772899200000
    });
    console.log('✅ 日期区间赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 日期区间赋值失败:', error.message);
    failCount++;
  }
  
  // 13. 图片上传
  try {
    this.$(IMAGE_UPLOAD_FIELD).setValue([{
      name: 'test_image.jpg',
      fileUuid: 'APP_TEST_123456.jpg',
      downloadURL: '/ossFileHandle?appType=TEST&fileName=test.jpg',
      imgURL: '/ossFileHandle?appType=TEST&fileName=test.jpg',
      previewUrl: '/ossFileHandle?appType=TEST&fileName=test.jpg'
    }]);
    console.log('✅ 图片上传赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 图片上传赋值失败:', error.message);
    failCount++;
  }
  
  // 14. 附件
  try {
    this.$(ATTACHMENT_FIELD).setValue([{
      name: 'test_file.xlsx',
      fileUuid: 'APP_TEST_123456.xlsx',
      downloadURL: 'https://example.com/test.xlsx',
      previewUrl: 'https://example.com/test.xlsx'
    }]);
    console.log('✅ 附件赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 附件赋值失败:', error.message);
    failCount++;
  }
  
  // 15. 关联表单
  try {
    this.$(ASSOCIATION_FORM_FIELD).setValue([{
      appType: 'APP_TEST',
      formType: 'receipt',
      formUuid: 'FORM-TEST-123',
      instanceId: 'FINST-TEST-123',
      title: '测试关联数据',
      subTitle: ''
    }]);
    console.log('✅ 关联表单赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 关联表单赋值失败:', error.message);
    failCount++;
  }
  
  // 16. 地址
  try {
    this.$(ADDRESS_FIELD).setValue({
      address: '详细地址信息',
      regionIds: [500000, 500100, 500113, 500113107],
      regionText: [
        {zh_CN: '重庆', en_US: 'chong qing'},
        {zh_CN: '重庆市', en_US: 'chong qing shi'},
        {zh_CN: '巴南区', en_US: 'ba nan qu'},
        {zh_CN: '安澜镇', en_US: 'an lan zhen'}
      ]
    });
    console.log('✅ 地址赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 地址赋值失败:', error.message);
    failCount++;
  }
  
  // 17. 国家/地区
  try {
    this.$(REGION_SELECT_FIELD).setValue([{
      text: {
        zh_CN: '中国香港特别行政区',
        en_US: 'China, Hong Kong Special Administrative Region',
        type: 'i18n'
      },
      value: 'HK'
    }]);
    console.log('✅ 国家/地区赋值成功');
    successCount++;
  } catch (error) {
    console.error('❌ 国家/地区赋值失败:', error.message);
    failCount++;
  }
  
  console.log('========== 测试完成 ==========');
  console.log('✅ 成功: ' + successCount + ' 个组件');
  console.log('❌ 失败: ' + failCount + ' 个组件');
}

/**
 * 单独测试某个组件
 * @param {string} componentName - 组件名称
 */
export function testSingleComponent(componentName) {
  console.log('========== 测试单个组件: ' + componentName + ' ==========');
  
  try {
    switch(componentName) {
      case 'text':
        this.$(TEXT_FIELD).setValue('单行文本测试');
        console.log('✅ 单行文本赋值成功');
        break;
      case 'textarea':
        this.$(TEXTAREA_FIELD).setValue('多行文本测试');
        console.log('✅ 多行文本赋值成功');
        break;
      case 'number':
        this.$(NUMBER_FIELD).setValue(999);
        console.log('✅ 数值赋值成功');
        break;
      case 'rate':
        this.$(RATE_FIELD).setValue(5);
        console.log('✅ 评分赋值成功');
        break;
      case 'radio':
        this.$(RADIO_FIELD).setValue('选项一');
        console.log('✅ 单选赋值成功');
        break;
      case 'checkbox':
        this.$(CHECKBOX_FIELD).setValue(['选项一', '选项三']);
        console.log('✅ 复选赋值成功');
        break;
      case 'select':
        this.$(SELECT_FIELD).setValue('选项二');
        console.log('✅ 下拉单选赋值成功');
        break;
      case 'multiSelect':
        this.$(MULTI_SELECT_FIELD).setValue(['选项一', '选项二']);
        console.log('✅ 下拉复选赋值成功');
        break;
      case 'employee':
        this.$(EMPLOYEE_FIELD).setValue([{
          avatar: '',
          key: '0249654712697493',
          label: '叶秋',
          value: '0249654712697493'
        }]);
        console.log('✅ 成员/人员选择赋值成功');
        break;
      case 'department':
        this.$(DEPARTMENT_FIELD).setValue([{
          text: {zh_CN: '商务部门', type: 'i18n'},
          value: '407524713'
        }]);
        console.log('✅ 部门选择赋值成功');
        break;
      case 'date':
        this.$(DATE_FIELD).setValue(Date.now());
        console.log('✅ 日期赋值成功');
        break;
      case 'dateRange':
        this.$(DATE_RANGE_FIELD).setValue({
          start: Date.now(),
          end: Date.now() + 86400000
        });
        console.log('✅ 日期区间赋值成功');
        break;
      default:
        console.log('❌ 未知的组件名称: ' + componentName);
    }
  } catch (error) {
    console.error('❌ 测试组件时发生错误:', error);
    console.error('错误详情:', error.message);
  }
}
