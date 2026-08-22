import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdminDeployConfig } from '../scripts/deploy-admin.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const valid={name:'pass-vault-admin',main:'src/index.ts',workers_dev:false,routes:[{pattern:'admin.valid.invalid',custom_domain:true}],d1_databases:[{binding:'DB',database_name:'prod-db',database_id:'00000000-0000-4000-8000-000000000001'}],r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'prod-attachments'}],vars:{ADMIN_EMAILS:'admin@valid.invalid',MAIN_SITE_URL:'https://pass.valid.invalid',ACCESS_ISSUER:'https://team.cloudflareaccess.com',ACCESS_AUD:'audience-value'}};

test('Admin 生产部署拦截示例占位配置',()=>{for(const config of [
 {...valid,routes:[{pattern:'admin.example.com',custom_domain:true}]},
 {...valid,d1_databases:[{binding:'DB',database_name:'your-d1-database-name',database_id:'00000000-0000-4000-8000-000000000001'}]},
 {...valid,r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'your-r2-attachments-bucket'}]},
 {...valid,vars:{...valid.vars,ACCESS_AUD:'YOUR_ACCESS_APPLICATION_AUD'}},
])assert.throws(()=>validateAdminDeployConfig(config),/占位|placeholder/i)});

test('Admin 生产部署拒绝大小写变体、全零ID与通用占位词',()=>{for(const config of [
 {...valid,routes:[{pattern:'admin.EXAMPLE.COM',custom_domain:true}]},
 {...valid,d1_databases:[{binding:'DB',database_name:'YOUR-D1-DATABASE-NAME',database_id:'00000000-0000-0000-0000-000000000000'}]},
 {...valid,r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'YOUR-R2-ATTACHMENTS-BUCKET'}]},
 {...valid,vars:{...valid.vars,ADMIN_EMAILS:'ADMIN@EXAMPLE.COM'}},
 {...valid,vars:{...valid.vars,ACCESS_AUD:'PLACEHOLDER'}},
])assert.throws(()=>validateAdminDeployConfig(config),/占位|placeholder/i)});

test('Admin 生产部署要求完整且安全的生产绑定',()=>{assert.doesNotThrow(()=>validateAdminDeployConfig(valid));for(const key of ['d1_databases','r2_buckets']){const config={...valid};delete config[key];assert.throws(()=>validateAdminDeployConfig(config),/缺少|missing/i)}});

test('Admin 生产部署拒绝仓库内配置路径',async()=>{const path=new URL('../.admin-prod-test.json',import.meta.url);await writeFile(path,JSON.stringify(valid));try{const run=spawnSync(process.execPath,['scripts/deploy-admin.mjs',path.pathname],{encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/仓库外/)}finally{await rm(path,{force:true})}});

test('Admin 生产部署先 dry-run 且两次都保留 vars',async()=>{const dir=await mkdtemp(join(tmpdir(),'admin-deploy-')),config=join(dir,'prod.json'),bin=join(dir,'bin'),log=join(dir,'calls.log');await writeFile(config,JSON.stringify(valid));await import('node:fs/promises').then(x=>x.mkdir(bin));await writeFile(join(bin,'npx'),`#!/bin/sh\nprintf '%s\\n' "$*" >> "$DEPLOY_CALL_LOG"\nexit 0\n`,{mode:0o755});try{const run=spawnSync(process.execPath,['scripts/deploy-admin.mjs',config],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,DEPLOY_CALL_LOG:log}});assert.equal(run.status,0,run.stderr);const calls=(await import('node:fs/promises').then(x=>x.readFile(log,'utf8'))).trim().split('\n');assert.equal(calls.length,2);assert.match(calls[0],/deploy --dry-run .*--keep-vars/);assert.match(calls[1],/deploy .*--keep-vars/)}finally{await rm(dir,{recursive:true,force:true})}});
