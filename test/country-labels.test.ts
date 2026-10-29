import {expect,it} from 'vitest';
import {configuredCountries,countryLabel} from '../src/native-subscription';
it('keeps Smart first and includes only configured country paths with targets',()=>{
 const routes={'/edge/ca':['fixture'],'/edge/ir':['fixture'],'/edge/gb':[],'/edge/native':['fixture']};
 expect(configuredCountries(routes,true)).toEqual(['smart','ca','ir']);
 expect(configuredCountries(routes,false)).toEqual(['smart']);
});
it('renders country names and flags, including routes outside the old fixed list',()=>{
 expect(countryLabel('ca')).toBe('🇨🇦 Canada');expect(countryLabel('ir')).toContain('🇮🇷');expect(countryLabel('smart')).toContain('Smart');
});
