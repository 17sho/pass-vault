import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

export const TEST_INVITE_CODE = 'test-invite-code-1234567890';

export const withTestInviteEnv = (env = process.env) => ({
  ...env,
  INVITE_CODE: TEST_INVITE_CODE,
});

export async function fillTestInvite(page) {
  await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);
}

async function reservePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

export async function startTestServer({ dbPath, env = {}, hostname = '127.0.0.1' }) {
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') throw new Error('unsupported test server hostname');
  const port = await reservePort();
  const base = `http://${hostname}:${port}`;
  const nonce = randomBytes(24).toString('base64url');
  const resolvedEnv = Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value === '__DYNAMIC_ORIGIN__' ? base : value]));
  const child = spawn(process.execPath, ['apps/server/server.mjs'], {
    env: { ...withTestInviteEnv(), ...resolvedEnv, PORT: String(port), DB_PATH: dbPath, COOKIE_SECURE: 'false', TEST_SERVER_NONCE: nonce },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const deadline = Date.now() + 8000;
  while (Date.now() <= deadline) {
    if (child.exitCode !== null) {
      const result = await exited;
      throw new Error(`test server exited before ready (${result.code ?? result.signal}): ${stderr.trim()}`);
    }
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok && (await response.json()).testNonce === nonce) {
        return {
          base,
          child,
          async stop() {
            if (child.exitCode === null) child.kill('SIGTERM');
            const result = await exited;
            if (result.code !== 0 && result.signal !== 'SIGTERM') {
              throw new Error(`test server exited unexpectedly (${result.code ?? result.signal}): ${stderr.trim()}`);
            }
          },
        };
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  if (child.exitCode === null) child.kill('SIGTERM');
  await exited;
  throw new Error(`test server readiness timeout: ${stderr.trim()}`);
}
