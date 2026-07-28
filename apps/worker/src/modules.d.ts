declare module '*.mjs' {
  export function validEnvelope(value:unknown):boolean;
  export function validKeyMaterial(value:unknown):boolean;
  export function validateUsername(value:unknown):{valid:boolean;value:string};
  export function validAttachmentId(value:unknown):boolean;
  export function validAttachmentEnvelope(value:unknown):boolean;
  export function validInviteCode(value:unknown):boolean;
  export function normalizeSessionIp(value:unknown):string;
  export function classifySessionClient(userAgent:unknown):{
    device:'desktop'|'mobile'|'tablet'|'unknown';
    browser:'chrome'|'safari'|'firefox'|'edge'|'other'|'unknown';
  };
  export const MAX_ATTACHMENT_CIPHERTEXT:number;
}
