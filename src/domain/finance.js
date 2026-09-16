/** Pure financial domain. Stored amounts and action amounts are always canonical ARS.
 * `currency: "USD"` on legacy records is NOT an instruction to convert again.
 * Mutations return a complete new state; callers own persistence and user confirmation.
 */
export class FinanceError extends Error {
  constructor(code, message) { super(message); this.name = 'FinanceError'; this.code = code; }
}
const fail = (code, message) => { throw new FinanceError(code, message); };
const round = value => {
  const cents = Math.round((Math.abs(value) + Number.EPSILON) * 100);
  return Number.isSafeInteger(cents) ? (Math.sign(value) * cents || 0) / 100 : NaN;
};

/** Accept AR/US grouped numbers without rounding quantities/rates. A nonzero
 * one-to-three-digit prefix followed by groups of three is grouping. Leading
 * zero or other decimal lengths preserve precision. With grouped:false a single
 * separator is always decimal and grouping is rejected (quantities/rates/unit prices).
 * Malformed input returns NaN. */
export function parseDecimal(raw, { grouped = true } = {}) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (raw == null || raw === '') return 0;
  if (typeof raw !== 'string') return NaN;
  let value = raw.trim();
  if (!value) return 0;
  let negative = false, signed = false;
  if (/^\(.*\)$/.test(value)) { negative = true; signed = true; value = value.slice(1, -1).trim(); }
  if (/^[+-]/.test(value)) { if (signed) return NaN; negative = value[0] === '-'; signed = true; value = value.slice(1).trim(); }
  const prefix = value.match(/^(?:ARS|USD|US\$|U\$S|AR\$|\$)/i);
  if (prefix) value = value.slice(prefix[0].length).trim();
  const suffix = value.match(/(?:ARS|USD|US\$|U\$S|AR\$|\$)$/i);
  if (suffix) { if (prefix) return NaN; value = value.slice(0, -suffix[0].length).trim(); }
  if (/^[+-]/.test(value)) { if (signed) return NaN; negative = value[0] === '-'; value = value.slice(1).trim(); }
  if (!grouped && /^\d+(?:[.,]\d+)?[eE][+-]?\d+$/.test(value)) {
    // String(number) uses exponents for small fractional units on edit.
    const result = Number(value.replace(',', '.')) * (negative ? -1 : 1);
    return Number.isFinite(result) ? result : NaN;
  }
  if (!/^\d+(?:[.,]\d+)*$/.test(value)) return NaN;
  let normalized;
  if (!grouped) {
    if (!/^\d+(?:[.,]\d+)?$/.test(value)) return NaN;
    normalized = value.replace(',', '.');
  } else if (value.includes('.') && value.includes(',')) {
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(value)) normalized = value.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(value)) normalized = value.replace(/,/g, '');
    else return NaN;
  } else if (/^[1-9]\d{0,2}([.,]\d{3})+$/.test(value)) normalized = value.replace(/[.,]/g, '');
  else if (/^\d+(?:[.,]\d+)?$/.test(value)) normalized = value.replace(',', '.');
  else return NaN;
  const result = Number(normalized) * (negative ? -1 : 1);
  return Number.isFinite(result) ? result : NaN;
}
export function parseMoney(raw) {
  const value = parseDecimal(raw);
  return Number.isFinite(value) ? round(value) : NaN;
}
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? round(value) : NaN;
const positive = value => {
  const result = amount(value);
  if (!(result > 0)) fail('INVALID_AMOUNT', 'Ingresá un importe positivo en ARS.');
  return result;
};
const money = value => Number.isFinite(amount(value)) ? amount(value) : 0;
const sum = (rows, field = 'amount') => rows.reduce((total, row) => total + Math.round(money(row[field]) * 100), 0) / 100;
const active = row => !row.voided && !row.reversed && row.status !== 'reversed';
const typeOf = raw => ({ income: 'income', ingreso: 'income', expense: 'expense', gasto: 'expense', egreso: 'expense', transfer: 'transfer', transferencia: 'transfer', 'transferencia interna': 'transfer' })[String(raw || '').toLowerCase().trim()] || null;
const array = value => Array.isArray(value) ? value : [];
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
};
const validMonth = month => /^\d{4}-\d{2}$/.test(String(month || '')) && validDate(`${month}-01`);
const requireMonth = month => { if (!validMonth(month)) fail('INVALID_MONTH', 'Elegí un mes válido.'); return month; };
const requireDate = date => { if (!validDate(date)) fail('INVALID_DATE', 'Elegí una fecha válida.'); return date; };
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const rowsInMonth = (transactions, month) => array(transactions).filter(tx => active(tx) && validDate(tx.date) && tx.date.slice(0, 7) === month);
const uniqueWarnings = warnings => [...new Set(warnings)];

/** The monthly salary record is authoritative when present; salary/extra
 * transactions are its projections, not additional income. Mismatches are
 * surfaced, never repaired by fuzzy amount/description matching. */
export function getMonthIncomeParts(salaries, transactions, month) {
  requireMonth(month);
  const records = array(salaries).filter(record => record.month === month);
  const record = records[0];
  const rows = rowsInMonth(transactions, month).filter(tx => typeOf(tx.type) === 'income');
  const baseRows = rows.filter(tx => tx.source === 'salary');
  const extraRows = rows.filter(tx => tx.source === 'extra');
  const warnings = [];
  const base = record ? money(record.base) : sum(baseRows);
  const extras = record ? sum(array(record.extras).filter(active), 'amt') : sum(extraRows);
  const other = sum(rows.filter(tx => tx.source !== 'salary' && tx.source !== 'extra'));
  if (records.length > 1) warnings.push('Hay más de un registro de sueldo en este mes; se usa el primero. Revisá el historial.');
  if (record && baseRows.length && sum(baseRows) !== base) warnings.push('Sueldo y movimientos asociados difieren; se usa el registro de Sueldo.');
  if (record && extraRows.length && sum(extraRows) !== extras) warnings.push('Ingresos extra y movimientos asociados difieren; se usa el registro de Sueldo.');
  if (record && (!Number.isFinite(amount(record.base)) || array(record.extras).some(item => !Number.isFinite(amount(item.amt))))) warnings.push('Hay importes de sueldo inválidos que no pudieron sumarse.');
  return { base, extras, other, total: round(base + extras + other), warnings };
}

/** Period flow, not bank balance: available = income - expenses - net reserves.
 * A release of an older reserve can make `reserved` negative this month.
 * Legacy category Ahorro remains an expense until explicitly reconciled. */
export function monthSummary(state, month) {
  requireMonth(month);
  const rows = rowsInMonth(state.transactions, month);
  const incomeParts = getMonthIncomeParts(state.salaries, state.transactions, month);
  const expenseRows = rows.filter(tx => typeOf(tx.type) === 'expense');
  const reserveRows = rows.filter(tx => typeOf(tx.type) === 'transfer' && tx.kind === 'goal_reserve');
  const releaseRows = rows.filter(tx => typeOf(tx.type) === 'transfer' && tx.kind === 'goal_release');
  const expenses = sum(expenseRows);
  const reserveContributions = sum(reserveRows);
  const reserveReleased = sum(releaseRows);
  const reserved = round(reserveContributions - reserveReleased);
  const balance = round(incomeParts.total - expenses);
  const warnings = [...incomeParts.warnings];
  if (expenseRows.some(tx => /ahorro/i.test(tx.category || '') && tx.kind !== 'goal_payment')) warnings.push('Hay movimientos históricos de Ahorro sin vínculo explícito: se conservan como gastos, sin reclasificarlos.');
  if (array(state.transactions).some(tx => active(tx) && !validDate(tx.date))) warnings.push('Hay movimientos sin fecha válida que no pueden asignarse a un mes.');
  if (rows.some(tx => !Number.isFinite(amount(tx.amount)) || !typeOf(tx.type))) warnings.push('Hay movimientos con importe o tipo inválido que no pudieron incluirse completamente.');
  const hasSalary = array(state.salaries).some(record => record.month === month);
  return {
    month, income: incomeParts.total, expenses, reserved, available: round(balance - reserved), balance,
    incomeParts, reserveContributions, reserveReleased, hasData: rows.length > 0 || hasSalary,
    warnings: uniqueWarnings(warnings),
    coverage: { transactionCount: rows.length, hasIncome: incomeParts.total > 0, hasExpenses: expenseRows.length > 0, hasSalary, accountBalanceKnown: false },
  };
}

export function getCategoryChanges(state, month, asOfDate = localDate(new Date())) {
  requireMonth(month);
  if (asOfDate instanceof Date) asOfDate = localDate(asOfDate);
  requireDate(asOfDate);
  if (month > asOfDate.slice(0, 7)) return [];
  const [year, mo] = month.split('-').map(Number);
  const prior = new Date(Date.UTC(year, mo - 2, 1));
  const previousMonth = `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, '0')}`;
  const currentDays = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  const previousDays = new Date(Date.UTC(year, mo - 1, 0)).getUTCDate();
  const complete = month < asOfDate.slice(0, 7) || Number(asOfDate.slice(8)) === currentDays;
  const cutoff = Math.min(Number(asOfDate.slice(8)), currentDays, previousDays);
  const currentStart = `${month}-01`, previousStart = `${previousMonth}-01`;
  const currentEnd = `${month}-${String(complete ? currentDays : cutoff).padStart(2, '0')}`;
  const previousEnd = `${previousMonth}-${String(complete ? previousDays : cutoff).padStart(2, '0')}`;
  // A period with no observations is unknown, not evidence of zero spending.
  const observations = array(state.transactions).filter(tx => active(tx) && validDate(tx.date) && typeOf(tx.type) && Number.isFinite(amount(tx.amount)));
  const observed = (start, end) => observations.some(tx => tx.date >= start && tx.date <= end) || array(state.salaries).some(record => record.month === start.slice(0, 7));
  if (!observed(currentStart, currentEnd) || !observed(previousStart, previousEnd)) return [];
  const expenses = observations.filter(tx => typeOf(tx.type) === 'expense');
  const currentRows = expenses.filter(tx => tx.date >= currentStart && tx.date <= currentEnd);
  const previousRows = expenses.filter(tx => tx.date >= previousStart && tx.date <= previousEnd);
  const categories = new Set([...currentRows, ...previousRows].map(tx => tx.category || '❓ Otros'));
  return [...categories].map(category => {
    const currentItems = currentRows.filter(tx => (tx.category || '❓ Otros') === category);
    const previousItems = previousRows.filter(tx => (tx.category || '❓ Otros') === category);
    const current = sum(currentItems), previous = sum(previousItems), delta = round(current - previous);
    return { category, current, previous, delta, percent: previous ? round(delta / previous * 100) : null, currentStart, currentEnd, previousStart, previousEnd, transactionIds: currentItems.map(tx => tx.id), previousTransactionIds: previousItems.map(tx => tx.id) };
  }).filter(item => item.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.category.localeCompare(b.category)).slice(0, 3);
}

export function simulateDecision(summary, decision) {
  const amount = positive(decision.amount);
  if (!['expense', 'reserve'].includes(decision.type)) fail('UNSUPPORTED_DECISION', 'Podés probar un gasto o una reserva.');
  const before = { ...summary }, after = { ...summary };
  if (decision.type === 'expense') { after.expenses = round(summary.expenses + amount); after.balance = round(summary.balance - amount); }
  else { after.reserved = round(summary.reserved + amount); after.reserveContributions = round((summary.reserveContributions || 0) + amount); }
  after.available = round(summary.available - amount);
  return { type: decision.type, amount, before, after, deltaAvailable: -amount };
}

const completedRecurringRows = (state, recurringId, month) => rowsInMonth(state.transactions, month).filter(tx => tx.recurringId === recurringId && (tx.recurringMonth || month) === month);
const recurringConfirmation = (recurring, month) => recurring.confirmations?.[month];
const eligibleRecurring = (recurring, month) => !recurring.paused && (!validMonth(recurring.startMonth) || recurring.startMonth <= month) && (!validMonth(recurring.lastMonth) || recurring.lastMonth < month);
const paidRecurringLinkValid = (state, recurring, month, confirmation) => array(state.transactions).some(tx => tx.id === confirmation.transactionId && active(tx) && validDate(tx.date) && tx.date.slice(0, 7) === month && tx.recurringId === recurring.id && typeOf(tx.type) === (typeOf(recurring.type) || 'expense'));
export function getPendingRecurring(state, month) {
  requireMonth(month);
  return array(state.recurring).flatMap(recurring => {
    const confirmation = recurringConfirmation(recurring, month);
    const broken = confirmation?.status === 'paid' && !paidRecurringLinkValid(state, recurring, month, confirmation);
    if (!broken && (!eligibleRecurring(recurring, month) || confirmation || completedRecurringRows(state, recurring.id, month).length || rowsInMonth(state.transactions, month).some(tx => tx.id === recurring.originTransactionId))) return [];
    return [{ ...recurring, recurringId: recurring.id, month, amount: money(recurring.amount), dueDate: validDate(recurring.dueDate) && recurring.dueDate.slice(0, 7) === month ? recurring.dueDate : null, status: broken ? 'review' : 'pending', warnings: broken ? ['Falta el movimiento asociado a este pago; revisá el vínculo.'] : [] }];
  });
}

const metadata = options => Object.fromEntries(['originalAmount', 'originalCurrency', 'fxRateAtEntry', 'fxDate'].filter(key => options[key] !== undefined).map(key => [key, options[key]]));
const replaceRecurring = (state, recurringId, patch) => ({ ...state, recurring: array(state.recurring).map(item => item.id === recurringId ? { ...item, ...patch } : item) });

/** options: {date, amount?, transactionId?, action?: 'skip'|'pause'}.
 * Existing transaction links retain their actual amount/date and FX metadata.
 * lastMonth is an old applied-period cutoff; new confirmations never advance it. */
export function confirmRecurring(state, recurringId, month, options = {}) {
  requireMonth(month);
  const recurring = array(state.recurring).find(item => item.id === recurringId);
  if (!recurring) fail('RECURRING_NOT_FOUND', 'No se encontró el recurrente.');
  if (options.action === 'pause') return replaceRecurring(state, recurringId, { paused: true });
  if (options.action && !['skip', 'confirm'].includes(options.action)) fail('UNSUPPORTED_ACTION', 'Acción de recurrente no admitida.');
  const existing = recurringConfirmation(recurring, month);
  if (existing) {
    if (existing.status === 'paid' && !paidRecurringLinkValid(state, recurring, month, existing)) fail('BROKEN_RECURRING_LINK', 'El pago asociado falta o fue anulado; revisalo antes de continuar.');
    if (options.transactionId && existing.transactionId !== options.transactionId) fail('OPERATION_CONFLICT', 'Este período ya tiene otro movimiento asociado.');
    return { ...state };
  }
  if (!eligibleRecurring(recurring, month)) fail('PERIOD_NOT_PENDING', 'Ese período no está pendiente.');
  const linkedRows = completedRecurringRows(state, recurringId, month);
  if (linkedRows.length > 1) fail('AMBIGUOUS_RECURRING', 'Más de un movimiento está vinculado a este período.');
  if (linkedRows.length && options.transactionId && linkedRows[0].id !== options.transactionId) fail('OPERATION_CONFLICT', 'El período ya está vinculado a otro movimiento.');
  if (options.action === 'skip') {
    if (linkedRows.length) fail('PERIOD_ALREADY_PAID', 'El período ya tiene un pago vinculado.');
    return replaceRecurring(state, recurringId, { confirmations: { ...recurring.confirmations, [month]: { status: 'skipped' } } });
  }
  const expectedType = typeOf(recurring.type) || 'expense';
  let transactions = [...array(state.transactions)];
  let transaction = options.transactionId ? transactions.find(tx => tx.id === options.transactionId) : linkedRows[0];
  if (options.transactionId && !transaction) fail('TRANSACTION_NOT_FOUND', 'No se encontró el movimiento seleccionado.');
  if (transaction) {
    if (!active(transaction) || !validDate(transaction.date) || transaction.date.slice(0, 7) !== month || typeOf(transaction.type) !== expectedType || (transaction.recurringId && transaction.recurringId !== recurringId) || transaction.kind?.startsWith('goal_')) fail('INCOMPATIBLE_TRANSACTION', 'El movimiento no corresponde al tipo y período de este recurrente.');
    positive(transaction.amount);
    transaction = { ...transaction, recurringId, recurringMonth: month };
    transactions = transactions.map(tx => tx.id === transaction.id ? transaction : tx);
  } else {
    const date = requireDate(options.date);
    if (date.slice(0, 7) !== month) fail('INVALID_PERIOD_DATE', 'La fecha debe pertenecer al período confirmado.');
    const id = `recurring:${recurringId}:${month}`;
    if (transactions.some(tx => tx.id === id)) fail('OPERATION_CONFLICT', 'Ya existe un movimiento con esta identidad; revisá su estado.');
    transaction = { ...metadata(recurring), ...metadata(options), id, recurringId, recurringMonth: month, date, description: recurring.description || 'Pago recurrente', amount: positive(options.amount ?? recurring.amount), type: expectedType, category: recurring.category || '❓ Otros', currency: 'ARS', source: 'recurring', kind: 'recurring_payment' };
    transactions.push(transaction);
  }
  return { ...replaceRecurring(state, recurringId, { confirmations: { ...recurring.confirmations, [month]: { status: 'paid', transactionId: transaction.id, date: transaction.date } } }), transactions };
}

export const goalCash = goal => money(goal?.saved);
export const goalProgress = goal => round(goalCash(goal) + sum(array(goal?.payments || goal?.milestones).filter(active)));
const findGoal = (state, goalId) => {
  const goal = array(state.goals).find(item => item.id === goalId);
  if (!goal) fail('GOAL_NOT_FOUND', 'No se encontró la meta.');
  if (goal.saved != null && !Number.isFinite(amount(goal.saved))) fail('INVALID_RESERVE', 'La reserva registrada no es válida; revisala antes de continuar.');
  return goal;
};
const replaceGoal = (state, goalId, goal, transactions) => ({ ...state, goals: array(state.goals).map(item => item.id === goalId ? goal : item), transactions });
const operationId = (state, prefix, goalId, date, explicitId) => {
  if (explicitId != null) {
    if (typeof explicitId !== 'string' || !explicitId.trim()) fail('INVALID_OPERATION_ID', 'La operación necesita una identidad válida.');
    return explicitId;
  }
  const used = new Set([...array(state.transactions).map(tx => tx.id), ...array(state.goals).flatMap(goal => array(goal.payments).map(payment => payment.id))]);
  let index = 1, id;
  do { id = `${prefix}:${goalId}:${date}:${index++}`; } while (used.has(id) || used.has(`${id}:expense`) || used.has(`${id}:release`));
  return id;
};

/** New reserve: transfer/goal_reserve. options.date required; options.id makes
 * retries idempotent. amount is ARS; original metadata is preserved, not converted. */
export function reserveForGoal(state, goalId, value, options = {}) {
  const goal = findGoal(state, goalId), amount = positive(value), date = requireDate(options.date);
  const id = operationId(state, 'reserve', goalId, date, options.id);
  const transactions = array(state.transactions), existing = transactions.find(tx => tx.id === id);
  if (existing) {
    if (active(existing) && existing.kind === 'goal_reserve' && existing.goalId === goalId && existing.amount === amount && existing.date === date) return { ...state };
    fail('OPERATION_CONFLICT', 'La identidad corresponde a otra operación.');
  }
  const transaction = { ...metadata(options), id, date, amount, type: 'transfer', kind: 'goal_reserve', goalId, currency: 'ARS', category: '💰 Ahorro', description: `Reserva: ${goal.name || 'Meta'}`, source: 'goal' };
  return replaceGoal(state, goalId, { ...goal, saved: round(goalCash(goal) + amount) }, [...transactions, transaction]);
}

/** A payment consumes min(saved, amount) and records exactly one expense.
 * A linked transfer/goal_release offsets the consumed reserve in period flows. */
export function payGoal(state, goalId, value, options = {}) {
  const goal = findGoal(state, goalId), amount = positive(value), date = requireDate(options.date);
  const id = operationId(state, 'payment', goalId, date, options.id);
  const payments = array(goal.payments || goal.milestones), existing = payments.find(payment => payment.id === id);
  if (existing) {
    if (active(existing) && existing.amount === amount && existing.date === date) { validatePaymentLinks(state, goalId, existing); return { ...state }; }
    fail('OPERATION_CONFLICT', 'La identidad corresponde a un pago diferente o revertido.');
  }
  const transactions = [...array(state.transactions)], transactionId = `${id}:expense`, reserveReleased = Math.min(goalCash(goal), amount);
  const releaseTransactionId = reserveReleased ? `${id}:release` : null;
  if (transactions.some(tx => tx.id === id || tx.id === transactionId || tx.id === releaseTransactionId)) fail('OPERATION_CONFLICT', 'Ya existe una operación con esta identidad.');
  const name = String(options.name || 'Pago de meta').trim();
  const payment = { ...metadata(options), id, name, amount, date, transactionId, releaseTransactionId, reserveReleased, status: 'paid' };
  transactions.push({ ...metadata(options), id: transactionId, date, amount, type: 'expense', kind: 'goal_payment', goalId, paymentId: id, description: `${name}: ${goal.name || 'Meta'}`, category: options.category || '❓ Otros', currency: 'ARS', source: 'goal' });
  if (reserveReleased) transactions.push({ id: releaseTransactionId, date, amount: reserveReleased, type: 'transfer', kind: 'goal_release', goalId, paymentId: id, relatedTransactionId: transactionId, description: `Reserva aplicada: ${goal.name || 'Meta'}`, category: '💰 Ahorro', currency: 'ARS', source: 'goal' });
  return replaceGoal(state, goalId, { ...goal, saved: round(goalCash(goal) - reserveReleased), payments: [...payments, payment] }, transactions);
}

const validatePaymentLinks = (state, goalId, payment) => {
  if (!payment.transactionId || payment.reserveReleased == null) fail('AMBIGUOUS_LEGACY_PAYMENT', 'Este pago histórico no tiene vínculos suficientes para revertirlo sin afectar otros movimientos.');
  const transactions = array(state.transactions), expense = transactions.find(tx => tx.id === payment.transactionId);
  const release = payment.releaseTransactionId ? transactions.find(tx => tx.id === payment.releaseTransactionId) : null;
  const validRelease = Number.isFinite(amount(payment.reserveReleased)) && payment.reserveReleased <= payment.amount;
  if (!validRelease || !expense || !active(expense) || typeOf(expense.type) !== 'expense' || expense.kind !== 'goal_payment' || expense.paymentId !== payment.id || expense.goalId !== goalId || expense.amount !== payment.amount || expense.date !== payment.date || (payment.reserveReleased > 0 && (!release || !active(release) || typeOf(release.type) !== 'transfer' || release.kind !== 'goal_release' || release.goalId !== goalId || release.paymentId !== payment.id || release.amount !== payment.reserveReleased || release.date !== payment.date))) fail('BROKEN_PAYMENT_LINK', 'El pago y sus movimientos no coinciden; revisalos antes de revertir.');
};

/** Reversal retains history and voids linked effects. Legacy payments without
 * explicit links are deliberately unsupported: never guess which expense to undo. */
export function revertGoalPayment(state, goalId, paymentId) {
  const goal = findGoal(state, goalId), payments = array(goal.payments || goal.milestones);
  const payment = payments.find(item => item.id === paymentId);
  if (!payment) fail('PAYMENT_NOT_FOUND', 'No se encontró el pago.');
  if (!active(payment)) return { ...state };
  validatePaymentLinks(state, goalId, payment);
  const transactions = array(state.transactions);
  const ids = new Set([payment.transactionId, payment.releaseTransactionId]);
  return replaceGoal(state, goalId, { ...goal, saved: round(goalCash(goal) + payment.reserveReleased), payments: payments.map(item => item.id === paymentId ? { ...item, status: 'reversed', reversed: true } : item) }, transactions.map(tx => ids.has(tx.id) ? { ...tx, voided: true, status: 'reversed', reversalOfPaymentId: paymentId } : tx));
}

const quoteSymbol = holding => {
  const ticker = String(holding.ticker || '').trim().toUpperCase();
  if (holding.type === 'crypto') return ticker.endsWith('USDT') ? ticker : `${ticker}USDT`;
  return (holding.type === 'cedear' || holding.originalCurrency === 'ARS') && !ticker.endsWith('.BA') ? `${ticker}.BA` : ticker;
};
export const getHoldingQuoteKey = holding => holding.instrumentId || holding.quoteKey || `${holding.type || 'asset'}:${quoteSymbol(holding)}`;

/** Safe identity: prefer scoped quote keys or the actual exchange symbol. Bare
 * legacy ticker quotes need an explicit matching symbol for local instruments.
 * A missing quote falls back to purchase value with a visible limitation. */
export function calcHoldingValueArs(holding, marketPrices = {}, usdRate = 1, options = {}) {
  const warnings = [], quoteKey = getHoldingQuoteKey(holding), symbol = quoteSymbol(holding);
  const invArs = money(holding.totalInvestedArs ?? holding.totalInvested);
  let curArs = invArs, priceStatus = 'cost';
  if (['accion', 'cedear', 'etf', 'crypto'].includes(holding.type)) {
    const candidates = [marketPrices[quoteKey], marketPrices[symbol]];
    const legacy = marketPrices[holding.ticker];
    if (legacy && (legacy.symbol === symbol || legacy.ticker === symbol || (!symbol.endsWith('.BA') && holding.type !== 'crypto'))) candidates.push(legacy);
    const quote = candidates.find(item => item && Number(item.price) > 0 && Number.isFinite(Number(item.price)) && ['ARS', 'USD'].includes(item.currency) && (!item.instrumentId || item.instrumentId === quoteKey));
    const quantity = Number(holding.quantity ?? holding.qty);
    if (quote && quantity > 0 && Number.isFinite(quantity) && (quote.currency !== 'USD' || (Number.isFinite(usdRate) && usdRate > 0))) {
      curArs = round(quantity * Number(quote.price) * (quote.currency === 'USD' ? usdRate : 1)); priceStatus = 'market';
    } else warnings.push(!(quantity > 0) || !Number.isFinite(quantity) ? 'Cantidad insuficiente o inválida; se muestra el capital registrado.' : 'Sin cotización inequívoca de este instrumento; se muestra el capital registrado.');
  } else {
    const asOfDate = options.asOfDate || localDate(new Date());
    const start = holding.buyDate, maturity = holding.maturityDate;
    const capped = ['plazo_fijo', 'bono'].includes(holding.type);
    const rate = Number(holding.rate);
    if (!validDate(start) || !validDate(asOfDate) || !Number.isFinite(rate) || (capped && (!validDate(maturity) || maturity < start))) warnings.push('Fecha, vencimiento o tasa insuficientes; se conserva el capital sin estimar intereses.');
    else {
      const end = capped && maturity < asOfDate ? maturity : asOfDate;
      const days = Math.max(0, Math.floor((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 864e5));
      curArs = round(holding.type === 'fci' ? invArs * Math.pow(1 + rate / 100 / 365, days) : invArs * (1 + rate / 100 * days / 365));
      priceStatus = 'estimated';
      warnings.push('Valor estimado por tasa declarada; no es una cotización de mercado.');
    }
  }
  if (!Number.isFinite(curArs) || curArs < 0) { curArs = invArs; priceStatus = 'cost'; warnings.push('No se pudo calcular una valuación válida.'); }
  return { invArs, curArs, quoteKey, priceStatus, warnings };
}
