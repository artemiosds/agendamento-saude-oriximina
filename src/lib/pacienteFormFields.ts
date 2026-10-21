// Usa as abas existentes: não desloca campos nem muda validações BPA-I.
export const PACIENTE_FIELD_TABS: Record<string, string> = {
  nome: "identificacao", nomeMae: "identificacao", dataNascimento: "identificacao",
  cpf: "identificacao", cns: "identificacao", sexo: "identificacao", naturalidade: "identificacao",
  nomeResponsavel: "identificacao", cpfResponsavel: "identificacao",
  cep: "endereco", tipoLogradouro: "endereco", logradouro: "endereco", numero: "endereco",
  bairro: "endereco", municipio: "endereco", uf: "endereco",
  telefone: "contato", email: "contato",
  nacionalidade: "complementares", racaCor: "complementares", tipoCondicao: "complementares",
  especialidadeDestino: "complementares", ubsOrigem: "complementares", cid: "complementares",
  justificativa: "complementares",
};

export function firstPacienteError(errors: Record<string, string>) {
  const field = Object.keys(errors).find(key => errors[key]);
  return field ? { field, message: errors[field], tab: PACIENTE_FIELD_TABS[field] || "identificacao" } : undefined;
}
