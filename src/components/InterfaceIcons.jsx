// Match the app's hand-drawn 20-unit icon grid. Labels live on the controls.
function Icon({children,size=16}){
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{display:'inline-block',verticalAlign:'-.18em',flexShrink:0}}>{children}</svg>;
}

export function SettingsDataIcon(){
  return <Icon><path d="M9 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h5M6 7h3M6 10h3M6 13h2M14 3v4m0 4v6"/><rect x="11" y="7" width="6" height="4" rx="1"/></Icon>;
}

export function MenuIcon(){
  return <Icon size={20}><path d="M3 5h14M3 10h10M3 15h7"/></Icon>;
}

export function CloseIcon(){
  return <Icon size={18}><path d="m5 5 10 10M15 5 5 15"/></Icon>;
}

export function OpenIcon(){
  return <Icon size={14}><path d="M5 15 15 5M7 5h8v8"/></Icon>;
}

export function AddIcon(){
  return <Icon size={14}><path d="M10 4v12M4 10h12"/></Icon>;
}

export function CategoryBreakdownIcon(){
  return <Icon><path d="M7 5h10M7 10h7M7 15h4"/><circle cx="3" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="15" r="1" fill="currentColor" stroke="none"/></Icon>;
}
