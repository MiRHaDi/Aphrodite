import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),index=args.indexOf('--path');
const path=index>=0?args[index+1]:randomUUID();
if(!path||!/^[A-Za-z0-9_-]{16,128}$/.test(path))throw Error('Choose a 16–128 character path using letters, numbers, hyphens or underscores.');
const configIndex=args.indexOf('--config');
const config=configIndex>=0?['--config',args[configIndex+1]]:[];
if(!args.includes('--dry-run')){
  const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
  const result=spawnSync(process.execPath,[wrangler,'secret','put','ADMIN_PATH',...config],{input:path+'\n',encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  if(result.status!==0)throw Error('Unable to save ADMIN_PATH. Check authenticated Wrangler access; no path was saved locally.');
}
console.log('Private management path: /'+path);
console.log('Keep this stable for the installation. Administrator authentication is still required.');
