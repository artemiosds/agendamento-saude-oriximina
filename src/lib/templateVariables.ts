/**
 * Catálogo central de variáveis dinâmicas usadas em modelos de documentos
 * clínicos (Atestado, Receita, Declaração, Encaminhamento, Laudo, Relatório).
 *
 * Padrão: {{namespace.campo}} ou {{campo_legado}}.
 * A lista é usada pelo Editor de Modelos (botão "Inserir variável") e pelo
 * preview/print para amostrar valores fictícios. A substituição real ocorre
 * no GerarDocumentoModal a partir do paciente/profissional/atendimento reais.
 */

export interface TemplateVariableDef {
  key: string;       // sem chaves: "paciente.nome"
  token: string;     // com chaves: "{{paciente.nome}}"
  label: string;
  example: string;
}

export interface TemplateVariableGroup {
  group: string;
  variables: TemplateVariableDef[];
}

const v = (key: string, label: string, example: string): TemplateVariableDef => ({
  key,
  token: `{{${key}}}`,
  label,
  example,
});

export const TEMPLATE_VARIABLE_GROUPS: TemplateVariableGroup[] = [
  {
    group: 'Paciente',
    variables: [
      v('nome_paciente', 'Nome completo', 'JOÃO DA SILVA SANTOS'),
      v('cpf', 'CPF', '123.456.789-00'),
      v('cns', 'Cartão SUS (CNS)', '123 4567 8901 2345'),
      v('data_nascimento', 'Data de nascimento', '01/01/1990'),
      v('cid', 'CID-10 principal', 'F84.0'),
    ],
  },
  {
    group: 'Profissional',
    variables: [
      v('profissional', 'Nome do profissional', 'Dra. Maria Santos'),
      v('especialidade', 'Especialidade', 'Fisioterapia'),
      v('carimbo_profissional', 'Carimbo digital/imagem', '[bloco de carimbo]'),
    ],
  },
  {
    group: 'Atendimento',
    variables: [
      v('data_atendimento', 'Data do atendimento', new Date().toLocaleDateString('pt-BR')),
      v('data_hoje', 'Data de hoje', new Date().toLocaleDateString('pt-BR')),
      v('unidade', 'Unidade de saúde', 'CER II Oriximiná'),
      v('especialidade_destino', 'Especialidade destino', 'Neurologia'),
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
      v('horario_entrada', 'Horário de entrada', '08:00'),
      v('horario_saida', 'Horário de saída', '09:30'),
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

/**
 * Substitui todas as variáveis conhecidas por seus valores de exemplo.
 * Usado no preview do editor.
 */
export function applyExampleValues(content: string): string {
  let out = content;
  for (const def of ALL_TEMPLATE_VARIABLES) {
    out = out.replace(new RegExp(`\\{\\{${def.key}\\}\\}`, 'g'), def.example);
  }
  return out;
}
