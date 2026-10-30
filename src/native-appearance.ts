import {error,json} from './responses';
import type {Env} from './types';

export type SubscriptionAppearance={title:string;message:string;accent:string};
export const defaultSubscriptionAppearance:SubscriptionAppearance={title:'وضعیت اشتراک Aphrodite',message:'لینک اصلی را در برنامهٔ سازگار وارد کنید؛ قالب مناسب را انتخاب کنید.',accent:'#7c6cff'};
export function parseSubscriptionAppearance(value:unknown):SubscriptionAppearance|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>,title=typeof input.title==='string'?input.title.trim():'',message=typeof input.message==='string'?input.message.trim():'',accent=typeof input.accent==='string'?input.accent:'';
 if(title.length>80||message.length>280||!/^#[0-9a-f]{6}$/i.test(accent))return null;
 return {title:title||defaultSubscriptionAppearance.title,message:message||defaultSubscriptionAppearance.message,accent};
}
export async function subscriptionAppearance(env:Env):Promise<SubscriptionAppearance>{
 const row=await env.DB.prepare("SELECT value FROM native_configuration WHERE key='subscription_appearance'").first<{value:string}>();
 if(!row)return defaultSubscriptionAppearance;
 try{return parseSubscriptionAppearance(JSON.parse(row.value))||defaultSubscriptionAppearance;}catch{return defaultSubscriptionAppearance;}
}
export async function nativeAppearance(request:Request,env:Env):Promise<Response>{
 if(request.method==='GET')return json({appearance:await subscriptionAppearance(env)});
 if(request.method!=='PUT')return error('Method not allowed',405);
 let input:unknown;try{input=await request.json()}catch{return error('Invalid JSON',400)}
 const appearance=parseSubscriptionAppearance(input);if(!appearance)return error('Invalid appearance',400);
 await env.DB.prepare("INSERT INTO native_configuration(key,value) VALUES('subscription_appearance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=unixepoch()").bind(JSON.stringify(appearance)).run();
 return json({ok:true,appearance});
}
