import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySessionClient, normalizeSessionIp } from '../shared/session-metadata.mjs';

test('会话客户端只归类设备和浏览器，不返回完整 User-Agent',()=>{
  assert.deepEqual(classifySessionClient('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile Safari/604.1'),{device:'mobile',browser:'safari'});
  assert.deepEqual(classifySessionClient('Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile Safari/604.1'),{device:'tablet',browser:'safari'});
  assert.deepEqual(classifySessionClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'),{device:'desktop',browser:'edge'});
  assert.deepEqual(classifySessionClient(''),{device:'unknown',browser:'unknown'});
});

test('会话 IP 接受规范 IPv4/IPv6 并拒绝控制字符、转发链和畸形值',()=>{
  assert.equal(normalizeSessionIp('203.0.113.7'),'203.0.113.7');
  assert.equal(normalizeSessionIp('2001:db8::7'),'2001:db8::7');
  for(const value of ['', '999.1.1.1', '1.2.3.4, 5.6.7.8', '1.2.3.4\nspoof', 'not-an-ip'])assert.equal(normalizeSessionIp(value),'unknown');
});
