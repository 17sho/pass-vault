import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWorkerDeployConfig } from '../scripts/deploy-worker.mjs';

const valid={name:'pass-vault-v2',workers_dev:false,preview_urls:false,routes:[{pattern:'pass.23cm.me',custom_domain:true}],d1_databases:[{binding:'DB',database_name:'prod-db',database_id:'11111111-1111-4111-8111-111111111111'}],r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'prod-bucket'}],vars:{APP_ORIGIN:'https://pass.23cm.me',APP_VERSION:'2.2.3'},observability:{redact_query_string:true,logs:{enabled:true}}};

test('主 Worker 生产部署守卫接受完整正式配置',()=>assert.equal(validateWorkerDeployConfig(valid,'2.2.3'),true));
test('主 Worker 生产部署守卫拒绝公开入口、Preview、错误 Origin、版本漂移及占位绑定',()=>{
 for(const mutate of [
  c=>c.workers_dev=true,c=>c.preview_urls=true,c=>c.vars.APP_ORIGIN='https://preview.invalid',c=>c.vars.APP_VERSION='2.2.2',c=>c.observability.logs.enabled=false,c=>c.d1_databases[0].database_id='00000000-0000-0000-0000-000000000000'
 ]){const config=structuredClone(valid);mutate(config);assert.throws(()=>validateWorkerDeployConfig(config,'2.2.3'))}
});

test('主 Worker 部署脚本在正式部署前应用并回读远端 D1 migrations',async()=>{const source=await readFile(new URL('../scripts/deploy-worker.mjs',import.meta.url),'utf8'),apply=source.indexOf("'d1','migrations','apply'"),list=source.indexOf("'d1','migrations','list'"),deploy=source.indexOf("'deploy','--config'");assert.ok(apply>=0);assert.ok(list>apply);assert.ok(deploy>list)});

test('主 Worker 部署脚本在 Wrangler 部署后通过 Settings API 强制并回读日志查询参数脱敏',async()=>{const source=await readFile(new URL('../scripts/deploy-worker.mjs',import.meta.url),'utf8');assert.match(source,/redact_query_string:true/);assert.match(source,/method:'PATCH'/);assert.match(source,/observability\?\.redact_query_string!==true/)});
