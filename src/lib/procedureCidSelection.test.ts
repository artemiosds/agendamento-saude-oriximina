import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./bpaSigtapCatalog', () => ({ loadBpaSigtapCatalog: vi.fn(), getCompetenciaReferenciaCatalogo: vi.fn() }));
vi.mock('@/services/procedureService', () => ({ procedureService: { getCidsForProcedure: vi.fn() } }));
import { loadBpaSigtapCatalog, getCompetenciaReferenciaCatalogo } from './bpaSigtapCatalog';
import { procedureService } from '@/services/procedureService';
import { loadProcedureCidOptions, partitionProcedureCids } from './procedureCidSelection';

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCompetenciaReferenciaCatalogo).mockReturnValue('202610'); });
describe('Vínculo CID × procedimento por competência', () => {
  it('usa a lista da competência e não transforma um CID local extra em vínculo oficial', async () => {
    vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map([['0303190019', { cids: new Set(['G800', 'R262']) }]]) as any);
    vi.mocked(procedureService.getCidsForProcedure).mockResolvedValue([{ codigo: 'G800', descricao: 'Paralisia cerebral' }, { codigo: 'F840', descricao: 'Autismo' }]);
    expect(await loadProcedureCidOptions('0303190019', '202610')).toEqual([{ codigo: 'G800', descricao: 'Paralisia cerebral' }, { codigo: 'R262', descricao: '' }]);
  });
  it('não aceita uma referência de outro mês como lista confirmada', async () => {
    vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map());
    vi.mocked(getCompetenciaReferenciaCatalogo).mockReturnValue('202609');
    await expect(loadProcedureCidOptions('0303190019', '202610')).rejects.toThrow('202609');
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
