const MAX_BODY=2_000_000;

export async function body(req:Request){return limitedJson(req,MAX_BODY)}
export async function limitedJson(req:Request,limit:number){const declared=req.headers.get('content-length');if(declared!==null){const length=Number(declared);if(!Number.isSafeInteger(length)||length<0||length>limit)throw new RangeError()}const reader=req.body?.getReader();if(!reader)return {};const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RangeError()}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)||'{}') as any}
export const validPassword=(x:unknown)=>typeof x==='string'&&x.length>=1&&x.length<=1024;
export const emptyObject=(value:unknown)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0;
export function exactKeys(value:Record<string,unknown>,keys:string[]){return Object.keys(value).sort().join(',')===keys.slice().sort().join(',')}
export function namedCookie(req:Request,name:string){for(const part of (req.headers.get('cookie')||'').split(';')){const [k,...v]=part.trim().split('=');if(k===name)return v.join('=')}return null}
