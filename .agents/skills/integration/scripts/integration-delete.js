'use strict';

/**
 * integration-delete.js — 删除集成自动化逻辑流
 *
 * 用法:
 *   node integration-delete.js <appType> <formUuid> <processCode> [--force]
 *
 * 参数:
 *   appType      应用 ID
 *   formUuid     绑定表单 UUID
 *   processCode  逻辑流 processCode
 *   --force      如果流程已启用，先自动停用再删除（默认不自动停用，报错提示）
 *
 * 示例:
 *   node integration-delete.js APP_XXX FORM-XXX LPROC-XXX
 *   node integration-delete.js APP_XXX FORM-XXX LPROC-XXX --force
 */

const path = require('path');
const coreUtils = require('../../../../lib/core/utils');
const { loadCookieData, resolveBaseUrl } = coreUtils;
const { triggerLogin } = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));
const { deleteLogicflow, switchLogicflow, listFormLogicflows } = require('./integration-api');

async function createAuthRef() {
  let cookieData = loadCookieData();
  if (!cookieData) {
    cookieData = triggerLogin();
  }
  return {
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    cookieData,
  };
}

function parseArgs(args) {
  const parsed = {
    appType: '',
    formUuid: '',
    processCode: '',
    force: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--force') {
      parsed.force = true;
    } else if (!arg.startsWith('--') && !parsed.appType) {
      parsed.appType = arg;
    } else if (!arg.startsWith('--') && !parsed.formUuid) {
      parsed.formUuid = arg;
    } else if (!arg.startsWith('--') && !parsed.processCode) {
      parsed.processCode = arg;
    }
  }
  return parsed;
}

async function runDelete(args) {
  const parsed = parseArgs(args);

  if (!parsed.appType || !parsed.formUuid || !parsed.processCode) {
    console.error('用法: node integration-delete.js <appType> <formUuid> <processCode> [--force]');
    console.error('');
    console.error('参数:');
    console.error('  appType       应用 ID');
    console.error('  formUuid      绑定表单 UUID');
    console.error('  processCode   逻辑流 processCode');
    console.error('  --force       已启用的流程先自动停用再删除');
    console.error('');
    console.error('示例:');
    console.error('  node integration-delete.js APP_XXX FORM-XXX LPROC-XXX');
    console.error('  node integration-delete.js APP_XXX FORM-XXX LPROC-XXX --force');
    process.exit(1);
  }

  const authRef = await createAuthRef();

  // Step 1: 先检查流程是否启用（如果启用且没有 --force，直接报错）
  console.error('正在删除逻辑流: ' + parsed.processCode);

  try {
    await deleteLogicflow(authRef, {
      appType: parsed.appType,
      formUuid: parsed.formUuid,
      processCode: parsed.processCode,
    });

    console.log(JSON.stringify({
      success: true,
      action: 'delete',
      appType: parsed.appType,
      formUuid: parsed.formUuid,
      processCode: parsed.processCode,
    }));
    console.error('✅ 删除成功');
    return;
  } catch (err) {
    // 如果是因为"已启用不允许删除"且 --force，先停用再删
    if (err.needsDisable && parsed.force) {
      console.error('流程已启用，--force 模式：先停用再删除...');

      // Step 2: 停用流程
      try {
        await switchLogicflow(authRef, {
          appType: parsed.appType,
          formUuid: parsed.formUuid,
          processCode: parsed.processCode,
          enable: false,
        });
        console.error('  已停用流程');
      } catch (switchErr) {
        console.log(JSON.stringify({
          success: false,
          action: 'delete',
          appType: parsed.appType,
          formUuid: parsed.formUuid,
          processCode: parsed.processCode,
          error: '停用失败: ' + switchErr.message,
        }));
        process.exit(1);
      }

      // Step 3: 重新删除
      try {
        await deleteLogicflow(authRef, {
          appType: parsed.appType,
          formUuid: parsed.formUuid,
          processCode: parsed.processCode,
        });

        console.log(JSON.stringify({
          success: true,
          action: 'delete',
          appType: parsed.appType,
          formUuid: parsed.formUuid,
          processCode: parsed.processCode,
          autoDisabled: true,
        }));
        console.error('✅ 删除成功（已自动停用后删除）');
        return;
      } catch (retryErr) {
        console.log(JSON.stringify({
          success: false,
          action: 'delete',
          appType: parsed.appType,
          formUuid: parsed.formUuid,
          processCode: parsed.processCode,
          error: retryErr.message,
        }));
        console.error('❌ 删除失败: ' + retryErr.message);
        process.exit(1);
      }
    }

    // 其他错误直接报错
    console.log(JSON.stringify({
      success: false,
      action: 'delete',
      appType: parsed.appType,
      formUuid: parsed.formUuid,
      processCode: parsed.processCode,
      error: err.message,
    }));
    console.error('❌ 删除失败: ' + err.message);
    if (err.needsDisable) {
      console.error('   提示: 流程已启用，请先停用或使用 --force 参数自动停用后删除');
    }
    process.exit(1);
  }
}

runDelete(process.argv.slice(2)).catch((err) => {
  console.error('执行异常: ' + err.message);
  process.exit(1);
});
