import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/price.js';

function response(){return {statusCode:200,body:null,setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;},end(){return this;}};}
test('Argentine quote failures do not relabel a price-only fallback as ARS',async()=>{
  const original=globalThis.fetch,urls=[];
  globalThis.fetch=async url=>{urls.push(url);return {ok:false};};
  try{const res=response();await handler({method:'GET',query:{ticker:'AAPL.BA'}},res);assert.equal(res.statusCode,404);assert.equal(urls.length,2);assert.ok(urls.every(url=>url.includes('finance.yahoo.com')));}
  finally{globalThis.fetch=original;}
});
test('invalid tickers and non-GET methods stop before fetching',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw new Error('unexpected network');};
  try{for(const request of [{method:'GET',query:{ticker:['AAPL','YPF']}},{method:'POST',query:{ticker:'AAPL'}}]){const res=response();await handler(request,res);assert.ok([400,405].includes(res.statusCode));}assert.equal(calls,0);}
  finally{globalThis.fetch=original;}
});
