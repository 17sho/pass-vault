import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTotpSecret, generateTotp } from '../public/totp.mjs';

test('RFC 6238 SHA-1 vectors generate the expected 8-digit values',async()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]){
  assert.equal((await generateTotp(secret,seconds*1000,{digits:8})).code,expected);
 }
});

test('normalizes user-friendly Base32 and rejects malformed or undersized secrets',()=>{
 assert.equal(normalizeTotpSecret(' jbsw-y3dp ehpk3pxp= '),'JBSWY3DPEHPK3PXP');
 for(const bad of ['','ABC','JBSWY3DPEHPK3PX!'])assert.throws(()=>normalizeTotpSecret(bad),/invalid_totp_secret/);
});

test('rejects impossible Base32 lengths and non-zero trailing padding bits',()=>{
 for(const bad of ['A'.repeat(17),'A'.repeat(19),'A'.repeat(22),'A'.repeat(17)+'B'])assert.throws(()=>normalizeTotpSecret(bad),/invalid_totp_secret/);
 assert.equal(normalizeTotpSecret('JBSWY3DPEHPK3PXP'),'JBSWY3DPEHPK3PXP');
});

test('returns a six-digit code and exact countdown for the default 30-second period',async()=>{
 const result=await generateTotp('JBSWY3DPEHPK3PXP',29_000);
 assert.match(result.code,/^\d{6}$/);
 assert.deepEqual({remaining:result.remaining,period:result.period},{remaining:1,period:30});
});
