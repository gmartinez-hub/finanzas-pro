import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  analyzeInvestment,
  categorizeTransactions,
  compareInvestmentInstruments,
  extractTransactionsFromImage,
  generateWeeklyInsight,
  scanInvestments,
} from "./aiClient";

const T = {
  bg:"var(--bg)",surface:"var(--surface)",raised:"var(--raised)",border:"var(--border)",hi:"var(--hi)",
  lime:"var(--lime)",limeD:"var(--lime-d)",mango:"var(--mango)",mangoD:"var(--mango-d)",
  coral:"var(--coral)",blue:"var(--blue)",amber:"var(--amber)",teal:"var(--teal)",purple:"var(--purple)",
  white:"var(--text)",mid:"var(--text-mid)",muted:"var(--text-muted)",ink:"var(--ink)",red:"var(--coral)",
};
const SK="fp_v3b";
const normalizeTxType=raw=>{
  const value=String(raw||"").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s-]+/g,"_");
  if(["expense","expenses","gasto","gastos","egreso","egresos","debit","debito","cargo","compra","purchase","outflow","spend"].includes(value))return"expense";
  if(["income","incomes","ingreso","ingresos","credit","credito","haber","abono","deposit","deposito","inflow"].includes(value))return"income";
  if(["transfer","transferencia","transferencias","internal_transfer","transferencia_interna"].includes(value))return"transfer";
  return null;
};
const normalizeTxRecord=(tx,fallback=null)=>{const normalized=normalizeTxType(tx?.type);return{...tx,type:normalized||(fallback??tx?.type??null)};};
const txTypeLabel=(raw,category)=>{const type=normalizeTxType(raw);if(type==="income")return"Ingreso";if(type==="transfer")return"Transferencia";if(type==="expense")return category==="💰 Ahorro"?"Ahorro":"Gasto";return"Revisar tipo";};
const txTypeClass=(raw,category)=>{const type=normalizeTxType(raw);return type==="income"?"ti":type==="transfer"?"tt":type==="expense"&&category==="💰 Ahorro"?"ts":type==="expense"?"te":"tt";};
const txAmountSign=raw=>{const type=normalizeTxType(raw);return type==="income"?"+":type==="transfer"?"↔":type==="expense"?"-":"?";};
const txAmountColor=raw=>{const type=normalizeTxType(raw);return type==="income"?T.teal:type==="transfer"?T.muted:type==="expense"?T.red:T.amber;};
const normalizeStoredState=data=>data&&typeof data==="object"?{
  ...data,
  transactions:Array.isArray(data.transactions)?data.transactions.map(tx=>normalizeTxRecord(tx)):[],
  recurring:Array.isArray(data.recurring)?data.recurring.map(item=>normalizeTxRecord(item)):[],
}:data;
const persist=async d=>{try{await window.storage?.set(SK,JSON.stringify(d),false);}catch(e){console.warn("persist fail",e);}};
const hydrate=async()=>{try{const r=await window.storage?.get(SK,false);return r?normalizeStoredState(JSON.parse(r.value)):null;}catch(e){return null;}};
const px=raw=>{const s=String(raw||"").trim().replace(/[^0-9.,-]/g,"");if(!s)return 0;if(/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(s))return parseFloat(s.replace(/\./g,"").replace(",","."))||0;if(/^\d+,\d+$/.test(s))return parseFloat(s.replace(",","."))||0;if(/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s))return parseFloat(s.replace(/,/g,""))||0;return parseFloat(s)||0;};
const fARS=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n||0);
const fUSD=n=>`US$ ${new Intl.NumberFormat("en-US",{minimumFractionDigits:0,maximumFractionDigits:2}).format(n||0)}`;
const fQuoteARS=n=>`AR$ ${new Intl.NumberFormat("es-AR",{maximumFractionDigits:0}).format(Number(n)||0)}`;
const fQuoteUSD=n=>`US$ ${new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)}`;
const formatMarketQuote=(price,sourceCurrency,displayCurrency,usdRate)=>{const value=Number(price)||0;const rate=Number(usdRate)||1;const source=sourceCurrency||"USD";const converted=source===displayCurrency?value:source==="USD"?value*rate:value/rate;return displayCurrency==="USD"?fQuoteUSD(converted):fQuoteARS(converted);};
const quoteTime=iso=>{if(!iso)return null;const date=new Date(iso);if(Number.isNaN(date.getTime()))return null;return new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);};
const withMarketQuote=(analysis,quote)=>{const price=Number(quote?.price);if(!analysis||!price)return analysis;const oldPrice=Number(analysis.currentEstimate);const explicitTarget=Number(analysis.priceTarget12m);const impliedTarget=explicitTarget>0?explicitTarget:(oldPrice>0&&Number.isFinite(analysis.upside)?oldPrice*(1+analysis.upside/100):null);return{...analysis,currentEstimate:price,priceCurrency:quote.currency||analysis.priceCurrency||"USD",quoteSource:quote.source||analysis.quoteSource||"market",quoteAsOf:quote.asOf||new Date().toISOString(),upside:impliedTarget?((impliedTarget/price)-1)*100:analysis.upside};};
const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
const getNow=()=>new Date();
const todayISO=()=>{const n=getNow();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;};
const isValidISODate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return false;const[y,m,d]=value.split("-").map(Number);const parsed=new Date(Date.UTC(y,m-1,d));return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d;};
const normalizeInputDate=value=>{const raw=String(value||"").trim();const isoToken=raw.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];if(isValidISODate(isoToken))return isoToken;const match=raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2}|\d{4}))?\b/);if(!match)return null;const now=getNow();let year=match[3]?(match[3].length===2?Number(`20${match[3]}`):Number(match[3])):now.getFullYear();let iso=`${year}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`;if(!match[3]&&isValidISODate(iso)&&new Date(`${iso}T00:00:00`)>now){year-=1;iso=`${year}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`;}return isValidISODate(iso)?iso:null;};
const getCUR=()=>{const n=getNow();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;};
const gMonth=d=>{if(!d)return"";if(d.includes("-")&&d.indexOf("-")===4)return d.slice(0,7);const parts=d.split(/[\/\-]/);if(parts.length>=3){const[day,month,year]=parts[0].length===4?[parts[2],parts[1],parts[0]]:[parts[0],parts[1],parts[2]];return`${year.length===2?"20"+year:year}-${month.padStart(2,"0")}`;}return d.slice(0,7);};
const MOS=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const CATS=["🏠 Vivienda","🛒 Supermercado","🚗 Transporte","🍔 Comida y delivery","💊 Salud","🧴 Cuidado personal","🐾 Mascotas","👕 Indumentaria","📱 Servicios digitales","🎬 Ocio","💪 Deporte","✈️ Viajes","📚 Educación","💰 Ahorro","💳 Cuotas","🐜 Gastos hormiga","🧛 Suscripciones","❓ Otros"];
const categoryName=raw=>String(raw||"❓ Otros").trim().replace(/^[^\p{L}\p{N}]+/u,"").trim()||"Otros";
const CategoryIcon=({category,size=17})=>{
  const name=categoryName(category);
  const paths={
    Vivienda:<><path d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.8 9.3v10.2h12.4V9.3M9.3 19.5v-6.2h5.4v6.2"/></>,
    Supermercado:<><path d="M4 6.5h16l-1.7 8.2H7L5 3.8H2.8"/><circle cx="8.5" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/></>,
    Transporte:<><path d="M5.2 16.8h13.6l-1-6.2-2-4H8.2l-2 4-1 6.2Z"/><path d="M6.2 11h11.6M8 16.8v2M16 16.8v2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/></>,
    "Comida y delivery":<><path d="M7 3.5v7M4.5 3.5v4.2A2.5 2.5 0 0 0 7 10.2a2.5 2.5 0 0 0 2.5-2.5V3.5M7 10.2v10.3"/><path d="M16.5 3.5v17M16.5 3.5c-3 2.2-3.2 7.5 0 8.4"/></>,
    Salud:<><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></>,
    "Cuidado personal":<><path d="M8 8h8l1 12H7L8 8ZM10 8V5h5M15 5v2M10 12h4"/><path d="M15 5h2"/></>,
    Mascotas:<><circle cx="7" cy="8" r="2"/><circle cx="17" cy="8" r="2"/><circle cx="11.8" cy="5" r="2"/><path d="M12 11c-3.4 0-6.2 2.5-6.2 5.3 0 2.2 1.8 3.2 3.5 2.2a5.4 5.4 0 0 1 5.4 0c1.7 1 3.5 0 3.5-2.2C18.2 13.5 15.4 11 12 11Z"/></>,
    Indumentaria:<><path d="m8.2 4 3.8 2 3.8-2 4.2 3.2-2.4 3.2-1.7-1.2v10.3H8.1V9.2l-1.7 1.2L4 7.2 8.2 4Z"/></>,
    "Servicios digitales":<><rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8M12 17v4"/></>,
    Ocio:<><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Z"/><path d="M9 9.5v7"/></>,
    Deporte:<><path d="M4 9v6M7 7.5v9M17 9v6M14 7.5v9M7 12h7M2 10.5v3M19 10.5v3"/></>,
    Viajes:<><path d="m3 13 8.5-2.2V4.7c0-1 .5-1.7 1.2-1.7s1.2.7 1.2 1.7v6.1l6.6 2.2v2l-6.6-.8v4l2.3 1.4v1.2l-3.5-.6-3.5.6v-1.2l2.3-1.4v-4L3 15v-2Z"/></>,
    Educación:<><path d="M4 5.2h6.2c1 0 1.8.8 1.8 1.8v12c0-1-.8-1.8-1.8-1.8H4v-12Z"/><path d="M20 5.2h-6.2c-1 0-1.8.8-1.8 1.8v12c0-1 .8-1.8 1.8-1.8H20v-12Z"/></>,
    Ahorro:<><path d="M4 9.5c0-2.7 2.7-4.8 6.5-4.8h3c3.8 0 6.5 2.1 6.5 5v4.7c0 2.6-2 4.6-4.8 5.1H8.8C6 19 4 17 4 14.4v-4.9Z"/><path d="M8.5 4.8V3.2h5v1.6M16.8 8.2h.1M4 11H2.5v3H4M8 19.5V21M16 19.5V21"/></>,
    Cuotas:<><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9h18M7 15h4"/></>,
    "Gastos hormiga":<><circle cx="7" cy="15.5" r="3"/><circle cx="15.5" cy="8" r="3"/><path d="M7 14v3M15.5 6.5v3M10 13l2.5-2.5"/></>,
    Suscripciones:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 2.5v3M16 2.5v3M4 8h16M15.5 12.5a4 4 0 0 0-6.8 1L8 15M8 12v3h3M8.5 17a4 4 0 0 0 6.8-1l.7-1.5M16 18v-3h-3"/></>,
    Otros:<><circle cx="12" cy="12" r="9"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" style={{display:"block",flexShrink:0}}><g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]||paths.Otros}</g></svg>;
};
const CategoryLabel=({category,compact=false})=><span className="category-label"><span className="category-icon"><CategoryIcon category={category} size={compact?14:16}/></span><span>{categoryName(category)}</span></span>;
const CATEGORY_SELECT_OPTIONS=CATS.map(category=>({value:category,label:categoryName(category),icon:<span className="category-icon"><CategoryIcon category={category}/></span>}));
const GOAL_ICON_OPTIONS=[
  {value:"🎯",label:"Objetivo",kind:"target"},{value:"✈️",label:"Viaje",kind:"plane"},{value:"🚗",label:"Auto",kind:"car"},{value:"🏠",label:"Casa",kind:"home"},
  {value:"💻",label:"Tecnología",kind:"technology"},{value:"💍",label:"Evento",kind:"event"},{value:"🎓",label:"Estudios",kind:"education"},{value:"🏖️",label:"Vacaciones",kind:"vacation"},
  {value:"💰",label:"Ahorro",kind:"savings"},{value:"🏋️",label:"Bienestar",kind:"fitness"},{value:"🌎",label:"Exterior",kind:"world"},{value:"👶",label:"Familia",kind:"family"},
];
const GOAL_ICON_LEGACY={"📱":"technology","🎸":"project","🛵":"car","🏡":"home"};
const goalIconKind=icon=>GOAL_ICON_OPTIONS.find(option=>option.value===icon)?.kind||GOAL_ICON_LEGACY[icon]||"target";
const GoalIcon=({icon,size=18})=>{
  const paths={
    target:<><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3.5v3M20.5 12h-3M12 20.5v-3M3.5 12h3"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    plane:<><path d="m3 13 8.5-2.2V4.7c0-1 .5-1.7 1.2-1.7s1.2.7 1.2 1.7v6.1l6.6 2.2v2l-6.6-.8v4l2.3 1.4v1.2l-3.5-.6-3.5.6v-1.2l2.3-1.4v-4L3 15v-2Z"/></>,
    car:<><path d="M5.2 16.8h13.6l-1-6.2-2-4H8.2l-2 4-1 6.2Z"/><path d="M6.2 11h11.6M8 16.8v2M16 16.8v2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/></>,
    home:<><path d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.8 9.3v10.2h12.4V9.3M9.3 19.5v-6.2h5.4v6.2"/></>,
    technology:<><rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8M12 17v4"/></>,
    event:<><circle cx="12" cy="13" r="6.5"/><path d="m9 6 1.8-3h2.4L15 6M9.5 6h5"/><path d="M7.5 13h9M12 8.5c1.8 1.2 2.8 2.7 2.8 4.5s-1 3.3-2.8 4.5c-1.8-1.2-2.8-2.7-2.8-4.5S10.2 9.7 12 8.5Z"/></>,
    education:<><path d="m3 8 9-4 9 4-9 4-9-4Z"/><path d="M7 10.2v4.3c2.8 2 7.2 2 10 0v-4.3M21 8v6"/></>,
    vacation:<><circle cx="18" cy="5" r="2.5"/><path d="M3 19h18M7 18l5-10M5 11c3.5-2.2 8.2-2.2 11.5.5M12 8c.8 2.7 2.3 4.4 4.5 3.5M12 8c-1.7 1.6-2.3 3.6-1.9 6"/></>,
    savings:<><path d="M4 9.5c0-2.7 2.7-4.8 6.5-4.8h3c3.8 0 6.5 2.1 6.5 5v4.7c0 2.6-2 4.6-4.8 5.1H8.8C6 19 4 17 4 14.4v-4.9Z"/><path d="M8.5 4.8V3.2h5v1.6M16.8 8.2h.1M4 11H2.5v3H4M8 19.5V21M16 19.5V21"/></>,
    fitness:<><path d="M4 9v6M7 7.5v9M17 9v6M14 7.5v9M7 12h7M2 10.5v3M19 10.5v3"/></>,
    world:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21C9.5 18.3 8.2 15.3 8.2 12S9.5 5.7 12 3Z"/></>,
    family:<><circle cx="8" cy="8" r="2.4"/><circle cx="16" cy="9" r="2"/><path d="M3.5 19v-2.2A4.5 4.5 0 0 1 8 12.3a4.5 4.5 0 0 1 4.5 4.5V19M12.5 14.5a3.7 3.7 0 0 1 7 1.8V19"/></>,
    project:<><path d="m12 3 1.4 5L18 10l-4.6 2L12 17l-1.4-5L6 10l4.6-2L12 3Z"/><path d="m19 16 .6 1.5L21 18l-1.4.5L19 20l-.6-1.5L17 18l1.4-.5L19 16Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" style={{display:"block",flexShrink:0}}><g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[goalIconKind(icon)]||paths.target}</g></svg>;
};
const GoalLabel=({goal,compact=false})=><span className="goal-label"><span className="goal-icon-badge"><GoalIcon icon={goal.icon} size={compact?14:17}/></span><span>{goal.name}</span></span>;
const emptyHoldingForm=()=>({type:"accion",ticker:"",name:"",quantity:"",buyPrice:"",totalInvested:"",currency:"ARS",buyDate:todayISO(),maturityDate:"",rate:"",goalId:""});
const instrumentLabel=type=>({accion:"Acción",cedear:"CEDEAR",etf:"ETF",crypto:"Cripto",plazo_fijo:"Plazo fijo",fci:"FCI",bono:"Bono"}[type]||"Inversión");
const inferHoldingType=ticker=>{const symbol=String(ticker||"").toUpperCase().replace(/-USD$/,"");if(["BTC","ETH","SOL","USDT","USDC","BNB","XRP","ADA","DOGE"].includes(symbol))return"crypto";if(["SPY","QQQ","VOO","IVV","DIA","IWM","ARKK"].includes(symbol))return"etf";return"accion";};
const InstrumentIcon=({type,size=17})=>{
  const paths={accion:<><path d="M5 5v5M5 7h2M10 9v8M8 12h4M16 3v10M14 6h4"/></>,cedear:<><circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.4 8.7 12S9.8 5.8 12 3.5Z"/></>,etf:<><rect x="4" y="13" width="4" height="7" rx="1"/><rect x="10" y="9" width="4" height="11" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></>,crypto:<><path d="M9 4h5a4 4 0 0 1 0 8H9zM9 12h6a4 4 0 0 1 0 8H9zM12 2v20M15 2v3M15 19v3"/></>,plazo_fijo:<><path d="m3 9 9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></>,fci:<><circle cx="12" cy="12" r="8"/><path d="M12 4v8h8M12 12l-5.7 5.7"/></>,bono:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h7"/><circle cx="17" cy="16" r="2.5"/></>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{display:"block",flexShrink:0}}><g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[type]||paths.accion}</g></svg>;
};
const CATS_PLAIN=CATS.map(categoryName);
const matchCat=raw=>{if(!raw)return"❓ Otros";const found=CATS.find(c=>c===raw);if(found)return found;const lower=raw.toLowerCase().trim();const idx=CATS_PLAIN.findIndex(p=>p.toLowerCase()===lower);return idx>=0?CATS[idx]:"❓ Otros";};
const CPAL={
  ARS:["#CCFF47","#FF9A35","#5B9EFF","#FFB830","#00D4AA","#FF5F6D","#B89BFF","#FF6B9D","#8ED44A","#00B89A","#7BB5FF","#FFD166","#FF8C42","#E05F6B","#A09090","#D4C5B8","#8AC6A8","#C7A6FF"],
  USD:["#63D8C0","#76B3FF","#AEB8FF","#8BD4FF","#69C8E6","#9AD7C0","#F3C762","#C0E8FF","#6F8EDB","#8FE1D0","#B6C7FF","#75A6C9","#D5E7EA","#7097B8","#ACC5D2","#7AC2B2","#9DB7FF","#C5D8E0"],
};
const HORIZONS=[{value:"under_6m",label:"Menos de 6 meses",short:"< 6 meses"},{value:"6_to_12m",label:"6 meses a 1 año",short:"6–12 meses"},{value:"1_to_3y",label:"1 a 3 años",short:"1–3 años"},{value:"over_3y",label:"Más de 3 años",short:"3+ años"}];
const HORIZON_LEGACY={"3m":"Menos de 6 meses","1a":"1 a 3 años","3a":"Más de 3 años"};
const horizonLabel=value=>HORIZONS.find(item=>item.value===value)?.label||HORIZON_LEGACY[value]||value||"Sin configurar";
const riskLabel=value=>({conservador:"Conservador",moderado:"Moderado",agresivo:"Agresivo"}[value]||value||"Sin configurar");
const ALLOCATION_MATRIX={
  under_6m:{conservador:[80,20,0],moderado:[70,30,0],agresivo:[60,40,0]},
  "6_to_12m":{conservador:[60,40,0],moderado:[50,45,5],agresivo:[40,50,10]},
  "1_to_3y":{conservador:[30,60,10],moderado:[20,55,25],agresivo:[15,45,40]},
  over_3y:{conservador:[20,60,20],moderado:[10,50,40],agresivo:[5,30,65]},
};
const DEFAULT={transactions:[],goals:[],budgets:{},recurring:[],usdRate:1350,usdType:"mep",usdRates:{oficial:1350,mep:1350,blue:1350},displayCurrency:"ARS",riskProfile:null,onboardingDone:false,savedAnalyses:[],lastScanResult:null,lastScanAt:null,weeklyInsight:null,weeklyInsightDate:null,salaries:[],lastSalaryBase:0,holdings:[],marketPrices:{}};
const uid=()=>`${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const detectTransfers=(newTxs,existingTxs,tolerancePct=0.02,dayWindow=2)=>{const pairs=[];const usedNew=new Set();const usedExisting=new Set();for(const nt of newTxs){if(usedNew.has(nt.id))continue;for(const et of existingTxs){if(usedExisting.has(et.id))continue;if(nt.type===et.type)continue;if(nt.type==="transfer"||et.type==="transfer")continue;const diff=Math.abs(nt.amount-et.amount)/Math.max(nt.amount,et.amount);if(diff>tolerancePct)continue;const daysDiff=Math.abs((new Date(nt.date)-new Date(et.date))/864e5);if(daysDiff>dayWindow)continue;pairs.push({a:nt,b:et});usedNew.add(nt.id);usedExisting.add(et.id);break;}}return pairs;};

async function fetchUSDRates(){try{const r=await fetch("https://dolarapi.com/v1/dolares");if(!r.ok)return null;const d=await r.json();const oficial=d.find(x=>x.casa==="oficial");const mep=d.find(x=>x.casa==="bolsa"||x.casa==="mep");const blue=d.find(x=>x.casa==="blue");return{oficial:oficial?(oficial.compra+oficial.venta)/2:1350,mep:mep?(mep.compra+mep.venta)/2:1350,blue:blue?(blue.compra+blue.venta)/2:1350};}catch{return null;}}
async function fetchStockPrice(ticker){try{const r=await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`);if(!r.ok)return null;const d=await r.json();if(d.error||!d.price)return null;return d;}catch{return null;}}
async function extractFromImage(b64,mime){const{data}=await extractTransactionsFromImage({imageBase64:b64,mime,today:todayISO()});return{...data,transactions:(data.transactions||[]).map(t=>({...t,category:matchCat(t.category)}))};}
async function loadPDFJS(){if(window.pdfjsLib)return window.pdfjsLib;return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";resolve(window.pdfjsLib);};s.onerror=()=>reject(new Error("No se pudo cargar el lector de PDF."));document.head.appendChild(s);});}
async function extractFromPDF(file,onProgress){const lib=await loadPDFJS();const buf=await file.arrayBuffer();const pdf=await lib.getDocument({data:buf}).promise;const results=[];const warnings=[];const apps=new Set();for(let p=1;p<=pdf.numPages;p++){onProgress?.(`Procesando página ${p}/${pdf.numPages}...`);const page=await pdf.getPage(p);const vp=page.getViewport({scale:2.0});const canvas=document.createElement("canvas");canvas.width=vp.width;canvas.height=vp.height;const ctx=canvas.getContext("2d");await page.render({canvasContext:ctx,viewport:vp}).promise;const b64=canvas.toDataURL("image/jpeg",0.85).split(",")[1];const r=await extractFromImage(b64,"image/jpeg");if(r?.warnings?.length)warnings.push(...r.warnings.map(w=>`Página ${p}: ${w}`));if(r?.appDetected)apps.add(r.appDetected);if(r?.transactions?.length){results.push(...r.transactions.map((t,i)=>({...t,id:`pdf_${uid()}_${p}_${i}`,currency:r.currency||"ARS",source:"pdf"})));}}return{transactions:results,warnings:[...new Set(warnings)].slice(0,8),appDetected:[...apps].join(", ")||null};}
async function autoScanInvestments(profile,usdRate){const{data}=await scanInvestments({profile:{risk:profile.risk,horizon:profile.horizon,horizonLabel:horizonLabel(profile.horizon),allocation:profile.allocation||null,objective:profile.objective||null},usdRate,date:todayISO()});return data;}
async function analyzeStock(ticker,name){const{data}=await analyzeInvestment({ticker,name:name||null,date:todayISO()});return data;}
async function compareInstruments(monthly,months,usdRate){const{data}=await compareInvestmentInstruments({monthly,months,usdRate,date:todayISO()});return data;}
async function autoCat(items){const{data}=await categorizeTransactions(items);return data.items||[];}
async function genWeeklyInsight(transactions,goals,usdRate,portfolioValueArs=0,portfolioInvestedArs=0,holdings=[]){const now=Date.now();const w1=transactions.filter(t=>{const d=now-new Date(t.date);return d>=0&&d<=7*864e5;});const e1=w1.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);const w2=transactions.filter(t=>{const d=now-new Date(t.date);return d>7*864e5&&d<=14*864e5;});const e2=w2.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);const cm={};w1.filter(t=>t.type==="expense").forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});const topCategories=Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([category,amount])=>({category,amount}));const portfolioPnlArs=portfolioValueArs-portfolioInvestedArs;const portfolioPnlPct=portfolioInvestedArs>0?(portfolioPnlArs/portfolioInvestedArs)*100:0;const goalMetrics=(goals||[]).slice(0,5).map(g=>{const saved=goalCash(g);return{name:g.name,progressPct:g.target>0?clamp((saved/g.target)*100,0,100):0,remainingArs:Math.max(0,(g.target||0)-saved)};});const{data}=await generateWeeklyInsight({last7dExpenses:e1,priorWeekExpenses:e2,topCategories,portfolioValueArs,portfolioInvestedArs,portfolioPnlArs,portfolioPnlPct,holdings:holdings.slice(0,6).map(h=>h.ticker||h.name).filter(Boolean),goals:goalMetrics,usdRate,date:todayISO()});return data;}
function parseCSVLine(line,sep){const fields=[];let f="",inQ=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(inQ&&line[i+1]==='"'){f+='"';i++;}else inQ=!inQ;}else if(c===sep&&!inQ){fields.push(f.trim());f="";}else f+=c;}fields.push(f.trim());return fields;}
function parseCSV(txt){
  const lines=txt.trim().split("\n").filter(line=>line.trim());
  if(lines.length<2)return[];
  const sep=lines[0].includes(";")?";":(lines[0].includes("\t")?"\t":",");
  let headerIdx=0;
  for(let i=0;i<Math.min(lines.length,10);i++){
    const cols=parseCSVLine(lines[i],sep).map(col=>col.toLowerCase().replace(/"/g,""));
    const hasDate=cols.some(col=>/^(fecha|date|release_date|transaction_date|dia)/.test(col));
    const hasAmt=cols.some(col=>/^(transaction_amount|monto|importe|debito|credito|amount|debit|credit)/.test(col));
    if(hasDate||hasAmt){headerIdx=i;break;}
  }
  const hdrs=parseCSVLine(lines[headerIdx],sep).map(header=>header.trim().replace(/"/g,"").toLowerCase());
  const dK=hdrs.find(header=>!header.includes("reference")&&(/^(fecha|date|release_date|transaction_date|dia)$/.test(header)||/fecha|date/.test(header)));
  const dscK=hdrs.find(header=>!header.includes("reference")&&(/^(description|descripcion|concepto|detalle|establecimiento|comercio)$/.test(header)||/desc|concepto|detalle|comer|estab/.test(header)));
  const tK=hdrs.find(header=>/^(tipo|type|transaction_type|movement_type)$/.test(header));
  const debK=hdrs.find(header=>/^(debito|debe|debit|cargo|egreso)$/.test(header));
  const creK=hdrs.find(header=>/^(credito|haber|credit|abono)$/.test(header));
  const aK=hdrs.find(header=>/^(transaction_amount|importe|monto|amount|total)$/.test(header)||(/import|monto|amount|total/.test(header)&&!header.includes("reference")&&!header.includes("balance")));
  const curK=hdrs.find(header=>/^(moneda|currency|divisa)$/.test(header)||/moneda|currency|divisa/.test(header));
  const out=[];
  for(let i=headerIdx+1;i<lines.length;i++){
    const cols=parseCSVLine(lines[i],sep);
    const obj={};
    hdrs.forEach((header,index)=>obj[header]=(cols[index]||"").trim().replace(/^"|"$/g,""));
    let amount=0,type="expense";
    if(debK&&creK){
      const debit=px(obj[debK]),credit=px(obj[creK]);
      if(credit>0){amount=credit;type="income";}else if(debit>0){amount=debit;}else continue;
    }else if(aK){
      const rawAmount=String(obj[aK]||"").trim();
      if(/e[+\-]/i.test(rawAmount))continue;
      const signed=px(rawAmount);amount=Math.abs(signed);type=rawAmount.startsWith("-")||signed<0?"expense":"income";
    }else{
      const numeric=Object.entries(obj).filter(([key])=>!key.includes("reference")&&!key.includes("balance")&&key!==dK).map(([,value])=>px(value)).find(value=>value>0&&value<1e10);
      if(!numeric)continue;amount=numeric;
    }
    const declaredType=normalizeTxType(obj[tK]);
    if(declaredType)type=declaredType;
    if(amount<=0||amount>1e10)continue;
    const currency=/(?:\bUSD\b|US\$|U\$S|\bD[ÓO]LAR(?:ES)?\b)/i.test(`${obj[curK]||""} ${obj[aK]||""} ${lines[i]}`)?"USD":"ARS";
    out.push({id:`csv_${uid()}_${i}`,currency,date:normalizeInputDate(obj[dK]),description:obj[dscK]||`TX ${i-headerIdx}`,amount,type,category:"❓ Otros",source:"csv"});
  }
  return out;
}

const getSalaryTotal=(salaries,month)=>{const m=month||getCUR();const s=salaries?.find(s=>s.month===m);return s?(s.base+(s.extras||[]).reduce((a,e)=>a+e.amt,0)):0;};
const getMonthIncomeParts=(salaries,transactions,month)=>{const record=salaries?.find(s=>s.month===month);const rows=(transactions||[]).filter(tx=>gMonth(tx.date)===month&&tx.type==="income");const legacyBase=rows.filter(tx=>tx.source==="salary").reduce((sum,tx)=>sum+tx.amount,0);const legacyExtras=rows.filter(tx=>tx.source==="extra").reduce((sum,tx)=>sum+tx.amount,0);const base=record?.base||legacyBase;const extras=record?(record.extras||[]).reduce((sum,item)=>sum+item.amt,0):legacyExtras;const other=rows.filter(tx=>tx.source!=="salary"&&tx.source!=="extra").reduce((sum,tx)=>sum+tx.amount,0);return{base,extras,other,total:base+extras+other};};
const calcHoldingValueArs=(h,marketPrices={},usdRate=1)=>{let invArs=h.totalInvestedArs;if(!invArs)invArs=h.originalCurrency==="USD"?(h.totalInvested||0)*usdRate:(h.totalInvested||0);let curArs=invArs;if(["accion","cedear","etf","crypto"].includes(h.type)){const mp=marketPrices[h.ticker];if(mp){const priceArs=mp.currency==="USD"?mp.price*usdRate:mp.price;curArs=(h.quantity||0)*priceArs;}else{const fallbackPriceArs=h.originalCurrency==="USD"?(h.originalBuyPrice||h.buyPrice||0)*usdRate:(h.originalBuyPrice||h.buyPrice||0);curArs=(h.quantity||0)*fallbackPriceArs;}}else{const now=Date.now();const start=new Date(h.buyDate).getTime();const end=h.maturityDate?new Date(h.maturityDate).getTime():now;const calcDate=["plazo_fijo","bono"].includes(h.type)?Math.min(now,end):now;const daysElapsed=Math.max(0,Math.floor((calcDate-start)/864e5));if(h.type==="fci"){curArs=invArs*Math.pow(1+((h.rate||0)/100/365),daysElapsed);}else{curArs=invArs*(1+((h.rate||0)/100)*(daysElapsed/365));}}return{invArs,curArs};};
const goalCash=g=>(g.saved||0)+(g.payments||g.milestones||[]).reduce((s,p)=>s+p.amount,0);
const goalPlan=(goals,salaries,transactions,holdings=[],marketPrices={},usdRate=1)=>{const CUR=getCUR();const NOW=getNow();const salary=getSalaryTotal(salaries);const spent=transactions.filter(t=>gMonth(t.date)===CUR&&t.type==="expense").reduce((s,t)=>s+t.amount,0);const disponible=Math.max(0,salary-spent);const portfolioValue=holdings.reduce((s,h)=>s+calcHoldingValueArs(h,marketPrices,usdRate).curArs,0);const active=goals.filter(g=>goalCash(g)<g.target);return{disponible,portfolioValue,perGoal:active.map(g=>{const rem=g.target-goalCash(g);const couldUsePortfolio=portfolioValue>=rem*0.3;const days=g.deadline?Math.ceil((new Date(g.deadline)-NOW)/864e5):365;const months=Math.max(1,Math.ceil(days/30));const needed=rem/months;return{id:g.id,name:g.name,icon:g.icon,needed,months,rem,feasible:needed<=disponible/Math.max(active.length,1)*1.2,couldUsePortfolio,portfolioCover:portfolioValue>0?Math.min(100,Math.round(portfolioValue/rem*100)):0};})};};
const healthScore=(txs,goals,holdings=[],salaries=[],riskProfile=null,marketPrices={},usdRate=1)=>{
  const monthKey=offset=>{const date=new Date();date.setMonth(date.getMonth()+offset);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;};
  const snapshot=month=>{const rows=txs.filter(tx=>gMonth(tx.date)===month);const expenses=rows.filter(tx=>tx.type==="expense");const expense=expenses.reduce((sum,tx)=>sum+tx.amount,0);const categorizedExpense=expenses.filter(tx=>categoryName(tx.category)!=="Otros").reduce((sum,tx)=>sum+tx.amount,0);const byCategory=name=>expenses.filter(tx=>categoryName(tx.category)===name).reduce((sum,tx)=>sum+tx.amount,0);const income=getMonthIncomeParts(salaries,txs,month).total;return{month,income,expense,expenseCount:expenses.length,categorizedRatio:expense>0?categorizedExpense/expense:0,installments:byCategory("Cuotas"),leaks:byCategory("Gastos hormiga")+byCategory("Suscripciones")};};
  const months=[0,-1,-2].map(offset=>snapshot(monthKey(offset)));const current=months[0];const usable=months.filter(month=>month.income>0&&month.expense>0);const usableMonths=usable.length;const categoryReady=current.expense>0&&current.categorizedRatio>=0.7;const status=!(current.income>0&&current.expense>0&&categoryReady)?"insufficient":usableMonths===3&&months.every(month=>month.categorizedRatio>=0.7)?"ready":"provisional";
  const evidence=usable.length?usable:[current];const average=(rows,key)=>rows.reduce((sum,month)=>sum+month[key],0)/Math.max(rows.length,1);const savingsRate=current.income>0&&current.expense>0?clamp((average(evidence,"income")-average(evidence,"expense"))/average(evidence,"income"),-1,1):null;const savingsValue=savingsRate===null?null:clamp(Math.round((Math.max(0,savingsRate)/0.2)*20),0,20);const positiveMonths=usable.filter(month=>month.income>month.expense).length;const consistencyValue=usableMonths===3?positiveMonths*5:null;const categoryEvidence=evidence.filter(month=>month.categorizedRatio>=0.7);const debtRate=categoryReady&&categoryEvidence.length&&average(categoryEvidence,"income")>0?average(categoryEvidence,"installments")/average(categoryEvidence,"income"):null;const debtValue=debtRate===null?null:clamp(Math.round(15-(debtRate/0.3)*15),0,15);const leakRate=categoryReady&&categoryEvidence.length&&average(categoryEvidence,"income")>0?average(categoryEvidence,"leaks")/average(categoryEvidence,"income"):null;const leaksValue=leakRate===null?null:clamp(Math.round(15-(leakRate/0.15)*15),0,15);
  const activeGoals=goals.filter(goal=>goalCash(goal)<goal.target);const goalProgress=activeGoals.length?activeGoals.reduce((sum,goal)=>{const linked=holdings.filter(holding=>holding.goalId===goal.id).reduce((value,holding)=>value+calcHoldingValueArs(holding,marketPrices,usdRate).curArs,0);return sum+clamp((goalCash(goal)+linked)/goal.target,0,1);},0)/activeGoals.length:0;const holdingTypes=new Set(holdings.map(holding=>holding.type||"other"));
  const baseTip="Primero cargá ingresos y gastos del mismo mes para calcular tu salud financiera.";const tips={ahorro:savingsRate===null?baseTip:savingsRate>=0.2?`Tu ahorro estimado es ${Math.round(savingsRate*100)}% del ingreso.`:`Tu ahorro estimado es ${Math.round(savingsRate*100)}%. El 20% funciona como referencia, no como regla.`,consistencia:usableMonths<3?`Hay ${usableMonths}/3 meses con ingresos y gastos. Falta historial para medir consistencia.`:`Cerraste ${positiveMonths}/3 meses en positivo.`,deuda:debtRate===null?"Categorizá al menos 70% de los gastos para estimar el peso de las cuotas.":`Las cuotas representan ${Math.round(debtRate*100)}% del ingreso observado.`,fugas:leakRate===null?"Categorizá los gastos para detectar suscripciones y consumos pequeños recurrentes.":`Gastos hormiga y suscripciones representan ${Math.round(leakRate*100)}% del ingreso observado.`,metas:activeGoals.length?`Tenés ${activeGoals.length} meta${activeGoals.length===1?"":"s"} activa${activeGoals.length===1?"":"s"}, con ${Math.round(goalProgress*100)}% de avance promedio.`:"Todavía no configuraste metas. Esto no afecta tu salud financiera.",diversif:holdingTypes.size?`Tu portfolio incluye ${holdingTypes.size} tipo${holdingTypes.size===1?"":"s"} de activo. Esto se muestra como progreso, no como salud.`:"Todavía no cargaste inversiones. Esto no afecta tu salud financiera.",perfil:riskProfile?"Tu perfil de inversión está configurado y se usa sólo en Inversiones.":"Tu perfil de inversión todavía no está configurado."};
  const items=[{key:"ahorro",l:"Capacidad de ahorro",short:"Ahorro",desc:"Balance entre ingresos y gastos observados",v:savingsValue,m:20,tip:tips.ahorro},{key:"consistencia",l:"Consistencia mensual",short:"Constancia",desc:"Meses con balance positivo dentro del historial",v:consistencyValue,m:15,tip:tips.consistencia},{key:"deuda",l:"Control de deuda",short:"Deuda",desc:"Cuotas respecto de los ingresos registrados",v:debtValue,m:15,tip:tips.deuda},{key:"fugas",l:"Gastos recurrentes",short:"Recurrentes",desc:"Suscripciones y consumos pequeños detectados",v:leaksValue,m:15,tip:tips.fugas}];const availableItems=items.filter(item=>item.v!==null);const availablePoints=availableItems.reduce((sum,item)=>sum+item.m,0);const score=status!=="ready"||!availablePoints?null:clamp(Math.round(availableItems.reduce((sum,item)=>sum+item.v,0)/availablePoints*100),0,100);const worst=availableItems.length?availableItems.reduce((currentWorst,item)=>(item.v/item.m)<(currentWorst.v/currentWorst.m)?item:currentWorst):null;tips._worst=worst?`${worst.l}: ${worst.tip}`:baseTip;
  const missing=[];if(current.income<=0)missing.push("Ingresos del mes");if(current.expense<=0)missing.push("Gastos del mes");if(current.expense>0&&!categoryReady)missing.push("Categorías de gastos");
  return{status,score,items,tips,coverage:{usableMonths,requiredMonths:3,categorizedRatio:current.categorizedRatio,hasIncome:current.income>0,hasExpenses:current.expense>0,expenseCount:current.expenseCount},missing,progressItems:[{key:"metas",label:"Metas",detail:activeGoals.length?`${activeGoals.length} activa${activeGoals.length===1?"":"s"} · ${Math.round(goalProgress*100)}% promedio`:"Sin metas activas",done:activeGoals.length>0,view:"goals"},{key:"diversif",label:"Inversiones",detail:holdings.length?`${holdings.length} activo${holdings.length===1?"":"s"} · ${holdingTypes.size} tipo${holdingTypes.size===1?"":"s"}`:"Sin inversiones cargadas",done:holdings.length>0,view:"investments"}],setupItems:[{key:"income",label:"Ingresos",done:current.income>0},{key:"expenses",label:"Gastos",done:current.expense>0},{key:"categories",label:"Categorías",done:categoryReady},{key:"profile",label:"Perfil inversor",done:Boolean(riskProfile)}]};
};

function USDAtmosphere(){
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1}}>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 65% 45% at 70% 20%, rgba(0,180,160,.08) 0%, transparent 65%),radial-gradient(ellipse 50% 60% at 85% 80%, rgba(91,158,255,.06) 0%, transparent 60%),radial-gradient(ellipse 35% 40% at 15% 60%, rgba(91,207,184,.04) 0%, transparent 55%)`}}/>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(rgba(91,207,184,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(91,207,184,.022) 1px, transparent 1px)`,backgroundSize:"48px 48px",animation:"gridDrift 28s linear infinite"}}/>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg, transparent, rgba(91,207,184,.18), transparent)",animation:"scanline 6s ease-in-out infinite"}}/>
    </div>
  );
}

const CSS=`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
:root{
  color-scheme:dark;
  --bg:#09080A;--surface:#121014;--raised:#1B171D;--border:#302936;--hi:#44384B;
  --text:#F5EFE7;--text-mid:#B2A59D;--text-muted:#8D817A;--ink:#09080A;
  --lime:#CCFF47;--lime-d:#AADC28;--mango:#FF9A35;--mango-d:#E07A18;
  --coral:#FF6574;--blue:#67A5FF;--amber:#FFBE45;--teal:#18D7B2;--purple:#C2A7FF;
  --ac:#CCFF47;--acd:#AADC28;--ac-rgb:204,255,71;--ac-bg:rgba(204,255,71,.08);--ac-border:rgba(204,255,71,.25);
  --card-shadow:0 18px 55px rgba(0,0,0,.24);--modal-shadow:0 38px 100px rgba(0,0,0,.72);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%}
html,body{background:var(--bg);color:var(--text);font-family:'Sora',system-ui,sans-serif;overflow:hidden;transition:background .6s ease,color .4s ease}
main{background:radial-gradient(ellipse 70% 45% at 12% 0%,rgba(255,154,53,.035),transparent 62%),var(--bg);transition:background .6s ease}
body.usd-mode{
  --bg:#030814;--surface:#071221;--raised:#0D1B2C;--border:#20344C;--hi:#304D6B;
  --text:#EAF5F7;--text-mid:#A9BEC8;--text-muted:#76909E;--ink:#030814;
  --lime:#63D8C0;--lime-d:#39B9A1;--mango:#FFAB58;--mango-d:#EB8D31;
  --coral:#FF7182;--blue:#76B3FF;--amber:#F3C762;--teal:#63D8C0;--purple:#AEB8FF;
  --card-shadow:0 22px 64px rgba(0,7,20,.36);--modal-shadow:0 42px 110px rgba(0,5,18,.86);
  background:var(--bg)
}
body.usd-mode .card{border-color:var(--border);background:rgba(7,18,33,.9);transition:border-color .3s,box-shadow .3s,background .6s}
body.usd-mode .card:hover{border-color:rgba(91,207,184,.22);box-shadow:0 4px 28px rgba(0,180,160,.07),0 0 0 1px rgba(91,207,184,.08)}
body.usd-mode .inp{background:var(--raised);border-color:var(--border);color:var(--text)}
body.usd-mode .inp:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(91,207,184,.15)}
body.usd-mode .modal{background:var(--surface);border-color:var(--border);box-shadow:var(--modal-shadow)}
body.usd-mode .nav{color:var(--text-muted)}
body.usd-mode .nav:hover{background:rgba(91,207,184,.07);color:var(--text)}
body.usd-mode .nav.on{background:rgba(91,207,184,.09);color:var(--ac)}
body.usd-mode .tabbar{background:var(--raised)}
body.usd-mode .tab{color:var(--text-muted)}
body.usd-mode .tab.on{background:var(--surface);color:var(--ac);box-shadow:0 0 0 1px rgba(91,207,184,.3)}
body.usd-mode .tbl th{color:var(--text-muted)}
body.usd-mode .tbl td{border-color:var(--border)}
body.usd-mode .tbl tr:hover td{background:rgba(91,207,184,.04)}
body.usd-mode .btn.bg{background:var(--raised);border-color:var(--border);color:var(--text-mid)}
body.usd-mode .btn.bg:hover{background:var(--hi);color:var(--text)}
body.usd-mode .prog{background:rgba(91,207,184,.06)}
body.usd-mode .dz{border-color:var(--border)}
body.usd-mode .dz:hover{border-color:var(--ac);background:rgba(91,207,184,.03)}
body.usd-mode ::-webkit-scrollbar-thumb{background:#1C3040}
body.usd-mode .mono{color:#9ECFCC;text-shadow:0 0 14px rgba(91,207,184,.18)}
body.usd-mode main{background:linear-gradient(180deg,rgba(9,20,40,.4) 0%,transparent 40%);transition:background .6s}
body.usd-mode h1,body.usd-mode h2{color:var(--text);transition:color .4s}
::selection{background:rgba(var(--ac-rgb),.22);color:var(--text)}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:var(--hi);border-radius:99px}
@keyframes gridDrift{0%{transform:translate(0,0)}100%{transform:translate(48px,48px)}}
@keyframes scanline{0%,100%{opacity:0;left:-10%}50%{opacity:1;left:110%}}
input,select,textarea,button{font-family:inherit}button{cursor:pointer;border:none;background:none;color:inherit}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.mono{font-family:'DM Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.up{animation:up .35s cubic-bezier(.16,1,.3,1) backwards}
@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.d1{animation-delay:.05s}.d2{animation-delay:.1s}.d3{animation-delay:.15s}.d4{animation-delay:.2s}
@keyframes pulse-glow{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
.nav{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:12px;font-size:13px;font-weight:600;color:var(--text-muted);transition:color .2s,background .2s,transform .2s;width:100%;text-align:left;position:relative}
.nav:hover{color:var(--text);background:rgba(255,154,53,.07);transform:translateX(2px)}
.nav.on{color:var(--ac);background:rgba(var(--ac-rgb),.07)}
.nav.on::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:55%;background:linear-gradient(180deg,var(--ac),var(--acd));border-radius:0 3px 3px 0}
.inp{background:var(--raised);border:1px solid var(--border);border-radius:12px;padding:11px 14px;font-size:13px;color:var(--text);outline:none;transition:border .15s,box-shadow .15s,background .2s;width:100%}
.inp:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(var(--ac-rgb),.12)}
.inp:focus-visible{outline:none}
.inp::placeholder{color:var(--text-muted);opacity:.72}
.app-select{position:relative;min-width:0;width:100%}
.app-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;min-height:42px;cursor:pointer;white-space:nowrap}
.app-select-trigger[aria-expanded="true"]{border-color:var(--ac);box-shadow:0 0 0 3px rgba(var(--ac-rgb),.12)}
.app-select-value{display:flex;align-items:center;gap:9px;min-width:0;flex:1}
.app-select-value>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app-select-chevron{display:flex;color:var(--text-muted);transition:transform .18s,color .18s;flex-shrink:0}
.app-select-trigger[aria-expanded="true"] .app-select-chevron{transform:rotate(180deg);color:var(--ac)}
.app-select-menu{position:fixed;z-index:1200;padding:6px;background:rgba(20,18,22,.98);border:1px solid var(--hi);border-radius:14px;box-shadow:0 22px 60px rgba(0,0,0,.62);backdrop-filter:blur(18px);overflow-y:auto;overscroll-behavior:contain}
body.usd-mode .app-select-menu{background:rgba(7,18,33,.98);border-color:var(--hi)}
.app-select-option{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;color:var(--text-mid);font-size:12px;text-align:left;transition:background .14s,color .14s}
.app-select-option:hover,.app-select-option.active{background:rgba(var(--ac-rgb),.08);color:var(--text)}
.app-select-option[aria-selected="true"]{background:rgba(var(--ac-rgb),.12);color:var(--ac)}
.app-select-option-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app-select-check{width:16px;display:flex;justify-content:center;color:var(--ac);flex-shrink:0}
.category-label{display:inline-flex;align-items:center;gap:8px;min-width:0;vertical-align:middle}
.category-label>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.category-icon{width:27px;height:27px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(var(--ac-rgb),.06);border:1px solid rgba(var(--ac-rgb),.12);color:var(--text-mid);flex-shrink:0}
.app-select-option[aria-selected="true"] .category-icon{color:var(--ac);border-color:rgba(var(--ac-rgb),.22)}
.goal-label{display:inline-flex;align-items:center;gap:7px;min-width:0}
.goal-icon-badge{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:var(--ac-bg);border:1px solid var(--ac-border);color:var(--ac);flex-shrink:0}
.goal-icon-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
.goal-icon-option{min-width:0;min-height:42px;padding:7px 8px;border-radius:10px;border:1px solid var(--border);background:var(--raised);color:var(--text-mid);display:flex;align-items:center;gap:7px;font-size:10px;font-weight:700;text-align:left;cursor:pointer;transition:background .18s,border-color .18s,color .18s,box-shadow .18s}
.goal-icon-option:hover{border-color:var(--hi);background:var(--hi);color:var(--text)}
.goal-icon-option[aria-checked="true"]{border-color:var(--ac);background:var(--ac-bg);color:var(--ac);box-shadow:0 0 0 1px rgba(var(--ac-rgb),.12)}
.goal-icon-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:700;transition:transform .18s,filter .18s,background .18s,border-color .18s,color .18s,box-shadow .18s;white-space:nowrap}
.btn:disabled{opacity:.45;cursor:not-allowed}
.bl{background:linear-gradient(135deg,var(--ac),var(--acd));color:var(--ink);box-shadow:0 8px 28px rgba(var(--ac-rgb),.12)}
.bl:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 6px 24px rgba(var(--ac-rgb),.28)}
.bg{background:var(--raised);color:var(--text-mid);border:1px solid var(--border)}
.bg:hover:not(:disabled){background:var(--hi);color:var(--text);border-color:var(--hi);transform:translateY(-1px)}
.bd{background:rgba(255,95,109,.07);color:#FF5F6D;border:1px solid rgba(255,95,109,.2)}
.bd:hover:not(:disabled){background:rgba(255,95,109,.15)}
.bm{background:rgba(255,154,53,.1);color:#FF9A35;border:1px solid rgba(255,154,53,.25)}
.bm:hover:not(:disabled){background:rgba(255,154,53,.2)}
.bsm{padding:6px 12px;font-size:12px;border-radius:9px}
.card{background:linear-gradient(180deg,var(--surface),var(--surface));border:1px solid var(--border);border-radius:20px;padding:20px;box-shadow:var(--card-shadow);transition:border-color .2s,transform .2s,box-shadow .2s,background .4s}
.card:hover{border-color:var(--hi)}
.csm{border-radius:16px;padding:15px}
.card-glow-lime{border-color:rgba(204,255,71,.2);box-shadow:0 0 0 1px rgba(204,255,71,.05),0 8px 32px rgba(0,0,0,.4)}
.card-glow-mango{border-color:rgba(255,154,53,.25);box-shadow:0 0 0 1px rgba(255,154,53,.06),0 8px 32px rgba(0,0,0,.4)}
.tag{display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600}
.ti{background:rgba(0,212,170,.1);color:var(--teal)}.te{background:rgba(255,95,109,.1);color:var(--coral)}.ts{background:rgba(91,158,255,.1);color:var(--blue)}.tt{background:rgba(128,116,109,.12);color:var(--text-mid)}
.prog{height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden}
.progf{height:100%;border-radius:3px;transition:width .7s cubic-bezier(.16,1,.3,1),background .4s}
.ov{position:fixed;inset:0;background:rgba(3,4,8,.78);backdrop-filter:blur(14px) saturate(120%);display:flex;align-items:center;justify-content:center;z-index:600;padding:16px}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:28px;width:520px;max-width:100%;max-height:min(88vh,760px);overflow-y:auto;box-shadow:var(--modal-shadow)}
.tbl{width:100%;border-collapse:collapse}
.tbl th{padding:10px 14px;font-size:10px;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:.9px;border-bottom:1px solid var(--border);text-align:left;position:sticky;top:0;background:var(--surface);z-index:1}
.tbl td{padding:11px 14px;font-size:13px;border-bottom:1px solid var(--border);vertical-align:middle}
.tbl tr:hover td{background:rgba(255,154,53,.04)}
.tbl tr:last-child td{border-bottom:none}
.tx-actions-cell{width:1%;white-space:nowrap;text-align:right}
.tx-row-actions{display:inline-flex;align-items:center;justify-content:flex-end;gap:6px}
.toast{position:fixed;bottom:24px;right:24px;padding:13px 20px;border-radius:14px;font-size:13px;font-weight:700;z-index:999;animation:up .3s ease;backdrop-filter:blur(16px);box-shadow:0 18px 48px rgba(0,0,0,.35)}
.tok{background:rgba(0,212,170,.12);color:#00D4AA;border:1px solid rgba(0,212,170,.3)}
.terr{background:rgba(255,95,109,.12);color:#FF5F6D;border:1px solid rgba(255,95,109,.3)}
.tinfo{background:rgba(255,154,53,.12);color:#FF9A35;border:1px solid rgba(255,154,53,.3)}
.dots{display:inline-flex;gap:4px;align-items:center}
.dots span{width:5px;height:5px;border-radius:50%;background:currentColor;animation:blink 1.2s infinite}
.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
@keyframes pulse-ring{0%{transform:scale(1);opacity:.8}100%{transform:scale(2.2);opacity:0}}
.tour-pulse{position:fixed;border-radius:inherit;pointer-events:none;z-index:499;animation:pulse-ring .7s cubic-bezier(.2,.6,.4,1) forwards}
.dz{border:1px dashed var(--border);border-radius:18px;padding:38px 24px;text-align:center;transition:border-color .2s,background .2s,transform .2s;cursor:pointer;background:rgba(var(--ac-rgb),.012)}
.dz:hover,.dz.ov2{border-color:var(--ac);background:rgba(var(--ac-rgb),.03)}
.imgdrop{border:1px dashed var(--border);border-radius:18px;min-height:190px;padding:24px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s,transform .2s;overflow:hidden;background:rgba(184,155,255,.012)}
.imgdrop:hover,.imgdrop.ov2{border-color:#B89BFF;background:rgba(184,155,255,.04)}
.g2{display:grid;gap:10px;grid-template-columns:1fr 1fr}
.g3{display:grid;gap:10px;grid-template-columns:1fr 1fr 1fr}
.tabbar{display:flex;gap:3px;background:var(--raised);padding:4px;border:1px solid var(--border);border-radius:14px;width:fit-content;flex-wrap:wrap}
.tab{padding:8px 16px;border-radius:10px;font-size:12px;font-weight:700;transition:color .18s,background .18s,box-shadow .18s;color:var(--text-muted);cursor:pointer}
.tab.on{background:var(--surface);color:var(--ac);box-shadow:0 0 0 1px rgba(var(--ac-rgb),.3),0 6px 18px rgba(0,0,0,.18)}
.tab:hover:not(.on){color:var(--text-mid)}
.chip{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:10px;font-size:11px;font-weight:700;background:var(--raised);border:1px solid var(--border);color:var(--text-mid)}
.sb{background:rgba(204,255,71,.12);color:#CCFF47;border:1px solid rgba(204,255,71,.25)}
.buy{background:rgba(0,212,170,.1);color:#00D4AA;border:1px solid rgba(0,212,170,.22)}
.hld{background:rgba(255,184,48,.1);color:#FFB830;border:1px solid rgba(255,184,48,.22)}
.sel{background:rgba(255,95,109,.1);color:#FF5F6D;border:1px solid rgba(255,95,109,.22)}
.onboarding-shell{min-height:100dvh;padding:24px;overflow:auto;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 20% 50%,rgba(255,154,53,.08) 0%,transparent 58%),radial-gradient(ellipse at 80% 20%,rgba(204,255,71,.05) 0%,transparent 50%),var(--bg)}
.onboarding-panel{width:500px;max-width:100%;max-height:calc(100dvh - 48px);overflow-y:auto;background:linear-gradient(180deg,var(--surface),rgba(18,16,20,.97));border-radius:26px;border:1px solid var(--border);box-shadow:var(--modal-shadow);padding:clamp(22px,4vw,40px)}
.onboarding-panel{scrollbar-gutter:stable}
.onboarding-result{margin-top:24px}
.onboarding-primary:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(var(--ac-rgb),.3)}
.source-meta{margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:10px;color:var(--text-muted)}
.source-meta summary{cursor:pointer;color:var(--text-mid);font-weight:700;list-style:none;display:flex;align-items:center;gap:6px}
.source-meta summary::-webkit-details-marker{display:none}
.source-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.source-links a{max-width:100%;padding:4px 8px;border:1px solid var(--border);border-radius:8px;color:var(--blue);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.source-links a:hover{border-color:var(--blue);background:rgba(91,158,255,.06)}
.period-prompt{display:grid;grid-template-columns:1fr minmax(150px,210px) auto;gap:10px;align-items:center}
.holding-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
.score-axis-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important}
.financial-health-card{container-type:inline-size}
.health-main{display:grid;grid-template-columns:minmax(210px,240px) minmax(0,1fr);gap:20px;align-items:stretch}
.health-summary{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;border-radius:16px;background:rgba(var(--ac-rgb),.025);border:1px solid var(--border);min-height:224px}
.health-ring{--score-angle:0deg;--score-color:var(--text-muted);width:112px;height:112px;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(var(--score-color) var(--score-angle),rgba(255,255,255,.055) 0)}
.health-ring::before{content:"";position:absolute;inset:7px;border-radius:50%;background:var(--surface);border:1px solid var(--border)}
.health-ring-content{position:relative;z-index:1;display:flex;align-items:baseline;justify-content:center;gap:2px}
.health-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.health-metric{padding:12px 13px;border-radius:12px;background:var(--raised);border:1px solid var(--border);min-width:0}
.health-metric-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px}
.health-progress{margin-top:16px;padding-top:15px;border-top:1px solid var(--border);display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px}
.health-progress-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.health-progress-item{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:11px;background:var(--raised);border:1px solid var(--border);min-width:0;text-align:left}
.health-setup{display:flex;gap:6px;flex-wrap:wrap;align-content:flex-start}
.health-setup-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:99px;border:1px solid var(--border);background:var(--raised);font-size:10px;color:var(--text-muted)}
.health-setup-chip.done{color:var(--teal);border-color:rgba(0,212,170,.2);background:rgba(0,212,170,.05)}
.health-setup-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}
@container (max-width:680px){.health-main{grid-template-columns:1fr}.health-summary{min-height:190px}.health-progress{grid-template-columns:1fr}}
@container (max-width:430px){.health-metrics,.health-progress-grid{grid-template-columns:1fr}}
.empty-panel{min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:22px;color:var(--text-muted)}
.empty-panel.compact{min-height:112px;padding:16px}
.empty-panel-icon{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;background:var(--ac-bg);border:1px solid var(--ac-border);color:var(--ac)}
.empty-panel-title{font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px}
.empty-panel-detail{max-width:420px;font-size:11px;line-height:1.55;color:var(--text-muted)}
.empty-panel-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.tx-mobile-list,.preview-mobile{display:none}
body:has(.ov) .tour-guide{visibility:hidden}
body:has(.ov) main{z-index:700!important}
main>div{width:min(100%,1600px);margin-inline:auto}
@media(max-width:1180px){.kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(min-width:481px) and (max-width:768px){.kpi-grid:has(> :nth-child(odd):last-child)>:last-child{grid-column:1/-1}}
@media(max-width:768px){.hide-m{display:none!important}.modal{padding:18px;width:100%;border-radius:20px;max-height:92dvh}.card{padding:15px}.kpi-grid{grid-template-columns:1fr 1fr!important}.trend-grid{grid-template-columns:1fr!important}.g2,.g3{grid-template-columns:1fr!important}.g2>*,.g3>*{grid-column:1/-1!important}.tbl{min-width:640px}.tbl td,.tbl th{padding:8px 9px;font-size:11px}.inv-grid{grid-template-columns:1fr!important}.tabbar{gap:2px;width:100%;overflow-x:auto;flex-wrap:nowrap;justify-content:flex-start;scrollbar-width:none;scroll-snap-type:x proximity}.tabbar::-webkit-scrollbar{display:none}.tab{padding:7px 10px;font-size:11px;flex:0 0 auto;white-space:nowrap;scroll-snap-align:start}.btn{padding:9px 14px;font-size:12px}.toast{left:14px;right:14px;bottom:14px;text-align:center}.mobile-drawer{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-top:max(20px,env(safe-area-inset-top))!important;padding-bottom:max(20px,env(safe-area-inset-bottom))!important}.onboarding-shell{height:100dvh;min-height:0;padding-top:max(14px,env(safe-area-inset-top));padding-right:max(14px,env(safe-area-inset-right));padding-bottom:max(14px,env(safe-area-inset-bottom));padding-left:max(14px,env(safe-area-inset-left));overflow-y:auto;-webkit-overflow-scrolling:touch;align-items:flex-start}.onboarding-panel{max-height:none;border-radius:22px;padding:22px;flex:0 0 auto}.ov{padding-top:max(16px,env(safe-area-inset-top));padding-right:max(16px,env(safe-area-inset-right));padding-bottom:max(16px,env(safe-area-inset-bottom));padding-left:max(16px,env(safe-area-inset-left))}.period-prompt{grid-template-columns:1fr}.period-prompt .btn{width:100%}.holding-metrics{grid-template-columns:1fr 1fr}.source-links{flex-direction:column}.source-links a{white-space:normal;overflow-wrap:anywhere}.tour-guide{left:14px!important;right:14px!important;top:auto!important;bottom:max(12px,env(safe-area-inset-bottom))!important;width:auto!important;max-width:none!important;transform:none!important;padding:11px 13px!important;gap:9px!important;border-radius:14px!important}.tour-guide-arrow{display:none!important}.tour-guide-copy{max-height:96px;overflow-y:auto;overscroll-behavior:contain}.tour-guide-actions{gap:4px!important}body:has(.tour-guide) main{margin-bottom:142px}body:has(.tour-guide) .toast{bottom:154px}}
@media(max-width:480px){.goal-icon-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.goal-icon-option{min-height:40px;padding:6px}}
@media(max-width:480px){.inp{font-size:16px!important}.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.kpi-grid>:last-child:nth-child(odd){grid-column:1/-1}.modal{padding:15px}.ov{padding-top:max(10px,env(safe-area-inset-top));padding-right:max(10px,env(safe-area-inset-right));padding-bottom:max(10px,env(safe-area-inset-bottom));padding-left:max(10px,env(safe-area-inset-left))}.holding-metrics{grid-template-columns:1fr}.preview-actions{display:grid!important;grid-template-columns:1fr;width:100%}.preview-actions .btn{width:100%}.onboarding-panel{padding:18px}.onboarding-result{margin-top:18px!important;margin-bottom:16px!important}.onboarding-allocation{gap:4px!important}.onboarding-allocation>div{min-width:0!important;padding:8px 6px!important;flex:1 1 0}.onboarding-nav{margin-top:20px!important}.tour-guide{left:10px!important;right:10px!important;padding:10px 11px!important}.tour-guide-copy{max-height:82px}.score-axis-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.tx-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.tx-actions .btn{width:100%}.tx-filters{display:grid!important;grid-template-columns:1fr 1fr}.tx-filters>.app-select{width:100%!important;min-width:0!important}.tx-filters>.app-select:nth-child(3){grid-column:1/-1}.tx-desktop-table,.preview-desktop{display:none!important}.tx-mobile-list,.preview-mobile{display:flex;flex-direction:column;gap:9px}.transfer-actions{display:grid!important;grid-template-columns:1fr!important;width:100%}.transfer-actions .btn{width:100%;white-space:normal}.goal-actions:has([data-tour-target="vincular-inv-btn"]){grid-template-columns:minmax(0,1fr) minmax(0,1fr) 42px!important}.goal-actions .btn{min-width:0;padding-inline:7px}.goal-input-actions{display:grid!important;grid-template-columns:minmax(0,1fr) 68px 38px 38px;gap:5px!important}.goal-input-actions .inp{width:100%!important;min-width:0}.goal-input-actions .btn{width:38px;padding:0;justify-content:center}.holding-head{flex-wrap:wrap;align-items:flex-start!important}.holding-copy{min-width:0;overflow-wrap:anywhere}.holding-actions{width:100%;justify-content:flex-end}.holding-link{flex-direction:column;align-items:stretch!important}.holding-link .inp{width:100%!important;min-width:0}.empty-panel-actions{width:100%}.empty-panel-actions .btn{flex:1;min-width:120px}.imgdrop,.dz{padding:24px 18px}.imgdrop>div:last-of-type,.dz>div:last-of-type{overflow-wrap:anywhere}.salary-form{display:grid!important;grid-template-columns:1fr!important}.salary-form>*{min-width:0!important}.salary-form .btn{width:100%}}
@media(max-width:340px){.kpi-grid{grid-template-columns:1fr!important}.kpi-grid>:last-child:nth-child(odd){grid-column:auto}.score-axis-grid{grid-template-columns:1fr!important}.tx-actions,.tx-filters{grid-template-columns:1fr}.tx-filters>select:nth-of-type(3){grid-column:auto}}
@media(max-height:720px) and (min-width:769px){.onboarding-shell{align-items:flex-start}.onboarding-panel{margin-block:8px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}`;

const ic={
  Grid:()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M9 2C6 2 4 4 4 6.5 4 9.5 6.5 10 9 10V2z" fill="currentColor" opacity=".9"/><path d="M11 2c3 0 5 2 5 4.5 0 3-2.5 3.5-5 3.5V2z" fill="currentColor" opacity=".55"/><path d="M9 18C6 18 4 16 4 13.5 4 10.5 6.5 10 9 10v8z" fill="currentColor" opacity=".55"/><path d="M11 18c3 0 5-2 5-4.5 0-3-2.5-3.5-5-3.5v8z" fill="currentColor" opacity=".35"/></svg>,
  Tx:()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 3h10v14l-2-1.3-2 1.3-2-1.3L7 17l-2-1.3V3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 7h4M8 10h5M8 13h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  Target:()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="10" r="1" fill="currentColor"/></svg>,
  Chart:()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M2 14c1.5-3 3-5 5-4s2.5 4 4 4 4.5-5.5 7-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 17h16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".4"/></svg>,
  Import:()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 2.5h6l4 4V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M11 2.5v4h4M9.5 8.5v6M7 12l2.5 2.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Stock:()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 4v8M3.5 7h3M10 7v9M8.5 12h3M15 3v10M13.5 6h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M3 17h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/></svg>,
  Salary:()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4"/><path d="M10 5C8.5 5 7 6.2 7 8c0 2.2 2 2.8 3 3s3 .8 3 3c0 1.8-1.5 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M10 5V3.5M10 17v-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".6"/></svg>,
  Plus:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  X:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Trash:()=><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 6l.8 10.5h6.4L14 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Refresh:()=><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M16 4.5A7.5 7.5 0 104 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M16 4.5V8.5h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Bell:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3C7.5 3 5.5 5 5.5 8c0 4.5-2 5.5-2 5.5h13s-2-1-2-5.5C14.5 5 12.5 3 10 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8.5 16.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  Scan:()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 8V5a1 1 0 011-1h3M12 4h3a1 1 0 011 1v3M16 12v3a1 1 0 01-1 1h-3M8 16H5a1 1 0 01-1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M7 10h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="1.5 1.5"/></svg>,
  Bolt:()=><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M12 2.5L5 11h5.5L8 18.5 16 8.5h-5.5L12 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity=".12"/></svg>,
  Check:()=><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4.5 4.5 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ChevronDown:()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ArrowLeft:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M16 10H4M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ArrowRight:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Shield:()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 2.8 4 5.5v4.2c0 3.7 2.4 6.4 6 7.7 3.6-1.3 6-4 6-7.7V5.5l-6-2.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  Alert:()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 3 2.8 16h14.4L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 7.5v4M10 14.2v.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  Sparkles:()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="m10 2 1.2 4.1L15 8l-3.8 1.9L10 14l-1.2-4.1L5 8l3.8-1.9L10 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="m16 13 .6 1.7 1.4.8-1.4.8L16 18l-.6-1.7-1.4-.8 1.4-.8L16 13Z" stroke="currentColor" strokeWidth="1.2"/></svg>,
  Globe:()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M3 10h14M10 3c2 2 3 4.3 3 7s-1 5-3 7c-2-2-3-4.3-3-7s1-5 3-7Z" stroke="currentColor" strokeWidth="1.2"/></svg>,
  Repeat:()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M15.5 6.5A6.5 6.5 0 0 0 4.4 5L2.8 6.7M2.8 3.5v3.2H6M4.5 13.5A6.5 6.5 0 0 0 15.6 15l1.6-1.7M17.2 16.5v-3.2H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Play:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="m7 4 9 6-9 6V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  Pause:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M7 5v10M13 5v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Menu:()=><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6h14M3 10h10M3 14h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  TrendUp:()=><svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M3 15L8 9l4 3 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 4h4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  TrendDown:()=><svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M3 5l5 6 4-3 6 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 16h4v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Download:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v9M7 9l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 15h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".5"/></svg>,
  Link:()=><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 12.5a4 4 0 005.5 0l2-2a4 4 0 00-5.5-5.5L8.5 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M12 7.5a4 4 0 00-5.5 0l-2 2a4 4 0 005.5 5.5l1.5-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  Edit:()=><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M4 14.5V17h2.5L15.8 7.7l-2.5-2.5L4 14.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M11.8 6.7l2.5 2.5" stroke="currentColor" strokeWidth="1.5"/></svg>,
  Swap:()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3 6h11M11 3l3 3-3 3M17 14H6M9 11l-3 3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};
const IcSalaryKpi=()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 10a7 7 0 1014 0A7 7 0 003 10z" stroke="currentColor" strokeWidth="1.4"/><path d="M10 7c-1 0-2 .7-2 1.7s1 1.5 2 1.7 2 .7 2 1.7-1 1.7-2 1.7M10 7v1M10 13.1V14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const IcIncome=()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 16V8M7 11l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 16h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5"/></svg>;
const IcExpense=()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4v8M7 9l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 16h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5"/></svg>;
const IcBalance=()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M5 7l5-4 5 4M5 13l5 4 5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcPortfolio=()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="3" y="8" width="3" height="9" rx="1" fill="currentColor" opacity=".4"/><rect x="8.5" y="5" width="3" height="12" rx="1" fill="currentColor" opacity=".65"/><rect x="14" y="2" width="3" height="15" rx="1" fill="currentColor" opacity=".9"/></svg>;
const IcInvested=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 16L8 11l4 3 4-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="15.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/></svg>;
const IcFree=()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 3C7 3 5 5.5 5 8c0 3.5 3 5.5 5 7 2-1.5 5-3.5 5-7 0-2.5-2-5-5-5z" stroke="currentColor" strokeWidth="1.4"/></svg>;
const IcScanner=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="9" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M7.5 9a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M13.5 15.5l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
const IcSearch=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M9 5C6.2 5 4 7.2 4 10s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5z" stroke="currentColor" strokeWidth="1.5"/><path d="M13 13.5l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
const IcCompare=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="6" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="11" y="3" width="6" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>;
const IcSaved=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 4h10a1 1 0 011 1v11l-3.5-2L10 16l-2.5-2L4 16V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
const IcImage=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="7.5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3 14l4-4 3 3 2-2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".7"/></svg>;
const IcPdf=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 3h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4"/><path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const IcCsv=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 3h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4"/><path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".7"/></svg>;
const IcText=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M4 9.5h12M4 13h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
const IcGuide=()=><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3C7 3 5 5.5 5 8c0 2 1 3.5 2.5 4.5V15h5v-2.5C14 11.5 15 10 15 8c0-2.5-2-5-5-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 15h4M9 17h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const IcCalendar=()=><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 2.5v3M13 2.5v3M3 8.5h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;

function AppSelect({value,onChange,options=[],placeholder="Seleccionar",ariaLabel,style,className="",disabled=false,compact=false,searchable=false,searchPlaceholder="Buscar…"}){
  const triggerRef=useRef(null);const menuRef=useRef(null);const optionRefs=useRef([]);const listboxId=useId();const [open,setOpen]=useState(false);const [active,setActive]=useState(0);const [query,setQuery]=useState("");const [menuPos,setMenuPos]=useState(null);
  const normalized=useMemo(()=>options.map(option=>typeof option==="string"?{value:option,label:option}:option),[options]);
  const filtered=useMemo(()=>{const q=query.trim().toLocaleLowerCase("es");return q?normalized.filter(option=>String(option.label).toLocaleLowerCase("es").includes(q)):normalized;},[normalized,query]);
  const selected=normalized.find(option=>String(option.value)===String(value));
  const updatePosition=useCallback(()=>{const node=triggerRef.current;if(!node)return;const rect=node.getBoundingClientRect();const width=Math.min(Math.max(rect.width,searchable?260:200),window.innerWidth-24);const left=clamp(rect.left,12,Math.max(12,window.innerWidth-width-12));const below=window.innerHeight-rect.bottom-12;const above=rect.top-12;const opensAbove=below<220&&above>below;const available=Math.max(120,(opensAbove?above:below)-6);setMenuPos({left,width,maxHeight:Math.min(360,available),top:opensAbove?undefined:rect.bottom+6,bottom:opensAbove?window.innerHeight-rect.top+6:undefined});},[searchable]);
  useEffect(()=>{if(!open)return;updatePosition();const outside=event=>{if(!triggerRef.current?.contains(event.target)&&!menuRef.current?.contains(event.target))setOpen(false);};const reposition=()=>updatePosition();document.addEventListener("pointerdown",outside);window.addEventListener("resize",reposition);window.addEventListener("scroll",reposition,true);return()=>{document.removeEventListener("pointerdown",outside);window.removeEventListener("resize",reposition);window.removeEventListener("scroll",reposition,true);};},[open,updatePosition]);
  useEffect(()=>{if(open){setQuery("");const current=Math.max(0,normalized.findIndex(option=>String(option.value)===String(value)));setActive(current);}},[open,normalized,value]);
  useEffect(()=>{if(open)optionRefs.current[active]?.scrollIntoView({block:"nearest"});},[active,open,filtered.length]);
  const choose=option=>{if(!option)return;onChange?.(option.value);setOpen(false);requestAnimationFrame(()=>triggerRef.current?.focus());};
  const handleKey=event=>{if(disabled)return;if(event.key==="Tab"){setOpen(false);return;}if(event.key==="Escape"){event.preventDefault();setOpen(false);triggerRef.current?.focus();return;}if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(!open){setOpen(true);return;}const dir=event.key==="ArrowDown"?1:-1;setActive(index=>(index+dir+filtered.length)%Math.max(filtered.length,1));return;}if((event.key==="Enter"||event.key===" ")&&!open){event.preventDefault();setOpen(true);return;}if(event.key==="Enter"&&open){event.preventDefault();choose(filtered[active]);}};
  const activeDescendant=open&&filtered[active]?`${listboxId}-option-${active}`:undefined;
  const trigger=(<button ref={triggerRef} type="button" className="inp app-select-trigger" style={compact?{padding:"7px 10px",fontSize:11,minHeight:34}:undefined} aria-label={ariaLabel||placeholder} aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} aria-activedescendant={!searchable?activeDescendant:undefined} disabled={disabled} onClick={()=>!disabled&&setOpen(current=>!current)} onKeyDown={handleKey} onBlur={()=>requestAnimationFrame(()=>{if(!menuRef.current?.contains(document.activeElement))setOpen(false);})}><span className="app-select-value">{selected?.icon}{<span style={{color:selected?T.white:T.muted}}>{selected?.label||placeholder}</span>}</span><span className="app-select-chevron"><ic.ChevronDown/></span></button>);
  const menu=open&&menuPos?createPortal(<div ref={menuRef} id={listboxId} className="app-select-menu" role="listbox" aria-label={ariaLabel||placeholder} style={menuPos} onKeyDown={handleKey} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&!triggerRef.current?.contains(event.relatedTarget))setOpen(false);}}>{searchable&&<div style={{position:"sticky",top:-6,zIndex:1,background:"inherit",padding:"4px 4px 7px"}}><input autoFocus className="inp" style={{padding:"8px 10px",fontSize:12,minHeight:36}} value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}} placeholder={searchPlaceholder} aria-label={searchPlaceholder.replace(/…/g,"")} aria-controls={listboxId} aria-activedescendant={activeDescendant}/></div>}{filtered.length?filtered.map((option,index)=><button ref={node=>{optionRefs.current[index]=node;}} id={`${listboxId}-option-${index}`} tabIndex={-1} type="button" role="option" aria-selected={String(option.value)===String(value)} className={`app-select-option${active===index?" active":""}`} key={String(option.value)} onPointerMove={()=>setActive(index)} onClick={()=>choose(option)}>{option.icon}<span className="app-select-option-label">{option.label}</span><span className="app-select-check">{String(option.value)===String(value)&&<ic.Check/>}</span></button>):<div style={{padding:"14px 10px",fontSize:12,color:T.muted,textAlign:"center"}}>Sin resultados</div>}</div>,document.body):null;
  return <div className={`app-select ${className}`.trim()} style={style}>{trigger}{menu}</div>;
}
const CategorySelect=({includeAll=false,...props})=><AppSelect {...props} options={includeAll?[{value:"",label:"Todas las categorías"},...CATEGORY_SELECT_OPTIONS]:CATEGORY_SELECT_OPTIONS} searchable searchPlaceholder="Buscar categoría…"/>;
const Dots=()=><span className="dots"><span/><span/><span/></span>;
const EmptyPanel=({icon="·",title,detail,compact=false,children})=>(<div className={`empty-panel${compact?" compact":""}`}><div className="empty-panel-icon">{icon}</div><div className="empty-panel-title">{title}</div>{detail&&<div className="empty-panel-detail">{detail}</div>}{children&&<div className="empty-panel-actions">{children}</div>}</div>);
function FinancialHealthCard({health,setView}){
  const {status,score,items,coverage,missing,progressItems,setupItems,tips}=health;const hasScore=Number.isFinite(score);const color=!hasScore?T.muted:score>=70?T.teal:score>=45?T.amber:T.coral;const statusCopy=status==="ready"?"Salud calculada":status==="provisional"?"Lectura preliminar":"Datos insuficientes";const detail=status==="ready"?"Basado en tres meses consecutivos con ingresos y gastos.":status==="provisional"?`Hay ${coverage.usableMonths}/3 meses utilizables. El resultado puede cambiar al completar el historial.`:`Falta ${missing.join(" y ").toLocaleLowerCase("es")||"información financiera"} para evitar una lectura engañosa.`;
  return <div>
    <div className="health-main">
      <section className="health-summary" aria-label={`Salud financiera: ${statusCopy}`}>
        <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".9px",fontWeight:700,marginBottom:12}}>Salud financiera</div>
        <div className="health-ring" style={{"--score-angle":hasScore?`${score*3.6}deg`:"0deg","--score-color":color}}><div className="health-ring-content"><span className="mono" style={{fontSize:hasScore?28:34,fontWeight:700,color}}>{hasScore?score:"—"}</span>{hasScore&&<span style={{fontSize:10,color:T.muted}}>/100</span>}</div></div>
        <div style={{fontSize:13,fontWeight:700,color,marginTop:11}}>{statusCopy}</div><div style={{fontSize:10,color:T.muted,lineHeight:1.55,maxWidth:205,marginTop:5}}>{detail}</div>
        {status==="insufficient"&&<div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginTop:12}}>{!coverage.hasIncome&&<button className="btn bg bsm" onClick={()=>setView("salary")}><ic.Salary/>Registrar sueldo</button>}{!coverage.hasExpenses&&<button className="btn bl bsm" onClick={()=>setView("import")}><ic.Import/>Importar gastos</button>}{coverage.hasExpenses&&coverage.categorizedRatio<.7&&<button className="btn bl bsm" onClick={()=>setView("transactions")}><ic.Tx/>Revisar categorías</button>}</div>}
      </section>
      <section>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:10,marginBottom:10,flexWrap:"wrap"}}><div><div style={{fontSize:12,fontWeight:700}}>Indicadores de salud</div><div style={{fontSize:10,color:T.muted,marginTop:3}}>Sólo usan ingresos, gastos, deuda y recurrencia.</div></div><span className="chip" style={{fontSize:9}}>{coverage.usableMonths}/3 meses con evidencia</span></div>
        <div className="health-metrics">{items.map(item=>{const available=item.v!==null;const pct=available?item.v/item.m:0;const metricColor=!available?T.muted:pct>=.8?T.teal:pct>=.45?T.amber:T.coral;return <div className="health-metric" key={item.key}><div className="health-metric-head"><div style={{fontSize:11,fontWeight:700}}>{item.l}</div><span className="mono" style={{fontSize:10,color:metricColor,flexShrink:0}}>{available?`${item.v}/${item.m}`:"Sin datos"}</span></div><div style={{fontSize:10,color:T.muted,lineHeight:1.45,minHeight:29}}>{item.desc}</div><div className="prog" style={{height:4,marginTop:8}}><div className="progf" style={{width:`${pct*100}%`,background:metricColor}}/></div></div>;})}</div>
        <div style={{marginTop:10,padding:"9px 11px",borderRadius:10,background:status==="insufficient"?"rgba(255,255,255,.025)":"rgba(255,184,48,.055)",border:`1px solid ${status==="insufficient"?T.border:"rgba(255,184,48,.18)"}`,fontSize:10,color:status==="insufficient"?T.muted:T.amber,lineHeight:1.5}}>{tips._worst}</div>
      </section>
    </div>
    <div className="health-progress">
      <section><div style={{fontSize:11,fontWeight:700,marginBottom:7}}>Progreso financiero <span style={{fontWeight:400,color:T.muted}}>· fuera del score</span></div><div className="health-progress-grid">{progressItems.map(item=><button key={item.key} className="health-progress-item" onClick={()=>setView(item.view)}><span className="category-icon" style={{color:item.done?T.teal:T.muted}}>{item.key==="metas"?<ic.Target/>:<ic.Stock/>}</span><span style={{minWidth:0,flex:1}}><span style={{display:"block",fontSize:10,fontWeight:700,color:T.white}}>{item.label}</span><span style={{display:"block",fontSize:9,color:T.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.detail}</span></span><ic.ArrowRight/></button>)}</div></section>
      <section><div style={{fontSize:11,fontWeight:700,marginBottom:7}}>Datos del diagnóstico</div><div className="health-setup">{setupItems.map(item=><span key={item.key} className={`health-setup-chip${item.done?" done":""}`}><span className="health-setup-dot"/>{item.label}</span>)}</div><div style={{fontSize:9,color:T.muted,lineHeight:1.5,marginTop:8}}>Completar estos datos mejora la precisión; no suma puntos por sí mismo.</div></section>
    </div>
  </div>;
}
const PH=({title,sub,right})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:10}}><div><h1 style={{fontSize:24,fontWeight:800,color:T.white,letterSpacing:"-1px"}}>{title}</h1>{sub&&<div style={{fontSize:12,color:T.muted,marginTop:4}}>{sub}</div>}</div>{right}</div>);
const CTip=({active,payload,label,dc="ARS"})=>{if(!active||!payload?.length)return null;return <div style={{background:T.raised,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",fontSize:12}}><div style={{color:T.muted,marginBottom:5,fontSize:11}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,display:"flex",gap:12,justifyContent:"space-between"}}><span>{p.name}</span><span className="mono">{dc==="USD"?fUSD(p.value):fARS(p.value)}</span></div>)}</div>;};
function useDsp({displayCurrency,usdRate}){const fmt=useCallback(a=>displayCurrency==="USD"?fUSD(a/usdRate):fARS(a),[displayCurrency,usdRate]);const toDsp=useCallback(a=>displayCurrency==="USD"?a/usdRate:a,[displayCurrency,usdRate]);return{fmt,toDsp};}
function useCurrencyAccent(displayCurrency){return displayCurrency==="USD"?{accent:"#5BCFB8",accentD:"#3ABDA6",accentBg:"rgba(91,207,184,.08)",accentBorder:"rgba(91,207,184,.25)"}:{accent:"#CCFF47",accentD:"#AADC28",accentBg:"rgba(204,255,71,.08)",accentBorder:"rgba(204,255,71,.25)"};}
const sigCls=s=>s==="STRONG BUY"?"sb":s==="BUY"?"buy":s==="HOLD"?"hld":"sel";
function useIsMobile(){const [m,setM]=useState(window.innerWidth<=768);useEffect(()=>{const h=()=>setM(window.innerWidth<=768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return m;}
const insightColorMap={red:{bg:"rgba(255,95,109,.07)",border:"rgba(255,95,109,.2)",text:T.coral},amber:{bg:"rgba(255,184,48,.07)",border:"rgba(255,184,48,.2)",text:T.amber},lime:{bg:"rgba(204,255,71,.07)",border:"rgba(204,255,71,.2)",text:T.lime},blue:{bg:"rgba(91,158,255,.07)",border:"rgba(91,158,255,.2)",text:T.blue},mango:{bg:"rgba(255,154,53,.07)",border:"rgba(255,154,53,.2)",text:T.mango}};
function InsightCard({card,fmt}){const cm=insightColorMap[card.color]||insightColorMap.blue;const TrendIcon=card.trend==="up"?ic.TrendUp:card.trend==="down"?ic.TrendDown:null;const CardIcon={spending:IcExpense,top_category:ic.Chart,investment:IcPortfolio,goal:ic.Target}[card.type]||ic.Sparkles;const trendColor=card.type==="spending"?(card.trend==="up"?T.red:T.lime):(card.trend==="up"?T.lime:card.trend==="down"?T.red:T.mid);return(<div style={{background:cm.bg,border:`1px solid ${cm.border}`,borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:8}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{display:"flex",alignItems:"center",gap:7}}><span className="category-icon" style={{color:cm.text}}><CardIcon/></span><span style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:".6px"}}>{card.title}</span></div>{TrendIcon&&<span style={{color:trendColor,display:"flex",alignItems:"center"}}><TrendIcon/></span>}</div><div className="mono" style={{fontSize:22,fontWeight:700,color:cm.text,letterSpacing:"-0.5px"}}>{card.value}</div><div style={{fontSize:11,color:T.mid,lineHeight:1.5}}>{card.detail}</div></div>);}
function exportData(state){const json=JSON.stringify(state,null,2);const jsonBlob=new Blob([json],{type:"application/json"});const jsonUrl=URL.createObjectURL(jsonBlob);const jsonA=document.createElement("a");jsonA.href=jsonUrl;jsonA.download=`mangos-backup-${new Date().toISOString().slice(0,10)}.json`;jsonA.click();URL.revokeObjectURL(jsonUrl);if(state.transactions?.length){const headers=["Fecha","Descripción","Monto","Tipo","Categoría","Moneda"];const rows=state.transactions.map(t=>[t.date,`"${(t.description||"").replace(/"/g,'""')}"`,t.amount,normalizeTxType(t.type)==="transfer"?"Transferencia interna":txTypeLabel(t.type,t.category),`"${(t.category||"").replace(/"/g,'""')}"`,t.currency||"ARS"].join(","));const csv=[headers.join(","),...rows].join("\n");const csvBlob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});const csvUrl=URL.createObjectURL(csvBlob);const csvA=document.createElement("a");csvA.href=csvUrl;csvA.download=`mangos-transacciones-${new Date().toISOString().slice(0,10)}.csv`;setTimeout(()=>{csvA.click();URL.revokeObjectURL(csvUrl);},300);}}

const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL||"https://ghfnscswtsgnylumcxyp.supabase.co";
const SUPABASE_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY||"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZm5zY3N3dHNnbnlsdW1jeHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzUxOTgsImV4cCI6MjA4OTk1MTE5OH0.dq2Xhy7c7X_kZvGtln5Ko8hl5woYsHGq5hXLSfJQoic";
const SLIDE_MAP={4:{section:"goals",target:"new-goal-btn",tip:"Tocá acá para crear tu primera meta — nombre, monto y fecha límite.",btn:"Crear meta"},6:{section:"dashboard",target:"plan-ahorro-card",tip:"Este es tu plan de ahorro calculado con tu sueldo real.",btn:"Ver plan"},8:{section:"dashboard",target:"kpi-balance",tip:"Tu balance libre es el número que manda todas las decisiones del mes.",btn:"Ver balance",scoreTipKey:"consistencia"},9:{section:"transactions",target:"presupuestos-btn",tip:"Fijá un límite por categoría. La app te avisa antes de que te pases.",btn:"Presupuestos",scoreTipKey:"ahorro"},10:{section:"transactions",target:"recurrentes-btn",tip:"Tus recurrentes activos están acá. Pausá las que no usás.",btn:"Recurrentes"},11:{section:"import",target:"import-image-tab",tip:"Subí un screenshot o CSV de tu banco aquí.",btn:"Importar"},12:{section:"dashboard",target:"generar-resumen",tip:"Generá tu resumen semanal — 4 cards con el análisis de tu semana.",btn:"Generar"},18:{section:"investments",target:"add-holding-btn",tip:"Cargá tu FCI o plazo fijo acá.",btn:"Agregar inversión",scoreTipKey:"diversif"},19:{section:"dashboard",target:"toggle-usd",tip:"Cambiá a USD — todos los números se convierten automáticamente.",btn:"Activar USD"},20:{section:"goals",target:"vincular-inv-btn",tip:"Vincular una inversión a tu meta hace que su valor cuente en el progreso.",btn:"Vincular",fallbackTarget:"add-holding-btn",fallbackSection:"investments",scoreTipKey:"metas"},21:{section:"dashboard",target:"score-card",tip:"Tu Score Financiero resume tu situación en un número.",btn:"Ver score",scoreTipKey:"_worst"},23:{section:"investments",target:"scanner-tab",tip:"El Scanner IA encuentra oportunidades adaptadas a tu perfil.",btn:"Ver scanner"},};
const TOUR_SEQUENCE=[4,6,8,9,10,11,12,18,19,20,21,23];

function TourGuide({setView,scoreTips={}}){
  const TOUR_KEYS=TOUR_SEQUENCE;const LS_KEY="mangos_tour_step";
  const [tip,setTip]=useState(null);const [pos,setPos]=useState(null);
  const [tourStep,setTourStep]=useState(()=>{const s=localStorage.getItem(LS_KEY);return s!==null?parseInt(s):0;});
  const chRef=useRef(null);const modeRef=useRef("local");
  const getAnchor=targetId=>{if(!targetId)return null;const el=document.querySelector(`[data-tour-target="${targetId}"]`);if(!el)return null;const r=el.getBoundingClientRect();const vw=window.innerWidth;const vh=window.innerHeight;if(r.top<0||r.bottom>vh||r.right<0||r.left>vw)return null;const TW=300;const TH=130;if(r.right<260&&r.width<200){return{x:r.right+14,y:Math.max(8,Math.min(r.top+r.height/2-TH/2,vh-TH-8)),side:"right",rect:r};}if(r.height<60){const x=Math.max(8,Math.min(r.left+r.width/2-TW/2,vw-TW-8));const spaceAbove=r.top-8;if(spaceAbove>TH+20){return{x,y:null,bottom:vh-r.top+8,side:"above",rect:r};}return{x,y:r.bottom+8,side:"below",rect:r};}const x=Math.max(8,Math.min(r.left+8,vw-TW-8));const y=Math.max(8,r.top+8);return{x,y,side:"inside",rect:r};};
  const showKey=useCallback(key=>{const mapped=SLIDE_MAP[key]||SLIDE_MAP[String(key)];if(mapped&&mapped.tip){setTip({...mapped,key});setTimeout(()=>{const anchorId=mapped.target||mapped.section;const p=getAnchor(anchorId);setPos(p);},120);}else setTip(null);},[]);
  const next=useCallback(()=>{if(modeRef.current!=="local")return;const n=tourStep+1;if(n>=TOUR_KEYS.length){setTip(null);localStorage.removeItem(LS_KEY);return;}localStorage.setItem(LS_KEY,String(n));setTourStep(n);showKey(TOUR_KEYS[n]);},[tourStep,showKey]);
  const dismiss=useCallback(()=>{setTip(null);localStorage.removeItem(LS_KEY);},[]);
  const doTrigger=useCallback(el=>{const r=el.getBoundingClientRect();const ring=document.createElement("div");ring.className="tour-pulse";ring.style.cssText=`left:${r.left-4}px;top:${r.top-4}px;width:${r.width+8}px;height:${r.height+8}px;border:2px solid var(--ac);border-radius:${getComputedStyle(el).borderRadius||"12px"}`;document.body.appendChild(ring);setTimeout(()=>ring.remove(),800);el.scrollIntoView({behavior:"smooth",block:"nearest"});const tag=el.tagName.toLowerCase();const isClickable=tag==="button"||tag==="a"||el.getAttribute("role")==="button";if(isClickable){setTimeout(()=>el.click(),400);}else{const prev=el.style.outline;el.style.outline=`2px solid var(--ac)`;el.style.outlineOffset="3px";setTimeout(()=>{el.style.outline=prev;el.style.outlineOffset="";},900);}},[]);
  const triggerTarget=useCallback((targetId,sectionId,fallbackTarget,fallbackSection)=>{let el=document.querySelector(`[data-tour-target="${targetId}"]`);if(!el&&fallbackTarget){el=document.querySelector(`[data-tour-target="${fallbackTarget}"]`);if(el&&fallbackSection&&fallbackSection!==sectionId){setView(fallbackSection);setTimeout(()=>{const el2=document.querySelector(`[data-tour-target="${fallbackTarget}"]`);if(el2)doTrigger(el2);},200);return;}}if(!el)el=document.querySelector(`[data-tour-target="${sectionId}"]`);if(!el)return;doTrigger(el);},[]);
  useEffect(()=>{if(tourStep<TOUR_KEYS.length)showKey(TOUR_KEYS[tourStep]);},[]);// eslint-disable-line
  useEffect(()=>{if(!SUPABASE_URL||!SUPABASE_KEY)return;(async()=>{try{const{createClient}=await import("@supabase/supabase-js");const sb=createClient(SUPABASE_URL,SUPABASE_KEY);const ch=sb.channel("charla_live").on("postgres_changes",{event:"UPDATE",schema:"public",table:"charla_state"},payload=>{const{slide,active:isActive}=payload.new;if(!isActive){modeRef.current="local";if(tourStep<TOUR_KEYS.length)showKey(TOUR_KEYS[tourStep]);else setTip(null);return;}modeRef.current="charla";const mapped=SLIDE_MAP[slide]||SLIDE_MAP[String(slide)];if(mapped&&mapped.tip){setTip({...mapped,isCharla:true});setView(mapped.section);setTimeout(()=>{const targetId=mapped.target||mapped.section;const p=getAnchor(targetId);setPos(p);if(mapped.target)triggerTarget(mapped.target,mapped.section,mapped.fallbackTarget,mapped.fallbackSection);},180);}else setTip(null);}).subscribe();chRef.current={sb,ch};}catch(e){console.warn("Supabase TourGuide error",e);}})();return()=>{chRef.current?.sb.removeChannel(chRef.current.ch);};},[]);// eslint-disable-line
  if(!tip)return null;
  const isCharla=tip.isCharla;const ac=isCharla?"rgba(204,255,71,.35)":"rgba(255,154,53,.3)";const acText=isCharla?T.lime:T.mango;
  let tooltipStyle={};let arrowStyle=null;
  if(pos){const W=pos.side==="right"?280:300;if(pos.side==="right"){tooltipStyle={position:"fixed",left:pos.x,top:pos.y,width:W};arrowStyle={position:"absolute",left:-7,top:"50%",marginTop:-7,width:0,height:0,borderTop:"7px solid transparent",borderBottom:"7px solid transparent",borderRight:`7px solid rgba(16,14,18,.97)`};}else if(pos.side==="above"){tooltipStyle={position:"fixed",left:pos.x,bottom:pos.bottom,width:W};arrowStyle={position:"absolute",bottom:-7,left:Math.min(20,W/2-7),width:0,height:0,borderLeft:"7px solid transparent",borderRight:"7px solid transparent",borderTop:`7px solid rgba(16,14,18,.97)`};}else if(pos.side==="below"){tooltipStyle={position:"fixed",left:pos.x,top:pos.y,width:W};arrowStyle={position:"absolute",top:-7,left:Math.min(20,W/2-7),width:0,height:0,borderLeft:"7px solid transparent",borderRight:"7px solid transparent",borderBottom:`7px solid rgba(16,14,18,.97)`};}else{tooltipStyle={position:"fixed",left:pos.x,top:pos.y,width:W};}}else{tooltipStyle={position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",maxWidth:460,width:"calc(100% - 24px)"};}
  return(<div className="tour-guide" style={{...tooltipStyle,background:"rgba(16,14,18,.97)",border:`1px solid ${ac}`,borderRadius:16,padding:"13px 16px",zIndex:500,backdropFilter:"blur(20px)",boxShadow:`0 12px 48px rgba(0,0,0,.75)`,display:"flex",alignItems:"center",gap:11,animation:"up .3s ease",position:"fixed"}}>{arrowStyle&&<div className="tour-guide-arrow" style={arrowStyle}/>}<div className="tour-guide-copy" style={{flex:1,minWidth:0}}><div style={{fontSize:9,fontWeight:800,marginBottom:5,textTransform:"uppercase",letterSpacing:"1px",display:"flex",alignItems:"center",gap:6,color:acText}}><span style={{width:6,height:6,borderRadius:"50%",background:acText,display:"inline-block",animation:isCharla?"pulse-glow 1.2s infinite":"none",boxShadow:`0 0 8px ${acText}`}}/>{isCharla?"Charla en vivo":"Guía Mangos"}</div><div style={{fontSize:12,color:"#E8DDD4",lineHeight:1.6,fontWeight:500}}>{tip.tip}</div>{(()=>{const key=tip.scoreTipKey;if(!key||!scoreTips)return null;const stip=scoreTips[key];if(!stip)return null;return<div style={{fontSize:10,color:T.mango,marginTop:5,paddingTop:5,borderTop:"1px solid rgba(255,154,53,.15)",lineHeight:1.5}}><span style={{fontWeight:700}}>Tu situación: </span>{stip}</div>;})()}</div><div className="tour-guide-actions" style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0,alignItems:"stretch"}}><button onClick={()=>{setView(tip.section);setTimeout(()=>{const targetId=tip.target||tip.section;const p=getAnchor(targetId);setPos(p);if(tip.target)triggerTarget(tip.target,tip.section,tip.fallbackTarget,tip.fallbackSection);},180);}} style={{background:`linear-gradient(135deg,var(--ac),var(--acd))`,color:"#09080A",padding:"6px 12px",borderRadius:"8px",fontSize:"11px",fontWeight:"700",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>{tip.btn}</button><div style={{display:"flex",gap:4}}>{!isCharla&&<button className="btn bg bsm" onClick={next} style={{flex:1,justifyContent:"center",fontSize:11,padding:"4px 8px"}} aria-label="Siguiente paso"><ic.ArrowRight/></button>}<button className="btn bg bsm" style={{flex:1,justifyContent:"center",padding:"4px 8px",fontSize:11}} onClick={dismiss} aria-label="Cerrar guía"><ic.X/></button></div></div></div>);
}

export default function App(){
  const [state,setState]=useState(DEFAULT);
  const [view,setView]=useState("dashboard");
  const [ready,setReady]=useState(false);
  const [toast,setToast]=useState(null);
  const [usdLoading,setUL]=useState(false);
  const currAccent=useCurrencyAccent(state.displayCurrency);
  const [sideOpen,setSO]=useState(false);
  const mainRef=useRef(null);
  const isMobile=useIsMobile();
  useEffect(()=>{hydrate().then(s=>{if(s)setState(p=>({...p,...s}));setReady(true);});},[]);
  useEffect(()=>{if(ready)persist(state);},[state,ready]);
  useEffect(()=>{if(!ready)return;const hasBadDates=state.transactions?.some(t=>typeof t.date==="string"&&(t.date.includes("/")||(t.date.includes("-")&&t.date.indexOf("-")!==4)));if(hasBadDates){const fixed=state.transactions.map(t=>{if(typeof t.date==="string"&&(t.date.includes("/")||(t.date.includes("-")&&t.date.indexOf("-")!==4))){const parts=t.date.split(/[\/\-]/);if(parts.length>=3){const[d,m,y]=parts[0].length===4?[parts[2],parts[1],parts[0]]:[parts[0],parts[1],parts[2]];const year=y.length===2?"20"+y:y;return{...t,date:`${year}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`};}}return t;});setState(s=>({...s,transactions:fixed}));}},[ready,state.transactions]);
  const updateRates=useCallback(async()=>{setUL(true);const r=await fetchUSDRates();if(r){const currentType=state.usdType||"mep";setState(p=>({...p,usdRates:r,usdRate:r[currentType]}));}setUL(false);},[state.usdType]);
  useEffect(()=>{if(ready)updateRates();},[ready,updateRates]);
  useEffect(()=>{const root=document.documentElement;const usd=state.displayCurrency==="USD";root.style.setProperty("--ac",usd?"#5BCFB8":"#CCFF47");root.style.setProperty("--acd",usd?"#3ABDA6":"#AADC28");root.style.setProperty("--ac-rgb",usd?"91,207,184":"204,255,71");root.style.setProperty("--ac-bg",usd?"rgba(91,207,184,.08)":"rgba(204,255,71,.08)");root.style.setProperty("--ac-border",usd?"rgba(91,207,184,.25)":"rgba(204,255,71,.25)");document.documentElement.setAttribute("data-currency",usd?"USD":"ARS");if(usd)document.body.classList.add("usd-mode");else document.body.classList.remove("usd-mode");},[state.displayCurrency]);
  const notify=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),4000);};
  const update=useCallback(patch=>setState(s=>({...s,...patch})),[]);
  const navTo=useCallback(id=>{if(mainRef.current)mainRef.current.scrollTop=0;setView(id);setSO(false);},[]);
  if(!ready)return <><style>{CSS}</style><div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:T.bg,color:T.muted,fontFamily:"Sora",fontSize:14,gap:10}}><Dots/>Cargando</div></>;
  if(!state.onboardingDone)return <><style>{CSS}</style><Onboarding update={update} notify={notify} usdRate={state.usdRate}/></>;
  const pages={dashboard:<Dashboard state={state} update={update} notify={notify} setView={navTo}/>,transactions:<Transactions state={state} update={update} notify={notify} setView={navTo}/>,goals:<Goals state={state} update={update} notify={notify}/>,salary:<SalaryModule state={state} update={update} notify={notify}/>,analytics:<Analytics state={state} update={update} setView={navTo}/>,investments:<Investments state={state} update={update} notify={notify}/>,import:<Import state={state} update={update} notify={notify}/>};
  const nav=[{id:"dashboard",l:"Dashboard",I:ic.Grid},{id:"transactions",l:"Movimientos",I:ic.Tx},{id:"goals",l:"Metas",I:ic.Target},{id:"salary",l:"Sueldo",I:ic.Salary},{id:"analytics",l:"Analíticas",I:ic.Chart},{id:"investments",l:"Inversiones",I:ic.Stock},{id:"import",l:"Importar",I:ic.Import}];
  const CUR=getCUR();
  const alerts=Object.entries(state.budgets||{}).filter(([cat,lim])=>state.transactions.filter(t=>gMonth(t.date)===CUR&&t.category===cat&&t.type==="expense").reduce((s,t)=>s+t.amount,0)>lim*0.8);
  const sidebar=<aside className={isMobile?"mobile-drawer":undefined} style={{width:isMobile?"100%":212,background:T.surface,borderRight:isMobile?"none":`1px solid ${T.border}`,transition:"background .6s,border-color .4s",display:"flex",flexDirection:"column",padding:"20px 12px",gap:2,flexShrink:0,position:"relative",zIndex:10,...(isMobile?{position:"fixed",top:0,left:0,bottom:0,zIndex:300,width:260,transform:sideOpen?"translateX(0)":"translateX(-100%)",transition:"transform .25s cubic-bezier(.16,1,.3,1)",boxShadow:sideOpen?"8px 0 30px rgba(0,0,0,.6)":"none"}:{})}}><div style={{padding:"4px 10px 20px",display:"flex",alignItems:"center",gap:9,justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:9}}><div style={{width:30,height:30,background:"linear-gradient(135deg,rgba(255,154,53,.15),rgba(224,122,24,.1))",borderRadius:12,border:"1px solid rgba(255,154,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}><svg width="22" height="22" viewBox="0 0 28 28" fill="none"><path d="M14 4C9 4 6 8 6 13c0 6 4.5 9.5 8 11 3.5-1.5 8-5 8-11 0-5-3-9-8-9z" fill="#FF9A35"/><path d="M14 4C14 4 14 1 17.5 1.5" stroke="#CCFF47" strokeWidth="1.8" strokeLinecap="round"/><ellipse cx="11.5" cy="13" rx="2" ry="3.5" fill="#E07A18" opacity=".4" transform="rotate(-15 11.5 13)"/></svg></div><div style={{fontSize:14,fontWeight:800,letterSpacing:"-.5px",background:"linear-gradient(135deg,#F2EBE0,#FF9A35)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Mangos</div></div>{isMobile&&<button aria-label="Cerrar menú" onClick={()=>setSO(false)} style={{color:T.muted,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center"}}><ic.X/></button>}</div>{nav.map(({id,l,I})=>(<button key={id} data-tour-target={id} className={`nav${view===id?" on":""}`} onClick={()=>navTo(id)}><I/>{l}{id==="investments"&&state.savedAnalyses?.length>0&&<span style={{marginLeft:"auto",fontSize:10,background:T.raised,padding:"2px 6px",borderRadius:99,color:T.muted}}>{state.savedAnalyses.length}</span>}</button>))}<div style={{flex:1}}/>{alerts.length>0&&<div onClick={()=>navTo("transactions")} style={{background:"rgba(255,184,48,.08)",border:`1px solid rgba(255,184,48,.2)`,borderRadius:10,padding:"9px 12px",cursor:"pointer",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.amber,fontWeight:600}}><ic.Bell/>{alerts.length} alerta{alerts.length>1?"s":""}</div></div>}
  <div style={{background:T.raised,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:state.displayCurrency==="USD"?7:10}}>
      <span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".7px",fontWeight:600}}>Cotización Dólar</span>
      {usdLoading?<Dots/>:<button type="button" onClick={updateRates} aria-label="Actualizar cotizaciones" title="Actualizar cotizaciones" style={{width:28,height:28,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.mango,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><ic.Refresh/></button>}
    </div>
    {state.displayCurrency==="USD"&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:9,fontWeight:700,color:"#5BCFB8",marginBottom:9}}><span style={{width:6,height:6,borderRadius:"50%",background:"#5BCFB8",boxShadow:"0 0 8px rgba(91,207,184,.65)"}}/>Visualización en USD</div>}
    <div data-tour-target="currency-toggle" style={{display:"flex",background:T.bg,borderRadius:8,padding:3,marginBottom:12}}>
      {[{id:"oficial",l:"Oficial"},{id:"mep",l:"MEP"},{id:"blue",l:"Blue"}].map(t=>(<button key={t.id} onClick={()=>{update({usdType:t.id,usdRate:state.usdRates?.[t.id]||state.usdRate});}} style={{flex:1,padding:"6px 0",fontSize:10,fontWeight:600,color:state.usdType===t.id?"#09080A":T.muted,background:state.usdType===t.id?T.lime:"transparent",borderRadius:6,transition:"all .2s"}}>{t.l}</button>))}
    </div>
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:9,color:T.muted,marginBottom:3}}>1 USD equivale a</div>
      <div className="mono" style={{fontSize:24,fontWeight:600,color:currAccent.accent,transition:"color .4s"}}>{fQuoteARS(state.usdRate)}</div>
    </div>
    <div style={{display:"flex",gap:6,marginTop:14}}>
      {["ARS","USD"].map(c=>(<button key={c} data-tour-target={!isMobile&&c==="USD"?"toggle-usd":undefined} onClick={()=>update({displayCurrency:c})} style={{flex:1,padding:"6px 0",borderRadius:8,fontSize:10,fontWeight:600,border:`1px solid ${state.displayCurrency===c?(c==="USD"?"rgba(91,207,184,.4)":"rgba(204,255,71,.35)"):T.border}`,background:state.displayCurrency===c?(c==="USD"?"rgba(91,207,184,.1)":"rgba(204,255,71,.08)"):T.surface,color:state.displayCurrency===c?(c==="USD"?"#5BCFB8":T.lime):T.muted,cursor:"pointer",transition:"all .3s"}}>{c}</button>))}
    </div>
  </div>
  <div style={{fontSize:9,color:T.muted,textAlign:"left",marginTop:16,lineHeight:1.4,padding:"0 10px",display:"flex",alignItems:"flex-start",gap:6}}><span style={{color:T.amber,display:"flex",marginTop:1}}><ic.Alert/></span><span>Mangos es una herramienta educativa y de gestión personal. No constituye asesoramiento financiero.</span></div>
  <button onClick={()=>exportData(state)} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"8px 12px",marginTop:8,borderRadius:9,border:`1px solid ${T.border}`,background:"none",color:T.muted,fontSize:11,cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.color=T.white} onMouseLeave={e=>e.currentTarget.style.color=T.muted}><ic.Download/>Exportar mis datos</button>
  </aside>;
  return(<div style={{display:"flex",height:"100dvh",overflow:"hidden",background:T.bg}}><style>{CSS}</style>{state.displayCurrency==="USD"&&<USDAtmosphere/>}{isMobile?<>{sideOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:299}} onClick={()=>setSO(false)}/>}{sidebar}</>:sidebar}{isMobile&&<div style={{position:"fixed",top:0,left:0,right:0,height:52,background:T.surface,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 14px",gap:8,zIndex:100}}><button aria-label="Abrir menú" onClick={()=>setSO(true)} style={{color:T.white,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center"}}><ic.Menu/></button><div style={{fontSize:14,fontWeight:800,letterSpacing:"-.4px",background:"linear-gradient(135deg,#F2EBE0,#FF9A35)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Mangos</div><div style={{flex:1}}/><button data-tour-target="toggle-usd" aria-label={`Cambiar visualización a ${state.displayCurrency==="USD"?"ARS":"USD"}`} onClick={()=>update({displayCurrency:state.displayCurrency==="USD"?"ARS":"USD"})} className="mono" style={{fontSize:10,color:"var(--ac)",padding:"7px 8px",borderRadius:9,border:`1px solid ${currAccent.accentBorder}`,background:currAccent.accentBg,whiteSpace:"nowrap"}}>{state.displayCurrency} · {state.displayCurrency==="USD"?fUSD(1):fARS(state.usdRate)}</button></div>}<main ref={mainRef} style={{flex:1,minWidth:0,overflow:"auto",padding:isMobile?"66px 14px 20px":"28px 32px",transition:"background .6s",position:"relative",zIndex:2}}>{pages[view]}</main>{toast&&<div className={`toast t${toast.type}`}>{toast.msg}</div>}<TourGuide setView={navTo} scoreTips={healthScore(state.transactions||[],state.goals||[],state.holdings||[],state.salaries||[],state.riskProfile,state.marketPrices||{},state.usdRate).tips}/></div>);
}

function Onboarding({update,notify,usdRate=1350}){
  const [step,setStep]=useState(0);const [d,setD]=useState({name:"",income:"",incomeCurrency:"ARS",goalName:"",goalAmt:"",goalDate:""});const [ans,setAns]=useState([null,null,null,null]);const STEPS=6;const pickAns=(qi,val)=>{const a=[...ans];a[qi]=val;setAns(a);};const riskScore=ans.slice(0,3).reduce((sum,value)=>sum+(value||0),0);const profile=riskScore<=3?"conservador":riskScore<=6?"moderado":"agresivo";const horizon=HORIZONS[ans[3]??0]?.value||"under_6m";const horizonInfo=HORIZONS.find(item=>item.value===horizon)||HORIZONS[0];const allocation=ALLOCATION_MATRIX[horizon][profile];
  const profileData={conservador:{icon:<svg width="28" height="28" viewBox="0 0 20 20" fill="none"><path d="M10 3 4 6v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V6l-6-3Z" stroke="#5B9EFF" strokeWidth="1.5"/><path d="m7 10 2 2 4-4" stroke="#5B9EFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,label:"Conservador",color:"#5B9EFF",desc:"Preferís estabilidad y tolerás poca variación en el valor."},moderado:{icon:<svg width="28" height="28" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M5 6h10M5 6l-3 6h6L5 6ZM15 6l-3 6h6l-3-6ZM7 17h6" stroke="#FFB830" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,label:"Moderado",color:"#FFB830",desc:"Aceptás variaciones acotadas para buscar crecimiento en el tiempo."},agresivo:{icon:<svg width="28" height="28" viewBox="0 0 20 20" fill="none"><path d="m3 15 5-5 3 3 6-8" stroke="#FF5F6D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 5h4v4" stroke="#FF5F6D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,label:"Agresivo",color:"#FF5F6D",desc:"Tolerás variaciones altas para priorizar crecimiento de largo plazo."}};
  const pf=profileData[profile];const horizonExplanation=horizon==="under_6m"?"Como vas a necesitar el dinero pronto, el plazo limita el riesgo aunque tu tolerancia sea mayor.":horizon==="6_to_12m"?"El plazo sigue siendo corto: priorizamos liquidez y estabilidad antes que rendimiento.":"El plazo permite incorporar más variación, siempre dentro de tu tolerancia al riesgo.";
  const QS=[{title:"Experiencia",sub:"¿Cuánto sabés de inversiones?",icon:<svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M4 5h12v9a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 5V3h6v2M4 5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,opts:[{l:"Nunca invertí",d:"Ni plazo fijo ni fondos",v:0},{l:"Plazo fijo o FCI",d:"Instrumentos básicos",v:1},{l:"Acciones, bonos o CEDEARs",d:"Mercado de capitales",v:2},{l:"Trading activo u opciones",d:"Operaciones avanzadas",v:3}]},{title:"Colchón financiero",sub:"¿Tenés un fondo de emergencia?",icon:<svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M3 9l7-5 7 5v8a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" stroke="currentColor" strokeWidth="1.4"/><path d="M8 18v-5h4v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,opts:[{l:"No, vivo al día",d:"Sin ahorro de respaldo",v:0},{l:"Algo, pero no llega a 3 meses",d:"Colchón parcial",v:1},{l:"Sí, 3 a 6 meses cubiertos",d:"Buen respaldo",v:2},{l:"Más de 6 meses",d:"Muy sólido",v:3}]},{title:"Tolerancia al riesgo",sub:"Si tu inversión baja 25% en un mes...",icon:<svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M3 6l4 5 4-3 3 5 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".4"/></svg>,opts:[{l:"Vendo todo inmediatamente",d:"No puedo tolerar pérdidas",v:0},{l:"Vendo una parte",d:"Bajo exposición",v:1},{l:"No toco nada, espero",d:"Confío en la recuperación",v:2},{l:"Compro más aprovechando",d:"Oportunidad en la caída",v:3}]},{title:"Horizonte temporal",sub:"¿Cuándo vas a necesitar la plata?",icon:<svg width="22" height="22" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,opts:[{l:"Menos de 6 meses",d:"Muy corto plazo",v:0},{l:"6 meses a 1 año",d:"Corto plazo",v:1},{l:"1 a 3 años",d:"Mediano plazo",v:2},{l:"Más de 3 años",d:"Largo plazo",v:3}]}];
  const finish=()=>{const rawBase=px(d.income);const conversionRate=Number(usdRate)||1350;const base=d.incomeCurrency==="USD"?rawBase*conversionRate:rawBase;const CUR=getCUR();const patch={onboardingDone:true,riskProfile:{risk:profile,horizon,horizonLabel:horizonInfo.label,allocation:{liquidity:allocation[0],fixedIncome:allocation[1],variableIncome:allocation[2]},monthlyIncome:base,incomeCurrency:d.incomeCurrency,incomeRaw:rawBase,riskScore,answers:ans},lastSalaryBase:rawBase,lastSalaryCurrency:d.incomeCurrency,salaries:base>0?[{month:CUR,base,originalBase:rawBase,baseCurrency:d.incomeCurrency,extras:[]}]:[]};update(patch);notify("Perfil guardado ✓");};
  const canNext=step===0?true:step>=1&&step<=4?ans[step-1]!==null:true;
  return(<div className="onboarding-shell"><div className="onboarding-panel"><div style={{fontSize:10,color:T.muted,textAlign:"center",background:"rgba(255,255,255,0.025)",border:`1px solid ${T.border}`,padding:"10px 12px",borderRadius:10,lineHeight:1.55}}>Al continuar, entendés que esta app es para organización personal y no reemplaza la consulta con un asesor idóneo o matriculado.</div>
  <div aria-label={`Paso ${step+1} de ${STEPS}`} style={{display:"flex",gap:8,marginTop:20}}>{Array.from({length:STEPS}).map((_,i)=><div key={i} aria-current={i===step?"step":undefined} style={{flex:1,height:3,borderRadius:3,background:i<step?T.lime:i===step?T.mango:T.raised,transition:"background .3s"}}/>)}</div>
  {step===0&&<><div style={{fontSize:22,fontWeight:800,marginBottom:6,letterSpacing:"-.5px",marginTop:20}}>Bienvenido a Mangos 🥭</div><div style={{fontSize:13,color:T.muted,marginBottom:24}}>Tomá el control de tu dinero</div><div style={{display:"flex",flexDirection:"column",gap:12}}><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Tu nombre (opcional)</label><input className="inp" placeholder="ej: Martín" value={d.name} onChange={e=>setD(p=>({...p,name:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Sueldo neto mensual</label><div style={{display:"flex",gap:8,minWidth:0}}><input className="inp" style={{flex:1,minWidth:0}} placeholder={d.incomeCurrency==="ARS"?"ej: 800000":"ej: 1200"} value={d.income} onChange={e=>setD(p=>({...p,income:e.target.value}))}/><div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`,flexShrink:0}}>{["ARS","USD"].map(c=><button key={c} onClick={()=>setD(p=>({...p,incomeCurrency:c}))} style={{padding:"8px 12px",fontSize:12,fontWeight:600,background:d.incomeCurrency===c?"rgba(200,255,87,.15)":T.raised,color:d.incomeCurrency===c?T.lime:T.muted,border:"none",cursor:"pointer"}}>{c}</button>)}</div></div></div></div></>}
  {step>=1&&step<=4&&<><div style={{width:44,height:44,borderRadius:14,background:"rgba(255,154,53,.1)",border:"1px solid rgba(255,154,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",color:T.mango,marginBottom:22,marginTop:12}}>{QS[step-1].icon}</div><div style={{fontSize:22,fontWeight:800,marginBottom:4,letterSpacing:"-.5px"}}>{QS[step-1].title}</div><div style={{fontSize:13,color:T.muted,marginBottom:20}}>{QS[step-1].sub}</div><div role="radiogroup" aria-label={QS[step-1].title} style={{display:"flex",flexDirection:"column",gap:8}}>{QS[step-1].opts.map(o=><button role="radio" aria-checked={ans[step-1]===o.v} key={o.v} onClick={()=>pickAns(step-1,o.v)} style={{display:"block",width:"100%",padding:"13px 16px",borderRadius:12,border:`1.5px solid ${ans[step-1]===o.v?T.lime:T.border}`,background:ans[step-1]===o.v?"rgba(200,255,87,.08)":T.raised,textAlign:"left",cursor:"pointer",transition:"all .15s"}}><div style={{fontSize:13,fontWeight:600,color:ans[step-1]===o.v?T.lime:T.white}}>{o.l}</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>{o.d}</div></button>)}</div></>}
  {step===5&&<div className="onboarding-result" style={{marginBottom:24}}><div style={{display:"flex",alignItems:"center",gap:13,marginBottom:14}}><div style={{width:56,height:56,borderRadius:18,background:`${pf.color}18`,border:`1px solid ${pf.color}35`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{pf.icon}</div><div style={{minWidth:0}}><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".8px",fontWeight:700}}>Tu perfil de inversión</div><div style={{fontSize:24,fontWeight:800,letterSpacing:"-.5px",color:pf.color,marginTop:2}}>{pf.label}</div></div></div><div style={{fontSize:12,color:T.mid,lineHeight:1.55}}>{pf.desc}</div><div className="chip" style={{marginTop:12,color:T.white,borderColor:`${pf.color}35`}}><IcCalendar/> Horizonte · {horizonInfo.label}</div><div style={{fontSize:11,color:T.muted,lineHeight:1.55,marginTop:10}}>{horizonExplanation}</div><div style={{fontSize:11,fontWeight:700,marginTop:18,marginBottom:8}}>Distribución orientativa para este horizonte</div><div aria-label={`Liquidez ${allocation[0]}%, renta fija ${allocation[1]}%, renta variable ${allocation[2]}%`} style={{height:10,display:"flex",overflow:"hidden",borderRadius:99,background:T.raised}}>{[{p:allocation[0],c:T.teal},{p:allocation[1],c:T.blue},{p:allocation[2],c:T.coral}].map((segment,index)=><div key={index} style={{width:`${segment.p}%`,background:segment.c,transition:"width .4s"}}/>)}</div><div className="onboarding-allocation" style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6,marginTop:9}}>{[{l:"Liquidez",p:allocation[0],c:T.teal},{l:"Renta fija",p:allocation[1],c:T.blue},{l:"Renta variable",p:allocation[2],c:T.coral}].map(segment=><div key={segment.l} style={{background:T.raised,borderRadius:10,padding:"9px 7px",textAlign:"center",minWidth:0}}><div className="mono" style={{fontSize:16,fontWeight:700,color:segment.c}}>{segment.p}%</div><div style={{fontSize:9,color:T.muted,marginTop:3}}>{segment.l}</div></div>)}</div><div style={{fontSize:9,color:T.muted,lineHeight:1.5,marginTop:10}}>Orientación educativa; no constituye una recomendación de inversión individual.</div></div>}
  <div className="onboarding-nav" style={{display:"flex",gap:10,marginTop:28}}>{step>0&&<button className="btn bg" style={{flex:.4,justifyContent:"center"}} onClick={()=>setStep(s=>s-1)}><ic.ArrowLeft/> Atrás</button>}<button className="onboarding-primary" onClick={step<5?()=>setStep(s=>s+1):finish} disabled={!canNext} style={{flex:1,justifyContent:"center",display:"flex",alignItems:"center",gap:7,padding:"11px 20px",borderRadius:12,background:!canNext?"#2A2025":"linear-gradient(135deg,var(--ac),var(--acd))",color:"#09080A",fontWeight:700,fontSize:14,border:"none",cursor:canNext?"pointer":"not-allowed",transition:"all .18s",opacity:canNext?1:.45}}>{step===5?<><ic.Check/> Guardar perfil</>:<>Continuar <ic.ArrowRight/></>}</button></div></div></div>);
}

function Dashboard({state,update,notify,setView}){
  const {transactions,goals,budgets,weeklyInsight,weeklyInsightDate,salaries,marketPrices={},holdings=[],usdRate,riskProfile}=state;
  const {fmt,toDsp}=useDsp(state);
  const [loadingIns,setLI]=useState(false);
  const isMobile=useIsMobile();
  const NOW=getNow();const CUR=getCUR();
  const cur=transactions.filter(t=>gMonth(t.date)===CUR);
  const prevM=(()=>{const d=new Date(NOW.getFullYear(),NOW.getMonth()-1,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;})();
  const prev=transactions.filter(t=>gMonth(t.date)===prevM);
  const incomeParts=getMonthIncomeParts(salaries,transactions,CUR);
  const salary=incomeParts.base;
  const inc=incomeParts.total;
  const exp=cur.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const pExp=prev.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const delta=pExp>0?((exp-pExp)/pExp*100).toFixed(1):null;
  const financialHealth=healthScore(transactions,goals,holdings,salaries,riskProfile,marketPrices,usdRate);
  const {disponible,perGoal}=goalPlan(goals,salaries,transactions,holdings,marketPrices,usdRate);
  const alerts=Object.entries(budgets||{}).filter(([cat,lim])=>cur.filter(t=>t.category===cat&&t.type==="expense").reduce((s,t)=>s+t.amount,0)>lim*0.8);
  const trend=Array.from({length:6},(_,i)=>{const d=new Date(NOW.getFullYear(),NOW.getMonth()-5+i,1);const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;const txs=transactions.filter(t=>gMonth(t.date)===m);return{name:MOS[d.getMonth()],Gastos:toDsp(txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)),Ingresos:toDsp(getMonthIncomeParts(salaries,transactions,m).total)};});
  const hasTrendData=trend.some(m=>m.Gastos>0||m.Ingresos>0);
  const cm={};cur.filter(t=>t.type==="expense").forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});
  const palette=CPAL[state.displayCurrency==="USD"?"USD":"ARS"];
  const catData=Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v],i)=>({name:categoryName(k),value:toDsp(v),color:palette[i]}));
  const recent=[...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  let portfolioValue=0;let portfolioInvested=0;
  holdings.forEach(h=>{const {invArs,curArs}=calcHoldingValueArs(h,marketPrices,usdRate);portfolioInvested+=invArs;portfolioValue+=curArs;});
  const portfolioPnL=portfolioValue-portfolioInvested;
  const hasBalanceEvidence=inc>0&&exp>0;const kpis=[{l:"Sueldo del mes",v:salary>0?fmt(salary):"-",c:T.mango,i:<IcSalaryKpi/>,sub:salary>0?"Registrado":"Registrá tu sueldo"},{l:"Ingresos",v:fmt(inc),c:T.teal,i:<IcIncome/>,sub:"Total mensual"},{l:"Gastos",v:fmt(exp),c:exp>0?T.coral:T.muted,i:<IcExpense/>,sub:delta?`${delta>0?"+":""}${delta}% vs mes ant.`:exp>0?"Sin comparativa":"Falta registrar gastos"},{l:"Balance libre",v:hasBalanceEvidence?fmt(inc-exp):"—",c:hasBalanceEvidence?((inc-exp)>=0?T.lime:T.coral):T.muted,i:<IcBalance/>,sub:!hasBalanceEvidence?"Datos insuficientes":(inc-exp)>=0?"Superávit":"Déficit"},{l:"Portfolio Real",v:fmt(portfolioValue),c:portfolioPnL>=0?T.blue:T.amber,i:<IcPortfolio/>,sub:portfolioValue>0?`P&L: ${portfolioPnL>=0?"+":""}${fmt(portfolioPnL)}`:"Sin inversiones"}];
  const refreshInsight=async()=>{if(transactions.length<3)return notify("Necesitás más transacciones","info");setLI(true);try{const ins=await genWeeklyInsight(transactions,goals,usdRate,portfolioValue,portfolioInvested,holdings);update({weeklyInsight:ins,weeklyInsightDate:todayISO()});notify("Resumen actualizado ✓");}catch(e){notify(e.message||"No se pudo generar el resumen","err");}finally{setLI(false);}};
  return(<div className="up">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:".8px",marginBottom:5}}>{NOW.toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}</div><h1 style={{fontSize:isMobile?22:28,fontWeight:800,letterSpacing:"-1px"}}>Dashboard</h1></div>
      {alerts.length>0&&<div style={{background:"rgba(255,184,48,.08)",border:`1px solid rgba(255,184,48,.25)`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.amber,cursor:"pointer"}} onClick={()=>setView("transactions")}><ic.Bell/>{alerts.length} alerta{alerts.length>1?"s":""}</div>}
    </div>
    <div className="kpi-grid dashboard-kpis" style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:12,marginBottom:14}}>{kpis.map((k,i)=>(<div key={i} className={`card csm up d${i+1}${i===0?" card-glow-mango":i===3?" card-glow-lime":""}`} data-tour-target={i===3?"kpi-balance":undefined} style={{cursor:i===0?"pointer":"default"}} onClick={i===0?()=>setView("salary"):undefined}><div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",fontWeight:600}}>{k.l}</span><span style={{color:k.c,opacity:.8,display:"flex",alignItems:"center"}}>{k.i}</span></div><div className="mono" title={k.v} style={{fontSize:isMobile?16:20,fontWeight:500,color:k.c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.v}</div><div style={{fontSize:11,color:T.muted,marginTop:4}}>{k.sub}</div></div>))}</div>
    {perGoal.length>0&&hasBalanceEvidence&&(<div data-tour-target="plan-ahorro-card" className="card up d2" style={{marginBottom:14,borderColor:"rgba(200,255,87,.18)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}><div style={{fontSize:13,fontWeight:700}}>Plan de ahorro para metas</div><div style={{fontSize:11,color:T.muted}}>Disponible: <span className="mono" style={{color:disponible>0?T.lime:T.red}}>{fmt(disponible)}</span></div></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{perGoal.map(g=>(<div key={g.id} style={{flex:1,minWidth:160,background:T.raised,borderRadius:10,padding:"10px 14px",border:`1px solid ${g.feasible?T.border:"rgba(255,184,48,.25)"}`}}><div style={{fontSize:12,marginBottom:6}}><GoalLabel goal={g} compact/></div><div className="mono" style={{fontSize:16,fontWeight:600,color:g.feasible?T.lime:T.amber}}>{fmt(g.needed)}<span style={{fontSize:11,fontWeight:400,color:T.muted}}>/mes</span></div><div style={{fontSize:10,color:T.muted,marginTop:2}}>{g.months} mes{g.months>1?"es":""} · Falta {fmt(g.rem)}</div>{!g.feasible&&<div style={{fontSize:10,color:T.amber,marginTop:3}}>Ajustá el plazo</div>}{g.couldUsePortfolio&&<div style={{fontSize:10,color:T.blue,marginTop:3}}>Portfolio cubre {g.portfolioCover}%</div>}</div>))}</div></div>)}
    <div data-tour-target="resumen-ia" className="card up d2" style={{marginBottom:14,borderColor:weeklyInsight?"rgba(200,255,87,.12)":T.border}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:weeklyInsight?14:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,background:"rgba(167,139,250,.1)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}><ic.Bolt/></div>
          <div><div style={{fontSize:12,fontWeight:700}}>Resumen semanal IA</div>{weeklyInsightDate&&<div style={{fontSize:10,color:T.muted}}>{weeklyInsightDate}</div>}</div>
        </div>
        <button data-tour-target="generar-resumen" className="btn bg bsm" onClick={refreshInsight} disabled={loadingIns}>{loadingIns?<Dots/>:<><ic.Refresh/>{weeklyInsight?"Actualizar":"Generar"}</>}</button>
      </div>
      {weeklyInsight?.headline&&<div style={{fontSize:13,fontWeight:600,color:T.white,marginBottom:12}}>{weeklyInsight.headline}</div>}
      {weeklyInsight?.cards?.length>0?(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>{weeklyInsight.cards.map((card,i)=>(<InsightCard key={i} card={card} fmt={fmt}/>))}</div>):!weeklyInsight&&(<div style={{marginTop:10,fontSize:12,color:T.muted,textAlign:"center",padding:"6px 0"}}>Generá tu resumen semanal inteligente con cards de análisis</div>)}
    </div>
    <div className="trend-grid" style={{display:"grid",gridTemplateColumns:"1fr",gap:14,marginBottom:14}}>
      <div className="card up d2"><div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Últimos 6 meses</div>{hasTrendData?<div style={{width:"100%",minWidth:0,overflow:"hidden"}}><ResponsiveContainer width="100%" height={isMobile?175:220}><AreaChart data={trend}><defs><linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.teal} stopOpacity={.25}/><stop offset="95%" stopColor={T.teal} stopOpacity={0}/></linearGradient><linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.red} stopOpacity={.25}/><stop offset="95%" stopColor={T.red} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/><Tooltip content={<CTip dc={state.displayCurrency}/>}/><Area type="monotone" dataKey="Ingresos" stroke={T.teal} fill="url(#gi)" strokeWidth={2}/><Area type="monotone" dataKey="Gastos" stroke={T.red} fill="url(#ge)" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>:<EmptyPanel compact icon={<ic.Chart/>} title="Todavía no hay historial" detail="Registrá tu sueldo o importá movimientos para ver la evolución mensual."><button className="btn bg bsm" onClick={()=>setView("salary")}>Registrar sueldo</button><button className="btn bl bsm" onClick={()=>setView("import")}>Importar</button></EmptyPanel>}</div>
      <div data-tour-target="score-card" className="card up d3 financial-health-card" style={{gridColumn:"1/-1"}}><FinancialHealthCard health={financialHealth} setView={setView}/></div>
    </div>
    <div className="trend-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div className="card up d3"><div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Últimos movimientos</div>
        {recent.length===0?<EmptyPanel compact icon={<ic.Tx/>} title="Sin movimientos todavía" detail="Importá un extracto o cargá tu primer movimiento."><button className="btn bg bsm" onClick={()=>setView("transactions")}>Agregar</button><button className="btn bl bsm" onClick={()=>setView("import")}>Importar</button></EmptyPanel>:recent.map(t=>(<div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${T.ink}`}}><div className="category-icon" style={{width:32,height:32}}><CategoryIcon category={t.category}/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div><div style={{fontSize:10,color:T.muted,marginTop:1}}>{t.date}</div></div><div className="mono" style={{fontSize:12,fontWeight:500,color:txAmountColor(t.type),flexShrink:0}}>{txAmountSign(t.type)}{fmt(t.amount)}</div></div>))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div className="card csm up d4"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:12,fontWeight:600,color:T.mid}}>Metas activas</div><button className="btn bg bsm" style={{fontSize:10,padding:"4px 10px"}} onClick={()=>setView("goals")}>Ver <ic.ArrowRight/></button></div>
          {goals.filter(g=>goalCash(g)<g.target).length===0?<div style={{color:T.muted,fontSize:12,textAlign:"center",padding:"10px 0"}}>Sin metas — <button onClick={()=>setView("goals")} style={{color:T.lime,background:"none",border:"none",cursor:"pointer",fontSize:12,display:"inline-flex",alignItems:"center",gap:3}}>Crear <ic.ArrowRight/></button></div>:
          goals.filter(g=>goalCash(g)<g.target).slice(0,4).map(g=>{const linked=holdings.filter(h=>h.goalId===g.id);const invVal=linked.reduce((s,h)=>s+calcHoldingValueArs(h,marketPrices,usdRate).curArs,0);const total=goalCash(g)+invVal;const pct=clamp((total/g.target)*100,0,100);return<div key={g.id} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:8}}><GoalLabel goal={g} compact/><span className="mono" style={{fontSize:10,color:T.muted}}>{pct.toFixed(1)}%</span></div><div className="prog"><div className="progf" style={{width:`${pct}%`,background:pct>=100?T.lime:pct>=60?T.blue:T.amber}}/></div></div>;})}
        </div>
        {catData.length>0&&<div className="card csm up"><div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:8}}>Gastos este mes</div><div style={{display:"flex",gap:10,alignItems:"center"}}><div style={{width:80,minWidth:0,overflow:"hidden"}}><ResponsiveContainer width={80} height={80}><PieChart><Pie data={catData} cx="50%" cy="50%" innerRadius={22} outerRadius={36} dataKey="value" stroke="none">{catData.map((c,i)=><Cell key={i} fill={c.color}/>)}</Pie></PieChart></ResponsiveContainer></div><div style={{flex:1,minWidth:0}}>{catData.slice(0,4).map((c,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:T.muted,marginBottom:4}}><div style={{width:7,height:7,borderRadius:2,background:c.color,flexShrink:0}}/><span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span></div>)}</div></div></div>}
      </div>
    </div>
  </div>);}

function SalaryModule({state,update,notify}){
  const {salaries=[],transactions,usdRate}=state;
  const {fmt}=useDsp(state);
  const NOW=getNow();const CUR=getCUR();
  const [form,setForm]=useState({base:"",month:CUR,currency:state.lastSalaryCurrency||"ARS"});
  const [ef,setEF]=useState({desc:"",amt:"",currency:"ARS"});
  const [addingE,setAE]=useState(null);
  const totalCur=getSalaryTotal(salaries);
  const curExp=transactions.filter(t=>gMonth(t.date)===CUR&&t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const disponible=Math.max(0,totalCur-curExp);
  const curSal=salaries.find(s=>s.month===form.month);
  const saveSalary=()=>{
    const rawBase=Math.abs(px(form.base));
    if(!rawBase)return notify("Ingresá un monto","err");
    const baseArs=rawBase*(form.currency==="USD"?usdRate:1);
    const exists=salaries.find(s=>s.month===form.month);
    const updated=exists?salaries.map(s=>s.month===form.month?{...s,base:baseArs,originalBase:rawBase,baseCurrency:form.currency}:s):[...salaries,{month:form.month,base:baseArs,originalBase:rawBase,baseCurrency:form.currency,extras:[]}];
    const existingTx=transactions.find(t=>t.type==="income"&&gMonth(t.date)===form.month&&t.source==="salary");
    let txList=transactions;
    if(existingTx){txList=txList.map(t=>t.id===existingTx.id?{...t,amount:baseArs,currency:form.currency}:t);}
    else{txList=[...txList,{id:`sal_${uid()}`,date:form.month+"-01",description:`Sueldo ${form.month}`,amount:baseArs,type:"income",category:"❓ Otros",currency:form.currency,source:"salary"}];}
    update({salaries:updated,lastSalaryBase:rawBase,lastSalaryCurrency:form.currency,transactions:txList});
    notify(exists?"Sueldo actualizado ✓":"Sueldo registrado ✓");
  };
  const addExtra=(month)=>{
    const rawAmt=Math.abs(px(ef.amt));
    if(!ef.desc||!rawAmt)return notify("Completá descripción y monto","err");
    const amtArs=rawAmt*(ef.currency==="USD"?usdRate:1);
    const extraId=`e_${uid()}`;const transactionId=`ex_${uid()}`;const extra={id:extraId,transactionId,desc:ef.desc,amt:amtArs,originalAmt:rawAmt,cur:ef.currency};const existingSalary=salaries.find(s=>s.month===month);
    const updated=existingSalary?salaries.map(s=>s.month===month?{...s,extras:[...(s.extras||[]),extra]}:s):[...salaries,{month,base:0,originalBase:0,baseCurrency:"ARS",extras:[extra]}];
    const newTx={id:transactionId,extraId,date:month+"-15",description:ef.desc,amount:amtArs,type:"income",category:"❓ Otros",currency:ef.currency,source:"extra"};
    update({salaries:updated,transactions:[...transactions,newTx]});
    setEF({desc:"",amt:"",currency:"ARS"});setAE(null);notify("Ingreso extra agregado ✓");
  };
  const delExtra=(month,id)=>{const extra=salaries.find(s=>s.month===month)?.extras?.find(item=>item.id===id);const legacyTx=!extra?.transactionId&&extra?transactions.find(tx=>tx.source==="extra"&&gMonth(tx.date)===month&&tx.description===extra.desc&&Number(tx.amount)===Number(extra.amt)):null;const linkedTxId=extra?.transactionId||legacyTx?.id;update({salaries:salaries.map(s=>s.month===month?{...s,extras:(s.extras||[]).filter(e=>e.id!==id)}:s),transactions:linkedTxId?transactions.filter(tx=>tx.id!==linkedTxId):transactions});notify("Eliminado","err");};
  const hist=Array.from({length:6},(_,i)=>{const d=new Date(NOW.getFullYear(),NOW.getMonth()-5+i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});
  let pVal=0;
  (state.holdings||[]).forEach(h=>{pVal+=calcHoldingValueArs(h,state.marketPrices,usdRate).curArs;});
  return(<div className="up"><PH title="Sueldo e ingresos" sub="Registrá tu sueldo y agregá ingresos extra"/>
  <div className="kpi-grid salary-kpis" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:18}}>
    {[{l:"Sueldo base",v:fmt(salaries.find(s=>s.month===CUR)?.base||0),c:T.mango,i:<IcSalaryKpi/>},{l:"Ingresos extra",v:fmt((salaries.find(s=>s.month===CUR)?.extras||[]).reduce((s,e)=>s+e.amt,0)),c:T.blue,i:<IcIncome/>},{l:"Disponible libre",v:fmt(disponible),c:disponible>0?T.teal:T.coral,i:<IcFree/>},{l:"Portfolio",v:fmt(pVal),c:T.blue,i:<IcPortfolio/>}].map((k,i)=>(
      <div key={i} className="card csm"><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",fontWeight:600}}>{k.l}</span><span style={{color:k.c,opacity:.8,display:"flex",alignItems:"center"}}>{k.i}</span></div><div className="mono" title={k.v} style={{fontSize:20,fontWeight:500,color:k.c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.v}</div><div style={{fontSize:10,color:T.muted,marginTop:3}}>{CUR}</div></div>
    ))}
  </div>
  <div className="card" style={{marginBottom:14}}><div style={{fontSize:13,fontWeight:700,marginBottom:14,display:"flex",alignItems:"center",gap:7}}><IcCalendar/> Registrar sueldo</div>
    <div className="salary-form" style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
      <div style={{flex:1,minWidth:130}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Mes</label><AppSelect value={form.month} options={hist.map(month=>({value:month,label:month}))} ariaLabel="Mes del sueldo" onChange={newM=>{const existing=salaries.find(s=>s.month===newM);setForm({month:newM,base:existing?(existing.originalBase||existing.base):"",currency:existing?(existing.baseCurrency||"ARS"):(state.lastSalaryCurrency||"ARS")});}}/></div>
      <div style={{flex:1.5,minWidth:180}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Sueldo neto</label><div style={{display:"flex",gap:8}}><input className="inp" style={{flex:1}} placeholder={state.lastSalaryBase?String(state.lastSalaryBase):"800000"} value={form.base} onChange={e=>setForm(f=>({...f,base:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveSalary()}/><AppSelect style={{width:92,flexShrink:0}} value={form.currency} options={[{value:"ARS",label:"ARS"},{value:"USD",label:"USD"}]} ariaLabel="Moneda del sueldo" onChange={currency=>setForm(f=>({...f,currency}))}/></div></div>
      <button className="btn bl" onClick={saveSalary}><ic.Refresh/>{curSal?"Actualizar":"Registrar"}</button>
    </div>
    {form.currency==="USD"&&px(form.base)>0&&<div style={{marginTop:10,fontSize:11,color:T.blue,display:"flex",alignItems:"center",gap:6}}><ic.Sparkles/> Equivalente a {fARS(Math.abs(px(form.base))*usdRate)} ARS al tipo de cambio actual.</div>}
  </div>
  <div className="card" style={{padding:0,overflow:"auto"}}><div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,fontSize:13,fontWeight:700}}>Historial de ingresos</div>
  <table className="tbl"><thead><tr><th>Mes</th><th>Sueldo base</th><th>Extras</th><th>Total</th><th></th></tr></thead><tbody>
  {hist.slice().reverse().map(m=>{
    const sal=salaries.find(s=>s.month===m);const base=sal?.base||0;const exT=(sal?.extras||[]).reduce((s,e)=>s+e.amt,0);
    return(<tr key={m}>
      <td className="mono" style={{fontSize:12,color:T.muted}}>{m}</td>
      <td className="mono" style={{color:base>0?T.white:T.muted}}>{base>0?<div>{fmt(base)}{sal?.baseCurrency==="USD"&&<span style={{fontSize:10,color:T.muted,marginLeft:6}}>(U$D {sal.originalBase})</span>}</div>:"—"}</td>
      <td>{(sal?.extras||[]).length===0?<span style={{color:T.muted,fontSize:12}}>—</span>:<div style={{display:"flex",flexDirection:"column",gap:3}}>{(sal?.extras||[]).map(e=>(<div key={e.id} style={{display:"flex",gap:8,alignItems:"center"}}><span className="mono" style={{fontSize:11,color:T.blue}}>+{fmt(e.amt)}{e.cur==="USD"&&<span style={{color:T.muted}}> (U$D {e.originalAmt})</span>}</span><span style={{fontSize:11,color:T.muted}}>{e.desc}</span><button className="btn bd bsm" aria-label={`Eliminar ingreso extra ${e.desc}`} style={{padding:"2px 6px",fontSize:10}} onClick={()=>delExtra(m,e.id)}><ic.Trash/></button></div>))}</div>}</td>
      <td className="mono" style={{fontWeight:600,color:base+exT>0?T.lime:T.muted}}>{base+exT>0?fmt(base+exT):"—"}</td>
      <td>{addingE===m?
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <input className="inp" style={{width:130,fontSize:12,padding:"6px 10px"}} placeholder="Descripción" value={ef.desc} onChange={e=>setEF(f=>({...f,desc:e.target.value}))} autoFocus/>
          <input className="inp" style={{width:90,fontSize:12,padding:"6px 10px"}} placeholder="Monto" value={ef.amt} onChange={e=>setEF(f=>({...f,amt:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addExtra(m)}/>
          <AppSelect compact style={{width:82,flexShrink:0}} value={ef.currency} options={[{value:"ARS",label:"ARS"},{value:"USD",label:"USD"}]} ariaLabel="Moneda del ingreso extra" onChange={currency=>setEF(f=>({...f,currency}))}/>
          <button className="btn bl bsm" onClick={()=>addExtra(m)}>+</button>
          <button className="btn bg bsm" aria-label="Cancelar ingreso extra" onClick={()=>{setAE(null);setEF({desc:"",amt:"",currency:"ARS"});}}><ic.X/></button>
        </div>
        :<button className="btn bg bsm" onClick={()=>{setAE(m);if(!sal)setForm(f=>({...f,month:m}));}}><ic.Plus/> Extra</button>}
      </td>
    </tr>);
  })}</tbody></table></div></div>);
}

function Transactions({state,update,notify,setView}){
  const {transactions,budgets,usdRate,recurring=[]}=state;
  const {fmt}=useDsp(state);
  const CUR=getCUR();
  const [showAdd,setSA]=useState(false);
  const [editTx,setETx]=useState(null);
  const [showBud,setSB]=useState(false);
  const [showRec,setSRec]=useState(false);
  const [showTransfers,setShowTransfers]=useState(false);
  const [filter,setFilter]=useState({month:"",type:"",cat:""});
  const [form,setForm]=useState({date:todayISO(),description:"",amount:"",type:"expense",category:"❓ Otros",currency:"ARS",isRecurring:false});
  const [editCat,setEC]=useState(null);
  const [bf,setBF]=useState({category:CATS[0],limit:""});
  // ── TRANSFER DETECTION STATE ──
  const [transferPairs,setTransferPairs]=useState([]);
  const [showTransferModal,setSTM]=useState(false);
  const [rejectedPairs,setRejectedPairs]=useState(new Set());

  const rows=useMemo(()=>transactions.filter(t=>{
    if(t.type==="transfer"&&!showTransfers)return false;
    if(filter.month&&gMonth(t.date)!==filter.month)return false;
    if(filter.type&&t.type!==filter.type)return false;
    if(filter.cat&&t.category!==filter.cat)return false;
    return true;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date)),[transactions,filter,showTransfers]);

  const cur=transactions.filter(t=>gMonth(t.date)===CUR);
  const months=[...new Set(transactions.map(t=>gMonth(t.date)))].sort().reverse();
  const transferCount=transactions.filter(t=>t.type==="transfer").length;

  // ── DETECCIÓN SOBRE EXISTENTES ──
  const runDetection=()=>{
    const income=transactions.filter(t=>t.type==="income");
    const expense=transactions.filter(t=>t.type==="expense");
    const pairs=detectTransfers(income,expense);
    if(!pairs.length)return notify("No se detectaron transferencias internas","info");
    setTransferPairs(pairs);
    setRejectedPairs(new Set());
    setSTM(true);
  };

  useEffect(()=>{
    const pending=recurring.filter(r=>r.lastMonth<CUR&&!r.paused);
    if(pending.length===0)return;
    let newTxs=[...transactions];
    let newRec=recurring.map(r=>{
      if(r.lastMonth<CUR&&!r.paused){
        newTxs.push({id:`auto_${uid()}`,date:`${CUR}-01`,description:r.description,amount:r.amount,type:r.type,category:r.category,currency:r.currency,source:"auto"});
        return{...r,lastMonth:CUR};
      }
      return r;
    });
    setTimeout(()=>{update({transactions:newTxs,recurring:newRec});notify(`${pending.length} cargos recurrentes aplicados ✓`,"info");},100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[CUR]);

  const saveTx=()=>{
    if(!form.description||!form.amount)return notify("Completá descripción y monto","err");
    const type=normalizeTxType(form.type);
    if(!type)return notify("Elegí un tipo de movimiento válido","err");
    const ars=Math.abs(px(form.amount))*(form.currency==="USD"?usdRate:1);
    if(ars<=0)return notify("Monto inválido","err");
    if(editTx){
      update({transactions:transactions.map(t=>t.id===editTx?{...t,...form,type,amount:ars}:t)});
      setETx(null);notify("Movimiento actualizado ✓");
    }else{
      const newTxs=[...transactions,{...form,type,id:`m_${uid()}`,amount:ars,source:"manual"}];
      if(form.isRecurring){
        const newR={id:`rec_${uid()}`,description:form.description,amount:ars,type,category:form.category,currency:"ARS",lastMonth:gMonth(form.date),paused:false};
        update({transactions:newTxs,recurring:[...recurring,newR]});
        notify("Movimiento programado para repetirse ✓");
      }else{
        update({transactions:newTxs});notify("Movimiento agregado ✓");
      }
    }
    setForm({date:todayISO(),description:"",amount:"",type:"expense",category:"❓ Otros",currency:"ARS",isRecurring:false});
    setSA(false);
  };
  const openNew=()=>{setETx(null);setForm({date:todayISO(),description:"",amount:"",type:"expense",category:"❓ Otros",currency:"ARS",isRecurring:false});setSA(true);};
  const editMovement=t=>{setForm({date:t.date,description:t.description.replace("🔁 ",""),amount:t.amount,type:normalizeTxType(t.type)||"expense",category:t.category,currency:"ARS",isRecurring:false});setETx(t.id);setSA(true);};
  const removeMovement=id=>{update({transactions:transactions.filter(x=>x.id!==id)});notify("Eliminado","err");};
  const hasFilters=Boolean(filter.month||filter.type||filter.cat);

  return(<div className="up">
    <PH title="Movimientos" sub={`${rows.length} registros`} right={
      <div className="tx-actions" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn bg" onClick={runDetection}><ic.Swap/> Conciliar</button>
        <button data-tour-target="recurrentes-btn" className="btn bg" onClick={()=>setSRec(true)}><ic.Refresh/> Recurrentes</button>
        <button data-tour-target="presupuestos-btn" className="btn bg" onClick={()=>setSB(true)}><ic.Bell/> Presupuestos</button>
        <button className="btn bl" onClick={openNew}><ic.Plus/> Nuevo</button>
      </div>
    }/>

    {Object.keys(budgets||{}).length>0&&(<div style={{display:"flex",gap:10,marginBottom:14,overflowX:"auto",paddingBottom:4}}>{Object.entries(budgets).map(([cat,lim])=>{const spent=cur.filter(t=>t.category===cat&&t.type==="expense").reduce((s,t)=>s+t.amount,0);const pct=clamp(spent/lim*100,0,200);return<div key={cat} style={{background:T.raised,border:`1px solid ${pct>=100?T.red:pct>=80?T.amber:T.border}`,borderRadius:10,padding:"10px 14px",minWidth:150,flexShrink:0}}><div style={{fontSize:10,color:T.muted,marginBottom:4}}><CategoryLabel category={cat} compact/></div><div className="mono" style={{fontSize:13,color:pct>=100?T.red:pct>=80?T.amber:T.white}}>{fmt(spent)}/{fmt(lim)}</div><div className="prog" style={{marginTop:6}}><div className="progf" style={{width:`${clamp(pct,0,100)}%`,background:pct>=100?T.red:pct>=80?T.amber:T.teal}}/></div></div>;})}</div>)}

    <div className="tx-filters" style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
      <AppSelect style={{width:"auto",minWidth:170}} value={filter.month} options={[{value:"",label:"Todos los meses"},...months.map(month=>({value:month,label:month}))]} ariaLabel="Filtrar por mes" onChange={month=>setFilter(f=>({...f,month}))}/>
      <AppSelect style={{width:"auto",minWidth:140}} value={filter.type} options={[{value:"",label:"Todos"},{value:"expense",label:"Gastos"},{value:"income",label:"Ingresos"}]} ariaLabel="Filtrar por tipo" onChange={type=>setFilter(f=>({...f,type}))}/>
      <CategorySelect includeAll style={{width:"auto",minWidth:180}} value={filter.cat} placeholder="Todas las categorías" ariaLabel="Filtrar por categoría" onChange={cat=>setFilter(f=>({...f,cat}))}/>
      {transferCount>0&&(
        <button onClick={()=>setShowTransfers(s=>!s)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",borderRadius:9,fontSize:11,fontWeight:600,border:`1px solid ${showTransfers?"rgba(138,125,117,.4)":T.border}`,background:showTransfers?"rgba(138,125,117,.1)":T.raised,color:showTransfers?T.mid:T.muted,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap"}}>
          <ic.Swap/> {showTransfers?"Ocultar":"Ver"} transferencias internas
          <span style={{background:T.raised,borderRadius:99,padding:"1px 6px",fontSize:10,marginLeft:2}}>{transferCount}</span>
        </button>
      )}
      {(filter.month||filter.type||filter.cat)&&<button className="btn bg bsm" onClick={()=>setFilter({month:"",type:"",cat:""})}>Limpiar</button>}
    </div>

    {rows.length===0?<div className="card" style={{padding:0}}><EmptyPanel icon={<ic.Tx/>} title={hasFilters?"No hay resultados":"Todavía no hay movimientos"} detail={hasFilters?"Probá limpiando los filtros para volver a ver todos tus registros.":"Agregá un movimiento o importá un extracto para empezar a ordenar tus gastos."}>{hasFilters?<button className="btn bg" onClick={()=>setFilter({month:"",type:"",cat:""})}>Limpiar filtros</button>:<><button className="btn bl" onClick={openNew}><ic.Plus/> Nuevo</button>{setView&&<button className="btn bg" onClick={()=>setView("import")}><ic.Import/> Importar</button>}</>}</EmptyPanel></div>:<>
    <div className="tx-mobile-list">{rows.map(t=>(<div key={t.id} className="card csm" style={{opacity:t.type==="transfer"?.65:1}}><div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}><div style={{minWidth:0,flex:1}}><div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div><div style={{display:"flex",alignItems:"center",gap:7,marginTop:5,flexWrap:"wrap"}}><span className="mono" style={{fontSize:10,color:T.muted}}>{t.date}</span><span className={`tag ${txTypeClass(t.type,t.category)}`} style={{fontSize:9,padding:"2px 7px"}}>{txTypeLabel(t.type,t.category)}</span></div></div><div className="mono" style={{fontSize:13,fontWeight:700,color:txAmountColor(t.type),flexShrink:0}}>{txAmountSign(t.type)}{fmt(t.amount)}</div></div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:11,paddingTop:10,borderTop:`1px solid ${T.border}`}}><button onClick={()=>t.type!=="transfer"&&setEC({id:t.id,cat:t.category})} style={{background:T.raised,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 9px",fontSize:10,color:T.mid,cursor:t.type==="transfer"?"default":"pointer",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.type==="transfer"?"Transferencia interna":<CategoryLabel category={t.category} compact/>}</button><div style={{display:"flex",gap:6,flexShrink:0}}>{t.type!=="transfer"&&<button className="btn bg bsm" aria-label="Editar movimiento" style={{width:40,height:40,padding:0}} onClick={()=>editMovement(t)}><ic.Edit/></button>}<button className="btn bd bsm" aria-label="Eliminar movimiento" style={{width:40,height:40,padding:0}} onClick={()=>removeMovement(t.id)}><ic.Trash/></button></div></div></div>))}</div>
    <div className="card tx-desktop-table" style={{padding:0,overflow:"auto"}}><table className="tbl"><thead><tr><th className="hide-m">Fecha</th><th>Descripción</th><th>Categoría</th><th className="hide-m">Tipo</th><th>Monto</th><th></th></tr></thead><tbody>
    {rows.map(t=>(
      <tr key={t.id} style={{opacity:t.type==="transfer"?.6:1}}>
        <td className="mono hide-m" style={{color:T.muted,fontSize:11}}>{t.date}</td>
        <td style={{maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
        <td><button onClick={()=>t.type!=="transfer"&&setEC({id:t.id,cat:t.category})} style={{background:T.raised,border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 9px",fontSize:11,color:T.mid,cursor:t.type==="transfer"?"default":"pointer"}}>{t.type==="transfer"?"Transferencia interna":<CategoryLabel category={t.category} compact/>}</button></td>
        <td className="hide-m">
          <span className={`tag ${txTypeClass(t.type,t.category)}`}>
            {txTypeLabel(t.type,t.category)}
          </span>
        </td>
        <td className="mono" style={{color:txAmountColor(t.type),fontWeight:500}}>
          {txAmountSign(t.type)}{fmt(t.amount)}
        </td>
        <td className="tx-actions-cell"><div className="tx-row-actions">
          {t.type!=="transfer"&&<button className="btn bg bsm" aria-label="Editar movimiento" style={{padding:"4px 8px"}} onClick={()=>editMovement(t)}><ic.Edit/></button>}
          <button className="btn bd bsm" aria-label="Eliminar movimiento" style={{padding:"4px 8px"}} onClick={()=>removeMovement(t.id)}><ic.Trash/></button>
        </div>
        </td>
      </tr>
    ))}</tbody></table></div></>}

    {/* ── MODAL NUEVO MOVIMIENTO ── */}
    {showAdd&&<div className="ov" onClick={e=>{if(e.target===e.currentTarget){setSA(false);setETx(null);}}}><div className="modal"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{fontSize:18,fontWeight:700}}>{editTx?"Editar movimiento":"Nuevo movimiento"}</h2><button className="btn bg bsm" onClick={()=>{setSA(false);setETx(null);}}><ic.X/></button></div><div style={{display:"flex",flexDirection:"column",gap:12}}><div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha</label><input type="date" className="inp" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Tipo</label><AppSelect value={form.type} options={[{value:"expense",label:"Gasto"},{value:"income",label:"Ingreso"}]} ariaLabel="Tipo de movimiento" onChange={type=>setForm(f=>({...f,type}))}/></div></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Descripción</label><input className="inp" placeholder="ej: Alquiler / Netflix" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div><div className="g3"><div style={{gridColumn:"1/3"}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Monto (positivo siempre)</label><input className="inp" placeholder="15000" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Moneda</label><AppSelect value={form.currency} options={[{value:"ARS",label:"ARS"},{value:"USD",label:"USD"}]} ariaLabel="Moneda del movimiento" onChange={currency=>setForm(f=>({...f,currency}))}/></div></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Categoría</label><CategorySelect value={form.category} ariaLabel="Categoría del movimiento" onChange={category=>setForm(f=>({...f,category}))}/></div>{!editTx&&(<label style={{display:"flex",alignItems:"center",gap:10,fontSize:12,color:form.isRecurring?T.lime:T.white,marginTop:4,background:form.isRecurring?"rgba(200,255,87,.08)":T.raised,padding:"12px 14px",borderRadius:10,border:`1px solid ${form.isRecurring?"rgba(200,255,87,.3)":T.border}`,cursor:"pointer",transition:"all .2s"}}><input type="checkbox" checked={form.isRecurring} onChange={e=>setForm(f=>({...f,isRecurring:e.target.checked}))} style={{accentColor:T.lime,width:16,height:16}}/><div><div style={{fontWeight:600,display:"flex",alignItems:"center",gap:7}}><ic.Repeat/> Repetir todos los meses</div><div style={{fontSize:10,color:T.muted,marginTop:2,fontWeight:400}}>La app lo cargará automáticamente el día 1 de cada mes.</div></div></label>)}{form.currency==="USD"&&px(form.amount)>0&&<div style={{background:"rgba(77,158,255,.08)",border:`1px solid rgba(77,158,255,.2)`,borderRadius:8,padding:"8px 12px",fontSize:11,color:T.blue}}>= {fARS(Math.abs(px(form.amount))*usdRate)} ARS al tipo de cambio seleccionado</div>}<button className="btn bl" style={{justifyContent:"center",marginTop:8}} onClick={saveTx}>{editTx?"Guardar cambios":"Agregar Movimiento"}</button></div></div></div>}

    {/* ── MODAL RECURRENTES ── */}
    {showRec&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setSRec(false)}><div className="modal"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontSize:18,fontWeight:700}}>Suscripciones y Recurrentes</h2><button className="btn bg bsm" onClick={()=>setSRec(false)}><ic.X/></button></div><div style={{fontSize:12,color:T.mid,marginBottom:16}}>Acá ves los gastos que se inyectan automáticamente cada mes. Si eliminás uno, no afectará a los meses anteriores.</div>
    {recurring.length===0?<div style={{color:T.muted,fontSize:12,textAlign:"center",padding:20,background:T.raised,borderRadius:12}}>No tenés gastos recurrentes configurados.</div>:recurring.map(r=>(
      <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.raised,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${T.border}`,opacity:r.paused?0.5:1}}>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:r.paused?T.muted:T.white,display:"flex",alignItems:"center",gap:7}}><span style={{display:"flex",color:r.paused?T.muted:T.teal}}>{r.paused?<ic.Pause/>:<ic.Repeat/>}</span>{r.description}</div>
          <div style={{fontSize:10,color:T.muted,marginTop:5,display:"flex",alignItems:"center",gap:6}}><CategoryLabel category={r.category} compact/><span>· Último cobro: {r.lastMonth}</span></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span className="mono" style={{fontSize:14,color:r.paused?T.muted:(r.type==="income"?T.teal:T.red),fontWeight:500,marginRight:4}}>{fmt(r.amount)}</span>
          <button className="btn bg bsm" style={{padding:"4px 8px"}} aria-label={r.paused?"Reanudar recurrente":"Pausar recurrente"} title={r.paused?"Reanudar":"Pausar"} onClick={()=>update({recurring:recurring.map(x=>x.id===r.id?{...x,paused:!x.paused}:x)})}>{r.paused?<ic.Play/>:<ic.Pause/>}</button>
          <button className="btn bd bsm" style={{padding:"4px 8px"}} onClick={()=>{update({recurring:recurring.filter(x=>x.id!==r.id)});notify("Suscripción eliminada","err");}}><ic.Trash/></button>
        </div>
      </div>
    ))}</div></div>}

    {/* ── MODAL CAMBIAR CATEGORÍA ── */}
    {editCat&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setEC(null)}><div className="modal" style={{width:360}}><h2 style={{fontSize:16,fontWeight:700,marginBottom:14}}>Cambiar categoría</h2><CategorySelect style={{marginBottom:14}} value={editCat.cat} ariaLabel="Nueva categoría" onChange={cat=>setEC(current=>({...current,cat}))}/><div style={{display:"flex",gap:8}}><button className="btn bl" style={{flex:1,justifyContent:"center"}} onClick={()=>{update({transactions:transactions.map(t=>t.id===editCat.id?{...t,category:editCat.cat}:t)});setEC(null);notify("Guardado ✓");}}>Guardar</button><button className="btn bg" onClick={()=>setEC(null)}>Cancelar</button></div></div></div>}

    {/* ── MODAL PRESUPUESTOS ── */}
    {showBud&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setSB(false)}><div className="modal"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontSize:18,fontWeight:700}}>Presupuestos</h2><button className="btn bg bsm" onClick={()=>setSB(false)}><ic.X/></button></div><div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><CategorySelect style={{flex:1.5,minWidth:180}} value={bf.category} ariaLabel="Categoría del presupuesto" onChange={category=>setBF(f=>({...f,category}))}/><input className="inp" style={{flex:1,minWidth:100}} placeholder="Límite ARS" value={bf.limit} onChange={e=>setBF(f=>({...f,limit:e.target.value}))}/><button className="btn bl" aria-label="Agregar presupuesto" onClick={()=>{if(!bf.limit)return;update({budgets:{...budgets,[bf.category]:px(bf.limit)}});setSB(false);notify("Guardado ✓");}}><ic.Plus/></button></div>{Object.entries(budgets||{}).map(([cat,lim])=>(<div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.raised,borderRadius:10,padding:"10px 14px",marginBottom:7,flexWrap:"wrap",gap:6}}><span style={{fontSize:13}}><CategoryLabel category={cat}/></span><div style={{display:"flex",alignItems:"center",gap:10}}><span className="mono" style={{fontSize:12,color:T.mid}}>{fmt(lim)}/mes</span><button className="btn bd bsm" aria-label={`Eliminar presupuesto de ${categoryName(cat)}`} onClick={()=>{const b={...budgets};delete b[cat];update({budgets:b});}}><ic.Trash/></button></div></div>))}</div></div>}

    {/* ── MODAL TRANSFERENCIAS INTERNAS ── */}
    {showTransferModal&&(
      <div className="ov" onClick={e=>e.target===e.currentTarget&&setSTM(false)}>
        <div className="modal">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h2 style={{fontSize:17,fontWeight:700,display:"flex",alignItems:"center",gap:7}}><ic.Swap/>Transferencias internas detectadas</h2>
            <button className="btn bg bsm" onClick={()=>setSTM(false)}><ic.X/></button>
          </div>
          <div style={{fontSize:12,color:T.mid,marginBottom:16}}>
            Estos movimientos parecen ser transferencias entre tus propias cuentas. Si los confirmás, quedan excluidos de tus ingresos y gastos.
          </div>
          {transferPairs.filter(p=>!rejectedPairs.has(p.a.id+p.b.id)).map((pair,i)=>{
            const inc=pair.a.type==="income"?pair.a:pair.b;
            const exp=pair.a.type==="expense"?pair.a:pair.b;
            return(
              <div key={i} style={{background:T.raised,borderRadius:12,padding:"14px 16px",marginBottom:10,border:`1px solid ${T.border}`}}>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <span style={{fontSize:12,color:T.teal,minWidth:0,overflowWrap:"anywhere"}}>↑ {inc.description}</span>
                    <span className="mono" style={{fontSize:12,color:T.teal,flexShrink:0}}>+{fmt(inc.amount)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <span style={{fontSize:12,color:T.coral,minWidth:0,overflowWrap:"anywhere"}}>↓ {exp.description}</span>
                    <span className="mono" style={{fontSize:12,color:T.coral,flexShrink:0}}>-{fmt(exp.amount)}</span>
                  </div>
                  <div style={{fontSize:10,color:T.muted}}>{inc.date} · {exp.date}</div>
                </div>
                <div className="transfer-actions" style={{display:"flex",gap:8}}>
                  <button className="btn bl bsm" style={{flex:1,justifyContent:"center"}} onClick={()=>{
                    update({
                      transactions:transactions.map(t=>t.id===pair.a.id||t.id===pair.b.id?{...t,type:"transfer",category:"🔄 Transferencia interna"}:t),
                      recurring:recurring.filter(r=>r.originTransactionId!==pair.a.id&&r.originTransactionId!==pair.b.id),
                    });
                    setRejectedPairs(r=>new Set([...r,pair.a.id+pair.b.id]));
                    notify("Transferencia interna marcada ✓");
                  }}><ic.Check/>Sí, es una transferencia</button>
                  <button className="btn bg bsm" style={{flex:1,justifyContent:"center"}} onClick={()=>
                    setRejectedPairs(r=>new Set([...r,pair.a.id+pair.b.id]))
                  }><ic.X/>No, son distintos</button>
                </div>
              </div>
            );
          })}
          {transferPairs.filter(p=>!rejectedPairs.has(p.a.id+p.b.id)).length===0&&(
            <div style={{textAlign:"center",padding:"16px 0",color:T.muted,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><ic.Check/>Todo revisado</div>
          )}
          <button className="btn bg" style={{width:"100%",justifyContent:"center",marginTop:8}}
            onClick={()=>{setSTM(false);setRejectedPairs(new Set());}}>Cerrar</button>
        </div>
      </div>
    )}
  </div>);
}

function Goals({state,update,notify}){
  const {goals,transactions,usdRate,salaries,holdings=[],marketPrices={}}=state;
  const {fmt}=useDsp(state);
  const NOW=getNow();
  const [sf,setSF]=useState(false);
  const [addTo,setAT]=useState(null);
  const [addAmt,setAA]=useState("");
  const [addCur,setAC]=useState("ARS");
  const [addLabel,setAL]=useState("");
  const [linkGoal,setLG]=useState(null);
  const [form,setForm]=useState({name:"",target:"",currency:"ARS",saved:"",icon:"🎯",deadline:""});
  const {disponible,perGoal}=goalPlan(goals,salaries,transactions,holdings,marketPrices,usdRate);

  const addG=()=>{
    if(!form.name||!form.target)return notify("Nombre y monto requeridos","err");
    const conversion=form.currency==="USD"?usdRate:1;const t=Math.abs(px(form.target))*conversion;const saved=(Math.abs(px(form.saved))||0)*conversion;
    update({goals:[...goals,{id:`g_${uid()}`,name:form.name,target:t,saved,icon:form.icon,deadline:form.deadline,createdAt:todayISO(),payments:[]}]});
    setForm({name:"",target:"",currency:"ARS",saved:"",icon:"🎯",deadline:""});setSF(false);notify("Meta creada ✓");
  };

  const addSav=g=>{
    const a=Math.abs(px(addAmt))*(addCur==="USD"?usdRate:1);
    if(!a)return notify("Ingresá un monto","err");
    if(addTo?.mode==="payment"){
      if(!addLabel.trim())return notify("Ingresá un nombre para el pago","err");
      const p={id:`p_${uid()}`,name:addLabel.trim(),amount:a,date:todayISO()};
      update({goals:goals.map(gl=>gl.id===g.id?{...gl,payments:[...(gl.payments||[]),p]}:gl),
        transactions:[...transactions,{id:`t_${uid()}`,date:todayISO(),description:`${addLabel}: ${g.name}`,amount:a,type:"expense",category:"💰 Ahorro",currency:"ARS",source:"manual"}]});
      notify(`"${addLabel}" agregado ✓`);
    }else{
      update({goals:goals.map(gl=>gl.id===g.id?{...gl,saved:gl.saved+a}:gl),
        transactions:[...transactions,{id:`t_${uid()}`,date:todayISO(),description:`Ahorro: ${g.name}`,amount:a,type:"expense",category:"💰 Ahorro",currency:"ARS",source:"manual"}]});
      notify(`+${fmt(a)} sumado ✓`);
    }
    setAT(null);setAA("");setAC("ARS");setAL("");
  };

  const removePayment=(g,pid)=>{update({goals:goals.map(gl=>gl.id===g.id?{...gl,payments:(gl.payments||[]).filter(p=>p.id!==pid)}:gl)});notify("Pago eliminado","err");};

  const liquidar=(g,linkedHoldings,investedValue)=>{
    if(!window.confirm(`¿Liquidar "${g.name}"? Se registrará el gasto.`))return;
    const newTxs=[...transactions];
    if(investedValue>0)newTxs.push({id:`liq_i_${uid()}`,date:todayISO(),description:`Venta activos: ${g.name}`,amount:investedValue,type:"income",category:"💰 Ahorro",currency:"ARS"});
    newTxs.push({id:`liq_e_${uid()}`,date:todayISO(),description:`Meta cumplida: ${g.name}`,amount:g.target,type:"expense",category:"🎬 Ocio",currency:"ARS"});
    const holdingIds=linkedHoldings.map(h=>h.id);
    update({transactions:newTxs,holdings:holdings.filter(h=>!holdingIds.includes(h.id)),goals:goals.map(x=>x.id===g.id?{...x,saved:x.target}:x)});
    notify(`¡Meta "${g.name}" alcanzada! 🎉`);
  };

  return(<div className="up">
    <PH title="Metas" sub={`${goals.filter(g=>goalCash(g)<g.target).length} activas`} right={<button data-tour-target="new-goal-btn" className="btn bl" onClick={()=>setSF(true)}><ic.Plus/> Nueva meta</button>}/>

    {disponible>0&&perGoal.length>0&&<div className="card" style={{marginBottom:16,borderColor:"rgba(200,255,87,.18)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Plan de ahorro recomendado</div><div style={{fontSize:12,color:T.mid,marginBottom:12}}>Tenés <span className="mono" style={{color:T.lime}}>{fmt(disponible)}</span> disponibles este mes:</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10}}>{perGoal.map(g=><div key={g.id} style={{background:T.raised,borderRadius:10,padding:"12px 14px",border:`1px solid ${g.feasible?T.border:"rgba(255,184,48,.3)"}`}}><div style={{fontSize:12,marginBottom:6}}><GoalLabel goal={g} compact/></div><div className="mono" style={{fontSize:18,fontWeight:600,color:g.feasible?T.lime:T.amber}}>{fmt(g.needed)}<span style={{fontSize:11,fontWeight:400,color:T.muted}}>/mes</span></div><div style={{fontSize:10,color:T.muted,marginTop:3}}>{g.months} mes{g.months>1?"es":""} · Falta {fmt(g.rem)}</div>{!g.feasible&&<div style={{fontSize:10,color:T.amber,marginTop:4}}>Ajustá el plazo o el monto</div>}</div>)}</div></div>}

    {goals.length===0
      ?<div className="card" style={{textAlign:"center",padding:"64px 32px"}}><div style={{width:64,height:64,margin:"0 auto 16px",background:"rgba(204,255,71,.08)",borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center",color:T.lime}}><svg width="32" height="32" viewBox="0 0 20 20" fill="none"><path d="M10 3C7 3 5 5.5 5 8.5c0 4 3.5 6.5 5 8 1.5-1.5 5-4 5-8C15 5.5 13 3 10 3z" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="8" r="1.5" fill="currentColor" opacity=".5"/></svg></div><div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Sin metas todavía</div><div style={{fontSize:13,color:T.muted,marginBottom:20}}>Creá una meta y empezá a trackear tu progreso</div><button className="btn bl" onClick={()=>setSF(true)}><ic.Plus/> Crear meta</button></div>
      :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:14}}>
        {goals.map(g=>{
          const linkedHoldings=holdings.filter(h=>h.goalId===g.id);
          const invCost=linkedHoldings.reduce((s,h)=>s+calcHoldingValueArs(h,marketPrices,usdRate).invArs,0);
          const investedValue=linkedHoldings.reduce((s,h)=>s+calcHoldingValueArs(h,marketPrices,usdRate).curArs,0);
          const pnl=investedValue-invCost;
          const cash=goalCash(g);
          const total=cash+investedValue;
          const pct=clamp((total/g.target)*100,0,100);
          const cashPct=clamp((cash/g.target)*100,0,100);
          const invPct=clamp((investedValue/g.target)*100,0,cashPct===100?0:100-cashPct);
          const rem=g.target-total;
          const days=g.deadline?Math.ceil((new Date(g.deadline)-NOW)/864e5):null;
          const months=days&&days>0?Math.ceil(days/30):null;
          const needed=months?rem/months:null;
          const pc=pct>=100?T.lime:pct>=60?T.blue:T.amber;
          return<div key={g.id} className="card up">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}><span className="goal-icon-badge" style={{width:40,height:40,borderRadius:12}}><GoalIcon icon={g.icon} size={21}/></span><div><div style={{fontSize:14,fontWeight:700}}>{g.name}</div>{g.deadline&&<div style={{fontSize:10,color:T.muted,marginTop:2}}><span style={{display:"inline-flex",verticalAlign:"middle",marginRight:3}}><IcCalendar/></span>{g.deadline}{days!==null&&` · ${days>0?days+"d":"¡Hoy!"}`}</div>}</div></div>
              <button className="btn bd bsm" onClick={()=>{update({goals:goals.filter(x=>x.id!==g.id)});notify("Eliminado","err");}}><ic.Trash/></button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:T.raised,borderRadius:8}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:T.lime,flexShrink:0}}/><span style={{fontSize:11,color:T.mid}}>Ahorros depositados</span></div><span className="mono" style={{fontSize:12,color:T.lime,fontWeight:600}}>{fmt(g.saved||0)}</span></div>
              {(g.payments||[]).map(p=><div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:T.raised,borderRadius:8}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:T.mango,flexShrink:0}}/><span style={{fontSize:11,color:T.mid}}>{p.name}</span></div><div style={{display:"flex",alignItems:"center",gap:8}}><span className="mono" style={{fontSize:12,color:T.mango,fontWeight:600}}>{fmt(p.amount)}</span><button aria-label={`Eliminar aporte ${p.name}`} onClick={()=>removePayment(g,p.id)} style={{color:T.muted,background:"none",border:"none",cursor:"pointer",padding:3,lineHeight:1,display:"flex"}}><ic.X/></button></div></div>)}
              {linkedHoldings.length>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:T.raised,borderRadius:8,border:`1px solid ${pnl>=0?"rgba(0,212,170,.15)":"rgba(255,95,109,.15)"}`}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:T.blue,flexShrink:0}}/><span style={{fontSize:11,color:T.mid}}>Inversión vinculada</span><span className="mono" style={{fontSize:10,color:pnl>=0?T.teal:T.coral,fontWeight:600}}>{pnl>=0?"+":""}{fmt(pnl)}</span></div><span className="mono" style={{fontSize:12,color:T.blue,fontWeight:600}}>{fmt(investedValue)}</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:6,borderTop:`1px solid ${T.border}`}}><span style={{fontSize:11,color:T.muted,fontWeight:600}}>Total</span><div style={{display:"flex",alignItems:"center",gap:8}}><span className="mono" style={{fontSize:14,color:pc,fontWeight:700}}>{fmt(total)}</span><span style={{fontSize:10,color:T.muted}}>de {fmt(g.target)}</span></div></div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:11,color:T.muted}}>Progreso</span><span className="mono" style={{fontSize:11,color:pc,fontWeight:600}}>{pct.toFixed(1)}%</span></div>
              <div className="prog" style={{height:7,position:"relative"}}>
                <div style={{position:"absolute",left:0,top:0,height:"100%",borderRadius:3,width:`${cashPct}%`,background:T.lime,transition:"width .7s cubic-bezier(.16,1,.3,1)"}}/>
                {investedValue>0&&<div style={{position:"absolute",left:`${cashPct}%`,top:0,height:"100%",width:`${invPct}%`,background:T.blue,transition:"width .7s cubic-bezier(.16,1,.3,1)"}}/>}
              </div>
              {linkedHoldings.length>0&&<div style={{display:"flex",gap:12,marginTop:5}}><div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:6,height:6,borderRadius:1,background:T.lime}}/> Efectivo</div><div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:6,height:6,borderRadius:1,background:T.blue}}/> Inversión</div></div>}
            </div>
            {needed&&needed>0&&<div style={{background:"rgba(91,158,255,.07)",border:"1px solid rgba(91,158,255,.15)",borderRadius:8,padding:"8px 10px",fontSize:11,color:T.blue,marginBottom:10}}><span style={{display:"inline-flex",color:T.blue,marginRight:4,verticalAlign:"middle"}}><ic.Bolt/></span>Guardá <span className="mono">{fmt(needed)}</span>/mes para llegar en {months} mes{months>1?"es":""}</div>}
            {pct>=100
              ?<div style={{display:"flex",gap:8}}><div style={{flex:1,background:"rgba(204,255,71,.08)",border:"1px solid rgba(204,255,71,.25)",borderRadius:10,padding:10,textAlign:"center",fontSize:13,color:T.lime,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><ic.Check/>Alcanzada</div>{(g.saved||0)<g.target&&<button className="btn bl" onClick={()=>liquidar(g,linkedHoldings,investedValue)}>Liquidar</button>}</div>
              :addTo?.id===g.id
                ?<div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {addTo.mode==="payment"&&<input className="inp" style={{fontSize:12}} placeholder='Nombre (ej: "Pasajes a Europa")' value={addLabel} onChange={e=>setAL(e.target.value)}/>}
                    <div className="goal-input-actions" style={{display:"flex",gap:7}}><input className="inp" style={{flex:1,fontSize:12}} placeholder="Monto" value={addAmt} onChange={e=>setAA(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&addSav(g)}/><AppSelect compact style={{width:78}} value={addCur} options={[{value:"ARS",label:"ARS"},{value:"USD",label:"USD"}]} ariaLabel="Moneda del aporte" onChange={setAC}/><button className="btn bl bsm" aria-label="Agregar aporte" onClick={()=>addSav(g)}><ic.Plus/></button><button className="btn bg bsm" aria-label="Cancelar aporte" onClick={()=>{setAT(null);setAA("");setAL("");}}><ic.X/></button></div>
                  </div>
                :<div className="goal-actions" style={{display:"grid",gridTemplateColumns:holdings.length>0?"1fr 1fr 1fr":"1fr 1fr",gap:7}}>
                    <button className="btn bg bsm" style={{justifyContent:"center"}} onClick={()=>setAT({id:g.id,mode:"cash"})}><ic.Plus/> Ahorro</button>
                    <button className="btn bg bsm" style={{justifyContent:"center",color:T.mango,borderColor:"rgba(255,154,53,.25)"}} onClick={()=>setAT({id:g.id,mode:"payment"})}><ic.Plus/> Pago</button>
                    {holdings.length>0&&<button className="btn bg bsm" style={{justifyContent:"center",color:T.blue,borderColor:"rgba(91,158,255,.3)"}} data-tour-target="vincular-inv-btn" onClick={()=>setLG(g.id)}><ic.Link/></button>}
                  </div>
            }
          </div>;
        })}
      </div>
    }

    {linkGoal&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setLG(null)}><div className="modal" style={{width:420}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontSize:17,fontWeight:700}}>Vincular inversión a meta</h2><button className="btn bg bsm" onClick={()=>setLG(null)}><ic.X/></button></div><div style={{fontSize:12,color:T.mid,marginBottom:14}}>El valor de mercado de la inversión contará hacia el progreso de la meta.</div>{holdings.filter(h=>!h.goalId).length===0?<div style={{color:T.muted,fontSize:12,textAlign:"center",padding:"20px 0"}}>No hay inversiones disponibles</div>:holdings.filter(h=>!h.goalId).map(h=><div key={h.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.raised,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${T.border}`}}><div><div style={{fontSize:13,fontWeight:600}}>{h.ticker||h.name} <span style={{fontSize:10,color:T.muted}}>{h.type}</span></div><div className="mono" style={{fontSize:11,color:T.blue,marginTop:2}}>{fmt(calcHoldingValueArs(h,marketPrices,usdRate).curArs)}</div></div><button className="btn bl bsm" onClick={()=>{update({holdings:holdings.map(x=>x.id===h.id?{...x,goalId:linkGoal}:x)});setLG(null);notify("Inversión vinculada ✓");}}>Vincular</button></div>)}</div></div>}

    {sf&&<div className="ov" onClick={e=>e.target===e.currentTarget&&setSF(false)}><div className="modal"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{fontSize:18,fontWeight:700}}>Nueva meta</h2><button className="btn bg bsm" aria-label="Cerrar formulario de meta" onClick={()=>setSF(false)}><ic.X/></button></div><div style={{display:"flex",flexDirection:"column",gap:12}}><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:7}}>Tipo de meta</label><div className="goal-icon-grid" role="radiogroup" aria-label="Tipo de meta">{GOAL_ICON_OPTIONS.map(option=><button type="button" role="radio" className="goal-icon-option" key={option.value} aria-label={option.label} aria-checked={form.icon===option.value} onClick={()=>setForm(f=>({...f,icon:option.value}))}><GoalIcon icon={option.value}/><span>{option.label}</span></button>)}</div></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Nombre</label><input className="inp" placeholder="ej: Viaje a Europa" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div><div className="g3"><div style={{gridColumn:"1/3"}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Monto objetivo</label><input className="inp" placeholder="500000" value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Moneda</label><AppSelect value={form.currency} options={[{value:"ARS",label:"ARS"},{value:"USD",label:"USD"}]} ariaLabel="Moneda de la meta" onChange={currency=>setForm(f=>({...f,currency}))}/></div></div><div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Ya tengo</label><input className="inp" placeholder="0" value={form.saved} onChange={e=>setForm(f=>({...f,saved:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha límite</label><input type="date" className="inp" value={form.deadline} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))}/></div></div><button className="btn bl" style={{justifyContent:"center"}} onClick={addG}>Crear meta</button></div></div></div>}
  </div>);
}

function Investments({state,update,notify}){
  const {savedAnalyses=[],riskProfile,goals=[],usdRate,displayCurrency="ARS",lastScanResult=null,lastScanAt=null}=state;
  const {fmt}=useDsp(state);
  const [tab,setTab]=useState("portfolio");
  const [scanning,setScan]=useState(false);
  const scanResult=lastScanResult;
  const [scanErr,setSE]=useState(null);
  const [ticker,setTicker]=useState("");
  const [tname,setTname]=useState("");
  const [loading,setLoad]=useState(false);
  const [loadErr,setLE]=useState(null);
  const [sel,setSel]=useState(null);
  const [justSaved,setJS]=useState(null);
  const [showHForm,setSHF]=useState(false);
  const [editingHoldingId,setEditingHoldingId]=useState(null);
  const [hForm,setHF]=useState(emptyHoldingForm);
  const holdingFormRef=useRef(null);
  const [comparing,setComp]=useState(false);
  const [compResult,setCompResult]=useState(null);
  const [compErr,setCompErr]=useState(null);
  const [cf,setCF]=useState({monthly:"200000",months:"12"});
  const rc={none:T.teal,low:T.lime,very_low:T.teal,medium:T.amber,medium_high:T.amber,high:T.red};
  const [refreshingId,setRI]=useState(null);
  const holdings=state.holdings||[];
  const marketPrices=state.marketPrices||{};

  const BANCOS_RATES=[{id:"GALICIA",name:"Banco Galicia",tna:36},{id:"NACION",name:"Banco Nación",tna:37},{id:"PROVINCIA",name:"Banco Provincia",tna:35},{id:"SANTANDER",name:"Santander",tna:33},{id:"BBVA",name:"BBVA Francés",tna:35},{id:"MACRO",name:"Banco Macro",tna:36},{id:"MERCADOPAGO",name:"Mercado Pago (FCI)",tna:38},{id:"UALA",name:"Ualá",tna:40},{id:"NARANJAX",name:"Naranja X",tna:42},{id:"OTRO",name:"Otro / Personalizado",tna:""}];

  const portfolioData=useMemo(()=>{
    let gInvArs=0,gCurArs=0;
    const items=holdings.map(h=>{const {invArs,curArs}=calcHoldingValueArs(h,marketPrices,usdRate);gInvArs+=invArs;gCurArs+=curArs;const pnlArs=curArs-invArs;const pnlPct=invArs?(pnlArs/invArs)*100:0;return{...h,invArs,curArs,pnlArs,pnlPct};});
    return{items,gInvArs,gCurArs,gPnlArs:gCurArs-gInvArs};
  },[holdings,marketPrices,usdRate]);

  const refreshPortfolio=async()=>{
    setRI("all");notify("Sincronizando mercado...","info");
    let newPrices={...marketPrices};let updated=0;
    for(const h of holdings){
      if(h.type==="crypto"){try{const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${h.ticker.toUpperCase()}USDT`);if(r.ok){const d=await r.json();newPrices[h.ticker]={price:parseFloat(d.price),currency:"USD",source:"binance",asOf:new Date().toISOString()};updated++;}}catch(e){}}
      else if(["accion","cedear","etf"].includes(h.type)){const qt=(h.type==="cedear"||h.originalCurrency==="ARS")&&!h.ticker.endsWith(".BA")?`${h.ticker}.BA`:h.ticker;const pd=await fetchStockPrice(qt);if(pd?.price){newPrices[h.ticker]={price:pd.price,currency:pd.currency||"USD",source:pd.source||"market",asOf:pd.asOf||new Date().toISOString(),marketState:pd.marketState||null};updated++;}}
    }
    update({marketPrices:newPrices});setRI(null);notify(`Mercado actualizado (${updated} activos) ✓`);
  };

  const refreshSavedPrices=async({silent=false}={})=>{
    if(!savedAnalyses.length)return;
    setRI("saved");
    if(!silent)notify("Actualizando cotizaciones...","info");
    try{
      const results=await Promise.all(savedAnalyses.map(async a=>({ticker:a.ticker,quote:await fetchStockPrice(a.ticker)})));
      const quotes=new Map(results.filter(r=>r.quote?.price).map(r=>[r.ticker,r.quote]));
      const nextPrices={...marketPrices};let updated=0;
      const nextSaved=savedAnalyses.map(a=>{
        const quote=quotes.get(a.ticker);
        if(!quote?.price)return a;
        const normalized={price:quote.price,currency:quote.currency||a.priceCurrency||"USD",source:quote.source||"market",asOf:quote.asOf||new Date().toISOString(),marketState:quote.marketState||null};
        nextPrices[a.ticker]=normalized;updated++;
        return withMarketQuote(a,normalized);
      });
      if(updated){
        update({marketPrices:nextPrices,savedAnalyses:nextSaved});
        setSel(current=>current?nextSaved.find(a=>a.ticker===current.ticker)||current:current);
      }
      if(!silent)notify(updated?`${updated} cotización${updated===1?"":"es"} actualizada${updated===1?"":"s"} ✓`:"No pudimos actualizar; mostramos el último precio guardado",updated?"ok":"err");
    }catch{
      if(!silent)notify("No pudimos actualizar; mostramos el último precio guardado","err");
    }finally{setRI(null);}
  };

  const autoRefreshSingle=async(h)=>{
    setRI(h.id);let newPrices={...marketPrices};
    if(h.type==="crypto"){try{const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${h.ticker.toUpperCase()}USDT`);if(r.ok){const d=await r.json();newPrices[h.ticker]={price:parseFloat(d.price),currency:"USD",source:"binance",asOf:new Date().toISOString()};update({marketPrices:newPrices});notify(`Cotización Binance actualizada ✓`);}else throw new Error();}catch{notify(`Error Binance para ${h.ticker}`,"err");}}
    else if(["accion","cedear","etf"].includes(h.type)){notify(`Buscando precio de ${h.ticker}...`,"info");const qt=(h.type==="cedear"||h.originalCurrency==="ARS")&&!h.ticker.endsWith(".BA")?`${h.ticker}.BA`:h.ticker;const pd=await fetchStockPrice(qt);if(pd?.price){newPrices[h.ticker]={price:pd.price,currency:pd.currency||"USD",source:pd.source||"market",asOf:pd.asOf||new Date().toISOString(),marketState:pd.marketState||null};update({marketPrices:newPrices});notify(`${h.ticker}: ${pd.currency==="ARS"?fQuoteARS(pd.price):fQuoteUSD(pd.price)} ✓`);}else notify(`No se encontró precio para ${h.ticker}`,"err");}
    else{notify(`Activo de tasa fija, rinde por tiempo ✓`);}
    setRI(null);
  };

  const editPriceManual=(h)=>{const cp=marketPrices[h.ticker]?.price||h.originalBuyPrice||h.buyPrice||0;const cc=marketPrices[h.ticker]?.currency||h.originalCurrency||"ARS";const p=window.prompt(`Precio manual para ${h.ticker} en ${cc}:`,cp);if(p&&!isNaN(px(p))&&px(p)>0){let np={...marketPrices};np[h.ticker]={price:px(p),currency:cc,source:"manual",asOf:new Date().toISOString()};update({marketPrices:np});notify(`Precio manual guardado ✓`);}};

  const closeHoldingForm=()=>{setSHF(false);setEditingHoldingId(null);setHF(emptyHoldingForm());};
  const openNewHolding=()=>{setEditingHoldingId(null);setHF(emptyHoldingForm());setSHF(true);requestAnimationFrame(()=>holdingFormRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));};
  const openEditHolding=h=>{
    const isVar=["accion","cedear","etf","crypto"].includes(h.type);
    const currency=h.originalCurrency||h.currency||"ARS";
    const totalInvested=isVar?"":String(currency==="USD"&&h.originalAmount?Number(h.originalAmount):(h.totalInvestedArs||h.totalInvested||""));
    setEditingHoldingId(h.id);
    setHF({type:h.type||"accion",ticker:isVar?(h.ticker||""):"",name:h.name||(isVar?"":h.ticker||""),quantity:isVar?String(h.quantity||h.qty||""):"",buyPrice:isVar?String(h.originalBuyPrice||h.buyPrice||""):"",totalInvested,currency,buyDate:h.buyDate||todayISO(),maturityDate:h.maturityDate||"",rate:String(h.rate||""),goalId:h.goalId||""});
    setSHF(true);
    requestAnimationFrame(()=>holdingFormRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));
  };
  const prefillAnalysisHolding=(analysis,quoteOverride=null)=>{
    const symbol=analysis?.ticker||"";
    const type=inferHoldingType(symbol);
    const quote=quoteOverride||marketPrices[symbol]||{price:analysis?.currentEstimate,currency:analysis?.priceCurrency||"USD"};
    setHF({...emptyHoldingForm(),type,ticker:symbol,name:analysis?.company||analysis?.name||symbol,buyPrice:quote?.price?String(quote.price):"",currency:type==="crypto"?"USD":quote?.currency||analysis?.priceCurrency||"USD"});
  };
  const openAnalysisHolding=analysis=>{
    const existing=holdings.find(holding=>holding.ticker===analysis.ticker);
    setSel(null);setTab("portfolio");
    if(existing)openEditHolding(existing);
    else{setEditingHoldingId(null);prefillAnalysisHolding(analysis);setSHF(true);}
    setTimeout(()=>holdingFormRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),60);
  };
  const saveHolding=()=>{
    const isVar=["accion","cedear","etf","crypto"].includes(hForm.type);
    const isFix=["plazo_fijo","fci","bono"].includes(hForm.type);
    let rawBuyPrice=px(hForm.buyPrice);let qty=px(hForm.quantity);let rawInv=px(hForm.totalInvested);
    const rawRate=px(hForm.rate);
    if(isVar&&(!hForm.ticker.trim()||qty<=0||rawBuyPrice<=0))return notify("Ingresá un ticker, una cantidad y un precio mayores a cero","err");
    if(isFix&&(!hForm.name.trim()||rawInv<=0||rawRate<=0||!isValidISODate(hForm.buyDate)))return notify("Ingresá entidad, capital y TNA válidos, además de la fecha inicial","err");
    if(isVar&&!isValidISODate(hForm.buyDate))return notify("Ingresá una fecha inicial válida","err");
    if(["plazo_fijo","bono"].includes(hForm.type)&&!isValidISODate(hForm.maturityDate))return notify("Ingresá una fecha de vencimiento válida","err");
    if(hForm.maturityDate&&new Date(`${hForm.maturityDate}T00:00:00`)<new Date(`${hForm.buyDate}T00:00:00`))return notify("El vencimiento debe ser posterior a la fecha inicial","err");
    const previous=editingHoldingId?holdings.find(item=>item.id===editingHoldingId):null;
    const previousPrice=Number(previous?.originalBuyPrice||previous?.buyPrice||0);const previousQty=Number(previous?.quantity||previous?.qty||0);const previousCurrency=previous?.originalCurrency||previous?.currency||"ARS";
    const derivedHistoricalFx=previousCurrency==="USD"&&previousQty>0&&previousPrice>0&&previous?.totalInvestedArs?previous.totalInvestedArs/(previousQty*previousPrice):null;
    const historicalFx=Number(previous?.fxRateAtEntry||derivedHistoricalFx||usdRate);
    const economicsChanged=!previous||previous.type!==hForm.type||previousQty!==qty||previousPrice!==rawBuyPrice||previousCurrency!==hForm.currency;
    const fxRateAtEntry=isVar&&hForm.currency==="USD"?(previous&&previousCurrency==="USD"?historicalFx:usdRate):1;
    let invArs=isVar?(economicsChanged?qty*rawBuyPrice*fxRateAtEntry:(previous.totalInvestedArs||qty*rawBuyPrice*fxRateAtEntry)):rawInv;
    const normalized={...(previous||{}),id:previous?.id||`h_${uid()}`,type:hForm.type,ticker:isFix?hForm.name.trim():hForm.ticker.trim().toUpperCase(),name:hForm.name.trim(),quantity:isVar?qty:0,originalBuyPrice:isVar?rawBuyPrice:0,originalCurrency:isVar?hForm.currency:"ARS",fxRateAtEntry,totalInvestedArs:invArs,rate:isFix?rawRate:0,buyDate:hForm.buyDate,maturityDate:["plazo_fijo","bono"].includes(hForm.type)?hForm.maturityDate:"",goalId:hForm.goalId||null};
    update({holdings:previous?holdings.map(item=>item.id===previous.id?normalized:item):[...holdings,normalized]});
    closeHoldingForm();
    notify(previous?"Inversión actualizada ✓":"Inversión guardada ✓");
  };

  const delHolding=id=>{if(!window.confirm("¿Eliminar esta inversión del portfolio?"))return;update({holdings:holdings.filter(h=>h.id!==id)});notify("Inversión eliminada","err");};
  const PRESETS=[{t:"BTC",n:"Bitcoin"},{t:"ETH",n:"Ethereum"},{t:"AAPL",n:"Apple"},{t:"NVDA",n:"NVIDIA"},{t:"MELI",n:"MercadoLibre"},{t:"VIST",n:"Vista Oil"},{t:"YPF",n:"YPF SA"},{t:"SPY",n:"S&P 500 ETF"}];

  const runScanner=async()=>{
    if(!riskProfile)return notify("Configurá tu perfil en el onboarding","info");
    setScan(true);setSE(null);
    try{const r=await autoScanInvestments(riskProfile,usdRate);
      const np={...marketPrices};
      if(r?.opportunities){const pr=await Promise.all(r.opportunities.map(o=>fetchStockPrice(o.ticker)));r.opportunities=r.opportunities.map((o,i)=>{const pd=pr[i];if(pd?.price){const normalized={price:pd.price,currency:pd.currency||"USD",source:pd.source||"market",asOf:pd.asOf||new Date().toISOString(),marketState:pd.marketState||null};o=withMarketQuote(o,normalized);np[o.ticker]=normalized;}return o;});}
      update({marketPrices:np,lastScanResult:r,lastScanAt:r.scanDate||todayISO()});notify(`${r.opportunities?.length||0} oportunidades ✓`);
    }catch(e){setSE(e.message||"No se pudo analizar el mercado");}
    finally{setScan(false);}
  };

  const analyze=async(t,n)=>{
    const ex=savedAnalyses.find(a=>a.ticker===t);
    if(ex){
      setSel(ex);prefillAnalysisHolding({...ex,company:n||ex.company});setLoad(true);setLE(null);
      try{const pd=await fetchStockPrice(t);if(pd?.price){const normalized={price:pd.price,currency:pd.currency||ex.priceCurrency||"USD",source:pd.source||"market",asOf:pd.asOf||new Date().toISOString(),marketState:pd.marketState||null};const refreshed=withMarketQuote(ex,normalized);update({savedAnalyses:savedAnalyses.map(a=>a.ticker===t?refreshed:a),marketPrices:{...state.marketPrices,[t]:normalized}});setSel(refreshed);prefillAnalysisHolding({...refreshed,company:n||refreshed.company},normalized);}}
      catch{setLE(`No se pudo actualizar ${t}. Mostramos el último precio guardado.`);}
      finally{setLoad(false);}
      return;
    }
    setLoad(true);setLE(null);
    try{let[r,pd]=await Promise.all([analyzeStock(t,n||t),fetchStockPrice(t)]);const np={...state.marketPrices};let normalized=null;if(pd?.price){normalized={price:pd.price,currency:pd.currency||"USD",source:pd.source||"market",asOf:pd.asOf||new Date().toISOString(),marketState:pd.marketState||null};r=withMarketQuote(r,normalized);np[t]=normalized;}r={...r,ticker:r.ticker||t,company:n||r.company||t,dataAsOf:r.dataAsOf||todayISO()};prefillAnalysisHolding(r,normalized);update({savedAnalyses:[r,...savedAnalyses.filter(a=>a.ticker!==r.ticker)],marketPrices:np});setSel(r);
    }catch(e){setLE(e.message||`Error al analizar ${t}`);}
    finally{setLoad(false);}
  };

  const runComparison=async()=>{const monthly=px(cf.monthly);const months=px(cf.months);if(monthly<=0||months<=0)return setCompErr("Ingresá un monto y un plazo válidos.");setComp(true);setCompErr(null);try{setCompResult(await compareInstruments(monthly,months,usdRate));}catch(e){setCompErr(e.message||"No se pudo completar la comparación.");}finally{setComp(false);}};

  const saveFromScan=opp=>{
    const a={ticker:opp.ticker,company:opp.name,sector:"",signal:opp.signal,timeframe:opp.timeframe,upside:opp.upside,currentEstimate:opp.currentEstimate,priceCurrency:opp.priceCurrency||marketPrices[opp.ticker]?.currency||"USD",quoteSource:opp.quoteSource||marketPrices[opp.ticker]?.source||null,quoteAsOf:opp.quoteAsOf||marketPrices[opp.ticker]?.asOf||null,peRatio:opp.peRatio,revenueGrowth:opp.revenueGrowth,moat:opp.moat,bullCase:opp.thesis,bearCase:opp.bearRisk,catalysts:opp.catalysts||[],risks:[opp.bearRisk],summary:opp.thesis,confidenceScore:opp.confidenceScore,sources:scanResult?.sources||[],dataAsOf:scanResult?.scanDate||lastScanAt||todayISO()};
    update({savedAnalyses:[a,...savedAnalyses.filter(s=>s.ticker!==a.ticker)]});setJS(opp.ticker);setTimeout(()=>setJS(null),2500);notify(`${opp.ticker} guardado ✓`);
  };

  return(<div className="up">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:8}}><div><h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-1px"}}>Inteligencia de Inversiones</h1><div style={{fontSize:12,color:T.muted,marginTop:4}}>Perfil: <span style={{color:T.lime,fontWeight:600}}>{riskLabel(riskProfile?.risk)}</span>{riskProfile?.horizon&&<span> · {horizonLabel(riskProfile.horizon)}</span>}</div></div></div>
    <div className="tabbar" style={{marginBottom:18}}>{[{id:"portfolio",l:<><IcPortfolio/> Portfolio ({holdings.length})</>},{id:"scanner",l:<><IcScanner/> Scanner IA</>,target:"scanner-tab"},{id:"manual",l:<><IcSearch/> Buscar Activo</>},{id:"comparador",l:<><IcCompare/> Comparador</>},{id:"saved",l:<><IcSaved/> Guardados</>}].map(t=>(<button key={t.id} data-tour-target={t.target||undefined} className={`tab${tab===t.id?" on":""}`} onClick={()=>{if(t.id!=="portfolio"){setSHF(false);setEditingHoldingId(null);}setTab(t.id);if(t.id==="saved")refreshSavedPrices({silent:true});}}>{t.l}</button>))}</div>

    {tab==="portfolio"&&<div>
      <div className="kpi-grid portfolio-kpis" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>{[{l:"Invertido",v:fmt(portfolioData.gInvArs),c:T.blue,i:<IcInvested/>},{l:"Valor Actual",v:fmt(portfolioData.gCurArs),c:T.lime,i:<IcPortfolio/>},{l:"P&L Total",v:`${portfolioData.gPnlArs>=0?"+":""}${fmt(portfolioData.gPnlArs)}`,c:portfolioData.gPnlArs>=0?T.teal:T.coral,i:<IcBalance/>}].map((k,i)=><div key={i} className="card csm"><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase"}}>{k.l}</span><span>{k.i}</span></div><div className="mono" style={{fontSize:16,fontWeight:600,color:k.c}}>{k.v}</div></div>)}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button data-tour-target="add-holding-btn" className="btn bl" onClick={openNewHolding}><ic.Plus/> Agregar inversión</button>
        <button className="btn bg" onClick={refreshPortfolio} disabled={refreshingId==="all"}>{refreshingId==="all"?<><Dots/> Sincronizando...</>:<><ic.Refresh/> Sincronizar Activos</>}</button>
      </div>
      {showHForm&&<div ref={holdingFormRef} className="card" style={{marginBottom:14,scrollMarginTop:18}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:10}}><div><div style={{fontSize:14,fontWeight:700}}>{editingHoldingId?"Editar inversión":"Nueva inversión"}</div>{editingHoldingId&&<div style={{fontSize:10,color:T.muted,marginTop:3}}>Modificá los datos de compra, fechas o vínculo con una meta.</div>}</div><button className="btn bg bsm" aria-label="Cerrar formulario de inversión" onClick={closeHoldingForm}><ic.X/></button></div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Tipo</label><AppSelect value={hForm.type} options={[{value:"accion",label:"Acción",icon:<InstrumentIcon type="accion"/>},{value:"cedear",label:"CEDEAR",icon:<InstrumentIcon type="cedear"/>},{value:"etf",label:"ETF",icon:<InstrumentIcon type="etf"/>},{value:"crypto",label:"Crypto",icon:<InstrumentIcon type="crypto"/>},{value:"plazo_fijo",label:"Plazo fijo",icon:<InstrumentIcon type="plazo_fijo"/>},{value:"fci",label:"FCI",icon:<InstrumentIcon type="fci"/>},{value:"bono",label:"Bono",icon:<InstrumentIcon type="bono"/>}]} ariaLabel="Tipo de inversión" onChange={t=>{let ac=hForm.currency;if(["cedear","plazo_fijo","fci","bono"].includes(t))ac="ARS";if(t==="crypto")ac="USD";setHF(f=>({...f,type:t,currency:ac}));}}/></div>
          {["accion","cedear","etf","crypto"].includes(hForm.type)?<>
            <div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Ticker/Símbolo</label><input className="inp" value={hForm.ticker} onChange={e=>setHF(f=>({...f,ticker:e.target.value.toUpperCase()}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Nombre</label><input className="inp" value={hForm.name} onChange={e=>setHF(f=>({...f,name:e.target.value}))}/></div></div>
            <div className="g3"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Cant.</label><input className="inp" value={hForm.quantity} onChange={e=>setHF(f=>({...f,quantity:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Precio Unit.</label><input className="inp" value={hForm.buyPrice} onChange={e=>setHF(f=>({...f,buyPrice:e.target.value}))}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Moneda</label><AppSelect value={hForm.currency} disabled={["cedear","crypto"].includes(hForm.type)} style={{opacity:["cedear","crypto"].includes(hForm.type)?0.6:1}} options={[{value:"ARS",label:"ARS"},{value:"USD",label:"USD"}]} ariaLabel="Moneda de la inversión" onChange={currency=>setHF(f=>({...f,currency}))}/></div></div>
          </>:<>
            <div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Banco / Entidad</label><AppSelect value={hForm.name} placeholder="Seleccionar banco…" options={BANCOS_RATES.map(bank=>({value:bank.name,label:`${bank.name}${bank.tna?` (${bank.tna}%)`:""}`}))} ariaLabel="Banco o entidad" searchable onChange={name=>{const s=BANCOS_RATES.find(b=>b.name===name);setHF(f=>({...f,name,rate:s&&s.tna?s.tna:f.rate}));}}/></div><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>TNA %</label><input className="inp" value={hForm.rate} onChange={e=>setHF(f=>({...f,rate:e.target.value}))} placeholder="35.5"/></div></div>
            <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Capital Inicial (ARS)</label><input className="inp" value={hForm.totalInvested} onChange={e=>setHF(f=>({...f,totalInvested:e.target.value}))}/></div>
          </>}
          <div className="g2"><div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha Inicial *</label><input type="date" className="inp" value={hForm.buyDate} onChange={e=>setHF(f=>({...f,buyDate:e.target.value}))}/></div>{["plazo_fijo","bono"].includes(hForm.type)&&<div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Fecha Vencimiento *</label><input type="date" className="inp" value={hForm.maturityDate} onChange={e=>setHF(f=>({...f,maturityDate:e.target.value}))}/></div>}</div>
          <div><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Vincular a Meta</label><AppSelect value={hForm.goalId} options={[{value:"",label:"Ninguna"},...goals.filter(g=>goalCash(g)<g.target||g.id===hForm.goalId).map(goal=>({value:goal.id,label:goal.name,icon:<span className="goal-icon-badge"><GoalIcon icon={goal.icon} size={15}/></span>}))]} ariaLabel="Meta vinculada" onChange={goalId=>setHF(f=>({...f,goalId}))}/></div>
          <button className="btn bl" style={{justifyContent:"center",marginTop:10,width:"100%"}} onClick={saveHolding}><ic.Check/>{editingHoldingId?"Guardar cambios":"Guardar inversión"}</button>
        </div></div>}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {portfolioData.items.map(h=>{
          const symDisplay=h.originalCurrency==="USD"?"US$ ":"AR$ ";
          const buyPriceDisplay=h.originalBuyPrice||h.buyPrice||0;
          const cmp=marketPrices[h.ticker];
          return(<div key={h.id} className="card" style={{padding:"14px"}}>
            <div className="holding-head" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div className="holding-copy" style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}><span className="category-icon" style={{color:"var(--ac)"}}><InstrumentIcon type={h.type}/></span><div style={{minWidth:0}}><div style={{fontSize:14,fontWeight:700}}>{h.ticker||h.name} <span style={{fontSize:10,color:T.muted,fontWeight:500}}>{instrumentLabel(h.type)}</span></div>{h.name&&h.name!==(h.ticker||"")&&<div style={{fontSize:10,color:T.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</div>}<div style={{fontSize:11,color:T.muted,marginTop:2}}>{h.quantity?`${h.quantity} un. a ${symDisplay}${buyPriceDisplay.toLocaleString("en-US")}`:`TNA ${h.rate}%`}{cmp&&<span style={{marginLeft:8,color:T.mid}}>· actual: {cmp.currency==="USD"?fUSD(cmp.price):fARS(cmp.price)}</span>}</div></div></div>
              <div className="holding-actions" style={{display:"flex",gap:6}}>
                {["accion","cedear","etf","crypto"].includes(h.type)&&<button className="btn bg bsm" aria-label={`Actualizar cotización de ${h.ticker||h.name}`} title="Actualizar cotización" style={{color:T.lime,padding:"4px 8px"}} onClick={()=>autoRefreshSingle(h)} disabled={refreshingId===h.id}>{refreshingId===h.id?<Dots/>:<ic.Refresh/>}</button>}
                {["accion","cedear","etf","crypto"].includes(h.type)&&<button className="btn bg bsm" aria-label={`Ingresar cotización manual de ${h.ticker||h.name}`} title="Cotización manual" style={{padding:"4px 8px"}} onClick={()=>editPriceManual(h)}><ic.Salary/></button>}
                <button className="btn bg bsm" aria-label={`Editar inversión ${h.ticker||h.name}`} title="Editar inversión" style={{padding:"4px 8px"}} onClick={()=>openEditHolding(h)}><ic.Edit/></button>
                <button className="btn bd bsm" aria-label={`Eliminar inversión ${h.ticker||h.name}`} title="Eliminar inversión" style={{padding:"4px 8px"}} onClick={()=>delHolding(h.id)}><ic.Trash/></button>
              </div>
            </div>
            <div className="holding-metrics" style={{display:"grid",gap:8,background:T.raised,padding:"10px",borderRadius:8,marginTop:8}}>
              <div><div style={{fontSize:9,color:T.muted}}>Inicial</div><div className="mono" style={{fontSize:11}}>{fmt(h.invArs)}</div></div>
              <div><div style={{fontSize:9,color:T.muted}}>Actual</div><div className="mono" style={{fontSize:11,color:T.white}}>{fmt(h.curArs)}</div></div>
              <div><div style={{fontSize:9,color:T.muted}}>Ganancia</div><div className="mono" style={{fontSize:11,color:h.pnlArs>=0?T.teal:T.red}}>{h.pnlArs>=0?"+":""}{fmt(h.pnlArs)}</div></div>
              <div><div style={{fontSize:9,color:T.muted}}>Rend %</div><div className="mono" style={{fontSize:11,color:h.pnlArs>=0?T.teal:T.red}}>{h.pnlArs>=0?"+":""}{h.pnlPct.toFixed(1)}%</div></div>
            </div>
            <div className="holding-link" style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,color:T.muted}}>Vincular a meta:</span>
              <AppSelect compact style={{width:"auto",minWidth:150}} value={h.goalId||""} options={[{value:"",label:"Ninguna"},...goals.map(goal=>({value:goal.id,label:goal.name,icon:<span className="goal-icon-badge"><GoalIcon icon={goal.icon} size={15}/></span>}))]} ariaLabel={`Meta vinculada a ${h.ticker||h.name}`} onChange={goalId=>{update({holdings:holdings.map(x=>x.id===h.id?{...x,goalId}:x)});notify("Meta vinculada ✓");}}/>
            </div>
          </div>);
        })}
      </div>
    </div>}

    {tab==="scanner"&&<div>
      <div className="card" style={{marginBottom:14,background:`linear-gradient(135deg,${T.surface},#0f1525)`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:10}}>
          <div><div style={{fontSize:15,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:7}}><ic.Sparkles/> Scanner automático con IA</div><div style={{fontSize:12,color:T.muted}}>Precios reales + análisis adaptado a tu perfil.</div></div>
          <button className="btn bl" onClick={runScanner} disabled={scanning}>{scanning?<><Dots/> Analizando...</>:<><ic.Scan/> Escanear mercado</>}</button>
        </div>
        {riskProfile&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><div className="chip"><ic.Shield/> {riskLabel(riskProfile.risk)}</div><div className="chip"><IcCalendar/> {horizonLabel(riskProfile.horizon)}</div></div>}
      </div>
      {scanErr&&<div style={{background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:10,padding:"10px 14px",fontSize:12,color:T.red,marginBottom:14,display:"flex",alignItems:"center",gap:7}}><ic.Alert/>{scanErr}</div>}
      {scanning&&<div style={{textAlign:"center",padding:"48px 0",color:T.muted}}><div style={{width:48,height:48,margin:"0 auto 12px",background:"rgba(255,154,53,.1)",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",color:T.mango,animation:"pulse-glow 1.5s infinite"}}><IcScanner/></div><div style={{fontSize:14,marginBottom:8}}>Analizando el mercado...</div><Dots/></div>}
      {scanResult&&!scanning&&<div>
        {scanResult.marketContext&&<div style={{background:"rgba(77,158,255,.07)",border:`1px solid rgba(77,158,255,.15)`,borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12,color:T.blue,display:"flex",alignItems:"flex-start",gap:7}}><ic.Globe/><span>{scanResult.marketContext}</span></div>}
        <SourcesMeta sources={scanResult.sources} asOf={scanResult.scanDate||lastScanAt} label="Fuentes del scanner"/>
        <div className="inv-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
          {scanResult.opportunities?.map((opp,i)=>(
            <div key={i} className="card" style={{cursor:"pointer",border:`1px solid ${opp.ticker===scanResult.topPick?T.lime:T.border}`,background:opp.ticker===scanResult.topPick?"rgba(200,255,87,.03)":T.surface,position:"relative",transition:"all .2s"}}>
              {opp.ticker===scanResult.topPick&&<div style={{position:"absolute",top:-8,right:12,background:T.lime,color:T.bg,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99}}>TOP PICK</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div><div style={{display:"flex",gap:7,alignItems:"center",marginBottom:3}}><span className="mono" style={{fontSize:16,fontWeight:700}}>{opp.ticker}</span><span className={`tag ${sigCls(opp.signal)}`} style={{fontSize:10}}>{opp.signal}</span></div><div style={{fontSize:11,color:T.muted}}>{opp.name}</div>{opp.currentEstimate>0&&<div className="mono" style={{fontSize:11,color:T.mid,marginTop:2}}>{formatMarketQuote(marketPrices[opp.ticker]?.price||opp.currentEstimate,marketPrices[opp.ticker]?.currency||opp.priceCurrency||"USD",displayCurrency,usdRate)}</div>}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>{[{l:"Upside",v:Number.isFinite(opp.upside)?`${opp.upside>0?"+":""}${opp.upside.toFixed(0)}%`:"—",c:Number.isFinite(opp.upside)?(opp.upside>0?T.lime:T.red):T.muted},{l:"Fit",v:`${opp.profileFit||0}%`,c:(opp.profileFit||0)>=70?T.teal:T.amber},{l:"Confianza",v:`${opp.confidenceScore||0}%`,c:(opp.confidenceScore||0)>=70?T.lime:T.amber}].map((s,j)=>(<div key={j} style={{background:T.raised,borderRadius:7,padding:"6px 8px"}}><div style={{fontSize:9,color:T.muted,marginBottom:2}}>{s.l}</div><div className="mono" style={{fontSize:12,color:s.c}}>{s.v}</div></div>))}</div>
              <div style={{fontSize:11,color:T.muted,lineHeight:1.5,marginBottom:10,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{opp.thesis}</div>
              <button className={`btn bsm ${justSaved===opp.ticker?"bl":"bg"}`} style={{width:"100%",justifyContent:"center"}} onClick={e=>{e.stopPropagation();saveFromScan(opp);}}>{justSaved===opp.ticker?<><ic.Check/> Guardado</>:"+ Analizar en detalle"}</button>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,color:T.muted,textAlign:"center",marginTop:12,display:"flex",justifyContent:"center",alignItems:"center",gap:6}}><ic.Alert/> Análisis educativo. No constituye asesoramiento financiero.</div>
      </div>}
      {!scanResult&&!scanning&&!scanErr&&<div style={{textAlign:"center",padding:"48px 32px",color:T.muted}}><div style={{width:52,height:52,margin:"0 auto 14px",background:"rgba(255,154,53,.08)",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",color:T.mango}}><IcScanner/></div><div style={{fontSize:14,marginBottom:4}}>El scanner analiza el mercado automáticamente</div><div style={{fontSize:12}}>Usa tu perfil de riesgo para encontrar oportunidades</div></div>}
    </div>}

    {tab==="manual"&&<div>
      <div className="card" style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:10}}>Buscar Activo — precio real + análisis IA</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <input className="inp" style={{flex:.6,minWidth:80}} placeholder="ej: ASTS" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&analyze(ticker,tname)}/>
          <input className="inp" style={{flex:1.2,minWidth:120}} placeholder="Nombre (opcional)" value={tname} onChange={e=>setTname(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyze(ticker,tname)}/>
          <button className="btn bl" onClick={()=>analyze(ticker,tname)} disabled={loading||!ticker}>{loading?<Dots/>:<><ic.Stock/> Buscar y Analizar</>}</button>
        </div>
        {loadErr&&<div style={{marginTop:10,background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.red}}>{loadErr}</div>}
        <div style={{marginTop:12}}><div style={{fontSize:10,color:T.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:".6px"}}>Acceso rápido</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PRESETS.map(p=><button key={p.t} onClick={()=>analyze(p.t,p.n)} disabled={loading} style={{padding:"5px 11px",borderRadius:7,fontSize:11,fontWeight:500,border:`1px solid ${savedAnalyses.find(a=>a.ticker===p.t)?T.lime:T.border}`,background:savedAnalyses.find(a=>a.ticker===p.t)?"rgba(200,255,87,.08)":T.raised,color:savedAnalyses.find(a=>a.ticker===p.t)?T.lime:T.mid,cursor:"pointer",transition:"all .15s"}}>{p.t}</button>)}</div>
        </div>
      </div>
      {sel&&<div><AnalysisDetail a={sel} quote={marketPrices[sel.ticker]} displayCurrency={displayCurrency} usdRate={usdRate} onClose={()=>setSel(null)}/>{sel.currentEstimate>0&&<div style={{marginTop:10,background:"rgba(200,255,87,.06)",border:`1px solid rgba(200,255,87,.2)`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div style={{fontSize:12,color:T.mid}}>Última cotización regular: <span className="mono" style={{color:T.lime}}>{formatMarketQuote(marketPrices[sel.ticker]?.price||sel.currentEstimate,marketPrices[sel.ticker]?.currency||sel.priceCurrency||"USD",displayCurrency,usdRate)}</span></div><button className="btn bl bsm" onClick={()=>openAnalysisHolding(sel)}>{holdings.some(holding=>holding.ticker===sel.ticker)?<><ic.Edit/>Editar en portfolio</>:<><ic.Plus/>Agregar al portfolio</>} <ic.ArrowRight/></button></div>}</div>}
    </div>}

    {tab==="comparador"&&<div className="card">
      <div style={{marginBottom:14}}><div style={{fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:7}}><IcCompare/>Comparador de instrumentos</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>FCI, plazo fijo, bonos CER, CEDEARs — contexto argentino 2026</div></div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:130}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Ahorro mensual (ARS)</label><input className="inp" value={cf.monthly} onChange={e=>setCF(f=>({...f,monthly:e.target.value}))}/></div>
        <div style={{flex:1,minWidth:90}}><label style={{fontSize:11,color:T.muted,display:"block",marginBottom:5}}>Plazo (meses)</label><input className="inp" value={cf.months} onChange={e=>setCF(f=>({...f,months:e.target.value}))}/></div>
        <div style={{display:"flex",alignItems:"flex-end"}}><button className="btn bl" onClick={runComparison} disabled={comparing}>{comparing?<Dots/>:<><ic.Refresh/> Comparar</>}</button></div>
      </div>
      {compErr&&<div style={{marginBottom:12,background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.red}}>{compErr}</div>}
      {compResult?<div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>{compResult.instruments?.map((inst,i)=>(<div key={i} style={{background:T.raised,borderRadius:12,padding:"12px 16px",border:`1px solid ${T.border}`,display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}><div style={{flex:"2 1 140px"}}><div style={{fontSize:12,fontWeight:600}}>{inst.name}</div><div style={{fontSize:10,color:T.muted,marginTop:2}}>{inst.pros}</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Ret. anual</div><div className="mono" style={{fontSize:13,color:Number.isFinite(inst.annualReturn)?T.lime:T.muted}}>{Number.isFinite(inst.annualReturn)?`${inst.annualReturn.toFixed(1)}%`:"—"}</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Final USD</div><div className="mono" style={{fontSize:13,color:Number.isFinite(inst.finalUSD)?T.teal:T.muted}}>{Number.isFinite(inst.finalUSD)?fUSD(inst.finalUSD):"—"}</div></div><div style={{flex:"1 1 60px"}}><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Riesgo</div><span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:`${rc[inst.risk]||T.mid}1A`,color:rc[inst.risk]||T.mid}}>{(inst.risk||"").replace(/_/g," ")}</span></div><div style={{flex:"1.5 1 100px",fontSize:10,color:T.muted}}>{inst.cons}</div></div>))}</div>
        {compResult.recommendation&&<div style={{background:"rgba(200,255,87,.06)",border:`1px solid rgba(200,255,87,.2)`,borderRadius:10,padding:"12px 16px"}}><div style={{fontSize:11,color:T.lime,fontWeight:600,marginBottom:4,display:"flex",alignItems:"center",gap:6}}><ic.Sparkles/> Lectura comparativa</div><div style={{fontSize:12,color:T.mid}}>{compResult.recommendation}</div><div style={{fontSize:10,color:T.muted,marginTop:6}}>{compResult.disclaimer}</div></div>}
        <SourcesMeta sources={compResult.sources} asOf={compResult.dataAsOf} label="Fuentes del comparador"/>
      </div>:<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:13}}>Ingresá monto y plazo para comparar instrumentos</div>}
    </div>}

    {tab==="saved"&&<div>
      {savedAnalyses.length===0?<div style={{textAlign:"center",padding:"48px 32px",color:T.muted}}><div style={{width:52,height:52,margin:"0 auto 14px",background:"rgba(91,158,255,.08)",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",color:T.blue}}><IcSaved/></div><div style={{fontSize:14}}>Sin análisis guardados</div></div>:(
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12,flexWrap:"wrap"}}><div><div style={{fontSize:12,fontWeight:600}}>Última cotización regular</div><div style={{fontSize:10,color:T.muted,marginTop:2}}>USD conserva el precio de mercado; ARS usa el dólar seleccionado.</div></div><button className="btn bg bsm" onClick={()=>refreshSavedPrices()} disabled={refreshingId==="saved"}>{refreshingId==="saved"?<><Dots/> Actualizando...</>:<><ic.Refresh/> Actualizar precios</>}</button></div>
          <div className="inv-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10,marginBottom:14}}>
          {savedAnalyses.map(a=>{const quote=marketPrices[a.ticker]||{price:a.currentEstimate,currency:a.priceCurrency||"USD",source:a.quoteSource,asOf:a.quoteAsOf};const price=quote.price||a.currentEstimate;const asOf=quoteTime(quote.asOf||a.quoteAsOf);return(
            <div key={a.ticker} onClick={()=>setSel(sel?.ticker===a.ticker?null:withMarketQuote(a,quote))} className="card" style={{cursor:"pointer",border:`1px solid ${sel?.ticker===a.ticker?T.lime:T.border}`,transition:"all .2s",position:"relative"}}>
              <div style={{position:"absolute",top:12,right:12,display:"flex",gap:6}}><button onClick={e=>{e.stopPropagation();openAnalysisHolding(withMarketQuote(a,quote));}} className="btn bg bsm" aria-label={`${holdings.some(holding=>holding.ticker===a.ticker)?"Editar":"Cargar"} inversión ${a.ticker}`} title={holdings.some(holding=>holding.ticker===a.ticker)?"Editar en portfolio":"Agregar al portfolio"}>{holdings.some(holding=>holding.ticker===a.ticker)?<ic.Edit/>:<ic.Plus/>}</button><button onClick={e=>{e.stopPropagation();update({savedAnalyses:savedAnalyses.filter(x=>x.ticker!==a.ticker)});if(sel?.ticker===a.ticker)setSel(null);notify("Eliminado","err");}} className="btn bd bsm" aria-label={`Eliminar análisis de ${a.ticker}`} title="Eliminar análisis"><ic.Trash/></button></div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,paddingRight:72}}><span className="mono" style={{fontSize:16,fontWeight:700}}>{a.ticker}</span><span className={`tag ${sigCls(a.signal)}`} style={{fontSize:10}}>{a.signal}</span></div>
              <div style={{fontSize:11,color:T.muted,marginBottom:6}}>{a.company}</div>
              {price>0&&<div className="mono" style={{fontSize:11,color:T.mid,marginBottom:asOf?3:8}}>Precio: {formatMarketQuote(price,quote.currency||a.priceCurrency||"USD",displayCurrency,usdRate)}</div>}
              {asOf&&<div style={{fontSize:9,color:T.muted,marginBottom:8}}>Actualizado {asOf}</div>}
              <div style={{display:"flex",gap:7}}>{[{l:"Upside",v:Number.isFinite(a.upside)?`${a.upside>0?"+":""}${a.upside.toFixed(0)}%`:"—",c:Number.isFinite(a.upside)?(a.upside>0?T.lime:T.red):T.muted},{l:"Confianza",v:`${a.confidenceScore||0}%`,c:(a.confidenceScore||0)>=70?T.lime:T.amber}].map((s,i)=>(<div key={i} style={{background:T.raised,borderRadius:7,padding:"6px 10px"}}><div style={{fontSize:9,color:T.muted,marginBottom:2}}>{s.l}</div><div className="mono" style={{fontSize:12,color:s.c}}>{s.v}</div></div>))}</div>
            </div>
          );})}
        </div>{sel&&<AnalysisDetail a={sel} quote={marketPrices[sel.ticker]} displayCurrency={displayCurrency} usdRate={usdRate} onClose={()=>setSel(null)}/>}</div>
      )}
    </div>}
  </div>);
}

function Analytics({state,update,setView}){
  const {transactions=[],goals=[],salaries=[],displayCurrency,holdings=[],marketPrices={},usdRate}=state;
  const {fmt,toDsp}=useDsp(state);
  const NOW=getNow();
  const [range,setRange]=useState(6);
  const selectedMonthKeys=useMemo(()=>Array.from({length:range},(_,i)=>{const date=new Date(NOW.getFullYear(),NOW.getMonth()-range+1+i,1);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;}),[NOW.getFullYear(),NOW.getMonth(),range]);

  const months=useMemo(()=>Array.from({length:range},(_,i)=>{
    const d=new Date(NOW.getFullYear(),NOW.getMonth()-range+1+i,1);
    const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const txs=transactions.filter(t=>gMonth(t.date)===m);
    const e=txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
    const inc=getMonthIncomeParts(salaries,transactions,m).total;
    return{name:MOS[d.getMonth()],Gastos:toDsp(e),Ingresos:toDsp(inc),Ahorro:toDsp(Math.max(0,inc-e)),balance:toDsp(inc-e)};
  }),[transactions,salaries,range,toDsp]);
  const hasHistory=months.some(m=>m.Ingresos>0||m.Gastos>0);

  const cm={};
  transactions.filter(t=>t.type==="expense"&&selectedMonthKeys.includes(gMonth(t.date))).forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});
  const ctot=Object.values(cm).reduce((s,v)=>s+v,0);
  const palette=CPAL[state.displayCurrency==="USD"?"USD":"ARS"];
  const cats=Object.entries(cm).sort((a,b)=>b[1]-a[1]).map(([c,v],i)=>({c,v:toDsp(v),pct:ctot>0?(v/ctot*100).toFixed(1):0,col:palette[i%palette.length]}));

  let totInc=0;
  selectedMonthKeys.forEach(m=>{totInc+=getMonthIncomeParts(salaries,transactions,m).total;});
  const totExp=transactions.filter(t=>t.type==="expense"&&selectedMonthKeys.includes(gMonth(t.date))).reduce((s,t)=>s+t.amount,0);
  const hasSavingsEvidence=totInc>0&&totExp>0;const savR=hasSavingsEvidence?clamp(((totInc-totExp)/totInc)*100,-100,100).toFixed(1):null;const savN=savR===null?null:parseFloat(savR);

  const portfolioValArs=holdings.reduce((s,h)=>s+calcHoldingValueArs(h,marketPrices,usdRate).curArs,0);
  const portfolioInvArs=holdings.reduce((s,h)=>s+calcHoldingValueArs(h,marketPrices,usdRate).invArs,0);
  const portfolioPnlArs=portfolioValArs-portfolioInvArs;
  const totalSavingsArs=transactions.filter(t=>t.category==="💰 Ahorro").reduce((s,t)=>s+t.amount,0);
  const goalPaymentsArs=goals.reduce((s,g)=>(g.payments||[]).reduce((a,p)=>a+p.amount,s),0);

  return(<div className="up">
    <PH title="Analíticas" sub="Histórico · Proyecciones · Patrimonio" right={<div style={{display:"flex",gap:8,alignItems:"center"}}>{setView&&<button className="btn bg bsm" onClick={()=>setView("salary")}><ic.Salary/>Editar sueldo</button>}<AppSelect compact style={{width:130}} value={range} options={[{value:3,label:"3 meses"},{value:6,label:"6 meses"},{value:12,label:"12 meses"}]} ariaLabel="Rango de analíticas" onChange={value=>setRange(Number(value))}/></div>}/>

    {(portfolioValArs>0||totalSavingsArs>0)&&
      <div className="kpi-grid analytics-wealth-kpis" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[{l:"Portfolio",v:fmt(portfolioValArs),c:T.blue,i:<IcPortfolio/>},{l:"P&L Portfolio",v:`${portfolioPnlArs>=0?"+":""}${fmt(portfolioPnlArs)}`,c:portfolioPnlArs>=0?T.teal:T.red,i:<IcInvested/>},{l:"Ahorros (Efectivo)",v:fmt(totalSavingsArs+goalPaymentsArs),c:T.teal,i:<IcFree/>},{l:"Patrimonio Total",v:fmt(portfolioValArs+totalSavingsArs),c:T.lime,i:<IcBalance/>}].map((k,i)=>(
          <div key={i} className="card csm"><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".5px"}}>{k.l}</span><span>{k.i}</span></div><div className="mono" title={k.v} style={{fontSize:16,fontWeight:600,color:k.c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.v}</div></div>
        ))}
      </div>
    }

    <div className="kpi-grid analytics-kpis" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
      {[{l:"Total ingresos",v:fmt(totInc),c:T.teal},{l:"Total gastos",v:fmt(totExp),c:totExp>0?T.red:T.muted},{l:"Tasa de ahorro",v:savR===null?"—":`${savR}%`,c:savR===null?T.muted:savN>=20?T.lime:savN>=10?T.amber:T.red,sub:savR===null?"Datos insuficientes":savN>=20?"Buen margen":savN>=10?"Margen acotado":savN<0?"Gastás más de lo que ingresás":"Margen bajo"}].map((k,i)=>(
        <div key={i} className="card csm"><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>{k.l}</div><div className="mono" title={k.v} style={{fontSize:22,fontWeight:500,color:k.c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.v}</div>{k.sub&&<div style={{fontSize:11,color:T.muted,marginTop:3}}>{k.sub}</div>}</div>
      ))}
    </div>

    <div className="card" style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Comparativa mensual ({displayCurrency})</div>
      {hasHistory?<div style={{width:"100%",minWidth:0,overflow:"hidden"}}>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={months} barGap={3}>
            <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="name" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
            <Tooltip content={<CTip dc={displayCurrency}/>}/>
            <Legend wrapperStyle={{fontSize:11,color:T.muted}}/>
            <Bar dataKey="Ingresos" fill={T.teal} radius={[4,4,0,0]} opacity={.9}/>
            <Bar dataKey="Gastos" fill={T.red} radius={[4,4,0,0]} opacity={.9}/>
            <Bar dataKey="Ahorro" fill={T.blue} radius={[4,4,0,0]} opacity={.9}/>
          </BarChart>
        </ResponsiveContainer>
      </div>:<EmptyPanel icon={<ic.Chart/>} title="Todavía no hay historial" detail="Importá movimientos o registrá tu sueldo para comparar ingresos, gastos y ahorro.">{setView&&<><button className="btn bg bsm" onClick={()=>setView("salary")}>Registrar sueldo</button><button className="btn bl bsm" onClick={()=>setView("import")}>Importar</button></>}</EmptyPanel>}
    </div>

    <div className="trend-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
      <div className="card">
        <div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Gastos por categoría</div>
        {cats.length===0?<EmptyPanel compact icon={<IcExpense/>} title="Sin categorías todavía" detail="Tus gastos agrupados aparecerán cuando cargues movimientos."/>:cats.slice(0,8).map((c,i)=>(
          <div key={i} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4,minWidth:0}}><span style={{fontSize:12,color:T.mid,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{c.c}</span><span className="mono" style={{fontSize:11,color:T.muted,flexShrink:0}}>{c.pct}%</span></div><div className="prog" style={{height:4}}><div style={{height:"100%",borderRadius:2,background:c.col,width:`${clamp(c.pct,0,100)}%`,transition:"width .6s"}}/></div></div>
        ))}
      </div>
      <div className="card">
        <div style={{fontSize:12,fontWeight:600,color:T.mid,marginBottom:12}}>Balance mensual</div>
        {hasHistory?<div style={{width:"100%",minWidth:0,overflow:"hidden"}}>
          <ResponsiveContainer width="100%" height={185}>
            <LineChart data={months}>
              <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/>
              <XAxis dataKey="name" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
              <Tooltip content={<CTip dc={displayCurrency}/>}/>
              <Line type="monotone" dataKey="balance" stroke={T.lime} strokeWidth={2.5} dot={{fill:T.lime,r:3}} activeDot={{r:5,fill:T.lime,stroke:T.bg}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>:<EmptyPanel compact icon={<IcBalance/>} title="Sin balance todavía" detail="El balance aparecerá cuando registres ingresos o gastos."/>}
      </div>
    </div>
  </div>);
}

function SourcesMeta({sources=[],asOf,label="Fuentes consultadas"}){
  if(!asOf&&!sources.length)return null;
  return(<details className="source-meta" style={{marginBottom:12}}><summary><span style={{display:"flex"}}><ic.Globe/></span><span>{label}{asOf?` · ${asOf}`:""}{sources.length?` · ${sources.length} fuente${sources.length===1?"":"s"}`:""}</span></summary>{sources.length>0&&<div className="source-links">{sources.map((source,i)=><a key={source.url||i} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title||source.url}>{source.title||`Fuente ${i+1}`}</a>)}</div>}</details>);
}

function AnalysisDetail({a,onClose,quote=null,displayCurrency="USD",usdRate=1}){
  if(!a)return null;
  const price=quote?.price||a.currentEstimate;const priceCurrency=quote?.currency||a.priceCurrency||"USD";const updatedAt=quoteTime(quote?.asOf||a.quoteAsOf);const hasTarget=Number(a.priceTarget12m)>0;
  const scenarios=[{title:"Bull case",Icon:ic.TrendUp,color:T.lime,body:a.bullCase,sub:"Catalizadores",items:a.catalysts},{title:"Bear case",Icon:ic.TrendDown,color:T.red,body:a.bearCase,sub:"Riesgos",items:a.risks}];
  return(<div className="card up" style={{border:`1px solid ${T.hi}`,marginTop:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:8}}><div><div style={{display:"flex",gap:10,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}><span className="mono" style={{fontSize:22,fontWeight:700}}>{a.ticker}</span><span className={`tag ${sigCls(a.signal)}`}>{a.signal}</span><span className={`tag ${a.timeframe==="SHORT"?"te":a.timeframe==="LONG"?"ti":"ts"}`}>{a.timeframe}</span></div><div style={{fontSize:13,color:T.mid}}>{a.company}{a.sector?` · ${a.sector}`:""}</div>{updatedAt&&<div style={{fontSize:9,color:T.muted,marginTop:4}}>Última cotización regular · {updatedAt}</div>}</div><button className="btn bg bsm" aria-label="Cerrar análisis" onClick={onClose}><ic.X/></button></div><div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:18}}>{[{l:"Precio actual",v:price>0?formatMarketQuote(price,priceCurrency,displayCurrency,usdRate):"—"},{l:"Target 12m",v:hasTarget?formatMarketQuote(a.priceTarget12m,priceCurrency,displayCurrency,usdRate):"—",c:hasTarget?T.lime:T.muted},{l:"Upside",v:Number.isFinite(a.upside)?`${a.upside>0?"+":""}${a.upside.toFixed(1)}%`:"—",c:Number.isFinite(a.upside)?(a.upside>0?T.lime:T.red):T.muted},{l:"P/E",v:Number.isFinite(a.peRatio)?a.peRatio.toFixed(1):"—"},{l:"Rev. Growth",v:Number.isFinite(a.revenueGrowth)?`${a.revenueGrowth.toFixed(1)}%`:"—",c:Number.isFinite(a.revenueGrowth)?(a.revenueGrowth>0?T.teal:T.red):T.muted}].map((s,i)=>(<div key={i} style={{background:T.raised,borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:10,color:T.muted,marginBottom:5}}>{s.l}</div><div className="mono" style={{fontSize:16,fontWeight:500,color:s.c||T.white}}>{s.v}</div></div>))}</div><div className="trend-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>{scenarios.map(({title,Icon,color,body,sub,items})=>(<div key={title} style={{background:T.raised,borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:11,color,fontWeight:600,marginBottom:7,display:"flex",alignItems:"center",gap:6}}><Icon/>{title}</div><div style={{fontSize:12,color:T.mid,lineHeight:1.6,marginBottom:8}}>{body}</div><div style={{fontSize:10,color:T.muted,marginBottom:5}}>{sub}</div>{items?.map((item,index)=><div key={index} style={{fontSize:11,color:T.mid,padding:"3px 0",borderBottom:`1px solid ${T.border}`,display:"flex",gap:7}}><span aria-hidden="true" style={{color}}>•</span><span>{item}</span></div>)}</div>))}</div>{a.moat&&<div style={{background:"rgba(77,158,255,.06)",border:`1px solid rgba(77,158,255,.15)`,borderRadius:10,padding:"12px 16px",marginBottom:8}}><div style={{fontSize:11,color:T.blue,fontWeight:600,marginBottom:4,display:"flex",alignItems:"center",gap:6}}><ic.Shield/>Ventaja competitiva</div><div style={{fontSize:12,color:T.mid}}>{a.moat}</div></div>}<SourcesMeta sources={a.sources} asOf={a.dataAsOf} label="Fuentes del análisis"/><div style={{fontSize:10,color:T.muted,textAlign:"center",marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><ic.Alert/>Análisis educativo. No constituye asesoramiento financiero.</div></div>);
}

function Import({state,update,notify}){
  const [tab,setTab]=useState("image");
  const [imgSrc,setImgSrc]=useState(null);
  const [imgMime,setImgMime]=useState("image/png");
  const [extracting,setExt]=useState(null);
  const [extractErr,setEE]=useState(null);
  const [paste,setPaste]=useState("");
  const [preview,setPreview]=useState([]);
  const [extractMeta,setExtractMeta]=useState({warnings:[],appDetected:null});
  const [missingMonth,setMissingMonth]=useState(getCUR());
  const [over,setOver]=useState(false);
  const [catE,setCE]=useState({});
  const [autoRunning,setAR]=useState(false);
  const [pdfProgress,setPDFProgress]=useState(null);
  // ── TRANSFER DETECTION STATE ──
  const [transferPairs,setTransferPairs]=useState([]);
  const [showTransferModal,setSTM]=useState(false);
  const [rejectedPairs,setRejectedPairs]=useState(new Set());
  const imgRef=useRef();
  const csvRef=useRef();
  const pdfRef=useRef();

  const loadPreview=(items,meta={})=>{
    setPreview(items.map(item=>({...normalizeTxRecord(item),isRecurring:Boolean(item.isRecurring)})));
    setExtractMeta({warnings:meta.warnings||[],appDetected:meta.appDetected||null});
    setMissingMonth(getCUR());
    setCE({});
  };

  const clearExtraction=()=>{
    setPreview([]);setExtractMeta({warnings:[],appDetected:null});setMissingMonth(getCUR());setCE({});
  };

  const missingDateCount=preview.filter(t=>!isValidISODate(t.date)).length;
  const applyMissingMonth=()=>{
    if(!/^\d{4}-\d{2}$/.test(missingMonth))return notify("Elegí mes y año","err");
    const date=`${missingMonth}-01`;
    if(!isValidISODate(date))return notify("Mes inválido","err");
    setPreview(rows=>rows.map(t=>isValidISODate(t.date)?t:{...t,date}));
    notify(`Período ${missingMonth} aplicado a ${missingDateCount} fila${missingDateCount===1?"":"s"} ✓`);
  };

  const handleImgFile=file=>{
    if(!file)return;
    const mime=["image/jpeg","image/png","image/gif","image/webp"].includes(file.type)?file.type:"image/png";
    const r=new FileReader();
    r.onload=e=>{setImgSrc(e.target.result);setImgMime(mime);setExt(null);setEE(null);clearExtraction();};
    r.readAsDataURL(file);
  };

  const extractImg=async()=>{
    if(!imgSrc)return;
    clearExtraction();setExt("loading");setEE(null);
    notify("Analizando imagen con IA...","info");
    const b64=imgSrc.split(",")[1];
    try{const result=await extractFromImage(b64,imgMime);
      if(!result.transactions?.length){const fallback=result.outcome==="unreadable_image"?"La captura no se pudo leer. Probá recortarla y subir una versión más nítida.":result.outcome==="not_financial_document"?"La imagen no parece ser un historial de movimientos.":"La pantalla no muestra movimientos ni resúmenes por categoría con importes legibles.";const reason=result.warnings?.[0]||fallback;setExt("error");setEE(reason);setExtractMeta({warnings:result.warnings||[],appDetected:result.appDetected||null});notify(reason,"err");return;}
      loadPreview(result.transactions.map((t,i)=>({...t,id:`img_${uid()}_${i}`,currency:result.currency||"ARS",source:"image"})),result);
      setExt("done");notify(`${result.transactions.length} transacciones extraídas ✓`);
    }catch(e){setExt("error");setEE(e.message||"No se pudo analizar la imagen.");notify(e.message||"Error al analizar la imagen","err");}
  };

  const handleCSV=file=>{
    const r=new FileReader();
    clearExtraction();
    r.onload=e=>{const p=parseCSV(e.target.result);if(!p.length)return notify("Sin datos válidos en el CSV","err");loadPreview(p);notify(`${p.length} movimientos detectados`);};
    r.readAsText(file,"utf-8");
  };

  const handlePDF=async file=>{
    if(!file)return;
    clearExtraction();setExt("loading");setEE(null);setPDFProgress("Cargando PDF...");
    notify("Procesando PDF con IA...","info");
    try{
      const result=await extractFromPDF(file,msg=>setPDFProgress(msg));
      if(!result.transactions.length){const reason=result.warnings?.[0]||"No se detectaron transacciones ni resúmenes por categoría en el PDF.";setExt("error");setEE(reason);setExtractMeta({warnings:result.warnings||[],appDetected:result.appDetected||null});notify("Sin transacciones detectadas","err");}
      else{loadPreview(result.transactions,result);setExt("done");notify(`${result.transactions.length} transacciones extraídas del PDF ✓`);}
    }catch(e){setExt("error");setEE("Error procesando el PDF: "+e.message);notify("Error al procesar el PDF","err");}
    setPDFProgress(null);
  };

  const doPaste=()=>{
    clearExtraction();
    const lines=paste.trim().split("\n").filter(l=>l.trim());
    const out=[];
    for(const l of lines){
      const dateToken=l.match(/\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/)?.[0]||null;
      const date=normalizeInputDate(dateToken);
      const amountText=date&&dateToken?l.replace(dateToken," "):l;
      const amts=[...amountText.matchAll(/[\d.,]+/g)].map(m=>px(m[0])).filter(a=>a>100);
      if(!amts.length)continue;
      const currency=/(?:\bUSD\b|US\$|U\$S|\bD[ÓO]LAR(?:ES)?\b)/i.test(l)?"USD":"ARS";
      out.push({id:`p_${uid()}`,date,description:amountText.replace(/\b(?:ARS|USD|US\$|U\$S|PESOS?|D[ÓO]LAR(?:ES)?)\b/gi,"").replace(/[\d.,$%\/\-]/g,"").trim().slice(0,60)||"TX",amount:amts[0],type:"expense",category:"❓ Otros",currency,source:"paste"});
    }
    if(!out.length)return notify("Sin montos detectados","err");
    loadPreview(out);notify(`${out.length} movimientos detectados`);
  };

  const autoCatAll=async()=>{
    setAR(true);notify("Auto-categorizando...","info");
    try{const items=preview.map(t=>({id:String(t.id),description:t.description,type:normalizeTxType(t.type),category:t.category||null}));const batches=[];for(let i=0;i<items.length;i+=40)batches.push(items.slice(i,i+40));const suggestions=(await Promise.all(batches.map(batch=>autoCat(batch)))).flat();const byId=new Map(suggestions.map(s=>[String(s.id),s]));setPreview(rows=>rows.map(t=>{const suggestion=byId.get(String(t.id));if(!suggestion)return t;return{...t,type:normalizeTxType(suggestion.type)||normalizeTxType(t.type)||"expense",category:matchCat(suggestion.category)};}));notify(`Categorización completa · ${suggestions.length} filas ✓`);}catch(e){notify(e.message||"No se pudo categorizar","err");}finally{setAR(false);}
  };

  // ── CONFIRM CON DETECCIÓN DE TRANSFERENCIAS ──
  const confirm=()=>{
    if(preview.some(t=>!isValidISODate(t.date)))return notify("Completá el mes y año antes de importar","err");
    const recurring=state.recurring||[];
    const newRecurring=[];
    const toAdd=preview.map(t=>{
      const category=catE[t.id]||t.category;
      const {isRecurring,...row}=t;
      const isUsd=t.currency==="USD";
      const imported={...row,id:`i_${uid()}`,type:normalizeTxType(t.type)||"expense",category,amount:isUsd?t.amount*state.usdRate:t.amount,currency:"ARS",...(isUsd?{originalAmount:t.amount,originalCurrency:"USD",fxRateAtEntry:state.usdRate,fxDate:todayISO()}:{})};
      if(isRecurring)newRecurring.push({id:`rec_${uid()}`,description:String(t.description||"").replace(/^🔁\s*/,""),amount:imported.amount,type:t.type,category,currency:"ARS",lastMonth:gMonth(t.date),paused:false,source:"import",originTransactionId:imported.id});
      return imported;
    });
    const pairs=detectTransfers(toAdd,state.transactions);
    update({transactions:[...state.transactions,...toAdd],recurring:[...recurring,...newRecurring]});
    clearExtraction();setPaste("");setImgSrc(null);setExt(null);setEE(null);
    notify(`${toAdd.length} movimientos importados${newRecurring.length?` · ${newRecurring.length} recurrente${newRecurring.length===1?"":"s"}`:""} ✓`);
    if(pairs.length>0){
      setTimeout(()=>{setTransferPairs(pairs);setRejectedPairs(new Set());setSTM(true);},1500);
    }
  };

  return(<div className="up"><PH title="Importar datos" sub="Imagen · PDF · CSV · Texto pegado"/>
    <div className="tabbar" style={{marginBottom:18}}>{[{id:"image",l:<><IcImage/> Imagen</>,target:"import-image-tab"},{id:"pdf",l:<><IcPdf/> PDF</>},{id:"csv",l:<><IcCsv/> CSV</>},{id:"paste",l:<><IcText/> Texto</>},{id:"guide",l:<><IcGuide/> Guía</>}].map(t=>(<button key={t.id} data-tour-target={t.target||undefined} className={`tab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>))}</div>

    {tab==="image"&&<div><div style={{background:"rgba(167,139,250,.06)",border:`1px solid rgba(167,139,250,.2)`,borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12,color:T.purple,display:"flex",alignItems:"center",gap:8,lineHeight:1.5}}><span style={{display:"flex",color:T.purple,flexShrink:0}}><ic.Bolt/></span><span>Subí un screenshot de Mercado Pago, tu banco, o resumen de tarjeta de crédito.</span></div><div data-tour-target="import-drop" className={`imgdrop${over?" ov2":""}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const f=e.dataTransfer.files[0];if(f)handleImgFile(f);}} onClick={()=>imgRef.current?.click()}>{imgSrc?<img src={imgSrc} alt="preview" style={{maxWidth:"100%",maxHeight:300,borderRadius:8,objectFit:"contain"}}/>:<><div style={{width:52,height:52,borderRadius:16,background:"rgba(184,155,255,.1)",border:"1px solid rgba(184,155,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#B89BFF",marginBottom:4}}><IcImage/></div><div style={{fontSize:15,fontWeight:600,color:T.mid}}>Arrastrá o hacé clic para subir</div><div style={{fontSize:12,color:T.muted,maxWidth:520,lineHeight:1.55}}>Screenshots de tu banco, billetera virtual o resumen de tarjeta</div></>}<input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleImgFile(e.target.files[0])}/></div>{imgSrc&&<div style={{display:"flex",gap:8,marginTop:10}}><button className="btn bl" style={{flex:1,justifyContent:"center"}} onClick={extractImg} disabled={extracting==="loading"}>{extracting==="loading"?<><Dots/> Extrayendo...</>:<><IcScanner/> Extraer con IA</>}</button><button className="btn bg" onClick={()=>{setImgSrc(null);setExt(null);setEE(null);clearExtraction();}}>Cambiar</button></div>}{extractErr&&<div style={{marginTop:10,background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.red}}>{extractErr}</div>}</div>}

    {tab==="pdf"&&<div>
      <div style={{background:"rgba(77,158,255,.06)",border:`1px solid rgba(77,158,255,.2)`,borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12,color:T.blue,display:"flex",alignItems:"center",gap:8}}><IcPdf/>Subí el extracto bancario o resumen de tarjeta en PDF.</div>
      <div className={`dz${over?" ov2":""}`} style={{borderColor:T.blue+"44"}} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const f=e.dataTransfer.files[0];if(f)handlePDF(f);}} onClick={()=>pdfRef.current?.click()}>
        {extracting==="loading"?<><div style={{width:48,height:48,borderRadius:14,background:"rgba(91,158,255,.1)",display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,marginBottom:8,animation:"pulse-glow 1.5s infinite"}}><IcPdf/></div><div style={{fontSize:14,color:T.blue}}>{pdfProgress||"Procesando..."}</div><Dots/></>:<><div style={{width:52,height:52,borderRadius:16,background:"rgba(91,158,255,.08)",border:"1px solid rgba(91,158,255,.18)",display:"flex",alignItems:"center",justifyContent:"center",color:T.blue,marginBottom:4}}><IcPdf/></div><div style={{fontSize:15,fontWeight:600,color:T.mid}}>Arrastrá o hacé clic para subir un PDF</div><div style={{fontSize:12,color:T.muted}}>Extractos bancarios · Resúmenes de TC · Salida de homebanking</div></>}
        <input ref={pdfRef} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>e.target.files[0]&&handlePDF(e.target.files[0])}/>
      </div>
      {extractErr&&<div style={{marginTop:10,background:"rgba(255,77,106,.08)",border:`1px solid rgba(255,77,106,.25)`,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.red}}>{extractErr}</div>}
    </div>}

    {tab==="csv"&&<div><div data-tour-target="import-csv-tab" className={`dz${over?" ov2":""}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const f=e.dataTransfer.files[0];if(f)handleCSV(f);}} onClick={()=>csvRef.current?.click()}><div style={{width:52,height:52,borderRadius:16,background:"rgba(255,154,53,.08)",border:"1px solid rgba(255,154,53,.18)",display:"flex",alignItems:"center",justifyContent:"center",color:T.mango,marginBottom:8}}><IcCsv/></div><div style={{fontSize:15,fontWeight:600,color:T.mid}}>Arrastrá un CSV</div><div style={{fontSize:12,color:T.muted}}>Compatible con Mercado Pago, bancos argentinos y exportaciones estándar</div><input ref={csvRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleCSV(e.target.files[0])}/></div></div>}

    {tab==="paste"&&<div><textarea className="inp" style={{minHeight:150}} placeholder="Pegá acá el texto de tu app..." value={paste} onChange={e=>setPaste(e.target.value)}/><button className="btn bl" style={{marginTop:10}} onClick={doPaste} disabled={!paste.trim()}>Analizar texto</button></div>}

    {tab==="guide"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>{[{app:"Imágenes",icon:"img",steps:["Screenshot del historial de tu banco, Mercado Pago o resumen TC","Subila en la pestaña Imagen","Revisá y editá las fechas si hace falta"]},{app:"PDF",icon:"pdf",steps:["Bajá el extracto desde tu homebanking","Subilo en la pestaña PDF","La IA procesa todas las páginas automáticamente"]},{app:"CSV",icon:"csv",steps:["Exportá desde Mercado Pago o tu banco","El parser detecta el formato automáticamente","Compatible con doble-header (ej: MP)"]}].map(({app,icon,steps})=><div key={app} className="card csm"><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>{icon==="img"?<IcImage/>:icon==="pdf"?<IcPdf/>:<IcCsv/>}<span style={{fontSize:13,fontWeight:600}}>{app}</span></div><ol style={{paddingLeft:16}}>{steps.map((s,i)=><li key={i} style={{fontSize:12,color:T.muted,marginBottom:4}}>{s}</li>)}</ol></div>)}</div>}

    {preview.length>0&&<div style={{marginTop:22}}>
      {(extractMeta.appDetected||extractMeta.warnings.length>0)&&<div style={{background:"rgba(91,158,255,.07)",border:`1px solid ${T.blue}33`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:11,color:T.mid}}>{extractMeta.appDetected&&<div style={{color:T.blue,fontWeight:700,marginBottom:extractMeta.warnings.length?5:0}}>Origen detectado: {extractMeta.appDetected}</div>}{extractMeta.warnings.map((warning,i)=><div key={i}>• {warning}</div>)}</div>}
      <div style={{background:"rgba(255,184,48,.08)",border:`1px solid rgba(255,184,48,.25)`,borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:12,color:T.amber,display:"flex",alignItems:"center",gap:8}}>
        <span style={{display:"flex",color:T.amber}}><IcCalendar/></span>
        <span><strong>Revisá las fechas antes de importar.</strong> Podés editarlas haciendo click en cada una.</span>
      </div>
      {missingDateCount>0&&<div className="period-prompt" style={{background:"rgba(255,154,53,.07)",border:`1px solid ${T.mango}44`,borderRadius:12,padding:"12px 14px",marginBottom:14}}><div><div style={{fontSize:12,fontWeight:800,color:T.mango}}>Falta el período de {missingDateCount} fila{missingDateCount===1?"":"s"}</div><div style={{fontSize:11,color:T.mid,marginTop:3}}>Elegí solamente mes y año. Se guardarán con fecha día 01 y después podés editarlas en Movimientos.</div></div><input className="inp" type="month" value={missingMonth} onChange={e=>setMissingMonth(e.target.value)}/><button className="btn bm" onClick={applyMissingMonth}>Aplicar período</button></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <h2 style={{fontSize:16,fontWeight:700}}>{preview.length} movimientos detectados</h2>
        <div className="preview-actions" style={{display:"flex",gap:8}}>
          <button className="btn bg" onClick={autoCatAll} disabled={autoRunning}>{autoRunning?<Dots/>:<><ic.Bolt/> Auto-categorizar</>}</button>
          <button className="btn bl" onClick={confirm} disabled={missingDateCount>0}><ic.Check/> Importar todo</button>
        </div>
      </div>
      <div className="preview-mobile">{preview.map(t=>(<div key={t.id} className="card csm"><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:12}}><div style={{fontSize:13,fontWeight:700,minWidth:0,overflowWrap:"anywhere"}}>{t.description}</div><div className="mono" style={{fontSize:13,fontWeight:700,color:t.type==="income"?T.teal:T.red,flexShrink:0}}>{t.type==="income"?"+":"-"}{t.currency==="USD"?fUSD(t.amount):fARS(t.amount)}</div></div><div style={{display:"grid",gap:10}}><div><label style={{fontSize:10,color:T.muted,display:"block",marginBottom:5}}>Fecha</label><input type="date" className="inp" value={t.date||""} onChange={e=>setPreview(prev=>prev.map(p=>p.id===t.id?{...p,date:e.target.value}:p))}/></div><div><label style={{fontSize:10,color:T.muted,display:"block",marginBottom:5}}>Categoría</label><CategorySelect value={catE[t.id]||t.category} ariaLabel={`Categoría de ${t.description}`} onChange={category=>setCE(c=>({...c,[t.id]:category}))}/></div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,paddingTop:2}}><label style={{display:"flex",alignItems:"center",gap:9,fontSize:11,color:T.mid,cursor:"pointer",minHeight:40}}><input type="checkbox" checked={Boolean(t.isRecurring)} onChange={e=>setPreview(prev=>prev.map(p=>p.id===t.id?{...p,isRecurring:e.target.checked}:p))} aria-label={`Marcar ${t.description} como recurrente`} style={{width:18,height:18,accentColor:"var(--ac)"}}/><span>Repetir cada mes</span></label><button className="btn bd bsm" aria-label={`Quitar ${t.description} de la importación`} title="No importar esta fila" style={{width:40,height:40,padding:0}} onClick={()=>setPreview(rows=>rows.filter(row=>row.id!==t.id))}><ic.Trash/></button></div></div></div>))}</div>
      <div className="card preview-desktop" style={{padding:0,overflow:"auto",maxHeight:450}}>
        <table className="tbl" style={{minWidth:760}}>
          <thead><tr><th>Fecha (Editable)</th><th>Descripción</th><th>Monto</th><th>Categoría</th><th>Recurrente</th><th aria-label="Acciones"/></tr></thead>
          <tbody>
            {preview.map(t=>(
              <tr key={t.id}>
                <td><input type="date" className="inp" style={{fontSize:11,padding:"5px 8px",width:"auto",minWidth:130,border:`1px solid ${T.border}`,background:T.raised,color:T.white,borderRadius:6}} value={t.date||""} onChange={e=>setPreview(prev=>prev.map(p=>p.id===t.id?{...p,date:e.target.value}:p))}/></td>
                <td style={{fontSize:12}}>{t.description}</td>
                <td className="mono" style={{color:t.type==="income"?T.teal:T.red}}>{t.type==="income"?"+":"-"}{t.currency==="USD"?fUSD(t.amount):fARS(t.amount)}</td>
                <td><CategorySelect compact value={catE[t.id]||t.category} ariaLabel={`Categoría de ${t.description}`} onChange={category=>setCE(c=>({...c,[t.id]:category}))}/></td>
                <td style={{textAlign:"center"}}><label title="Crear una regla para repetir este movimiento cada mes" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><input type="checkbox" checked={Boolean(t.isRecurring)} onChange={e=>setPreview(prev=>prev.map(p=>p.id===t.id?{...p,isRecurring:e.target.checked}:p))} aria-label={`Marcar ${t.description} como recurrente`}/></label></td>
                <td><button className="btn bd bsm" aria-label={`Quitar ${t.description} de la importación`} title="No importar esta fila" onClick={()=>setPreview(rows=>rows.filter(row=>row.id!==t.id))}><ic.Trash/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>}

    {/* ── MODAL DE TRANSFERENCIAS INTERNAS ── */}
    {showTransferModal&&(
      <div className="ov" onClick={e=>e.target===e.currentTarget&&setSTM(false)}>
        <div className="modal">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h2 style={{fontSize:17,fontWeight:700,display:"flex",alignItems:"center",gap:7}}><ic.Swap/>Transferencias internas detectadas</h2>
            <button className="btn bg bsm" onClick={()=>setSTM(false)}><ic.X/></button>
          </div>
          <div style={{fontSize:12,color:T.mid,marginBottom:16}}>Estos movimientos parecen ser transferencias entre tus propias cuentas. Si los confirmás, quedan excluidos de tus ingresos y gastos.</div>

          {transferPairs.filter(p=>!rejectedPairs.has(p.a.id+p.b.id)).map((pair,i)=>{
            const inc=pair.a.type==="income"?pair.a:pair.b;
            const exp=pair.a.type==="expense"?pair.a:pair.b;
            return(
              <div key={i} style={{background:T.raised,borderRadius:12,padding:"14px 16px",marginBottom:10,border:`1px solid ${T.border}`}}>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <span style={{fontSize:12,color:T.teal,minWidth:0,overflowWrap:"anywhere"}}>↑ {inc.description}</span>
                    <span className="mono" style={{fontSize:12,color:T.teal,flexShrink:0}}>+{fARS(inc.amount)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <span style={{fontSize:12,color:T.coral,minWidth:0,overflowWrap:"anywhere"}}>↓ {exp.description}</span>
                    <span className="mono" style={{fontSize:12,color:T.coral,flexShrink:0}}>-{fARS(exp.amount)}</span>
                  </div>
                  <div style={{fontSize:10,color:T.muted}}>{inc.date} · {exp.date}</div>
                </div>
                <div className="transfer-actions" style={{display:"flex",gap:8}}>
                  <button className="btn bl bsm" style={{flex:1,justifyContent:"center"}} onClick={()=>{
                    update({
                      transactions:state.transactions.map(t=>t.id===pair.a.id||t.id===pair.b.id?{...t,type:"transfer",category:"🔄 Transferencia interna"}:t),
                      recurring:(state.recurring||[]).filter(r=>r.originTransactionId!==pair.a.id&&r.originTransactionId!==pair.b.id),
                    });
                    setRejectedPairs(r=>new Set([...r,pair.a.id+pair.b.id]));
                    notify("Transferencia interna marcada ✓");
                  }}><ic.Check/>Sí, es una transferencia</button>
                  <button className="btn bg bsm" style={{flex:1,justifyContent:"center"}} onClick={()=>setRejectedPairs(r=>new Set([...r,pair.a.id+pair.b.id]))}><ic.X/>No, son distintos</button>
                </div>
              </div>
            );
          })}

          {transferPairs.filter(p=>!rejectedPairs.has(p.a.id+p.b.id)).length===0&&(
            <div style={{textAlign:"center",padding:"16px 0",color:T.muted,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><ic.Check/>Todo revisado</div>
          )}
          <button className="btn bg" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={()=>{setSTM(false);setRejectedPairs(new Set());}}>Cerrar</button>
        </div>
      </div>
    )}
  </div>);
}
