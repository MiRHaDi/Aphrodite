import {expect,it} from 'vitest';
import {configureBuildRuntime} from '../installer/build-runtime.mjs';
it('bounds Windows build children without overriding operator settings',()=>{
 const defaults={};configureBuildRuntime(defaults,'win32');expect(defaults).toEqual({GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'});
 const custom={GOMAXPROCS:'4',GOMEMLIMIT:'512MiB'};configureBuildRuntime(custom,'win32');expect(custom).toEqual({GOMAXPROCS:'4',GOMEMLIMIT:'512MiB'});
 const linux={};configureBuildRuntime(linux,'linux');expect(linux).toEqual({});
});
