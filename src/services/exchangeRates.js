/** Refresh only the reference: recorded transactions keep their original amounts. */
export async function refreshExchangeRates({getState,apply,signal,fetchImpl=fetch,kind}) {
  const before=getState();
  if(before.demo)return null;
  const selected=kind||before.usdType||'mep';
  const response=await fetchImpl('https://dolarapi.com/v1/dolares',{signal});
  if(!response.ok)throw new Error('No se pudo actualizar la cotización. Se conserva la referencia guardada.');
  const rows=await response.json(),rates={};
  if(Array.isArray(rows))for(const [type,casa] of Object.entries({oficial:'oficial',mep:'bolsa',blue:'blue'})){
    const row=rows.find(item=>item.casa===casa||(type==='mep'&&item.casa==='mep'));
    if(typeof row?.compra==='number'&&typeof row?.venta==='number'&&Number.isFinite(row.compra)&&Number.isFinite(row.venta)&&row.compra>0&&row.venta>0){
      rates[type]=Math.round((row.compra+row.venta)*50)/100;
    }
  }
  if(!rates[selected])throw new Error('La fuente no devolvió una cotización válida para este dólar. Se conserva la referencia guardada.');
  const current=getState();
  if(signal?.aborted||current.demo||['usdType','usdRate','fxSource','fxAsOf'].some(key=>current[key]!==before[key]))return null;
  const patch={usdRate:rates[selected],usdType:selected,usdRates:{...current.usdRates,...rates},fxSource:'DolarApi · promedio compra/venta',fxAsOf:new Date().toISOString()};
  return apply(patch)===false?null:patch;
}
