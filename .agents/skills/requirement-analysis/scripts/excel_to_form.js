const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const childProcess = require('child_process');
let iconv = null;
try {
  iconv = require('iconv-lite');
} catch (error) {
  iconv = null;
}

// ==================== AI 字段类型覆盖配置 ====================
// 由 AI 语义预推断生成的字段类型覆盖表，优先级高于脚本兜底规则
let fieldTypeOverrides = {};

function loadFieldTypeOverrides(overridePath, outputDir) {
  if (!overridePath && outputDir) {
    const autoPath = path.join(outputDir, 'field-types-override.json');
    if (fs.existsSync(autoPath)) {
      overridePath = autoPath;
    }
  }
  if (!overridePath || !fs.existsSync(overridePath)) {
    // v3.1.4: 静默返回改为醒目警告——override 未加载时关联表单/自定义选项全部不生效，
    // 生成的字段清单会退化为单行文本且无任何报错，曾导致关联配置静默丢失。
    console.warn('\n⚠️  [重要] 未加载字段类型覆盖配置（field-types-override.json）！');
    console.warn('   - 若已用 --draft 生成草稿并经 AI 审核，请显式传入第5个位置参数指定 override 文件路径');
    console.warn('   - 未加载 override 时：关联表单、下拉选项、数据标题等配置全部不生效，字段类型使用脚本兜底推断');
    console.warn('   - 判断 override 是否生效：命令行应出现 "📋 已加载字段类型覆盖配置" 日志\n');
    return;
  }
  try {
    const content = fs.readFileSync(overridePath, 'utf8');
    fieldTypeOverrides = JSON.parse(content);
    console.log(`\n📋 已加载字段类型覆盖配置: ${overridePath}`);
  } catch (error) {
    console.error(`[警告] 加载字段类型覆盖配置失败: ${error.message}，将使用脚本兜底规则`);
    fieldTypeOverrides = {};
  }
}

function getFieldTypeOverride(formName, fieldName) {
  if (!fieldTypeOverrides || typeof fieldTypeOverrides !== 'object') return null;
  const formOverrides = fieldTypeOverrides[formName];
  if (!formOverrides || typeof formOverrides !== 'object') return null;
  let override = formOverrides[fieldName];
  // v1.31.0: 如果纯净字段名找不到，尝试遍历查找带括号的原始全名
  // 例如 fieldName="优惠类型" 但 override 键是 "优惠类型（复选）"
  if (!override) {
    for (const key of Object.keys(formOverrides)) {
      if (key.startsWith(fieldName + '（') && key.endsWith('）')) {
        override = formOverrides[key];
        break;
      }
    }
  }
  if (!override) return null;
  // 未经 AI 确认的关联候选（--draft 草稿中仍带 _candidate 标记）不生效
  if (typeof override === 'object' && override._candidate) return null;
  if (typeof override === 'string') {
    return { type: override, options: null };
  }
  return { type: override.type || null, options: override.options || null };
}

// ==================== AI Override 完整应用（v1.27.0 新增） ====================
// applyOverrides 在 parseExcelForms 之后、generateFieldListMarkdown 之前执行
// 将 override 文件中的所有配置（字段重命名、关联表单完整配置、被填充字段插入、
// 数据标题覆盖、字段状态自定义、选项值修正）一次性应用到表单数据上
// 这样脚本只需运行一次即可生成包含完整关联信息的字段清单，无需 AI 后续手动 Edit

function applyOverrides(forms) {
  if (!fieldTypeOverrides || typeof fieldTypeOverrides !== 'object') return forms;

  // v1.28.0 新增：构建表单字段映射表，用于自动推导关联表单的 fillRules 和 filledFields
  // 当 override 中只写了 { "type": "关联表单", "target": "仓库信息" } 而未提供 fillRules/filledFields 时，
  // 脚本自动从目标表单的字段列表推导填充规则和被填充字段，AI 无需手动写几十行重复配置
  // v1.30.0 修复：只使用主表字段，严禁混入子表字段。
  // 通用规则：当表单A关联表单B时，从表单B推导的填充字段只能来自表单B的主表字段。
  // 子表字段代表多行数据，无法映射到当前表单主表的单一字段；
  // 若需引用目标表单子表数据，应通过当前表单自己的子表来处理。
  // 原BUG：formFieldMap 把主表+子表字段合并，导致采购入库主表错误出现
  // 采购订单子表的"选择产品/采购数量/采购单价/采购金额"等字段（自相矛盾）。
  const formFieldMap = {};
  forms.forEach(form => {
    formFieldMap[form.name] = [...form.mainFields];
  });

  forms.forEach(form => {
    const formOverrides = fieldTypeOverrides[form.name];
    if (!formOverrides || typeof formOverrides !== 'object') return;

    // 处理表单元信息
    if (formOverrides._meta && formOverrides._meta.dataTitle) {
      form._dataTitleOverride = formOverrides._meta.dataTitle;
    }

    // 处理主表字段
    form.mainFields = applyFieldOverrides(form.mainFields, formOverrides, form.name, formFieldMap);

    // 处理子表字段
    if (form.subTables && form.subTables.length > 0) {
      form.subTables.forEach(subTable => {
        subTable.fields = applyFieldOverrides(subTable.fields, formOverrides, form.name, formFieldMap);
      });
    }
  });

  // v3.1.4 生成后自检：Excel 中仍有关联候选字段未在 override 中配置为关联表单时给出警告。
  // 常见根因：子表字段（如"关联产品"）的 override 被错误嵌套在子表名（如"采购明细"）键下，
  // 而脚本要求子表字段 override 与主表字段平级（formOverrides["关联产品"]）。
  const allFormNames = forms.map(f => f.name);
  const unhandled = [];
  forms.forEach(form => {
    const formOverrides = fieldTypeOverrides[form.name];
    if (!formOverrides || typeof formOverrides !== 'object') return;
    const checkFields = (fields, scope) => {
      fields.forEach(f => {
        // 用户已在 Excel 显式标注类型（typeHint 非空）的字段尊重原意，跳过
        if (f.typeHint) return;
        // AI 已在 override 显式配置为非关联表单类型的字段，尊重 AI 判断，跳过
        const explicitOverride = getFieldTypeOverride(form.name, f.name);
        if (explicitOverride && explicitOverride.type && explicitOverride.type !== '关联表单') return;
        const finalType = mapFieldType(f.name, f.typeHint, f.isOptions, f._forceType, form.name);
        if (finalType !== '关联表单') {
          const candidates = findAssociationCandidates(f.name, allFormNames, form.name);
          if (candidates.length > 0) {
            unhandled.push(`${form.name}.${scope}${f.name} → 疑似关联 ${candidates.map(c => c.formName).join('/')}（当前类型: ${finalType}）`);
          }
        }
      });
    };
    checkFields(form.mainFields, '');
    if (form.subTables) {
      form.subTables.forEach(st => checkFields(st.fields, `[子表:${st.name}].`));
    }
  });
  if (unhandled.length > 0) {
    console.warn('\n⚠️  [自检] 检测到以下字段疑似应为"关联表单"但当前不是（override 可能未配置或格式错误）：');
    unhandled.slice(0, 10).forEach(msg => console.warn(`   - ${msg}`));
    if (unhandled.length > 10) console.warn(`   ... 共 ${unhandled.length} 处`);
    console.warn('   - 子表字段 override 必须与主表字段平级写在表单一级（如 formOverrides["关联产品"]），严禁嵌套在子表名键下\n');
  }

  return forms;
}

// v1.28.0 新增：自动生成填充规则（同名字段匹配，排除系统字段和流水号）
// v3.1.4 修复：排除"关联表单"类型字段——嵌套关联时（A关联B，B又关联C），
// 若把 B 的关联字段 C 也带入 A 的填充规则，C 的填充目标字段不会递归插入到 A，
// 导致"填充目标字段缺失"校验失败（如 采购入库.关联采购订单 → 带入"关联供应商" → 联系人缺失）。
function autoGenerateFillRules(targetFields, targetFormName, systemKeywords) {
  return targetFields
    .filter(f => !systemKeywords.some(kw => f.name.includes(kw)))
    .filter(f => {
      const fieldType = mapFieldType(f.name, f.typeHint, f.isOptions, f._forceType, targetFormName);
      return fieldType !== '流水号' && fieldType !== '关联表单';
    })
    .map(f => `${f.name}=${f.name}`);
}

// v1.28.0 新增：自动生成被填充字段（全部设为只读，类型与目标表单一致）
// v3.1.4 修复：同上排除"关联表单"类型字段，避免嵌套关联被填充字段携带
// 无法落地的填充规则（目标字段不在当前表单中）
function autoGenerateFilledFields(targetFields, targetFormName, systemKeywords) {
  return targetFields
    .filter(f => !systemKeywords.some(kw => f.name.includes(kw)))
    .filter(f => {
      const fieldType = mapFieldType(f.name, f.typeHint, f.isOptions, f._forceType, targetFormName);
      return fieldType !== '流水号' && fieldType !== '关联表单';
    })
    .map(f => {
      const fieldType = mapFieldType(f.name, f.typeHint, f.isOptions, f._forceType, targetFormName);
      // 复选类型在关联填充场景下改为单行文本（复选不适合只读填充）
      const mappedType = fieldType === '复选' ? '单行文本' : fieldType;
      const result = { name: f.name, type: mappedType, status: '只读' };
      // v2.x.x: 关联表单类型的被填充字段需要保留原始 typeHint（如"关联-->供应商信息"），
      // 否则 generateFieldDescription 会返回"-"，导致字段清单中缺少关联目标表标记
      if (fieldType === '关联表单' && f.typeHint && f.typeHint.includes('关联-->')) {
        result.typeHint = f.typeHint;
      }

      // v1.31.0: 从目标表单字段获取选项和说明，确保被填充字段能正确显示选项和小数单位
      // 优先从 AI override 获取（如产品分类的选项是 override 配置的，不在 parseField 解析结果中）
      const aiOverride = getFieldTypeOverride(targetFormName, f.name);
      const overrideOptions = aiOverride && aiOverride.options && Array.isArray(aiOverride.options) && aiOverride.options.length > 0
        ? aiOverride.options : null;

      if (overrideOptions) {
        result.isOptions = true;
        result.options = overrideOptions;
      } else if (f.isOptions && f.options && f.options.length > 0) {
        result.isOptions = true;
        result.options = f.options;
      }

      // v1.31.0: 从目标表单字段的 override 或 generateFieldDescription 获取说明
      // 这样被填充的数值字段（如参考采购价）能正确显示"2位小数，单位：元"
      // 下拉单选字段（如产品分类）能正确显示选项
      if (aiOverride && aiOverride.description) {
        result.description = aiOverride.description;
      }

      return result;
    });
}

// v1.29.2 新增：从关联字段名提取前缀，用于多关联同源场景自动加前缀
// "选择调出仓库" → "调出"，"选择调入仓库" → "调入"，"选择仓库" → "仓库"
function extractPrefix(associationFieldName) {
  let prefix = associationFieldName.replace(/^选择/, '');
  // 如果前缀以"仓库"结尾且去掉后不为空，去掉"仓库"（如"调出仓库"→"调出"）
  if (prefix.length > 2 && prefix.endsWith('仓库')) {
    prefix = prefix.slice(0, -2);
  }
  if (!prefix) prefix = associationFieldName;
  return prefix;
}

// v1.31.0 新增：查找字段 override 时，同时匹配纯净字段名和带括号的原始全名
// parseField 会将 "优惠类型（复选）" 解析为 {name: "优惠类型", typeHint: "复选"}
// 如果 AI 在 override 中写了 "优惠类型（复选）" 作为键，用 field.name="优惠类型" 找不到
// 此函数同时尝试两种键名，确保 override 生效
function findFieldOverride(formOverrides, field) {
  if (!formOverrides || typeof formOverrides !== 'object') return null;
  // 优先用纯净字段名匹配
  let override = formOverrides[field.name];
  if (override) return override;
  // 回退：用原始全名（name + typeHint 括号）匹配
  if (field.typeHint) {
    const fullName = `${field.name}（${field.typeHint}）`;
    override = formOverrides[fullName];
    if (override) return override;
  }
  return null;
}

function applyFieldOverrides(fields, formOverrides, formName, formFieldMap) {
  const result = [];

  // v1.28.0: 自动推导填充字段时排除的系统字段关键词
  const SYSTEM_FIELD_KEYWORDS = ['创建人', '创建时间', '修改人', '修改时间', '状态', '备注', '说明'];

  // v1.29.0: 收集主表原始字段名集合，用于自动去重
  // v1.29.1: 预收集所有 rename 后的最终字段名
  // v1.29.2: 拆分为 originalNames（主表原始字段）和 insertedFilledNames（已插入填充字段）
  // 区分两种重名情况：与主表字段重名（保留fillRules）vs 与已插入填充字段重名（加前缀）
  const originalNames = new Set();
  fields.forEach(f => {
    let override = findFieldOverride(formOverrides, f);
    // 未经 AI 确认的关联候选不生效
    if (override && override._candidate) override = null;
    if (override && override.rename) {
      originalNames.add(override.rename);
    } else {
      originalNames.add(f.name);
    }
  });

  // 已插入的填充字段名（动态更新，用于多关联同源场景的前缀去重）
  const insertedFilledNames = new Set();

  fields.forEach(field => {
    let override = findFieldOverride(formOverrides, field);

    // 未经 AI 确认的关联候选（--draft 草稿中仍带 _candidate 标记）不生效，
    // 程序绝不替 AI 拍板，按普通字段处理并明确提示
    if (override && override._candidate) {
      console.log(`  [候选未确认] ${formName}.${field.name} 的关联候选（${override.target || '未知目标'}）仍带 _candidate 标记，已按普通字段处理。确认后请删除该标记。`);
      override = null;
    }

    // v1.28.0: 自动推导的 filledFields（局部变量，不修改 override 对象）
    let autoFilledFields = null;

    // v1.29.0: 去重后的 fillRules 和 filledFields
    let finalFillRules = null;
    let finalFilledFields = null;

    if (override) {
      // 重命名
      if (override.rename) {
        field.name = override.rename;
      }

      // 设置关联表单配置（生成 typeHint 字符串供 mapFieldType 和 generateFieldDescription 使用）
      if (override.target) {
        // v1.28.0: 当 AI 未手动提供 fillRules 时，从目标表单自动推导
        let fillRules = override.fillRules;
        if (!fillRules && formFieldMap && formFieldMap[override.target]) {
          fillRules = autoGenerateFillRules(formFieldMap[override.target], override.target, SYSTEM_FIELD_KEYWORDS);
          if (fillRules.length > 0) {
            console.log(`  [自动推导填充规则] ${formName}.${field.name} → ${override.target}: ${fillRules.length} 个字段`);
          }
        }

        // v1.28.0: 当 AI 未手动提供 filledFields 时，从目标表单自动推导
        if (!override.filledFields && formFieldMap && formFieldMap[override.target]) {
          autoFilledFields = autoGenerateFilledFields(formFieldMap[override.target], override.target, SYSTEM_FIELD_KEYWORDS);
          if (autoFilledFields.length > 0) {
            console.log(`  [自动推导被填充字段] ${formName}.${field.name} → ${override.target}: ${autoFilledFields.length} 个字段`);
          }
        }

        // v2.20.0: 当显式提供了 fillRules 但未提供 filledFields 时，
        // 自动推导的 filledFields 必须与 fillRules 保持同步。
        // 只保留 fillRules 中源字段名（=号右侧）对应的字段，避免数组长度不一致导致多余字段被插入。
        if (override.fillRules && !override.filledFields && autoFilledFields && autoFilledFields.length > 0) {
          const fillRuleSourceNames = override.fillRules.map(rule => {
            const parts = rule.split('=');
            return parts.length > 1 ? parts[1].trim() : parts[0].trim();
          });
          const filtered = autoFilledFields.filter(ff => fillRuleSourceNames.includes(ff.name));
          if (filtered.length < autoFilledFields.length) {
            console.log(`  [同步填充字段] ${formName}.${field.name} → 显式fillRules与自动推导filledFields不同步，已过滤 ${autoFilledFields.length - filtered.length} 个字段`);
          }
          autoFilledFields = filtered;
        }

        // v1.29.2: 智能去重，区分两种重名情况，避免降低质量
        // 情况A：与主表原始字段重名 → 保留fillRules（让关联填充更新主表已有字段），不插入新字段
        // 情况B：与已插入填充字段重名（多关联同源）→ 自动加前缀（如"调入仓库名称"），防止信息丢失
        const filledFields = override.filledFields || autoFilledFields;
        if (filledFields && Array.isArray(filledFields) && filledFields.length > 0) {
          const dedupedFilled = [];
          const dedupedRules = [];
          const prefix = extractPrefix(field.name);

          filledFields.forEach((ff, idx) => {
            const fillRule = fillRules && fillRules[idx] ? fillRules[idx] : `${ff.name}=${ff.name}`;

            if (originalNames.has(ff.name)) {
              // 情况A：与主表原始字段重名
              // 保留fillRules（让关联填充更新主表已有字段），不插入新字段
              dedupedRules.push(fillRule);
              console.log(`  [保留填充规则] ${formName} - "${ff.name}" 为主表已有字段，保留填充规则`);
            } else if (insertedFilledNames.has(ff.name) || result.some(r => r.name === ff.name)) {
              // 情况B：与已插入的填充字段重名（多关联同源）
              // 自动加前缀（如"调入仓库名称"），防止信息丢失
              const prefixedName = `${prefix}${ff.name}`;
              if (originalNames.has(prefixedName) || insertedFilledNames.has(prefixedName) || result.some(r => r.name === prefixedName)) {
                console.log(`  [跳过重复] ${formName} - "${ff.name}" 加前缀"${prefix}"后仍重复，跳过`);
              } else {
                dedupedFilled.push({ ...ff, name: prefixedName });
                dedupedRules.push(`${prefixedName}=${ff.name}`);
                console.log(`  [自动加前缀] ${formName} - "${ff.name}" → "${prefixedName}"`);
              }
            } else {
              // 不重复，正常插入
              dedupedFilled.push(ff);
              dedupedRules.push(fillRule);
            }
          });
          finalFilledFields = dedupedFilled;
          finalFillRules = dedupedRules;
        } else if (fillRules) {
          finalFillRules = fillRules;
        }

        // 生成 typeHint（包含去重后的 fillRules）
        let typeHint = `关联-->${override.target}`;
        if (finalFillRules && Array.isArray(finalFillRules) && finalFillRules.length > 0) {
          typeHint += `；填充：${finalFillRules.join('、')}`;
        }
        field.typeHint = typeHint;
        field._forceType = '关联表单';
      } else if (override.type) {
        field._forceType = validateFieldType(override.type);
      }

      // 设置选项
      if (override.options && Array.isArray(override.options) && override.options.length > 0) {
        field.options = override.options;
        field.isOptions = true;
      }

      // 设置字段状态
      if (override.status) {
        field._forceStatus = override.status;
      }

      // 设置字段说明
      if (override.description) {
        field._forceDescription = override.description;
      }
    }

    result.push(field);

    // 在该字段后面插入去重后的被填充字段
    if (finalFilledFields && Array.isArray(finalFilledFields) && finalFilledFields.length > 0) {
      finalFilledFields.forEach(ff => {
        // v1.29.2: 再次检查是否与 result 中已插入的填充字段重复
        if (result.some(r => r.name === ff.name)) {
          console.log(`  [跳过重复] ${formName} - "${ff.name}" 与已插入的填充字段重复，跳过`);
        } else {
          insertedFilledNames.add(ff.name);
          // v1.31.0: 不设 _forceDescription（或仅当有显式 description 时才设），
          // 让 generateFieldDescription 根据字段名和类型自然推断说明（下拉选项、数值小数单位等）
          const filledField = {
            name: ff.name,
            typeHint: ff.typeHint || ff.type || '单行文本',
            options: ff.options || null,
            isOptions: !!(ff.options && ff.options.length > 0),
            _forceType: ff.type ? validateFieldType(ff.type) : '单行文本',
            _forceStatus: ff.status || '只读',
            _auto: true,
            _isFilled: true
          };
          // 仅当 override 显式提供了 description 时才强制说明
          if (ff.description) {
            filledField._forceDescription = ff.description;
          }
          result.push(filledField);
        }
      });
    }
  });

  return result;
}

// ==================== 合法字段类型白名单 ====================
// 所有字段类型必须严格来自此列表，禁止输出任何不在列表中的类型
const VALID_FIELD_TYPES = [
  '单行文本', '多行文本', '数值', '日期',
  '单选', '复选', '下拉单选', '下拉复选',
  '关联表单', '成员', '部门', '附件', '图片', '地址', '流水号'
];

function validateFieldType(type) {
  if (!VALID_FIELD_TYPES.includes(type)) {
    console.error(`[类型校验失败] 非法字段类型: "${type}"，已强制回退为"单行文本"`);
    return '单行文本';
  }
  return type;
}

// ==================== 行业字段知识库 ====================
// v1.24.0: 已删除硬编码行业知识库
// 当Excel中缺少某个表单的字段定义时，由AI根据用户提供的行业场景动态推导
// 脚本不再内置任何特定行业的字段定义

const industryFieldLibrary = {};

// ==================== 流水号唯一性校验 ====================

/**
 * 确保每个表单中只有一个流水号字段
 * 规则：
 * 1. 保留第一个流水号字段（通常是表单的主编号，如"审核编号"）
 * 2. 后续检测到的流水号字段，如果名称包含"原"、"修改后"等前缀，转为单行文本
 * 3. 其他重复的流水号，根据上下文转为合适的类型（如"报告编号"在"报告审核"中可保留，但在其他表单中如果是第二个流水号则转为单行文本）
 */
function ensureSingleSerialNumber(fields, formName) {
  let serialNumberCount = 0;
  const processedFields = fields.map(field => {
    const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions);
    if (fieldType === '流水号') {
      serialNumberCount++;
      if (serialNumberCount > 1) {
        // 第二个及以后的流水号，需要转换类型
        // 如果字段名包含"原"、"旧"、"修改后"等，说明是引用其他表单的编号，转为单行文本
        if (field.name.includes('原') || field.name.includes('旧') || field.name.includes('修改后') || field.name.includes('新')) {
          console.log(`  [流水号去重] ${formName} - "${field.name}" 是引用编号，转为单行文本`);
          return { ...field, typeHint: '单行文本', _convertedFromSerial: true, _forceType: '单行文本' };
        }
        // 其他情况，如"报告编号"在"报告审核"中，是业务编号而非表单编号，转为单行文本
        console.log(`  [流水号去重] ${formName} - "${field.name}" 是业务编号，转为单行文本`);
        return { ...field, typeHint: '单行文本', _convertedFromSerial: true, _forceType: '单行文本' };
      }
    }
    return field;
  });
  return processedFields;
}

// ==================== 辅助函数：获取字段类型（用于校验） ====================

function getFieldTypeForCheck(field) {
  return mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType);
}

// ==================== 字段解析函数 ====================

function parseField(fieldStr) {
  if (!fieldStr || typeof fieldStr !== 'string') return null;
  fieldStr = fieldStr.trim();
  const bracketMatch = fieldStr.match(/^(.+?)（(.+?)）$/);
  if (bracketMatch) {
    const name = bracketMatch[1].trim();
    const bracketContent = bracketMatch[2].trim();
    if (bracketContent.includes('/') || bracketContent.includes('、')) {
      return { name, typeHint: null, options: bracketContent.split(/[\/、]/).map(opt => opt.trim()).filter(opt => opt), isOptions: true };
    } else {
      return { name, typeHint: bracketContent, options: null, isOptions: false };
    }
  }
  return { name: fieldStr, typeHint: null, options: null, isOptions: false };
}

function parseFields(fieldsStr) {
  if (!fieldsStr || typeof fieldsStr !== 'string') return [];
  return fieldsStr.split(/[、,]/).map(f => f.trim()).filter(f => f).map(fieldStr => parseField(fieldStr)).filter(f => f !== null);
}

// ==================== 字段类型映射 ====================
// 所有返回的字段类型必须通过 validateFieldType 校验，确保严格来自白名单

function mapFieldType(fieldName, typeHint, isOptions, forceType, formName = '') {
  let result = '单行文本'; // 默认回退值

  // 如果被强制指定类型（如 ensureSingleSerialNumber 的类型转换），直接使用
  if (forceType) {
    return validateFieldType(forceType);
  }

  // 如果明确指定了typeHint，优先使用
  if (typeHint) {
    const hint = typeHint.toLowerCase();
    // 精确匹配白名单中的类型
    if (hint === '单行文本') result = '单行文本';
    else if (hint === '多行文本') result = '多行文本';
    else if (hint === '数值') result = '数值';
    else if (hint === '日期') result = '日期';
    else if (hint === '单选') result = '单选';
    else if (hint === '复选') result = '复选';
    else if (hint === '下拉单选') result = '下拉单选';
    else if (hint === '下拉复选') result = '下拉复选';
    else if (hint === '关联表单') result = '关联表单';
    // "填充"（原"关联带出"）是字段属性而非字段类型，不在此处返回类型
    // 由后续字段名推断逻辑（mapFieldType 的 fieldName 推断部分）确定实际类型
    else if (hint === '成员') result = '成员';
    else if (hint === '部门') result = '部门';
    else if (hint === '附件') result = '附件';
    else if (hint === '图片') result = '图片';
    else if (hint === '地址') result = '地址';
    else if (hint === '流水号') result = '流水号';
    // hint中的关键词推断
    // 必须先检查"填充"，避免"填充-->目标表单.源字段"被 hint.includes('关联') 错误匹配为"关联表单"
    else if (hint.includes('填充')) { /* 填充是属性，跳过类型推断，由字段名推断 */ }
    else if (hint.includes('流水号')) result = '流水号';
    else if (hint.includes('编号') && !hint.includes('单行文本') && !hint.includes('多行文本')) result = '流水号';
    else if (hint.includes('关联')) result = '关联表单';
    else if (hint.includes('多行') || hint.includes('备注') || hint.includes('说明')) result = '多行文本';
    else if (hint.includes('日期')) result = '日期';
    else if (hint.includes('金额') || hint.includes('价格') || hint.includes('费用') || hint.includes('价') && !hint.includes('评价')) result = '数值';
    else if (hint.includes('数值') || hint.includes('数字') || hint.includes('数量') || hint.includes('个数') || hint.includes('人数')) result = '数值';
    else if (hint.includes('余额') || hint.includes('额度') || hint.includes('上限') || hint.includes('下限')) result = '数值';
    else if (hint.includes('比例') || hint.includes('比率')) result = '数值';
    else if (hint.endsWith('值') || hint.endsWith('阈值')) result = '数值';
    else if (hint.includes('成员') || hint.includes('人员') || hint.includes('负责人')) result = '成员';
    else if (hint.includes('部门')) result = '部门';
    else if (hint.includes('附件')) result = '附件';
    else if (hint.includes('图片') || hint.includes('照片')) result = '图片';
    else if (hint.includes('地址')) result = '地址';
    // "填充"（原"关联带出"）是字段属性，不作为类型返回
    // 含"填充"的typeHint（如"填充-->源表单.源字段"）跳过类型推断，由字段名推断实际类型
  }

  // 用户显式 typeHint 已命中具体类型时，不再使用 AI 覆盖或兜底规则
  const hasExplicitTypeHint = result !== '单行文本';

  // AI 语义覆盖：当用户没有显式写 typeHint 时，优先采用 AI 预推断结果
  if (!hasExplicitTypeHint && formName) {
    const aiOverride = getFieldTypeOverride(formName, fieldName);
    if (aiOverride && aiOverride.type) {
      const validatedType = validateFieldType(aiOverride.type);
      if (aiOverride.type !== validatedType && validatedType === '单行文本') {
        // AI 指定的类型非法，回退为单行文本并跳过兜底规则
        console.warn(`  [AI类型覆盖警告] ${formName}.${fieldName} 指定的类型 "${aiOverride.type}" 不合法，已回退为"单行文本"`);
        return validatedType;
      }
      console.log(`  [AI类型覆盖] ${formName}.${fieldName} → ${validatedType}`);
      return validatedType;
    }
  }

  // 如果typeHint没有匹配到，根据字段名称推断
  if (result === '单行文本') {
    if (fieldName.includes('编号') || fieldName.includes('单号') || fieldName.includes('编码')) result = '流水号';
    else if (fieldName.includes('日期') || fieldName.includes('时间')) result = '日期';
    else if (fieldName.includes('金额') || fieldName.includes('费用') || fieldName.includes('价') || fieldName.includes('成本') || fieldName.includes('余额') || fieldName.includes('额度') || fieldName.includes('上限') || fieldName.includes('下限') || fieldName.includes('税额') || fieldName.includes('预算')) result = '数值';
    else if (fieldName.includes('数量') || fieldName.includes('个数') || fieldName.includes('人数') || fieldName.includes('次数') || fieldName.includes('天数') || fieldName.includes('份数') || fieldName.includes('张数')) result = '数值';
    else if (fieldName.includes('比例') || fieldName.includes('比率') || fieldName.includes('系数') || fieldName.includes('折扣') || fieldName.includes('税率')) result = '数值';
    else if (fieldName.includes('备注') || fieldName.includes('说明') || fieldName.includes('描述') || fieldName.includes('内容') || fieldName.includes('简介') || fieldName.includes('事由') || fieldName.includes('原因') || fieldName.includes('意见') || fieldName.includes('条款') || fieldName.includes('明细')) result = '多行文本';
    else if (fieldName.includes('附件') || fieldName.includes('文件')) result = '附件';
    else if (fieldName.includes('照片') || fieldName.includes('图片')) result = '图片';
    else if (fieldName.includes('地址') || fieldName.includes('位置') || fieldName.includes('地点')) result = '地址';
    else if (fieldName.includes('人员') || fieldName.includes('负责人') || fieldName.includes('创建人') || fieldName.includes('成员') || fieldName.includes('员工') || fieldName.includes('申请人') || fieldName.includes('经办人') || fieldName.includes('审批人') || fieldName.includes('审核人')) result = '成员';
    else if (fieldName.includes('部门')) result = '部门';
    else if (fieldName.includes('状态') || fieldName.includes('类型') || fieldName.includes('等级') || fieldName.includes('方式')) result = '下拉单选';
    // v1.21.0 新增：分类/类别/品类/组别/单位/计量单位 语义上属于下拉单选
    else if (fieldName.includes('分类') || fieldName.includes('类别') || fieldName.includes('品类') || fieldName.includes('组别')) result = '下拉单选';
    else if (fieldName.includes('单位') || fieldName.includes('计量单位')) result = '下拉单选';
  }

  // 选项字段：如果字段名包含选项特征，推断为下拉单选
  // v1.31.0: 但如果 forceType 已指定（如 override 指定了下拉复选），不覆盖
  if (isOptions && !forceType) {
    result = '下拉单选';
  }

  return validateFieldType(result);
}

// ==================== 字段说明生成 ====================

// v1.32.0 新增：从所有表单的 override 中查找字段配置（用于子表字段继承源表单选项）
function getFieldOverrideFromAllForms(fieldName) {
  if (!fieldTypeOverrides || typeof fieldTypeOverrides !== 'object') return null;
  for (const formName of Object.keys(fieldTypeOverrides)) {
    const formOverrides = fieldTypeOverrides[formName];
    if (!formOverrides || typeof formOverrides !== 'object') continue;
    const override = formOverrides[fieldName];
    if (override && override.options && Array.isArray(override.options) && override.options.length > 0) {
      return override;
    }
  }
  return null;
}

function generateFieldDescription(field, formType, formName) {
  // 强制说明（由 applyOverrides 设置）
  if (field._forceDescription) return field._forceDescription;

  // 优先使用当前表单 AI 覆盖配置中的选项
  const aiOverride = formName ? getFieldTypeOverride(formName, field.name) : null;
  if (aiOverride && aiOverride.type && VALID_FIELD_TYPES.includes(aiOverride.type) &&
      aiOverride.options && Array.isArray(aiOverride.options) && aiOverride.options.length > 0) {
    return aiOverride.options.join('/');
  }

  // v1.32.0：如果当前表单找不到，从所有表单的 override 中查找（子表字段继承源表单选项）
  if (!aiOverride || !aiOverride.options || !Array.isArray(aiOverride.options) || aiOverride.options.length === 0) {
    const allFormsOverride = getFieldOverrideFromAllForms(field.name);
    if (allFormsOverride && allFormsOverride.options && Array.isArray(allFormsOverride.options) && allFormsOverride.options.length > 0) {
      return allFormsOverride.options.join('/');
    }
  }

  if (field.typeHint) {
    if (field.typeHint.includes('关联-->')) return field.typeHint;
    // 旧格式兼容：typeHint 包含"填充-->"时保留原值
    if (field.typeHint.includes('填充-->')) return field.typeHint;
    if (field.typeHint.includes('公式')) return field.typeHint;
    if (field.typeHint.includes('位小数')) return field.typeHint;
    if (field.typeHint.includes('单位')) return field.typeHint;
  }
  if (field.isOptions) return field.options.join('/');
  
  const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType, formName);
  if (fieldType === '流水号') {
    const prefix = formName ? inferSerialPrefix(formName) : 'SN';
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const example = `${prefix}${dateStr}001`;
    return `前缀：${prefix}，示例：${example}`;
  }
  if (fieldType === '数值') {
    // 上下限通常是数量阈值，不按金额处理，除非字段名明确包含金额类词
    if ((field.name.includes('上限') || field.name.includes('下限')) && !field.name.includes('价') && !field.name.includes('金额') && !field.name.includes('余额') && !field.name.includes('额度')) return '0位小数，单位：个';
    // 金额类
    if (field.name.includes('金额') || field.name.includes('费用') || field.name.includes('价') || field.name.includes('成本') || field.name.includes('税额') || field.name.includes('价税') || field.name.includes('预算') || field.name.includes('余额') || field.name.includes('额度')) return '2位小数，单位：元';
    // 数量类
    if (field.name.includes('数量') || field.name.includes('个数') || field.name.includes('人数') || field.name.includes('次数') || field.name.includes('天数') || field.name.includes('份数') || field.name.includes('张数') || field.name.includes('年限')) return '0位小数，单位：个';
    // 比例类
    if (field.name.includes('比例') || field.name.includes('比率') || field.name.includes('系数') || field.name.includes('折扣') || field.name.includes('税率')) return '2位小数，单位：%';
    if (field.name.includes('小时')) return '1位小数，单位：小时';
  }
  // 下拉单选/下拉复选/复选字段：如果没有选项，推断默认选项
  if (fieldType === '下拉单选' || fieldType === '下拉复选' || fieldType === '复选') {
    const defaultOptions = inferDefaultOptions(field.name);
    if (defaultOptions) return defaultOptions.join('/');
  }
  return '-';
}

// ==================== 流水号前缀推断 ====================

function inferSerialPrefix(formName) {
  // 不按行业硬编码前缀。英文取单词首字母，中文取拼音首字母。
  const sourceName = String(formName || '').trim();
  const asciiWords = sourceName.match(/[A-Za-z0-9]+/g) || [];
  if (asciiWords.length > 0) {
    const prefix = asciiWords.map(word => word[0]).join('').toUpperCase().slice(0, 6);
    if (prefix) return prefix;
  }

  const rawName = sourceName.replace(/[《》【】()\[\]\s]/g, '');
  const prefix = rawName
    .replace(/^选择/, '')
    .split('')
    .map(getPinyinInitial)
    .join('')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 2);
  return prefix || 'SN';
}

function getPinyinInitial(char) {
  if (/^[A-Za-z0-9]$/.test(char)) return char.toUpperCase();
  if (!iconv || !/[\u4e00-\u9fa5]/.test(char)) return '';

  const boundaryCodes = [
    -20319, -20283, -19775, -19218, -18710, -18526, -18239, -17922, -17417,
    -16474, -16212, -15640, -15165, -14922, -14914, -14630, -14149, -14090,
    -13318, -12838, -12556, -11847, -11055, -10247
  ];
  const initials = 'ABCDEFGHJKLMNOPQRSTWXYZ';
  const buffer = iconv.encode(char, 'gbk');
  if (buffer.length < 2) return '';

  const code = buffer[0] * 256 + buffer[1] - 65536;
  for (let i = 0; i < boundaryCodes.length - 1; i++) {
    if (code >= boundaryCodes[i] && code < boundaryCodes[i + 1]) {
      return initials[i];
    }
  }
  return '';
}

// ==================== 下拉单选默认选项推断 ====================

function inferDefaultOptions(fieldName) {
  // 状态类字段
  if (fieldName.includes('状态')) {
    return ['启用', '停用'];
  }
  // 类型类字段
  if (fieldName.includes('类型')) {
    return null;
  }
  // 方式类字段
  if (fieldName.includes('方式')) {
    return null;
  }
  // v1.32.0 修改：禁止返回占位数据，分类字段返回 null（由 AI 在 override 中配置真实选项）
  if (fieldName.includes('分类') || fieldName.includes('类别') || fieldName.includes('品类') || fieldName.includes('组别')) {
    return null;
  }
  // v1.21.0 新增：单位/计量单位 默认选项
  if (fieldName.includes('单位') || fieldName.includes('计量单位')) {
    return ['个', '件', '箱', '套', '千克', '克', '升', '米', '台', '只', '支', '张', '本', '瓶', '袋'];
  }
  return null;
}

// ==================== 字段状态判断 ====================

function getFieldStatus(field) {
  if (field._forceStatus) return field._forceStatus;
  const { name: fieldName, type: fieldType, typeHint, _filling } = field;
  if (fieldName === '创建人' || fieldName === '创建时间') return '只读';
  if (_filling) return '只读';
  if (typeHint && typeHint.includes('填充-->')) return '只读';
  if (typeHint && typeHint.includes('自动生成')) return '只读';
  if (typeHint && typeHint.includes('公式')) return '只读';
  if (fieldType === '流水号') return '只读';
  return '普通';
}

// ==================== 智能补充字段 ====================

// 数据标题仅支持以下字段类型（宜搭平台限制）
const VALID_DATA_TITLE_TYPES = ['单行文本', '数值', '单选', '下拉单选', '成员', '流水号'];

/**
 * 校验数据标题字段的类型是否合法
 * @param {string} fieldName - 数据标题字段名称
 * @param {Array} mainFields - 主表字段列表
 * @param {string} formName - 表单名称（用于 mapFieldType）
 * @returns {boolean} 类型是否合法
 */
function validateDataTitleType(fieldName, mainFields, formName) {
  if (!fieldName || !mainFields) return false;
  const field = mainFields.find(f => f.name === fieldName);
  if (!field) return false;
  const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType, formName);
  return VALID_DATA_TITLE_TYPES.includes(fieldType);
}

/**
 * 推断数据标题字段
 * 流程表单优先级：流水号字段 > 名称类字段 > 第一个单行文本字段 > 第一个合法类型字段
 * 普通表单优先级：名称类字段 > 第一个单行文本字段 > 流水号字段 > 第一个合法类型字段
 * 数据标题仅支持：单行文本, 数值, 单选, 下拉单选, 成员, 流水号
 * @param {Array} mainFields - 主表字段列表
 * @param {string} formType - 表单类型（'普通表单' 或 '流程表单'）
 * @returns {string|null} 数据标题字段名称
 */
function inferDataTitle(mainFields, formType) {
  if (!mainFields || mainFields.length === 0) return null;

  const NAME_KEYWORDS = ['名称', '名字', '标题', '主题', '姓名'];
  const EXCLUDE_KEYWORDS = ['创建人', '创建时间', '修改人', '修改时间', '备注', '说明', '描述', '电话', '手机', '地址', '编号', '编码', '代码'];

  function findSerialNumber() {
    for (const field of mainFields) {
      const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType);
      if (fieldType === '流水号') return field.name;
    }
    return null;
  }

  function findNameField() {
    for (const field of mainFields) {
      const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType);
      if (fieldType === '单行文本' && !EXCLUDE_KEYWORDS.some(kw => field.name.includes(kw))) {
        if (NAME_KEYWORDS.some(kw => field.name.includes(kw))) return field.name;
      }
    }
    return null;
  }

  function findFirstTextField() {
    for (const field of mainFields) {
      const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType);
      if (fieldType === '单行文本' && !EXCLUDE_KEYWORDS.some(kw => field.name.includes(kw))) return field.name;
    }
    return null;
  }

  // 兜底：在所有合法数据标题类型中找第一个（排除系统字段）
  function findFirstValidTitleField() {
    for (const field of mainFields) {
      const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType);
      if (VALID_DATA_TITLE_TYPES.includes(fieldType) && !EXCLUDE_KEYWORDS.some(kw => field.name.includes(kw))) {
        return field.name;
      }
    }
    return null;
  }

  // 流程表单：流水号 > 名称类 > 第一个单行文本 > 第一个合法类型字段
  // 普通表单：名称类 > 第一个单行文本 > 流水号 > 第一个合法类型字段
  if (formType === '流程表单') {
    return findSerialNumber() || findNameField() || findFirstTextField() || findFirstValidTitleField();
  } else {
    return findNameField() || findFirstTextField() || findSerialNumber() || findFirstValidTitleField();
  }
}

// ==================== 关联候选推断（preview / --draft 共用） ====================
// 纯通用相似度匹配，不含任何行业硬编码。
// 职责边界：程序只负责"发现候选并给出依据"，是否确认为关联表单始终由 AI 判断。
function findAssociationCandidates(fieldName, allFormNames, currentFormName) {
  const candidates = [];
  const rawName = String(fieldName || '').trim();
  if (!rawName) return candidates;
  const cleaned = rawName.replace(/^(选择|关联|引用)/, '');

  for (const formName of allFormNames) {
    if (!formName || formName === currentFormName || formName.length < 2) continue;
    let reason = null;
    if (rawName === formName) {
      reason = '字段名与表单名相同';
    } else if (cleaned === formName) {
      reason = '去掉"选择/关联/引用"前缀后与表单名相同';
    } else if (cleaned.length >= 2 && formName.includes(cleaned)) {
      reason = `字段名"${cleaned}"是表单名的一部分`;
    } else if (cleaned.includes(formName)) {
      reason = '字段名包含表单名';
    }
    if (reason) candidates.push({ formName, reason });
  }
  return candidates.slice(0, 3); // 最多3个候选，避免干扰
}

// 推断数据标题时排除关联候选字段：
// 关联候选被 AI 确认后会变成"关联表单"类型（且通常被 rename 为"选择X"），
// 而数据标题仅支持 单行文本/数值/单选/下拉单选/成员/流水号，关联候选字段不适合作为标题建议
function inferSuggestedDataTitle(mainFields, formType, allFormNames, currentFormName) {
  const fieldsForTitle = (mainFields || []).filter(
    f => findAssociationCandidates(f.name, allFormNames, currentFormName).length === 0
  );
  return inferDataTitle(fieldsForTitle, formType);
}

// ==================== 草稿 override 生成（--draft 模式） ====================
// 分工原则：程序预填确定性内容（关联候选、数值说明建议、数据标题建议），
// AI 负责确认候选（删除 _candidate 标记）、创造真实选项（options）、修正建议。
function generateDraftOverrides(forms) {
  const allFormNames = forms.map(f => f.name);
  const draft = {
    _readme: [
      '本文件是脚本自动生成的草稿，须经 AI 审核后才能用于正式生成：',
      '1. 带 "_candidate": true 的条目是程序发现的关联候选，必须由 AI 结合业务语义确认：确认则删除 _candidate/_reason/_candidates 三个标记（target 可改为 _candidates 中的其他表单）；否定则删除整个条目。未确认的候选在正式生成时会被脚本忽略。',
      '2. 带 "_needOptions": true 的条目必须由 AI 填入真实业务选项（禁止使用"选项1/类别1"等占位数据），填好后删除 _needOptions/_reason 标记。',
      '3. 数值字段的 description 是程序建议值，可直接保留或按业务修正（如单位改为"万元"）。',
      '4. _meta.dataTitle 是程序建议的数据标题，可修改或删除（删除后由脚本自动推断）。',
      '5. 脚本已能稳定推断的字段（流水号、日期、成员、状态、单位等）未列入本草稿，无需添加。'
    ]
  };

  for (const form of forms) {
    const formDraft = {};

    const suggestedTitle = inferSuggestedDataTitle(form.mainFields, form.type, allFormNames, form.name);
    if (suggestedTitle) {
      formDraft._meta = { dataTitle: suggestedTitle };
    }

    const processFields = (fields) => {
      for (const field of fields) {
        // 用户已在 Excel 中显式标注类型或选项的字段，不打扰
        if (field.typeHint || field.isOptions) continue;

        const candidates = findAssociationCandidates(field.name, allFormNames, form.name);
        if (candidates.length > 0) {
          formDraft[field.name] = {
            _candidate: true,
            _reason: candidates.map(c => `${c.formName}（${c.reason}）`).join('；'),
            _candidates: candidates.map(c => c.formName),
            type: '关联表单',
            target: candidates[0].formName
          };
          continue;
        }

        const suggestedType = mapFieldType(field.name, field.typeHint, field.isOptions, null, form.name);

        if (suggestedType === '数值') {
          const desc = generateFieldDescription(field, form.type, form.name);
          formDraft[field.name] = { description: desc === '-' ? '0位小数' : desc };
          continue;
        }

        if (suggestedType === '下拉单选') {
          // 脚本能稳定推断选项的（状态、单位），不列入草稿
          if (inferDefaultOptions(field.name)) continue;
          formDraft[field.name] = {
            type: '下拉单选',
            options: null,
            _needOptions: true,
            _reason: '脚本无法推断该字段的选项，请基于业务场景填写真实选项'
          };
        }
      }
    };

    processFields(form.mainFields);
    if (form.subTables) {
      for (const st of form.subTables) {
        processFields(st.fields);
      }
    }

    if (Object.keys(formDraft).length > 0) {
      draft[form.name] = formDraft;
    }
  }

  return draft;
}

function autoCompleteFields(formName, formType, existingFields) {
  const completedFields = [...existingFields];
  const fieldNames = existingFields.map(f => f.name);

  if (!fieldNames.includes('创建人')) {
    completedFields.push({ name: '创建人', typeHint: '成员', options: null, isOptions: false, _auto: true });
  }
  if (!fieldNames.includes('创建时间')) {
    completedFields.push({ name: '创建时间', typeHint: '日期', options: null, isOptions: false, _auto: true });
  }

  if (formType === '普通表单' && !fieldNames.includes('状态')) {
    completedFields.push({ name: '状态', typeHint: null, options: ['启用', '停用'], isOptions: true, _auto: true });
  }

  return completedFields;
}

function inferTargetFields(formName) {
  // 保留空实现兼容旧调用/测试。脚本不得基于表单名自动推断业务填充字段。
  return [];
}

// ==================== 数字转中文 ====================

function numberToChinese(num) {
  const chinese = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
  if (num <= 15) return chinese[num - 1];
  return num;
}

/**
 * 去除模块名称中已有的中文序号前缀（如"一、基础信息" → "基础信息"）
 * 避免脚本自动添加序号时出现"一、一、基础信息"的重复。
 * 【v1.22.0 修复】用全局匹配剥离所有重复前缀，防止多重前缀（"一、一、基础信息"）残留
 */
function stripModuleNumberPrefix(moduleName) {
  return String(moduleName || '').replace(/^(?:[一二三四五六七八九十]+[、.．]\s*)+/, '');
}

// ==================== 生成字段清单 Markdown ====================

function generateFieldListMarkdown(forms, systemName, version) {
  let md = `# ${systemName} - 表单字段清单\n\n`;
  md += `> 版本: ${version}\n`;
  md += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
  md += `> 更新说明: 从Excel导入并智能扩展\n\n`;
  md += `---\n\n`;
  md += `## 📋 字段清单使用说明\n\n`;
  md += `### 一、可用字段类型\n\n`;
  md += `单行文本、多行文本、数值、日期、单选、复选、下拉单选、下拉复选、关联表单、成员、部门、附件、图片、地址、流水号\n\n`;
  md += `### 二、字段说明格式规范\n\n`;
  md += `**只有以下4类字段需要填写字段说明，其他字段留空或填"-"**\n\n`;
  md += `| 字段类型 | 字段说明格式 | 示例 |\n`;
  md += `|---------|-------------|------|\n`;
  md += `| **流水号** | \`前缀：XXX，示例：XXXyyyyMMdd001\` | 前缀：SN，示例：SN20260702001 |\n`;
  md += `| **关联表单** | \`关联-->目标表单名称\`（如有填充规则，用 \`；填充：当前字段=源字段\` 追加，多个填充对用顿号\`、\`分隔） | 关联-->供应商信息；填充：供应商名称=供应商名称、联系人=联系人、联系电话=联系电话 |\n`;
  md += `| **数值** | \`X位小数，单位：XXX\` | 2位小数，单位：元 |\n`;
  md += `| **下拉单选/多选** | \`选项值1/选项值2/选项值3\` | 启用/停用 |\n\n`;
  md += `> **重要**：填充规则是关联表单字段的配置之一，统一写在关联表单字段的说明列中。被填充字段的说明列恢复自由，可以正常填写自身属性（如选项、小数位数等），不再写"填充-->XXX.XXX"。\n\n`;
  md += `### 三、字段状态\n\n`;
  md += `| 状态值 | 说明 | 默认值 |\n`;
  md += `|-------|------|--------|\n`;
  md += `| **普通** | 字段可编辑输入（对应宜搭NORMAL） | 大部分字段默认为普通状态 |\n`;
  md += `| **只读** | 字段不可编辑，仅用于展示（对应宜搭READONLY） | 被填充字段、系统自动生成字段默认为只读状态 |\n`;
  md += `| **隐藏** | 字段在表单中不显示（对应宜搭HIDDEN） | 默认无隐藏字段，用户可根据需要设置 |\n\n`;
  md += `**字段状态自动判定规则**：\n`;
  md += `- **只读**：流水号、创建人、创建时间、被填充字段、公式计算字段\n`;
  md += `- **普通**：其他所有字段\n\n`;
  md += `**⚠️ 重要说明**：宜搭流程表单会自动记录审批相关信息（审批人、审批时间、审批意见等），**不需要在表单字段中添加审批相关字段**\n\n`;
  md += `### 四、是否必填\n\n`;
  md += `- **是**：该字段为必填项\n`;
  md += `- **否**：该字段为选填项（默认）\n\n`;
  md += `**默认值规则**：\n`;
  md += `- 所有字段默认**非必填**（便于前期测试数据）\n`;
  md += `- 流水号字段**永不必填**（系统自动生成）\n`;
  md += `- 创建人、创建时间等系统字段**永不必填**\n\n`;
  md += `### 五、表单类型标识\n\n`;
  md += `- 「普通表单」：基础数据维护，无审批流程\n`;
  md += `- 「流程表单」：需要审批流程的业务单据\n\n`;
  md += `### 六、数据标题\n\n`;
  md += `每个表单名称下方会自动推断一个数据标题字段，格式为 \`**数据标题：字段名称**\`\n\n`;
  md += `**推断规则：**\n`;
  md += `1. 优先选择流水号字段（适合流程表单或业务单据）\n`;
  md += `2. 其次选择名称类字段（适合基础资料或主数据表）\n`;
  md += `3. 最后选择第一个单行文本字段\n\n`;
  md += `**用户可自行修改**：将 \`**数据标题：XXX**\` 中的字段名称改为目标字段即可\n\n`;
  md += `---\n\n`;

  const modules = {};
  forms.forEach(form => {
    if (!modules[form.group]) modules[form.group] = [];
    modules[form.group].push(form);
  });

  let moduleIndex = 1;
  for (const [moduleName, moduleForms] of Object.entries(modules)) {
    md += `## ${numberToChinese(moduleIndex)}、${stripModuleNumberPrefix(moduleName)}\n\n`;
    
    moduleForms.forEach((form, formIndex) => {
      md += `### (${numberToChinese(formIndex + 1)}) ${form.name}「${form.type}」\n\n`;
      
      // 推断数据标题字段（优先使用 AI override 指定的数据标题）
      let dataTitleField = form._dataTitleOverride || inferDataTitle(form.mainFields, form.type);
      // 校验数据标题字段类型是否合法（仅支持：单行文本, 数值, 单选, 下拉单选, 成员, 流水号）
      if (dataTitleField && !validateDataTitleType(dataTitleField, form.mainFields, form.name)) {
        const field = form.mainFields.find(f => f.name === dataTitleField);
        const actualType = field ? mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType, form.name) : '未知';
        console.warn(`  [数据标题类型校验] ${form.name} - "${dataTitleField}" 的类型"${actualType}"不在合法范围内（仅支持：单行文本, 数值, 单选, 下拉单选, 成员, 流水号），已自动回退`);
        dataTitleField = inferDataTitle(form.mainFields, form.type);
      }
      md += `**数据标题：${dataTitleField || '（需手动指定）'}**（仅支持：单行文本, 数值, 单选, 下拉单选, 成员, 流水号）\n\n`;
      
      md += `**主表：${form.name}**\n\n`;
      md += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
      md += `|---------|---------|---------|---------|---------|\n`;
      
      form.mainFields.forEach(field => {
        const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType, form.name);
        const description = generateFieldDescription(field, form.type, form.name);
        const status = getFieldStatus(field);
        md += `| ${field.name} | ${fieldType} | ${description} | ${status} | 否 |\n`;
      });
      
      md += `\n`;
      
      if (form.subTables && form.subTables.length > 0) {
        form.subTables.forEach(subTable => {
          if (subTable.name && subTable.fields.length > 0) {
            md += `**子表：${subTable.name}**\n\n`;
            md += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
            md += `|---------|---------|---------|---------|---------|\n`;
            
            subTable.fields.forEach(field => {
              const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType, form.name);
              const description = generateFieldDescription(field, form.type, form.name);
              const status = getFieldStatus(field);
              md += `| ${field.name} | ${fieldType} | ${description} | ${status} | 否 |\n`;
            });
            
            md += `\n`;
          }
        });
      }
    });
    
    moduleIndex++;
  }

  md += `---\n\n`;
  md += `**文件链接**: [规则清单.md](./规则清单.md)\n`;

  return md;
}

// ==================== 生成规则清单 Markdown ====================
// v3.0.0 重构：规则清单统一为五类结构，供用户参考评审，不在宜搭平台直接生成。
//   五类：① 表单内公式 ② 表单校验规则 ③ 表单动作代码 ④ 业务规则 ⑤ 自动化规则
//   组织方式：按分组 → 表单 → 五类规则 逐层展开，便于用户在「生成清单」页面查看与编辑。
//   原则：规则清单是「建议参考」，AI 依据字段清单中的字段特性与关联关系自动推断，
//         具体实现（公式表达式、校验代码、动作代码）留待用户确认后由 AI 生成。

// 规则清单的五类名称（保持与「生成清单」页面 Tab/分区一致）
const RULE_CATEGORIES = ['表单内公式', '表单校验规则', '表单动作代码', '业务规则', '自动化规则'];

// 推断字段是否为数值计算候选（用于「表单内公式」推断）
function isCalcCandidate(fieldName) {
  return /金额|总额|小计|合计|总价|差价|差异|库存|数量|价格|成本|利润|折扣|税额|净值|余额|净额|结存|应收|应付/.test(fieldName);
}

// 推断字段是否需要校验（用于「表单校验规则」推断）
// 排除系统自动字段（创建人/创建时间/修改人/修改时间等），避免污染业务校验规则
const SYSTEM_FIELD_NAMES = ['创建人', '创建时间', '修改人', '修改时间', '数据标题'];
function isSystemField(name) {
  return SYSTEM_FIELD_NAMES.some(kw => name.includes(kw));
}
function inferValidationRules(field, fieldType, formType) {
  const rules = [];
  if (isSystemField(field.name)) return rules; // 系统字段不生成业务校验
  if (field.required) {
    rules.push({ field: field.name, type: '必填校验', rule: '该字段为必填项' });
  }
  if (fieldType === '数值') {
    // 从字段说明中提取小数位/单位（说明格式形如 "2位小数，单位：元"）
    const desc = field.description || '';
    const decimal = (desc.match(/(\d+)位小数/) || [])[1];
    rules.push({ field: field.name, type: '数值范围', rule: `仅允许数字${decimal ? `，保留 ${decimal} 位小数` : ''}` });
  }
  if (fieldType === '流水号') {
    rules.push({ field: field.name, type: '唯一性', rule: '系统自动生成，唯一不可重复' });
  }
  if (fieldType === '日期') {
    rules.push({ field: field.name, type: '日期格式', rule: '必须为合法日期' });
  }
  return rules;
}

function generateRuleListMarkdown(forms, systemName, version) {
  let md = `# ${systemName} - 规则清单\n\n`;
  md += `> 版本: ${version}\n`;
  md += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
  md += `> 更新说明: 依据字段清单智能推断，供评审参考\n\n`;
  md += `---\n\n`;
  md += `## 📋 规则清单使用说明\n\n`;
  md += `本规则清单以**表单为主体**组织，每个表单的五类规则集中展示，方便查找与评审：\n\n`;
  md += `| 序号 | 规则类型 | 说明 |\n`;
  md += `|:---:|---------|------|\n`;
  md += `| ① | **表单内公式** | 字段间的计算公式，如金额=单价×数量 |\n`;
  md += `| ② | **表单校验规则** | 字段的必填、唯一、数值范围、格式校验 |\n`;
  md += `| ③ | **表单动作代码** | 字段联动、赋值、数据加载等动作逻辑 |\n`;
  md += `| ④ | **业务规则** | 跨表单关联、状态联动、子表汇总等业务逻辑 |\n`;
  md += `| ⑤ | **自动化规则** | 定时/条件触发的自动化任务 |\n\n`;
  md += `> ⚠️ 本清单为**建议参考**，不会直接在宜搭中生成。具体表达式/代码/流程由用户确认后另行生成。\n\n`;
  md += `---\n\n`;

  const modules = {};
  forms.forEach(form => {
    if (!modules[form.group]) modules[form.group] = [];
    modules[form.group].push(form);
  });

  let moduleIndex = 1;
  for (const [moduleName, moduleForms] of Object.entries(modules)) {
    md += `## ${numberToChinese(moduleIndex)}、${stripModuleNumberPrefix(moduleName)}\n\n`;

    moduleForms.forEach((form, formIndex) => {
      md += `### ${formIndex + 1}. ${form.name}\n\n`;

      // ① 表单内公式
      md += `#### ① 表单内公式\n\n`;
      const formulaFields = form.mainFields.filter(f => {
        const ft = mapFieldType(f.name, f.typeHint, f.isOptions, f._forceType, form.name);
        return (f.typeHint && f.typeHint.includes('公式')) || ft === '数值' && isCalcCandidate(f.name);
      });
      if (formulaFields.length > 0) {
        md += `| 字段名称 | 类型 | 公式建议 | 触发时机 |\n`;
        md += `|---------|------|---------|---------|\n`;
        formulaFields.forEach(field => {
          const ft = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType, form.name);
          const formula = field.typeHint ? field.typeHint.replace('公式：', '').replace('公式', '') : `待定（${field.name} 相关计算）`;
          md += `| ${field.name} | ${ft} | ${formula} | 字段变更时 |\n`;
        });
        md += `\n`;
      } else {
        md += `无\n\n`;
      }

      // ② 表单校验规则
      md += `#### ② 表单校验规则\n\n`;
      const validations = [];
      form.mainFields.forEach(field => {
        const ft = mapFieldType(field.name, field.typeHint, field.isOptions, field._forceType, form.name);
        inferValidationRules(field, ft, form.type).forEach(r => validations.push(r));
      });
      if (validations.length > 0) {
        md += `| 字段名称 | 校验类型 | 校验规则 |\n`;
        md += `|---------|---------|---------|\n`;
        validations.forEach(r => {
          md += `| ${r.field} | ${r.type} | ${r.rule} |\n`;
        });
        md += `\n`;
      } else {
        md += `无\n\n`;
      }

      // ③ 表单动作代码
      md += `#### ③ 表单动作代码\n\n`;
      const actionFields = form.mainFields.filter(f => f.typeHint && f.typeHint.includes('关联-->'));
      if (actionFields.length > 0) {
        md += `| 触发场景 | 动作描述 |\n`;
        md += `|---------|---------|\n`;
        actionFields.forEach(field => {
          md += `| 选择 ${field.name} | 联动带出关联表单字段并回填 |\n`;
        });
        md += `\n`;
      } else {
        md += `无\n\n`;
      }

      // ④ 业务规则
      md += `#### ④ 业务规则\n\n`;
      const relationFields = form.mainFields.filter(f => f.typeHint && f.typeHint.includes('关联-->'));
      const statusFields = form.mainFields.filter(f => f.name.includes('状态'));
      const hasBizRule = relationFields.length > 0 || (form.subTables && form.subTables.length > 0) || statusFields.length > 0;
      if (hasBizRule) {
        let ruleIdx = 1;
        if (relationFields.length > 0) {
          md += `**规则${ruleIdx}: ${form.name}数据关联**\n\n`;
          md += `- **触发条件**: ${form.name}提交或更新\n`;
          md += `- **执行动作**: 关联表单数据联动\n`;
          md += `- **影响范围**: ${relationFields.map(f => f.name.replace(/.*关联-->/, '')).join('、')}\n\n`;
          ruleIdx++;
        }
        if (statusFields.length > 0) {
          md += `**规则${ruleIdx}: ${form.name}状态流转**\n\n`;
          md += `- **触发条件**: ${statusFields.map(f => f.name).join('、')}字段变更\n`;
          md += `- **执行动作**: 按业务状态流转逻辑更新状态及相关表单\n`;
          md += `- **影响范围**: ${form.name}及相关表单\n\n`;
          ruleIdx++;
        }
        if (form.subTables && form.subTables.length > 0) {
          md += `**规则${ruleIdx}: ${form.name}子表汇总**\n\n`;
          md += `- **触发条件**: 子表${form.subTables.map(st => st.name).join('、')}明细增删改\n`;
          md += `- **执行动作**: 汇总子表数据到主表\n`;
          md += `- **影响范围**: 主表汇总字段\n\n`;
        }
      } else {
        md += `无\n\n`;
      }

      // ⑤ 自动化规则
      md += `#### ⑤ 自动化规则\n\n`;
      md += `无（由用户结合业务按需补充定时/条件触发的自动化任务）\n\n`;

      md += `---\n\n`;
    });

    moduleIndex++;
  }

  md += `---\n\n`;
  md += `**文件链接**: [字段清单.md](./字段清单.md)\n`;

  return md;
}

function generateRuleListPlaceholderMarkdown(systemName, version) {
  const now = new Date().toISOString().split('T')[0];
  return `# ${systemName} - 规则清单

> 版本：${version}
> 生成日期：${now}
> 状态：占位文件

## 说明

字段清单已优先生成。本文件用于保持字段清单中的规则清单链接有效。

如需完整规则清单，请在确认字段清单后再生成，规则范围包括：

1. 公式规则
2. 业务规则
3. 审批流程规则（仅流程表单）

**文件链接**: [字段清单.md](./字段清单.md)
`;
}

// ==================== 生成应用分组 Markdown ====================
// v1.19.0新增：从字段清单的模块信息推断分组，生成独立的应用分组.md文件
// 目的：让用户在创建宜搭应用前就能看到分组结构，可修改后再创建应用
function generateGroupListMarkdown(forms, systemName, version) {
  // 按form.group分组，保持出现顺序
  const modules = {};
  forms.forEach(form => {
    if (!modules[form.group]) modules[form.group] = [];
    modules[form.group].push(form.name);
  });

  let md = `# ${systemName} - 应用分组\n\n`;
  md += `> 版本: ${version}\n`;
  md += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
  md += `> 说明: 此文件定义宜搭应用中的导航分组结构，创建应用前请确认此文件内容，可直接修改下表\n\n`;
  md += `---\n\n`;

  md += `| 序号 | 分组名称 | 包含表单 |\n`;
  md += `|:---:|---------|---------|\n`;
  let idx = 1;
  for (const [moduleName, formNames] of Object.entries(modules)) {
    md += `| ${idx} | ${stripModuleNumberPrefix(moduleName)} | ${formNames.join(', ')} |\n`;
    idx++;
  }
  md += `\n---\n\n`;

  md += `## 使用说明\n\n`;
  md += `1. 此文件由 Excel 转字段清单时自动生成，基于字段清单中的模块信息推断\n`;
  md += `2. **创建宜搭应用前，请确认此文件内容**，可直接修改上表的分组名称和包含表单\n`;
  md += `3. 创建应用时会读取此文件进行导航分组，本地文件目录也会按此分组组织\n`;
  md += `4. 如果修改了分组，请确保"包含表单"中的表单名称与字段清单中的表单名称完全一致\n`;
  md += `5. 每个表单只能属于一个分组，不能在多个分组中重复出现\n\n`;
  md += `## 修改示例\n\n`;
  md += `如需调整分组，直接修改上表即可。例如：\n\n`;
  md += `- **合并分组**：将"分组A"的表单合并到"分组B"中，删除"分组A"行\n`;
  md += `- **拆分分组**：将"分组A"拆分为"分组A-1"和"分组A-2"\n`;
  md += `- **调整顺序**：调整行的顺序，宜搭平台的导航分组会按此顺序创建\n`;
  md += `- **重命名分组**：直接修改"分组名称"列的值\n`;

  return md;
}

// ==================== 从Excel解析表单数据 ====================

function parseExcelForms(excelPath) {
  const workbook = xlsx.readFile(excelPath, {codepage: 65001});
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // 先尝试作为标准表格解析
  const data = xlsx.utils.sheet_to_json(sheet);
  
  if (data.length > 0 && (data[0]['表单名称'] || data[0]['表单分组'])) {
    console.log('检测到标准表格格式');
    
    // 填充缺失的表单分组（向下填充）
    let currentGroup = '';
    const filledData = data.map(row => {
      if (row['表单分组'] && row['表单分组'].trim()) {
        currentGroup = row['表单分组'].trim();
      }
      return {
        ...row,
        '表单分组': currentGroup
      };
    });
    
    return filledData.map(row => {
      const formName = row['表单名称'];
      const formType = row['表单类型'] || '普通表单';
      const form = {
        group: row['表单分组'] || '',
        name: formName,
        type: formType,
        mainFields: [],
        subTables: []
      };

      // 如果Excel中有字段定义，使用Excel中的
      if (row['主表字段']) {
        form.mainFields = parseFields(row['主表字段']);
      } else {
        // 如果Excel中没有字段定义，从行业知识库扩展
        const libraryForm = industryFieldLibrary[formName];
        if (libraryForm) {
          console.log(`  [智能扩展] ${formName} - 从行业知识库扩展 ${libraryForm.fields.length} 个字段`);
          form.mainFields = libraryForm.fields.map(f => parseField(f));
        } else {
          console.log(`  [警告] ${formName} - 无字段定义且无行业知识库匹配`);
        }
      }

      // 子表处理 - 优先使用Excel中的子表定义
      if (row['子表1名称'] && row['子表1字段']) {
        form.subTables.push({
          name: row['子表1名称'],
          fields: parseFields(row['子表1字段'])
        });
      }

      if (row['子表2名称'] && row['子表2字段']) {
        form.subTables.push({
          name: row['子表2名称'],
          fields: parseFields(row['子表2字段'])
        });
      }

      // 如果Excel中没有子表定义，从行业知识库智能推理子表
      if (form.subTables.length === 0) {
        const libraryForm = industryFieldLibrary[formName];
        if (libraryForm && libraryForm.subTables && libraryForm.subTables.length > 0) {
          console.log(`  [智能推理子表] ${formName} - 推理出 ${libraryForm.subTables.length} 个子表`);
          libraryForm.subTables.forEach(subTable => {
            form.subTables.push({
              name: subTable.name,
              fields: subTable.fields.map(f => parseField(f))
            });
          });
        }
      }

      // 流水号唯一性校验：每个表单只能有一个流水号
      form.mainFields = ensureSingleSerialNumber(form.mainFields, form.name);
      form.mainFields = autoCompleteFields(form.name, form.type, form.mainFields);
      return form;
    }).map(form => {
      // 对子表也进行流水号唯一性校验
      if (form.subTables && form.subTables.length > 0) {
        form.subTables = form.subTables.map(subTable => ({
          ...subTable,
          fields: ensureSingleSerialNumber(subTable.fields, `${form.name}.${subTable.name}`)
        }));
      }
      return form;
    });
  } else {
    // JavaScript代码格式（兼容旧格式）
    console.log('检测到JavaScript代码格式');
    const range = xlsx.utils.decode_range(sheet['!ref']);
    let lines = [];
    for(let r = 0; r <= range.e.r; r++) {
      const cell = sheet[xlsx.utils.encode_cell({r:r, c:0})];
      if(cell && cell.v) {
        lines.push(cell.v.toString().trim());
      }
    }

    const formLibrary = {};
    let currentForm = null;
    const formRegex = /^['"]([^'"]+)['"]:\s*\{/;
    const typeRegex = /type:\s*['"]([^'"]+)['"]/;
    const fieldRegex = /^\s*['"]([^'"]+)['"],?\s*$/;
    const subTableNameRegex = /name:\s*['"]([^'"]+)['"]/;

    for(let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const formMatch = line.match(formRegex);
      if(formMatch) {
        currentForm = formMatch[1];
        formLibrary[currentForm] = {
          name: currentForm,
          type: '普通表单',
          fields: [],
          subTables: []
        };
        continue;
      }
      
      const typeMatch = line.match(typeRegex);
      if(typeMatch && currentForm) {
        formLibrary[currentForm].type = typeMatch[1];
        continue;
      }
      
      if(line.includes('subTables:') || line.includes('subTable:')) {
        continue;
      }
      
      const subTableNameMatch = line.match(subTableNameRegex);
      if(subTableNameMatch && currentForm) {
        formLibrary[currentForm].subTables.push({
          name: subTableNameMatch[1],
          fields: []
        });
        continue;
      }
      
      const fieldMatch = line.match(fieldRegex);
      if(fieldMatch && currentForm) {
        const fieldStr = fieldMatch[1];
        if(formLibrary[currentForm].subTables.length > 0) {
          const lastSubTable = formLibrary[currentForm].subTables[formLibrary[currentForm].subTables.length - 1];
          lastSubTable.fields.push(parseField(fieldStr));
        } else {
          formLibrary[currentForm].fields.push(parseField(fieldStr));
        }
        continue;
      }
    }

    return Object.values(formLibrary).map(form => {
      const result = {
        group: inferModuleGroup(form.name),
        name: form.name,
        type: form.type,
        mainFields: form.fields || [],
        subTables: form.subTables || []
      };
      // 流水号唯一性校验：每个表单只能有一个流水号
      result.mainFields = ensureSingleSerialNumber(result.mainFields, result.name);
      result.mainFields = autoCompleteFields(result.name, result.type, result.mainFields);
      // 对子表也进行流水号唯一性校验
      if (result.subTables && result.subTables.length > 0) {
        result.subTables = result.subTables.map(subTable => ({
          ...subTable,
          fields: ensureSingleSerialNumber(subTable.fields, `${result.name}.${subTable.name}`)
        }));
      }
      return result;
    });
  }
}

function inferModuleGroup(formName) {
  return '未分组';
}

// ==================== 原型页面完成度检查 ====================

// v3.1.5 新增：流程完成度检查。
// 背景事故：AI 生成完字段清单.md 后只交付 .md 就提前结束，跳过第8步 prototype_generator.js，
// 导致用户进应用后原型页面为空白。此前该步骤仅靠 SKILL.md 硬规则约束，无机制保障。
// 本函数在脚本生成完 .md 后强制检查 <输出目录>/原型页面/templates/manifest.html 是否存在，
// 缺失则输出醒目警告，让 AI 无法"无感知"遗漏第8步。
function checkPrototypePageCompleted(outputDir) {
  if (!outputDir) return false;
  const manifestPath = path.join(outputDir, '原型页面', 'templates', 'manifest.html');
  const generatorVersionPath = path.join(outputDir, '原型页面', '.generator-version');
  return fs.existsSync(manifestPath) && fs.existsSync(generatorVersionPath);
}

// v3.1.6 升级：机制性防线从"只警告"提升为"自动补齐"。
// 背景：v3.1.5 的 checkPrototypePageCompleted 只输出警告，依赖 AI 看到警告后手动执行第8步，
// 若 AI 遗漏仍会缺原型页面（如进销存3/4）。本函数在检测到原型页面缺失时，
// 自动调用 prototype_generator.js 生成，不再依赖 AI 自觉，彻底杜绝"只交付 .md"遗漏。
function ensurePrototypePage(outputDir) {
  if (!outputDir) return;
  if (checkPrototypePageCompleted(outputDir)) {
    console.log('✅ 原型页面完整性检查通过: 已存在', path.join(outputDir, '原型页面', 'templates', 'manifest.html'));
    return;
  }
  // 缺失 → 自动补齐
  const fieldListPath = path.join(outputDir, '字段清单.md');
  const prototypeOutput = path.join(outputDir, '原型页面');
  const generatorScript = path.join(__dirname, '..', '..', 'form-to-prototype', 'scripts', 'prototype_generator.js');
  console.warn('\n⚠️  检测到原型页面缺失，自动调用 form-to-prototype 生成器补齐（无需手动执行第8步）...');
  console.warn('   - 字段清单: ' + fieldListPath);
  console.warn('   - 生成器: ' + generatorScript);
  if (!fs.existsSync(fieldListPath)) {
    console.warn('   ❌ 字段清单不存在，无法自动生成原型页面：' + fieldListPath);
    console.warn('   - 请先确认字段清单.md 已生成，再执行：node ' + generatorScript + ' <字段清单.md路径> ' + prototypeOutput);
    return;
  }
  if (!fs.existsSync(generatorScript)) {
    console.warn('   ❌ 生成器脚本不存在：' + generatorScript);
    return;
  }
  try {
    const res = childProcess.spawnSync(process.execPath, [generatorScript, fieldListPath, prototypeOutput], {
      stdio: 'inherit',
      windowsHide: true
    });
    if (res.status === 0 && checkPrototypePageCompleted(outputDir)) {
      console.log('\n✅ 原型页面已自动生成完成: ' + prototypeOutput);
    } else {
      console.warn('\n⚠️  [强制·流程未完成] 原型页面自动生成失败！');
      console.warn('   - 请手动执行第8步（见 SKILL.md 硬规则8/11）：');
      console.warn('     node ' + generatorScript + ' ' + fieldListPath + ' ' + prototypeOutput);
    }
  } catch (e) {
    console.warn('\n⚠️  [强制·流程未完成] 自动生成原型页面出错: ' + (e.message || e));
    console.warn('   - 请手动执行第8步：node ' + generatorScript + ' ' + fieldListPath + ' ' + prototypeOutput);
  }
}

// ==================== 主函数 ====================

function main() {
  const args = process.argv.slice(2);

  // --summary 模式：紧凑文本格式输出，保留全部文字信息但去掉 JSON 冗余
  // 同样的信息量从 2000+ 行 JSON 压缩到几百行文本，AI 读取效率提升数倍
  if (args[0] === '--summary') {
    const excelPath = args[1];
    if (!excelPath) {
      console.error('用法: node excel_to_form.js --summary <Excel文件路径>');
      process.exit(1);
    }
    if (!fs.existsSync(excelPath)) {
      console.error('错误: Excel 文件不存在:', excelPath);
      process.exit(1);
    }
    console.log('正在读取 Excel 文件:', excelPath);
    try {
      const forms = parseExcelForms(excelPath);
      const allFormNames = forms.map(f => f.name);

      // 收集关联候选和待填选项
      const associationCandidates = [];
      const needOptionsFields = [];

      let output = '';
      output += `\n========== PREVIEW SUMMARY ==========\n\n`;
      output += `📊 表单总览 (${forms.length}个)\n`;
      const groups = {};
      forms.forEach(f => {
        if (!groups[f.group]) groups[f.group] = [];
        groups[f.group].push(f);
      });
      for (const [groupName, groupForms] of Object.entries(groups)) {
        output += `  ${groupName}: ${groupForms.map(f => `${f.name}(${f.type})`).join(', ')}\n`;
      }

      output += `\n📋 各表单字段明细\n`;
      forms.forEach(form => {
        const suggestedTitle = inferSuggestedDataTitle(form.mainFields, form.type, allFormNames, form.name);
        output += `\n### ${form.name} [${form.type}] 建议数据标题: ${suggestedTitle || '（需手动指定）'}\n`;

        // 主表字段（一行一个，紧凑格式）
        output += `主表字段:\n`;
        form.mainFields.forEach(f => {
          const suggestedType = mapFieldType(f.name, f.typeHint, f.isOptions, null, form.name);
          const candidates = findAssociationCandidates(f.name, allFormNames, form.name);
          let line = `  - ${f.name} → ${suggestedType}`;
          if (f.typeHint) line += ` [hint:${f.typeHint}]`;
          if (f.isOptions && f.options) line += ` [选项:${f.options.join('/')}]`;
          if (candidates.length > 0) {
            line += ` 🔗候选: ${candidates.map(c => `${c.formName}(${c.reason})`).join('; ')}`;
            associationCandidates.push({ form: form.name, field: f.name, candidates });
          }
          output += line + '\n';
        });

        // 子表
        if (form.subTables && form.subTables.length > 0) {
          form.subTables.forEach(st => {
            output += `子表「${st.name}」:\n`;
            st.fields.forEach(f => {
              const suggestedType = mapFieldType(f.name, f.typeHint, f.isOptions, null, form.name);
              const candidates = findAssociationCandidates(f.name, allFormNames, form.name);
              let line = `  - ${f.name} → ${suggestedType}`;
              if (f.typeHint) line += ` [hint:${f.typeHint}]`;
              if (f.isOptions && f.options) line += ` [选项:${f.options.join('/')}]`;
              if (candidates.length > 0) {
                line += ` 🔗候选: ${candidates.map(c => `${c.formName}(${c.reason})`).join('; ')}`;
                associationCandidates.push({ form: form.name, field: f.name, candidates });
              }
              output += line + '\n';
            });
          });
        }
      });

      // 汇总关联候选
      if (associationCandidates.length > 0) {
        output += `\n🔗 关联候选汇总 (${associationCandidates.length}个，需AI确认)\n`;
        associationCandidates.forEach(item => {
          output += `  ${item.form}.${item.field} → ${item.candidates.map(c => c.formName).join('/')}\n`;
        });
      }

      output += `\n========== END ==========\n`;
      console.log(output);
    } catch (error) {
      console.error('解析失败:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
    return;
  }

  // --preview 模式：只解析 Excel 输出 JSON，不生成字段清单（完整格式，兼容旧流程）
  // 输出除原始结构外，还附带程序的确定性建议（建议类型/建议说明/关联候选/建议数据标题），
  // 把跨表单名称匹配等机械工作交给程序，AI 专注于语义确认与内容创造
  if (args[0] === '--preview') {
    const excelPath = args[1];
    if (!excelPath) {
      console.error('用法: node excel_to_form.js --preview <Excel文件路径>');
      process.exit(1);
    }
    if (!fs.existsSync(excelPath)) {
      console.error('错误: Excel 文件不存在:', excelPath);
      process.exit(1);
    }
    console.log('正在读取 Excel 文件:', excelPath);
    try {
      const forms = parseExcelForms(excelPath);
      const allFormNames = forms.map(f => f.name);
      const buildFieldPreview = (f, formName, formType) => ({
        name: f.name,
        typeHint: f.typeHint || null,
        options: f.options || null,
        isOptions: f.isOptions || false,
        suggestedType: mapFieldType(f.name, f.typeHint, f.isOptions, null, formName),
        suggestedDescription: generateFieldDescription(f, formType, formName),
        associationCandidates: findAssociationCandidates(f.name, allFormNames, formName)
      });
      const preview = {
        formCount: forms.length,
        forms: forms.map(form => ({
          group: form.group,
          name: form.name,
          type: form.type,
          suggestedDataTitle: inferSuggestedDataTitle(form.mainFields, form.type, allFormNames, form.name),
          mainFields: form.mainFields.map(f => buildFieldPreview(f, form.name, form.type)),
          subTables: (form.subTables || []).map(st => ({
            name: st.name,
            fields: st.fields.map(f => buildFieldPreview(f, form.name, form.type))
          }))
        }))
      };
      console.log('\n' + JSON.stringify(preview, null, 2));
    } catch (error) {
      console.error('解析失败:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
    return;
  }

  // --draft 模式：解析 Excel 并生成草稿 override 文件
  // 程序预填确定性内容，AI 审核确认后用于正式生成。已存在的文件绝不覆盖。
  if (args[0] === '--draft') {
    const excelPath = args[1];
    const outputPath = args[2] || 'field-types-override.json';
    if (!excelPath) {
      console.error('用法: node excel_to_form.js --draft <Excel文件路径> [草稿输出路径]');
      process.exit(1);
    }
    if (!fs.existsSync(excelPath)) {
      console.error('错误: Excel 文件不存在:', excelPath);
      process.exit(1);
    }
    if (fs.existsSync(outputPath)) {
      console.error(`错误: 文件已存在，为保护已有内容不予覆盖: ${outputPath}`);
      console.error('如需重新生成草稿，请先备份并删除该文件。');
      process.exit(1);
    }
    // 自动创建输出目录，保证后续正式生成时目录已存在
    const outputDirPath = path.dirname(outputPath);
    if (outputDirPath && !fs.existsSync(outputDirPath)) {
      fs.mkdirSync(outputDirPath, { recursive: true });
    }
    console.log('正在读取 Excel 文件:', excelPath);
    try {
      const forms = parseExcelForms(excelPath);
      const draft = generateDraftOverrides(forms);
      fs.writeFileSync(outputPath, JSON.stringify(draft, null, 2), 'utf8');
      let candidateCount = 0;
      let needOptionsCount = 0;
      for (const formName of Object.keys(draft)) {
        if (formName === '_readme') continue;
        for (const fieldName of Object.keys(draft[formName])) {
          if (fieldName === '_meta') continue;
          if (draft[formName][fieldName]._candidate) candidateCount++;
          if (draft[formName][fieldName]._needOptions) needOptionsCount++;
        }
      }
      console.log(`\n📝 草稿已生成: ${outputPath}`);
      console.log(`   关联候选 ${candidateCount} 个（需 AI 确认）、待填选项 ${needOptionsCount} 个（需 AI 创造）`);
      console.log('   请按文件内 _readme 说明审核后，再运行正式生成。');
    } catch (error) {
      console.error('解析失败:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
    return;
  }

  // --rules 模式：依据字段清单（Excel + override）生成五类完整规则清单，覆盖占位文件
  // 时序：正式生成字段清单后，用户确认字段清单内容，再运行此模式生成完整规则清单。
  // 五类：① 表单内公式 ② 表单校验规则 ③ 表单动作代码 ④ 业务规则 ⑤ 自动化规则
  if (args[0] === '--rules') {
    const excelPath = args[1];
    const outputDir = args[2] || '.';
    const systemName = args[3] || '项目管理系统';
    const version = args[4] || '1.0.0';
    const overridePath = args[5] || null;
    if (!excelPath) {
      console.error('用法: node excel_to_form.js --rules <Excel文件路径> [输出目录] [系统名称] [版本号] [字段类型覆盖JSON路径]');
      process.exit(1);
    }
    if (!fs.existsSync(excelPath)) {
      console.error('错误: Excel 文件不存在:', excelPath);
      process.exit(1);
    }
    if (outputDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    console.log('正在读取 Excel 文件:', excelPath);
    try {
      const forms = parseExcelForms(excelPath);
      // 复用正式生成前的 override 应用逻辑，确保规则清单与字段清单的关联/选项等配置一致
      loadFieldTypeOverrides(overridePath, outputDir);
      applyOverrides(forms);

      const ruleListMd = generateRuleListMarkdown(forms, systemName, version);
      const ruleListPath = path.join(outputDir, '规则清单.md');
      fs.writeFileSync(ruleListPath, ruleListMd, 'utf8');
      console.log('✅ 五类完整规则清单已生成:', ruleListPath);
      console.log('   ① 表单内公式 ② 表单校验规则 ③ 表单动作代码 ④ 业务规则 ⑤ 自动化规则');

      // v3.1.6 流程完成度检查：原型页面缺失时自动补齐（同正式生成模式）
      ensurePrototypePage(outputDir);
    } catch (error) {
      console.error('生成失败:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
    return;
  }

  if (args.length < 1) {
    console.log('用法: node excel_to_form.js <Excel文件路径> [输出目录] [系统名称] [版本号] [字段类型覆盖JSON路径]');
    console.log('示例: node excel_to_form.js "项目管理.xlsx" "01需求梳理" "项目管理系统" "1.0.0"');
    console.log('        或传入覆盖文件: node excel_to_form.js "项目管理.xlsx" "01需求梳理" "项目管理系统" "1.0.0" "field-types-override.json"');
    console.log('预览模式: node excel_to_form.js --preview <Excel文件路径>');
    console.log('草稿模式: node excel_to_form.js --draft <Excel文件路径> [草稿输出路径]');
    console.log('规则模式: node excel_to_form.js --rules <Excel文件路径> [输出目录] [系统名称] [版本号] [字段类型覆盖JSON路径]');
    process.exit(1);
  }

  const excelPath = args[0];
  const outputDir = args[1] || '.';
  const systemName = args[2] || '项目管理系统';
  const version = args[3] || '1.0.0';
  const overridePath = args[4] || null;

  if (!fs.existsSync(excelPath)) {
    console.error('错误: Excel 文件不存在:', excelPath);
    process.exit(1);
  }

  // 输出目录不存在时自动创建，避免写文件时才报 ENOENT
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // v1.21.0 新增：加载 AI 字段类型覆盖配置
  loadFieldTypeOverrides(overridePath, outputDir);

  console.log('正在读取 Excel 文件:', excelPath);

  try {
    const forms = parseExcelForms(excelPath);

    // v1.27.0 新增：应用 AI override（字段重命名、关联表单完整配置、被填充字段插入、数据标题覆盖等）
    applyOverrides(forms);

    console.log(`\n解析到 ${forms.length} 个表单\n`);
    forms.forEach((form, i) => {
      console.log(`${i + 1}. [${form.group}] [${form.type}] ${form.name} - ${form.mainFields.length} 个字段`);
    });

    // 生成字段清单
    const fieldListMd = generateFieldListMarkdown(forms, systemName, version);
    const fieldListPath = path.join(outputDir, '字段清单.md');
    fs.writeFileSync(fieldListPath, fieldListMd, 'utf8');
    console.log('\n✅ 字段清单已生成:', fieldListPath);

    // 默认只生成占位规则清单，避免字段清单中的链接指向不存在的文件。
    // 完整规则清单应在用户确认字段清单后再生成。
    const ruleListMd = generateRuleListPlaceholderMarkdown(systemName, version);
    const ruleListPath = path.join(outputDir, '规则清单.md');
    fs.writeFileSync(ruleListPath, ruleListMd, 'utf8');
    console.log('✅ 规则清单占位文件已生成:', ruleListPath);

    // v1.19.0新增：生成应用分组.md，让用户在创建应用前确认分组结构
    const groupListMd = generateGroupListMarkdown(forms, systemName, version);
    const groupListPath = path.join(outputDir, '应用分组.md');
    fs.writeFileSync(groupListPath, groupListMd, 'utf8');
    console.log('✅ 应用分组已生成:', groupListPath);

    console.log('\n🎉 转换完成！');
    console.log(`📁 输出目录: ${path.resolve(outputDir)}`);

    // v3.1.6 强制流程完成度保障：原型页面是流程完成的必要条件（硬规则8/11）。
    // 脚本生成完 .md 后检查 <输出目录>/原型页面/templates/manifest.html 是否存在，
    // 缺失则自动调用 prototype_generator.js 生成（机制性防线，不依赖 AI 自觉），
    // 杜绝"只交付 .md 就提前结束"导致原型页面永久缺失（进销存3/4 事故根因）。
    ensurePrototypePage(outputDir);

  } catch (error) {
    console.error('转换失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出函数供其他模块使用
module.exports = {
  parseField,
  parseFields,
  mapFieldType,
  autoCompleteFields,
  generateFieldListMarkdown,
  generateRuleListMarkdown,
  generateRuleListPlaceholderMarkdown,
  generateGroupListMarkdown,
  parseExcelForms,
  industryFieldLibrary,
  ensureSingleSerialNumber,
  inferDefaultOptions,
  inferSerialPrefix,
  inferTargetFields,
  inferModuleGroup,
  loadFieldTypeOverrides,
  getFieldTypeOverride,
  fieldTypeOverrides,
  applyOverrides,
  applyFieldOverrides,
  VALID_DATA_TITLE_TYPES,
  validateDataTitleType,
  checkPrototypePageCompleted,
  ensurePrototypePage
};
