#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';

const [mode,target,prefix,config]=process.argv.slice(2);
if(!['sqlite','d1'].includes(mode)||!target||!/^e2e_v156_[a-z0-9_]{8,80}$/.test(prefix||''))throw Error('usage: cleanup-v156-smoke-users.mjs <sqlite DB_PATH|d1 BINDING> <e2e_v156_prefix> [wrangler-config]');
const like=`${prefix}%`;
const statements={counts:`SELECT (SELECT COUNT(*) FROM users WHERE username LIKE '${like}') users,(SELECT COUNT(*) FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${like}')) sessions,(SELECT COUNT(*) FROM entries WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${like}')) entries,(SELECT COUNT(*) FROM attachments WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${like}')) attachments;`,remove:`DELETE FROM users WHERE username LIKE '${like}';`};
function normalized(row){return Object.fromEntries(['users','sessions','entries','attachments'].map(key=>[key,Number(row?.[key]||0)]))}
let before,after;
if(mode==='sqlite'){
 const db=new DatabaseSync(target);db.exec('PRAGMA foreign_keys=ON');
 try{before=normalized(db.prepare(statements.counts).get());if(before.attachments)throw Error('cleanup_refused_attachments_present');db.exec('BEGIN IMMEDIATE');try{db.exec(statements.remove);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}after=normalized(db.prepare(statements.counts).get())}finally{db.close()}
}else{
 if(!config)throw Error('wrangler config is required for d1 cleanup');
 const execute=sql=>{const result=spawnSync('npx',['wrangler','d1','execute',target,'--remote','--config',config,'--command',sql,'--json'],{encoding:'utf8'});if(result.status!==0)throw Error(`wrangler_failed_${result.status}`);const json=JSON.parse(result.stdout),rows=(Array.isArray(json)?json[0]:json)?.results||[];return rows[0]};
 before=normalized(execute(statements.counts));if(before.attachments)throw Error('cleanup_refused_attachments_present');execute(statements.remove);after=normalized(execute(statements.counts));
}
if(Object.values(after).some(Boolean))throw Error('cleanup_verification_failed');
console.log(JSON.stringify({backend:mode,status:'PASS',before,after}));
