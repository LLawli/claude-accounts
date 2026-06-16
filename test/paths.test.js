const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

test('paths derive from CLAUDE_ACCOUNTS_HOME', () => {
  process.env.CLAUDE_ACCOUNTS_HOME = path.join('/tmp', 'h');
  const p = require('../src/paths.js');
  assert.strictEqual(p.claudeDir(), path.join('/tmp', 'h', '.claude'));
  assert.strictEqual(p.vaultDir(), path.join('/tmp', 'h', '.claude', '.accounts'));
  assert.strictEqual(p.liveCreds(), path.join('/tmp', 'h', '.claude', '.credentials.json'));
  assert.strictEqual(p.liveJson(), path.join('/tmp', 'h', '.claude.json'));
  assert.strictEqual(p.markerPath(), path.join('/tmp', 'h', '.claude', '.accounts', 'current'));
  assert.strictEqual(p.slotDir('work'), path.join('/tmp', 'h', '.claude', '.accounts', 'work'));
});
