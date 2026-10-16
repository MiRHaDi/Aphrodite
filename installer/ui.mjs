import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';

export function interfaceFor(language='en'){
 const fa=language==='fa',color=process.stdout.isTTY&&!process.env.NO_COLOR;
 const paint=(text,code)=>color?'\x1b['+code+'m'+text+'\x1b[0m':text;
 const pick=(en,persian)=>fa?persian:en;
 function banner(){if(process.stdout.isTTY)console.log('\n'+paint('  A P H R O D I T E','1;35')+'\n  '+pick('Guided installation · Private by configuration','نصب مرحله‌به‌مرحله · مدیریت خصوصی')+'\n');}
 function step(number,en,persian){console.log(paint('  ['+number+'/4] ','36')+pick(en,persian));}
 async function ask(label,secret=false){
  if(!process.stdin.isTTY)throw Error('Missing interactive input: '+label);
  process.stdout.write('  '+label+': ');
  const output=secret?new Writable({write(chunk,encoding,done){done();}}):process.stdout;
  const reader=createInterface({input:process.stdin,output,terminal:true});
  try{return (await reader.question('')).trim();}finally{reader.close();if(secret)process.stdout.write('\n');}
 }
 async function provider(){
  const entries=[['workers','Cloudflare Workers'],['pages','Cloudflare Pages'],['railway','Railway'],['render','Render · '+pick('paid persistent disk','دیسک پایدار پولی')],['docker','Docker · '+pick('local daemon required','نیازمند Docker فعال')],['vps','VPS · SSH'],['bundle',pick('Build only · no cloud resources','فقط ساخت خروجی · بدون استقرار')]];
  for(const [index,[,label]] of entries.entries())console.log('     '+paint(String(index+1),'35')+'  '+label);
  console.log();
  while(true){const value=await ask(pick('Destination [1]','مقصد [۱]'));if(!value)return 'workers';const numeric=Number(value.replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))));const found=entries[numeric-1]||entries.find(([id])=>id===value);if(found)return found[0];console.log(paint('  '+pick('Choose a number from 1 to 7.','یک عدد از ۱ تا ۷ انتخاب کنید.'),'33'));}
 }
 return {fa,pick,banner,step,ask,provider,success(message){console.log(paint('  ✓ '+message,'32'));}};
}
