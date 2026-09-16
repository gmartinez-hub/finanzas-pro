import test from 'node:test';
import assert from 'node:assert/strict';
let prepare;
try { ({prepareWeeklyInsight:prepare}=await import('../src/domain/weeklyInsight.js')); }
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const input=(state,options={asOfDate:'2026-09-16'})=>{assert.equal(typeof prepare,'function','Missing weekly insight calculation');return prepare(state,options);};
const row=(id,type='expense',extra={})=>({id,date:'2026-09-16',amount:100,type,...extra});

test('weekly payload excludes reserves, reversed records and invalid dates without reconverting legacy USD amounts',()=>{
  const state={usdRate:1600,transactions:[row('expense','expense',{currency:'USD'}),row('income','income'),row('reserve','transfer',{kind:'goal_reserve'}),row('voided','expense',{voided:true}),row('reversed','expense',{status:'reversed'}),row('bad-date','expense',{date:'2026-02-30'}),row('bad-amount','expense',{amount:-1})],goals:[],holdings:[]};
  const before=structuredClone(state),result=input(state);
  assert.deepEqual(result.transactions.map(t=>t.id),['expense','income']);
  assert.equal(result.transactions[0].amount,100);assert.equal(result.transactionCount,2);
  assert.ok(result.warnings.length);assert.deepEqual(state,before);
});

test('weekly portfolio uses exact instrument quotes and caps fixed-term estimates at maturity',()=>{
  const state={usdRate:1000,transactions:[],goals:[],holdings:[{id:'local',ticker:'AAPL',type:'cedear',quantity:2,totalInvestedArs:1000},{id:'fixed',type:'plazo_fijo',totalInvestedArs:100000,rate:36.5,buyDate:'2026-08-01',maturityDate:'2026-08-31'}],marketPrices:{AAPL:{price:200,currency:'USD'},'cedear:AAPL.BA':{price:700,currency:'ARS'}}};
  const result=input(state);
  assert.equal(result.portfolioInvestedArs,101000);assert.equal(result.portfolioValueArs,104400);
  assert.equal(result.asOfDate,'2026-09-16');assert.ok(result.warnings.some(w=>w.includes('estimado')));
});

test('weekly totals keep centavos and unavailable quotes use registered capital with a visible limitation',()=>{
  const state={usdRate:1000,transactions:[],holdings:[{type:'crypto',ticker:'BTC',quantity:1,totalInvestedArs:0.1},{type:'crypto',ticker:'ETH',quantity:1,totalInvestedArs:0.2}]};
  const result=input(state);
  assert.equal(result.portfolioValueArs,0.3);assert.equal(result.portfolioInvestedArs,0.3);assert.ok(result.warnings.length);
  assert.throws(()=>input({...state,usdRate:0}),/cotización/i);
  assert.throws(()=>input(state,{asOfDate:'2026-02-30'}),/fecha/i);
});
