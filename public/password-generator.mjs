export const PASSWORD_POOLS = Object.freeze({
  lower: 'abcdefghijkmnpqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digit: '23456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.?',
});

export function generatePassword(length, sets, getRandomValues = array => globalThis.crypto.getRandomValues(array)) {
  const active = Object.keys(PASSWORD_POOLS).filter(key => sets[key]);
  if (!active.length || length < 1) return '';
  const all = active.map(key => PASSWORD_POOLS[key]).join('');
  const output = [];
  const pick = pool => {
    const max = Math.floor(256 / pool.length) * pool.length;
    let byte;
    const buffer = new Uint8Array(1);
    do {
      getRandomValues(buffer);
      byte = buffer[0];
    } while (byte >= max);
    return pool[byte % pool.length];
  };
  for (const key of active) output.push(pick(PASSWORD_POOLS[key]));
  while (output.length < length) output.push(pick(all));
  for (let index = output.length - 1; index > 0; index -= 1) {
    const buffer = new Uint8Array(1);
    const max = Math.floor(256 / (index + 1)) * (index + 1);
    let random;
    do {
      getRandomValues(buffer);
      random = buffer[0];
    } while (random >= max);
    const target = random % (index + 1);
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output.join('');
}
