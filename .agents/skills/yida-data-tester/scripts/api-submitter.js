/**
 * 宜搭API提交引擎
 * 版本: 1.0.0
 * 创建时间: 2026-03-13
 * 
 * 功能：通过宜搭OpenAPI提交表单数据
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

/**
 * API提交引擎主类
 */
class ApiSubmitter {
  constructor(config) {
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.baseUrl = config.baseUrl || 'https://api.dingtalk.com';
    this.accessToken = null;
    this.tokenExpireTime = 0;
  }

  /**
   * 获取访问令牌
   * @returns {Promise<string>} accessToken
   */
  async getAccessToken() {
    // 检查token是否过期
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/v1.0/oauth2/accessToken`, {
        appKey: this.appKey,
        appSecret: this.appSecret
      });

      if (response.data && response.data.accessToken) {
        this.accessToken = response.data.accessToken;
        // token有效期通常为7200秒，提前5分钟刷新
        this.tokenExpireTime = Date.now() + (response.data.expireIn || 7200) * 1000 - 300000;
        return this.accessToken;
      } else {
        throw new Error('获取accessToken失败: 响应格式不正确');
      }
    } catch (error) {
      throw new Error(`获取accessToken失败: ${error.message}`);
    }
  }

  /**
   * 提交单条数据
   * @param {Object} params - 提交参数
   * @param {string} params.formUuid - 表单UUID
   * @param {Object} params.data - 表单数据
   * @returns {Promise<Object>} 提交结果
   */
  async submitOne(params) {
    const { formUuid, data, useUid = '' } = params;
    
    try {
      const token = await this.getAccessToken();
      
      // 构建请求体
      const requestBody = {
        formUuid,
        formDataJson: JSON.stringify(data),
        useUid
      };

      const response = await axios.post(
        `${this.baseUrl}/v1.0/yida/forms/instances`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': token
          }
        }
      );

      if (response.data && response.data.success) {
        return {
          success: true,
          instanceId: response.data.data?.instanceId,
          formInstId: response.data.data?.formInstId,
          message: '提交成功',
          rawResponse: response.data
        };
      } else {
        return {
          success: false,
          message: response.data?.message || '提交失败',
          errorCode: response.data?.code,
          rawResponse: response.data
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        errorCode: error.response?.data?.code,
        rawError: error.message
      };
    }
  }

  /**
   * 批量提交数据
   * @param {Object} params - 批量提交参数
   * @param {string} params.formUuid - 表单UUID
   * @param {Array} params.dataList - 数据列表
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 提交结果列表
   */
  async submitBatch(params, options = {}) {
    const { formUuid, dataList = [] } = params;
    const { delay = 500, stopOnError = false } = options;
    
    const results = [];
    
    for (let i = 0; i < dataList.length; i++) {
      const data = dataList[i];
      console.log(`正在提交第 ${i + 1}/${dataList.length} 条数据...`);
      
      const result = await this.submitOne({
        formUuid,
        data,
        useUid: params.useUid
      });
      
      results.push({
        index: i,
        data,
        ...result
      });
      
      // 如果提交失败且设置了出错停止
      if (!result.success && stopOnError) {
        console.log(`提交失败，停止后续提交: ${result.message}`);
        break;
      }
      
      // 延迟，避免请求过快
      if (i < dataList.length - 1 && delay > 0) {
        await this.sleep(delay);
      }
    }
    
    return results;
  }

  /**
   * 查询表单实例详情
   * @param {string} formInstId - 表单实例ID
   * @returns {Promise<Object>} 实例详情
   */
  async getInstanceDetail(formInstId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseUrl}/v1.0/yida/forms/instances/${formInstId}`,
        {
          headers: {
            'x-acs-dingtalk-access-token': token
          }
        }
      );

      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data,
          rawResponse: response.data
        };
      } else {
        return {
          success: false,
          message: response.data?.message || '查询失败',
          rawResponse: response.data
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        rawError: error.message
      };
    }
  }

  /**
   * 搜索表单实例
   * @param {Object} params - 搜索参数
   * @returns {Promise<Object>} 搜索结果
   */
  async searchInstances(params) {
    const { formUuid, searchFieldJson = {}, pageNumber = 1, pageSize = 10 } = params;
    
    try {
      const token = await this.getAccessToken();
      
      const requestBody = {
        formUuid,
        searchFieldJson: JSON.stringify(searchFieldJson),
        pageNumber,
        pageSize
      };

      const response = await axios.post(
        `${this.baseUrl}/v1.0/yida/forms/instances/search`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': token
          }
        }
      );

      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data,
          totalCount: response.data.data?.totalCount,
          rawResponse: response.data
        };
      } else {
        return {
          success: false,
          message: response.data?.message || '搜索失败',
          rawResponse: response.data
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        rawError: error.message
      };
    }
  }

  /**
   * 查询流程实例状态
   * @param {string} processInstanceId - 流程实例ID
   * @returns {Promise<Object>} 流程状态
   */
  async getProcessStatus(processInstanceId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseUrl}/v1.0/yida/processes/instances/${processInstanceId}`,
        {
          headers: {
            'x-acs-dingtalk-access-token': token
          }
        }
      );

      if (response.data && response.data.success) {
        return {
          success: true,
          status: response.data.data?.status,
          currentNode: response.data.data?.currentNode,
          tasks: response.data.data?.tasks,
          data: response.data.data,
          rawResponse: response.data
        };
      } else {
        return {
          success: false,
          message: response.data?.message || '查询失败',
          rawResponse: response.data
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        rawError: error.message
      };
    }
  }

  /**
   * 延迟函数
   * @param {number} ms - 毫秒
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ 命令行接口 ============

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('用法: node api-submitter.js <配置文件路径> <数据文件路径> [输出文件路径]');
    console.log('示例: node api-submitter.js ./api-config.json ./test-data.json ./submit-result.json');
    process.exit(1);
  }

  const configPath = args[0];
  const dataPath = args[1];
  const outputPath = args[2] || './submit-result.json';

  try {
    // 读取配置
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // 读取测试数据
    const dataContent = fs.readFileSync(dataPath, 'utf-8');
    const dataList = JSON.parse(dataContent);

    // 创建提交器
    const submitter = new ApiSubmitter({
      appKey: config.appKey,
      appSecret: config.appSecret,
      baseUrl: config.baseUrl
    });

    console.log(`开始提交 ${dataList.length} 条数据...`);
    
    // 批量提交
    const results = await submitter.submitBatch({
      formUuid: config.formUuid,
      dataList,
      useUid: config.useUid
    }, {
      delay: config.delay || 500,
      stopOnError: config.stopOnError || false
    });

    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    const summary = {
      total: results.length,
      success: successCount,
      failed: failCount,
      successRate: ((successCount / results.length) * 100).toFixed(2) + '%',
      results
    };

    // 保存结果
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');

    console.log('\n========== 提交结果 ==========');
    console.log(`总计: ${summary.total}`);
    console.log(`成功: ${summary.success}`);
    console.log(`失败: ${summary.failed}`);
    console.log(`成功率: ${summary.successRate}`);
    console.log(`\n📄 详细结果已保存: ${outputPath}`);

    // 显示失败详情
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('\n❌ 失败详情:');
      failures.forEach(f => {
        console.log(`  第${f.index + 1}条: ${f.message}`);
      });
    }

  } catch (error) {
    console.error('❌ 提交失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出模块
module.exports = ApiSubmitter;

/**
 * 版本历史：
 * v1.0.0 (2026-03-13): 初始版本，支持宜搭OpenAPI的数据提交、查询和流程状态追踪
 */