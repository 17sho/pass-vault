const template=(name,description,fields)=>Object.freeze({name,description,fields:Object.freeze(fields.map(([label,type])=>Object.freeze({label,type})))});

export const CUSTOM_RECORD_TEMPLATES=Object.freeze({
 blank:template('空白资料','从零添加字段',[]),
 'bank-card':template('银行卡','卡号、有效期、安全码', [['持卡人','text'],['卡号','secret'],['有效期','date'],['安全码','secret'],['账单地址','textarea'],['客服电话','text']]),
 identity:template('身份证件','证件号、签发日、到期日',[['证件号','secret'],['签发日','date'],['到期日','date']]),
 api:template('API凭据','Endpoint、Key、Secret',[['Endpoint','url'],['API Key','secret'],['API Secret','secret'],['权限范围','text'],['到期日期','date']]),
 server:template('服务器','IP、端口、用户名、密钥',[['IP地址','text'],['SSH端口','number'],['用户名','text'],['密码','secret'],['管理后台','url']]),
 'software-license':template('软件许可','许可证、版本、到期日',[['许可证','secret'],['版本','text'],['到期日','date']]),
});

export const CUSTOM_RECORD_TEMPLATE_IDS=Object.freeze(Object.keys(CUSTOM_RECORD_TEMPLATES));
export const CUSTOM_RECORD_FIELD_TYPES=Object.freeze(['text','secret','url','date','textarea','number']);

function randomId(){if(globalThis.crypto?.randomUUID)return crypto.randomUUID();const bytes=new Uint8Array(16);globalThis.crypto?.getRandomValues?.(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')||`${Date.now()}_${Math.random()}`}
export function cloneCustomRecord(templateId='blank'){
 const selected=CUSTOM_RECORD_TEMPLATES[templateId]||CUSTOM_RECORD_TEMPLATES.blank;
 return{title:'',template:CUSTOM_RECORD_TEMPLATES[templateId]?templateId:'blank',notes:'',tags:[],fields:selected.fields.map(field=>({id:randomId(),label:field.label,type:field.type,value:''}))};
}

export const customRecordTemplateName=templateId=>CUSTOM_RECORD_TEMPLATES[templateId]?.name||CUSTOM_RECORD_TEMPLATES.blank.name;
export function customRecordSearchValues(record){
 const out=[record?.title,customRecordTemplateName(record?.template),record?.notes,...(Array.isArray(record?.tags)?record.tags:[])];
 for(const field of record?.fields||[])if(field?.type!=='secret')out.push(field?.label,field?.value);
 return out.filter(value=>typeof value==='string'&&value.length>0);
}
export function customRecordSummary(record){
 const field=(record?.fields||[]).find(row=>row?.type!=='secret'&&typeof row.value==='string'&&row.value.trim());
 return field?{label:field.label,value:field.value}:null;
}
