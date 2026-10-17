import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';

export function interfaceFor(language='en',{input=process.stdin,output=process.stdout}={}){
 let reader,muted=false;
 const fa=language==='fa',color=output.isTTY&&!process.env.NO_COLOR;
 const paint=(text,code)=>color?'\x1b['+code+'m'+text+'\x1b[0m':text;
 const pick=(en,persian)=>fa?persian:en;
 function banner(){if(process.stdout.isTTY)console.log('\n'+paint('  ╭──────────────────────────────────────────╮\n  │             A P H R O D I T E            │\n  ╰──────────────────────────────────────────╯','1;35')+'\n  '+pick('Configure  →  Build  →  Deploy  →  Verify','تنظیمات  ←  ساخت  ←  استقرار  ←  بررسی')+'\n');}
 function step(number,en,persian){console.log(paint('  ['+number+'/4] ','36')+pick(en,persian));}
 async function ask(label,secret=false){
  if(!input.isTTY)throw Error('Missing interactive input: '+label);
  if(!reader){const writer=new Writable({write(chunk,encoding,done){if(!muted)output.write(chunk);done();}});reader=createInterface({input,output:writer,terminal:true,crlfDelay:Infinity});}
  muted=secret;
  try{if(secret)output.write('  '+paint(label,'1;33')+': ');return (await reader.question(secret?'':'  '+paint(label,'1;33')+': ')).trim();}finally{muted=false;if(secret)output.write('\n');}
 }
 async function provider(){
  const entries=[['workers','Cloudflare Workers'],['pages','Cloudflare Pages'],['railway','Railway'],['render','Render · '+pick('paid persistent disk','دیسک پایدار پولی')],['docker','Docker · '+pick('local daemon required','نیازمند Docker فعال')],['vps','VPS · SSH'],['bundle',pick('Build only · no cloud resources','فقط ساخت خروجی · بدون استقرار')]];
  for(const [index,[,label]] of entries.entries())console.log('     '+paint(String(index+1),'35')+'  '+label);
  console.log();
  while(true){const value=await ask(pick('Destination [1]','مقصد [۱]'));if(!value)return 'workers';const numeric=Number(value.replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))));const found=entries[numeric-1]||entries.find(([id])=>id===value);if(found)return found[0];console.log(paint('  '+pick('Choose a number from 1 to 7.','یک عدد از ۱ تا ۷ انتخاب کنید.'),'33'));}
 }
 return {fa,pick,banner,step,ask,provider,detail(event){console.log(paint('  ['+event.time.toLocaleTimeString('en-GB')+'] ','2')+paint(pick(event.en,event.fa),({start:'36',waiting:'33',done:'32',error:'31'}[event.level]||'37')));},close(){reader?.close();reader=undefined;},success(message){console.log(paint('  ✓ '+message,'32'));}};
}

export function terminalLink(url,label=url){return process.stdout.isTTY&&!process.env.NO_COLOR?'\x1b]8;;'+url+'\x1b\\'+(label===url?'\x1b[1;36m':'\x1b[1;33m')+label+'\x1b[0m'+'\x1b]8;;\x1b\\':label===url?url:label+' ('+url+')';}
export const cloudflareTokenUrl='https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys='+encodeURIComponent(JSON.stringify([
 ['workers_scripts','edit'],['workers_kv_storage','edit'],['workers_routes','edit'],['workers_r2','edit'],['page','edit'],['dns','edit'],['zone','read'],['zone_settings','edit'],['dns_records','edit'],['ssl_and_certificate','edit'],['cache_purge','edit'],['user_details','read'],['account','read'],['workers_tail','read'],['d1','edit']
].map(([key,type])=>({key,type}))))+'&accountId=*&zoneId=all&name=Aphrodite';
export function tokenGuide(ui){console.log('\n  '+ui.pick('No token? Open this link, create the token and paste it below:','اگر توکن نداری، روی این لینک بزن، توکن را بساز و پایین وارد کن:'));console.log('  '+terminalLink(cloudflareTokenUrl));console.log('  '+ui.pick('Token input is visible. Paste it and press Enter once.','ورودی توکن نمایش داده می‌شود؛ آن را بچسبان و فقط یک بار Enter بزن.')+'\n');}
