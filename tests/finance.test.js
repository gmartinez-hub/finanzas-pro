import test from 'node:test';
import assert from 'node:assert/strict';

// A missing module initially produces explicit missing-behavior assertions (TDD red),
// rather than aborting the test runner at module resolution.
let finance = {};
try { finance = await import('../src/domain/finance.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const call = (name, ...args) => {
  assert.equal(typeof finance[name], 'function', `Missing financial behavior: ${name}`);
  return finance[name](...args);
};
const empty = () => ({ transactions: [], salaries: [], goals: [], recurring: [], holdings: [] });
const tx = (id, amount, type = 'expense', rest = {}) => ({ id, date: '2026-09-10', description: id, amount, type, currency: 'ARS', category: 'Comida', ...rest });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const goalState = saved => ({ ...empty(), goals: [{ id: 'g', name: 'Viaje', target: 1000, saved, payments: [] }] });

test('money parser keeps signs, Argentine/US separators and centavos without partially parsing malformed text', () => {
  for (const [raw, expected] of [['-1.234,56', -1234.56], ['-1,234.56', -1234.56], ['ARS 1.234,56', 1234.56], ['(1.234,56)', -1234.56], ['1,234', 1234], ['-0,50', -0.5], [1.005, 1.01], ['', 0]]) assert.equal(call('parseMoney', raw), expected);
  for (const raw of ['12x34', '1.2.3', '1e3', '--25', Infinity]) assert.ok(Number.isNaN(call('parseMoney', raw)), String(raw));
});

test('salary projection and linked extra count once, including legacy USD-labelled canonical ARS', () => {
  const salaries = [{ month: '2026-09', base: 100000, extras: [{ id: 'e', transactionId: 'extra', amt: 20000 }] }];
  const transactions = [tx('salary', 100000, 'income', { source: 'salary', currency: 'USD' }), tx('extra', 20000, 'income', { source: 'extra', extraId: 'e' }), tx('sale', 5000, 'income')];
  const parts = call('getMonthIncomeParts', salaries, transactions, '2026-09');
  assert.equal(parts.base, 100000); assert.equal(parts.extras, 20000); assert.equal(parts.other, 5000); assert.equal(parts.total, 125000);
});

test('zero salary is authoritative and unmatched legacy projections produce warnings instead of invented income', () => {
  const parts = call('getMonthIncomeParts', [{ month: '2026-09', base: 0, extras: [] }], [tx('old', 1000, 'income', { source: 'salary' })], '2026-09');
  assert.equal(parts.total, 0); assert.ok(parts.warnings.length);
  assert.equal(call('getMonthIncomeParts', [], [tx('unprojected', 123.45, 'income', { source: 'extra', currency: 'USD' })], '2026-09').total, 123.45);
});

test('month result includes deficits and treats reserves as transfers, not consumption or invented account cash', () => {
  const state = freeze({ ...empty(), transactions: [tx('income', 1000, 'income'), tx('food', 300), tx('reserve', 200, 'transfer', { kind: 'goal_reserve', goalId: 'g' }), tx('internal', 500, 'transfer'), tx('void', 900, 'expense', { voided: true })] });
  const summary = call('monthSummary', state, '2026-09');
  assert.equal(summary.income, 1000); assert.equal(summary.expenses, 300); assert.equal(summary.reserved, 200); assert.equal(summary.balance, 700); assert.equal(summary.available, 500); assert.equal(summary.hasData, true);
  assert.equal(call('monthSummary', { ...empty(), transactions: [tx('bill', 50)] }, '2026-09').available, -50);
  assert.equal(call('monthSummary', empty(), '2026-09').hasData, false);
});

test('legacy ahorro expenses remain unchanged and visibly ambiguous; all canonical amounts stay ARS', () => {
  const state = freeze({ ...empty(), usdRate: 1350, transactions: [tx('old', 100, 'expense', { currency: 'USD', category: '💰 Ahorro' })] });
  const summary = call('monthSummary', state, '2026-09');
  assert.equal(summary.expenses, 100); assert.equal(summary.reserved, 0); assert.equal(summary.available, -100); assert.ok(summary.warnings.length);
});

test('category change compares the same elapsed days, exposes rows and excludes later/voided/transfer movements', () => {
  const state = { ...empty(), transactions: [tx('now', 150), tx('later', 800, 'expense', { date: '2026-09-25' }), tx('prior', 100, 'expense', { date: '2026-08-10' }), tx('prior-late', 400, 'expense', { date: '2026-08-25' }), tx('transfer', 500, 'transfer'), tx('voided', 500, 'expense', { voided: true })] };
  const changes = call('getCategoryChanges', state, '2026-09', '2026-09-16');
  assert.equal(changes.length, 1); assert.equal(changes[0].current, 150); assert.equal(changes[0].previous, 100); assert.equal(changes[0].delta, 50); assert.equal(changes[0].percent, 50);
  assert.equal(changes[0].currentEnd, '2026-09-16'); assert.equal(changes[0].previousEnd, '2026-08-16'); assert.deepEqual(changes[0].transactionIds, ['now']);
});

test('partial-month comparison clips both periods to February and does not invent percentages from zero', () => {
  const changes = call('getCategoryChanges', { ...empty(), transactions: [tx('feb-income', 500, 'income', { date: '2026-02-10' }), tx('march', 100, 'expense', { date: '2026-03-28' }), tx('not-comparable', 900, 'expense', { date: '2026-03-29' })] }, '2026-03', '2026-03-30');
  assert.equal(changes[0].current, 100); assert.equal(changes[0].currentEnd, '2026-03-28'); assert.equal(changes[0].previousEnd, '2026-02-28'); assert.equal(changes[0].percent, null);
});

test('decision simulation changes only its preview and validates unsupported decisions', () => {
  const summary = freeze(call('monthSummary', { ...empty(), transactions: [tx('salary', 1000, 'income'), tx('food', 300)] }, '2026-09'));
  const expense = call('simulateDecision', summary, { type: 'expense', amount: 200 });
  assert.equal(expense.after.expenses, 500); assert.equal(expense.after.available, 500); assert.equal(expense.after.balance, 500); assert.equal(summary.expenses, 300);
  const reserve = call('simulateDecision', summary, { type: 'reserve', amount: 200 });
  assert.equal(reserve.after.expenses, 300); assert.equal(reserve.after.reserved, 200); assert.equal(reserve.after.balance, 700); assert.equal(reserve.after.available, 500);
  assert.throws(() => call('simulateDecision', summary, { type: 'income', amount: 200 }));
  assert.throws(() => call('simulateDecision', summary, { type: 'reserve', amount: -1 }));
});

test('pending recurring is read-only, has no invented due date, and respects legacy applied/paused periods', () => {
  const state = freeze({ ...empty(), recurring: [{ id: 'rent', amount: 100, type: 'expense', lastMonth: '2026-08', currency: 'USD' }, { id: 'done', amount: 200, lastMonth: '2026-09' }, { id: 'paused', amount: 50, paused: true }] });
  const pending = call('getPendingRecurring', state, '2026-09');
  assert.equal(pending.length, 1); assert.equal(pending[0].recurringId, 'rent'); assert.equal(pending[0].amount, 100); assert.equal(pending[0].dueDate, null); assert.equal(state.transactions.length, 0);
});

test('confirming recurring creates one canonical payment and repeating it cannot duplicate it', () => {
  const state = freeze({ ...empty(), recurring: [{ id: 'rent', description: 'Alquiler', amount: 100, type: 'expense', category: 'Vivienda', currency: 'USD', lastMonth: '2026-07' }] });
  const confirmed = call('confirmRecurring', state, 'rent', '2026-09', { date: '2026-09-12' });
  assert.equal(confirmed.transactions.length, 1); assert.equal(confirmed.transactions[0].amount, 100); assert.equal(confirmed.transactions[0].currency, 'ARS'); assert.equal(confirmed.transactions[0].recurringId, 'rent');
  assert.equal(call('confirmRecurring', freeze(confirmed), 'rent', '2026-09', { date: '2026-09-12' }).transactions.length, 1);
  assert.equal(call('getPendingRecurring', confirmed, '2026-09').length, 0);
  assert.equal(call('getPendingRecurring', confirmed, '2026-08').length, 1);
  assert.equal(state.transactions.length, 0);
});

test('linking an existing recurring payment preserves its ID, actual amount and FX metadata without duplicate writes', () => {
  const existing = tx('bank', 105, 'expense', { originalAmount: 0.1, originalCurrency: 'USD', fxRateAtEntry: 1050 });
  const state = freeze({ ...empty(), transactions: [existing], recurring: [{ id: 'rent', amount: 100, type: 'expense', lastMonth: '2026-08' }] });
  const linked = call('confirmRecurring', state, 'rent', '2026-09', { transactionId: 'bank' });
  assert.equal(linked.transactions.length, 1); assert.equal(linked.transactions[0].id, 'bank'); assert.equal(linked.transactions[0].amount, 105); assert.equal(linked.transactions[0].originalAmount, 0.1);
  assert.equal(linked.recurring[0].confirmations['2026-09'].transactionId, 'bank');
  assert.throws(() => call('confirmRecurring', { ...state, transactions: [tx('wrong', 100, 'income')] }, 'rent', '2026-09', { transactionId: 'wrong' }));
});

test('recurring skip/pause affect future pending state without changing already paid history', () => {
  const state = freeze({ ...empty(), recurring: [{ id: 'rent', amount: 100, type: 'expense', lastMonth: '2026-08' }] });
  const skipped = call('confirmRecurring', state, 'rent', '2026-09', { action: 'skip' });
  assert.equal(skipped.transactions.length, 0); assert.equal(call('getPendingRecurring', skipped, '2026-09').length, 0); assert.equal(call('getPendingRecurring', skipped, '2026-10').length, 1);
  const paid = call('confirmRecurring', state, 'rent', '2026-09', { date: '2026-09-16' });
  const paused = call('confirmRecurring', paid, 'rent', '2026-10', { action: 'pause' });
  assert.deepEqual(paused.transactions, paid.transactions); assert.equal(call('getPendingRecurring', paused, '2026-10').length, 0);
});

test('goal reserve writes one transfer, preserves FX metadata and is idempotent for an explicit operation ID', () => {
  const state = freeze(goalState(0));
  const options = { date: '2026-09-10', id: 'reserve-1', originalAmount: 1, originalCurrency: 'USD', fxRateAtEntry: 100 };
  const reserved = call('reserveForGoal', state, 'g', 100, options);
  assert.equal(reserved.goals[0].saved, 100); assert.equal(reserved.transactions[0].type, 'transfer'); assert.equal(reserved.transactions[0].kind, 'goal_reserve'); assert.equal(reserved.transactions[0].originalAmount, 1);
  assert.equal(call('monthSummary', reserved, '2026-09').expenses, 0); assert.equal(call('monthSummary', reserved, '2026-09').reserved, 100);
  assert.equal(call('reserveForGoal', freeze(reserved), 'g', 100, options).goals[0].saved, 100);
  assert.throws(() => call('reserveForGoal', reserved, 'g', 101, options));
});

test('paying a goal consumes its reservation once, keeps progress and creates one linked expense', () => {
  const reserved = call('reserveForGoal', goalState(0), 'g', 100, { date: '2026-09-01', id: 'reserve' });
  const paid = call('payGoal', freeze(reserved), 'g', 40, { date: '2026-09-16', id: 'pay', name: 'Pasajes' });
  assert.equal(paid.goals[0].saved, 60); assert.equal(call('goalCash', paid.goals[0]), 60); assert.equal(call('goalProgress', paid.goals[0]), 100);
  assert.equal(paid.transactions.filter(t => t.type === 'expense').length, 1);
  const payment = paid.goals[0].payments[0];
  assert.equal(payment.reserveReleased, 40); assert.equal(paid.transactions.find(t => t.id === payment.transactionId).paymentId, payment.id);
  const summary = call('monthSummary', paid, '2026-09');
  assert.equal(summary.expenses, 40); assert.equal(summary.reserved, 60); assert.equal(summary.available, -100);
  assert.equal(call('payGoal', paid, 'g', 40, { date: '2026-09-16', id: 'pay', name: 'Pasajes' }).transactions.length, paid.transactions.length);
});

test('payment beyond reserve spends only the shortfall from this month and reversal retains linked history', () => {
  const reserved = call('reserveForGoal', goalState(0), 'g', 50, { date: '2026-09-01' });
  const paid = call('payGoal', reserved, 'g', 80, { date: '2026-09-16', id: 'pay' });
  assert.equal(paid.goals[0].saved, 0); assert.equal(call('monthSummary', paid, '2026-09').available, -80);
  const reversed = call('revertGoalPayment', freeze(paid), 'g', 'pay');
  assert.equal(reversed.goals[0].saved, 50); assert.equal(reversed.goals[0].payments.length, 1); assert.equal(reversed.goals[0].payments[0].status, 'reversed');
  assert.equal(reversed.transactions.length, paid.transactions.length); assert.equal(call('monthSummary', reversed, '2026-09').expenses, 0); assert.equal(call('monthSummary', reversed, '2026-09').reserved, 50);
  assert.equal(call('revertGoalPayment', reversed, 'g', 'pay').goals[0].saved, 50);
});

test('using previous-month reserves creates a current release instead of inventing current income', () => {
  const reserved = call('reserveForGoal', goalState(0), 'g', 100, { date: '2026-08-10' });
  const paid = call('payGoal', reserved, 'g', 40, { date: '2026-09-16' });
  const current = call('monthSummary', paid, '2026-09');
  assert.equal(current.income, 0); assert.equal(current.expenses, 40); assert.equal(current.reserved, -40); assert.equal(current.available, 0);
});

test('legacy goal payment remains progress but not cash and cannot be reversed by guessing its transaction', () => {
  const state = freeze({ ...goalState(25), goals: [{ id: 'g', saved: 25, payments: [{ id: 'old', amount: 50 }] }], transactions: [tx('possible', 50, 'expense', { category: '💰 Ahorro' })] });
  assert.equal(call('goalCash', state.goals[0]), 25); assert.equal(call('goalProgress', state.goals[0]), 75);
  assert.throws(() => call('revertGoalPayment', state, 'g', 'old'), e => e.code === 'AMBIGUOUS_LEGACY_PAYMENT');
});

test('operations reject bad dates, missing goals, zero amounts and broken payment links without mutating input', () => {
  const state = freeze(goalState(10));
  assert.throws(() => call('reserveForGoal', state, 'missing', 1, { date: '2026-09-16' }));
  assert.throws(() => call('reserveForGoal', state, 'g', 1, { date: '2026-02-30' }));
  assert.throws(() => call('payGoal', state, 'g', 0, { date: '2026-09-16' }));
  const paid = call('payGoal', state, 'g', 5, { date: '2026-09-16', id: 'pay' });
  assert.throws(() => call('revertGoalPayment', { ...paid, transactions: [] }, 'g', 'pay'));
  assert.equal(state.goals[0].saved, 10);
});

test('CEDEAR valuation rejects bare underlying USD quote but accepts its own market quote and keeps cost basis', () => {
  const holding = { id: 'h', type: 'cedear', ticker: 'AAPL', quantity: 10, originalCurrency: 'ARS', originalBuyPrice: 10000, totalInvestedArs: 100000 };
  const wrong = call('calcHoldingValueArs', holding, { AAPL: { price: 200, currency: 'USD' } }, 1350);
  assert.equal(wrong.invArs, 100000); assert.equal(wrong.curArs, 100000); assert.ok(wrong.warnings.length);
  const key = call('getHoldingQuoteKey', holding);
  const right = call('calcHoldingValueArs', holding, { [key]: { price: 12000, currency: 'ARS' } }, 1350);
  assert.equal(right.invArs, 100000); assert.equal(right.curArs, 120000);
  const tickerBA = call('calcHoldingValueArs', holding, { 'AAPL.BA': { price: 12000, currency: 'ARS' } }, 1350);
  assert.equal(tickerBA.curArs, 120000);
});

test('fixed-term valuation stops at maturity, while invalid dates retain principal with an explicit limitation', () => {
  const holding = { type: 'plazo_fijo', totalInvestedArs: 100000, rate: 36.5, buyDate: '2026-08-01', maturityDate: '2026-08-31' };
  assert.equal(call('calcHoldingValueArs', holding, {}, 1350, { asOfDate: '2026-09-16' }).curArs, 103000);
  const invalid = call('calcHoldingValueArs', { ...holding, buyDate: '' }, {}, 1350, { asOfDate: '2026-09-16' });
  assert.equal(invalid.curArs, 100000); assert.ok(invalid.warnings.length);
});

test('a recurring period cannot be linked to a second transaction after a direct existing link', () => {
  const state = freeze({ ...empty(), recurring: [{ id: 'rent', amount: 100, type: 'expense', lastMonth: '2026-08' }], transactions: [tx('first', 100, 'expense', { recurringId: 'rent', recurringMonth: '2026-09' }), tx('second', 100)] });
  assert.throws(() => call('confirmRecurring', state, 'rent', '2026-09', { transactionId: 'second' }), e => e.code === 'OPERATION_CONFLICT');
});

test('a missing recurring payment is returned for review and cannot be silently reported confirmed', () => {
  const state = freeze({ ...empty(), recurring: [{ id: 'rent', amount: 100, type: 'expense', lastMonth: '2026-08', confirmations: { '2026-09': { status: 'paid', transactionId: 'missing' } } }] });
  const pending = call('getPendingRecurring', state, '2026-09');
  assert.equal(pending.length, 1); assert.equal(pending[0].status, 'review'); assert.ok(pending[0].warnings.length);
  assert.throws(() => call('confirmRecurring', state, 'rent', '2026-09', { date: '2026-09-16' }), e => e.code === 'BROKEN_RECURRING_LINK');
});

test('a goal payment retry validates its existing expense and refuses a broken link', () => {
  const paid = call('payGoal', goalState(100), 'g', 40, { date: '2026-09-16', id: 'pay' });
  const broken = freeze({ ...paid, transactions: paid.transactions.filter(t => t.kind !== 'goal_payment') });
  assert.throws(() => call('payGoal', broken, 'g', 40, { date: '2026-09-16', id: 'pay' }), e => e.code === 'BROKEN_PAYMENT_LINK');
});

test('reversal refuses corrupted reserve release metadata instead of subtracting cash', () => {
  const paid = call('payGoal', goalState(0), 'g', 40, { date: '2026-09-16', id: 'pay' });
  const corrupt = freeze({ ...paid, goals: paid.goals.map(g => ({ ...g, payments: g.payments.map(p => ({ ...p, reserveReleased: -10 })) })) });
  assert.throws(() => call('revertGoalPayment', corrupt, 'g', 'pay'), e => e.code === 'BROKEN_PAYMENT_LINK');
});

test('period sums retain centavos, and a canceled legacy milestone does not count as progress', () => {
  const summary = call('monthSummary', { ...empty(), transactions: [tx('a', 0.1), tx('b', 0.2)] }, '2026-09');
  assert.equal(summary.expenses, 0.3); assert.equal(summary.available, -0.3);
  assert.equal(call('goalProgress', { saved: 0.1, milestones: [{ amount: 0.2 }, { amount: 1, status: 'reversed' }] }), 0.3);
});

test('decimal parser preserves fractional crypto units and rates while money rounds only at the monetary boundary', () => {
  for (const [raw, expected] of [['0.00000001', 0.00000001], ['0,00015', 0.00015], ['12.34567', 12.34567], ['-1.234,5678', -1234.5678], [1.005, 1.005], ['', 0]]) assert.equal(call('parseDecimal', raw), expected);
  assert.ok(Number.isNaN(call('parseDecimal', '12abc')));
  assert.equal(call('parseMoney', '12.34567'), 12.35);
});

test('currency markers and whitespace cannot splice malformed fragments into a different amount', () => {
  for (const raw of ['1USD2', '1 2', '$1USD', 'ARSUSD1', '1 $ 2']) assert.ok(Number.isNaN(call('parseDecimal', raw)), raw);
  for (const [raw, expected] of [['-ARS 1.234,56', -1234.56], ['USD -1,234.56', -1234.56], ['1.234,56 ARS', 1234.56], ['(ARS 1.234,56)', -1234.56]]) assert.equal(call('parseMoney', raw), expected);
});

test('crypto valuation does not accept a bare USD ticker that may belong to a different asset', () => {
  const holding = { type: 'crypto', ticker: 'BTC', quantity: 1, totalInvestedArs: 100000 };
  assert.equal(call('calcHoldingValueArs', holding, { BTC: { price: 50, currency: 'USD' } }, 1000).curArs, 100000);
  assert.equal(call('calcHoldingValueArs', holding, { 'crypto:BTCUSDT': { price: 50000, currency: 'USD' } }, 1000).curArs, 50000000);
});

test('ungrouped decimal mode preserves edited fractional quantities, prices and rates without changing money input', () => {
  for (const [raw, expected] of [['1.234', 1.234], ['1,234', 1.234], ['36.125', 36.125], [String(1.234), 1.234], ['0.00000001', 1e-8]]) {
    assert.equal(call('parseDecimal', raw, { grouped: false }), expected);
  }
  for (const raw of ['1.234,56', '1,234.56', '1.000.000']) assert.ok(Number.isNaN(call('parseDecimal', raw, { grouped: false })), raw);
  assert.equal(call('parseMoney', '1.234'), 1234);
  assert.equal(call('parseMoney', '1.234,56'), 1234.56);
});

test('legacy qty values are valued while missing or invalid units retain cost instead of fabricating a full loss', () => {
  const holding = { type: 'crypto', ticker: 'BTC', qty: 2, totalInvestedArs: 1000 };
  const prices = { 'crypto:BTCUSDT': { price: 10, currency: 'USD' } };
  assert.equal(call('calcHoldingValueArs', holding, prices, 100).curArs, 2000);
  for (const quantity of [undefined, 0, -2, NaN]) {
    const invalid = { ...holding, qty: undefined, quantity };
    const result = call('calcHoldingValueArs', invalid, prices, 100);
    assert.equal(result.curArs, 1000); assert.equal(result.priceStatus, 'cost'); assert.ok(result.warnings.length);
  }
});

test('category comparison does not call an entirely unobserved period a zero-spending improvement', () => {
  const prior = tx('prior', 10000, 'expense', { date: '2026-08-10' });
  assert.deepEqual(call('getCategoryChanges', { ...empty(), transactions: [prior] }, '2026-09', '2026-09-16'), []);
  assert.deepEqual(call('getCategoryChanges', { ...empty(), transactions: [tx('current', 10000)] }, '2026-09', '2026-09-16'), []);
  assert.deepEqual(call('getCategoryChanges', { ...empty(), transactions: [prior, tx('later', 100, 'income', { date: '2026-09-20' }), tx('voided', 100, 'expense', { voided: true })] }, '2026-09', '2026-09-16'), []);
});

test('observed periods may have new or absent categories without inventing a zero-base percentage', () => {
  const state = { ...empty(), transactions: [tx('prior', 100, 'expense', { date: '2026-08-10', category: 'Transporte' }), tx('current', 200, 'expense', { category: 'Comida' })] };
  const changes = call('getCategoryChanges', state, '2026-09', '2026-09-16');
  assert.equal(changes.find(c => c.category === 'Transporte').percent, -100);
  assert.equal(changes.find(c => c.category === 'Comida').percent, null);
});

test('ungrouped editor mode round-trips tiny numeric quantities serialized by JavaScript as exponents', () => {
  assert.equal(call('parseDecimal', String(0.00000001), { grouped: false }), 0.00000001);
  assert.equal(call('parseDecimal', '1,25e-8', { grouped: false }), 0.0000000125);
  assert.ok(Number.isNaN(call('parseDecimal', '1e999', { grouped: false })));
  assert.ok(Number.isNaN(call('parseMoney', '1e3')));
});
