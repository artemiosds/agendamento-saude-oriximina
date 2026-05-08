import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';

/**
 * Returns a resolver function that looks up the current patient name
 * from the live `pacientes` array by ID.
 * Falls back to `fallbackNome` (the denormalized/cached name) if patient not found.
 * 
 * Usage:
 *   const resolvePaciente = usePacienteNomeResolver();
 *   // In JSX:
 *   <span>{resolvePaciente(ag.pacienteId, ag.pacienteNome)}</span>
 */
export function usePacienteNomeResolver() {
  const { pacientes } = useData();

  const pacienteMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pacientes) {
      map.set(p.id, p.nome);
    }
    return map;
  }, [pacientes]);

  return (pacienteId: string, fallbackNome?: string): string => {
    return pacienteMap.get(pacienteId) || fallbackNome || 'Paciente não encontrado';
  };
}
