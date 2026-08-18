/**
 * 作者：叶秋
 * 联系方式：
 * 来源：www.yidatrain.com
 * Node.js 环境检查与自动安装模块
 * 版本: 1.0.0
 * 
 * 功能：
 * 1. 检查Node.js是否已安装
 * 2. 如未安装，自动下载并安装Node.js
 * 3. 确保公式生成环境完整
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// Node.js 版本要求
const REQUIRED_NODE_VERSION = '18.0.0';

/**
 * 检查Node.js是否已安装
 * @returns {Object} { installed: boolean, version: string|null, meetsRequirement: boolean }
 */
function checkNodeJs() {
  try {
    const result = execSync('node --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const version = result.trim().replace('v', '');
    const meetsRequirement = compareVersions(version, REQUIRED_NODE_VERSION) >= 0;
    
    return {
      installed: true,
      version: version,
      meetsRequirement: meetsRequirement
    };
  } catch (error) {
    return {
      installed: false,
      version: null,
      meetsRequirement: false
    };
  }
}

/**
 * 比较版本号
 * @param {string} v1 版本1
 * @param {string} v2 版本2
 * @returns {number} 1: v1>v2, 0: v1=v2, -1: v1<v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

/**
 * 获取系统信息
 * @returns {Object} { platform: string, arch: string }
 */
function getSystemInfo() {
  const platform = os.platform();
  const arch = os.arch();
  
  return {
    platform: platform, // 'win32', 'darwin', 'linux'
    arch: arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : 'x86'
  };
}

/**
 * 获取Node.js下载URL
 * @returns {string} 下载URL
 */
function getNodeDownloadUrl() {
  const { platform, arch } = getSystemInfo();
  const version = REQUIRED_NODE_VERSION;
  
  // 使用国内镜像加速下载
  const baseUrl = 'https://npmmirror.com/mirrors/node';
  
  if (platform === 'win32') {
    return `${baseUrl}/v${version}/node-v${version}-win-${arch}.msi`;
  } else if (platform === 'darwin') {
    return `${baseUrl}/v${version}/node-v${version}-darwin-${arch}.pkg`;
  } else {
    return `${baseUrl}/v${version}/node-v${version}-linux-${arch}.tar.xz`;
  }
}

/**
 * 下载文件
 * @param {string} url 下载URL
 * @param {string} destPath 目标路径
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 正在下载Node.js安装包...`);
    console.log(`   URL: ${url}`);
    
    const file = fs.createWriteStream(destPath);
    
    https.get(url, { timeout: 120000 }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 重定向
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`下载失败，状态码: ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      let lastPercent = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          if (percent !== lastPercent && percent % 10 === 0) {
            console.log(`   下载进度: ${percent}%`);
            lastPercent = percent;
          }
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('✅ 下载完成');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Windows平台自动安装Node.js
 * @param {string} installerPath 安装包路径
 * @returns {Promise<void>}
 */
function installNodeWindows(installerPath) {
  return new Promise((resolve, reject) => {
    console.log('🔧 正在安装Node.js（Windows）...');
    console.log('   请等待安装完成，可能需要几分钟...');
    
    // 使用msiexec静默安装
    const installProcess = spawn('msiexec', ['/i', installerPath, '/qn', '/norestart'], {
      stdio: 'inherit'
    });
    
    installProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Node.js安装成功');
        resolve();
      } else {
        reject(new Error(`安装失败，退出码: ${code}`));
      }
    });
    
    installProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * macOS平台自动安装Node.js
 * @param {string} installerPath 安装包路径
 * @returns {Promise<void>}
 */
function installNodeMacOS(installerPath) {
  return new Promise((resolve, reject) => {
    console.log('🔧 正在安装Node.js（macOS）...');
    console.log('   请等待安装完成，可能需要几分钟...');
    
    const installProcess = spawn('installer', ['-pkg', installerPath, '-target', '/'], {
      stdio: 'inherit'
    });
    
    installProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Node.js安装成功');
        resolve();
      } else {
        reject(new Error(`安装失败，退出码: ${code}`));
      }
    });
    
    installProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Linux平台自动安装Node.js
 * @param {string} archivePath 压缩包路径
 * @returns {Promise<void>}
 */
function installNodeLinux(archivePath) {
  return new Promise((resolve, reject) => {
    console.log('🔧 正在安装Node.js（Linux）...');
    console.log('   请等待安装完成，可能需要几分钟...');
    
    const installDir = '/usr/local';
    
    // 解压到/usr/local
    const tarProcess = spawn('sudo', ['tar', '-xJf', archivePath, '-C', installDir], {
      stdio: 'inherit'
    });
    
    tarProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Node.js安装成功');
        console.log('⚠️  请手动将Node.js添加到PATH环境变量');
        resolve();
      } else {
        reject(new Error(`安装失败，退出码: ${code}`));
      }
    });
    
    tarProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 自动安装Node.js
 * @returns {Promise<boolean>} 是否安装成功
 */
async function autoInstallNodeJs() {
  const { platform } = getSystemInfo();
  const tempDir = os.tmpdir();
  const downloadUrl = getNodeDownloadUrl();
  const fileName = path.basename(downloadUrl);
  const downloadPath = path.join(tempDir, fileName);
  
  try {
    // 下载安装包
    await downloadFile(downloadUrl, downloadPath);
    
    // 根据平台执行安装
    if (platform === 'win32') {
      await installNodeWindows(downloadPath);
    } else if (platform === 'darwin') {
      await installNodeMacOS(downloadPath);
    } else {
      await installNodeLinux(downloadPath);
    }
    
    // 清理下载文件
    try {
      fs.unlinkSync(downloadPath);
    } catch (e) {
      // 忽略清理错误
    }
    
    // 验证安装
    const check = checkNodeJs();
    if (check.installed && check.meetsRequirement) {
      console.log(`✅ Node.js ${check.version} 安装验证通过`);
      return true;
    } else {
      throw new Error('安装验证失败');
    }
  } catch (error) {
    console.error('❌ Node.js自动安装失败:', error.message);
    console.error('\n请手动安装Node.js:');
    console.error('1. 访问 https://nodejs.org/');
    console.error(`2. 下载并安装 v${REQUIRED_NODE_VERSION} 或更高版本`);
    console.error('3. 重新运行公式生成命令');
    return false;
  }
}

/**
 * 确保Node.js环境（主入口函数）
 * @returns {Promise<boolean>} 环境是否就绪
 */
async function ensureNodeJsEnvironment() {
  console.log('🔍 检查Node.js环境...\n');
  
  const check = checkNodeJs();
  
  if (check.installed) {
    console.log(`✅ Node.js已安装: v${check.version}`);
    
    if (check.meetsRequirement) {
      console.log(`✅ 版本符合要求 (>= v${REQUIRED_NODE_VERSION})\n`);
      return true;
    } else {
      console.log(`⚠️  当前版本过低，需要 >= v${REQUIRED_NODE_VERSION}`);
      console.log('🔄 开始自动升级...\n');
      return await autoInstallNodeJs();
    }
  } else {
    console.log('❌ Node.js未安装');
    console.log('🔄 开始自动安装...\n');
    return await autoInstallNodeJs();
  }
}

/**
 * 获取环境检查报告（用于错误提示）
 * @returns {string} 检查报告
 */
function getEnvironmentReport() {
  const check = checkNodeJs();
  const { platform, arch } = getSystemInfo();
  
  let report = '\n========== 环境检查报告 ==========\n';
  report += `操作系统: ${platform} (${arch})\n`;
  report += `Node.js状态: ${check.installed ? '已安装' : '未安装'}\n`;
  
  if (check.installed) {
    report += `当前版本: v${check.version}\n`;
    report += `版本要求: >= v${REQUIRED_NODE_VERSION}\n`;
    report += `版本检查: ${check.meetsRequirement ? '✅ 通过' : '❌ 不满足'}\n`;
  }
  
  report += '==================================\n';
  
  return report;
}

module.exports = {
  checkNodeJs,
  ensureNodeJsEnvironment,
  getEnvironmentReport,
  REQUIRED_NODE_VERSION
};
