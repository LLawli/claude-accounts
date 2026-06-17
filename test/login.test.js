const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { freshHome } = require('./helpers.js');

// Keep the watch loop fast in tests (read by login.js at require time).
process.env.CLAUDE_ACCOUNTS_CAPTURE_TIMEOUT_MS = '600';
process.env.CLAUDE_ACCOUNTS_CAPTURE_STABILIZE_MS = '15';
process.env.CLAUDE_ACCOUNTS_CAPTURE_POLL_MS = '8';

const setup = () => freshHome({ accounts: true, bust: ['vault', 'login', 'paths', 'fsutil'] });

// A fake ChildProcess: optionally writes files (now or after a delay) and exits.
function fakeChild({ write, writeAfter, exitAfter } = {}) {
  const ee = new EventEmitter();
  ee.kill = () => {};
  if (writeAfter != null) setTimeout(() => { if (write) write(); }, writeAfter);
  else if (write) write();
  if (exitAfter != null) setTimeout(() => ee.emit('exit', 0), exitAfter);
  return ee;
}
const writeLogin = (cfgDir, email) => () => {
  fs.writeFileSync(path.join(cfgDir, '.credentials.json'), '{"claudeAiOauth":{"accessToken":"NEW"}}');
  fs.writeFileSync(path.join(cfgDir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email } }));
};

test('addAccount captures creds written by the spawned login', async () => {
  setup();
  const { addAccount } = require('../src/login.js');
  const r = await addAccount('newacct', { spawnFn: (cfgDir) => { writeLogin(cfgDir, 'new@x.com')(); return { status: 0 }; } });
  assert.strictEqual(r.added, true);
  assert.strictEqual(r.email, 'new@x.com');
  const vault = require('../src/vault.js');
  assert.ok(vault.list().includes('newacct'));
  assert.strictEqual(vault.readSlot('newacct').oauthAccount.emailAddress, 'new@x.com');
});

test('addAccount waits for the credential file to appear mid-session (no /exit)', async () => {
  setup();
  const { addAccount } = require('../src/login.js');
  const r = await addAccount('later', { spawnFn: (cfgDir) => fakeChild({ write: writeLogin(cfgDir, 'later@x.com'), writeAfter: 40 }) });
  assert.strictEqual(r.added, true);
  assert.strictEqual(r.email, 'later@x.com');
});

test('addAccount reports no-credentials when the login exits without writing them', async () => {
  setup();
  const { addAccount } = require('../src/login.js');
  const r = await addAccount('aborted', { spawnFn: () => fakeChild({ exitAfter: 5 }) });
  assert.strictEqual(r.added, false);
  assert.strictEqual(r.reason, 'no-credentials');
  assert.ok(!require('../src/vault.js').list().includes('aborted'));
});

test('addAccount flags keyring when login writes an identity but no credential file', async () => {
  setup();
  const { addAccount } = require('../src/login.js');
  const r = await addAccount('keyacct', {
    spawnFn: (cfgDir) => fakeChild({
      write: () => fs.writeFileSync(path.join(cfgDir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'k@x.com' } })),
      exitAfter: 5,
    }),
  });
  assert.strictEqual(r.added, false);
  assert.strictEqual(r.reason, 'keyring');
  assert.strictEqual(r.keyringSuspected, true);
});

test('addAccount rejects duplicate name', async () => {
  setup();
  const vault = require('../src/vault.js');
  vault.writeSlot('dup', { credentialsText: '{}', oauthAccount: {} });
  const { addAccount } = require('../src/login.js');
  await assert.rejects(() => addAccount('dup', { spawnFn: () => ({ status: 0 }) }), /dup/);
});
