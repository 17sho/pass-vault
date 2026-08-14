import{readdir,readFile}from'node:fs/promises';
const ignored=new Set(['.git','node_modules','dist','.wrangler']);
const reviewedHtmlSinks=new Set(['./apps/admin-worker/src/index.ts']);
async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){if(e.isDirectory()&&ignored.has(e.name))continue;const f=p+'/'+e.name;if(e.isDirectory())await walk(f);else if(/\.(mjs|js|ts)$/.test(f)){const s=await readFile(f,'utf8');if(/\beval\s*\(/.test(s)||innerHtmlAssignmentIsUnreviewed(f,s))throw Error('unsafe pattern: '+f)}}}
function innerHtmlAssignmentIsUnreviewed(file,source){const sinks=[...source.matchAll(/([A-Za-z_$][\w$]*)\.innerHTML\s*=/g)].map(match=>match[1]);if(!sinks.length)return false;if(!reviewedHtmlSinks.has(file))return true;return !/const script=`[^`]*esc=s=>String\(s\)\.replace/s.test(source)||sinks.length!==6||sinks.filter(x=>x==='list').length!==4||sinks.filter(x=>x==='root').length!==2}
await walk('.');console.log('静态检查通过');
