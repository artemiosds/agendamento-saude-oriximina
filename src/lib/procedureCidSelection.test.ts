import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./bpaSigtapCatalog', () => ({ loadBpaSigtapCatalog: vi.fn(), getCompetenciaReferenciaCatalogo: vi.fn() }));
vi.mock('@/services/procedureService', () => ({ procedureService: { getCidsForProcedure: vi.fn(), getCidByCode: vi.fn() } }));
import { loadBpaSigtapCatalog, getCompetenciaReferenciaCatalogo } from './bpaSigtapCatalog';
import { procedureService } from '@/services/procedureService';
import { loadProcedureCidOptions, partitionProcedureCids, resolveManualProcedureCid } from './procedureCidSelection';

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCompetenciaReferenciaCatalogo).mockReturnValue('202610'); });
describe('Vínculo CID × procedimento por competência', () => {
  it('usa a lista da competência e não transforma um CID local extra em vínculo oficial', async () => {
    vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map([['0303190019', { cids: new Set(['G800', 'R262']) }]]) as any);
    vi.mocked(procedureService.getCidsForProcedure).mockResolvedValue([{ codigo: 'G800', descricao: 'Paralisia cerebral' }, { codigo: 'F840', descricao: 'Autismo' }]);
    expect(await loadProcedureCidOptions('0303190019', '202610')).toEqual([{ codigo: 'G800', descricao: 'Paralisia cerebral' }, { codigo: 'R262', descricao: '' }]);
  });
  it('usa o SIGTAP mais recente anterior quando a competência 202611 ainda não foi publicada', async () => {
    vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map([['0303190019', { cids: new Set(['G800']) }]]) as any);
    vi.mocked(getCompetenciaReferenciaCatalogo).mockReturnValue('202610');
    vi.mocked(procedureService.getCidsForProcedure).mockResolvedValue([]);
    expect(await loadProcedureCidOptions('0303190019', '202611')).toEqual([{ codigo: 'G800', descricao: '' }]);
  });
  it('não aceita catálogo de mês posterior à competência', async () => {
    vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map());
    vi.mocked(getCompetenciaReferenciaCatalogo).mockReturnValue('202612');
    await expect(loadProcedureCidOptions('0303190019', '202611')).rejects.toThrow('posterior');
    expect(procedureService.getCidsForProcedure).not.toHaveBeenCalled();
  });
  it('não inventa opções quando o procedimento não existe ou a rede falha', async () => {
    vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map());
    await expect(loadProcedureCidOptions('0303190019', '202610')).rejects.toThrow('não encontrado');
    vi.mocked(loadBpaSigtapCatalog).mockRejectedValue(new Error('Rede'));
    await expect(loadProcedureCidOptions('0303190019', '202610')).rejects.toThrow('Rede');
  });
  it('separa CIDs ao repetir sem modificar o registro de origem', () => {
    const source = ['F840', 'G80.0', 'G800'];
    expect(partitionProcedureCids(source, [{ codigo: 'G800', descricao: '' }])).toEqual({ accepted: ['G800'], rejected: ['F840'] });
    expect(source).toEqual(['F840', 'G80.0', 'G800']);
  });
  it('não trata ausência de lista restritiva como incompatibilidade', () => {
    expect(partitionProcedureCids(['F840'], [])).toEqual({ accepted: ['F840'], rejected: [] });
  });
});


describe('CID manual somente sem lista restritiva', () => {
 beforeEach(() => {
  vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map([['0301010048', { cids: new Set() }]]) as any);
  vi.mocked(procedureService.getCidsForProcedure).mockResolvedValue([]);
  vi.mocked(procedureService.getCidByCode).mockResolvedValue({codigo:'Z000',descricao:'Exame médico geral'});
 });
 it('aceita Z00.0 somente após confirmar a ausência de lista e conferir o código exato', async () => {
  expect(await resolveManualProcedureCid('0301010048','202610',' z00.0 ')).toEqual({codigo:'Z000',descricao:'Exame médico geral'});
  expect(procedureService.getCidByCode).toHaveBeenCalledWith('Z000');
 });
 it('bloqueia a via manual se o procedimento tiver qualquer lista restritiva', async () => {
  vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map([['0303190019',{cids:new Set(['G800'])}]]) as any);
  await expect(resolveManualProcedureCid('0303190019','202610','F840')).rejects.toThrow('lista restritiva');
  expect(procedureService.getCidByCode).not.toHaveBeenCalled();
 });
 it('não confunde falha na consulta com lista vazia', async () => {
  vi.mocked(loadBpaSigtapCatalog).mockRejectedValue(new Error('Catálogo indisponível'));
  await expect(resolveManualProcedureCid('0301010048','202610','Z000')).rejects.toThrow('indisponível');
  expect(procedureService.getCidByCode).not.toHaveBeenCalled();
 });
 it('rejeita código inexistente e texto livre sem criar diagnósticos', async () => {
  vi.mocked(procedureService.getCidByCode).mockResolvedValue(null);
  await expect(resolveManualProcedureCid('0301010048','202610','Z999')).rejects.toThrow('não encontrado');
  await expect(resolveManualProcedureCid('0301010048','202610','diagnóstico livre')).rejects.toThrow('código CID-10 válido');
 });
 it('propaga falha da leitura CID-10 para não dar confirmação falsa', async () => {
  vi.mocked(procedureService.getCidByCode).mockRejectedValue(new Error('Falha de rede'));
  await expect(resolveManualProcedureCid('0301010048','202610','Z000')).rejects.toThrow('Falha de rede');
 });
});
