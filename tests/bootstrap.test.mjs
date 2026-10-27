import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

for(const scenario of ['before-game','before-modules','before-descriptor','unbound-game','unassigned-game-binding','descriptor-after-init','existing-binding','deferred','retry','backoff','fatal','offline-then-success','inflight','late-start','duplicate-entry','init-error','typing']){
  test(`loader: ${scenario}`,()=>{
    assert.doesNotThrow(()=>execFileSync(process.execPath,['--experimental-vm-modules','tests/bootstrap.vm.mjs',scenario],{cwd:new URL('../',import.meta.url),stdio:'pipe'}));
  });
}
