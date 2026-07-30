function fromBase64url(value){
 const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
 return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
}

function toBase64url(value){
 let binary='';
 for(const byte of new Uint8Array(value))binary+=String.fromCharCode(byte);
 return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

function creationOptions(value){
 if(globalThis.PublicKeyCredential?.parseCreationOptionsFromJSON)return PublicKeyCredential.parseCreationOptionsFromJSON(value);
 return {...value,challenge:fromBase64url(value.challenge),user:{...value.user,id:fromBase64url(value.user.id)},excludeCredentials:(value.excludeCredentials||[]).map(item=>({...item,id:fromBase64url(item.id)}))};
}

function requestOptions(value){
 if(globalThis.PublicKeyCredential?.parseRequestOptionsFromJSON)return PublicKeyCredential.parseRequestOptionsFromJSON(value);
 return {...value,challenge:fromBase64url(value.challenge),allowCredentials:(value.allowCredentials||[]).map(item=>({...item,id:fromBase64url(item.id)}))};
}

function credentialJson(credential){
 if(typeof credential?.toJSON==='function')return credential.toJSON();
 const response=credential.response,registration=response instanceof AuthenticatorAttestationResponse;
 return {id:credential.id,rawId:toBase64url(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults(),response:registration?{clientDataJSON:toBase64url(response.clientDataJSON),attestationObject:toBase64url(response.attestationObject),transports:response.getTransports?.()||[]}:{clientDataJSON:toBase64url(response.clientDataJSON),authenticatorData:toBase64url(response.authenticatorData),signature:toBase64url(response.signature),userHandle:response.userHandle?toBase64url(response.userHandle):undefined}};
}

export function passkeyApiSupported(){return Boolean(globalThis.PublicKeyCredential&&navigator.credentials?.create&&navigator.credentials?.get)}

export async function createPasskeyCredential(publicKey,signal){
 if(!passkeyApiSupported())throw new Error('当前浏览器不支持 Passkey');
 const credential=await navigator.credentials.create({publicKey:creationOptions(publicKey),signal});
 if(!credential)throw new Error('未创建 Passkey');
 return credentialJson(credential);
}

export async function getPasskeyCredential(publicKey,signal){
 if(!passkeyApiSupported())throw new Error('当前浏览器不支持 Passkey');
 const credential=await navigator.credentials.get({publicKey:requestOptions(publicKey),signal,mediation:'optional'});
 if(!credential)throw new Error('未选择 Passkey');
 return credentialJson(credential);
}

export function importServerVaultKey(value){
 const raw=fromBase64url(value);
 if(raw.length!==32)throw new Error('服务器返回的保险库密钥无效');
 return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},true,['encrypt','decrypt']);
}

export async function exportServerVaultKey(key){
 const raw=new Uint8Array(await crypto.subtle.exportKey('raw',key));
 if(raw.length!==32)throw new Error('保险库密钥无效');
 return toBase64url(raw);
}
