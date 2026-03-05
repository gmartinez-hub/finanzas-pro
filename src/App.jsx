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

async function genWeeklyInsight(transactions,usdRate,holdings=[]){const now=Date.now();const w1=transactions.filter(t=>(now-new Date(t.date))<=7*864e5);if(!w1.length)return null;const e1=w1.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);const w2=transactions.filter(t=>{const d=now-new Date(t.date);return d>7*864e5&&d<=14*864e5;});const e2=w2.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);const cm={};w1.filter(t=>t.type==="expense").forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});const top=Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,v])=>`${c}:${fARS(v)}`).join(", ");const pVal=holdings.reduce((s,h)=>s+(h.currentValue||h.totalInvested||0),0);const pInv=holdings.reduce((s,h)=>s+(h.totalInvested||0),0);const pInfo=holdings.length>0?` Portfolio: ${holdings.length} inversiones, valor ${fARS(pVal)}, invertido ${fARS(pInv)}, P&L ${fARS(pVal-pInv)}.`:"";const raw=await ai(`Argentina personal finance. Last 7d expenses: ${fARS(e1)}. Prior week: ${fARS(e2)}. Top: ${top}. USD:${usdRate}.${pInfo} Return ONLY valid JSON: {"headline":"<Spanish 12 words max>","detail":"<2 Spanish sentences with numbers>","action":"<1 Spanish concrete action 15 words max>","trend":"up|down|stable","savingOpportunity":0}`,"Friendly financial coach. Spanish. Valid JSON only.");if(!raw)return null;try{return JSON.parse(cleanJSON(raw));}catch{return null;}}

function parseCSV(txt){const lines=txt.trim().split("\n").filter(l=>l.trim());if(lines.length<2)return[];const sep=lines[0].includes(";")?";":lines[0].includes("\t")?"\t":",";const hdrs=lines[0].split(sep).map(h=>h.trim().replace(/"/g,"").toLowerCase());const out=[];for(let i=1;i<lines.length;i++){const cols=lines[i].split(sep).map(c=>c.trim().replace(/^"|"$/g,""));const obj={};hdrs.forEach((h,idx)=>obj[h]=cols[idx]||"");const dK=hdrs.find(h=>/^(fecha|date|dia)$/i.test(h)||/fecha|date/.test(h));const dscK=hdrs.find(h=>/desc|concepto|detalle|comer|estab|ref/.test(h));const debK=hdrs.find(h=>/debito|debe|debit|cargo|egreso/.test(h));const creK=hdrs.find(h=>/credito|haber|credit|abono/.test(h));const aK=hdrs.find(h=>/import|monto|amount|total/.test(h));let amount=0,type="expense";if(debK&&creK){const deb=px(obj[debK]),cre=px(obj[creK]);if(cre>0){amount=cre;type="income";}else if(deb>0){amount=deb;type="expense";}else continue;}else if(aK){const raw2=String(obj[aK]).trim();amount=Math.abs(px(obj[aK]));type=raw2.startsWith("-")||px(obj[aK])<0?"expense":"income";}else{const numVal=Object.values(obj).map(v=>px(v)).find(v=>v>0);if(!numVal)continue;amount=numVal;type="expense";}if(amount<=0)continue;out.push({id:`csv_${uid()}_${i}`,currency:"ARS",date:obj[dK]||getCUR()+"-01",description:obj[dscK]||`TX ${i}`,amount,type,category:"❓ Otros"});}return out;}

const getSalaryTotal=(salaries,month)=>{const m=month||getCUR();const s=salaries?.find(s=>s.month===m);return s?(s.base+(s.extras||[]).reduce((a,e)=>a+e.amt,0)):0;};

const goalPlan=(goals,salaries,transactions,holdings=[])=>{const CUR=getCUR();const NOW=getNow();const salary=getSalaryTotal(salaries);const spent=transactions.filter(t=>gMonth(t.date)===CUR&&t.type==="expense").reduce((s,t)=>s+t.amount,0);const disponible=Math.max(0,salary-spent);const portfolioValue=holdings.reduce((s,h)=>s+(h.currentValue||h.totalInvested||0),0);const active=goals.filter(g=>g.saved<g.target);return{disponible,portfolioValue,perGoal:active.map(g=>{const rem=g.target-g.saved;const couldUsePortfolio=portfolioValue>=rem*0.3;const days=g.deadline?Math.ceil((new Date(g.deadline)-NOW)/864e5):365;const months=Math.max(1,Math.ceil(days/30));const needed=rem/months;return{id:g.id,name:g.name,icon:g.icon,needed,months,rem,feasible:needed<=disponible/Math.max(active.length,1)*1.2,couldUsePortfolio,portfolioCover:portfolioValue>0?Math.min(100,Math.round(portfolioValue/rem*100)):0};})};};

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

function Dashboard({state, setView}){
  const {transactions, goals, holdings=[], displayCurrency}=state;
  const {fmt}=useDsp(state);
  const CUR=getCUR();
  const inc = transactions.filter(t => gMonth(t.date) === CUR && t.type === "income").reduce((s,t) => s + t.amount, 0);
  const exp = transactions.filter(t => gMonth(t.date) === CUR && t.type === "expense").reduce((s,t) => s + t.amount, 0);
  const portVal = holdings.reduce((s,h) => s + (h.currentValue || h.totalInvested || 0), 0);
  
  // Patrimonio Neto (Cash histórico + Inversiones)
  const totalInc = transactions.filter(t => t.type === "income").reduce((s,t) => s + t.amount, 0);
  const totalExp = transactions.filter(t => t.type === "expense").reduce((s,t) => s + t.amount, 0);
  const cash = totalInc - totalExp;
  const netWorth = cash + portVal;

  return(
    <div className="up">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24, flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:12, color:T.muted, textTransform:"uppercase", letterSpacing:"1px", marginBottom:4}}>Patrimonio Neto ({displayCurrency})</div>
          <div style={{fontSize:36, fontWeight:800, color:T.lime, letterSpacing:"-1.5px"}}>{fmt(netWorth)}</div>
        </div>
        <button className="btn bg bsm" onClick={()=>setView("transactions")}>Ver Historial →</button>
      </div>

      <div className="kpi-grid" style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24}}>
        {[{l:"Ingresos Mes",v:fmt(inc),c:T.teal,i:"📥"}, {l:"Gastos Mes",v:fmt(exp),c:T.red,i:"💸"}, {l:"Caja (Cash)",v:fmt(cash),c:cash>=0?T.white:T.red,i:"💵"}, {l:"Inversiones",v:fmt(portVal),c:T.blue,i:"📈"}].map((k,i)=>(
          <div key={i} className="card"><div style={{fontSize:10, color:T.muted, marginBottom:8, display:"flex", justifyContent:"space-between"}}><span>{k.l}</span><span>{k.i}</span></div><div className="mono" style={{fontSize:18, fontWeight:700, color:k.c}}>{k.v}</div></div>
        ))}
      </div>

      <div className="g2">
        <div className="card up">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
            <h3 style={{fontSize:14}}>Vigilancia de Metas</h3>
            <button className="btn bg bsm" style={{padding:"4px 8px"}} onClick={()=>setView("goals")}>Ir a Metas</button>
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
        
        <div className="card up">
          <h3 style={{fontSize:14, marginBottom:16}}>Últimos Movimientos</h3>
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
             {transactions.slice(-4).reverse().map(t=>(
               <div key={t.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", paddingBottom:8, borderBottom:`1px solid ${T.ink}`}}>
                  <div style={{minWidth:0}}><div style={{fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{t.description}</div><div style={{fontSize:10, color:T.muted}}>{t.date}</div></div>
                  <div className="mono" style={{fontSize:12, color:t.type==="income"?T.teal:T.red, flexShrink:0}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</div>
               </div>
             ))}
             {transactions.length===0 && <div style={{fontSize:12, color:T.muted}}>Sin movimientos recientes.</div>}
          </div>
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

function Transactions({state, update, notify}){
  const {transactions, usdRate}=state;
  const {fmt}=useDsp(state);
  const [showAdd, setSA]=useState(false);
  const [editTx, setETx]=useState(null);
  const [form, setForm]=useState({date:todayISO(), description:"", amount:"", type:"expense", category:"❓ Otros", currency:"ARS"});

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
      <PH title="Movimientos" right={<button className="btn bl" onClick={()=>{setETx(null); setSA(true)}}><ic.Plus/> Nuevo</button>}/>
      <div className="card" style={{padding:0, overflow:"auto"}}>
        <table className="tbl">
          <thead><tr><th className="hide-m">Fecha</th><th>Detalle</th><th>Categoría</th><th>Monto</th><th></th></tr></thead>
          <tbody>
            {transactions.slice().reverse().map(t => (
              <tr key={t.id}>
                <td className="mono hide-m" style={{fontSize:11, color:T.muted}}>{t.date}</td>
                <td style={{fontSize:13, fontWeight:500}}>{t.description}</td>
                <td style={{fontSize:11, color:T.mid}}>{t.category}</td>
                <td className="mono" style={{color:t.type==="income"?T.teal:T.red, fontWeight:600}}>{fmt(t.amount)}</td>
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
            <h3>{editTx ? "Editar" : "Nuevo"} Movimiento</h3>
            <div style={{display:"flex", flexDirection:"column", gap:14, marginTop:20}}>
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
              <button className="btn bl" style={{justifyContent:"center"}} onClick={save}>Guardar Movimiento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Goals({state, update, notify}){
  const {goals, holdings=[], transactions}=state;
  const {fmt}=useDsp(state);
  const [addTo, setAT]=useState(null);
  const [addAmt, setAA]=useState("");
  const [sf, setSF]=useState(false);
  const [form, setForm]=useState({name:"", target:"", icon:"🎯", deadline:""});

  const liquidar = (g, linkedH) => {
    const ids = linkedH.map(h => h.id);
    const expense = {id:`m_${uid()}`, date:todayISO(), description:`Gasto Meta: ${g.name}`, amount: g.target, type:"expense", category:"💰 Ahorro", currency:"ARS", source:"auto"};
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

  return(
    <div className="up">
      <PH title="Mis Metas de Ahorro" right={<button className="btn bl" onClick={()=>setSF(true)}><ic.Plus/> Nueva Meta</button>}/>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16}}>
        {goals.map(g => {
          // Lógica principal de Goal-Based Investing
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
              ) : addTo === g.id ? (
                <div style={{display:"flex", gap:6, marginTop:16}}>
                  <input autoFocus className="inp" placeholder="Ahorro manual $" value={addAmt} onChange={e=>setAA(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){ update({goals:goals.map(x=>x.id===g.id?{...x, saved:x.saved+px(addAmt)}:x)}); setAT(null); setAA("");}}}/>
                  <button className="btn bl bsm" onClick={()=>{update({goals:goals.map(x=>x.id===g.id?{...x, saved:x.saved+px(addAmt)}:x)}); setAT(null); setAA("")}}>Guardar</button>
                </div>
              ) : (
                <button className="btn bg bsm" style={{width:"100%", marginTop:16}} onClick={()=>setAT(g.id)}>Sumar Cash Manualmente</button>
              )}
            </div>
          );
        })}
        {goals.length === 0 && <div className="card" style={{gridColumn:"1/-1", textAlign:"center", padding:"40px", color:T.muted}}>No tienes metas activas.</div>}
      </div>

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

function Analytics({state}){
  const {transactions,displayCurrency}=state;
  const {fmt,toDsp}=useDsp(state);
  const NOW=getNow();
  const [range,setRange]=useState(6);
  const [comparing,setComp]=useState(false);
  const [result,setResult]=useState(null);
  const [cf,setCF]=useState({monthly:"200000",months:"12"});
  const months=useMemo(()=>Array.from({length:range},(_,i)=>{const d=new Date(NOW.getFullYear(),NOW.getMonth()-range+1+i,1);const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;const txs=transactions.filter(t=>gMonth(t.date)===m);const e=txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);const inc=txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);return{name:MOS[d.getMonth()],Gastos:toDsp(e),Ingresos:toDsp(inc),Ahorro:toDsp(txs.filter(t=>t.category==="💰 Ahorro").reduce((s,t)=>s+t.amount,0)),balance:toDsp(inc-e)};}),[transactions,range,toDsp]);
  const cm={};transactions.filter(t=>t.type==="expense").forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});
  const ctot=Object.values(cm).reduce((s,v)=>s+v,0);
  const cats=Object.entries(cm).sort((a,b)=>b[1]-a[1]).map(([c,v],i)=>({c,v:toDsp(v),pct:ctot>0?(v/ctot*100).toFixed(1):0,col:CPAL[i%CPAL.length]}));
  const totInc=transactions.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totExp=transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const savR=totInc>0?clamp(((totInc-totExp)/totInc)*100,-100,100).toFixed(1):"0";
  const savN=parseFloat(savR);
  const rc={none:T.teal,low:T.lime,very_low:T.teal,medium:T.amber,medium_high:T.amber,high:T.red};
  const holdings=state.holdings||[];
  const portfolioVal=holdings.reduce((s,h)=>s+(h.currentValue||h.totalInvested||0),0);
  const totalSavings=transactions.filter(t=>t.category==="💰 Ahorro").reduce((s,t)=>s+t.amount,0);
  const patrimonio=portfolioVal+totalSavings;
  return(<div className="up"><PH title="Analíticas" sub="Histórico · Proyecciones · Patrimonio" right={<select className="inp" style={{width:"auto"}} value={range} onChange={e=>setRange(+e.target.value)}><option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option></select>}/>
  {(portfolioVal>0||totalSavings>0)&&<div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>{[{l:"Portfolio",v:fmt(portfolioVal),c:T.blue,i:"📊"},{l:"Ahorros",v:fmt(totalSavings),c:T.teal,i:"💰"},{l:"Patrimonio total",v:fmt(patrimonio),c:T.lime,i:"🏛️"}].map((k,i)=><div key={i} className="card csm"><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".5px"}}>{k.l}</span><span>{k.i}</span></div><div className="mono" title={k.v} style={{fontSize:16,fontWeight:600,color:k.c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.v}</div></div>)}</div>}
  <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>{[{l:"Total ingresos",v:fmt(totInc),c:T.teal},{l:"Total gastos",v:fmt(totExp),c:T.red},{l:"Tasa de ahorro",v:`${savR}%`,c:savN>=20?T.lime:savN>=10?T.amber:T.red,sub:savN>=20?"✓ Excelente":savN>=10?"Regular":savN<0?"⚠ Gastás más de lo que ingresás":"⚠ Mejorar"}].map((k,i)=>(<div key={i} className="card csm"><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>{k.l}</div><div className="mono" title={k.v} style={{fontSize:22,fontWeight:500,color:k.c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.v}</div>{k.sub&&<div style={{fontSize:11,color:T.muted,marginTop:3}}>{k.sub}</div>}</div>))}</div>
  <div className="card" style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Comparativa mensual ({displayCurrency})</div><div style={{width:"100%",minWidth:0,overflow:"hidden"}}><ResponsiveContainer width="100%" height={210}><BarChart data={months} barGap={3}><CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/><Tooltip content={<CTip dc={displayCurrency}/>}/><Legend wrapperStyle={{fontSize:11,color:T.muted}}/><Bar dataKey="Ingresos" fill={T.teal} radius={[4,4,0,0]} opacity={.9}/><Bar dataKey="Gastos" fill={T.red} radius={[4,4,0,0]} opacity={.9}/><Bar dataKey="Ahorro" fill={T.blue} radius={[4,4,0,0]} opacity={.9}/></BarChart></ResponsiveContainer></div></div>
  <div className="trend-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}><div className="card"><div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Gastos por categoría</div>{cats.length===0?<div style={{color:T.muted,textAlign:"center",padding:20,fontSize:13}}>Sin datos</div>:cats.slice(0,8).map((c,i)=>(<div key={i} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.mid}}>{c.c}</span><span className="mono" style={{fontSize:11,color:T.muted}}>{c.pct}%</span></div><div className="prog" style={{height:4}}><div style={{height:"100%",borderRadius:2,background:c.col,width:`${clamp(c.pct,0,100)}%`,transition:"width .6s"}}/></div></div>))}</div><div className="card"><div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Balance mensual</div><div style={{width:"100%",minWidth:0,overflow:"hidden"}}><ResponsiveContainer width="100%" height={185}><LineChart data={months}><CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/><Tooltip content={<CTip dc={displayCurrency}/>}/><Line type="monotone" dataKey="balance" stroke={T.lime} strokeWidth={2.5} dot={{fill:T.lime,r:3}} activeDot={{r:5,fill:T.lime,stroke:T.bg}}/></LineChart></ResponsiveContainer></div></div></div>
  <div className="card"><div style={{marginBottom:14}}><div style={{fontSize:14,fontWeight:700}}>🏦 Comparador de instrumentos</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>FCI, plazo fijo, bonos CER, CEDEARs — contexto argentino 2025</div></div><div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}><div style={{flex:1,minWidth:130}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Ahorro mensual (ARS)</label><input className="inp" value={cf.monthly} onChange={e=>setCF(f=>({...f,monthly:e.target.value}))}/></div><div style={{flex:1,minWidth:90}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Plazo (meses)</label><input className="inp" value={cf.months} onChange={e=>setCF(f=>({...f,months:e.target.value}))}/></div><div style={{display:"flex",alignItems:"flex-end"}}><button className="btn bl" onClick={async()=>{setComp(true);const r=await compareInstruments(px(cf.monthly),px(cf.months),state.usdRate);setResult(r);setComp(false);}} disabled={comparing}>{comparing?<Dots/>:<><ic.Refresh/> Analizar</>}</button></div></div>{result?<div><div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>{result.instruments?.map((inst,i)=>(<div key={i} style={{background:T.raised,borderRadius:12,padding:"12px 16px",border:`1px solid ${T.border}`,display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}><div style={{flex:"2 1 140px"}}><div style={{fontSize:12,fontWeight:600}}>{inst.name}</div><div style={{fontSize:10,color:T.muted,marginTop:2}}>{inst.pros}</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Ret. anual</div><div className="mono" style={{fontSize:13,color:T.lime}}>{inst.annualReturn?.toFixed(1)}%</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Final USD</div><div className="mono" style={{fontSize:13,color:T.teal}}>{fUSD(inst.finalUSD||0)}</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Riesgo</div><span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:`${rc[inst.risk]||T.mid}1A`,color:rc[inst.risk]||T.mid}}>{(inst.risk||"").replace(/_/g," ")}</span></div><div style={{flex:"1.5 1 100px",fontSize:10,color:T.muted}}>{inst.cons}</div></div>))}</div>{result.recommendation&&<div style={{background:"rgba(200,255,87,.06)",border:`1px solid rgba(200,255,87,.2)`,borderRadius:10,padding:"12px 16px"}}><div style={{fontSize:11,color:T.lime,fontWeight:600,marginBottom:4}}>💡 Recomendación</div><div style={{fontSize:12,color:T.mid}}>{result.recommendation}</div><div style={{fontSize:10,color:T.muted,marginTop:6}}>{result.disclaimer}</div></div>}</div>:<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:13}}>Ingresá monto y plazo para comparar instrumentos</div>}</div></div>);
}

function Investments({state, update, notify}){
  const {holdings=[], goals=[], usdRate, transactions}=state;
  const {fmt}=useDsp(state);
  const [showHForm, setSHF]=useState(false);
  const [hForm, setHF]=useState({type:"accion", ticker:"", name:"", quantity:"", buyPrice:"", totalInvested:"", currency:"ARS", buyDate:todayISO(), rate:"", goalId:""});
  const [refreshingId, setRI]=useState(null);

  const refreshSingle = async (h) => {
    setRI(h.id);
    let updatedHolding = {...h};
    try {
      if(h.type === "crypto") {
        // BINANCE API (Motor de tiempo real)
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
        // IA API (Motor de búsqueda para Renta Variable local/extranjera)
        const raw = await ai(`Price for ticker: ${h.ticker}. Date: ${todayISO()}. Return JSON: {"price": number}. ARS for local AR instruments, USD for US.`, "Valid JSON only. Return just the numeric value in the JSON.");
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
        // MATH API (Motor local para Renta Fija)
        const days = Math.max(0, Math.floor((Date.now()-new Date(h.buyDate))/864e5));
        const rateDec = px(h.rate)/100;
        let cv = px(h.totalInvested);
        if(h.type==="fci") cv *= Math.pow(1+(rateDec/365), days); // Compuesto diario
        else cv *= (1 + rateDec*(days/365)); // Simple
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
              <input className="inp" placeholder={["plazo_fijo","fci"].includes(hForm.type)?"Banco / Entidad (ej: Galicia)":"Ticker (ej: BTC, AAPL)"} value={hForm.ticker} onChange={e=>setHF({...hForm, ticker:e.target.value.toUpperCase()})}/>
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

function AnalysisDetail({a,onClose}){
  if(!a)return null;
  return(<div className="card up" style={{border:`1px solid ${T.hi}`,marginTop:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:8}}><div><div style={{display:"flex",gap:10,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}><span className="mono" style={{fontSize:22,fontWeight:700}}>{a.ticker}</span><span className={`tag ${sigCls(a.signal)}`}>{a.signal}</span><span className={`tag ${a.timeframe==="SHORT"?"te":a.timeframe==="LONG"?"ti":"ts"}`}>{a.timeframe}</span></div><div style={{fontSize:13,color:T.mid}}>{a.company}{a.sector?` · ${a.sector}`:""}</div></div><button className="btn bg bsm" onClick={onClose}><ic.X/></button></div><div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:18}}>{[{l:"Precio est.",v:`$${(a.currentEstimate||0).toFixed(0)}`},{l:"Target 12m",v:`$${(a.priceTarget12m||0).toFixed(0)}`,c:T.lime},{l:"Upside",v:`${a.upside>0?"+":""}${(a.upside||0).toFixed(1)}%`,c:a.upside>0?T.lime:T.red},{l:"P/E",v:a.peRatio?(a.peRatio.toFixed(1)):"—"},{l:"Rev. Growth",v:a.revenueGrowth?`${(a.revenueGrowth).toFixed(1)}%`:"—",c:a.revenueGrowth>0?T.teal:T.red}].map((s,i)=>(<div key={i} style={{background:T.raised,borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:10,color:T.muted,marginBottom:5}}>{s.l}</div><div className="mono" style={{fontSize:16,fontWeight:500,color:s.c||T.white}}>{s.v}</div></div>))}</div><div className="trend-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>{[{title:"🐂 Bull case",color:T.lime,body:a.bullCase,sub:"Catalizadores",items:a.catalysts},{title:"🐻 Bear case",color:T.red,body:a.bearCase,sub:"Riesgos",items:a.risks}].map((p,i)=>(<div key={i} style={{background:T.raised,borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:11,color:p.color,fontWeight:600,marginBottom:7}}>{p.title}</div><div style={{fontSize:12,color:T.mid,lineHeight:1.6,marginBottom:8}}>{p.body}</div><div style={{fontSize:10,color:T.muted,marginBottom:5}}>{p.sub}</div>{p.items?.map((it,j)=><div key={j} style={{fontSize:11,color:T.mid,padding:"3px 0",borderBottom:`1px solid ${T.border}`}}>▸ {it}</div>)}</div>))}</div>{a.moat&&<div style={{background:"rgba(77,158,255,.06)",border:`1px solid rgba(77,158,255,.15)`,borderRadius:10,padding:"12px 16px",marginBottom:8}}><div style={{fontSize:11,color:T.blue,fontWeight:600,marginBottom:4}}>🏰 Moat</div><div style={{fontSize:12,color:T.mid}}>{a.moat}</div></div>}<div style={{fontSize:10,color:T.muted,textAlign:"center",marginTop:4}}>⚠️ Análisis educativo. No constituye asesoramiento financiero.</div></div>);
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
// --- ICONOS Y COMPONENTES UI BÁSICOS ---
const ic = {
  Grid: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  Tx: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  Target: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Stock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  Plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Menu: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
};

const Dots = () => <span className="mono">...</span>;
const PH = ({title, right}) => (<div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:10}}><h1 style={{fontSize:26, fontWeight:800, letterSpacing:"-1px"}}>{title}</h1>{right}</div>);
function useDsp({displayCurrency, usdRate}){ const fmt = useCallback(a => displayCurrency==="USD" ? fUSD(a/usdRate) : fARS(a), [displayCurrency, usdRate]); return {fmt}; }
function useIsMobile(){ const [m,setM]=useState(window.innerWidth<=768); useEffect(()=>{ const h=()=>setM(window.innerWidth<=768); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]); return m; }

function Onboarding({update, notify}){
  const [d, setD] = useState({name:"", income:"", goalName:"", goalAmt:""});
  const finish = () => {
    const base = px(d.income);
    update({onboardingDone:true, lastSalaryBase:base, salaries:[{month:getCUR(), base, extras:[]}]}); 
    if(d.goalName && px(d.goalAmt)>0) update(p => ({...p, goals: [{id:`g_${uid()}`, name:d.goalName, target:px(d.goalAmt), saved:0, icon:"🎯"}]}));
    notify("¡Bienvenido! Empieza a trackear tu patrimonio.");
  };
  return(
    <div style={{display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", padding:20, background:T.bg}}>
      <div className="card" style={{maxWidth:400, width:"100%"}}>
        <h2 style={{marginBottom:10}}>Bienvenido 👋</h2>
        <div style={{display:"flex", flexDirection:"column", gap:16, marginTop:20}}>
          <input className="inp" placeholder="Tu nombre" value={d.name} onChange={e=>setD({...d, name:e.target.value})}/>
          <input className="inp" placeholder="Sueldo neto mensual $" value={d.income} onChange={e=>setD({...d, income:e.target.value})}/>
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
