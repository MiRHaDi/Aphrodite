import { json } from './responses';
import type { Env } from './types';
let cached:{account:string;expires:number;data:unknown}|undefined;
export async function cloudflareUsage(env:Env):Promise<Response>{
  if(!env.CF_ANALYTICS_TOKEN||!env.CF_ACCOUNT_ID||! /^[a-f\d]{32}$/i.test(env.CF_ACCOUNT_ID))return json({configured:false,available:false});
  if(cached&&cached.account===env.CF_ACCOUNT_ID&&cached.expires>Date.now())return json(cached.data);
  const now=new Date(),today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString(),month=new Date(now.getTime()-30*86400000).toISOString();
  const query='query($account:String!,$today:Time!,$month:Time!){viewer{accounts(filter:{accountTag:$account}){day:workersInvocationsAdaptive(limit:1,filter:{datetime_geq:$today}){sum{requests}} month:workersInvocationsAdaptive(limit:1,filter:{datetime_geq:$month}){sum{requests}}}}}';
  try{
    const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+env.CF_ANALYTICS_TOKEN,'content-type':'application/json'},body:JSON.stringify({query,variables:{account:env.CF_ACCOUNT_ID,today,month}}),signal:AbortSignal.timeout(7000)});
    const result=await response.json() as {errors?:unknown[];data?:{viewer?:{accounts?:Array<{day?:Array<{sum?:{requests?:number}}>;month?:Array<{sum?:{requests?:number}}>}>}}};
    const account=result.data?.viewer?.accounts?.[0];if(!response.ok||result.errors?.length||!account)return json({configured:true,available:false});
    const data={configured:true,available:true,utcDayRequests:account.day?.[0]?.sum?.requests??null,last30DaysRequests:account.month?.[0]?.sum?.requests??null,scope:'account',sampled:true,checkedAt:now.toISOString()};cached={account:env.CF_ACCOUNT_ID,expires:Date.now()+60000,data};return json(data);
  }catch{return json({configured:true,available:false})}
}
