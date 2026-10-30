import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {report} from './progress.mjs';

export function interfaceFor({input=process.stdin,output=process.stdout}={}){
 let reader,muted=false,loading=false,frame=0;
 const clear=()=>{if(loading){output.write('\r\x1b[2K');loading=false;}};
 const color=output.isTTY&&!process.env.NO_COLOR;
 const paint=(text,code)=>color?'\x1b['+code+'m'+text+'\x1b[0m':text;
 const write=text=>{clear();output.write(text+'\n');};
 function banner(){if(output.isTTY)write('\n  A P H R O D I T E\n  Configure > Build > Deploy > Verify\n');}
 function step(message){report(message,'step');}
 async function ask(label,secret=false){
  clear();
  if(!input.isTTY)throw Error('Missing interactive input: '+label);
  if(!reader){const writer=new Writable({write(chunk,encoding,done){if(!muted)output.write(chunk);done();}});reader=createInterface({input,output:writer,terminal:true,crlfDelay:Infinity});}
  muted=secret;
  try{if(secret)output.write('  '+paint(label,'1;33')+': ');return (await reader.question(secret?'':'  '+paint(label,'1;33')+': ')).trim();}finally{muted=false;if(secret)output.write('\n');}
 }
 async function provider(defaultProvider='workers'){
  const entries=[['workers','Cloudflare Workers'],['pages','Cloudflare Pages'],['railway','Railway'],['render','Render (paid persistent disk)'],['docker','Docker (local daemon required)'],['vps','VPS via SSH'],['bundle','Build only (no cloud resources)']];
  for(const [index,[,label]] of entries.entries())write('     '+paint(String.fromCharCode(65+index),'35')+'  '+label);
  write('');
  while(true){const value=(await ask('Destination ['+String.fromCharCode(65+Math.max(0,entries.findIndex(([id])=>id===defaultProvider)))+']')).toLowerCase();if(!value)return defaultProvider;const index=/^[a-g]$/.test(value)?value.charCodeAt(0)-97:Number(value)-1;const found=entries[index]||entries.find(([id])=>id===value);if(found)return found[0];write(paint('  Choose a letter from A to G.','33'));}
 }
 return {banner,step,ask,provider,detail(event){if(event.level==='tick'){if(output.isTTY){const frames=['/','|',String.fromCharCode(92),'-'];const width=Math.max(12,(output.columns||80)-6),tail=event.message.match(/ \| \d+s elapsed$/)?.[0]||'';const message=event.message.length>width?event.message.slice(0,Math.max(0,width-tail.length-3))+'...'+tail:event.message;output.write('\r\x1b[2K  '+frames[frame++%4]+' '+message);loading=true;}return;}write(paint('  ['+String(event.sequence).padStart(3,'0')+'] ['+event.time.toLocaleTimeString('en-GB')+'] ','2')+paint('['+event.level.toUpperCase()+'] '+event.message,({step:'1;35',start:'36',waiting:'33',done:'32',error:'31'}[event.level]||'37')));},close(){clear();reader?.close();reader=undefined;},success(message){report(message,'done');}};
}

export function terminalLink(url,label=url){
 if(!process.stdout.isTTY)return label===url?url:label+' ('+url+')';
 const display=process.env.NO_COLOR?label:'\x1b['+(label===url?'1;36':'1;33')+'m'+label+'\x1b[0m';
 return '\x1b]8;;'+url+'\x1b\\'+display+'\x1b]8;;\x1b\\';
}

export const cloudflareTokenUrl='https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys='+encodeURIComponent(JSON.stringify([
 ['workers_scripts','edit'],['workers_kv_storage','edit'],['workers_routes','edit'],['workers_r2','edit'],['page','edit'],['dns','edit'],['zone','read'],['zone_settings','edit'],['dns_records','edit'],['ssl_and_certificate','edit'],['cache_purge','edit'],['user_details','read'],['account','read'],['workers_tail','read'],['d1','edit']
].map(([key,type])=>({key,type}))))+'&accountId=*&zoneId=all&name=Aphrodite';
export function tokenGuide(){console.log('\n  No token? Open this link, create a token and paste it below:');console.log('  '+terminalLink(cloudflareTokenUrl));console.log('  Token input is visible. Paste it and press Enter once.\n');}
