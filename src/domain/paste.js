import {parseMoney} from './finance.js';

const invalid=()=>Object.assign(new Error('No se encontró un importe válido distinto de cero. Revisá la línea antes de importar.'),{code:'INVALID_PASTED_AMOUNT'});
const ambiguous=()=>Object.assign(new Error('La línea contiene más de un importe posible. Dejá un único monto o indicá su moneda antes de importar.'),{code:'AMBIGUOUS_PASTED_AMOUNT'});
const marker=String.raw`(?:US\$|U\$S|AR\$|USD|ARS|\$)`;
const numeric=String.raw`\d[\d.,]*`;
const prefix=new RegExp(String.raw`(?<![\p{L}\p{N}.,$])(?:[+-]\s*)?${marker}\s*(?:[+-]\s*)?${numeric}(?![\p{L}\p{N}.,])`,'giu');
const suffix=new RegExp(String.raw`(?<![\p{L}\p{N}.,])(?:[+-]\s*)?${numeric}\s*${marker}(?![\p{L}\p{N}$])`,'giu');
const bare=/(?<![\p{L}\p{N}.,])(?:[+-]\s*)?\d[\d.,]*(?![\p{L}\p{N}.,])/gu;
const matches=(text,pattern)=>[...text.matchAll(pattern)].map(match=>({raw:match[0],start:match.index,end:match.index+match[0].length}));

/** Date must already be removed by the caller. Explicit monetary markers take
 * precedence over merchant numbers. Prefix markers own their following number
 * ("Farmacity 24 $1500"); suffixes are accepted when no prefix overlaps them.
 * The signed result is in the original currency and rounded to centavos.
 */
export function parsePastedAmount(textWithoutDate){
  if(typeof textWithoutDate!=='string'||!textWithoutDate.trim())throw invalid();
  const prefixed=matches(textWithoutDate,prefix);
  const marked=[...prefixed,...matches(textWithoutDate,suffix).filter(item=>!prefixed.some(other=>item.start<other.end&&other.start<item.end))];
  if(!marked.length&&/\$|(?<![\p{L}])(?:USD|ARS)(?![\p{L}])/iu.test(textWithoutDate))throw invalid();
  const candidates=marked.length?marked:matches(textWithoutDate,bare);
  if(candidates.length>1)throw ambiguous();
  if(candidates.length!==1)throw invalid();
  const value=parseMoney(candidates[0].raw);
  if(!Number.isFinite(value)||value===0)throw invalid();
  return value;
}
