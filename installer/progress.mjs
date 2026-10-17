let reporter,sequence=0;
export function setProgressReporter(value){reporter=value;sequence=0;}
export function report(message,level='info'){
 if(reporter)reporter({message,level,sequence:++sequence,time:new Date()});
}
export async function activity(message,operation,{interval=5000}={}){
 const start=Date.now();report(message,'start');
 const timer=setInterval(()=>report(message+' | still working | '+Math.floor((Date.now()-start)/1000)+'s elapsed','waiting'),interval);
 timer.unref?.();
 try{const value=await operation();report(message+' | completed in '+((Date.now()-start)/1000).toFixed(1)+'s','done');return value;}
 catch(error){report(message+' | failed after '+((Date.now()-start)/1000).toFixed(1)+'s','error');throw error;}
 finally{clearInterval(timer);}
}
// Log fixed operation categories, never URL paths, queries, bodies or credentials.
export function requestLabel(url,method){
 const {hostname,pathname:path}=new URL(url);
 if(hostname==='api.cloudflare.com'){
  if(path.endsWith('/accounts'))return 'List accessible Cloudflare accounts';
  if(path.endsWith('/d1/database'))return 'Create D1 database';
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
