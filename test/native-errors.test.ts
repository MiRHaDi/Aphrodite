import {it,expect} from 'vitest';
import {transportFailure} from '../src/native-errors';
it('distinguishes provider rejection, missing transport and DNS without leaking exception contents',()=>{
 expect(transportFailure(new Error('proxy request failed, cannot connect to the specified address secret-value'),'destination').code).toBe('DESTINATION_REJECTED');
 expect(transportFailure(new Error('Socket transport is not configured'),'destination').code).toBe('TRANSPORT_NOT_CONFIGURED');
 expect(transportFailure(new Error('Destination lookup failed'),'destination').code).toBe('DNS_FAILED');
 expect(JSON.stringify(transportFailure(new Error('password=secret-value https://private.example/path'),'destination'))).not.toContain('secret-value');
 expect(transportFailure(new Error('internal SQL user data'),'accounting').code).toBe('ACCOUNTING_FAILED');
});
