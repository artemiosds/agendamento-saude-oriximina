import {describe,it,expect,vi} from 'vitest';
import {collectClinicalHistory,clinicalHistorySections,periodBounds,HISTORY_PAGE_SIZE} from './clinicalRecordList';
describe('listagem clínica e histórico de prontuários',()=>{
 it('consulta além da primeira página e ordena cronologicamente',async()=>{
  const rows=Array.from({length:205},(_,i)=>({id:String(i+1).padStart(5,'0'),data_atendimento:'2026-11-25',criado_em:String(i).padStart(5,'0')}));
  const fetch=vi.fn(async(cursor:string)=>rows.filter(r=>r.id>cursor).slice(0,HISTORY_PAGE_SIZE));
  const result=await collectClinicalHistory(fetch);
  expect(result).toHaveLength(205);expect(result[0].id).toBe('00205');expect(fetch).toHaveBeenCalledTimes(3);
 });
 it('falha em vez de devolver história parcial se página falhar',async()=>{const rows=Array.from({length:100},(_,i)=>({id:String(i+1).padStart(5,'0')}));await expect(collectClinicalHistory(async cursor=>{if(cursor)throw Error('rede');return rows;})).rejects.toThrow('rede');});
 it('preserva evolução e conduta separadamente e escapa conteúdo clínico',()=>{const html=clinicalHistorySections({id:'1',soap_subjetivo:'<teste>',conduta:'C',evolucao:'E',prescricao:'P'});expect(html).toContain('&lt;teste&gt;');expect(html).toContain('Conduta');expect(html).toContain('Evolução');expect(html).toContain('Prescrição');});
 it('calcula períodos inclusivos sem deslocamento de fuso',()=>{expect(periodBounds('week','2026-01-02')).toEqual({dataInicial:'2025-12-27',dataFinal:'2026-01-02'});expect(periodBounds('month','2026-11-25').dataInicial).toBe('2026-11-01');});
});