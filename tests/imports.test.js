import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMovementCSV, applyImportBatch, exportMovementCSV } from '../src/domain/imports.js';

const empty = () => ({ transactions: [], recurring: [], goals: [] });
const csv = 'Fecha;Descripción;Monto;Tipo;Categoría;Moneda\n16/09/2026;Supermercado;-1.234,56;Gasto;🛒 Supermercado;ARS';

test('Argentine negative amounts retain cents, expense type and category', () => {
  const rows = parseMovementCSV(csv);
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 1234.56);
  assert.equal(rows[0].date, '2026-09-16');
  assert.equal(rows[0].type, 'expense');
  assert.equal(rows[0].category, '🛒 Supermercado');
  const state = applyImportBatch(empty(), rows, { usdRate: 1350 });
  assert.equal(state.transactions[0].amount, 1234.56);
  assert.equal(state.transactions[0].originalCurrency, 'ARS');
});

test('USD preview is original money and confirmation converts exactly once', () => {
  const rows = parseMovementCSV('Fecha,Descripción,Monto,Tipo,Moneda\n2026-09-16,Trabajo,100,Ingreso,USD');
  assert.ok(Array.isArray(rows));
  assert.equal(rows[0].amount, 100);
  assert.equal(rows[0].currency, 'USD');
  const state = applyImportBatch(empty(), rows, { usdRate: 1350, fxDate: '2026-09-16', fxSource: 'manual' });
  const tx = state.transactions[0];
  assert.equal(tx.amount, 135000);
  assert.equal(tx.originalAmount, 100);
  assert.equal(tx.originalCurrency, 'USD');
  assert.equal(tx.fxRate, 1350);
  assert.equal(tx.fxSource, 'manual');
  assert.equal(tx.currency, 'ARS');
});

test('same raw source is idempotent but identical legitimate rows are both kept', () => {
  const source = `${csv}\n16/09/2026;Supermercado;-1.234,56;Gasto;🛒 Supermercado;ARS`;
  const before = empty();
  const one = applyImportBatch(before, parseMovementCSV(source), { usdRate: 1350 });
  assert.ok(one);
  assert.equal(one.transactions.length, 2);
  assert.notEqual(one.transactions[0].id, one.transactions[1].id);
  const two = applyImportBatch(one, parseMovementCSV(source), { usdRate: 1400 });
  assert.deepEqual(two, one);
  assert.equal(before.transactions.length, 0);
});

test('distinct source batches do not globally deduplicate equal purchases', () => {
  const rows = [{ date: '2026-09-16', description: 'Café', amount: 1200, type: 'expense', category: 'Comida', currency: 'ARS' }];
  const first = applyImportBatch(empty(), rows, { batchId: 'a' });
  assert.ok(first);
  const second = applyImportBatch(first, rows, { batchId: 'b' });
  assert.equal(second.transactions.length, 2);
});

test('batch identity collision is reported instead of discarding different rows', () => {
  const rows = [{ date: '2026-09-16', description: 'Café', amount: 1200, type: 'expense', category: 'Comida', currency: 'ARS' }];
  const first = applyImportBatch(empty(), rows, { batchId: 'a' });
  assert.throws(() => applyImportBatch(first, [{ ...rows[0], amount: 3000 }], { batchId: 'a' }), error => error.code === 'BATCH_CONFLICT');
});

test('versioned CSV roundtrip preserves type, category, canonical ARS and original FX', () => {
  const original = [
    { id: 't1', date: '2026-09-16', description: 'Sueldo', amount: 135000, type: 'income', category: '💼 Sueldo', currency: 'ARS', originalAmount: 100, originalCurrency: 'USD', fxRate: 1350, fxDate: '2026-09-16', fxSource: 'manual', source: 'salary' },
    { id: 't2', date: '2026-09-16', description: 'Cuenta propia', amount: 1234.56, type: 'transfer', category: '🔄 Transferencia interna', currency: 'ARS' },
  ];
  const exported = exportMovementCSV(original);
  assert.equal(typeof exported, 'string');
  const rows = parseMovementCSV(exported);
  assert.equal(rows[0].amount, 100);
  assert.equal(rows[0].currency, 'USD');
  const restored = applyImportBatch(empty(), rows, { usdRate: 2000 });
  assert.equal(restored.transactions[0].amount, 135000);
  assert.equal(restored.transactions[0].fxRate, 1350);
  assert.equal(restored.transactions[0].category, '💼 Sueldo');
  assert.equal(restored.transactions[0].source, 'salary');
  assert.equal(restored.transactions[1].type, 'transfer');
  assert.equal(restored.transactions[1].amount, 1234.56);
  const existing = { ...empty(), transactions: original };
  assert.equal(applyImportBatch(existing, rows, { usdRate: 2000 }).transactions.length, 2);
});

test('legacy USD label never converts its already-canonical ARS amount on roundtrip', () => {
  const tx = { id: 'old', date: '2026-09-16', description: 'Legacy', amount: 135000, currency: 'USD', type: 'expense', category: 'Otros' };
  const text = exportMovementCSV([tx]);
  assert.equal(typeof text, 'string');
  const restored = applyImportBatch(empty(), parseMovementCSV(text), { usdRate: 2000 });
  assert.equal(restored.transactions[0].amount, 135000);
  assert.equal(restored.transactions[0].originalAmount, undefined);
});

test('CSV quoted multiline descriptions and formula protection roundtrip losslessly', () => {
  const txs = ['=1+1', '\t@SUM(1,2)', "'=already literal", 'Mercado; "Uno"\nSucursal'].map((description, i) => ({ id: `t${i}`, date: '2026-09-16', amount: 500, type: 'expense', currency: 'ARS', category: '+rubro', description }));
  const text = exportMovementCSV(txs);
  assert.equal(typeof text, 'string');
  assert.ok(text.includes("'=1+1"));
  assert.ok(text.includes("'+rubro"));
  const restored = applyImportBatch(empty(), parseMovementCSV(text));
  assert.deepEqual(restored.transactions.map(tx => tx.description), txs.map(tx => tx.description));
  assert.equal(restored.transactions[0].category, '+rubro');
});

test('debit/credit columns support bank preamble and keep signs', () => {
  const text = 'Reporte de banco\nFecha;Concepto;Débito;Crédito;Moneda\n16/09/2026;Compra;1.234,56;;ARS\n16/09/2026;Pago;;2.000,00;ARS';
  const rows = parseMovementCSV(text);
  assert.ok(Array.isArray(rows));
  assert.deepEqual(rows.map(row => [row.amount, row.type]), [[1234.56, 'expense'], [2000, 'income']]);
});

test('invalid rows and missing USD rate reject the whole batch without mutation', () => {
  const state = empty();
  const good = { date: '2026-09-16', amount: 500, type: 'expense', currency: 'ARS', description: 'Bien', category: 'Otros' };
  assert.throws(() => applyImportBatch(state, [good, { ...good, date: '2026-02-30' }], { batchId: 'invalid' }));
  assert.throws(() => applyImportBatch(state, [{ ...good, currency: 'USD' }], { batchId: 'usd' }));
  assert.equal(state.transactions.length, 0);
  assert.throws(() => parseMovementCSV('Fecha;Monto;Tipo\n2026-09-16;12abc;Gasto'));
});

test('partial batch confirmation can later add unconfirmed rows without duplicating accepted ones', () => {
  const rows = parseMovementCSV(`${csv}\n16/09/2026;Taxi;-500;Gasto;Transporte;ARS`);
  const partial = applyImportBatch(empty(), [rows[0]]);
  const completed = applyImportBatch(partial, rows);
  assert.equal(completed.transactions.length, 2);
  assert.equal(completed.transactions[0].amount, 1234.56);
  assert.equal(completed.transactions[1].amount, 500);
  assert.equal(partial.transactions.length, 1);
});

test('versioned CSV rejects inconsistent original FX instead of presenting incompatible amounts', () => {
  const exported = exportMovementCSV([{ id: 't1', date: '2026-09-16', amount: 135000, type: 'expense', category: 'Otros', originalAmount: 100, originalCurrency: 'USD', fxRate: 1350 }]);
  const inconsistent = exported.replace('"1350"', '"2000"');
  assert.throws(() => applyImportBatch(empty(), parseMovementCSV(inconsistent)), error => error.code === 'INVALID_FX');
});

test('fresh preview UI identifiers do not duplicate the same explicitly identified source batch', () => {
  const row = { id: 'preview-1', date: '2026-09-16', amount: 500, type: 'expense', currency: 'ARS', description: 'Compra', category: 'Otros' };
  const first = applyImportBatch(empty(), [row], { batchId: 'same-document' });
  const second = applyImportBatch(first, [{ ...row, id: 'preview-2' }], { batchId: 'same-document' });
  assert.equal(second.transactions.length, 1);
  assert.deepEqual(second, first);
});

test('same exported movement ID with different original currency is a conflict', () => {
  const current = { id: 't1', date: '2026-09-16', amount: 135000, description: 'Compra', type: 'expense', category: 'Otros', currency: 'ARS', originalAmount: 135000, originalCurrency: 'ARS' };
  const different = { ...current, originalAmount: 100, originalCurrency: 'USD', fxRate: 1350 };
  const rows = parseMovementCSV(exportMovementCSV([different]));
  assert.throws(() => applyImportBatch({ ...empty(), transactions: [current] }, rows), error => error.code === 'MOVEMENT_CONFLICT');
});
