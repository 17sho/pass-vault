import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Cloudflare-only release has no Linux files or broken documentation links', async () => {
  const packed = spawnSync(process.execPath, ['scripts/package-release.mjs'], {
    env: { ...process.env, RELEASE_VARIANTS: 'cloudflare' },
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);

  const destination = await mkdtemp(join(tmpdir(), 'pv-cloudflare-package-'));
  try {
    const archive = 'release/pass-vault-v2-cloudflare-1.1.66.tar.gz';
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', destination], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr || extracted.stdout);
    const root = join(destination, 'pass-vault-v2-cloudflare-1.1.66');
  const wrangler = JSON.parse(await readFile(join(root, 'apps/worker/wrangler.jsonc'), 'utf8'));
  assert.deepEqual(wrangler.triggers?.crons, ['17 * * * *']);
  assert.match(await readFile(join(root, 'apps/worker/migrations/0012_backup_import_locks.sql'), 'utf8'), /CREATE TABLE backup_import_locks/);
  assert.match(await readFile(join(root, 'apps/worker/migrations/0013_r2_inflight_uploads.sql'), 'utf8'), /CREATE TABLE r2_inflight_uploads/);
    const docs = spawnSync(process.execPath, ['scripts/check-docs.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(docs.status, 0, docs.stderr || docs.stdout);
    const members = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(members.status, 0, members.stderr || members.stdout);
    assert.doesNotMatch(members.stdout, /(?:^|\/)(?:apps\/server|docs\/server-deployment|scripts\/deploy-linux)/m);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
