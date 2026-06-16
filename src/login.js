'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vault = require('./vault.js');
const { readJson } = require('./fsutil.js');
const { resolveRealClaude } = require('./claude-path.js');

function defaultSpawn(cfgDir) {
  const claude = resolveRealClaude();
  return cp.spawnSync(claude, [], {
    stdio: 'inherit',
    env: { ...process.env, CLAUDE_CONFIG_DIR: cfgDir },
    shell: false,
  });
}

async function addAccount(name, { spawnFn = defaultSpawn } = {}) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`nome invalido: '${name}'`);
  if (vault.list().includes(name)) throw new Error(`conta '${name}' ja existe`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-login-'));
  try {
    spawnFn(tmp);
    const credPath = path.join(tmp, '.credentials.json');
    const jsonPath = path.join(tmp, '.claude.json');
    if (!fs.existsSync(credPath)) return { added: false, reason: 'no-credentials' };
    const credentialsText = fs.readFileSync(credPath, 'utf8');
    const liveJson = readJson(jsonPath) || {};
    vault.writeSlot(name, { credentialsText, oauthAccount: liveJson.oauthAccount || {} });
    return { added: true, account: name, email: (liveJson.oauthAccount || {}).emailAddress || null };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { addAccount };
