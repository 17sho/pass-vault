import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText, rankSearchResults, searchableFields } from '../public/fuzzy-search.mjs';

const account=(id,platform,extra={})=>({id,type:'account',platform,loginUrl:'',username:'',password:'',notes:'',tags:[],...extra});
const website=(id,name,extra={})=>({id,type:'website',name,url:'',description:'',tags:[],...extra});
const note=(id,title,extra={})=>({id,type:'note',title,body:'',tags:[],attachmentIds:[],...extra});

test('normalizes case, whitespace, and punctuation without losing Chinese text',()=>{
 assert.equal(normalizeSearchText('  Cloud-Flare.COM  '),'cloudflarecom');
 assert.equal(normalizeSearchText('云 端，密码库'),'云端密码库');
});

test('ranks exact then prefix then substring matches deterministically',()=>{
 const items=[website('c','My Cloudflare Portal'),website('a','Cloudflare'),website('b','Cloudflare Docs')];
 assert.deepEqual(rankSearchResults(items,'cloudflare',searchableFields.website).map(x=>x.id),['a','b','c']);
});

test('supports Chinese partial text and Latin typo, transposition, and subsequence matching',()=>{
 const items=[website('exact','Cloudflare'),website('cn','阿里云控制台'),website('typo','Cloudflare Dashboard'),website('subseq','Cloud Infrastructure')];
 assert.deepEqual(rankSearchResults(items,'里云',searchableFields.website).map(x=>x.id),['cn']);
 assert.deepEqual(rankSearchResults(items,'cloudfare',searchableFields.website).map(x=>x.id),['exact','typo']);
 assert.ok(rankSearchResults(items,'cldinfra',searchableFields.website).some(x=>x.id==='subseq'));
});

test('uses only visible fields for each category and never leaks across categories',()=>{
 const items=[
  account('account','Mail',{password:'cloudflare-secret'}),
  website('website','Docs',{description:'cloudflare'}),
  note('note','Ideas',{body:'cloudflare'}),
 ];
 assert.deepEqual(rankSearchResults(items.filter(x=>x.type==='account'),'cloudflare',searchableFields.account),[]);
 assert.deepEqual(rankSearchResults(items.filter(x=>x.type==='website'),'cloudflare',searchableFields.website).map(x=>x.id),['website']);
 assert.deepEqual(rankSearchResults(items.filter(x=>x.type==='note'),'cloudflare',searchableFields.note).map(x=>x.id),['note']);
});

test('custom search indexes non-sensitive fields but never secret labels or values',()=>{
 const rows=[{id:'custom',type:'custom',title:'香港服务器',template:'服务器',notes:'生产环境',tags:['cloudflare'],fields:[{label:'IP地址',type:'text',value:'192.0.2.10'},{label:'密码',type:'secret',value:'never-search-secret'}]}];
 assert.deepEqual(rankSearchResults(rows,'192.0.2.10',searchableFields.custom).map(x=>x.id),['custom']);
 assert.deepEqual(rankSearchResults(rows,'never-search-secret',searchableFields.custom),[]);
 assert.deepEqual(rankSearchResults(rows,'密码',searchableFields.custom),[]);
});

test('attachment search is limited to visible metadata and rejects irrelevant fuzzy matches',()=>{
 const files=[
  {id:'a',type:'attachment',name:'cloudflare-report.pdf',mime:'application/pdf',category:'other',size:42,contentIv:'secret'},
  {id:'b',type:'attachment',name:'holiday.jpg',mime:'image/jpeg',category:'image',size:99,noteId:'cloudflare'},
 ];
 assert.deepEqual(rankSearchResults(files,'cloudfare',searchableFields.attachment).map(x=>x.id),['a']);
 assert.deepEqual(rankSearchResults(files,'cloudflare',searchableFields.attachment).map(x=>x.id),['a']);
 assert.deepEqual(rankSearchResults(files,'totally unrelated',searchableFields.attachment),[]);
});
