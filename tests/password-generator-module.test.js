import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_POOLS, generatePassword } from '../public/password-generator.mjs';

function bytes(values) {
  let index = 0;
  return array => {
    if (index >= values.length) throw new Error('random byte fixture exhausted');
    array[0] = values[index++];
    return array;
  };
}

test('密码生成器保留字符池、空选择和长度边界语义', () => {
  assert.deepEqual(PASSWORD_POOLS, {
    lower: 'abcdefghijkmnpqrstuvwxyz',
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    digit: '23456789',
    symbol: '!@#$%^&*()-_=+[]{};:,.?',
  });
  assert.equal(generatePassword(20, {}, bytes([])), '');
  assert.equal(generatePassword(0, { lower: true }, bytes([])), '');
});

test('密码生成器保证每个已选字符集至少一位且不修改选择对象', () => {
  const sets = { lower: true, upper: true, digit: true, symbol: true };
  const snapshot = structuredClone(sets);
  const password = generatePassword(8, sets, bytes([
    0, 0, 0, 0, // each active pool
    1, 2, 3, 4, // fill to requested length
    0, 0, 0, 0, 0, 0, 0, // deterministic shuffle
  ]));
  assert.equal(password.length, 8);
  for (const pool of Object.values(PASSWORD_POOLS)) {
    assert.equal([...password].some(character => pool.includes(character)), true, pool);
  }
  assert.deepEqual(sets, snapshot);
});

test('密码生成器对选取和洗牌都拒绝有偏随机字节', () => {
  const password = generatePassword(3, { symbol: true }, bytes([
    255, 0, // required symbol: 255 rejected, then first symbol
    255, 1, // fill: 255 rejected, then second symbol
    255, 2, // fill: 255 rejected, then third symbol
    255, 0, // three-way shuffle: 255 rejected, then zero
    255, // two-way shuffle accepts the complete 0..255 range
  ]));
  assert.equal(password, '#@!');
});
