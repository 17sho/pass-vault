import { chmod, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const [base,version,evidencePath]=process.argv.slice(2);
if(!/^https:\/\//.test(base||'')||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version||'')||!evidencePath)throw Error('usage: node scripts/verify-production-cache.mjs https://<host> <version> <evidence.json>');
const expected=`app.mjs?v=${version}`,result={at:new Date().toISOString(),version,backend:'unknown',sourceVersion:false,revalidated:false,fixedVersion:false,status:'FAIL'};
const save=async()=>{await writeFile(evidencePath,JSON.stringify(result,null,2)+'\n',{mode:0o600});await chmod(evidencePath,0o600)};
try{
 const health=await fetch(new URL('/api/health',base),{headers:{'cache-control':'no-cache'}});if(!health.ok)throw Error(`health_${health.status}`);const shape=await health.json();if(!['sqlite','d1'].includes(shape.backend))throw Error('invalid_backend');result.backend=shape.backend;
 const nonce=randomBytes(8).toString('hex'),source=await fetch(new URL(`/?deploy_check=${nonce}`,base),{headers:{'cache-control':'no-cache','pragma':'no-cache'}});result.sourceVersion=source.ok&&(await source.text()).includes(expected);if(!result.sourceVersion)throw Error('source_version_mismatch');
 const forced=await fetch(new URL('/',base),{headers:{'cache-control':'no-cache','pragma':'no-cache'}});result.revalidated=forced.ok&&(await forced.text()).includes(expected);if(!result.revalidated)throw Error('revalidation_failed');
 const fixed=await fetch(new URL('/',base));result.fixedVersion=fixed.ok&&(await fixed.text()).includes(expected);if(!result.fixedVersion)throw Error('fixed_url_stale');result.status='PASS';await save();console.log(JSON.stringify(result));
}catch(error){result.error=String(error?.message||error).replace(/https?:\/\/\S+/g,'[URL]');await save();throw error}
