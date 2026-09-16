import {useEffect,useRef} from 'react';
import {CloseIcon} from './InterfaceIcons.jsx';

export default function Dialog({title,onClose,children,wide=false}){
  const ref=useRef(null);
  useEffect(()=>{
    const node=ref.current;
    const previous=document.activeElement;
    node.showModal();
    return()=>{node.close();previous?.focus?.();};
  },[]);
  return <dialog ref={ref} className={`m-dialog${wide?' m-dialog-wide':''}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}>
    <div className="m-dialog-heading"><h2>{title}</h2><button type="button" className="m-icon-button" aria-label="Cerrar" onClick={onClose}><CloseIcon/></button></div>
    {children}
  </dialog>;
}
