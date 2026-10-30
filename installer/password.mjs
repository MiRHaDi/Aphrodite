import {pbkdf2Sync,randomBytes,timingSafeEqual} from 'node:crypto';
export function passwordHash(password,existing){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Administrator password must contain 12 to 256 characters');
 const parts=existing?.split('$');
 if(parts?.[0]==='pbkdf2-sha256'&&parts[1]==='100000'&&/^[a-f0-9]{32}$/.test(parts[2])&&/^[a-f0-9]{64}$/.test(parts[3])){
  const candidate=pbkdf2Sync(password,Buffer.from(parts[2],'hex'),100000,32,'sha256');if(timingSafeEqual(candidate,Buffer.from(parts[3],'hex')))return existing;
 }
 const salt=randomBytes(16);return 'pbkdf2-sha256$100000$'+salt.toString('hex')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
}
