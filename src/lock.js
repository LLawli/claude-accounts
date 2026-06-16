'use strict';
const fs = require('node:fs');
const path = require('node:path');

// A cross-process advisory lock for the vault's critical sections (switch / add /
// remove / adopt). The whole point of claude-accounts is to swap the live login
// in place; two invocations racing each other can otherwise interleave their
// save-then-load steps and contaminate a slot with another account's tokens.
// O_EXCL create is the portable atomic "test-and-set"; a stale lock (left by a
// crashed process) is stolen once it ages past STALE_MS so we never deadlock.
const STALE_MS = 15_000;
const POLL_MS = 25;

function sleep(ms) {
  // Synchronous sleep without a busy loop; the vault API is sync end to end.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquire(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const start = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx'); // O_CREAT | O_EXCL
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let age = Infinity;
    try {
      age = Date.now() - fs.statSync(lockPath).mtimeMs;
    } catch {
      continue; // holder released it between open and stat; retry immediately
    }
    if (age > STALE_MS || Date.now() - start > STALE_MS) {
      try { fs.rmSync(lockPath, { force: true }); } catch { /* raced; retry */ }
      continue;
    }
    sleep(POLL_MS);
  }
}

function release(lockPath) {
  try { fs.rmSync(lockPath, { force: true }); } catch { /* already gone */ }
}

function withLock(lockPath, fn) {
  acquire(lockPath);
  try {
    return fn();
  } finally {
    release(lockPath);
  }
}

module.exports = { withLock, acquire, release, STALE_MS };
