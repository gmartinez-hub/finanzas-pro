import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, createBackup, parseBackup, restoreState } from '../src/storage/state.js';

// The browser boundary is injected; assertions exercise the real adapter.
function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}
const empty = () => ({ transactions: [], salaries: [], goals: [], holdings: [], recurring: [], budgets: {}, usdRate: 1350 });
const movement = { id: 't1', amount: 1234.56, date: '2026-09-16', type: 'expense', description: 'Compra', category: 'Comida', currency: 'ARS' };
const opts = storage => ({ storage, key: 'personal' });

test('first load does not persist a default or change the supplied object', () => {
  const storage = memoryStorage();
  const initialState = empty();
  const loaded = loadState({ ...opts(storage), initialState });
  assert.ok(loaded);
  assert.deepEqual(loaded.state, initialState);
  assert.equal(loaded.revision, 0);
  assert.equal(storage.getItem('personal'), null);
  loaded.state.usdRate = 100;
  assert.equal(initialState.usdRate, 1350);
});

test('legacy load preserves canonical ARS and previous raw survives the first save', () => {
  const legacy = { ...empty(), transactions: [{ ...movement, amount: 135000, currency: 'USD' }] };
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ personal: raw });
  const loaded = loadState(opts(storage));
  assert.ok(loaded);
  assert.equal(loaded.legacy, true);
  assert.equal(loaded.state.transactions[0].amount, 135000);
  const result = saveState(loaded.state, { ...opts(storage), expectedRevision: loaded.revision });
  assert.equal(result.revision, 1);
  assert.equal(storage.getItem('personal:previous'), raw);
  assert.deepEqual(loadState(opts(storage)).state, legacy);
});

test('quota failure reaches caller and leaves the current state unchanged', () => {
  const storage = memoryStorage();
  const before = empty();
  saveState(before, { ...opts(storage), expectedRevision: 0 });
  const raw = storage.getItem('personal');
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'personal') throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
    return set(key, value);
  };
  assert.throws(() => saveState({ ...before, transactions: [movement] }, { ...opts(storage), expectedRevision: 1 }), error => error.code === 'QUOTA');
  assert.equal(storage.getItem('personal'), raw);
});

test('corrupt data stays intact on both read and attempted save', () => {
  const raw = '{"transactions":[';
  const storage = memoryStorage({ personal: raw });
  assert.throws(() => loadState({ ...opts(storage), initialState: empty() }), error => error.code === 'CORRUPT' && error.raw === raw);
  assert.throws(() => saveState(empty(), { ...opts(storage), expectedRevision: 0 }), error => error.code === 'CORRUPT');
  assert.equal(storage.getItem('personal'), raw);
  assert.equal(storage.getItem('personal:previous'), null);
});

test('stale tab cannot overwrite a newer revision', () => {
  const storage = memoryStorage();
  const first = saveState(empty(), { ...opts(storage), expectedRevision: 0 });
  assert.ok(first);
  const tabA = loadState(opts(storage));
  const tabB = loadState(opts(storage));
  saveState({ ...tabA.state, transactions: [movement] }, { ...opts(storage), expectedRevision: tabA.revision });
  assert.throws(() => saveState({ ...tabB.state, usdRate: 1200 }, { ...opts(storage), expectedRevision: tabB.revision }), error => error.code === 'CONFLICT' && error.currentRevision === 2);
  assert.equal(loadState(opts(storage)).state.transactions.length, 1);
});

test('backup restores all state and increments local revision while preserving rollback', () => {
  const original = { ...empty(), transactions: [movement], extraSettings: { greeting: 'hola' }, goals: [{ id: 'goal-1', name: 'Viaje', target: 5000, saved: 0, payments: [] }] };
  const backup = createBackup(original, { revision: 9 });
  assert.equal(typeof backup, 'string');
  const parsed = parseBackup(backup);
  assert.equal(parsed.revision, 9);
  assert.deepEqual(parsed.state, original);
  const storage = memoryStorage();
  saveState(empty(), { ...opts(storage), expectedRevision: 0 });
  const previous = storage.getItem('personal');
  const restored = restoreState(backup, { ...opts(storage), expectedRevision: 1 });
  assert.equal(restored.revision, 2);
  assert.deepEqual(loadState(opts(storage)).state, original);
  assert.equal(storage.getItem('personal:previous'), previous);
});

test('invalid and future backups leave current and previous copies untouched', () => {
  const storage = memoryStorage();
  saveState(empty(), { ...opts(storage), expectedRevision: 0 });
  const raw = storage.getItem('personal');
  const bad = [
    'not JSON',
    JSON.stringify({ format: 'mangos-backup', schemaVersion: 99, revision: 0, state: empty() }),
    JSON.stringify({ format: 'mangos-backup', schemaVersion: 1, revision: 0, state: { ...empty(), transactions: [{ ...movement, amount: 'oops' }] } }),
    JSON.stringify({ format: 'mangos-backup', schemaVersion: 1, revision: -1, state: empty() }),
  ];
  for (const text of bad) {
    assert.throws(() => restoreState(text, { ...opts(storage), expectedRevision: 1 }));
    assert.equal(storage.getItem('personal'), raw);
    assert.equal(storage.getItem('personal:previous'), null);
  }
});

test('save rejects non-JSON financial values instead of silently replacing them with null', () => {
  const storage = memoryStorage();
  assert.throws(() => saveState({ ...empty(), usdRate: NaN }, { ...opts(storage), expectedRevision: 0 }));
  assert.equal(storage.getItem('personal'), null);
});

test('demo key never reads or replaces personal data', () => {
  const raw = JSON.stringify({ ...empty(), transactions: [movement] });
  const storage = memoryStorage({ personal: raw });
  saveState(empty(), { storage, key: 'demo', expectedRevision: 0 });
  assert.equal(storage.getItem('personal'), raw);
  assert.equal(loadState({ storage, key: 'demo' }).state.transactions.length, 0);
});

test('confirmed recovery of corruption retains both damaged bytes and previous valid copy', () => {
  const raw = '{"transactions":[';
  const previous = JSON.stringify(empty());
  const storage = memoryStorage({ personal: raw, 'personal:previous': previous });
  const backup = createBackup({ ...empty(), transactions: [movement] });
  const restored = restoreState(backup, { ...opts(storage), expectedRevision: 0, recoveryRaw: raw });
  assert.equal(restored.state.transactions.length, 1);
  assert.equal(restored.revision, 1);
  assert.equal(storage.getItem('personal:corrupt'), raw);
  assert.equal(storage.getItem('personal:previous'), previous);
});

test('recovery refuses to replace data changed since the corrupt file was reviewed', () => {
  const raw = '{broken';
  const newer = '{other broken';
  const storage = memoryStorage({ personal: newer });
  assert.throws(() => restoreState(createBackup(empty()), { ...opts(storage), expectedRevision: 0, recoveryRaw: raw }), error => error.code === 'CONFLICT');
  assert.equal(storage.getItem('personal'), newer);
  assert.equal(storage.getItem('personal:corrupt'), null);
});

test('legacy complete JSON exports are explicitly recognized and restored without losing their fields', () => {
  const legacy = { ...empty(), transactions: [movement], onboardingDone: true };
  const parsed = parseBackup(JSON.stringify(legacy));
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.revision, 0);
  assert.deepEqual(parsed.state, legacy);
  const storage = memoryStorage();
  restoreState(JSON.stringify(legacy), { ...opts(storage), expectedRevision: 0 });
  assert.deepEqual(loadState(opts(storage)).state, legacy);
});

test('arbitrary JSON with only a transactions field is not accepted as a legacy complete backup', () => {
  assert.throws(() => parseBackup('{"transactions":[]}'), error => error.code === 'INVALID_BACKUP');
});

test('restore rejects invalid currencies, rates and UI record fields without replacing existing data', () => {
  const storage = memoryStorage();
  saveState(empty(), { ...opts(storage), expectedRevision: 0 });
  const original = storage.getItem('personal');
  const invalidStates = [
    { displayCurrency: 'INVALID' },
    { usdType: 42 },
    { usdType: 'unknown' },
    { usdRate: 0 },
    { usdRate: -1200 },
    { usdRate: '1350' },
    { usdRates: { mep: -1 } },
    { goals: [{ id: 'g', name: {}, target: 100, saved: 0, payments: [] }] },
    { goals: [{ id: 'g', name: 'Viaje', target: '100', saved: 0, payments: [] }] },
    { goals: [{ id: 'g', name: 'Viaje', target: 100, saved: 0, payments: 'broken' }] },
    { holdings: [{ id: 'h', type: 'cedear', name: 42, quantity: 10 }] },
    { holdings: [{ id: 'h', type: 'cedear', name: 'Apple', quantity: '10' }] },
  ];
  for (const invalid of invalidStates) {
    const backup = JSON.stringify({ format: 'mangos-backup', schemaVersion: 1, revision: 0, state: { ...empty(), ...invalid } });
    assert.throws(() => restoreState(backup, { ...opts(storage), expectedRevision: 1 }), error => error.code === 'INVALID_BACKUP');
    assert.equal(storage.getItem('personal'), original);
    assert.equal(storage.getItem('personal:previous'), null);
  }
});

test('normal legacy holdings can keep a null unassigned goal without changing currency or cost', () => {
  const holding = { id: 'h1', type: 'cedear', ticker: 'AAPL', name: '', quantity: 10, originalBuyPrice: 10000, originalCurrency: 'ARS', totalInvestedArs: 100000, goalId: null, buyDate: '2026-09-16', maturityDate: '' };
  const state = { ...empty(), holdings: [holding] };
  const storage = memoryStorage();
  const result = saveState(state, { ...opts(storage), expectedRevision: 0 });
  assert.deepEqual(result.state.holdings[0], holding);
});
