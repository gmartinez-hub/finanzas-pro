export const DEMO_DATE='2026-09-16';
export function createDemoState(){
  const months=[['2026-04',980000,760000],['2026-05',1030000,820000],['2026-06',1080000,790000],['2026-07',1200000,860000],['2026-08',1160000,840000]];
  const transactions=months.flatMap(([m,income,expense])=>[{id:`demo-income-${m}`,date:`${m}-05`,description:'Sueldo de ejemplo',amount:income,type:'income',source:'manual',currency:'ARS',category:'Otros'},{id:`demo-expense-${m}`,date:`${m}-12`,description:'Gastos del período de ejemplo',amount:expense*.7,type:'expense',source:'manual',currency:'ARS',category:'🛒 Supermercado'},{id:`demo-expense-late-${m}`,date:`${m}-23`,description:'Servicios del período de ejemplo',amount:expense*.3,type:'expense',source:'manual',currency:'ARS',category:'📱 Servicios digitales'}]);
  transactions.push(...[
    {id:'demo-income-sep',date:'2026-09-05',description:'Sueldo de ejemplo',amount:1280000,type:'income',category:'Otros'},
    {id:'demo-rent',date:'2026-09-05',description:'Alquiler',amount:450000,type:'expense',category:'🏠 Vivienda'},
    {id:'demo-groceries',date:'2026-09-10',description:'Compras del mes',amount:200000,type:'expense',category:'🛒 Supermercado'},
    {id:'demo-transport',date:'2026-09-11',description:'Transporte',amount:68700,type:'expense',category:'🚗 Transporte'},
    {id:'demo-internet',date:'2026-09-14',description:'Internet',amount:28500,type:'expense',category:'📱 Servicios digitales'},
    {id:'demo-week',date:'2026-09-16',description:'Compra semanal',amount:32800,type:'expense',category:'🛒 Supermercado'},
    {id:'demo-reserve',date:'2026-09-12',description:'Reserva: Fondo de tranquilidad',amount:300000,type:'transfer',kind:'goal_reserve',goalId:'demo-goal',category:'💰 Ahorro'},
  ].map(t=>({...t,currency:'ARS',source:'demo'})));
  return {importBatches:[],demo:true,onboardingDone:true,transactions,goals:[{id:'demo-goal',name:'Fondo de tranquilidad',target:900000,saved:300000,payments:[],icon:'🎯',createdAt:'2026-09-01',deadline:'2027-03-01'}],recurring:[{id:'demo-rec',description:'Suscripción de ejemplo',amount:12000,type:'expense',category:'🧛 Suscripciones',currency:'ARS',lastMonth:'2026-08',paused:false}],salaries:[],holdings:[],marketPrices:{},budgets:{'🛒 Supermercado':300000},displayCurrency:'ARS',usdRate:1600,usdRates:{oficial:1600,mep:1600,blue:1600},usdType:'mep',riskProfile:null,savedAnalyses:[],weeklyInsight:null,lastSalaryBase:0};
}
