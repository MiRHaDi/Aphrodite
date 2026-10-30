import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSession} from '../installer/session.mjs';
import {prepareInstall} from '../installer/wizard.mjs';
import {deploySplit,splitPlan} from '../installer/topology.mjs';
import {chooseCloudflareDomain} from '../installer/domains.mjs';
const folders=[];afterEach(async()=>{vi.unstubAllEnvs();for(const path of folders.splice(0))await rm(path,{recursive:true,force:true});});
async function fixture(){
 const folder=await mkdtemp(join(tmpdir(),'aphrodite-wizard-test-'));folders.push(folder);const values=new Map();
 const session=await openSession({path:join(folder,'state.json'),credentials:{get:async key=>values.get(key)??null,set:async(k,v)=>{values.set(k,v);}}});
 session.state.options={name:'saved-panel',provider:'pages',account:'a'.repeat(32),topology:'split',connections:'2',connectionProviders:'workers,pages'};
 session.state.profiles=[{id:'primary',account:'a'.repeat(32),connections:'2',providers:'workers,pages'}];
 await session.secret('administrator',JSON.stringify({path:'saved-management-path',token:'saved-admin-token-at-least-32-characters'}));await session.secret('provider-token','fake-saved-provider-token');
 vi.stubEnv('CLOUDFLARE_API_TOKEN','');vi.stubEnv('APHRODITE_VARIABLES','');
 const ui={step:vi.fn(),provider:vi.fn(async()=> 'pages'),ask:vi.fn(async()=> '')};
 return {session,ui};
}
it('reuses the saved provider token, administrator key, name and choices on resume',async()=>{
 const {session,ui}=await fixture();
 const result=await prepareInstall({resume:true},ui,{sessionFactory:async()=>session,interactive:true});
 expect(result.options.token).toBe('fake-saved-provider-token');expect(result.options.name).toBe('saved-panel');expect(result.env.ADMIN_PATH).toBe('saved-management-path');
 expect(result.env.ADMIN_TOKEN).toBe('saved-admin-token-at-least-32-characters');expect(ui.ask.mock.calls.some(([label])=>label.includes('saved;'))).toBe(false);
 expect(ui.ask).not.toHaveBeenCalled();
});
it('adds a separately credentialed account without changing management credentials',async()=>{
 const {session,ui}=await fixture();vi.stubEnv('CLOUDFLARE_CONNECTION_TOKEN','fake-second-account-token');
 const result=await prepareInstall({resume:true,'add-account':true,'connection-account':'b'.repeat(32),connections:'2','connection-providers':'pages'},ui,{sessionFactory:async()=>session,interactive:true});
 expect(result.options.targets.map(t=>t.token)).toEqual(['fake-saved-provider-token','fake-second-account-token']);
 const calls=[],registered=[];
 await deploySplit(result.options,result.env,{deploy:async(options,bindings)=>{calls.push({options,bindings});return {url:'https://'+options.name+'.example',database:bindings.DEPLOYMENT_ROLE==='management'?'existing-db':undefined};},register:async(_,__,endpoints)=>registered.push(...endpoints)});
 expect(calls).toHaveLength(5);expect(calls[0].options.account).toBe('a'.repeat(32));
 expect(calls.slice(3).every(c=>c.options.account==='b'.repeat(32)&&c.options.token==='fake-second-account-token')).toBe(true);
 expect(calls[1].options.provider).toBe('workers');expect(calls.slice(3).every(c=>c.options.provider==='pages')).toBe(true);expect(registered).toHaveLength(4);expect(calls.slice(1).every(c=>c.bindings.EDGE_CONTROL_TOKEN===calls[0].bindings.EDGE_CONTROL_TOKEN&&!c.bindings.ADMIN_TOKEN)).toBe(true);
 const again=await prepareInstall({resume:true},ui,{sessionFactory:async()=>session,interactive:true});
 expect(splitPlan(again.options).connections.map(n=>n.name)).toEqual(splitPlan(result.options).connections.map(n=>n.name));
});

it('resumes unattended from saved defaults without opening an input prompt',async()=>{
 const {session,ui}=await fixture();const result=await prepareInstall({resume:true},ui,{sessionFactory:async()=>session,interactive:false});
 expect(result.provider).toBe('pages');expect(result.options.token).toBe('fake-saved-provider-token');expect(ui.ask).not.toHaveBeenCalled();expect(ui.provider).not.toHaveBeenCalled();
});
it('uses request-scoped credentials and an explicit automated DNS policy without prompting',async()=>{
 const {session,ui}=await fixture();const previous=process.env.CLOUDFLARE_API_TOKEN;
 const result=await prepareInstall({resume:true,'domain-conflict':'reuse'},ui,{sessionFactory:async()=>session,interactive:false,environment:{CLOUDFLARE_API_TOKEN:'request-scoped-fixture-token'}});
 expect(result.options.token).toBe('request-scoped-fixture-token');expect(await result.options.askDomain('fixture')).toBe('1');expect(ui.ask).not.toHaveBeenCalled();expect(process.env.CLOUDFLARE_API_TOKEN).toBe(previous);
});
it('can choose a missing custom domain when resuming a named installation',async()=>{
 const {session,ui}=await fixture();
 ui.ask.mockImplementation(async label=>label.startsWith('Configure a custom hostname')?'y':'');
 const domainChooser=vi.fn(async options=>Object.assign(options,{domain:'panel.example.com',zone:'zone-fixture'}));
 const result=await prepareInstall({resume:true,configure:true},ui,{sessionFactory:async()=>session,interactive:true,domainChooser});
 expect(domainChooser).toHaveBeenCalledOnce();expect(result.options.domain).toBe('panel.example.com');expect(session.state.options.domain).toBe('panel.example.com');expect(result.env.ADMIN_TOKEN).toBe('saved-admin-token-at-least-32-characters');
});
it('lets a saved installation edit domain choices and persists the new subdomain',async()=>{
 const {session,ui}=await fixture();Object.assign(session.state.options,{domain:'old.example.com',zone:'zone',zoneName:'example.com',subdomain:'old'});
 ui.ask.mockImplementation(async label=>label.startsWith('Subdomain')?'updated':'');
 const result=await prepareInstall({resume:true,configure:true},ui,{sessionFactory:async()=>session,interactive:true,domainChooser:(options,interfaceUi,context)=>chooseCloudflareDomain(options,interfaceUi,{...context,request:async()=>({result:[{name:'example.com',id:'zone',account:{id:'a'.repeat(32)}}]})})});
 expect(result.options.domain).toBe('updated.example.com');expect(session.state.options.subdomain).toBe('updated');expect(session.state.options.zoneName).toBe('example.com');expect(result.env.ADMIN_PATH).toBe('saved-management-path');
 expect(ui.ask.mock.calls.some(([label])=>label.includes('Subdomain [old]'))).toBe(true);
});
it('preserves password hash, token and wildcard choices across quick unattended resumes',async()=>{
 const {session,ui}=await fixture();Object.assign(session.state.options,{domain:'panel.example.com',zone:'zone',zoneName:'example.com',subdomain:'panel'});
 const environment={ADMIN_PASSWORD:'fixture-selected-password'};
 const first=await prepareInstall({resume:true,'subscription-id':'uuid','wildcard-domain':'example.com'},ui,{sessionFactory:async()=>session,interactive:false,environment});
 const generation=session.state.secrets['administrator-password-hash'].generation;
 const again=await prepareInstall({resume:true},ui,{sessionFactory:async()=>session,interactive:false,environment});
 expect(again.env.ADMIN_PASSWORD_HASH).toBe(first.env.ADMIN_PASSWORD_HASH);expect(again.env.ADMIN_TOKEN).toBe(first.env.ADMIN_TOKEN);expect(again.env.ADMIN_PATH).toBe(first.env.ADMIN_PATH);expect(again.env.SUBSCRIPTION_ID_MODE).toBe('uuid');expect(again.env.SUBSCRIPTION_DOMAIN).toBe('example.com');expect(again.env.WILDCARD_GATEWAY_TOKEN).toBe(first.env.WILDCARD_GATEWAY_TOKEN);expect(session.state.secrets['administrator-password-hash'].generation).toBe(generation);expect(ui.ask).not.toHaveBeenCalled();
});
