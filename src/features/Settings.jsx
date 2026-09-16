import {useRef,useState} from 'react';
import {createBackup,parseBackup} from '../storage/state.js';
import Dialog from '../components/Dialog.jsx';
import {exportMovementCSV} from '../domain/imports.js';

export function downloadText(text,name,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function Settings({state,revision,onRestore,onResetDemo,notify,onEditRate}){
  const fileRef=useRef(null),[pending,setPending]=useState(null),[error,setError]=useState('');
  const backup=()=>{try{downloadText(createBackup(state,{revision}),`mangos-respaldo-${new Date().toISOString().slice(0,10)}.json`);}catch(e){setError(e.message);}};
  const selectFile=async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{if(file.size>15000000)throw new Error('El respaldo supera los 15 MB admitidos.');const text=await file.text(),parsed=parseBackup(text);setPending({text,parsed,name:file.name});setError('');}catch(e){setError(e.message);}
  };
  return <div className="m-settings"><div className="m-page-heading"><div><p className="m-eyebrow">Tu espacio</p><h1>Ajustes y datos</h1><p className="m-muted">Guardado en este navegador.</p></div></div>{error&&<p role="alert" className="m-negative">{error}</p>}
    <section><h2>Respaldo y recuperación</h2><p>El respaldo incluye movimientos, metas, inversiones y ajustes. Guardá una copia fuera de este navegador antes de cambiar de equipo o dominio.</p><div className="m-settings-actions"><button className="m-primary" onClick={backup}>Descargar respaldo completo</button><button className="m-secondary" onClick={()=>fileRef.current?.click()}>Restaurar respaldo</button><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={selectFile}/></div></section>
    <section><h2>Planilla de movimientos</h2><p>Exportá las filas activas para analizarlas en una planilla. El CSV no reemplaza el respaldo completo: no reconstruye metas, pagos vinculados ni reservas.</p><button className="m-secondary" onClick={()=>{try{downloadText(exportMovementCSV(state.transactions.filter(t=>!t.voided&&!t.reversed&&t.status!=='reversed')),'mangos-movimientos.csv','text/csv;charset=utf-8');}catch(e){setError(e.message);}}}>Exportar movimientos CSV</button></section>
    <section><h2>{state.demo?'Demostración':'Preparar una demostración'}</h2><p>{state.demo?'Estás usando datos ficticios en un espacio separado. Reiniciar recupera el escenario inicial.':'Abrí el ejemplo para ensayar la charla. Usa otra clave de almacenamiento y nunca carga tus movimientos personales.'}</p><div className="m-settings-actions">{state.demo?<button className="m-secondary" onClick={()=>{if(window.confirm('¿Reiniciar los datos ficticios de esta demostración?'))onResetDemo();}}>Reiniciar ejemplo</button>:<a className="m-secondary" href="?demo=1" target="_blank" rel="noreferrer">Abrir demostración</a>}</div></section>
    <section><h2>Cotización de referencia</h2><p>1 USD = AR$ {new Intl.NumberFormat('es-AR').format(state.usdRate)} · {state.usdType?.toUpperCase()}</p><button className="m-secondary" onClick={onEditRate}>Revisar cotización</button></section>
    <section><h2>Sobre los importes</h2><p>“Disponible del mes” describe los ingresos registrados menos gastos y reservas netas del período. No representa todos tus saldos bancarios. Cambiar ARS/USD modifica la visualización; las operaciones conservan su importe y conversión originales.</p><p>Versión 2.1 · Mangos es una herramienta educativa y de gestión personal.</p></section>
    {pending&&<Dialog title="Revisar restauración" onClose={()=>setPending(null)}><p className="m-muted">{pending.name}</p>{error&&<p className="m-negative" role="alert">{error}</p>}<p>El respaldo contiene {(pending.parsed.state?.transactions||[]).length} movimientos, {(pending.parsed.state?.goals||[]).length} metas y {(pending.parsed.state?.holdings||[]).length} inversiones.</p><p className="m-muted">Reemplazará el estado de este espacio. Antes se conservará una copia del estado guardado anterior. También podés descargar tu respaldo actual.</p><div className="m-dialog-actions"><button className="m-secondary" onClick={backup}>Respaldar estado actual</button><button className="m-primary" onClick={()=>{try{onRestore(pending.text);setPending(null);notify('Respaldo restaurado');}catch(e){setError(e.message);}}}>Confirmar restauración</button></div></Dialog>}
  </div>;
}
