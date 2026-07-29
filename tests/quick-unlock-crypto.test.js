import test from 'node:test';
import assert from 'node:assert/strict';
import { sealQuickUnlockKey, openQuickUnlockKey, sealQuickUnlockSession, openQuickUnlockSession } from '../public/quick-unlock.mjs';

const prf=crypto.getRandomValues(new Uint8Array(32));

test('PRF派生密钥只为绑定用户名恢复本机vaultKey',async()=>{
 const vault=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const sealed=await sealQuickUnlockKey(vault,prf,'alice');
 assert.equal(sealed.version,1);
 assert.equal(typeof sealed.iv,'string');
 assert.equal(typeof sealed.ciphertext,'string');
 const opened=await openQuickUnlockKey(sealed,prf,'alice');
 assert.deepEqual(new Uint8Array(await crypto.subtle.exportKey('raw',opened)),new Uint8Array(await crypto.subtle.exportKey('raw',vault)));
 await assert.rejects(()=>openQuickUnlockKey(sealed,prf,'bob'));
});

test('错误PRF或损坏的本机快速解锁记录必须失败',async()=>{
 const vault=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const sealed=await sealQuickUnlockKey(vault,prf,'alice');
 const wrong=crypto.getRandomValues(new Uint8Array(32));
 await assert.rejects(()=>openQuickUnlockKey(sealed,wrong,'alice'));
 await assert.rejects(()=>openQuickUnlockKey({...sealed,ciphertext:sealed.ciphertext.slice(0,-2)+'AA'},prf,'alice'));
 await assert.rejects(()=>openQuickUnlockKey({...sealed,version:2},prf,'alice'));
 await assert.rejects(()=>openQuickUnlockKey(sealed,new Uint8Array(31),'alice'));
 await assert.rejects(()=>sealQuickUnlockKey(vault,new Uint8Array(33),'alice'),{name:'TypeError'});
});

test('本机会话包装原子恢复vaultKey和CSRF且绑定用户名',async()=>{
 const vault=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const sealed=await sealQuickUnlockSession(vault,'csrf-secret',prf,'alice','session-one');
 const opened=await openQuickUnlockSession(sealed,prf,'alice','session-one');
 assert.equal(opened.csrf,'csrf-secret');
 assert.deepEqual(new Uint8Array(await crypto.subtle.exportKey('raw',opened.vaultKey)),new Uint8Array(await crypto.subtle.exportKey('raw',vault)));
 await assert.rejects(()=>openQuickUnlockSession(sealed,prf,'bob','session-one'));
 await assert.rejects(()=>openQuickUnlockSession(sealed,prf,'alice','session-two'));
 await assert.rejects(()=>openQuickUnlockSession(sealed,crypto.getRandomValues(new Uint8Array(32)),'alice','session-one'));
});
