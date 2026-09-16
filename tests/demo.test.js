import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from '../src/demo/data.js';
import {monthSummary,simulateDecision} from '../src/domain/finance.js';
import {runAITask} from '../src/aiClient.js';

test('demo has a reproducible explained monthly result; simulation leaves it unchanged',()=>{
  const state=createDemoState(),before=structuredClone(state);
  const summary=monthSummary(state,'2026-09');
  assert.equal(summary.income,1280000);
  assert.equal(summary.expenses,780000);
  assert.equal(summary.reserved,300000);
  assert.equal(summary.available,200000);
  assert.equal(simulateDecision(summary,{type:'expense',amount:50000}).after.available,150000);
  assert.deepEqual(state,before);
  const another=createDemoState();another.transactions.pop();
  assert.deepEqual(state,before);
});

test('demo rejects AI requests before sending any data',async()=>{
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
  let calls=0;globalThis.window={location:{search:'?demo=1'}};globalThis.fetch=()=>{calls++;throw new Error('unexpected request');};
  try{await assert.rejects(runAITask('scan_investments',{}),{code:'DEMO_OFFLINE'});assert.equal(calls,0);}
  finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
