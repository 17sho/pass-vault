const UNKNOWN='unknown';

export function normalizeSessionIp(value){
  const ip=typeof value==='string'?value.trim():'';
  if(!ip||ip.length>64||/[\s,\[\]%]/.test(ip))return UNKNOWN;
  if(ip.includes('.')){
    const parts=ip.split('.');
    if(parts.length!==4||parts.some(part=>!/^\d{1,3}$/.test(part)||Number(part)>255||String(Number(part))!==part))return UNKNOWN;
    return ip;
  }
  if(!ip.includes(':')||!/^[0-9a-fA-F:]+$/.test(ip))return UNKNOWN;
  try{
    const host=new URL(`http://[${ip}]/`).hostname;
    return host.startsWith('[')&&host.endsWith(']')?host.slice(1,-1).toLowerCase():UNKNOWN;
  }catch{return UNKNOWN}
}

export function classifySessionClient(value){
  const ua=typeof value==='string'?value.slice(0,1024):'';
  const device=/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?'tablet':/iPhone|iPod|Android.*Mobile|Mobile/i.test(ua)?'mobile':ua?'desktop':UNKNOWN;
  const browser=/Edg\//i.test(ua)?'edge':/(?:OPR|Opera)\//i.test(ua)?'opera':/(?:Firefox|FxiOS)\//i.test(ua)?'firefox':/(?:Chrome|CriOS)\//i.test(ua)?'chrome':/Safari\//i.test(ua)&&/(?:Version|Mobile)\//i.test(ua)?'safari':ua?UNKNOWN:UNKNOWN;
  return{device,browser};
}
