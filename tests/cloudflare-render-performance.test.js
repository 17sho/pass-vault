import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('列表动画索引使用map参数而非线性查找', async () => {
  const source = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /shown\.map\(\(x,index\)=>/);
  assert.doesNotMatch(source, /shown\.indexOf\(x\)/);
});
