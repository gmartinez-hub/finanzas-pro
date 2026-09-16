import {calcHoldingValueArs,parseMoney} from './finance.js';

const rows=value=>Array.isArray(value)?value:[];
const active=row=>row&&!row.voided&&!row.reversed&&row.status!=='reversed';
const localDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;

/** Prepare the legacy generator's inputs without network access or mutations.
 * Monetary values remain canonical ARS, including legacy USD-labelled rows.
 */
export function prepareWeeklyInsight(state,{asOfDate=localDate(new Date())}={}){
  if(!validDate(asOfDate))throw new Error('Revisá la fecha del resumen.');
  const usdRate=state.usdRate;
  if(!Number.isFinite(usdRate)||usdRate<=0)throw new Error('Revisá la cotización de referencia antes de generar el resumen.');
  const candidates=rows(state.transactions).filter(row=>active(row)&&['income','expense'].includes(row.type));
  const transactions=candidates.filter(row=>validDate(row.date)&&typeof row.amount==='number'&&Number.isFinite(row.amount)&&row.amount>=0);
  const holdings=rows(state.holdings).filter(active),goals=rows(state.goals).filter(active);
  let investedCents=0,valueCents=0;
  const warnings=[];
  if(transactions.length!==candidates.length)warnings.push('Se excluyeron movimientos con fecha o importe inválidos.');
  for(const holding of holdings){
    const value=calcHoldingValueArs(holding,state.marketPrices||{},usdRate,{asOfDate});
    investedCents+=Math.round(value.invArs*100);valueCents+=Math.round(value.curArs*100);
    warnings.push(...value.warnings);
  }
  const portfolioInvestedArs=parseMoney(investedCents/100),portfolioValueArs=parseMoney(valueCents/100);
  if(!Number.isFinite(portfolioInvestedArs)||!Number.isFinite(portfolioValueArs))throw new Error('El portfolio supera el importe que podemos calcular con precisión.');
  return {transactions,goals,holdings,usdRate,portfolioInvestedArs,portfolioValueArs,asOfDate,transactionCount:transactions.length,warnings:[...new Set(warnings)]};
}
