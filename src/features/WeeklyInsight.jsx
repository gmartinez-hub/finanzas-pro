import {useRef,useState} from 'react';
import {prepareWeeklyInsight} from '../domain/weeklyInsight.js';
import {CategoryBreakdownIcon} from '../components/InterfaceIcons.jsx';

const colors={red:'var(--coral)',amber:'var(--amber)',lime:'var(--lime)',blue:'var(--blue)',mango:'var(--mango)'};

/** Network access is only performed by the injected legacy generator after a
 * deliberate click. Cached results remain visible during loading and failures.
 */
export default function WeeklyInsight({state,update,notify,generateInsight,icons}){
  const cardIcons={spending:icons.Tx,top_category:CategoryBreakdownIcon,investment:icons.Stock,goal:icons.Target};
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[warnings,setWarnings]=useState([]);
  const inFlight=useRef(false);
  const demo=Boolean(state.demo),insight=state.weeklyInsight;
  const cards=Array.isArray(insight?.cards)?insight.cards.filter(card=>card&&typeof card==='object'):[];
  const refresh=async()=>{
    if(demo||inFlight.current)return;
    inFlight.current=true;setError('');setLoading(true);
    try{
      const input=prepareWeeklyInsight(state);
      setWarnings(input.warnings);
      if(input.transactionCount<3)throw new Error('Registrá al menos tres ingresos o gastos válidos para generar el resumen.');
      if(typeof generateInsight!=='function')throw new Error('El servicio de resumen no está disponible en esta versión.');
      const result=await generateInsight(input.transactions,input.goals,input.usdRate,input.portfolioValueArs,input.portfolioInvestedArs,input.holdings);
      if(!result||typeof result.headline!=='string'||!Array.isArray(result.cards)||!result.cards.length)throw new Error('La IA devolvió un resumen incompleto. Probá nuevamente.');
      if(update({weeklyInsight:result,weeklyInsightDate:input.asOfDate})===false){setError('El resumen fue generado, pero todavía no se guardó. Revisá el aviso de recuperación.');return;}
      notify?.('Resumen semanal actualizado ✓');
    }catch(cause){const message=cause?.message||'No se pudo generar el resumen semanal.';setError(message);notify?.(message,'err');}
    finally{inFlight.current=false;setLoading(false);}
  };
  return <section className="m-panel" data-tour-target="resumen-ia" aria-labelledby="weekly-insight-title" style={{marginTop:20}}>
    <div className="m-panel-heading" style={{flexWrap:'wrap',gap:12}}>
      <div><p className="m-eyebrow">Análisis a pedido</p><h2 id="weekly-insight-title">Resumen semanal IA</h2>{state.weeklyInsightDate&&<p className="m-muted" style={{fontSize:12,marginTop:5}}>Último resumen: {state.weeklyInsightDate}</p>}</div>
      <button className="m-secondary" data-tour-target="generar-resumen-ia" onClick={refresh} disabled={loading||demo} aria-busy={loading}>{loading?'Generando resumen…':insight?'Actualizar resumen':'Generar resumen'}</button>
    </div>
    {demo&&<p className="m-muted" style={{fontSize:12,marginBottom:12}}>La demostración conserva el último resumen guardado, si existe. Las consultas de IA están desactivadas en este espacio.</p>}
    {!demo&&<p className="m-muted" style={{fontSize:12,marginBottom:12}}>Generalo cuando quieras analizar tus gastos recientes, inversiones y metas. Usa importes en ARS; el texto guardado conserva la moneda y fecha de su generación.</p>}
    {loading&&<p role="status" className="m-muted" style={{marginBottom:12}}>Consultando el servicio de IA…</p>}
    {error&&<p role="alert" className="m-negative" style={{marginBottom:12}}>{error}</p>}
    {warnings.length>0&&<details className="m-data-note" style={{marginBottom:12}}><summary>Alcance de los datos del análisis</summary>{warnings.map(warning=><p key={warning}>{warning}</p>)}</details>}
    {insight?.headline&&<p style={{fontWeight:600,marginBottom:14}}>{String(insight.headline)}</p>}
    {cards.length>0?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:12}}>{cards.map((card,index)=>{
      const color=colors[card.color]||colors.blue;
      const CardIcon=cardIcons[card.type]||icons.Chart;
      const TrendIcon=card.trend==='up'?icons.TrendUp:card.trend==='down'?icons.TrendDown:null;
      const trendLabel=card.trend==='up'?'En aumento':card.trend==='down'?'En descenso':'';
      const trendColor=card.type==='spending'?(card.trend==='up'?colors.red:colors.lime):(card.trend==='up'?colors.lime:colors.red);
      return <article key={`${card.type||'card'}-${index}`} style={{background:'var(--raised)',border:'1px solid var(--border)',borderTop:`3px solid ${color}`,borderRadius:12,padding:16,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:12}}><h3 style={{display:'flex',alignItems:'center',gap:7,fontSize:12,color:'var(--text-mid)'}}><span aria-hidden="true" style={{display:'inline-flex',color,flexShrink:0}}><CardIcon/></span>{String(card.title||'Análisis')}</h3>{TrendIcon&&<span role="img" aria-label={trendLabel} style={{display:'inline-flex',color:trendColor,flexShrink:0}}><span aria-hidden="true"><TrendIcon/></span></span>}</div>
        <p className="mono" style={{fontSize:23,fontWeight:700,color,marginBottom:8,overflowWrap:'anywhere'}}>{String(card.value??'')}</p>
        <p style={{fontSize:12,color:'var(--text-mid)',lineHeight:1.6}}>{String(card.detail||'')}</p>
      </article>;
    })}</div>:<p className="m-empty-inline">Todavía no generaste un resumen semanal. La consulta se realiza sólo cuando pulsás Generar resumen.</p>}
  </section>;
}
