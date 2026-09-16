/** Hash the selected source, rather than the unpredictable IDs returned by AI. */
export async function importSourceId(kind, source) {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `${kind}_${Array.from(new Uint8Array(hash), n=>n.toString(16).padStart(2,'0')).join('')}`;
}

/** Stable row positions survive review edits/removals within a source document. */
export function identifyImportRows(rows, batchId) {
  return rows.map((row,index)=>({...row,sourceBatchId:batchId,sourceRowId:String(index),sourceRecord:JSON.stringify({date:row.date??null,description:row.description??'',amount:row.amount,currency:row.currency??'ARS',type:row.type??null})}));
}
