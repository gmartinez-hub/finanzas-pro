import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ==========================================
// MÓDULO 1: CONFIGURACIÓN Y UTILIDADES
// ==========================================
const T = {
  bg:"#07080D",surface:"#0C0E15",raised:"#111520",border:"#1C2030",hi:"#252D45",
  lime:"#C8FF57",limeD:"#A8E030",blue:"#4D9EFF",red:"#FF4D6A",amber:"#FFB830",
  teal:"#00E5C3",purple:"#A78BFA",white:"#F0F2F7",mid:"#8892A4",muted:"#3A4255",ink:"#0E1117",
};

const SK="fp_v5_pro";
const persist = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch (e) { console.warn(e); } };
const hydrate = () => { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : null; } catch (e) { return null; } };

const px = raw => {
  if(typeof raw === "number") return raw;
  let s = String(raw||"").trim();
  if(!s) return 0;
  if(s.includes('.') && s.includes(',')){
    const d=s.lastIndexOf('.'); const c=s.lastIndexOf(',');
    if(c>d) s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  } else {
    const commas = (s.match(/,/g)||[]).length;
    const dots = (s.match(/\./g)||[]).length;
    if(commas === 1 && dots === 0) s = s.replace(',', '.');
    else if(dots > 1) s = s.replace(/\./g, '');
    else if(commas > 1) s = s.replace(/,/g, '');
  }
  s = s.replace(/[^0-9.-]/g,"");
  return parseFloat(s)||0;
};

const fARS = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n||0);
const fUSD = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n||0);
const clamp = (v,a,b) => Math.min(Math.max(v,a),b);
const todayISO = () => new Date().toISOString().slice(0,10);
const getCUR = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; };
const gMonth = d => (d||"").slice(0,7);
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const cleanJSON = r => { let s=r.replace(/`{3}json|`{3}/gi,"").trim(); const f=s.search(/[\{\[]/); const l=Math.max(s.lastIndexOf("}"),s.lastIndexOf("]")); return f!==-1&&l!==-1?s.slice(f,l+1):s; };

const CATS = ["🏠 Vivienda","🛒 Supermercado","🚗 Transporte","🍔 Comida y delivery","💊 Salud","👕 Indumentaria","📱 Servicios digitales","🎬 Ocio","💪 Deporte","✈️ Viajes","📚 Educación","💰 Ahorro","💳 Cuotas","🐜 Gastos hormiga","🧛 Suscripciones","❓ Otros"];

// ==========================================
// MÓDULO 2: SERVICIOS API Y LLM (IA)
// ==========================================
async function fetchUSDOficial(){
  try { const r = await fetch("https://dolarapi.com/v1/dolares/oficial"); const d = await r.json(); return Math.round((d.compra+d.venta)/2); } 
  catch { return 1350; }
}

const AI_URL = window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1" ? "https://api.anthropic.com/v1/messages" : "/api/ai";

async function ai(prompt){
  try {
    const r = await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5-20250929",max_tokens:1500,messages:[{role:"user",content:prompt}]})});
    if(!r.ok) return null; const d = await r.json(); return cleanJSON(d.content?.[0]?.text || "");
  } catch { return null; }
}

async function aiVision(b64,mime,prompt){
  try {
    const r = await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5-20250929",max_tokens:1500,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:mime,data:b64}},{type:"text",text:prompt}]}]})});
    if(!r.ok) return null; const d = await r.json(); return cleanJSON(d.content?.[0]?.text || "");
  } catch { return null; }
}

const DEFAULT = {transactions:[], goals:[], usdRate:1350, displayCurrency:"ARS", onboardingDone:false, holdings:[], weeklyInsight:null};

// ==========================================
// MÓDULO 3: COMPONENTE PRINCIPAL (Layout)
// ==========================================
export default function App(){
  const [state,setState] = useState(DEFAULT);
  const [view,setView] = useState("dashboard");
  const [ready,setReady] = useState(false);
  const [toast,setToast] = useState(null);
  const [sideOpen,setSO] = useState(false);
  const [scanOpen,setScanOpen] = useState(false); 
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fix: Hydrate de manera síncrona y segura sin promesas.
  useEffect(() => { 
    const savedState = hydrate();
    if(savedState) setState(p => ({...p,...savedState})); 
    setReady(true); 
  }, []);
  
  useEffect(() => { if(ready) persist(state); }, [state, ready]);
  useEffect(() => { if(ready) fetchUSDOficial().then(r => setState(p => ({...p, usdRate:r}))); }, [ready]);

  const notify = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };
  
  // Fix: Actualizador blindado que acepta objetos o funciones
  const update = useCallback((patch) => {
    setState(s => {
      const updates = typeof patch === 'function' ? patch(s) : patch;
      return {...s, ...updates};
    });
  }, []);

  if(!ready) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.muted}}>Iniciando FinanzasPro V5...</div>;
  if(!state.onboardingDone) return <Onboarding update={update} notify={notify}/>;

  const sidebar = (
    <aside style={{width:isMobile?260:220, background:T.surface, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", padding:"20px 12px", gap:4, height:"100vh", position:isMobile?"fixed":"relative", left:isMobile && !sideOpen?"-260px":"0", zIndex:300, transition:"left .3s ease"}}>
      <div style={{padding:"0 10px 20px", fontSize:18, fontWeight:800, color:T.lime}}>💳 FinanzasPro</div>
      
      <button className="btn bl" style={{marginBottom:16, justifyContent:"center"}} onClick={()=>{setScanOpen(true); setSO(false);}}>📸 Escáner IA</button>

      {[{id:"dashboard", l:"Patrimonio", I:ic.Grid}, {id:"transactions", l:"Movimientos", I:ic.Tx}, {id:"goals", l:"Metas & Simulador", I:ic.Target}, {id:"investments", l:"Inversiones", I:ic.Stock}].map(n => (
        <button key={n.id} className={`nav ${view===n.id?"on":""}`} onClick={()=>{setView(n.id);setSO(false)}}><n.I/> {n.l}</button>
      ))}
      <div style={{flex:1}}/>
      <div style={{background:T.raised, padding:14, borderRadius:16, fontSize:10, color:T.muted, border:`1px solid ${T.border}`}}>
        USD Oficial: <span className="mono" style={{color:T.lime, fontSize:12}}>{fARS(state.usdRate)}</span>
        <div style={{display:"flex", gap:4, marginTop:10}}>
          {["ARS","USD"].map(c => (
            <button key={c} onClick={()=>update({displayCurrency:c})} style={{flex:1, padding:"6px", borderRadius:8, background:state.displayCurrency===c?T.lime:T.bg, color:state.displayCurrency===c?T.bg:T.muted, fontWeight:700}}>{c}</button>
          ))}
        </div>
      </div>
    </aside>
  );

  return(
    <div style={{display:"flex", height:"100vh", background:T.bg, color:T.white}}>
      <style>{CSS}</style>
      {isMobile && sideOpen && <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:299, backdropFilter:"blur(4px)"}} onClick={()=>setSO(false)}/>}
      {sidebar}
      <main style={{flex:1, overflow:"auto", padding:isMobile?"76px 16px 20px":"30px 40px"}}>
        {isMobile && <div style={{position:"fixed", top:0, left:0, right:0, height:60, background:T.surface, display:"flex", alignItems:"center", padding:"0 16px", zIndex:100, borderBottom:`1px solid ${T.border}`} }><button onClick={()=>setSO(true)}><ic.Menu/></button><span style={{marginLeft:12, fontWeight:700}}>FinanzasPro V5</span></div>}
        
        {view==="dashboard" && <Dashboard state={state} update={update} notify={notify} setView={setView}/>}
        {view==="transactions" && <Transactions state={state} update={update} notify={notify}/>}
        {view==="goals" && <Goals state={state} update={update} notify={notify}/>}
        {view==="investments" && <Investments state={state} update={update} notify={notify}/>}
      </main>
      {scanOpen && <ScannerModal state={state} update={update} notify={notify} close={()=>setScanOpen(false)} />}
      {toast && <div className="toast up" style={{borderColor:toast.type==="err"?T.red:T.lime}}>{toast.msg}</div>}
    </div>
  );
}

// ==========================================
// MÓDULO 4: ESCÁNER UNIVERSAL (OCR + LLM)
// ==========================================
function ScannerModal({state, update, notify, close}) {
  const [img, setImg] = useState(null);
  const [mime, setMime] = useState("");
  const [status, setStatus] = useState("idle"); 
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const handleFile = (f) => {
    if(!f) return;
    const r = new FileReader();
    r.onload = (e) => { setImg(e.target.result); setMime(f.type); setStatus("idle"); setResult(null); };
    r.readAsDataURL(f);
  };

  const analyze = async () => {
    setStatus("analyzing");
    const b64 = img.split(",")[1];
    const prompt = `Analyze this financial app screenshot. Is it a list of 'transactions' or a 'portfolio' of assets?
    Return ONLY valid JSON:
    If transactions: {"type": "transactions", "data": [{"date":"YYYY-MM-DD", "description":"Merchant name", "amount":<positive number>, "txType":"expense" or "income", "category":"...best match from predefined list..."}]}
    If portfolio: {"type": "portfolio", "data": [{"ticker":"BTC or AAPL or MercadoPago", "name":"Bitcoin...", "quantity": <number or 1>, "price": <number>, "totalValue": <number>}]}
    Predefined categories: ${CATS.join(", ")}. Convert dates to YYYY-MM-DD. Treat salary/deposits as income, purchases as expense.`;
    
    const res = await aiVision(b64, mime, prompt);
    if(res) {
      try {
        const parsed = JSON.parse(res);
        setResult(parsed);
        setStatus("review");
      } catch {
        notify("No se pudo interpretar la imagen", "err"); setStatus("idle");
      }
    } else {
      notify("Fallo en la IA de visión", "err"); setStatus("idle");
    }
  };

  const confirm = () => {
    if(result.type === "transactions") {
      const newTxs = result.data.map(t => ({id:`m_${uid()}`, date:t.date||todayISO(), description:t.description, amount:t.amount, type:t.txType, category:t.category, currency:"ARS"}));
      update({transactions: [...state.transactions, ...newTxs]});
      notify(`${newTxs.length} movimientos importados ✓`);
    } else if (result.type === "portfolio") {
      const newAssets = result.data.map(a => {
        const isCrypto = String(a.ticker).includes("BTC") || String(a.ticker).includes("ETH") || String(a.ticker).includes("USDT");
        return {
          id:`h_${uid()}`, type: isCrypto ? "crypto" : String(a.ticker).length <= 5 ? "accion" : "fci", 
          ticker: a.ticker || "ACTIVO", name: a.name || a.ticker, 
          quantity: a.quantity || 1, buyPrice: a.price || a.totalValue, totalInvested: a.totalValue || (a.quantity * a.price),
          currentValue: a.totalValue, currency: "ARS", lastUpdated: todayISO(), buyDate: todayISO(), rate: ""
        };
      });
      update({holdings: [...state.holdings, ...newAssets]});
      notify(`${newAssets.length} activos importados ✓`);
    }
    close();
  };

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&close()}>
      <div className="modal up">
        <div style={{display:"flex", justifyContent:"space-between", marginBottom:20}}><h3>📸 Escáner IA Universal</h3><button onClick={close}><ic.X/></button></div>
        
        {status === "idle" && (
          <div style={{display:"flex", flexDirection:"column", gap:16}}>
            <div style={{fontSize:12, color:T.muted}}>Sube capturas de MercadoPago, Ualá, Binance o tu Homebanking. La IA detectará automáticamente si son movimientos o inversiones.</div>
            <div style={{border:`2px dashed ${T.border}`, padding:"40px 20px", textAlign:"center", borderRadius:16, cursor:"pointer", background:T.raised}} onClick={()=>fileRef.current?.click()}>
               {img ? <img src={img} alt="preview" style={{maxHeight:150, borderRadius:8, objectFit:"contain"}}/> : <div style={{fontSize:32}}>📁</div>}
               <div style={{marginTop:10, fontSize:12, fontWeight:600}}>{img ? "Cambiar Imagen" : "Click para subir captura"}</div>
               <input type="file" ref={fileRef} accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            </div>
            {img && <button className="btn bl" style={{justifyContent:"center"}} onClick={analyze}>✨ Analizar Píxeles con IA</button>}
          </div>
        )}

        {status === "analyzing" && <div style={{textAlign:"center", padding:"40px", color:T.muted}}><div style={{fontSize:32, marginBottom:16}}>🤖</div>Extrayendo datos financieros... <Dots/></div>}

        {status === "review" && result && (
          <div className="up">
            <div style={{background:`${T.blue}22`, color:T.blue, padding:10, borderRadius:8, fontSize:12, marginBottom:16, fontWeight:600}}>
               Formato detectado: {result.type.toUpperCase()}
            </div>
            <div style={{maxHeight:250, overflowY:"auto", background:T.raised, padding:10, borderRadius:12, marginBottom:16}}>
               {result.type === "transactions" ? result.data.map((t,i) => (
                 <div key={i} style={{display:"flex", justifyContent:"space-between", fontSize:11, padding:"8px 0", borderBottom:`1px solid ${T.border}`}}>
                   <div><div style={{fontWeight:600}}>{String(t.description).slice(0,25)}</div><div style={{color:T.muted}}>{t.date} · {t.category}</div></div>
                   <div className="mono" style={{color:t.txType==="income"?T.teal:T.red}}>{t.txType==="income"?"+":"-"}{fARS(t.amount)}</div>
                 </div>
               )) : result.data.map((a,i) => (
                 <div key={i} style={{display:"flex", justifyContent:"space-between", fontSize:11, padding:"8px 0", borderBottom:`1px solid ${T.border}`}}>
                   <div><div style={{fontWeight:600}}>{a.ticker}</div><div style={{color:T.muted}}>{a.name} · Cant: {a.quantity}</div></div>
                   <div className="mono">{fARS(a.totalValue)}</div>
                 </div>
               ))}
            </div>
            <div style={{display:"flex", gap:10}}>
              <button className="btn bl" style={{flex:1, justifyContent:"center"}} onClick={confirm}>✓ Guardar Todo</button>
              <button className="btn bg" onClick={()=>setStatus("idle")}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// MÓDULO 5: DASHBOARD (Net Worth & Score)
// ==========================================
function Dashboard({state, update, notify, setView}){
  const {transactions, goals, holdings=[], displayCurrency, usdRate}=state;
  const [loadingIns,setLI]=useState(false);
  
  const fmt = useCallback(a => displayCurrency==="USD" ? fUSD(a/usdRate) : fARS(a), [displayCurrency, usdRate]);

  // Patrimonio Neto
  const portVal = holdings.reduce((s,h) => s + (h.currentValue || h.totalInvested || 0), 0);
  const totalInc = transactions.filter(t => t.type === "income").reduce((s,t) => s + t.amount, 0);
  const totalExp = transactions.filter(t => t.type === "expense").reduce((s,t) => s + t.amount, 0);
  const cash = totalInc - totalExp;
  const netWorth = cash + portVal;

  // Calculadora de Score Financiero (V5)
  const calcScore = () => {
     let score = 0;
     const curMonthTxs = transactions.filter(t=>gMonth(t.date)===getCUR());
     const mInc = curMonthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
     const mExp = curMonthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
     
     // 1. Ahorro (30%)
     const savRate = mInc > 0 ? ((mInc-mExp)/mInc) : 0;
     score += clamp(savRate * 150, 0, 30);
     
     // 2. Diversificación (30%)
     const assetTypes = new Set(holdings.map(h=>h.type)).size;
     score += clamp(assetTypes * 10, 0, 30);
     
     // 3. Liquidez (20%)
     const liqRatio = mExp > 0 ? (cash / mExp) : 1;
     score += clamp(liqRatio * 20, 0, 20);
     
     // 4. Riesgo (20%)
     const cryptoVal = holdings.filter(h=>h.type==="crypto").reduce((s,h)=>s+(h.currentValue||0),0);
     const riskRatio = portVal > 0 ? (cryptoVal / portVal) : 0;
     score += riskRatio > 0.5 ? 10 : 20; 
     
     return Math.round(score);
  };
  const finalScore = calcScore();

  const genInsight = async () => {
    setLI(true);
    const prompt = `Data: NetWorth ${netWorth}, Portfolio ${portVal}, Cash ${cash}. Goal count: ${goals.length}. Score: ${finalScore}/100. Return 1 short Spanish financial tip or warning based on these metrics.`;
    const res = await ai(prompt);
    if(res) {
      update({weeklyInsight: {headline: "Recomendación Personalizada", detail: res}});
      notify("Insight IA Generado ✓");
    } else {
      notify("Error conectando con la IA", "err");
    }
    setLI(false);
  };

  return(
    <div className="up">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24, flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:12, color:T.muted, textTransform:"uppercase", letterSpacing:"1px", marginBottom:4}}>Patrimonio Neto (Net Worth)</div>
          <div style={{fontSize:36, fontWeight:800, color:T.lime, letterSpacing:"-1.5px"}}>{fmt(netWorth)}</div>
        </div>
      </div>

      <div className="kpi-grid" style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24}}>
         <div className="card up">
           <div style={{fontSize:10, color:T.muted, marginBottom:8}}>INVERSIONES</div>
           <div className="mono" style={{fontSize:18, fontWeight:700}}>{fmt(portVal)}</div>
           <div style={{fontSize:10, color:T.teal, marginTop:4}}>Representa el {netWorth>0 ? ((portVal/netWorth)*100).toFixed(0) : 0}% de tu capital</div>
         </div>
         <div className="card up">
           <div style={{fontSize:10, color:T.muted, marginBottom:8}}>EFECTIVO / CAJA</div>
           <div className="mono" style={{fontSize:18, fontWeight:700}}>{fmt(cash)}</div>
         </div>
         <div className="card up" style={{borderColor:finalScore>=70?T.lime:finalScore>=40?T.amber:T.red}}>
           <div style={{fontSize:10, color:T.muted, marginBottom:8}}>HEALTH SCORE</div>
           <div className="mono" style={{fontSize:18, fontWeight:700, color:finalScore>=70?T.lime:finalScore>=40?T.amber:T.red}}>{finalScore} / 100</div>
         </div>
      </div>

      <div className="g2">
        <div className="card up">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
            <h3 style={{fontSize:14}}>Vigilancia de Metas</h3>
            <button className="btn bg bsm" style={{padding:"4px 8px"}} onClick={()=>setView("goals")}>Ver todas</button>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            {goals.filter(g => g.saved < g.target).slice(0,3).map(g => {
              const linkedVal = holdings.filter(h => h.goalId === g.id).reduce((s,h) => s + (h.currentValue || h.totalInvested || 0), 0);
              const total = g.saved + linkedVal;
              const pct = clamp((total / g.target) * 100, 0, 100);
              return (
                <div key={g.id}>
                  <div style={{display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:6}}>
                    <span>{g.icon} {g.name}</span>
                    <span className="mono" style={{color:pct>=100?T.lime:T.white}}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="prog"><div className="progf" style={{width:`${pct}%`, background:pct>=100?T.lime:T.blue}}/></div>
                </div>
              );
            })}
            {goals.length===0 && <div style={{fontSize:12, color:T.muted}}>No hay metas configuradas.</div>}
          </div>
        </div>
        
        <div className="card up" style={{borderColor:state.weeklyInsight?T.blue:T.border}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
            <h3 style={{fontSize:14}}>🤖 Insights Financieros</h3>
            <button className="btn bg bsm" onClick={genInsight} disabled={loadingIns}>{loadingIns ? <Dots/> : "Refresh IA"}</button>
          </div>
          <div style={{fontSize:12, color:T.mid, lineHeight:1.6, marginTop:12}}>
            {state.weeklyInsight ? state.weeklyInsight.detail : "Presiona Refresh IA para que el motor analice tu patrimonio, score y metas, y genere una recomendación."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MÓDULO 6: MOVIMIENTOS
// ==========================================
function Transactions({state, update, notify}){
  const {transactions, usdRate, displayCurrency}=state;
  const [showAdd, setSA]=useState(false);
  const [editTx, setETx]=useState(null);
  const [form, setForm]=useState({date:todayISO(), description:"", amount:"", type:"expense", category:"❓ Otros", currency:"ARS"});

  const fmt = useCallback(a => displayCurrency==="USD" ? fUSD(a/usdRate) : fARS(a), [displayCurrency, usdRate]);

  const save = () => {
    if(!form.description || !form.amount) return notify("Completa descripción y monto", "err");
    const ars = px(form.amount) * (form.currency==="USD" ? usdRate : 1);
    if(editTx) update({transactions: transactions.map(t => t.id === editTx ? {...t, ...form, amount: ars} : t)});
    else update({transactions: [...transactions, {id:`m_${uid()}`, ...form, amount: ars}]});
    setSA(false); setETx(null); setForm({date:todayISO(), description:"", amount:"", type:"expense", category:"❓ Otros", currency:"ARS"});
    notify("Movimiento guardado ✓");
  };

  return(
    <div className="up">
      <PH title="Movimientos" right={<button className="btn bl" onClick={()=>{setETx(null); setSA(true)}}><ic.Plus/> Nuevo Gasto/Ingreso</button>}/>
      <div className="card" style={{padding:0, overflow:"auto"}}>
        <table className="tbl">
          <thead><tr><th className="hide-m">Fecha</th><th>Detalle</th><th>Categoría</th><th>Monto</th><th></th></tr></thead>
          <tbody>
            {transactions.slice().reverse().map(t => (
              <tr key={t.id}>
                <td className="mono hide-m" style={{fontSize:11, color:T.muted}}>{t.date}</td>
                <td style={{fontSize:13, fontWeight:600}}>{t.description}</td>
                <td style={{fontSize:11, color:T.mid}}>{t.category}</td>
                <td className="mono" style={{color:t.type==="income"?T.teal:T.red, fontWeight:700}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</td>
                <td style={{textAlign:"right"}}>
                  <button className="btn bg bsm" onClick={()=>{setForm({...t, amount:t.amount}); setETx(t.id); setSA(true)}}>✎</button>
                  <button className="btn bd bsm" style={{marginLeft:6}} onClick={()=>update({transactions:transactions.filter(x=>x.id!==t.id)})}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && <div style={{padding:"40px", textAlign:"center", color:T.muted}}>Sin movimientos registrados</div>}
      </div>
      
      {showAdd && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setSA(false)}>
          <div className="modal up">
            <h3>{editTx ? "Modificar" : "Nuevo"} Movimiento</h3>
            <div style={{display:"flex", flexDirection:"column", gap:14, marginTop:24}}>
              <div className="g2">
                <input type="date" className="inp" value={form.date} onChange={e=>setForm({...form, date:e.target.value})}/>
                <select className="inp" value={form.type} onChange={e=>setForm({...form, type:e.target.value})}>
                  <option value="expense">Gasto (-)</option>
                  <option value="income">Ingreso (+)</option>
                </select>
              </div>
              <input className="inp" placeholder="Descripción (ej: Supermercado)" value={form.description} onChange={e=>setForm({...form, description:e.target.value})}/>
              <div className="g3">
                <input className="inp" style={{gridColumn:"1/3"}} placeholder="Monto (ej: 15.000,50)" value={form.amount} onChange={e=>setForm({...form, amount:e.target.value})}/>
                <select className="inp" value={form.currency} onChange={e=>setForm({...form, currency:e.target.value})}>
                  <option>ARS</option><option>USD</option>
                </select>
              </div>
              <select className="inp" value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
                {CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn bl" style={{justifyContent:"center"}} onClick={save}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MÓDULO 7: METAS Y SIMULADOR
// ==========================================
function Goals({state, update, notify}){
  const {goals, holdings=[], transactions, displayCurrency, usdRate}=state;
  const [addTo, setAT]=useState(null);
  const [addAmt, setAA]=useState("");
  const [sf, setSF]=useState(false);
  const [form, setForm]=useState({name:"", target:"", icon:"🎯", deadline:""});
  
  const [simGoal, setSimGoal]=useState(null);
  const [simData, setSimData]=useState({monthly:100000, rate:35});

  const fmt = useCallback(a => displayCurrency==="USD" ? fUSD(a/usdRate) : fARS(a), [displayCurrency, usdRate]);

  const liquidar = (g, linkedH) => {
    const ids = linkedH.map(h => h.id);
    const expense = {id:`m_${uid()}`, date:todayISO(), description:`Liquidación Meta: ${g.name}`, amount: g.target, type:"expense", category:"💰 Ahorro", currency:"ARS", source:"auto"};
    update({
      transactions: [...transactions, expense],
      holdings: holdings.filter(h => !ids.includes(h.id)),
      goals: goals.filter(x => x.id !== g.id)
    });
    notify(`¡Felicidades! Meta '${g.name}' cumplida y activos liquidados 🎉`);
  };

  const addG = () => {
    if(!form.name || !form.target) return notify("Nombre y monto son requeridos","err");
    update({goals: [...goals, {id:`g_${uid()}`, name:form.name, target:px(form.target), saved:0, icon:form.icon, deadline:form.deadline}]});
    setSF(false); setForm({name:"", target:"", icon:"🎯", deadline:""}); notify("Meta creada ✓");
  }

  const simulateMonths = (target, current, monthly, annualRate) => {
      const r = (annualRate / 100) / 12; 
      const p = px(monthly);
      if(p <= 0) return "Ingresa aporte";
      if(r === 0) return Math.ceil((target - current) / p) + " meses";
      const months = Math.log(1 + (target - current) * r / p) / Math.log(1 + r);
      if(isNaN(months)) return "Inválido";
      return Math.ceil(months) + " meses";
  };

  return(
    <div className="up">
      <PH title="Metas & Simulador" right={<button className="btn bl" onClick={()=>setSF(true)}><ic.Plus/> Nueva Meta</button>}/>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16}}>
        {goals.map(g => {
          const linkedH = holdings.filter(h => h.goalId === g.id);
          const linkedVal = linkedH.reduce((s,h) => s + (h.currentValue || h.totalInvested || 0), 0);
          const total = g.saved + linkedVal;
          const pct = clamp((total / g.target) * 100, 0, 100);
          
          return (
            <div key={g.id} className="card up" style={{border: pct>=100?`1px solid ${T.lime}`:`1px solid ${T.border}`}}>
              <div style={{display:"flex", justifyContent:"space-between", marginBottom:14}}>
                <div style={{display:"flex", gap:12}}>
                  <span style={{fontSize:28}}>{g.icon}</span>
                  <div>
                    <div style={{fontWeight:700, fontSize:15}}>{g.name}</div>
                    <div style={{fontSize:10, color:T.muted}}>{pct>=100 ? "¡Objetivo Alcanzado!" : `Faltan ${fmt(g.target-total)}`}</div>
                  </div>
                </div>
                <button className="btn bd bsm" onClick={()=>update({goals:goals.filter(x=>x.id!==g.id)})}>×</button>
              </div>
              <div className="prog" style={{height:10}}><div className="progf" style={{width:`${pct}%`, background:pct>=100?T.lime:T.blue}}/></div>
              <div style={{marginTop:12, fontSize:11, color:T.mid, display:"flex", justifyContent:"space-between", background:T.raised, padding:8, borderRadius:8}}>
                <span>Cash: <span className="mono">{fmt(g.saved)}</span></span>
                <span>Inversiones: <span className="mono">{fmt(linkedVal)}</span></span>
              </div>
              
              {pct >= 100 ? (
                <button className="btn bl" style={{width:"100%", marginTop:16, justifyContent:"center"}} onClick={()=>liquidar(g, linkedH)}>💸 Liquidar Activos y Cumplir</button>
              ) : (
                <div style={{display:"flex", gap:8, marginTop:16}}>
                  {addTo === g.id ? (
                    <div style={{display:"flex", gap:6, flex:1}}>
                      <input autoFocus className="inp" placeholder="Ahorro $" value={addAmt} onChange={e=>setAA(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){update({goals:goals.map(x=>x.id===g.id?{...x, saved:x.saved+px(addAmt)}:x)}); setAT(null); setAA("");}}}/>
                      <button className="btn bl bsm" onClick={()=>{update({goals:goals.map(x=>x.id===g.id?{...x, saved:x.saved+px(addAmt)}:x)}); setAT(null); setAA("")}}>✓</button>
                    </div>
                  ) : (
                    <>
                      <button className="btn bg bsm" style={{flex:1, justifyContent:"center"}} onClick={()=>setAT(g.id)}>+ Cash</button>
                      <button className="btn bg bsm" style={{flex:1, justifyContent:"center", color:T.blue}} onClick={()=>setSimGoal(g)}>🔮 Simular</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {goals.length === 0 && <div className="card" style={{gridColumn:"1/-1", textAlign:"center", padding:"40px", color:T.muted}}>No tienes metas activas.</div>}
      </div>

      {simGoal && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setSimGoal(null)}>
          <div className="modal up">
             <h3>🔮 Simulador Financiero</h3>
             <div style={{fontSize:12, color:T.muted, marginTop:4}}>Meta: {simGoal.name} (Faltan {fmt(simGoal.target - (simGoal.saved + holdings.filter(h=>h.goalId===simGoal.id).reduce((s,h)=>s+(h.currentValue||h.totalInvested),0)))})</div>
             
             <div style={{marginTop:20, display:"flex", flexDirection:"column", gap:14}}>
                <div>
                  <label style={{fontSize:11, color:T.muted}}>Aporte mensual estimado (ARS)</label>
                  <input className="inp" value={simData.monthly} onChange={e=>setSimData({...simData, monthly:e.target.value})}/>
                </div>
                <div>
                  <label style={{fontSize:11, color:T.muted}}>Tasa Anual Estimada (TNA %)</label>
                  <input className="inp" value={simData.rate} onChange={e=>setSimData({...simData, rate:e.target.value})}/>
                </div>
                
                <div style={{background:`${T.blue}22`, padding:16, borderRadius:12, border:`1px solid ${T.blue}44`, textAlign:"center", marginTop:10}}>
                   <div style={{fontSize:11, color:T.blue, textTransform:"uppercase", letterSpacing:"1px", marginBottom:6}}>Tiempo estimado invirtiendo</div>
                   <div style={{fontSize:24, fontWeight:800, color:T.white}}>
                     {simulateMonths(simGoal.target, simGoal.saved + holdings.filter(h=>h.goalId===simGoal.id).reduce((s,h)=>s+(h.currentValue||h.totalInvested),0), simData.monthly, px(simData.rate))}
                   </div>
                </div>
                <button className="btn bg" style={{justifyContent:"center"}} onClick={()=>setSimGoal(null)}>Cerrar</button>
             </div>
          </div>
        </div>
      )}

      {sf && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setSF(false)}>
          <div className="modal up">
            <h3>Nueva Meta</h3>
            <div style={{display:"flex", flexDirection:"column", gap:14, marginTop:20}}>
              <div style={{display:"flex", gap:8, fontSize:20}}>
                {["🎯","✈️","🚗","🏠","💻","📱","💍","🎓"].map(i=><button key={i} onClick={()=>setForm({...form, icon:i})} style={{padding:8, background:form.icon===i?T.raised:"transparent", borderRadius:8, border:`1px solid ${form.icon===i?T.lime:T.border}`}}>{i}</button>)}
              </div>
              <input className="inp" placeholder="Nombre (ej: Cambiar el auto)" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
              <input className="inp" placeholder="Monto objetivo (ARS)" value={form.target} onChange={e=>setForm({...form, target:e.target.value})}/>
              <input type="date" className="inp" value={form.deadline} onChange={e=>setForm({...form, deadline:e.target.value})}/>
              <button className="btn bl" style={{justifyContent:"center"}} onClick={addG}>Crear Meta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MÓDULO 8: INVERSIONES (Hybrid Engine)
// ==========================================
function Investments({state, update, notify}){
  const {holdings=[], goals=[], usdRate, transactions, displayCurrency}=state;
  const [showHForm, setSHF]=useState(false);
  const [hForm, setHF]=useState({type:"accion", ticker:"", name:"", quantity:"", buyPrice:"", totalInvested:"", currency:"ARS", buyDate:todayISO(), rate:"", goalId:""});
  const [refreshingId, setRI]=useState(null);

  const fmt = useCallback(a => displayCurrency==="USD" ? fUSD(a/usdRate) : fARS(a), [displayCurrency, usdRate]);

  const refreshSingle = async (h) => {
    setRI(h.id);
    let updatedHolding = {...h};
    try {
      if(h.type === "crypto") {
        let sym = h.ticker.toUpperCase().replace(/[^A-Z]/g,"");
        if(!sym.endsWith("USDT") && !sym.endsWith("BUSD") && !sym.endsWith("USDC")) sym += "USDT";
        const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
        const d = await r.json();
        if(d.price) {
          let cp = parseFloat(d.price);
          if(h.currency==="ARS") cp *= usdRate;
          const cv = h.quantity ? px(h.quantity) * cp : px(h.totalInvested) * (cp/px(h.buyPrice));
          updatedHolding = {...updatedHolding, currentPrice:cp, currentValue:Math.round(cv), lastUpdated:todayISO()};
          notify(`${h.ticker} actualizado vía Binance ✓`);
        } else throw new Error();
      } else if (["accion","cedear","etf","bono"].includes(h.type)) {
        const raw = await ai(`Price for ticker: ${h.ticker}. Date: ${todayISO()}. Return JSON: {"price": number}. ARS for local AR instruments, USD for US.`, "Valid JSON only.");
        if(raw){
          const d = JSON.parse(raw);
          let cp = d.price || d.prices?.[h.ticker] || null;
          if(cp) {
            if(h.currency==="ARS" && (h.type==="cedear" || h.type==="etf")) cp *= usdRate;
            const cv = h.quantity ? px(h.quantity) * cp : px(h.totalInvested) * (cp/px(h.buyPrice));
            updatedHolding = {...updatedHolding, currentPrice:cp, currentValue:Math.round(cv), lastUpdated:todayISO()};
            notify(`${h.ticker} actualizado vía IA ✓`);
          } else throw new Error();
        } else throw new Error();
      } else {
        const days = Math.max(0, Math.floor((Date.now()-new Date(h.buyDate))/864e5));
        const rateDec = px(h.rate)/100;
        let cv = px(h.totalInvested);
        if(h.type==="fci") cv *= Math.pow(1+(rateDec/365), days);
        else cv *= (1 + rateDec*(days/365));
        updatedHolding = {...updatedHolding, currentValue:Math.round(cv), lastUpdated:todayISO()};
        notify("Rendimiento calculado a hoy ✓");
      }
      update({holdings: holdings.map(x=>x.id===h.id ? updatedHolding : x)});
    } catch(e){ 
      notify(`Fallo al actualizar ${h.ticker||h.name}`, "err"); 
    }
    setRI(null);
  };

  const addH = () => {
    const isVar = ["accion","cedear","etf","crypto","bono"].includes(hForm.type);
    if(isVar && (!hForm.ticker || !hForm.quantity || !hForm.buyPrice)) return notify("Completa Ticker, Cantidad y Precio", "err");
    
    let inv = px(hForm.totalInvested);
    if(isVar && !inv) inv = px(hForm.quantity) * px(hForm.buyPrice);
    
    const h = {...hForm, id:`h_${uid()}`, totalInvested:inv, currentValue:inv, lastUpdated:todayISO()};
    update({holdings: [...holdings, h]});
    setSHF(false); 
    setHF({type:"accion", ticker:"", name:"", quantity:"", buyPrice:"", totalInvested:"", currency:"ARS", buyDate:todayISO(), rate:"", goalId:""});
    notify("Activo registrado en Portfolio ✓");
  };

  const gSel = goals.find(gx=>gx.id===hForm.goalId);
  const showRisk = gSel && gSel.deadline && (new Date(gSel.deadline)-getNow())/(864e5) < 180 && ["accion","crypto","cedear"].includes(hForm.type);

  return(
    <div className="up">
      <PH title="Mi Portfolio" right={<button className="btn bl" onClick={()=>setSHF(true)}><ic.Plus/> Cargar Inversión</button>}/>
      
      {showHForm && (
        <div className="card up" style={{marginBottom:24, borderColor:T.hi}}>
          <h3 style={{fontSize:14, marginBottom:16}}>Registrar Activo Real</h3>
          <div style={{display:"flex", flexDirection:"column", gap:12}}>
            <div className="g2">
              <select className="inp" value={hForm.type} onChange={e=>setHF({...hForm, type:e.target.value, ticker:"", quantity:"", buyPrice:"", rate:""})}>
                <option value="accion">Acción / CEDEAR</option>
                <option value="crypto">Criptomoneda</option>
                <option value="plazo_fijo">Plazo Fijo</option>
                <option value="fci">FCI / Billetera (MP, Ualá)</option>
                <option value="bono">Bono / ETF</option>
              </select>
              <select className="inp" value={hForm.goalId} onChange={e=>setHF({...hForm, goalId:e.target.value})}>
                <option value="">-- Sin meta vinculada --</option>
                {goals.filter(g=>g.saved<g.target).map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
              </select>
            </div>
            {showRisk && <div style={{background:`rgba(255,77,106,0.1)`, color:T.red, padding:10, borderRadius:8, fontSize:11, border:`1px solid rgba(255,77,106,0.3)`}}>⚠️ Atención: Estás atando un activo volátil a una meta de muy corto plazo.</div>}
            
            <div className="g2">
              <input className="inp" placeholder={["plazo_fijo","fci"].includes(hForm.type)?"Banco / Entidad":"Ticker (ej: BTC, AAPL)"} value={hForm.ticker} onChange={e=>setHF({...hForm, ticker:e.target.value.toUpperCase()})}/>
              <input className="inp" placeholder="Nombre (opcional)" value={hForm.name} onChange={e=>setHF({...hForm, name:e.target.value})}/>
            </div>

            {["accion","crypto","cedear","bono","etf"].includes(hForm.type) ? (
              <div className="g3">
                <input className="inp" placeholder="Cantidad (ej: 0.5)" value={hForm.quantity} onChange={e=>setHF({...hForm, quantity:e.target.value})}/>
                <input className="inp" placeholder="Precio Compra $" value={hForm.buyPrice} onChange={e=>setHF({...hForm, buyPrice:e.target.value})}/>
                <select className="inp" value={hForm.currency} onChange={e=>setHF({...hForm, currency:e.target.value})}>
                  <option>ARS</option><option>USD</option>
                </select>
              </div>
            ) : (
              <div className="g3">
                <input className="inp" placeholder="Capital Inicial $" value={hForm.totalInvested} onChange={e=>setHF({...hForm, totalInvested:e.target.value})}/>
                <input className="inp" placeholder="TNA %" value={hForm.rate} onChange={e=>setHF({...hForm, rate:e.target.value})}/>
                <input type="date" className="inp" value={hForm.buyDate} onChange={e=>setHF({...hForm, buyDate:e.target.value})}/>
              </div>
            )}
            <div className="g2">
              <button className="btn bl" style={{justifyContent:"center"}} onClick={addH}>Confirmar en Portfolio</button>
              <button className="btn bg" style={{justifyContent:"center"}} onClick={()=>setSHF(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        {holdings.map(h => {
          const linkedGoal = goals.find(g => g.id === h.goalId);
          const gain = (h.currentValue || h.totalInvested) - h.totalInvested;
          return (
            <div key={h.id} className="card up" style={{borderColor: linkedGoal ? T.hi : T.border}}>
              <div style={{display:"flex", justifyContent:"space-between", marginBottom:12, flexWrap:"wrap", gap:10}}>
                <div style={{display:"flex", gap:12, alignItems:"center"}}>
                  <span style={{fontSize:24, background:T.raised, padding:8, borderRadius:12}}>{h.type==="crypto"?"₿":h.type==="plazo_fijo"?"🏦":"📈"}</span>
                  <div>
                    <div style={{fontWeight:800, fontSize:15}}>{h.ticker || h.name}</div>
                    <div style={{fontSize:10, color:T.muted, marginTop:2}}>
                      {h.type.replace("_"," ")} {linkedGoal && <span style={{color:T.lime, marginLeft:4}}>🎯 Atado a: {linkedGoal.name}</span>}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex", gap:8}}>
                  <button className="btn bg bsm" onClick={()=>refreshSingle(h)} disabled={refreshingId===h.id}>{refreshingId===h.id ? <Dots/> : "🔄 Actualizar"}</button>
                  <button className="btn bd bsm" onClick={()=>update({holdings: holdings.filter(x=>x.id!==h.id)})}>×</button>
                </div>
              </div>
              
              <div className="g3" style={{background:T.raised, padding:14, borderRadius:14}}>
                <div><div style={{fontSize:9, color:T.muted, marginBottom:4}}>Inversión Inicial</div><div className="mono" style={{fontSize:14}}>{fARS(h.totalInvested)}</div></div>
                <div><div style={{fontSize:9, color:T.muted, marginBottom:4}}>Valor de Mercado</div><div className="mono" style={{fontSize:14, color:T.white}}>{fARS(h.currentValue || h.totalInvested)}</div></div>
                <div><div style={{fontSize:9, color:T.muted, marginBottom:4}}>P&L (Ganancia)</div><div className="mono" style={{fontSize:14, color:gain>=0?T.lime:T.red}}>{gain>=0?"+":""}{fARS(gain)}</div></div>
              </div>

              <div style={{marginTop:12, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
                <div style={{display:"flex", gap:6}}>
                  <input className="inp" style={{width:90, padding:"6px 10px"}} placeholder="Cupón $" id={`div_${h.id}`}/>
                  <button className="btn bg bsm" onClick={()=>{
                    const amt = px(document.getElementById(`div_${h.id}`).value);
                    if(amt>0) {
                      update({transactions: [...transactions, {id:`d_${uid()}`, date:todayISO(), description:`Dividendo/Cupón: ${h.ticker||h.name}`, amount:amt, type:"income", category:"💰 Ahorro", currency:"ARS"}]});
                      document.getElementById(`div_${h.id}`).value = "";
                      notify("Ingreso registrado en movimientos ✓");
                    }
                  }}>➕ Cobrar Div.</button>
                </div>
                {h.lastUpdated && <div style={{fontSize:9, color:T.muted}}>Actualizado: {h.lastUpdated}</div>}
              </div>
            </div>
          );
        })}
        {holdings.length === 0 && !showHForm && <div className="card" style={{textAlign:"center", padding:"50px", color:T.muted}}>Tu portfolio está vacío. Carga activos para verlos crecer y atalos a tus metas.</div>}
      </div>
    </div>
  );
}

// ==========================================
// MÓDULO 9: ÍCONOS Y UI BASE
// ==========================================
const ic = {
  Grid: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  Tx: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  Target: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Stock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  Plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Menu: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  X: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
};

const Dots = () => <span className="mono">...</span>;
const PH = ({title, right}) => (<div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:10}}><h1 style={{fontSize:26, fontWeight:800, letterSpacing:"-1px"}}>{title}</h1>{right}</div>);
function useDsp({displayCurrency, usdRate}){ const fmt = useCallback(a => displayCurrency==="USD" ? fUSD(a/usdRate) : fARS(a), [displayCurrency, usdRate]); return {fmt}; }
function useIsMobile(){ const [m,setM]=useState(window.innerWidth<=768); useEffect(()=>{ const h=()=>setM(window.innerWidth<=768); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]); return m; }

function Onboarding({update, notify}){
  const [d, setD] = useState({name:"", income:"", goalName:"", goalAmt:""});
  const finish = () => {
    const patch = {onboardingDone: true};
    if (d.goalName && px(d.goalAmt) > 0) {
        patch.goals = [{id:`g_${uid()}`, name:d.goalName, target:px(d.goalAmt), saved:0, icon:"🎯", deadline:""}];
    }
    update(patch);
    notify("¡Bienvenido al Wealth Manager!");
  };
  return(
    <div style={{display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", padding:20, background:T.bg}}>
      <div className="card" style={{maxWidth:400, width:"100%"}}>
        <h2 style={{marginBottom:10}}>Bienvenido 👋</h2>
        <div style={{display:"flex", flexDirection:"column", gap:16, marginTop:20}}>
          <input className="inp" placeholder="Tu nombre" value={d.name} onChange={e=>setD({...d, name:e.target.value})}/>
          <div style={{borderTop:`1px solid ${T.border}`, paddingTop:20, marginTop:10}}>
             <div style={{fontSize:12, color:T.muted, marginBottom:12}}>Define un objetivo de ahorro inicial (opcional):</div>
             <input className="inp" placeholder="Ej: Viaje a Europa" value={d.goalName} onChange={e=>setD({...d, goalName:e.target.value})}/>
             <input className="inp" style={{marginTop:10}} placeholder="Monto Objetivo $" value={d.goalAmt} onChange={e=>setD({...d, goalAmt:e.target.value})}/>
          </div>
          <button className="btn bl" style={{justifyContent:"center", marginTop:10}} onClick={finish}>Comenzar →</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:#07080D;color:#F0F2F7;font-family:'Sora',sans-serif;overflow:hidden;height:100%}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-thumb{background:#3A4255;border-radius:99px}
.mono{font-family:'DM Mono',monospace}
input,select,textarea,button{font-family:inherit}
button{cursor:pointer;border:none;background:none}
.up{animation:up .35s ease both}
@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.nav{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;font-size:14px;font-weight:500;color:#3A4255;transition:all .2s;width:100%;text-align:left}
.nav:hover{color:#F0F2F7;background:#111520}
.nav.on{color:#C8FF57;background:rgba(200,255,87,.07);font-weight:700}
.inp{background:#111520;border:1px solid #1C2030;border-radius:12px;padding:12px 14px;font-size:14px;color:#F0F2F7;outline:none;width:100%;transition:all .2s}
.inp:focus{border-color:#C8FF57;background:#161B2A}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;transition:all .2s;white-space:nowrap}
.btn:active{transform:scale(0.96)}
.bl{background:#C8FF57;color:#07080D}
.bl:hover{background:#A8E030;box-shadow:0 0 15px rgba(200,255,87,0.3)}
.bg{background:#111520;color:#8892A4;border:1px solid #1C2030}
.bg:hover{background:#1C2030;color:white}
.bd{background:rgba(255,77,106,.08);color:#FF4D6A;border:1px solid rgba(255,77,106,.2)}
.bsm{padding:8px 12px;font-size:12px;border-radius:10px}
.card{background:#0C0E15;border:1px solid #1C2030;border-radius:20px;padding:24px}
.prog{height:8px;border-radius:4px;background:#111520;overflow:hidden}
.progf{height:100%;border-radius:4px;transition:width .7s cubic-bezier(0.16, 1, 0.3, 1)}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
.modal{background:#0C0E15;border:1px solid #1C2030;border-radius:28px;padding:32px;width:540px;max-width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,0.5)}
.tbl{width:100%;border-collapse:collapse}
.tbl th{padding:14px;font-size:11px;color:#3A4255;text-transform:uppercase;text-align:left;border-bottom:1px solid #1C2030;letter-spacing:1.5px}
.tbl td{padding:14px;font-size:14px;border-bottom:1px solid #0E1117}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.toast{position:fixed;bottom:24px;right:24px;padding:16px 28px;border-radius:16px;font-size:14px;font-weight:600;background:#C8FF57;color:#07080D;z-index:999;box-shadow:0 10px 30px rgba(200,255,87,0.3)}
@media(max-width:768px){.hide-m{display:none!important}.g2,.g3{grid-template-columns:1fr!important}.kpi-grid{grid-template-columns:1fr 1fr!important}}
`;
