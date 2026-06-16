const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function setup() {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  process.env.CLAUDE_ACCOUNTS_HOME = h;
  fs.mkdirSync(path.join(h, '.claude', '.accounts'), { recursive: true });
  for (const m of ['vault', 'switch', 'paths', 'fsutil']) {
    delete require.cache[require.resolve(`../src/${m}.js`)];
  }
  return h;
}

test('switch loads target creds + oauth and updates marker', () => {
  const h = setup();
  const vault = require('../src/vault.js');
  vault.writeSlot('work', { credentialsText: '{"tok":"W"}', oauthAccount: { emailAddress: 'w@x.com' } });
  vault.writeSlot('home', { credentialsText: '{"tok":"H"}', oauthAccount: { emailAddress: 'h@x.com' } });
  fs.writeFileSync(path.join(h, '.claude', '.credentials.json'), '{"tok":"W"}');
  fs.writeFileSync(path.join(h, '.claude.json'), JSON.stringify({ keep: 1, oauthAccount: { emailAddress: 'w@x.com' } }));
  vault.setCurrent('work');

  const { switchAccount } = require('../src/switch.js');
  const r = switchAccount('home');
  assert.strictEqual(r.switched, true);
  assert.strictEqual(fs.readFileSync(path.join(h, '.claude', '.credentials.json'), 'utf8'), '{"tok":"H"}');
  const live = JSON.parse(fs.readFileSync(path.join(h, '.claude.json'), 'utf8'));
  assert.strictEqual(live.oauthAccount.emailAddress, 'h@x.com');
  assert.strictEqual(live.keep, 1);
  assert.strictEqual(vault.getCurrent(), 'home');
});

test('switch saves current login back before loading target', () => {
  const h = setup();
  const vault = require('../src/vault.js');
  vault.writeSlot('work', { credentialsText: '{"tok":"OLD"}', oauthAccount: { emailAddress: 'w@x.com' } });
  vault.writeSlot('home', { credentialsText: '{"tok":"H"}', oauthAccount: { emailAddress: 'h@x.com' } });
  fs.writeFileSync(path.join(h, '.claude', '.credentials.json'), '{"tok":"REFRESHED"}');
  fs.writeFileSync(path.join(h, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'w@x.com' } }));
  vault.setCurrent('work');

  require('../src/switch.js').switchAccount('home');
  assert.strictEqual(vault.readSlot('work').credentialsText, '{"tok":"REFRESHED"}');
});

test('switch to current is a no-op', () => {
  const h = setup();
  const vault = require('../src/vault.js');
  vault.writeSlot('work', { credentialsText: '{"tok":"W"}', oauthAccount: { emailAddress: 'w@x.com' } });
  vault.setCurrent('work');
  const r = require('../src/switch.js').switchAccount('work');
  assert.strictEqual(r.switched, false);
  assert.strictEqual(r.reason, 'already-current');
});

test('switch to unknown account throws', () => {
  setup();
  const vault = require('../src/vault.js');
  vault.writeSlot('work', { credentialsText: '{}', oauthAccount: {} });
  assert.throws(() => require('../src/switch.js').switchAccount('ghost'), /ghost/);
});
