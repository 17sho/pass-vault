import test from 'node:test';
import assert from 'node:assert/strict';
import { body } from '../apps/worker/src/request-utils.ts';

function streamRequest(text){
  const bytes=new TextEncoder().encode(text);
  const stream=new ReadableStream({
    start(controller){
      for(let offset=0;offset<bytes.length;offset+=64*1024)controller.enqueue(bytes.slice(offset,offset+64*1024));
      controller.close();
    }
  });
  return new Request('https://vault.test/api/login',{method:'POST',body:stream,duplex:'half'});
}

test('通用 JSON 正文按网络字节限制而非 UTF-16 字符数',async()=>{
  const payload=JSON.stringify({value:'你'.repeat(700_000)});
  assert.ok(payload.length<2_000_000);
  assert.ok(new TextEncoder().encode(payload).byteLength>2_000_000);
  await assert.rejects(()=>body(streamRequest(payload)),RangeError);
});

test('通用 JSON 正文拒绝畸形 UTF-8 为客户端 JSON 错误',async()=>{
 const bytes=new Uint8Array([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x28,0x22,0x7d]);
 const req=new Request('https://vault.test/api',{method:'POST',body:bytes,duplex:'half'});
 await assert.rejects(body(req),SyntaxError);
});
