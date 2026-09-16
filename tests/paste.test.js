import test from 'node:test';
import assert from 'node:assert/strict';
let parser;
try { ({parsePastedAmount: parser}=await import('../src/domain/paste.js')); }
catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND') throw error; }
const parse=text=>{assert.equal(typeof parser,'function','Missing safe pasted amount parser');return parser(text);};

test('explicit monetary marker takes precedence over numeric merchant names',()=>{
  assert.equal(parse('Farmacity 24 $1500'),1500);
  assert.equal(parse('Compra 2 unidades ARS 1.234,56'),1234.56);
  assert.equal(parse('Estación 24 1500 ARS'),1500);
});
test('pasted signed Argentine and US amounts retain signs and centavos',()=>{
  for(const [raw,expected] of [['-1.234,56',-1234.56],['USD10',10],['+500',500],['U$S -10,25',-10.25],['-US$ 1,234.56',-1234.56],['1500$',1500]])assert.equal(parse(raw),expected);
});
test('multiple unmarked candidates and multiple marked amounts require review',()=>{
  for(const raw of ['Farmacity 24 1500','Compra $10 devolución $5','USD 10 ARS 200'])assert.throws(()=>parse(raw),e=>e.code==='AMBIGUOUS_PASTED_AMOUNT'&&/más de un importe/i.test(e.message));
});
test('zero, malformed and absent amounts are never silently imported',()=>{
  for(const raw of ['0','$0','USD 0,00','sin importe','1USD2','12abc','1.2.3','USD abc 500','$$10','$12abc 5'])assert.throws(()=>parse(raw),e=>e.code==='INVALID_PASTED_AMOUNT');
});
