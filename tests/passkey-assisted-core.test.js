import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parsePasskeyUnlockKek,
 sealVaultKeyForServer,
 openVaultKeyFromServer,
 passkeyRegistrationOptions,
 passkeyAuthenticationOptions,
 validatePasskeyCredentialId,
} from '../shared/passkey-assisted-unlock.mjs';

const b64url=bytes=>Buffer.from(bytes).toString('base64url');
const rawKey=Uint8Array.from({length:32},(_,i)=>i+1);
const vaultKey=Uint8Array.from({length:32},(_,i)=>255-i);

test('服务器辅助KEK只接受base64url编码的32字节强随机值',()=>{
 assert.deepEqual(parsePasskeyUnlockKek(b64url(rawKey)),rawKey);
 for(const bad of [undefined,'',b64url(rawKey.slice(0,31)),b64url(new Uint8Array(33)),'not+base64'])assert.equal(parsePasskeyUnlockKek(bad),null);
});

test('服务器包装保险库密钥使用随机AES-GCM并以用户和版本作为AAD',async()=>{
 const first=await sealVaultKeyForServer(vaultKey,rawKey,'user_123');
 const second=await sealVaultKeyForServer(vaultKey,rawKey,'user_123');
 assert.notEqual(first,second);
 assert.deepEqual(await openVaultKeyFromServer(first,rawKey,'user_123'),vaultKey);
 await assert.rejects(()=>openVaultKeyFromServer(first,rawKey,'other_user'));
 await assert.rejects(()=>openVaultKeyFromServer(first,Uint8Array.from(rawKey,x=>x^1),'user_123'));
 await assert.rejects(()=>openVaultKeyFromServer(first.replace(/.$/,'A'),rawKey,'user_123'));
 assert.equal(first.includes(b64url(vaultKey)),false);
});

test('服务器包装拒绝非32字节vaultKey、非法用户和畸形密文',async()=>{
 await assert.rejects(()=>sealVaultKeyForServer(new Uint8Array(31),rawKey,'user_123'));
 await assert.rejects(()=>sealVaultKeyForServer(vaultKey,rawKey,''));
 await assert.rejects(()=>openVaultKeyFromServer('bad',rawKey,'user_123'));
});

test('注册选项要求可发现凭据和UV并排除已有凭据',async()=>{
 const options=await passkeyRegistrationOptions({rpID:'vault.test',username:'alice',userId:'user_123',exclude:[{id:'credential_123',transports:['internal']}]});
 assert.equal(options.rp.id,'vault.test');
 assert.equal(options.user.name,'alice');
 assert.equal(options.authenticatorSelection.residentKey,'required');
 assert.equal(options.authenticatorSelection.userVerification,'required');
 assert.equal(options.attestation,'none');
 assert.equal(options.excludeCredentials[0].id,'credential_123');
 assert.equal(options.timeout,60000);
});

test('认证选项不泄露用户名或凭据列表并强制UV',async()=>{
 const options=await passkeyAuthenticationOptions({rpID:'vault.test'});
 assert.equal(options.rpId,'vault.test');
 assert.equal(options.userVerification,'required');
 assert.deepEqual(options.allowCredentials,[]);
 assert.equal(JSON.stringify(options).includes('alice'),false);
});

test('credential ID只接受规范base64url并限制长度',()=>{
 assert.equal(validatePasskeyCredentialId('Abc_123-xyz'),true);
 for(const value of ['', 'a', 'bad=', 'bad+', '中', 'a'.repeat(1400)])assert.equal(validatePasskeyCredentialId(value),false);
});
