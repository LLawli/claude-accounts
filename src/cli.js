#!/usr/bin/env node
'use strict';
const vault = require('./vault.js');
const { switchAccount } = require('./switch.js');
const { t } = require('./i18n.js');
const log = require('./log.js');
const audit = require('./audit.js');

// Commands that may mutate the vault. Read-only commands (list/current/doctor)
// must not, so they skip the first-run adoptCurrent (which would write a slot).
const MUTATING = new Set(['switch', 'add', 'remove', 'menu']);

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (MUTATING.has(cmd)) {
    const adopted = vault.adoptCurrent();
    if (adopted) log.info(t('adopted', adopted)); // stderr: visible, doesn't pollute results
  }
  switch (cmd) {
    case 'list': {
      const cur = vault.getCurrent();
      for (const n of vault.list()) log.result(n === cur ? `* ${n}` : `  ${n}`);
      return 0;
    }
    case 'current': {
      log.result(vault.getCurrent() || '(nenhuma)');
      return 0;
    }
    case 'switch': {
      if (!rest[0]) { log.error(t('usageSwitch')); return 2; }
      reportSwitch(switchAccount(rest[0]));
      return 0;
    }
    case 'remove': {
      if (!rest[0]) { log.error(t('usageRemove')); return 2; }
      const r = vault.removeAccount(rest[0]);
      if (!r.removed) { log.result(t('notFound', rest[0])); return 1; } // no false "removed"
      log.result(t('removed', rest[0]));
      return 0;
    }
    case 'add': {
      const { addAccount } = require('./login.js');
      const name = rest[0] || await prompt(t('promptName'));
      const r = await addAccount(name, {});
      if (r.added) { log.result(r.email ? t('addedEmail', name, r.email) : t('added', name)); return 0; }
      log.result(addFailMessage(r));
      return 1;
    }
    case 'menu': {
      return runInteractiveMenu();
    }
    default:
      log.error(t('unknown', cmd || '(vazio)'));
      return 2;
  }
}

function prompt(q) {
  return new Promise((resolve) => {
    process.stdout.write(q);
    process.stdin.resume();
    process.stdin.once('data', (d) => { process.stdin.pause(); resolve(d.toString().trim()); });
  });
}

function emailMap(names = vault.list()) {
  const m = {};
  for (const n of names) m[n] = vault.email(n);
  return m;
}

// Map an addAccount failure to the most specific reason the user can act on,
// instead of the old blanket "Nothing captured".
function addFailMessage(r) {
  if (r.keyringSuspected || r.reason === 'keyring') return t('addKeyring');
  if (r.reason === 'timeout') return t('addTimeout');
  return t('nothingCaptured');
}

function reportSwitch(r) {
  if (r.savedFrom && r.savedFrom !== r.account) log.debug('switch.saved-prev', { account: r.savedFrom });
  if (!r.switched) { log.result(t('already', r.account)); return; }
  // Surface the identity so the user can confirm WHO is now live; warn if unknown.
  if (!r.email) log.warn('switch.no-identity', { account: r.account });
  log.result(r.email ? t('activeNowEmail', r.account, r.email) : t('activeNow', r.account));
}

async function runInteractiveMenu() {
  const { runMenu, confirm } = require('./menu.js');
  // Loop so management actions (add/remove) return to the menu. Only an explicit
  // account switch (or add+switch) returns 0, which is what makes the wrapper
  // launch claude afterwards; remove and cancel return without launching.
  for (;;) {
    const names = vault.list();
    const current = vault.getCurrent();
    const emails = emailMap(names);
    const choice = await runMenu(names, current, emails);
    if (choice === null) { log.result(t('cancelled')); return 1; }
    if (choice === '__add__') {
      const { addAccount } = require('./login.js');
      const name = await prompt(t('promptName'));
      const r = await addAccount(name, {});
      if (!r.added) { log.result(addFailMessage(r)); return 1; }
      reportSwitch(switchAccount(name));
      return 0;
    }
    if (choice === '__remove__') {
      if (!names.length) { log.result(t('nothingToRemove')); continue; }
      // Distinct destructive picker (no add/remove rows, red styling) so it can't
      // be mistaken for the switch menu, plus an explicit confirmation.
      const sub = await runMenu(names, current, emails, {
        title: t('removeTitle'), hint: t('removeHint'), withActions: false, danger: true,
      });
      if (sub && await confirm(t('confirmRemove', sub))) {
        const r = vault.removeAccount(sub);
        log.result(r.removed ? t('removed', sub) : t('notFound', sub));
      }
      continue; // back to the main menu; never launch claude from a remove
    }
    reportSwitch(switchAccount(choice));
    return 0;
  }
}

const cliArgv = log.stripFlags(process.argv.slice(2));
main(cliArgv)
  .then((code) => process.exit(code))
  .catch((e) => {
    const op = e.caStep ? ` (${e.caStep})` : '';
    process.stderr.write(`[claude-accounts]${op} ${e.message}\n`);
    if (log.level() >= log.LEVELS.DEBUG) {
      if (e.stack) process.stderr.write(e.stack + '\n');
      if (e.cause) process.stderr.write(`caused by: ${e.cause.stack || e.cause}\n`);
    }
    audit.fail('fatal', e, { reason: cliArgv[0] || null });
    process.exit(e.caExit || 1);
  });
