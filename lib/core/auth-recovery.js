'use strict';

const { loadCookieData } = require('./utils');

function refreshCsrfFromCache(options={}) {
  return loadCookieData(options.projectRoot);
}

/** Host integrations can supply an authorized in-app browser provider. Never launch a desktop browser here. */
async function requestLogin(options={}) {
  if(typeof options.loginProvider==='function') return options.loginProvider(options);
  const error=new Error('登录态已失效，请在宿主内置浏览器完成宜搭登录授权后重试');
  error.code='LOGIN_REQUIRED';
  error.requiresAuthorization=true;
  error.nextAction='in_app_browser_login';
  throw error;
}

module.exports={refreshCsrfFromCache,requestLogin};
