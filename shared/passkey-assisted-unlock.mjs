import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse } from '@simplewebauthn/server';

const encoder=new TextEncoder();
const WRAP_VERSION='passkey-assisted-v1';
const CREDENTIAL_ID=/^[A-Za-z0-9_-]{8,1024}$/;

export function encodeBase64url(value){
 let binary='';
 for(const byte of value)binary+=String.fromCharCode(byte);
 return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

export function decodeBase64url(value){
 if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))return null;
 try{
  const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
  const bytes=Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
  return encodeBase64url(bytes)===value?bytes:null;
 }catch{return null}
}

function validUserId(value){return typeof value==='string'&&value.length>=1&&value.length<=128}

export function parsePasskeyUnlockKek(value){
 const bytes=decodeBase64url(value);
 return bytes?.length===32?bytes:null;
}

export function validatePasskeyCredentialId(value){return typeof value==='string'&&CREDENTIAL_ID.test(value)}

async function importAesKey(raw,usage){
 if(!(raw instanceof Uint8Array)||raw.length!==32)throw new TypeError('invalid_kek');
 return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,[usage]);
}

function wrapAad(userId){
 if(!validUserId(userId))throw new TypeError('invalid_user');
 return encoder.encode(`${WRAP_VERSION}\0${userId}`);
}

export async function sealVaultKeyForServer(vaultKey,kek,userId){
 if(!(vaultKey instanceof Uint8Array)||vaultKey.length!==32)throw new TypeError('invalid_vault_key');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:wrapAad(userId),tagLength:128},await importAesKey(kek,'encrypt'),vaultKey);
 return `${WRAP_VERSION}.${encodeBase64url(iv)}.${encodeBase64url(new Uint8Array(ciphertext))}`;
}

export async function openVaultKeyFromServer(wrapped,kek,userId){
 if(typeof wrapped!=='string')throw new TypeError('invalid_wrapped_key');
 const [version,ivValue,ciphertextValue,...extra]=wrapped.split('.'),iv=decodeBase64url(ivValue),ciphertext=decodeBase64url(ciphertextValue);
 if(version!==WRAP_VERSION||extra.length||iv?.length!==12||!ciphertext||ciphertext.length!==48)throw new TypeError('invalid_wrapped_key');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:wrapAad(userId),tagLength:128},await importAesKey(kek,'decrypt'),ciphertext);
 const vaultKey=new Uint8Array(plain);
 if(vaultKey.length!==32)throw new TypeError('invalid_vault_key');
 return vaultKey;
}

export async function passkeyRegistrationOptions({rpID,username,userId,exclude=[]}){
 if(typeof rpID!=='string'||!rpID||typeof username!=='string'||!username||!validUserId(userId))throw new TypeError('invalid_registration_context');
 return generateRegistrationOptions({
  rpName:'Pass Vault',
  rpID,
  userName:username,
  userDisplayName:username,
  userID:encoder.encode(userId),
  timeout:60000,
  attestationType:'none',
  excludeCredentials:exclude.filter(value=>validatePasskeyCredentialId(value?.id)).map(value=>({id:value.id,...(Array.isArray(value.transports)?{transports:value.transports}:{})})),
  authenticatorSelection:{residentKey:'required',userVerification:'required'},
 });
}

export async function passkeyAuthenticationOptions({rpID}){
 if(typeof rpID!=='string'||!rpID)throw new TypeError('invalid_authentication_context');
 return generateAuthenticationOptions({rpID,timeout:60000,userVerification:'required',allowCredentials:[]});
}

export async function verifyPasskeyRegistration({response,challenge,origin,rpID}){
 return verifyRegistrationResponse({response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserPresence:true,requireUserVerification:true});
}

export async function verifyPasskeyAuthentication({response,challenge,origin,rpID,credential}){
 return verifyAuthenticationResponse({response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,credential,requireUserVerification:true,advancedFIDOConfig:{userVerification:'required'}});
}
