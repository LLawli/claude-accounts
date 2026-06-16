'use strict';

function buildItems(names, current) {
  const accounts = names.map((n) => ({ label: n, value: n, current: n === current }));
  return [
    ...accounts,
    { label: '[+] adicionar conta', value: '__add__', current: false },
    { label: '[-] remover conta', value: '__remove__', current: false },
  ];
}

function reduceKey(state, key) {
  const { idx, n } = state;
  if (key === 'up') return { ...state, idx: (idx - 1 + n) % n };
  if (key === 'down') return { ...state, idx: (idx + 1) % n };
  if (key === 'enter') return { ...state, done: 'select' };
  if (key === 'escape') return { ...state, done: 'cancel' };
  return state;
}

function runMenu(names, current) {
  return new Promise((resolve) => {
    const items = buildItems(names, current);
    let state = { idx: Math.max(0, names.indexOf(current)), n: items.length };
    const out = process.stdout;
    const stdin = process.stdin;

    const render = () => {
      out.write(`\x1b[?25l`);
      out.write(`\r\x1b[2K  Conta Claude  ↑/↓  Enter  Esc\n`);
      items.forEach((it, i) => {
        const tag = it.current ? '  (ativa)' : '';
        const row = `${it.label}${tag}`;
        if (i === state.idx) out.write(`\x1b[2K\x1b[7m❯ ${row}\x1b[0m\n`);
        else out.write(`\x1b[2K  ${row}\n`);
      });
      out.write(`\x1b[${items.length + 1}A`);
    };

    const cleanup = () => {
      out.write(`\x1b[${items.length + 1}B\x1b[?25h`);
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (buf) => {
      const s = buf.toString();
      let key = null;
      if (s === '\x1b[A' || s === 'k') key = 'up';
      else if (s === '\x1b[B' || s === 'j') key = 'down';
      else if (s === '\r' || s === '\n') key = 'enter';
      else if (s === '\x1b' || s === '\x03') key = 'escape';
      if (!key) return;
      state = reduceKey(state, key);
      if (state.done === 'select') { cleanup(); resolve(items[state.idx].value); return; }
      if (state.done === 'cancel') { cleanup(); resolve(null); return; }
      render();
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    render();
  });
}

module.exports = { buildItems, reduceKey, runMenu };
