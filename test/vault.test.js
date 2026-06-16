const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshHome() {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-home-'));
  process.env.CLAUDE_ACCOUNTS_HOME = h;
  fs.mkdirSync(path.join(h, '.claude'), { recursive: true });
  return h;
}

beforeEach(() => { delete require.cache[require.resolve('../src/vault.js')]; });

test('writeSlot then readSlot round-trips', () => {
  freshHome();
  const vault = require('../src/vault.js');
  vault.writeSlot('work', { credentialsText: '{"claudeAiOauth":{"accessToken":"T"}}', oauthAccount: { emailAddress: 'w@x.com' } });
  const slot = vault.readSlot('work');
  assert.match(slot.credentialsText, /accessToken/);
  assert.strictEqual(slot.oauthAccount.emailAddress, 'w@x.com');
  assert.deepStrictEqual(vault.list(), ['work']);
});

test('marker get/set', () => {
  freshHome();
  const vault = require('../src/vault.js');
  assert.strictEqual(vault.getCurrent(), null);
  fs.mkdirSync(require('../src/paths.js').vaultDir(), { recursive: true });
  vault.setCurrent('work');
  assert.strictEqual(vault.getCurrent(), 'work');
});

test('injectOAuthIntoLive preserves other keys', () => {
  const h = freshHome();
  fs.writeFileSync(path.join(h, '.claude.json'),
    JSON.stringify({ keep: 1, oauthAccount: { emailAddress: 'old@x.com' }, also: 'yes' }));
  const vault = require('../src/vault.js');
  vault.injectOAuthIntoLive({ emailAddress: 'new@x.com' });
  const j = JSON.parse(fs.readFileSync(path.join(h, '.claude.json'), 'utf8'));
  assert.strictEqual(j.oauthAccount.emailAddress, 'new@x.com');
  assert.strictEqual(j.keep, 1);
  assert.strictEqual(j.also, 'yes');
});

test('captureOAuthFromLive reads live oauthAccount', () => {
  const h = freshHome();
  fs.writeFileSync(path.join(h, '.claude.json'),
    JSON.stringify({ oauthAccount: { emailAddress: 'cap@x.com' } }));
  const vault = require('../src/vault.js');
  assert.strictEqual(vault.captureOAuthFromLive().emailAddress, 'cap@x.com');
});
