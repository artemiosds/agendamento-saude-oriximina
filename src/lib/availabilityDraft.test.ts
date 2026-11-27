import { describe,expect,it } from 'vitest';
import { WEEKDAY_PRESETS,selectDraftDays,copyDraftDays,renewalDateAllowed,nominalWeek } from './availabilityDraft';
const hours=Array.from({length:7},(_,i)=>({ativo:i===1,horaInicio:'08:00',horaFim:'12:00'}));
describe('rascunho de disponibilidade',()=>{
  it('seleciona dias úteis e preserva horários desativados',()=>{
    const before=JSON.stringify(hours);
    const days=selectDraftDays(hours,WEEKDAY_PRESETS.uteis,d=>({...d,ativo:true}));
    expect(days.filter(d=>d.ativo)).toHaveLength(5);
    expect(days[0].ativo).toBe(false);
    expect(days[6].ativo).toBe(false);
    expect(JSON.stringify(hours)).toBe(before);
    expect(selectDraftDays(days,WEEKDAY_PRESETS.nenhum,d=>({...d,ativo:true}))[1].horaInicio).toBe('08:00');
  });
  it('copia exclusivamente os destinos selecionados sem alterar a origem',()=>{
    const result=copyDraftDays(hours,1,[0,2,2,8,1],(from,to)=>({...to,...from}));
    expect(result[0].ativo).toBe(true);
    expect(result[2].ativo).toBe(true);
    expect(result[3].ativo).toBe(false);
    expect(result[2]).not.toBe(hours[1]);
    expect(copyDraftDays(hours,-1,[2],()=>{throw new Error('origem inválida');})).toEqual(hours);
  });
  it('exige período novo após origem e não anterior a hoje',()=>{
    expect(renewalDateAllowed('2026-12-01','2026-12-31','2026-11-30','2026-11-27')).toBe(true);
    expect(renewalDateAllowed('2026-11-30','2026-12-31','2026-11-30','2026-11-27')).toBe(false);
    expect(renewalDateAllowed('2026-11-01','2026-11-30','2026-10-31','2026-11-27')).toBe(false);
    expect(renewalDateAllowed('2026-12-01','','2026-11-30','2026-11-27')).toBe(false);
    expect(renewalDateAllowed('2026-12-02','2026-12-01','2026-11-30','2026-11-27')).toBe(false);
  });
  it('resume vagas nominais por hora, sem interpretar disponibilidade real',()=>{
    const days=selectDraftDays(hours,WEEKDAY_PRESETS.uteis,d=>({...d,ativo:true}));
    const summary=nominalWeek('por_hora',days,[],8);
    expect(summary.nominal).toBe(40);expect(summary.blocks).toBe(5);expect(summary.days).toHaveLength(5);
  });
  it('não conta dia vazio, bloco inativo ou dia desativado',()=>{
    const b={ativo:true,vagas:10,horaInicio:'08:00',horaFim:'12:00',nome:'Manhã'};
    const turn=[{ativo:true,blocos:[b,{...b,ativo:false,vagas:20}]},{ativo:true,blocos:[]},{ativo:false,blocos:[{...b,vagas:30}]}];
    const summary=nominalWeek('por_turno',[],turn,0);
    expect(summary.nominal).toBe(10);expect(summary.blocks).toBe(1);expect(summary.days).toHaveLength(1);
  });
});
