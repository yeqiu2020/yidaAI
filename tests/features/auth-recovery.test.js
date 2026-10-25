'use strict';
jest.mock('../../lib/core/utils',()=>({loadCookieData:jest.fn(),findProjectRoot:()=> 'OFFLINE_ROOT'}));
const coreUtils=require('../../lib/core/utils');
const auth=require('../../lib/core/auth-recovery');
const reportUtils=require('../../.agents/skills/report/scripts/core-lib/utils');

test('未提供授权浏览器 provider 时返回明确待授权状态，不加载缺失模块或打开桌面浏览器',async()=>{
  await expect(auth.requestLogin()).rejects.toMatchObject({code:'LOGIN_REQUIRED',requiresAuthorization:true,nextAction:'in_app_browser_login'});
  await expect(reportUtils.requestWithAutoLogin(async()=>({__needLogin:true}),{})).rejects.toMatchObject({code:'LOGIN_REQUIRED'});
});
test('显式传入宿主授权 provider 时使用其登录结果',async()=>{
  const state={cookies:[{name:'fixture',value:'FAKE'}],csrf_token:'FAKE_TOKEN'};
  const loginProvider=jest.fn(async()=>state);
  expect(await auth.requestLogin({loginProvider})).toEqual(state);expect(loginProvider).toHaveBeenCalledTimes(1);
});
test('报表 CSRF 恢复复用公共缓存读取，携带新 token 重试',async()=>{
  coreUtils.loadCookieData.mockReturnValue({cookies:[{name:'fixture',value:'FAKE'}],csrf_token:'NEW_TOKEN',base_url:'https://offline.invalid'});
  const request=jest.fn().mockResolvedValueOnce({__csrfExpired:true}).mockResolvedValueOnce({success:true});
  const ref={};expect(await reportUtils.requestWithAutoLogin(request,ref)).toEqual({success:true});
  expect(request).toHaveBeenCalledTimes(2);expect(ref.csrfToken).toBe('NEW_TOKEN');
  expect(coreUtils.loadCookieData).toHaveBeenCalledWith('OFFLINE_ROOT');
});

test('缓存刷新后仍过期时转为待授权，不返回内部过期标志或无限重试',async()=>{
  const request=jest.fn().mockResolvedValue({__csrfExpired:true});
  await expect(reportUtils.requestWithAutoLogin(request,{})).rejects.toMatchObject({code:'LOGIN_REQUIRED'});
  expect(request).toHaveBeenCalledTimes(2);
});
