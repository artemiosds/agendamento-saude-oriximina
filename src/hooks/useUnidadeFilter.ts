import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

/**
 * Centralized hook for unit-based visibility filtering.
 * 
 * Rules:
 * - master: sees all units
 * - coordenador/recepcao/profissional/tecnico: sees only their assigned unit
 * 
 * Returns filtered lists of units, professionals, and rooms.
 */
export function useUnidadeFilter() {
  const { user } = useAuth();
  const { unidades, funcionarios, salas, disponibilidades } = useData();

  const isMaster = user?.role === 'master';
  const userUnidadeId = user?.unidadeId || '';

  /** Units visible to the current user */
  const unidadesVisiveis = useMemo(() => {
    if (isMaster || !userUnidadeId) return unidades;
    return unidades.filter(u => u.id === userUnidadeId);
  }, [unidades, isMaster, userUnidadeId]);

  /** Active professionals visible to the current user (filtered by unit) */
  const profissionaisVisiveis = useMemo(() => {
    const profs = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
    if (isMaster || !userUnidadeId) return profs;
    // Show professionals assigned to user's unit OR who have availability in user's unit
    const profsWithDisp = new Set(
      disponibilidades
        .filter(d => d.unidadeId === userUnidadeId)
        .map(d => d.profissionalId)
    );
    return profs.filter(p => p.unidadeId === userUnidadeId || profsWithDisp.has(p.id));
  }, [funcionarios, disponibilidades, isMaster, userUnidadeId]);

  /** Rooms visible to the current user (filtered by unit) */
  const salasVisiveis = useMemo(() => {
    if (isMaster || !userUnidadeId) return salas;
    return salas.filter(s => s.unidadeId === userUnidadeId);
  }, [salas, isMaster, userUnidadeId]);

  /** Whether to show unit selector (only if user has access to multiple units) */
  const showUnitSelector = unidadesVisiveis.length > 1;

  /** Default unit ID for forms (auto-fill when only one unit visible) */
  const defaultUnidadeId = unidadesVisiveis.length === 1 ? unidadesVisiveis[0].id : '';

  return {
    isMaster,
    userUnidadeId,
    unidadesVisiveis,
    profissionaisVisiveis,
    salasVisiveis,
    showUnitSelector,
    defaultUnidadeId,
  };
}
