import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('frontend preserves API creation metadata and formats every detail footer in Beijing time',async()=>{
  const source=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
  assert.match(source,/createdAt:e\.createdAt/);
  assert.match(source,/timeZone:'Asia\/Shanghai'/);
  assert.match(source,/function appendCreated\(/);
  assert.match(source,/appendCreated\(a,x\)/);
  assert.match(source,/showAttachmentDetail[\s\S]*appendCreated\(a,x\)/);
});