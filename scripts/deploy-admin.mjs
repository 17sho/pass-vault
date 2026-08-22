#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const placeholderTokens = ['your-', 'your_', 'YOUR_', 'example.com', 'pass.example', 'admin@example'];
const text = value => typeof value === 'string' ? value : '';

export function validateAdminDeployConfig(config) {
  const missing = [];
  if (config?.name !== 'pass-vault-admin') missing.push('Worker name');
  const hasRoute = (Array.isArray(config?.routes) && config.routes.length > 0) || text(config?.route).trim().length > 0;
  if (config?.workers_dev !== false && !hasRoute) missing.push('route/routes 或 workers_dev=false');
  if (!Array.isArray(config?.d1_databases) || !config.d1_databases.some(x => x.binding === 'DB' && x.database_name && x.database_id)) missing.push('D1 DB');
  if (!Array.isArray(config?.r2_buckets) || !config.r2_buckets.some(x => x.binding === 'ATTACHMENTS' && x.bucket_name)) missing.push('R2 ATTACHMENTS');
  for (const key of ['ADMIN_EMAILS', 'MAIN_SITE_URL', 'ACCESS_ISSUER', 'ACCESS_AUD']) if (!text(config?.vars?.[key]).trim()) missing.push(key);
  if (missing.length) throw new Error(`缺少生产配置: ${missing.join(', ')}`);
  const serialized = JSON.stringify(config).toLowerCase();
  const databaseId = text(config.d1_databases.find(x => x.binding === 'DB')?.database_id).toLowerCase();
  const genericPlaceholders = ['placeholder', '[redacted]', '<your', 'todo'];
  if (placeholderTokens.some(token => serialized.includes(token.toLowerCase())) || genericPlaceholders.some(token => serialized.includes(token)) || /^(?:0{32}|0{8}-0{4}-0{4}-0{4}-0{12})$/.test(databaseId)) throw new Error('检测到占位配置，拒绝部署');
  if (config.workers_dev !== false && !hasRoute) throw new Error('生产 Admin 必须关闭 workers_dev 或显式配置 route');
  return true;
}

async function run() {
  const requestedPath = process.env.PASS_VAULT_ADMIN_PROD_CONFIG || process.argv[2];
  if (!requestedPath) throw new Error('缺少 PASS_VAULT_ADMIN_PROD_CONFIG；请指向仓库外的私有生产 JSON 配置');
  const configPath = await realpath(resolve(requestedPath));
  const rel = relative(repoRoot, configPath);
  if (!rel.startsWith('..') || rel === '..') throw new Error('生产配置必须位于仓库外');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  validateAdminDeployConfig(config);
  const dry = spawnSync('npx', ['wrangler', 'deploy', '--dry-run', '--config', configPath, '--keep-vars'], { stdio: 'inherit' });
  if (dry.status !== 0) process.exit(dry.status ?? 1);
  const deploy = spawnSync('npx', ['wrangler', 'deploy', '--config', configPath, '--keep-vars'], { stdio: 'inherit' });
  process.exit(deploy.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) run().catch(error => { console.error(error.message); process.exit(1); });
