/**
 * UTF-8 编码设置工具
 * 用于解决 Windows 终端中文乱码问题
 * 
 * 使用方法:
 *   const setUtf8Encoding = require('./set-utf8-encoding.js');
 *   setUtf8Encoding(); // 在脚本开头调用
 */

const { execSync } = require('child_process');

/**
 * 设置 UTF-8 编码（Windows 平台）
 * @param {boolean} silent - 是否静默模式（不输出错误信息）
 * @returns {boolean} 是否设置成功
 */
function setUtf8Encoding(silent = true) {
  if (process.platform !== 'win32') {
    return true; // 非 Windows 平台直接返回
  }

  try {
    execSync('chcp 65001', { stdio: silent ? 'ignore' : 'inherit' });
    return true;
  } catch (e) {
    if (!silent) {
      console.error('设置 UTF-8 编码失败:', e.message);
    }
    return false;
  }
}

module.exports = setUtf8Encoding;
