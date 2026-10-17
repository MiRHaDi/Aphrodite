import {afterEach,describe,expect,it,vi} from 'vitest';
import {deploySplit,splitPlan} from '../installer/topology.mjs';
import {configuration} from '../installer/common.mjs';
afterEach(()=>vi.unstubAllGlobals());
describe('split installer',()=>{
 it('plans one control service and multiple Worker/Pages connection services',()=>{
  const p=splitPlan({name:'my-panel',provider:'pages'});expect(p.management).toEqual({name:'my-panel-control',provider:'pages'});expect(p.connections.map(c=>c.provider)).toEqual(['workers','pages']);
  expect(()=>splitPlan({name:'my-panel',connections:'0'})).toThrow();
 });
 it('keeps database and administrator credentials exclusively on the central service',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({result:{subdomain:'test'}})));
  const calls=[];const env=configuration({adminPath:'existing-private-admin',adminToken:'existing-admin-at-least-32-characters'});
  const deploy=vi.fn(async(options,bindings,artifact)=>{calls.push({options,bindings,role:artifact.manifest.role});return {url:'https://'+options.name+'.example',database:bindings.DEPLOYMENT_ROLE==='management'?'existing-database':undefined}});
  const result=await deploySplit({name:'my-panel',provider:'pages',account:'a'.repeat(32),token:'test',databaseId:'existing-database'},env,{deploy,register:vi.fn(async()=>({ok:true}))});
  expect(result.topology).toBe('split');expect(calls.map(c=>c.role)).toEqual(['management','connection','connection']);
  expect(calls[0].options.databaseId).toBe('existing-database');expect(calls[0].bindings.ADMIN_TOKEN).toBe(env.ADMIN_TOKEN);
  for(const edge of calls.slice(1)){expect(edge.bindings.ADMIN_TOKEN).toBeUndefined();expect(edge.bindings.ADMIN_PATH).toBeUndefined();expect(edge.bindings.DB).toBeUndefined();expect(edge.options.databaseId).toBeUndefined();expect(edge.bindings.EDGE_CONTROL_TOKEN).toBe(calls[0].bindings.EDGE_CONTROL_TOKEN);}
 });
 it('stops on a blocked management deployment without provisioning connection services',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({result:{subdomain:'test'}})));
  const deploy=vi.fn(async()=>{throw Error('8000119 provider block')});
  await expect(deploySplit({name:'my-panel',provider:'pages',account:'a'.repeat(32)},configuration({}),{deploy})).rejects.toThrow('8000119');expect(deploy).toHaveBeenCalledTimes(1);
 });
});
