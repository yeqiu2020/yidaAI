/**
 * 宜搭测试数据生成器
 * 版本: 1.0.0
 * 创建时间: 2026-03-13
 * 
 * 功能：根据配置生成符合宜搭格式的测试数据
 */

const fs = require('fs');
const path = require('path');

/**
 * 数据生成器主类
 */
class DataGenerator {
  constructor() {
    this.fieldGenerators = {
      'TextField': this.generateTextField.bind(this),
      'TextareaField': this.generateTextareaField.bind(this),
      'NumberField': this.generateNumberField.bind(this),
      'MoneyField': this.generateMoneyField.bind(this),
      'DateField': this.generateDateField.bind(this),
      'DateTimeField': this.generateDateTimeField.bind(this),
      'RadioField': this.generateRadioField.bind(this),
      'SelectField': this.generateSelectField.bind(this),
      'MultiSelectField': this.generateMultiSelectField.bind(this),
      'CascadeSelectField': this.generateCascadeSelectField.bind(this),
      'AssociationFormField': this.generateAssociationFormField.bind(this),
      'AddressField': this.generateAddressField.bind(this),
      'ImageField': this.generateImageField.bind(this),
      'AttachmentField': this.generateAttachmentField.bind(this),
      'TableField': this.generateTableField.bind(this),
      'EmployeeField': this.generateEmployeeField.bind(this),
      'DepartmentField': this.generateDepartmentField.bind(this),
    };
  }

  /**
   * 生成测试数据
   * @param {Object} config - 配置对象
   * @param {number} config.count - 生成数量
   * @param {Array} config.fields - 字段配置数组
   * @returns {Array} 测试数据数组
   */
  generate(config) {
    const { count = 1, fields = [] } = config;
    const results = [];

    for (let i = 0; i < count; i++) {
      const record = this.generateRecord(fields, i);
      results.push(record);
    }

    return results;
  }

  /**
   * 生成单条记录
   * @param {Array} fields - 字段配置
   * @param {number} index - 记录索引
   * @returns {Object} 单条记录数据
   */
  generateRecord(fields, index) {
    const record = {
      _index: index,
      _timestamp: new Date().toISOString(),
    };

    for (const field of fields) {
      const { fieldId, type, generateRule = {} } = field;
      const generator = this.fieldGenerators[type];
      
      if (generator) {
        // 将索引传递给字段生成器
        const fieldWithIndex = { ...field, _index: index };
        record[fieldId] = generator(generateRule, fieldWithIndex);
      } else {
        console.warn(`未知的字段类型: ${type}, 字段ID: ${fieldId}`);
        record[fieldId] = null;
      }
    }

    return record;
  }

  /**
   * 生成文本字段
   */
  generateTextField(rule, fieldConfig) {
    const { type = 'random', length = 10, prefix = '', enum: enumValues } = rule;

    if (enumValues && Array.isArray(enumValues) && enumValues.length > 0) {
      return this.randomChoice(enumValues);
    }

    switch (type) {
      case 'random':
        return prefix + this.randomString(length);
      case 'chinese':
        return prefix + this.randomChinese(length);
      case 'name':
        return this.randomName();
      case 'phone':
        return this.randomPhone();
      case 'email':
        return this.randomEmail();
      case 'idcard':
        return this.randomIdCard();
      case 'increment':
        const start = rule.start || 1;
        const pad = rule.pad || 0;
        const num = start + (fieldConfig._index || 0);
        return prefix + String(num).padStart(pad, '0');
      default:
        return prefix + this.randomString(length);
    }
  }

  /**
   * 生成多行文本字段
   */
  generateTextareaField(rule) {
    const lines = rule.lines || 3;
    const result = [];
    for (let i = 0; i < lines; i++) {
      result.push(this.randomChinese(20));
    }
    return result.join('\n');
  }

  /**
   * 生成数字字段
   */
  generateNumberField(rule) {
    const { type = 'range', min = 0, max = 100, precision = 0 } = rule;

    switch (type) {
      case 'range':
        const value = Math.random() * (max - min) + min;
        return precision > 0 ? parseFloat(value.toFixed(precision)) : Math.floor(value);
      case 'enum':
        return this.randomChoice(rule.enum);
      case 'boundary-min':
        return min;
      case 'boundary-max':
        return max;
      case 'negative':
        return -Math.abs(this.generateNumberField({ min: 1, max: max }));
      default:
        return Math.floor(Math.random() * (max - min) + min);
    }
  }

  /**
   * 生成金额字段
   */
  generateMoneyField(rule) {
    const { min = 0, max = 10000 } = rule;
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(2));
  }

  /**
   * 生成日期字段
   */
  generateDateField(rule) {
    const { start = -30, end = 30, format = 'timestamp' } = rule;
    const now = new Date();
    const days = Math.floor(Math.random() * (end - start) + start);
    const date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    if (format === 'timestamp') {
      return date.getTime();
    } else if (format === 'YYYY-MM-DD') {
      return date.toISOString().split('T')[0];
    }
    return date.getTime();
  }

  /**
   * 生成日期时间字段
   */
  generateDateTimeField(rule) {
    return this.generateDateField({ ...rule, format: 'timestamp' });
  }

  /**
   * 生成单选字段
   */
  generateRadioField(rule) {
    const { options = [] } = rule;
    if (options.length === 0) return null;
    
    const selected = this.randomChoice(options);
    return {
      label: selected.label || selected,
      value: selected.value || selected
    };
  }

  /**
   * 生成下拉选择字段
   */
  generateSelectField(rule) {
    return this.generateRadioField(rule);
  }

  /**
   * 生成多选字段
   */
  generateMultiSelectField(rule) {
    const { options = [], count = 2 } = rule;
    if (options.length === 0) return [];
    
    const selectedCount = Math.min(count, options.length);
    const shuffled = [...options].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, selectedCount);
    
    return selected.map(opt => ({
      label: opt.label || opt,
      value: opt.value || opt
    }));
  }

  /**
   * 生成级联选择字段
   */
  generateCascadeSelectField(rule) {
    const { levels = [] } = rule;
    const result = [];
    
    for (const level of levels) {
      if (level.options && level.options.length > 0) {
        const selected = this.randomChoice(level.options);
        result.push({
          label: selected.label || selected,
          value: selected.value || selected
        });
      }
    }
    
    return result;
  }

  /**
   * 生成关联表单字段
   */
  generateAssociationFormField(rule) {
    const { mockData = [] } = rule;
    if (mockData.length === 0) {
      const realLabels = [
        '南昌市红谷滩区土地评估项目',
        '青山湖区房屋征收评估',
        '高新区无形资产评估',
        '西湖区房地产抵押评估',
        '青云谱区资产转让评估'
      ];
      return {
        label: this.randomChoice(realLabels),
        value: 'INST-' + this.randomString(10)
      };
    }
    return this.randomChoice(mockData);
  }

  /**
   * 生成地址字段
   */
  generateAddressField(rule) {
    const provinces = ['北京市', '上海市', '广东省', '浙江省', '江苏省'];
    const cities = {
      '北京市': ['北京市'],
      '上海市': ['上海市'],
      '广东省': ['广州市', '深圳市', '东莞市'],
      '浙江省': ['杭州市', '宁波市', '温州市'],
      '江苏省': ['南京市', '苏州市', '无锡市']
    };
    
    const province = this.randomChoice(provinces);
    const city = this.randomChoice(cities[province] || ['市辖区']);
    
    return {
      address: province + city + this.randomChinese(10) + '路' + Math.floor(Math.random() * 1000) + '号',
      province,
      city,
      district: this.randomChinese(5) + '区',
      detail: this.randomChinese(10) + '小区' + Math.floor(Math.random() * 20) + '栋'
    };
  }

  /**
   * 生成图片字段
   */
  generateImageField(rule) {
    const { count = 1 } = rule;
    const images = [];
    const realNames = [
      '现场勘查照片.jpg',
      '评估对象外观.jpg',
      '房产证扫描件.jpg',
      '土地证扫描件.jpg',
      '项目现场图.jpg',
      '测量记录照片.jpg'
    ];
    
    for (let i = 0; i < count; i++) {
      images.push({
        name: this.randomChoice(realNames),
        url: `https://file.aliwork.com/image/${this.randomString(16)}.jpg`,
        size: Math.floor(Math.random() * 1024 * 1024)
      });
    }
    
    return images;
  }

  /**
   * 生成附件字段
   */
  generateAttachmentField(rule) {
    const { count = 1, types = ['pdf', 'doc', 'xlsx'] } = rule;
    const attachments = [];
    const realFileMap = {
      pdf: ['评估报告.pdf', '合同扫描件.pdf', '会议纪要.pdf', '验收单.pdf', '资质证书.pdf'],
      doc: ['项目说明书.doc', '工作计划.doc', '委托书.doc', '评估方案.doc'],
      xlsx: ['费用明细表.xlsx', '资产清单.xlsx', '报价单.xlsx', '结算表.xlsx'],
      docx: ['评估报告正文.docx', '技术说明.docx', '工作底稿.docx'],
      jpg: ['现场照片.jpg', '证件扫描件.jpg', '图纸.jpg']
    };

    for (let i = 0; i < count; i++) {
      const type = this.randomChoice(types);
      const candidates = realFileMap[type] || [`附件.${type}`];
      attachments.push({
        name: this.randomChoice(candidates),
        url: `https://file.aliwork.com/attachment/${this.randomString(16)}.${type}`,
        size: Math.floor(Math.random() * 10 * 1024 * 1024),
        type
      });
    }

    return attachments;
  }

  /**
   * 生成子表单字段
   */
  generateTableField(rule) {
    const { rowCount = 3, columns = [] } = rule;
    const rows = [];
    
    for (let i = 0; i < rowCount; i++) {
      const row = {};
      for (const col of columns) {
        const generator = this.fieldGenerators[col.type];
        if (generator) {
          row[col.fieldId] = generator(col.generateRule || {}, col);
        }
      }
      rows.push(row);
    }
    
    return rows;
  }

  /**
   * 生成成员字段
   */
  generateEmployeeField(rule) {
    const names = ['张三', '李四', '王五', '赵六', '钱七'];
    const userIds = ['user001', 'user002', 'user003', 'user004', 'user005'];
    const index = Math.floor(Math.random() * names.length);
    
    return {
      label: names[index],
      value: userIds[index],
      avatar: `https://example.com/avatar/${userIds[index]}.png`
    };
  }

  /**
   * 生成部门字段
   */
  generateDepartmentField(rule) {
    const depts = [
      { label: '技术部', value: 'dept001' },
      { label: '销售部', value: 'dept002' },
      { label: '财务部', value: 'dept003' },
      { label: '人事部', value: 'dept004' }
    ];
    
    return this.randomChoice(depts);
  }

  // ============ 工具方法 ============

  /**
   * 生成随机字符串
   */
  randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 生成随机中文字符串
   */
  randomChinese(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += String.fromCharCode(0x4e00 + Math.floor(Math.random() * (0x9fa5 - 0x4e00 + 1)));
    }
    return result;
  }

  /**
   * 生成随机姓名
   */
  randomName() {
    const surnames = ['张', '王', '李', '刘', '陈', '杨', '黄', '赵', '吴', '周'];
    const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '杰', '勇', '军'];
    
    return this.randomChoice(surnames) + this.randomChoice(names) + (Math.random() > 0.5 ? this.randomChoice(names) : '');
  }

  /**
   * 生成随机手机号
   */
  randomPhone() {
    const prefixes = ['138', '139', '136', '137', '135', '150', '151', '152', '157', '158', '159'];
    const prefix = this.randomChoice(prefixes);
    const suffix = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
    return prefix + suffix;
  }

  /**
   * 生成随机邮箱
   */
  randomEmail() {
    const domains = ['qq.com', '163.com', 'gmail.com', 'outlook.com', 'aliyun.com'];
    return this.randomString(8) + '@' + this.randomChoice(domains);
  }

  /**
   * 生成随机身份证号
   */
  randomIdCard() {
    const prefixes = ['110101', '310101', '440106', '330106', '320106'];
    const prefix = this.randomChoice(prefixes);
    const year = 1970 + Math.floor(Math.random() * 40);
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return prefix + year + month + day + suffix;
  }

  /**
   * 从数组中随机选择
   */
  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
}

// ============ 命令行接口 ============

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('用法: node data-generator.js <配置文件路径> [输出文件路径]');
    console.log('示例: node data-generator.js ./test-config.json ./test-data.json');
    console.log('注意: 如果不指定输出路径，数据只输出到控制台，不保存文件');
    process.exit(1);
  }

  const configPath = args[0];
  const outputPath = args[1]; // 可选，不指定则不保存文件

  try {
    // 读取配置
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // 生成数据
    const generator = new DataGenerator();
    const data = generator.generate(config);

    // 只有在指定输出路径时才保存文件
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`✅ 成功生成 ${data.length} 条测试数据`);
      console.log(`📄 输出文件: ${outputPath}`);
    } else {
      console.log(`✅ 成功生成 ${data.length} 条测试数据`);
      console.log('📄 数据（不保存文件）:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出模块
module.exports = DataGenerator;

/**
 * 版本历史：
 * v1.0.0 (2026-03-13): 初始版本，支持20+种宜搭字段类型的数据生成
 */