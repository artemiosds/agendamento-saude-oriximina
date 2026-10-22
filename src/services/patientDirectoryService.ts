import { supabase } from "@/integrations/supabase/client";

export const DIRECTORY_COLUMNS =
  "id,nome,cpf,cns,nome_mae,telefone,data_nascimento,email,endereco,observacoes,descricao_clinica,cid,criado_em,is_gestante,is_pne,is_autista,unidade_id,naturalidade,naturalidade_uf,municipio,menor_idade,nome_responsavel,cpf_responsavel,ubs_origem,profissional_solicitante,tipo_encaminhamento,diagnostico_resumido,justificativa,data_encaminhamento,documento_url,tipo_condicao,mobilidade,usa_dispositivo,tipo_dispositivo,comunicacao,comportamento,usa_equipamentos,equipamentos,observacao_equipamentos,outro_servico_sus,transporte,turno_preferido,especialidade_destino,custom_data,sexo";

type DirectoryOptions = {
  unitId: string | null; // null is reserved for admin.sms
  search?: string;
  limit?: number;
  full?: boolean;
  ids?: string[];
};

export async function fetchPatientDirectory({ unitId, search = "", limit = 50, full = false, ids }: DirectoryOptions) {
  if (unitId === "") throw new Error("Unidade do usuário indisponível");
  if (ids && !ids.length) return { rows: [], total: 0 };

  const term = search.trim().replace(/[%(),"'\\]/g, "");
  const digits = term.replace(/\D/g, "");
  const createQuery = (idBatch?: string[]) => {
    let query = supabase.from("pacientes").select(DIRECTORY_COLUMNS, { count: "exact" });
    if (unitId !== null) query = query.or(`unidade_id.eq.${unitId},unidade_id.is.null,unidade_id.eq.`);
    if (idBatch) query = query.in('id', idBatch);
    if (term) {
      const filters = [`nome.ilike.%${term}%`, `cpf.ilike.%${term}%`, `telefone.ilike.%${term}%`];
      if (digits) filters.push(`cns.ilike.%${digits}%`);
      query = query.or(filters.join(","));
    }
    return query.order("nome", { ascending: true });
  };

  if (!full) {
    const { data, count, error } = await createQuery().range(0, limit - 1);
    if (error) throw error;
    return { rows: data || [], total: count ?? 0 };
  }

  // A complete read only happens for an explicit export or for the less common
  // queue sorting modes; never prefetch the entire registry on page entry.
  const rows: any[] = [];
  const batchSize = 500;
  const idBatches = ids ? Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100)) : [undefined];
  for (const idBatch of idBatches) {
    for (let from = 0; ; from += batchSize) {
      const { data, error } = await createQuery(idBatch).range(from, from + batchSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < batchSize) break;
    }
  }
  if (ids) rows.sort((a, b) => a.nome.localeCompare(b.nome));
  return { rows, total: rows.length };
}
