import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

/**
 * Centralized hook for unit-based visibility filtering.
 * 
 * Rules:
 * - Global master (unidadeId empty): sees all units
 * - Unit master / coordenador / recepcao / profissional / tecnico: sees only their assigned unit
 */
export function useUnidadeFilter() {
  const { user, isGlobalMaster } = useAuth();
  const { unidades, funcionarios, salas, disponibilidades } = useData();

  /** True if user has role=master (either global or unit-scoped) */
  const isMaster = user?.role === 'master';
  const userUnidadeId = user?.unidadeId || '';

  /** Units visible to the current user */
  const unidadesVisiveis = useMemo(() => {
    if (isGlobalMaster || !userUnidadeId) return unidades;
    return unidades.filter(u => u.id === userUnidadeId);
  }, [unidades, isGlobalMaster, userUnidadeId]);

  /** Active professionals visible to the current user (filtered by unit) */
  const profissionaisVisiveis = useMemo(() => {
    const profs = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
    if (isGlobalMaster || !userUnidadeId) return profs;
    const profsWithDisp = new Set(
      disponibilidades
        .filter(d => d.unidadeId === userUnidadeId)
        .map(d => d.profissionalId)
    );
    return profs.filter(p => p.unidadeId === userUnidadeId || profsWithDisp.has(p.id));
  }, [funcionarios, disponibilidades, isGlobalMaster, userUnidadeId]);

  /** Rooms visible to the current user (filtered by unit) */
  const salasVisiveis = useMemo(() => {
    if (isGlobalMaster || !userUnidadeId) return salas;
    return salas.filter(s => s.unidadeId === userUnidadeId);
  }, [salas, isGlobalMaster, userUnidadeId]);

  /** Whether to show unit selector (only if user has access to multiple units) */
  const showUnitSelector = unidadesVisiveis.length > 1;

  /** Default unit ID for forms (auto-fill when only one unit visible) */
  const defaultUnidadeId = unidadesVisiveis.length === 1 ? unidadesVisiveis[0].id : '';

  return {
    isMaster,
    isGlobalMaster,
    userUnidadeId,
    unidadesVisiveis,
    profissionaisVisiveis,
    salasVisiveis,
    showUnitSelector,
    defaultUnidadeId,
  };
}
