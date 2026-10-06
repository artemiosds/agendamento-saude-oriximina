/** Sessão de tratamento registrada como falta (formato atual "paciente_faltou" ou legado "falta"). */
export const isSessionFalta = (status?: string | null): boolean =>
  status === "paciente_faltou" || status === "falta";
