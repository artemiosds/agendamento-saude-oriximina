/**
 * Catálogo central de variáveis dinâmicas usadas em modelos de documentos.
 * A mesma lista alimenta os editores, previews e a geração real do documento.
 */

export interface TemplateVariableDef {
  key: string;
  token: string;
  label: string;
  example: string;
  aliases?: string[];
}

export interface TemplateVariableGroup {
  group: string;
  variables: TemplateVariableDef[];
}

const v = (key: string, label: string, example: string, aliases: string[] = []): TemplateVariableDef => ({
  key,
  token: `{{${key}}}`,
  label,
  example,
  aliases,
});

export const TEMPLATE_VARIABLE_GROUPS: TemplateVariableGroup[] = [
  {
    group: 'Paciente',
    variables: [
      v('nome_paciente', 'Nome completo', 'JOÃO DA SILVA SANTOS', ['paciente_nome', 'nome']),
      v('cpf', 'CPF', '123.456.789-00'),
      v('cartao_sus', 'Cartão SUS', '123 4567 8901 2345', ['cns']),
      v('data_nascimento', 'Data de nascimento', '01/01/1990'),
      v('idade', 'Idade', '35'),
      v('sexo', 'Sexo', 'Masculino'),
      v('raca_cor', 'Raça / Cor', 'Parda'),
      v('naturalidade', 'Naturalidade', 'Oriximiná/PA'),
      v('nome_mae', 'Nome da mãe', 'MARIA DOS SANTOS'),
      v('nome_responsavel', 'Nome do responsável', 'ANA DOS SANTOS'),
      v('cpf_responsavel', 'CPF do responsável', '987.654.321-00'),
      v('cid', 'CID-10 principal', 'F84.0'),
      v('endereco', 'Endereço completo', 'Rua Exemplo, nº 123, Casa'),
      v('logradouro', 'Logradouro', 'Rua Exemplo'),
      v('numero', 'Número', '123'),
      v('complemento', 'Complemento', 'Casa'),
      v('bairro', 'Bairro', 'Centro'),
      v('cep', 'CEP', '68270-000'),
      v('municipio', 'Município', 'Oriximiná'),
      v('uf', 'UF', 'PA'),
      v('telefone', 'Telefone', '(93) 90000-0000'),
      v('telefone_secundario', 'Telefone secundário', '(93) 98888-0000'),
      v('email', 'E-mail', 'paciente@exemplo.com'),
      v('ubs_origem', 'UBS de origem', 'UBS Centro'),
      v('especialidade', 'Especialidade', 'Fisioterapia'),
      v('especialidade_destino', 'Especialidade destino', 'Neurologia'),
    ],
  },

  {
    group: 'Profissional',
    variables: [
      v('profissional', 'Nome do profissional', 'Dra. Maria Santos', ['profissional_logado']),
      v('carimbo_profissional', 'Carimbo digital/imagem', '[bloco de carimbo]'),
    ],
  },
  {
    group: 'Atendimento',
    variables: [
      v('data_atendimento', 'Data do atendimento', new Date().toLocaleDateString('pt-BR')),
      v('data_hoje', 'Data de hoje', new Date().toLocaleDateString('pt-BR'), ['data_atual']),
      v('unidade', 'Unidade de saúde', 'CER II Oriximiná', ['nome_unidade']),
    ],
  },
  {
    group: 'Atestado',
    variables: [
      v('dias_afastamento', 'Dias de afastamento', '3'),
      v('data_inicio', 'Data início', new Date().toLocaleDateString('pt-BR')),
      v('data_fim', 'Data fim', new Date().toLocaleDateString('pt-BR')),
      v('motivo', 'Motivo / justificativa', 'Repouso médico'),
    ],
  },
  {
    group: 'Declaração / Comparecimento',
    variables: [
      v('horario_entrada', 'Horário de entrada', '08:00', ['hora_entrada']),
      v('horario_saida', 'Horário de saída', '09:30', ['hora_saida']),
      v('finalidade', 'Finalidade', 'Consulta'),
      v('motivo_falta', 'Motivo da falta', 'Doença na família'),
      v('data_falta', 'Data da falta', new Date().toLocaleDateString('pt-BR')),
      v('profissional_agendado', 'Profissional agendado', 'Dra. Maria Santos'),
    ],
  },
  {
    group: 'Receituário',
    variables: [
      v('medicamentos', 'Lista de medicamentos', '1. Paracetamol 500mg — Oral, 8/8h, 5 dias'),
      v('orientacoes', 'Orientações', 'Tomar conforme prescrição'),
      v('validade_receita', 'Validade da receita', new Date(Date.now() + 30 * 86400000).toLocaleDateString('pt-BR')),
    ],
  },
  {
    group: 'Encaminhamento',
    variables: [
      v('unidade_destino', 'Unidade destino', 'Hospital Regional'),
      v('profissional_destino', 'Profissional destino', 'Dr. José Oliveira'),
      v('prioridade', 'Prioridade', 'Eletivo'),
      v('observacoes', 'Observações', 'Sem observações adicionais'),
    ],
  },
  {
    group: 'Laudo / Relatório',
    variables: [
      v('queixa_principal', 'Queixa principal', 'Dor lombar há 30 dias'),
      v('historico', 'Histórico', 'Sem comorbidades relevantes'),
      v('exame_fisico', 'Exame físico', 'Sem alterações ao exame'),
      v('evolucao_clinica', 'Evolução clínica', 'Melhora progressiva'),
      v('conduta', 'Conduta', 'Manter tratamento em curso'),
      v('plano', 'Plano terapêutico', '10 sessões 2x/semana'),
      v('conclusao', 'Conclusão', 'Paciente apto'),
      v('recomendacoes', 'Recomendações', 'Manter acompanhamento'),
      v('objetivo', 'Objetivo', 'Avaliação funcional'),
    ],
  },
];

/** Lista plana de todas as variáveis. */
export const ALL_TEMPLATE_VARIABLES: TemplateVariableDef[] =
  TEMPLATE_VARIABLE_GROUPS.flatMap(g => g.variables);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const TEMPLATE_EXAMPLE_VALUES: Record<string, string> = ALL_TEMPLATE_VARIABLES.reduce((acc, def) => {
  acc[def.key] = def.example;
  (def.aliases || []).forEach(alias => { acc[alias] = def.example; });
  return acc;
}, {} as Record<string, string>);

/** Substitui variáveis oficiais e aliases legados pelo mesmo valor. */
export function applyTemplateValues(
  content: string,
  values: Record<string, string | number | null | undefined>,
): string {
  let out = content || '';
  const replacements = new Map<string, string>();

  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined) replacements.set(key, String(value));
  });

  for (const def of ALL_TEMPLATE_VARIABLES) {
    const knownKeys = [def.key, ...(def.aliases || [])];
    const value = knownKeys.map(key => replacements.get(key)).find(item => item !== undefined);
    if (value !== undefined) knownKeys.forEach(key => replacements.set(key, value));
  }

  replacements.forEach((value, key) => {
    out = out.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g'), value || '—');
  });

  return out;
}

/** Converte aliases legados para o token oficial ao abrir/editar templates. */
export function normalizeTemplateAliases(content: string): string {
  let out = content || '';
  for (const def of ALL_TEMPLATE_VARIABLES) {
    (def.aliases || []).forEach(alias => {
      out = out.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(alias)}\\s*\\}\\}`, 'g'), def.token);
    });
  }
  return out;
}

/** Substitui variáveis conhecidas por valores de exemplo no preview. */
export function applyExampleValues(content: string, overrides: Record<string, string | number | null | undefined> = {}): string {
  return applyTemplateValues(content, { ...TEMPLATE_EXAMPLE_VALUES, ...overrides });
}
