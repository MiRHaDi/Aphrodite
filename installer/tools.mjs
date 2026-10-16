import {mkdir,writeFile,chmod,access} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {jsonRequest} from './common.mjs';
export async function railwayBinary(){
  const triples={win32:{x64:'x86_64-pc-windows-gnu',arm64:'aarch64-pc-windows-msvc'},linux:{x64:'x86_64-unknown-linux-musl',arm64:'aarch64-unknown-linux-musl'},darwin:{x64:'x86_64-apple-darwin',arm64:'aarch64-apple-darwin'}};
  const target=triples[process.platform]?.[process.arch];if(!target)throw Error('Unsupported Railway CLI architecture');
  const release=await jsonRequest('https://api.github.com/repos/railwayapp/cli/releases/latest');
  const asset=release.assets.find(a=>a.name.includes(target)&&a.name.endsWith('.tar.gz'));
  if(!asset?.digest?.startsWith('sha256:'))throw Error('A verified Railway CLI release asset is unavailable');
  const directory=join(process.env.LOCALAPPDATA||join(homedir(),'.cache'),'Aphrodite','tools',release.tag_name);
  const binary=join(directory,process.platform==='win32'?'railway.exe':'railway');
  try{await access(binary);return binary;}catch{}
  const response=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Railway CLI download failed');
  const archive=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(archive).digest('hex')!==asset.digest.slice(7))throw Error('Railway CLI checksum mismatch');
  const tar=gunzipSync(archive,{maxOutputLength:128*1024*1024});let executable;
  for(let offset=0;offset+512<=tar.length;){const header=tar.subarray(offset,offset+512);if(header.every(b=>b===0))break;const filename=header.subarray(0,100).toString().split('\0')[0],size=parseInt(header.subarray(124,136).toString().replace(/\0/g,'').trim(),8);if(!Number.isSafeInteger(size)||size<0||size>128*1024*1024)throw Error('Invalid CLI archive');offset+=512;if(['railway','railway.exe','./railway','./railway.exe'].includes(filename)&&[0,48].includes(header[156]))executable=tar.subarray(offset,offset+size);offset+=Math.ceil(size/512)*512;}
  if(!executable?.length)throw Error('CLI archive did not contain the expected binary');
  await mkdir(directory,{recursive:true});await writeFile(binary,executable,{mode:0o700});await chmod(binary,0o700);return binary;
}
