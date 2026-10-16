import type { Env } from './types';
import { settingsFor, type NativeAccount } from './native-types';
import { error, json } from './responses';

interface Usage {used:number;lifetime:number;requests:number;volume_reset:number;request_reset:number;epoch:number}
interface Lease {id:string;remaining:number;epoch:number}
const BLOCK=2*1024*1024;
export async function d1Ledger(env:Env,account:NativeAccount,path:string,input:Record<string,unknown>):Promise<Response>{
  const db=env.DB,now=Date.now(),settings=settingsFor(account),name=account.username;
  await db.prepare('INSERT OR IGNORE INTO native_usage(username,volume_reset,request_reset) VALUES(?,?,?)').bind(name,now,now).run();
  if(settings.resetVolumeDays)await db.prepare('UPDATE native_usage SET used=0,epoch=epoch+1,volume_reset=? WHERE username=? AND volume_reset+?<=?').bind(now,name,settings.resetVolumeDays*86400000,now).run();
  if(settings.resetRequestDays)await db.prepare('UPDATE native_usage SET requests=0,request_reset=? WHERE username=? AND request_reset+?<=?').bind(now,name,settings.resetRequestDays*86400000,now).run();
  const usage=(await db.prepare('SELECT * FROM native_usage WHERE username=?').bind(name).first<Usage>())!;
  if(path==='/status'||path==='/configure'){
    const counts=await db.prepare('SELECT COUNT(*) AS connections,COUNT(DISTINCT ip) AS ips FROM native_leases WHERE username=? AND expires>?').bind(name,now).first<{connections:number;ips:number}>();
    return json({usedBytes:usage.used,lifetimeBytes:usage.lifetime,requests:usage.requests,connections:counts?.connections||0,ips:counts?.ips||0,volumeResetAt:usage.volume_reset,requestResetAt:usage.request_reset,accounting:'atomic-d1-reserved-byte-ceiling'});
  }
  if(path==='/reset'){
    if(input.action==='volume')await db.prepare('UPDATE native_usage SET used=0,epoch=epoch+1,volume_reset=? WHERE username=?').bind(now,name).run();
    else if(input.action==='requests')await db.prepare('UPDATE native_usage SET requests=0,request_reset=? WHERE username=?').bind(now,name).run();else return error('Invalid reset action',400);return json({ok:true});
  }
  if(path==='/restore'){
    const values=input.usage as {usedBytes:number;lifetimeBytes:number;requests:number};
    if(!values||[values.usedBytes,values.lifetimeBytes,values.requests].some(n=>!Number.isSafeInteger(n)||n<0))return error('Invalid usage',400);
    const result=await db.prepare('UPDATE native_usage SET used=?,lifetime=?,requests=?,epoch=epoch+1 WHERE username=? AND NOT EXISTS(SELECT 1 FROM native_leases WHERE username=? AND expires>?) RETURNING username').bind(values.usedBytes,values.lifetimeBytes,values.requests,name,name,now).all();
    return result.results?.length?json({ok:true}):error('Active sessions prevent restore',409);
  }
  const id=input.lease,consumed=Number(input.consumed||0);
  if(typeof id!=='string'||id.length>64||!Number.isSafeInteger(consumed)||consumed<0)return error('Invalid reservation',400);
  const lease=await db.prepare('SELECT id,remaining,epoch FROM native_leases WHERE id=? AND username=?').bind(id,name).first<Lease>();
  if(path!=='/open'&&(!lease||consumed>lease.remaining))return error('Invalid or expired reservation',403);
  if(path==='/close'){
    const refund=lease!.remaining-consumed;
    await db.batch([
      db.prepare('UPDATE native_usage SET used=MAX(0,used-CASE WHEN epoch=? THEN ? ELSE 0 END),lifetime=MAX(0,lifetime-?) WHERE username=? AND EXISTS(SELECT 1 FROM native_leases WHERE id=? AND username=?)').bind(lease!.epoch,refund,refund,name,id,name),
      db.prepare('DELETE FROM native_leases WHERE id=? AND username=?').bind(id,name),
    ]);return json({ok:true});
  }
  if(!account.enabled||(account.expires_at!==null&&account.expires_at*1000<=now))return error('Account disabled or expired',403);
  const policy='EXISTS(SELECT 1 FROM native_accounts WHERE username=? AND revision=? AND enabled=1 AND (expires_at IS NULL OR expires_at>?))';
  if(path==='/heartbeat'){
    const result=await db.prepare('UPDATE native_leases SET remaining=remaining-?,expires=? WHERE id=? AND username=? AND expires>? AND remaining>=? AND '+policy+' RETURNING remaining').bind(consumed,now+90000,id,name,now,consumed,name,account.revision,Math.floor(now/1000)).all<{remaining:number}>();
    return result.results?.length?json({ok:true,granted:0,remaining:result.results[0]!.remaining}):error('Reservation expired',403);
  }
  const granted=Math.max(0,Math.min(BLOCK,settings.dataLimitBytes?settings.dataLimitBytes-usage.used:BLOCK));
  if(!granted)return error('Traffic quota exceeded',403);
  if(path==='/open'){
    if(lease)return error('Duplicate reservation',409);
    const sql='UPDATE native_usage SET used=used+?,lifetime=lifetime+?,requests=requests+1 WHERE username=? AND (?=0 OR used+?<=?) AND (?=0 OR requests<?) AND (?=0 OR (SELECT COUNT(*) FROM native_leases WHERE username=? AND expires>?)<?) AND (?=0 OR EXISTS(SELECT 1 FROM native_leases WHERE username=? AND ip=? AND expires>?) OR (SELECT COUNT(DISTINCT ip) FROM native_leases WHERE username=? AND expires>?)<?) AND '+policy+' RETURNING used';
    const result=await db.batch([
      db.prepare(sql).bind(granted,granted,name,settings.dataLimitBytes,granted,settings.dataLimitBytes,settings.requestLimit,settings.requestLimit,settings.maxConnections,name,now,settings.maxConnections,settings.maxIps,name,String(input.ip||''),now,name,now,settings.maxIps,name,account.revision,Math.floor(now/1000)),
      db.prepare('INSERT INTO native_leases(id,username,ip,expires,remaining,epoch) SELECT ?,?,?,?,?,epoch FROM native_usage WHERE username=? AND changes()=1').bind(id,name,String(input.ip||''),now+90000,granted,name),
      db.prepare('DELETE FROM native_leases WHERE username=? AND expires<=?').bind(name,now),
    ]);
    return result[0]?.results?.length?json({ok:true,granted,remaining:granted}):error('Connection or quota limit exceeded',429);
  }
  if(path!=='/reserve')return error('Invalid ledger operation',400);
  const result=await db.batch([
    db.prepare('UPDATE native_usage SET used=used+?,lifetime=lifetime+? WHERE username=? AND (?=0 OR used+?<=?) AND EXISTS(SELECT 1 FROM native_leases WHERE id=? AND username=? AND expires>? AND remaining>=?) AND '+policy+' RETURNING used').bind(granted,granted,name,settings.dataLimitBytes,granted,settings.dataLimitBytes,id,name,now,consumed,name,account.revision,Math.floor(now/1000)),
    db.prepare('UPDATE native_leases SET remaining=CASE WHEN epoch=? THEN remaining-? ELSE 0 END+?,epoch=?,expires=? WHERE id=? AND username=? AND changes()=1 RETURNING remaining').bind(usage.epoch,consumed,granted,usage.epoch,now+90000,id,name),
  ]);
  return result[1]?.results?.length?json({ok:true,granted,remaining:(result[1].results[0] as {remaining:number}).remaining}):error('Traffic quota exceeded',403);
}
