let reporter,sequence=0,lastEvent=0,timer;
const tasks=[],statuses=new Map();
export function setProgressReporter(value){reporter=value;sequence=0;lastEvent=Date.now();statuses.clear();}
export function report(message,level='info'){
 if(!reporter)return;
 if(level==='tick'){reporter({message,level,sequence,time:new Date()});return;}
 lastEvent=Date.now();reporter({message,level,sequence:++sequence,time:new Date()});
}
export function status(key,message,level='info'){
 const previous=statuses.get(key),now=Date.now();
 if(previous?.message===message&&now-previous.time<30000)return;
 statuses.set(key,{message,time:now});report(message,level);
}
function animate(){
 const task=tasks.at(-1);if(!task)return;
 const message=task.message+' | '+Math.floor((Date.now()-task.start)/1000)+'s elapsed';
 report(message,'tick');
 if(Date.now()-lastEvent>=30000)report(message+' | still working','waiting');
}
export async function activity(message,operation){
 const task={message,start:Date.now()};tasks.push(task);report(message,'start');
 if(!timer){timer=setInterval(animate,120);timer.unref?.();}
 try{const value=await operation();report(message+' | completed in '+((Date.now()-task.start)/1000).toFixed(1)+'s','done');return value;}
 catch(error){report(message+' | stopped after '+((Date.now()-task.start)/1000).toFixed(1)+'s','error');throw error;}
 finally{tasks.splice(tasks.indexOf(task),1);if(!tasks.length){clearInterval(timer);timer=undefined;}}
}
// Log fixed operation categories, never URL paths, queries, bodies or credentials.
export function requestLabel(url,method){
 const {hostname,pathname:path}=new URL(url);
 if(hostname==='api.cloudflare.com'){
  if(path.endsWith('/accounts'))return 'List accessible Cloudflare accounts';
  if(path.endsWith('/d1/database'))return method==='POST'?'Create D1 database':'Find existing D1 database';
  if(path.includes('/d1/')&&path.endsWith('/query'))return 'Execute D1 database query';
  if(path.endsWith('/workers/subdomain'))return 'Read Workers account subdomain';
  if(path.includes('/workers/scripts/')&&path.endsWith('/subdomain'))return 'Enable Workers public subdomain';
  if(path.endsWith('/workers/domains'))return 'Configure Worker custom domain';
  if(path.includes('/dns_records'))return method==='GET'?'Check existing DNS records':'Create DNS record';
  if(path.includes('/pages/projects')&&path.endsWith('/domains'))return 'Configure Pages custom domain';
  if(path.endsWith('/pages/projects')&&method==='POST')return 'Create Pages project and bindings';
 }
 const provider=hostname==='backboard.railway.com'?'Railway':hostname==='api.render.com'?'Render':hostname==='api.github.com'?'GitHub':'Provider';
 return method+' '+provider+' API request';
}
