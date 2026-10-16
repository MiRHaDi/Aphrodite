import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
export async function database(filename,migrations){
  await mkdir(dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS runtime_migrations(name TEXT PRIMARY KEY);');
  for(const name of (await readdir(migrations)).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    if(db.prepare('SELECT 1 FROM runtime_migrations WHERE name=?').get(name))continue;
    db.exec('BEGIN IMMEDIATE');try{db.exec(await readFile(join(migrations,name),'utf8'));db.prepare('INSERT INTO runtime_migrations(name) VALUES(?)').run(name);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }
  function prepared(sql,parameters=[]){
    const execute=()=>{const statement=db.prepare(sql);const rows=statement.columns().length?statement.all(...parameters):[];if(!statement.columns().length)statement.run(...parameters);const changes=db.prepare('SELECT changes() AS n').get().n;return {success:true,results:rows,meta:{changes:Number(changes)}};};
    return {bind:(...values)=>prepared(sql,values),run:async()=>execute(),all:async()=>execute(),first:async(column)=>{const row=execute().results[0]||null;return column&&row?row[column]:row;},_execute:execute};
  }
  return {prepare:prepared,batch:async statements=>{db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s._execute());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},close:()=>db.close()};
}
