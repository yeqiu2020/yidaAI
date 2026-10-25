'use strict';
jest.mock('child_process',()=>({spawn:jest.fn()}));
const {EventEmitter}=require('events');
const {spawn}=require('child_process');
const {runScript}=require('../../lib/sync-server/script-runner');
let child;
beforeEach(()=>{
  jest.useFakeTimers();child=new EventEmitter();
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=jest.fn();
  spawn.mockReturnValue(child);
});
afterEach(()=>jest.useRealTimers());
test('成功后立即清理计时器，不再触发 kill',async()=>{
  const result=runScript('offline',[],1000);child.stdout.emit('data','done');child.emit('close',0);
  expect(await result).toBe('done');expect(jest.getTimerCount()).toBe(0);
  jest.advanceTimersByTime(2000);expect(child.kill).not.toHaveBeenCalled();
});
test('子进程错误清理计时器并保留错误原因',async()=>{
  const result=runScript('offline',[],1000);child.emit('error',new Error('spawn failed'));
  await expect(result).rejects.toThrow('spawn failed');expect(jest.getTimerCount()).toBe(0);
});
test('超时只结算一次，迟到的 close 不会变为成功',async()=>{
  const result=runScript('offline',[],1000);const check=expect(result).rejects.toThrow('执行超时');
  jest.advanceTimersByTime(1001);child.emit('close',0);await check;
  expect(child.kill).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
});
