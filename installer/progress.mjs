let reporter;
const translations={
 'Build management service':'ساخت سرویس مدیریت',
 'Build connection service':'ساخت سرویس اتصال',
 'Deploy management service':'استقرار سرویس مدیریت',
 'Build and deploy separate services':'ساخت و استقرار سرویس‌های جداگانه',
 'Build deployment bundle':'ساخت خروجی استقرار',
 'Check deployment name':'بررسی آزاد بودن نام استقرار',
 'Database configuration':'تنظیم دیتابیس',
 'Upload Worker and bindings':'آپلود ورکر و تنظیم اتصال منابع',
 'Create Pages project and bindings':'ساخت پیج و تنظیم اتصال منابع',
 'Upload Pages and provider build':'آپلود پیج و ساخت در ارائه‌دهنده',
 'Check Docker daemon':'بررسی سرویس داکر',
 'Build container image':'ساخت ایمیج کانتینر',
 'Start container and persistent volume':'راه‌اندازی کانتینر و فضای ذخیره‌سازی پایدار',
 'Connect SSH and verify host fingerprint':'اتصال SSH و بررسی اثر انگشت سرور',
 'Install remote prerequisites':'نصب پیش‌نیازهای سرور',
 'Start remote service':'راه‌اندازی سرویس روی سرور',
 'Railway CLI and source upload':'آماده‌سازی ابزار Railway و آپلود سورس',
 'Create Render service and persistent disk':'ساخت سرویس Render و دیسک پایدار'
};
export function setProgressReporter(value){reporter=value;}
export function report(en,fa,level='info'){reporter?.({en,fa:translations[fa]||fa,level,time:new Date()});}
export async function activity(en,fa,operation,{interval=5000}={}){
 fa=translations[fa]||fa;
 const start=Date.now();report(en,fa,'start');
 const timer=setInterval(()=>report(en+' · still working ('+Math.floor((Date.now()-start)/1000)+'s)',fa+' · در حال انجام ('+Math.floor((Date.now()-start)/1000)+' ثانیه)','waiting'),interval);
 timer.unref?.();
 try{const value=await operation();report(en+' · completed ('+((Date.now()-start)/1000).toFixed(1)+'s)',fa+' · انجام شد ('+((Date.now()-start)/1000).toFixed(1)+' ثانیه)','done');return value;}
 catch(error){report(en+' · failed',fa+' · ناموفق','error');throw error;}
 finally{clearInterval(timer);}
}
// Fixed categories only: never log URL paths, queries, bodies or credentials.
export function requestLabel(url,method){
 const path=new URL(url).pathname;
 const kind=path.includes('/dns_records')?'DNS':path.includes('/d1/')?'D1':path.includes('/pages/')?'Pages':path.includes('/workers/')?'Workers':'provider';
 return method+' '+kind+' API';
}
