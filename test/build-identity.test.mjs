import {it,expect} from 'vitest';
import {buildArtifact} from '../installer/build.mjs';
it('derives a stable per-project build identity and changes it only when identity inputs change',async()=>{
 const a=await buildArtifact('workers',{role:'management',identity:'project|example.test|pages|standalone'});
 const b=await buildArtifact('workers',{role:'management',identity:'project|example.test|pages|standalone'});
 const c=await buildArtifact('workers',{role:'management',identity:'project|other.test|pages|standalone'});
 expect(a.manifest.buildIdentity).toBe(b.manifest.buildIdentity);expect(a.manifest.sourceFingerprint).toBe(b.manifest.sourceFingerprint);expect(a.manifest.buildIdentity).not.toBe(c.manifest.buildIdentity);
});
