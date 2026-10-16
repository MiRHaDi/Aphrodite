import {Client} from 'ssh2';
import {readFile,readdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {required,root,verify} from './common.mjs';
export async function deploySSH(options,env,artifact){
  const host=required(options.host,'SSH host'),username=options.user||'root';
  if(!/^[a-z_][a-z0-9_-]*$/i.test(username))throw Error('Invalid SSH username');
  const expected=required(options.fingerprint,'--fingerprint SHA256:... (verify against the server console)');
  const connection=new Client();
  const exec=(command,input)=>new Promise((resolve,reject)=>connection.exec(command,{pty:false},(error,stream)=>{if(error)return reject(Error('SSH execution failed'));let output='';stream.on('data',data=>{output+=data;if(output.length>65536)output=output.slice(-65536);});stream.stderr.resume();stream.on('close',code=>code===0?resolve(output):reject(Error('Remote command failed (exit '+code+')')));stream.end(input);}));
  const privileged=command=>username==='root'?command:'sudo -n '+command;
  const privateKey=options.key?await readFile(options.key):undefined;
  await new Promise((resolve,reject)=>{connection.once('ready',resolve).once('error',()=>reject(Error('SSH authentication or host verification failed'))).connect({host,port:Number(options.sshPort||22),username,password:options.password,privateKey,readyTimeout:20000,hostVerifier:key=>'SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'')===expected});});
  try{
    const base='/opt/aphrodite/'+options.name,release=base+'/releases/'+artifact.manifest.buildId;
    await exec(privileged('sh -s'),`set -eu
if ! command -v docker >/dev/null 2>&1; then
  test -f /etc/debian_version || { echo 'Automatic prerequisites currently require Debian/Ubuntu'; exit 1; }
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq docker.io python3 ca-certificates
fi
command -v python3 >/dev/null 2>&1 || { apt-get update -qq; apt-get install -y -qq python3; }
systemctl start docker
install -d -m 700 '${release}/migrations'
chown -R '${username}' '${release}'
`);
    const sftp=await new Promise((resolve,reject)=>connection.sftp((e,s)=>e?reject(Error('SFTP unavailable')):resolve(s)));
    const upload=(local,remote)=>new Promise((resolve,reject)=>sftp.fastPut(local,remote,e=>e?reject(Error('Upload failed')):resolve()));
    await cp(join(root,'deploy/Dockerfile.prebuilt'),join(artifact.directory,'Dockerfile'));
    for(const name of ['server.mjs','manifest.json','Dockerfile','LICENSE','THIRD_PARTY_NOTICES.md'])await upload(join(artifact.directory,name),release+'/'+name);
    for(const name of await readdir(join(artifact.directory,'migrations')))await upload(join(artifact.directory,'migrations',name),release+'/migrations/'+name);
    const domain=options.domain||'';if(domain&&!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))throw Error('Invalid TLS hostname');
    const helper=await readFile(join(root,'deploy/remote-install.py'),'utf8');
    await new Promise((resolve,reject)=>{const stream=sftp.createWriteStream(release+'/install.py',{mode:0o700});stream.on('error',()=>reject(Error('Helper upload failed'))).on('close',resolve);stream.end(helper);});
    env.TRUST_PROXY=domain?'true':'false';
    const port=Number(options.port||8080);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
    await exec(privileged('python3 '+release+'/install.py'),JSON.stringify({release,name:options.name,env,domain,port}));
    const url=domain?'https://'+domain:'http://127.0.0.1:'+port;
    if(domain)await verify(url,env,{attempts:60,delay:5000});
    return {url,host,localOnly:!domain,volume:options.name+'-data'};
  }finally{connection.end();}
}
