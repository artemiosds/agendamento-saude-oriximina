import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: db }));
vi.mock('./auditService', () => ({ auditService: { auditUpdate: vi.fn() } }));
import { patientService } from './patientService';

describe('prioridades no cadastro compartilhado', () => {
  it('prefere false nativo a true legado e recupera valores ausentes', () => {
    expect(patientService.mapPacienteDbToForm({
      is_gestante: false, is_autista: true,
      custom_data: { is_gestante: true, is_pne: true, tipo_condicao: 'fisica' },
    })).toMatchObject({ is_gestante: false, is_pne: true, is_autista: true, tipo_condicao: 'fisica' });
  });
  it('sincroniza desmarcação explícita e preserva dados extras e encaminhamento armazenado', () => {
    const old = { is_gestante: true, is_pne: true, is_autista: true, tipo_condicao: 'tea',
      especialidade_destino: 'fisioterapia', custom_data: { campo_extra: 42, is_autista: true, bairro: 'CENTRO' } };
    const payload = patientService.mapPacienteFormToDb({ is_gestante: false, is_pne: false, is_autista: false, tipo_condicao: '' }, old);
    expect(payload).toMatchObject({ is_gestante: false, is_pne: false, is_autista: false, tipo_condicao: '',
      custom_data: { campo_extra: 42, bairro: 'CENTRO', is_gestante: false, is_pne: false, is_autista: false, tipo_condicao: '' } });
    expect(payload).not.toHaveProperty('especialidade_destino');
  });
  it('preserva prioridades nativas quando outro formulário não as envia', () => {
    const payload = patientService.mapPacienteFormToDb({ nome: 'PACIENTE' }, {
      is_gestante: true, is_pne: false, is_autista: true, tipo_condicao: 'tea', custom_data: { is_pne: true },
    });
    expect(payload).toMatchObject({ is_gestante: true, is_pne: false, is_autista: true, tipo_condicao: 'tea',
      custom_data: { is_gestante: true, is_pne: false, is_autista: true, tipo_condicao: 'tea' } });
  });
  it('mantém compatibilidade com os nomes usados pelo cadastro principal', () => {
    expect(patientService.mapPacienteFormToDb({ tipoCondicao: 'intelectual', isGestante: false, isPne: true, isAutista: false }, {}))
      .toMatchObject({ tipo_condicao: 'intelectual', is_gestante: false, is_pne: true, is_autista: false });
  });
  it('não grava se falhar a leitura necessária para preservar os dados atuais', async () => {
    const single = vi.fn(async () => ({ data: null, error: new Error('sem conexão') }));
    db.from.mockReturnValue({ select: () => ({ eq: () => ({ single }) }) });
    await expect(patientService.savePacienteCadastro('p1', { is_autista: true })).rejects.toThrow('sem conexão');
    expect(db.from).toHaveBeenCalledTimes(1);
  });
});
