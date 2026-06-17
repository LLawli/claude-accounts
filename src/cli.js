#!/usr/bin/env node
'use strict';
const vault = require('./vault.js');
const { switchAccount } = require('./switch.js');
const { t } = require('./i18n.js');
const log = require('./log.js');
const audit = require('./audit.js');

async function main(argv) {
  const [cmd, ...rest] = argv;
  // First-run safety: adopt the already logged-in account into the vault so the
  // live login is registered before any add/switch can overwrite it. Idempotent.
  vault.adoptCurrent();
  switch (cmd) {
    case 'list': {
      const cur = vault.getCurrent();
      for (const n of vault.list()) console.log(n === cur ? `* ${n}` : `  ${n}`);
      return 0;
    }
    case 'current': {
      const cur = vault.getCurrent();
      console.log(cur || '(nenhuma)');
      return 0;
    }
    case 'switch': {
      if (!rest[0]) { console.error(t('usageSwitch')); return 2; }
      reportSwitch(switchAccount(rest[0]));
      return 0;
    }
    case 'remove': {
      if (!rest[0]) { console.error(t('usageRemove')); return 2; }
      vault.removeAccount(rest[0]);
      console.log(t('removed', rest[0]));
      return 0;
    }
    case 'add': {
      const { addAccount } = require('./login.js');
      const name = rest[0] || await prompt(t('promptName'));
      const r = await addAccount(name, {});
      console.log(r.added ? t('added', name) : t('nothingCaptured'));
      return r.added ? 0 : 1;
    }
    case 'menu': {
      return runInteractiveMenu();
    }
    default:
      console.error(t('unknown', cmd || '(vazio)'));
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

function reportSwitch(r) {
  console.log(r.switched ? t('activeNow', r.account) : t('already', r.account));
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
    if (choice === null) { console.log(t('cancelled')); return 1; }
    if (choice === '__add__') {
      const { addAccount } = require('./login.js');
      const name = await prompt(t('promptName'));
      const r = await addAccount(name, {});
      if (!r.added) { console.log(t('nothingShort')); return 1; }
      reportSwitch(switchAccount(name));
      return 0;
    }
    if (choice === '__remove__') {
      if (!names.length) { console.log(t('nothingToRemove')); continue; }
      // Distinct destructive picker (no add/remove rows, red styling) so it can't
      // be mistaken for the switch menu, plus an explicit confirmation.
      const sub = await runMenu(names, current, emails, {
        title: t('removeTitle'), hint: t('removeHint'), withActions: false, danger: true,
      });
      if (sub && await confirm(t('confirmRemove', sub))) {
        vault.removeAccount(sub);
        console.log(t('removed', sub));
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
