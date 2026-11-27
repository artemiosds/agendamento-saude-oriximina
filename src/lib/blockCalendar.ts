import {validBlockDate,type BlockEntry,type BlockRow} from './blockDirectory';

// Administrative calendar: only expands one month, never generates or changes availability.
export function shiftBlockMonth(month:string,delta:number):string{
 if(!validBlockDate(month+'-01')||!Number.isInteger(delta))return month;
 const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
 const index=year*12+m-1+delta,y=Math.floor(index/12);
 return y<1||y>9999?month:String(y).padStart(4,'0')+'-'+String(index-y*12+1).padStart(2,'0');
}
export function blockCalendarMonth<T extends BlockRow>(month:string,entries:readonly BlockEntry<T>[],yearFilter='',monthFilter='todos'){
 if(!validBlockDate(month+'-01'))return {offset:0,days:[],count:0};
 const first=new Date(month+'-01T12:00:00Z');
 const next=new Date(first.getTime());next.setUTCMonth(next.getUTCMonth()+1,0);
 const allowed=(!yearFilter||yearFilter===month.slice(0,4))&&(monthFilter==='todos'||monthFilter===month.slice(5,7));
 const candidates=allowed?entries.filter(e=>e.status!=='invalido'&&e.block.dataInicio<=month+'-31'&&e.block.dataFim>=month+'-01'):[];
 const days=Array.from({length:next.getUTCDate()},(_,i)=>{
  const date=month+'-'+String(i+1).padStart(2,'0');
  return {date,entries:candidates.filter(e=>e.block.dataInicio<=date&&e.block.dataFim>=date)};
 });
 return {offset:first.getUTCDay(),days,count:candidates.length};
}
