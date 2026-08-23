import type { Env } from './runtime.ts';

export const SECURITY_HEADERS={
 'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
 'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
 'referrer-policy':'no-referrer',
 'strict-transport-security':'max-age=63072000; includeSubDomains; preload',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY'
} as const;
export const json=(value:unknown,status=200,headers:HeadersInit={})=>Response.json(value,{status,headers:{...SECURITY_HEADERS,'cache-control':'no-store',...headers}});
export async function asset(req:Request,env:Env){const response=await env.ASSETS.fetch(req),headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);if(/^\/share(?:\/|\.html|$)/.test(new URL(req.url).pathname))headers.set('x-robots-tag','noindex, nofollow');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
export const error=(status:number,code:string)=>json({error:code},status);
