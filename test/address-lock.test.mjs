import {it,expect} from 'vitest';
import {lockArtifact} from '../installer/address-lock.mjs';
it('binds each service to exact configured hostnames before application code runs',async()=>{
 const source={code:'export default {fetch(request,env){return new Response(env.value)}};',manifest:{}};
 const a=await lockArtifact(source,['https://a.workers.dev','https://custom.example']);
 const b=await lockArtifact(source,['https://b.pages.dev']);
 expect(a.manifest.sha256).not.toBe(b.manifest.sha256);
 const app=(await import('data:text/javascript;base64,'+Buffer.from(a.code).toString('base64'))).default;
 for(const host of ['a.workers.dev','custom.example'])expect(await (await app.fetch(new Request('https://'+host),{value:'ok'})).text()).toBe('ok');
 for(const host of ['b.pages.dev','a.workers.dev.attacker.example']){
  const response=await app.fetch(new Request('https://'+host, {headers:{'x-forwarded-host':'a.workers.dev'}}),{});
  expect(response.status).toBe(404);expect(await response.text()).toBe('');
 }
});
