import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

for (const entry of ['public/app.mjs', 'public/dialog-ui.mjs', 'public/password-generator.mjs']) {
  execFileSync(process.execPath, ['--check', entry], { stdio: 'pipe' });
}

const worktreeDirty = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' }).stdout.trim().length > 0;

async function assertDirtyPackagingRejected(variant) {
  const packed = spawnSync(process.execPath, ['scripts/package-release.mjs'], { env: { ...process.env, RELEASE_VARIANTS: variant, RELEASE_SNAPSHOT: '1' }, encoding: 'utf8' });
  assert.notEqual(packed.status, 0);
  assert.match(packed.stderr || packed.stdout, /dirty or untracked worktree/);
}

test('发行脚本仅复制Git跟踪文件并拒绝ignored秘密进入递归目录',async()=>{const source=await readFile(new URL('../scripts/package-release.mjs',import.meta.url),'utf8');assert.match(source,/git', \['ls-files', '-z'/);assert.doesNotMatch(source,/recursive: true, preserveTimestamps/)});

test('发行脚本拒绝从dirty或untracked工作树制作误标HEAD的快照',async()=>{const source=await readFile(new URL('../scripts/package-release.mjs',import.meta.url),'utf8');assert.match(source,/git', \['status', '--porcelain=v1', '--untracked-files=all'\]/);assert.match(source,/refusing to package a dirty or untracked worktree/)});

test('发行脚本默认只生成Cloudflare制品，Linux必须显式选择',async()=>{const source=await readFile(new URL('../scripts/package-release.mjs',import.meta.url),'utf8');assert.match(source,/process\.env\.RELEASE_VARIANTS \|\| 'cloudflare'/);assert.doesNotMatch(source,/process\.env\.RELEASE_VARIANTS \|\| Object\.keys\(variants\)/)});

test('Linux-only release has no Cloudflare files or broken documentation links', async (t) => {
  if (worktreeDirty) { await assertDirtyPackagingRejected('linux'); t.skip('clean-worktree archive checks run after reviewed commit'); return; }
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
    for (const requiredPath of [
      'apps/admin-server/server.mjs',
      'deploy/pass-vault-admin.service',
      'deploy/Caddyfile.admin',
      'tests/admin-server.integration.test.js',
      'tests/linux-file-lifecycle.test.js',
      'tests/deployment.test.js',
      'docs/releases/release-notes-v2.2.3-server.1.md',
      'AGENTS.md',
    ]) await readFile(join(root, requiredPath), 'utf8');
    const adminIntegration = spawnSync(process.execPath, ['--test', 'tests/admin-server.integration.test.js'], { cwd: root, encoding: 'utf8' });
    assert.equal(adminIntegration.status, 0, adminIntegration.stderr || adminIntegration.stdout);
    const members = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(members.status, 0, members.stderr || members.stdout);
    assert.doesNotMatch(members.stdout, /(?:^|\/)(?:apps\/worker|docs\/cloudflare-deployment|wrangler\.jsonc)/m);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});

test('Cloudflare-only release has no Linux files or broken documentation links', async (t) => {
  if (worktreeDirty) { await assertDirtyPackagingRejected('cloudflare'); t.skip('clean-worktree archive checks run after reviewed commit'); return; }
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
  assert.equal(wrangler.vars?.APP_VERSION, pkg.version);
  assert.match(await readFile(join(root, 'apps/worker/migrations/0012_backup_import_locks.sql'), 'utf8'), /CREATE TABLE backup_import_locks/);
  assert.match(await readFile(join(root, 'apps/worker/migrations/0013_r2_inflight_uploads.sql'), 'utf8'), /CREATE TABLE r2_inflight_uploads/);
  assert.match(await readFile(join(root, 'apps/worker/migrations/0034_admin_control_center.sql'), 'utf8'), /CREATE TABLE admin_notifications/);
  assert.match(await readFile(join(root, 'scripts/deploy-admin.mjs'), 'utf8'), /validateAdminDeployConfig/);
  assert.match(await readFile(join(root, 'tests/fixtures.mjs'), 'utf8'), /export/);
  for (const testPath of [
    'tests/admin-module-boundaries.test.js',
    'tests/cloudflare-core-module-boundaries.test.js',
    'tests/cloudflare-frontend-dead-code.test.js',
    'tests/cloudflare-render-performance.test.js',
    'tests/cloudflare-safe-utils-boundaries.test.js',
    'tests/dialog-ui-module.test.js',
    'tests/password-generator-module.test.js',
    'tests/production-assets.test.js',
  ]) await readFile(join(root, testPath), 'utf8');
  const workerLoad = spawnSync(process.execPath, ['--test', '--test-name-pattern=^$', 'tests/worker.test.js'], { cwd: root, encoding: 'utf8' });
  assert.equal(workerLoad.status, 0, workerLoad.stderr || workerLoad.stdout);
    const docs = spawnSync(process.execPath, ['scripts/check-docs.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(docs.status, 0, docs.stderr || docs.stdout);
    const npmDocs = spawnSync('npm', ['run', 'lint:docs'], { cwd: root, encoding: 'utf8' });
    assert.equal(npmDocs.status, 0, npmDocs.stderr || npmDocs.stdout);
    const members = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(members.status, 0, members.stderr || members.stdout);
  assert.match(members.stdout, /apps\/admin-worker\/src\/index\.ts/);
  for (const modulePath of [
    'apps/worker/src/request-utils.ts',
    'public/pinned-order.mjs',
    'public/dialog-ui.mjs',
    'public/password-generator.mjs',
    'apps/admin-worker/src/access-auth.ts',
    'apps/admin-worker/src/runtime.ts',
    'apps/admin-worker/src/ui/page.ts',
    'apps/admin-worker/src/ui/style.ts',
    'apps/admin-worker/src/ui/script.ts',
  ]) {
    assert.match(members.stdout, new RegExp(modulePath.replaceAll('/', '\\/').replace('.', '\\.')));
    await readFile(join(root, modulePath), 'utf8');
  }
  assert.match(members.stdout, /apps\/admin-worker\/wrangler\.jsonc/);
  const adminWrangler = JSON.parse(await readFile(join(root, 'apps/admin-worker/wrangler.jsonc'), 'utf8'));
  assert.equal(adminWrangler.workers_dev, false);
  assert.equal(adminWrangler.vars?.MAIN_SITE_URL, 'https://pass.example.com');
  assert.equal(adminWrangler.vars?.ACCESS_ISSUER, 'https://example.cloudflareaccess.com');
  assert.equal(adminWrangler.vars?.ACCESS_AUD, 'YOUR_ACCESS_APPLICATION_AUD');
  assert.equal(adminWrangler.version_metadata?.binding, 'CF_VERSION_METADATA');
  assert.equal(adminWrangler.routes?.[0]?.pattern, 'admin.example.com');
  assert.equal('APP_VERSION' in adminWrangler.vars, false);
  assert.equal('R2_LIMIT_BYTES' in adminWrangler.vars, false);
  assert.equal('D1_LIMIT_BYTES' in adminWrangler.vars, false);
  assert.equal(adminWrangler.d1_databases[0].database_name, 'your-d1-database-name');
  assert.equal(adminWrangler.r2_buckets[0].bucket_name, 'your-r2-attachments-bucket');
  assert.match(adminWrangler.d1_databases[0].database_id, /^0{8}-0{4}-0{4}-0{4}-0{12}$/);
  assert.equal(JSON.stringify(adminWrangler).includes('@gmail.com'), false);
  assert.doesNotMatch(members.stdout, /(?:^|\/)(?:apps\/server|docs\/server-deployment|scripts\/deploy-linux)/m);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
