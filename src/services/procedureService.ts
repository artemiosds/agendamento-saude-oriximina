import { supabase } from '@/integrations/supabase/client';

export interface ProcedimentoDB {
  id: string;
  nome: string;
  descricao: string;
  profissao: string;
  especialidade: string;
  profissional_id: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

let cachedProcedimentos: ProcedimentoDB[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const procedureService = {
  async getAll(forceRefresh = false): Promise<ProcedimentoDB[]> {
    if (!forceRefresh && cachedProcedimentos && Date.now() - cacheTimestamp < CACHE_TTL) {
      return cachedProcedimentos;
    }
    const { data } = await (supabase as any).from('procedimentos').select('*').order('profissao', { ascending: true });
    cachedProcedimentos = data || [];
    cacheTimestamp = Date.now();
    return cachedProcedimentos;
  },

  async getActive(): Promise<ProcedimentoDB[]> {
    const all = await this.getAll();
    return all.filter(p => p.ativo);
  },

  async getByProfissao(profissao: string): Promise<ProcedimentoDB[]> {
    const active = await this.getActive();
    if (!profissao) return active;
    // Normalize comparison (case-insensitive, partial match)
    const normalized = profissao.toLowerCase().trim();
    return active.filter(p => {
      const pNorm = p.profissao.toLowerCase().trim();
      return pNorm === normalized || pNorm.includes(normalized) || normalized.includes(pNorm);
    });
  },

  async getByProfissional(profissionalId: string, profissao: string): Promise<ProcedimentoDB[]> {
    const byArea = await this.getByProfissao(profissao);
    // Return procedures specific to this professional + procedures available for all in the area
    return byArea.filter(p => !p.profissional_id || p.profissional_id === profissionalId);
  },

  invalidateCache() {
    cachedProcedimentos = null;
    cacheTimestamp = 0;
  },
};
