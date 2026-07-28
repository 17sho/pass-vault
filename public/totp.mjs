const BASE32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeTotpSecret(value){
 const secret=String(value??'').replace(/[\s-]+/g,'').replace(/=+$/,'').toUpperCase();
 const remainder=secret.length%8,leftover=(secret.length*5)%8,last=BASE32.indexOf(secret.at(-1));
 if(secret.length<16||secret.length>256||!/^[A-Z2-7]+$/.test(secret)||[1,3,6].includes(remainder)||(leftover&&last&((1<<leftover)-1)))throw Error('invalid_totp_secret');
 return secret;
}

function decodeBase32(value){
 const secret=normalizeTotpSecret(value),bytes=[];let bits=0,buffer=0;
 for(const char of secret){buffer=(buffer<<5)|BASE32.indexOf(char);bits+=5;if(bits>=8){bits-=8;bytes.push((buffer>>bits)&255)}}
 return new Uint8Array(bytes);
}

export async function generateTotp(secret,now=Date.now(),{digits=6,period=30}={}){
 if(!Number.isInteger(digits)||digits<6||digits>8||!Number.isInteger(period)||period<1)throw Error('invalid_totp_options');
 const counter=Math.floor(now/1000/period),message=new Uint8Array(8);let value=BigInt(counter);
 for(let i=7;i>=0;i--){message[i]=Number(value&255n);value>>=8n}
 const key=await crypto.subtle.importKey('raw',decodeBase32(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,message)),offset=hash[hash.length-1]&15;
 const binary=((hash[offset]&127)<<24)|(hash[offset+1]<<16)|(hash[offset+2]<<8)|hash[offset+3];
 return{code:String(binary%(10**digits)).padStart(digits,'0'),remaining:period-(Math.floor(now/1000)%period),period};
}
