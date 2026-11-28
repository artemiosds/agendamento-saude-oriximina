import {describe,it,expect} from 'vitest';
import {mergeFlowSettings,validTurno,validCareness,carePreviewKey,validImpact} from './adminFlowSettings';
describe('configurações administrativas do fluxo',()=>{
 it('preserva turnos, PTS e triagem ao alterar controle de atendimento',()=>{const original={turnos:[{id:'a'}],ptsCiclo:{exigirPts:true},triagem:{x:1},coordenador_pode_concluir:false};expect(mergeFlowSettings(original,{coordenador_pode_concluir:true})).toEqual({...original,coordenador_pode_concluir:true});});
 it('aceita turno noturno, rejeita horários inválidos ou iguais',()=>{expect(validTurno('Noite','22:00','06:00')).toBe(true);expect(validTurno('Noite','24:00','06:00')).toBe(false);expect(validTurno('Noite','06:00','06:00')).toBe(false);});
 const row={profession_key:'fisioterapia',enabled:true,duration_value:30,duration_unit:'days',scope:'global'};
 it('valida período e escopo conforme RPC',()=>{expect(validCareness(row)).toBe(true);expect(validCareness({...row,duration_value:3651})).toBe(false);expect(validCareness({...row,duration_value:1.5})).toBe(false);});
 it('invalida previsão se regra ou assinatura mudar',()=>{for(const change of [{scope:'unit'},{enabled:false},{duration_value:60},{duration_unit:'months'}])expect(carePreviewKey({...row,...change},'a')).not.toBe(carePreviewKey(row,'a'));expect(carePreviewKey(row,'b')).not.toBe(carePreviewKey(row,'a'));});
 it('não confunde falha na previsão com impacto zero',()=>{expect(validImpact(null)).toBe(false);expect(validImpact({total:3,expired:2,blocked_now:2})).toBe(false);expect(validImpact({total:3,expired:1,blocked_now:1})).toBe(true);});
});
