import { parseMoney } from './finance.js';

function fail(code, message, details = {}) {
  return Object.assign(new Error(message), { name: 'MovementImportError', code, ...details });
}

const norm = text => String(text ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]+/g, '');
function money(raw) {
  const amount = parseMoney(raw);
  if (!Number.isFinite(amount)) throw fail('INVALID_AMOUNT', 'El importe no tiene un formato numérico inequívoco.');
  return amount;
}

function typeOf(value) {
  const type = norm(value);
  if (['expense', 'expenses', 'gasto', 'gastos', 'egreso', 'egresos', 'debit', 'debito', 'cargo', 'compra', 'purchase', 'outflow', 'spend'].includes(type)) return 'expense';
  if (['income', 'incomes', 'ingreso', 'ingresos', 'credit', 'credito', 'haber', 'abono', 'deposit', 'deposito', 'inflow'].includes(type)) return 'income';
  if (['transfer', 'transferencia', 'transferencias', 'internaltransfer', 'transferenciainterna'].includes(type)) return 'transfer';
  return null;
}

function currencyOf(raw, fallback = 'ARS') {
  const value = String(raw ?? '').trim().toUpperCase();
  if (!value) return fallback;
  if (['USD', 'US$', 'U$S', 'DOLAR', 'DÓLAR', 'DOLARES', 'DÓLARES'].includes(value)) return 'USD';
  if (['ARS', 'AR$', '$', 'PESO', 'PESOS'].includes(value)) return 'ARS';
  throw fail('INVALID_CURRENCY', 'La moneda debe ser ARS o USD.');
}

function dateOf(raw) {
  const value = String(raw ?? '').trim();
  let iso = value;
  const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) iso = `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  const timestamp = iso.match(/^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}/);
  if (timestamp) iso = timestamp[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw fail('INVALID_DATE', 'Completá la fecha con día, mes y año.');
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw fail('INVALID_DATE', 'La fecha no existe en el calendario.');
  return iso;
}

// This compact ID is only an index. Exact source text is retained and compared
// below, so a hash collision can never silently discard a different import.
function sourceId(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `csv_${(hash >>> 0).toString(36)}_${text.length}`;
}

function records(text, separator) {
  const result = [];
  let cells = [], field = '', quoted = false, closed = false, start = 0;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else if (char === undefined) throw fail('INVALID_CSV', 'Hay una celda CSV con comillas sin cerrar.');
      else field += char;
    } else if (char === '"' && field === '' && !closed) {
      quoted = true;
    } else if (char === separator || char === '\n' || char === '\r' || char === undefined) {
      cells.push(field);
      field = ''; closed = false;
      if (char !== separator) {
        if (cells.some(cell => cell.trim())) result.push({ cells, raw: text.slice(start, i), ordinal: result.length });
        cells = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
        start = i + 1;
      }
    } else if (closed && !/\s/.test(char)) {
      throw fail('INVALID_CSV', 'Hay contenido fuera de las comillas de una celda CSV.');
    } else if (!closed) field += char;
  }
  return result;
}

const names = {
  date: ['fecha', 'date', 'releasedate', 'transactiondate', 'dia'],
  amount: ['transactionamount', 'importe', 'monto', 'amount', 'total', 'montoars'],
  debit: ['debito', 'debe', 'debit', 'cargo', 'egreso'],
  credit: ['credito', 'haber', 'credit', 'abono'],
  description: ['descripcion', 'description', 'concepto', 'detalle', 'establecimiento', 'comercio'],
  type: ['tipo', 'type', 'transactiontype', 'movementtype'],
  category: ['categoria', 'category', 'rubro'],
  currency: ['moneda', 'currency', 'divisa'],
};

/** Returns review rows in ORIGINAL currency. It performs no FX conversion. */
export function parseMovementCSV(text) {
  if (typeof text !== 'string') throw fail('INVALID_CSV', 'El CSV debe ser texto.');
  if (!text.trim()) return [];
  const document = text.replace(/^\uFEFF/, '');
  let table, headerIndex;
  for (const separator of [';', '\t', ',']) {
    let candidate;
    try { candidate = records(document, separator); } catch { continue; }
    const index = candidate.slice(0, 10).findIndex(record => {
      const headers = record.cells.map(norm);
      return headers.some(header => names.date.includes(header)) && headers.some(header => [...names.amount, ...names.debit, ...names.credit].includes(header));
    });
    if (index >= 0) { table = candidate; headerIndex = index; break; }
  }
  if (!table) throw fail('INVALID_CSV', 'No se reconocen las columnas de fecha e importe.');
  const headers = table[headerIndex].cells.map(norm);
  if (new Set(headers).size !== headers.length) throw fail('INVALID_CSV', 'El archivo repite nombres de columnas.');
  const own = headers.includes('mangoscsvversion');
  const batchId = sourceId(text);
  return table.slice(headerIndex + 1).map((record, index) => {
    try {
      if (record.cells.length !== headers.length) throw fail('INVALID_CSV', 'La fila tiene una cantidad distinta de columnas.');
      const values = Object.fromEntries(headers.map((header, i) => [header, record.cells[i]]));
      if (own && values.mangoscsvversion !== '1') throw fail('INVALID_CSV', 'La versión de este CSV de Mangos no es compatible.');
      if (own && values.camposescapados) for (const key of values.camposescapados.split('|')) {
        if (!Object.hasOwn(values, key) || !values[key].startsWith("'")) throw fail('INVALID_CSV', 'La protección de texto del CSV no es válida.');
        values[key] = values[key].slice(1);
      }
      const get = name => values[names[name].find(alias => Object.hasOwn(values, alias))];
      let signed, impliedType;
      if (own) signed = money(values.montoars);
      else if (get('debit') !== undefined || get('credit') !== undefined) {
        const debit = get('debit')?.trim() ? Math.abs(money(get('debit'))) : 0;
        const credit = get('credit')?.trim() ? Math.abs(money(get('credit'))) : 0;
        if (debit > 0 && credit > 0) throw fail('INVALID_AMOUNT', 'La fila tiene débito y crédito; revisá su significado.');
        signed = credit > 0 ? credit : -debit;
        impliedType = credit > 0 ? 'income' : 'expense';
      } else signed = money(get('amount'));
      const declaredType = get('type');
      const type = declaredType?.trim() ? typeOf(declaredType) : impliedType ?? (signed < 0 ? 'expense' : 'income');
      if (!type) throw fail('INVALID_TYPE', 'El tipo de movimiento necesita revisión.');
      const inferredCurrency = /(?:USD|US\$|U\$S)/i.test(get('amount') ?? '') ? 'USD' : 'ARS';
      let currency = currencyOf(get('currency'), inferredCurrency);
      let amount = Math.abs(signed);
      let originalFields = { originalAmount: amount, originalCurrency: currency };
      const ownFields = {};
      if (own) {
        if (signed <= 0) throw fail('INVALID_AMOUNT', 'El importe canónico debe ser positivo.');
        const hasOriginal = values.montooriginal !== '' && values.monedaoriginal !== '';
        if ((values.montooriginal !== '') !== (values.monedaoriginal !== '')) throw fail('INVALID_CSV', 'Falta una parte del importe original.');
        currency = hasOriginal ? currencyOf(values.monedaoriginal) : 'ARS';
        amount = hasOriginal ? money(values.montooriginal) : signed;
        originalFields = hasOriginal ? { originalAmount: amount, originalCurrency: currency } : {};
        if (values.tipocambio) {
          const rate = Number(values.tipocambio);
          if (!Number.isFinite(rate) || rate <= 0) throw fail('INVALID_AMOUNT', 'El tipo de cambio no es válido.');
          originalFields.fxRate = rate;
        }
        for (const [field, header] of [['fxDate', 'fechacambio'], ['fxSource', 'fuentecambio']]) if (values[header]) originalFields[field] = values[header];
        Object.assign(ownFields, { exportVersion: 1, movementId: values.id, canonicalAmountArs: signed, exportedPreviewAmount: amount, exportedPreviewCurrency: currency, hasOriginal, recordCurrency: currencyOf(values.monedaregistro), recordSource: values.fuente || '' });
      }
      if (amount <= 0) throw fail('INVALID_AMOUNT', 'El importe debe ser mayor a cero.');
      return {
        id: `preview_${batchId}_${index}`, date: dateOf(get('date')), description: get('description') ?? '',
        amount, currency, type, category: get('category') || '❓ Otros', source: 'csv',
        ...originalFields, ...ownFields,
        sourceBatchId: batchId, sourceRowId: String(record.ordinal), sourceRecord: record.raw, sourceDocument: text,
      };
    } catch (error) {
      throw fail(error.code ?? 'INVALID_CSV', `Fila ${record.ordinal + 1}: ${error.message}`, { row: record.ordinal + 1, cause: error });
    }
  });
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function confirmedMovement(row, id, batchId, rowId, options) {
  const amount = money(row.amount);
  const type = typeOf(row.type);
  const currency = currencyOf(row.currency ?? row.originalCurrency);
  if (amount <= 0 || !type) throw fail('INVALID_ROW', 'Revisá el importe y tipo de cada movimiento.');
  const tx = { id, date: dateOf(row.date), description: String(row.description ?? ''), type, category: String(row.category || '❓ Otros'), source: row.recordSource || row.source || 'import', importBatchId: batchId, importRowId: rowId };
  const unchangedExport = row.exportVersion === 1 && amount === row.exportedPreviewAmount && currency === row.exportedPreviewCurrency;
  if (unchangedExport) {
    tx.amount = money(row.canonicalAmountArs);
    tx.currency = currencyOf(row.recordCurrency);
    if (row.hasOriginal) {
      tx.originalAmount = amount; tx.originalCurrency = currency;
      if (row.fxRate !== undefined) { tx.fxRate = row.fxRate; tx.fxRateAtEntry = row.fxRate; }
      if (row.fxDate) tx.fxDate = row.fxDate;
      if (row.fxSource) tx.fxSource = row.fxSource;
      const rate = currency === 'ARS' ? 1 : row.fxRate;
      if (rate !== undefined && money(amount * rate) !== tx.amount) throw fail('INVALID_FX', 'El importe original, el cambio y el importe ARS del CSV no coinciden.');
    }
  } else {
    const rate = currency === 'USD' ? Number(row.fxRate ?? options.usdRate) : 1;
    if (!Number.isFinite(rate) || rate <= 0) throw fail('MISSING_FX', 'Indicá un tipo de cambio válido para los movimientos en USD.');
    tx.amount = money(amount * rate);
    tx.currency = 'ARS';
    tx.originalAmount = amount; tx.originalCurrency = currency;
    tx.fxRate = rate; tx.fxRateAtEntry = rate;
    if (currency === 'USD') {
      tx.fxDate = dateOf(row.fxDate || options.fxDate || today());
      tx.fxSource = String(row.fxSource || options.fxSource || 'manual');
    }
  }
  if (tx.amount <= 0) throw fail('INVALID_AMOUNT', 'El importe canónico debe ser mayor a cero.');
  return tx;
}

function sameMovement(left, right) {
  const fields = ['date', 'description', 'amount', 'category', 'originalAmount', 'originalCurrency', 'fxDate', 'fxSource'];
  return fields.every(key => left[key] === right[key]) && typeOf(left.type) === right.type
    && (left.currency || 'ARS') === right.currency
    && (left.fxRate ?? left.fxRateAtEntry) === (right.fxRate ?? right.fxRateAtEntry)
    && (!left.source || !right.source || left.source === right.source);
}

function sourceRecordOf(row) {
  if (typeof row.sourceRecord === 'string') return row.sourceRecord;
  // UI IDs can change during a repeated extraction. Only reviewed source values
  // participate; callers must derive batchId from the actual file/text source.
  const fields = ['date', 'description', 'amount', 'currency', 'type', 'category', 'source', 'originalAmount', 'originalCurrency', 'fxRate', 'fxRateAtEntry', 'fxDate', 'fxSource', 'recordSource', 'exportVersion', 'movementId', 'canonicalAmountArs'];
  return JSON.stringify(Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]])));
}

/** Confirm an entire reviewed batch atomically in memory; input is never mutated. */
export function applyImportBatch(state, rows, options = {}) {
  if (!state || !Array.isArray(state.transactions) || !Array.isArray(rows)) throw fail('INVALID_BATCH', 'El lote o el estado no es válido.');
  if (!rows.length) return state;
  const batchId = options.batchId || rows[0].sourceBatchId;
  if (typeof batchId !== 'string' || !batchId) throw fail('INVALID_BATCH', 'El lote necesita una identidad estable de origen.');
  const sourceDocument = rows[0].sourceDocument ?? null;
  if (rows.some(row => (row.sourceDocument ?? null) !== sourceDocument || (!options.batchId && row.sourceBatchId !== batchId))) throw fail('INVALID_BATCH', 'No mezcles documentos de origen en un mismo lote.');
  const batches = state.importBatches ?? [];
  if (!Array.isArray(batches)) throw fail('INVALID_BATCH', 'El historial de importaciones no es válido.');
  const previous = batches.find(batch => batch.id === batchId);
  if (previous && previous.sourceDocument !== sourceDocument) throw fail('BATCH_CONFLICT', 'El identificador del lote corresponde a otro documento.');
  const accepted = [...(previous?.rows ?? [])];
  const additions = [];
  const ids = new Map(state.transactions.map(tx => [tx.id, tx]));
  const rowIds = new Set();
  for (const [index, row] of rows.entries()) {
    const rowId = String(row.sourceRowId ?? index);
    if (rowIds.has(rowId)) throw fail('INVALID_BATCH', 'El lote repite la identidad de una fila.');
    rowIds.add(rowId);
    const sourceRecord = sourceRecordOf(row);
    const prior = accepted.find(item => item.id === rowId);
    if (prior) {
      if (prior.sourceRecord !== sourceRecord) throw fail('BATCH_CONFLICT', 'Una fila del lote tiene contenido distinto del ya importado.');
      continue;
    }
    const id = row.exportVersion === 1 && row.movementId ? row.movementId : `i_${encodeURIComponent(batchId)}_${encodeURIComponent(rowId)}`;
    const tx = confirmedMovement(row, id, batchId, rowId, options);
    const existing = ids.get(id);
    if (existing) {
      if (row.exportVersion !== 1 || !sameMovement(existing, tx)) throw fail('MOVEMENT_CONFLICT', 'El identificador del movimiento ya existe con otros datos. Revisá la importación.');
    } else { additions.push(tx); ids.set(id, tx); }
    accepted.push({ id: rowId, sourceRecord, transactionId: id });
  }
  if (!additions.length && previous && accepted.length === previous.rows.length) return state;
  const batch = { id: batchId, sourceDocument, rows: accepted };
  return { ...state, transactions: [...state.transactions, ...additions], importBatches: [...batches.filter(item => item.id !== batchId), batch] };
}

const csvHeaders = ['MangosCSVVersion', 'ID', 'Fecha', 'Descripción', 'Tipo', 'Categoría', 'MontoARS', 'MonedaRegistro', 'MontoOriginal', 'MonedaOriginal', 'TipoCambio', 'FechaCambio', 'FuenteCambio', 'Fuente', 'CamposEscapados'];
// Spreadsheet formula prefixes can be hidden after whitespace/control bytes.
// eslint-disable-next-line no-control-regex
const dangerousCell = value => /^[\u0000-\u0020]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value);
const quotedCell = value => `"${String(value).replaceAll('"', '""')}"`;

/** Spreadsheet-safe, versioned movement exchange. Use JSON for full recovery. */
export function exportMovementCSV(transactions) {
  if (!Array.isArray(transactions)) throw fail('INVALID_CSV', 'Se necesita una lista de movimientos.');
  const lines = transactions.map(tx => {
    const amount = money(tx.amount);
    const type = typeOf(tx.type);
    if (amount <= 0 || !type || typeof tx.id !== 'string' || !tx.id) throw fail('INVALID_ROW', 'Hay un movimiento sin importe, tipo o identidad válido.');
    const hasOriginal = tx.originalAmount !== undefined && tx.originalCurrency !== undefined;
    const values = ['1', tx.id, dateOf(tx.date), tx.description ?? '', { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia' }[type], tx.category ?? '❓ Otros', amount, tx.currency || 'ARS', hasOriginal ? tx.originalAmount : '', hasOriginal ? tx.originalCurrency : '', tx.fxRate ?? tx.fxRateAtEntry ?? '', tx.fxDate ?? '', tx.fxSource ?? '', tx.source ?? '', ''];
    const escaped = [];
    const safe = values.map((value, index) => {
      const text = String(value);
      if (dangerousCell(text)) { escaped.push(norm(csvHeaders[index])); return `'${text}`; }
      return text;
    });
    safe[safe.length - 1] = escaped.join('|');
    return safe.map(quotedCell).join(';');
  });
  return [csvHeaders.map(quotedCell).join(';'), ...lines].join('\r\n');
}
