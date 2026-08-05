import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Linux-only release has no Cloudflare files or broken documentation links', async () => {
  const packed = spawnSync(process.execPath, ['scripts/package-release.mjs'], {
    env: { ...process.env, RELEASE_VARIANTS: 'linux', RELEASE_SNAPSHOT: '1' },
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const destination = await mkdtemp(join(tmpdir(), 'pv-linux-package-'));
  try {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const archiveName = (await readdir('release')).find(name => name.startsWith(`pass-vault-v2-linux-${pkg.version}-snapshot-`) && name.endsWith('.tar.gz'));
    assert.ok(archiveName, 'snapshot archive missing');
    const archive = join('release', archiveName);
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', destination], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr || extracted.stdout);
    const root = join(destination, archiveName.slice(0, -'.tar.gz'.length));
    const docs = spawnSync(process.execPath, ['scripts/check-docs.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(docs.status, 0, docs.stderr || docs.stdout);
    const installed = spawnSync('npm', ['ci', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const integration = spawnSync(process.execPath, ['--test', 'tests/server.integration.test.js'], { cwd: root, encoding: 'utf8' });
    assert.equal(integration.status, 0, integration.stderr || integration.stdout);
    const members = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(members.status, 0, members.stderr || members.stdout);
    assert.doesNotMatch(members.stdout, /(?:^|\/)(?:apps\/worker|docs\/cloudflare-deployment|wrangler\.jsonc)/m);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});

test('Cloudflare-only release has no Linux files or broken documentation links', async () => {
  const packed = spawnSync(process.execPath, ['scripts/package-release.mjs'], {
    env: { ...process.env, RELEASE_VARIANTS: 'cloudflare', RELEASE_SNAPSHOT: '1' },
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);

  const destination = await mkdtemp(join(tmpdir(), 'pv-cloudflare-package-'));
  try {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const archiveName = (await readdir('release')).find(name => name.startsWith(`pass-vault-v2-cloudflare-${pkg.version}-snapshot-`) && name.endsWith('.tar.gz'));
    assert.ok(archiveName, 'snapshot archive missing');
    const archive = join('release', archiveName);
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', destination], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr || extracted.stdout);
    const root = join(destination, archiveName.slice(0, -'.tar.gz'.length));
  const wrangler = JSON.parse(await readFile(join(root, 'apps/worker/wrangler.jsonc'), 'utf8'));
  assert.deepEqual(wrangler.triggers?.crons, ['17 * * * *']);
  assert.match(await readFile(join(root, 'apps/worker/migrations/0012_backup_import_locks.sql'), 'utf8'), /CREATE TABLE backup_import_locks/);
  assert.match(await readFile(join(root, 'apps/worker/migrations/0013_r2_inflight_uploads.sql'), 'utf8'), /CREATE TABLE r2_inflight_uploads/);
    const docs = spawnSync(process.execPath, ['scripts/check-docs.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(docs.status, 0, docs.stderr || docs.stdout);
    const npmDocs = spawnSync('npm', ['run', 'lint:docs'], { cwd: root, encoding: 'utf8' });
    assert.equal(npmDocs.status, 0, npmDocs.stderr || npmDocs.stdout);
    const members = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(members.status, 0, members.stderr || members.stdout);
    assert.doesNotMatch(members.stdout, /(?:^|\/)(?:apps\/server|docs\/server-deployment|scripts\/deploy-linux)/m);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
