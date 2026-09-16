import test from 'node:test';
import assert from 'node:assert/strict';
import { createMangosPersistence } from '../src/app/useMangosState.js';
import { createBackup, loadState } from '../src/storage/state.js';

const defaults = () => ({ transactions: [], goals: [], holdings: [], salaries: [], recurring: [], budgets: {}, usdRate: 1350, displayCurrency: 'ARS' });
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}

test('loading a legacy record supplies missing defaults without writing them to storage', () => {
  const raw = JSON.stringify({ transactions: [], usdRate: 1200 });
  const storage = memoryStorage({ fp_v3b: raw });
  const persistence = createMangosPersistence(defaults(), false, { storage });
  assert.ok(persistence);
  const loaded = persistence.load();
  assert.deepEqual(loaded.state.goals, []);
  assert.deepEqual(loaded.state.recurring, []);
  assert.equal(loaded.state.usdRate, 1200);
  assert.equal(loaded.state.demo, false);
  assert.equal(storage.getItem('fp_v3b'), raw);
});

test('demo restore enforces demo mode in persisted data and never writes the personal partition', () => {
  const personal = JSON.stringify({ transactions: [], usdRate: 999 });
  const storage = memoryStorage({ fp_v3b: personal });
  const persistence = createMangosPersistence(defaults(), true, { storage });
  assert.ok(persistence);
  const restored = persistence.restore(createBackup({ transactions: [], demo: false }), { revision: 0 });
  assert.equal(restored.state.demo, true);
  assert.deepEqual(restored.state.holdings, []);
  assert.equal(loadState({ storage, key: 'mangos_demo_v1' }).state.demo, true);
  assert.equal(storage.getItem('fp_v3b'), personal);
});

test('reloading and saving demo always preserve namespace mode', () => {
  const storage = memoryStorage({ mangos_demo_v1: JSON.stringify({ transactions: [], demo: false }) });
  const persistence = createMangosPersistence(defaults(), true, { storage });
  assert.ok(persistence);
  const loaded = persistence.load();
  assert.equal(loaded.state.demo, true);
  const saved = persistence.save({ ...loaded.state, demo: false }, 0);
  assert.equal(saved.state.demo, true);
  assert.equal(persistence.load().state.demo, true);
});

test('explicit restoration uses the corrupt bytes from load error and keeps them recoverable', () => {
  const raw = '{damaged';
  const storage = memoryStorage({ fp_v3b: raw });
  const persistence = createMangosPersistence(defaults(), false, { storage });
  assert.ok(persistence);
  let loadError;
  try { persistence.load(); } catch (error) { loadError = error; }
  const result = persistence.restore(createBackup(defaults()), { revision: 0, loadError });
  assert.equal(result.revision, 1);
  assert.equal(storage.getItem('fp_v3b:corrupt'), raw);
});

test('persistence failure is thrown to the hook instead of returning a saved state', () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' }); };
  const persistence = createMangosPersistence(defaults(), false, { storage });
  assert.ok(persistence);
  assert.throws(() => persistence.save(defaults(), 0), error => error.code === 'QUOTA');
  assert.equal(storage.getItem('fp_v3b'), null);
});

test('recovering after a failed reload ignores the old cached revision but still requires exact damaged bytes', () => {
  const raw = '{damaged after revision 7';
  const storage = memoryStorage({ fp_v3b: raw });
  const persistence = createMangosPersistence(defaults(), false, { storage });
  const result = persistence.restore(createBackup(defaults()), { revision: 7, loadError: { code: 'CORRUPT', raw } });
  assert.equal(result.revision, 1);
  assert.equal(storage.getItem('fp_v3b:corrupt'), raw);
  const validRaw = storage.getItem('fp_v3b');
  assert.throws(() => persistence.restore(createBackup(defaults()), { revision: 7, loadError: { code: 'CORRUPT', raw } }), error => error.code === 'CONFLICT');
  assert.equal(storage.getItem('fp_v3b'), validRaw);
});
