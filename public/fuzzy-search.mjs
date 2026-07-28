export const searchableFields={
 account:['platform','loginUrl','credentials','notes','tags'],
 website:['name','url','description','tags'],
 note:['title','body','tags'],
 totp:['account','tags'],
 attachment:['name','mime','category','size'],
};

export function normalizeSearchText(value){
 return String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s_]+/gu,'');
}

function distance(a,b,limit){
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 let previous=Array.from({length:b.length+1},(_,i)=>i),beforePrevious=null;
 for(let i=1;i<=a.length;i++){
  const current=[i];let rowMin=i;
  for(let j=1;j<=b.length;j++){
   let value=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   if(beforePrevious&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])value=Math.min(value,beforePrevious[j-2]+1);
   current[j]=value;rowMin=Math.min(rowMin,value);
  }
  if(rowMin>limit)return limit+1;
  beforePrevious=previous;previous=current;
 }
 return previous[b.length];
}

function subsequenceGap(query,text){
 let qi=0,start=-1,end=-1;
 for(let i=0;i<text.length&&qi<query.length;i++)if(text[i]===query[qi]){if(start<0)start=i;end=i;qi++}
 return qi===query.length?end-start+1-query.length:Infinity;
}

function fieldScore(query,raw){
 const text=normalizeSearchText(Array.isArray(raw)?raw.join(' '):raw);
 if(!text)return Infinity;
 if(text===query)return 0;
 const at=text.indexOf(query);
 if(at===0)return 100+Math.min(text.length-query.length,50);
 if(at>0)return 200+Math.min(at,50)+Math.min(text.length-query.length,50);
 if(query.length<3)return Infinity;
 const tolerance=query.length>=8?2:1;
 let best=Infinity;
 for(let length=Math.max(1,query.length-tolerance);length<=Math.min(text.length,query.length+tolerance);length++)for(let i=0;i+length<=text.length;i++){
  const d=distance(query,text.slice(i,i+length),tolerance);
  if(d<=tolerance)best=Math.min(best,300+d*20+i);
 }
 if(best<Infinity)return best;
 if(query.length>=5){const gap=subsequenceGap(query,text);if(gap<=Math.max(3,Math.floor(query.length*.6)))return 500+gap*10+Math.max(0,text.length-query.length)}
 return Infinity;
}

export function rankSearchResults(items,query,fields){
 const normalized=normalizeSearchText(query);
 if(!normalized)return items.slice();
 return items.map((item,index)=>({item,index,score:Math.min(...fields.flatMap(field=>field==='credentials'?(Array.isArray(item.credentials)?item.credentials:[]).map(row=>fieldScore(normalized,row?.username)):[fieldScore(normalized,item[field])]))})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.index-b.index).map(x=>x.item);
}
