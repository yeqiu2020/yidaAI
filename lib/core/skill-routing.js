'use strict';

/** High-confidence intent boundaries shared by evaluations and local integrations.
 * This does not replace an IDE model's skill selector or infer authorization to execute.
 */
function explicitIntent(text) {
  const q=String(text || '').toLowerCase();
  if (/(为什么|不生效|报错|什么原因|哪里错|对不对)/.test(q) && /(宜搭|公式|表单|逻辑流|组件|代码|连接器|流程)/.test(q)) return 'yida-consultant';
  if (/(发布.*(检查|守卫|改动)|防止覆盖|盲覆盖)/.test(q)) return 'publish-guard';
  if (/提示词/.test(q)) return 'code-expert';
  if (/(同步.*配置|获取.*组件id)/.test(q)) return 'config-sync';
  if (/(清空|批量删除|清理).*(数据|表单记录)/.test(q)) return 'data-clean';
  if (/(备份|导出).*(实例数据|应用数据|数据到|数据备份)/.test(q)) return 'data-backup';
  if (/(逻辑流|集成自动化|审批(通过|结束)后.*(更新|同步|通知)|表单触发)/.test(q)) return 'integration';
  if (/(echarts|大屏|驾驶舱|canvas)/.test(q)) return 'custom-page';
  if (/(创建|新建).*(新应用|一个应用)/.test(q)) return 'api-client';
  if (/(生成|创建|添加).*(表单字段结构|一个表单|新表单)/.test(q)) return 'form_creator';
  if (/(写|生成|编写|格式校验).*(代码)|动作代码/.test(q) && !/(测试.*代码|代码.*测试)/.test(q)) return 'code-expert';
  if (/(写|生成|编写).*(公式)/.test(q)) return 'formula-generator';
  return null;
}
module.exports={explicitIntent};
