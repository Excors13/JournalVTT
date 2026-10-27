import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('the standalone runtime starts after ready exactly once, preserves the early bind and needs no external JS imports',()=>{
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--experimental-vm-modules','tests/runtime.vm.mjs'],{cwd:new URL('../',import.meta.url),stdio:'pipe'}));
});
test('entry before game exists reaches actual runtime settings and menus after ready with one import',()=>{
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--experimental-vm-modules','tests/runtime.vm.mjs','early-bootstrap'],{cwd:new URL('../',import.meta.url),stdio:'pipe'}));
});
