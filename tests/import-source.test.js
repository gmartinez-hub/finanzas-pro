import test from 'node:test';
import assert from 'node:assert/strict';
import {importSourceId,identifyImportRows} from '../src/domain/importSource.js';
import {applyImportBatch} from '../src/domain/imports.js';

test('re-extracting the same document with fresh UI IDs cannot duplicate rows',async()=>{
  const batchId=await importSourceId('image','synthetic file bytes');
  assert.equal(batchId,await importSourceId('image',new TextEncoder().encode('synthetic file bytes')));
  assert.notEqual(batchId,await importSourceId('image','different file bytes'));
  const row={id:'first-UI-id',date:'2026-09-16',description:'Fixture',amount:5,currency:'USD',type:'expense',category:'Otros'};
  const first=applyImportBatch({transactions:[]},identifyImportRows([row,row],batchId),{usdRate:1600,fxDate:'2026-09-16'});
  assert.equal(first.transactions.length,2);
  const second=applyImportBatch(first,identifyImportRows([{...row,id:'new-UI-id'},row],batchId),{usdRate:1700,fxDate:'2026-09-17'});
  assert.deepEqual(second,first);
});
