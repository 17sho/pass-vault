import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');

test('主前端不保留未调用的旧 Eye/EyeOff SVG 工厂', () => {
  assert.doesNotMatch(source, /function\s+visibilityIcon\s*\(/);
  assert.doesNotMatch(source, /\bvisibilityIcon\s*\(/);
});
