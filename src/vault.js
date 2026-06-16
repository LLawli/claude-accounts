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

function email(name) {
  const o = readJson(p.slotOAuth(name));
  return (o && o.emailAddress) || '';
}

function deriveName(oauthAccount) {
  const e = (oauthAccount && oauthAccount.emailAddress) || '';
  const local = String(e).split('@')[0].replace(/[^A-Za-z0-9._-]/g, '');
  return local || 'default';
}

// First-run safety: register the already logged-in account as the initial slot
// so the live login is never overwritten before being saved. Idempotent: does
// nothing once a current account exists. Returns the adopted name or null.
function adoptCurrent() {
  if (getCurrent()) return null;
  if (!fs.existsSync(p.liveCreds())) return null;
  const credentialsText = fs.readFileSync(p.liveCreds(), 'utf8');
  const oauthAccount = captureOAuthFromLive() || {};
  let name = deriveName(oauthAccount);
  const existing = list();
  if (existing.includes(name)) {
    let i = 2;
    while (existing.includes(`${name}-${i}`)) i += 1;
    name = `${name}-${i}`;
  }
  writeSlot(name, { credentialsText, oauthAccount });
  setCurrent(name);
  return name;
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
  list, getCurrent, setCurrent, writeSlot, readSlot, email,
  deriveName, adoptCurrent, captureOAuthFromLive, injectOAuthIntoLive,
};
