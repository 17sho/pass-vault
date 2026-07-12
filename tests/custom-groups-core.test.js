import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GROUP_TYPES, SETTINGS_ID, normalizeGroupRegistry, validEnvelope, validatePlain, validateAttachmentMetadata, legacyVisibleEnvelopes } from '../shared/contract.mjs';
import { migrateEntriesForSettings } from '../apps/server/migrations.mjs';

const empty=()=>({account:[],website:[],note:[],attachment:[]});
test('group registry normalizes trimmed names and enforces exact bounded schema',()=>{
 const input=empty();input.account=[{id:'group_123',name:'  Work  '}];
 assert.deepEqual(normalizeGroupRegistry(input),{account:[{id:'group_123',name:'Work'}],website:[],note:[],attachment:[]});
 for(const bad of [
  {...empty(),extra:[]},
  {...empty(),account:[{id:'bad id',name:'Work'}]},
  {...empty(),account:[{id:'group_123',name:'\u200bWork'}]},
  {...empty(),account:[{id:'group_123',name:'x'.repeat(41)}]},
  {...empty(),account:[{id:'group_123',name:'Work',extra:true}]},
  {...empty(),account:[{id:'group_123',name:'Work'},{id:'group_123',name:'Other'}]},
  {...empty(),account:[{id:'group_123',name:'Work'},{id:'group_456',name:' Work '}]},
  {...empty(),account:Array.from({length:51},(_,i)=>({id:`group_${String(i).padStart(3,'0')}`,name:`G${i}`}))},
 ]) assert.equal(normalizeGroupRegistry(bad),null);
 assert.deepEqual(GROUP_TYPES,['account','website','note','attachment']);
 assert.match(SETTINGS_ID,/^[A-Za-z0-9_-]{8,80}$/);
 assert.deepEqual(normalizeGroupRegistry({...empty(),account:[{id:'group_123',name:'Work'},{id:'group_456',name:'work'}]}).account.map(x=>x.name),['Work','work']);
});

test('groupId is optional but strict in plaintext records and attachment metadata',()=>{
 const id='group_123';
 assert(validatePlain('account',{platform:'p',loginUrl:'',credentials:[{username:'u',password:'p'}],notes:'',tags:[],groupId:id}));
 assert(validatePlain('website',{name:'n',url:'',description:'',tags:[],groupId:id}));
 assert(validatePlain('note',{title:'n',body:'',tags:[],groupId:id}));
 assert(validateAttachmentMetadata({name:'a',mime:'',size:1,category:'other',contentIv:'AAAAAAAAAAAAAAAA',groupId:id}));
 for(const bad of ['', 'bad id', 'x'.repeat(81)]) assert.equal(validatePlain('note',{title:'n',body:'',tags:[],groupId:bad}),false);
});

test('settings envelope is accepted only at fixed id and old clients safely ignore it',()=>{
 const settings={id:SETTINGS_ID,type:'settings',version:1,iv:'iv',ciphertext:'cipher'};
 assert(validEnvelope(settings));
 assert.equal(validEnvelope({...settings,id:'other_123'}),false);
 const old=legacyVisibleEnvelopes([{id:'entry_123',type:'note'},settings]);
 assert.deepEqual(old,[{id:'entry_123',type:'note'}]);
});

test('D1 0004 upgrades populated entries preserving rows and accepting settings',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(await readFile(new URL('../apps/worker/migrations/0001.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run('user_123','u','h','s','{}','{}',1);
 db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?)').run('user_123','entry_123','note',1,'iv','cipher',2);
 db.exec(await readFile(new URL('../apps/worker/migrations/0004_settings.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare('SELECT ciphertext FROM entries WHERE id=?').get('entry_123').ciphertext,'cipher');
 db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?)').run('user_123',SETTINGS_ID,'settings',1,'iv','settings-cipher',3);
 assert.equal(db.prepare("SELECT count(*) n FROM entries WHERE type='settings'").get().n,1);db.close();
});

test('D1 0005 incrementally creates durable invite attempts without changing login attempts',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(await readFile(new URL('../apps/worker/migrations/0001.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO login_attempts VALUES(?,?)').run('existing-ip',123);
 db.exec(await readFile(new URL('../apps/worker/migrations/0005_invite_attempts.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO invite_attempts VALUES(?,?)').run('invite-ip',456);
 assert.equal(db.prepare('SELECT count(*) n FROM login_attempts').get().n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM invite_attempts').get().n,1);
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_invite_attempts_key_time'").get());
 db.close();
});

test('Linux startup migration upgrades populated legacy SQLite and is idempotent',()=>{
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE entries(user_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('account','website','note')),version INTEGER NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);INSERT INTO users VALUES('user_123');INSERT INTO entries VALUES('user_123','entry_123','note',1,'iv','cipher',1)");
 migrateEntriesForSettings(db);migrateEntriesForSettings(db);
 assert.equal(db.prepare('SELECT count(*) n FROM entries').get().n,1);
 db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?)').run('user_123',SETTINGS_ID,'settings',1,'iv','cipher',2);db.close();
});
