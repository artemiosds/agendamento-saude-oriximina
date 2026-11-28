import {describe,it,expect} from 'vitest';
import {confirmedCounts,validReminderHours,providerFunction,confirmedProcessing,nextVersion} from './adminWhatsApp';
describe('administração de WhatsApp',()=>{
 it('não transforma falha ou contagem ausente em zero',()=>{expect(confirmedCounts([{count:0,error:null}])).toEqual([0]);expect(confirmedCounts([{count:null,error:null}])).toBeNull();expect(confirmedCounts([{count:5,error:Error()}])).toBeNull();});
 it('preserva limites exibidos de lembretes',()=>{expect(validReminderHours(24,2)).toBe(true);expect(validReminderHours(73,2)).toBe(false);expect(validReminderHours(24,1.5)).toBe(false);});
 it('seleciona explicitamente o provedor',()=>{expect(providerFunction('evolution')).toBe('send-whatsapp-evolution');expect(providerFunction('uazapigo')).toBe('send-whatsapp-uazapigo');expect(()=>providerFunction('')).toThrow();});
 it('requer confirmação do processador',()=>{expect(confirmedProcessing({success:true,processed:0,skipped:'fora_janela_comercial'})).toBe(true);expect(confirmedProcessing({success:false,processed:0})).toBe(false);expect(confirmedProcessing(null)).toBe(false);});
 it('não usa versão inválida nem regressiva',()=>{expect(()=>nextVersion('')).toThrow();expect(Date.parse(nextVersion('2099-01-01T00:00:00Z'))).toBeGreaterThan(Date.parse('2099-01-01T00:00:00Z'));});
});
