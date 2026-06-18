const { test } = require('node:test');
const assert = require('node:assert');
const { buildItems, reduceKey, renderLines, runMenu, confirm } = require('../src/menu.js');

test('buildItems lists accounts then add/remove actions', () => {
  const items = buildItems(['work', 'home'], 'work');
  assert.deepStrictEqual(items.map((i) => i.value), ['work', 'home', '__add__', '__remove__']);
  assert.strictEqual(items[0].current, true);
  assert.strictEqual(items[1].current, false);
});

test('buildItems without actions lists only accounts (remove picker)', () => {
  const items = buildItems(['work', 'home'], 'work', {}, false);
  assert.deepStrictEqual(items.map((i) => i.value), ['work', 'home']);
});

test('renderLines honors a custom title and hint for the remove picker', () => {
  const items = buildItems(['work'], 'work', {}, false);
  const out = renderLines(items, 0, { title: 'Remover conta', hint: 'enter remover', danger: true }).join('\n');
  assert.match(out, /Remover conta/);
  assert.match(out, /enter remover/);
  assert.doesNotMatch(out, /Claude Accounts/);
});

test('runMenu and confirm are exported callables', () => {
  assert.strictEqual(typeof runMenu, 'function');
  assert.strictEqual(typeof confirm, 'function');
});

test('renderLines draws a usage bar when usage data is provided', () => {
  const items = buildItems(['work'], 'work', { work: 'w@x.com' });
  const out = renderLines(items, 0, {
    usage: { work: { ok: true, session: { pct: 50, resetsAt: null }, week: null } },
  }).join('\n');
  assert.match(out, /█/);    // filled bar segment
  assert.match(out, /50%/);  // percentage label
});

test('buildItems attaches emails when provided', () => {
  const items = buildItems(['work'], 'work', { work: 'w@x.com' });
  assert.strictEqual(items[0].email, 'w@x.com');
});

test('renderLines shows title, email, active tag and pointer', () => {
  const items = buildItems(['work'], 'work', { work: 'w@x.com' });
  const out = renderLines(items, 0).join('\n');
  assert.match(out, /Claude Accounts/);
  assert.match(out, /w@x\.com/);
  assert.match(out, /●/); // active marker, language-independent
  assert.match(out, /❯/);
});

test('reduceKey moves selection and wraps', () => {
  const n = 4;
  assert.strictEqual(reduceKey({ idx: 0, n }, 'up').idx, 3);
  assert.strictEqual(reduceKey({ idx: 3, n }, 'down').idx, 0);
  assert.strictEqual(reduceKey({ idx: 1, n }, 'up').idx, 0);
  assert.deepStrictEqual(reduceKey({ idx: 2, n }, 'enter'), { idx: 2, n, done: 'select' });
  assert.deepStrictEqual(reduceKey({ idx: 2, n }, 'escape'), { idx: 2, n, done: 'cancel' });
});
