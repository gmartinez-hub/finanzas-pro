import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshExchangeRates} from '../src/services/exchangeRates.js';

const response=()=>({ok:true,json:async()=>[
  {casa:'oficial',compra:1400,venta:1420},
  {casa:'bolsa',compra:1500,venta:1520},
  {casa:'blue',compra:1540,venta:1560},
]});
const initial=()=>({demo:false,usdType:'mep',usdRate:1350,usdRates:{mep:1350},transactions:[{id:'old',amount:500,currency:'USD'}]});

test('personal rates refresh from the source without changing recorded amounts',async()=>{
  let state=initial();const original=structuredClone(state.transactions);
  const result=await refreshExchangeRates({getState:()=>state,apply:patch=>{state={...state,...patch};return true;},fetchImpl:async()=>response()});
  assert.equal(result.usdRate,1510);assert.equal(state.usdRate,1510);
  assert.equal(state.usdRates.oficial,1410);assert.deepEqual(state.transactions,original);
  assert.match(state.fxSource,/DolarApi/);assert.ok(Number.isFinite(Date.parse(state.fxAsOf)));
});

test('an unavailable source keeps the last valid rate and reports failure',async()=>{
  const state=initial();let writes=0;
  await assert.rejects(refreshExchangeRates({getState:()=>state,apply:()=>writes++,fetchImpl:async()=>({ok:false})}),/cotización/);
  assert.equal(state.usdRate,1350);assert.equal(writes,0);
});

test('invalid or missing selected quotes never become a made-up fallback',async()=>{
  for(const rows of [[{casa:'bolsa',compra:null,venta:1520}],[{casa:'oficial',compra:1400,venta:1420}]]){
    let writes=0;
    await assert.rejects(refreshExchangeRates({getState:initial,apply:()=>writes++,fetchImpl:async()=>({ok:true,json:async()=>rows})}),/válida/);
    assert.equal(writes,0);
  }
});

test('a late response cannot replace a reference edited while the request was running',async()=>{
  let state=initial(),finish;let writes=0;
  const task=refreshExchangeRates({getState:()=>state,apply:()=>writes++,fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});
  state={...state,usdRate:1600,fxSource:'Referencia manual',fxAsOf:'2026-09-16T12:00:00Z'};
  finish(response());assert.equal(await task,null);assert.equal(writes,0);
});

test('the isolated QA mode does not request live quotes',async()=>{
  let calls=0;
  await refreshExchangeRates({getState:()=>({...initial(),demo:true}),apply:()=>assert.fail('unexpected write'),fetchImpl:()=>{calls++;return response();}});
  assert.equal(calls,0);
});
