export function resolveProntuarioProfessional(
  isEditing: boolean,
  form: { profissional_id: string; profissional_nome: string },
  user?: { id?: string | null; nome?: string | null } | null,
  registeredName = "",
) {
  if (!isEditing) {
    return { id: user?.id || "", nome: user?.nome || "" };
  }

  // Never assign an existing record to the person who happens to be editing it.
  return {
    id: form.profissional_id || "",
    nome: form.profissional_nome || registeredName || "",
  };
}
