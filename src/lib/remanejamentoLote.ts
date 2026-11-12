const MOVIVEIS = new Set(["pendente", "agendado", "confirmado", "confirmado_chegada", "aguardando_triagem", "aguardando_atendimento", "atraso"]);
export function selecionarMovimentaveis<T extends { data: string; status: string; profissionalId: string; hora: string }>(ags: T[], data: string, profissionalId: string | null): T[] {
  return ags.filter((a) => a.data === data && MOVIVEIS.has(a.status) && (!profissionalId || a.profissionalId === profissionalId))
    .sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
}
