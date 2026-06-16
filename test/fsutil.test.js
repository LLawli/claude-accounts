const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const u = require('../src/fsutil.js');

test('atomicWrite writes content and readJson round-trips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsutil-'));
  const f = path.join(dir, 'a.json');
  u.atomicWrite(f, JSON.stringify({ x: 1 }));
  assert.deepStrictEqual(u.readJson(f), { x: 1 });
});

test('readJson returns null for missing file', () => {
  assert.strictEqual(u.readJson(path.join(os.tmpdir(), 'nope-xyz.json')), null);
});
