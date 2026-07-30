import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const out = join(root, 'release');
const epoch = Number(process.env.SOURCE_DATE_EPOCH || 1783728000); // 2026-07-11 UTC
const common = ['package-lock.json','LICENSE','README.md','README.en.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md',`release-notes-v${pkg.version}.md`,'public','shared','scripts/build.mjs','scripts/check.mjs','scripts/check-docs.mjs','docs/API.md','docs/RELEASE.md','docs/DEPLOYMENT.md','docs/deployment.zh-CN.md','docs/deployment.en.md'];
const variants = {
  cloudflare: ['apps/worker/src','apps/worker/migrations','apps/worker/tsconfig.json','tests/attachment.test.js','tests/contract.test.js','tests/session-metadata.test.js','tests/worker.test.js','docs/cloudflare-deployment.zh-CN.md','docs/cloudflare-deployment.en.md'],
  linux: ['apps/server','deploy/pass-vault-v2.service','deploy/Caddyfile','deploy/nginx.conf','scripts/deploy-linux-atomic.sh','tests/attachment.test.js','tests/contract.test.js','tests/session-metadata.test.js','tests/server.integration.test.js','docs/server-deployment.zh-CN.md','docs/server-deployment.en.md'],
};
const requestedVariants = (process.env.RELEASE_VARIANTS || Object.keys(variants).join(','))
  .split(',').map(value => value.trim()).filter(Boolean);
if (!requestedVariants.length || requestedVariants.some(variant => !variants[variant])) {
  throw new Error(`invalid RELEASE_VARIANTS: ${process.env.RELEASE_VARIANTS || ''}`);
}

function run(command, args, cwd=root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
async function copy(relative, stage) {
  await cp(join(root, relative), join(stage, relative), { recursive: true, preserveTimestamps: false });
}
async function hash(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
async function rewriteCloudflareOnlyLinks(stage) {
  const releaseBase = 'https://github.com/17sho/pass-vault-v2/blob/v1.1.65';
  const files = ['README.md', 'README.en.md', 'docs/DEPLOYMENT.md', 'docs/deployment.zh-CN.md', 'docs/deployment.en.md'];
  for (const file of files) {
    const path = join(stage, file);
    const prefix = file.startsWith('docs/') ? '' : 'docs/';
    let text = await readFile(path, 'utf8');
    text = text
      .replaceAll(`${prefix}server-deployment.zh-CN.md`, `${releaseBase}/docs/server-deployment.zh-CN.md`)
      .replaceAll(`${prefix}server-deployment.en.md`, `${releaseBase}/docs/server-deployment.en.md`);
    await writeFile(path, text);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const archives = [];
for (const variant of requestedVariants) {
  const extra = variants[variant];
  const name = `${pkg.name}-${variant}-${pkg.version}`;
  const stage = join(out, '.stage', name);
  await mkdir(stage, { recursive: true });
  for (const path of [...common, ...extra]) await copy(path, stage);
  const releasePackage = {
    ...pkg,
    private: true,
    scripts: variant === 'cloudflare' ? {
      test: 'node scripts/build.mjs && node --experimental-strip-types --test --test-concurrency=1 tests/*.test.js',
      lint: 'node scripts/check.mjs',
      typecheck: 'tsc --noEmit -p apps/worker/tsconfig.json',
      build: 'node scripts/build.mjs'
    } : {
      test: 'node scripts/build.mjs && node --experimental-strip-types --test --test-concurrency=1 tests/*.test.js',
      lint: 'node scripts/check.mjs',
      typecheck: 'node --check apps/server/server.mjs',
      build: 'node scripts/build.mjs',
      start: 'node apps/server/server.mjs'
    }
  };
  await writeFile(join(stage, 'package.json'), JSON.stringify(releasePackage, null, 2) + '\n');
  if (variant === 'cloudflare') {
    await rewriteCloudflareOnlyLinks(stage);
    await writeFile(join(stage, 'apps/worker/wrangler.jsonc'), JSON.stringify({
      name: 'pass-vault-v2', workers_dev: true, main: 'src/index.ts',
      compatibility_date: '2026-07-11', compatibility_flags: ['nodejs_compat'],
      d1_databases: [{ binding: 'DB', database_name: 'your-d1-database-name', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: 'migrations' }],
      r2_buckets: [{ binding: 'ATTACHMENTS', bucket_name: 'your-r2-attachments-bucket' }],
      assets: { directory: '../../dist', binding: 'ASSETS', run_worker_first: true },
      observability: { enabled: true, head_sampling_rate: 1 }
    }, null, 2) + '\n');
  }
  const tarPath = join(out, `${name}.tar.gz`);
  run('tar', ['--sort=name', `--mtime=@${epoch}`, '--owner=0', '--group=0', '--numeric-owner', '-czf', tarPath, '-C', join(out,'.stage'), name]);
  const zipPath = join(out, `${name}.zip`);
  const py = `import os,sys,zipfile,time\nroot,name,out,epoch=sys.argv[1:]\ndt=time.gmtime(int(epoch))[:6]\nwith zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for base,dirs,files in os.walk(os.path.join(root,name)):\n  dirs.sort(); files.sort()\n  for f in files:\n   p=os.path.join(base,f); arc=os.path.relpath(p,root); i=zipfile.ZipInfo(arc,dt); i.compress_type=zipfile.ZIP_DEFLATED; i.external_attr=0o100644<<16; z.writestr(i,open(p,'rb').read())\n`;
  run('python3', ['-c', py, join(out,'.stage'), name, zipPath, String(epoch)]);
  archives.push(tarPath, zipPath);
}
await writeFile(join(out, 'SHA256SUMS'), (await Promise.all(archives.sort().map(async p => `${await hash(p)}  ${basename(p)}`))).join('\n')+'\n');
await rm(join(out,'.stage'), { recursive: true, force: true });
console.log(`Release archives written to ${out}`);
for (const f of await readdir(out)) console.log(f);
