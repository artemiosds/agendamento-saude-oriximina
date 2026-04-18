import { supabase } from '@/integrations/supabase/client';

// Mantém a interface usada por Tratamentos/Regulação/Prontuário
export interface ProcedimentoDB {
  id: string;          // codigo SIGTAP ou CUSTOM-xxx
  nome: string;
  descricao: string;
  profissao: string;   // nome da profissão (Fisioterapeuta, Psicólogo, ...)
  especialidade: string; // chave normalizada (fisioterapia, psicologia, ...)
  profissional_id: string | null;
  profissionais_ids?: string[];
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  total_cids?: number;
  origem?: 'SIGTAP' | 'PERSONALIZADO';
  valor?: number | null;
}

// Mapeia chave de especialidade -> nomes da profissão usados no cadastro de funcionários
export const SIGTAP_ESPECIALIDADE_TO_PROFISSAO: Record<string, string[]> = {
  fisioterapia: ['Fisioterapeuta'],
  psicologia: ['Psicólogo', 'Psicóloga'],
  fonoaudiologia: ['Fonoaudiólogo', 'Fonoaudióloga'],
  enfermagem: ['Enfermeiro', 'Enfermeira'],
  nutricao: ['Nutricionista'],
  terapia_ocupacional: ['Terapeuta Ocupacional'],
  assistencia_social: ['Assistente Social'],
  servico_social: ['Assistente Social'],
  medico: ['Médico', 'Médica'],
  medicina: ['Médico', 'Médica'],
  odontologia: ['Odontólogo', 'Odontóloga', 'Dentista', 'Cirurgião-Dentista', 'Cirurgiã-Dentista', 'Odontologia'],
  farmacia: ['Farmacêutico', 'Farmacêutica'],
  biomedicina: ['Biomédico', 'Biomédica'],
  educacao_fisica: ['Educador Físico', 'Profissional de Educação Física'],
  podologia: ['Podólogo', 'Podóloga'],
  optometria: ['Optometrista'],
  saude_coletiva: ['Sanitarista'],
  outros: [],
};

// Lista de chaves disponíveis para cadastro manual
export const ESPECIALIDADES_DISPONIVEIS: { key: string; label: string }[] = [
  { key: 'enfermagem', label: 'Enfermagem' },
  { key: 'medicina', label: 'Medicina' },
  { key: 'odontologia', label: 'Odontologia' },
  { key: 'fisioterapia', label: 'Fisioterapia' },
  { key: 'nutricao', label: 'Nutrição' },
  { key: 'psicologia', label: 'Psicologia' },
  { key: 'terapia_ocupacional', label: 'Terapia Ocupacional' },
  { key: 'fonoaudiologia', label: 'Fonoaudiologia' },
  { key: 'servico_social', label: 'Serviço Social' },
  { key: 'farmacia', label: 'Farmácia' },
  { key: 'biomedicina', label: 'Biomedicina' },
  { key: 'educacao_fisica', label: 'Educação Física' },
  { key: 'podologia', label: 'Podologia' },
  { key: 'optometria', label: 'Optometria' },
  { key: 'saude_coletiva', label: 'Saúde Coletiva' },
  { key: 'outros', label: 'Outros' },
];

const PROFISSAO_TO_SIGTAP: Record<string, string> = {};
for (const [esp, profs] of Object.entries(SIGTAP_ESPECIALIDADE_TO_PROFISSAO)) {
  profs.forEach((p) => (PROFISSAO_TO_SIGTAP[p.toLowerCase()] = esp));
}

export const profissaoToEspecialidadeSigtap = (profissao?: string | null): string | null => {
  if (!profissao) return null;
  return PROFISSAO_TO_SIGTAP[profissao.toLowerCase().trim()] || null;
};

let cached: ProcedimentoDB[] | null = null;
let cachedLinks: Map<string, string[]> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchAll(): Promise<{ procs: ProcedimentoDB[]; links: Map<string, string[]> }> {
  const [{ data: sigtap }, { data: vinc }] = await Promise.all([
    (supabase as any)
      .from('sigtap_procedimentos')
      .select('*')
      .eq('ativo', true)
      .order('especialidade')
      .order('nome'),
    (supabase as any).from('procedimento_profissionais').select('procedimento_codigo, profissional_id'),
  ]);

  const links = new Map<string, string[]>();
  (vinc || []).forEach((v: any) => {
    const arr = links.get(v.procedimento_codigo) || [];
    arr.push(v.profissional_id);
    links.set(v.procedimento_codigo, arr);
  });

  const procs: ProcedimentoDB[] = (sigtap || []).map((p: any) => {
    const profsLinkados = links.get(p.codigo) || [];
    const profissaoNome = SIGTAP_ESPECIALIDADE_TO_PROFISSAO[p.especialidade]?.[0] || p.especialidade || '';
    return {
      id: p.codigo,
      nome: p.nome,
      descricao: p.descricao || '',
      profissao: profissaoNome,
      especialidade: p.especialidade || '',
      profissional_id: null,
      profissionais_ids: profsLinkados,
      ativo: p.ativo,
      criado_em: p.created_at,
      atualizado_em: p.updated_at,
      total_cids: p.total_cids || 0,
      origem: (p.origem || 'SIGTAP') as 'SIGTAP' | 'PERSONALIZADO',
      valor: p.valor ?? null,
    };
  });

  return { procs, links };
}

export const procedureService = {
  async getAll(forceRefresh = false): Promise<ProcedimentoDB[]> {
    if (!forceRefresh && cached && Date.now() - cacheTimestamp < CACHE_TTL) return cached;
    const { procs, links } = await fetchAll();
    cached = procs;
    cachedLinks = links;
    cacheTimestamp = Date.now();
    return cached;
  },

  async getActive(): Promise<ProcedimentoDB[]> {
    return (await this.getAll()).filter((p) => p.ativo);
  },

  async getByProfissao(profissao: string): Promise<ProcedimentoDB[]> {
    const all = await this.getActive();
    if (!profissao) return all;
    const espKey = profissaoToEspecialidadeSigtap(profissao);
    if (!espKey) return all.filter((p) => p.profissao.toLowerCase() === profissao.toLowerCase());
    return all.filter((p) => p.especialidade === espKey);
  },

  async getByProfissional(profissionalId: string, profissao: string): Promise<ProcedimentoDB[]> {
    const byArea = await this.getByProfissao(profissao);
    return byArea.filter((p) => {
      const linked = p.profissionais_ids || [];
      return linked.length === 0 || linked.includes(profissionalId);
    });
  },

  async getCidsForProcedure(codigo: string): Promise<{ codigo: string; descricao: string }[]> {
    const { data } = await (supabase as any)
      .from('sigtap_procedimento_cids')
      .select('cid_codigo, cid_descricao')
      .eq('procedimento_codigo', codigo)
      .limit(50);
    return (data || []).map((r: any) => ({ codigo: r.cid_codigo, descricao: r.cid_descricao }));
  },

  async createCustom(input: {
    codigo?: string;
    nome: string;
    descricao?: string;
    especialidade: string;
    valor?: number | null;
    cids?: { codigo: string; descricao: string }[];
    criadoPor?: string;
  }): Promise<{ codigo: string }> {
    const codigo = (input.codigo?.trim() || `CUSTOM-${Date.now().toString(36).toUpperCase()}`);
    const { error } = await (supabase as any).from('sigtap_procedimentos').insert({
      codigo,
      nome: input.nome.trim(),
      descricao: input.descricao || '',
      especialidade: input.especialidade,
      origem: 'PERSONALIZADO',
      valor: input.valor ?? null,
      ativo: true,
      total_cids: input.cids?.length || 0,
      criado_por: input.criadoPor || '',
    });
    if (error) throw error;

    if (input.cids && input.cids.length > 0) {
      await (supabase as any).from('sigtap_procedimento_cids').insert(
        input.cids.map((c) => ({
          procedimento_codigo: codigo,
          cid_codigo: c.codigo,
          cid_descricao: c.descricao || '',
        })),
      );
    }
    this.invalidateCache();
    return { codigo };
  },

  async updateCustom(codigo: string, patch: { nome?: string; descricao?: string; especialidade?: string; valor?: number | null; ativo?: boolean }) {
    const { error } = await (supabase as any)
      .from('sigtap_procedimentos')
      .update(patch)
      .eq('codigo', codigo)
      .eq('origem', 'PERSONALIZADO');
    if (error) throw error;
    this.invalidateCache();
  },

  async deleteCustom(codigo: string) {
    const { error } = await (supabase as any)
      .from('sigtap_procedimentos')
      .delete()
      .eq('codigo', codigo)
      .eq('origem', 'PERSONALIZADO');
    if (error) throw error;
    this.invalidateCache();
  },

  invalidateCache() {
    cached = null;
    cachedLinks = null;
    cacheTimestamp = 0;
  },
};
