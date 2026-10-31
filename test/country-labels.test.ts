import {expect,it} from 'vitest';
import {configuredCountries,countryLabel,nativeLinks} from '../src/native-subscription';
import {cleanSubscriptionName} from '../src/subscription-addresses';
import {nativeDefaults} from '../src/native-types';
it('keeps Smart first and includes only configured country paths with targets',()=>{
 const routes={'/edge/ca':['fixture'],'/edge/ir':['fixture'],'/edge/gb':[],'/edge/native':['fixture']};
 expect(configuredCountries(routes,true)).toEqual(['smart','ca','ir']);
 expect(configuredCountries(routes,false)).toEqual(['smart']);
});
it('preserves additional country names and paths in actual subscription links',()=>{
 const account={username:'fixture',uuid:'11111111-1111-4111-a111-111111111111',enabled:1,expires_at:null,settings_json:JSON.stringify(nativeDefaults),revision:1,created_at:1,updated_at:1};
 for(const country of ['ca','ch','ar','vn','jp','gb','tr']){
  const u=new URL(nativeLinks(account,'fixture.example',1000,[country])[0]!);
  expect(u.searchParams.get('path')).toBe('/edge/native/'+country);
  expect(decodeURIComponent(u.hash)).toContain(countryLabel(country).split(' ')[0]);
  expect(cleanSubscriptionName(countryLabel(country))).not.toBe('اتصال');
 }
});
it('renders country names and flags, including routes outside the old fixed list',()=>{
 expect(countryLabel('ca')).toBe('🇨🇦 Canada');expect(countryLabel('ir')).toContain('🇮🇷');expect(countryLabel('smart')).toContain('Smart');
});
