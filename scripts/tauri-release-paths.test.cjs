const assert = require('node:assert/strict');
const { join } = require('node:path');
const {
  ROOT,
  productName,
  tauriNsisDirectory,
  listExes,
} = require('./_shared.cjs');

assert.equal(productName(), 'SteamImageBrowser');
assert.equal(
  tauriNsisDirectory(),
  join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis'),
);
assert.notEqual(tauriNsisDirectory(), join(ROOT, 'release'));
assert.deepEqual(listExes(join(ROOT, '__missing-tauri-output__')), []);
console.log('tauri release path assertions passed');
