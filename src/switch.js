'use strict';
const fs = require('node:fs');
const p = require('./paths.js');
const vault = require('./vault.js');
const { atomicWrite, chmodSafe } = require('./fsutil.js');

function switchAccount(target) {
  if (!vault.list().includes(target)) {
    throw new Error(`conta desconhecida no cofre: '${target}'`);
  }
  const current = vault.getCurrent();
  if (current === target) {
    return { switched: false, reason: 'already-current', account: target };
  }

  if (current && vault.list().includes(current)) {
    if (fs.existsSync(p.liveCreds())) {
      vault.writeSlot(current, {
        credentialsText: fs.readFileSync(p.liveCreds(), 'utf8'),
        oauthAccount: vault.captureOAuthFromLive() || {},
      });
    }
  }

  const slot = vault.readSlot(target);
  atomicWrite(p.liveCreds(), slot.credentialsText);
  chmodSafe(p.liveCreds(), 0o600);
  vault.injectOAuthIntoLive(slot.oauthAccount || {});

  vault.setCurrent(target);
  return { switched: true, account: target, email: (slot.oauthAccount || {}).emailAddress || null };
}

module.exports = { switchAccount };
