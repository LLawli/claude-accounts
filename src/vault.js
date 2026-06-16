'use strict';
const fs = require('node:fs');
const path = require('node:path');
const p = require('./paths.js');
const { atomicWrite, readJson, chmodSafe } = require('./fsutil.js');
const { withLock } = require('./lock.js');
const { t } = require('./i18n.js');

// Names whose slot dir would collide with a control file in the vault: the
// marker (vaultDir/current) and the lock (vaultDir/.lock). Creating or removing
// a slot with these names would corrupt the current-account tracking.
const RESERVED = new Set(['current', '.lock']);

function validAccountName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9._-]+$/.test(name) && !RESERVED.has(name);
}

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

function clearCurrent() {
  try { fs.rmSync(p.markerPath(), { force: true }); } catch { /* nothing to clear */ }
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
  // Tolerant: a corrupt slot oauth file must not crash `list`/menu rendering.
  try {
    const o = readJson(p.slotOAuth(name));
    return (o && o.emailAddress) || '';
  } catch {
    return '';
  }
}

function deriveName(oauthAccount) {
  const e = (oauthAccount && oauthAccount.emailAddress) || '';
  const local = String(e).split('@')[0].replace(/[^A-Za-z0-9._-]/g, '');
  return local || 'default';
}

function uniqueName(base, taken) {
  const blocked = (n) => taken.includes(n) || RESERVED.has(n);
  if (!blocked(base)) return base;
  let i = 2;
  while (blocked(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

// Read ~/.claude.json. Returns {} when the file is absent, but THROWS when it
// exists yet is unparseable: callers that rewrite the whole file (the crown-jewel
// config holding projects/history/settings) must never replace it from an empty
// object, which would silently destroy every other key.
function readLiveJson() {
  if (!fs.existsSync(p.liveJson())) return {};
  const raw = fs.readFileSync(p.liveJson(), 'utf8');
  try {
    return JSON.parse(raw) || {};
  } catch (e) {
    throw new Error(`refusing to modify ${p.liveJson()}: not valid JSON (${e.message})`);
  }
}

function captureOAuthFromLive() {
  // Tolerant: used by read/adopt paths, which must degrade rather than crash if
  // ~/.claude.json is mid-write or corrupt. The destructive write path uses
  // readLiveJson() directly so it still refuses to clobber a corrupt file.
  try {
    return readLiveJson().oauthAccount || null;
  } catch {
    return null;
  }
}

function injectOAuthIntoLive(oauthAccount) {
  const j = readLiveJson();
  j.oauthAccount = oauthAccount;
  atomicWrite(p.liveJson(), JSON.stringify(j, null, 2));
}

// Decide which slot the *currently live* login belongs to. We key off identity
// (the live oauth email), NOT the marker, so a stale or dangling marker (e.g.
// after a crash mid-switch, or after removing the active account) can never make
// us save the live tokens into the wrong account's slot.
function resolveCurrentSlot(liveOAuth) {
  const liveEmail = liveOAuth && liveOAuth.emailAddress;
  const slots = list();
  if (liveEmail) {
    const match = slots.find((n) => email(n) === liveEmail);
    if (match) return { name: match, existing: true };
  } else {
    const cur = getCurrent();
    if (cur && slots.includes(cur)) return { name: cur, existing: true };
  }
  return { name: uniqueName(deriveName(liveOAuth || {}), slots), existing: false };
}

// Capture the live login into the vault slot that matches its identity. Returns
// the slot name, or null if there is no live login to save. Caller holds the
// lock; this never overwrites the live files.
function saveCurrentLogin() {
  if (!fs.existsSync(p.liveCreds())) return null;
  const credentialsText = fs.readFileSync(p.liveCreds(), 'utf8');
  const liveOAuth = captureOAuthFromLive();
  const { name, existing } = resolveCurrentSlot(liveOAuth);
  let kept = null;
  if (existing) {
    try { kept = readJson(p.slotOAuth(name)); } catch { kept = null; }
  }
  const oauthAccount = liveOAuth || kept || {};
  writeSlot(name, { credentialsText, oauthAccount });
  return name;
}

// First-run safety: register the already logged-in account as the initial slot
// so the live login is never overwritten before being saved. Idempotent: does
// nothing once a current account exists. Returns the adopted name or null.
function adoptCurrent() {
  if (getCurrent()) return null;
  if (!fs.existsSync(p.liveCreds())) return null;
  return withLock(p.lockPath(), () => {
    if (getCurrent()) return null; // re-check under lock
    const name = saveCurrentLogin();
    if (name) setCurrent(name);
    return name;
  });
}

// Delete a stored account. Validates the name and confirms the resolved path
// stays inside the vault (defends against `remove ..` / `remove .` wiping
// ~/.claude or the home dir), and clears the marker when the active account is
// removed so the next run's adoptCurrent re-captures the still-live login.
function removeAccount(name) {
  if (!validAccountName(name)) {
    throw new Error(t('invalidName', name));
  }
  return withLock(p.lockPath(), () => {
    const dir = path.resolve(p.slotDir(name));
    const root = path.resolve(p.vaultDir());
    if (dir === root || !dir.startsWith(root + path.sep)) {
      throw new Error(t('invalidName', name));
    }
    const existed = fs.existsSync(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    if (getCurrent() === name) clearCurrent();
    return { removed: existed, account: name };
  });
}

module.exports = {
  list, getCurrent, setCurrent, clearCurrent, writeSlot, readSlot, email,
  deriveName, adoptCurrent, captureOAuthFromLive, injectOAuthIntoLive,
  readLiveJson, saveCurrentLogin, removeAccount, validAccountName,
};
