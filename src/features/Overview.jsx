import {OpenIcon,AddIcon} from '../components/InterfaceIcons.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer} from 'recharts';
import {monthSummary,getCategoryChanges,simulateDecision,parseMoney,goalCash,goalProgress,calcHoldingValueArs} from '../domain/finance.js';
import Dialog from '../components/Dialog.jsx';

const monthKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
export function formatMoney(value,currency='ARS',rate=1){
  const n=currency==='USD'?value/rate:value;
  return new Intl.NumberFormat('es-AR',{style:'currency',currency,minimumFractionDigits:currency==='USD'?2:0,maximumFractionDigits:2}).format(n);
}

export default function Overview({state,onNavigate,healthCard,request,weeklyInsight}){
  const now=state.demo?new Date('2026-09-16T12:00:00'):new Date();
  const [month,setMonth]=useState(monthKey(now));
  const [decision,setDecision]=useState(false);
  const healthRef=useRef(null),changesRef=useRef(null);
  useEffect(()=>{
    if(request?.action==='health'&&healthRef.current)healthRef.current.open=true;
    if(request?.action==='changes')changesRef.current?.scrollIntoView({block:'center'});
  },[request]);
  const currency=state.displayCurrency;
  const fmt=value=>formatMoney(value,currency,state.usdRate);
  const summary=useMemo(()=>monthSummary(state,month),[state,month]);
  const changes=useMemo(()=>getCategoryChanges(state,month,now),[state,month]);
  const trend=useMemo(()=>Array.from({length:6},(_,i)=>{
    const [year,m]=month.split('-').map(Number);
    const date=new Date(year,m-6+i,1);
    const key=monthKey(date),s=monthSummary(state,key);
    return {month:key,label:date.toLocaleDateString('es-AR',{month:'short'}).replace('.',''),income:s.income,expenses:s.expenses};
  }),[state,month]);
  const goals=(state.goals||[]).filter(g=>!g.completedAt);
  const goal=goals[0];
  const invested=goal?(state.holdings||[]).filter(h=>h.goalId===goal.id).reduce((sum,h)=>sum+calcHoldingValueArs(h,state.marketPrices||{},state.usdRate).curArs,0):0;
  const progress=goal&&goal.target>0?Math.max(0,Math.min(1,(goalProgress(goal)+invested)/goal.target)):0;
  const rows=[...(state.transactions||[])].filter(t=>t.date?.slice(0,7)===month&&!t.voided).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  const months=Array.from(new Set([monthKey(now),...(state.transactions||[]).map(t=>t.date?.slice(0,7)),...(state.salaries||[]).map(s=>s.month)])).filter(x=>/^\d{4}-\d{2}$/.test(x)).sort().reverse();
  const movement=(params={})=>onNavigate('transactions',{month,...params});
  return <div className="m-overview">
    <div className="m-page-heading"><div><p className="m-eyebrow">Tu resumen</p><h1>{new Date(`${month}-02T12:00:00`).toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</h1><p className="m-muted">Tu plata, con perspectiva.</p></div><div className="m-heading-actions"><label className="m-sr-only" htmlFor="overview-month">Período</label><select id="overview-month" value={month} onChange={e=>setMonth(e.target.value)}>{months.map(m=><option key={m} value={m}>{m}</option>)}</select><button className="m-primary" onClick={()=>onNavigate('transactions',{action:'new'})}><AddIcon/> Agregar movimiento</button></div></div>
    <section className="m-summary" data-tour-target="kpi-balance" aria-label="Resultado disponible del mes">
      <div><span className="m-muted">Disponible del mes</span><button className={`m-hero-value${summary.available<0?' m-negative':''}`} onClick={()=>movement()} aria-label={`Disponible del mes ${fmt(summary.available)}. Ver movimientos`}>{fmt(summary.available)}</button><p className="m-summary-explanation">Ingresos menos gastos y reservas netas del período.<br/>No equivale al saldo total de tus cuentas.</p><button className="m-text-button" onClick={()=>setDecision(true)}>Probar una decisión <OpenIcon/></button></div>
      <dl className="m-summary-breakdown"><div><dt>Ingresos</dt><dd><button onClick={()=>movement({type:'income'})}>{fmt(summary.income)}</button></dd></div><div><dt>Gastos</dt><dd><button onClick={()=>movement({type:'expense'})}>{fmt(summary.expenses)}</button></dd></div><div><dt>{summary.reserved<0?'Reservas liberadas':'Reservado'}</dt><dd><button onClick={()=>onNavigate('goals')}>{fmt(Math.abs(summary.reserved))}</button></dd></div></dl>
    </section>
    {!!summary.warnings?.length&&<details className="m-data-note"><summary>Alcance de los datos</summary>{summary.warnings.map((w,i)=><p key={i}>{typeof w==='string'?w.message||w:w.message||JSON.stringify(w)}</p>)}</details>}
    {!summary.hasData&&<div className="m-empty"><h2>Empezá por tus movimientos</h2><p>Cargá un ingreso o importá un archivo para ver tu mes.</p><button className="m-secondary" onClick={()=>onNavigate('import',{tab:'csv'})}>Importar movimientos</button></div>}
    <div className="m-chart-grid">
      <section className="m-panel"><div className="m-panel-heading"><h2>Ingresos y gastos</h2><span className="m-muted">Últimos 6 meses</span></div><div className="m-legend"><span><i className="m-income-swatch"/>Ingresos</span><span><i className="m-expense-swatch"/>Gastos</span></div>
        <div className="m-month-chart" role="img" aria-label={`Ingresos y gastos mensuales en ${currency}. Los botones inferiores permiten consultar cada mes.`}><ResponsiveContainer width="100%" height={235}><BarChart data={trend} margin={{top:16,right:8,bottom:0,left:0}} barGap={5} onClick={e=>{if(e?.activePayload?.[0]?.payload?.month)onNavigate('transactions',{month:e.activePayload[0].payload.month});}}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="label" tick={{fill:'var(--text-mid)',fontSize:12}} axisLine={false} tickLine={false}/><YAxis width={65} tick={{fill:'var(--text-mid)',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>new Intl.NumberFormat('es-AR',{notation:'compact',maximumFractionDigits:1}).format(currency==='USD'?v/state.usdRate:v)} label={{value:currency,position:'insideTopLeft',dy:-18,fill:'var(--text-mid)',fontSize:11}}/><Tooltip cursor={{fill:'var(--chart-hover)'}} contentStyle={{background:'var(--raised)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)'}} formatter={(value,name)=>[fmt(value),name==='income'?'Ingresos':'Gastos']}/><Bar dataKey="income" fill="var(--chart-income)" radius={[4,4,0,0]} isAnimationActive={false}/><Bar dataKey="expenses" fill="var(--chart-expense)" radius={[4,4,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>
        <div className="m-chart-actions" aria-label="Consultar movimientos por mes">{trend.map(m=><button key={m.month} onClick={()=>onNavigate('transactions',{month:m.month})} aria-label={`Ver movimientos de ${m.month}`}>{m.label}</button>)}</div>
      </section>
      <section className="m-panel m-goal-panel" data-tour-target="plan-ahorro-card"><div className="m-panel-heading"><span className="m-eyebrow">Tu meta</span><button className="m-text-button" onClick={()=>onNavigate('goals')}>Ver metas <OpenIcon/></button></div>{goal?<><h2>{goal.name}</h2><div className="m-goal-ring" style={{'--progress':`${progress*100}%`}} role="img" aria-label={`${Math.round(progress*100)} por ciento del objetivo`}><div><strong>{Math.round(progress*100)}%</strong><span>del objetivo</span></div></div><strong className="m-goal-money">{fmt(goalCash(goal))}</strong><p className="m-muted">reservados · objetivo {fmt(goal.target)}</p>{goalProgress(goal)>goalCash(goal)&&<p className="m-muted">Pagado: {fmt(goalProgress(goal)-goalCash(goal))}</p>}{invested>0&&<p className="m-muted">Inversiones vinculadas: {fmt(invested)}</p>}<p className="m-goal-note">La reserva conserva su propósito.<br/>Los pagos se muestran por separado.</p></>:<div className="m-empty"><h2>Dale un propósito</h2><p>Elegí tu primera meta y empezá a reservar.</p><button className="m-secondary" onClick={()=>onNavigate('goals',{action:'new'})}>Crear una meta</button></div>}</section>
    </div>
    <section ref={changesRef} className="m-changes" data-tour-target="generar-resumen"><div className="m-panel-heading"><div><h2>Qué cambió</h2><p className="m-muted">Comparación de períodos equivalentes</p></div><button className="m-text-button" onClick={()=>onNavigate('analytics')}>Ver analíticas <OpenIcon/></button></div>{changes.length?<div className="m-changes-list">{changes.map(c=><button className="m-change" key={c.category} onClick={()=>movement({cat:c.category,category:c.category,type:'expense',dateFrom:c.currentStart,dateTo:c.currentEnd})}><span><strong>{c.category.replace(/^[^\p{L}\p{N}]+/u,'')}</strong><small>{c.currentStart}–{c.currentEnd} · anterior {c.previousStart}–{c.previousEnd}</small></span><span className="m-change-value">{c.delta>0?'+':''}{fmt(c.delta)}<small>{c.percent==null?'Sin base para porcentaje':`${c.percent>0?'+':''}${c.percent.toFixed(0)}%`}</small></span><OpenIcon/></button>)}</div>:<p className="m-empty-inline">Todavía no hay dos períodos comparables con gastos registrados.</p>}</section>
    {weeklyInsight}
    <section className="m-recent"><div className="m-panel-heading"><h2>Últimos movimientos</h2><button className="m-text-button" onClick={()=>movement()}>Ver todos <OpenIcon/></button></div><div className="m-ledger">{rows.length?rows.map(t=><button key={t.id} className="m-ledger-row" onClick={()=>movement()}><span><strong>{t.description}</strong><small>{t.date}</small></span><span className="m-ledger-category">{(t.category||'Otros').replace(/^[^\p{L}\p{N}]+/u,'')}</span><strong>{t.type==='income'?'+':t.type==='transfer'?'↔':'−'} {fmt(t.amount)}</strong></button>):<p className="m-empty-inline">Sin movimientos en este período.</p>}</div></section>
    <details ref={healthRef} className="m-health-details" data-tour-target="score-card"><summary>Indicadores y contexto financiero</summary>{healthCard}</details>
    {decision&&<DecisionDialog summary={summary} currency={currency} rate={state.usdRate} onClose={()=>setDecision(false)}/>}</div>;
}

function DecisionDialog({summary,currency,rate,onClose}){
  const [type,setType]=useState('expense'),[amount,setAmount]=useState('');
  const parsed=parseMoney(amount)*(currency==='USD'?rate:1);
  let scenario=null,error='';
  if(amount){try{scenario=simulateDecision(summary,{type,amount:parsed});}catch(e){error=e.message;}}
  const fmt=value=>formatMoney(value,currency,rate);
  return <Dialog title="Probar una decisión" onClose={onClose}><p className="m-muted">Una simulación sobre el mes elegido. No modifica tus movimientos ni tus metas.</p><label className="m-field">Qué querés probar<select value={type} onChange={e=>setType(e.target.value)}><option value="expense">Hacer un gasto</option><option value="reserve">Reservar para una meta</option></select></label><label className="m-field">Importe en {currency}<input autoFocus inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></label>{error&&<p role="alert" className="m-negative">{error}</p>}{scenario&&<div className="m-decision-results" aria-live="polite"><div><span>Disponible actual</span><strong>{fmt(summary.available)}</strong></div><div><span>Después de la decisión</span><strong className={scenario.after.available<0?'m-negative':''}>{fmt(scenario.after.available)}</strong></div><div><span>Reservado neto del período</span><strong>{fmt(scenario.after.reserved)}</strong></div>{scenario.after.available<0&&<p>El importe supera el margen registrado para este mes.</p>}</div>}<div className="m-dialog-actions"><button className="m-secondary" onClick={()=>setAmount('')}>Restablecer</button><button className="m-primary" onClick={onClose}>Cerrar simulación</button></div></Dialog>;
}
