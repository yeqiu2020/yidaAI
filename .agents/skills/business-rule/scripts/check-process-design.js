#!/usr/bin/env node
/**
 * 通过API获取流程设计和表单Schema，查找业务规则存储位置
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const coreUtils = require('../../../../lib/core/utils');
const API_CLIENT_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'api-client', 'scripts', 'api_client.js');
const FORM_MANAGER_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'api-client', 'scripts', 'form_manager.js');

const APP_ID = 'APP_NZEJ00HQWKPDUP4BQP8E';
const FORM_UUID = 'FORM-EE4298C2EA1B43F59E431F8EDBFB29A62AEA';
const PROCESS_CODE = 'TPROC--V0A667D1KCF75N7EHUYD2DJ4OV512ZNS9NIRM0';

async function main() {
  console.log('=== 检查采购入库流程设计和表单Schema ===\n');

  const { loadCookieData, resolveBaseUrl } = coreUtils;
  const cookieData = loadCookieData(PROJECT_ROOT);
  if (!cookieData) { console.error('❌ 未找到登录态'); process.exit(1); }
  const baseUrl = resolveBaseUrl(cookieData);
  console.log(`✅ 登录态就绪 (${baseUrl})`);

  const cookies = cookieData.cookies || [];
  const csrfToken = cookieData.csrf_token;
  console.log(`   Cookie数量: ${cookies.length}, CSRF Token: ${csrfToken ? '有' : '无'}`);

  // 获取表单Schema
  console.log(`\n📍 获取表单 Schema...`);
  const { getFormSchema } = require(FORM_MANAGER_PATH);
  
  try {
    const schema = await getFormSchema(baseUrl, APP_ID, FORM_UUID, cookies);
    if (schema) {
      console.log(`   ✅ Schema获取成功`);
      const outputPath = path.join(PROJECT_ROOT, '.playwright-cli', 'form-schema-采购入库.json');
      fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
      console.log(`   📄 Schema已保存到: ${outputPath}`);
      
      // 分析Schema结构
      const schemaKeys = Object.keys(schema);
      console.log(`   Schema keys: ${schemaKeys.join(', ')}`);
      
      // 查找 pages
      if (schema.pages && schema.pages[0]) {
        const page = schema.pages[0];
        console.log(`   page[0] keys: ${Object.keys(page).join(', ')}`);
        
        // 查找 componentsTree
        const tree = page.componentsTree || page.children;
        if (tree && tree[0]) {
          const container = tree[0];
          console.log(`   container: ${container.componentName}`);
          const props = container.props || {};
          const propKeys = Object.keys(props);
          console.log(`   props keys: ${propKeys.join(', ')}`);
          
          // 查找业务规则相关属性
          const ruleProps = propKeys.filter(k =>
            k.toLowerCase().includes('rule') ||
            k.toLowerCase().includes('behavior') ||
            k.toLowerCase().includes('event') ||
            k.toLowerCase().includes('formula') ||
            k.toLowerCase().includes('association') ||
            k.toLowerCase().includes('submit') ||
            k.toLowerCase().includes('action')
          );
          console.log(`   规则相关 props: ${ruleProps.join(', ') || '无'}`);
          
          // 打印所有props的值（截断）
          for (const key of propKeys) {
            const val = props[key];
            const valStr = typeof val === 'string' ? val.substring(0, 100) : JSON.stringify(val).substring(0, 100);
            console.log(`     ${key}: ${valStr}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`❌ Schema获取失败: ${err.message}`);
  }

  // 获取流程设计 - 尝试多种API模式
  console.log(`\n📍 获取流程设计...`);
  const { getRequest, postRequest } = require(API_CLIENT_PATH);
  
  const apiPatterns = [
    {
      method: 'GET',
      path: `/dingtalk/web/${APP_ID}/query/processdesign/getProcessDesign.json`,
      params: { processCode: PROCESS_CODE, formUuid: FORM_UUID, _locale_time_zone_offset: '28800000' }
    },
    {
      method: 'POST',
      path: `/dingtalk/web/${APP_ID}/query/processdesign/getProcessDesign.json`,
      params: { processCode: PROCESS_CODE, formUuid: FORM_UUID, _csrf_token: csrfToken, _locale_time_zone_offset: '28800000' }
    }
  ];

  for (const pattern of apiPatterns) {
    console.log(`\n   尝试: ${pattern.method} ${pattern.path}`);
    try {
      let result;
      if (pattern.method === 'GET') {
        result = await getRequest(baseUrl, pattern.path, pattern.params, cookies);
      } else {
        result = await postRequest(baseUrl, pattern.path, pattern.params, cookies);
      }
      
      console.log(`   success: ${result.success}, errorCode: ${result.errorCode}`);
      
      if (result.content && JSON.stringify(result.content) !== '{}') {
        console.log(`   ✅ 获取到流程设计数据!`);
        console.log(`   content keys: ${Object.keys(result.content).join(', ')}`);
        
        const outputPath = path.join(PROJECT_ROOT, '.playwright-cli', 'process-design-采购入库.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`   📄 已保存到: ${outputPath}`);
        
        // 分析流程设计结构
        const content = result.content;
        const props = content.props || content.processProps || {};
        console.log(`\n   流程属性:`);
        for (const [key, val] of Object.entries(props)) {
          const valStr = typeof val === 'string' ? val.substring(0, 100) : JSON.stringify(val).substring(0, 100);
          console.log(`     ${key}: ${valStr}`);
        }
        
        // 查找节点
        const nodes = content.nodes || content.processNodes || [];
        if (Array.isArray(nodes) && nodes.length > 0) {
          console.log(`\n   节点数量: ${nodes.length}`);
          nodes.forEach((node, i) => {
            console.log(`   节点${i}: ${JSON.stringify(node).substring(0, 200)}`);
          });
        }
        
        break;
      } else {
        console.log(`   content: 空（流程已启用，API只读）`);
      }
    } catch (err) {
      console.log(`   ❌ 失败: ${err.message}`);
    }
  }

  console.log('\n=== 完成 ===');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});
