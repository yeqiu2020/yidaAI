#!/usr/bin/env node
/**
 * verify-dataset.js - 验证视图表 cubeCode 是否有效
 *
 * 通过查询报表API验证指定的 cubeCode 是否可以正常获取数据。
 * 如果能获取到字段列表或数据，说明 cubeCode 有效。
 *
 * 用法: node verify-dataset.js <appType> <cubeCode>
 * 示例: node verify-datasets.js APP_FDK8IG9UIDEFV2PTPDYL VIEW_77F57DDA95234D208827E46A96F09C4A
 */

'use strict';

const path = require('path');
const fs = require('fs');
const querystring = require('querystring');

// Phase 6: Cookie 加载统一委托给 lib/core/utils
const coreUtils = require('../../../../lib/core/utils');

function findProjectRoot() {
  let currentDir = __dirname;
  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, '.cookies.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return path.resolve(__dirname, '..', '..', '..', '..');
}

const projectRoot = findProjectRoot();
process.env.YIDA_PROJECT_ROOT = projectRoot;

const reportCoreLibPath = path.join(projectRoot, '.agents', 'skills', 'report', 'scripts', 'core-lib');
// Phase 6: loadCookieData, resolveBaseUrl 改为从 lib/core/utils 获取（统一实现）
const { loadCookieData, resolveBaseUrl } = coreUtils;
const { httpPost } = require(path.join(reportCoreLibPath, 'utils'));
const { warn } = require(path.join(reportCoreLibPath, 'chalk'));

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    warn('用法: node verify-dataset.js <appType> <cubeCode>');
    warn('示例: node verify-dataset.js APP_FDK8IG9UIDEFV2PTPDYL VIEW_77F57DDA95234D208827E46A96F09C4A');
    process.exit(1);
  }

  const appType = args[0];
  const cubeCode = args[1];

  const SEP = '='.repeat(50);
  warn(SEP);
  warn('🔍 数据集 cubeCode 验证工具');
  warn(SEP);
  warn('应用 ID:', appType);
  warn('cubeCode:', cubeCode);

  // 读取登录态
  warn('\n[Step 1] 读取登录态...');
  const cookieData = loadCookieData();
  if (!cookieData) {
    warn('❌ 未找到登录缓存，请先登录宜搭平台');
    process.exit(1);
  }

  const { csrf_token: csrfToken, cookies } = cookieData;
  const baseUrl = resolveBaseUrl(cookieData);
  warn('登录态就绪，域名:', baseUrl);

  // 尝试通过数据集元数据API验证
  warn('\n[Step 2] 验证 cubeCode...');

  // 尝试获取数据集字段列表
  const apiPaths = [
    `/alibaba/web/${appType}/visual/visualizationDataRpc/getDataSetMeta.json`,
    `/dingtalk/web/${appType}/query/dataset/getDatasetMeta.json`,
    `/alibaba/web/${appType}/visual/dataset/getMeta.json`,
  ];

  let verified = false;
  let fieldInfo = null;

  for (const apiPath of apiPaths) {
    try {
      warn(`  尝试 API: ${apiPath}`);
      const postData = querystring.stringify({
        _csrf_token: csrfToken,
        cubeCode: cubeCode,
        cubeTenantId: cookieData.corp_id || '',
      });
      const result = await httpPost(baseUrl, apiPath, postData, cookies, { silentStatus: true });

      if (result && result.success) {
        verified = true;
        fieldInfo = result.content;
        warn(`  ✅ 验证成功！cubeCode 有效`);
        break;
      }

      if (result && result.__needLogin) {
        warn('❌ 登录态已过期，请重新登录');
        process.exit(1);
      }

      // 检查是否有特定的错误信息
      if (result && result.errorMsg) {
        warn(`  返回: ${result.errorMsg}`);
      }
    } catch (err) {
      warn(`  失败: ${err.message}`);
    }
  }

  // 输出结果
  warn('\n' + SEP);
  if (verified) {
    warn('✅ cubeCode 验证成功！');
    warn('cubeCode:', cubeCode);
    warn('可以用于创建报表');

    if (fieldInfo) {
      const fields = fieldInfo.fields || fieldInfo.fieldList || fieldInfo.dimensions || [];
      if (fields.length > 0) {
        warn(`\n字段列表 (${fields.length} 个字段):`);
        fields.forEach((f, i) => {
          const name = f.aliasName || f.name || f.fieldName || 'N/A';
          const code = f.fieldCode || f.code || 'N/A';
          const type = f.dataType || f.type || 'N/A';
          warn(`  ${i + 1}. ${name} (${code}) - ${type}`);
        });
      }
    }

    console.log(JSON.stringify({
      success: true,
      appType,
      cubeCode,
      verified: true,
      fieldInfo: fieldInfo,
    }, null, 2));
  } else {
    warn('⚠️ 无法通过API验证 cubeCode（可能API路径不正确）');
    warn('这不一定意味着 cubeCode 无效，请通过以下方式手动验证：');
    warn(`  1. 访问视图表设计器: ${baseUrl}/alibaba/web/${appType}/visual/modelTableDesigner?code=${cubeCode}&type=view`);
    warn(`  2. 查看数据集列表: ${baseUrl}/${appType}/admin/appSetting/dataset`);
    warn('  3. 使用此 cubeCode 创建报表，如果报表能正常显示数据则说明有效');

    console.log(JSON.stringify({
      success: false,
      appType,
      cubeCode,
      verified: false,
      message: '无法通过API验证，建议手动验证',
      manualCheckUrl: `${baseUrl}/alibaba/web/${appType}/visual/modelTableDesigner?code=${cubeCode}&type=view`,
    }, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    warn('执行异常:', err.message);
    process.exit(1);
  });
}
