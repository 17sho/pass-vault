import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fillTestInvite, withTestInviteEnv } from '../tests/fixtures.mjs';
const port=4398, dir=`/tmp/layout-${process.pid}`;
await rm(dir,{recursive:true,force:true});
const server=spawn(process.execPath,['apps/server/server.mjs'],{env:{...withTestInviteEnv(),PORT:String(port),DB_PATH:`${dir}.sqlite`,COOKIE_SECURE:'false'},stdio:'ignore'});
try {
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break}catch{} await new Promise(r=>setTimeout(r,100))}
 const browser=await chromium.launch({headless:true});
 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.goto(`http://127.0.0.1:${port}/`); await page.getByRole('button',{name:'创建新库'}).click(); await fillTestInvite(page); await page.getByLabel('用户名').fill(`layout${width}${Date.now()}`); await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple'); await page.getByRole('button',{name:'创建并进入'}).click(); await page.locator('#vault').waitFor({state:'visible'});
  const out=[];
  for(const type of ['账号','网站','笔记','TOTP']){
   await page.getByRole('button',{name:'+ 新建'}).click(); await page.locator('#picker').getByRole('button',{name:type,exact:true}).click();
   const state=await page.evaluate(type=>{const q=s=>document.querySelector(s),r=e=>{if(!e)return null;const x=e.getBoundingClientRect();return {left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width,height:x.height}};const e=q('#editor'),f=q('#fields'),a=q('#editor .dialog-actions');return {type,viewport:[innerWidth,innerHeight],docOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,editor:r(e),fields:r(f),actions:r(a),fieldsScroll:f?{scroll:f.scrollHeight,client:f.clientHeight,overflow:getComputedStyle(f).overflowY}:null,buttons:[...document.querySelectorAll('#editor .dialog-actions button')].map(x=>({text:x.textContent,rect:r(x)}))}},type);
   out.push(state); if(await page.locator('#editor').isVisible()){await page.locator('#editor .dialog-actions [data-close="editor"]').click();await page.locator('#editor').waitFor({state:'hidden'});} else {await page.keyboard.press('Escape');}
  }
  console.log(JSON.stringify({width,out})); await page.close();
 }
 await browser.close();
} finally {server.kill('SIGTERM'); await rm(dir,{recursive:true,force:true});}
