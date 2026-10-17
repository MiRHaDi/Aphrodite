import {afterEach,describe,expect,it,vi} from 'vitest';
import {PassThrough,Writable} from 'node:stream';
import {interfaceFor,cloudflareTokenUrl} from '../installer/ui.mjs';
import {resultCard,resultHtml} from '../installer/result-card.mjs';
afterEach(()=>vi.restoreAllMocks());
describe('installer user experience',()=>{
 it('selects a lettered destination directly with one Enter and no language prompt',async()=>{
  const input=new PassThrough();input.isTTY=true;let text='';const output=new Writable({write(chunk,enc,done){text+=chunk;done()}});output.isTTY=true;
  const ui=interfaceFor({input,output});
  try{const answer=ui.provider();input.write('B\r\n');expect(await answer).toBe('pages');expect(text).toContain('Destination [A]');expect(text).not.toContain('Language');}finally{ui.close();input.destroy();output.destroy()}
 });
 it('accepts sequential visible token input with one Enter and no empty pre-prompt',async()=>{
  const input=new PassThrough();input.isTTY=true;let text='';const output=new Writable({write(chunk,enc,done){text+=chunk;done()}});output.isTTY=true;
  const ui=interfaceFor({input,output});
  try{let answer=ui.ask('Destination');input.write('2\r\n');expect(await answer).toBe('2');answer=ui.ask('Provider API token');input.write('visible-fake-token\r\n');expect(await answer).toBe('visible-fake-token');expect(text).toContain('visible-fake-token');expect(text.match(/Provider API token/g)).toHaveLength(1)}finally{ui.close();input.destroy();output.destroy()}
 });
 it('provides the requested Cloudflare permission template',()=>{
  const url=new URL(cloudflareTokenUrl);expect(url.origin).toBe('https://dash.cloudflare.com');expect(url.searchParams.get('name')).toBe('Aphrodite');expect(JSON.parse(url.searchParams.get('permissionGroupKeys'))).toHaveLength(15);expect(url.searchParams.get('accountId')).toBe('*');expect(url.searchParams.get('zoneId')).toBe('all');
 });
 it('serves a private result only on its random loopback path without putting the token in the URL',async()=>{
  const card=await resultCard({management:'https://panel.example/private',token:'local-fake-secret',connections:['https://edge.example']});
  try{expect(card.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}$/);expect(card.url).not.toContain('local-fake-secret');const response=await fetch(card.url);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");const html=await response.text();expect(html).toContain('navigator.clipboard.writeText');expect(html).toContain('https://panel.example/private');expect((await fetch(new URL('/',card.url))).status).toBe(404)}finally{await card.close()}
 });
 it('escapes credential text and rejects executable destination URLs',()=>{
  const html=resultHtml({management:'https://panel.example/',token:'<script>alert(1)</script>'},'nonce');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>alert');expect(()=>resultHtml({management:'javascript:alert(1)',token:'fake'},'nonce')).toThrow('Invalid result URL');
 });
});
