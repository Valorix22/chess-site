if(process.env.GAMBIT_E2E!=='1')throw Error('Use GAMBIT_E2E=1 with an isolated QA container on localhost:8096.');require('fs').mkdirSync(process.env.GAMBIT_TEST_OUTPUT||require('path').join(__dirname,'test-results'),{recursive:true});
const {chromium}=require('playwright');const {execFileSync}=require('child_process');const fs=require('fs');
const origin='http://127.0.0.1:8096',password='Gambit-testing-password-2026';
async function req(path,body,cookie){const r=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'X-Club':'1',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};}
(async()=>{
 let owner;
 const setup=await req('/me');if(setup.data.setup){const token=execFileSync('docker',['exec','scacchi-gambit-qa','cat','/data/setup-token'],{encoding:'utf8'}).trim();owner=await req('/register',{name:'GambitOwner',password,setup_token:token});}else owner=await req('/login',{name:'GambitOwner',password});
 const seed=await req('/platform/admin/starter-content',{},owner.cookie);console.log('starter content',seed.data);
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const report=[];
 for(const role of ['guest','owner']){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});if(role==='owner'){const r=await ctx.request.post(origin+'/api/login',{headers:{'X-Club':'1'},data:{name:'GambitOwner',password}});if(!r.ok())throw Error(await r.text());}
  for(const pageName of role==='guest'?['index']:['index','play','puzzles','learn','community','profile','tournaments','admin']){
   const page=await ctx.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))external.push(r.url());});
   await page.goto(origin+'/'+pageName+'.html',{waitUntil:'domcontentloaded'});await page.waitForSelector('body[data-ready="1"]',{timeout:20000});await page.waitForTimeout(300);
   const body=await page.locator('body').innerText(),failed=body.includes('Impossibile caricare la pagina');
   const leak=/Alex Morgan|Maya Chen|Gukesh|1,842 players|Sunset Blitz|Midnight Rapid|12,408|NadiaPetrova/.test(body);
   const images=await page.locator('.board .piece img').count();
   report.push({role,page:pageName,failed,errors,external,demoLeak:leak,pieceImages:images});console.log(JSON.stringify(report.at(-1)));
   await page.screenshot({path:require('path').join(process.env.GAMBIT_TEST_OUTPUT||require('path').join(__dirname,'test-results'),`${role}-${pageName}.png`),fullPage:true});
   await page.close();
  }await ctx.close();
 }
 fs.writeFileSync(require('path').join(process.env.GAMBIT_TEST_OUTPUT||require('path').join(__dirname,'test-results'),'browser-smoke.json'),JSON.stringify(report,null,2));await browser.close();if(report.some(x=>x.failed||x.errors.length||x.external.length||x.demoLeak))process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1)});
