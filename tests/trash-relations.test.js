import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyTrashParents, trashParentNote, linkedTrashAttachments } from '../public/trash-relations.mjs';

const note=(id,attachmentIds)=>({id,type:'note',deletedAt:100,attachmentIds});
const file=(id,trashOwnerId)=>({id,type:'attachment',deletedAt:100,...(trashOwnerId?{trashOwnerId}:{})});

test('旧附件无 trashOwnerId 且仅有一个已删除父笔记时安全恢复父子关系',()=>{const n=note('note-a',['file-a']),f=file('file-a'),items=[n];assert.deepEqual(legacyTrashParents(f,items),[n]);assert.equal(trashParentNote(f,items),n);assert.deepEqual(linkedTrashAttachments(n,[f],items),[f])});

test('旧附件被多个已删除笔记引用时保持独立，避免误恢复或误删',()=>{const a=note('note-a',['file-a']),b=note('note-b',['file-a']),f=file('file-a'),items=[a,b];assert.equal(trashParentNote(f,items),undefined);assert.deepEqual(linkedTrashAttachments(a,[f],items),[]);assert.deepEqual(linkedTrashAttachments(b,[f],items),[])});

test('新附件显式 trashOwnerId 优先于旧引用推断',()=>{const a=note('note-a',['file-a']),b=note('note-b',['file-a']),f=file('file-a','note-b'),items=[a,b];assert.equal(trashParentNote(f,items),b);assert.deepEqual(linkedTrashAttachments(a,[f],items),[]);assert.deepEqual(linkedTrashAttachments(b,[f],items),[f])});
