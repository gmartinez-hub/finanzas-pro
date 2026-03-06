import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const T = {
  bg:"#07080D",surface:"#0C0E15",raised:"#111520",border:"#1C2030",hi:"#252D45",
  lime:"#C8FF57",limeD:"#A8E030",blue:"#4D9EFF",red:"#FF4D6A",amber:"#FFB830",
  teal:"#00E5C3",purple:"#A78BFA",white:"#F0F2F7",mid:"#8892A4",muted:"#3A4255",ink:"#0E1117",
};
const SK="fp_v3b";
const persist=async d=>{try{await window.storage?.set(SK,JSON.stringify(d),false);}catch(e){console.warn("persist fail",e);}};
const hydrate=async()=>{try{const r=await window.storage?.get(SK,false);return r?JSON.parse(r.value):null;}catch(e){return null;}};
const px=raw=>{const s=String(raw||"").trim().replace(/[^0-9.,-]/g,"");if(!s)return 0;if(/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(s))return parseFloat(s.replace(/\./g,"").replace(",","."))||0;if(/^\d+,\d+$/.test(s))return parseFloat(s.replace(",","."))||0;if(/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s))return parseFloat(s.replace(/,/g,""))||0;return parseFloat(s)||0;};
const fARS=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n||0);
const fUSD=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:2}).format(n||0);
const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
const getNow=()=>new Date();
const todayISO=()=>getNow().toISOString().slice(0,10);
const getCUR=()=>{const n=getNow();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;};
const gMonth=d=>(d||"").slice(0,7);
const MOS=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const CATS=["🏠 Vivienda","🛒 Supermercado","🚗 Transporte","🍔 Comida y delivery","💊 Salud","👕 Indumentaria","📱 Servicios digitales","🎬 Ocio","💪 Deporte","✈️ Viajes","📚 Educación","💰 Ahorro","💳 Cuotas","🐜 Gastos hormiga","🧛 Suscripciones","❓ Otros"];
const CATS_PLAIN=CATS.map(c=>c.split(" ").slice(1).join(" "));
const matchCat=raw=>{if(!raw)return "❓ Otros";const found=CATS.find(c=>c===raw);if(found)return found;const lower=raw.toLowerCase().trim();const idx=CATS_PLAIN.findIndex(p=>p.toLowerCase()===lower);return idx>=0?CATS[idx]:"❓ Otros";};
const CPAL=["#C8FF57","#4D9EFF","#FF4D6A","#FFB830","#00E5C3","#A78BFA","#F97316","#EC4899","#84CC16","#14B8A6","#60A5FA","#4ADE80","#FB923C","#EF4444","#94A3B8","#CBD5E1"];
const DEFAULT={transactions:[],goals:[],budgets:{},usdRate:1350,displayCurrency:"ARS",riskProfile:null,onboardingDone:false,savedAnalyses:[],weeklyInsight:null,weeklyInsightDate:null,salaries:[],lastSalaryBase:0,holdings:[]};
const uid=()=>`${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

/* LIMPIADOR EXTREMO DE JSON PARA PREVENIR ALUCINACIONES DE LA IA */
const cleanJSON=r=>{if(!r)return"";let s=r.replace(/`{3}json|`{3}/gi,"").trim();const f=s.search(/[\{\[]/);const l=Math.max(s.lastIndexOf("}"),s.lastIndexOf("]"));return f!==-1&&l!==-1?s.slice(f,l+1):s;};

async function fetchUSDOficial(){try{const c=new AbortController();const tmr=setTimeout(()=>c.abort(),6000);const r=await fetch("https://dolarapi.com/v1/dolares/oficial",{signal:c.signal});clearTimeout(tmr);const d=await r.json();return Math.round((d.compra+d.venta)/2);}catch{try{const c2=new AbortController();const t2=setTimeout(()=>c2.abort(),6000);const r2=await fetch("https://api.bluelytics.com.ar/v2/latest",{signal:c2.signal});clearTimeout(t2);const d2=await r2.json();return Math.round(d2.oficial.value_avg);}catch{return null;}}}

const AI_URL=window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1"?"https://api.anthropic.com/v1/messages":"/api/ai";
async function ai(prompt,sys=""){try{const r=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5-20250929",max_tokens:1500,system:sys||"Respond with clean JSON only. No markdown fences.",messages:[{role:"user",content:prompt}]})});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();return(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"").replace(/`{3}json|`{3}/g,"").trim();}catch(e){console.error("AI error",e);return null;}}

async function aiVision(b64,rawMime,prompt){const VALID=["image/jpeg","image/png","image/gif","image/webp"];const mime=VALID.includes(rawMime)?rawMime:"image/png";try{const r=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5-20250929",max_tokens:1500,system:"Financial data extractor. Return ONLY valid JSON, no markdown.",messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:mime,data:b64}},{type:"text",text:prompt}]}]})});if(!r.ok){const e=await r.text();throw new Error(`HTTP ${r.status}: ${e}`);}const d=await r.json();return(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"").replace(/`{3}json|`{3}/g,"").trim();}catch(e){console.error("Vision error",e);return null;}}

async function extractFromImage(b64,mime){const raw=await aiVision(b64,mime,`Extract transactions from Argentine banking app screenshot. Return ONLY JSON: {"transactions":[{"date":"YYYY-MM-DD","description":"<merchant>","amount":<positive number>,"type":"income|expense","category":"<one of: ${CATS.join(", ")}>"}],"currency":"ARS|USD","appDetected":"<app or null>"} Rules: amounts always POSITIVE. income for deposits/credits/salary. expense for purchases. Use ${todayISO()} if date unclear. IMPORTANT: category MUST include the emoji prefix exactly as listed.`);if(!raw)return null;try{const parsed=JSON.parse(cleanJSON(raw));if(parsed.transactions){parsed.transactions=parsed.transactions.map(t=>({...t,category:matchCat(t.category)}));}return parsed;}catch{return null;}}

async function autoScanInvestments(profile,usdRate){const raw=await ai(`Argentine market. ${todayISO()}. Risk="${profile.risk}", horizon="${profile.horizon}". USD:${usdRate}. Find 3 investment opportunities. CONCISE. Return ONLY valid JSON: {"opportunities":[{"ticker":"","name":"","type":"CEDEAR|ARG_STOCK|ETF|BOND","signal":"STRONG BUY|BUY|HOLD","timeframe":"SHORT|LONG|BOTH","upside":0,"currentEstimate":0,"peRatio":null,"revenueGrowth":null,"moat":"one sentence","thesis":"two sentences max","risk":"low|medium|high","catalysts":["max 2"],"bearRisk":"one sentence","confidenceScore":0,"profileFit":0}],"marketContext":"one sentence","topPick":"","scanDate":"${todayISO()}"}`, "Argentine equity analyst. CONCISE responses. Valid JSON only.");if(!raw)throw new Error("Sin respuesta");return JSON.parse(cleanJSON(raw));}

async function analyzeStock(ticker,name){const raw=await ai(`Analyze ${name||ticker} (${ticker}) fundamentals ${todayISO()}. Return ONLY valid JSON: {"ticker":"${ticker}","company":"${name||ticker}","sector":"","signal":"STRONG BUY|BUY|HOLD|SELL|STRONG SELL","timeframe":"SHORT|LONG|BOTH","priceTarget12m":0,"currentEstimate":0,"upside":0,"peRatio":null,"revenueGrowth":null,"moat":"","bullCase":"","bearCase":"","catalysts":[""],"risks":[""],"summary":"","confidenceScore":0}`,"Senior equity analyst. Valid JSON only.");if(!raw)return null;try{return JSON.parse(cleanJSON(raw));}catch{return null;}}

async function compareInstruments(monthly,months,usdRate){const raw=await ai(`Compare 4 Argentine instruments: saving ${fARS(monthly)}/month for ${months} months. USD:${usdRate}. CONCISE. Return ONLY valid JSON: {"instruments":[{"name":"","type":"","annualReturn":0,"realReturn":0,"finalAmount":0,"finalUSD":0,"risk":"low","pros":"short","cons":"short"}],"recommendation":"one sentence","disclaimer":"Este análisis es educativo y no constituye asesoramiento financiero."} Include only: Plazo fijo, FCI T+0, S&P500 CEDEARs, Bonos CER.`,"Argentine advisor. CONCISE. Valid JSON only.");if(!raw)return null;try{return JSON.parse(cleanJSON(raw));}catch{return null;}}

async function autoCat(desc){const raw=await ai(`Transaction: "${desc}". Return ONLY: {"category":"<one of: ${CATS.join(", ")}>","type":"income|expense"} Rules: sueldo/salary/acreditacion→income type; netflix/spotify→🧛 Suscripciones; rappi/pedidosya→🍔 Comida y delivery; gym→💪 Deporte; coto/carrefour/dia→🛒 Supermercado; cuota/credito→💳 Cuotas. IMPORTANT: category MUST include the emoji prefix exactly as listed.`);if(!raw)return{category:"❓ Otros",type:"expense"};try{const p=JSON.parse(cleanJSON(raw));return{category:matchCat(p.category),type:p.type||"expense"};}catch{return{category:"❓ Otros",type:"expense"};}}

function parseCSV(txt){const lines=txt.trim().split("\n").filter(l=>l.trim());if(lines.length<2)return[];const sep=lines[0].includes(";")?";":lines[0].includes("\t")?"\t":",";const hdrs=lines[0].split(sep).map(h=>h.trim().replace(/"/g,"").toLowerCase());const out=[];for(let i=1;i<lines.length;i++){const cols=lines[i].split(sep).map(c=>c.trim().replace(/^"|"$/g,""));const obj={};hdrs.forEach((h,idx)=>obj[h]=cols[idx]||"");const dK=hdrs.find(h=>/^(fecha|date|dia)$/i.test(h)||/fecha|date/.test(h));const dscK=hdrs.find(h=>/desc|concepto|detalle|comer|estab|ref/.test(h));const debK=hdrs.find(h=>/debito|debe|debit|cargo|egreso/.test(h));const creK=hdrs.find(h=>/credito|haber|credit|abono/.test(h));const aK=hdrs.find(h=>/import|monto|amount|total/.test(h));let amount=0,type="expense";if(debK&&creK){const deb=px(obj[debK]),cre=px(obj[creK]);if(cre>0){amount=cre;type="income";}else if(deb>0){amount=deb;type="expense";}else continue;}else if(aK){const raw2=String(obj[aK]).trim();amount=Math.abs(px(obj[aK]));type=raw2.startsWith("-")||px(obj[aK])<0?"expense":"income";}else{const numVal=Object.values(obj).map(v=>px(v)).find(v=>v>0);if(!numVal)continue;amount=numVal;type="expense";}if(amount<=0)continue;out.push({id:`csv_${uid()}_${i}`,currency:"ARS",date:obj[dK]||getCUR()+"-01",description:obj[dscK]||`TX ${i}`,amount,type,category:"❓ Otros"});}return out;}

const getSalaryTotal=(salaries,month)=>{const m=month||getCUR();const s=salaries?.find(s=>s.month===m);return s?(s.base+(s.extras||[]).reduce((a,e)=>a+e.amt,0)):0;};

// 1. MOTOR MATEMÁTICO MAESTRO PARA TODA LA APP
const calcHoldingValueArs = (h, marketPrices = {}, usdRate = 1) => {
    let invArs = h.totalInvestedArs;
    if (!invArs) invArs = h.originalCurrency === "USD" ? (h.totalInvested||0) * usdRate : (h.totalInvested||0);
    let curArs = invArs;
    if (["accion", "cedear", "etf", "crypto"].includes(h.type)) {
        const mp = marketPrices[h.ticker];
        if (mp) {
            const priceArs = mp.currency === "USD" ? mp.price * usdRate : mp.price;
            curArs = (h.quantity || 0) * priceArs;
        } else {
            const fallbackPriceArs = h.originalCurrency === "USD" ? (h.originalBuyPrice || h.buyPrice || 0) * usdRate : (h.originalBuyPrice || h.buyPrice || 0);
            curArs = (h.quantity || 0) * fallbackPriceArs;
        }
    } else {
        const now = Date.now();
        const start = new Date(h.buyDate).getTime();
        const end = h.maturityDate ? new Date(h.maturityDate).getTime() : now;
        const calcDate = h.type === "plazo_fijo" ? Math.min(now, end) : now;
        const daysElapsed = Math.max(0, Math.floor((calcDate - start) / 864e5));
        if (h.type === "fci") {
            curArs = invArs * Math.pow(1 + ((h.rate||0) / 100 / 365), daysElapsed);
        } else {
            curArs = invArs * (1 + ((h.rate||0) / 100) * (daysElapsed / 365));
        }
    }
    return { invArs, curArs };
};

// 2. GOAL PLAN ACTUALIZADO (Usa el motor maestro)
const goalPlan=(goals,salaries,transactions,holdings=[], marketPrices={}, usdRate=1)=>{
    const CUR=getCUR();const NOW=getNow();const salary=getSalaryTotal(salaries);
    const spent=transactions.filter(t=>gMonth(t.date)===CUR&&t.type==="expense").reduce((s,t)=>s+t.amount,0);
    const disponible=Math.max(0,salary-spent);
    const portfolioValue=holdings.reduce((s,h)=>s+calcHoldingValueArs(h, marketPrices, usdRate).curArs,0);
    const active=goals.filter(g=>g.saved<g.target);
    return{disponible,portfolioValue,perGoal:active.map(g=>{
        const rem=g.target-g.saved;
        const couldUsePortfolio=portfolioValue>=rem*0.3;
        const days=g.deadline?Math.ceil((new Date(g.deadline)-NOW)/864e5):365;
        const months=Math.max(1,Math.ceil(days/30));
        const needed=rem/months;
        return{id:g.id,name:g.name,icon:g.icon,needed,months,rem,feasible:needed<=disponible/Math.max(active.length,1)*1.2,couldUsePortfolio,portfolioCover:portfolioValue>0?Math.min(100,Math.round(portfolioValue/rem*100)):0};
    })};
};
const healthScore=(txs,goals,holdings=[])=>{const CUR=getCUR();const c=txs.filter(t=>gMonth(t.date)===CUR);const inc=c.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);const sav=c.filter(t=>t.category==="💰 Ahorro").reduce((s,t)=>s+t.amount,0);const exp=c.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);const cuotas=c.filter(t=>t.category==="💳 Cuotas").reduce((s,t)=>s+t.amount,0);const hasPortfolio=holdings.length>0;const s1=Math.min(inc>0?clamp(sav/inc,0,1)*30:0,30);const s2=inc>0&&inc>exp?25:0;const s3=Math.max(0,25-(inc>0?clamp(cuotas/inc,0,1)*100:0));const s4Base=goals.some(g=>g.saved>0)?15:5;const s4=s4Base+(hasPortfolio?5:0);return{score:clamp(Math.round(s1+s2+s3+s4),0,100),items:[{l:"Tasa ahorro",v:s1,m:30},{l:"Balance +",v:s2,m:25},{l:"Sin cuotas",v:s3,m:25},{l:"Metas + inversiones",v:s4,m:20}]};};

const CSS=`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{background:#07080D;color:#F0F2F7;font-family:'Sora',sans-serif;overflow:hidden;height:100%}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#3A4255;border-radius:99px}input,select,textarea,button{font-family:inherit}button{cursor:pointer;border:none;background:none}.mono{font-family:'DM Mono',monospace}.up{animation:up .35s cubic-bezier(.16,1,.3,1) both}@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.d1{animation-delay:.05s}.d2{animation-delay:.1s}.d3{animation-delay:.15s}.d4{animation-delay:.2s}.nav{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;font-size:13px;font-weight:500;color:#3A4255;transition:all .18s;width:100%;text-align:left;position:relative}.nav:hover{color:#F0F2F7;background:#111520}.nav.on{color:#C8FF57;background:rgba(200,255,87,.07)}.nav.on::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:60%;background:#C8FF57;border-radius:0 2px 2px 0}.inp{background:#111520;border:1px solid #1C2030;border-radius:10px;padding:10px 13px;font-size:13px;color:#F0F2F7;outline:none;transition:border .15s;width:100%}.inp:focus{border-color:#7CB33A}.inp::placeholder{color:#3A4255}.btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;transition:all .15s;white-space:nowrap}.btn:disabled{opacity:.5;cursor:not-allowed}.bl{background:#C8FF57;color:#07080D}.bl:hover:not(:disabled){background:#A8E030;transform:translateY(-1px);box-shadow:0 4px 20px rgba(200,255,87,.3)}.bg{background:#111520;color:#8892A4;border:1px solid #1C2030}.bg:hover:not(:disabled){background:#1C2030;color:#F0F2F7}.bd{background:rgba(255,77,106,.08);color:#FF4D6A;border:1px solid rgba(255,77,106,.2)}.bd:hover:not(:disabled){background:rgba(255,77,106,.18)}.bsm{padding:6px 12px;font-size:12px;border-radius:8px}.card{background:#0C0E15;border:1px solid #1C2030;border-radius:16px;padding:20px}.csm{border-radius:12px;padding:14px}.tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600}.ti{background:rgba(0,229,195,.12);color:#00E5C3}.te{background:rgba(255,77,106,.12);color:#FF4D6A}.ts{background:rgba(77,158,255,.12);color:#4D9EFF}.prog{height:6px;border-radius:3px;background:#111520;overflow:hidden}.progf{height:100%;border-radius:3px;transition:width .7s cubic-bezier(.16,1,.3,1)}.ov{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}.modal{background:#0C0E15;border:1px solid #1C2030;border-radius:20px;padding:28px;width:520px;max-width:100%;max-height:92vh;overflow-y:auto}.tbl{width:100%;border-collapse:collapse}.tbl th{padding:9px 14px;font-size:10px;color:#3A4255;font-weight:600;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid #1C2030;text-align:left}.tbl td{padding:9px 14px;font-size:13px;border-bottom:1px solid #0E1117;vertical-align:middle}.tbl tr:hover td{background:#111520}.tbl tr:last-child td{border-bottom:none}.toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:500;z-index:999;animation:up .3s ease}.tok{background:rgba(0,229,195,.1);color:#00E5C3;border:1px solid rgba(0,229,195,.3)}.terr{background:rgba(255,77,106,.1);color:#FF4D6A;border:1px solid rgba(255,77,106,.3)}.tinfo{background:rgba(77,158,255,.1);color:#4D9EFF;border:1px solid rgba(77,158,255,.3)}.dots{display:inline-flex;gap:4px;align-items:center}.dots span{width:5px;height:5px;border-radius:50%;background:currentColor;animation:blink 1.2s infinite}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}.dz{border:2px dashed #1C2030;border-radius:14px;padding:36px 24px;text-align:center;transition:all .2s;cursor:pointer}.dz:hover,.dz.ov2{border-color:#C8FF57;background:rgba(200,255,87,.03)}.imgdrop{border:2px dashed #1C2030;border-radius:14px;min-height:180px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;cursor:pointer;transition:all .2s;overflow:hidden}.imgdrop:hover,.imgdrop.ov2{border-color:#A78BFA;background:rgba(167,139,250,.04)}.g2{display:grid;gap:10px;grid-template-columns:1fr 1fr}.g3{display:grid;gap:10px;grid-template-columns:1fr 1fr 1fr}.tabbar{display:flex;gap:3px;background:#111520;padding:4px;border-radius:11px;width:fit-content;flex-wrap:wrap}.tab{padding:7px 15px;border-radius:8px;font-size:12px;font-weight:600;transition:all .15s;color:#3A4255;cursor:pointer}.tab.on{background:#0C0E15;color:#F0F2F7;box-shadow:0 0 0 1px #1C2030}.chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:600;background:#111520;border:1px solid #1C2030;color:#8892A4}.sb{background:rgba(200,255,87,.15);color:#C8FF57;border:1px solid rgba(200,255,87,.3)}.buy{background:rgba(0,229,195,.12);color:#00E5C3;border:1px solid rgba(0,229,195,.25)}.hld{background:rgba(255,184,48,.12);color:#FFB830;border:1px solid rgba(255,184,48,.25)}.sel{background:rgba(255,77,106,.12);color:#FF4D6A;border:1px solid rgba(255,77,106,.25)}@media(max-width:768px){.hide-m{display:none!important}.modal{padding:18px;width:100%;border-radius:16px}.card{padding:14px}.kpi-grid{grid-template-columns:1fr 1fr!important}.trend-grid{grid-template-columns:1fr!important}.g2,.g3{grid-template-columns:1fr!important}.tbl td,.tbl th{padding:6px 8px;font-size:11px}.inv-grid{grid-template-columns:1fr!important}}@media(max-width:480px){.kpi-grid{grid-template-columns:1fr!important}}`;

const ic={Grid:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,Tx:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,Target:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,Chart:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,Import:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,Stock:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,Salary:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,Plus:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,X:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,Trash:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>,Refresh:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.5 16a9 9 0 11-2.3-8.7L23 10"/></svg>,Bell:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,Scan:()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4"/><line x1="3" y1="12" x2="21" y2="12"/></svg>,Bolt:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,Check:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,Menu:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>};

const Dots=()=><span className="dots"><span/><span/><span/></span>;
const PH=({title,sub,right})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:10}}><div><h1 style={{fontSize:24,fontWeight:800,color:T.white,letterSpacing:"-1px"}}>{title}</h1>{sub&&<div style={{fontSize:12,color:T.muted,marginTop:4}}>{sub}</div>}</div>{right}</div>);
const CTip=({active,payload,label,dc="ARS"})=>{if(!active||!payload?.length)return null;return <div style={{background:T.raised,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",fontSize:12}}><div style={{color:T.muted,marginBottom:5,fontSize:11}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,display:"flex",gap:12,justifyContent:"space-between"}}><span>{p.name}</span><span className="mono">{dc==="USD"?fUSD(p.value):fARS(p.value)}</span></div>)}</div>;};
function useDsp({displayCurrency,usdRate}){const fmt=useCallback(a=>displayCurrency==="USD"?fUSD(a/usdRate):fARS(a),[displayCurrency,usdRate]);const toDsp=useCallback(a=>displayCurrency==="USD"?a/usdRate:a,[displayCurrency,usdRate]);return{fmt,toDsp};}
const sigCls=s=>s==="STRONG BUY"?"sb":s==="BUY"?"buy":s==="HOLD"?"hld":"sel";
function useIsMobile(){const [m,setM]=useState(window.innerWidth<=768);useEffect(()=>{const h=()=>setM(window.innerWidth<=768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return m;}

export default function App(){
  const [state,setState]=useState(DEFAULT);
  const [view,setView]=useState("dashboard");
  const [ready,setReady]=useState(false);
  const [toast,setToast]=useState(null);
  const [usdLoading,setUL]=useState(false);
  const [sideOpen,setSO]=useState(false);
  const isMobile=useIsMobile();
  useEffect(()=>{hydrate().then(s=>{if(s)setState(p=>({...p,...s}));setReady(true);});},[]);
  useEffect(()=>{if(ready)persist(state);},[state,ready]);
  useEffect(()=>{if(!ready)return;setUL(true);fetchUSDOficial().then(r=>{if(r&&r>0)setState(p=>({...p,usdRate:r}));setUL(false);}).catch(()=>setUL(false));},[ready]);
  const notify=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),4000);};
  const update=useCallback(patch=>setState(s=>({...s,...patch})),[]);
  const navTo=useCallback(id=>{setView(id);setSO(false);},[]);
  if(!ready)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.muted,fontFamily:"Sora",fontSize:14,gap:10}}><Dots/>Cargando</div>;
  if(!state.onboardingDone)return <><style>{CSS}</style><Onboarding update={update} notify={notify}/></>;
  const pages={dashboard:<Dashboard state={state} update={update} notify={notify} setView={navTo}/>,transactions:<Transactions state={state} update={update} notify={notify}/>,goals:<Goals state={state} update={update} notify={notify}/>,salary:<SalaryModule state={state} update={update} notify={notify}/>,analytics:<Analytics state={state}/>,investments:<Investments state={state} update={update} notify={notify}/>,import:<Import state={state} update={update} notify={notify}/>};
  const nav=[{id:"dashboard",l:"Dashboard",I:ic.Grid},{id:"transactions",l:"Movimientos",I:ic.Tx},{id:"goals",l:"Metas",I:ic.Target},{id:"salary",l:"Sueldo",I:ic.Salary},{id:"analytics",l:"Analíticas",I:ic.Chart},{id:"investments",l:"Inversiones",I:ic.Stock},{id:"import",l:"Importar",I:ic.Import}];
  const CUR=getCUR();
  const alerts=Object.entries(state.budgets||{}).filter(([cat,lim])=>state.transactions.filter(t=>gMonth(t.date)===CUR&&t.category===cat&&t.type==="expense").reduce((s,t)=>s+t.amount,0)>lim*0.8);

  const sidebar=<aside style={{width:isMobile?"100%":212,background:T.surface,borderRight:isMobile?"none":`1px solid ${T.border}`,display:"flex",flexDirection:"column",padding:"20px 12px",gap:2,flexShrink:0,...(isMobile?{position:"fixed",top:0,left:0,bottom:0,zIndex:300,width:260,transform:sideOpen?"translateX(0)":"translateX(-100%)",transition:"transform .25s cubic-bezier(.16,1,.3,1)",boxShadow:sideOpen?"8px 0 30px rgba(0,0,0,.6)":"none"}:{})}}><div style={{padding:"4px 10px 20px",display:"flex",alignItems:"center",gap:9,justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:9}}><div style={{width:30,height:30,background:T.lime,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>💳</div><div style={{fontSize:14,fontWeight:700,letterSpacing:"-.4px"}}>FinanzasPro</div></div>{isMobile&&<button onClick={()=>setSO(false)} style={{color:T.muted,padding:4}}><ic.X/></button>}</div>{nav.map(({id,l,I})=>(<button key={id} className={`nav${view===id?" on":""}`} onClick={()=>navTo(id)}><I/>{l}{id==="investments"&&state.savedAnalyses?.length>0&&<span style={{marginLeft:"auto",fontSize:10,background:T.raised,padding:"2px 6px",borderRadius:99,color:T.muted}}>{state.savedAnalyses.length}</span>}</button>))}<div style={{flex:1}}/>{alerts.length>0&&<div onClick={()=>navTo("transactions")} style={{background:"rgba(255,184,48,.08)",border:`1px solid rgba(255,184,48,.2)`,borderRadius:10,padding:"9px 12px",cursor:"pointer",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.amber,fontWeight:600}}><ic.Bell/>{alerts.length} alerta{alerts.length>1?"s":""}</div></div>}<div style={{background:T.raised,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{fontSize:9,color:T.muted,textTransform:"uppercase",letterSpacing:".7px",fontWeight:600}}>USD Oficial</span>{usdLoading?<Dots/>:<button onClick={()=>{setUL(true);fetchUSDOficial().then(r=>{if(r>0)update({usdRate:r});setUL(false);}).catch(()=>setUL(false));}} style={{fontSize:10,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}><ic.Refresh/>Auto</button>}</div><input className="mono" style={{background:"transparent",border:"none",outline:"none",fontSize:18,fontWeight:600,color:T.lime,width:"100%"}} value={state.usdRate} onChange={e=>{const v=px(e.target.value);if(v>0)update({usdRate:v});}}/><div style={{display:"flex",gap:5,marginTop:8}}>{["ARS","USD"].map(c=>(<button key={c} onClick={()=>update({displayCurrency:c})} style={{flex:1,padding:"5px 0",borderRadius:6,fontSize:10,fontWeight:600,border:`1px solid ${state.displayCurrency===c?T.lime:T.border}`,background:state.displayCurrency===c?"rgba(200,255,87,.1)":T.surface,color:state.displayCurrency===c?T.lime:T.muted,cursor:"pointer"}}>{c}</button>))}</div></div></aside>;

  return(<div style={{display:"flex",height:"100vh",overflow:"hidden",background:T.bg}}><style>{CSS}</style>{isMobile?<>{sideOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:299}} onClick={()=>setSO(false)}/>}{sidebar}</>:sidebar}{isMobile&&<div style={{position:"fixed",top:0,left:0,right:0,height:52,background:T.surface,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 14px",gap:12,zIndex:100}}><button onClick={()=>setSO(true)} style={{color:T.white,padding:4}}><ic.Menu/></button><div style={{fontSize:14,fontWeight:700}}>FinanzasPro</div><div style={{flex:1}}/><div className="mono" style={{fontSize:11,color:T.lime}}>{state.displayCurrency==="USD"?fUSD(1):fARS(state.usdRate)}</div></div>}<main style={{flex:1,overflow:"auto",padding:isMobile?"66px 14px 20px":"28px 32px"}}>{pages[view]}</main>{toast&&<div className={`toast t${toast.type}`}>{toast.msg}</div>}</div>);
}

function Onboarding({update,notify}){
  const [step,setStep]=useState(0);
  const [d,setD]=useState({name:"",income:"",incomeCurrency:"ARS",goalName:"",goalAmt:"",goalDate:""});
  const [ans,setAns]=useState([null,null,null,null]);
  const STEPS=6;
  const pickAns=(qi,val)=>{const a=[...ans];a[qi]=val;setAns(a);};
  const score=ans.reduce((s,v)=>s+(v||0),0);
  const profile=score<=3?"conservador":score<=7?"moderado":"agresivo";
  const horizon=ans[3]===0?"3m":ans[3]===1?"3m":ans[3]===2?"1a":"3a";
  const profileData={conservador:{emoji:"🛡️",label:"Conservador",color:"#4D9EFF",desc:"Priorizás seguridad. Instrumentos recomendados: plazo fijo, FCI T+0, bonos CER.",pct:[70,25,5]},moderado:{emoji:"⚖️",label:"Moderado",color:"#FFB830",desc:"Buscás equilibrio entre riesgo y retorno. Mix de renta fija y variable.",pct:[40,35,25]},agresivo:{emoji:"🚀",label:"Agresivo",color:"#FF4D6A",desc:"Buscás máximo crecimiento. CEDEARs, acciones, ETFs con mayor volatilidad.",pct:[15,25,60]}};
  const pf=profileData[profile];
  const QS=[
    {title:"Experiencia",sub:"¿Cuánto sabés de inversiones?",icon:"📚",opts:[{l:"Nunca invertí",d:"Ni plazo fijo ni fondos",v:0},{l:"Plazo fijo o FCI",d:"Instrumentos básicos",v:1},{l:"Acciones, bonos o CEDEARs",d:"Mercado de capitales",v:2},{l:"Trading activo u opciones",d:"Operaciones avanzadas",v:3}]},
    {title:"Colchón financiero",sub:"¿Tenés un fondo de emergencia?",icon:"🏦",opts:[{l:"No, vivo al día",d:"Sin ahorro de respaldo",v:0},{l:"Algo, pero no llega a 3 meses",d:"Colchón parcial",v:1},{l:"Sí, 3 a 6 meses cubiertos",d:"Buen respaldo",v:2},{l:"Más de 6 meses",d:"Muy sólido",v:3}]},
    {title:"Tolerancia al riesgo",sub:"Si tu inversión baja 25% en un mes...",icon:"📉",opts:[{l:"Vendo todo inmediatamente",d:"No puedo tolerar pérdidas",v:0},{l:"Vendo una parte",d:"Bajo exposición",v:1},{l:"No toco nada, espero",d:"Confío en la recuperación",v:2},{l:"Compro más aprovechando",d:"Oportunidad en la caída",v:3}]},
    {title:"Horizonte temporal",sub:"¿Cuándo vas a necesitar la plata?",icon:"⏳",opts:[{l:"Menos de 6 meses",d:"Muy corto plazo",v:0},{l:"6 meses a 1 año",d:"Corto plazo",v:1},{l:"1 a 3 años",d:"Mediano plazo",v:2},{l:"Más de 3 años",d:"Largo plazo",v:3}]}
  ];
  const finish=()=>{const rawBase=px(d.income);const base=d.incomeCurrency==="USD"?rawBase*1350:rawBase;const CUR=getCUR();const patch={onboardingDone:true,riskProfile:{risk:profile,horizon,monthlyIncome:base,incomeCurrency:d.incomeCurrency,incomeRaw:rawBase,score,answers:ans},lastSalaryBase:base,salaries:base>0?[{month:CUR,base,extras:[]}]:[]};if(d.goalName&&d.goalAmt)patch.goals=[{id:`g_${uid()}`,name:d.goalName,target:px(d.goalAmt),saved:0,icon:"🎯",deadline:d.goalDate,createdAt:todayISO()}];update(patch);notify("¡Todo listo! 🎉");};
  const canNext=step===0?true:step>=1&&step<=4?ans[step-1]!==null:true;
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:T.bg,padding:16,overflow:"auto"}}><div style={{width:480,maxWidth:"100%",background:T.surface,borderRadius:24,border:`1px solid ${T.border}`,padding:"clamp(20px,5vw,40px)"}}><div style={{display:"flex",gap:4,marginBottom:28}}>{Array.from({length:STEPS}).map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:3,background:i<=step?T.lime:T.raised,transition:"background .3s"}}/>)}</div>
  {step===0&&<><div style={{fontSize:22,fontWeight:800,marginBottom:6,letterSpacing:"-.5px"}}>Bienvenido a FinanzasPro</div><div style={{fontSize:13,color:T.muted,marginBottom:24}}>Tomá el control de tu dinero</div><div style={{display:"flex",flexDirection:"column",gap:12}}><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Tu nombre (opcional)</label><input className="inp" placeholder="ej: Martín" value={d.name} onChange={e=>setD(p=>({...p,name:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Sueldo neto mensual</label><div style={{display:"flex",gap:8}}><input className="inp" style={{flex:1}} placeholder={d.incomeCurrency==="ARS"?"ej: 800000":"ej: 1200"} value={d.income} onChange={e=>setD(p=>({...p,income:e.target.value}))}/><div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`,flexShrink:0}}>{["ARS","USD"].map(c=><button key={c} onClick={()=>setD(p=>({...p,incomeCurrency:c}))} style={{padding:"8px 12px",fontSize:12,fontWeight:600,background:d.incomeCurrency===c?"rgba(200,255,87,.15)":T.raised,color:d.incomeCurrency===c?T.lime:T.muted,border:"none",cursor:"pointer",transition:"all .15s"}}>{c}</button>)}</div></div></div></div></>}
  {step>=1&&step<=4&&<><div style={{fontSize:28,marginBottom:6}}>{QS[step-1].icon}</div><div style={{fontSize:22,fontWeight:800,marginBottom:4,letterSpacing:"-.5px"}}>{QS[step-1].title}</div><div style={{fontSize:13,color:T.muted,marginBottom:20}}>{QS[step-1].sub}</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{QS[step-1].opts.map(o=><button key={o.v} onClick={()=>pickAns(step-1,o.v)} style={{display:"block",width:"100%",padding:"13px 16px",borderRadius:12,border:`1.5px solid ${ans[step-1]===o.v?T.lime:T.border}`,background:ans[step-1]===o.v?"rgba(200,255,87,.08)":T.raised,textAlign:"left",cursor:"pointer",transition:"all .15s"}}><div style={{fontSize:13,fontWeight:600,color:ans[step-1]===o.v?T.lime:T.white}}>{o.l}</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>{o.d}</div></button>)}</div></>}
  {step===5&&<><div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:48,marginBottom:8}}>{pf.emoji}</div><div style={{fontSize:24,fontWeight:800,letterSpacing:"-.5px",color:pf.color}}>{pf.label}</div><div style={{fontSize:13,color:T.muted,marginTop:6,lineHeight:1.6}}>{pf.desc}</div><div style={{display:"flex",justifyContent:"center",gap:6,marginTop:16}}>{[{l:"Renta fija",p:pf.pct[0],c:"#4D9EFF"},{l:"Mixto",p:pf.pct[1],c:"#FFB830"},{l:"Renta variable",p:pf.pct[2],c:"#FF4D6A"}].map(s=><div key={s.l} style={{background:T.raised,borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:80}}><div className="mono" style={{fontSize:18,fontWeight:700,color:s.c}}>{s.p}%</div><div style={{fontSize:10,color:T.muted,marginTop:3}}>{s.l}</div></div>)}</div><div className="mono" style={{fontSize:11,color:T.muted,marginTop:12}}>Score: {score}/12 · Horizonte: {horizon}</div></div><div style={{borderTop:`1px solid ${T.border}`,paddingTop:20}}><div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Primera meta <span style={{fontSize:12,color:T.muted,fontWeight:400}}>(opcional)</span></div><div className="g2" style={{marginTop:12}}><div style={{gridColumn:"1/-1"}}><input className="inp" placeholder="ej: Viaje a Europa" value={d.goalName} onChange={e=>setD(p=>({...p,goalName:e.target.value}))}/></div><input className="inp" placeholder="Monto ARS" value={d.goalAmt} onChange={e=>setD(p=>({...p,goalAmt:e.target.value}))}/><input type="date" className="inp" value={d.goalDate} onChange={e=>setD(p=>({...p,goalDate:e.target.value}))}/></div></div></>}
  <div style={{display:"flex",gap:10,marginTop:28}}>{step>0&&<button className="btn bg" style={{flex:.4,justifyContent:"center"}} onClick={()=>setStep(s=>s-1)}>← Atrás</button>}<button className="btn bl" style={{flex:1,justifyContent:"center"}} disabled={!canNext} onClick={step<5?()=>setStep(s=>s+1):finish}>{step===5?"Empezar →":"Continuar →"}</button></div>{step===5&&<button onClick={finish} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",color:T.muted,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Saltear meta</button>}</div></div>);
}

// 1. EL CEREBRO: Generador de Cards Inteligentes
async function genWeeklyInsight(transactions, usdRate, portfolioValueArs = 0, portfolioInvestedArs = 0, goals = []) {
  const now = Date.now();
  const w1 = transactions.filter(t => (now - new Date(t.date)) <= 7 * 864e5);
  const expenses = w1.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const pPnL = portfolioValueArs - portfolioInvestedArs;
  const goalSummary = goals.map(g => `${g.name} (Faltan: ${fARS(g.target - g.saved)})`).join(", ");

  const raw = await ai(`
    Analizá estos datos financieros: Gastos: ${fARS(expenses)}, Portfolio: ${fARS(portfolioValueArs)} (P&L: ${fARS(pPnL)}), Metas: ${goalSummary}.
    Generá un reporte motivador en JSON con 4 cards. Cruza inversiones con metas.
    Devolvé ÚNICAMENTE JSON: {"cards": [{"type":"METAS|GASTOS|INVERSIONES|CONSEJO", "icon":"emoji", "title":"título", "text":"descripción", "highlight":"dato", "color":"hex"}]}
  `, "Coach Financiero. Solo JSON.");
  
  try { return JSON.parse(cleanJSON(raw)); } catch { return null; }
}

// 2. EL DASHBOARD: Restaurado con Contexto de Salud
function Dashboard({state,update,notify,setView}){
  const {transactions,goals,salaries,marketPrices={},holdings=[],usdRate,weeklyInsight,weeklyInsightDate}=state;
  const {fmt,toDsp}=useDsp(state);
  const [loadingIns,setLI]=useState(false);
  const isMobile=useIsMobile();
  const NOW=getNow(); const CUR=getCUR();

  // Cálculos de Flujo
  const cur=transactions.filter(t=>gMonth(t.date)===CUR);
  const inc=cur.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const exp=cur.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const salary=getSalaryTotal(salaries);

  // Salud Financiera con Contexto
  const {score,items}=healthScore(transactions,goals,holdings);
  const sc=score>=70?T.lime:score>=45?T.amber:T.red;
  const healthDesc = score >= 70 ? "¡Excelente! Tu ahorro y diversificación son sólidos." : score >= 45 ? "Buen camino. Podrías mejorar tu tasa de ahorro." : "Atención: Tus gastos están superando tu capacidad de ahorro.";

  // Gráfico de Tendencia
  const trend=Array.from({length:6},(_,i)=>{
    const d=new Date(NOW.getFullYear(),NOW.getMonth()-5+i,1);
    const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const txs=transactions.filter(t=>gMonth(t.date)===m);
    return{name:MOS[d.getMonth()],Gastos:toDsp(txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)),Ingresos:toDsp(txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0))};
  });

  // Portfolio Real
  let portfolioValue=0; let portfolioInvested=0;
  holdings.forEach(h=>{ 
    const {invArs,curArs}=calcHoldingValueArs(h,marketPrices,usdRate); 
    portfolioInvested+=invArs; portfolioValue+=curArs; 
  });

  const kpis=[
    {l:"Sueldo",v:salary>0?fmt(salary):"-",c:T.lime,i:"💵"},
    {l:"Ingresos",v:fmt(inc),c:T.teal,i:"📥"},
    {l:"Gastos",v:fmt(exp),c:T.red,i:"💸"},
    {l:"Portfolio",v:fmt(portfolioValue),c:portfolioValue>=portfolioInvested?T.lime:T.red,i:"📊"}
  ];

  const refreshInsight = async () => {
    if (transactions.length < 3) return notify("Necesitás más transacciones", "info");
    setLI(true);
    const ins = await genWeeklyInsight(transactions, usdRate, portfolioValue, portfolioInvested, goals);
    if (ins) update({ weeklyInsight: ins, weeklyInsightDate: todayISO() });
    setLI(false);
  };

  return (
    <div className="up">
      <PH title="Dashboard" sub={NOW.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} />
      
      <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {kpis.map((k, i) => (
          <div key={i} className="card csm">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.muted }}>{k.l} <span>{k.i}</span></div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: k.c, marginTop: 5 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* IA CARDS */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800 }}>Análisis Semanal IA</h3>
          <button className="btn bg bsm" onClick={refreshInsight} disabled={loadingIns}>{loadingIns ? <Dots /> : <><ic.Bolt /> {weeklyInsight ? "Refrescar" : "Generar"}</>}</button>
        </div>
        {weeklyInsight?.cards ? (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            {weeklyInsight.cards.map((card, i) => (
              <div key={i} className="card up" style={{ padding: "18px", borderLeft: `5px solid ${card.color}`, background: `linear-gradient(135deg, ${T.surface}, ${T.bg} 80%)`, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span>{card.icon}</span><span style={{ fontSize: 10, fontWeight: 900, color: T.muted, textTransform: "uppercase" }}>{card.type}</span></div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{card.title}</div>
                <div style={{ fontSize: 12, color: T.mid, lineHeight: 1.6 }}>{card.text}</div>
                {card.highlight && <div style={{ marginTop: 10, padding: "5px 12px", background: `${card.color}15`, borderRadius: "8px", fontSize: 11, fontWeight: 800, color: card.color, alignSelf: "flex-start", border: `1px solid ${card.color}25` }}>{card.highlight}</div>}
              </div>
            ))}
          </div>
        ) : <div className="card" style={{ textAlign: "center", padding: "40px", borderStyle: "dashed", borderColor: T.border, color: T.muted }}>Generá tu reporte para ver el impacto de tus inversiones.</div>}
      </div>

      {/* TENDENCIA Y SALUD */}
      <div className="trend-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.8fr 0.8fr", gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: T.mid, marginBottom: 12 }}>Tendencia ({state.displayCurrency})</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trend}>
              <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} />
              <YAxis tick={{ fill: T.muted, fontSize: 9 }} axisLine={false} />
              <Tooltip content={<CTip dc={state.displayCurrency} />} />
              <Area type="monotone" dataKey="Ingresos" stroke={T.teal} fill={`${T.teal}15`} strokeWidth={2} />
              <Area type="monotone" dataKey="Gastos" stroke={T.red} fill={`${T.red}15`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Salud Financiera</div>
          <svg width={85} height={85} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke={T.raised} strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={sc} strokeWidth="8" strokeDasharray={`${(score / 100) * 251} 251`} strokeDashoffset="63" strokeLinecap="round" style={{ transition: "stroke-dasharray 1s" }} />
            <text x="50" y="48" textAnchor="middle" fill={sc} fontSize="24" fontWeight="700">{score}</text>
            <text x="50" y="62" textAnchor="middle" fill={T.muted} fontSize="8">PUNTOS</text>
          </svg>
          <div style={{ fontSize: 10, color: T.mid, marginTop: 12, lineHeight: 1.4 }}>{healthDesc}</div>
        </div>
      </div>
    </div>
  );
}
function SalaryModule({state,update,notify}){
  const {salaries=[],transactions}=state;
  const {fmt}=useDsp(state);
  const NOW=getNow();const CUR=getCUR();
  const [form,setForm]=useState({base:"",month:CUR});
  const [ef,setEF]=useState({desc:"",amt:""});
  const [addingE,setAE]=useState(null);
  const totalCur=getSalaryTotal(salaries);
  const curExp=transactions.filter(t=>gMonth(t.date)===CUR&&t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const disponible=Math.max(0,totalCur-curExp);
  const curSal=salaries.find(s=>s.month===form.month);
  const saveSalary=()=>{const base=Math.abs(px(form.base));if(!base)return notify("Ingresá un monto","err");const exists=salaries.find(s=>s.month===form.month);const updated=exists?salaries.map(s=>s.month===form.month?{...s,base}:s):[...salaries,{month:form.month,base,extras:[]}];const existingTx=transactions.find(t=>t.type==="income"&&gMonth(t.date)===form.month&&t.source==="salary");let txList=transactions;if(existingTx){txList=txList.map(t=>t.id===existingTx.id?{...t,amount:base,description:`Sueldo ${form.month}`}:t);}else{txList=[...txList,{id:`sal_${uid()}`,date:form.month+"-01",description:`Sueldo ${form.month}`,amount:base,type:"income",category:"❓ Otros",currency:"ARS",source:"salary"}];}update({salaries:updated,lastSalaryBase:base,transactions:txList});notify(curSal?"Sueldo actualizado ✓":"Sueldo registrado ✓");};
  const addExtra=(month)=>{const amt=Math.abs(px(ef.amt));if(!ef.desc||!amt)return notify("Completá descripción y monto","err");const updated=salaries.map(s=>s.month===month?{...s,extras:[...(s.extras||[]),{id:`e_${uid()}`,desc:ef.desc,amt}]}:s);const newTx={id:`ex_${uid()}`,date:month+"-15",description:ef.desc,amount:amt,type:"income",category:"❓ Otros",currency:"ARS",source:"extra"};update({salaries:updated,transactions:[...transactions,newTx]});setEF({desc:"",amt:""});setAE(null);notify("Ingreso extra agregado ✓");};
  const delExtra=(month,id)=>{update({salaries:salaries.map(s=>s.month===month?{...s,extras:(s.extras||[]).filter(e=>e.id!==id)}:s)});notify("Eliminado","err");};
  const hist=Array.from({length:6},(_,i)=>{const d=new Date(NOW.getFullYear(),NOW.getMonth()-5+i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});
  const pVal=(state.holdings||[]).reduce((s,h)=>s+(h.currentValue||h.totalInvested||0),0);
  return(<div className="up"><PH title="Sueldo e ingresos" sub="Registrá tu sueldo y agregá ingresos extra"/><div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:18}}>{[{l:"Sueldo base",v:fmt(salaries.find(s=>s.month===CUR)?.base||0),c:T.lime,i:"💵"},{l:"Ingresos extra",v:fmt((salaries.find(s=>s.month===CUR)?.extras||[]).reduce((s,e)=>s+e.amt,0)),c:T.blue,i:"💼"},{l:"Disponible libre",v:fmt(disponible),c:disponible>0?T.teal:T.red,i:"🆓"},{l:"Portfolio",v:fmt(pVal),c:T.blue,i:"📊"}].map((k,i)=>(<div key={i} className="card csm"><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",fontWeight:600}}>{k.l}</span><span style={{fontSize:18}}>{k.i}</span></div><div className="mono" title={k.v} style={{fontSize:20,fontWeight:500,color:k.c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.v}</div><div style={{fontSize:10,color:T.muted,marginTop:3}}>{CUR}</div></div>))}</div>
  <div className="card" style={{marginBottom:14}}><div style={{fontSize:13,fontWeight:700,marginBottom:14}}>📅 Registrar sueldo</div><div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}><div style={{flex:1,minWidth:130}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Mes</label><select className="inp" value={form.month} onChange={e=>setForm(f=>({...f,month:e.target.value}))}>{hist.map(m=><option key={m}>{m}</option>)}</select></div><div style={{flex:1,minWidth:150}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Sueldo neto (ARS)</label><input className="inp" placeholder={state.lastSalaryBase?String(state.lastSalaryBase):"800000"} value={form.base} onChange={e=>setForm(f=>({...f,base:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveSalary()}/></div><button className="btn bl" onClick={saveSalary}><ic.Refresh/>{curSal?"Actualizar":"Registrar"}</button></div>{state.lastSalaryBase>0&&!curSal&&<div style={{marginTop:10,fontSize:11,color:T.muted}}>💡 Último sueldo: <span className="mono" style={{color:T.mid}}>{fmt(state.lastSalaryBase)}</span></div>}</div>
  <div className="card" style={{padding:0,overflow:"auto"}}><div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,fontSize:13,fontWeight:700}}>Historial de ingresos</div><table className="tbl"><thead><tr><th>Mes</th><th>Sueldo base</th><th>Extras</th><th>Total</th><th></th></tr></thead><tbody>{hist.slice().reverse().map(m=>{const sal=salaries.find(s=>s.month===m);const base=sal?.base||0;const exT=(sal?.extras||[]).reduce((s,e)=>s+e.amt,0);return(<tr key={m}><td className="mono" style={{fontSize:12,color:T.muted}}>{m}</td><td className="mono" style={{color:base>0?T.white:T.muted}}>{base>0?fmt(base):"—"}</td><td>{(sal?.extras||[]).length===0?<span style={{color:T.muted,fontSize:12}}>—</span>:<div style={{display:"flex",flexDirection:"column",gap:3}}>{(sal?.extras||[]).map(e=>(<div key={e.id} style={{display:"flex",gap:8,alignItems:"center"}}><span className="mono" style={{fontSize:11,color:T.blue}}>+{fmt(e.amt)}</span><span style={{fontSize:11,color:T.muted}}>{e.desc}</span><button className="btn bd bsm" style={{padding:"2px 6px",fontSize:10}} onClick={()=>delExtra(m,e.id)}><ic.Trash/></button></div>))}</div>}</td><td className="mono" style={{fontWeight:600,color:base+exT>0?T.lime:T.muted}}>{base+exT>0?fmt(base+exT):"—"}</td><td>{addingE===m?<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><input className="inp" style={{width:130,fontSize:12,padding:"6px 10px"}} placeholder="Descripción" value={ef.desc} onChange={e=>setEF(f=>({...f,desc:e.target.value}))} autoFocus/><input className="inp" style={{width:100,fontSize:12,padding:"6px 10px"}} placeholder="Monto ARS" value={ef.amt} onChange={e=>setEF(f=>({...f,amt:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addExtra(m)}/><button className="btn bl bsm" onClick={()=>addExtra(m)}>+</button><button className="btn bg bsm" onClick={()=>{setAE(null);setEF({desc:"",amt:""});}}>✕</button></div>:<button className="btn bg bsm" onClick={()=>{setAE(m);if(!sal)setForm(f=>({...f,month:m}));}}><ic.Plus/> Extra</button>}</td></tr>);})}</tbody></table></div></div>);
}

function Transactions({state,update,notify}){
  const {transactions,budgets,usdRate}=state;
  const {fmt}=useDsp(state);
  const CUR=getCUR();
  const [showAdd,setSA]=useState(false);
  const [editTx,setETx]=useState(null);
  const [showBud,setSB]=useState(false);
  const [filter,setFilter]=useState({month:"",type:"",cat:""});
  const [form,setForm]=useState({date:todayISO(),description:"",amount:"",type:"expense",category:"❓ Otros",currency:"ARS"});
  const [editCat,setEC]=useState(null);
  const [bf,setBF]=useState({category:CATS[0],limit:""});
  const rows=useMemo(()=>transactions.filter(t=>{if(filter.month&&gMonth(t.date)!==filter.month)return false;if(filter.type&&t.type!==filter.type)return false;if(filter.cat&&t.category!==filter.cat)return false;return true;}).sort((a,b)=>new Date(b.date)-new Date(a.date)),[transactions,filter]);
  const cur=transactions.filter(t=>gMonth(t.date)===CUR);
  const months=[...new Set(transactions.map(t=>gMonth(t.date)))].sort().reverse();
  const saveTx=()=>{
    if(!form.description||!form.amount)return notify("Completá descripción y monto","err");
    const ars=Math.abs(px(form.amount))*(form.currency==="USD"?usdRate:1);
    if(ars<=0)return notify("Monto inválido","err");
    if(editTx){
      update({transactions:transactions.map(t=>t.id===editTx?{...t,...form,amount:ars}:t)});
      setETx(null);notify("Movimiento actualizado ✓");
    }else{
      update({transactions:[...transactions,{...form,id:`m_${uid()}`,amount:ars,source:"manual"}]});
      notify("Movimiento agregado ✓");
    }
    setForm({date:todayISO(),description:"",amount:"",type:"expense",category:"❓ Otros",currency:"ARS"});
    setSA(false);
  };
  return(<div className="up"><PH title="Movimientos" sub={`${rows.length} registros`} right={<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn bg" onClick={()=>setSB(true)}><ic.Bell/> Presupuestos</button><button className="btn bl" onClick={()=>{setETx(null);setForm({date:todayISO(),description:"",amount:"",type:"expense",category:"❓ Otros",currency:"ARS"});setSA(true);}}><ic.Plus/> Nuevo</button></div>}/>
  {Object.keys(budgets||{}).length>0&&(<div style={{display:"flex",gap:10,marginBottom:14,overflowX:"auto",paddingBottom:4}}>{Object.entries(budgets).map(([cat,lim])=>{const spent=cur.filter(t=>t.category===cat&&t.type==="expense").reduce((s,t)=>s+t.amount,0);const pct=clamp(spent/lim*100,0,200);return<div key={cat} style={{background:T.raised,border:`1px solid ${pct>=100?T.red:pct>=80?T.amber:T.border}`,borderRadius:10,padding:"10px 14px",minWidth:150,flexShrink:0}}><div style={{fontSize:10,color:T.muted,marginBottom:4}}>{cat}</div><div className="mono" style={{fontSize:13,color:pct>=100?T.red:pct>=80?T.amber:T.white}}>{fmt(spent)}/{fmt(lim)}</div><div className="prog" style={{marginTop:6}}><div className="progf" style={{width:`${clamp(pct,0,100)}%`,background:pct>=100?T.red:pct>=80?T.amber:T.teal}}/></div></div>;})} </div>)}
  <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}><select className="inp" style={{width:"auto",minWidth:100}} value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))}><option value="">Todos los meses</option>{months.map(m=><option key={m}>{m}</option>)}</select><select className="inp" style={{width:"auto"}} value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))}><option value="">Todos</option><option value="expense">Gastos</option><option value="income">Ingresos</option></select><select className="inp" style={{width:"auto",minWidth:100}} value={filter.cat} onChange={e=>setFilter(f=>({...f,cat:e.target.value}))}><option value="">Categorías</option>{CATS.map(c=><option key={c}>{c}</option>)}</select>{(filter.month||filter.type||filter.cat)&&<button className="btn bg bsm" onClick={()=>setFilter({month:"",type:"",cat:""})}>Limpiar</button>}</div>
  <div className="card" style={{padding:0,overflow:"auto"}}><table className="tbl"><thead><tr><th className="hide-m">Fecha</th><th>Descripción</th><th>Categoría</th><th className="hide-m">Tipo</th><th>Monto</th><th></th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={6} style={{textAlign:"center",padding:"36px 0",color:T.muted,fontSize:13}}>Sin movimientos</td></tr>:rows.map(t=>(<tr key={t.id}><td className="mono hide-m" style={{color:T.muted,fontSize:11}}>{t.date}</td><td style={{maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td><td><button onClick={()=>setEC({id:t.id,cat:t.category})} style={{background:T.raised,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",fontSize:11,color:T.mid,cursor:"pointer"}}>{t.category}</button></td><td className="hide-m"><span className={`tag ${t.type==="income"?"ti":t.category==="💰 Ahorro"?"ts":"te"}`}>{t.type==="income"?"Ingreso":t.category==="💰 Ahorro"?"Ahorro":"Gasto"}</span></td><td className="mono" style={{color:t.type==="income"?T.teal:T.red,fontWeight:500}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</td><td style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button className="btn bg bsm" style={{padding:"4px 8px"}} onClick={()=>{setForm({date:t.date,description:t.description,amount:t.amount,type:t.type,category:t.category,currency:"ARS"});setETx(t.id);setSA(true);}}>✎</button><button className="btn bd bsm" style={{padding:"4px 8px"}} onClick={()=>{update({transactions:transactions.filter(x=>x.id!==t.id)});notify("Eliminado","err");}}><ic.Trash/></button></td></tr>))}</tbody></table></div>
  {showAdd&&<div className="ov" onClick={e=>{if(e.target===e.currentTarget){setSA(false);setETx(null);}}}><div className="modal"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{fontSize:18,fontWeight:700}}>{editTx?"Editar movimiento":"Nuevo movimiento"}</h2><button className="btn bg bsm" onClick={()=>{setSA(false);setETx(null);}}><ic.X/></button></div><div style={{display:"flex",flexDirection:"column",gap:12}}><div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha</label><input type="date" className="inp" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Tipo</label><select className="inp" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="expense">💸 Gasto</option><option value="income">💵 Ingreso</option></select></div></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Descripción</label><input className="inp" placeholder="ej: Supermercado Coto" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div><div className="g3"><div style={{gridColumn:"1/3"}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Monto (positivo siempre)</label><input className="inp" placeholder="15000" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Moneda</label><select className="inp" value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}><option>ARS</option><option>USD</option></select></div></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Categoría</label><select className="inp" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>{form.currency==="USD"&&px(form.amount)>0&&<div style={{background:"rgba(77,158,255,.08)",border:`1px solid rgba(77,158,255,.2)`,borderRadius:8,padding:"8px 12px",fontSize:11,color:T.blue}}>💡 = {fARS(Math.abs(px(form.amount))*usdRate)} ARS al tipo oficial ${usdRate}</div>}<div style={{background:form.type==="income"?"rgba(0,229,195,.06)":"rgba(255,77,106,.06)",border:`1px solid ${form.type==="income"?"rgba(0,229,195,.2)":"rgba(255,77,106,.2)"}`,borderRadius:8,padding:"8px 12px",fontSize:11,color:form.type==="income"?T.teal:T.red}}>{form.type==="income"?"✓ Se registrará como INGRESO (+)":"✓ Se registrará como GASTO (-)"}</div><button className="btn bl" style={{justifyContent:"center"}} onClick={saveTx}>{editTx?"Guardar cambios":"Agregar"}</button></div></div></div>}
  {editCat&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setEC(null)}><div className="modal" style={{width:320}}><h2 style={{fontSize:16,fontWeight:700,marginBottom:14}}>Cambiar categoría</h2><select className="inp" style={{marginBottom:14}} value={editCat.cat} onChange={e=>setEC(c=>({...c,cat:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select><div style={{display:"flex",gap:8}}><button className="btn bl" style={{flex:1,justifyContent:"center"}} onClick={()=>{update({transactions:transactions.map(t=>t.id===editCat.id?{...t,category:editCat.cat}:t)});setEC(null);notify("Guardado ✓");}}>Guardar</button><button className="btn bg" onClick={()=>setEC(null)}>Cancelar</button></div></div></div>}
  {showBud&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setSB(false)}><div className="modal"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontSize:18,fontWeight:700}}>Presupuestos</h2><button className="btn bg bsm" onClick={()=>setSB(false)}><ic.X/></button></div><div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><select className="inp" style={{flex:1.5,minWidth:120}} value={bf.category} onChange={e=>setBF(f=>({...f,category:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select><input className="inp" style={{flex:1,minWidth:100}} placeholder="Límite ARS" value={bf.limit} onChange={e=>setBF(f=>({...f,limit:e.target.value}))}/><button className="btn bl" onClick={()=>{if(!bf.limit)return;update({budgets:{...budgets,[bf.category]:px(bf.limit)}});setSB(false);notify("Guardado ✓");}}><ic.Plus/></button></div>{Object.entries(budgets||{}).map(([cat,lim])=>(<div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.raised,borderRadius:10,padding:"10px 14px",marginBottom:7,flexWrap:"wrap",gap:6}}><span style={{fontSize:13}}>{cat}</span><div style={{display:"flex",alignItems:"center",gap:10}}><span className="mono" style={{fontSize:12,color:T.mid}}>{fmt(lim)}/mes</span><button className="btn bd bsm" onClick={()=>{const b={...budgets};delete b[cat];update({budgets:b});}}>✕</button></div></div>))}</div></div>}</div>);
}

function Goals({state,update,notify}){
  const {goals,transactions,usdRate,salaries,holdings=[],marketPrices={}}=state;
  const {fmt}=useDsp(state);
  const NOW=getNow();
  const [sf,setSF]=useState(false);
  const [addTo,setAT]=useState(null);
  const [addAmt,setAA]=useState("");
  const [addCur,setAC]=useState("ARS");
  const [form,setForm]=useState({name:"",target:"",currency:"ARS",saved:"",icon:"🎯",deadline:""});
  const ICONS=["🎯","✈️","🚗","🏠","💻","📱","💍","🎓","🏖️","💰","🏋️","🎸","🛵","🌎","👶","🏡"];
  const {disponible,perGoal}=goalPlan(goals,salaries,transactions,holdings,marketPrices,usdRate);

  const addG=()=>{if(!form.name||!form.target)return notify("Nombre y monto requeridos","err");const t=Math.abs(px(form.target))*(form.currency==="USD"?usdRate:1);update({goals:[...goals,{id:`g_${uid()}`,name:form.name,target:t,saved:Math.abs(px(form.saved))||0,icon:form.icon,deadline:form.deadline,createdAt:todayISO()}]});setForm({name:"",target:"",currency:"ARS",saved:"",icon:"🎯",deadline:""});setSF(false);notify("Meta creada ✓");};
  const addSav=g=>{const a=Math.abs(px(addAmt))*(addCur==="USD"?usdRate:1);if(!a)return notify("Ingresá un monto","err");update({goals:goals.map(gl=>gl.id===g.id?{...gl,saved:gl.saved+a}:gl),transactions:[...transactions,{id:`s_${uid()}`,date:todayISO(),description:`Ahorro: ${g.name}`,amount:a,type:"expense",category:"💰 Ahorro",currency:"ARS",source:"manual"}]});setAT(null);setAA("");setAC("ARS");notify(`+${fmt(a)} sumado ✓`);};
  const liquidar=(g,linkedHoldings,investedValue)=>{if(!window.confirm(`¿Liquidar "${g.name}"? Se venderán las inversiones vinculadas y se registrará el gasto.`)) return;const newTxs=[...transactions];if(investedValue>0) newTxs.push({id:`liq_i_${uid()}`,date:todayISO(),description:`Venta activos por meta: ${g.name}`,amount:investedValue,type:"income",category:"💰 Ahorro",currency:"ARS"});newTxs.push({id:`liq_e_${uid()}`,date:todayISO(),description:`Meta cumplida: ${g.name}`,amount:g.target,type:"expense",category:"🎬 Ocio",currency:"ARS"});const holdingIds=linkedHoldings.map(h=>h.id);const newHoldings=holdings.filter(h=>!holdingIds.includes(h.id));const newGoals=goals.map(x=>x.id===g.id?{...x,saved:x.target}:x);update({transactions:newTxs,holdings:newHoldings,goals:newGoals});notify(`¡Meta "${g.name}" alcanzada! 🎉`);};

  return(<div className="up"><PH title="Metas" sub={`${goals.filter(g=>g.saved<g.target).length} activas`} right={<button className="btn bl" onClick={()=>setSF(true)}><ic.Plus/> Nueva meta</button>}/>
  {disponible>0&&perGoal.length>0&&(<div className="card" style={{marginBottom:16,borderColor:"rgba(200,255,87,.18)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:10}}>💡 Plan de ahorro recomendado</div><div style={{fontSize:12,color:T.mid,marginBottom:12}}>Tenés <span className="mono" style={{color:T.lime}}>{fmt(disponible)}</span> disponibles este mes. Distribución sugerida:</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10}}>{perGoal.map(g=>(<div key={g.id} style={{background:T.raised,borderRadius:10,padding:"12px 14px",border:`1px solid ${g.feasible?T.border:"rgba(255,184,48,.3)"}`}}><div style={{fontSize:12,marginBottom:6}}>{g.icon} {g.name}</div><div className="mono" style={{fontSize:18,fontWeight:600,color:g.feasible?T.lime:T.amber}}>{fmt(g.needed)}<span style={{fontSize:11,fontWeight:400,color:T.muted}}>/mes</span></div><div style={{fontSize:10,color:T.muted,marginTop:3}}>{g.months} mes{g.months>1?"es":""} · Falta {fmt(g.rem)}</div>{!g.feasible&&<div style={{fontSize:10,color:T.amber,marginTop:4}}>⚠ Ajustá el plazo o el monto</div>}</div>))}</div></div>)}
  {goals.length===0?<div className="card" style={{textAlign:"center",padding:"64px 32px"}}><div style={{fontSize:52,marginBottom:14}}>🎯</div><div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Sin metas todavía</div><div style={{fontSize:13,color:T.muted,marginBottom:20}}>Creá una meta y empezá a trackear tu progreso</div><button className="btn bl" onClick={()=>setSF(true)}><ic.Plus/> Crear meta</button></div>:
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>{goals.map(g=>{
    const linkedHoldings = holdings.filter(h => h.goalId === g.id);
    const investedValue = linkedHoldings.reduce((s, h) => s + calcHoldingValueArs(h, marketPrices, usdRate).curArs, 0);
    const realSaved = g.saved + investedValue;
    const pct=clamp((realSaved/g.target)*100,0,100);
    const rem=g.target-realSaved;
    const days=g.deadline?Math.ceil((new Date(g.deadline)-NOW)/864e5):null;const months=days&&days>0?Math.ceil(days/30):null;const needed=months?rem/months:null;const pc=pct>=100?T.lime:pct>=60?T.blue:T.amber;
    return<div key={g.id} className="card up"><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}><div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:28}}>{g.icon}</span><div><div style={{fontSize:14,fontWeight:700}}>{g.name}</div>{g.deadline&&<div style={{fontSize:10,color:T.muted,marginTop:2}}>📅 {g.deadline}{days!==null&&` · ${days>0?days+"d":"¡Hoy!"}`}</div>}</div></div><button className="btn bd bsm" onClick={()=>{update({goals:goals.filter(x=>x.id!==g.id)});notify("Eliminado","err");}}><ic.Trash/></button></div><div className="g2" style={{marginBottom:12}}><div style={{background:T.raised,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:10,color:T.muted,marginBottom:3}}>Ahorrado {investedValue > 0 ? "+ Inv." : ""}</div><div className="mono" style={{fontSize:15,color:pc}}>{fmt(realSaved)}</div></div><div style={{background:T.raised,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:10,color:T.muted,marginBottom:3}}>Objetivo</div><div className="mono" style={{fontSize:15}}>{fmt(g.target)}</div></div></div><div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:11,color:T.muted}}>Progreso</span><span className="mono" style={{fontSize:11,color:pc,fontWeight:600}}>{pct.toFixed(1)}%</span></div><div className="prog" style={{height:8}}><div className="progf" style={{width:`${pct}%`,background:pct>=100?`linear-gradient(90deg,${T.lime},${T.teal})`:pct>=60?T.blue:T.amber}}/></div></div>{needed&&needed>0&&<div style={{background:"rgba(77,158,255,.07)",border:`1px solid rgba(77,158,255,.15)`,borderRadius:8,padding:"8px 10px",fontSize:11,color:T.blue,marginBottom:12}}>💡 Guardá <span className="mono">{fmt(needed)}</span>/mes para llegar en {months} mes{months>1?"es":""}</div>}{pct>=100 ? <div style={{display:"flex", gap:8}}><div style={{flex:1, background:"rgba(200,255,87,.08)",border:`1px solid rgba(200,255,87,.25)`,borderRadius:10,padding:10,textAlign:"center",fontSize:13,color:T.lime,fontWeight:600}}>🎉 Alcanzada</div>{g.saved < g.target && <button className="btn bl" onClick={() => liquidar(g, linkedHoldings, investedValue)}>Liquidar</button>}</div>:addTo===g.id?<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input className="inp" style={{flex:1,fontSize:12,minWidth:80}} placeholder="Monto" value={addAmt} onChange={e=>setAA(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&addSav(g)}/><select className="inp" style={{width:70,fontSize:12,padding:"10px 6px"}} value={addCur} onChange={e=>setAC(e.target.value)}><option>ARS</option><option>USD</option></select><button className="btn bl bsm" onClick={()=>addSav(g)}>+</button><button className="btn bg bsm" onClick={()=>{setAT(null);setAA("");}}>✕</button></div>:<button className="btn bg" style={{width:"100%",justifyContent:"center"}} onClick={()=>setAT(g.id)}><ic.Plus/> Agregar ahorro</button>}</div>;})}
  </div>}
  {sf&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setSF(false)}><div className="modal"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{fontSize:18,fontWeight:700}}>Nueva meta</h2><button className="btn bg bsm" onClick={()=>setSF(false)}><ic.X/></button></div><div style={{display:"flex",flexDirection:"column",gap:12}}><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:7}}>Ícono</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{ICONS.map(ic2=><button key={ic2} onClick={()=>setForm(f=>({...f,icon:ic2}))} style={{width:36,height:36,fontSize:18,borderRadius:8,border:`1.5px solid ${form.icon===ic2?T.lime:T.border}`,background:form.icon===ic2?"rgba(200,255,87,.1)":T.raised,cursor:"pointer"}}>{ic2}</button>)}</div></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Nombre</label><input className="inp" placeholder="ej: Viaje a Europa" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div><div className="g3"><div style={{gridColumn:"1/3"}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Monto objetivo</label><input className="inp" placeholder="500000" value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Moneda</label><select className="inp" value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}><option>ARS</option><option>USD</option></select></div></div><div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Ya tengo</label><input className="inp" placeholder="0" value={form.saved} onChange={e=>setForm(f=>({...f,saved:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha límite</label><input type="date" className="inp" value={form.deadline} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))}/></div></div><button className="btn bl" style={{justifyContent:"center"}} onClick={addG}>Crear meta</button></div></div></div>}</div>);
}

function Investments({state,update,notify}){
  const {savedAnalyses=[],riskProfile,goals=[],usdRate,displayCurrency}=state;
  const {fmt}=useDsp(state);
  const [tab,setTab]=useState("portfolio");
  const [hFilter,setHFilter]=useState("all");
  const [scanning,setScan]=useState(false);
  const [scanResult,setSR]=useState(null);
  const [scanErr,setSE]=useState(null);
  const [ticker,setTicker]=useState("");
  const [tname,setTname]=useState("");
  const [loading,setLoad]=useState(false);
  const [loadErr,setLE]=useState(null);
  const [sel,setSel]=useState(null);
  const [justSaved,setJS]=useState(null);
  const [showHForm,setSHF]=useState(false);
  const [hForm,setHF]=useState({type:"accion",ticker:"",name:"",quantity:"",buyPrice:"",totalInvested:"",currency:"ARS",buyDate:todayISO(),maturityDate:"",rate:"", goalId:""});
  
  const [comparing,setComp]=useState(false);
  const [compResult,setCompResult]=useState(null);
  const [cf,setCF]=useState({monthly:"200000",months:"12"});
  const rc={none:T.teal,low:T.lime,very_low:T.teal,medium:T.amber,medium_high:T.amber,high:T.red};

  const [refreshingId,setRI]=useState(null);
  
  const holdings=state.holdings||[];
  const marketPrices=state.marketPrices||{};
  const filteredHoldings=hFilter==="all"?holdings:holdings.filter(h=>h.type===hFilter);

  const BANCOS_RATES = [
    { id: "GALICIA", name: "Banco Galicia", tna: 36 },
    { id: "NACION", name: "Banco Nación", tna: 37 },
    { id: "PROVINCIA", name: "Banco Provincia", tna: 35 },
    { id: "SANTANDER", name: "Santander", tna: 33 },
    { id: "BBVA", name: "BBVA Francés", tna: 35 },
    { id: "MACRO", name: "Banco Macro", tna: 36 },
    { id: "MERCADOPAGO", name: "Mercado Pago (FCI)", tna: 38 },
    { id: "UALA", name: "Ualá", tna: 40 },
    { id: "NARANJAX", name: "Naranja X", tna: 42 },
    { id: "OTRO", name: "Otro / Personalizado", tna: "" }
  ];
  
// ==========================================
  // MOTOR MATEMÁTICO EN INVESTMENTS (100% Pesos)
  // ==========================================
  const portfolioData = useMemo(() => {
    let gInvArs = 0, gCurArs = 0;
    const items = holdings.map(h => {
      const { invArs, curArs } = calcHoldingValueArs(h, marketPrices, usdRate);
      
      gInvArs += invArs;
      gCurArs += curArs;
      
      const pnlArs = curArs - invArs;
      const pnlPct = invArs ? (pnlArs / invArs) * 100 : 0;
      
      return { ...h, invArs, curArs, pnlArs, pnlPct };
    });
    return { items, gInvArs, gCurArs, gPnlArs: gCurArs - gInvArs };
  }, [holdings, marketPrices, usdRate]);

  // ==========================================
  // ACTUALIZACIÓN GLOBAL (Solo Cryptos automáticas)
  // ==========================================
  const refreshPortfolio = async () => {
    setRI("all");
    notify("Sincronizando mercado...", "info");
    let newPrices = { ...marketPrices };
    let updated = 0;

    const cryptos = holdings.filter(x => x.type === "crypto");
    
    for (const h of cryptos) {
        try {
            const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${h.ticker.toUpperCase()}USDT`);
            if(r.ok) {
                const d = await r.json();
                newPrices[h.ticker] = { price: parseFloat(d.price), currency: "USD" };
                updated++;
            }
        } catch(e) {}
    }
    
    update({ marketPrices: newPrices });
    setRI(null);
    notify(`Mercado actualizado (${updated} cryptos) ✓`);
  };

  // ==========================================
  // ACTUALIZACIÓN INDIVIDUAL ("✎ Precio")
  // ==========================================
  const refreshSingle = async (h) => {
    setRI(h.id);
    let newPrices = { ...marketPrices };

    if (h.type === "crypto") {
      try {
          const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${h.ticker.toUpperCase()}USDT`);
          if(r.ok) {
              const d = await r.json();
              newPrices[h.ticker] = { price: parseFloat(d.price), currency: "USD" };
              update({ marketPrices: newPrices });
              notify(`Cotización Binance actualizada ✓`);
          } else throw new Error();
      } catch {
          notify(`Error al obtener Binance para ${h.ticker}`, "err");
      }
    } else if (["accion", "cedear", "etf"].includes(h.type)) {
      const currentPrice = marketPrices[h.ticker]?.price || h.originalBuyPrice || h.buyPrice;
      const p = window.prompt(`Ingresá el precio actual de 1 unidad de ${h.ticker} en ${h.originalCurrency||"ARS"}:`, currentPrice);
      if(p && !isNaN(px(p)) && px(p) > 0) {
          newPrices[h.ticker] = { price: px(p), currency: h.originalCurrency || "ARS" };
          update({ marketPrices: newPrices });
          notify(`Precio de ${h.ticker} guardado ✓`);
      }
    } else {
      notify(`Rendimiento calculado a hoy ✓`); 
    }
    setRI(null);
  };
  
  const addHolding=()=>{
    const isVar = ["accion", "cedear", "etf", "crypto"].includes(hForm.type);
    const isFix = ["plazo_fijo", "fci", "bono"].includes(hForm.type);
    if(isVar && (!hForm.ticker || !hForm.quantity || !hForm.buyPrice)) return notify("Ticker, cantidad y precio son obligatorios", "err");
    if(isFix && (!hForm.name || !hForm.totalInvested || !hForm.rate || !hForm.buyDate)) return notify("Entidad, capital, TNA y fecha son obligatorios", "err");
    
    let rawBuyPrice = px(hForm.buyPrice);
    let qty = px(hForm.quantity);
    let rawInv = px(hForm.totalInvested);

    const rateToUse = hForm.currency === "USD" ? usdRate : 1;
    let invArs = rawInv * rateToUse;
    if(isVar && !invArs) invArs = qty * (rawBuyPrice * rateToUse);

    const h={
        id:`h_${uid()}`, 
        type: hForm.type,
        ticker: isFix ? hForm.name : hForm.ticker.toUpperCase(), 
        name: hForm.name,
        quantity: qty, 
        originalBuyPrice: rawBuyPrice,
        originalCurrency: hForm.currency,
        totalInvestedArs: invArs, 
        rate: px(hForm.rate), 
        buyDate: hForm.buyDate,
        maturityDate: hForm.maturityDate,
        goalId: hForm.goalId || null
    };
    
    update({holdings:[...holdings,h]});
    setSHF(false);
    setHF({type:"accion",ticker:"",name:"",quantity:"",buyPrice:"",totalInvested:"",currency:"ARS",buyDate:todayISO(),maturityDate:"",rate:"", goalId:""});
    notify("Inversión guardada ✓");
  };
  
  const delHolding=id=>update({holdings:holdings.filter(h=>h.id!==id)});
  
  const PRESETS=[{t:"BTC",n:"Bitcoin"},{t:"ETH",n:"Ethereum"},{t:"AAPL",n:"Apple"},{t:"NVDA",n:"NVIDIA"},{t:"MELI",n:"MercadoLibre"},{t:"VIST",n:"Vista Oil"},{t:"YPF",n:"YPF SA"},{t:"SPY",n:"S&P 500 ETF"}];
  const runScanner=async()=>{if(!riskProfile)return notify("Configurá tu perfil en el onboarding","info");setScan(true);setSE(null);try{const r=await autoScanInvestments(riskProfile,usdRate);setSR(r);notify(`${r.opportunities?.length||0} oportunidades ✓`);}catch(e){setSE("Error de conexión con IA");}setScan(false);};
  const analyze=async(t,n)=>{const ex=savedAnalyses.find(a=>a.ticker===t);if(ex){setSel(ex);return;}setLoad(true);setLE(null);const r=await analyzeStock(t,n||t);if(r){update({savedAnalyses:[r,...savedAnalyses.filter(a=>a.ticker!==r.ticker)]});setSel(r);}else{setLE(`Error al analizar ${t}`);}setLoad(false);};
  const saveFromScan=opp=>{const a={ticker:opp.ticker,company:opp.name,sector:"",signal:opp.signal,timeframe:opp.timeframe,upside:opp.upside,currentEstimate:opp.currentEstimate,peRatio:opp.peRatio,revenueGrowth:opp.revenueGrowth,moat:opp.moat,bullCase:opp.thesis,bearCase:opp.bearRisk,catalysts:opp.catalysts||[],risks:[opp.bearRisk],summary:opp.thesis,confidenceScore:opp.confidenceScore};update({savedAnalyses:[a,...savedAnalyses.filter(s=>s.ticker!==a.ticker)]});setJS(opp.ticker);setTimeout(()=>setJS(null),2500);notify(`${opp.ticker} guardado ✓`);};

  return(<div className="up"><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:8}}><div><h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-1px"}}>Inteligencia de Inversiones</h1><div style={{fontSize:12,color:T.muted,marginTop:4}}>Perfil: <span style={{color:T.lime,fontWeight:600}}>{riskProfile?.risk||"no configurado"}</span></div></div></div>
  <div className="tabbar" style={{marginBottom:18}}>{[{id:"portfolio",l:`📊 Portfolio (${holdings.length})`},{id:"scanner",l:"🤖 Scanner IA"},{id:"manual",l:"🔎 Buscar Activo"},{id:"comparador",l:"⚖️ Comparador"},{id:"saved",l:`📁 Guardados`}].map(t=>(<button key={t.id} className={`tab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>))}</div>
  
  {/* TAB PORTFOLIO */}
  {tab==="portfolio"&&<div><div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>{[{l:"Invertido",v:fmt(portfolioData.gInvArs),c:T.blue,i:"💰"},{l:"Valor Actual",v:fmt(portfolioData.gCurArs),c:T.lime,i:"📈"},{l:"P&L Total",v:`${portfolioData.gPnlArs>=0?"+":""}${fmt(portfolioData.gPnlArs)}`,c:portfolioData.gPnlArs>=0?T.teal:T.red,i:"✅"}].map((k,i)=><div key={i} className="card csm"><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase"}}>{k.l}</span><span>{k.i}</span></div><div className="mono" style={{fontSize:16,fontWeight:600,color:k.c}}>{k.v}</div></div>)}</div>
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button className="btn bl" onClick={()=>setSHF(true)}><ic.Plus/> Agregar inversión</button>
        <button className="btn bg" onClick={refreshPortfolio} disabled={refreshingId==="all"}>{refreshingId==="all"?<><Dots/> Sincronizando mercado...</>:<><ic.Refresh/> Sincronizar Activos</>}</button>
    </div>
    
    {showHForm&&<div className="card" style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div style={{fontSize:14,fontWeight:700}}>Nueva Inversión</div><button className="btn bg bsm" onClick={()=>setSHF(false)}><ic.X/></button></div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Tipo</label><select className="inp" value={hForm.type} onChange={e=>setHF(f=>({...f,type:e.target.value}))}><option value="accion">📈 Acción</option><option value="cedear">🇺🇸 CEDEAR</option><option value="etf">📊 ETF</option><option value="crypto">₿ Crypto</option><option value="plazo_fijo">🏦 Plazo fijo</option><option value="fci">💼 FCI</option></select></div>
        
        {["accion","cedear","etf","crypto"].includes(hForm.type) ? 
        <>
            <div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Ticker/Símbolo</label><input className="inp" placeholder="Ej: BTC, ASTS" value={hForm.ticker} onChange={e=>setHF(f=>({...f,ticker:e.target.value.toUpperCase()}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Nombre</label><input className="inp" value={hForm.name} onChange={e=>setHF(f=>({...f,name:e.target.value}))}/></div></div>
            <div className="g3"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Cant.</label><input className="inp" value={hForm.quantity} onChange={e=>setHF(f=>({...f,quantity:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Precio Unit.</label><input className="inp" value={hForm.buyPrice} onChange={e=>setHF(f=>({...f,buyPrice:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Moneda Compra</label><select className="inp" value={hForm.currency} onChange={e=>setHF(f=>({...f,currency:e.target.value}))}><option>ARS</option><option>USD</option></select></div></div> 
        </>
        : 
        <>
            <div className="g2">
                <div>
                    <label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Banco / Entidad</label>
                    <select className="inp" value={hForm.name} onChange={e => {
                        const selected = BANCOS_RATES.find(b => b.name === e.target.value);
                        setHF(f => ({...f, name: e.target.value, rate: selected && selected.tna ? selected.tna : f.rate}));
                    }}>
                        <option value="">Seleccionar banco...</option>
                        {BANCOS_RATES.map(b => <option key={b.id} value={b.name}>{b.name} {b.tna ? `(${b.tna}%)` : ""}</option>)}
                    </select>
                </div>
                <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>TNA %</label><input className="inp" value={hForm.rate} onChange={e=>setHF(f=>({...f,rate:e.target.value}))} placeholder="Ej: 35.5"/></div>
            </div>
            <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Capital Inicial (ARS)</label><input className="inp" value={hForm.totalInvested} onChange={e=>setHF(f=>({...f,totalInvested:e.target.value}))}/></div>
        </>}
        
        <div className="g2">
          <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha Inicial *</label><input type="date" className="inp" value={hForm.buyDate} onChange={e=>setHF(f=>({...f,buyDate:e.target.value}))}/></div>
          {["plazo_fijo", "bono"].includes(hForm.type) && <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha Vencimiento *</label><input type="date" className="inp" value={hForm.maturityDate} onChange={e=>setHF(f=>({...f,maturityDate:e.target.value}))}/></div>}
        </div>
        <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Vincular a Meta</label><select className="inp" value={hForm.goalId} onChange={e=>setHF(f=>({...f,goalId:e.target.value}))}><option value="">Ninguna</option>{goals.filter(g=>g.saved<g.target).map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select></div>

        <button className="btn bl" style={{justifyContent:"center", marginTop:10, width:"100%"}} onClick={addHolding}>✓ Guardar Inversión</button>
      </div></div>}

    <div style={{display:"flex",flexDirection:"column",gap:8}}>{portfolioData.items.map(h=>{
      const symDisplay = h.originalCurrency === "USD" ? "U$D" : "$";
      const buyPriceDisplay = h.originalBuyPrice || h.buyPrice || 0;
      
      return <div key={h.id} className="card" style={{padding:"14px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:14,fontWeight:700}}>{h.ticker||h.name} <span style={{fontSize:10,color:T.muted,fontWeight:400}}>{h.type}</span></div><div style={{fontSize:11,color:T.muted}}>{h.quantity?`${h.quantity} un. a ${symDisplay}${buyPriceDisplay.toLocaleString("en-US")}`:`TNA ${h.rate}%`}</div></div>
        <div style={{display:"flex",gap:6}}><button className="btn bg bsm" style={{color:T.lime}} onClick={()=>refreshSingle(h)} disabled={refreshingId===h.id}>{refreshingId===h.id?<Dots/>:"✎ Precio"}</button><button className="btn bd bsm" onClick={()=>delHolding(h.id)}><ic.Trash/></button></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,background:T.raised,padding:"10px",borderRadius:8,marginTop:8}}>
        <div><div style={{fontSize:9,color:T.muted}}>Inicial</div><div className="mono" style={{fontSize:11}}>{fmt(h.invArs)}</div></div>
        <div><div style={{fontSize:9,color:T.muted}}>Actual</div><div className="mono" style={{fontSize:11,color:T.white}}>{fmt(h.curArs)}</div></div>
        <div><div style={{fontSize:9,color:T.muted}}>Ganancia</div><div className="mono" style={{fontSize:11,color:h.pnlArs>=0?T.teal:T.red}}>{h.pnlArs>=0?"+":""}{fmt(h.pnlArs)}</div></div>
        <div><div style={{fontSize:9,color:T.muted}}>Rend %</div><div className="mono" style={{fontSize:11,color:h.pnlArs>=0?T.teal:T.red}}>{h.pnlArs>=0?"+":""}{h.pnlPct.toFixed(1)}%</div></div>
      </div>
      <div style={{marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6}}>
         <span style={{fontSize:10, color:T.muted}}>Vincular a meta:</span>
         <select className="inp" style={{fontSize:10, padding:"4px 8px", width:"auto"}} value={h.goalId || ""} onChange={e => {
            update({holdings: holdings.map(x => x.id === h.id ? {...x, goalId: e.target.value} : x)});
            notify("Meta vinculada ✓");
         }}><option value="">Ninguna</option>{goals.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select>
      </div>
      </div>})}
    </div>
  </div>}

  {/* TAB SCANNER */}
  {tab==="scanner"&&<div><div className="card" style={{marginBottom:14,background:`linear-gradient(135deg,${T.surface},#0f1525)`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:10}}><div><div style={{fontSize:15,fontWeight:700,marginBottom:4}}>🤖 Scanner automático con IA</div><div style={{fontSize:12,color:T.muted}}>Encuentra oportunidades adaptadas a tu perfil.</div></div><button className="btn bl" onClick={runScanner} disabled={scanning} style={{flexShrink:0}}>{scanning?<><Dots/> Analizando...</>:<><ic.Scan/> Escanear mercado</>}</button></div>{riskProfile&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><div className="chip">🛡️ {riskProfile.risk}</div><div className="chip">⏱️ {riskProfile.horizon}</div></div>}</div>{scanErr&&<div style={{background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:10,padding:"10px 14px",fontSize:12,color:T.red,marginBottom:14}}>⚠ {scanErr}</div>}{scanning&&<div style={{textAlign:"center",padding:"48px 0",color:T.muted}}><div style={{fontSize:32,marginBottom:12}}>🔍</div><div style={{fontSize:14,marginBottom:8}}>Analizando el mercado...</div><Dots/></div>}{scanResult&&!scanning&&<div>{scanResult.marketContext&&<div style={{background:"rgba(77,158,255,.07)",border:`1px solid rgba(77,158,255,.15)`,borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12,color:T.blue}}>🌍 {scanResult.marketContext}</div>}<div className="inv-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>{scanResult.opportunities?.map((opp,i)=>(<div key={i} className="card" style={{cursor:"pointer",border:`1px solid ${opp.ticker===scanResult.topPick?T.lime:T.border}`,background:opp.ticker===scanResult.topPick?"rgba(200,255,87,.03)":T.surface,position:"relative",transition:"all .2s"}}>{opp.ticker===scanResult.topPick&&<div style={{position:"absolute",top:-8,right:12,background:T.lime,color:T.bg,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99}}>TOP PICK</div>}<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}><div><div style={{display:"flex",gap:7,alignItems:"center",marginBottom:3}}><span className="mono" style={{fontSize:16,fontWeight:700}}>{opp.ticker}</span><span className={`tag ${sigCls(opp.signal)}`} style={{fontSize:10}}>{opp.signal}</span></div><div style={{fontSize:11,color:T.muted}}>{opp.name}</div></div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>{[{l:"Upside",v:`${opp.upside>0?"+":""}${(opp.upside||0).toFixed(0)}%`,c:opp.upside>0?T.lime:T.red},{l:"Fit",v:`${opp.profileFit||0}%`,c:(opp.profileFit||0)>=70?T.teal:T.amber},{l:"Confianza",v:`${opp.confidenceScore||0}%`,c:(opp.confidenceScore||0)>=70?T.lime:T.amber}].map((s,j)=>(<div key={j} style={{background:T.raised,borderRadius:7,padding:"6px 8px"}}><div style={{fontSize:9,color:T.muted,marginBottom:2}}>{s.l}</div><div className="mono" style={{fontSize:12,color:s.c}}>{s.v}</div></div>))}</div><div style={{fontSize:11,color:T.muted,lineHeight:1.5,marginBottom:10,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{opp.thesis}</div><button className={`btn bsm ${justSaved===opp.ticker?"bl":"bg"}`} style={{width:"100%",justifyContent:"center"}} onClick={e=>{e.stopPropagation();saveFromScan(opp);}}>{justSaved===opp.ticker?<><ic.Check/> Guardado</>:"+ Analizar en detalle"}</button></div>))}</div><div style={{fontSize:10,color:T.muted,textAlign:"center",marginTop:12}}>⚠️ Análisis educativo. No constituye asesoramiento financiero.</div></div>}{!scanResult&&!scanning&&!scanErr&&<div style={{textAlign:"center",padding:"48px 32px",color:T.muted}}><div style={{fontSize:40,marginBottom:12}}>🔍</div><div style={{fontSize:14,marginBottom:4}}>El scanner analiza el mercado automáticamente</div><div style={{fontSize:12}}>Usa tu perfil de riesgo para encontrar oportunidades</div></div>}</div>}

  {/* TAB MANUAL */}
  {tab==="manual"&&<div><div className="card" style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:10}}>Buscar Activo Manualmente</div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><input className="inp" style={{flex:.6,minWidth:80}} placeholder="ej: BTC" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&analyze(ticker,tname)}/><input className="inp" style={{flex:1.2,minWidth:120}} placeholder="Nombre (opcional)" value={tname} onChange={e=>setTname(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyze(ticker,tname)}/><button className="btn bl" onClick={()=>analyze(ticker,tname)} disabled={loading||!ticker}>{loading?<Dots/>:<><ic.Stock/> Buscar y Analizar</>}</button></div>{loadErr&&<div style={{marginTop:10,background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.red}}>{loadErr}</div>}<div style={{marginTop:12}}><div style={{fontSize:10,color:T.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:".6px"}}>Acceso rápido</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PRESETS.map(p=><button key={p.t} onClick={()=>analyze(p.t,p.n)} disabled={loading} style={{padding:"5px 11px",borderRadius:7,fontSize:11,fontWeight:500,border:`1px solid ${savedAnalyses.find(a=>a.ticker===p.t)?T.lime:T.border}`,background:savedAnalyses.find(a=>a.ticker===p.t)?"rgba(200,255,87,.08)":T.raised,color:savedAnalyses.find(a=>a.ticker===p.t)?T.lime:T.mid,cursor:"pointer",transition:"all .15s"}}>{p.t}</button>)}</div></div></div>{sel&&<AnalysisDetail a={sel} onClose={()=>setSel(null)}/>}</div>}

  {/* TAB COMPARADOR */}
  {tab==="comparador"&&<div className="card"><div style={{marginBottom:14}}><div style={{fontSize:14,fontWeight:700}}>🏦 Comparador de instrumentos</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>FCI, plazo fijo, bonos CER, CEDEARs — contexto argentino 2026</div></div><div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}><div style={{flex:1,minWidth:130}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Ahorro mensual (ARS)</label><input className="inp" value={cf.monthly} onChange={e=>setCF(f=>({...f,monthly:e.target.value}))}/></div><div style={{flex:1,minWidth:90}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Plazo (meses)</label><input className="inp" value={cf.months} onChange={e=>setCF(f=>({...f,months:e.target.value}))}/></div><div style={{display:"flex",alignItems:"flex-end"}}><button className="btn bl" onClick={async()=>{setComp(true);const r=await compareInstruments(px(cf.monthly),px(cf.months),usdRate);setCompResult(r);setComp(false);}} disabled={comparing}>{comparing?<Dots/>:<><ic.Refresh/> Comparar</>}</button></div></div>{compResult?<div><div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>{compResult.instruments?.map((inst,i)=>(<div key={i} style={{background:T.raised,borderRadius:12,padding:"12px 16px",border:`1px solid ${T.border}`,display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}><div style={{flex:"2 1 140px"}}><div style={{fontSize:12,fontWeight:600}}>{inst.name}</div><div style={{fontSize:10,color:T.muted,marginTop:2}}>{inst.pros}</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Ret. anual</div><div className="mono" style={{fontSize:13,color:T.lime}}>{inst.annualReturn?.toFixed(1)}%</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Final USD</div><div className="mono" style={{fontSize:13,color:T.teal}}>{fUSD(inst.finalUSD||0)}</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Riesgo</div><span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:`${rc[inst.risk]||T.mid}1A`,color:rc[inst.risk]||T.mid}}>{(inst.risk||"").replace(/_/g," ")}</span></div><div style={{flex:"1.5 1 100px",fontSize:10,color:T.muted}}>{inst.cons}</div></div>))}</div>{compResult.recommendation&&<div style={{background:"rgba(200,255,87,.06)",border:`1px solid rgba(200,255,87,.2)`,borderRadius:10,padding:"12px 16px"}}><div style={{fontSize:11,color:T.lime,fontWeight:600,marginBottom:4}}>💡 Recomendación</div><div style={{fontSize:12,color:T.mid}}>{compResult.recommendation}</div><div style={{fontSize:10,color:T.muted,marginTop:6}}>{compResult.disclaimer}</div></div>}</div>:<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:13}}>Ingresá monto y plazo para comparar instrumentos</div>}</div>}

  {/* TAB SAVED */}
  {tab==="saved" && <div>
    {savedAnalyses.length===0 ? (
      <div style={{textAlign:"center",padding:"48px 32px",color:T.muted}}><div style={{fontSize:40,marginBottom:12}}>📁</div><div style={{fontSize:14}}>Sin análisis guardados</div></div>
    ) : (
      <div>
        <div className="inv-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10,marginBottom:14}}>
          {savedAnalyses.map(a=>(
            <div key={a.ticker} onClick={()=>setSel(sel?.ticker===a.ticker?null:a)} className="card" style={{cursor:"pointer",border:`1px solid ${sel?.ticker===a.ticker?T.lime:T.border}`,transition:"all .2s",position:"relative"}}>
              <button onClick={e=>{e.stopPropagation();update({savedAnalyses:savedAnalyses.filter(x=>x.ticker!==a.ticker)});if(sel?.ticker===a.ticker)setSel(null);notify("Eliminado","err");}} className="btn bd bsm" style={{position:"absolute",top:12,right:12}}><ic.Trash/></button>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,paddingRight:36}}><span className="mono" style={{fontSize:16,fontWeight:700}}>{a.ticker}</span><span className={`tag ${sigCls(a.signal)}`} style={{fontSize:10}}>{a.signal}</span></div>
              <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{a.company}</div>
              <div style={{display:"flex",gap:7}}>{[{l:"Upside",v:`${a.upside>0?"+":""}${(a.upside||0).toFixed(0)}%`,c:a.upside>0?T.lime:T.red},{l:"Confianza",v:`${a.confidenceScore||0}%`,c:(a.confidenceScore||0)>=70?T.lime:T.amber}].map((s,i)=>(<div key={i} style={{background:T.raised,borderRadius:7,padding:"6px 10px"}}><div style={{fontSize:9,color:T.muted,marginBottom:2}}>{s.l}</div><div className="mono" style={{fontSize:12,color:s.c}}>{s.v}</div></div>))}</div>
            </div>
          ))}
        </div>
        {sel&&<AnalysisDetail a={sel} onClose={()=>setSel(null)}/>}
      </div>
    )}
  </div>}
  </div>);
}

// 2. ANALYTICS: Refactor para integrar Inversiones y Sueldo
function Analytics({state}){
  // ORDEN CORRECTO: Extraer del estado al principio
  const {transactions=[], holdings=[], marketPrices={}, usdRate=1, displayCurrency, goals=[], salaries=[]}=state;
  const {fmt,toDsp}=useDsp(state);
  const NOW=getNow();
  const [range,setRange]=useState(6);

  // 1. Patrimonio Consolidado
  const pValArs = holdings.reduce((s, h) => s + calcHoldingValueArs(h, marketPrices, usdRate).curArs, 0);
  const savingsArs = transactions.filter(t => t.category === "💰 Ahorro").reduce((s, t) => s + t.amount, 0);
  const patrimonioTotalArs = pValArs + savingsArs;

  // 2. Flujo Mensual (Integrando Sueldos)
  const months = useMemo(() => Array.from({length:range}, (_,i) => {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() - range + 1 + i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const txs = transactions.filter(t => gMonth(t.date) === m);
    
    // Sueldo real registrado para el mes
    const monthlySalary = getSalaryTotal(salaries, m);
    const otherIncomes = txs.filter(t => t.type === "income" && t.source !== "salary").reduce((s,t) => s + t.amount, 0);
    const totalIn = monthlySalary + otherIncomes;
    
    const e = txs.filter(t => t.type === "expense").reduce((s,t) => s + t.amount, 0);
    return {
      name: MOS[d.getMonth()],
      Gastos: toDsp(e),
      Ingresos: toDsp(totalIn),
      Ahorro: toDsp(txs.filter(t => t.category === "💰 Ahorro").reduce((s,t) => s + t.amount, 0)),
      balance: toDsp(totalIn - e)
    };
  }), [transactions, salaries, range, toDsp]);

  // 3. Gastos por Categoría
  const cm={}; transactions.filter(t=>t.type==="expense").forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});
  const ctot=Object.values(cm).reduce((s,v)=>s+v,0);
  const cats=Object.entries(cm).sort((a,b)=>b[1]-a[1]).map(([c,v],i)=>({c,v:toDsp(v),pct:ctot>0?(v/ctot*100).toFixed(1):0,col:CPAL[i%CPAL.length]}));

  return (
    <div className="up">
      <PH title="Analíticas" sub="Patrimonio · Sueldos · Metas" right={<select className="inp" style={{width:"auto"}} value={range} onChange={e=>setRange(+e.target.value)}><option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option></select>}/>
      
      {/* KPIs DE RIQUEZA REAL */}
      <div className="kpi-grid" style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16}}>
        <div className="card csm">
          <div style={{fontSize:10, color:T.muted, textTransform:"uppercase"}}>Portfolio Invertido</div>
          <div className="mono" style={{fontSize:18, fontWeight:600, color:T.blue, marginTop:4}}>{fmt(pValArs)}</div>
        </div>
        <div className="card csm">
          <div style={{fontSize:10, color:T.muted, textTransform:"uppercase"}}>Ahorros Efectivo</div>
          <div className="mono" style={{fontSize:18, fontWeight:600, color:T.teal, marginTop:4}}>{fmt(savingsArs)}</div>
        </div>
        <div className="card csm" style={{border:`1px solid ${T.lime}44`, background:`linear-gradient(135deg, ${T.surface}, ${T.bg})`}}>
          <div style={{fontSize:10, color:T.lime, fontWeight:700, textTransform:"uppercase"}}>Patrimonio Total</div>
          <div className="mono" style={{fontSize:20, fontWeight:700, color:T.lime, marginTop:4}}>{fmt(patrimonioTotalArs)}</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:16}}>
        <div style={{fontSize:12, fontWeight:600, color:T.mid, marginBottom:12}}>Evolución Flujo de Caja ({displayCurrency})</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={months}>
            <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="name" tick={{fill:T.muted, fontSize:10}} axisLine={false}/>
            <YAxis tick={{fill:T.muted, fontSize:9}} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}/>
            <Tooltip content={<CTip dc={displayCurrency}/>}/>
            <Legend wrapperStyle={{fontSize:11, paddingTop:10}}/>
            <Bar dataKey="Ingresos" fill={T.teal} radius={[4,4,0,0]}/>
            <Bar dataKey="Gastos" fill={T.red} radius={[4,4,0,0]}/>
            <Bar dataKey="Ahorro" fill={T.blue} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="trend-grid" style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14}}>
        <div className="card">
          <div style={{fontSize:12, fontWeight:600, color:T.mid, marginBottom:15}}>Gastos por Categoría</div>
          {cats.slice(0,6).map((c,i)=>(
            <div key={i} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12}}>{c.c}</span><span className="mono" style={{fontSize:11,color:T.muted}}>{c.pct}%</span></div>
              <div className="prog" style={{height:4}}><div style={{height:"100%",background:c.col,width:`${c.pct}%`}}/></div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{fontSize:12, fontWeight:600, color:T.mid, marginBottom:15}}>Metas (+Inversiones)</div>
          {goals.slice(0,4).map(g=>{
            const linked = holdings.filter(h=>h.goalId===g.id);
            const invVal = linked.reduce((s,h)=>s+calcHoldingValueArs(h,marketPrices,usdRate).curArs,0);
            const total = g.saved + invVal;
            const pct = clamp((total/g.target)*100,0,100);
            return (
              <div key={g.id} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12}}>{g.icon} {g.name}</span><span className="mono" style={{fontSize:11}}>{pct.toFixed(0)}%</span></div>
                <div className="prog" style={{height:5}}><div className="progf" style={{width:`${pct}%`,background:T.blue}}/></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}
// ==========================================
// 2. COMPONENTE DE APOYO (Mantener para consistencia)
// ==========================================
function AnalysisDetail({a, onClose}){
  if(!a) return null;
  const isMobile = window.innerWidth <= 768;
  return (
    <div className="card up" style={{border:`1px solid ${T.hi}`, marginTop:14}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18}}>
        <div>
          <div style={{display:"flex", gap:10, alignItems:"center", marginBottom:4}}>
            <span className="mono" style={{fontSize:22, fontWeight:700}}>{a.ticker}</span>
            <span className={`tag ${sigCls(a.signal)}`}>{a.signal}</span>
          </div>
          <div style={{fontSize:13, color:T.mid}}>{a.company} {a.sector?`· ${a.sector}`:""}</div>
        </div>
        <button className="btn bg bsm" onClick={onClose}><ic.X/></button>
      </div>

      <div className="kpi-grid" style={{display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(5,1fr)", gap:10, marginBottom:18}}>
        {[{l:"Precio est.", v:`$${(a.currentEstimate||0).toFixed(0)}`},
          {l:"Target 12m", v:`$${(a.priceTarget12m||0).toFixed(0)}`, c:T.lime},
          {l:"Upside", v:`${a.upside>0?"+":""}${(a.upside||0).toFixed(1)}%`, c:a.upside>0?T.lime:T.red},
          {l:"P/E", v:a.peRatio?a.peRatio.toFixed(1):"—"},
          {l:"Rev. Growth", v:a.revenueGrowth?`${a.revenueGrowth.toFixed(1)}%`:"—", c:T.teal}]
          .map((s,i) => (
            <div key={i} style={{background:T.raised, borderRadius:10, padding:"12px 14px"}}>
              <div style={{fontSize:10, color:T.muted, marginBottom:5}}>{s.l}</div>
              <div className="mono" style={{fontSize:16, fontWeight:500, color:s.c||T.white}}>{s.v}</div>
            </div>
        ))}
      </div>

      <div className="trend-grid" style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14}}>
        <div style={{background:T.raised, borderRadius:12, padding:14}}>
          <div style={{fontSize:11, color:T.lime, fontWeight:600, marginBottom:8}}>🐂 Bull Case</div>
          <div style={{fontSize:12, color:T.mid, lineHeight:1.6}}>{a.bullCase}</div>
        </div>
        <div style={{background:T.raised, borderRadius:12, padding:14}}>
          <div style={{fontSize:11, color:T.red, fontWeight:600, marginBottom:8}}>🐻 Bear Case</div>
          <div style={{fontSize:12, color:T.mid, lineHeight:1.6}}>{a.bearCase}</div>
        </div>
      </div>
    </div>
  );
}
function Import({state,update,notify}){
  const [tab,setTab]=useState("image");
  const [imgSrc,setImgSrc]=useState(null);
  const [imgMime,setImgMime]=useState("image/png");
  const [extracting,setExt]=useState(null);
  const [extractErr,setEE]=useState(null);
  const [paste,setPaste]=useState("");
  const [preview,setPreview]=useState([]);
  const [over,setOver]=useState(false);
  const [catE,setCE]=useState({});
  const [autoRunning,setAR]=useState(false);
  const imgRef=useRef();
  const csvRef=useRef();
  const handleImgFile=file=>{if(!file)return;const mime=["image/jpeg","image/png","image/gif","image/webp"].includes(file.type)?file.type:"image/png";const r=new FileReader();r.onload=e=>{setImgSrc(e.target.result);setImgMime(mime);setExt(null);setEE(null);};r.readAsDataURL(file);};
  const extractImg=async()=>{if(!imgSrc)return;setExt("loading");setEE(null);notify("Analizando imagen con IA...","info");const b64=imgSrc.split(",")[1];const result=await extractFromImage(b64,imgMime);if(!result||!result.transactions?.length){setExt("error");setEE("No se detectaron transacciones. Probá con una imagen más nítida.");notify("Sin transacciones detectadas","err");return;}setPreview(result.transactions.map((t,i)=>({...t,id:`img_${uid()}_${i}`,currency:result.currency||"ARS",source:"image"})));setExt("done");notify(`${result.transactions.length} transacciones extraídas${result.appDetected?` · App: ${result.appDetected}`:""} ✓`);};
  const handleCSV=file=>{const r=new FileReader();r.onload=e=>{const p=parseCSV(e.target.result);if(!p.length)return notify("Sin datos válidos en el CSV","err");setPreview(p);notify(`${p.length} movimientos detectados`);};r.readAsText(file,"utf-8");};
  const doPaste=()=>{const lines=paste.trim().split("\n").filter(l=>l.trim());const out=[];for(const l of lines){const amts=[...l.matchAll(/[\d.,]+/g)].map(m=>px(m[0])).filter(a=>a>100);if(!amts.length)continue;const dm=l.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]?\d{0,4}/);const CUR=getCUR();out.push({id:`p_${uid()}`,date:dm?dm[0]:CUR+"-01",description:l.replace(/[\d.,$%\/\-]/g,"").trim().slice(0,60)||"TX",amount:amts[0],type:"expense",category:"❓ Otros",currency:"ARS"});}if(!out.length)return notify("Sin montos detectados","err");setPreview(out);notify(`${out.length} movimientos detectados`);};
  const autoCatAll=async()=>{setAR(true);notify("Auto-categorizando con IA...","info");const upd=[];for(const t of preview){const r=await autoCat(t.description);upd.push({...t,category:r.category||t.category,type:r.type||t.type});}setPreview(upd);setAR(false);notify("Categorización completa ✓");};
  const confirm=()=>{const toAdd=preview.map(t=>({...t,id:`i_${uid()}`,category:catE[t.id]||t.category}));update({transactions:[...state.transactions,...toAdd]});setPreview([]);setPaste("");setImgSrc(null);setExt(null);notify(`${toAdd.length} movimientos importados ✓`);};
  return(<div className="up"><PH title="Importar datos" sub="Imagen · CSV · Texto pegado"/>
  <div className="tabbar" style={{marginBottom:18}}>{[{id:"image",l:"📸 Imagen"},{id:"csv",l:"📁 CSV"},{id:"paste",l:"📋 Texto"},{id:"guide",l:"💡 Guía"}].map(t=>(<button key={t.id} className={`tab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>))}</div>
  {tab==="image"&&<div><div style={{background:"rgba(167,139,250,.06)",border:`1px solid rgba(167,139,250,.2)`,borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12,color:T.purple}}>✨ Subí un screenshot de Mercado Pago, Ualá, Brubank, o cualquier resumen bancario. La IA extrae las transacciones automáticamente.</div><div className={`imgdrop${over?" ov2":""}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const f=e.dataTransfer.files[0];if(f)handleImgFile(f);}} onClick={()=>imgRef.current?.click()}>{imgSrc?<img src={imgSrc} alt="preview" style={{maxWidth:"100%",maxHeight:300,borderRadius:8,objectFit:"contain"}}/>:<><div style={{fontSize:40}}>📸</div><div style={{fontSize:15,fontWeight:600,color:T.mid}}>Arrastrá o hacé clic para subir</div><div style={{fontSize:12,color:T.muted}}>PNG, JPG, HEIC — screenshots bancarios</div></>}<input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleImgFile(e.target.files[0])}/></div>{imgSrc&&<div style={{display:"flex",gap:8,marginTop:10}}><button className="btn bl" style={{flex:1,justifyContent:"center"}} onClick={extractImg} disabled={extracting==="loading"}>{extracting==="loading"?<><Dots/> Extrayendo...</>:"🔍 Extraer con IA"}</button><button className="btn bg" onClick={()=>{setImgSrc(null);setExt(null);setEE(null);}}>Cambiar</button></div>}{extracting==="error"&&extractErr&&<div style={{marginTop:10,background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:8,padding:"10px 14px",fontSize:12,color:T.red}}>{extractErr}</div>}{extracting==="done"&&preview.length>0&&<div style={{marginTop:10,background:"rgba(0,229,195,.06)",border:`1px solid rgba(0,229,195,.2)`,borderRadius:8,padding:"10px 14px",fontSize:12,color:T.teal}}>✓ {preview.length} transacciones listas. Revisalas abajo antes de importar.</div>}</div>}
  {tab==="csv"&&<div><div className={`dz${over?" ov2":""}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const f=e.dataTransfer.files[0];if(f)handleCSV(f);}} onClick={()=>csvRef.current?.click()}><div style={{fontSize:40,marginBottom:10}}>📂</div><div style={{fontSize:15,fontWeight:600,color:T.mid}}>Arrastrá o hacé clic</div><div style={{fontSize:12,color:T.muted}}>CSV con coma, punto y coma o tabulación</div><input ref={csvRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleCSV(e.target.files[0])}/></div><div className="card csm" style={{marginTop:12}}><div style={{fontSize:11,color:T.mid,fontWeight:600,marginBottom:7}}>Formato esperado</div><code style={{fontSize:11,color:T.lime,display:"block",background:T.raised,padding:"10px 14px",borderRadius:8,lineHeight:1.7,fontFamily:"'DM Mono',monospace"}}>fecha;descripcion;importe<br/>2025-01-15;Supermercado Coto;-15000<br/>2025-01-20;Sueldo enero;350000</code></div></div>}
  {tab==="paste"&&<div><div style={{fontSize:12,color:T.mid,marginBottom:8}}>Pegá el texto copiado de cualquier app o homebanking</div><textarea className="inp" style={{minHeight:150,resize:"vertical",lineHeight:1.6,fontSize:13}} placeholder={"15/01 Netflix $2.800\n16/01 Supermercado $15.200\n20/01 Sueldo $350.000"} value={paste} onChange={e=>setPaste(e.target.value)}/><button className="btn bl" style={{marginTop:10}} onClick={doPaste} disabled={!paste.trim()}>Analizar texto</button></div>}
  {tab==="guide"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>{[{app:"🟢 Mercado Pago",steps:["App → Actividad","Filtrar fecha → ⋮ → Exportar CSV","O capturá screenshot y subí la imagen"]},{app:"🟣 Ualá",steps:["Movimientos → ⬇ Descargar CSV","O screenshot del historial"]},{app:"🔵 Brubank",steps:["Cuenta → Movimientos → Exportar CSV","O screenshot del historial"]},{app:"🏦 Galicia / Nación",steps:["Homebanking → Extracto → CSV","Formato: fecha;descripcion;debito;credito"]},{app:"📸 Cualquier app",steps:["Capturá screenshot del historial","Subí la imagen en 'Imagen'","La IA detecta los movimientos"]}].map(({app,steps})=><div key={app} className="card csm"><div style={{fontSize:13,fontWeight:600,marginBottom:9}}>{app}</div><ol style={{paddingLeft:16,display:"flex",flexDirection:"column",gap:6}}>{steps.map((s,i)=><li key={i} style={{fontSize:12,color:T.muted}}>{s}</li>)}</ol></div>)}</div>}
  {preview.length>0&&<div style={{marginTop:22}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}><h2 style={{fontSize:16,fontWeight:700}}>{preview.length} movimientos detectados</h2><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn bg" onClick={autoCatAll} disabled={autoRunning}>{autoRunning?<><Dots/> Categorizando...</>:"✨ Auto-categorizar IA"}</button><button className="btn bg" onClick={()=>{setPreview([]);setCE({});}}>Cancelar</button><button className="btn bl" onClick={confirm}>✓ Importar todo</button></div></div><div className="card" style={{padding:0,overflow:"auto",maxHeight:380}}><table className="tbl"><thead><tr><th className="hide-m">Fecha</th><th>Descripción</th><th>Monto</th><th className="hide-m">Tipo</th><th>Categoría</th></tr></thead><tbody>{preview.slice(0,50).map(t=>(<tr key={t.id}><td className="mono hide-m" style={{fontSize:11,color:T.muted}}>{t.date}</td><td style={{fontSize:12,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td><td className="mono" style={{fontSize:12,color:t.type==="income"?T.teal:T.red}}>{t.type==="income"?"+":"-"}{fARS(t.amount)}</td><td className="hide-m"><span className={`tag ${t.type==="income"?"ti":"te"}`} style={{fontSize:10}}>{t.type==="income"?"Ingreso":"Gasto"}</span></td><td><select className="inp" style={{fontSize:11,padding:"4px 8px"}} value={catE[t.id]||t.category} onChange={e=>setCE(c=>({...c,[t.id]:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select></td></tr>))}</tbody></table>{preview.length>50&&<div style={{padding:"8px 16px",fontSize:11,color:T.muted,textAlign:"center"}}>...y {preview.length-50} más</div>}</div></div>}</div>);
}
