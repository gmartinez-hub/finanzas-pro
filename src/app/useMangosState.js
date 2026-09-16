import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {loadState,saveState,restoreState,parseBackup} from '../storage/state.js';

/** Namespace policy used by the hook on every load, save and restoration. */
export function createMangosPersistence(initialState,isDemo,{storage}={}){
  const key=isDemo?'mangos_demo_v1':'fp_v3b';
  const prepare=state=>({...initialState,...state,demo:Boolean(isDemo)});
  return {
    key,
    initialState:prepare(initialState),
    load(){
      const loaded=loadState({storage,key,initialState});
      return {...loaded,state:prepare(loaded.state)};
    },
    save(state,revision){
      return saveState(prepare(state),{storage,key,expectedRevision:revision});
    },
    restore(text,{revision,loadError}={}){
      const backup=parseBackup(text);
      // Coerce the namespace before writing; a demo must also stay a demo after reload.
      const prepared=JSON.stringify({...backup,state:prepare(backup.state)});
      const recovering=loadError?.code==='CORRUPT';
      // A failed reload can retain an older in-memory revision. Recovery instead
      // verifies the exact damaged bytes; there is no valid current revision.
      return restoreState(prepared,{storage,key,expectedRevision:recovering?0:revision,...(recovering?{recoveryRaw:loadError.raw}:{})});
    },
  };
}

export function useMangosState(initialState,isDemo){
  const persistence=useMemo(()=>createMangosPersistence(initialState,isDemo),[initialState,isDemo]);
  const key=persistence.key;
  const [bootstrap]=useState(()=>{
    try{return {...persistence.load(),error:null};}
    catch(error){return {state:persistence.initialState,revision:0,error};}
  });
  const [state,setState]=useState(bootstrap.state);
  const [loadError,setLoadError]=useState(bootstrap.error);
  const [saveError,setSaveError]=useState(null);
  const [revision,setRevision]=useState(bootstrap.revision);
  const stateRef=useRef(state),revisionRef=useRef(revision),errorRef=useRef(null);
  const sync=useCallback((next,rev)=>{stateRef.current=next;setState(next);revisionRef.current=rev;setRevision(rev);},[]);
  const fail=useCallback(error=>{errorRef.current=error;setSaveError(error);},[]);
  const clearError=useCallback(()=>{errorRef.current=null;setSaveError(null);},[]);
  const update=useCallback(patch=>{
    if(loadError||errorRef.current?.code==='CONFLICT')return false;
    const next={...stateRef.current,...(typeof patch==='function'?patch(stateRef.current):patch)};
    next.demo=Boolean(isDemo);
    stateRef.current=next;setState(next);
    try{const saved=persistence.save(next,revisionRef.current);sync(saved.state,saved.revision);clearError();return true;}
    catch(error){fail(error);return false;}
  },[persistence,isDemo,loadError,sync,clearError,fail]);
  const retry=useCallback(()=>{
    if(loadError||errorRef.current?.code==='CONFLICT')return false;
    try{const saved=persistence.save(stateRef.current,revisionRef.current);sync(saved.state,saved.revision);clearError();return true;}
    catch(error){fail(error);return false;}
  },[persistence,loadError,sync,clearError,fail]);
  const reload=useCallback(()=>{
    try{const loaded=persistence.load();sync(loaded.state,loaded.revision);setLoadError(null);clearError();return true;}
    catch(error){setLoadError(error);return false;}
  },[persistence,sync,clearError]);
  const restore=useCallback(text=>{
    try{
      const saved=persistence.restore(text,{revision:revisionRef.current,loadError});
      sync(saved.state,saved.revision);setLoadError(null);clearError();return saved;
    }catch(error){fail(error);throw error;}
  },[persistence,loadError,sync,clearError,fail]);
  useEffect(()=>{
    const onStorage=event=>{
      if(event.key!==key&&event.key!==null)return;
      // Even an equal revision can be a competing write; never merge automatically.
      const error=new Error('Otra pestaña cambió los datos. Descargá tus cambios pendientes o recargá la versión guardada antes de continuar.');error.code='CONFLICT';fail(error);
    };
    window.addEventListener('storage',onStorage);return()=>window.removeEventListener('storage',onStorage);
  },[key,fail]);
  useEffect(()=>{
    if(!saveError)return;
    const handler=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);
  },[saveError]);
  return {state,update,revision,loadError,saveError,retry,reload,restore};
}
