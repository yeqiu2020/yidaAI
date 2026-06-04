# 宜搭 API 接口文档

> 本文档整理了宜搭平台的主要 API 接口，通过浏览器网络请求拦截获取。
> 版本：v1.0.0 (2026-04-02)

## 目录

- [接口调用规范](#接口调用规范)
- [应用相关接口](#应用相关接口)
- [组织相关接口](#组织相关接口)
- [工作台相关接口](#工作台相关接口)
- [通知相关接口](#通知相关接口)
- [用户相关接口](#用户相关接口)
- [商品/套餐相关接口](#商品套餐相关接口)
- [其他接口](#其他接口)

---

## 接口调用规范

### 请求方式
```javascript
GET {baseUrl}/query/{module}/{action}.json
```

### 请求参数
所有接口都需要以下基础参数：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | API 方法名，如 `App.getList` |
| `_mock` | boolean | 否 | 是否使用 mock 数据，默认 `false` |
| `_csrf_token` | string | 是 | CSRF Token，从 Cookie 获取 |
| `_stamp` | number | 是 | 时间戳 `Date.now()` |
| `_locale_time_zone_offset` | number | 否 | 时区偏移，默认 `28800000`（北京时间） |

### 请求头
```javascript
{
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Cookie': '{cookie_string}',
  'Referer': '{baseUrl}/myApp',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
```

### CSRF Token 获取
从 Cookie 中读取：
```javascript
const csrfToken = cookieObj['tianshu_csrf_token'] || cookieObj['c_csrf'];
```

### 响应格式
```json
{
  "success": true,
  "content": {
    "data": []
  },
  "errorCode": null,
  "errorMsg": null
}
```

---

## 应用相关接口

### 1. 获取应用列表
**接口地址：** `/query/app/getAppList.json`

**方法名：** `App.getList`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `App.getList` |
| `pageIndex` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页数量，默认 `16` |
| `orderField` | string | 否 | 排序字段，默认 `data_gmt_create` |
| `appStatus` | string | 否 | 应用状态筛选 |
| `isAdmin` | boolean | 否 | 是否管理员，默认 `true` |
| `creator` | string | 否 | 创建者筛选 |
| `key` | string | 否 | 搜索关键词 |

**完整示例：**
```
GET /query/app/getAppList.json?_api=App.getList&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&pageIndex=1&pageSize=100&orderField=data_gmt_create&appStatus=&isAdmin=true&creator=&key=&_stamp=1775117600000
```

**响应示例：**
```json
{
  "success": true,
  "content": {
    "data": [
      {
        "appName": { "zh_CN": "应用名称" },
        "appType": "APP_XXXXXXXX",
        "gmtCreate": "2026-01-01 00:00:00",
        "gmtModified": "2026-01-01 00:00:00",
        "iconUrl": "https://...",
        "status": "ONLINE"
      }
    ]
  }
}
```

---

### 2. 获取最近访问的应用列表
**接口地址：** `/query/app/getLatelyAccessAppList.json`

**方法名：** `App.getLatelyAccessAppList`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `App.getLatelyAccessAppList` |

**完整示例：**
```
GET /query/app/getLatelyAccessAppList.json?_api=App.getLatelyAccessAppList&_mock=false&_stamp=1775117600000
```

**响应示例：**
```json
{
  "success": true,
  "content": {
    "data": [
      {
        "appId": "APP_XXXXXXXX",
        "appName": "应用名称",
        "lastAccessTime": "2026-04-02 10:00:00"
      }
    ]
  }
}
```

---

### 3. 获取应用分类列表
**接口地址：** `/query/appcategory/listAppCategoriesLite.json`

**方法名：** `App.listAppCategoriesLite`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `App.listAppCategoriesLite` |

**完整示例：**
```
GET /query/appcategory/listAppCategoriesLite.json?_api=App.listAppCategoriesLite&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&_stamp=1775117600000
```

**响应示例：**
```json
{
  "success": true,
  "content": {
    "data": [
      {
        "categoryId": "CAT_XXX",
        "categoryName": "分类名称",
        "orderNum": 1
      }
    ]
  }
}
```

---

## 组织相关接口

### 4. 获取组织信息卡片
**接口地址：** `/query/corpadmin/getBaseCorpInfoManageCard.json`

**方法名：** `WorkBench.getCorpInfoCard`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.getCorpInfoCard` |

**完整示例：**
```
GET /query/corpadmin/getBaseCorpInfoManageCard.json?_api=WorkBench.getCorpInfoCard&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&_stamp=1775117600000
```

**响应示例：**
```json
{
  "success": true,
  "content": {
    "corpName": "组织名称",
    "corpId": "2025",
    "adminName": "管理员姓名",
    "memberCount": 100,
    "appCount": 10
  }
}
```

---

### 5. 检查是否为 SaaS 提供商
**接口地址：** `/query/saasCorpRpc/isSaasProvider.json`

**方法名：** `BasicInfo.getIsSaasProvider`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `BasicInfo.getIsSaasProvider` |

**完整示例：**
```
GET /query/saasCorpRpc/isSaasProvider.json?_api=BasicInfo.getIsSaasProvider&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&_stamp=1775117600000
```

---

## 工作台相关接口

### 6. 获取工作台内容
**接口地址：** `/query/workPlatform/getWorkbenchContent.json`

**方法名：** `WorkBench.getWorkbenchContent`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.getWorkbenchContent` |

**完整示例：**
```
GET /query/workPlatform/getWorkbenchContent.json?_api=WorkBench.getWorkbenchContent&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&_stamp=1775117600000
```

**响应示例：**
```json
{
  "success": true,
  "content": {
    "recentApps": [],
    "recommendApps": [],
    "templates": []
  }
}
```

---

### 7. 检查宜搭窗口关注状态
**接口地址：** `/query/workPlatform/isYidaWindowFollower.json`

**方法名：** `WorkBench.checkServiceWindow`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.checkServiceWindow` |

---

### 8. 检查业务窗口
**接口地址：** `/query/workPlatform/checkBusinessWindow.json`

**方法名：** `WorkBench.checkBusinessWindow`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.checkBusinessWindow` |

---

## 通知相关接口

### 9. 获取收件箱消息列表
**接口地址：** `/query/notice/listInboxMessage.json`

**方法名：** `Notice.getlistInboxMessage`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `Notice.getlistInboxMessage` |
| `currentPage` | number | 否 | 当前页，默认 `1` |
| `pageSize` | number | 否 | 每页数量，默认 `3` |

**完整示例：**
```
GET /query/notice/listInboxMessage.json?_api=Notice.getlistInboxMessage&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&currentPage=1&pageSize=3&_stamp=1775117600000
```

**响应示例：**
```json
{
  "success": true,
  "content": {
    "data": [
      {
        "messageId": "MSG_XXX",
        "title": "消息标题",
        "content": "消息内容",
        "createTime": "2026-04-02 10:00:00",
        "isRead": false
      }
    ]
  }
}
```

---

### 10. 获取通知列表
**接口地址：** `/query/notice/list.json`

**方法名：** `WorkBench.getNoticeList`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.getNoticeList` |

---

### 11. 获取更新内容
**接口地址：** `/query/notice/screen.json`

**方法名：** `WorkBench.getUpdateContent`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.getUpdateContent` |

---

## 用户相关接口

### 12. 获取待办任务数量
**接口地址：** `/query/task/getTodoTasksNumInCorp.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |

**完整示例：**
```
GET /query/task/getTodoTasksNumInCorp.json?_api=nattyFetch&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&_stamp=1775117600000
```

**响应示例：**
```json
{
  "success": true,
  "content": {
    "todoCount": 10,
    "urgentCount": 2
  }
}
```

---

### 13. 搜索钉钉群组
**接口地址：** `/query/dinggroup/searchGroup.json`

**方法名：** `WorkBench.getDingGroup`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.getDingGroup` |
| `query` | string | 否 | 搜索关键词 |
| `pageIndex` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页数量，默认 `20` |

**完整示例：**
```
GET /query/dinggroup/searchGroup.json?_api=WorkBench.getDingGroup&_mock=false&_csrf_token=xxx&_locale_time_zone_offset=28800000&query=&pageIndex=1&pageSize=20&_stamp=1775117600000
```

---

## 商品/套餐相关接口

### 14. 获取商品信息
**接口地址：** `/query/commodity/getCommodityInfo.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |

---

### 15. 获取简单商品信息
**接口地址：** `/query/commodity/getSimpleCommodityInfo.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |

---

### 16. 检查是否为教育版
**接口地址：** `/query/commodity/isEduEdition.json`

**方法名：** `commodity.isEduEdition`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `commodity.isEduEdition` |

---

### 17. 查询交付内容
**接口地址：** `/query/commodity/queryDeliveryContents.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |
| `resIds` | string | 是 | 资源 ID，多个用逗号分隔 |

**完整示例：**
```
GET /query/commodity/queryDeliveryContents.json?_api=nattyFetch&_mock=false&resIds=1337&_csrf_token=xxx&_stamp=1775117600000
```

---

### 18. 获取企业福利活动
**接口地址：** `/query/commodity/selectCorpBenefitActivities.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |

---

### 19. 获取优惠券列表
**接口地址：** `/query/commodity/listCouponKeys.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |
| `sceneKey` | string | 否 | 场景标识，默认 `tutorial` |

**完整示例：**
```
GET /query/commodity/listCouponKeys.json?_api=nattyFetch&_mock=false&_csrf_token=xxx&sceneKey=tutorial&_stamp=1775117600000
```

---

### 20. 智能推荐
**接口地址：** `/query/commodity/smartRecommend.json`

**方法名：** `WorkBench.smartRecommend`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.smartRecommend` |
| `recScene` | string | 是 | 推荐场景 |
| `recId` | string | 是 | 推荐 ID |

---

## 其他接口

### 21. 获取权限列表
**接口地址：** `/query/auth/list.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |
| `type` | string | 是 | 权限类型，默认 `APPLICATION` |

**完整示例：**
```
GET /query/auth/list.json?_api=nattyFetch&_mock=false&type=APPLICATION&_stamp=1775117600000
```

---

### 22. 获取模板安装数量
**接口地址：** `/query/saasTemplate/getSaasTemplateInstallNum.json`

**方法名：** `SaaS.getSaasTemplateInstallNum`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `SaaS.getSaasTemplateInstallNum` |

---

### 23. 查询企业应用配置
**接口地址：** `/query/exclusive/queryCorpAppConfig.json`

**方法名：** `Global.queryCorpAppConfig`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `Global.queryCorpAppConfig` |

---

### 24. 灰度功能检查
**接口地址：** `/query/compromiseDing/orgInGrays.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |
| `grayKeyList` | string | 是 | 灰度 Key 列表，JSON 数组格式 |

**完整示例：**
```
GET /query/compromiseDing/orgInGrays.json?_api=nattyFetch&_mock=false&grayKeyList=["exclusive_app_category","support_single_storage_start","QUICK_BI_FEATURE"]&_csrf_token=xxx&_stamp=1775117600000
```

---

### 25. 获取用户教程步骤
**接口地址：** `/query/slsLog/getUserTutorialStep.json`

**方法名：** `WorkBench.getUserTutorialStep`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `WorkBench.getUserTutorialStep` |

---

### 26. 获取工作台横幅
**接口地址：** `/query/loginFreeFormData/listFormDataByType.json`

**方法名：** `nattyFetch`

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `_api` | string | 是 | `nattyFetch` |
| `type` | string | 是 | 数据类型，如 `workbench_banner` |
| `userLanguage` | string | 否 | 用户语言，默认 `zh_CN` |

---

## 常用 JavaScript 封装

### API 调用函数
```javascript
const https = require('https');
const http = require('http');

/**
 * 发送 API 请求
 * @param {string} baseUrl - 基础 URL
 * @param {string} apiPath - API 路径
 * @param {Object} cookies - Cookie 对象
 * @returns {Promise<Object>}
 */
function callYidaAPI(baseUrl, apiPath, cookies = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + apiPath);
    const client = url.protocol === 'https:' ? https : http;
    
    // 构建 cookie 字符串
    const csrfToken = cookies['tianshu_csrf_token'] || cookies['c_csrf'] || '';
    const cookieString = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cookie': cookieString,
        'Referer': `${baseUrl}/myApp`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON 解析失败: ' + e.message));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * 获取应用列表
 * @param {string} baseUrl - 基础 URL
 * @param {Object} cookies - Cookie 对象
 * @param {number} pageSize - 每页数量
 * @returns {Promise<Array>}
 */
async function getAppList(baseUrl, cookies, pageSize = 100) {
  const timestamp = Date.now();
  const csrfToken = cookies['tianshu_csrf_token'] || cookies['c_csrf'] || '';
  
  const apiPath = `/query/app/getAppList.json?_api=App.getList&_mock=false&_csrf_token=${csrfToken}&_locale_time_zone_offset=28800000&pageIndex=1&pageSize=${pageSize}&orderField=data_gmt_create&appStatus=&isAdmin=true&creator=&key=&_stamp=${timestamp}`;
  
  const result = await callYidaAPI(baseUrl, apiPath, cookies);
  
  if (result?.success && result.content?.data) {
    return result.content.data;
  }
  
  throw new Error(result?.errorMsg || '获取应用列表失败');
}

// 使用示例
const cookies = require('./.cookies.json').cookies;
const apps = await getAppList('https://oksruk.aliwork.com', cookies);
console.log('应用列表:', apps);
```

---

## 更新日志

- **v1.0.0** (2026-04-02)
  - 初始版本，整理了 26 个常用 API 接口
  - 包含接口地址、方法名、请求参数、响应示例
  - 提供 JavaScript 调用封装函数

---

## 注意事项

1. **CSRF Token 过期**：如果 API 返回错误，可能需要重新登录获取新的 CSRF Token
2. **权限限制**：部分接口需要管理员权限才能访问
3. **频率限制**：避免短时间内大量请求，可能会被限流
4. **数据安全**：不要将 Cookie 信息泄露给他人
