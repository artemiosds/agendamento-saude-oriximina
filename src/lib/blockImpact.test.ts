import {describe,it,expect} from 'vitest';
import {availabilityImpact} from '../components/BlockOperationalReview';
import {type BlockDraft} from './blockDraft';
const d:BlockDraft={dataInicio:'2026-11-27',dataFim:'2026-11-27',diaInteiro:false,horaInicio:'08:00',horaFim:'12:00',scope:'global',unidadeId:'',profissionalId:''};
const r={data_inicio:'2026-11-01',data_fim:'2026-11-30',dias_semana:[5],hora_inicio:'09:00:00',hora_fim:'13:00:00'};
describe('Impacto administrativo de bloqueios',()=>{
 it('reconhece interseção de data, dia e horário',()=>expect(availabilityImpact(d,[r])).toEqual({matching:1,unknown:0}));
 it('não conta dia da semana diferente',()=>expect(availabilityImpact(d,[{...r,dias_semana:[4]}])).toEqual({matching:0,unknown:0}));
 it('não conta limites de horário adjacentes',()=>expect(availabilityImpact(d,[{...r,hora_inicio:'12:00',hora_fim:'15:00'},{...r,hora_inicio:'06:00',hora_fim:'08:00'}])).toEqual({matching:0,unknown:0}));
 it('não conta período sem interseção',()=>expect(availabilityImpact(d,[{...r,data_inicio:'2026-12-01',data_fim:'2026-12-31'}])).toEqual({matching:0,unknown:0}));
 it('conta dia inteiro sem exigir sobreposição de horário parcial',()=>expect(availabilityImpact({...d,diaInteiro:true},[{...r,hora_inicio:'15:00',hora_fim:'18:00'}])).toEqual({matching:1,unknown:0}));
 it('separa grades inconsistentes de ausência de impacto',()=>expect(availabilityImpact(d,[{...r,dias_semana:[8]},{...r,hora_inicio:'inválido'},{...r,hora_inicio:'14:00',hora_fim:'10:00'}])).toEqual({matching:0,unknown:3}));
 it('conta registros e não a quantidade de dias ou vagas',()=>expect(availabilityImpact({...d,dataFim:'2026-12-11'},[{...r,data_fim:'2026-12-31'}])).toEqual({matching:1,unknown:0}));
});
