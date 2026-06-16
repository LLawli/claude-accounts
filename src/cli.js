#!/usr/bin/env node
'use strict';
const vault = require('./vault.js');
const { switchAccount } = require('./switch.js');

async function main(argv) {
  const [cmd, ...rest] = argv;
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
      if (!rest[0]) { console.error('uso: switch <nome>'); return 2; }
      const r = switchAccount(rest[0]);
      console.log(r.switched ? `Conta ativa: ${r.account}` : `Ja na conta '${r.account}'.`);
      return 0;
    }
    case 'remove': {
      if (!rest[0]) { console.error('uso: remove <nome>'); return 2; }
      const fs = require('node:fs');
      const p = require('./paths.js');
      fs.rmSync(p.slotDir(rest[0]), { recursive: true, force: true });
      console.log(`removida: ${rest[0]}`);
      return 0;
    }
    case 'add': {
      const { addAccount } = require('./login.js');
      const name = rest[0] || await prompt('Nome da nova conta: ');
      const r = await addAccount(name, {});
      console.log(r.added ? `Adicionada: ${name}` : `Nada capturado (login abortado).`);
      return r.added ? 0 : 1;
    }
    case 'menu': {
      return runInteractiveMenu();
    }
    default:
      console.error(`subcomando desconhecido: ${cmd || '(vazio)'}`);
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

async function runInteractiveMenu() {
  const { runMenu } = require('./menu.js');
  const choice = await runMenu(vault.list(), vault.getCurrent());
  if (choice === null) { console.log('Cancelado.'); return 1; }
  if (choice === '__add__') {
    const { addAccount } = require('./login.js');
    const name = await prompt('Nome da nova conta: ');
    const r = await addAccount(name, {});
    if (!r.added) { console.log('Nada capturado.'); return 1; }
    switchAccount(name);
    console.log(`Conta ativa: ${name}`);
    return 0;
  }
  if (choice === '__remove__') {
    const sub = await runMenu(vault.list(), vault.getCurrent());
    if (sub && sub !== '__add__' && sub !== '__remove__') {
      const fs = require('node:fs');
      const p = require('./paths.js');
      fs.rmSync(p.slotDir(sub), { recursive: true, force: true });
      console.log(`removida: ${sub}`);
    }
    return 0;
  }
  const r = switchAccount(choice);
  console.log(r.switched ? `Conta ativa: ${r.account}` : `Ja na conta '${r.account}'.`);
  return 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => { console.error(`[claude-accounts] ${e.message}`); process.exit(1); });
