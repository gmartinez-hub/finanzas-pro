export const STATE_SCHEMA_VERSION = 1;
export const DEFAULT_STATE_KEY = 'fp_v3b';

function failure(code, message, details = {}) {
  return Object.assign(new Error(message), { name: 'StateStorageError', code, ...details });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateJSON(value, path = 'state', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw failure('INVALID_STATE', `Valor no serializable en ${path}.`);
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw failure('INVALID_STATE', `Clave no admitida en ${path}.`);
    validateJSON(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function validateState(state) {
  if (!object(state) || !Array.isArray(state.transactions)) throw failure('INVALID_STATE', 'El estado debe incluir una lista de movimientos.');
  validateJSON(state);
  for (const collection of ['transactions', 'goals', 'holdings', 'salaries', 'recurring', 'savedAnalyses', 'importBatches']) {
    if (state[collection] !== undefined && (!Array.isArray(state[collection]) || state[collection].some(row => !object(row)))) {
      throw failure('INVALID_STATE', `La colección ${collection} no es válida.`);
    }
  }
  const ids = new Set();
  for (const tx of state.transactions) {
    if (typeof tx.id !== 'string' || !tx.id || ids.has(tx.id) || typeof tx.amount !== 'number' || !Number.isFinite(tx.amount) || tx.amount < 0 || typeof tx.date !== 'string' || !tx.date || typeof tx.type !== 'string' || !tx.type) {
      throw failure('INVALID_STATE', 'Hay un movimiento sin identidad, fecha, tipo o importe válido.');
    }
    ids.add(tx.id);
  }
  for (const key of ['budgets', 'marketPrices', 'usdRates']) {
    if (state[key] !== undefined && !object(state[key])) throw failure('INVALID_STATE', `El campo ${key} no es válido.`);
  }
  const numberField = (record, key, { required = false, positive = false } = {}) => {
    if (record[key] === undefined && !required) return;
    if (typeof record[key] !== 'number' || !Number.isFinite(record[key]) || (positive ? record[key] <= 0 : record[key] < 0)) throw failure('INVALID_STATE', `El campo ${key} debe ser un número ${positive ? 'positivo' : 'no negativo'}.`);
  };
  const textField = (record, key, required = false) => {
    if (record[key] === undefined && !required) return;
    if (typeof record[key] !== 'string' || (required && !record[key].trim())) throw failure('INVALID_STATE', `El campo ${key} debe ser texto válido.`);
  };
  const currencyField = (record, key) => {
    if (record[key] !== undefined && !['ARS', 'USD'].includes(record[key])) throw failure('INVALID_STATE', `La moneda ${key} debe ser ARS o USD.`);
  };
  currencyField(state, 'displayCurrency');
  if (state.usdType !== undefined && !['oficial', 'mep', 'blue'].includes(state.usdType)) throw failure('INVALID_STATE', 'El tipo de dólar no es válido.');
  numberField(state, 'usdRate', { positive: true });
  for (const key of Object.keys(state.usdRates ?? {})) numberField(state.usdRates, key, { required: true, positive: true });
  for (const key of Object.keys(state.budgets ?? {})) numberField(state.budgets, key, { required: true });
  for (const tx of state.transactions) {
    for (const key of ['description', 'category', 'source']) textField(tx, key);
    for (const key of ['currency', 'originalCurrency']) currencyField(tx, key);
    numberField(tx, 'originalAmount');
    for (const key of ['fxRate', 'fxRateAtEntry']) numberField(tx, key, { positive: true });
  }
  for (const goal of state.goals ?? []) {
    textField(goal, 'id', true); textField(goal, 'name', true);
    numberField(goal, 'target', { required: true }); numberField(goal, 'saved');
    for (const key of ['currency', 'originalCurrency']) currencyField(goal, key);
    for (const key of ['icon', 'deadline', 'createdAt']) textField(goal, key);
    for (const key of ['payments', 'milestones']) {
      if (goal[key] === undefined) continue;
      if (!Array.isArray(goal[key]) || goal[key].some(payment => !object(payment))) throw failure('INVALID_STATE', `La colección ${key} de una meta no es válida.`);
      for (const payment of goal[key]) {
        numberField(payment, 'amount', { required: true });
        for (const name of ['id', 'date', 'label', 'transactionId']) textField(payment, name);
      }
    }
  }
  for (const holding of state.holdings ?? []) {
    textField(holding, 'id', true); textField(holding, 'type', true);
    for (const key of ['name', 'ticker', 'buyDate', 'maturityDate']) textField(holding, key);
    if (holding.goalId !== null) textField(holding, 'goalId');
    for (const key of ['quantity', 'originalBuyPrice', 'buyPrice', 'totalInvested', 'totalInvestedArs']) numberField(holding, key);
    for (const key of ['currency', 'originalCurrency']) currencyField(holding, key);
  }
  for (const salary of state.salaries ?? []) {
    textField(salary, 'month', true); numberField(salary, 'base', { required: true });
    if (salary.extras !== undefined) {
      if (!Array.isArray(salary.extras) || salary.extras.some(extra => !object(extra))) throw failure('INVALID_STATE', 'Los ingresos extra no son válidos.');
      for (const extra of salary.extras) { numberField(extra, 'amt', { required: true }); textField(extra, 'desc'); }
    }
  }
  for (const recurring of state.recurring ?? []) {
    textField(recurring, 'id', true); numberField(recurring, 'amount', { required: true });
    for (const key of ['description', 'category', 'type']) textField(recurring, key);
    currencyField(recurring, 'currency');
  }
  return state;
}

function validRevision(revision) {
  return Number.isSafeInteger(revision) && revision >= 0;
}

function clone(state) {
  return JSON.parse(JSON.stringify(validateState(state)));
}

function storageFor(options) {
  try {
    const storage = options.storage ?? globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('Storage unavailable');
    return storage;
  } catch (cause) {
    throw failure('READ_FAILED', 'No se puede acceder al almacenamiento de este navegador.', { cause });
  }
}

function readRaw(storage, key) {
  try {
    return storage.getItem(key);
  } catch (cause) {
    throw failure('READ_FAILED', 'No se pudieron leer los datos guardados.', { cause });
  }
}

function decode(raw) {
  if (raw === null) return { state: null, revision: 0, legacy: false, exists: false };
  try {
    const value = JSON.parse(raw);
    if (value?.format === 'mangos-state') {
      if (value.schemaVersion !== STATE_SCHEMA_VERSION || !validRevision(value.revision)) throw new Error('Versión o revisión no compatible.');
      return { state: validateState(value.state), revision: value.revision, legacy: false, exists: true };
    }
    if (value?.format || value?.schemaVersion) throw new Error('Formato de estado no compatible.');
    // The old record already stores transaction.amount in ARS. Never convert it here.
    return { state: validateState(value), revision: 0, legacy: true, exists: true };
  } catch (cause) {
    throw failure('CORRUPT', 'Los datos guardados no se pudieron validar. Se conservaron intactos.', { cause, raw });
  }
}

/** Read without writing, repairing or replacing the previous record. */
export function loadState(options = {}) {
  const { key = DEFAULT_STATE_KEY, initialState = null } = options;
  const record = decode(readRaw(storageFor(options), key));
  if (!record.exists && initialState !== null) return { ...record, state: clone(initialState) };
  return record;
}

/**
 * Optimistic revision checks detect stale tabs, not an atomic cross-tab CAS.
 * The caller must also handle storage events and offer reload on conflict.
 * No write is attempted when the existing record cannot be validated.
 */
export function saveState(state, options = {}) {
  const { key = DEFAULT_STATE_KEY, expectedRevision } = options;
  const nextState = clone(state);
  if (!validRevision(expectedRevision)) throw failure('CONFLICT', 'Falta la revisión del estado que se quiere guardar.');
  const storage = storageFor(options);
  const previousRaw = readRaw(storage, key);
  const current = decode(previousRaw);
  if (current.revision !== expectedRevision) throw failure('CONFLICT', 'Otra pestaña modificó los datos. Recargá antes de volver a guardar.', { currentRevision: current.revision });
  if (expectedRevision === Number.MAX_SAFE_INTEGER) throw failure('INVALID_STATE', 'La revisión excede el límite admitido.');
  const revision = expectedRevision + 1;
  const raw = JSON.stringify({ format: 'mangos-state', schemaVersion: STATE_SCHEMA_VERSION, revision, state: nextState });
  try {
    // The previous copy is required: if it cannot be kept, abort the main write.
    if (previousRaw !== null) storage.setItem(`${key}:previous`, previousRaw);
    if (readRaw(storage, key) !== previousRaw) throw failure('CONFLICT', 'Los datos cambiaron durante el guardado. Recargá la aplicación.');
    storage.setItem(key, raw);
  } catch (cause) {
    if (cause.code === 'CONFLICT' || cause.code === 'READ_FAILED') throw cause;
    const quota = cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED' || cause.code === 22;
    throw failure(quota ? 'QUOTA' : 'WRITE_FAILED', quota ? 'No queda espacio para guardar. Descargá una copia de seguridad.' : 'No se pudieron guardar los cambios.', { cause });
  }
  if (readRaw(storage, key) !== raw) throw failure('CONFLICT', 'Otro guardado reemplazó este cambio. Recargá antes de continuar.');
  return { state: nextState, revision, legacy: false, exists: true };
}

/** Complete backup; CSV is intentionally not a replacement for this format. */
export function createBackup(state, { revision = 0 } = {}) {
  if (!validRevision(revision)) throw failure('INVALID_BACKUP', 'La revisión de la copia no es válida.');
  return JSON.stringify({ format: 'mangos-backup', schemaVersion: STATE_SCHEMA_VERSION, revision, createdAt: new Date().toISOString(), state: clone(state) }, null, 2);
}

export function parseBackup(text) {
  try {
    if (typeof text !== 'string') throw new Error('La copia debe ser un archivo JSON.');
    const backup = JSON.parse(text);
    // The original Exportar datos button emitted the complete raw state. Require
    // its financial collections, not merely an arbitrary object with one key.
    const legacyCollections = ['transactions', 'goals', 'holdings', 'salaries', 'recurring'];
    if (object(backup) && !Object.hasOwn(backup, 'format') && !Object.hasOwn(backup, 'schemaVersion') && legacyCollections.every(key => Array.isArray(backup[key])) && object(backup.budgets) && typeof backup.usdRate === 'number' && Number.isFinite(backup.usdRate) && backup.usdRate > 0) {
      return { format: 'mangos-backup', schemaVersion: STATE_SCHEMA_VERSION, revision: 0, legacy: true, state: validateState(backup) };
    }
    if (backup?.format !== 'mangos-backup' || backup.schemaVersion !== STATE_SCHEMA_VERSION || !validRevision(backup.revision)) throw new Error('Formato, versión o revisión no compatible.');
    validateState(backup.state);
    return backup;
  } catch (cause) {
    throw failure('INVALID_BACKUP', 'La copia no tiene un formato de Mangos válido y compatible.', { cause });
  }
}

export function restoreState(text, options = {}) {
  const backup = parseBackup(text);
  if (typeof options.recoveryRaw === 'string') {
    const { key = DEFAULT_STATE_KEY, recoveryRaw, expectedRevision } = options;
    const storage = storageFor(options);
    if (expectedRevision !== 0 || readRaw(storage, key) !== recoveryRaw) throw failure('CONFLICT', 'Los datos cambiaron desde que se revisó la recuperación.');
    let damaged = false;
    try { decode(recoveryRaw); } catch (error) { if (error.code === 'CORRUPT') damaged = true; else throw error; }
    if (!damaged) throw failure('CONFLICT', 'El estado actual es válido; usá la restauración con su revisión actual.');
    const raw = JSON.stringify({ format: 'mangos-state', schemaVersion: STATE_SCHEMA_VERSION, revision: 1, state: backup.state });
    try {
      // Keep the last valid previous copy as well as the damaged bytes.
      storage.setItem(`${key}:corrupt`, recoveryRaw);
      if (readRaw(storage, key) !== recoveryRaw) throw failure('CONFLICT', 'Los datos cambiaron durante la recuperación.');
      storage.setItem(key, raw);
    } catch (cause) {
      if (cause.code === 'CONFLICT' || cause.code === 'READ_FAILED') throw cause;
      const quota = cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED' || cause.code === 22;
      throw failure(quota ? 'QUOTA' : 'WRITE_FAILED', 'No se pudo restaurar la copia. El contenido anterior sigue disponible.', { cause });
    }
    if (readRaw(storage, key) !== raw) throw failure('CONFLICT', 'Otra pestaña cambió los datos durante la recuperación.');
    return { state: backup.state, revision: 1, legacy: false, exists: true };
  }
  // Use the local revision, never an imported revision, to prevent stale writes.
  return saveState(backup.state, options);
}
