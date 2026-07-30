/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 宜搭公式生成器 - 固定配置文件
 * 使用方法：修改下方 CONFIG 对象，然后运行 node formula_builder.js
 */

const { generateYidaFormula, ZERO_WIDTH_SPACE } = require('./formula_generator_wrapper.js');

// ==================== 配置区域 ====================
// 修改以下配置来生成不同的公式

const CONFIG = {
  // 公式名称（将用作文件名）
  formulaName: '根据身份证号计算星座',
  
  // 分类目录：日期计算/文本处理/逻辑判断/数学计算/身份证处理/子表处理/其他
  category: '身份证处理',
  
  // 字段配置
  fields: [
    { displayName: '身份证号', fieldId: 'textField_mljkhwmz' }
  ],
  
  // 公式文本（使用 {字段名} 作为占位符，程序会自动替换为零宽空格包裹的格式）
  // 星座公式：提取身份证第11-14位（月日），判断星座范围
  formulaTemplate: 'IF(EQ(LEN({身份证号}),18),IF(AND(GE(VALUE(MID({身份证号},11,4)),321),LE(VALUE(MID({身份证号},11,4)),419)),"白羊座",IF(AND(GE(VALUE(MID({身份证号},11,4)),420),LE(VALUE(MID({身份证号},11,4)),520)),"金牛座",IF(AND(GE(VALUE(MID({身份证号},11,4)),521),LE(VALUE(MID({身份证号},11,4)),621)),"双子座",IF(AND(GE(VALUE(MID({身份证号},11,4)),622),LE(VALUE(MID({身份证号},11,4)),722)),"巨蟹座",IF(AND(GE(VALUE(MID({身份证号},11,4)),723),LE(VALUE(MID({身份证号},11,4)),822)),"狮子座",IF(AND(GE(VALUE(MID({身份证号},11,4)),823),LE(VALUE(MID({身份证号},11,4)),922)),"处女座",IF(AND(GE(VALUE(MID({身份证号},11,4)),923),LE(VALUE(MID({身份证号},11,4)),1023)),"天秤座",IF(AND(GE(VALUE(MID({身份证号},11,4)),1024),LE(VALUE(MID({身份证号},11,4)),1122)),"天蝎座",IF(AND(GE(VALUE(MID({身份证号},11,4)),1123),LE(VALUE(MID({身份证号},11,4)),1221)),"射手座",IF(AND(GE(VALUE(MID({身份证号},11,4)),1222),LE(VALUE(MID({身份证号},11,4)),1231)),"摩羯座",IF(AND(GE(VALUE(MID({身份证号},11,4)),101),LE(VALUE(MID({身份证号},11,4)),119)),"摩羯座",IF(AND(GE(VALUE(MID({身份证号},11,4)),120),LE(VALUE(MID({身份证号},11,4)),218)),"水瓶座",IF(AND(GE(VALUE(MID({身份证号},11,4)),219),LE(VALUE(MID({身份证号},11,4)),320)),"双鱼座",""))))))))))))),"身份证号格式错误")'
};

// ==================== 生成逻辑 ====================

function buildFormulaFromTemplate(template, fields) {
  let text = template;
  
  fields.forEach(field => {
    const placeholder = '{' + field.displayName + '}';
    const wrapped = ZERO_WIDTH_SPACE + field.displayName + ZERO_WIDTH_SPACE;
    // 替换所有出现的占位符
    text = text.split(placeholder).join(wrapped);
  });
  
  return text;
}

function main() {
  try {
    // 从模板构建公式文本
    const formulaText = buildFormulaFromTemplate(CONFIG.formulaTemplate, CONFIG.fields);
    
    console.log('正在生成公式...');
    console.log('公式名称：', CONFIG.formulaName);
    console.log('分类目录：', CONFIG.category);
    console.log('字段数量：', CONFIG.fields.length);
    console.log('');
    
    // 生成公式
    const result = generateYidaFormula({
      formulaName: CONFIG.formulaName,
      category: CONFIG.category,
      formulaText: formulaText,
      fields: CONFIG.fields
    });
    
    console.log('✅ 公式生成成功！');
    console.log('文件路径：', result.outputPath);
    console.log('字段引用数：', result.marksCount);
    
  } catch (error) {
    console.error('❌ 生成失败：', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
