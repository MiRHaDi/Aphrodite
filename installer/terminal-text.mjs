import reshaper from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';
const bidi=bidiFactory();

export function textMode({mode=process.env.APHRODITE_RTL||'auto',isTTY=process.stdout.isTTY,platform=process.platform}={}){
 if(!['auto','visual','native'].includes(mode))throw Error('APHRODITE_RTL must be auto, visual or native');
 // Redirected logs and browser HTML must retain logical Unicode order.
 return !isTTY?'native':mode==='auto'?(platform==='win32'?'visual':'native'):mode;
}

export function terminalText(text,options={}){
 if(textMode(options)!=='visual'||!/[\u0600-\u06ff]/u.test(text)||/[\ufb50-\ufdff\ufe70-\ufeff]/u.test(text))return text;
 // Wrap logical words first; terminal soft wrapping after reordering can split
 // Persian paragraphs in the wrong order. Leave long ASCII links intact.
 const width=Math.max(20,(options.columns||process.stdout.columns||80)-20);
 const lines=text.split('\n').flatMap(line=>{
  const result=[];let current='';
  for(const word of line.split(' ')){
   if(current&&[...current+' '+word].length>width){result.push(current);current=word;}
   else current+=(current?' ':'')+word;
  }
  return [...result,current];
 });
 return lines.map(line=>{
  const normalized=line.replace(/ل[أإآ]/gu,match=>match.normalize('NFD'));
  const shaped=reshaper.PersianShaper.convertArabic(normalized);
  // bidi-js indexes UTF-16; protect supplementary characters (e.g. emoji).
  const replacements=new Map();let point=0xe000;
  const safe=shaped.replace(/[\u{10000}-\u{10ffff}]/gu,char=>{
   while(shaped.includes(String.fromCharCode(point)))point++;
   const placeholder=String.fromCharCode(point++);replacements.set(placeholder,char);return placeholder;
  });
  const ordered=bidi.getReorderedString(safe,bidi.getEmbeddingLevels(safe,'ltr'));
  return [...ordered].map(char=>replacements.get(char)||char).join('');
 }).join('\n');
}
