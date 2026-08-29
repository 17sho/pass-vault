#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const placeholder=/your-|your_|example\.com|placeholder|\[redacted\]|<your|todo/i;
const text=value=>typeof value==='string'?value:'';

export function validateWorkerDeployConfig(config,version){
 const missing=[];
 if(config?.name!=='pass-vault-v2')missing.push('Worker name');
 if(config?.workers_dev!==false)missing.push('workers_dev=false');
 if(config?.preview_urls!==false)missing.push('preview_urls=false');
 if(config?.observability?.logs?.enabled!==true)missing.push('observability logs enabled');
 if(!Array.isArray(config?.routes)||!config.routes.some(route=>route.pattern==='pass.23cm.me'&&route.custom_domain===true))missing.push('正式 custom domain');
 if(!config?.d1_databases?.some(item=>item.binding==='DB'&&item.database_name&&item.database_id))missing.push('D1 DB');
 if(!config?.r2_buckets?.some(item=>item.binding==='ATTACHMENTS'&&item.bucket_name))missing.push('R2 ATTACHMENTS');
 if(text(config?.vars?.APP_ORIGIN)!=='https://pass.23cm.me')missing.push('APP_ORIGIN');
 if(text(config?.vars?.APP_VERSION)!==version)missing.push(`APP_VERSION=${version}`);
 if(missing.length)throw new Error(`缺少或错误的生产配置: ${missing.join(', ')}`);
 const serialized=JSON.stringify(config),databaseId=text(config.d1_databases.find(item=>item.binding==='DB')?.database_id);
 if(placeholder.test(serialized)||/^(?:0{32}|0{8}-0{4}-0{4}-0{4}-0{12})$/.test(databaseId))throw new Error('检测到占位配置，拒绝部署');
 return true;
}

async function enforceQueryRedaction(config){
 const accountId=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 if(!accountId||!token)throw new Error('缺少 CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN，无法强制日志查询参数脱敏');
 const url=`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${config.name}/settings`,headers={Authorization:`Bearer ${token}`};
 const desired={observability:{enabled:true,head_sampling_rate:1,redact_query_string:true,logs:{enabled:true,head_sampling_rate:1,persist:true,invocation_logs:true}}};
 const form=new FormData();form.append('settings',new Blob([JSON.stringify(desired)],{type:'application/json'}),'settings.json');
 const patched=await (await fetch(url,{method:'PATCH',headers,body:form})).json();if(!patched.success)throw new Error(`日志查询参数脱敏设置失败: ${JSON.stringify(patched.errors||[])}`);
 const verified=await (await fetch(url,{headers})).json();if(!verified.success||verified.result?.observability?.redact_query_string!==true)throw new Error('日志查询参数脱敏回读失败');
}

async function run(){
 const requested=process.env.PASS_VAULT_WORKER_PROD_CONFIG||process.argv[2];
 if(!requested)throw new Error('缺少 PASS_VAULT_WORKER_PROD_CONFIG；请指向仓库外的私有生产 JSON 配置');
 const configPath=await realpath(resolve(requested)),rel=relative(repoRoot,configPath);
 if(!rel.startsWith('..')||rel==='..')throw new Error('生产配置必须位于仓库外');
 const config=JSON.parse(await readFile(configPath,'utf8')),pkg=JSON.parse(await readFile(resolve(repoRoot,'package.json'),'utf8'));
 validateWorkerDeployConfig(config,pkg.version);
 const args=['wrangler','deploy','--dry-run','--config',configPath,'--keep-vars'];
 const dry=spawnSync('npx',args,{stdio:'inherit',cwd:repoRoot});if(dry.status!==0)process.exit(dry.status??1);
 if(process.env.PASS_VAULT_DEPLOY_APPROVED!=='1')throw new Error('dry-run 已通过；正式部署需 PASS_VAULT_DEPLOY_APPROVED=1');
 for(const migrationArgs of [['d1','migrations','apply',config.d1_databases[0].database_name,'--remote','--config',configPath],['d1','migrations','list',config.d1_databases[0].database_name,'--remote','--config',configPath]]){const migration=spawnSync('npx',['wrangler',...migrationArgs],{stdio:'inherit',cwd:repoRoot});if(migration.status!==0)process.exit(migration.status??1)}
 const deploy=spawnSync('npx',['wrangler','deploy','--config',configPath,'--keep-vars'],{stdio:'inherit',cwd:repoRoot});if(deploy.status!==0)process.exit(deploy.status??1);
 await enforceQueryRedaction(config);
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)run().catch(error=>{console.error(error.message);process.exit(1)});
