import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');

function extractFunction(name,nextMarker){
 const start=source.indexOf(`function ${name}(`);
 assert.notEqual(start,-1,`${name} must exist`);
 const end=source.indexOf(nextMarker,start+1);
 assert.notEqual(end,-1,`${nextMarker} must follow ${name}`);
 return source.slice(start,end);
}

test('编辑器关闭与隐私遮挡会清除敏感编辑基线',()=>{
 assert.match(source,/\$\$\('\[data-close\]'\)/);
 assert.match(source,/\$\('#editor'\)\.addEventListener\('close',\(\)=>\{editing=null;editorBaseline='';/);
 const privacy=extractFunction('clearPrivacySensitiveDom','function showPrivacyShield(');
 assert.match(privacy,/currentDetail=null;editing=null;editorBaseline='';/);
});

test('锁库同步重置恢复与标记注册表及编辑基线',()=>{
 const lock=extractFunction('lockVault','if(testHooks){');
 assert.match(lock,/recoveryRegistry=\{version:1,retentionDays:30,groupTombstones:\[\]\};recoveryRevision=null;/);
 assert.match(lock,/markerRegistry=\{version:1,items:\[\]\};markerRevision=null;markerMigrationNeeded=false;editorBaseline='';/);
});

test('生产前端不暴露敏感状态测试读写接口',()=>{
 assert.doesNotMatch(source,/__sensitiveResidueForTest|__setSensitiveResidueForTest/);
});
