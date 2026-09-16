import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Overview from '../features/Overview.jsx';
import WeeklyInsight from '../features/WeeklyInsight.jsx';
import Settings,{downloadText} from '../features/Settings.jsx';
import Dialog from '../components/Dialog.jsx';
import TourGuide from '../tour/TourGuide.jsx';
import {useMangosState} from './useMangosState.js';
import {createDemoState} from '../demo/data.js';
import {createBackup} from '../storage/state.js';
import {parseMoney} from '../domain/finance.js';
import {refreshExchangeRates} from '../services/exchangeRates.js';

const isDemo=import.meta.env.VITE_APP_MODE==='demo'||new URLSearchParams(window.location.search).get('demo')==='1';
const routeLabels={dashboard:'Resumen',transactions:'Movimientos',goals:'Metas',investments:'Inversiones',salary:'Ingresos',analytics:'Analíticas',import:'Importar',settings:'Ajustes y datos'};

export default function AppRoot({defaults,components,icons,getHealth,legacyStyles,supabaseConfig,generateInsight}){
  const initial=useMemo(()=>({...defaults,...(isDemo?createDemoState():{})}),[defaults]);
  const store=useMangosState(initial,isDemo);
  const {state,revision,loadError,saveError,retry,reload,restore}=store;
  const [view,setView]=useState('dashboard'),[request,setRequest]=useState({nonce:0});
  const [sideOpen,setSideOpen]=useState(false),[toast,setToast]=useState(null),[rateOpen,setRateOpen]=useState(false),[tour,setTour]=useState(null);
  const mainRef=useRef(null),toastTimer=useRef(null),lastWrite=useRef(true),menuButton=useRef(null),latestState=useRef(state),skipRateRefresh=useRef(null);
  latestState.current=state;
  const [rateStatus,setRateStatus]=useState(isDemo?'ready':'loading');
  const update=useCallback(patch=>{const ok=store.update(patch);lastWrite.current=ok;return ok;},[store.update]);
  useEffect(()=>{
    if(isDemo||loadError)return;
    const savedManually=skipRateRefresh.current===state.usdType;
    skipRateRefresh.current=null;
    if(savedManually){setRateStatus('ready');return;}
    const controller=new AbortController();
    setRateStatus('loading');
    refreshExchangeRates({getState:()=>latestState.current,apply:update,signal:controller.signal})
      .then(()=>{if(!controller.signal.aborted)setRateStatus('ready');})
      .catch(()=>{if(!controller.signal.aborted)setRateStatus('error');});
    return()=>controller.abort();
  },[state.usdType,loadError,update]);
  const notify=useCallback((message,type='ok')=>{
    clearTimeout(toastTimer.current);
    setToast({message:!lastWrite.current?'Los cambios todavía no se guardaron. Revisá el aviso de recuperación.':message,type});
    toastTimer.current=setTimeout(()=>setToast(null),5000);
  },[]);
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  const navigate=useCallback((route,params={})=>{
    setView(routeLabels[route]?route:'dashboard');setRequest(old=>({...params,nonce:old.nonce+1}));setSideOpen(false);
    mainRef.current?.scrollTo({top:0});
  },[]);
  const action=useCallback(id=>{
    const [area,command]=id.split(':');
    if(area==='currency'){update({displayCurrency:command});return;}
    navigate(area==='overview'?'dashboard':area,{action:command});
  },[navigate,update]);
  useEffect(()=>{
    document.documentElement.dataset.currency=state.displayCurrency==='USD'?'USD':'ARS';
    document.body.classList.remove('usd-mode');
  },[state.displayCurrency]);
  useEffect(()=>{
    if(!sideOpen)return;
    const close=e=>{if(e.key==='Escape'){setSideOpen(false);menuButton.current?.focus();}};
    window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
  },[sideOpen]);
  const backup=()=>{try{downloadText(createBackup(state,{revision}),'mangos-cambios-pendientes.json');}catch(error){notify(error.message,'error');}};
  const settings=<Settings state={{...state,demo:isDemo}} revision={revision} onEditRate={()=>setRateOpen(true)} onRestore={text=>{const saved=restore(text);lastWrite.current=true;return saved;}} onResetDemo={()=>update({...defaults,...createDemoState()})} notify={notify}/>;
  if(loadError)return <><style>{legacyStyles}</style><div className="m-recovery"><div><h1>No pudimos abrir tus datos</h1><p>{loadError.message}</p><p>El contenido guardado se conserva. Podés descargarlo para recuperarlo o restaurar un respaldo válido.</p><div className="m-settings-actions">{typeof loadError.raw==='string'&&<button className="m-primary" onClick={()=>downloadText(loadError.raw,'mangos-contenido-por-recuperar.txt','text/plain')}>Descargar contenido original</button>}<button className="m-secondary" onClick={()=>{lastWrite.current=reload();}}>Reintentar lectura</button></div>{settings}</div></div></>;
  const shared={state,update,notify,setView:navigate,request};
  const {Transactions,Goals,SalaryModule,Analytics,Investments,Import,Onboarding,FinancialHealthCard}=components;
  const pages={dashboard:<Overview weeklyInsight={<WeeklyInsight state={state} update={update} notify={notify} generateInsight={generateInsight}/>} state={state} request={request} onNavigate={navigate} onAction={action} healthCard={<FinancialHealthCard health={getHealth(state)} setView={navigate}/>}/>,transactions:<Transactions {...shared}/>,goals:<Goals {...shared}/>,salary:<SalaryModule {...shared}/>,analytics:<Analytics {...shared}/>,investments:<Investments {...shared}/>,import:<Import {...shared}/>,settings};
  const navIcons={dashboard:icons.Grid,transactions:icons.Tx,goals:icons.Target,investments:icons.Stock,salary:icons.Salary,analytics:icons.Chart,import:icons.Import,settings:icons.Settings};
  const navItem=route=>{const Icon=navIcons[route];return <button key={route} data-tour-target={route} aria-current={view===route?'page':undefined} onClick={()=>navigate(route)}>{Icon?<Icon/>:<span aria-hidden="true">⚙</span>}{routeLabels[route]}</button>;};
  return <div className="mangos-app"><style>{legacyStyles}</style>
    {sideOpen&&<div className="m-menu-backdrop" onClick={()=>setSideOpen(false)}/>}
    <aside className={`m-sidebar${sideOpen?' is-open':''}`} aria-label="Navegación"><div className="m-brand"><span className="m-mango" aria-hidden="true"/>Mangos</div><button className="m-icon-button m-close-menu" aria-label="Cerrar menú" onClick={()=>{setSideOpen(false);menuButton.current?.focus();}}>×</button><nav className="m-navigation" aria-label="Principal">{['dashboard','transactions','goals','investments'].map(navItem)}</nav><nav className="m-tools" aria-label="Herramientas"><p className="m-eyebrow">Herramientas</p>{['salary','analytics','import','settings'].map(navItem)}</nav><div className="m-sidebar-bottom"><button onClick={()=>setTour('local')}>Recorrido guiado ↗</button><button onClick={()=>setTour('live')}>Seguir charla en vivo ↗</button><p>Finanzas personales, con perspectiva.</p><p>{isDemo?'Datos de demostración':'Tus datos quedan en este navegador.'}</p></div></aside>
    <main className="m-workspace" ref={mainRef}><header className="m-topbar"><div className="m-topbar-left"><button ref={menuButton} className="m-icon-button m-mobile-menu" aria-label="Abrir menú" aria-expanded={sideOpen} onClick={()=>setSideOpen(true)}>☰</button><span className="m-topbar-label">{isDemo?'DEMOSTRACIÓN · DATOS FICTICIOS':'MI ESPACIO PERSONAL'}</span></div><div className="m-topbar-tools"><button className="m-rate" onClick={()=>setRateOpen(true)}>USD {state.usdType?.toUpperCase()||'REF.'} · AR$ {new Intl.NumberFormat('es-AR').format(state.usdRate)}<br/>{isDemo?'Referencia ficticia':rateStatus==='loading'?'Actualizando cotización…':rateStatus==='error'?'Sin actualizar · referencia guardada':state.fxAsOf?`Actualizado ${new Date(state.fxAsOf).toLocaleDateString('es-AR')}`:'Referencia sin actualizar'} ↗</button><div className="m-currency" aria-label="Moneda de visualización">{['ARS','USD'].map(c=><button key={c} data-tour-target={c==='USD'?'toggle-usd':undefined} aria-pressed={state.displayCurrency===c} onClick={()=>update({displayCurrency:c})}>{c}</button>)}</div></div></header>
    {saveError&&<div className="m-status m-status-error" role="alert"><div><strong>Cambios sin guardar</strong><p>{saveError.message}</p></div><div className="m-status-actions"><button className="m-text-button" onClick={backup}>Descargar estos cambios</button>{saveError.code!=='CONFLICT'&&<button className="m-text-button" onClick={()=>{lastWrite.current=retry();}}>Reintentar guardado</button>}<button className="m-text-button" onClick={()=>{if(window.confirm('¿Descartar los cambios sin guardar y cargar la versión del navegador? Descargá primero una copia si querés conservarlos.'))lastWrite.current=reload();}}>Recargar versión guardada</button></div></div>}
    {!state.onboardingDone?<><Onboarding update={update} notify={notify} usdRate={state.usdRate}/><button className="m-secondary" onClick={()=>update({onboardingDone:true})}>Configurar más adelante</button></>:pages[view]}
    <footer className="m-footer"><span>Mangos · Herramienta de organización personal</span><span className="m-save-label" role="status">{saveError?'Guardado pendiente':revision?`Guardado en este navegador · revisión ${revision}`:'Todavía no guardaste cambios'}</span></footer></main>
    {toast&&<div className="toast" role="status">{toast.message}</div>}
    {rateOpen&&<RateDialog state={state} update={update} notify={notify} onRefreshed={(source,kind)=>{if(source==='manual'&&kind!==state.usdType)skipRateRefresh.current=kind;setRateStatus('ready');}} onClose={()=>setRateOpen(false)}/>}
    <TourGuide key={tour||'closed'} enabled={Boolean(tour)} onClose={()=>setTour(null)} navigate={navigate} onAction={action} supabaseConfig={supabaseConfig} transport={tour==='live'?undefined:null}/>
  </div>;
}

function RateDialog({state,update,notify,onRefreshed,onClose}){
  const currentState=useRef(state);currentState.current=state;
  const [rate,setRate]=useState(String(state.usdRate)),[kind,setKind]=useState(state.usdType||'mep'),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const refresh=async()=>{
    setLoading(true);setError('');
    try{
      const result=await refreshExchangeRates({getState:()=>currentState.current,apply:update,kind});
      if(result){setRate(String(result.usdRate));onRefreshed();notify('Cotización actualizada');}
    }catch(e){setError(e.message);}finally{setLoading(false);}
  };
  return <Dialog title="Cotización de referencia" onClose={onClose}><p className="m-muted">Se usa para visualizar y registrar nuevas operaciones. Los movimientos anteriores conservan su conversión original.</p><label className="m-field">Tipo de dólar<select value={kind} onChange={e=>{setKind(e.target.value);setRate(String(state.usdRates?.[e.target.value]||state.usdRate));}}><option value="mep">MEP</option><option value="oficial">Oficial</option><option value="blue">Blue</option></select></label><label className="m-field">Pesos por 1 USD<input inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)}/></label><p className="m-muted">{state.demo?'Valor ficticio del ejemplo':state.fxSource||'Referencia guardada; sin fuente verificada'}</p>{error&&<p className="m-negative" role="alert">{error}</p>}<div className="m-dialog-actions">{!state.demo&&<button className="m-secondary" disabled={loading} onClick={refresh}>{loading?'Consultando…':'Consultar cotizaciones'}</button>}<button className="m-primary" onClick={()=>{const value=parseMoney(rate);if(!(value>0)){setError('Ingresá una cotización mayor que cero.');return;}if(update({usdRate:value,usdType:kind,usdRates:{...state.usdRates,[kind]:value},fxSource:state.demo?'Ejemplo ficticio':'Referencia manual',fxAsOf:new Date().toISOString()})){onRefreshed('manual',kind);onClose();}}}>Guardar referencia</button></div></Dialog>;
}
