/** Separate credentials for each trusted server; never send these to a client. */
export async function clusterAuthorized(request:Request,primary:string|undefined,ring:string|undefined):Promise<boolean>{
 let tokens:unknown=[];try{tokens=ring?JSON.parse(ring):[]}catch{return false}
 if(!Array.isArray(tokens)||tokens.length>64)return false;
 const values=[primary,...tokens].filter((v):v is string=>typeof v==='string'&&v.length>=32&&v.length<=256);
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const supplied=await digest(request.headers.get('authorization')||'');let accepted=0;
 for(const token of values){const expected=await digest('Bearer '+token);let diff=0;for(let i=0;i<expected.length;i++)diff|=expected[i]!^supplied[i]!;accepted|=Number(diff===0)}
 return accepted!==0;
}
