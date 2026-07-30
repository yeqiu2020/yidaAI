#!/usr/bin/env node
/**
 * list-datasets.js - 查询宜搭数据集列表
 *
 * 通过宜搭API查询指定应用下的所有数据集（视图表/数据准备），
 * 用于验证cubeCode是否有效、查看已创建的数据集。
 *
 * 用法: node list-datasets.js [appType]
 * 示例: node list-datasets.js APP_FDK8IG9UIDEFV2PTPDYL
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Phase 6: Cookie 加载统一委托给 lib/core/utils
const coreUtils = require('../../../../lib/core/utils');

// ── 项目根目录查找 ────────────────────────────────────
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

// 复用report skill的core-lib工具
const reportCoreLibPath = path.join(projectRoot, '.agents', 'skills', 'report', 'scripts', 'core-lib');
// Phase 6: loadCookieData, resolveBaseUrl 改为从 lib/core/utils 获取（统一实现）
const { loadCookieData, resolveBaseUrl } = coreUtils;
const { httpPost, httpGet } = require(path.join(reportCoreLibPath, 'utils'));
const { warn } = require(path.join(reportCoreLibPath, 'chalk'));

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const appType = args[0] || process.env.YIDA_APP_TYPE || 'APP_FDK8IG9UIDEFV2PTPDYL';

  const SEP = '='.repeat(50);
  warn(SEP);
  warn('📋 宜搭数据集列表查询工具');
  warn(SEP);
  warn('应用 ID:', appType);

  // Step 1: 读取登录态
  warn('\n[Step 1] 读取登录态...');
  const cookieData = loadCookieData();
  if (!cookieData) {
    warn('❌ 未找到登录缓存，请先登录宜搭平台');
    warn('提示: 在浏览器中登录宜搭后，Cookie会自动保存到 .cookies.json');
    process.exit(1);
  }

  const { csrf_token: csrfToken, cookies } = cookieData;
  const baseUrl = resolveBaseUrl(cookieData);
  warn('登录态就绪，域名:', baseUrl);

  // Step 2: 查询数据集列表
  warn('\n[Step 2] 查询数据集列表...');

  // 尝试多个可能的API端点
  const apiPaths = [
    {
      method: 'POST',
      path: `/dingtalk/web/${appType}/query/dataset/listDataset.json`,
    },
    {
      method: 'POST',
      path: `/alibaba/web/${appType}/visual/dataset/getDatasetList.json`,
    },
    {
      method: 'GET',
      path: `/alibaba/web/${appType}/visual/dataset/list.json`,
    },
  ];

  let datasets = null;
  let usedApi = '';

  for (const api of apiPaths) {
    try {
      warn(`  尝试 API: ${api.method} ${api.path}`);
      let result;
      if (api.method === 'POST') {
        const querystring = require('querystring');
        const postData = querystring.stringify({
          _csrf_token: csrfToken,
          pageSize: '100',
          currentPage: '1',
        });
        result = await httpPost(baseUrl, api.path, postData, cookies, { silentStatus: true });
      } else {
        result = await httpGet(baseUrl, api.path, { pageSize: 100, currentPage: 1 }, cookies, { silentStatus: true });
      }

      if (result && result.success && result.content) {
        datasets = result.content;
        usedApi = api.path;
        break;
      }
      if (result && result.__needLogin) {
        warn('❌ 登录态已过期，请重新登录');
        process.exit(1);
      }
    } catch (err) {
      warn(`  失败: ${err.message}`);
    }
  }

  if (!datasets) {
    // 如果API查询失败，尝试通过表单导航列表查找报表和数据集
    warn('\n[Step 2b] API查询未成功，尝试通过导航列表查找...');
    try {
      const querystring = require('querystring');
      const postData = querystring.stringify({
        _csrf_token: csrfToken,
      });
      const navResult = await httpPost(
        baseUrl,
        `/dingtalk/web/${appType}/query/formnav/getFormNavigationListByOrder.json`,
        postData,
        cookies,
        { silentStatus: true }
      );

      if (navResult && navResult.success && navResult.content) {
        const forms = navResult.content.formList || navResult.content || [];
        const reportForms = forms.filter(f => f.formType === 'report' || f.type === 'report');
        warn(`\n找到 ${forms.length} 个表单/页面，其中 ${reportForms.length} 个报表`);
        warn('\n⚠️ 无法通过API直接查询数据集列表。');
        warn('数据集需要在宜搭平台后台查看：应用设置 → 数据工厂 → 数据集');
        warn(`\n访问链接: ${baseUrl}/${appType}/admin/appSetting/dataset`);
        process.exit(0);
      }
    } catch (err) {
      warn(`  导航列表查询也失败: ${err.message}`);
    }

    warn('\n❌ 无法通过API查询数据集列表');
    warn('可能原因：');
    warn('  1. 数据集API接口路径不正确');
    warn('  2. 当前用户没有数据集管理权限');
    warn('  3. 登录态已过期');
    warn('\n建议：');
    warn(`  1. 手动访问 ${baseUrl}/${appType}/admin/appSetting/dataset 查看数据集`);
    warn('  2. 在浏览器中打开开发者工具，操作数据集页面时抓取API接口');
    process.exit(1);
  }

  // Step 3: 输出结果
  warn('\n[Step 3] 输出数据集列表...');
  warn(`使用 API: ${usedApi}`);

  const datasetList = Array.isArray(datasets) ? datasets : (datasets.list || datasets.records || []);
  warn(`\n找到 ${datasetList.length} 个数据集：\n`);

  console.log('数据集名称 | cubeCode | 类型 | 状态 | 创建时间');
  console.log('---|---|---|---|---');

  datasetList.forEach((ds) => {
    const name = ds.name || ds.title || ds.datasetName || '未命名';
    const code = ds.cubeCode || ds.code || ds.datasetCode || 'N/A';
    const type = ds.type || ds.datasetType || '未知';
    const status = ds.status || ds.publishStatus || '未知';
    const createTime = ds.createTime || ds.gmtCreate || 'N/A';

    warn(`  ${name} | ${code} | ${type} | ${status} | ${createTime}`);
    console.log(`${name} | ${code} | ${type} | ${status} | ${createTime}`);
  });

  // 输出JSON格式结果
  console.log('\n---JSON---');
  console.log(JSON.stringify({
    success: true,
    appType,
    count: datasetList.length,
    datasets: datasetList.map(ds => ({
      name: ds.name || ds.title || ds.datasetName || '未命名',
      cubeCode: ds.cubeCode || ds.code || ds.datasetCode || 'N/A',
      type: ds.type || ds.datasetType || '未知',
      status: ds.status || ds.publishStatus || '未知',
    })),
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    warn('执行异常:', err.message);
    process.exit(1);
  });
}
