import {describe,it,expect} from 'vitest';
import {validSigtapCode,validCompetencia,confirmKeys,safeIntegrationUrl,explicitSuccess} from './adminIntegrations';
describe('administração SIGTAP e integrações',()=>{
 it('preserva zeros à esquerda e exige dez dígitos',()=>{expect(validSigtapCode('0301010072')).toBe(true);expect(validSigtapCode('123456789X')).toBe(false);});
 it('exige competência válida, sem inventar o mês',()=>{expect(validCompetencia('202611')).toBe(true);expect(validCompetencia('202613')).toBe(false);});
 it('confirma todos os registros do lote',()=>{expect(confirmKeys(['01','02'],['02','01'])).toBe(true);expect(confirmKeys(['01','02'],['01','01'])).toBe(false);expect(confirmKeys(['01'],null)).toBe(false);});
 it('recusa esquemas inseguros e credenciais embutidas na URL',()=>{expect(safeIntegrationUrl('https://example.org/hook')).toBe(true);expect(safeIntegrationUrl('javascript:alert(1)')).toBe(false);expect(safeIntegrationUrl('https://user:pass@example.org')).toBe(false);});
 it('não considera ausência de erro como sucesso',()=>{expect(explicitSuccess({success:true})).toBe(true);expect(explicitSuccess({})).toBe(false);expect(explicitSuccess(null)).toBe(false);});
});
