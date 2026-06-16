'use strict';
const fs = require('node:fs');
const path = require('node:path');

function atomicWrite(dest, body) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, dest);
}

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function chmodSafe(p, mode) {
  if (process.platform === 'win32') return;
  try { fs.chmodSync(p, mode); } catch (_) {}
}

module.exports = { atomicWrite, readJson, chmodSafe };
