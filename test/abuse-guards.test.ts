import {afterEach,describe,expect,it,vi} from 'vitest';
import {connectDestination,publicAddress,resolvePublic,type NativeSocket} from '../src/native-network';
afterEach(()=>vi.unstubAllGlobals());
describe('destination abuse guards',()=>{
 it('rejects reserved, translation and transition destinations',()=>{
  for(const ip of ['::127.0.0.1','::ffff:7f00:1','64:ff9b::a00:1','2002:7f00:1::','2001:0::1','2001:db8::1','3fff::1','198.18.0.1','192.0.2.1','203.0.113.1','255.255.255.255'])expect(publicAddress(ip),ip).toBe(false);
  for(const ip of ['1.1.1.1','8.8.8.8','2606:4700::1111','2a00:1450:4001::200e'])expect(publicAddress(ip),ip).toBe(true);
 });
 it('rejects SMTP delivery before DNS or outbound socket activity',async()=>{
  const fetch=vi.fn(),factory=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(connectDestination('example.com',25,undefined,undefined,factory)).rejects.toThrow('SMTP');
  expect(fetch).not.toHaveBeenCalled();expect(factory).not.toHaveBeenCalled();
 });
 it('does not resolve private DNS answers into an outbound connection',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({Answer:[{type:1,data:'10.0.0.1',TTL:60}]})));
  await expect(resolvePublic('private-answer.example')).rejects.toThrow('lookup failed');
 });
 it('pins the validated public destination through HTTP CONNECT proxies',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({Answer:[{type:1,data:'1.1.1.1',TTL:60}]})));
  const writes:Uint8Array[]=[];
  const socket:NativeSocket={opened:Promise.resolve(),closed:Promise.resolve(),close:async()=>{},readable:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('HTTP/1.1 200 OK\r\n\r\n'));c.close()}}),writable:new WritableStream({write(x){writes.push(x)}})};
  const factory=vi.fn().mockResolvedValue(socket);
  const result=await connectDestination('pinned.example',443,'http://8.8.8.8:8080',undefined,factory);
  expect(factory).toHaveBeenCalledWith('8.8.8.8',8080,false);
  expect(new TextDecoder().decode(writes[0])).toContain('CONNECT 1.1.1.1:443 HTTP/1.1');
  result.reader.releaseLock();result.writer.releaseLock();
 });
});
