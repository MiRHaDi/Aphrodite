import {describe,expect,it} from 'vitest';
import {terminalText,textMode} from '../installer/terminal-text.mjs';
import {interfaceFor} from '../installer/ui.mjs';
const visual={mode:'visual',isTTY:true,columns:200};
describe('Persian terminal compatibility',()=>{
 it('joins Persian letters and reorders them for an LTR terminal',()=>{
  expect(terminalText('سلام',visual)).toBe('ﻡﻼﺳ');
  expect(terminalText('آزمون',visual)).toContain('ﺁ');
  expect(terminalText('پیش‌نیازها',visual)).toContain('\u200c');
 });
 it('preserves URLs, tokens, Latin words, numbers and emoji',()=>{
  for(const value of ['API (3/12)','https://example.com/a?x=1&y=2','AbC_012-xyz','🇮🇷'])expect(terminalText('مدیریت '+value,visual)).toContain(value);
  expect(terminalText('AbC_012-xyz',visual)).toBe('AbC_012-xyz');
 });
 it('keeps native terminals, HTML text and redirected logs in logical order',()=>{
  const text='سلام API';
  expect(terminalText(text,{mode:'native',isTTY:true})).toBe(text);
  expect(terminalText(text,{mode:'visual',isTTY:false})).toBe(text);
  expect(textMode({mode:'auto',isTTY:true,platform:'win32'})).toBe('visual');
  expect(textMode({mode:'auto',isTTY:true,platform:'linux'})).toBe('native');
  expect(()=>textMode({mode:'unknown'})).toThrow('APHRODITE_RTL');
 });
 it('formats labels once and wraps logical paragraphs before reordering',()=>{
  const ui=interfaceFor('fa',{output:{isTTY:true,columns:200},rtlMode:'visual'});
  const label=ui.pick('Hello','سلام');expect(label).toBe('ﻡﻼﺳ');expect(terminalText(label,visual)).toBe(label);
  const wrapped=terminalText('سلام '.repeat(30),{...visual,columns:50});
  expect(wrapped.split('\n').length).toBeGreaterThan(1);
  expect(wrapped.split('\n').every(line=>line.length<=30)).toBe(true);
 });
});
