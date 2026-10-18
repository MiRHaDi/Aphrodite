import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),deploy:vi.fn(async()=>({mutations:false})),log:vi.fn()}));
vi.mock('../installer/wizard.mjs',()=>({prepareInstall:mocks.prepare}));
vi.mock('../installer/topology.mjs',()=>({deploySplit:mocks.deploy}));
vi.mock('../installer/ui.mjs',()=>({interfaceFor:()=>({banner:()=>{},detail:()=>{},step:()=>{},close:()=>{}}),terminalLink:x=>x}));
const originalArgv=process.argv;
beforeEach(()=>{vi.resetModules();mocks.deploy.mockClear();vi.spyOn(console,'log').mockImplementation(mocks.log);mocks.prepare.mockResolvedValue({env:{},options:{name:'local-fixture',databaseId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',connections:3,connectionProviders:'pages'},provider:'workers',topology:'split'});});
afterEach(()=>{process.argv=originalArgv;vi.restoreAllMocks();});
it.each([undefined,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'])('preserves the saved database or applies only its explicit CLI override (%s)',async override=>{
  process.argv=[originalArgv[0],'installer/cli.mjs','--provider','workers','--preview',...(override?['--database-id',override]:[])];
  await import('../installer/cli.mjs');
  expect(mocks.deploy).toHaveBeenCalledOnce();
  expect(mocks.deploy.mock.calls[0][0]).toMatchObject({databaseId:override||'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',connections:3,connectionProviders:'pages'});
});
