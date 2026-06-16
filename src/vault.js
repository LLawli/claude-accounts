'use strict';
const fs = require('node:fs');
const p = require('./paths.js');
const { atomicWrite, readJson, chmodSafe } = require('./fsutil.js');

function list() {
  if (!fs.existsSync(p.vaultDir())) return [];
  return fs.readdirSync(p.vaultDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function getCurrent() {
  if (!fs.existsSync(p.markerPath())) return null;
  const v = fs.readFileSync(p.markerPath(), 'utf8').trim();
  return v || null;
}

function setCurrent(name) {
  atomicWrite(p.markerPath(), name);
}

function writeSlot(name, { credentialsText, oauthAccount }) {
  atomicWrite(p.slotCreds(name), credentialsText);
  atomicWrite(p.slotOAuth(name), JSON.stringify(oauthAccount, null, 2));
  chmodSafe(p.slotDir(name), 0o700);
  chmodSafe(p.slotCreds(name), 0o600);
  chmodSafe(p.slotOAuth(name), 0o600);
}

function readSlot(name) {
  return {
    credentialsText: fs.readFileSync(p.slotCreds(name), 'utf8'),
    oauthAccount: readJson(p.slotOAuth(name)),
  };
}

function captureOAuthFromLive() {
  const j = readJson(p.liveJson());
  return j ? (j.oauthAccount || null) : null;
}

function injectOAuthIntoLive(oauthAccount) {
  const j = readJson(p.liveJson()) || {};
  j.oauthAccount = oauthAccount;
  atomicWrite(p.liveJson(), JSON.stringify(j, null, 2));
}

module.exports = {
  list, getCurrent, setCurrent, writeSlot, readSlot,
  captureOAuthFromLive, injectOAuthIntoLive,
};
