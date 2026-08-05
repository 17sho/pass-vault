import { normalizePlain, validatePlain } from '../shared/contract.mjs';

const FORMAT='pass-vault-v2-plaintext-migration';
const ID=/^[a-zA-Z0-9_-]{8,80}$/;

export function normalizeMigration(doc){
  if(!doc||doc.format!==FORMAT||doc.version!==1||!Array.isArray(doc.items)||doc.items.length>10000) throw Error('invalid migration file');
  return doc.items.map(item=>{
    if(!item||!ID.test(item.id)||!validatePlain(item.type,item.data)) throw Error('invalid migration item');
    return {id:item.id,type:item.type,data:normalizePlain(item.type,item.data)};
  });
}

export async function prepareMigration(doc,vaultKey,encrypt){
  const items=normalizeMigration(doc),prepared=[];
  for(const item of items){
    const envelope=await encrypt(vaultKey,item.data);
    prepared.push({id:item.id,type:item.type,version:1,...envelope});
  }
  return prepared;
}

export async function importMigration(doc,vaultKey,encrypt,upload){
  const prepared=await prepareMigration(doc,vaultKey,encrypt);
  for(const item of prepared)await upload(item);
  return {imported:prepared.length};
}
