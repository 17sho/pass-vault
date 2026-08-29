export interface Env { DB:D1Database; ASSETS:Fetcher; ATTACHMENTS:R2Bucket; INVITE_CODE?:string; INVITE_CODE_PEPPER?:string; PASSKEY_UNLOCK_KEK?:string; PASSKEY_RP_ID?:string; PASSKEY_ORIGIN?:string; APP_ORIGIN?:string; APP_VERSION?:string }
export type User={id:string;username:string;password_hash:string;password_salt:string;password_iterations?:number;kdf:string;wrapped_key:string};
export type Session=User&{user_id:string;id_hash:string;csrf_hash:string;expires_at:number;public_id:string;created_at:number;last_seen_at:number;ip_address:string;device_type:string;browser:string;auth_method:'password'|'passkey'|'unknown'};
export type Envelope={id:string;type:'account'|'website'|'note'|'totp'|'custom'|'settings';version:number;iv:string;ciphertext:string};
export type StoredEnvelope=Envelope&{createdAt:number;revision:number};
export type PasskeyChallenge={id_hash:string;user_id:string|null;purpose:'registration'|'authentication';challenge:string;expires_at:number;created_at:number};
export type PasskeyCredential={id:string;user_id:string;public_key:string;counter:number;transports:string;device_type:string;backed_up:number;server_wrapped_key:string;created_at:number;updated_at:number;username?:string};
